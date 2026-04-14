'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';

import {
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
    const [showPatientNamePrompt, setShowPatientNamePrompt] = useState(true);
    const [selectedOrganId, setSelectedOrganId] = useState<string>('all');

    const chatEndRef = useRef<HTMLDivElement | null>(null);
    const backendUrl = resolveBackendBaseUrl();

    const selectedHistory = useMemo(
        () => history.find((entry) => entry.id === selectedHistoryId) ?? null,
        [history, selectedHistoryId]
    );

    const currentAnalysis = analysis ?? selectedHistory?.analysis ?? null;
    const currentResults = currentAnalysis?.results ?? [];

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
        if (selectedOrganId === 'all') {
            return currentResults;
        }
        return currentResults.filter((result) => String(result.organ_id || '').toLowerCase() === selectedOrganId);
    }, [currentResults, selectedOrganId]);

    useEffect(() => { void loadHistory(); }, []);

    useEffect(() => {
        setShowPatientNamePrompt(true);
        setStatus('Please set patient name before running analysis.');
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
        setSelectedFile(file);
        if (file) {
            setStatus(`Selected: ${file.name}`);
            setAnalysisLogs([`File selected: ${file.name}`]);
        }
    }

    async function onRunAnalysis() {
        if (!selectedFile) { setStatus('Please select a file first.'); return; }
        if (!patientName.trim()) {
            setShowPatientNamePrompt(true);
            setStatus('Please set patient name before running analysis.');
            return;
        }
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

    return (
        <div className="appRoot">
            <div className="glowBlob glowBlobA" aria-hidden="true" />
            <div className="glowBlob glowBlobB" aria-hidden="true" />

            {showPatientNamePrompt && (
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
                                    savePatientNameFromDraft();
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
                            <button className="btn btn-primary" type="button" onClick={savePatientNameFromDraft}>
                                Save and continue
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <a href="#main-content" className="btn btn-primary"
                style={{ position: 'absolute', left: '-9999px', top: 8, zIndex: 999 }}
                onFocus={(e) => (e.currentTarget.style.left = '8px')}
                onBlur={(e) => (e.currentTarget.style.left = '-9999px')}>
                Skip to content
            </a>

            <main className="appShell" id="main-content">

                {/* ── Hero ──────────────────────────── */}
                <section className="panel heroCard" aria-labelledby="hero-title">
                    <div className="heroLayout">
                        <div className="heroCopy">
                            <div className="eyebrow">
                                <span className="eyebrowDot" />
                                Smart Labs · Alibaba Cloud + Qwen AI
                            </div>
                            <h1 id="hero-title">
                                Lab analysis,<br />
                                <em>clinically sharp.</em>
                            </h1>
                            <p>
                                Upload a PDF or image of lab results. The system extracts, analyzes,
                                and streams clinical insights in real time via Qwen Vision Language Model.
                            </p>
                            {/* <div className="heroActions">
                                <label htmlFor="lab-file-input" className="btn btn-primary btn-label">
                                    <IconUpload /> Choose file
                                </label>
                                <button className="btn btn-secondary" type="button" onClick={() => setActiveTab('chat')}>
                                    <IconChat /> Open chat
                                </button>
                                <button className="btn btn-ghost" type="button" onClick={() => setActiveTab('history')}>
                                    <IconClock /> History
                                </button>
                            </div> */}
                        </div>

                        {/* <div className="heroMetrics" aria-label="System info">
                            <div className="heroMetricCard">
                                <span className="metricLabel">Backend endpoint</span>
                                <span className="metricValue">{backendUrl}</span>
                            </div>
                            <div className="heroMetricCard">
                                <span className="metricLabel">Current status</span>
                                <span className="metricValue">{status}</span>
                            </div>
                        </div> */}
                    </div>

                    <div className="statsRow" role="list" aria-label="Summary metrics">
                        {stats.map((item) => (
                            <div key={item.label} className="statCell" role="listitem">
                                <span className="metricValueLarge"
                                    style={{
                                        color: item.label === 'Critical' && item.value > 0 ? 'var(--danger)'
                                            : item.label === 'Abnormal' && item.value > 0 ? 'var(--warning)'
                                                : undefined
                                    }}>
                                    {item.value}
                                </span>
                                <span className="metricLabel">{item.label}</span>
                            </div>
                        ))}
                    </div>
                </section>

                {/* ── Navigation ───────────────────── */}
                <nav className="navPill" aria-label="Tab navigation" role="tablist">
                    {(['overview', 'chat', 'history'] as TabKey[]).map((tab) => (
                        <button
                            key={tab} type="button" role="tab"
                            aria-selected={tab === activeTab}
                            id={`tab-${tab}`}
                            className={tab === activeTab ? 'navPillItem navPillItemActive' : 'navPillItem'}
                            onClick={() => setActiveTab(tab)}
                        >
                            {TAB_LABELS[tab]}
                        </button>
                    ))}
                </nav>

                {/* ── Overview Tab ─────────────────── */}
                {activeTab === 'overview' && (
                    <section className="workspaceGrid" role="tabpanel" aria-labelledby="tab-overview">
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

                                <div className="heroActions" style={{ marginTop: '10px' }}>
                                    <button className="btn btn-primary" type="button"
                                        onClick={onRunAnalysis} disabled={analysisBusy || !selectedFile}
                                        aria-busy={analysisBusy}>
                                        {analysisBusy
                                            ? <span className="pendingDots">Analyzing</span>
                                            : 'Run analysis'}
                                    </button>
                                    <button className="btn btn-secondary" type="button"
                                        onClick={loadHistory} disabled={historyLoading} aria-busy={historyLoading}>
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

                        <article className="panel">
                            <div className="panelInner">
                                <div className="panelHeader">
                                    <div className="panelTitleGroup">
                                        <div className="panelTitle">Analysis result</div>
                                        <div className="panelSubtitle">
                                            Summary and abnormal markers from the AI backend.
                                        </div>
                                    </div>
                                    {currentAnalysis ? (
                                        <div className={getBadgeClass(currentAnalysis.status)}>
                                            <span className="badgeDot" />
                                            {currentAnalysis.status}
                                        </div>
                                    ) : (
                                        <div className="badge">No result</div>
                                    )}
                                </div>

                                {currentAnalysis ? (
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
                                                    {currentAnalysis.analysis_date || 'N/A'}
                                                </strong>
                                            </div>
                                            <div className="analysisHeaderCell">
                                                <div className="metricLabel">Source</div>
                                                <strong style={{ fontSize: '0.92rem', color: 'var(--text)' }}>
                                                    {selectedFile?.name || 'From history'}
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
                                                            onClick={() => setSelectedOrganId('all')}
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
                                                                    onClick={() => setSelectedOrganId(organId)}
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
                                                        <div key={`${result.indicator_name}-${result.organ_id}`} className="resultCard">
                                                            <div className="resultTopRow">
                                                                <div>
                                                                    <div className="resultName">{result.indicator_name}</div>
                                                                    <div className="resultMeta">
                                                                        {organLabel(result.organ_id)} · {result.reference_range || 'N/A'}
                                                                    </div>
                                                                </div>
                                                                <div className={getSeverityClass(result.severity)}>
                                                                    {severityLabel(result.severity)}
                                                                </div>
                                                            </div>
                                                            <div className="resultValueRow">
                                                                <strong>{result.value || '—'}</strong>
                                                                <span>{result.unit}</span>
                                                            </div>
                                                            {result.patient_advice && (
                                                                <p className="resultAdvice">{result.patient_advice}</p>
                                                            )}
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
                                ) : (
                                    <div className="emptyState emptyStateLg" role="status">
                                        <div className="emptyStateIcon" aria-hidden="true"><IconEmpty /></div>
                                        <p>No results yet. Upload a file and run an analysis to get started.</p>
                                    </div>
                                )}
                            </div>
                        </article>
                    </section>
                )}

                {/* ── Chat Tab ─────────────────────── */}
                {activeTab === 'chat' && (
                    <section className="workspaceGrid workspaceGridChat" role="tabpanel" aria-labelledby="tab-chat">
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
                                                    {msg.role === 'user' ? 'You' : 'Smart Labs AI'}
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
                    <section className="workspaceGrid workspaceGridHistory" role="tabpanel" aria-labelledby="tab-history">
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

                                <div className="historyList" role="list" aria-label="History records">
                                    {history.length > 0 ? (
                                        history.map((entry, idx) => {
                                            const isSelected = entry.id === selectedHistoryId;
                                            const indicatorCount = entry.analysis.results.length;
                                            const abnormalCount = entry.analysis.results.filter((r) => r.severity !== 'normal').length;
                                            const criticalCount = entry.analysis.results.filter((r) => r.severity === 'critical').length;
                                            return (
                                                <button key={entry.id} type="button" role="listitem"
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
                                            );
                                        })
                                    ) : (
                                        <div className="emptyState emptyStateLg" role="status">
                                            <div className="emptyStateIcon" aria-hidden="true"><IconEmpty /></div>
                                            <p>No history yet. Upload and analyze your first file.</p>
                                        </div>
                                    )}
                                </div>
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
                                                <div key={`hist-${result.indicator_name}-${result.organ_id}`} className="resultCard">
                                                    <div className="resultTopRow">
                                                        <div>
                                                            <div className="resultName">{result.indicator_name}</div>
                                                            <div className="resultMeta">
                                                                {organLabel(result.organ_id)} · {result.reference_range || 'N/A'}
                                                            </div>
                                                        </div>
                                                        <div className={getSeverityClass(result.severity)}>
                                                            {severityLabel(result.severity)}
                                                        </div>
                                                    </div>
                                                    <div className="resultValueRow">
                                                        <strong>{result.value || '—'}</strong>
                                                        <span>{result.unit}</span>
                                                    </div>
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
                        Smart Labs Analyzer · Alibaba Cloud · Qwen VL ·{' '}
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

function severityLabel(severity: string) {
    return STATUS_LABELS[severity] ?? severity;
}

function getSeverityClass(severity: string) { return `severity-badge severity-${severity}`; }

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

function formatFileSize(size: number) {
    if (size < 1024) return `${size} B`;
    const units = ['KB', 'MB', 'GB'];
    let value = size / 1024, index = 0;
    while (value >= 1024 && index < units.length - 1) { value /= 1024; index++; }
    return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[index]}`;
}