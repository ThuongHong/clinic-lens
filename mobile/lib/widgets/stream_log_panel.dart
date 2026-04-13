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
        color: Colors.black.withValues(alpha: 0.24),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: Colors.white.withValues(alpha: 0.04)),
      ),
      child: lines.isEmpty
          ? Center(
              child: Text(
                'Stream output will appear here',
                style: theme.textTheme.bodySmall?.copyWith(
                  color: Colors.white.withValues(alpha: 0.5),
                ),
              ),
            )
          : ListView.separated(
              itemCount: lines.length,
              separatorBuilder: (_, __) => const SizedBox(height: 8),
              itemBuilder: (context, index) {
                final line = lines[index];
                final isError = line.contains('Error') || line.contains('❌');
                final isSuccess = line.contains('✓');

                return Text(
                  line,
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: isError
                        ? Colors.red.withValues(alpha: 0.86)
                        : isSuccess
                            ? Colors.green.withValues(alpha: 0.86)
                            : Colors.white.withValues(alpha: 0.86),
                    fontFamily: 'monospace',
                    height: 1.5,
                  ),
                );
              },
            ),
    );
  }
}
