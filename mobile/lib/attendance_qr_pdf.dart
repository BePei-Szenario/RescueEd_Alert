import 'dart:typed_data';

import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;

String _safe(String value) => value
    .replaceAll('ä', 'ae')
    .replaceAll('ö', 'oe')
    .replaceAll('ü', 'ue')
    .replaceAll('Ä', 'Ae')
    .replaceAll('Ö', 'Oe')
    .replaceAll('Ü', 'Ue')
    .replaceAll('ß', 'ss');

Future<Uint8List> createAttendanceQrPdf({
  required String eventName,
  required String eventDate,
  required String comeUrl,
  required String leaveUrl,
  bool includeCome = true,
  bool includeLeave = true,
}) async {
  if (!includeCome && !includeLeave) {
    throw ArgumentError('Mindestens ein QR-Code muss ausgewählt sein.');
  }

  final document = pw.Document();
  final codes = <({String heading, String hint, String url})>[
    if (includeCome)
      (
        heading: 'KOMMEN - Einchecken',
        hint: 'Beim Dienstbeginn scannen.',
        url: comeUrl,
      ),
    if (includeLeave)
      (
        heading: 'GEHEN - Auschecken',
        hint: 'Beim Dienstende scannen.',
        url: leaveUrl,
      ),
  ];

  document.addPage(
    pw.Page(
      pageFormat: PdfPageFormat.a4,
      margin: const pw.EdgeInsets.all(36),
      build: (context) => pw.Column(
        crossAxisAlignment: pw.CrossAxisAlignment.start,
        children: [
          pw.Text(
            _safe(eventName),
            style: pw.TextStyle(
              fontSize: 21,
              fontWeight: pw.FontWeight.bold,
              color: PdfColor.fromHex('#071A33'),
            ),
            maxLines: 2,
          ),
          pw.SizedBox(height: 5),
          pw.Text(
            'RescueEd Alert - Anwesenheit am $eventDate',
            style: pw.TextStyle(
              fontSize: 10,
              color: PdfColor.fromHex('#475569'),
            ),
          ),
          pw.SizedBox(height: 16),
          ...codes.map(
            (code) => pw.Container(
              width: double.infinity,
              margin: const pw.EdgeInsets.only(bottom: 14),
              padding: const pw.EdgeInsets.all(13),
              decoration: pw.BoxDecoration(
                border: pw.Border.all(color: PdfColor.fromHex('#CBD5E1')),
                borderRadius: pw.BorderRadius.circular(8),
              ),
              child: pw.Column(
                children: [
                  pw.Text(
                    code.heading,
                    style: pw.TextStyle(
                      fontSize: 15,
                      fontWeight: pw.FontWeight.bold,
                      color: PdfColor.fromHex('#071A33'),
                    ),
                  ),
                  pw.SizedBox(height: 9),
                  pw.Container(
                    color: PdfColors.white,
                    padding: const pw.EdgeInsets.all(9),
                    child: pw.BarcodeWidget(
                      barcode: pw.Barcode.qrCode(),
                      data: code.url,
                      width: codes.length == 1 ? 280 : 206,
                      height: codes.length == 1 ? 280 : 206,
                      drawText: false,
                    ),
                  ),
                  pw.SizedBox(height: 7),
                  pw.Text(
                    code.hint,
                    style: pw.TextStyle(
                      fontSize: 9,
                      color: PdfColor.fromHex('#475569'),
                    ),
                  ),
                ],
              ),
            ),
          ),
          pw.Spacer(),
          pw.Text(
            'QR-Codes nur fuer dieses Event verwenden.',
            style: pw.TextStyle(
              fontSize: 8,
              color: PdfColor.fromHex('#64748B'),
            ),
          ),
        ],
      ),
    ),
  );

  return document.save();
}
