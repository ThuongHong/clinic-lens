import 'package:flutter/material.dart';

class OrganVisual {
  const OrganVisual({
    required this.label,
    required this.icon,
    required this.tone,
    required this.description,
  });

  final String label;
  final IconData icon;
  final Color tone;
  final String description;
}

const List<String> trackedOrganOrder = <String>[
  'heart',
  'lungs',
  'liver',
  'kidneys',
  'pancreas',
  'thyroid',
  'blood',
  'bone',
  'immune',
  'other',
];

OrganVisual organVisualFor(String organId) {
  switch (organId) {
    case 'kidneys':
      return const OrganVisual(
        label: 'Kidneys',
        icon: Icons.water_drop_rounded,
        tone: Color(0xFF0284C7),
        description: 'Filtration and hydration balance',
      );
    case 'liver':
      return const OrganVisual(
        label: 'Liver',
        icon: Icons.restaurant_rounded,
        tone: Color(0xFFF59E0B),
        description: 'Metabolism and liver enzymes',
      );
    case 'heart':
      return const OrganVisual(
        label: 'Heart',
        icon: Icons.favorite_rounded,
        tone: Color(0xFFFF007F),
        description: 'Cardiovascular risk markers',
      );
    case 'lungs':
      return const OrganVisual(
        label: 'Lungs',
        icon: Icons.air_rounded,
        tone: Color(0xFF06B6D4),
        description: 'Respiratory related indicators',
      );
    case 'pancreas':
      return const OrganVisual(
        label: 'Pancreas',
        icon: Icons.monitor_heart_rounded,
        tone: Color(0xFF8B5CF6),
        description: 'Glucose and insulin regulation',
      );
    case 'thyroid':
      return const OrganVisual(
        label: 'Thyroid',
        icon: Icons.bolt_rounded,
        tone: Color(0xFF10B981),
        description: 'Hormonal balance and metabolism',
      );
    case 'blood':
      return const OrganVisual(
        label: 'Blood',
        icon: Icons.water_drop_outlined,
        tone: Color(0xFF7C3AED),
        description: 'Blood count and hematology',
      );
    case 'bone':
      return const OrganVisual(
        label: 'Bone',
        icon: Icons.accessibility_new_rounded,
        tone: Color(0xFF64748B),
        description: 'Mineral and bone metabolism',
      );
    case 'immune':
      return const OrganVisual(
        label: 'Immune',
        icon: Icons.shield_rounded,
        tone: Color(0xFF4F46E5),
        description: 'Inflammation and immune response',
      );
    default:
      return const OrganVisual(
        label: 'Other',
        icon: Icons.category_rounded,
        tone: Color(0xFF94A3B8),
        description: 'Unclassified or mixed markers',
      );
  }
}

Color severityTone(String severity) {
  switch (severity) {
    case 'critical':
      return const Color(0xFFFF007F);
    case 'abnormal_high':
      return const Color(0xFFF59E0B);
    case 'abnormal_low':
      return const Color(0xFF38BDF8);
    case 'normal':
      return const Color(0xFF10B981);
    default:
      return const Color(0xFF94A3B8);
  }
}

IconData severityIcon(String severity) {
  switch (severity) {
    case 'critical':
      return Icons.priority_high_rounded;
    case 'abnormal_high':
      return Icons.trending_up_rounded;
    case 'abnormal_low':
      return Icons.trending_down_rounded;
    case 'normal':
      return Icons.check_circle_rounded;
    default:
      return Icons.help_outline_rounded;
  }
}

String severityLabel(String severity) {
  switch (severity) {
    case 'critical':
      return 'Critical';
    case 'abnormal_high':
      return 'High';
    case 'abnormal_low':
      return 'Low';
    case 'normal':
      return 'Normal';
    default:
      return 'Unknown';
  }
}
