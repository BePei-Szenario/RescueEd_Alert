import 'dart:async';
import 'package:flutter/material.dart';
import 'api.dart';
import 'alarm_monitor.dart';
import 'notifications.dart';
import 'session_store.dart';
import 'crash_reporting.dart';
import 'screens/helper_screen.dart';
import 'screens/home_screen.dart';
import 'screens/login_screen.dart';
import 'screens/owner_screen.dart';
import 'screens/qr_flow.dart';
import 'screens/consumer_register_screen.dart';
import 'screens/event_code_login_screen.dart';

void main() {
  runZonedGuarded(() async {
    WidgetsFlutterBinding.ensureInitialized();
    await CrashReporting.initialize();
    runApp(const RescueEdApp());
  }, (error, stack) => unawaited(CrashReporting.report(error, stack, 'zone')));
}

class RescueEdApp extends StatefulWidget {
  const RescueEdApp({super.key});
  @override
  State<RescueEdApp> createState() => _RescueEdAppState();
}

class _RescueEdAppState extends State<RescueEdApp> {
  final api = ApiClient(), store = SessionStore();
  final notifications = AlertNotifications();
  final navigatorKey = GlobalKey<NavigatorState>();
  bool loading = true;
  String mode = 'home';
  String? helperEventId, helperToken, eventAccessEventId;
  @override
  void initState() {
    super.initState();
    _restore();
  }

  Future<void> _restore() async {
    try {
      await notifications.initialize();
    } catch (_) {
      // The helper view reports whether Android alarm monitoring can start.
    }
    api.sessionCookie = await store.readOwnerSession();
    api.sessionCookieName = await store.readOwnerSessionCookieName();
    if (api.sessionCookie != null) {
      try {
        final profile = await api.get('/api/auth/me');
        if (mounted) {
          setState(() {
            final access = profile['eventAccess'] as Map<String, dynamic>?;
            eventAccessEventId = access?['eventId'] as String?;
            mode = eventAccessEventId != null
                ? 'eventAccess'
                : profile['accountType'] == 'consumer'
                ? 'consumer'
                : 'owner';
            loading = false;
          });
        }
        return;
      } catch (_) {
        api.sessionCookie = null;
        await store.clearOwnerSession();
      }
    }
    helperEventId = await store.readHelperEvent();
    helperToken = await store.readHelperToken();
    if (helperEventId != null && helperToken != null) {
      try {
        await api.get(
          '/api/mobile/session?eventId=${Uri.encodeComponent(helperEventId!)}',
          bearer: helperToken,
        );
        if (mounted) {
          setState(() {
            mode = 'helper';
            loading = false;
          });
        }
        return;
      } catch (_) {
        await store.clearHelperSession();
        helperEventId = null;
        helperToken = null;
      }
    }
    if (mounted) setState(() => loading = false);
  }

  Future<void> _ownerAuthenticated() async {
    if (api.sessionCookie == null) return;
    await store.saveOwnerSession(api.sessionCookie!);
    await store.saveOwnerSessionCookieName(api.sessionCookieName);
    final profile = await api.get('/api/auth/me');
    if (mounted) {
      setState(() {
        final access = profile['eventAccess'] as Map<String, dynamic>?;
        eventAccessEventId = access?['eventId'] as String?;
        mode = eventAccessEventId != null
            ? 'eventAccess'
            : profile['accountType'] == 'consumer'
            ? 'consumer'
            : 'owner';
      });
    }
  }

  Future<void> _ownerLogout() async {
    try {
      await api.post('/api/auth/logout', {});
    } catch (_) {}
    api.sessionCookie = null;
    api.sessionCookieName = 'rescueed_session';
    eventAccessEventId = null;
    await store.clearOwnerSession();
    if (mounted) setState(() => mode = 'home');
  }

  Future<void> _scan() async {
    final session = await navigatorKey.currentState?.push<HelperCredentials>(
      MaterialPageRoute(
        builder: (_) => QrAttendanceFlow(api: api, store: store),
      ),
    );
    if (session != null && mounted) {
      if (session.ended) {
        await _endHelper();
        return;
      }
      helperEventId = session.eventId;
      helperToken = session.token;
      setState(() => mode = 'helper');
    }
  }

  Future<void> _endHelper() async {
    await AlarmMonitor.stop();
    await notifications.clearAlarms();
    await store.clearHelperSession();
    helperEventId = null;
    helperToken = null;
    if (mounted) setState(() => mode = 'home');
  }

  @override
  Widget build(BuildContext context) => MaterialApp(
    navigatorKey: navigatorKey,
    debugShowCheckedModeBanner: false,
    title: 'RescueEd Alert',
    theme: ThemeData(
      colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xff146ee8)),
      scaffoldBackgroundColor: const Color(0xfff2f6fc),
      useMaterial3: true,
      appBarTheme: const AppBarTheme(
        backgroundColor: Color(0xff071f3e),
        foregroundColor: Colors.white,
      ),
      cardTheme: const CardThemeData(
        color: Colors.white,
        elevation: 0,
        margin: EdgeInsets.zero,
      ),
      inputDecorationTheme: InputDecorationTheme(
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
      ),
    ),
    home: loading
        ? const Scaffold(body: Center(child: CircularProgressIndicator()))
        : switch (mode) {
            'login' => LoginScreen(
              api: api,
              onBack: () => setState(() => mode = 'home'),
              onAuthenticated: _ownerAuthenticated,
            ),
            'consumerLogin' => LoginScreen(
              api: api,
              consumer: true,
              onBack: () => setState(() => mode = 'home'),
              onAuthenticated: _ownerAuthenticated,
            ),
            'consumerRegister' => ConsumerRegisterScreen(
              api: api,
              onBack: () => setState(() => mode = 'home'),
              onDone: () => setState(() => mode = 'consumerLogin'),
            ),
            'eventCodeLogin' => EventCodeLoginScreen(
              api: api,
              onBack: () => setState(() => mode = 'home'),
              onAuthenticated: _ownerAuthenticated,
            ),
            'owner' => OwnerScreen(api: api, onLogout: _ownerLogout),
            'consumer' => OwnerScreen(
              api: api,
              onLogout: _ownerLogout,
              consumer: true,
            ),
            'eventAccess' => OwnerEventScreen(
              api: api,
              eventId: eventAccessEventId!,
              onLogout: _ownerLogout,
            ),
            'helper' => HelperScreen(
              api: api,
              notifications: notifications,
              eventId: helperEventId!,
              helperToken: helperToken!,
              onSessionEnded: _endHelper,
            ),
            _ => HomeScreen(
              api: api,
              onLogin: () => setState(() => mode = 'login'),
              onScan: _scan,
              onConsumerLogin: () => setState(() => mode = 'consumerLogin'),
              onConsumerRegister: () =>
                  setState(() => mode = 'consumerRegister'),
              onCodeLogin: () => setState(() => mode = 'eventCodeLogin'),
            ),
          },
  );
}
