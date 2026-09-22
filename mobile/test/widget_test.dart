import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:rescueed_alert_app/api.dart';
import 'package:rescueed_alert_app/screens/home_screen.dart';
import 'package:rescueed_alert_app/screens/login_screen.dart';
import 'package:rescueed_alert_app/screens/registration_choice_screen.dart';

void main() {
  testWidgets('Startseite bietet QR und gemeinsamen Login an', (tester) async {
    PackageInfo.setMockInitialValues(
      appName: 'RescueEd Alert',
      packageName: 'de.rescueed.alert',
      version: '1.0.2',
      buildNumber: '3',
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
    expect(find.text('Version 1.0.2 · Build 3'), findsOneWidget);
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
}
