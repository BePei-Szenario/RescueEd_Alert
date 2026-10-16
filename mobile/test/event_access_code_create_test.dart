import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:rescueed_alert_app/api.dart';
import 'package:rescueed_alert_app/widgets/event_access_code_create.dart';

class CodeApi extends ApiClient {
  int calls = 0;
  bool fail = false;
  @override
  Future<Map<String, dynamic>> post(
    String path,
    Map<String, dynamic> body, {
    String? bearer,
  }) async {
    calls++;
    expect(path, '/api/events/event/access-codes');
    expect(body, {'role': 'alarm_operator'});
    if (fail) {
      throw ApiException(
        'Nur der Event-Ersteller darf Zugangscodes erstellen.',
        403,
      );
    }
    return {'code': 'ABCDEFGH'};
  }
}

void main() {
  for (final fail in [false, true]) {
    testWidgets('missing role creation, failure=$fail', (tester) async {
      final api = CodeApi()..fail = fail;
      var refreshed = 0;
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: EventAccessCodeCreate(
              api: api,
              eventId: 'event',
              existingRoles: {
                'helper_attendance',
                'helper_recorder',
                'event_manager',
              },
              onCreated: () async {
                refreshed++;
              },
            ),
          ),
        ),
      );
      expect(find.text('Helferlogin: Code erstellen'), findsNothing);
      await tester.tap(find.text('Nur Alarmierungsplattform: Code erstellen'));
      await tester.pumpAndSettle();
      expect(api.calls, 1);
      expect(refreshed, fail ? 0 : 1);
      expect(find.text('ABCDEFGH'), fail ? findsNothing : findsOneWidget);
      if (fail) {
        expect(
          find.text('Nur der Event-Ersteller darf Zugangscodes erstellen.'),
          findsOneWidget,
        );
        expect(
          find.text('Nur Alarmierungsplattform: Code erstellen'),
          findsOneWidget,
        );
      } else {
        expect(
          find.text('Nur Alarmierungsplattform: Code erstellen'),
          findsNothing,
        );
        expect(find.byTooltip('Code kopieren'), findsOneWidget);
      }
    });
  }
}
