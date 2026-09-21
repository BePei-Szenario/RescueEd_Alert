import 'dart:async';
import 'dart:io';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'api.dart';
import 'notifications.dart';
import 'push_config.dart';

@pragma('vm:entry-point')
Future<void> rescueEdFirebaseBackgroundHandler(RemoteMessage message) async {
  await initializeRescueEdFirebase();
}

class PushNotifications {
  PushNotifications(this.api, this.notifications);
  final ApiClient api;
  final AlertNotifications notifications;
  StreamSubscription<String>? _refresh;
  StreamSubscription<RemoteMessage>? _foreground;
  bool initialized = false;
  String? _eventId, _helperToken, _tone;

  static Future<bool> initializeFirebase() async {
    if (!await initializeRescueEdFirebase()) return false;
    FirebaseMessaging.onBackgroundMessage(rescueEdFirebaseBackgroundHandler);
    return true;
  }

  Future<bool> registerHelper({
    required String eventId,
    required String helperToken,
    required String alarmTone,
  }) async {
    if (!await initializeFirebase()) return false;
    _eventId = eventId;
    _helperToken = helperToken;
    _tone = alarmTone;
    final messaging = FirebaseMessaging.instance;
    final permission = await messaging.requestPermission(
      alert: true,
      badge: true,
      sound: true,
      criticalAlert: false,
      provisional: false,
    );
    if (permission.authorizationStatus == AuthorizationStatus.denied) {
      return false;
    }
    await messaging.setAutoInitEnabled(true);
    await messaging.setForegroundNotificationPresentationOptions(
      alert: false,
      badge: true,
      sound: false,
    );
    final token = await messaging.getToken();
    if (token == null || token.isEmpty) return false;
    await _sendToken(token);
    await _refresh?.cancel();
    _refresh = messaging.onTokenRefresh.listen((token) async {
      try {
        await _sendToken(token);
      } catch (_) {
        // The polling fallback remains active and a later app start retries.
      }
    });
    await _foreground?.cancel();
    _foreground = FirebaseMessaging.onMessage.listen((message) async {
      final alertId = message.data['alertId'];
      if (message.data['type'] != 'alarm' || alertId == null) return;
      // Android's foreground alarm service owns the looping signal. On iOS,
      // show the same neutral local notification while the app is visible.
      if (Platform.isIOS) {
        await notifications.showAlarm(
          alertId: alertId,
          tone: _tone ?? alarmTone,
        );
      }
    });
    initialized = true;
    return true;
  }

  Future<void> _sendToken(String token) async {
    final eventId = _eventId, helperToken = _helperToken;
    if (eventId == null || helperToken == null) return;
    await api.post('/api/mobile/push-device', {
      'eventId': eventId,
      'token': token,
      'platform': Platform.isIOS ? 'ios' : 'android',
      'alarmTone': _tone ?? 'piep_piep',
    }, bearer: helperToken);
  }

  Future<void> unregisterHelper() async {
    final eventId = _eventId, helperToken = _helperToken;
    if (eventId != null && helperToken != null) {
      try {
        await api.delete(
          '/api/mobile/push-device',
          body: {'eventId': eventId},
          bearer: helperToken,
        );
      } catch (_) {
        // Event expiry also removes the helper and cascades device records.
      }
    }
    await _refresh?.cancel();
    await _foreground?.cancel();
    _refresh = null;
    _foreground = null;
    _eventId = null;
    _helperToken = null;
    _tone = null;
    initialized = false;
    if (Firebase.apps.isNotEmpty) {
      try {
        await FirebaseMessaging.instance.deleteToken();
        await FirebaseMessaging.instance.setAutoInitEnabled(false);
      } catch (_) {}
    }
  }
}
