import 'dart:async';
import 'package:audioplayers/audioplayers.dart';
import 'package:flutter/material.dart';
import '../alarm_tones.dart';
import '../app_version.dart';
import '../session_store.dart';

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  final store = SessionStore();
  final player = AudioPlayer();
  String selectedId = alarmTones.first.id;
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
    if (mounted) {
      setState(() {
        selectedId = saved;
        loading = false;
      });
    }
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
            padding: const EdgeInsets.all(18),
            children: [
              Text(
                'Alarmton auswählen',
                style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                  fontWeight: FontWeight.w900,
                ),
              ),
              const SizedBox(height: 8),
              const Text(
                'Wähle einen Ton für Alarmierungen deines Sanitätsmittels. Die Auswahl gilt nur für dieses Handy.',
              ),
              const SizedBox(height: 18),
              ...alarmTones.map(
                (tone) => Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: Card(
                    child: ListTile(
                      selected: selectedId == tone.id,
                      leading: Icon(
                        selectedId == tone.id
                            ? Icons.radio_button_checked
                            : Icons.radio_button_unchecked,
                      ),
                      title: Text(tone.label),
                      subtitle: tone.hasSound
                          ? const Text('In der App enthaltener Alarmton')
                          : const Text('Ohne Ton, nur Vibration'),
                      trailing: tone.hasSound
                          ? IconButton(
                              tooltip: '${tone.label} anhören',
                              onPressed: () => _preview(tone),
                              icon: const Icon(Icons.play_arrow),
                            )
                          : null,
                      onTap: () => _select(tone),
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 8),
              const Text(
                'Hinweis: Benachrichtigungen müssen in den Handy-Einstellungen für RescueEd Alert erlaubt sein. Stummmodus und „Nicht stören“ können die Wiedergabe beeinflussen.',
                style: TextStyle(color: Colors.blueGrey),
              ),
              const SizedBox(height: 24),
              const Center(child: AppVersion()),
            ],
          ),
  );
}
