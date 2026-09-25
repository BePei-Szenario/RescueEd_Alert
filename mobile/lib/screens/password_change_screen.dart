import 'package:flutter/material.dart';

import '../api.dart';
import '../session_store.dart';
import '../widgets/password_field.dart';

class PasswordChangeScreen extends StatefulWidget {
  const PasswordChangeScreen({super.key, required this.api, this.onLogout});

  final ApiClient api;
  final Future<void> Function()? onLogout;

  @override
  State<PasswordChangeScreen> createState() => _PasswordChangeScreenState();
}

class _PasswordChangeScreenState extends State<PasswordChangeScreen> {
  final currentPassword = TextEditingController();
  final newPassword = TextEditingController();
  final repeatPassword = TextEditingController();
  bool busy = false;
  String? error;

  @override
  void dispose() {
    currentPassword.dispose();
    newPassword.dispose();
    repeatPassword.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final next = newPassword.text;
    if (currentPassword.text.isEmpty) {
      setState(() => error = 'Bitte das bisherige Passwort eingeben.');
      return;
    }
    if (next.length < 12) {
      setState(
        () => error = 'Das neue Passwort muss mindestens 12 Zeichen haben.',
      );
      return;
    }
    if (next != repeatPassword.text) {
      setState(() => error = 'Die neuen Passwörter stimmen nicht überein.');
      return;
    }
    setState(() {
      busy = true;
      error = null;
    });
    try {
      await widget.api.post('/api/profile/password', {
        'currentPassword': currentPassword.text,
        'newPassword': next,
      });
      currentPassword.clear();
      newPassword.clear();
      repeatPassword.clear();
      if (!mounted) return;
      await showDialog<void>(
        context: context,
        barrierDismissible: false,
        builder: (dialogContext) => AlertDialog(
          title: const Text('Passwort geändert'),
          content: const Text(
            'Aus Sicherheitsgründen wurden alle Sitzungen beendet. Bitte melde dich erneut an.',
          ),
          actions: [
            FilledButton(
              onPressed: () => Navigator.pop(dialogContext),
              child: const Text('OK'),
            ),
          ],
        ),
      );
      widget.api.sessionCookie = null;
      await SessionStore().clearOwnerSession();
      if (widget.onLogout != null) await widget.onLogout!();
      if (mounted) Navigator.of(context).popUntil((route) => route.isFirst);
    } catch (exception) {
      if (mounted) setState(() => error = exception.toString());
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Passwort ändern')),
    body: ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'App-Zugang absichern',
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900),
                ),
                const SizedBox(height: 6),
                const Text(
                  'Nach der Änderung werden alle angemeldeten Geräte abgemeldet.',
                  style: TextStyle(color: Colors.blueGrey),
                ),
                const SizedBox(height: 16),
                PasswordField(
                  controller: currentPassword,
                  labelText: 'Bisheriges Passwort',
                ),
                const SizedBox(height: 12),
                PasswordField(
                  controller: newPassword,
                  labelText: 'Neues Passwort (mindestens 12 Zeichen)',
                ),
                const SizedBox(height: 12),
                PasswordField(
                  controller: repeatPassword,
                  labelText: 'Neues Passwort wiederholen',
                ),
                if (error != null) ...[
                  const SizedBox(height: 12),
                  Text(error!, style: const TextStyle(color: Colors.red)),
                ],
                const SizedBox(height: 16),
                FilledButton.icon(
                  onPressed: busy ? null : _submit,
                  icon: const Icon(Icons.lock_reset),
                  label: Text(busy ? 'Wird geändert …' : 'Passwort ändern'),
                ),
              ],
            ),
          ),
        ),
      ],
    ),
  );
}
