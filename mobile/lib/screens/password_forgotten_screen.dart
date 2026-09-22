import 'package:flutter/material.dart';
import '../api.dart';

class PasswordForgottenScreen extends StatefulWidget {
  const PasswordForgottenScreen({
    super.key,
    required this.api,
    required this.onBack,
  });

  final ApiClient api;
  final VoidCallback onBack;

  @override
  State<PasswordForgottenScreen> createState() =>
      _PasswordForgottenScreenState();
}

class _PasswordForgottenScreenState extends State<PasswordForgottenScreen> {
  final email = TextEditingController();
  bool busy = false;
  bool sent = false;
  String? error;

  @override
  void dispose() {
    email.dispose();
    super.dispose();
  }

  Future<void> submit() async {
    setState(() {
      busy = true;
      error = null;
    });
    try {
      await widget.api.post('/api/auth/password-link', {
        'email': email.text.trim(),
      });
      if (mounted) setState(() => sent = true);
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
      title: const Text('Passwort vergessen'),
    ),
    body: Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 480),
          child: Card(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(
                    Icons.mark_email_read_outlined,
                    color: Color(0xff146ee8),
                    size: 52,
                  ),
                  const SizedBox(height: 16),
                  Text(
                    'Passwort zurücksetzen',
                    style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    sent
                        ? 'Falls für diese E-Mail-Adresse ein aktives Konto besteht, wurde ein einmaliger Passwortlink versendet. Bitte prüfe auch den Spam-Ordner.'
                        : 'Gib die E-Mail-Adresse deines privaten oder deines Organisationskontos ein.',
                    textAlign: TextAlign.center,
                  ),
                  if (!sent) ...[
                    const SizedBox(height: 24),
                    TextField(
                      controller: email,
                      keyboardType: TextInputType.emailAddress,
                      autofillHints: const [AutofillHints.email],
                      decoration: const InputDecoration(
                        labelText: 'E-Mail-Adresse',
                        prefixIcon: Icon(Icons.mail_outline),
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
                    const SizedBox(height: 20),
                    SizedBox(
                      width: double.infinity,
                      height: 52,
                      child: FilledButton(
                        onPressed: busy ? null : submit,
                        child: Text(
                          busy ? 'Bitte warten …' : 'Passwortlink anfordern',
                        ),
                      ),
                    ),
                  ] else ...[
                    const SizedBox(height: 20),
                    SizedBox(
                      width: double.infinity,
                      height: 52,
                      child: FilledButton(
                        onPressed: widget.onBack,
                        child: const Text('Zur Anmeldung'),
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ),
      ),
    ),
  );
}
