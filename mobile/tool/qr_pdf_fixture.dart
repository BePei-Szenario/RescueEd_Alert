import 'dart:io';
import 'package:rescueed_alert_app/attendance_qr_pdf.dart';

Future<void> main() async {
  final output = File('tmp/pdfs/rescueed-qr-fixture.pdf');
  await output.parent.create(recursive: true);
  await output.writeAsBytes(
    await createAttendanceQrPdf(
      eventName: 'Sanitätsdienst Grüne Wiese',
      eventDate: '16.09.2026',
      comeUrl:
          'https://alert-rescueed.de/event-attendance?eventId=fixture&mode=come&code=example-come',
      leaveUrl:
          'https://alert-rescueed.de/event-attendance?eventId=fixture&mode=leave&code=example-leave',
    ),
  );
  stdout.writeln(output.absolute.path);
}
