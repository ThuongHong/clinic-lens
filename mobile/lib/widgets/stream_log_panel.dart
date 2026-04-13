import 'package:flutter/material.dart';

class StreamLogPanel extends StatelessWidget {
  const StreamLogPanel({super.key, required this.lines});

  final List<String> lines;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: const Color(0xFFF1F5F9), // Light grayish-blue for console
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: const Color(0xFFE2E8F0)),
      ),
      child: lines.isEmpty
          ? Center(
              child: Text(
                'Stream output will appear here',
                style: theme.textTheme.bodySmall?.copyWith(
                  color: const Color(0xFF94A3B8),
                ),
              ),
            )
          : ListView.separated(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              itemCount: lines.length,
              separatorBuilder: (_, __) => const SizedBox(height: 8),
              itemBuilder: (context, index) {
                final line = lines[index];
                final isError = line.contains('Error') || line.contains('❌');
                final isSuccess = line.contains('✓');

                return Text(
                  line,
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: isError
                        ? const Color(0xFFFF007F)
                        : isSuccess
                            ? const Color(0xFF10B981)
                            : const Color(0xFF475569),
                    fontFamily: 'monospace',
                    fontWeight: FontWeight.w600,
                    height: 1.5,
                  ),
                );
              },
            ),
    );
  }
}
