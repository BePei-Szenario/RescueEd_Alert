class AlarmTone {
  const AlarmTone(this.id, this.label, this.assetName);

  final String id;
  final String label;
  final String? assetName;

  bool get hasSound => assetName != null;
  String get channelId =>
      hasSound ? 'rescueed_sound_${id}_v1' : 'rescueed_alarms_vibration';
  String? get androidResource =>
      hasSound ? assetName!.replaceAll('.wav', '') : null;
}

const alarmTones = <AlarmTone>[
  AlarmTone('piep_piep', 'Piep-Piep', 'tone_piep_piep.wav'),
  AlarmTone('doodoo', 'Doo-Doo', 'tone_doodoo.wav'),
  AlarmTone('reverb', 'Reverb', 'tone_reverb.wav'),
  AlarmTone('sirene', 'Sirene', 'tone_sirene.wav'),
  AlarmTone('vollalarm', 'Vollalarm', 'tone_vollalarm.wav'),
  AlarmTone('vibration', 'Nur Vibration', null),
];

AlarmTone alarmToneFor(String? id) {
  final migrated = switch (id) {
    'signal' => 'piep_piep',
    'dringend' => 'vollalarm',
    _ => id,
  };
  return alarmTones.firstWhere(
    (tone) => tone.id == migrated,
    orElse: () => alarmTones.first,
  );
}
