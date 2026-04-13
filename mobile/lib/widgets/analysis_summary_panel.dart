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
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: const Color(0xFFE2E8F0)),
        boxShadow: const [
          BoxShadow(
            color: Color(0x0A000000),
            blurRadius: 20,
            offset: Offset(0, 8),
          )
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Test Summary',
            style: theme.textTheme.titleMedium
                ?.copyWith(fontWeight: FontWeight.w800, color: const Color(0xFF0F172A)),
          ),
          const SizedBox(height: 8),
          Text(
            '${analysis.displayPatientName} • ${analysis.analysisDate}',
            style: theme.textTheme.bodyMedium?.copyWith(color: const Color(0xFF64748B), fontWeight: FontWeight.w500),
          ),
          const SizedBox(height: 14),
          Wrap(
            spacing: 10,
            runSpacing: 10,
            children: [
              _SummaryChip(
                label: 'Indicators',
                value: '${analysis.indicatorCount}',
                color: const Color(0xFF0284C7),
                bgColor: const Color(0xFFF0F9FF),
              ),
              _SummaryChip(
                label: 'Alerts',
                value: '${analysis.abnormalCount}',
                color: analysis.abnormalCount == 0
                    ? const Color(0xFF059669)
                    : const Color(0xFFD97706),
                bgColor: analysis.abnormalCount == 0
                    ? const Color(0xFFECFDF5)
                    : const Color(0xFFFFFBEB),
              ),
              _SummaryChip(
                label: 'Critical',
                value: '${analysis.criticalCount}',
                color: analysis.criticalCount == 0
                    ? const Color(0xFF64748B)
                    : const Color(0xFFFF007F),
                bgColor: analysis.criticalCount == 0
                    ? const Color(0xFFF8FAFC)
                    : const Color(0xFFFFF1F8),
              ),
              _SummaryChip(
                label: 'Organs',
                value: '${analysis.trackedOrganCount}',
                color: const Color(0xFF4F46E5),
                bgColor: const Color(0xFFEEF2FF),
              ),
            ],
          ),
          const SizedBox(height: 24),
          Text(
            abnormalResults.isEmpty
                ? 'All tracked indicators are currently within normal range.'
                : 'Priority markers',
            style: theme.textTheme.titleSmall?.copyWith(
              color: const Color(0xFF0F172A),
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
              style: theme.textTheme.titleSmall?.copyWith(
                color: const Color(0xFF0F172A),
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
    required this.bgColor,
  });

  final String label;
  final String value;
  final Color color;
  final Color bgColor;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: bgColor,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: color.withValues(alpha: 0.2)),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            value,
            style: theme.textTheme.headlineSmall?.copyWith(
              color: color,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            label,
            style: theme.textTheme.bodySmall?.copyWith(
              color: const Color(0xFF475569),
              fontWeight: FontWeight.w600,
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
      'critical' => const Color(0xFFFF007F),
      'abnormal_high' => const Color(0xFFF59E0B),
      'abnormal_low' => const Color(0xFF38BDF8),
      _ => const Color(0xFF10B981),
    };

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFFE2E8F0)),
        boxShadow: const [
          BoxShadow(
            color: Color(0x08000000),
            blurRadius: 10,
            offset: Offset(0, 4),
          )
        ],
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Container(
            width: 12,
            height: 12,
            decoration: BoxDecoration(
              color: tone,
              shape: BoxShape.circle,
            ),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  result.indicatorName,
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: const Color(0xFF0F172A),
                    fontWeight: FontWeight.w700,
                  ),
                ),
                Text(
                  '${result.value} ${result.unit} • Ref ${result.referenceRange}',
                  style: theme.textTheme.bodySmall
                      ?.copyWith(color: const Color(0xFF64748B)),
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
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: tone.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: tone.withValues(alpha: 0.2)),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            summary.organId.toUpperCase(),
            style: theme.textTheme.labelMedium?.copyWith(
              color: tone.withValues(alpha: 0.8),
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            '${summary.abnormalCount}/${summary.indicatorCount} alerts',
            style: theme.textTheme.bodyMedium?.copyWith(color: const Color(0xFF334155), fontWeight: FontWeight.w600),
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
      'high' => const Color(0xFFFF007F),
      'low' => const Color(0xFF10B981),
      _ => const Color(0xFFF59E0B),
    };

    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: tone.withValues(alpha: 0.05),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: tone.withValues(alpha: 0.2)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  'Member 2 Advice',
                  style: theme.textTheme.titleMedium?.copyWith(
                    color: tone,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                decoration: BoxDecoration(
                  color: const Color(0xFF1E293B),
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Text(
                  advice.priorityLevel.toUpperCase(),
                  style: theme.textTheme.labelSmall?.copyWith(
                    color: Colors.white,
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
              style: theme.textTheme.bodyMedium?.copyWith(
                color: const Color(0xFF334155),
                height: 1.5,
              ),
            ),
          ],
          if (advice.organAdvice.isNotEmpty) ...[
            const SizedBox(height: 16),
            for (final item in advice.organAdvice.take(3)) ...[
              _AdviceBullet(text: '${item.organId}: ${item.advice}', tone: tone),
              const SizedBox(height: 10),
            ],
          ],
          if (advice.generalRecommendations.isNotEmpty) ...[
            const SizedBox(height: 8),
            for (final item in advice.generalRecommendations.take(3)) ...[
              _AdviceBullet(text: item, tone: tone),
              const SizedBox(height: 10),
            ],
          ],
          if (advice.disclaimer.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(
              advice.disclaimer,
              style:
                  theme.textTheme.labelSmall?.copyWith(color: const Color(0xFF94A3B8)),
            ),
          ],
        ],
      ),
    );
  }
}

class _AdviceBullet extends StatelessWidget {
  const _AdviceBullet({required this.text, required this.tone});

  final String text;
  final Color tone;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 6,
          height: 6,
          margin: const EdgeInsets.only(top: 8),
          decoration: BoxDecoration(
            color: tone,
            shape: BoxShape.circle,
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Text(
            text,
            style: theme.textTheme.bodyMedium?.copyWith(
              color: const Color(0xFF475569),
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
    'critical' => const Color(0xFFFF007F),
    'abnormal_high' => const Color(0xFFF59E0B),
    'abnormal_low' => const Color(0xFF38BDF8),
    'normal' => const Color(0xFF10B981),
    _ => const Color(0xFF94A3B8),
  };
}
