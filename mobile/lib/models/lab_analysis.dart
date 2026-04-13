class LabAnalysis {
  const LabAnalysis({
    required this.status,
    required this.analysisDate,
    required this.results,
    this.patientName,
  });

  final String status;
  final String analysisDate;
  final String? patientName;
  final List<LabResult> results;

  factory LabAnalysis.fromJson(Map<String, dynamic> json) {
    final rawResults = json['results'];
    final results = rawResults is List
        ? rawResults
            .whereType<Map<String, dynamic>>()
            .map(LabResult.fromJson)
            .toList(growable: false)
        : const <LabResult>[];

    return LabAnalysis(
      status: json['status']?.toString() ?? 'unknown',
      analysisDate: json['analysis_date']?.toString() ?? '',
      patientName: json['patient_name']?.toString(),
      results: results,
    );
  }

  Map<String, dynamic> toJson() {
    return <String, dynamic>{
      'status': status,
      'analysis_date': analysisDate,
      if (patientName != null) 'patient_name': patientName,
      'results': results.map((result) => result.toJson()).toList(growable: false),
    };
  }
}

class LabResult {
  const LabResult({
    required this.indicatorName,
    required this.value,
    required this.unit,
    required this.referenceRange,
    required this.organId,
    required this.severity,
    required this.patientAdvice,
  });

  final String indicatorName;
  final String value;
  final String unit;
  final String referenceRange;
  final String organId;
  final String severity;
  final String patientAdvice;

  factory LabResult.fromJson(Map<String, dynamic> json) {
    return LabResult(
      indicatorName: json['indicator_name']?.toString() ?? '',
      value: json['value']?.toString() ?? '',
      unit: json['unit']?.toString() ?? '',
      referenceRange: json['reference_range']?.toString() ?? '',
      organId: json['organ_id']?.toString() ?? '',
      severity: json['severity']?.toString() ?? 'normal',
      patientAdvice: json['patient_advice']?.toString() ?? '',
    );
  }

  Map<String, dynamic> toJson() {
    return <String, dynamic>{
      'indicator_name': indicatorName,
      'value': value,
      'unit': unit,
      'reference_range': referenceRange,
      'organ_id': organId,
      'severity': severity,
      'patient_advice': patientAdvice,
    };
  }
}

extension OrganSeverityColor on String {
  bool get isCritical => this == 'critical';
  bool get isAbnormalHigh => this == 'abnormal_high';
  bool get isAbnormalLow => this == 'abnormal_low';
}
