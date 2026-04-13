import 'package:flutter/material.dart';

import '../models/lab_analysis.dart';

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
    final abnormalCount = highlightedOrgans.where((result) => result.severity != 'normal').length;
    final criticalCount = highlightedOrgans.where((result) => result.severity == 'critical').length;

    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(28),
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: <Color>[Color(0xFF11243A), Color(0xFF0B1526), Color(0xFF09111D)],
        ),
        border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
        boxShadow: const <BoxShadow>[
          BoxShadow(
            color: Color(0x55000000),
            blurRadius: 34,
            offset: Offset(0, 18),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Wrap(
            alignment: WrapAlignment.spaceBetween,
            runSpacing: 12,
            spacing: 12,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: <Widget>[
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  Text(
                    'Body response map',
                    style: theme.textTheme.titleLarge?.copyWith(
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    '2D silhouette with animated organ states and quick clinical cues.',
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: Colors.white70,
                    ),
                  ),
                ],
              ),
              Wrap(
                spacing: 10,
                runSpacing: 10,
                children: <Widget>[
                  _MetricChip(
                    label: 'Tracked organs',
                    value: '${_organSpecs.length}',
                    tone: const Color(0xFF38BDF8),
                  ),
                  _MetricChip(
                    label: 'Alerts',
                    value: '$abnormalCount',
                    tone: abnormalCount == 0 ? const Color(0xFF10B981) : const Color(0xFFF59E0B),
                  ),
                  _MetricChip(
                    label: 'Critical',
                    value: '$criticalCount',
                    tone: criticalCount == 0 ? const Color(0xFF94A3B8) : const Color(0xFFEF4444),
                  ),
                ],
              ),
            ],
          ),
          const SizedBox(height: 18),
          const Wrap(
            spacing: 10,
            runSpacing: 10,
            children: <Widget>[
              _LegendChip(label: 'Normal', color: Color(0xFF10B981)),
              _LegendChip(label: 'Low', color: Color(0xFF38BDF8)),
              _LegendChip(label: 'High', color: Color(0xFFF59E0B)),
              _LegendChip(label: 'Critical', color: Color(0xFFEF4444)),
            ],
          ),
          const SizedBox(height: 20),
          LayoutBuilder(
            builder: (BuildContext context, BoxConstraints constraints) {
              final compact = constraints.maxWidth < 640;
              final diagramHeight = compact ? 500.0 : 560.0;

              return SizedBox(
                height: diagramHeight,
                child: Stack(
                  clipBehavior: Clip.none,
                  children: <Widget>[
                    Positioned.fill(
                      child: DecoratedBox(
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(24),
                          gradient: RadialGradient(
                            center: const Alignment(-0.1, -0.6),
                            radius: 1.15,
                            colors: <Color>[
                              Colors.white.withValues(alpha: 0.06),
                              Colors.white.withValues(alpha: 0.01),
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
          color: const Color(0xFF081120),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: palette.base.withValues(alpha: 0.42)),
        ),
        textStyle: theme.textTheme.bodySmall?.copyWith(
          color: Colors.white,
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
                gradient: LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: <Color>[
                    palette.base.withValues(alpha: active ? 0.22 : 0.14),
                    const Color(0xFF09111D).withValues(alpha: 0.96),
                  ],
                ),
                border: Border.all(
                  color: palette.base.withValues(alpha: active ? 0.5 : 0.22),
                ),
                boxShadow: <BoxShadow>[
                  BoxShadow(
                    color: palette.base.withValues(alpha: highlighted ? 0.26 : 0.1),
                    blurRadius: highlighted ? 22 : 10,
                    spreadRadius: highlighted ? 2 : 0,
                    offset: const Offset(0, 10),
                  ),
                ],
              ),
              child: Padding(
                padding: EdgeInsets.symmetric(
                  horizontal: compact ? 12 : 14,
                  vertical: compact ? 10 : 12,
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
                            color: palette.base.withValues(alpha: 0.18),
                            border: Border.all(
                              color: palette.base.withValues(alpha: 0.4),
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
                              color: Colors.white,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 10),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
                      decoration: BoxDecoration(
                        color: palette.base.withValues(alpha: 0.14),
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: Text(
                        badgeLabel,
                        style: theme.textTheme.labelSmall?.copyWith(
                          color: palette.base,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      active
                          ? '${result!.indicatorName}: ${result!.value} ${result!.unit}'
                          : 'Tap to view expected mapping for this organ.',
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: Colors.white.withValues(alpha: 0.82),
                        height: 1.35,
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
    required this.label,
    required this.value,
    required this.tone,
  });

  final String label;
  final String value;
  final Color tone;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: tone.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: tone.withValues(alpha: 0.28)),
      ),
      child: RichText(
        text: TextSpan(
          children: <InlineSpan>[
            TextSpan(
              text: '$value  ',
              style: theme.textTheme.titleMedium?.copyWith(
                color: Colors.white,
                fontWeight: FontWeight.w800,
              ),
            ),
            TextSpan(
              text: label,
              style: theme.textTheme.bodySmall?.copyWith(
                color: Colors.white70,
                height: 1.3,
              ),
            ),
          ],
        ),
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
        color: Colors.white.withValues(alpha: 0.04),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
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
              color: Colors.white70,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
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
      return const _SeverityPalette(Color(0xFFEF4444));
    case 'abnormal_high':
      return const _SeverityPalette(Color(0xFFF59E0B));
    case 'abnormal_low':
      return const _SeverityPalette(Color(0xFF38BDF8));
    case 'normal':
      return const _SeverityPalette(Color(0xFF10B981));
    default:
      return const _SeverityPalette(Color(0xFF94A3B8));
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

class _BodySilhouettePainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final centerX = size.width / 2;
    final bodyPaint = Paint()
      ..shader = const LinearGradient(
        begin: Alignment.topCenter,
        end: Alignment.bottomCenter,
        colors: <Color>[
          Color(0xFF334155),
          Color(0xFF162132),
          Color(0xFF0B1220),
        ],
      ).createShader(Offset.zero & size);

    final outlinePaint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.4
      ..color = Colors.white.withValues(alpha: 0.08);

    final glowPaint = Paint()
      ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 30)
      ..color = const Color(0xFF38BDF8).withValues(alpha: 0.12);

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
