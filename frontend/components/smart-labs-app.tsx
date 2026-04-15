'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, KeyboardEvent as ReactKeyboardEvent } from 'react';

import {
    fetchIndicatorExplanation,
    fetchStsToken,
    parseAnalysis,
    parseChatResult,
    resolveBackendBaseUrl,
    streamAnalysis,
    streamChat
} from '@/lib/backend';
import { uploadFileToOss } from '@/lib/oss';
import type {
    AnalysisHistoryEntry,
    ChatAssistantPayload,
    IndicatorExplanation,
    LabAnalysis,
    SseEvent
} from '@/lib/types';

type TabKey = 'overview' | 'chat' | 'history';
type ChatRole = 'user' | 'assistant';

interface ChatMessage {
    id: string;
    role: ChatRole;
    text: string;
    assistant?: ChatAssistantPayload;
    pending?: boolean;
}

interface OverviewTabProps {
    currentAnalysis: LabAnalysis | null;
    currentResults: LabAnalysis['results'];
    selectedOrganId: string;
    onSelectOrganId: (organId: string) => void;
    visibleOrganIds: string[];
    organCounts: Map<string, number>;
    visibleResults: LabAnalysis['results'];
    selectedFile: File | null;
    analysisBusy: boolean;
    onPickFile: (event: ChangeEvent<HTMLInputElement>) => void;
    onRunAnalysis: () => Promise<void>;
    loadHistory: () => Promise<void>;
    historyLoading: boolean;
    status: string;
    analysisLogs: string[];
    uploadValidationError: string | null;
    overviewTestDate: string;
    overviewSource: string;
}

interface PatientNamePromptProps {
    patientNameDraft: string;
    setPatientNameDraft: (value: string) => void;
    onSave: () => void;
}

interface ReferenceRangeBarProps {
    value: string;
    unit: string;
    referenceRange: string;
    severity: string;
}

const ORGAN_LABELS: Record<string, string> = {
    kidneys: 'Kidneys',
    liver: 'Liver',
    heart: 'Heart',
    lungs: 'Lungs',
    blood: 'Blood',
    pancreas: 'Pancreas',
    thyroid: 'Thyroid',
    bone: 'Bone',
    immune: 'Immune',
    other: 'Other'
};

const STATUS_LABELS: Record<string, string> = {
    normal: 'Normal',
    abnormal_high: 'High',
    abnormal_low: 'Low',
    critical: 'Critical',
    unknown: 'Unknown'
};

const SESSION_HISTORY_STORAGE_KEY = 'smartlabs.session_history';
const PATIENT_NAME_STORAGE_KEY = 'smartlabs.patient_name';
const MAX_UPLOAD_SIZE_BYTES = 20 * 1024 * 1024;
const ALLOWED_UPLOAD_TYPES = new Set([
    'application/pdf',
    'image/png',
    'image/jpg',
    'image/jpeg',
    'image/webp'
]);

/* ─── SVG Icons (inline, no external dependency) ─── */
function IconUpload() {
    return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
        </svg>
    );
}
function IconFile() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
        </svg>
    );
}
function IconClock() {
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
        </svg>
    );
}
function IconRefresh() {
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
        </svg>
    );
}
function IconSend() {
    return (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
        </svg>
    );
}
function IconChat() {
    return (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
    );
}
function IconEmpty() {
    return (
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10" /><line x1="8" y1="12" x2="16" y2="12" />
        </svg>
    );
}

