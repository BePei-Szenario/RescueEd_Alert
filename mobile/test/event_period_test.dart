import 'package:flutter_test/flutter_test.dart';
import 'package:rescueed_alert_app/event_period.dart';

void main() {
  test('same-day event works without initializing German locale data', () {
    expect(
      formatEventPeriod({
        'eventDate': '2026-10-16',
        'endDate': '2026-10-16',
        'startTime': '11:00',
        'endTime': '14:00',
      }),
      '16.10.2026 · 11:00–14:00 Uhr',
    );
  });
  test('multi-day event displays both dates', () {
    expect(
      formatEventPeriod({
        'eventDate': '2026-10-16',
        'endDate': '2026-10-18',
        'startTime': '11:00',
        'endTime': '14:00',
      }),
      '16.10.2026, 11:00 – 18.10.2026, 14:00 Uhr',
    );
  });
  test('missing end date falls back to start date', () {
    expect(
      formatEventPeriod({
        'eventDate': '2026-10-16',
        'startTime': '11:00',
        'endTime': '14:00',
      }),
      '16.10.2026 · 11:00–14:00 Uhr',
    );
  });
  test('missing or malformed data does not crash', () {
    expect(formatEventPeriod(null), '– · ––– Uhr');
    expect(formatEventPeriod({'eventDate': 'invalid'}), '– · ––– Uhr');
  });
}
