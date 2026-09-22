import 'package:flutter/material.dart';
import '../api.dart';
import '../session_store.dart';
import 'qr_flow.dart';

class EventCodeLoginScreen extends StatefulWidget {
  const EventCodeLoginScreen({
    super.key,
    required this.api,
    required this.store,
    required this.onBack,
    required this.onAuthenticated,
    required this.onHelperAuthenticated,
  });

  final ApiClient api;
  final SessionStore store;
  final VoidCallback onBack;
  final Future<void> Function() onAuthenticated;
  final Future<void> Function(HelperCredentials) onHelperAuthenticated;

  @override
  State<EventCodeLoginScreen> createState() => _EventCodeLoginScreenState();
}

class _EventCodeLoginScreenState extends State<EventCodeLoginScreen> {
  final code = TextEditingController();
  bool busy = false;
  String? error;

  @override
  void dispose() {
    code.dispose();
    super.dispose();
  }

  Future<void> submit() async {
    final value = code.text.trim().toUpperCase().replaceAll(
      RegExp(r'[\s-]'),
      '',
    );
    if (!RegExp(r'^[A-HJ-NP-Z2-9]{8}$').hasMatch(value)) {
      setState(
        () => error = 'Bitte einen gültigen achtstelligen Event-Code eingeben.',
      );
      return;
    }
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final result = await widget.api.loginWithEventCode(value);
      if (result['flow'] == 'helper_attendance') {
        final eventId = result['eventId']?.toString() ?? '';
        final attendanceCode = result['attendanceCode']?.toString() ?? value;
        if (eventId.isEmpty) {
          throw ApiException('Der Helferlogin ist unvollständig.', 500);
        }
        if (!mounted) return;
        final credentials = await Navigator.push<HelperCredentials>(
          context,
          MaterialPageRoute(
            builder: (_) => QrAttendanceFlow(
              api: widget.api,
              store: widget.store,
              initialUri: Uri(
                path: '/event-attendance',
                queryParameters: {
                  'eventId': eventId,
                  'mode': 'come',
                  'code': attendanceCode,
                },
              ),
            ),
          ),
        );
        if (credentials != null) {
          await widget.onHelperAuthenticated(credentials);
        }
        return;
      }
      await widget.onAuthenticated();
    } catch (exception) {
      if (mounted) setState(() => error = exception.toString());
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      leading: IconButton(
        onPressed: widget.onBack,
        icon: const Icon(Icons.arrow_back),
      ),
      title: const Text('Codelogin'),
    ),
    body: ListView(
      padding: const EdgeInsets.all(24),
      children: [
        const SizedBox(height: 30),
        const Icon(Icons.key_outlined, color: Color(0xff146ee8), size: 58),
        const SizedBox(height: 16),
        Text(
          'Event mit Code öffnen',
          textAlign: TextAlign.center,
          style: Theme.of(
            context,
          ).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w900),
        ),
        const SizedBox(height: 8),
        const Text(
          'Keine E-Mail und kein Passwort erforderlich. Helfer können sich selbst einchecken; Bediencodes öffnen nur die freigegebenen Funktionen.',
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 30),
        TextField(
          controller: code,
          autofocus: true,
          maxLength: 8,
          textCapitalization: TextCapitalization.characters,
          autocorrect: false,
          enableSuggestions: false,
          onSubmitted: (_) => busy ? null : submit(),
          decoration: const InputDecoration(
            labelText: 'Event-Code',
            hintText: 'z. B. AB12CD34',
            prefixIcon: Icon(Icons.key_outlined),
          ),
        ),
        if (error != null)
          Padding(
            padding: const EdgeInsets.only(top: 12),
            child: Text(error!, style: const TextStyle(color: Colors.red)),
          ),
        const SizedBox(height: 20),
        SizedBox(
          height: 54,
          child: FilledButton.icon(
            onPressed: busy ? null : submit,
            icon: const Icon(Icons.login),
            label: Text(busy ? 'Event wird geöffnet …' : 'Event öffnen'),
          ),
        ),
        const SizedBox(height: 12),
        const Text(
          'Der Zugang gilt nur für das zugehörige Event und endet automatisch mit dessen Laufzeit.',
          textAlign: TextAlign.center,
          style: TextStyle(color: Colors.black54, fontSize: 12),
        ),
      ],
    ),
  );
}
