import 'package:flutter/material.dart';

import '../models/lab_analysis.dart';
import 'lab_visuals.dart';

class AnalysisResultsPanel extends StatelessWidget {
  const AnalysisResultsPanel({super.key, required this.analysis});

  final LabAnalysis analysis;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isError = analysis.status == 'error';
    final groupedResults = _groupResults(analysis.results);

    return Semantics(
      label: 'Analysis Results Panel',
      child: Container(
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
            ),
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    color: const Color(0xFFFF007F).withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: const Icon(
                    Icons.category_rounded,
                    color: Color(0xFFFF007F),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Analysis Categories',
                        style: theme.textTheme.titleMedium?.copyWith(
                          fontWeight: FontWeight.w800,
                          color: const Color(0xFF0F172A),
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        'Organ-based cards with color and severity cues',
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: const Color(0xFF64748B),
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            Wrap(
              spacing: 10,
              runSpacing: 10,
              children: [
                _MetricBadge(
                  label: 'Indicators',
                  value: '${analysis.indicatorCount}',
                  icon: Icons.analytics_rounded,
                  tone: const Color(0xFF0284C7),
                ),
                _MetricBadge(
                  label: 'Alerts',
                  value: '${analysis.abnormalCount}',
                  icon: Icons.report_rounded,
                  tone: analysis.abnormalCount == 0
                      ? const Color(0xFF10B981)
                      : const Color(0xFFF59E0B),
                ),
                _MetricBadge(
                  label: 'Critical',
                  value: '${analysis.criticalCount}',
                  icon: Icons.priority_high_rounded,
                  tone: analysis.criticalCount == 0
                      ? const Color(0xFF64748B)
                      : const Color(0xFFFF007F),
                ),
                _MetricBadge(
                  label: 'Categories',
                  value: '${groupedResults.length}',
                  icon: Icons.folder_rounded,
                  tone: const Color(0xFF4F46E5),
                ),
              ],
            ),
            const SizedBox(height: 18),
            Text(
              'Date: ${analysis.analysisDate}',
              style: theme.textTheme.bodyMedium?.copyWith(
                color: const Color(0xFF64748B),
                fontWeight: FontWeight.w500,
              ),
            ),
            if (analysis.displayPatientName != 'Unknown patient') ...[
              const SizedBox(height: 4),
              Text(
                analysis.displayPatientName,
                style: theme.textTheme.bodySmall?.copyWith(
                  color: const Color(0xFF334155),
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
            const SizedBox(height: 18),
            if (isError) ...[
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: const Color(0xFFFFF1F2),
                  borderRadius: BorderRadius.circular(18),
                  border: Border.all(color: const Color(0xFFFECDD3)),
                ),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Icon(
                      Icons.error_outline_rounded,
                      color: Color(0xFFE11D48),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Text(
                        analysis.errorMessage ??
                            'The AI pipeline could not extract a valid medical report.',
                        style: theme.textTheme.bodyMedium?.copyWith(
                          color: const Color(0xFFBE123C),
                          fontWeight: FontWeight.w500,
                          height: 1.45,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ] else if (groupedResults.isEmpty) ...[
              Text(
                'No structured indicators were extracted from this report.',
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: const Color(0xFF64748B),
                  fontWeight: FontWeight.w500,
                ),
              ),
            ] else ...[
              for (var index = 0; index < groupedResults.length; index += 1) ...[
                _OrganGroupCard(group: groupedResults[index]),
                if (index != groupedResults.length - 1) const SizedBox(height: 12),
              ],
            ],
          ],
        ),
      ),
    );
  }
}

class _MetricBadge extends StatelessWidget {
  const _MetricBadge({
    required this.label,
    required this.value,
    required this.icon,
    required this.tone,
  });

  final String label;
  final String value;
  final IconData icon;
  final Color tone;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: tone.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: tone.withValues(alpha: 0.18)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 30,
            height: 30,
            decoration: BoxDecoration(
              color: tone.withValues(alpha: 0.15),
              shape: BoxShape.circle,
            ),
            child: Icon(icon, size: 16, color: tone),
          ),
          const SizedBox(width: 10),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                value,
                style: theme.textTheme.titleMedium?.copyWith(
                  color: tone,
                  fontWeight: FontWeight.w800,
                ),
              ),
              Text(
                label,
                style: theme.textTheme.labelMedium?.copyWith(
                  color: const Color(0xFF475569),
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _OrganGroup {
  const _OrganGroup({required this.organId, required this.results});

  final String organId;
  final List<LabResult> results;

  OrganVisual get visual => organVisualFor(organId);

  int get abnormalCount => results.where((result) => result.severity != 'normal').length;
  int get criticalCount => results.where((result) => result.severity == 'critical').length;
  String get worstSeverity => _worstSeverity(results);
}

class _OrganGroupCard extends StatelessWidget {
  const _OrganGroupCard({required this.group});

  final _OrganGroup group;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final visual = group.visual;
    final severityToneColor = severityTone(group.worstSeverity);

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: visual.tone.withValues(alpha: 0.06),
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: visual.tone.withValues(alpha: 0.18)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 46,
                height: 46,
                decoration: BoxDecoration(
                  color: visual.tone.withValues(alpha: 0.16),
                  borderRadius: BorderRadius.circular(16),
                ),
                child: Icon(visual.icon, color: visual.tone, size: 24),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            visual.label,
                            style: theme.textTheme.titleMedium?.copyWith(
                              color: const Color(0xFF0F172A),
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                        ),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                          decoration: BoxDecoration(
                            color: severityToneColor.withValues(alpha: 0.1),
                            borderRadius: BorderRadius.circular(999),
                          ),
                          child: Text(
                            severityLabel(group.worstSeverity).toUpperCase(),
                            style: theme.textTheme.labelSmall?.copyWith(
                              color: severityToneColor,
                              fontWeight: FontWeight.w800,
                              letterSpacing: 0.4,
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 4),
                    Text(
                      visual.description,
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: const Color(0xFF64748B),
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              _TinyStat(label: 'Indicators', value: '${group.results.length}', tone: visual.tone),
              _TinyStat(label: 'Alerts', value: '${group.abnormalCount}', tone: const Color(0xFFF59E0B)),
              _TinyStat(label: 'Critical', value: '${group.criticalCount}', tone: const Color(0xFFFF007F)),
            ],
          ),
          const SizedBox(height: 14),
          for (var index = 0; index < group.results.length; index += 1) ...[
            _OrganResultTile(result: group.results[index], tone: visual.tone),
            if (index != group.results.length - 1) const SizedBox(height: 10),
          ],
        ],
      ),
    );
  }
}

