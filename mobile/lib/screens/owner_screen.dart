import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';
import 'package:printing/printing.dart';
import 'package:qr_flutter/qr_flutter.dart';
import '../api.dart';
import '../attendance_qr_pdf.dart';
import 'event_create_screen.dart';
import 'settings_screen.dart';
import 'consumer_subscription_screen.dart';
import 'legal_reconfirmation_screen.dart';
import '../widgets/password_field.dart';

class OwnerScreen extends StatefulWidget {
  const OwnerScreen({
    super.key,
    required this.api,
    required this.onLogout,
    this.consumer = false,
  });
  final ApiClient api;
  final Future<void> Function() onLogout;
  final bool consumer;
  @override
  State<OwnerScreen> createState() => _OwnerScreenState();
}

class _OwnerScreenState extends State<OwnerScreen> {
  List<dynamic> events = [];
  bool loading = true;
  String? error;
  bool subscriptionActive = false;
  bool legalUpdateRequired = false;
  String? consumerUserId;
  @override
  void initState() {
    super.initState();
    load();
  }

  Future<void> load() async {
    try {
      final data = await widget.api.get('/api/events');
      final profile = await widget.api.get('/api/auth/me');
      legalUpdateRequired = profile['legalUpdateRequired'] == true;
      if (widget.consumer) {
        consumerUserId = profile['id'] as String?;
        final status = await widget.api.get(
          '/api/mobile/consumer/subscription',
        );
        subscriptionActive = status['active'] == true;
      }
      if (mounted) {
        setState(() {
          events = data['events'] as List? ?? [];
          loading = false;
          error = null;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          if (widget.consumer) subscriptionActive = false;
          error = e.toString();
          loading = false;
        });
      }
    }
  }

