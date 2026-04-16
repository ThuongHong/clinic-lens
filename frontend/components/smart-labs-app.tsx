'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, KeyboardEvent as ReactKeyboardEvent } from 'react';

import {
    fetchStsToken,
    parseAnalysis,
    parseChatResult,
    streamAnalysis,
    streamChat
} from '@/lib/backend';
import { uploadFileToOss } from '@/lib/oss';
import type {
    AnalysisHistoryEntry,
    LabAnalysis
} from '@/lib/types';
import { ChatTab } from './smart-labs/chat-tab';
import { HistoryTab } from './smart-labs/history-tab';
import { OverviewTab } from './smart-labs/overview-tab';
import { PatientNamePrompt } from './smart-labs/patient-name-prompt';
import type { ChatMessage } from './smart-labs/types';
import {
    PATIENT_NAME_STORAGE_KEY,
    SESSION_HISTORY_STORAGE_KEY,
    createId,
    formatDateTime,
    formatError,
    organLabel,
    parseEventPayload,
    sourceNameFromPath,
    validateUploadFile
} from './smart-labs/utils';

type TabKey = 'overview' | 'chat' | 'history';
const MAX_CHAT_CONTEXT_RECORDS = 5;

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
    const [chatContextHistoryIds, setChatContextHistoryIds] = useState<string[]>([]);
    const [patientName, setPatientName] = useState('');
    const [patientNameDraft, setPatientNameDraft] = useState('');
    const [showPatientNamePrompt, setShowPatientNamePrompt] = useState(false);
    const [selectedOrganId, setSelectedOrganId] = useState<string>('all');
    const [uploadValidationError, setUploadValidationError] = useState<string | null>(null);
    const [isDraftNewUpload, setIsDraftNewUpload] = useState(false);

    const chatEndRef = useRef<HTMLDivElement | null>(null);

    const selectedHistory = useMemo(
        () => history.find((entry) => entry.id === selectedHistoryId) ?? null,
        [history, selectedHistoryId]
    );

    const selectedChatContextEntries = useMemo(() => {
        const lookup = new Map(history.map((entry) => [entry.id, entry]));
        const orderedIds = chatContextHistoryIds
            .filter((id, index, all) => all.indexOf(id) === index)
            .slice(0, MAX_CHAT_CONTEXT_RECORDS);

        const entries = orderedIds
            .map((id) => lookup.get(id))
            .filter((entry): entry is AnalysisHistoryEntry => Boolean(entry));

        if (entries.length > 0) {
            return entries;
        }

        return history.length > 0 ? [history[0]] : [];
    }, [history, chatContextHistoryIds]);

    const currentAnalysis = analysis ?? (isDraftNewUpload ? null : selectedHistory?.analysis ?? null);
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

    const overviewUploadDateTime = useMemo(() => {
        if (currentHistoryEntry?.created_at) {
            return formatDateTime(currentHistoryEntry.created_at);
        }
        if (currentAnalysis?.created_at) {
            return formatDateTime(currentAnalysis.created_at);
        }
        return 'N/A';
    }, [currentHistoryEntry, currentAnalysis]);

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
        if (isDraftNewUpload) {
            return;
        }
        if (!selectedHistoryId && history.length > 0) {
            setSelectedHistoryId(history[0].id);
            setAnalysis(history[0].analysis);
        }
    }, [history, selectedHistoryId, isDraftNewUpload]);

    useEffect(() => {
        const availableIds = new Set(history.map((entry) => entry.id));
        setChatContextHistoryIds((prev) => {
            return prev
                .filter((id, index, all) => all.indexOf(id) === index && availableIds.has(id))
                .slice(0, MAX_CHAT_CONTEXT_RECORDS);
        });
    }, [history]);

    useEffect(() => {
        if (activeTab !== 'chat' || history.length === 0 || chatContextHistoryIds.length > 0) {
            return;
        }

        const newest = history[0];
        setChatContextHistoryIds([newest.id]);
        if (!selectedHistoryId) {
            setSelectedHistoryId(newest.id);
            setAnalysis(newest.analysis);
        }
    }, [activeTab, history, chatContextHistoryIds.length, selectedHistoryId]);

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
            if (!isDraftNewUpload && !selectedHistoryId && items.length > 0) {
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

        if (currentAnalysis) {
            setIsDraftNewUpload(true);
            setAnalysis(null);
            setSelectedHistoryId(null);
            setChatContextHistoryIds([]);
            setChatMessages([]);
            setChatConversationId(null);
            setChatError(null);
        }

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
        setChatContextHistoryIds([]);
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
                        setIsDraftNewUpload(false);
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
                        if (nextHistoryId) {
                            setSelectedHistoryId(nextHistoryId);
                            setChatContextHistoryIds([nextHistoryId]);
                        }
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

    function buildAdditionalHistoryChatContext(entries: AnalysisHistoryEntry[]) {
        if (entries.length === 0) {
            return '';
        }

        const lines = entries.map((entry, index) => {
            const total = entry.analysis.results.length;
            const abnormalItems = entry.analysis.results.filter((item) => item.severity !== 'normal');
            const criticalCount = entry.analysis.results.filter((item) => item.severity === 'critical').length;
            const topAbnormal = abnormalItems
                .slice(0, 4)
                .map((item) => `${item.indicator_name}: ${item.value || 'N/A'} ${item.unit || ''}`.trim());

            const summaryDate = entry.analysis.analysis_date || formatDateTime(entry.created_at);
            const abnormalNote = topAbnormal.length > 0
                ? ` Top abnormal indicators: ${topAbnormal.join('; ')}.`
                : '';

            return `${index + 1}. Record #${entry.id.slice(0, 8)} | Date: ${summaryDate} | Indicators: ${total}, Abnormal: ${abnormalItems.length}, Critical: ${criticalCount}.${abnormalNote}`;
        });

        return [
            'Selected history context records (peer context):',
            'The chat API needs one anchor record id for transport, but treat all provided records equally in reasoning.',
            ...lines
        ].join('\n');
    }

    function toggleChatContextHistory(entryId: string) {
        if (!entryId) {
            return;
        }

        setChatContextHistoryIds((prev) => {
            const exists = prev.includes(entryId);
            if (exists) {
                const next = prev.filter((id) => id !== entryId);
                if (next.length > 0) {
                    return next;
                }
                return history.length > 0 ? [history[0].id] : [];
            }

            const withoutDuplicate = prev.filter((id) => id !== entryId);
            return [...withoutDuplicate, entryId].slice(0, MAX_CHAT_CONTEXT_RECORDS);
        });
    }

    function runPresetChatCommand(command: string) {
        if (chatBusy) {
            return;
        }
        void onSendChat(command);
    }

    async function onSendChat(messageOverride?: string) {
        const message = (messageOverride ?? chatInput).trim();
        const anchorEntry = selectedChatContextEntries[0] ?? history[0] ?? null;
        if (!anchorEntry) { setChatError('Please select or run an analysis first.'); return; }
        if (!message) return;

        const extraContextEntries = selectedChatContextEntries
            .filter((entry) => entry.id !== anchorEntry.id)
            .slice(0, Math.max(0, MAX_CHAT_CONTEXT_RECORDS - 1));
        const extraContextBlock = buildAdditionalHistoryChatContext(extraContextEntries);
        const requestMessage = extraContextBlock
            ? `${message}\n\n${extraContextBlock}`
            : message;

        setChatBusy(true);
        setChatError(null);
        setChatInput('');

        const userMsg: ChatMessage = {
            id: createId('user'),
            role: 'user',
            text: extraContextEntries.length > 0
                ? `${message}\n\n[Using ${extraContextEntries.length} additional history context record${extraContextEntries.length > 1 ? 's' : ''}]`
                : message
        };
        const assistantMsg: ChatMessage = {
            id: createId('assistant'), role: 'assistant',
            text: 'Composing response', pending: true
        };
        setChatMessages((c) => [...c, userMsg, assistantMsg]);

        try {
            for await (const event of streamChat({
                history_id: anchorEntry.id, message: requestMessage,
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
        setIsDraftNewUpload(false);
        setSelectedHistoryId(entry.id);
        setChatContextHistoryIds([entry.id]);
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
                        overviewUploadDateTime={overviewUploadDateTime}
                    />
                )}

                {activeTab === 'chat' && (
                    <ChatTab
                        chatBusy={chatBusy}
                        chatMessages={chatMessages}
                        chatInput={chatInput}
                        setChatInput={setChatInput}
                        onSendChat={onSendChat}
                        onRunPresetCommand={runPresetChatCommand}
                        chatError={chatError}
                        chatEndRef={chatEndRef}
                        history={history}
                        chatContextHistoryIds={chatContextHistoryIds}
                        onToggleChatContextHistory={toggleChatContextHistory}
                        currentAnalysis={currentAnalysis}
                        onGoOverview={() => setActiveTab('overview')}
                    />
                )}

                {activeTab === 'history' && (
                    <HistoryTab
                        history={history}
                        selectedHistoryId={selectedHistoryId}
                        historyLoading={historyLoading}
                        historyError={historyError}
                        loadHistory={loadHistory}
                        onSelectHistory={selectHistory}
                        onGoOverview={() => setActiveTab('overview')}
                    />
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
