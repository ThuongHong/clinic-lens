class LabAnalysis {
  const LabAnalysis({
    required this.status,
    required this.analysisDate,
    required this.results,
    this.patientName,
    this.summary,
    this.advice,
    this.errorCode,
    this.errorMessage,
  });

  final String status;
  final String analysisDate;
  final String? patientName;
  final List<LabResult> results;
  final LabAnalysisSummary? summary;
  final PatientAdvice? advice;
  final String? errorCode;
  final String? errorMessage;

  int get indicatorCount => results.length;
  int get abnormalCount =>
      results.where((result) => result.severity != 'normal').length;
  int get criticalCount =>
      results.where((result) => result.severity == 'critical').length;
  int get trackedOrganCount => results
      .map((result) => result.organId)
      .where((organId) => organId.isNotEmpty)
      .toSet()
      .length;
  List<LabResult> get abnormalResults => results
      .where((result) => result.severity != 'normal')
      .toList(growable: false);
  String get displayPatientName =>
      (patientName != null && patientName!.trim().isNotEmpty)
          ? patientName!.trim()
          : 'Unknown patient';
  bool get hasAdvice => advice?.status == 'success';

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
      summary: json['summary'] is Map<String, dynamic>
          ? LabAnalysisSummary.fromJson(json['summary'] as Map<String, dynamic>)
          : null,
      advice: json['advice'] is Map<String, dynamic>
          ? PatientAdvice.fromJson(json['advice'] as Map<String, dynamic>)
          : null,
      errorCode: json['error_code']?.toString(),
      errorMessage: json['error_message']?.toString(),
    );
  }

  Map<String, dynamic> toJson() {
    return <String, dynamic>{
      'status': status,
      'analysis_date': analysisDate,
      if (patientName != null) 'patient_name': patientName,
      if (errorCode != null) 'error_code': errorCode,
      if (errorMessage != null) 'error_message': errorMessage,
      'results':
          results.map((result) => result.toJson()).toList(growable: false),
      if (summary != null) 'summary': summary!.toJson(),
      if (advice != null) 'advice': advice!.toJson(),
    };
  }
}

class LabAnalysisSummary {
  const LabAnalysisSummary({
    required this.totalResults,
    required this.abnormalResults,
    required this.organSummary,
    required this.highlightedResults,
  });

  final int totalResults;
  final int abnormalResults;
  final List<OrganSummary> organSummary;
  final List<HighlightedResult> highlightedResults;

  factory LabAnalysisSummary.fromJson(Map<String, dynamic> json) {
    final organSummary = json['organ_summary'];
    final highlightedResults = json['highlighted_results'];

    return LabAnalysisSummary(
      totalResults: (json['total_results'] as num?)?.toInt() ?? 0,
      abnormalResults: (json['abnormal_results'] as num?)?.toInt() ?? 0,
      organSummary: organSummary is List
          ? organSummary
              .whereType<Map<String, dynamic>>()
              .map(OrganSummary.fromJson)
              .toList(growable: false)
          : const <OrganSummary>[],
      highlightedResults: highlightedResults is List
          ? highlightedResults
              .whereType<Map<String, dynamic>>()
              .map(HighlightedResult.fromJson)
              .toList(growable: false)
          : const <HighlightedResult>[],
    );
  }

  Map<String, dynamic> toJson() {
    return <String, dynamic>{
      'total_results': totalResults,
      'abnormal_results': abnormalResults,
      'organ_summary':
          organSummary.map((item) => item.toJson()).toList(growable: false),
      'highlighted_results': highlightedResults
          .map((item) => item.toJson())
          .toList(growable: false),
    };
  }
}

class OrganSummary {
  const OrganSummary({
    required this.organId,
    required this.worstSeverity,
    required this.indicatorCount,
    required this.abnormalCount,
  });

  final String organId;
  final String worstSeverity;
  final int indicatorCount;
  final int abnormalCount;

  factory OrganSummary.fromJson(Map<String, dynamic> json) {
    return OrganSummary(
      organId: json['organ_id']?.toString() ?? '',
      worstSeverity: json['worst_severity']?.toString() ?? 'unknown',
      indicatorCount: (json['indicator_count'] as num?)?.toInt() ?? 0,
      abnormalCount: (json['abnormal_count'] as num?)?.toInt() ?? 0,
    );
  }

