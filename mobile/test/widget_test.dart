import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:rescueed_alert_app/api.dart';
import 'package:rescueed_alert_app/screens/home_screen.dart';

void main() {
  testWidgets('Startseite bietet QR und Organisationslogin an', (tester) async {
    PackageInfo.setMockInitialValues(
      appName: 'RescueEd Alert',
      packageName: 'de.rescueed.alert',
      version: '1.0.1',
      buildNumber: '2',
      buildSignature: '',
    );
    await tester.pumpWidget(
      MaterialApp(
        home: HomeScreen(api: ApiClient(), onLogin: () {}, onScan: () {},onConsumerLogin:(){},onConsumerRegister:(){}),
      ),
    );
    expect(find.text('RescueEd Alert'), findsOneWidget);
    expect(find.text('Event-QR-Code scannen'), findsOneWidget);
    expect(find.text('Organisations-Login'), findsOneWidget);
    expect(find.text('Einstellungen'), findsOneWidget);
    expect(find.text('Impressum'), findsOneWidget);
    expect(find.text('DSGVO'), findsOneWidget);
    await tester.pumpAndSettle();
    expect(find.text('Version 1.0.1 · Build 2'), findsOneWidget);
  });
}
