import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'alarm_tones.dart';

class SessionStore {
  static const _storage = FlutterSecureStorage(
    aOptions: AndroidOptions(encryptedSharedPreferences: true),
    iOptions: IOSOptions(
      accessibility: KeychainAccessibility.first_unlock_this_device,
    ),
  );

  Future<String?> readOwnerSession() => _storage.read(key: 'owner_session');
  Future<String> readOwnerSessionCookieName() async =>
      await _storage.read(key: 'owner_session_cookie_name') ??
      'rescueed_session';
  Future<void> saveOwnerSession(String value) =>
      _storage.write(key: 'owner_session', value: value);
  Future<void> saveOwnerSessionCookieName(String value) =>
      _storage.write(key: 'owner_session_cookie_name', value: value);
  Future<void> clearOwnerSession() async {
    await _storage.delete(key: 'owner_session');
    await _storage.delete(key: 'owner_session_cookie_name');
  }

  Future<String?> readHelperToken() => _storage.read(key: 'helper_token');
  Future<String?> readHelperEvent() => _storage.read(key: 'helper_event_id');
  Future<void> saveHelperSession(String eventId, String token) async {
    await _storage.write(key: 'helper_event_id', value: eventId);
    await _storage.write(key: 'helper_token', value: token);
  }

  Future<void> clearHelperSession() async {
    await _storage.delete(key: 'helper_event_id');
    await _storage.delete(key: 'helper_token');
  }

  Future<String> readAlarmTone() async =>
      alarmToneFor(await _storage.read(key: 'alarm_tone')).id;
  Future<void> saveAlarmTone(String value) =>
      _storage.write(key: 'alarm_tone', value: value);
}
