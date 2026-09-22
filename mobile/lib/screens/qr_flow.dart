import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import '../api.dart';
import '../session_store.dart';

const debugAttendanceQr = String.fromEnvironment(
  'RESCUEED_DEBUG_ATTENDANCE_QR',
);

class HelperCredentials {
  const HelperCredentials(this.eventId, this.token, {this.ended = false});
  final String eventId, token;
  final bool ended;
}

class QrAttendanceFlow extends StatefulWidget {
  const QrAttendanceFlow({
    super.key,
    required this.api,
    required this.store,
    this.initialUri,
  });
  final ApiClient api;
  final SessionStore store;
  final Uri? initialUri;
  @override
  State<QrAttendanceFlow> createState() => _QrAttendanceFlowState();
}

class _QrAttendanceFlowState extends State<QrAttendanceFlow> {
  final scanner = MobileScannerController(
    formats: const [BarcodeFormat.qrCode],
  );
  final firstName = TextEditingController(),
      lastName = TextEditingController(),
      qualification = TextEditingController(),
      phone = TextEditingController();
  Uri? qr;
  Map<String, dynamic>? info;
  bool busy = false, detected = false;
  String? error;

  @override
  void initState() {
    super.initState();
    final initial =
        widget.initialUri ??
        (debugAttendanceQr.isEmpty ? null : Uri.tryParse(debugAttendanceQr));
    if (initial != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        _openQr(initial);
      });
    }
  }

  @override
  void dispose() {
    scanner.dispose();
    firstName.dispose();
    lastName.dispose();
    qualification.dispose();
    phone.dispose();
    super.dispose();
  }

  Future<void> detectedCode(BarcodeCapture capture) async {
    if (detected) return;
    final raw = capture.barcodes.firstOrNull?.rawValue;
    if (raw == null) return;
    final parsed = Uri.tryParse(raw);
    if (parsed == null) return;
    await _openQr(parsed);
  }

  Future<void> _openQr(Uri parsed) async {
    if (detected) return;
    if (parsed.path != '/event-attendance' ||
        parsed.queryParameters['eventId'] == null ||
        parsed.queryParameters['code'] == null) {
      setState(() => error = 'Das ist kein gültiger RescueEd-Eventcode.');
      return;
    }
    detected = true;
    await scanner.stop();
    setState(() {
      qr = parsed;
      busy = true;
      error = null;
    });
    await _loadInfo(parsed);
  }

  Future<void> _loadInfo(Uri parsed) async {
    try {
      final next = await widget.api.attendanceInfo(parsed);
      if (mounted) setState(() => info = next);
    } catch (e) {
      if (mounted) setState(() => error = e.toString());
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> submit() async {
    if (qr == null) return;
    setState(() {
      busy = true;
      error = null;
    });
    final leave = qr!.queryParameters['mode'] == 'leave';
    try {
      if (leave) {
        final eventId = await widget.store.readHelperEvent(),
            token = await widget.store.readHelperToken();
        if (eventId != qr!.queryParameters['eventId'] || token == null) {
          throw ApiException(
            'Für dieses Event ist auf dem Gerät kein aktiver Check-in vorhanden.',
            400,
          );
        }
        await widget.api.submitAttendance(qr!, {'helperToken': token});
        await widget.store.clearHelperSession();
        if (mounted) {
          Navigator.pop(context, const HelperCredentials('', '', ended: true));
        }
      } else {
        if (firstName.text.trim().isEmpty ||
            lastName.text.trim().isEmpty ||
            qualification.text.trim().isEmpty) {
          throw ApiException('Bitte alle Angaben ausfüllen.', 400);
        }
        final result = await widget.api.submitAttendance(qr!, {
          'firstName': firstName.text.trim(),
          'lastName': lastName.text.trim(),
          'qualification': qualification.text.trim(),
          'phone': phone.text.trim(),
        });
        final eventId = qr!.queryParameters['eventId']!,
            token = result['helperToken'] as String;
        await widget.store.saveHelperSession(eventId, token);
        if (mounted) Navigator.pop(context, HelperCredentials(eventId, token));
      }
    } catch (e) {
      if (mounted) setState(() => error = e.toString());
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final leave = qr?.queryParameters['mode'] == 'leave';
    final event = info?['event'] as Map<String, dynamic>?;
    return Scaffold(
      appBar: AppBar(
        title: Text(
          qr == null
              ? 'QR-Code scannen'
              : leave
              ? 'Event verlassen'
              : 'Event beitreten',
        ),
      ),
      body: qr == null
          ? Stack(
              children: [
                MobileScanner(controller: scanner, onDetect: detectedCode),
                Center(
                  child: Container(
                    width: 260,
                    height: 260,
                    decoration: BoxDecoration(
                      border: Border.all(color: Colors.white, width: 4),
                      borderRadius: BorderRadius.circular(24),
                    ),
                  ),
                ),
                Positioned(
                  left: 20,
                  right: 20,
                  bottom: 30,
                  child: Card(
                    color: const Color(0xdd071f3e),
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Text(
                        error ??
                            'Scanne den RescueEd-Code „Kommen“ oder „Gehen“.',
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          color: error == null
                              ? Colors.white
                              : Colors.redAccent,
                        ),
                      ),
                    ),
                  ),
                ),
              ],
            )
          : ListView(
              padding: const EdgeInsets.all(20),
              children: [
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(18),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          leave ? 'GEHEN' : 'KOMMEN',
                          style: TextStyle(
                            color: leave ? Colors.red : Colors.green,
                            fontWeight: FontWeight.bold,
                            letterSpacing: 1.3,
                          ),
                        ),
                        const SizedBox(height: 6),
                        Text(
                          event?['name'] ?? 'Event wird geladen …',
                          style: Theme.of(context).textTheme.titleLarge
                              ?.copyWith(fontWeight: FontWeight.w900),
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 18),
                if (!leave) ...[
                  TextField(
                    controller: firstName,
                    decoration: const InputDecoration(labelText: 'Vorname'),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: lastName,
                    decoration: const InputDecoration(labelText: 'Nachname'),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: qualification,
                    decoration: const InputDecoration(
                      labelText: 'Qualifikation',
                    ),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: phone,
                    keyboardType: TextInputType.phone,
                    decoration: const InputDecoration(
                      labelText: 'Telefonnummer (freiwillig)',
                      hintText: '+49 171 1234567',
                    ),
                  ),
                ] else
                  const Card(
                    child: Padding(
                      padding: EdgeInsets.all(18),
                      child: Text(
                        'Mit der Bestätigung wird deine Anwesenheit beendet. Der temporäre Zugang und alle lokal gespeicherten Eventdaten werden anschließend aus der App gelöscht.',
                      ),
                    ),
                  ),
                if (error != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 14),
                    child: Text(
                      error!,
                      style: const TextStyle(color: Colors.red),
                    ),
                  ),
                const SizedBox(height: 18),
                FilledButton.icon(
                  style: leave
                      ? FilledButton.styleFrom(backgroundColor: Colors.red)
                      : null,
                  onPressed: busy || info == null ? null : submit,
                  icon: Icon(leave ? Icons.logout : Icons.login),
                  label: Text(
                    busy
                        ? 'Bitte warten …'
                        : leave
                        ? 'Gehen bestätigen'
                        : 'Jetzt einchecken',
                  ),
                ),
              ],
            ),
    );
  }
}
