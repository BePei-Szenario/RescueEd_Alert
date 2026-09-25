import 'dart:async';
import 'dart:io';
import 'package:audioplayers/audioplayers.dart';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../api.dart';
import '../alarm_monitor.dart';
import '../alarm_tones.dart';
import '../notifications.dart';
import '../push_notifications.dart';
import '../session_store.dart';
import 'qr_flow.dart';
import 'settings_screen.dart';

class HelperScreen extends StatefulWidget {
  const HelperScreen({
    super.key,
    required this.api,
    required this.notifications,
    required this.pushNotifications,
    required this.eventId,
    required this.helperToken,
    required this.onSessionEnded,
  });
  final ApiClient api;
  final AlertNotifications notifications;
  final PushNotifications pushNotifications;
  final String eventId, helperToken;
  final Future<void> Function() onSessionEnded;
  @override
  State<HelperScreen> createState() => _HelperScreenState();
}

class _HelperScreenState extends State<HelperScreen> {
  final store = SessionStore();
  final alarmPlayer = AudioPlayer();
  Map<String, dynamic>? data;
  Timer? timer;
  String? error;
  bool busy = false;
  String tone = alarmTones.first.id;
  bool backgroundMonitorReady = false;
  bool pushReady = false;
  String? backgroundMonitorError;
  final shown = <String>{};
  String? soundingAlertId;
  @override
  void initState() {
    super.initState();
    _init();
    timer = Timer.periodic(
      const Duration(seconds: 5),
      (_) => load(silent: true),
    );
  }

  Future<void> _init() async {
    tone = await store.readAlarmTone();
    await _startMonitor();
    await _startPush();
    await load();
  }

  Future<void> _startPush() async {
    try {
      pushReady = await widget.pushNotifications.registerHelper(
        eventId: widget.eventId,
        helperToken: widget.helperToken,
        alarmTone: tone,
      );
    } catch (_) {
      pushReady = false;
    }
    if (mounted) setState(() {});
  }

  Future<void> _startMonitor() async {
    try {
      backgroundMonitorReady = await AlarmMonitor.start(
        baseUrl: widget.api.baseUrl,
        eventId: widget.eventId,
        token: widget.helperToken,
        tone: tone,
      );
      if (mounted) setState(() => backgroundMonitorError = null);
    } catch (_) {
      backgroundMonitorReady = false;
      if (mounted) {
        setState(
          () => backgroundMonitorError =
              'Hintergrund-Alarmbereitschaft konnte nicht gestartet werden. Bitte Benachrichtigungen und App-Berechtigungen prüfen.',
        );
      }
    }
  }

  @override
  void dispose() {
    timer?.cancel();
    unawaited(alarmPlayer.stop());
    unawaited(alarmPlayer.dispose());
    super.dispose();
  }

  Future<void> _startIosAlarmSound(String alertId) async {
    if (!Platform.isIOS || tone == 'vibration' || soundingAlertId == alertId) {
      return;
    }
    await alarmPlayer.stop();
    await alarmPlayer.setReleaseMode(ReleaseMode.loop);
    await alarmPlayer.play(
      AssetSource('sounds/${alarmToneFor(tone).assetName}'),
    );
    soundingAlertId = alertId;
  }

  Future<void> _stopIosAlarmSound(String alertId) async {
    if (soundingAlertId != alertId) return;
    soundingAlertId = null;
    await alarmPlayer.stop();
  }

  Future<void> load({bool silent = false}) async {
    try {
      final next = await widget.api.get(
        '/api/mobile/session?eventId=${Uri.encodeComponent(widget.eventId)}',
        bearer: widget.helperToken,
      );
      if (!mounted) return;
      setState(() {
        data = next;
        error = null;
      });
      final alerts = (next['alerts'] as List? ?? [])
          .cast<Map<String, dynamic>>();
      for (final alert in alerts.reversed) {
        if (alert['acknowledgedAt'] == null &&
            shown.add(alert['id'] as String)) {
          await _presentAlarm(alert, next);
        }
      }
    } on ApiException catch (e) {
      if (e.statusCode == 401) {
        await widget.onSessionEnded();
      } else if (!silent && mounted) {
        setState(() => error = e.message);
      }
    } catch (e) {
      if (!silent && mounted) setState(() => error = e.toString());
    }
  }

