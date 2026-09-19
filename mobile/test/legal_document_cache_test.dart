import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:rescueed_alert_app/legal_documents.dart';

void main() {
  test('Rechtstexte werden lokal gespeichert und wieder gelesen', () async {
    final directory = await Directory.systemTemp.createTemp('rescueed-legal-');
    addTearDown(() => directory.delete(recursive: true));
    final cache = LegalDocumentCache(directoryProvider: () async => directory);

    await cache.write('public_datenschutz', {
      'title': 'Datenschutzerklärung',
      'version': '2026-09-19',
      'content': 'Gespeicherte Fassung',
    });

    expect(await cache.read('public_datenschutz'), {
      'title': 'Datenschutzerklärung',
      'version': '2026-09-19',
      'content': 'Gespeicherte Fassung',
    });
  });

  test('ein beschädigter Cache wird nicht als Rechtstext verwendet', () async {
    final directory = await Directory.systemTemp.createTemp('rescueed-legal-');
    addTearDown(() => directory.delete(recursive: true));
    final cache = LegalDocumentCache(directoryProvider: () async => directory);
    final legalDirectory = Directory(
      '${directory.path}${Platform.pathSeparator}legal',
    );
    await legalDirectory.create();
    await File(
      '${legalDirectory.path}${Platform.pathSeparator}public_impressum.json',
    ).writeAsString('kein json');

    expect(await cache.read('public_impressum'), isNull);
  });
}
