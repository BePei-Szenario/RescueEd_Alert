import 'package:flutter/material.dart';

/// Keeps screen content clear of system navigation and display cutouts.
/// AppBar handles the top inset; Scaffold retains keyboard and FAB handling.
class SafeScaffold extends StatelessWidget {
  const SafeScaffold({
    super.key,
    required this.appBar,
    required this.body,
    this.floatingActionButton,
  });

  final PreferredSizeWidget appBar;
  final Widget body;
  final Widget? floatingActionButton;

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: appBar,
    floatingActionButton: floatingActionButton,
    body: SafeArea(top: false, child: body),
  );
}
