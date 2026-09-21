import 'dart:convert';
import 'dart:io';

import 'package:path_provider/path_provider.dart';

import 'api.dart';

class LegalDocumentResult {
  const LegalDocumentResult(this.data, {required this.fromCache});

  final Map<String, dynamic> data;
  final bool fromCache;
}

class LegalDocuments {
  LegalDocuments(this.api, {LegalDocumentCache? cache})
    : cache = cache ?? LegalDocumentCache();

  final ApiClient api;
  final LegalDocumentCache cache;

  Future<LegalDocumentResult> publicDocument(String slug) =>
      _load('public_$slug', () => api.get('/api/legal-documents/$slug'));

  Future<LegalDocumentResult> consumerDocuments() => _load(
    'consumer_documents',
    () => api.get('/api/mobile/consumer/register'),
  );

  Future<LegalDocumentResult> organizationRegistrationDocuments() => _load(
    'organization_registration_documents',
    () => api.get('/api/register/legal'),
  );

  Future<LegalDocumentResult> reconfirmation() async {
    try {
      final data = await api.get('/api/legal/reconfirmation');
      final documents = data['documents'];
      if (documents is List) {
        await cache.write('organization_documents', {'documents': documents});
      }
      return LegalDocumentResult(data, fromCache: false);
    } catch (networkError) {
      final cached = await cache.read('organization_documents');
      if (cached == null) rethrow;
      return LegalDocumentResult({
        'available': true,
        'canConfirm': false,
        'documents': cached['documents'] ?? const [],
      }, fromCache: true);
    }
  }

  Future<LegalDocumentResult> _load(
    String cacheKey,
    Future<Map<String, dynamic>> Function() fetch,
  ) async {
    try {
      final data = await fetch();
      await cache.write(cacheKey, data);
      return LegalDocumentResult(data, fromCache: false);
    } catch (networkError) {
      final cached = await cache.read(cacheKey);
      if (cached == null) rethrow;
      return LegalDocumentResult(cached, fromCache: true);
    }
  }
}

class LegalDocumentCache {
  LegalDocumentCache({Future<Directory> Function()? directoryProvider})
    : _directoryProvider = directoryProvider ?? getApplicationSupportDirectory;

  static const _schemaVersion = 1;
  final Future<Directory> Function() _directoryProvider;

  Future<File> _file(String key) async {
    final base = await _directoryProvider();
    final directory = Directory('${base.path}${Platform.pathSeparator}legal');
    await directory.create(recursive: true);
    return File('${directory.path}${Platform.pathSeparator}$key.json');
  }

  Future<void> write(String key, Map<String, dynamic> payload) async {
    try {
      final file = await _file(key);
      await file.writeAsString(
        jsonEncode({
          'schema': _schemaVersion,
          'cachedAt': DateTime.now().toUtc().toIso8601String(),
          'payload': payload,
        }),
        flush: true,
      );
    } catch (_) {
      // A cache failure must never hide a successfully loaded legal document.
    }
  }

  Future<Map<String, dynamic>?> read(String key) async {
    try {
      final file = await _file(key);
      if (!await file.exists()) return null;
      final decoded = jsonDecode(await file.readAsString());
      if (decoded is! Map<String, dynamic> ||
          decoded['schema'] != _schemaVersion ||
          decoded['payload'] is! Map) {
        return null;
      }
      return Map<String, dynamic>.from(decoded['payload'] as Map);
    } catch (_) {
      return null;
    }
  }
}