  Future<void> _createEvent() async {
    if (legalUpdateRequired) {
      if (!mounted) return;
      await Navigator.push<bool>(
        context,
        MaterialPageRoute(
          builder: (_) => LegalReconfirmationScreen(api: widget.api),
        ),
      );
      await load();
      if (legalUpdateRequired) return;
    }
    if (widget.consumer) {
      try {
        final status = await widget.api.get(
          '/api/mobile/consumer/subscription',
        );
        subscriptionActive = status['active'] == true;
      } catch (_) {
        subscriptionActive = false;
      }
      if (!subscriptionActive) {
        if (!mounted) return;
        if (consumerUserId == null) {
          await load();
          if (consumerUserId == null || !mounted) return;
        }
        await Navigator.push(
          context,
          MaterialPageRoute(
            builder: (_) => ConsumerSubscriptionScreen(
              api: widget.api,
              userId: consumerUserId!,
              onActive: () {
                if (mounted) Navigator.pop(context);
              },
            ),
          ),
        );
        await load();
        return;
      }
    }
    if (!mounted) return;
    await Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) =>
            EventCreateScreen(api: widget.api, consumer: widget.consumer),
      ),
    );
    await load();
  }

  Future<void> _openSubscriptionManagement() async {
    if (consumerUserId == null) {
      await load();
      if (consumerUserId == null || !mounted) return;
    }
    await Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => ConsumerSubscriptionScreen(
          api: widget.api,
          userId: consumerUserId!,
          onActive: () {
            if (mounted) Navigator.pop(context);
          },
        ),
      ),
    );
    await load();
  }

  Future<void> _deleteConsumerAccount() async {
    final password = TextEditingController();
    bool confirmed = false;
    final submit = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (dialogContext, setDialog) => AlertDialog(
          title: const Text('Privatkonto löschen'),
          content: SizedBox(
            width: 440,
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Text(
                    'Dein App-Konto und der Zugang zu deinen Events werden gelöscht. Der Nachweis zu akzeptierten Rechtstexten wird im Löscharchiv aufbewahrt.',
                  ),
                  const SizedBox(height: 12),
                  const Text(
                    'Wichtig: Die Kontolöschung kündigt dein Google-Play- oder App-Store-Abo nicht. Kündige es zuerst in den Abo-Einstellungen des Stores, damit keine weitere Abbuchung erfolgt.',
                  ),
                  const SizedBox(height: 12),
                  PasswordField(
                    controller: password,
                    labelText: 'Passwort zur Bestätigung',
                    onChanged: (_) => setDialog(() {}),
                  ),
                  CheckboxListTile(
                    value: confirmed,
                    onChanged: (value) =>
                        setDialog(() => confirmed = value == true),
                    title: const Text(
                      'Ich möchte mein App-Konto endgültig löschen.',
                    ),
                  ),
                ],
              ),
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogContext, false),
              child: const Text('Abbrechen'),
            ),
            FilledButton(
              onPressed: confirmed && password.text.isNotEmpty
                  ? () => Navigator.pop(dialogContext, true)
                  : null,
              child: const Text('Konto löschen'),
            ),
          ],
        ),
      ),
    );
    if (submit != true) {
      password.dispose();
      return;
    }
    try {
      await widget.api.post('/api/account/delete', {
        'password': password.text,
        'confirmed': true,
      });
      password.dispose();
      await widget.onLogout();
    } catch (e) {
      password.dispose();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Kontolöschung fehlgeschlagen: $e')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: const Text('Deine Events'),
      actions: [
        IconButton(
          tooltip: 'Einstellungen',
          onPressed: () => Navigator.push(
            context,
            MaterialPageRoute(builder: (_) => SettingsScreen(api: widget.api)),
          ),
          icon: const Icon(Icons.settings_outlined),
        ),
        IconButton(
          onPressed: _createEvent,
          tooltip: 'Neues Event',
          icon: const Icon(Icons.add),
        ),
        IconButton(onPressed: load, icon: const Icon(Icons.refresh)),
        IconButton(
          onPressed: widget.onLogout,
          tooltip: 'Abmelden',
          icon: const Icon(Icons.logout),
        ),
      ],
    ),
    body: RefreshIndicator(
      onRefresh: load,
      child: loading
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                const Text(
                  'EVENTVERWALTUNG',
                  style: TextStyle(
                    color: Color(0xff146ee8),
                    fontWeight: FontWeight.bold,
                    letterSpacing: 1.2,
                  ),
                ),
                const SizedBox(height: 5),
                Text(
                  'Alarmieren, Helfer einteilen und Einsatzmittel verwalten.',
                  style: Theme.of(context).textTheme.bodyMedium,
                ),
                const SizedBox(height: 20),
                if (legalUpdateRequired)
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                            'Aktuelle Rechtstexte bestätigen',
                            style: TextStyle(fontWeight: FontWeight.bold),
                          ),
                          const SizedBox(height: 8),
                          const Text(
                            'Neue Events sind bis zur Bestätigung gesperrt. Laufende Events bleiben erreichbar.',
                          ),
                          const SizedBox(height: 10),
                          FilledButton(
                            onPressed: () async {
                              await Navigator.push<bool>(
                                context,
                                MaterialPageRoute(
                                  builder: (_) => LegalReconfirmationScreen(
                                    api: widget.api,
                                  ),
                                ),
                              );
                              await load();
                            },
                            child: const Text('Fassungen ansehen'),
                          ),
                        ],
                      ),
                    ),
                  ),
                if (widget.consumer && !subscriptionActive)
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        children: [
                          const Text(
                            'Kein aktives App-Abo bestätigt. Bereits gestartete Events bleiben nutzbar; neue Events sind gesperrt.',
                          ),
                          const SizedBox(height: 10),
                          FilledButton(
                            onPressed: _createEvent,
                            child: const Text(
                              'Monatsabo prüfen oder abschließen',
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                if (widget.consumer && subscriptionActive)
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        children: [
                          const Text(
                            'App-Abo aktiv · Neue Events sind im Abo enthalten.',
                          ),
                          const SizedBox(height: 10),
                          OutlinedButton(
                            onPressed: _openSubscriptionManagement,
                            child: const Text(
                              'Abo verwalten oder Vertrag widerrufen',
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                if (error != null) _ErrorCard(error!, load),
                if (events.isEmpty)
                  const Card(
                    child: Padding(
                      padding: EdgeInsets.all(28),
                      child: Column(
                        children: [
                          Icon(
                            Icons.event_busy,
                            size: 50,
                            color: Colors.blueGrey,
                          ),
                          SizedBox(height: 12),
                          Text('Noch kein Event vorhanden.'),
                          Text(
                            'Lege dein erstes Event in der App an.',
                            textAlign: TextAlign.center,
                          ),
                        ],
                      ),
                    ),
                  ),
                ...events.map((raw) {
                  final event = raw as Map<String, dynamic>;
                  return Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: Card(
                      child: ListTile(
                        contentPadding: const EdgeInsets.all(16),
                        leading: const CircleAvatar(
                          child: Icon(Icons.calendar_month),
                        ),
                        title: Text(
                          event['name'] as String,
                          style: const TextStyle(fontWeight: FontWeight.bold),
                        ),
                        subtitle: Text(
                          '${_date(event['eventDate'])} · ${event['status'] == 'active' ? 'Aktiv' : event['status']}',
                        ),
                        trailing: const Icon(Icons.chevron_right),
                        onTap: () async {
                          await Navigator.push(
                            context,
                            MaterialPageRoute(
                              builder: (_) => OwnerEventScreen(
                                api: widget.api,
                                eventId: event['id'] as String,
                              ),
                            ),
                          );
                          load();
                        },
                      ),
                    ),
                  );
                }),
                if (widget.consumer) ...[
                  const SizedBox(height: 28),
                  TextButton(
                    onPressed: _deleteConsumerAccount,
                    child: const Text('Privatkonto löschen'),
                  ),
                ],
              ],
            ),
    ),
  );
}

