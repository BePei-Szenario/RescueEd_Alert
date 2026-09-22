import 'package:flutter/material.dart';
import '../api.dart';
import '../legal_documents.dart';

class LegalReconfirmationScreen extends StatefulWidget {
  const LegalReconfirmationScreen({super.key, required this.api});
  final ApiClient api;

  @override
  State<LegalReconfirmationScreen> createState() =>
      _LegalReconfirmationScreenState();
}

class _LegalReconfirmationScreenState extends State<LegalReconfirmationScreen> {
  List<Map<String, dynamic>> documents = [];
  final opened = <String>{}, confirmed = <String>{};
  bool loading = true, busy = false, available = false, canConfirm = false;
  bool documentsFromCache = false;
  String? error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final result = await LegalDocuments(widget.api).reconfirmation();
      final data = result.data;
      if (!mounted) return;
      setState(() {
        documents = (data['documents'] as List? ?? [])
            .map((item) => Map<String, dynamic>.from(item as Map))
            .toList();
        available = data['available'] == true;
        canConfirm = data['canConfirm'] == true;
        documentsFromCache = result.fromCache;
        error = null;
        loading = false;
      });
    } catch (reason) {
      if (mounted) {
        setState(() {
          error = '$reason';
          loading = false;
        });
      }
    }
  }

  Future<void> _open(Map<String, dynamic> document) async {
    await showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('${document['title']} · Version ${document['version']}'),
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
    setState(() {
      busy = true;
      error = null;
    });
    try {
      await widget.api.post('/api/legal/reconfirmation', {
        'acceptedDocumentVersionIds': confirmed.toList(),
      });
      if (mounted) Navigator.pop(context, true);
    } catch (reason) {
      if (mounted) {
        setState(() {
          error = '$reason';
          busy = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Aktuelle Rechtstexte')),
    body: loading
        ? const Center(child: CircularProgressIndicator())
        : ListView(
            padding: const EdgeInsets.all(20),
            children: [
              const Text(
                'Laufende Events bleiben erreichbar. Vor einem neuen Event müssen die aktuellen Fassungen bestätigt werden.',
              ),
              if (documentsFromCache)
                const Padding(
                  padding: EdgeInsets.only(top: 12),
                  child: Text(
                    'Offline gespeicherte Fassung. Eine verbindliche Bestätigung ist erst wieder mit Internetverbindung möglich.',
                    style: TextStyle(color: Colors.orange),
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
              if (!available)
                const Padding(
                  padding: EdgeInsets.only(top: 20),
                  child: Text(
                    'Die aktuellen Rechtstexte sind derzeit nicht verfügbar.',
                  ),
                ),
              if (available && !canConfirm)
                const Padding(
                  padding: EdgeInsets.only(top: 20),
                  child: Text(
                    'Das Hauptkonto Ihrer Organisation muss die neuen Fassungen bestätigen.',
                  ),
                ),
              if (available && canConfirm && documents.isEmpty)
                const Padding(
                  padding: EdgeInsets.only(top: 20),
                  child: Text(
                    'Alle aktuellen Fassungen sind bereits bestätigt.',
                  ),
                ),
              if (available && canConfirm)
                ...documents.map((document) {
                  final id = document['id'] as String;
                  final label = document['acknowledgementType'] == 'read'
                      ? 'Ich habe ${document['title']} gelesen.'
                      : 'Ich habe ${document['title']} gelesen und akzeptiere diese Fassung.';
                  return Card(
                    margin: const EdgeInsets.only(top: 16),
                    child: Padding(
                      padding: const EdgeInsets.all(12),
                      child: Column(
                        children: [
                          ListTile(
                            title: Text(
                              '${document['title']} · Version ${document['version']}',
                            ),
                            trailing: const Icon(Icons.open_in_new),
                            onTap: () => _open(document),
                          ),
                          CheckboxListTile(
                            value: confirmed.contains(id),
                            title: Text(label),
                            onChanged: opened.contains(id) && !busy
                                ? (value) => setState(() {
                                    if (value == true) {
                                      confirmed.add(id);
                                    } else {
                                      confirmed.remove(id);
                                    }
                                  })
                                : null,
                          ),
                        ],
                      ),
                    ),
                  );
                }),
              if (available && canConfirm && documents.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(top: 22),
                  child: FilledButton(
                    onPressed: busy || confirmed.length != documents.length
                        ? null
                        : _submit,
                    child: Text(
                      busy ? 'Wird gespeichert …' : 'Alle Fassungen bestätigen',
                    ),
                  ),
                ),
              TextButton(
                onPressed: () => Navigator.pop(context, false),
                child: const Text('Laufendes Event fortsetzen'),
              ),
            ],
          ),
  );
}
