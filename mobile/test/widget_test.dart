import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:rescueed_alert_app/api.dart';
import 'package:rescueed_alert_app/screens/home_screen.dart';
import 'package:rescueed_alert_app/screens/login_screen.dart';
import 'package:rescueed_alert_app/screens/registration_choice_screen.dart';
import 'package:rescueed_alert_app/screens/event_create_screen.dart';
import 'package:rescueed_alert_app/screens/consumer_subscription_screen.dart';

class _SubscriptionApi extends ApiClient {
  _SubscriptionApi({this.malformedRequest = false});

  final bool malformedRequest;
  bool withdrawn = false;

  @override
  Future<Map<String, dynamic>> get(String path, {String? bearer}) async {
    return switch (path) {
      '/api/mobile/consumer/subscription' => {'active': true},
      '/api/mobile/consumer/withdrawal' => {
        'eligible': !malformedRequest && !withdrawn,
        'eligibleUntil': '2026-10-01T10:15:00.000Z',
        'store': 'google',
        'productId': 'rescueed_private_monthly',
        'request': malformedRequest
            ? {'requestedAt': 123, 'status': null}
            : withdrawn
            ? {'requestedAt': '2026-09-24T10:20:00.000Z', 'status': 'received'}
            : null,
      },
      _ => throw StateError('Unerwarteter Testpfad: $path'),
    };
  }

  @override
  Future<Map<String, dynamic>> post(
    String path,
    Map<String, dynamic> body, {
    String? bearer,
  }) async {
    if (path != '/api/mobile/consumer/withdrawal' ||
        body['confirmed'] != true) {
      throw StateError('Unerwarteter Testaufruf: $path');
    }
    withdrawn = true;
    return {
      'ok': true,
      'status': 'received',
      'requestedAt': '2026-09-24T10:20:00.000Z',
    };
  }
}

void main() {
  testWidgets('Startseite bietet QR und gemeinsamen Login an', (tester) async {
    PackageInfo.setMockInitialValues(
      appName: 'RescueEd Alert',
      packageName: 'de.rescueed.alert',
      version: '1.0.3',
      buildNumber: '4',
      buildSignature: '',
    );
    await tester.pumpWidget(
      MaterialApp(
        home: HomeScreen(
          api: ApiClient(),
          onLogin: () {},
          onScan: () {},
          onRegister: () {},
          onCodeLogin: () {},
        ),
      ),
    );
    expect(find.text('RescueEd Alert'), findsOneWidget);
    expect(find.text('Event-QR-Code scannen'), findsOneWidget);
    expect(find.text('Anmelden'), findsOneWidget);
    expect(find.text('Hier können Sie sich registrieren'), findsOneWidget);
    expect(find.text('Codelogin für ein Event'), findsOneWidget);
    expect(find.text('Einstellungen'), findsNothing);
    expect(find.text('Impressum'), findsOneWidget);
    expect(find.text('DSGVO'), findsOneWidget);
    await tester.pumpAndSettle();
    expect(find.text('Version 1.0.3 · Build 4'), findsOneWidget);
  });

  testWidgets('Registrierung trennt Privatpersonen und Organisationen', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        home: RegistrationChoiceScreen(
          onBack: () {},
          onConsumer: () {},
          onOrganization: () {},
        ),
      ),
    );

    expect(find.text('Als Privatperson'), findsOneWidget);
    expect(
      find.text('B2C-AGB · Datenschutzerklärung · Widerrufsbelehrung'),
      findsOneWidget,
    );
    expect(find.text('Als Organisation'), findsOneWidget);
    expect(
      find.text('Organisations-AGB · Datenschutzerklärung · AVV · SLA'),
      findsOneWidget,
    );
  });

  testWidgets('Gemeinsames Login zeigt Passwort- und Registrierungslinks', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        home: LoginScreen(
          api: ApiClient(),
          onBack: () {},
          onAuthenticated: () async {},
          onForgotPassword: () {},
          onRegister: () {},
        ),
      ),
    );

    expect(
      find.text('Ein Login für Privatpersonen und Organisationen.'),
      findsOneWidget,
    );
    expect(find.text('Passwort vergessen?'), findsOneWidget);
    expect(find.text('Registrieren'), findsOneWidget);
  });

  testWidgets('Privates Event zeigt keine Organisationsgebühren', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(home: EventCreateScreen(api: ApiClient(), consumer: true)),
    );
    await tester.pump();

    expect(find.text('Privates Event erstellen'), findsOneWidget);
    expect(
      find.text(
        'Maximal 5 Tage pro Event. Das Event ist im aktiven Monatsabo enthalten.',
      ),
      findsOneWidget,
    );
    await tester.fling(find.byType(ListView), const Offset(0, -1200), 1800);
    await tester.pumpAndSettle();
    expect(
      find.text(
        'Im aktiven Monatsabo enthalten · keine zusätzliche Eventgebühr',
      ),
      findsOneWidget,
    );
    expect(find.textContaining('5-Tage-Tarif'), findsNothing);
    expect(find.text('0,00 €'), findsNothing);
    expect(find.text('Rechnungsdaten'), findsNothing);
    expect(find.textContaining('Zahlungspflichtig'), findsNothing);
  });

  testWidgets('Aktives Abo zeigt Kündigung und Widerruf ohne Renderfehler', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        home: ConsumerSubscriptionScreen(
          api: _SubscriptionApi(),
          userId: 'usr_test',
          onActive: () {},
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(tester.takeException(), isNull);
    expect(find.text('Abo verwalten'), findsOneWidget);
    expect(
      find.text('App-Abo aktiv · Neue Events sind im Abo enthalten.'),
      findsOneWidget,
    );
    expect(
      find.text('Abo kündigen oder bei Google Play verwalten'),
      findsOneWidget,
    );
    expect(find.text('Vertrag widerrufen'), findsOneWidget);
    expect(
      find.textContaining('Elektronischer Widerruf in der App bis'),
      findsOneWidget,
    );
  });

  testWidgets('Ungültige Widerrufsdaten lassen die Abo-Seite nicht abstürzen', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        home: ConsumerSubscriptionScreen(
          api: _SubscriptionApi(malformedRequest: true),
          userId: 'usr_test',
          onActive: () {},
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(tester.takeException(), isNull);
    expect(
      find.text('Widerruf eingegangen am – · Status: Unbekannt'),
      findsOneWidget,
    );
  });

  testWidgets('Widerruf wird bestätigt und anschließend angezeigt', (
    tester,
  ) async {
    final api = _SubscriptionApi();
    await tester.pumpWidget(
      MaterialApp(
        home: ConsumerSubscriptionScreen(
          api: api,
          userId: 'usr_test',
          onActive: () {},
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('Vertrag widerrufen'));
    await tester.pumpAndSettle();
    expect(find.text('Widerruf bestätigen'), findsOneWidget);

    await tester.tap(find.text('Widerruf bestätigen'));
    await tester.pumpAndSettle();
    expect(find.text('Widerruf eingegangen'), findsOneWidget);
    expect(api.withdrawn, isTrue);

    await tester.tap(find.text('OK'));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    expect(find.textContaining('Widerruf eingegangen am'), findsOneWidget);
    expect(find.textContaining('Status: Eingegangen'), findsOneWidget);
  });
}
