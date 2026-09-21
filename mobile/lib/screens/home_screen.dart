import 'package:flutter/material.dart';
import '../api.dart';
import '../app_version.dart';
import '../legal_documents.dart';
import 'settings_screen.dart';

class HomeScreen extends StatelessWidget {
  const HomeScreen({
    super.key,
    required this.api,
    required this.onLogin,
    required this.onScan,
    required this.onConsumerLogin,
    required this.onRegister,
    required this.onCodeLogin,
  });
  final ApiClient api;
  final VoidCallback onLogin, onScan;
  final VoidCallback onConsumerLogin, onRegister;
  final VoidCallback onCodeLogin;

  Future<void> _showLegal(BuildContext context, String slug) async {
    try {
      final result = await LegalDocuments(api).publicDocument(slug);
      final document = result.data;
      if (!context.mounted) return;
      await showDialog<void>(
        context: context,
        builder: (dialogContext) => AlertDialog(
          title: Text(document['title']?.toString() ?? slug),
          content: SizedBox(
            width: 520,
            child: SingleChildScrollView(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (result.fromCache) ...[
                    const Text(
                      'Offline gespeicherte Fassung – sobald eine Verbindung besteht, wird sie automatisch aktualisiert.',
                      style: TextStyle(color: Colors.orange),
                    ),
                    const SizedBox(height: 12),
                  ],
                  SelectableText(document['content']?.toString() ?? ''),
                ],
              ),
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
    } catch (error) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Dokument konnte nicht geladen werden: $error')),
      );
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    backgroundColor: const Color(0xff061d3a),
    appBar: AppBar(
      backgroundColor: const Color(0xff061d3a),
      elevation: 0,
      actions: [
        TextButton.icon(
          style: TextButton.styleFrom(foregroundColor: Colors.white),
          onPressed: () => Navigator.push(
            context,
            MaterialPageRoute(builder: (_) => SettingsScreen(api: api)),
          ),
          icon: const Icon(Icons.settings_outlined),
          label: const Text('Einstellungen'),
        ),
        const SizedBox(width: 12),
      ],
    ),
    body: SafeArea(
      child: CustomScrollView(
        slivers: [
          SliverFillRemaining(
            hasScrollBody: false,
            child: Padding(
              padding: const EdgeInsets.all(28),
              child: Column(
                children: [
                  const Spacer(),
                  ClipRRect(
                    borderRadius: BorderRadius.circular(28),
                    child: Image(
                      image: AssetImage('assets/rescueed-alert-logo.png'),
                      width: 150,
                      height: 150,
                      fit: BoxFit.cover,
                    ),
                  ),
                  const SizedBox(height: 24),
                  const Text(
                    'RescueEd Alert',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 34,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                  const Text(
                    'Einchecken · Einteilen · Alarmieren',
                    style: TextStyle(color: Color(0xff9fb6d2)),
                  ),
                  const Spacer(),
                  SizedBox(
                    width: double.infinity,
                    height: 56,
                    child: FilledButton.icon(
                      onPressed: onScan,
                      icon: const Icon(Icons.qr_code_scanner),
                      label: const Text('Event-QR-Code scannen'),
                    ),
                  ),
                  const SizedBox(height: 12),
                  SizedBox(
                    width: double.infinity,
                    height: 56,
                    child: OutlinedButton.icon(
                      onPressed: onCodeLogin,
                      icon: const Icon(Icons.key_outlined),
                      label: const Text('Codelogin für ein Event'),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: Colors.white,
                        side: const BorderSide(color: Color(0xff4f9cff)),
                      ),
                    ),
                  ),
                  const SizedBox(height: 12),
                  SizedBox(
                    width: double.infinity,
                    height: 56,
                    child: FilledButton.icon(
                      onPressed: onRegister,
                      icon: const Icon(Icons.person_add_alt_1),
                      label: const Text('Registrieren'),
                    ),
                  ),
                  const SizedBox(height: 12),
                  SizedBox(
                    width: double.infinity,
                    height: 56,
                    child: OutlinedButton.icon(
                      onPressed: onConsumerLogin,
                      icon: const Icon(Icons.person_outline),
                      label: const Text('Privatkonto anmelden'),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: Colors.white,
                        side: const BorderSide(color: Color(0xff7891ad)),
                      ),
                    ),
                  ),
                  const SizedBox(height: 12),
                  SizedBox(
                    width: double.infinity,
                    height: 56,
                    child: OutlinedButton.icon(
                      onPressed: onLogin,
                      icon: const Icon(Icons.admin_panel_settings_outlined),
                      label: const Text('Organisations-Login'),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: Colors.white,
                        side: const BorderSide(color: Color(0xff7891ad)),
                      ),
                    ),
                  ),
                  const SizedBox(height: 24),
                  const Text(
                    'Temporäre Helferdaten werden beim Auschecken von diesem Gerät entfernt.',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: Color(0xff7891ad), fontSize: 12),
                  ),
                  const SizedBox(height: 10),
                  Wrap(
                    alignment: WrapAlignment.center,
                    children: [
                      TextButton(
                        onPressed: () => _showLegal(context, 'impressum'),
                        child: const Text('Impressum'),
                      ),
                      const Padding(
                        padding: EdgeInsets.symmetric(vertical: 12),
                        child: Text(
                          '·',
                          style: TextStyle(color: Color(0xff7891ad)),
                        ),
                      ),
                      TextButton(
                        onPressed: () => _showLegal(context, 'datenschutz'),
                        child: const Text('DSGVO'),
                      ),
                    ],
                  ),
                  const AppVersion(color: Color(0xff7891ad)),
                ],
              ),
            ),
          ),
        ],
      ),
    ),
  );
}
