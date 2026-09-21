import 'package:flutter/material.dart';
import '../api.dart';
import '../legal_documents.dart';
import '../widgets/password_field.dart';

class ConsumerRegisterScreen extends StatefulWidget {
  const ConsumerRegisterScreen({
    super.key,
    required this.api,
    required this.onBack,
    required this.onDone,
  });
  final ApiClient api;
  final VoidCallback onBack, onDone;
  @override
  State<ConsumerRegisterScreen> createState() => _ConsumerRegisterScreenState();
}

class _ConsumerRegisterScreenState extends State<ConsumerRegisterScreen> {
  final name = TextEditingController(),
      email = TextEditingController(),
      password = TextEditingController(),
      code = TextEditingController();
  List<Map<String, dynamic>> documents = [];
  final acknowledged = <String>{};
  final opened = <String>{};
  bool loading = true, busy = false, codeSent = false;
  bool documentsFromCache = false;
  String? error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    name.dispose();
    email.dispose();
    password.dispose();
    code.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final result = await LegalDocuments(widget.api).consumerDocuments();
      documents = (result.data['documents'] as List)
          .map((item) => Map<String, dynamic>.from(item as Map))
          .toList();
      documentsFromCache = result.fromCache;
    } catch (e) {
      error = e.toString();
    }
    if (mounted) setState(() => loading = false);
  }

  Future<void> _showDocument(Map<String, dynamic> document) async {
    await showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('${document['title']} · ${document['version']}'),
        content: SizedBox(
          width: 520,
          child: SingleChildScrollView(
            child: SelectableText(document['content'] as String),
          ),
        ),
        actions: [
          FilledButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('OK'),
          ),
        ],
      ),
    );
    if (mounted) setState(() => opened.add(document['id'] as String));
  }

  Future<void> _submit() async {
    if (acknowledged.length != documents.length) {
      setState(
        () => error =
            'Bitte alle drei Rechtstexte öffnen und einzeln bestätigen.',
      );
      return;
    }
    setState(() {
      busy = true;
      error = null;
    });
    try {
      if (!codeSent) {
        await widget.api.post('/api/mobile/consumer/register', {
          'fullName': name.text.trim(),
          'email': email.text.trim(),
          'password': password.text,
          'acknowledgedVersionIds': acknowledged.toList(),
        });
        if (mounted) setState(() => codeSent = true);
      } else {
        await widget.api.post('/api/mobile/consumer/register/verify', {
          'email': email.text.trim(),
          'code': code.text.trim(),
        });
        if (mounted) {
          await showDialog<void>(
            context: context,
            builder: (context) => AlertDialog(
              title: const Text('Konto erstellt'),
              content: const Text(
                'Melde dich jetzt an und schließe das Monatsabo über Google Play oder den App Store ab.',
              ),
              actions: [
                FilledButton(
                  onPressed: () => Navigator.pop(context),
                  child: const Text('OK'),
                ),
              ],
            ),
          );
          widget.onDone();
        }
      }
    } catch (e) {
      if (mounted) setState(() => error = e.toString());
    }
    if (mounted) setState(() => busy = false);
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: const Text('Privatkonto registrieren'),
      leading: IconButton(
        onPressed: widget.onBack,
        icon: const Icon(Icons.arrow_back),
      ),
    ),
    body: loading
        ? const Center(child: CircularProgressIndicator())
        : ListView(
            padding: const EdgeInsets.all(20),
            children: [
              Text(
                'RescueEd Alert für Privatpersonen',
                style: Theme.of(context).textTheme.headlineSmall,
              ),
              const SizedBox(height: 8),
              const Text(
                'Das Monatsabo wird erst nach der Registrierung im Google Play Store oder App Store abgeschlossen. Ohne bestätigtes Abo können keine neuen Events angelegt werden.',
              ),
              const SizedBox(height: 20),
              if (documentsFromCache)
                const Padding(
                  padding: EdgeInsets.only(bottom: 12),
                  child: Text(
                    'Offline gespeicherte Rechtstexte. Für die Registrierung und verbindliche Bestätigung ist eine Internetverbindung erforderlich.',
                    style: TextStyle(color: Colors.orange),
                  ),
                ),
              if (!codeSent) ...[
                TextField(
                  controller: name,
                  decoration: const InputDecoration(
                    labelText: 'Vor- und Nachname',
                  ),
                  textCapitalization: TextCapitalization.words,
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: email,
                  decoration: const InputDecoration(
                    labelText: 'E-Mail-Adresse',
                  ),
                  keyboardType: TextInputType.emailAddress,
                  autofillHints: const [AutofillHints.email],
                ),
                const SizedBox(height: 12),
                PasswordField(
                  controller: password,
                  labelText: 'Passwort (mindestens 12 Zeichen)',
                  autofillHints: const [AutofillHints.newPassword],
                ),
                const SizedBox(height: 20),
                ...documents.map((document) {
                  final key = document['documentKey'] as String,
                      id = document['id'] as String;
                  final label = key == 'agb_b2c'
                      ? 'AGB akzeptieren'
                      : key == 'datenschutz'
                      ? 'Datenschutzerklärung gelesen'
                      : 'Widerrufsbelehrung gelesen';
                  return Column(
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: TextButton(
                              onPressed: () => _showDocument(document),
                              child: Text(
                                '${document['title']} öffnen · Version ${document['version']}',
                              ),
                            ),
                          ),
                        ],
                      ),
                      CheckboxListTile(
                        value: acknowledged.contains(id),
                        title: Text(label),
                        subtitle: key == 'widerruf'
                            ? const Text(
                                'Dies ist kein Verzicht auf das Widerrufsrecht.',
                              )
                            : null,
                        onChanged: opened.contains(id)
                            ? (value) => setState(() {
                                if (value == true) {
                                  acknowledged.add(id);
                                } else {
                                  acknowledged.remove(id);
                                }
                              })
                            : null,
                      ),
                    ],
                  );
                }),
              ] else ...[
                const Text(
                  'Ein Sicherheitscode wurde an deine E-Mail-Adresse gesendet. Er ist zehn Minuten gültig.',
                ),
                const SizedBox(height: 14),
                TextField(
                  controller: code,
                  decoration: const InputDecoration(
                    labelText: 'Sicherheitscode',
                  ),
                  keyboardType: TextInputType.number,
                  maxLength: 6,
                ),
              ],
              if (error != null)
                Padding(
                  padding: const EdgeInsets.only(top: 12),
                  child: Text(
                    error!,
                    style: const TextStyle(color: Colors.red),
                  ),
                ),
              const SizedBox(height: 18),
              FilledButton(
                onPressed: busy || documents.length != 3 || documentsFromCache
                    ? null
                    : _submit,
                child: Text(
                  busy
                      ? 'Bitte warten …'
                      : codeSent
                      ? 'Registrierung abschließen'
                      : 'Sicherheitscode anfordern',
                ),
              ),
            ],
          ),
  );
}
