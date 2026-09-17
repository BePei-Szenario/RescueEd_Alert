import 'package:flutter/material.dart';
import 'package:package_info_plus/package_info_plus.dart';

class AppVersion extends StatefulWidget {
  const AppVersion({super.key, this.color});

  final Color? color;

  @override
  State<AppVersion> createState() => _AppVersionState();
}

class _AppVersionState extends State<AppVersion> {
  late final Future<PackageInfo> info = PackageInfo.fromPlatform();

  @override
  Widget build(BuildContext context) => FutureBuilder<PackageInfo>(
    future: info,
    builder: (context, snapshot) {
      final package = snapshot.data;
      if (package == null) return const SizedBox.shrink();
      return Text(
        'Version ${package.version} · Build ${package.buildNumber}',
        textAlign: TextAlign.center,
        style: TextStyle(fontSize: 12, color: widget.color ?? Colors.blueGrey),
      );
    },
  );
}
