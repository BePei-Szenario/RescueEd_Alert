import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../api.dart';

class EventAccessCodeCreate extends StatefulWidget {
  const EventAccessCodeCreate({
    super.key,
    required this.api,
    required this.eventId,
    required this.existingRoles,
    required this.onCreated,
  });
  final ApiClient api;
  final String eventId;
  final Set<String> existingRoles;
  final Future<void> Function() onCreated;

  @override
  State<EventAccessCodeCreate> createState() => _EventAccessCodeCreateState();
}

class _EventAccessCodeCreateState extends State<EventAccessCodeCreate> {
  static const roles = {
    'helper_attendance': 'Helferlogin',
    'helper_recorder': 'Nur Helfererfassung',
    'alarm_operator': 'Nur Alarmierungsplattform',
    'event_manager': 'Alarmierung mit Verwaltung',
  };
  final Map<String, String> created = {};
  bool busy = false;
  String? error;

  Future<void> create(String role) async {
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final result = await widget.api.post(
        '/api/events/${Uri.encodeComponent(widget.eventId)}/access-codes',
        {'role': role},
      );
      if (!mounted) return;
      setState(() {
        created[role] = result['code'] as String;
      });
      await widget.onCreated();
    } catch (e) {
      if (mounted) {
        setState(() {
          error = e.toString();
        });
      }
    } finally {
      if (mounted) {
        setState(() {
          busy = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final missing = roles.entries.where(
      (entry) =>
          !widget.existingRoles.contains(entry.key) &&
          !created.containsKey(entry.key),
    );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SizedBox(height: 16),
        const Text(
          'Zugangscode ergänzen',
          style: TextStyle(fontWeight: FontWeight.bold),
        ),
        const Text(
          'Gültig bis zum Eventende. Bestehende Codes und angemeldete Helfer bleiben unverändert.',
        ),
        for (final entry in created.entries)
          ListTile(
            title: Text(roles[entry.key]!),
            subtitle: SelectableText(entry.value),
            trailing: IconButton(
              tooltip: 'Code kopieren',
              icon: const Icon(Icons.copy),
              onPressed: () =>
                  Clipboard.setData(ClipboardData(text: entry.value)),
            ),
          ),
        for (final entry in missing)
          TextButton.icon(
            onPressed: busy ? null : () => create(entry.key),
            icon: const Icon(Icons.add),
            label: Text('${entry.value}: Code erstellen'),
          ),
        if (missing.isEmpty)
          const Text('Für alle Zugangsarten sind bereits Codes vorhanden.'),
        if (busy) const LinearProgressIndicator(),
        if (error != null)
          Text(
            error!,
            style: TextStyle(color: Theme.of(context).colorScheme.error),
          ),
      ],
    );
  }
}
