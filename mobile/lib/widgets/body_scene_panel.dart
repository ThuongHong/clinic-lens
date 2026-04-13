import 'package:flutter/material.dart';

import '../models/lab_analysis.dart';
import 'lab_visuals.dart';

class BodyScenePanel extends StatelessWidget {
  const BodyScenePanel({super.key, required this.highlightedOrgans});

  final List<LabResult> highlightedOrgans;

  static const List<_OrganSpec> _organSpecs = <_OrganSpec>[
    _OrganSpec(
      organId: 'heart',
      label: 'Heart',
      icon: Icons.favorite_rounded,
      tagAlignment: Alignment(-0.9, -0.34),
      regionAlignment: Alignment(-0.12, -0.3),
      regionSize: Size(0.16, 0.11),
    ),
    _OrganSpec(
      organId: 'lungs',
      label: 'Lungs',
      icon: Icons.air_rounded,
      tagAlignment: Alignment(0.88, -0.08),
      regionAlignment: Alignment(0, -0.24),
      regionSize: Size(0.34, 0.17),
    ),
    _OrganSpec(
      organId: 'liver',
      label: 'Liver',
      icon: Icons.water_drop_rounded,
      tagAlignment: Alignment(0.9, -0.56),
      regionAlignment: Alignment(0.1, -0.04),
      regionSize: Size(0.28, 0.11),
    ),
    _OrganSpec(
      organId: 'kidneys',
      label: 'Kidneys',
      icon: Icons.opacity_rounded,
      tagAlignment: Alignment(-0.88, 0.42),
      regionAlignment: Alignment(0, 0.3),
      regionSize: Size(0.24, 0.12),
    ),
  ];

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final organResults = <String, LabResult>{
      for (final result in highlightedOrgans) result.organId: result,
    };
    final focusResults = _focusResults(highlightedOrgans);
    final abnormalCount = highlightedOrgans.where((result) => result.severity != 'normal').length;
    final criticalCount = highlightedOrgans.where((result) => result.severity == 'critical').length;

