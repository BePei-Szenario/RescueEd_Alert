import 'package:flutter_test/flutter_test.dart';
import 'package:rescueed_alert_app/alarm_tones.dart';

void main() {
  test('fünf integrierte Töne und Vibration sind auswählbar', () {
    expect(alarmTones.where((tone) => tone.hasSound), hasLength(5));
    expect(alarmTones.where((tone) => !tone.hasSound), hasLength(1));
    expect(alarmTones.map((tone) => tone.channelId).toSet(), hasLength(6));
  });

  test('alte Einstellungen werden auf integrierte Töne übertragen', () {
    expect(alarmToneFor('signal').id, 'piep_piep');
    expect(alarmToneFor('dringend').id, 'vollalarm');
    expect(alarmToneFor('vibration').id, 'vibration');
    expect(alarmToneFor('unbekannt').id, 'piep_piep');
  });
}
