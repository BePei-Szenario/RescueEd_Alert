import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../api.dart';
import '../legal_document_viewer.dart';
import '../session_store.dart';
import '../widgets/password_field.dart';

class OrganizationProfileScreen extends StatefulWidget {
  const OrganizationProfileScreen({
    super.key,
    required this.api,
    this.onLogout,
  });

  final ApiClient api;
  final Future<void> Function()? onLogout;

  @override
  State<OrganizationProfileScreen> createState() =>
      _OrganizationProfileScreenState();
}

class _OrganizationProfileScreenState extends State<OrganizationProfileScreen> {
  final organizationKey = GlobalKey<FormState>();
  final organization = TextEditingController();
  final billingEmail = TextEditingController();
  final street = TextEditingController();
  final houseNumber = TextEditingController();
  final postalCode = TextEditingController();
  final city = TextEditingController();
  final currentPassword = TextEditingController();
  final newPassword = TextEditingController();
  final repeatPassword = TextEditingController();

  Map<String, dynamic>? data;
  bool loading = true, busy = false;
  String? error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    organization.dispose();
    billingEmail.dispose();
    street.dispose();
    houseNumber.dispose();
    postalCode.dispose();
    city.dispose();
    currentPassword.dispose();
    newPassword.dispose();
    repeatPassword.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    if (mounted) setState(() => error = null);
    try {
      final result = await widget.api.get('/api/profile');
      final profile = _map(result['profile']);
      final details = _map(profile['organization']);
      organization.text = '${details['name'] ?? ''}';
      billingEmail.text = '${details['billingEmail'] ?? ''}';
      street.text = '${details['billingStreet'] ?? ''}';
      houseNumber.text = '${details['billingHouseNumber'] ?? ''}';
      postalCode.text = '${details['billingPostalCode'] ?? ''}';
      city.text = '${details['billingCity'] ?? ''}';
      if (mounted) setState(() => data = result);
    } catch (exception) {
      if (mounted) setState(() => error = exception.toString());
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> _saveOrganization() async {
    if (organizationKey.currentState?.validate() != true) return;
    setState(() {
      busy = true;
      error = null;
    });
    try {
      await widget.api.patch('/api/profile', {
        'name': organization.text.trim(),
        'billingEmail': billingEmail.text.trim(),
        'billingStreet': street.text.trim(),
        'billingHouseNumber': houseNumber.text.trim(),
        'billingPostalCode': postalCode.text.trim(),
        'billingCity': city.text.trim(),
      });
      await _load();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Organisations- und Rechnungsdaten gespeichert.'),
          ),
        );
      }
    } catch (exception) {
      if (mounted) setState(() => error = exception.toString());
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> _openLegal(Map<String, dynamic> summary) async {
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final key = Uri.encodeComponent('${summary['documentKey'] ?? ''}');
      final document = await widget.api.get('/api/legal-documents/$key');
      if (mounted) await showLegalDocument(context, widget.api, document);
    } catch (exception) {
      if (mounted) setState(() => error = exception.toString());
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> _changePassword() async {
    final next = newPassword.text;
    if (currentPassword.text.isEmpty || next.length < 12) {
      setState(
        () => error = 'Das neue Passwort muss mindestens 12 Zeichen haben.',
      );
      return;
    }
    if (next != repeatPassword.text) {
      setState(() => error = 'Die neuen Passwörter stimmen nicht überein.');
      return;
    }
    setState(() {
      busy = true;
      error = null;
    });
    try {
      await widget.api.post('/api/profile/password', {
        'currentPassword': currentPassword.text,
        'newPassword': next,
      });
      currentPassword.clear();
      newPassword.clear();
      repeatPassword.clear();
      if (!mounted) return;
      await showDialog<void>(
        context: context,
        barrierDismissible: false,
        builder: (dialogContext) => AlertDialog(
          title: const Text('Passwort geändert'),
          content: const Text(
            'Aus Sicherheitsgründen wurden alle Sitzungen beendet. Bitte melde dich erneut an.',
          ),
          actions: [
            FilledButton(
              onPressed: () => Navigator.pop(dialogContext),
              child: const Text('OK'),
            ),
          ],
        ),
      );
      widget.api.sessionCookie = null;
      await SessionStore().clearOwnerSession();
      if (widget.onLogout != null) await widget.onLogout!();
      if (mounted) Navigator.of(context).popUntil((route) => route.isFirst);
    } catch (exception) {
      if (mounted) setState(() => error = exception.toString());
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final profile = _map(data?['profile']);
    final org = _map(profile['organization']);
    final canEdit = org['canEdit'] == true;
    final invoices = _list(data?['invoices']);
    final documents = _list(data?['legalDocuments']);
    final acknowledgements = _list(data?['acknowledgements']);
    return Scaffold(
      appBar: AppBar(
        title: const Text('Organisationsprofil'),
        actions: [
          IconButton(
            tooltip: 'Neu laden',
            onPressed: busy ? null : _load,
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  if (error != null)
                    Card(
                      color: const Color(0xffffe8e8),
                      child: Padding(
                        padding: const EdgeInsets.all(14),
                        child: Text(
                          error!,
                          style: const TextStyle(color: Colors.red),
                        ),
                      ),
                    ),
                  _SectionCard(
                    icon: Icons.badge_outlined,
                    title: '${profile['name'] ?? 'Profil'}',
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('${profile['email'] ?? ''}'),
                        const SizedBox(height: 4),
                        Text(
                          '${org['name'] ?? ''} · ${_organizationType(org['organizationType'])}',
                          style: const TextStyle(color: Colors.blueGrey),
                        ),
                      ],
                    ),
                  ),
                  if (org['canViewBilling'] == true)
                    _SectionCard(
                      icon: Icons.business_outlined,
                      title: 'Organisation und Rechnungsanschrift',
                      child: Form(
                        key: organizationKey,
                        child: Column(
                          children: [
                            _field(
                              organization,
                              'Organisation',
                              enabled: canEdit,
                            ),
                            Padding(
                              padding: const EdgeInsets.only(bottom: 10),
                              child: TextFormField(
                                initialValue: _organizationType(
                                  org['organizationType'],
                                ),
                                enabled: false,
                                decoration: const InputDecoration(
                                  labelText: 'Organisationsart',
                                ),
                              ),
                            ),
                            _field(
                              billingEmail,
                              'Rechnungs-E-Mail',
                              enabled: canEdit,
                              keyboardType: TextInputType.emailAddress,
                            ),
                            Row(
                              children: [
                                Expanded(
                                  child: _field(
                                    street,
                                    'Straße',
                                    enabled: canEdit,
                                  ),
                                ),
                                const SizedBox(width: 8),
                                SizedBox(
                                  width: 105,
                                  child: _field(
                                    houseNumber,
                                    'Hausnummer',
                                    enabled: canEdit,
                                  ),
                                ),
                              ],
                            ),
                            Row(
                              children: [
                                SizedBox(
                                  width: 110,
                                  child: _field(
                                    postalCode,
                                    'PLZ',
                                    enabled: canEdit,
                                  ),
                                ),
                                const SizedBox(width: 8),
                                Expanded(
                                  child: _field(city, 'Ort', enabled: canEdit),
                                ),
                              ],
                            ),
                            if (canEdit)
                              Align(
                                alignment: Alignment.centerLeft,
                                child: FilledButton.icon(
                                  onPressed: busy ? null : _saveOrganization,
                                  icon: const Icon(Icons.save_outlined),
                                  label: const Text('Daten speichern'),
                                ),
                              ),
                          ],
                        ),
                      ),
                    ),
                  if (org['canViewBilling'] == true)
                    _SectionCard(
                      icon: Icons.receipt_long_outlined,
                      title: 'Rechnungen und Bestellungen',
                      child: invoices.isEmpty
                          ? const Text(
                              'Noch keine kostenpflichtigen Bestellungen gespeichert.',
                            )
                          : Column(
                              children: invoices.map((invoice) {
                                final item = _map(invoice);
                                return ExpansionTile(
                                  tilePadding: EdgeInsets.zero,
                                  childrenPadding: const EdgeInsets.only(
                                    bottom: 10,
                                  ),
                                  title: Text(
                                    '${item['eventName'] ?? 'Event'}',
                                    style: const TextStyle(
                                      fontWeight: FontWeight.w700,
                                    ),
                                  ),
                                  subtitle: Text(
                                    '${_date(item['eventDate'])} · ${_status(item['status'])}',
                                  ),
                                  trailing: Text(
                                    _money(item['amountCents']),
                                    style: const TextStyle(
                                      fontWeight: FontWeight.w800,
                                    ),
                                  ),
                                  children: [
                                    Align(
                                      alignment: Alignment.centerLeft,
                                      child: Text(
                                        '${item['recipientName']}\n${item['street']}, ${item['postalCode']} ${item['city']}\n${item['email']}\nReferenz: ${item['id']}',
                                        style: const TextStyle(
                                          fontSize: 12,
                                          color: Colors.blueGrey,
                                        ),
                                      ),
                                    ),
                                  ],
                                );
                              }).toList(),
                            ),
                    ),
                  _SectionCard(
                    icon: Icons.gavel_outlined,
                    title: 'Rechtstexte',
                    child: Column(
                      children: [
                        if (documents.isEmpty)
                          const Align(
                            alignment: Alignment.centerLeft,
                            child: Text(
                              'Keine veröffentlichten Rechtstexte verfügbar.',
                            ),
                          ),
                        ...documents.map((document) {
                          final item = _map(document);
                          return ListTile(
                            dense: true,
                            contentPadding: EdgeInsets.zero,
                            title: Text('${item['title']}'),
                            subtitle: Text('Version ${item['version']}'),
                            trailing: const Icon(Icons.open_in_new),
                            onTap: busy ? null : () => _openLegal(item),
                          );
                        }),
                        ExpansionTile(
                          tilePadding: EdgeInsets.zero,
                          title: Text(
                            'Gespeicherte Bestätigungen (${acknowledgements.length})',
                            style: const TextStyle(
                              fontSize: 14,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                          children: acknowledgements.isEmpty
                              ? const [
                                  ListTile(
                                    title: Text(
                                      'Noch keine Bestätigungen gespeichert.',
                                    ),
                                  ),
                                ]
                              : acknowledgements.map((entry) {
                                  final item = _map(entry);
                                  return ListTile(
                                    dense: true,
                                    contentPadding: EdgeInsets.zero,
                                    title: Text(
                                      '${item['title']} · ${item['version']}',
                                    ),
                                    subtitle: Text(
                                      '${item['own'] == true ? 'Von dir' : 'Von ${item['signerName']}'} ${item['acknowledgementType'] == 'read' ? 'gelesen' : 'bestätigt'} · ${_dateTime(item['acceptedAt'])}',
                                    ),
                                  );
                                }).toList(),
                        ),
                      ],
                    ),
                  ),
                  _SectionCard(
                    icon: Icons.password_outlined,
                    title: 'Passwort ändern',
                    child: Column(
                      children: [
                        PasswordField(
                          controller: currentPassword,
                          labelText: 'Bisheriges Passwort',
                        ),
                        const SizedBox(height: 10),
                        PasswordField(
                          controller: newPassword,
                          labelText: 'Neues Passwort (mindestens 12 Zeichen)',
                        ),
                        const SizedBox(height: 10),
                        PasswordField(
                          controller: repeatPassword,
                          labelText: 'Neues Passwort wiederholen',
                        ),
                        const SizedBox(height: 12),
                        Align(
                          alignment: Alignment.centerLeft,
                          child: FilledButton.icon(
                            onPressed: busy ? null : _changePassword,
                            icon: const Icon(Icons.lock_reset),
                            label: const Text('Passwort ändern'),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
    );
  }

  Widget _field(
    TextEditingController controller,
    String label, {
    required bool enabled,
    TextInputType? keyboardType,
  }) {
    final field = Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: TextFormField(
        controller: controller,
        enabled: enabled,
        keyboardType: keyboardType,
        decoration: InputDecoration(labelText: label),
        validator: enabled
            ? (value) => value?.trim().isEmpty == true ? 'Pflichtfeld' : null
            : null,
      ),
    );
    return field;
  }
}

class _SectionCard extends StatelessWidget {
  const _SectionCard({
    required this.icon,
    required this.title,
    required this.child,
  });

  final IconData icon;
  final String title;
  final Widget child;

  @override
  Widget build(BuildContext context) => Card(
    margin: const EdgeInsets.only(bottom: 12),
    child: Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, color: const Color(0xff146ee8)),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  title,
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          child,
        ],
      ),
    ),
  );
}

Map<String, dynamic> _map(dynamic value) =>
    value is Map ? Map<String, dynamic>.from(value) : <String, dynamic>{};
List<dynamic> _list(dynamic value) => value is List ? value : const [];

String _organizationType(dynamic value) => switch (value) {
  'feuerwehr' => 'Feuerwehr',
  'sanitaetsdienst' => 'Sanitätsdienst',
  'thw' => 'THW',
  'alarmierungsnutzer' => 'Alarmierungsnutzer',
  _ => 'Nicht festgelegt',
};

String _status(dynamic value) => switch (value) {
  'pending' => 'Offen',
  'sent' => 'Versendet',
  'paid' => 'Bezahlt',
  'cancelled' => 'Storniert',
  _ => '${value ?? 'Unbekannt'}',
};

String _money(dynamic value) => NumberFormat.currency(
  locale: 'de_DE',
  symbol: '€',
).format(((value as num?)?.toInt() ?? 0) / 100);

String _date(dynamic value) {
  try {
    return DateFormat('dd.MM.yyyy', 'de').format(DateTime.parse('$value'));
  } catch (_) {
    return '${value ?? '–'}';
  }
}

String _dateTime(dynamic value) {
  try {
    return DateFormat(
      'dd.MM.yyyy, HH:mm',
      'de',
    ).format(DateTime.parse('$value').toLocal());
  } catch (_) {
    return '${value ?? '–'}';
  }
}