function OverviewTab({
    currentAnalysis,
    currentResults,
    selectedOrganId,
    onSelectOrganId,
    visibleOrganIds,
    organCounts,
    visibleResults,
    selectedFile,
    analysisBusy,
    onPickFile,
    onRunAnalysis,
    loadHistory,
    historyLoading,
    status,
    analysisLogs,
    uploadValidationError,
    overviewTestDate,
    overviewSource
}: OverviewTabProps) {
    const [activeInfoResult, setActiveInfoResult] = useState<LabAnalysis['results'][number] | null>(null);
    const [indicatorExplainCache, setIndicatorExplainCache] = useState<Record<string, IndicatorExplanation>>({});
    const [indicatorExplainLoading, setIndicatorExplainLoading] = useState(false);
    const [indicatorExplainError, setIndicatorExplainError] = useState<string | null>(null);
    const [indicatorExplainRequestVersion, setIndicatorExplainRequestVersion] = useState(0);

    const activeInfoResultKey = useMemo(() => {
        if (!activeInfoResult) {
            return '';
        }

        return createIndicatorExplainKey(activeInfoResult);
    }, [activeInfoResult]);

    const activeModelExplanation = activeInfoResultKey
        ? indicatorExplainCache[activeInfoResultKey]
        : undefined;

    const indicatorExplainPending = Boolean(activeInfoResult && !activeModelExplanation && !indicatorExplainError);

    useEffect(() => {
        if (!activeInfoResult || !activeInfoResultKey) {
            setIndicatorExplainLoading(false);
            setIndicatorExplainError(null);
            return;
        }

        if (indicatorExplainCache[activeInfoResultKey]) {
            setIndicatorExplainLoading(false);
            setIndicatorExplainError(null);
            return;
        }

        let disposed = false;

        const run = async () => {
            setIndicatorExplainLoading(true);
            setIndicatorExplainError(null);
            try {
                const response = await fetchIndicatorExplanation({
                    indicator_name: activeInfoResult.indicator_name,
                    organ_id: activeInfoResult.organ_id,
                    value: activeInfoResult.value,
                    unit: activeInfoResult.unit,
                    reference_range: activeInfoResult.reference_range,
                    severity: activeInfoResult.severity
                });

                if (disposed) {
                    return;
                }

                setIndicatorExplainCache((prev) => ({
                    ...prev,
                    [activeInfoResultKey]: response.explanation
                }));
            } catch (error) {
                if (!disposed) {
                    setIndicatorExplainError(formatError(error));
                }
            } finally {
                if (!disposed) {
                    setIndicatorExplainLoading(false);
                }
            }
        };

        void run();

        return () => {
            disposed = true;
        };
    }, [activeInfoResult, activeInfoResultKey, indicatorExplainCache, indicatorExplainRequestVersion]);

    useEffect(() => {
        if (!activeInfoResult) {
            return;
        }

        const onEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setActiveInfoResult(null);
            }
        };

        window.addEventListener('keydown', onEscape);
        return () => window.removeEventListener('keydown', onEscape);
    }, [activeInfoResult]);

    return (
        <section id="panel-overview" className={currentAnalysis ? 'workspaceGrid workspaceGridOverviewReady' : 'workspaceGrid workspaceGridOverviewIdle'} role="tabpanel" aria-labelledby="tab-overview" tabIndex={0}>
            {!currentAnalysis && (
                <article className="panel">
                    <div className="panelInner">
                        <div className="panelHeader">
                            <div className="panelTitleGroup">
                                <div className="panelTitle">Upload &amp; analyze</div>
                                <div className="panelSubtitle">
                                    Select a PDF or image, upload to OSS, and stream results from the backend.
                                </div>
                            </div>
                            <div className={analysisBusy ? 'badge accent' : 'badge'}>
                                <span className="badgeDot" />
                                {analysisBusy ? 'Processing' : 'Ready'}
                            </div>
                        </div>

                        <div className={`uploadZone${selectedFile ? ' hasFile' : ''}`}
                            role="group" aria-label="File upload area">
                            <input
                                id="lab-file-input" type="file"
                                accept=".pdf,.png,.jpg,.jpeg,.webp"
                                onChange={onPickFile}
                                aria-label="Select lab report file"
                            />
                            <div className="compactUploadBar">
                                <div className="compactUploadLeft">
                                    <div className="uploadIcon" aria-hidden="true">
                                        {selectedFile ? <IconFile /> : <IconUpload />}
                                    </div>
                                    <div className="compactUploadText">
                                        <div className="uploadTitle">
                                            {selectedFile ? selectedFile.name : 'Choose lab file'}
                                        </div>
                                        <div className="uploadHint">
                                            {selectedFile
                                                ? `${formatFileSize(selectedFile.size)} · tap to change`
                                                : 'PDF, PNG, JPG, JPEG, WEBP · Max 20 MB'}
                                        </div>
                                    </div>
                                </div>
                                <label htmlFor="lab-file-input" className="btn btn-secondary btn-label compactPickBtn">
                                    Change
                                </label>
                            </div>
                        </div>

                        {uploadValidationError && (
                            <div className="errorBanner" role="alert" style={{ marginTop: '10px' }}>
                                {uploadValidationError}
                            </div>
                        )}

                        <div className="heroActions" style={{ marginTop: '10px' }}>
                            <button className="btn btn-primary" type="button"
                                onClick={() => { void onRunAnalysis(); }} disabled={analysisBusy || !selectedFile}
                                aria-busy={analysisBusy}>
                                {analysisBusy
                                    ? <span className="pendingDots">Analyzing</span>
                                    : 'Run analysis'}
                            </button>
                            <button className="btn btn-secondary" type="button"
                                onClick={() => { void loadHistory(); }} disabled={historyLoading} aria-busy={historyLoading}>
                                <IconRefresh />
                                {historyLoading ? 'Loading...' : 'Refresh'}
                            </button>
                        </div>

                        <div className="statusRail" role="status" aria-live="polite">
                            <span className="statusRailLabel">Status</span>
                            <span className="statusRailValue">{status}</span>
                        </div>

                        <div className="logBlock" aria-label="Stream log">
                            <div className="logBlockHeader">Stream log</div>
                            {analysisLogs.length > 0 ? (
                                <ul className="logList" aria-live="polite">
                                    {analysisLogs.map((line, i) => (
                                        <li key={`${i}-${line}`}>{line}</li>
                                    ))}
                                </ul>
                            ) : (
                                <div style={{ padding: '12px 14px' }}>
                                    <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontFamily: 'Geist Mono, monospace' }}>
                                        No stream output yet.
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>
                </article>
            )}

            {currentAnalysis && (
                <article className="panel">
                    <div className="panelInner">
                        <div className="panelHeader">
                            <div className="panelTitleGroup">
                                <div className="panelTitle">Analysis result</div>
                                <div className="panelSubtitle">
                                    Summary and abnormal markers from the AI backend.
                                </div>
                            </div>
                            <div className="resultHeaderActions">
                                <input
                                    id="lab-file-input-compact"
                                    type="file"
                                    accept=".pdf,.png,.jpg,.jpeg,.webp"
                                    onChange={onPickFile}
                                    aria-label="Select another lab report file"
                                    className="visuallyHiddenInput"
                                />
                                <label htmlFor="lab-file-input-compact" className="btn btn-secondary btn-label compactHeaderUploadBtn">
                                    <IconFile />
                                    {selectedFile ? 'Change file' : 'Upload file'}
                                </label>
                                <button
                                    className="btn btn-primary compactRunBtn"
                                    type="button"
                                    onClick={() => { void onRunAnalysis(); }}
                                    disabled={analysisBusy || !selectedFile}
                                    aria-busy={analysisBusy}
                                >
                                    {analysisBusy ? <span className="pendingDots">Analyzing</span> : 'Run again'}
                                </button>
                                <div className={getBadgeClass(currentAnalysis.status)}>
                                    <span className="badgeDot" />
                                    {currentAnalysis.status}
                                </div>
                            </div>
                        </div>

                        <div style={{ display: 'grid', gap: '12px' }}>
                            <div className="analysisHeaderStrip">
                                <div className="analysisHeaderCell">
                                    <div className="metricLabel">Patient</div>
                                    <strong style={{ fontSize: '0.92rem', color: 'var(--text)' }}>
                                        {currentAnalysis.patient_name?.trim() || 'Unknown patient'}
                                    </strong>
                                </div>
                                <div className="analysisHeaderCell">
                                    <div className="metricLabel">Test date</div>
                                    <strong style={{ fontSize: '0.92rem', color: 'var(--text)' }}>
                                        {overviewTestDate}
                                    </strong>
                                </div>
                                <div className="analysisHeaderCell">
                                    <div className="metricLabel">Source</div>
                                    <strong style={{ fontSize: '0.92rem', color: 'var(--text)' }}>
                                        {overviewSource}
                                    </strong>
                                </div>
                            </div>

                            {currentResults.length > 0 && (
                                <>
                                    <div className="sectionCard" style={{ marginTop: 0 }}>
                                        <div className="sectionTitle">Filter by organ</div>
                                        <div className="chipWrap" style={{ marginTop: 0 }}>
                                            <button
                                                type="button"
                                                onClick={() => onSelectOrganId('all')}
                                                aria-label={`Show all organs (${currentResults.length} indicators)`}
                                                className={selectedOrganId === 'all' ? 'chip active' : 'chip'}>
                                                <span className="organFilterIcon" aria-hidden="true">🧭</span>
                                                All · {currentResults.length}
                                            </button>
                                            {visibleOrganIds.map((organId) => {
                                                const count = organCounts.get(organId) || 0;
                                                if (count === 0) {
                                                    return null;
                                                }
                                                return (
                                                    <button
                                                        key={organId}
                                                        type="button"
                                                        onClick={() => onSelectOrganId(organId)}
                                                        aria-label={`Filter ${organLabel(organId)} (${count} indicators)`}
                                                        className={selectedOrganId === organId ? 'chip active' : 'chip'}>
                                                        <span className="organFilterIcon" aria-hidden="true">{organAbbr(organId)}</span>
                                                        {organLabel(organId)} · {count}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    <div className="resultGrid">
                                        {visibleResults.map((result) => (
                                            <div key={`${result.indicator_name}-${result.organ_id}`} className={getResultCardClass(result.severity)}>
                                                <div className="resultTopRow">
                                                    <div className="resultNameRow">
                                                        <div className="resultName">{result.indicator_name}</div>
                                                        <button
                                                            type="button"
                                                            className="indicatorInfoButton"
                                                            onClick={() => setActiveInfoResult(result)}
                                                            aria-label={`Open indicator details for ${result.indicator_name}`}
                                                            title="Open indicator details"
                                                        >
                                                            i
                                                        </button>
                                                    </div>
                                                    <div className="resultTopMeta">
                                                        <span className="resultMetaTag">{organLabel(result.organ_id)}</span>
                                                        <div className={getSeverityClass(result.severity)} aria-label={`Status ${displayStatusLabel(result.severity)}`}>
                                                            <span className="severityIcon" aria-hidden="true">{displayStatusIcon(result.severity)}</span>
                                                            {displayStatusLabel(result.severity)}
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="resultValueRow">
                                                    <strong>{result.value || '—'}</strong>
                                                    <span>{result.unit}</span>
                                                </div>
                                                <ReferenceRangeBar
                                                    value={result.value}
                                                    unit={result.unit}
                                                    referenceRange={result.reference_range}
                                                    severity={result.severity}
                                                />
                                            </div>
                                        ))}
                                    </div>

                                    {visibleResults.length === 0 && (
                                        <div className="emptyState" role="status">
                                            <div className="emptyStateIcon" aria-hidden="true"><IconEmpty /></div>
                                            <p>No indicators found for this organ.</p>
                                        </div>
                                    )}
                                </>
                            )}

                            {currentAnalysis.summary?.organ_summary?.length ? (
                                <div className="sectionCard">
                                    <div className="sectionTitle">Organ summary</div>
                                    <div className="chipWrap">
                                        {currentAnalysis.summary.organ_summary.map((item) => (
                                            <span key={item.organ_id} className="chip">
                                                {organLabel(item.organ_id)} · {STATUS_LABELS[item.worst_severity] ?? item.worst_severity} · {item.abnormal_count}/{item.indicator_count}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            ) : null}

                            {currentAnalysis.advice?.general_recommendations?.length ? (
                                <div className="sectionCard">
                                    <div className="sectionTitle">General recommendations</div>
                                    <ul className="bulletList">
                                        {currentAnalysis.advice.general_recommendations.map((item) => (
                                            <li key={item}>{item}</li>
                                        ))}
                                    </ul>
                                </div>
                            ) : null}
                        </div>
                    </div>
                </article>
            )}

            {activeInfoResult && (
                <div className="indicatorInfoOverlay" role="presentation" onClick={() => setActiveInfoResult(null)}>
                    <div
                        className="indicatorInfoModal"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="indicator-info-title"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="indicatorInfoHeader">
                            <div>
                                <h3 id="indicator-info-title">{activeInfoResult.indicator_name}</h3>
                                <p>Indicator guidance for patient-friendly interpretation.</p>
                            </div>
                            <button
                                type="button"
                                className="indicatorInfoClose"
                                onClick={() => setActiveInfoResult(null)}
                                aria-label="Close indicator details"
                            >
                                Close
                            </button>
                        </div>

                        <div className="indicatorInfoMeta">
                            <span>Current: {activeInfoResult.value || 'N/A'} {activeInfoResult.unit || ''}</span>
                            <span>Reference: {activeInfoResult.reference_range || 'N/A'}</span>
                        </div>

                        {activeModelExplanation && (
                            <>
                                <div className="indicatorInfoSection">
                                    <h4>What this indicator is</h4>
                                    <p>{activeModelExplanation.what_is_it}</p>
                                </div>

                                <div className="indicatorInfoSection">
                                    <h4>When to be concerned</h4>
                                    <ul>
                                        {activeModelExplanation.when_to_be_concerned.map((item, index) => (
                                            <li key={`${item}-${index}`}>{item}</li>
                                        ))}
                                    </ul>
                                </div>

                                <div className="indicatorInfoSection">
                                    <h4>What to do next</h4>
                                    <ul>
                                        {activeModelExplanation.what_to_do_next.map((item, index) => (
                                            <li key={`${item}-${index}`}>{item}</li>
                                        ))}
                                    </ul>
                                </div>
                            </>
                        )}

                        {indicatorExplainPending && (
                            <div className="indicatorInfoSection indicatorInfoSectionReport">
                                <h4>Loading model explanation</h4>
                                <p>Generating explanation from Qwen for this indicator...</p>
                            </div>
                        )}

                        {indicatorExplainError && !indicatorExplainLoading && !activeModelExplanation && (
                            <div className="indicatorInfoSection indicatorInfoSectionReport">
                                <h4>Model unavailable</h4>
                                <p>{indicatorExplainError}</p>
                                <button
                                    type="button"
                                    className="btn btn-secondary"
                                    style={{ width: 'fit-content', height: '34px', padding: '0 12px', fontSize: '0.78rem' }}
                                    onClick={() => {
                                        setIndicatorExplainError(null);
                                        setIndicatorExplainRequestVersion((prev) => prev + 1);
                                    }}
                                >
                                    Retry
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </section>
    );
}

function PatientNamePrompt({
    patientNameDraft,
    setPatientNameDraft,
    onSave
}: PatientNamePromptProps) {
    return (
        <div style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(250, 248, 243, 0.28)',
            backdropFilter: 'blur(2px)',
            WebkitBackdropFilter: 'blur(2px)',
            display: 'grid',
            placeItems: 'center',
            zIndex: 2000,
            padding: '16px'
        }}>
            <div style={{
                width: 'min(480px, 100%)',
                background: 'rgba(255, 253, 247, 0.98)',
                border: '2px solid var(--border-hi)',
                borderRadius: '16px',
                boxShadow: '0 24px 56px rgba(60, 40, 10, 0.18)',
                padding: '20px',
                display: 'grid',
                gap: '12px'
            }}>
                <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text)' }}>
                    Set patient name
                </div>
                <div style={{ fontSize: '0.86rem', color: 'var(--text-muted)' }}>
                    This name is used for analysis records and trend tracking.
                </div>
                <input
                    value={patientNameDraft}
                    onChange={(e) => setPatientNameDraft(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            onSave();
                        }
                    }}
                    placeholder="Enter patient name"
                    maxLength={120}
                    autoFocus
                    style={{
                        width: '100%',
                        height: '40px',
                        borderRadius: '10px',
                        border: '2px solid var(--border-md)',
                        background: 'var(--surface)',
                        color: 'var(--text)',
                        padding: '0 12px'
                    }}
                    aria-label="Patient name"
                />
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button className="btn btn-primary" type="button" onClick={onSave}>
                        Save and continue
                    </button>
                </div>
            </div>
        </div>
    );
}

/* ─── Main App Component ─────────────────────────── */
export default function SmartLabsApp() {
    const [activeTab, setActiveTab] = useState<TabKey>('overview');
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [status, setStatus] = useState('Ready');
    const [analysis, setAnalysis] = useState<LabAnalysis | null>(null);
    const [analysisLogs, setAnalysisLogs] = useState<string[]>([]);
    const [history, setHistory] = useState<AnalysisHistoryEntry[]>([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [historyError, setHistoryError] = useState<string | null>(null);
    const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);
    const [analysisBusy, setAnalysisBusy] = useState(false);
    const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
    const [chatInput, setChatInput] = useState('');
    const [chatConversationId, setChatConversationId] = useState<string | null>(null);
    const [chatBusy, setChatBusy] = useState(false);
    const [chatError, setChatError] = useState<string | null>(null);
    const [patientName, setPatientName] = useState('');
    const [patientNameDraft, setPatientNameDraft] = useState('');
    const [showPatientNamePrompt, setShowPatientNamePrompt] = useState(false);
    const [selectedOrganId, setSelectedOrganId] = useState<string>('all');
    const [uploadValidationError, setUploadValidationError] = useState<string | null>(null);

    const chatEndRef = useRef<HTMLDivElement | null>(null);
    const backendUrl = resolveBackendBaseUrl();

    const selectedHistory = useMemo(
        () => history.find((entry) => entry.id === selectedHistoryId) ?? null,
        [history, selectedHistoryId]
    );

    const currentAnalysis = analysis ?? selectedHistory?.analysis ?? null;
    const currentResults = currentAnalysis?.results ?? [];

    const currentHistoryEntry = useMemo(() => {
        if (!currentAnalysis) {
            return null;
        }

        const historyId = currentAnalysis.history_id || selectedHistoryId;
        if (historyId) {
            const matched = history.find((entry) => entry.id === historyId);
            if (matched) {
                return matched;
            }
        }

        return selectedHistory;
    }, [currentAnalysis, selectedHistoryId, history, selectedHistory]);

    const overviewTestDate = useMemo(() => {
        const analysisDate = currentAnalysis?.analysis_date?.trim();
        if (analysisDate) {
            return analysisDate;
        }
        if (currentHistoryEntry?.created_at) {
            return formatDateTime(currentHistoryEntry.created_at);
        }
        if (currentAnalysis?.created_at) {
            return formatDateTime(currentAnalysis.created_at);
        }
        return 'N/A';
    }, [currentAnalysis, currentHistoryEntry]);

    const overviewSource = useMemo(() => {
        if (currentHistoryEntry?.source_file_name) {
            return currentHistoryEntry.source_file_name;
        }
        if (currentHistoryEntry?.object_key) {
            return sourceNameFromPath(currentHistoryEntry.object_key);
        }
        if (currentHistoryEntry?.file_url) {
            return sourceNameFromPath(currentHistoryEntry.file_url);
        }
        if (selectedFile?.name) {
            return selectedFile.name;
        }
        return 'Unknown source';
    }, [currentHistoryEntry, selectedFile]);

    const organCounts = useMemo(() => {
        const counts = new Map<string, number>();
        for (const item of currentResults) {
            const key = String(item.organ_id || 'other').trim().toLowerCase() || 'other';
            counts.set(key, (counts.get(key) || 0) + 1);
        }
        return counts;
    }, [currentResults]);

    const visibleOrganIds = useMemo(() => {
        return Array.from(organCounts.keys()).sort((a, b) => organLabel(a).localeCompare(organLabel(b)));
    }, [organCounts]);

    const visibleResults = useMemo(() => {
        const filtered = selectedOrganId === 'all'
            ? currentResults
            : currentResults.filter((result) => String(result.organ_id || '').toLowerCase() === selectedOrganId);

        const severityRank = (severity: string) => {
            if (severity === 'critical') return 0;
            if (severity === 'abnormal_high' || severity === 'abnormal_low') return 1;
            if (severity === 'unknown') return 2;
            return 3;
        };

        return filtered
            .map((result, index) => ({ result, index }))
            .sort((a, b) => {
                const rankDiff = severityRank(String(a.result.severity || 'unknown')) - severityRank(String(b.result.severity || 'unknown'));
                if (rankDiff !== 0) {
                    return rankDiff;
                }
                return a.index - b.index;
            })
            .map(({ result }) => result);
    }, [currentResults, selectedOrganId]);

    useEffect(() => { void loadHistory(); }, []);

    useEffect(() => {
        const savedName = window.sessionStorage.getItem(PATIENT_NAME_STORAGE_KEY);
        if (savedName && savedName.trim()) {
            setPatientName(savedName);
            setPatientNameDraft(savedName);
            setShowPatientNamePrompt(false);
            setStatus('Patient profile loaded.');
        } else {
            setShowPatientNamePrompt(true);
            setStatus('Please set patient name before running analysis.');
        }
    }, []);

    useEffect(() => {
        if (chatEndRef.current) {
            chatEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
        }
    }, [chatMessages, activeTab]);

    useEffect(() => {
        if (!selectedHistoryId && history.length > 0) {
            setSelectedHistoryId(history[0].id);
            setAnalysis(history[0].analysis);
        }
    }, [history, selectedHistoryId]);

    useEffect(() => {
        if (!currentAnalysis || currentResults.length === 0) {
            setSelectedOrganId('all');
            return;
        }

        const abnormal = currentResults.find((item) => item.severity !== 'normal');
        if (abnormal?.organ_id) {
            setSelectedOrganId(String(abnormal.organ_id).toLowerCase());
            return;
        }

        const first = currentResults[0];
        setSelectedOrganId(first?.organ_id ? String(first.organ_id).toLowerCase() : 'all');
    }, [currentAnalysis, currentResults]);

    async function loadHistory() {
        setHistoryLoading(true);
        setHistoryError(null);
        try {
            const items = readSessionHistory();
            setHistory(items);
            if (!selectedHistoryId && items.length > 0) {
                setSelectedHistoryId(items[0].id);
                setAnalysis(items[0].analysis);
            }
        } catch (error) {
            setHistoryError(formatError(error));
        } finally {
            setHistoryLoading(false);
        }
    }

    function onPickFile(event: ChangeEvent<HTMLInputElement>) {
        const file = event.target.files?.[0] ?? null;
        setUploadValidationError(null);

        if (file) {
            const validationError = validateUploadFile(file);
            if (validationError) {
                setSelectedFile(null);
                setUploadValidationError(validationError);
                setStatus(validationError);
                return;
            }
        }

        setSelectedFile(file);
        if (file) {
            setStatus(`Selected: ${file.name}`);
            setAnalysisLogs([`File selected: ${file.name}`]);
        }
    }

    async function onRunAnalysis() {
        if (!selectedFile) { setStatus('Please select a file first.'); return; }
        const validationError = validateUploadFile(selectedFile);
        if (validationError) {
            setUploadValidationError(validationError);
            setStatus(validationError);
            return;
        }
        if (!patientName.trim()) {
            setShowPatientNamePrompt(true);
            setStatus('Please set patient name before running analysis.');
            return;
        }
        setUploadValidationError(null);
        setAnalysisBusy(true);
        setChatMessages([]);
        setChatConversationId(null);
        setChatError(null);
        setAnalysis(null);
        setAnalysisLogs([]);
        setStatus('Requesting STS token...');
        setActiveTab('overview');

        let nextHistoryId: string | null = null;
        try {
            const sts = await fetchStsToken();
            setAnalysisLogs((c) => [...c, 'STS token acquired']);
            setStatus('Uploading file to OSS...');

            const uploadResult = await uploadFileToOss(selectedFile, sts);
            setAnalysisLogs((c) => [...c, `Upload complete: ${uploadResult.objectKey}`]);
            setStatus('Initializing analysis stream...');

            for await (const event of streamAnalysis({
                object_key: uploadResult.objectKey,
                patient_name: patientName.trim()
            })) {
                if (event.event === 'ready') {
                    appendLog('SSE connection opened');
                    setStatus('Stream connected');
                    continue;
                }
                if (event.event === 'signed_url_ready') {
                    const payload = parseEventPayload(event);
                    appendLog(`Signed URL ready: ${payload?.object_key ?? 'object'}`);
                    continue;
                }
                if (event.event === 'post_process') {
                    const payload = parseEventPayload(event);
                    const message = String(payload?.message || 'Finalizing results...');
                    appendLog(message);
                    setStatus(message);
                    continue;
                }
                if (event.event === 'warning') {
                    const payload = parseEventPayload(event);
                    appendLog(String(payload?.message || 'Backend warning'));
                    continue;
                }
                if (event.event === 'result') {
                    const payload = parseEventPayload(event);
                    if (payload) {
                        const parsed = parseAnalysis(payload);
                        setAnalysis(parsed);
                        nextHistoryId = String(payload.history_id || parsed.history_id || createId('analysis'));
                        const createdAt = String(payload.created_at || parsed.created_at || new Date().toISOString());
                        upsertSessionHistoryEntry({
                            id: nextHistoryId,
                            created_at: createdAt,
                            object_key: uploadResult.objectKey,
                            file_url: uploadResult.objectUrl,
                            source_file_name: selectedFile.name,
                            analysis: parsed
                        });
                        if (nextHistoryId) setSelectedHistoryId(nextHistoryId);
                        setStatus(
                            parsed.status === 'error'
                                ? parsed.error_message || 'Analysis returned an error'
                                : 'Analysis result received'
                        );
                        appendLog('Result JSON parsed successfully');
                        setChatMessages([]);
                        setChatConversationId(null);
                    }
                    continue;
                }
                if (event.event === 'done') { setStatus('Analysis complete'); }
            }
        } catch (error) {
            setStatus('Analysis failed');
            appendLog(`Error: ${formatError(error)}`);
        } finally {
            setAnalysisBusy(false);
        }
    }

    function savePatientNameFromDraft() {
        const normalized = patientNameDraft.trim().slice(0, 120);
        if (!normalized) {
            setStatus('Patient name cannot be empty.');
            return;
        }

        setPatientName(normalized);
        setPatientNameDraft(normalized);
        window.sessionStorage.setItem(PATIENT_NAME_STORAGE_KEY, normalized);

        setShowPatientNamePrompt(false);
        setStatus('Patient profile ready.');
    }

    async function onSendChat() {
        const message = chatInput.trim();
        if (!selectedHistoryId) { setChatError('Please select or run an analysis first.'); return; }
        if (!message) return;

        setChatBusy(true);
        setChatError(null);
        setChatInput('');

        const userMsg: ChatMessage = { id: createId('user'), role: 'user', text: message };
        const assistantMsg: ChatMessage = {
            id: createId('assistant'), role: 'assistant',
            text: 'Composing response', pending: true
        };
        setChatMessages((c) => [...c, userMsg, assistantMsg]);

        try {
            for await (const event of streamChat({
                history_id: selectedHistoryId, message,
                conversation_id: chatConversationId ?? undefined,
                language: 'en', detail_level: 'patient'
            })) {
                if (event.event === 'status') {
                    const payload = parseEventPayload(event);
                    const cid = payload?.conversation_id ? String(payload.conversation_id) : null;
                    if (cid) setChatConversationId(cid);
                    continue;
                }
                if (event.event === 'post_process') {
                    const payload = parseEventPayload(event);
                    setStatus(String(payload?.message || 'Processing context...'));
                    continue;
                }
                if (event.event === 'warning') {
                    const payload = parseEventPayload(event);
                    setChatError(String(payload?.message || 'A warning occurred during chat.'));
                    continue;
                }
                if (event.event === 'result') {
                    const payload = parseEventPayload(event);
                    if (!payload) continue;
                    const chatResult = parseChatResult(payload);
                    if (chatResult) {
                        setChatConversationId(chatResult.conversation_id || chatConversationId);
                        setChatMessages((c) => {
                            if (c.length === 0) return c;
                            const next = [...c];
                            const last = next.length - 1;
                            next[last] = {
                                ...next[last],
                                text: chatResult.assistant.answer_text || 'No response content.',
                                assistant: chatResult.assistant,
                                pending: false
                            };
                            return next;
                        });
                    }
                    setStatus('Chat response ready');
                    continue;
                }
                if (event.event === 'error') {
                    const payload = parseEventPayload(event);
                    throw new Error(String(payload?.message || event.data || 'Chat failed'));
                }
            }
        } catch (error) {
            setChatError(formatError(error));
            setStatus('Chat failed');
            setChatMessages((c) => {
                if (c.length === 0) return c;
                const next = [...c];
                const last = next.length - 1;
                if (next[last].role === 'assistant') {
                    next[last] = { ...next[last], text: formatError(error), pending: false };
                }
                return next;
            });
        } finally {
            setChatBusy(false);
        }
    }

    function selectHistory(entry: AnalysisHistoryEntry) {
        setSelectedHistoryId(entry.id);
        setAnalysis(entry.analysis);
        setChatMessages([]);
        setChatConversationId(null);
        setChatError(null);
        setStatus(`Viewing analysis from ${formatDateTime(entry.created_at)}`);
        setActiveTab('overview');
    }

    const stats = useMemo(() => {
        const results = currentAnalysis?.results ?? [];
        const abnormal = results.filter((r) => r.severity !== 'normal');
        const critical = results.filter((r) => r.severity === 'critical');
        const organs = new Set(results.map((r) => r.organ_id).filter(Boolean)).size;
        return [
            { label: 'Indicators', value: results.length },
            { label: 'Abnormal', value: abnormal.length },
            { label: 'Critical', value: critical.length },
            { label: 'Organs', value: organs }
        ];
    }, [currentAnalysis]);

    function appendLog(line: string) {
        setAnalysisLogs((c) => [...c, line]);
    }

    function readSessionHistory(): AnalysisHistoryEntry[] {
        try {
            const raw = window.sessionStorage.getItem(SESSION_HISTORY_STORAGE_KEY);
            if (!raw) {
                return [];
            }

            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) {
                return [];
            }

            return parsed as AnalysisHistoryEntry[];
        } catch (_) {
            return [];
        }
    }

    function writeSessionHistory(items: AnalysisHistoryEntry[]) {
        try {
            window.sessionStorage.setItem(SESSION_HISTORY_STORAGE_KEY, JSON.stringify(items));
        } catch (_) {
            // Ignore storage write errors in constrained environments.
        }
    }

    function upsertSessionHistoryEntry(entry: AnalysisHistoryEntry) {
        setHistory((prev) => {
            const next = [entry, ...prev.filter((item) => item.id !== entry.id)].slice(0, 30);
            writeSessionHistory(next);
            return next;
        });
    }

    const TAB_LABELS: Record<TabKey, string> = {
        overview: 'Overview',
        chat: 'AI Chat',
        history: 'History'
    };

    function onTabKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>, tab: TabKey) {
        const tabs: TabKey[] = ['overview', 'chat', 'history'];
        const currentIndex = tabs.indexOf(tab);
        if (currentIndex < 0) {
            return;
        }

        if (event.key === 'ArrowRight') {
            event.preventDefault();
            setActiveTab(tabs[(currentIndex + 1) % tabs.length]);
        }

        if (event.key === 'ArrowLeft') {
            event.preventDefault();
            setActiveTab(tabs[(currentIndex - 1 + tabs.length) % tabs.length]);
        }
    }

    return (
        <div className="appRoot">
            <div className="glowBlob glowBlobA" aria-hidden="true" />
            <div className="glowBlob glowBlobB" aria-hidden="true" />

            {showPatientNamePrompt && (
                <PatientNamePrompt
                    patientNameDraft={patientNameDraft}
                    setPatientNameDraft={setPatientNameDraft}
                    onSave={savePatientNameFromDraft}
                />
            )}

            <a href="#main-content" className="btn btn-primary"
                style={{ position: 'absolute', left: '-9999px', top: 8, zIndex: 999 }}
                onFocus={(e) => (e.currentTarget.style.left = '8px')}
                onBlur={(e) => (e.currentTarget.style.left = '-9999px')}>
                Skip to content
            </a>

            <main className="appShell" id="main-content">
                <div className="appHeader">
                    <div className="appLogo">ClinicLens</div>
                </div>
                <div className="greetingBanner">
                    <span className="greetingText">Hello, <strong>{patientName}</strong></span>
                </div>


                {/* ── Navigation ───────────────────── */}
                <nav className="navPill" aria-label="Tab navigation" role="tablist">
                    {(['overview', 'chat', 'history'] as TabKey[]).map((tab) => (
                        <button
                            key={tab} type="button" role="tab"
                            aria-selected={tab === activeTab}
                            id={`tab-${tab}`}
                            aria-controls={`panel-${tab}`}
                            className={tab === activeTab ? 'navPillItem navPillItemActive' : 'navPillItem'}
                            onClick={() => setActiveTab(tab)}
                            onKeyDown={(event) => onTabKeyDown(event, tab)}
                        >
                            {TAB_LABELS[tab]}
                        </button>
                    ))}
                </nav>

                {/* ── Overview Tab ─────────────────── */}
                {activeTab === 'overview' && (
                    <OverviewTab
                        currentAnalysis={currentAnalysis}
                        currentResults={currentResults}
                        selectedOrganId={selectedOrganId}
                        onSelectOrganId={setSelectedOrganId}
                        visibleOrganIds={visibleOrganIds}
                        organCounts={organCounts}
                        visibleResults={visibleResults}
                        selectedFile={selectedFile}
                        analysisBusy={analysisBusy}
                        onPickFile={onPickFile}
                        onRunAnalysis={onRunAnalysis}
                        loadHistory={loadHistory}
                        historyLoading={historyLoading}
                        status={status}
                        analysisLogs={analysisLogs}
                        uploadValidationError={uploadValidationError}
                        overviewTestDate={overviewTestDate}
                        overviewSource={overviewSource}
                    />
                )}

                {/* ── Chat Tab ─────────────────────── */}
                {activeTab === 'chat' && (
                    <section id="panel-chat" className="workspaceGrid workspaceGridChat" role="tabpanel" aria-labelledby="tab-chat" tabIndex={0}>
                        <article className="panel">
                            <div className="panelInner">
                                <div className="panelHeader">
                                    <div className="panelTitleGroup">
                                        <div className="panelTitle">AI Chat</div>
                                        <div className="panelSubtitle">
                                            Ask follow-up questions about indicators, risks, and next steps.
                                        </div>
                                    </div>
                                    <div className={chatBusy ? 'badge accent' : 'badge'}>
                                        <span className="badgeDot" />
                                        {chatBusy ? 'Streaming' : 'Idle'}
                                    </div>
                                </div>

                                <div className="chatWindow" role="log" aria-label="Conversation history" aria-live="polite">
                                    {chatMessages.length > 0 ? (
                                        chatMessages.map((msg) => (
                                            <div key={msg.id}
                                                className={msg.role === 'user' ? 'chatBubble chatBubbleUser' : 'chatBubble chatBubbleAssistant'}>
                                                <div className="chatBubbleMeta">
                                                    {msg.role === 'user' ? 'You' : 'ClinicLens AI'}
                                                </div>
                                                <div className="chatBubbleText">
                                                    {msg.pending
                                                        ? <span className="pendingDots">Composing response</span>
                                                        : msg.text}
                                                </div>

                                                {msg.assistant && !msg.pending && (
                                                    <div className="assistantMetaStack">
                                                        <div className="chipWrap" style={{ marginTop: '10px' }}>
                                                            <span className="chip">
                                                                Risk: {msg.assistant.risk_level.toUpperCase()}
                                                            </span>
                                                            {msg.assistant.escalation && (
                                                                <span className="chip danger">See a doctor</span>
                                                            )}
                                                        </div>

                                                        {msg.assistant.recommended_actions.length > 0 && (
                                                            <div style={{ marginTop: '8px' }}>
                                                                <div className="miniSectionTitle">Recommended actions</div>
                                                                <ul className="bulletList">
                                                                    {msg.assistant.recommended_actions.map((item) => (
                                                                        <li key={item}>{item}</li>
                                                                    ))}
                                                                </ul>
                                                            </div>
                                                        )}

                                                        {msg.assistant.follow_up_questions.length > 0 && (
                                                            <div style={{ marginTop: '8px' }}>
                                                                <div className="miniSectionTitle">Follow-up questions</div>
                                                                <ul className="bulletList">
                                                                    {msg.assistant.follow_up_questions.map((item) => (
                                                                        <li key={item}>{item}</li>
                                                                    ))}
                                                                </ul>
                                                            </div>
                                                        )}

                                                        {msg.assistant.disclaimer && (
                                                            <p className="disclaimerText">{msg.assistant.disclaimer}</p>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        ))
                                    ) : (
                                        <div className="emptyState emptyStateLg" role="status">
                                            <div className="emptyStateIcon" aria-hidden="true"><IconChat /></div>
                                            <p>No conversation yet. Select an analysis and ask your first question.</p>
                                            <button type="button" className="btn btn-secondary emptyStateAction" onClick={() => setActiveTab('overview')}>
                                                Go to Overview
                                            </button>
                                        </div>
                                    )}
                                    <div ref={chatEndRef} />
                                </div>

                                <div className="chatComposerWrap">
                                    <textarea
                                        value={chatInput}
                                        onChange={(e) => setChatInput(e.target.value)}
                                        placeholder="e.g. What should I pay most attention to in these results?"
                                        rows={3}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void onSendChat();
                                        }}
                                        aria-label="Enter your question"
                                    />
                                    <div className="chatComposerFooter">
                                        <span className="chatComposerHint">
                                            {selectedHistoryId
                                                ? `Using analysis #${selectedHistoryId.slice(0, 8)}`
                                                : 'Select a history record before chatting.'}
                                            {' · Ctrl+Enter to send'}
                                        </span>
                                        <button className="btn btn-primary" type="button"
                                            onClick={onSendChat}
                                            disabled={chatBusy || !chatInput.trim()}
                                            aria-busy={chatBusy}
                                            style={{ height: '36px', fontSize: '0.82rem' }}>
                                            <IconSend />
                                            {chatBusy ? 'Sending...' : 'Send'}
                                        </button>
                                    </div>
                                </div>

                                {chatError && (
                                    <div className="errorBanner" role="alert">{chatError}</div>
                                )}
                            </div>
                        </article>

                        <article className="panel">
                            <div className="panelInner">
                                <div className="panelHeader">
                                    <div className="panelTitleGroup">
                                        <div className="panelTitle">Chat context</div>
                                        <div className="panelSubtitle">The analysis currently used as context.</div>
                                    </div>
                                    <div className="badge">{selectedHistory ? 'Active' : 'None'}</div>
                                </div>

                                {currentAnalysis ? (
                                    <div className="contextCard">
                                        <div className="metricLabel">Patient</div>
                                        <div className="contextPatient">
                                            {currentAnalysis.patient_name?.trim() || 'Unknown patient'}
                                        </div>
                                        <div className="contextDate">
                                            {currentAnalysis.analysis_date || 'N/A'}
                                        </div>
                                        <div className="chipWrap" style={{ marginTop: '6px' }}>
                                            <span className="chip">{currentAnalysis.results.length} indicators</span>
                                            <span className="chip">
                                                {currentAnalysis.results.filter((r) => r.severity !== 'normal').length} abnormal
                                            </span>
                                            <span className="chip">
                                                {currentAnalysis.results.filter((r) => r.severity === 'critical').length} critical
                                            </span>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="emptyState" role="status">
                                        <div className="emptyStateIcon" aria-hidden="true"><IconEmpty /></div>
                                        <p>No analysis selected.</p>
                                    </div>
                                )}
                            </div>
                        </article>
                    </section>
                )}

                {/* ── History Tab ──────────────────── */}
                {activeTab === 'history' && (
                    <section id="panel-history" className="workspaceGrid workspaceGridHistory" role="tabpanel" aria-labelledby="tab-history" tabIndex={0}>
                        <article className="panel">
                            <div className="panelInner">
                                <div className="panelHeader">
                                    <div className="panelTitleGroup">
                                        <div className="panelTitle">Analysis history</div>
                                        <div className="panelSubtitle">Reload and select a previous analysis record.</div>
                                    </div>
                                    <button className="btn btn-secondary" type="button"
                                        onClick={loadHistory} disabled={historyLoading} aria-busy={historyLoading}
                                        style={{ height: '36px', fontSize: '0.82rem' }}>
                                        <IconRefresh />
                                        {historyLoading ? 'Loading...' : 'Refresh'}
                                    </button>
                                </div>

                                {historyError && (
                                    <div className="errorBanner" role="alert">{historyError}</div>
                                )}

                                <ul className="historyList" aria-label="History records">
                                    {history.length > 0 ? (
                                        history.map((entry, idx) => {
                                            const isSelected = entry.id === selectedHistoryId;
                                            const indicatorCount = entry.analysis.results.length;
                                            const abnormalCount = entry.analysis.results.filter((r) => r.severity !== 'normal').length;
                                            const criticalCount = entry.analysis.results.filter((r) => r.severity === 'critical').length;
                                            return (
                                                <li key={entry.id} style={{ listStyle: 'none' }}>
                                                    <button type="button"
                                                        className={isSelected ? 'historyItem historyItemActive' : 'historyItem'}
                                                        onClick={() => selectHistory(entry)}
                                                        style={{ animationDelay: `${idx * 40}ms` }}
                                                        aria-pressed={isSelected}>
                                                        <div className="historyItemTopRow">
                                                            <div>
                                                                <div className="historyDate">
                                                                    <IconClock /> {formatDateTime(entry.created_at)}
                                                                </div>
                                                            </div>
                                                            <div className={getBadgeClass(entry.analysis.status)}>
                                                                {entry.analysis.status}
                                                            </div>
                                                        </div>
                                                        <div className="chipWrap" style={{ marginTop: '0' }}>
                                                            <span className="chip">{indicatorCount} indicators</span>
                                                            {abnormalCount > 0 && (
                                                                <span className="chip" style={{ color: 'var(--warning)', background: 'var(--warning-dim)', borderColor: 'rgba(217,119,6,0.2)' }}>
                                                                    {abnormalCount} abnormal
                                                                </span>
                                                            )}
                                                            {criticalCount > 0 && (
                                                                <span className="chip danger">{criticalCount} critical</span>
                                                            )}
                                                        </div>
                                                    </button>
                                                </li>
                                            );
                                        })
                                    ) : (
                                        <li style={{ listStyle: 'none' }}>
                                            <div className="emptyState emptyStateLg" role="status">
                                                <div className="emptyStateIcon" aria-hidden="true"><IconEmpty /></div>
                                                <p>No history yet. Upload and analyze your first file.</p>
                                                <button type="button" className="btn btn-secondary emptyStateAction" onClick={() => setActiveTab('overview')}>
                                                    Go to Overview
                                                </button>
                                            </div>
                                        </li>
                                    )}
                                </ul>
                            </div>
                        </article>

                        <article className="panel">
                            <div className="panelInner">
                                <div className="panelHeader">
                                    <div className="panelTitleGroup">
                                        <div className="panelTitle">Selected detail</div>
                                        <div className="panelSubtitle">Review the result of the selected record.</div>
                                    </div>
                                    {selectedHistory ? (
                                        <div className="badge accent">#{selectedHistory.id.slice(0, 8)}</div>
                                    ) : (
                                        <div className="badge">None</div>
                                    )}
                                </div>

                                {currentAnalysis ? (
                                    <div style={{ display: 'grid', gap: '12px' }}>
                                        <div className="analysisHeaderStrip">
                                            <div className="analysisHeaderCell">
                                                <div className="metricLabel">Status</div>
                                                <strong style={{ fontSize: '0.92rem', color: 'var(--text)' }}>
                                                    {currentAnalysis.status}
                                                </strong>
                                            </div>
                                            <div className="analysisHeaderCell">
                                                <div className="metricLabel">Date</div>
                                                <strong style={{ fontSize: '0.92rem', color: 'var(--text)' }}>
                                                    {currentAnalysis.analysis_date || 'N/A'}
                                                </strong>
                                            </div>
                                        </div>

                                        <div className="resultGrid">
                                            {currentAnalysis.results.slice(0, 6).map((result) => (
                                                <div key={`hist-${result.indicator_name}-${result.organ_id}`} className={getResultCardClass(result.severity)}>
                                                    <div className="resultTopRow">
                                                        <div className="resultNameRow">
                                                            <div className="resultName">{result.indicator_name}</div>
                                                        </div>
                                                        <div className="resultTopMeta">
                                                            <span className="resultMetaTag">{organLabel(result.organ_id)}</span>
                                                            <div className={getSeverityClass(result.severity)}>
                                                                <span className="severityIcon" aria-hidden="true">{displayStatusIcon(result.severity)}</span>
                                                                {displayStatusLabel(result.severity)}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="resultValueRow">
                                                        <strong>{result.value || '—'}</strong>
                                                        <span>{result.unit}</span>
                                                    </div>
                                                    <ReferenceRangeBar
                                                        value={result.value}
                                                        unit={result.unit}
                                                        referenceRange={result.reference_range}
                                                        severity={result.severity}
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="emptyState emptyStateLg" role="status">
                                        <div className="emptyStateIcon" aria-hidden="true"><IconEmpty /></div>
                                        <p>Select a record from the list to view its details.</p>
                                    </div>
                                )}
                            </div>
                        </article>
                    </section>
                )}

                <footer className="footer">
                    <p>
                        ClinicLens · Alibaba Cloud · Qwen VL ·{' '}
                        <a href="/privacy">Privacy policy</a> ·{' '}
                        <a href="/terms">Terms of use</a>
                    </p>
                </footer>
            </main>
        </div>
    );
}

/* ─── Utilities ─────────────────────────────────── */
function parseEventPayload(event: SseEvent) {
    try { return JSON.parse(event.data) as Record<string, unknown>; }
    catch { return null; }
}

function formatError(error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('does not expose /api/chat') || message.includes('Cannot POST /api/chat')) {
        return 'Backend has no chat route (/api/chat). Restart backend with ./start.sh.';
    }
    if (message.includes('Backend unreachable') || message.includes('Failed to start stream')) {
        return 'Cannot reach backend. Check that it is running on port 9000.';
    }
    return message;
}

function organLabel(organId: string) {
    const normalized = String(organId || 'other').trim().toLowerCase();
    if (ORGAN_LABELS[normalized]) {
        return ORGAN_LABELS[normalized];
    }
    if (!normalized) {
        return 'Other';
    }
    return normalized
        .replace(/[_-]+/g, ' ')
        .replace(/\b\w/g, (char) => char.toUpperCase());
}

function organAbbr(organId: string) {
    const map: Record<string, string> = {
        kidneys: '🫘',
        liver: '🟤',
        heart: '❤️',
        lungs: '🫁',
        blood: '🩸',
        pancreas: '🧪',
        thyroid: '🦋',
        bone: '🦴',
        immune: '🛡️',

        electrolytes: '⚡',
        endocrine: '🔬',
        metabolism: '🍬',
        urine: '🚽',
        coagulation: '🩹',
        lipid: '🧈',
        infection: '🦠',

        other: '🧪'
    };
    return map[organId] ?? '🧪';
}

function displayStatusLabel(severity: string) {
    return String(severity || '').toLowerCase() === 'normal' ? 'Normal' : 'Abnormal';
}

function displayStatusIcon(severity: string) {
    return String(severity || '').toLowerCase() === 'normal' ? '✓' : '!';
}

function getSeverityClass(severity: string) { return `severity-badge severity-${severity}`; }

function getResultCardClass(severity: string) {
    return `resultCard resultCardSeverity-${severity}`;
}

function getBadgeClass(status: string) {
    const s = status.toLowerCase();
    if (s === 'error') return 'badge danger';
    if (s === 'success' || s === 'complete') return 'badge success';
    return 'badge';
}

function createId(prefix: string) {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
        return `${prefix}_${crypto.randomUUID()}`;
    }
    return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
}

function formatDateTime(value: string) {
    if (!value) return 'N/A';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function sourceNameFromPath(value: string) {
    if (!value) return 'Unknown source';
    const normalized = value.split('?')[0].replace(/\\/g, '/');
    const parts = normalized.split('/').filter(Boolean);
    return parts[parts.length - 1] || value;
}

function formatFileSize(size: number) {
    if (size < 1024) return `${size} B`;
    const units = ['KB', 'MB', 'GB'];
    let value = size / 1024, index = 0;
    while (value >= 1024 && index < units.length - 1) { value /= 1024; index++; }
    return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[index]}`;
}

function createIndicatorExplainKey(result: LabAnalysis['results'][number]) {
    return [
        String(result.indicator_name || '').trim().toLowerCase(),
        String(result.organ_id || '').trim().toLowerCase(),
        String(result.severity || '').trim().toLowerCase()
    ].join('|');
}

function validateUploadFile(file: File) {
    if (!ALLOWED_UPLOAD_TYPES.has(file.type)) {
        return 'Unsupported file type. Please upload PDF, PNG, JPG, JPEG, or WEBP.';
    }

    if (file.size > MAX_UPLOAD_SIZE_BYTES) {
        return 'File is too large. Maximum supported size is 20 MB.';
    }

    return null;
}

function ReferenceRangeBar({ value, unit, referenceRange, severity }: ReferenceRangeBarProps) {
    const visual = useMemo(() => buildReferenceRangeVisual(referenceRange, value), [referenceRange, value]);

    if (!visual) {
        return null;
    }

    const normalLeft = toPercent(visual.normalMin, visual.domainMin, visual.domainMax);
    const normalRight = toPercent(visual.normalMax, visual.domainMin, visual.domainMax);
    const markerLeft = toPercent(visual.current, visual.domainMin, visual.domainMax);
    const markerClass = visual.currentInNormal
        ? 'resultRangeMarker marker-normal'
        : severity === 'critical'
            ? 'resultRangeMarker marker-critical'
            : 'resultRangeMarker marker-abnormal';
    const markerEdgeClass = markerLeft < 16
        ? 'align-left'
        : markerLeft > 84
            ? 'align-right'
            : 'align-center';
    const currentLabel = [String(value || '').trim(), String(unit || '').trim()].filter(Boolean).join(' ') || 'N/A';

    return (
        <div className="resultRangeBlock" aria-label="Reference range visualization">
            <div className="resultRangeHeader">
                <span>Reference range</span>
                <span>{referenceRange || 'N/A'}</span>
            </div>
            <div className="resultRangeTrack" role="img" aria-label={`Normal range between ${referenceRange}. Current value is ${value || 'N/A'}.`}>
                <div
                    className="resultRangeNormalBand"
                    style={{ left: `${normalLeft}%`, width: `${Math.max(normalRight - normalLeft, 3)}%` }}
                />
                <div className={`resultRangeMarkerAnchor ${markerEdgeClass}`} style={{ left: `${markerLeft}%` }}>
                    <div className={markerClass} />
                </div>
            </div>
            <div className="resultRangeLegend">
                <span>Low</span>
                <span>Normal</span>
                <span>High</span>
            </div>
        </div>
    );
}

function toPercent(value: number, min: number, max: number) {
    if (max <= min) {
        return 50;
    }
    const ratio = (value - min) / (max - min);
    return Math.max(0, Math.min(100, ratio * 100));
}

function parseNumericValue(input: string) {
    const normalized = String(input || '')
        .replace(/,/g, '')
        .match(/-?\d+(?:\.\d+)?/);

    if (!normalized) {
        return null;
    }

    const parsed = Number.parseFloat(normalized[0]);
    return Number.isFinite(parsed) ? parsed : null;
}

function buildReferenceRangeVisual(referenceRange: string, value: string) {
    const current = parseNumericValue(value);
    if (current === null) {
        return null;
    }

    const text = String(referenceRange || '').replace(/,/g, '').trim();
    if (!text) {
        return null;
    }

    const betweenMatch = text.match(/(-?\d+(?:\.\d+)?)\s*(?:-|–|to|~)\s*(-?\d+(?:\.\d+)?)/i);
    if (betweenMatch) {
        const low = Number.parseFloat(betweenMatch[1]);
        const high = Number.parseFloat(betweenMatch[2]);
        if (!Number.isFinite(low) || !Number.isFinite(high)) {
            return null;
        }

        const min = Math.min(low, high);
        const max = Math.max(low, high);
        const span = Math.max(max - min, Math.max(Math.abs(max), 1) * 0.25);
        const pad = span * 0.35;

        return {
            domainMin: min - pad,
            domainMax: max + pad,
            normalMin: min,
            normalMax: max,
            current,
            currentInNormal: current >= min && current <= max
        };
    }

    const maxOnlyMatch = text.match(/(?:<=|≤|<)\s*(-?\d+(?:\.\d+)?)/i);
    if (maxOnlyMatch) {
        const max = Number.parseFloat(maxOnlyMatch[1]);
        if (!Number.isFinite(max)) {
            return null;
        }

        const span = Math.max(Math.abs(max) * 0.8, 1);
        const domainMin = Math.min(0, max - span);
        const domainMax = max + span * 0.4;

        return {
            domainMin,
            domainMax,
            normalMin: domainMin,
            normalMax: max,
            current,
            currentInNormal: current <= max
        };
    }

    const minOnlyMatch = text.match(/(?:>=|≥|>)\s*(-?\d+(?:\.\d+)?)/i);
    if (minOnlyMatch) {
        const min = Number.parseFloat(minOnlyMatch[1]);
        if (!Number.isFinite(min)) {
            return null;
        }

        const span = Math.max(Math.abs(min) * 0.8, 1);
        const domainMin = min - span * 0.4;
        const domainMax = min + span;

        return {
            domainMin,
            domainMax,
            normalMin: min,
            normalMax: domainMax,
            current,
            currentInNormal: current >= min
        };
    }

    return null;
}