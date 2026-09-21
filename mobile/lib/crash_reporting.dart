import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:package_info_plus/package_info_plus.dart';

import 'api.dart';

class CrashReporting {
  static String _version = 'unknown';
  static bool _sending = false;

  static Future<void> initialize() async {
    if (kDebugMode) return;
    try {
      final info = await PackageInfo.fromPlatform();
      _version = '${info.version}+${info.buildNumber}';
    } catch (_) {}
    FlutterError.onError = (details) {
      FlutterError.presentError(details);
      unawaited(report(details.exception, details.stack, 'flutter'));
    };
    PlatformDispatcher.instance.onError = (error, stack) {
      unawaited(report(error, stack, 'platform'));
      return true;
    };
  }

  static Future<void> report(
    Object error,
    StackTrace? stack,
    String source,
  ) async {
    if (kDebugMode || _sending || !(Platform.isAndroid || Platform.isIOS))
      return;
    _sending = true;
    try {
      final uri = Uri.parse(
        '${defaultApiUrl.replaceAll(RegExp(r'/$'), '')}/api/mobile/crash-reports',
      );
      if (uri.scheme != 'https') return;
      await http
          .post(
            uri,
            headers: const {'content-type': 'application/json'},
            body: jsonEncode({
              'platform': Platform.isAndroid ? 'android' : 'ios',
              'appVersion': _version,
              'source': source,
              'errorKind': error.runtimeType.toString(),
              // No exception message, account ID, session cookie or device ID.
              'stack': stack?.toString() ?? '',
              'occurredAt': DateTime.now().toUtc().toIso8601String(),
            }),
          )
          .timeout(const Duration(seconds: 4));
    } catch (_) {
      // Telemetry must never cause a second crash.
    } finally {
      _sending = false;
    }
  }
}