  Map<String, dynamic> toJson() {
    return <String, dynamic>{
      'organ_id': organId,
      'worst_severity': worstSeverity,
      'indicator_count': indicatorCount,
      'abnormal_count': abnormalCount,
    };
  }
}

class HighlightedResult {
  const HighlightedResult({
    required this.indicatorName,
    required this.value,
    required this.unit,
    required this.organId,
    required this.severity,
  });

  final String indicatorName;
  final String value;
  final String unit;
  final String organId;
  final String severity;

  factory HighlightedResult.fromJson(Map<String, dynamic> json) {
    return HighlightedResult(
      indicatorName: json['indicator_name']?.toString() ?? '',
      value: json['value']?.toString() ?? '',
      unit: json['unit']?.toString() ?? '',
      organId: json['organ_id']?.toString() ?? '',
      severity: json['severity']?.toString() ?? 'unknown',
    );
  }

  Map<String, dynamic> toJson() {
    return <String, dynamic>{
      'indicator_name': indicatorName,
      'value': value,
      'unit': unit,
      'organ_id': organId,
      'severity': severity,
    };
  }
}

class PatientAdvice {
  const PatientAdvice({
    required this.status,
    required this.overallAssessment,
    required this.priorityLevel,
    required this.organAdvice,
    required this.generalRecommendations,
    required this.disclaimer,
    this.patientName,
    this.analysisDate,
    this.errorMessage,
  });

  final String status;
  final String? patientName;
  final String? analysisDate;
  final String overallAssessment;
  final String priorityLevel;
  final List<OrganAdvice> organAdvice;
  final List<String> generalRecommendations;
  final String disclaimer;
  final String? errorMessage;

  factory PatientAdvice.fromJson(Map<String, dynamic> json) {
    final organAdvice = json['organ_advice'];
    final generalRecommendations = json['general_recommendations'];

    return PatientAdvice(
      status: json['status']?.toString() ?? 'unknown',
      patientName: json['patient_name']?.toString(),
      analysisDate: json['analysis_date']?.toString(),
      overallAssessment: json['overall_assessment']?.toString() ?? '',
      priorityLevel: json['priority_level']?.toString() ?? 'medium',
      organAdvice: organAdvice is List
          ? organAdvice
              .whereType<Map<String, dynamic>>()
              .map(OrganAdvice.fromJson)
              .toList(growable: false)
          : const <OrganAdvice>[],
      generalRecommendations: generalRecommendations is List
          ? generalRecommendations
              .map((item) => item.toString())
              .toList(growable: false)
          : const <String>[],
      disclaimer: json['disclaimer']?.toString() ?? '',
      errorMessage: json['error_message']?.toString(),
    );
  }

  Map<String, dynamic> toJson() {
    return <String, dynamic>{
      'status': status,
      if (patientName != null) 'patient_name': patientName,
      if (analysisDate != null) 'analysis_date': analysisDate,
      'overall_assessment': overallAssessment,
      'priority_level': priorityLevel,
      'organ_advice':
          organAdvice.map((item) => item.toJson()).toList(growable: false),
      'general_recommendations': generalRecommendations,
      'disclaimer': disclaimer,
      if (errorMessage != null) 'error_message': errorMessage,
    };
  }
}

class OrganAdvice {
  const OrganAdvice({
    required this.organId,
    required this.risk,
    required this.summary,
    required this.advice,
  });

  final String organId;
  final String risk;
  final String summary;
  final String advice;

  factory OrganAdvice.fromJson(Map<String, dynamic> json) {
    return OrganAdvice(
      organId: json['organ_id']?.toString() ?? '',
      risk: json['risk']?.toString() ?? 'watch',
      summary: json['summary']?.toString() ?? '',
      advice: json['advice']?.toString() ?? '',
    );
  }

  Map<String, dynamic> toJson() {
    return <String, dynamic>{
      'organ_id': organId,
      'risk': risk,
      'summary': summary,
      'advice': advice,
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
      createdAt: DateTime.tryParse(createdAtString ?? '') ??
          DateTime.fromMillisecondsSinceEpoch(0),
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
