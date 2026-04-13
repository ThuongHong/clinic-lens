import 'package:flutter/material.dart';

import '../models/lab_analysis.dart';

class AnalysisHistoryPanel extends StatelessWidget {
  const AnalysisHistoryPanel({
    super.key,
    required this.entries,
    required this.selectedHistoryId,
    required this.loading,
    required this.onRefresh,
    required this.onSelect,
    this.errorMessage,
  });

  final List<AnalysisHistoryEntry> entries;
  final String? selectedHistoryId;
  final bool loading;
  final String? errorMessage;
  final Future<void> Function() onRefresh;
  final ValueChanged<AnalysisHistoryEntry> onSelect;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(28),
        border: Border.all(color: const Color(0xFFE2E8F0)),
        boxShadow: const <BoxShadow>[
          BoxShadow(
            color: Color(0x0A000000),
            blurRadius: 20,
            offset: Offset(0, 8),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  'Past Analyses',
                  style: theme.textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w800,
                    color: const Color(0xFF0F172A),
                  ),
                ),
              ),
              IconButton(
                onPressed: loading ? null : onRefresh,
                tooltip: 'Refresh history',
                icon: loading
                    ? const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.refresh_rounded),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            'Saved runs from backend storage. Tap a record to reload it into the dashboard.',
            style: theme.textTheme.bodyMedium?.copyWith(
              color: const Color(0xFF64748B),
              fontWeight: FontWeight.w500,
            ),
          ),
          if (errorMessage != null && errorMessage!.isNotEmpty) ...[
            const SizedBox(height: 12),
            Text(
              errorMessage!,
              style: theme.textTheme.bodyMedium?.copyWith(
                color: const Color(0xFFFF007F),
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
          const SizedBox(height: 12),
          if (entries.isEmpty && !loading)
            Text(
              'No saved analyses yet. Run one analysis to start building patient history.',
              style: theme.textTheme.bodyMedium?.copyWith(
                color: const Color(0xFF94A3B8),
                fontWeight: FontWeight.w500,
              ),
            )
          else
            for (final entry in entries) ...[
              _HistoryCard(
                entry: entry,
                selected: entry.id == selectedHistoryId,
                onTap: () => onSelect(entry),
              ),
              const SizedBox(height: 10),
            ],
        ],
      ),
    );
  }
}

class _HistoryCard extends StatelessWidget {
  const _HistoryCard({
    required this.entry,
    required this.selected,
    required this.onTap,
  });

  final AnalysisHistoryEntry entry;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final tone = entry.criticalCount > 0
        ? const Color(0xFFFF007F)
        : entry.abnormalCount > 0
            ? const Color(0xFFD97706)
            : const Color(0xFF10B981);
    final createdAt = entry.createdAt.year > 1970
        ? '${entry.createdAt.year}-${_twoDigits(entry.createdAt.month)}-${_twoDigits(entry.createdAt.day)} ${_twoDigits(entry.createdAt.hour)}:${_twoDigits(entry.createdAt.minute)}'
        : 'Unknown time';

    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(16),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 220),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: selected
              ? tone.withValues(alpha: 0.08)
              : const Color(0xFFF8FAFC),
          borderRadius: BorderRadius.circular(20),
          border: Border.all(
            color: selected
                ? tone.withValues(alpha: 0.3)
                : const Color(0xFFE2E8F0),
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    entry.title,
                    style: theme.textTheme.bodyMedium?.copyWith(
                      color: const Color(0xFF0F172A),
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
                if (selected)
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                    decoration: BoxDecoration(
                      color: const Color(0xFF1E293B), // Dark pill
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: Text(
                      'Viewing',
                      style: theme.textTheme.labelSmall?.copyWith(
                        color: Colors.white,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 6),
            Text(
              '${entry.analysis.analysisDate} • $createdAt',
              style: theme.textTheme.bodyMedium?.copyWith(
                color: const Color(0xFF64748B),
                fontWeight: FontWeight.w500,
              ),
            ),
            const SizedBox(height: 12),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                _MiniChip(label: '${entry.indicatorCount} indicators', color: const Color(0xFF64748B)),
                _MiniChip(label: '${entry.abnormalCount} alerts', color: tone),
                _MiniChip(label: '${entry.criticalCount} critical', color: const Color(0xFFFF007F)),
              ],
            ),
          ],
        ),
      ),
    );
  }

  String _twoDigits(int value) => value.toString().padLeft(2, '0');
}

class _MiniChip extends StatelessWidget {
  const _MiniChip({required this.label, required this.color});

  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        style: theme.textTheme.labelSmall?.copyWith(
          color: color.withValues(alpha: 0.9),
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}
