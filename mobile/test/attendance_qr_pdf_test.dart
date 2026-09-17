import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:rescueed_alert_app/attendance_qr_pdf.dart';

void main() {
  test('Kommen und Gehen erzeugen ein PDF', () async {
    final bytes = await createAttendanceQrPdf(
      eventName: 'Stadtfest Musterstadt',
      eventDate: '16.09.2026',
      comeUrl:
          'https://alert-rescueed.de/event-attendance?eventId=demo&mode=come&code=abc',
      leaveUrl:
          'https://alert-rescueed.de/event-attendance?eventId=demo&mode=leave&code=def',
    );
    expect(utf8.decode(bytes.take(4).toList()), '%PDF');
    expect(bytes.length, greaterThan(1000));
  });

  test('ohne ausgewählten QR-Code wird kein PDF erzeugt', () async {
    await expectLater(
      createAttendanceQrPdf(
        eventName: 'Test',
        eventDate: '16.09.2026',
        comeUrl: 'come',
        leaveUrl: 'leave',
        includeCome: false,
        includeLeave: false,
      ),
      throwsArgumentError,
    );
  });
}
