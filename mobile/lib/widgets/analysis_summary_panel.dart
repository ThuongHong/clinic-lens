import 'package:flutter/material.dart';

import '../models/lab_analysis.dart';

class AnalysisSummaryPanel extends StatelessWidget {
  const AnalysisSummaryPanel({
    super.key,
    required this.analysis,
  });

  final LabAnalysis analysis;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final abnormalResults = analysis.abnormalResults;
    final summary = analysis.summary;
    final advice = analysis.advice;

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFF0B1729).withValues(alpha: 0.7),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Test Summary',
            style: theme.textTheme.titleSmall
                ?.copyWith(fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 6),
          Text(
            '${analysis.displayPatientName} • ${analysis.analysisDate}',
            style: theme.textTheme.bodySmall?.copyWith(color: Colors.white70),
          ),
          const SizedBox(height: 14),
          Wrap(
            spacing: 10,
            runSpacing: 10,
            children: [
              _SummaryChip(
                label: 'Indicators',
                value: '${analysis.indicatorCount}',
                color: const Color(0xFF38BDF8),
              ),
              _SummaryChip(
                label: 'Alerts',
                value: '${analysis.abnormalCount}',
                color: analysis.abnormalCount == 0
                    ? const Color(0xFF10B981)
                    : const Color(0xFFF59E0B),
              ),
              _SummaryChip(
                label: 'Critical',
                value: '${analysis.criticalCount}',
                color: analysis.criticalCount == 0
                    ? const Color(0xFF94A3B8)
                    : const Color(0xFFEF4444),
              ),
              _SummaryChip(
                label: 'Organs',
                value: '${analysis.trackedOrganCount}',
                color: const Color(0xFF818CF8),
              ),
            ],
          ),
          const SizedBox(height: 14),
          Text(
            abnormalResults.isEmpty
                ? 'All tracked indicators are currently within normal range.'
                : 'Priority markers',
            style: theme.textTheme.labelLarge?.copyWith(
              color: Colors.white,
              fontWeight: FontWeight.w700,
            ),
          ),
          if (abnormalResults.isNotEmpty) ...[
            const SizedBox(height: 10),
            for (final result in abnormalResults.take(4)) ...[
              _PriorityIndicatorRow(result: result),
              const SizedBox(height: 8),
            ],
          ],
          if (summary != null && summary.organSummary.isNotEmpty) ...[
            const SizedBox(height: 18),
            Text(
              'Organ outlook',
              style: theme.textTheme.labelLarge?.copyWith(
                color: Colors.white,
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 10),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final item in summary.organSummary.take(6))
                  _OrganSummaryChip(summary: item),
              ],
            ),
          ],
          if (advice != null && advice.status == 'success') ...[
            const SizedBox(height: 18),
            _AdvicePanel(advice: advice),
          ],
        ],
      ),
    );
  }
}

class _SummaryChip extends StatelessWidget {
  const _SummaryChip({
    required this.label,
    required this.value,
    required this.color,
  });

  final String label;
  final String value;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: color.withValues(alpha: 0.3)),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            value,
            style: theme.textTheme.titleMedium?.copyWith(
              color: Colors.white,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            label,
            style: theme.textTheme.labelMedium?.copyWith(
              color: Colors.white70,
            ),
          ),
        ],
      ),
    );
  }
}

class _PriorityIndicatorRow extends StatelessWidget {
  const _PriorityIndicatorRow({required this.result});

  final LabResult result;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final tone = switch (result.severity) {
      'critical' => const Color(0xFFEF4444),
      'abnormal_high' => const Color(0xFFF59E0B),
      'abnormal_low' => const Color(0xFF38BDF8),
      _ => const Color(0xFF10B981),
    };

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: tone.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: tone.withValues(alpha: 0.2)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 10,
            height: 10,
            margin: const EdgeInsets.only(top: 4),
            decoration: BoxDecoration(
              color: tone,
              shape: BoxShape.circle,
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  result.indicatorName,
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: Colors.white,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  '${result.value} ${result.unit} • Ref ${result.referenceRange}',
                  style: theme.textTheme.bodySmall
                      ?.copyWith(color: Colors.white70),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _OrganSummaryChip extends StatelessWidget {
  const _OrganSummaryChip({required this.summary});

  final OrganSummary summary;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final tone = _toneForSeverity(summary.worstSeverity);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: tone.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: tone.withValues(alpha: 0.22)),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            summary.organId.toUpperCase(),
            style: theme.textTheme.labelMedium?.copyWith(
              color: Colors.white,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            '${summary.abnormalCount}/${summary.indicatorCount} alerts',
            style: theme.textTheme.bodySmall?.copyWith(color: Colors.white70),
          ),
        ],
      ),
    );
  }
}

class _AdvicePanel extends StatelessWidget {
  const _AdvicePanel({required this.advice});

  final PatientAdvice advice;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final tone = switch (advice.priorityLevel) {
      'high' => const Color(0xFFEF4444),
      'low' => const Color(0xFF10B981),
      _ => const Color(0xFFF59E0B),
    };

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: tone.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: tone.withValues(alpha: 0.22)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  'Member 2 Advice',
                  style: theme.textTheme.titleSmall?.copyWith(
                    color: Colors.white,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: tone.withValues(alpha: 0.16),
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Text(
                  advice.priorityLevel.toUpperCase(),
                  style: theme.textTheme.labelSmall?.copyWith(
                    color: tone,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ],
          ),
          if (advice.overallAssessment.isNotEmpty) ...[
            const SizedBox(height: 10),
            Text(
              advice.overallAssessment,
              style: theme.textTheme.bodySmall?.copyWith(
                color: Colors.white.withValues(alpha: 0.9),
                height: 1.45,
              ),
            ),
          ],
          if (advice.organAdvice.isNotEmpty) ...[
            const SizedBox(height: 12),
            for (final item in advice.organAdvice.take(3)) ...[
              _AdviceBullet(text: '${item.organId}: ${item.advice}'),
              const SizedBox(height: 8),
            ],
          ],
          if (advice.generalRecommendations.isNotEmpty) ...[
            const SizedBox(height: 4),
            for (final item in advice.generalRecommendations.take(3)) ...[
              _AdviceBullet(text: item),
              const SizedBox(height: 8),
            ],
          ],
          if (advice.disclaimer.isNotEmpty) ...[
            const SizedBox(height: 6),
            Text(
              advice.disclaimer,
              style:
                  theme.textTheme.labelSmall?.copyWith(color: Colors.white54),
            ),
          ],
        ],
      ),
    );
  }
}

class _AdviceBullet extends StatelessWidget {
  const _AdviceBullet({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 6,
          height: 6,
          margin: const EdgeInsets.only(top: 6),
          decoration: const BoxDecoration(
            color: Color(0xFF38BDF8),
            shape: BoxShape.circle,
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Text(
            text,
            style: theme.textTheme.bodySmall?.copyWith(
              color: Colors.white70,
              height: 1.45,
            ),
          ),
        ),
      ],
    );
  }
}

Color _toneForSeverity(String severity) {
  return switch (severity) {
    'critical' => const Color(0xFFEF4444),
    'abnormal_high' => const Color(0xFFF59E0B),
    'abnormal_low' => const Color(0xFF38BDF8),
    'normal' => const Color(0xFF10B981),
    _ => const Color(0xFF94A3B8),
  };
}
