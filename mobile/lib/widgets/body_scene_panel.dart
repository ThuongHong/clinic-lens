import 'package:flutter/material.dart';

import '../models/lab_analysis.dart';

class BodyScenePanel extends StatelessWidget {
  const BodyScenePanel({super.key, required this.highlightedOrgans});

  final List<LabResult> highlightedOrgans;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final urgentCount = highlightedOrgans.where((result) => result.severity != 'normal').length;

    return Container(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(28),
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFF10253D), Color(0xFF07111F)],
        ),
        border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
        boxShadow: const [
          BoxShadow(
            color: Color(0x66000000),
            blurRadius: 30,
            offset: Offset(0, 20),
          ),
        ],
      ),
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                decoration: BoxDecoration(
                  color: theme.colorScheme.primary.withValues(alpha: 0.18),
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Text(
                  '3D highlight overlay',
                  style: theme.textTheme.labelLarge?.copyWith(
                    color: theme.colorScheme.primary,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
              const Spacer(),
              Text(
                '$urgentCount alert(s)',
                style: theme.textTheme.labelLarge?.copyWith(
                  color: urgentCount == 0 ? Colors.white70 : const Color(0xFFF87171),
                  fontWeight: FontWeight.w700,
                ),
              ),
            ],
          ),
          const SizedBox(height: 20),
          Expanded(
            child: Stack(
              alignment: Alignment.center,
              children: [
                _BodySilhouette(highlightedOrgans: highlightedOrgans),
                Positioned(
                  top: 28,
                  child: _OrganTag(
                    organId: 'liver',
                    label: 'Liver',
                    result: _findResult('liver'),
                  ),
                ),
                Positioned(
                  top: 126,
                  left: 42,
                  child: _OrganTag(
                    organId: 'heart',
                    label: 'Heart',
                    result: _findResult('heart'),
                  ),
                ),
                Positioned(
                  top: 190,
                  right: 42,
                  child: _OrganTag(
                    organId: 'lungs',
                    label: 'Lungs',
                    result: _findResult('lungs'),
                  ),
                ),
                Positioned(
                  bottom: 90,
                  left: 38,
                  child: _OrganTag(
                    organId: 'kidneys',
                    label: 'Kidneys',
                    result: _findResult('kidneys'),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  LabResult? _findResult(String organId) {
    for (final result in highlightedOrgans) {
      if (result.organId == organId) {
        return result;
      }
    }
    return null;
  }
}

class _BodySilhouette extends StatelessWidget {
  const _BodySilhouette({required this.highlightedOrgans});

  final List<LabResult> highlightedOrgans;

  @override
  Widget build(BuildContext context) {
    final accent = highlightedOrgans.any((result) => result.organId == 'kidneys' && result.severity != 'normal')
        ? const Color(0xFFF87171)
        : const Color(0xFF38BDF8);

    return SizedBox(
      height: 420,
      width: 260,
      child: Stack(
        alignment: Alignment.center,
        children: [
          Container(
            width: 112,
            height: 380,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(56),
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [accent.withValues(alpha: 0.42), const Color(0xFF0F172A)],
              ),
              border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
            ),
          ),
          Positioned(
            top: 36,
            child: Container(
              width: 84,
              height: 84,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: RadialGradient(
                  colors: [Colors.white.withValues(alpha: 0.75), Colors.white.withValues(alpha: 0.12)],
                ),
              ),
            ),
          ),
          Positioned(
            top: 126,
            child: Container(
              width: 168,
              height: 88,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(40),
                color: Colors.white.withValues(alpha: 0.08),
              ),
            ),
          ),
          Positioned(
            top: 220,
            child: Container(
              width: 130,
              height: 116,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(28),
                color: Colors.white.withValues(alpha: 0.05),
              ),
            ),
          ),
          Positioned(
            bottom: 14,
            child: Container(
              width: 98,
              height: 68,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(22),
                color: Colors.white.withValues(alpha: 0.06),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _OrganTag extends StatelessWidget {
  const _OrganTag({required this.organId, required this.label, required this.result});

  final String organId;
  final String label;
  final LabResult? result;

  @override
  Widget build(BuildContext context) {
    final hasIssue = result != null && result!.severity != 'normal';
    final backgroundColor = hasIssue ? const Color(0xFFF87171) : const Color(0xFF10B981);
    final textColor = Colors.white;

    return AnimatedContainer(
      duration: const Duration(milliseconds: 250),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: backgroundColor.withValues(alpha: hasIssue ? 0.28 : 0.18),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: backgroundColor.withValues(alpha: 0.5)),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            label,
            style: Theme.of(context).textTheme.labelLarge?.copyWith(
              color: textColor,
              fontWeight: FontWeight.w700,
            ),
          ),
          Text(
            hasIssue ? result!.severity : 'normal',
            style: Theme.of(context).textTheme.labelSmall?.copyWith(
              color: textColor.withValues(alpha: 0.82),
            ),
          ),
          Text(
            organId,
            style: Theme.of(context).textTheme.labelSmall?.copyWith(
              color: textColor.withValues(alpha: 0.65),
            ),
          ),
        ],
      ),
    );
  }
}
