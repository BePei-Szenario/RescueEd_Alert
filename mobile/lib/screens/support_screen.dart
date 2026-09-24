import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:package_info_plus/package_info_plus.dart';
import '../api.dart';

class SupportScreen extends StatefulWidget {
  const SupportScreen({
    super.key,
    required this.api,
    this.eventId,
    this.helperToken,
  });
  final ApiClient api;
  final String? eventId, helperToken;
  @override
  State<SupportScreen> createState() => _SupportScreenState();
}

class _SupportScreenState extends State<SupportScreen> {
  final subject = TextEditingController(),
      description = TextEditingController();
  List<dynamic> tickets = [];
  bool busy = false;
  String? error;
  String appVersion = 'wird geladen';
  String get platform => switch (defaultTargetPlatform) {
    TargetPlatform.android => 'android',
    TargetPlatform.iOS => 'ios',
    _ => 'other',
  };
  String get buildMode => kReleaseMode
      ? 'release'
      : kProfileMode
      ? 'profile'
      : 'debug';
  bool get authorized =>
      widget.api.sessionCookie != null || widget.helperToken != null;
  String get query => widget.eventId == null
      ? ''
      : '?eventId=${Uri.encodeQueryComponent(widget.eventId!)}';

  @override
  void initState() {
    super.initState();
    _loadAppVersion();
    if (authorized) load();
  }

  Future<void> _loadAppVersion() async {
    try {
      final package = await PackageInfo.fromPlatform();
      if (mounted) {
        setState(
          () => appVersion = '${package.version}+${package.buildNumber}',
        );
      }
    } catch (_) {
      if (mounted) setState(() => appVersion = 'unbekannt');
    }
  }

  @override
  void dispose() {
    subject.dispose();
    description.dispose();
    super.dispose();
  }

  Future<void> load() async {
    try {
      final data = await widget.api.get(
        '/api/support/tickets$query',
        bearer: widget.helperToken,
      );
      if (mounted) {
        setState(() {
          tickets = data['tickets'] as List? ?? [];
          error = null;
        });
      }
    } catch (e) {
      if (mounted) setState(() => error = e.toString());
    }
  }

