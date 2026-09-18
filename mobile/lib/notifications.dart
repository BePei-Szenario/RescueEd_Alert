import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'alarm_tones.dart';

class AlertNotifications {
  final FlutterLocalNotificationsPlugin _plugin =
      FlutterLocalNotificationsPlugin();
  final Map<String, int> _shown = {};
  int _nextId = 9000;

  Future<void> initialize() async {
    const android = AndroidInitializationSettings('@mipmap/ic_launcher');
    const ios = DarwinInitializationSettings();
    await _plugin.initialize(
      const InitializationSettings(android: android, iOS: ios),
    );
    final androidPlugin = _plugin
        .resolvePlatformSpecificImplementation<
          AndroidFlutterLocalNotificationsPlugin
        >();
    for (final tone in alarmTones) {
      await androidPlugin?.createNotificationChannel(
        AndroidNotificationChannel(
          tone.channelId,
          'Alarmierungen – ${tone.label}',
          description: 'RescueEd-Alarmton ${tone.label}',
          importance: Importance.max,
          playSound: tone.hasSound,
          sound: tone.androidResource == null
              ? null
              : RawResourceAndroidNotificationSound(tone.androidResource),
          enableVibration: true,
        ),
      );
    }
    await androidPlugin?.requestNotificationsPermission();
    await _plugin
        .resolvePlatformSpecificImplementation<
          IOSFlutterLocalNotificationsPlugin
        >()
        ?.requestPermissions(alert: true, badge: true, sound: true);
  }

  Future<void> showAlarm({
    required String alertId,
    String tone = 'piep_piep',
  }) async {
    final selected = alarmToneFor(tone);
    final android = AndroidNotificationDetails(
      selected.channelId,
      'Alarmierungen – ${selected.label}',
      channelDescription: 'RescueEd-Alarmton ${selected.label}',
      importance: Importance.max,
      priority: Priority.max,
      category: AndroidNotificationCategory.alarm,
      visibility: NotificationVisibility.public,
      playSound: selected.hasSound,
      sound: selected.androidResource == null
          ? null
          : RawResourceAndroidNotificationSound(selected.androidResource),
      enableVibration: true,
    );
    final ios = DarwinNotificationDetails(
      presentAlert: true,
      presentBadge: true,
      presentSound: selected.hasSound,
      sound: selected.assetName,
      interruptionLevel: InterruptionLevel.timeSensitive,
    );
    final notificationId = _shown.putIfAbsent(alertId, () => _nextId++);
    await _plugin.show(
      notificationId,
      'RescueEd Alert · ALARM',
      'Neue Alarmierung. Details nach dem Entsperren in der App.',
      NotificationDetails(android: android, iOS: ios),
    );
  }

  Future<void> cancelAlarm(String alertId) async {
    final notificationId = _shown.remove(alertId);
    if (notificationId != null) await _plugin.cancel(notificationId);
  }

  Future<void> clearAlarms() async {
    for (final alertId in _shown.keys.toList()) {
      await cancelAlarm(alertId);
    }
  }
}