class _TinyStat extends StatelessWidget {
  const _TinyStat({required this.label, required this.value, required this.tone});

  final String label;
  final String value;
  final Color tone;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(
        color: tone.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            value,
            style: theme.textTheme.titleSmall?.copyWith(
              color: tone,
              fontWeight: FontWeight.w800,
            ),
          ),
          Text(
            label,
            style: theme.textTheme.labelSmall?.copyWith(
              color: const Color(0xFF64748B),
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}

class _OrganResultTile extends StatelessWidget {
  const _OrganResultTile({required this.result, required this.tone});

  final LabResult result;
  final Color tone;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final severityColor = severityTone(result.severity);

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: tone.withValues(alpha: 0.12)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 38,
                height: 38,
                decoration: BoxDecoration(
                  color: severityColor.withValues(alpha: 0.12),
                  shape: BoxShape.circle,
                ),
                child: Icon(
                  severityIcon(result.severity),
                  size: 18,
                  color: severityColor,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      result.indicatorName,
                      style: theme.textTheme.bodyMedium?.copyWith(
                        color: const Color(0xFF0F172A),
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      '${result.value} ${result.unit}',
                      style: theme.textTheme.bodyLarge?.copyWith(
                        color: severityColor,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    Text(
                      'Reference ${result.referenceRange}',
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: const Color(0xFF64748B),
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 10),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                decoration: BoxDecoration(
                  color: severityColor.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Text(
                  severityLabel(result.severity).toUpperCase(),
                  style: theme.textTheme.labelSmall?.copyWith(
                    color: severityColor,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 0.4,
                  ),
                ),
              ),
            ],
          ),
          if (result.patientAdvice.isNotEmpty) ...[
            const SizedBox(height: 10),
            Text(
              result.patientAdvice,
              style: theme.textTheme.bodyMedium?.copyWith(
                color: const Color(0xFF334155),
                height: 1.45,
              ),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
          ],
        ],
      ),
    );
  }
}

List<_OrganGroup> _groupResults(List<LabResult> results) {
  final grouped = <String, List<LabResult>>{};

  for (final result in results) {
    final organId = result.organId.isEmpty ? 'other' : result.organId;
    grouped.putIfAbsent(organId, () => <LabResult>[]).add(result);
  }

  final groups = grouped.entries
      .map((entry) => _OrganGroup(organId: entry.key, results: entry.value))
      .toList(growable: false);

  groups.sort((left, right) {
    final leftIndex = trackedOrganOrder.indexOf(left.organId);
    final rightIndex = trackedOrganOrder.indexOf(right.organId);
    final safeLeft = leftIndex == -1 ? trackedOrganOrder.length : leftIndex;
    final safeRight = rightIndex == -1 ? trackedOrganOrder.length : rightIndex;

    if (safeLeft != safeRight) {
      return safeLeft.compareTo(safeRight);
    }

    return right.results.length.compareTo(left.results.length);
  });

  return groups;
}

String _worstSeverity(List<LabResult> results) {
  var current = 'normal';
  var currentRank = 1;

  for (final result in results) {
    final rank = switch (result.severity) {
      'critical' => 4,
      'abnormal_high' || 'abnormal_low' => 3,
      'normal' => 1,
      _ => 2,
    };

    if (rank > currentRank) {
      current = result.severity;
      currentRank = rank;
    }
  }

  return current;
}
