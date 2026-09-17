import 'package:flutter/material.dart';
import '../api.dart';

class EventCreateScreen extends StatefulWidget {
  const EventCreateScreen({super.key, required this.api,this.consumer=false});
  final ApiClient api;
  final bool consumer;
  @override
  State<EventCreateScreen> createState() => _EventCreateScreenState();
}

class _EventCreateScreenState extends State<EventCreateScreen> {
  final name = TextEditingController(),
      helpers = TextEditingController(text: '20'),
      recipient = TextEditingController(),
      street = TextEditingController(),
      postalCode = TextEditingController(),
      city = TextEditingController(),
      billingEmail = TextEditingController();
  DateTime? date, endDate;
  TimeOfDay? start, end;
  bool loading = true, busy = false, complimentary = false, unlimitedEventDuration = false;
  String? error;
  @override
  void initState() {
    super.initState();
    loadProfile();
  }

  Future<void> loadProfile() async {
    try {
      final profile = await widget.api.get('/api/auth/me'),
          org = profile['organization'] as Map<String, dynamic>? ?? {};
      recipient.text = org['name'] ?? '';
      street.text = [
        org['billingStreet'],
        org['billingHouseNumber'],
      ].where((v) => v != null && v.toString().trim().isNotEmpty).join(' ');
      postalCode.text = org['billingPostalCode'] ?? '';
      city.text = org['billingCity'] ?? '';
      billingEmail.text = org['billingEmail'] ?? '';
      complimentary = org['complimentaryAccess'] == true;
      unlimitedEventDuration = org['unlimitedEventDuration'] == true;
    } catch (e) {
      error = e.toString();
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  int get helperCount => int.tryParse(helpers.text) ?? 0;
  int get priceCents => complimentary
      ||widget.consumer
      ? 0
      : helperCount <= 20
      ? 599
      : 999;
  Future<void> pickDate({bool isEnd = false}) async {
    final value = await showDatePicker(
      context: context,
      firstDate: isEnd && date != null ? date! : DateTime.now(),
      lastDate: DateTime(9999),
      initialDate: isEnd ? endDate ?? date ?? DateTime.now() : date ?? DateTime.now(),
    );
    if (value != null) {
      setState(() {
        if (isEnd) {
          endDate = value;
        } else {
          date = value;
          if (endDate == null || endDate!.isBefore(value)) {
            endDate = value;
          }
        }
      });
    }
  }

  Future<void> pickTime(bool begins) async {
    final value = await showTimePicker(
      context: context,
      initialTime: begins ? start ?? TimeOfDay.now() : end ?? TimeOfDay.now(),
    );
    if (value != null) {
      setState(() {
        if (begins) {
          start = value;
        } else {
          end = value;
        }
      });
    }
  }

  Future<void> submit() async {
    if (name.text.trim().isEmpty ||
        date == null ||
        endDate == null ||
        start == null ||
        end == null ||
        helperCount < 1 ||
        helperCount > 1000 ||
        (!widget.consumer&&recipient.text.trim().isEmpty) ||
        (!widget.consumer&&street.text.trim().isEmpty) ||
        (!widget.consumer&&postalCode.text.trim().isEmpty) ||
        (!widget.consumer&&city.text.trim().isEmpty) ||
        (!widget.consumer&&billingEmail.text.trim().isEmpty)) {
      setState(() => error = 'Bitte alle Pflichtfelder vollständig ausfüllen.');
      return;
    }
    final beginsAt = DateTime.utc(date!.year, date!.month, date!.day, start!.hour, start!.minute);
    final endsAt = DateTime.utc(endDate!.year, endDate!.month, endDate!.day, end!.hour, end!.minute);
    final duration = endsAt.difference(beginsAt);
    if (duration <= Duration.zero) {
      setState(() => error = 'Das Eventende muss nach dem Beginn liegen.');
      return;
    }
    if (!unlimitedEventDuration && duration > const Duration(hours: 48)) {
      setState(() => error = 'Events dürfen höchstens 48 Stunden dauern. Für längere Events ist die Dauernutzer-Freigabe nötig.');
      return;
    }
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(name.text.trim()),
        content: Text(
          widget.consumer?'Event jetzt im bestehenden Monatsabo anlegen?':complimentary
              ? 'Event jetzt kostenlos anlegen?'
              : 'Event anlegen und zahlungspflichtig für ${_money(priceCents)} bestellen?\n\nAbrechnung am Monatsende per Rechnung.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Abbrechen'),
          ),
          FilledButton(
            style: complimentary||widget.consumer
                ? null
                : FilledButton.styleFrom(backgroundColor: Colors.red),
            onPressed: () => Navigator.pop(context, true),
            child: Text(
              widget.consumer?'Im Abo anlegen':complimentary
                  ? 'Kostenlos anlegen'
                  : 'Zahlungspflichtig bestellen',
            ),
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
      final result = await widget.api.post('/api/events', {
        'name': name.text.trim(),
        'eventDate': _isoDate(date!),
        'endDate': _isoDate(endDate!),
        'startTime': _time(start!),
        'endTime': _time(end!),
        'helperLimit': helperCount,
        'recipientName': recipient.text.trim(),
        'street': street.text.trim(),
        'postalCode': postalCode.text.trim(),
        'city': city.text.trim(),
        'billingEmail': billingEmail.text.trim(),
      });
      if (!mounted) return;
      await showDialog(
        context: context,
        barrierDismissible: false,
        builder: (context) => AlertDialog(
          icon: const Icon(Icons.check_circle, color: Colors.green, size: 48),
          title: const Text('Vielen Dank für Ihre Bestellung!'),
          content: Text(
            widget.consumer?'Das Event wurde im aktiven Monatsabo angelegt.':result['complimentaryAccess'] == true
                ? 'Das kostenfreie Event wurde angelegt.'
                : 'Wir haben Ihre Bestellung erhalten. Eine Bestätigung mit allen Details wird an Ihre E-Mail-Adresse gesendet.',
          ),
          actions: [
            FilledButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('OK'),
            ),
          ],
        ),
      );
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      if (mounted) setState(() => error = e.toString());
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Sanitätsdienst erstellen')),
    body: loading
        ? const Center(child: CircularProgressIndicator())
        : ListView(
            padding: const EdgeInsets.all(18),
            children: [
              TextField(
                controller: name,
                decoration: const InputDecoration(labelText: 'Name des Events'),
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: () => pickDate(),
                      icon: const Icon(Icons.calendar_month),
                      label: Text(
                        date == null
                            ? 'Beginn-Datum'
                            : '${date!.day.toString().padLeft(2, '0')}.${date!.month.toString().padLeft(2, '0')}.${date!.year}',
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () => pickTime(true),
                      child: Text(start == null ? 'Beginn-Uhrzeit' : _time(start!)),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: date == null ? null : () => pickDate(isEnd: true),
                      icon: const Icon(Icons.calendar_month),
                      label: Text(endDate == null ? 'Ende-Datum' : '${endDate!.day.toString().padLeft(2, '0')}.${endDate!.month.toString().padLeft(2, '0')}.${endDate!.year}'),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () => pickTime(false),
                      child: Text(end == null ? 'Ende-Uhrzeit' : _time(end!)),
                    ),
                  ),
                ],
              ),
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Text(unlimitedEventDuration ? 'Dauernutzer: Events ohne Zeitlimit möglich.' : 'Maximal 48 Stunden pro Event.'),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: helpers,
                keyboardType: TextInputType.number,
                onChanged: (_) => setState(() {}),
                decoration: const InputDecoration(
                  labelText: 'Voraussichtliche Helferzahl',
                ),
              ),
              const SizedBox(height: 20),
              if(!widget.consumer)Text(
                'Rechnungsdaten',
                style: Theme.of(
                  context,
                ).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w900),
              ),
              if(!widget.consumer)const SizedBox(height: 10),
              if(!widget.consumer)...[
              TextField(
                controller: recipient,
                decoration: const InputDecoration(
                  labelText: 'Organisation / Rechnungsempfänger',
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: street,
                decoration: const InputDecoration(
                  labelText: 'Straße und Hausnummer',
                ),
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: postalCode,
                      decoration: const InputDecoration(labelText: 'PLZ'),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    flex: 2,
                    child: TextField(
                      controller: city,
                      decoration: const InputDecoration(labelText: 'Ort'),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              TextField(
                controller: billingEmail,
                readOnly: true,
                decoration: const InputDecoration(
                  labelText: 'Rechnungs-E-Mail',
                  prefixIcon: Icon(Icons.lock_outline),
                ),
              ),
              ],
              const SizedBox(height: 20),
              Card(
                color: complimentary||widget.consumer
                    ? const Color(0xffe8f7ef)
                    : const Color(0xffffecee),
                child: Padding(
                  padding: const EdgeInsets.all(18),
                  child: Row(
                    children: [
                      Expanded(
                        child: Text(
                          widget.consumer?'Im Monatsabo enthalten':complimentary
                              ? 'Kostenlose Nutzung freigeschaltet'
                              : helperCount <= 20
                              ? 'Event bis 20 Helfer'
                              : 'Event ab 21 Helfer',
                          style: const TextStyle(fontWeight: FontWeight.bold),
                        ),
                      ),
                      Text(
                        _money(priceCents),
                        style: TextStyle(
                          fontSize: 24,
                          fontWeight: FontWeight.w900,
                          color: complimentary||widget.consumer ? Colors.green : Colors.red,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              if (error != null)
                Padding(
                  padding: const EdgeInsets.only(top: 14),
                  child: Text(
                    error!,
                    style: const TextStyle(color: Colors.red),
                  ),
                ),
              const SizedBox(height: 18),
              SizedBox(
                height: 56,
                child: FilledButton(
                  style: complimentary||widget.consumer
                      ? null
                      : FilledButton.styleFrom(backgroundColor: Colors.red),
                  onPressed: busy ? null : submit,
                  child: Text(
                    busy
                        ? 'Wird gespeichert …'
                        : widget.consumer?'Event im Abo anlegen':complimentary
                        ? 'Event kostenlos anlegen'
                        : 'Zahlungspflichtig erstellen · ${_money(priceCents)}',
                  ),
                ),
              ),
            ],
          ),
  );
}

String _isoDate(DateTime value) =>
    '${value.year.toString().padLeft(4, '0')}-${value.month.toString().padLeft(2, '0')}-${value.day.toString().padLeft(2, '0')}';
String _time(TimeOfDay value) =>
    '${value.hour.toString().padLeft(2, '0')}:${value.minute.toString().padLeft(2, '0')}';
String _money(int cents) =>
    '${(cents / 100).toStringAsFixed(2).replaceAll('.', ',')} €';
