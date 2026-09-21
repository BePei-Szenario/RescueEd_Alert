import 'package:flutter/material.dart';

class PasswordField extends StatefulWidget {
  const PasswordField({
    super.key,
    required this.controller,
    required this.labelText,
    this.prefixIcon,
    this.autofillHints,
    this.onChanged,
  });

  final TextEditingController controller;
  final String labelText;
  final IconData? prefixIcon;
  final Iterable<String>? autofillHints;
  final ValueChanged<String>? onChanged;

  @override
  State<PasswordField> createState() => _PasswordFieldState();
}

class _PasswordFieldState extends State<PasswordField> {
  bool visible = false;

  @override
  Widget build(BuildContext context) => TextField(
    controller: widget.controller,
    obscureText: !visible,
    enableSuggestions: false,
    autocorrect: false,
    autofillHints: widget.autofillHints,
    onChanged: widget.onChanged,
    decoration: InputDecoration(
      labelText: widget.labelText,
      prefixIcon: widget.prefixIcon == null ? null : Icon(widget.prefixIcon),
      suffixIcon: IconButton(
        tooltip: visible ? 'Passwort verbergen' : 'Passwort anzeigen',
        onPressed: () => setState(() => visible = !visible),
        icon: Icon(
          visible ? Icons.visibility_off_outlined : Icons.visibility_outlined,
        ),
      ),
    ),
  );
}