  Future<void> create() async {
    if (busy) return;
    setState(() => busy = true);
    try {
      if (appVersion == 'wird geladen') await _loadAppVersion();
      await widget.api.post('/api/support/tickets', {
        'subject': subject.text.trim(),
        'message': description.text.trim(),
        'appVersion': appVersion,
        'platform': platform,
        'buildMode': buildMode,
        if (widget.eventId != null) 'eventId': widget.eventId,
      }, bearer: widget.helperToken);
      subject.clear();
      description.clear();
      await load();
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(const SnackBar(content: Text('Ticket wurde erstellt.')));
      }
    } catch (e) {
      if (mounted) setState(() => error = e.toString());
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> openTicket(String id) async {
    try {
      final data = await widget.api.get(
        '/api/support/tickets/${Uri.encodeComponent(id)}$query',
        bearer: widget.helperToken,
      );
      if (!mounted) return;
      final ticket = data['ticket'] as Map<String, dynamic>,
          messages = data['messages'] as List? ?? [];
      final answer = TextEditingController();
      await showDialog<void>(
        context: context,
        builder: (dialogContext) => StatefulBuilder(
          builder: (dialogContext, setDialog) => AlertDialog(
            title: Text(ticket['subject']?.toString() ?? 'Ticket'),
            content: SizedBox(
              width: 500,
              child: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Status: ${_status(ticket['status']?.toString())}'),
                    const SizedBox(height: 12),
                    ...messages.map((item) {
                      final row = item as Map<String, dynamic>;
                      return Card(
                        child: Padding(
                          padding: const EdgeInsets.all(12),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                row['authorType'] == 'support'
                                    ? 'Support'
                                    : 'Du',
                                style: const TextStyle(
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                              const SizedBox(height: 4),
                              Text(row['body']?.toString() ?? ''),
                            ],
                          ),
                        ),
                      );
                    }),
                    if (ticket['status'] != 'resolved')
                      TextField(
                        controller: answer,
                        maxLines: 3,
                        maxLength: 4000,
                        decoration: const InputDecoration(labelText: 'Antwort'),
                      ),
                  ],
                ),
              ),
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(dialogContext),
                child: const Text('Schließen'),
              ),
              if (ticket['status'] != 'resolved')
                FilledButton(
                  onPressed: () async {
                    if (answer.text.trim().length < 2) return;
                    try {
                      await widget.api.post(
                        '/api/support/tickets/${Uri.encodeComponent(id)}',
                        {
                          'message': answer.text.trim(),
                          if (widget.eventId != null) 'eventId': widget.eventId,
                        },
                        bearer: widget.helperToken,
                      );
                      if (dialogContext.mounted) Navigator.pop(dialogContext);
                      await load();
                    } catch (e) {
                      if (dialogContext.mounted) {
                        ScaffoldMessenger.of(
                          dialogContext,
                        ).showSnackBar(SnackBar(content: Text('$e')));
                      }
                    }
                  },
                  child: const Text('Antwort senden'),
                ),
            ],
          ),
        ),
      );
      answer.dispose();
    } catch (e) {
      if (mounted) setState(() => error = e.toString());
    }
  }

  String _status(String? value) => switch (value) {
    'open' => 'Offen',
    'in_progress' => 'In Bearbeitung',
    'resolved' => 'Erledigt',
    _ => 'Unbekannt',
  };

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Support & Tickets')),
    body: ListView(
      padding: const EdgeInsets.all(18),
      children: [
        if (!authorized)
          const Card(
            child: Padding(
              padding: EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Bitte melde dich an oder scanne zuerst den Event-QR-Code. Danach kannst du ein Support-Ticket erstellen.',
                  ),
                  SizedBox(height: 8),
                  SelectableText('Ohne Zugang: info_ra@rescueed.de'),
                ],
              ),
            ),
          ),
        if (authorized) ...[
          Text(
            'Fehler oder Frage melden',
            style: Theme.of(context).textTheme.titleLarge,
          ),
          const SizedBox(height: 6),
          Text(
            'An das Ticket werden App-Version $appVersion, Plattform ${_platformLabel(platform)} und Ausführungsmodus $buildMode angehängt. Keine Gerätekennung, Zugangsdaten oder Sicherheitscodes.',
            style: const TextStyle(fontSize: 12, color: Colors.blueGrey),
          ),
          const SizedBox(height: 8),
          const Card(
            child: Padding(
              padding: EdgeInsets.all(12),
              child: Text(
                'Zusätzlich melden Release-Versionen unbehandelte App-Abstürze getrennt vom Ticket. Dabei kommen Plattform, App-Version, Fehlerart und ein gekürzter technischer Stack an. Diese Absturzberichte enthalten keine Konto-ID, Gerätekennung, Fehlermeldung oder Zugangsdaten.',
                style: TextStyle(fontSize: 12),
              ),
            ),
          ),
          const SizedBox(height: 10),
          TextField(
            controller: subject,
            maxLength: 120,
            decoration: const InputDecoration(labelText: 'Betreff'),
          ),
          const SizedBox(height: 10),
          TextField(
            controller: description,
            maxLines: 5,
            maxLength: 4000,
            decoration: const InputDecoration(
              labelText: 'Beschreibung',
              helperText:
                  'Bitte keine Passwörter, Sicherheitscodes oder Patientendaten eingeben.',
            ),
          ),
          const SizedBox(height: 10),
          FilledButton.icon(
            onPressed: busy ? null : create,
            icon: const Icon(Icons.send_outlined),
            label: Text(busy ? 'Wird gesendet …' : 'Ticket erstellen'),
          ),
          const SizedBox(height: 24),
          Row(
            children: [
              Expanded(
                child: Text(
                  'Meine Tickets',
                  style: Theme.of(context).textTheme.titleLarge,
                ),
              ),
              IconButton(
                onPressed: load,
                tooltip: 'Aktualisieren',
                icon: const Icon(Icons.refresh),
              ),
            ],
          ),
          if (tickets.isEmpty) const Text('Noch keine Tickets.'),
          ...tickets.map((item) {
            final ticket = item as Map<String, dynamic>;
            return Card(
              child: ListTile(
                title: Text(ticket['subject']?.toString() ?? ''),
                subtitle: Text(_status(ticket['status']?.toString())),
                trailing: const Icon(Icons.chevron_right),
                onTap: () => openTicket(ticket['id'].toString()),
              ),
            );
          }),
        ],
        if (error != null)
          Padding(
            padding: const EdgeInsets.only(top: 12),
            child: Text(error!, style: const TextStyle(color: Colors.red)),
          ),
      ],
    ),
  );
}

String _platformLabel(String value) => switch (value) {
  'android' => 'Android',
  'ios' => 'iOS',
  _ => 'Sonstige',
};