class OwnerEventScreen extends StatefulWidget {
  const OwnerEventScreen({
    super.key,
    required this.api,
    required this.eventId,
    this.onLogout,
  });
  final ApiClient api;
  final String eventId;
  final Future<void> Function()? onLogout;
  @override
  State<OwnerEventScreen> createState() => _OwnerEventScreenState();
}

class _OwnerEventScreenState extends State<OwnerEventScreen> {
  Map<String, dynamic>? data;
  String? error;
  Timer? timer;
  bool busy = false;
  @override
  void initState() {
    super.initState();
    load();
    timer = Timer.periodic(
      const Duration(seconds: 5),
      (_) => load(silent: true),
    );
  }

  @override
  void dispose() {
    timer?.cancel();
    super.dispose();
  }

  Future<void> load({bool silent = false}) async {
    try {
      final next = await widget.api.get(
        '/api/events/${Uri.encodeComponent(widget.eventId)}',
      );
      if (mounted) {
        setState(() {
          data = next;
          error = null;
        });
      }
    } catch (e) {
      if (!silent && mounted) setState(() => error = e.toString());
    }
  }

  Future<String?> ask(
    String title,
    String label, {
    TextInputType? keyboardType,
  }) {
    final controller = TextEditingController();
    return showDialog<String>(
      context: context,
      builder: (_) => AlertDialog(
        title: Text(title),
        content: TextField(
          controller: controller,
          autofocus: true,
          keyboardType: keyboardType,
          decoration: InputDecoration(labelText: label),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Abbrechen'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, controller.text.trim()),
            child: const Text('Speichern'),
          ),
        ],
      ),
    );
  }

  Future<void> mutate(
    Future<Map<String, dynamic>> Function() action,
    String success,
  ) async {
    setState(() {
      busy = true;
      error = null;
    });
    try {
      await action();
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(success)));
      }
      await load();
    } catch (e) {
      if (mounted) setState(() => error = e.toString());
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> addHelper() async {
    final acknowledged = await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (context) => AlertDialog(
        title: const Text('Helfer anlegen'),
        content: const Text(
          'Helfer kann nicht alarmiert werden, er wird nur in der Anwesenheit angezeigt und protokolliert!',
        ),
        actions: [
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('OK'),
          ),
        ],
      ),
    );
    if (!mounted || acknowledged != true) return;
    final first = await ask('Helfer anlegen', 'Vorname');
    if (first?.isEmpty != false) return;
    final last = await ask('Helfer anlegen', 'Nachname');
    if (last?.isEmpty != false) return;
    final qualification = await ask('Helfer anlegen', 'Qualifikation');
    if (qualification?.isEmpty != false) return;
    final phone = await ask(
      'Helfer anlegen',
      'Telefonnummer (freiwillig)',
      keyboardType: TextInputType.phone,
    );
    if (!mounted) return;
    await mutate(
      () => widget.api.post('/api/events/${widget.eventId}/helpers', {
        'firstName': first,
        'lastName': last,
        'qualification': qualification,
        'phone': phone ?? '',
      }),
      'Helfer wurde angelegt.',
    );
  }

  Future<void> addUnit() async {
    final name = await ask('Einsatzmittel anlegen', 'z. B. RTW 1');
    if (name?.isEmpty != false) return;
    await mutate(
      () => widget.api.post('/api/events/${widget.eventId}/assignments', {
        'name': name,
      }),
      'Einsatzmittel wurde angelegt.',
    );
  }

  Future<void> sendAlarm() async {
    final units = (data?['assignments'] as List? ?? [])
        .where(
          (u) =>
              u['removedAt'] == null &&
              u['operationalStatus'] != 'deployed' &&
              ((u['activeQrHelperCount'] as num?)?.toInt() ?? 0) > 0,
        )
        .toList();
    final selected = <String>{};
    final message = TextEditingController();
    final send = await showDialog<bool>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setLocal) => AlertDialog(
          title: const Text('Alarm senden'),
          content: SizedBox(
            width: 420,
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  ...units.map(
                    (u) => CheckboxListTile(
                      value: selected.contains(u['id']),
                      title: Text(u['name']),
                      onChanged: (v) => setLocal(() {
                        if (v == true) {
                          selected.add(u['id']);
                        } else {
                          selected.remove(u['id']);
                        }
                      }),
                    ),
                  ),
                  TextField(
                    controller: message,
                    maxLength: 150,
                    decoration: const InputDecoration(
                      labelText: 'Kurze Meldung (optional)',
                    ),
                  ),
                ],
              ),
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Abbrechen'),
            ),
            FilledButton(
              style: FilledButton.styleFrom(backgroundColor: Colors.red),
              onPressed: selected.isEmpty
                  ? null
                  : () => Navigator.pop(context, true),
              child: const Text('Alarmieren'),
            ),
          ],
        ),
      ),
    );
    if (send == true) {
      await mutate(
        () => widget.api.post('/api/events/${widget.eventId}/alerts', {
          'assignmentIds': selected.toList(),
          'message': message.text.trim(),
        }),
        'Alarm wurde gesendet und protokolliert.',
      );
    }
  }

  Future<void> showQrCodes() async {
    final links = data?['attendanceLinks'] as Map<String, dynamic>?;
    if (links == null) return;
    final event = data?['event'] as Map<String, dynamic>?;
    final eventName = event?['name']?.toString() ?? 'Event';
    final eventDate = _date(event?['eventDate']);
    final filename =
        'rescueed-qr-${widget.eventId.replaceAll(RegExp(r'[^a-zA-Z0-9_-]'), '')}.pdf';

    Future<void> outputQr({
      required bool print,
      bool includeCome = true,
      bool includeLeave = true,
    }) async {
      try {
        final bytes = await createAttendanceQrPdf(
          eventName: eventName,
          eventDate: eventDate,
          comeUrl: links['come'] as String,
          leaveUrl: links['leave'] as String,
          includeCome: includeCome,
          includeLeave: includeLeave,
        );
        if (print) {
          await Printing.layoutPdf(
            name: filename,
            onLayout: (_) async => bytes,
          );
        } else {
          await Printing.sharePdf(bytes: bytes, filename: filename);
        }
      } catch (error) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text('QR-Codes konnten nicht ausgegeben werden: $error'),
            ),
          );
        }
      }
    }

    await showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('QR Kommen / Gehen'),
        content: SizedBox(
          width: 360,
          child: SingleChildScrollView(
            child: Column(
              children: [
                const Text(
                  'KOMMEN',
                  style: TextStyle(
                    color: Colors.green,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                QrImageView(data: links['come'] as String, size: 240),
                Wrap(
                  alignment: WrapAlignment.center,
                  children: [
                    TextButton.icon(
                      onPressed: () =>
                          outputQr(print: true, includeLeave: false),
                      icon: const Icon(Icons.print_outlined),
                      label: const Text('Drucken'),
                    ),
                    TextButton.icon(
                      onPressed: () =>
                          outputQr(print: false, includeLeave: false),
                      icon: const Icon(Icons.download_outlined),
                      label: const Text('PDF speichern'),
                    ),
                  ],
                ),
                const Divider(height: 32),
                const Text(
                  'GEHEN',
                  style: TextStyle(
                    color: Colors.red,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                QrImageView(data: links['leave'] as String, size: 240),
                Wrap(
                  alignment: WrapAlignment.center,
                  children: [
                    TextButton.icon(
                      onPressed: () =>
                          outputQr(print: true, includeCome: false),
                      icon: const Icon(Icons.print_outlined),
                      label: const Text('Drucken'),
                    ),
                    TextButton.icon(
                      onPressed: () =>
                          outputQr(print: false, includeCome: false),
                      icon: const Icon(Icons.download_outlined),
                      label: const Text('PDF speichern'),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
        actions: [
          TextButton.icon(
            onPressed: () => outputQr(print: true),
            icon: const Icon(Icons.print_outlined),
            label: const Text('Beide drucken'),
          ),
          TextButton.icon(
            onPressed: () => outputQr(print: false),
            icon: const Icon(Icons.download_outlined),
            label: const Text('Beide als PDF'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('OK'),
          ),
        ],
      ),
    );
  }

  Future<void> showEventDetails() async {
    final event = data?['event'] as Map<String, dynamic>?;
    final codes = (data?['eventAccessCodes'] as List? ?? [])
        .whereType<Map>()
        .map((item) => item.cast<String, dynamic>())
        .toList();
    await showDialog(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Eventdetails'),
        content: SizedBox(
          width: 460,
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  event?['name']?.toString() ?? 'Event',
                  style: const TextStyle(fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 6),
                SelectableText(
                  'Eventnummer: ${event?['id'] ?? widget.eventId}',
                ),
                const SizedBox(height: 16),
                if (codes.isNotEmpty) ...[
                  const Text(
                    'Event-Zugänge',
                    style: TextStyle(fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 4),
                  const Text(
                    'Nur für den Ersteller sichtbar. Codes ausschließlich an die vorgesehene Person weitergeben.',
                  ),
                  const SizedBox(height: 8),
                  ...codes.map((item) {
                    final code = item['code']?.toString();
                    return Card(
                      child: ListTile(
                        title: Text(_eventAccessRoleLabel(item['role'])),
                        subtitle: code == null || code.isEmpty
                            ? const Text(
                                'Code einer älteren Fassung kann nicht erneut angezeigt werden.',
                              )
                            : SelectableText(code),
                        trailing: code == null || code.isEmpty
                            ? null
                            : IconButton(
                                tooltip: 'Code kopieren',
                                onPressed: () async {
                                  await Clipboard.setData(
                                    ClipboardData(text: code),
                                  );
                                  if (dialogContext.mounted) {
                                    ScaffoldMessenger.of(
                                      dialogContext,
                                    ).showSnackBar(
                                      const SnackBar(
                                        content: Text('Code kopiert.'),
                                      ),
                                    );
                                  }
                                },
                                icon: const Icon(Icons.copy_outlined),
                              ),
                      ),
                    );
                  }),
                ] else
                  const Text(
                    'Für dieses Event wurden keine Codelogins angelegt.',
                  ),
              ],
            ),
          ),
        ),
        actions: [
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext),
            child: const Text('Schließen'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final event = data?['event'] as Map<String, dynamic>?;
    final permissions =
        (data?['permissions'] as Map?)?.cast<String, dynamic>() ??
        const <String, dynamic>{};
    bool allowed(String permission) => permissions[permission] == true;
    final helpers = (data?['helpers'] as List? ?? [])
        .where((h) => h['removedAt'] == null)
        .cast<Map<String, dynamic>>()
        .toList();
    final units =
        (data?['assignments'] as List? ?? [])
            .where((u) => u['removedAt'] == null)
            .cast<Map<String, dynamic>>()
            .toList()
          ..sort(
            (left, right) => (left['name'] as String).toLowerCase().compareTo(
              (right['name'] as String).toLowerCase(),
            ),
          );
    final hasAlertableUnit = units.any(
      (u) =>
          u['operationalStatus'] != 'deployed' &&
          ((u['activeQrHelperCount'] as num?)?.toInt() ?? 0) > 0,
    );
    final visibleHelperCount = allowed('viewHelpers')
        ? helpers.length
        : units.fold<int>(
            0,
            (sum, unit) =>
                sum + ((unit['activeHelperCount'] as num?)?.toInt() ?? 0),
          );
    return Scaffold(
      appBar: AppBar(
        title: Text(event?['name'] ?? 'Event'),
        actions: [
          if (data != null && allowed('viewDetails'))
            IconButton(
              onPressed: showEventDetails,
              tooltip: 'Eventdetails und Codes',
              icon: const Icon(Icons.description_outlined),
            ),
          IconButton(
            tooltip: 'Einstellungen',
            onPressed: () => Navigator.push(
              context,
              MaterialPageRoute(
                builder: (_) => SettingsScreen(api: widget.api),
              ),
            ),
            icon: const Icon(Icons.settings_outlined),
          ),
          if (data != null && allowed('viewQr'))
            IconButton(
              onPressed: showQrCodes,
              tooltip: 'QR Kommen / Gehen',
              icon: const Icon(Icons.qr_code),
            ),
          IconButton(
            onPressed: busy ? null : load,
            icon: const Icon(Icons.refresh),
          ),
          if (widget.onLogout != null)
            IconButton(
              tooltip: 'Abmelden',
              onPressed: busy ? null : widget.onLogout,
              icon: const Icon(Icons.logout),
            ),
        ],
      ),
      floatingActionButton: event == null || !allowed('alarm')
          ? null
          : FloatingActionButton.extended(
              backgroundColor: Colors.red,
              foregroundColor: Colors.white,
              onPressed: hasAlertableUnit ? sendAlarm : null,
              icon: const Icon(Icons.notifications_active),
              label: const Text('Alarmieren'),
            ),
      body: data == null
          ? Center(
              child: error != null
                  ? _ErrorCard(error!, load)
                  : const CircularProgressIndicator(),
            )
          : ListView(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 96),
              children: [
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(18),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          '${_date(event?['eventDate'])} ${event?['startTime'] ?? '–'} Uhr – ${_date(event?['endDate'] ?? event?['eventDate'])} ${event?['endTime'] ?? '–'} Uhr',
                        ),
                        const SizedBox(height: 6),
                        Text(
                          '$visibleHelperCount Helfer anwesend · ${units.where((u) => u['operationalStatus'] == 'deployed').length} Einsatzmittel im Einsatz',
                          style: const TextStyle(fontWeight: FontWeight.bold),
                        ),
                      ],
                    ),
                  ),
                ),
                if (error != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 12),
                    child: _ErrorCard(error!, load),
                  ),
                if (allowed('viewHelpers')) ...[
                  const SizedBox(height: 18),
                  _SectionHeader(
                    'Helfer',
                    Icons.groups,
                    allowed('manageHelpers') ? addHelper : null,
                  ),
                  const SizedBox(height: 8),
                  if (helpers.isEmpty)
                    const Card(
                      child: Padding(
                        padding: EdgeInsets.all(22),
                        child: Text('Aktuell keine Helfer anwesend.'),
                      ),
                    ),
                  ...helpers.map(
                    (h) => Card(
                      child: ListTile(
                        title: Text(
                          _helperName(h),
                          style: const TextStyle(fontWeight: FontWeight.bold),
                        ),
                        subtitle: Text(_helperSubtitle(h)),
                        trailing: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            if (h['registrationSource'] == 'manual')
                              const Text(
                                'Nur Anwesenheit',
                                style: TextStyle(color: Colors.black54),
                              )
                            else if (allowed('assignHelpers'))
                              DropdownButton<String>(
                                value: h['assignmentId'] as String?,
                                hint: const Text('Offen'),
                                items: [
                                  const DropdownMenuItem(
                                    value: '',
                                    child: Text('Offen'),
                                  ),
                                  ...units.map(
                                    (u) => DropdownMenuItem(
                                      value: u['id'] as String,
                                      child: Text(u['name'] as String),
                                    ),
                                  ),
                                ],
                                onChanged: busy
                                    ? null
                                    : (value) => mutate(
                                        () => widget.api.patch(
                                          '/api/events/${widget.eventId}/helpers/${h['id']}',
                                          {
                                            'assignmentId':
                                                value?.isEmpty == true
                                                ? null
                                                : value,
                                          },
                                        ),
                                        'Einteilung gespeichert.',
                                      ),
                              )
                            else
                              Text(
                                units.any(
                                      (unit) => unit['id'] == h['assignmentId'],
                                    )
                                    ? units
                                          .firstWhere(
                                            (unit) =>
                                                unit['id'] == h['assignmentId'],
                                          )['name']
                                          .toString()
                                    : 'Ohne Zuteilung',
                              ),
                            if (allowed('manageHelpers'))
                              IconButton(
                                tooltip: 'Helfer ausbuchen',
                                onPressed: busy
                                    ? null
                                    : () => mutate(
                                        () => widget.api.patch(
                                          '/api/events/${widget.eventId}/helpers/${h['id']}',
                                          {'action': 'checkout'},
                                        ),
                                        'Helfer wurde ausgebucht.',
                                      ),
                                icon: const Icon(
                                  Icons.person_remove,
                                  color: Colors.red,
                                ),
                              ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ],
                if (allowed('viewOperations')) ...[
                  const SizedBox(height: 18),
                  _SectionHeader(
                    'Einsatzmittel',
                    Icons.health_and_safety_outlined,
                    allowed('manageAssignments') ? addUnit : null,
                  ),
                  const SizedBox(height: 8),
                  if (units.isEmpty)
                    const Card(
                      child: Padding(
                        padding: EdgeInsets.all(22),
                        child: Text('Noch keine Einsatzmittel angelegt.'),
                      ),
                    ),
                  ...units.map((u) {
                    final assigned = allowed('viewHelpers')
                            ? helpers
                                  .where((h) => h['assignmentId'] == u['id'])
                                  .length
                            : ((u['activeHelperCount'] as num?)?.toInt() ?? 0),
                        deployed = u['operationalStatus'] == 'deployed';
                    return Card(
                      child: ListTile(
                        leading: CircleAvatar(
                          backgroundColor: deployed
                              ? const Color(0xffffe5e8)
                              : const Color(0xffe7f6ee),
                          child: Icon(
                            deployed ? Icons.notifications_active : Icons.check,
                            color: deployed ? Colors.red : Colors.green,
                          ),
                        ),
                        title: Text(
                          u['name'],
                          style: const TextStyle(fontWeight: FontWeight.bold),
                        ),
                        subtitle: Text(
                          '$assigned Helfer · ${deployed ? 'Im Einsatz seit ${_time(u['deployedAt'])}' : 'Frei für Einsätze'}',
                        ),
                        trailing: deployed && allowed('alarm')
                            ? TextButton(
                                onPressed: busy
                                    ? null
                                    : () => mutate(
                                        () => widget.api.patch(
                                          '/api/events/${widget.eventId}/assignments/${u['id']}',
                                          {'action': 'clear'},
                                        ),
                                        'Einsatzmittel ist wieder frei.',
                                      ),
                                child: const Text('Wieder frei'),
                              )
                            : !deployed &&
                                  assigned == 0 &&
                                  allowed('manageAssignments')
                            ? IconButton(
                                onPressed: busy
                                    ? null
                                    : () => mutate(
                                        () => widget.api.delete(
                                          '/api/events/${widget.eventId}/assignments/${u['id']}',
                                        ),
                                        'Einsatzmittel gelöscht.',
                                      ),
                                icon: const Icon(Icons.delete_outline),
                              )
                            : null,
                      ),
                    );
                  }),
                ],
              ],
            ),
    );
  }
}

class _SectionHeader extends StatelessWidget {
  const _SectionHeader(this.title, this.icon, this.action);
  final String title;
  final IconData icon;
  final VoidCallback? action;
  @override
  Widget build(BuildContext context) => Row(
    children: [
      Icon(icon, color: const Color(0xff146ee8)),
      const SizedBox(width: 8),
      Expanded(
        child: Text(
          title,
          style: Theme.of(
            context,
          ).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w900),
        ),
      ),
      if (action != null)
        TextButton.icon(
          onPressed: action,
          icon: const Icon(Icons.add),
          label: const Text('Anlegen'),
        ),
    ],
  );
}

class _ErrorCard extends StatelessWidget {
  const _ErrorCard(this.message, this.retry);
  final String message;
  final VoidCallback retry;
  @override
  Widget build(BuildContext context) => Card(
    color: const Color(0xffffe8e8),
    child: Padding(
      padding: const EdgeInsets.all(16),
      child: Row(
        children: [
          Expanded(
            child: Text(message, style: const TextStyle(color: Colors.red)),
          ),
          IconButton(onPressed: retry, icon: const Icon(Icons.refresh)),
        ],
      ),
    ),
  );
}

String _date(dynamic value) {
  try {
    return DateFormat(
      'dd.MM.yyyy',
      'de',
    ).format(DateTime.parse(value as String));
  } catch (_) {
    return value?.toString() ?? '–';
  }
}

String _time(dynamic value) {
  if (value == null) return '–';
  try {
    return DateFormat(
      'HH:mm',
    ).format(DateTime.parse(value as String).toLocal());
  } catch (_) {
    return '–';
  }
}

String _helperName(Map<String, dynamic> h) => h['lastName'] != null
    ? '${h['lastName']}, ${h['firstName'] ?? ''}'
    : h['name'] as String;

String _helperSubtitle(Map<String, dynamic> h) {
  final phone = (h['phone'] as String?)?.trim();
  return '${h['qualification']}${phone?.isNotEmpty == true ? ' · Tel. $phone' : ''} · gekommen ${_time(h['registeredAt'])}';
}

String _eventAccessRoleLabel(dynamic role) => switch (role) {
  'helper_recorder' => 'Nur Helfererfassung',
  'alarm_operator' => 'Nur Alarmierungsplattform',
  'event_manager' => 'Alarmierung mit Verwaltung',
  _ => 'Event-Zugang',
};
