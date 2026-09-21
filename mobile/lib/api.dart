import 'dart:convert';
import 'package:http/http.dart' as http;

const defaultApiUrl = String.fromEnvironment(
  'RESCUEED_API_URL',
  defaultValue: 'https://alert-rescueed.de',
);

class ApiException implements Exception {
  ApiException(this.message, this.statusCode);
  final String message;
  final int statusCode;
  @override
  String toString() => message;
}

class ApiClient {
  ApiClient({String? baseUrl})
    : baseUrl = (baseUrl ?? defaultApiUrl).replaceAll(RegExp(r'/$'), '');
  final String baseUrl;
  String? sessionCookie;
  String sessionCookieName = 'rescueed_session';

  Map<String, String> _headers({String? bearer}) => {
    'accept': 'application/json',
    'content-type': 'application/json',
    'x-rescueed-client': 'mobile',
    if (sessionCookie != null) 'cookie': '$sessionCookieName=$sessionCookie',
    if (bearer != null) 'authorization': 'Bearer $bearer',
  };

  Future<Map<String, dynamic>> get(String path, {String? bearer}) async =>
      _decode(
        await http.get(
          Uri.parse('$baseUrl$path'),
          headers: _headers(bearer: bearer),
        ),
      );

  Future<Map<String, dynamic>> post(
    String path,
    Map<String, dynamic> body, {
    String? bearer,
  }) async => _decode(
    await http.post(
      Uri.parse('$baseUrl$path'),
      headers: _headers(bearer: bearer),
      body: jsonEncode(body),
    ),
  );

  Future<Map<String, dynamic>> patch(
    String path,
    Map<String, dynamic> body, {
    String? bearer,
  }) async => _decode(
    await http.patch(
      Uri.parse('$baseUrl$path'),
      headers: _headers(bearer: bearer),
      body: jsonEncode(body),
    ),
  );

  Future<Map<String, dynamic>> delete(
    String path, {
    Map<String, dynamic> body = const {},
  }) async => _decode(
    await http.delete(
      Uri.parse('$baseUrl$path'),
      headers: _headers(),
      body: jsonEncode(body),
    ),
  );

  Future<LoginChallenge> login(
    String email,
    String password, {
    bool consumer = false,
  }) async {
    final data = await post('/api/auth/login', {
      'email': email,
      'password': password,
      'area': consumer ? 'mobile_consumer' : 'customer',
    });
    return LoginChallenge(
      data['challenge'] as String,
      data['previewCode'] as String?,
    );
  }

  Future<Map<String, dynamic>> verifyCode(String challenge, String code) async {
    final response = await http.post(
      Uri.parse('$baseUrl/api/auth/mfa/verify'),
      headers: _headers(),
      body: jsonEncode({'challenge': challenge, 'code': code}),
    );
    final cookie = response.headers['set-cookie'];
    final match = cookie == null
        ? null
        : RegExp(r'rescueed_session=([^;]+)').firstMatch(cookie);
    if (match != null) {
      sessionCookie = match.group(1);
      sessionCookieName = 'rescueed_session';
    }
    return _decode(response);
  }

  Future<Map<String, dynamic>> loginWithEventCode(String code) async {
    final response = await http.post(
      Uri.parse('$baseUrl/api/auth/event-code'),
      headers: _headers(),
      body: jsonEncode({'code': code}),
    );
    final cookie = response.headers['set-cookie'];
    final match = cookie == null
        ? null
        : RegExp(r'rescueed_event_session=([^;]+)').firstMatch(cookie);
    final data = _decode(response);
    if (match == null) {
      throw ApiException(
        'Der Event-Zugang konnte nicht gespeichert werden.',
        500,
      );
    }
    sessionCookie = match.group(1);
    sessionCookieName = 'rescueed_event_session';
    return data;
  }

  Future<Map<String, dynamic>> attendanceInfo(Uri qr) async {
    final query = qr.queryParameters;
    final uri = Uri.parse('$baseUrl/api/attendance').replace(
      queryParameters: {
        'eventId': query['eventId'] ?? '',
        'code': query['code'] ?? '',
        'mode': query['mode'] ?? 'come',
      },
    );
    return _decode(await http.get(uri, headers: _headers()));
  }

  Future<Map<String, dynamic>> submitAttendance(
    Uri qr,
    Map<String, dynamic> values,
  ) {
    final query = qr.queryParameters;
    return post('/api/attendance', {
      'eventId': query['eventId'],
      'code': query['code'],
      'action': query['mode'] == 'leave' ? 'leave' : 'come',
      ...values,
    });
  }

  Map<String, dynamic> _decode(http.Response response) {
    Map<String, dynamic> data = {};
    try {
      final decoded = jsonDecode(utf8.decode(response.bodyBytes));
      if (decoded is Map<String, dynamic>) data = decoded;
    } catch (_) {}
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw ApiException(
        data['error'] as String? ?? 'Die Anfrage ist fehlgeschlagen.',
        response.statusCode,
      );
    }
    return data;
  }
}

class LoginChallenge {
  const LoginChallenge(this.challenge, this.previewCode);
  final String challenge;
  final String? previewCode;
}
