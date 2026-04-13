import 'package:flutter/material.dart';

/// Loading state panel
class LoadingPanel extends StatelessWidget {
  const LoadingPanel({super.key, required this.status});

  final String status;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Semantics(
      label: 'Loading panel showing current status',
      value: status,
      child: Container(
        padding: const EdgeInsets.all(24),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(24),
          border: Border.all(color: const Color(0xFFE2E8F0)),
          boxShadow: const [
            BoxShadow(
              color: Color(0x0A000000),
              blurRadius: 18,
              offset: Offset(0, 6),
            )
          ],
        ),
        child: Column(
          children: [
            const SizedBox(
              width: 44,
              height: 44,
              child: CircularProgressIndicator(
                strokeWidth: 3,
                color: Color(0xFFFF007F),
                backgroundColor: Color(0xFFF1F5F9),
              ),
            ),
            const SizedBox(height: 16),
            Text(
              status,
              style: theme.textTheme.bodyMedium?.copyWith(
                color: const Color(0xFF0F172A),
                fontWeight: FontWeight.w600,
              ),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }
}
