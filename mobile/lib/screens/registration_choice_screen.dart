import 'package:flutter/material.dart';

class RegistrationChoiceScreen extends StatelessWidget {
  const RegistrationChoiceScreen({
    super.key,
    required this.onBack,
    required this.onConsumer,
    required this.onOrganization,
  });

  final VoidCallback onBack;
  final VoidCallback onConsumer;
  final VoidCallback onOrganization;

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: const Text('Konto registrieren'),
      leading: IconButton(
        onPressed: onBack,
        icon: const Icon(Icons.arrow_back),
      ),
    ),
    body: ListView(
      padding: const EdgeInsets.all(20),
      children: [
        Text(
          'Wie möchtest du RescueEd Alert nutzen?',
          style: Theme.of(
            context,
          ).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w900),
        ),
        const SizedBox(height: 8),
        const Text(
          'Für beide Nutzungsarten gelten unterschiedliche Leistungen und Vertragsbedingungen.',
        ),
        const SizedBox(height: 22),
        _RegistrationCard(
          icon: Icons.person_outline,
          title: 'Als Privatperson',
          description:
              'Private Nutzung ausschließlich in der App. Das Monatsabo wird später über Google Play oder den App Store abgeschlossen.',
          legalText: 'B2C-AGB · Datenschutzerklärung · Widerrufsbelehrung',
          buttonLabel: 'Privatkonto registrieren',
          onPressed: onConsumer,
        ),
        const SizedBox(height: 14),
        _RegistrationCard(
          icon: Icons.apartment_outlined,
          title: 'Als Organisation',
          description:
              'Für Feuerwehr, Sanitätsdienst, THW oder andere Alarmierungsnutzer mit Web-SaaS und Eventabrechnung.',
          legalText: 'Organisations-AGB · Datenschutzerklärung · AVV · SLA',
          buttonLabel: 'Organisation registrieren',
          onPressed: onOrganization,
        ),
      ],
    ),
  );
}

class _RegistrationCard extends StatelessWidget {
  const _RegistrationCard({
    required this.icon,
    required this.title,
    required this.description,
    required this.legalText,
    required this.buttonLabel,
    required this.onPressed,
  });

  final IconData icon;
  final String title;
  final String description;
  final String legalText;
  final String buttonLabel;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) => Card(
    child: Padding(
      padding: const EdgeInsets.all(18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: const Color(0xff146ee8), size: 34),
          const SizedBox(height: 12),
          Text(
            title,
            style: Theme.of(
              context,
            ).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w900),
          ),
          const SizedBox(height: 8),
          Text(description),
          const SizedBox(height: 12),
          Text(
            legalText,
            style: const TextStyle(
              color: Color(0xff52647a),
              fontSize: 12,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 16),
          SizedBox(
            width: double.infinity,
            child: FilledButton(onPressed: onPressed, child: Text(buttonLabel)),
          ),
        ],
      ),
    ),
  );
}
