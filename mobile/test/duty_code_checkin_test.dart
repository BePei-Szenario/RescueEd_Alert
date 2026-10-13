import 'package:flutter_test/flutter_test.dart';
import 'package:rescueed_alert_app/api.dart';
import 'package:rescueed_alert_app/screens/qr_flow.dart';

void main() {
  test('Dienstcode wird normalisiert und nur nach lokalem QR-Scan akzeptiert', () {
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
  });

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
