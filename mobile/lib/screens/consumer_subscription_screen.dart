import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:in_app_purchase/in_app_purchase.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';

import '../api.dart';
import '../legal_documents.dart';

const googleSubscriptionId = String.fromEnvironment('GOOGLE_SUBSCRIPTION_ID');
const appleSubscriptionId = String.fromEnvironment('APPLE_SUBSCRIPTION_ID');
const googlePackageName = String.fromEnvironment(
  'GOOGLE_PLAY_PACKAGE_NAME',
  defaultValue: 'de.rescueed.alert',
);

class ConsumerSubscriptionScreen extends StatefulWidget {
  const ConsumerSubscriptionScreen({
    super.key,
    required this.api,
    required this.userId,
    required this.onActive,
  });
  final ApiClient api;
  final String userId;
  final VoidCallback onActive;
  @override
  State<ConsumerSubscriptionScreen> createState() =>
      _ConsumerSubscriptionScreenState();
}

class _ConsumerSubscriptionScreenState
    extends State<ConsumerSubscriptionScreen> {
  final store = InAppPurchase.instance;
  final opened = <String>{};
  final acknowledged = <String>{};
  StreamSubscription<List<PurchaseDetails>>? purchases;
  ProductDetails? product;
  List<Map<String, dynamic>> documents = [];
  Map<String, dynamic>? withdrawal;
  bool loading = true;
  bool busy = false;
  bool active = false;
  bool documentsFromCache = false;
  String? error;

  String get productId =>
      Platform.isIOS ? appleSubscriptionId : googleSubscriptionId;
  String get storeName => Platform.isIOS ? 'apple' : 'google';
  String get storeAccountId =>
      Platform.isIOS && widget.userId.startsWith('usr_')
      ? widget.userId.substring(4)
      : widget.userId;

  @override
  void initState() {
    super.initState();
    purchases = store.purchaseStream.listen(
      _onPurchases,
      onError: (Object exception) {
        if (mounted) setState(() => error = exception.toString());
      },
    );
    _load();
  }

  @override
  void dispose() {
    purchases?.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final legal = await LegalDocuments(widget.api).consumerDocuments();
      documents = (legal.data['documents'] as List)
          .map((item) => Map<String, dynamic>.from(item as Map))
          .toList();
      documentsFromCache = legal.fromCache;
      final status = await widget.api.get('/api/mobile/consumer/subscription');
      active = status['active'] == true;
      try {
        withdrawal = await widget.api.get('/api/mobile/consumer/withdrawal');
      } catch (_) {
        withdrawal = null;
      }
      if (!active) {
        if (productId.isEmpty) {
          throw StateError(
            'Das Monatsabo ist im Store noch nicht eingerichtet. Bitte später erneut versuchen.',
          );
        }
        if (!await store.isAvailable()) {
          throw StateError(
            'Der App Store ist auf diesem Gerät nicht erreichbar.',
          );
        }
        final products = await store.queryProductDetails({productId});
        if (products.error != null) throw StateError(products.error!.message);
        if (products.productDetails.length != 1) {
          throw StateError('Das Monatsabo wurde im Store noch nicht gefunden.');
        }
        product = products.productDetails.single;
      }
    } catch (exception) {
      error = exception.toString();
    }
    if (mounted) setState(() => loading = false);
  }

  Future<void> _showDocument(Map<String, dynamic> document) async {
    await showDialog<void>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text('${document['title']} · ${document['version']}'),
        content: SizedBox(
          width: 520,
          child: SingleChildScrollView(
            child: SelectableText(document['content'] as String),
          ),
        ),
        actions: [
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext),
            child: const Text('OK'),
          ),
        ],
      ),
    );
    if (mounted) setState(() => opened.add(document['id'] as String));
  }

  Future<void> _onPurchases(List<PurchaseDetails> updates) async {
    for (final purchase in updates) {
      if (purchase.productID != productId) continue;
      if (purchase.status == PurchaseStatus.pending) {
        if (mounted) setState(() => busy = true);
        continue;
      }
      if (purchase.status == PurchaseStatus.error) {
        if (mounted) {
          setState(() {
            busy = false;
            error = purchase.error?.message ?? 'Kauf fehlgeschlagen.';
          });
        }
        continue;
      }
      if (purchase.status == PurchaseStatus.canceled) {
        if (mounted) setState(() => busy = false);
        continue;
      }
      if (purchase.status != PurchaseStatus.purchased &&
          purchase.status != PurchaseStatus.restored) {
        continue;
      }
      try {
        final reference = Platform.isIOS
            ? purchase.purchaseID
            : purchase.verificationData.serverVerificationData;
        if (reference == null || reference.isEmpty) {
          throw StateError('Store-Kaufreferenz fehlt.');
        }
        final result = await widget.api
            .post('/api/mobile/consumer/subscription', {
              'store': storeName,
              'reference': reference,
              'acceptedDocumentVersionIds': acknowledged.toList(),
            });
        if (result['active'] != true) {
          throw StateError(
            'Der Store hat noch kein aktives Abo bestätigt. Bitte nach Zahlungsabschluss erneut versuchen.',
          );
        }
        if (purchase.pendingCompletePurchase) {
          await store.completePurchase(purchase);
        }
        if (mounted) {
          setState(() {
            active = true;
            busy = false;
            error = null;
          });
        }
        widget.onActive();
      } catch (exception) {
        if (mounted) {
          setState(() {
            busy = false;
            error = exception.toString();
          });
        }
      }
    }
  }

  Future<void> _buy() async {
    if (product == null || documentsFromCache) return;
    if (acknowledged.length != documents.length) {
      setState(
        () => error =
            'Bitte alle aktuellen Rechtstexte öffnen und einzeln bestätigen.',
      );
      return;
    }
    setState(() {
      busy = true;
      error = null;
    });
    try {
      await store.buyNonConsumable(
        purchaseParam: PurchaseParam(
          productDetails: product!,
          applicationUserName: storeAccountId,
        ),
      );
    } catch (exception) {
      if (mounted) {
        setState(() {
          busy = false;
          error = exception.toString();
        });
      }
    }
  }

  Future<void> _restore() async {
    if (acknowledged.length != documents.length || documentsFromCache) {
      setState(
        () => error =
            'Bitte zuerst die aktuellen Rechtstexte öffnen und bestätigen.',
      );
      return;
    }
    await store.restorePurchases(applicationUserName: storeAccountId);
  }

  Future<void> _manageSubscription() async {
    final uri = Platform.isIOS
        ? Uri.parse('https://apps.apple.com/account/subscriptions')
        : Uri.parse(
            'https://play.google.com/store/account/subscriptions?package=$googlePackageName&sku=$googleSubscriptionId',
          );
    if (!await launchUrl(uri, mode: LaunchMode.externalApplication) &&
        mounted) {
      setState(() => error = 'Die Aboverwaltung konnte nicht geöffnet werden.');
    }
  }

  Future<void> _withdraw() async {
    final details = withdrawal;
    if (details == null || details['eligible'] != true) return;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        icon: const Icon(Icons.assignment_return_outlined, size: 42),
        title: const Text('Vertrag widerrufen'),
        content: Text(
          'Du widerrufst das private RescueEd Alert Monatsabo (${details['productId']}) über ${details['store']}. Der Eingang wird an die E-Mail-Adresse deines RescueEd-Kontos bestätigt.\n\nEine Kündigung zukünftiger Verlängerungen ist davon getrennt und erfolgt in der Store-Aboverwaltung.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('Abbrechen'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: const Text('Widerruf bestätigen'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    setState(() {
      busy = true;
      error = null;
    });
    try {
      await widget.api.post('/api/mobile/consumer/withdrawal', {
        'confirmed': true,
      });
      withdrawal = await widget.api.get('/api/mobile/consumer/withdrawal');
      if (mounted) {
        await showDialog<void>(
          context: context,
          builder: (dialogContext) => AlertDialog(
            icon: const Icon(Icons.mark_email_read_outlined, size: 42),
            title: const Text('Widerruf eingegangen'),
            content: const Text(
              'Dein Widerruf wurde mit Datum und Uhrzeit gespeichert. Eine Eingangsbestätigung wird per E-Mail versandt. Die Rückerstattung wird über den beim Kauf verwendeten Store bearbeitet.',
            ),
            actions: [
              FilledButton(
                onPressed: () => Navigator.pop(dialogContext),
                child: const Text('OK'),
              ),
            ],
          ),
        );
      }
    } catch (exception) {
      if (mounted) setState(() => error = exception.toString());
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  String _legalAction(String key) => switch (key) {
    'agb_b2c' => 'B2C-AGB akzeptieren',
    'datenschutz' => 'Datenschutzerklärung gelesen',
    'widerruf' => 'Widerrufsbelehrung gelesen',
    _ => 'Dokument bestätigen',
  };

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Abo verwalten')),
    body: ListView(
      padding: const EdgeInsets.all(20),
      children: [
        const Icon(
          Icons.verified_user_outlined,
          size: 56,
          color: Color(0xff146ee8),
        ),
        const SizedBox(height: 14),
        Text(
          'RescueEd Alert für Privatpersonen',
          style: Theme.of(context).textTheme.headlineSmall,
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 14),
        const Text(
          'Mit einem aktiven Abo kannst du in der App beliebig viele neue Events anlegen. Läuft das Abo aus, bleiben bereits gestartete Events nutzbar; neue Events sind gesperrt.',
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 20),
        if (loading) const Center(child: CircularProgressIndicator()),
        if (product != null && !active) ...[
          Card(
            child: Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                children: [
                  Text(
                    product!.title,
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                  const SizedBox(height: 8),
                  Text(
                    '${product!.price} pro Monat',
                    style: Theme.of(context).textTheme.headlineSmall,
                  ),
                  const SizedBox(height: 8),
                  const Text(
                    'Automatische monatliche Verlängerung bis zur Kündigung. Der im Store angezeigte Gesamtpreis ist maßgeblich.',
                    textAlign: TextAlign.center,
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 14),
          if (documentsFromCache)
            const Text(
              'Offline gespeicherte Rechtstexte. Ein Store-Kauf ist erst mit einer aktuellen Online-Fassung möglich.',
              style: TextStyle(color: Colors.orange),
            ),
          ...documents.map((document) {
            final id = document['id'] as String;
            final key = document['documentKey'] as String;
            return Column(
              children: [
                SizedBox(
                  width: double.infinity,
                  child: TextButton(
                    onPressed: () => _showDocument(document),
                    child: Text(
                      '${document['title']} öffnen · Version ${document['version']}',
                    ),
                  ),
                ),
                CheckboxListTile(
                  contentPadding: EdgeInsets.zero,
                  value: acknowledged.contains(id),
                  title: Text(_legalAction(key)),
                  subtitle: key == 'widerruf'
                      ? const Text(
                          'Dies ist kein Verzicht auf das Widerrufsrecht.',
                        )
                      : null,
                  onChanged: opened.contains(id)
                      ? (selected) => setState(() {
                          if (selected == true) {
                            acknowledged.add(id);
                          } else {
                            acknowledged.remove(id);
                          }
                        })
                      : null,
                ),
              ],
            );
          }),
          const SizedBox(height: 14),
          FilledButton(
            onPressed:
                busy ||
                    documentsFromCache ||
                    acknowledged.length != documents.length
                ? null
                : _buy,
            child: Text(
              busy ? 'Store wird geprüft …' : 'Monatsabo im Store abschließen',
            ),
          ),
          TextButton(
            onPressed: busy ? null : _restore,
            child: const Text('Kauf wiederherstellen'),
          ),
        ],
        if (active) ...[
          const Card(
            child: Padding(
              padding: EdgeInsets.all(16),
              child: Text(
                'App-Abo aktiv · Neue Events sind im Abo enthalten.',
                textAlign: TextAlign.center,
              ),
            ),
          ),
          OutlinedButton(
            onPressed: _manageSubscription,
            child: Text(
              Platform.isIOS
                  ? 'Abo im App Store verwalten'
                  : 'Abo bei Google Play verwalten',
            ),
          ),
        ],
        if (!active && withdrawal?['subscription'] != null)
          OutlinedButton(
            onPressed: _manageSubscription,
            child: Text(
              Platform.isIOS
                  ? 'Früheres Abo im App Store verwalten'
                  : 'Früheres Abo bei Google Play verwalten',
            ),
          ),
        if (withdrawal?['request'] != null)
          Card(
            color: const Color(0xfffff4e5),
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Text(
                'Widerruf eingegangen am ${_dateTime(withdrawal!['request']['requestedAt'] as String)} · Status: ${_withdrawalStatus(withdrawal!['request']['status'] as String)}',
              ),
            ),
          )
        else if (withdrawal?['eligible'] == true)
          Padding(
            padding: const EdgeInsets.only(top: 12),
            child: FilledButton.tonal(
              onPressed: busy ? null : _withdraw,
              child: const Text('Vertrag widerrufen'),
            ),
          ),
        if (withdrawal?['eligibleUntil'] case final String eligibleUntil)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Text(
              'Elektronischer Widerruf in der App bis ${_dateTime(eligibleUntil)}. Gesetzliche Rechte bleiben unberührt.',
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ),
        if (error != null)
          Padding(
            padding: const EdgeInsets.only(top: 12),
            child: Text(error!, style: const TextStyle(color: Colors.red)),
          ),
        const SizedBox(height: 18),
        const Text(
          'Kündigung, Widerruf und Kontolöschung sind unterschiedliche Vorgänge. Abrechnung und Aboverwaltung erfolgen über Google Play beziehungsweise den App Store.',
          textAlign: TextAlign.center,
        ),
      ],
    ),
  );
}

String _dateTime(String value) => DateFormat(
  'dd.MM.yyyy, HH:mm',
  'de_DE',
).format(DateTime.parse(value).toLocal());

String _withdrawalStatus(String value) => switch (value) {
  'received' => 'Eingegangen',
  'processing' => 'In Bearbeitung',
  'refunded' => 'Erstattet',
  'rejected' => 'Abgeschlossen ohne Erstattung',
  _ => value,
};
