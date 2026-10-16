/// Formats calendar dates without locale initialization or timezone conversion.
String formatEventPeriod(Map<String, dynamic>? event) {
  String date(dynamic value) {
    if (value is! String) return '–';
    final parsed = DateTime.tryParse(value);
    if (parsed == null) return '–';
    return '${parsed.day.toString().padLeft(2, '0')}.'
        '${parsed.month.toString().padLeft(2, '0')}.'
        '${parsed.year.toString().padLeft(4, '0')}';
  }

  final start = date(event?['eventDate']);
  final end = date(event?['endDate'] ?? event?['eventDate']);
  final startTime = event?['startTime'] ?? '–';
  final endTime = event?['endTime'] ?? '–';
  if (start == end) return '$start · $startTime–$endTime Uhr';
  return '$start, $startTime – $end, $endTime Uhr';
}
