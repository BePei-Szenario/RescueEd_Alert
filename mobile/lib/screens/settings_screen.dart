import 'dart:async';

import 'package:audioplayers/audioplayers.dart';
import 'package:flutter/material.dart';

import '../alarm_tones.dart';
import '../api.dart';
import '../app_version.dart';
import '../session_store.dart';
import 'consumer_subscription_screen.dart';
import 'support_screen.dart';

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({
    super.key,
    this.api,
    this.eventId,
    this.helperToken,
    this.consumer = false,
  });
  final ApiClient? api;
  final String? eventId, helperToken;
  final bool consumer;

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  final store = SessionStore();
  final player = AudioPlayer();
  String selectedId = alarmTones.first.id;
  String? consumerUserId;
  bool? subscriptionActive;
  bool loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    unawaited(player.dispose());
    super.dispose();
  }

  Future<void> _load() async {
    final saved = await store.readAlarmTone();
    if (widget.consumer && widget.api != null) {
      try {
        final results = await Future.wait([
          widget.api!.get('/api/auth/me'),
          widget.api!.get('/api/mobile/consumer/subscription'),
        ]);
        consumerUserId = results[0]['id'] as String?;
        subscriptionActive = results[1]['active'] == true;
      } catch (_) {
        subscriptionActive = false;
      }
    }
    if (mounted) {
      setState(() {
        selectedId = saved;
        loading = false;
      });
    }
  }

  Future<void> _openSubscription() async {
    if (widget.api == null) return;
    if (consumerUserId == null) {
      await _load();
      if (!mounted) return;
      if (consumerUserId == null) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Das Privatkonto konnte nicht geladen werden.'),
          ),
        );
        return;
      }
    }
    await Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => ConsumerSubscriptionScreen(
          api: widget.api!,
          userId: consumerUserId!,
          onActive: () {
            if (mounted) Navigator.pop(context);
          },
        ),
      ),
    );
    await _load();
  }

  Future<void> _select(AlarmTone tone) async {
    await store.saveAlarmTone(tone.id);
    if (mounted) setState(() => selectedId = tone.id);
  }

  Future<void> _preview(AlarmTone tone) async {
    if (tone.assetName == null) return;
    try {
      await player.stop();
      await player.play(AssetSource('sounds/${tone.assetName}'));
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Ton konnte nicht abgespielt werden.')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Einstellungen')),
    body: loading
        ? const Center(child: CircularProgressIndicator())
        : ListView(
            padding: const EdgeInsets.all(16),
            children: [
              if (widget.consumer && widget.api != null)
                _SettingsCard(
                  icon: Icons.workspace_premium_outlined,
                  title: 'Monatsabo',
                  subtitle: subscriptionActive == true
                      ? 'Aktiv · Neue Events sind enthalten'
                      : 'Nicht aktiv · Neue Events sind gesperrt',
                  onTap: _openSubscription,
                ),
              if (widget.api != null)
                _SettingsCard(
                  icon: Icons.support_agent,
                  title: 'Support & Tickets',
                  subtitle:
                      'Fragen melden, Antworten lesen und technische Angaben prüfen',
                  onTap: () => Navigator.push(
                    context,
                    MaterialPageRoute(
                      builder: (_) => SupportScreen(
                        api: widget.api!,
                        eventId: widget.eventId,
                        helperToken: widget.helperToken,
                      ),
                    ),
                  ),
                ),
              Card(
                margin: const EdgeInsets.only(bottom: 10),
                clipBehavior: Clip.antiAlias,
                child: ExpansionTile(
                  leading: const Icon(Icons.volume_up_outlined),
                  title: const Text(
                    'Töne',
                    style: TextStyle(fontWeight: FontWeight.w800),
                  ),
                  subtitle: Text(
                    'Alarmton: ${alarmToneFor(selectedId).label}',
                    style: const TextStyle(fontSize: 12),
                  ),
                  childrenPadding: const EdgeInsets.fromLTRB(8, 0, 8, 10),
                  children: [
                    const Padding(
                      padding: EdgeInsets.fromLTRB(12, 2, 12, 8),
                      child: Text(
                        'Die Auswahl gilt nur für dieses Handy. Benachrichtigungen müssen in den Handy-Einstellungen erlaubt sein.',
                        style: TextStyle(fontSize: 12, color: Colors.blueGrey),
                      ),
                    ),
                    RadioGroup<String>(
                      groupValue: selectedId,
                      onChanged: (value) {
                        if (value != null) _select(alarmToneFor(value));
                      },
                      child: Column(
                        children: alarmTones
                            .map(
                              (tone) => RadioListTile<String>(
                                dense: true,
                                value: tone.id,
                                title: Text(tone.label),
                                subtitle: Text(
                                  tone.hasSound
                                      ? 'In der App enthaltener Alarmton'
                                      : 'Ohne Ton, nur Vibration',
                                  style: const TextStyle(fontSize: 11),
                                ),
                                secondary: tone.hasSound
                                    ? IconButton(
                                        tooltip: '${tone.label} anhören',
                                        onPressed: () => _preview(tone),
                                        icon: const Icon(Icons.play_arrow),
                                      )
                                    : null,
                              ),
                            )
                            .toList(),
                      ),
                    ),
                    const Padding(
                      padding: EdgeInsets.fromLTRB(12, 4, 12, 2),
                      child: Text(
                        'Stummmodus und „Nicht stören“ können die Wiedergabe beeinflussen.',
                        style: TextStyle(fontSize: 11, color: Colors.blueGrey),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 14),
              const Center(child: AppVersion()),
            ],
          ),
  );
}

class _SettingsCard extends StatelessWidget {
  const _SettingsCard({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });
  final IconData icon;
  final String title, subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Card(
    margin: const EdgeInsets.only(bottom: 10),
    child: ListTile(
      dense: true,
      leading: Icon(icon),
      title: Text(title, style: const TextStyle(fontWeight: FontWeight.w800)),
      subtitle: Text(subtitle, style: const TextStyle(fontSize: 12)),
      trailing: const Icon(Icons.chevron_right),
      onTap: onTap,
    ),
  );
}
