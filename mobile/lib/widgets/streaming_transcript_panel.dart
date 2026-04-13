import 'package:flutter/material.dart';

class StreamingTranscriptPanel extends StatelessWidget {
  const StreamingTranscriptPanel({super.key, required this.content});

  final String content;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Semantics(
      label: 'Streaming transcript panel',
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          color: const Color(0xFF1E293B),
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: const Color(0xFF334155)),
          boxShadow: const [
            BoxShadow(
              color: Color(0x11000000),
              blurRadius: 16,
              offset: Offset(0, 8),
            )
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Streaming JSON',
              style: theme.textTheme.titleMedium
                  ?.copyWith(fontWeight: FontWeight.w700, color: Colors.white),
            ),
            const SizedBox(height: 12),
            SelectableText(
              content,
              style: theme.textTheme.bodySmall?.copyWith(
                color: Colors.white.withValues(alpha: 0.9),
                fontFamily: 'monospace',
                height: 1.45,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