    return Container(
      padding: const EdgeInsets.all(28),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(32),
        border: Border.all(color: const Color(0xFFE2E8F0)),
        boxShadow: const <BoxShadow>[
          BoxShadow(
            color: Color(0x0A000000),
            blurRadius: 28,
            offset: Offset(0, 14),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Text(
                      'Body visualization',
                      style: theme.textTheme.titleLarge?.copyWith(
                        fontWeight: FontWeight.w800,
                        color: const Color(0xFF0F172A),
                        letterSpacing: -0.6,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'Silhouette-first map with organ-level highlights and severity cues.',
                      style: theme.textTheme.bodyMedium?.copyWith(
                        color: const Color(0xFF64748B),
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 12),
              Wrap(
                spacing: 10,
                runSpacing: 10,
                children: <Widget>[
                  _MetricChip(
                    icon: Icons.category_rounded,
                    label: 'Tracked',
                    value: '${_organSpecs.length}',
                    tone: const Color(0xFF0284C7),
                  ),
                  _MetricChip(
                    icon: Icons.warning_rounded,
                    label: 'Alerts',
                    value: '$abnormalCount',
                    tone: abnormalCount == 0 ? const Color(0xFF059669) : const Color(0xFFD97706),
                  ),
                  _MetricChip(
                    icon: Icons.priority_high_rounded,
                    label: 'Critical',
                    value: '$criticalCount',
                    tone: criticalCount == 0 ? const Color(0xFF64748B) : const Color(0xFFFF007F),
                  ),
                ],
              ),
            ],
          ),
          const SizedBox(height: 18),
          Wrap(
            spacing: 10,
            runSpacing: 10,
            children: const <Widget>[
              _LegendChip(label: 'Normal', color: Color(0xFF10B981)),
              _LegendChip(label: 'Low', color: Color(0xFF0284C7)),
              _LegendChip(label: 'High', color: Color(0xFFD97706)),
              _LegendChip(label: 'Critical', color: Color(0xFFFF007F)),
            ],
          ),
          const SizedBox(height: 20),
          LayoutBuilder(
            builder: (BuildContext context, BoxConstraints constraints) {
              final compact = constraints.maxWidth < 640;
              final diagramHeight = compact ? 480.0 : 540.0;

              return Column(
                children: <Widget>[
                  SizedBox(
                    height: diagramHeight,
                    child: Stack(
                      clipBehavior: Clip.none,
                      children: <Widget>[
                        Positioned.fill(
                          child: DecoratedBox(
                            decoration: BoxDecoration(
                              borderRadius: BorderRadius.circular(28),
                              gradient: RadialGradient(
                                center: const Alignment(-0.1, -0.6),
                                radius: 1.15,
                                colors: <Color>[
                                  const Color(0xFFF8FAFC),
                                  const Color(0xFFF1F5F9).withValues(alpha: 0.5),
                                  Colors.transparent,
                                ],
                              ),
                            ),
                          ),
                        ),
                        Align(
                          child: SizedBox(
                            width: compact ? constraints.maxWidth * 0.64 : 310,
                            height: compact ? diagramHeight * 0.86 : 460,
                            child: _BodyCanvas(organResults: organResults),
                          ),
                        ),
                        for (final spec in _organSpecs)
                          _OrganTag(
                            spec: spec,
                            result: organResults[spec.organId],
                            compact: compact,
                          ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 18),
                  _FocusRail(results: focusResults),
                ],
              );
            },
          ),
        ],
      ),
    );
  }
}

class _BodyCanvas extends StatelessWidget {
  const _BodyCanvas({required this.organResults});

  final Map<String, LabResult> organResults;

  @override
  Widget build(BuildContext context) {
    return AspectRatio(
      aspectRatio: 0.72,
      child: Stack(
        clipBehavior: Clip.none,
        children: <Widget>[
          Positioned.fill(
            child: CustomPaint(
              painter: _BodySilhouettePainter(),
            ),
          ),
          for (final spec in BodyScenePanel._organSpecs)
            Align(
              alignment: spec.regionAlignment,
              child: _AnimatedOrganRegion(
                spec: spec,
                result: organResults[spec.organId],
              ),
            ),
        ],
      ),
    );
  }
}

class _AnimatedOrganRegion extends StatelessWidget {
  const _AnimatedOrganRegion({required this.spec, required this.result});

  final _OrganSpec spec;
  final LabResult? result;

  @override
  Widget build(BuildContext context) {
    final palette = _severityPalette(result?.severity);
    final active = result != null;
    final emphasis = active && result!.severity != 'normal';

    return TweenAnimationBuilder<double>(
      tween: Tween<double>(begin: 0.92, end: emphasis ? 1.06 : 1),
      duration: const Duration(milliseconds: 750),
      curve: Curves.easeOutCubic,
      builder: (BuildContext context, double scale, Widget? child) {
        return AnimatedScale(
          duration: const Duration(milliseconds: 750),
          curve: Curves.easeOutBack,
          scale: scale,
          child: child,
        );
      },
      child: FractionallySizedBox(
        widthFactor: spec.regionSize.width,
        heightFactor: spec.regionSize.height,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 700),
          curve: Curves.easeInOutCubic,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(999),
            gradient: RadialGradient(
              colors: <Color>[
                palette.base.withValues(alpha: emphasis ? 0.95 : 0.72),
                palette.base.withValues(alpha: emphasis ? 0.4 : 0.18),
                Colors.transparent,
              ],
            ),
            border: Border.all(
              color: palette.base.withValues(alpha: emphasis ? 0.95 : 0.35),
              width: emphasis ? 1.6 : 1,
            ),
            boxShadow: <BoxShadow>[
              BoxShadow(
                color: palette.base.withValues(alpha: emphasis ? 0.55 : 0.18),
                blurRadius: emphasis ? 28 : 14,
                spreadRadius: emphasis ? 4 : 1,
              ),
            ],
          ),
          child: Center(
            child: Container(
              padding: const EdgeInsets.all(6),
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: emphasis ? 0.95 : 0.6),
                shape: BoxShape.circle,
                boxShadow: [
                  if (emphasis)
                    const BoxShadow(
                      color: Colors.black12,
                      blurRadius: 4,
                      offset: Offset(0, 2),
                    ),
                ],
              ),
              child: Icon(
                spec.icon,
                color: palette.base,
                size: 20,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _OrganTag extends StatelessWidget {
  const _OrganTag({
    required this.spec,
    required this.result,
    required this.compact,
  });

  final _OrganSpec spec;
  final LabResult? result;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final palette = _severityPalette(result?.severity);
    final active = result != null;
    final highlighted = active && result!.severity != 'normal';
    final tooltip = _tooltipText();
    final badgeLabel = active ? _severityLabel(result!.severity) : 'Awaiting data';

    return Align(
      alignment: spec.tagAlignment,
      child: Tooltip(
        triggerMode: TooltipTriggerMode.tap,
        message: tooltip,
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: const Color(0xFFE2E8F0)),
          boxShadow: const [BoxShadow(color: Color(0x11000000), blurRadius: 10, offset: Offset(0,4))],
        ),
        textStyle: theme.textTheme.bodyMedium?.copyWith(
          color: const Color(0xFF0F172A),
          height: 1.45,
        ),
        child: AnimatedScale(
          duration: const Duration(milliseconds: 550),
          curve: Curves.easeOutBack,
          scale: highlighted ? 1.03 : 1,
          child: ConstrainedBox(
            constraints: BoxConstraints(
              maxWidth: compact ? 146 : 178,
            ),
            child: DecoratedBox(
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(20),
                color: Colors.white,
                border: Border.all(
                  color: palette.base.withValues(alpha: active ? 0.3 : 0.1),
                  width: active ? 1.5 : 1.0,
                ),
                boxShadow: <BoxShadow>[
                  BoxShadow(
                    color: palette.base.withValues(alpha: highlighted ? 0.15 : 0.05),
                    blurRadius: highlighted ? 18 : 8,
                    spreadRadius: highlighted ? 2 : 0,
                    offset: const Offset(0, 6),
                  ),
                ],
              ),
              child: Padding(
                padding: EdgeInsets.symmetric(
                  horizontal: compact ? 10 : 12,
                  vertical: compact ? 9 : 10,
                ),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Row(
                      children: <Widget>[
                        Container(
                          width: compact ? 28 : 32,
                          height: compact ? 28 : 32,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            color: palette.base.withValues(alpha: 0.1),
                            border: Border.all(
                              color: palette.base.withValues(alpha: 0.2),
                            ),
                          ),
                          child: Icon(
                            spec.icon,
                            size: compact ? 16 : 18,
                            color: palette.base,
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Text(
                            spec.label,
                            style: theme.textTheme.labelLarge?.copyWith(
                              color: const Color(0xFF0F172A),
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 10),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                      decoration: BoxDecoration(
                        color: active ? const Color(0xFF1E293B) : const Color(0xFFF1F5F9), // Dark pill if active
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: Text(
                        badgeLabel,
                        style: theme.textTheme.labelSmall?.copyWith(
                          color: active ? Colors.white : const Color(0xFF64748B),
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  String _tooltipText() {
    if (result == null) {
      return '${spec.label}\nNo lab marker mapped yet.';
    }

    return [
      spec.label,
      'Indicator: ${result!.indicatorName}',
      'Value: ${result!.value} ${result!.unit}',
      'Reference: ${result!.referenceRange}',
      'Severity: ${_severityLabel(result!.severity)}',
      if (result!.patientAdvice.isNotEmpty) 'Advice: ${result!.patientAdvice}',
    ].join('\n');
  }
}

class _MetricChip extends StatelessWidget {
  const _MetricChip({
    required this.icon,
    required this.label,
    required this.value,
    required this.tone,
  });

  final IconData icon;
  final String label;
  final String value;
  final Color tone;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: tone.withValues(alpha: 0.2)),
        boxShadow: const [
          BoxShadow(
            color: Color(0x05000000),
            blurRadius: 8,
            offset: Offset(0, 3),
          )
        ],
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          Container(
            width: 28,
            height: 28,
            decoration: BoxDecoration(
              color: tone.withValues(alpha: 0.12),
              shape: BoxShape.circle,
            ),
            child: Icon(icon, size: 16, color: tone),
          ),
          const SizedBox(width: 10),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: <Widget>[
              Text(
                value,
                style: theme.textTheme.titleMedium?.copyWith(
                  color: const Color(0xFF0F172A),
                  fontWeight: FontWeight.w800,
                ),
              ),
              Text(
                label,
                style: theme.textTheme.bodySmall?.copyWith(
                  color: const Color(0xFF64748B),
                  fontWeight: FontWeight.w600,
                  height: 1.2,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _LegendChip extends StatelessWidget {
  const _LegendChip({required this.label, required this.color});

  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: const Color(0xFFE2E8F0)),
        boxShadow: const [
          BoxShadow(
            color: Color(0x05000000),
            blurRadius: 4,
            offset: Offset(0, 2),
          )
        ],
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          Container(
            width: 10,
            height: 10,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: color,
              boxShadow: <BoxShadow>[
                BoxShadow(
                  color: color.withValues(alpha: 0.4),
                  blurRadius: 10,
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Text(
            label,
            style: theme.textTheme.labelMedium?.copyWith(
              color: const Color(0xFF334155),
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}

class _FocusRail extends StatelessWidget {
  const _FocusRail({required this.results});

  final List<_OrganFocus> results;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: const Color(0xFFF8FAFC),
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: const Color(0xFFE2E8F0)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Row(
            children: <Widget>[
              Container(
                width: 34,
                height: 34,
                decoration: BoxDecoration(
                  color: const Color(0xFFFF007F).withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const Icon(
                  Icons.view_in_ar_rounded,
                  color: Color(0xFFFF007F),
                  size: 18,
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Text(
                      'Organ focus',
                      style: theme.textTheme.titleSmall?.copyWith(
                        color: const Color(0xFF0F172A),
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    Text(
                      'Quick readout of affected systems',
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
          if (results.isEmpty)
            Text(
              'No focused organs yet. Run an analysis to populate the map.',
              style: theme.textTheme.bodyMedium?.copyWith(
                color: const Color(0xFF64748B),
                fontWeight: FontWeight.w500,
              ),
            )
          else
            Wrap(
              spacing: 10,
              runSpacing: 10,
              children: <Widget>[
                for (final item in results)
                  _FocusCard(focus: item),
              ],
            ),
        ],
      ),
    );
  }
}

class _FocusCard extends StatelessWidget {
  const _FocusCard({required this.focus});

  final _OrganFocus focus;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final severityColor = severityTone(focus.worstSeverity);

    return Container(
      width: 156,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: focus.visual.tone.withValues(alpha: 0.16)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Row(
            children: <Widget>[
              Container(
                width: 32,
                height: 32,
                decoration: BoxDecoration(
                  color: focus.visual.tone.withValues(alpha: 0.12),
                  shape: BoxShape.circle,
                ),
                child: Icon(
                  focus.visual.icon,
                  size: 17,
                  color: focus.visual.tone,
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  focus.visual.label,
                  style: theme.textTheme.labelLarge?.copyWith(
                    color: const Color(0xFF0F172A),
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Text(
            '${focus.count} markers',
            style: theme.textTheme.bodyMedium?.copyWith(
              color: const Color(0xFF334155),
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 6),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
            decoration: BoxDecoration(
              color: severityColor.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(999),
            ),
            child: Text(
              severityLabel(focus.worstSeverity).toUpperCase(),
              style: theme.textTheme.labelSmall?.copyWith(
                color: severityColor,
                fontWeight: FontWeight.w800,
                letterSpacing: 0.4,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _OrganFocus {
  const _OrganFocus({
    required this.organId,
    required this.visual,
    required this.count,
    required this.worstSeverity,
  });

  final String organId;
  final OrganVisual visual;
  final int count;
  final String worstSeverity;
}

List<_OrganFocus> _focusResults(List<LabResult> results) {
  final grouped = <String, List<LabResult>>{};

  for (final result in results) {
    final organId = result.organId.isEmpty ? 'other' : result.organId;
    grouped.putIfAbsent(organId, () => <LabResult>[]).add(result);
  }

  final focus = grouped.entries.map((entry) {
    final visual = organVisualFor(entry.key);
    return _OrganFocus(
      organId: entry.key,
      visual: visual,
      count: entry.value.length,
      worstSeverity: _worstSeverity(entry.value),
    );
  }).toList(growable: false);

  focus.sort((left, right) {
    final leftIndex = trackedOrganOrder.indexOf(left.organId);
    final rightIndex = trackedOrganOrder.indexOf(right.organId);
    final safeLeft = leftIndex == -1 ? trackedOrganOrder.length : leftIndex;
    final safeRight = rightIndex == -1 ? trackedOrganOrder.length : rightIndex;
    if (safeLeft != safeRight) {
      return safeLeft.compareTo(safeRight);
    }
    return right.count.compareTo(left.count);
  });

  return focus;
}

class _OrganSpec {
  const _OrganSpec({
    required this.organId,
    required this.label,
    required this.icon,
    required this.tagAlignment,
    required this.regionAlignment,
    required this.regionSize,
  });

  final String organId;
  final String label;
  final IconData icon;
  final Alignment tagAlignment;
  final Alignment regionAlignment;
  final Size regionSize;
}

class _SeverityPalette {
  const _SeverityPalette(this.base);

  final Color base;
}

_SeverityPalette _severityPalette(String? severity) {
  switch (severity) {
    case 'critical':
      return const _SeverityPalette(Color(0xFFFF007F)); // Magenta
    case 'abnormal_high':
      return const _SeverityPalette(Color(0xFFD97706)); // Amber
    case 'abnormal_low':
      return const _SeverityPalette(Color(0xFF0284C7)); // Light Blue
    case 'normal':
      return const _SeverityPalette(Color(0xFF10B981)); // Emerald
    default:
      return const _SeverityPalette(Color(0xFF94A3B8)); // Slate
  }
}

String _severityLabel(String severity) {
  switch (severity) {
    case 'critical':
      return 'Critical';
    case 'abnormal_high':
      return 'High risk';
    case 'abnormal_low':
      return 'Low level';
    case 'normal':
      return 'Normal';
    default:
      return 'Awaiting data';
  }
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

class _BodySilhouettePainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final centerX = size.width / 2;
    final bodyPaint = Paint()
      ..shader = const LinearGradient(
        begin: Alignment.topCenter,
        end: Alignment.bottomCenter,
        colors: <Color>[
          Color(0xFFE2E8F0),
          Color(0xFFF1F5F9),
          Color(0xFFFFFFFF),
        ],
      ).createShader(Offset.zero & size);

    final outlinePaint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.4
      ..color = const Color(0xFFCBD5E1);

    final glowPaint = Paint()
      ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 30)
      ..color = const Color(0xFFCBD5E1).withValues(alpha: 0.12);

    final headRect = Rect.fromCenter(
      center: Offset(centerX, size.height * 0.12),
      width: size.width * 0.24,
      height: size.width * 0.24,
    );

    final torso = RRect.fromRectAndRadius(
      Rect.fromCenter(
        center: Offset(centerX, size.height * 0.47),
        width: size.width * 0.36,
        height: size.height * 0.56,
      ),
      const Radius.circular(90),
    );

    final shoulderRect = RRect.fromRectAndRadius(
      Rect.fromCenter(
        center: Offset(centerX, size.height * 0.28),
        width: size.width * 0.66,
        height: size.height * 0.12,
      ),
      const Radius.circular(42),
    );

    final hipRect = RRect.fromRectAndRadius(
      Rect.fromCenter(
        center: Offset(centerX, size.height * 0.68),
        width: size.width * 0.48,
        height: size.height * 0.12,
      ),
      const Radius.circular(34),
    );

    final leftArm = RRect.fromRectAndRadius(
      Rect.fromLTWH(
        size.width * 0.1,
        size.height * 0.25,
        size.width * 0.16,
        size.height * 0.42,
      ),
      const Radius.circular(26),
    );

    final rightArm = RRect.fromRectAndRadius(
      Rect.fromLTWH(
        size.width * 0.74,
        size.height * 0.25,
        size.width * 0.16,
        size.height * 0.42,
      ),
      const Radius.circular(26),
    );

    final leftLeg = RRect.fromRectAndRadius(
      Rect.fromLTWH(
        size.width * 0.34,
        size.height * 0.72,
        size.width * 0.12,
        size.height * 0.24,
      ),
      const Radius.circular(24),
    );

    final rightLeg = RRect.fromRectAndRadius(
      Rect.fromLTWH(
        size.width * 0.54,
        size.height * 0.72,
        size.width * 0.12,
        size.height * 0.24,
      ),
      const Radius.circular(24),
    );

    canvas.drawRRect(torso, glowPaint);
    canvas.drawOval(headRect, bodyPaint);
    canvas.drawRRect(shoulderRect, bodyPaint);
    canvas.drawRRect(torso, bodyPaint);
    canvas.drawRRect(hipRect, bodyPaint);
    canvas.drawRRect(leftArm, bodyPaint);
    canvas.drawRRect(rightArm, bodyPaint);
    canvas.drawRRect(leftLeg, bodyPaint);
    canvas.drawRRect(rightLeg, bodyPaint);

    canvas.drawOval(headRect, outlinePaint);
    canvas.drawRRect(shoulderRect, outlinePaint);
    canvas.drawRRect(torso, outlinePaint);
    canvas.drawRRect(hipRect, outlinePaint);
    canvas.drawRRect(leftArm, outlinePaint);
    canvas.drawRRect(rightArm, outlinePaint);
    canvas.drawRRect(leftLeg, outlinePaint);
    canvas.drawRRect(rightLeg, outlinePaint);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
