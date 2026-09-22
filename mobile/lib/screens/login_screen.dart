import 'package:flutter/material.dart';
import '../api.dart';
import '../widgets/password_field.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({
    super.key,
    required this.api,
    required this.onBack,
    required this.onAuthenticated,
    required this.onForgotPassword,
    required this.onRegister,
  });
  final ApiClient api;
  final VoidCallback onBack;
  final Future<void> Function() onAuthenticated;
  final VoidCallback onForgotPassword;
  final VoidCallback onRegister;
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

  @override
  void dispose() {
    email.dispose();
    password.dispose();
    code.dispose();
    super.dispose();
  }

  Future<void> submit() async {
    setState(() {
      busy = true;
      error = null;
    });
    try {
      if (challenge == null) {
        final next = await widget.api.login(email.text.trim(), password.text);
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
      title: const Text('Anmelden'),
    ),
    body: Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 480),
          child: Card(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: AutofillGroup(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(
                      Icons.shield_outlined,
                      color: Color(0xff146ee8),
                      size: 52,
                    ),
                    const SizedBox(height: 16),
                    Text(
                      challenge == null
                          ? 'Willkommen zurück'
                          : 'Sicherheitscode',
                      textAlign: TextAlign.center,
                      style: Theme.of(context).textTheme.headlineSmall
                          ?.copyWith(fontWeight: FontWeight.w900),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      challenge == null
                          ? 'Ein Login für Privatpersonen und Organisationen.'
                          : 'Gib den per E-Mail gesendeten sechsstelligen Sicherheitscode ein.',
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 28),
                    if (challenge == null) ...[
                      TextField(
                        controller: email,
                        keyboardType: TextInputType.emailAddress,
                        textInputAction: TextInputAction.next,
                        autofillHints: const [AutofillHints.email],
                        decoration: const InputDecoration(
                          labelText: 'E-Mail-Adresse',
                          prefixIcon: Icon(Icons.mail_outline),
                        ),
                      ),
                      const SizedBox(height: 14),
                      PasswordField(
                        controller: password,
                        labelText: 'Passwort',
                        prefixIcon: Icons.lock_outline,
                        autofillHints: const [AutofillHints.password],
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
                          busy
                              ? 'Bitte warten …'
                              : challenge == null
                              ? 'Anmelden'
                              : 'Sicherheitscode bestätigen',
                        ),
                      ),
                    ),
                    if (challenge == null) ...[
                      const SizedBox(height: 10),
                      Wrap(
                        alignment: WrapAlignment.center,
                        crossAxisAlignment: WrapCrossAlignment.center,
                        children: [
                          TextButton(
                            onPressed: widget.onForgotPassword,
                            child: const Text('Passwort vergessen?'),
                          ),
                          const Text('–'),
                          TextButton(
                            onPressed: widget.onRegister,
                            child: const Text('Registrieren'),
                          ),
                        ],
                      ),
                    ],
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    ),
  );
}
