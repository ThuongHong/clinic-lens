export type Severity = 'normal' | 'abnormal_high' | 'abnormal_low' | 'critical' | 'unknown';

export interface LabResult {
    indicator_name: string;
    value: string;
    unit: string;
    reference_range: string;
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