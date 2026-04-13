import 'package:flutter/material.dart';

import '../models/lab_analysis.dart';

/// Results panel showing analysis
class AnalysisResultsPanel extends StatelessWidget {
  const AnalysisResultsPanel({super.key, required this.analysis});

  final LabAnalysis analysis;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isError = analysis.status == 'error';

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
            )
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Analysis Details',
              style: theme.textTheme.titleMedium
                  ?.copyWith(fontWeight: FontWeight.w800, color: const Color(0xFF0F172A)),
            ),
            const SizedBox(height: 8),
            Text(
              'Date: ${analysis.analysisDate}',
              style: theme.textTheme.bodyMedium?.copyWith(color: const Color(0xFF64748B), fontWeight: FontWeight.w500),
            ),
            const SizedBox(height: 16),
            if (isError) ...[
              Text(
                analysis.errorMessage ??
                    'The AI pipeline could not extract a valid medical report.',
                style: theme.textTheme.bodySmall
                    ?.copyWith(color: const Color(0xFFFCA5A5)),
              ),
            ] else
              // Results list
              for (final result in analysis.results) ...[
                ResultItem(result: result),
                const SizedBox(height: 8),
              ],
          ],
        ),
      ),
    );
  }
}

/// Individual result item
class ResultItem extends StatelessWidget {
  const ResultItem({super.key, required this.result});

  final LabResult result;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isAbnormal = result.severity != 'normal';
    final color = isAbnormal ? const Color(0xFFFF007F) : const Color(0xFF10B981); // Magenta vs Emerald
    final bgColor = isAbnormal ? const Color(0xFFFFF1F8) : const Color(0xFFECFDF5);
    final borderColor = isAbnormal ? const Color(0xFFFCC2D7) : const Color(0xFFA7F3D0);

    return Semantics(
      label: '${result.indicatorName} result: ${result.value} ${result.unit}',
      hint: result.patientAdvice.isNotEmpty ? 'Advice: ${result.patientAdvice}' : null,
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: bgColor,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: borderColor),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(
                    color: Colors.white,
                    shape: BoxShape.circle,
                    boxShadow: [
                      BoxShadow(
                        color: color.withValues(alpha: 0.2),
                        blurRadius: 10,
                        offset: const Offset(0, 4),
                      )
                    ],
                  ),
                  child: Icon(
                    isAbnormal ? Icons.warning_rounded : Icons.check_rounded,
                    color: color,
                    size: 20,
                  ),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Text(
                    result.indicatorName,
                    style: theme.textTheme.bodyMedium?.copyWith(
                      fontWeight: FontWeight.w800,
                      color: const Color(0xFF0F172A),
                      fontSize: 16,
                    ),
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                  decoration: BoxDecoration(
                    color: const Color(0xFF1E293B), // Dark pill
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(
                        isAbnormal ? Icons.priority_high_rounded : Icons.done_rounded,
                        color: isAbnormal ? const Color(0xFFFF007F) : Colors.white,
                        size: 14,
                      ),
                      const SizedBox(width: 4),
                      Text(
                        result.severity.replaceAll('_', ' ').toUpperCase(),
                        style: theme.textTheme.labelMedium?.copyWith(
                          color: Colors.white,
                          fontWeight: FontWeight.w800,
                          letterSpacing: 0.5,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            Padding(
              padding: const EdgeInsets.only(left: 54, top: 4),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.baseline,
                textBaseline: TextBaseline.alphabetic,
                children: [
                  Text(
                    result.value,
                    style: theme.textTheme.headlineMedium?.copyWith(
                      color: color,
                      fontWeight: FontWeight.w800,
                      letterSpacing: -1.0,
                    ),
                  ),
                  const SizedBox(width: 8),
                  Text(
                    '${result.unit} • Ref: ${result.referenceRange}',
                    style: theme.textTheme.bodyMedium?.copyWith(
                      color: const Color(0xFF64748B),
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ],
              ),
            ),
            if (result.patientAdvice.isNotEmpty) ...[
              const SizedBox(height: 12),
              Padding(
                padding: const EdgeInsets.only(left: 54),
                child: Text(
                  result.patientAdvice,
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: const Color(0xFF334155),
                    fontWeight: FontWeight.w500,
                    height: 1.5,
                  ),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
