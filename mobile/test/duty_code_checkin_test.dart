import 'package:flutter_test/flutter_test.dart';
import 'package:rescueed_alert_app/api.dart';
import 'package:rescueed_alert_app/screens/qr_flow.dart';

void main() {
  test('unvollständige Dienstcodes werden vor dem Versand abgewiesen', () {
    for (final code in ['', '1234567', '123456789']) {
      expect(
        () => buildComeAttendancePayload(
          useDutyCode: true,
          scannedOnDevice: true,
          dutyCode: code,
          firstName: '',
          lastName: '',
          qualification: '',
          phone: '',
        ),
        throwsA(isA<ApiException>()),
      );
    }
  });

  test(
    'Dienstcode-Check-in übergibt Event und QR-Code an die Attendance-API',
    () async {
      final api = RecordingApi();
      await api.submitAttendance(
        Uri.parse(
          'https://alert-rescueed.de/event-attendance?eventId=event-1&code=qr-token&mode=come',
        ),
        {'checkInMethod': 'duty-code', 'dutyCode': '12345678'},
      );
      expect(api.path, '/api/attendance');
      expect(api.body, {
        'eventId': 'event-1',
        'code': 'qr-token',
        'action': 'come',
        'checkInMethod': 'duty-code',
        'dutyCode': '12345678',
      });
    },
  );

  test('QR-Abmeldung verwendet die bestehende Helfersitzung', () async {
    final api = RecordingApi();
    await api.submitAttendance(
      Uri.parse(
        'https://alert-rescueed.de/event-attendance?eventId=event-1&code=leave-token&mode=leave',
      ),
      {'helperToken': 'helper-session'},
    );
    expect(api.path, '/api/attendance');
    expect(api.body, {
      'eventId': 'event-1',
      'code': 'leave-token',
      'action': 'leave',
      'helperToken': 'helper-session',
    });
  });

  test(
    'Dienstcode wird normalisiert und nur nach lokalem QR-Scan akzeptiert',
    () {
      expect(normalizePersonalDutyCode('1234 5678'), '12345678');
      expect(
        () => buildComeAttendancePayload(
          useDutyCode: true,
          scannedOnDevice: false,
          dutyCode: '1234 5678',
          firstName: '',
          lastName: '',
          qualification: '',
          phone: '',
        ),
        throwsA(isA<ApiException>()),
      );
      expect(
        buildComeAttendancePayload(
          useDutyCode: true,
          scannedOnDevice: true,
          dutyCode: '1234 5678',
          firstName: '',
          lastName: '',
          qualification: '',
          phone: '',
        ),
        {'checkInMethod': 'duty-code', 'dutyCode': '12345678'},
      );
    },
  );

  test('spontaner Check-in bleibt ohne Dienstcode möglich', () {
    expect(
      buildComeAttendancePayload(
        useDutyCode: false,
        scannedOnDevice: true,
        dutyCode: '',
        firstName: '  Erika ',
        lastName: ' Muster ',
        qualification: ' Sanitäterin ',
        phone: '',
      ),
      {
        'checkInMethod': 'spontaneous',
        'firstName': 'Erika',
        'lastName': 'Muster',
        'qualification': 'Sanitäterin',
        'phone': '',
      },
    );
  });
}

class RecordingApi extends ApiClient {
  String? path;
  Map<String, dynamic>? body;

  @override
  Future<Map<String, dynamic>> post(
    String path,
    Map<String, dynamic> body, {
    String? bearer,
  }) async {
    this.path = path;
    this.body = body;
    return {'ok': true};
  }
}
