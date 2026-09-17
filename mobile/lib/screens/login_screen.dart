import 'package:flutter/material.dart';
import '../api.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({
    super.key,
    required this.api,
    required this.onBack,
    required this.onAuthenticated,
    this.consumer=false,
  });
  final ApiClient api;
  final VoidCallback onBack;
  final Future<void> Function() onAuthenticated;
  final bool consumer;
  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final email = TextEditingController(),
      password = TextEditingController(),
      code = TextEditingController();
  LoginChallenge? challenge;
  bool busy = false;
  String? error;
  Future<void> submit() async {
    setState(() {
      busy = true;
      error = null;
    });
    try {
      if (challenge == null) {
        final next = await widget.api.login(email.text.trim(), password.text,consumer:widget.consumer);
        setState(() => challenge = next);
      } else {
        await widget.api.verifyCode(challenge!.challenge, code.text.trim());
        await widget.onAuthenticated();
      }
    } catch (e) {
      setState(() => error = e.toString());
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
      title: Text(widget.consumer?'Privatkonto anmelden':'Organisations-Login'),
    ),
    body: ListView(
      padding: const EdgeInsets.all(24),
      children: [
        const SizedBox(height: 30),
        const Icon(Icons.shield_outlined, color: Color(0xff146ee8), size: 58),
        const SizedBox(height: 16),
        Text(
          challenge == null ? 'Willkommen zurück' : 'Sicherheitscode',
          textAlign: TextAlign.center,
          style: Theme.of(
            context,
          ).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w900),
        ),
        const SizedBox(height: 8),
        Text(
          challenge == null
              ? widget.consumer?'Melde dich mit deinem Privatkonto an.':'Melde dich mit dem Organisationskonto an.'
              : 'Gib den per E-Mail gesendeten sechsstelligen Sicherheitscode ein.',
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 30),
        if (challenge == null) ...[
          TextField(
            controller: email,
            keyboardType: TextInputType.emailAddress,
            autofillHints: const [AutofillHints.email],
            decoration: const InputDecoration(
              labelText: 'E-Mail-Adresse',
              prefixIcon: Icon(Icons.mail_outline),
            ),
          ),
          const SizedBox(height: 14),
          TextField(
            controller: password,
            obscureText: true,
            autofillHints: const [AutofillHints.password],
            decoration: const InputDecoration(
              labelText: 'Passwort',
              prefixIcon: Icon(Icons.lock_outline),
            ),
          ),
        ] else ...[
          TextField(
            controller: code,
            keyboardType: TextInputType.number,
            maxLength: 6,
            autofocus: true,
            decoration: const InputDecoration(
              labelText: 'Sicherheitscode',
              prefixIcon: Icon(Icons.key),
            ),
          ),
          if (challenge!.previewCode != null)
            Text(
              'Lokaler Testcode: ${challenge!.previewCode}',
              style: const TextStyle(color: Color(0xff146ee8)),
            ),
        ],
        if (error != null)
          Padding(
            padding: const EdgeInsets.only(top: 16),
            child: Text(error!, style: const TextStyle(color: Colors.red)),
          ),
        const SizedBox(height: 20),
        SizedBox(
          height: 54,
          child: FilledButton(
            onPressed: busy ? null : submit,
            child: Text(
              busy
                  ? 'Bitte warten …'
                  : challenge == null
                  ? 'Anmelden'
                  : 'Sicherheitscode bestätigen',
            ),
          ),
        ),
      ],
    ),
  );
}
