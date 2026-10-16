import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:rescueed_alert_app/api.dart';
import 'package:rescueed_alert_app/safe_scaffold.dart';
import 'package:rescueed_alert_app/screens/login_screen.dart';

void main() {
  void configureView(
    WidgetTester tester, {
    double bottom = 48,
    double keyboard = 0,
    bool landscape = false,
  }) {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = landscape
        ? const Size(800, 400)
        : const Size(400, 800);
    tester.view.viewPadding = FakeViewPadding(
      top: 24,
      bottom: bottom,
      left: landscape ? 44 : 0,
    );
    tester.view.padding = FakeViewPadding(
      top: 24,
      bottom: keyboard == 0 ? bottom : 0,
      left: landscape ? 44 : 0,
    );
    tester.view.viewInsets = FakeViewPadding(bottom: keyboard);
    addTearDown(tester.view.reset);
  }

  for (final bottom in [24.0, 48.0]) {
    testWidgets(
      'content clears navigation inset $bottom without double padding',
      (tester) async {
        configureView(tester, bottom: bottom);
        await tester.pumpWidget(
          MaterialApp(
            home: SafeScaffold(
              appBar: AppBar(title: const Text('Event')),
              body: const SizedBox.expand(key: Key('content')),
              floatingActionButton: FloatingActionButton(
                onPressed: () {},
                child: const Icon(Icons.notifications),
              ),
            ),
          ),
        );
        expect(tester.getRect(find.byKey(const Key('content'))).top, 80);
        expect(
          tester.getRect(find.byKey(const Key('content'))).bottom,
          800 - bottom,
        );
        expect(
          tester.getRect(find.byType(FloatingActionButton)).bottom,
          lessThanOrEqualTo(800 - bottom),
        );
        expect(tester.takeException(), isNull);
      },
    );
  }

  testWidgets('landscape content clears side cutout and bottom navigation', (
    tester,
  ) async {
    configureView(tester, landscape: true);
    await tester.pumpWidget(
      MaterialApp(
        home: SafeScaffold(
          appBar: AppBar(title: const Text('QR-Code')),
          body: const SizedBox.expand(key: Key('content')),
        ),
      ),
    );
    final rect = tester.getRect(find.byKey(const Key('content')));
    expect(rect.left, 44);
    expect(rect.bottom, 352);
    expect(tester.takeException(), isNull);
  });

  testWidgets('keyboard resize does not add navigation padding a second time', (
    tester,
  ) async {
    configureView(tester, keyboard: 300);
    await tester.pumpWidget(
      MaterialApp(
        home: SafeScaffold(
          appBar: AppBar(title: const Text('Formular')),
          body: const SizedBox.expand(key: Key('content')),
        ),
      ),
    );
    expect(tester.getRect(find.byKey(const Key('content'))).bottom, 500);
    expect(tester.takeException(), isNull);
  });

  testWidgets(
    'login remains scrollable and registration reachable above keyboard',
    (tester) async {
      configureView(tester, keyboard: 300);
      var registered = false;
      await tester.pumpWidget(
        MaterialApp(
          home: LoginScreen(
            api: ApiClient(),
            onBack: () {},
            onAuthenticated: () async {},
            onForgotPassword: () {},
            onRegister: () {
              registered = true;
            },
          ),
        ),
      );
      await tester.ensureVisible(find.text('Registrieren'));
      await tester.pumpAndSettle();
      expect(
        tester.getRect(find.text('Registrieren')).bottom,
        lessThanOrEqualTo(500),
      );
      await tester.tap(find.text('Registrieren'));
      expect(registered, isTrue);
      expect(tester.takeException(), isNull);
    },
  );
}
