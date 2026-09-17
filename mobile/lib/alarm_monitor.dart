import 'dart:io';
import 'package:flutter/services.dart';

class AlarmMonitor {
  static const _channel = MethodChannel('de.rescueed.alert/monitor');

  static Future<bool> start({
    required String baseUrl,
    required String eventId,
    required String token,
    required String tone,
  }) async {
    if (!Platform.isAndroid) return false;
    await _channel.invokeMethod<void>('start', {
      'baseUrl': baseUrl,
      'eventId': eventId,
      'token': token,
      'tone': tone,
    });
    return true;
  }

  static Future<void> acknowledged(String alertId) async {
    if (Platform.isAndroid) {
      await _channel.invokeMethod<void>('acknowledged', {'alertId': alertId});
    }
  }

  static Future<void> stop() async {
    if (Platform.isAndroid) await _channel.invokeMethod<void>('stop');
  }
}
