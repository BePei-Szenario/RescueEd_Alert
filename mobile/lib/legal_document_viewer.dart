import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import 'api.dart';

Future<bool> showLegalDocument(
  BuildContext context,
  ApiClient api,
  Map<String, dynamic> document,
) async {
  final pdfPath = document['pdfUrl'];
  if (pdfPath is String && pdfPath.isNotEmpty) {
    final uri = Uri.parse(api.baseUrl).resolve(pdfPath);
    try {
      if (await launchUrl(uri, mode: LaunchMode.externalApplication)) {
        return true;
      }
    } catch (_) {}
    if (context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('PDF konnte nicht geöffnet werden. Textfassung wird angezeigt.'),
        ),
      );
    }
  }
  if (!context.mounted) return false;
  await showDialog<void>(
    context: context,
    builder: (dialogContext) => AlertDialog(
      title: Text('${document['title']} · ${document['version']}'),
      content: SizedBox(
        width: 520,
        child: SingleChildScrollView(
          child: SelectableText('${document['content'] ?? ''}'),
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
  return true;
}
