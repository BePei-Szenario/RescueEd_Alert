import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:rescueed_alert_app/api.dart';
import 'package:rescueed_alert_app/session_store.dart';
import 'package:rescueed_alert_app/screens/event_code_login_screen.dart';
import 'package:rescueed_alert_app/screens/qr_flow.dart';

class LoginApi extends ApiClient {
  LoginApi(this.result);
  final Map<String, dynamic> result;
  String? submitted;
  @override
  Future<Map<String, dynamic>> loginWithEventCode(String code) async {
    submitted = code;
    return result;
  }
}

class MemoryStore extends SessionStore {
  String? event;
  String? token;
  @override
  Future<void> saveHelperSession(String eventId, String value) async {
    event = eventId;
    token = value;
  }
}

void main() {
  testWidgets(
    'Schichtnummer mit 0 und 1 bucht ohne QR ein und speichert Helfersitzung',
    (tester) async {
      final api = LoginApi({
        'flow': 'helper_checked_in',
        'eventId': 'event',
        'helperToken': 'token',
      });
      final store = MemoryStore();
      HelperCredentials? helper;
      var operatorLogin = false;
      await tester.pumpWidget(
        MaterialApp(
          home: EventCodeLoginScreen(
            api: api,
            store: store,
            onBack: () {},
            onAuthenticated: () async {
              operatorLogin = true;
            },
            onHelperAuthenticated: (value) async {
              helper = value;
            },
          ),
        ),
      );
      await tester.enterText(find.byType(TextField), '0102 0304');
      await tester.ensureVisible(find.text('Event öffnen'));
      await tester.tap(find.text('Event öffnen'));
      await tester.pumpAndSettle();
      expect(api.submitted, '01020304');
      expect(store.event, 'event');
      expect(store.token, 'token');
      expect(helper?.token, 'token');
      expect(operatorLogin, false);
    },
  );

  testWidgets('Freigabecode öffnet weiterhin den Bedienzugang', (tester) async {
    final api = LoginApi({'eventId': 'event', 'role': 'alarm_operator'});
    final store = MemoryStore();
    var operatorLogin = false;
    await tester.pumpWidget(
      MaterialApp(
        home: EventCodeLoginScreen(
          api: api,
          store: store,
          onBack: () {},
          onAuthenticated: () async {
            operatorLogin = true;
          },
          onHelperAuthenticated: (_) async {
            fail('Kein Helferlogin erwartet');
          },
        ),
      ),
    );
    await tester.enterText(find.byType(TextField), 'alarm2cd');
    await tester.ensureVisible(find.text('Event öffnen'));
    await tester.tap(find.text('Event öffnen'));
    await tester.pumpAndSettle();
    expect(api.submitted, 'ALARM2CD');
    expect(operatorLogin, true);
    expect(store.token, null);
  });
}
