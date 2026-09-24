import 'package:flutter/material.dart';

import '../api.dart';
import '../legal_documents.dart';
import '../legal_document_viewer.dart';

class OrganizationRegisterScreen extends StatefulWidget {
  const OrganizationRegisterScreen({
    super.key,
    required this.api,
    required this.onBack,
    required this.onDone,
  });

  final ApiClient api;
  final VoidCallback onBack;
  final VoidCallback onDone;

  @override
  State<OrganizationRegisterScreen> createState() =>
      _OrganizationRegisterScreenState();
}

class _OrganizationRegisterScreenState
    extends State<OrganizationRegisterScreen> {
  final organization = TextEditingController();
  final contactName = TextEditingController();
  final street = TextEditingController();
  final houseNumber = TextEditingController();
  final postalCode = TextEditingController();
  final city = TextEditingController();
  final email = TextEditingController();
  final acknowledged = <String>{};
  final opened = <String>{};
  List<Map<String, dynamic>> documents = [];
  String organizationType = 'sanitaetsdienst';
  bool loading = true;
  bool busy = false;
  bool documentsFromCache = false;
  String? error;

  @override
  void initState() {
    super.initState();
    _loadDocuments();
  }

  @override
  void dispose() {
    organization.dispose();
    contactName.dispose();
    street.dispose();
    houseNumber.dispose();
    postalCode.dispose();
    city.dispose();
    email.dispose();
    super.dispose();
  }

  Future<void> _loadDocuments() async {
    try {
      final result = await LegalDocuments(
        widget.api,
      ).organizationRegistrationDocuments();
      documents = (result.data['documents'] as List)
          .map((item) => Map<String, dynamic>.from(item as Map))
          .toList();
      documentsFromCache = result.fromCache;
    } catch (exception) {
      error = exception.toString();
    }
    if (mounted) setState(() => loading = false);
  }

  Future<void> _showDocument(Map<String, dynamic> document) async {
    final shown = await showLegalDocument(context, widget.api, document);
    if (shown && mounted) setState(() => opened.add(document['id'] as String));
  }

  Future<void> _submit() async {
    if (acknowledged.length != documents.length) {
      setState(
        () => error =
            'Bitte alle vier Rechtstexte öffnen und einzeln bestätigen.',
      );
      return;
    }
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final result = await widget.api.post('/api/register', {
        'organization': organization.text.trim(),
        'organizationType': organizationType,
        'contactName': contactName.text.trim(),
        'street': street.text.trim(),
        'houseNumber': houseNumber.text.trim(),
        'postalCode': postalCode.text.trim(),
        'city': city.text.trim(),
        'email': email.text.trim(),
        'acceptedDocumentVersionIds': acknowledged.toList(),
      });
      if (!mounted) return;
      await showDialog<void>(
        context: context,
        barrierDismissible: false,
        builder: (dialogContext) => AlertDialog(
          icon: const Icon(Icons.mark_email_read_outlined, size: 44),
          title: const Text('E-Mail prüfen'),
          content: Text(
            result['previewUrl'] != null
                ? 'Die Registrierung wurde vorbereitet. Im lokalen Testbetrieb kann der in der E-Mail erzeugte Einmallink zum Festlegen des Passworts verwendet werden.'
                : 'Wir haben einen einmaligen Link an die angegebene E-Mail-Adresse gesendet. Öffne ihn, lege dein Passwort fest und melde dich anschließend als Organisation an.',
          ),
          actions: [
            FilledButton(
              onPressed: () => Navigator.pop(dialogContext),
              child: const Text('OK'),
            ),
          ],
        ),
      );
      widget.onDone();
    } catch (exception) {
      if (mounted) setState(() => error = exception.toString());
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  String _documentAction(String key) => switch (key) {
    'datenschutz' => 'Datenschutzerklärung gelesen',
    'agb' => 'Organisations-AGB akzeptieren',
    'avv' => 'AVV akzeptieren',
    'sla' => 'SLA akzeptieren',
    _ => 'Dokument bestätigen',
  };

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: const Text('Organisation registrieren'),
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
                'RescueEd Alert für Organisationen',
                style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                  fontWeight: FontWeight.w900,
                ),
              ),
              const SizedBox(height: 8),
              const Text(
                'Der Organisationszugang umfasst die App und die Web-SaaS. Kostenpflichtige Events werden entsprechend der Bestellübersicht abgerechnet.',
              ),
              if (documentsFromCache)
                const Padding(
                  padding: EdgeInsets.only(top: 12),
                  child: Text(
                    'Offline gespeicherte Rechtstexte. Für die verbindliche Registrierung ist eine Internetverbindung erforderlich.',
                    style: TextStyle(color: Colors.orange),
                  ),
                ),
              const SizedBox(height: 20),
              TextField(
                controller: organization,
                decoration: const InputDecoration(
                  labelText: 'Organisation / Rechnungsempfänger',
                ),
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                initialValue: organizationType,
                decoration: const InputDecoration(
                  labelText: 'Organisationsart',
                ),
                items: const [
                  DropdownMenuItem(
                    value: 'feuerwehr',
                    child: Text('Feuerwehr'),
                  ),
                  DropdownMenuItem(
                    value: 'sanitaetsdienst',
                    child: Text('Sanitätsdienst'),
                  ),
                  DropdownMenuItem(value: 'thw', child: Text('THW')),
                  DropdownMenuItem(
                    value: 'alarmierungsnutzer',
                    child: Text('Alarmierungsnutzer'),
                  ),
                ],
                onChanged: (value) => setState(() {
                  organizationType = value ?? organizationType;
                }),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: contactName,
                decoration: const InputDecoration(labelText: 'Ansprechperson'),
                textCapitalization: TextCapitalization.words,
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    flex: 3,
                    child: TextField(
                      controller: street,
                      decoration: const InputDecoration(labelText: 'Straße'),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: TextField(
                      controller: houseNumber,
                      decoration: const InputDecoration(
                        labelText: 'Hausnummer',
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: postalCode,
                      decoration: const InputDecoration(labelText: 'PLZ'),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    flex: 2,
                    child: TextField(
                      controller: city,
                      decoration: const InputDecoration(labelText: 'Ort'),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              TextField(
                controller: email,
                decoration: const InputDecoration(labelText: 'E-Mail-Adresse'),
                keyboardType: TextInputType.emailAddress,
                autofillHints: const [AutofillHints.email],
              ),
              const SizedBox(height: 20),
              ...documents.map((document) {
                final id = document['id'] as String;
                final key = document['documentKey'] as String;
                return Column(
                  children: [
                    SizedBox(
                      width: double.infinity,
                      child: TextButton(
                        onPressed: () => _showDocument(document),
                        child: Text(
                          '${document['title']} öffnen · Version ${document['version']}',
                        ),
                      ),
                    ),
                    CheckboxListTile(
                      contentPadding: EdgeInsets.zero,
                      value: acknowledged.contains(id),
                      title: Text(_documentAction(key)),
                      onChanged: opened.contains(id)
                          ? (selected) => setState(() {
                              if (selected == true) {
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
              if (error != null)
                Padding(
                  padding: const EdgeInsets.only(top: 12),
                  child: Text(
                    error!,
                    style: const TextStyle(color: Colors.red),
                  ),
                ),
              const SizedBox(height: 18),
              SizedBox(
                height: 54,
                child: FilledButton(
                  onPressed: busy || documents.length != 4 || documentsFromCache
                      ? null
                      : _submit,
                  child: Text(
                    busy ? 'Bitte warten …' : 'Registrierung vorbereiten',
                  ),
                ),
              ),
            ],
          ),
  );
}
