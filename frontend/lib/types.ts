export type Severity = 'normal' | 'abnormal_high' | 'abnormal_low' | 'critical' | 'unknown';

export type ReferenceRangeType = 'numeric' | 'threshold' | 'qualitative' | 'unknown';

export interface NumericReferenceRange {
    min: number | null;
    max: number | null;
    inclusive_min: boolean;
    inclusive_max: boolean;
}

export interface ThresholdReferenceRange {
    operator: '<' | '<=' | '>' | '>=' | '=' | null;
    value: number | null;
}

export interface QualitativeReferenceBand {
    label_en: string;
    label_original: string;
    rule_text: string;
}

export interface QualitativeReferenceRange {
    matched_label_en: string;
    matched_label_original: string;
    bands: QualitativeReferenceBand[];
}

export interface ReferenceRangeStructured {
    type: ReferenceRangeType;
    normalized_text_en: string;
    numeric: NumericReferenceRange | null;
    threshold: ThresholdReferenceRange | null;
    qualitative: QualitativeReferenceRange | null;
}

export interface LabResult {
    indicator_name: string;
    indicator_name_en?: string;
    indicator_name_original?: string;
    value: string;
    value_original?: string;
    unit: string;
    unit_original?: string;
    reference_range: string;
    reference_range_original?: string;
    reference_range_structured?: ReferenceRangeStructured;
    organ_id: string;
    severity: Severity;
    patient_advice: string;
}

export interface OrganSummary {
    organ_id: string;
    worst_severity: Severity;
    indicator_count: number;
    abnormal_count: number;
}

export interface HighlightedResult {
    indicator_name: string;
    value: string;
    unit: string;
    organ_id: string;
    severity: Severity;
}

export interface LabAnalysisSummary {
    total_results: number;
    abnormal_results: number;
    organ_summary: OrganSummary[];
    highlighted_results: HighlightedResult[];
}

export interface OrganAdvice {
    organ_id: string;
    risk: string;
    summary: string;
    advice: string;
}

export interface PatientAdvice {
    status: string;
    patient_name?: string;
    analysis_date?: string;
    overall_assessment: string;
    priority_level: string;
    organ_advice: OrganAdvice[];
    general_recommendations: string[];
    disclaimer: string;
    error_message?: string;
}

export interface LabAnalysis {
    status: string;
    analysis_date: string;
    patient_name?: string;
    results: LabResult[];
    summary?: LabAnalysisSummary;
    advice?: PatientAdvice;
    error_code?: string;
    error_message?: string;
    history_id?: string;
    created_at?: string;
}

export interface AnalysisHistoryEntry {
    id: string;
    created_at: string;
    object_key?: string;
    file_url?: string;
    source_file_name?: string;
    analysis: LabAnalysis;
}

export interface SseEvent {
    event: string;
    data: string;
}

export interface StsTokenResponse {
    AccessKeyId: string;
    AccessKeySecret: string;
    SecurityToken: string;
    Expiration: string;
    Bucket: string;
    Region: string;
}

export interface UploadResult {
    objectKey: string;
    objectUrl: string;
    bucket: string;
    region: string;
}

export interface ChatAssistantPayload {
    answer_text: string;
    risk_level: string;
    cited_indicators: string[];
    cited_organs: string[];
    recommended_actions: string[];
    follow_up_questions: string[];
    disclaimer: string;
    escalation: boolean;
}

export interface ChatResultEvent {
    history_id: string;
    conversation_id: string;
    model?: string;
    language?: string;
    detail_level?: string;
    stream_completed?: boolean;
    message_count?: number;
    assistant: ChatAssistantPayload;
}

export interface IndicatorExplanation {
    what_is_it: string;
    when_to_be_concerned: string[];
    what_to_do_next: string[];
    disclaimer: string;
}

export interface IndicatorExplanationResponse {
    indicator_name: string;
    organ_id: string;
    severity: string;
    explanation: IndicatorExplanation;
    model?: string;
    cached?: boolean;
}