  Future<void> _presentAlarm(
    Map<String, dynamic> alert,
    Map<String, dynamic> current,
  ) async {
    final event = current['event'] as Map<String, dynamic>,
        assignment = current['assignment'] as Map<String, dynamic>?;
    final alertId = alert['id'] as String;
    await _startIosAlarmSound(alertId);
    if (!backgroundMonitorReady && !pushReady) {
      await widget.notifications.showAlarm(alertId: alertId, tone: tone);
    }
    if (!mounted) return;
    await showDialog(
      context: context,
      barrierDismissible: false,
      builder: (context) => AlertDialog(
        icon: const Icon(
          Icons.notifications_active,
          color: Colors.red,
          size: 52,
        ),
        title: Text('ALARM · ${assignment?['name'] ?? 'Sanitätsmittel'}'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              event['name'],
              style: const TextStyle(fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 10),
            Text(
              (alert['message'] as String?)?.isNotEmpty == true
                  ? alert['message']
                  : 'Neue Alarmierung',
              textAlign: TextAlign.center,
            ),
          ],
        ),
        actions: [
          FilledButton.icon(
            style: FilledButton.styleFrom(backgroundColor: Colors.green),
            onPressed: () async {
              try {
                await widget.api.patch(
                  '/api/mobile/alerts/${alert['id']}/ack',
                  {'eventId': widget.eventId},
                  bearer: widget.helperToken,
                );
                try {
                  await _stopIosAlarmSound(alertId);
                  await widget.notifications.cancelAlarm(alertId);
                  await AlarmMonitor.acknowledged(alertId);
                } catch (_) {
                  // The server has already accepted the acknowledgement; the
                  // monitor also stops on its next successful poll.
                }
                if (context.mounted) Navigator.pop(context);
                await load(silent: true);
              } catch (e) {
                if (context.mounted) {
                  ScaffoldMessenger.of(
                    context,
                  ).showSnackBar(SnackBar(content: Text(e.toString())));
                }
              }
            },
            icon: const Icon(Icons.check),
            label: const Text('Alarm bestätigen'),
          ),
        ],
      ),
    );
  }

  Future<void> clearAssignment() async {
    final assignment = data?['assignment'] as Map<String, dynamic>?;
    if (assignment == null) return;
    setState(() => busy = true);
    try {
      await widget.api.patch('/api/mobile/assignments/availability', {
        'eventId': widget.eventId,
        'assignmentId': assignment['id'],
        'helperToken': widget.helperToken,
        'status': 'available',
      });
      await load();
    } catch (e) {
      setState(() => error = e.toString());
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> scanLeave() async {
    final result = await Navigator.push<HelperCredentials>(
      context,
      MaterialPageRoute(
        builder: (_) => QrAttendanceFlow(api: widget.api, store: store),
      ),
    );
    if (result?.ended == true) await widget.onSessionEnded();
  }

  @override
  Widget build(BuildContext context) {
    final event = data?['event'] as Map<String, dynamic>?,
        helper = data?['helper'] as Map<String, dynamic>?,
        assignment = data?['assignment'] as Map<String, dynamic>?,
        alerts = (data?['alerts'] as List? ?? []).cast<Map<String, dynamic>>();
    final deployed = assignment?['operationalStatus'] == 'deployed';
    return Scaffold(
      appBar: AppBar(
        title: const Text('Helferansicht'),
        actions: [
          IconButton(
            tooltip: 'Einstellungen',
            onPressed: () async {
              await Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (_) => SettingsScreen(
                    api: widget.api,
                    eventId: widget.eventId,
                    helperToken: widget.helperToken,
                  ),
                ),
              );
              tone = await store.readAlarmTone();
              await _startMonitor();
              await _startPush();
              if (mounted) setState(() {});
            },
            icon: const Icon(Icons.settings_outlined),
          ),
          IconButton(onPressed: load, icon: const Icon(Icons.refresh)),
        ],
      ),
      body: data == null
          ? Center(
              child: error != null
                  ? Text(error!, style: const TextStyle(color: Colors.red))
                  : const CircularProgressIndicator(),
            )
          : RefreshIndicator(
              onRefresh: load,
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  if (Platform.isAndroid && backgroundMonitorError != null)
                    Card(
                      color: const Color(0xffffe8ea),
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Text(backgroundMonitorError!),
                      ),
                    ),
                  if (!pushReady && !backgroundMonitorReady)
                    const Card(
                      color: Color(0xffffe8ea),
                      child: Padding(
                        padding: EdgeInsets.all(16),
                        child: Text(
                          'Push-Alarmierung ist auf diesem Gerät noch nicht eingerichtet. Die App nutzt während der geöffneten Helferansicht die Serverabfrage als Rückfallebene.',
                        ),
                      ),
                    ),
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(18),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                            'AKTIVER SANITÄTSDIENST',
                            style: TextStyle(
                              color: Color(0xff146ee8),
                              fontWeight: FontWeight.bold,
                              letterSpacing: 1.1,
                            ),
                          ),
                          const SizedBox(height: 8),
                          Text(
                            event?['name'] ?? '',
                            style: Theme.of(context).textTheme.headlineSmall
                                ?.copyWith(fontWeight: FontWeight.w900),
                          ),
                          Text(
                            '${_date(event?['eventDate'])} ${event?['startTime'] ?? '–'} Uhr – ${_date(event?['endDate'] ?? event?['eventDate'])} ${event?['endTime'] ?? '–'} Uhr',
                          ),
                          const Divider(height: 28),
                          Text(
                            '${helper?['firstName'] ?? ''} ${helper?['lastName'] ?? ''}',
                            style: const TextStyle(fontWeight: FontWeight.bold),
                          ),
                          Text(helper?['qualification'] ?? ''),
                          if ((helper?['phone'] as String?)?.isNotEmpty == true)
                            Text('Telefon: ${helper?['phone']}'),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 14),
                  Card(
                    color: deployed
                        ? const Color(0xffffe8ea)
                        : const Color(0xffe8f7ef),
                    child: Padding(
                      padding: const EdgeInsets.all(18),
                      child: Column(
                        children: [
                          Icon(
                            deployed
                                ? Icons.notifications_active
                                : Icons.health_and_safety,
                            color: deployed ? Colors.red : Colors.green,
                            size: 42,
                          ),
                          const SizedBox(height: 8),
                          Text(
                            assignment?['name'] ?? 'Noch nicht eingeteilt',
                            style: Theme.of(context).textTheme.titleLarge
                                ?.copyWith(fontWeight: FontWeight.w900),
                          ),
                          Text(
                            deployed
                                ? 'IM EINSATZ'
                                : assignment == null
                                ? 'Bitte auf Einteilung warten'
                                : 'Frei für Einsätze',
                            style: TextStyle(
                              color: deployed ? Colors.red : Colors.green,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                          if (deployed)
                            Padding(
                              padding: const EdgeInsets.only(top: 16),
                              child: SizedBox(
                                width: double.infinity,
                                child: FilledButton.icon(
                                  onPressed: busy ? null : clearAssignment,
                                  icon: const Icon(Icons.check_circle_outline),
                                  label: const Text('Wieder frei für Einsätze'),
                                ),
                              ),
                            ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 14),
                  const SizedBox(height: 20),
                  Text(
                    'Alarmierungen',
                    style: Theme.of(context).textTheme.titleLarge?.copyWith(
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                  const SizedBox(height: 8),
                  if (alerts.isEmpty)
                    const Card(
                      child: Padding(
                        padding: EdgeInsets.all(20),
                        child: Text(
                          'Noch keine Alarmierung für dein Sanitätsmittel.',
                        ),
                      ),
                    ),
                  ...alerts.map(
                    (a) => Card(
                      child: ListTile(
                        leading: Icon(
                          a['acknowledgedAt'] == null
                              ? Icons.notifications_active
                              : Icons.check_circle,
                          color: a['acknowledgedAt'] == null
                              ? Colors.red
                              : Colors.green,
                        ),
                        title: Text(
                          (a['message'] as String?)?.isNotEmpty == true
                              ? a['message']
                              : 'Alarmierung',
                        ),
                        subtitle: Text(
                          '${_time(a['createdAt'])} Uhr · ${a['acknowledgedAt'] == null ? 'Bestätigung offen' : 'Bestätigt'}',
                        ),
                        onTap: a['acknowledgedAt'] == null
                            ? () => _presentAlarm(a, data!)
                            : null,
                      ),
                    ),
                  ),
                  if (error != null)
                    Padding(
                      padding: const EdgeInsets.only(top: 12),
                      child: Text(
                        error!,
                        style: const TextStyle(color: Colors.red),
                      ),
                    ),
                  const SizedBox(height: 24),
                  OutlinedButton.icon(
                    style: OutlinedButton.styleFrom(
                      foregroundColor: Colors.red,
                    ),
                    onPressed: scanLeave,
                    icon: const Icon(Icons.qr_code_scanner),
                    label: const Text('QR-Code „Gehen“ scannen'),
                  ),
                  const Padding(
                    padding: EdgeInsets.all(16),
                    child: Text(
                      'Beim erfolgreichen Auschecken wird der temporäre Zugang vollständig von diesem Gerät entfernt.',
                      textAlign: TextAlign.center,
                      style: TextStyle(fontSize: 12, color: Colors.blueGrey),
                    ),
                  ),
                ],
              ),
            ),
    );
  }
}

String _date(dynamic value) {
  try {
    return DateFormat('dd.MM.yyyy', 'de').format(DateTime.parse(value));
  } catch (_) {
    return '–';
  }
}

String _time(dynamic value) {
  try {
    return DateFormat('HH:mm').format(DateTime.parse(value).toLocal());
  } catch (_) {
    return '–';
  }
}
