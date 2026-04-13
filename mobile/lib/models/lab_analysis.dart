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

  int get indicatorCount => results.length;
  int get abnormalCount => results.where((result) => result.severity != 'normal').length;
  int get criticalCount => results.where((result) => result.severity == 'critical').length;
  int get trackedOrganCount => results.map((result) => result.organId).where((organId) => organId.isNotEmpty).toSet().length;
  List<LabResult> get abnormalResults =>
      results.where((result) => result.severity != 'normal').toList(growable: false);
  String get displayPatientName => (patientName != null && patientName!.trim().isNotEmpty) ? patientName!.trim() : 'Unknown patient';

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

class AnalysisHistoryEntry {
  const AnalysisHistoryEntry({
    required this.id,
    required this.createdAt,
    required this.analysis,
    this.objectKey,
    this.fileUrl,
  });

  final String id;
  final DateTime createdAt;
  final String? objectKey;
  final String? fileUrl;
  final LabAnalysis analysis;

  int get abnormalCount => analysis.abnormalCount;
  int get criticalCount => analysis.criticalCount;
  int get indicatorCount => analysis.indicatorCount;
  String get title => analysis.displayPatientName;

  factory AnalysisHistoryEntry.fromJson(Map<String, dynamic> json) {
    final analysisJson = json['analysis'];
    final createdAtString = json['created_at']?.toString();

    return AnalysisHistoryEntry(
      id: json['id']?.toString() ?? '',
      createdAt: DateTime.tryParse(createdAtString ?? '') ?? DateTime.fromMillisecondsSinceEpoch(0),
      objectKey: json['object_key']?.toString(),
      fileUrl: json['file_url']?.toString(),
      analysis: analysisJson is Map<String, dynamic>
          ? LabAnalysis.fromJson(analysisJson)
          : const LabAnalysis(
              status: 'unknown',
              analysisDate: '',
              results: <LabResult>[],
            ),
    );
  }

  Map<String, dynamic> toJson() {
    return <String, dynamic>{
      'id': id,
      'created_at': createdAt.toIso8601String(),
      if (objectKey != null) 'object_key': objectKey,
      if (fileUrl != null) 'file_url': fileUrl,
      'analysis': analysis.toJson(),
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
