'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';

import {
    fetchAnalysisHistory,
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
    kidneys: 'Thận',
    liver: 'Gan',
    heart: 'Tim',
    lungs: 'Phổi',
    blood: 'Máu',
    pancreas: 'Tụy',
    thyroid: 'Tuyến giáp',
    bone: 'Xương',
    immune: 'Miễn dịch',
    other: 'Khác'
};

const STATUS_LABELS: Record<string, string> = {
    normal: 'Bình thường',
    abnormal_high: 'Cao',
    abnormal_low: 'Thấp',
    critical: 'Nguy kịch',
    unknown: 'Chưa rõ'
};

export default function SmartLabsApp() {
    const [activeTab, setActiveTab] = useState<TabKey>('overview');
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [status, setStatus] = useState('Sẵn sàng');
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

    const chatEndRef = useRef<HTMLDivElement | null>(null);

    const backendUrl = resolveBackendBaseUrl();

    const selectedHistory = useMemo(
        () => history.find((entry) => entry.id === selectedHistoryId) ?? null,
        [history, selectedHistoryId]
    );

    const currentAnalysis = analysis ?? selectedHistory?.analysis ?? null;

    useEffect(() => {
        void loadHistory();
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

    async function loadHistory() {
        setHistoryLoading(true);
        setHistoryError(null);

        try {
            const items = await fetchAnalysisHistory();
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
            setStatus(`Đã chọn ${file.name}`);
            setAnalysisLogs([`✓ Selected file: ${file.name}`]);
        }
    }

    async function onRunAnalysis() {
        if (!selectedFile) {
            setStatus('Hãy chọn file trước.');
            return;
        }

        setAnalysisBusy(true);
        setChatMessages([]);
        setChatConversationId(null);
        setChatError(null);
        setAnalysis(null);
        setAnalysisLogs([]);
        setStatus('Đang xin STS token...');
        setActiveTab('overview');

        let nextHistoryId: string | null = null;

        try {
            const sts = await fetchStsToken();
            setAnalysisLogs((current) => [...current, '✓ STS token acquired']);
            setStatus('Đang upload file lên OSS...');

            const uploadResult = await uploadFileToOss(selectedFile, sts);
            setAnalysisLogs((current) => [...current, `✓ Upload complete: ${uploadResult.objectKey}`]);
            setStatus('Đang khởi tạo phân tích...');

            for await (const event of streamAnalysis({ object_key: uploadResult.objectKey })) {
                if (event.event === 'ready') {
                    appendLog('✓ SSE connection opened');
                    setStatus('Kết nối stream thành công');
                    continue;
                }

                if (event.event === 'signed_url_ready') {
                    const payload = parseEventPayload(event);
                    appendLog(`✓ Private URL ready for ${payload?.object_key ?? 'object'}`);
                    continue;
                }

                if (event.event === 'post_process') {
                    const payload = parseEventPayload(event);
                    const message = String(payload?.message || 'Đang tổng hợp kết quả...');
                    appendLog(`• ${message}`);
                    setStatus(message);
                    continue;
                }

                if (event.event === 'warning') {
                    const payload = parseEventPayload(event);
                    const message = String(payload?.message || 'Cảnh báo từ backend');
                    appendLog(`⚠ ${message}`);
                    continue;
                }

                if (event.event === 'result') {
                    const payload = parseEventPayload(event);
                    if (payload) {
                        const parsed = parseAnalysis(payload);
                        setAnalysis(parsed);
                        nextHistoryId = String(payload.history_id || parsed.history_id || '');
                        if (nextHistoryId) {
                            setSelectedHistoryId(nextHistoryId);
                        }
                        setStatus(parsed.status === 'error' ? parsed.error_message || 'Phân tích trả về lỗi' : 'Đã nhận kết quả phân tích');
                        appendLog('✓ Final JSON result parsed');
                        setChatMessages([]);
                        setChatConversationId(null);
                    }
                    continue;
                }

                if (event.event === 'done') {
                    setStatus('Phân tích hoàn tất');
                }
            }

            await loadHistory();

            if (nextHistoryId) {
                setSelectedHistoryId(nextHistoryId);
            }
        } catch (error) {
            setStatus('Phân tích thất bại');
            appendLog(`❌ ${formatError(error)}`);
        } finally {
            setAnalysisBusy(false);
        }
    }

    async function onSendChat() {
        const message = chatInput.trim();

        if (!selectedHistoryId) {
            setChatError('Hãy chọn hoặc chạy một phân tích trước.');
            return;
        }

        if (!message) {
            return;
        }

        setChatBusy(true);
        setChatError(null);
        setChatInput('');

        const userMessage: ChatMessage = {
            id: createId('user'),
            role: 'user',
            text: message
        };

        const assistantMessage: ChatMessage = {
            id: createId('assistant'),
            role: 'assistant',
            text: 'Đang soạn câu trả lời...',
            pending: true
        };

        setChatMessages((current) => [...current, userMessage, assistantMessage]);

        try {
            for await (const event of streamChat({
                history_id: selectedHistoryId,
                message,
                conversation_id: chatConversationId ?? undefined,
                language: 'vi',
                detail_level: 'patient'
            })) {
                if (event.event === 'status') {
                    const payload = parseEventPayload(event);
                    const conversationId = payload?.conversation_id ? String(payload.conversation_id) : null;
                    if (conversationId) {
                        setChatConversationId(conversationId);
                    }
                    continue;
                }

                if (event.event === 'post_process') {
                    const payload = parseEventPayload(event);
                    const messageText = String(payload?.message || 'Đang xử lý ngữ cảnh...');
                    setStatus(messageText);
                    continue;
                }

                if (event.event === 'warning') {
                    const payload = parseEventPayload(event);
                    setChatError(String(payload?.message || 'Có cảnh báo trong quá trình chat.'));
                    continue;
                }

                if (event.event === 'result') {
                    const payload = parseEventPayload(event);
                    if (!payload) {
                        continue;
                    }

                    const chatResult = parseChatResult(payload);
                    if (chatResult) {
                        setChatConversationId(chatResult.conversation_id || chatConversationId);
                        setChatMessages((current) => {
                            if (current.length === 0) {
                                return current;
                            }

                            const next = [...current];
                            const lastIndex = next.length - 1;
                            next[lastIndex] = {
                                ...next[lastIndex],
                                text: chatResult.assistant.answer_text || 'Không có nội dung trả lời.',
                                assistant: chatResult.assistant,
                                pending: false
                            };
                            return next;
                        });
                    }

                    setStatus('Chat response is ready');
                    continue;
                }

                if (event.event === 'error') {
                    const payload = parseEventPayload(event);
                    throw new Error(String(payload?.message || event.data || 'Chat failed'));
                }
            }
        } catch (error) {
            setChatError(formatError(error));
            setStatus('Chat thất bại');
            setChatMessages((current) => {
                if (current.length === 0) {
                    return current;
                }

                const next = [...current];
                const lastIndex = next.length - 1;
                if (next[lastIndex].role === 'assistant') {
                    next[lastIndex] = {
                        ...next[lastIndex],
                        text: formatError(error),
                        pending: false
                    };
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
        setStatus(`Đang xem phân tích lúc ${formatDateTime(entry.created_at)}`);
        setActiveTab('overview');
    }

    const stats = useMemo(() => {
        const results = currentAnalysis?.results ?? [];
        const abnormalResults = results.filter((item) => item.severity !== 'normal');
        const criticalResults = results.filter((item) => item.severity === 'critical');
        const organCount = new Set(results.map((item) => item.organ_id).filter(Boolean)).size;

        return [
            { label: 'Chỉ số', value: results.length },
            { label: 'Bất thường', value: abnormalResults.length },
            { label: 'Critical', value: criticalResults.length },
            { label: 'Cơ quan', value: organCount }
        ];
    }, [currentAnalysis]);

    return (
        <div className="shell">
            <div className="shellGlow shellGlowOne" />
            <div className="shellGlow shellGlowTwo" />
            <main className="appShell">
                <section className="heroCard panel">
                    <div className="heroGrid">
                        <div className="heroCopy">
                            <div className="eyebrow">Smart Labs Analyzer · Next.js + Alibaba Cloud</div>
                            <h1>Web-first lab analysis workspace for upload, streaming insight, and clinical follow-up.</h1>
                            <p>
                                Giao diện web mới tập trung vào phân tích xét nghiệm, chat follow-up và lịch sử phân tích trên trình duyệt.
                            </p>
                            <div className="heroActions">
                                <label className="primaryButton" htmlFor="lab-file-input">
                                    Chọn file
                                </label>
                                <button className="secondaryButton" type="button" onClick={() => setActiveTab('chat')}>
                                    Mở Chat
                                </button>
                                <button className="ghostButton" type="button" onClick={() => setActiveTab('history')}>
                                    Lịch sử
                                </button>
                            </div>
                        </div>
                        <div className="heroSide">
                            <div className="heroMetricCard">
                                <span className="metricLabel">Backend</span>
                                <strong>{backendUrl}</strong>
                            </div>
                            <div className="heroMetricCard">
                                <span className="metricLabel">Status</span>
                                <strong>{status}</strong>
                            </div>
                        </div>
                    </div>
                    <div className="statsGrid">
                        {stats.map((item) => (
                            <div key={item.label} className="statCard">
                                <span className="metricValue">{item.value}</span>
                                <span className="metricLabel">{item.label}</span>
                            </div>
                        ))}
                    </div>
                </section>

                <section className="tabBar panel">
                    {(['overview', 'chat', 'history'] as TabKey[]).map((tab) => (
                        <button
                            key={tab}
                            type="button"
                            className={tab === activeTab ? 'tabButton tabButtonActive' : 'tabButton'}
                            onClick={() => setActiveTab(tab)}
                        >
                            {tab === 'overview' ? 'Overview' : tab === 'chat' ? 'Chat' : 'History'}
                        </button>
                    ))}
                </section>

                {activeTab === 'overview' && (
                    <section className="workspaceGrid">
                        <article className="panel">
                            <div className="panelHeader">
                                <div>
                                    <div className="panelTitle">Upload & Analyze</div>
                                    <div className="panelSubtitle">Chọn PDF hoặc ảnh, upload trực tiếp lên OSS rồi stream kết quả từ backend.</div>
                                </div>
                                <div className="panelBadge">{analysisBusy ? 'Đang xử lý' : 'Sẵn sàng'}</div>
                            </div>

                            <div className="uploadCard">
                                <input id="lab-file-input" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" onChange={onPickFile} />
                                <div className="uploadHint">Hỗ trợ PDF, PNG, JPG, JPEG, WEBP.</div>
                                {selectedFile ? (
                                    <div className="uploadMeta">
                                        <strong>{selectedFile.name}</strong>
                                        <span>{formatFileSize(selectedFile.size)}</span>
                                    </div>
                                ) : (
                                    <div className="uploadMeta muted">Chưa chọn file nào.</div>
                                )}
                                <div className="heroActions">
                                    <button className="primaryButton buttonLike" type="button" onClick={onRunAnalysis} disabled={analysisBusy}>
                                        {analysisBusy ? 'Đang phân tích...' : 'Run analysis'}
                                    </button>
                                    <button className="secondaryButton buttonLike" type="button" onClick={loadHistory} disabled={historyLoading}>
                                        {historyLoading ? 'Đang tải...' : 'Refresh history'}
                                    </button>
                                </div>
                            </div>

                            <div className="statusRail">
                                <span className="statusLabel">Trạng thái</span>
                                <strong>{status}</strong>
                            </div>

                            <div className="logCard">
                                <div className="panelTitle small">Stream log</div>
                                {analysisLogs.length > 0 ? (
                                    <ul className="logList">
                                        {analysisLogs.map((line) => (
                                            <li key={line}>{line}</li>
                                        ))}
                                    </ul>
                                ) : (
                                    <div className="emptyState">Chưa có log stream.</div>
                                )}
                            </div>
                        </article>

                        <article className="panel">
                            <div className="panelHeader">
                                <div>
                                    <div className="panelTitle">Analysis result</div>
                                    <div className="panelSubtitle">Tóm tắt và các chỉ số bất thường từ backend.</div>
                                </div>
                                {currentAnalysis ? (
                                    <div className={badgeClass(currentAnalysis.status)}>{currentAnalysis.status}</div>
                                ) : (
                                    <div className="panelBadge muted">No result yet</div>
                                )}
                            </div>

                            {currentAnalysis ? (
                                <div className="analysisStack">
                                    <div className="analysisHeaderCard">
                                        <div>
                                            <div className="metricLabel">Patient</div>
                                            <strong>{currentAnalysis.patient_name?.trim() || 'Unknown patient'}</strong>
                                        </div>
                                        <div>
                                            <div className="metricLabel">Date</div>
                                            <strong>{currentAnalysis.analysis_date || 'N/A'}</strong>
                                        </div>
                                        <div>
                                            <div className="metricLabel">File</div>
                                            <strong>{selectedFile?.name || 'History result'}</strong>
                                        </div>
                                    </div>

                                    <div className="resultGrid">
                                        {currentAnalysis.results.map((result) => (
                                            <div key={`${result.indicator_name}-${result.organ_id}`} className="resultCard">
                                                <div className="resultTopRow">
                                                    <div>
                                                        <div className="resultName">{result.indicator_name}</div>
                                                        <div className="resultMeta">{organLabel(result.organ_id)} · {result.reference_range || 'N/A'}</div>
                                                    </div>
                                                    <div className={severityClass(result.severity)}>{severityLabel(result.severity)}</div>
                                                </div>
                                                <div className="resultValueRow">
                                                    <strong>{result.value || '—'}</strong>
                                                    <span>{result.unit}</span>
                                                </div>
                                                {result.patient_advice ? <p>{result.patient_advice}</p> : null}
                                            </div>
                                        ))}
                                    </div>

                                    {currentAnalysis.summary?.organ_summary?.length ? (
                                        <div className="sectionCard">
                                            <div className="panelTitle small">Organ summary</div>
                                            <div className="chipWrap">
                                                {currentAnalysis.summary.organ_summary.map((item) => (
                                                    <span key={item.organ_id} className="softChip">
                                                        {organLabel(item.organ_id)} · {STATUS_LABELS[item.worst_severity] ?? item.worst_severity} · {item.abnormal_count}/{item.indicator_count}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    ) : null}

                                    {currentAnalysis.advice?.general_recommendations?.length ? (
                                        <div className="sectionCard">
                                            <div className="panelTitle small">General recommendations</div>
                                            <ul className="bulletList">
                                                {currentAnalysis.advice.general_recommendations.map((item) => (
                                                    <li key={item}>{item}</li>
                                                ))}
                                            </ul>
                                        </div>
                                    ) : null}
                                </div>
                            ) : (
                                <div className="emptyState large">
                                    Chưa có kết quả. Hãy upload file và chạy phân tích.
                                </div>
                            )}
                        </article>
                    </section>
                )}

                {activeTab === 'chat' && (
                    <section className="workspaceGrid chatLayout">
                        <article className="panel">
                            <div className="panelHeader">
                                <div>
                                    <div className="panelTitle">Smart Labs Chat</div>
                                    <div className="panelSubtitle">
                                        Hỏi tiếp về chỉ số, nguy cơ, và bước tiếp theo dựa trên phân tích đã chọn.
                                    </div>
                                </div>
                                <div className={chatBusy ? 'panelBadge accent' : 'panelBadge'}>{chatBusy ? 'Streaming' : 'Idle'}</div>
                            </div>

                            <div className="chatWindow">
                                {chatMessages.length > 0 ? (
                                    chatMessages.map((message) => (
                                        <div
                                            key={message.id}
                                            className={message.role === 'user' ? 'chatBubble chatBubbleUser' : 'chatBubble chatBubbleAssistant'}
                                        >
                                            <div className="chatBubbleMeta">{message.role === 'user' ? 'Bạn' : 'Assistant'}</div>
                                            <div className="chatBubbleText">{message.text}</div>

                                            {message.assistant ? (
                                                <div className="assistantMetaStack">
                                                    <div className="chipWrap">
                                                        <span className="softChip">Risk: {message.assistant.risk_level.toUpperCase()}</span>
                                                        {message.assistant.escalation ? <span className="softChip danger">Escalation ON</span> : null}
                                                    </div>

                                                    {message.assistant.recommended_actions.length ? (
                                                        <div className="miniSection">
                                                            <div className="panelTitle small">Recommended actions</div>
                                                            <ul className="bulletList compact">
                                                                {message.assistant.recommended_actions.map((item) => (
                                                                    <li key={item}>{item}</li>
                                                                ))}
                                                            </ul>
                                                        </div>
                                                    ) : null}

                                                    {message.assistant.follow_up_questions.length ? (
                                                        <div className="miniSection">
                                                            <div className="panelTitle small">Follow-up questions</div>
                                                            <ul className="bulletList compact">
                                                                {message.assistant.follow_up_questions.map((item) => (
                                                                    <li key={item}>{item}</li>
                                                                ))}
                                                            </ul>
                                                        </div>
                                                    ) : null}

                                                    {message.assistant.disclaimer ? <p className="disclaimerText">{message.assistant.disclaimer}</p> : null}
                                                </div>
                                            ) : null}
                                        </div>
                                    ))
                                ) : (
                                    <div className="emptyState large">
                                        Chưa có hội thoại. Chọn một analysis rồi đặt câu hỏi tiếp.
                                    </div>
                                )}
                                <div ref={chatEndRef} />
                            </div>

                            <div className="chatComposer">
                                <textarea
                                    value={chatInput}
                                    onChange={(event) => setChatInput(event.target.value)}
                                    placeholder="Ví dụ: Tôi cần lưu ý gì nhất?"
                                    rows={4}
                                />
                                <div className="composerActions">
                                    <div className="composerHint">
                                        {selectedHistoryId ? `Đang chat với history ${selectedHistoryId}` : 'Chọn history trước khi chat.'}
                                    </div>
                                    <button className="primaryButton buttonLike" type="button" onClick={onSendChat} disabled={chatBusy}>
                                        {chatBusy ? 'Đang gửi...' : 'Send'}
                                    </button>
                                </div>
                            </div>

                            {chatError ? <div className="errorBanner">{chatError}</div> : null}
                        </article>

                        <article className="panel">
                            <div className="panelHeader">
                                <div>
                                    <div className="panelTitle">Conversation context</div>
                                    <div className="panelSubtitle">Điểm tựa hiện tại cho câu hỏi chat.</div>
                                </div>
                                <div className="panelBadge">{selectedHistory ? 'Selected' : 'None'}</div>
                            </div>

                            {currentAnalysis ? (
                                <div className="sectionCard">
                                    <div className="metricLabel">Selected analysis</div>
                                    <strong>{currentAnalysis.patient_name?.trim() || 'Unknown patient'}</strong>
                                    <div className="mutedSmall">{currentAnalysis.analysis_date || 'N/A'}</div>
                                    <div className="chipWrap topGap">
                                        <span className="softChip">{currentAnalysis.results.length} indicators</span>
                                        <span className="softChip">{currentAnalysis.results.filter((item) => item.severity !== 'normal').length} abnormal</span>
                                        <span className="softChip">{currentAnalysis.results.filter((item) => item.severity === 'critical').length} critical</span>
                                    </div>
                                </div>
                            ) : (
                                <div className="emptyState large">Chưa có analysis được chọn.</div>
                            )}
                        </article>
                    </section>
                )}

                {activeTab === 'history' && (
                    <section className="workspaceGrid historyLayout">
                        <article className="panel">
                            <div className="panelHeader">
                                <div>
                                    <div className="panelTitle">History</div>
                                    <div className="panelSubtitle">Tải lại và chọn một phân tích trước đó.</div>
                                </div>
                                <button className="secondaryButton buttonLike" type="button" onClick={loadHistory} disabled={historyLoading}>
                                    {historyLoading ? 'Refreshing...' : 'Refresh'}
                                </button>
                            </div>

                            {historyError ? <div className="errorBanner">{historyError}</div> : null}

                            <div className="historyList">
                                {history.length > 0 ? (
                                    history.map((entry) => {
                                        const isSelected = entry.id === selectedHistoryId;
                                        const indicatorCount = entry.analysis.results.length;
                                        const abnormalCount = entry.analysis.results.filter((item) => item.severity !== 'normal').length;
                                        const criticalCount = entry.analysis.results.filter((item) => item.severity === 'critical').length;
                                        return (
                                            <button
                                                key={entry.id}
                                                type="button"
                                                className={isSelected ? 'historyCard historyCardSelected' : 'historyCard'}
                                                onClick={() => selectHistory(entry)}
                                            >
                                                <div className="historyTopRow">
                                                    <div>
                                                        <div className="resultName">{entry.analysis.patient_name?.trim() || 'Unknown patient'}</div>
                                                        <div className="resultMeta">{formatDateTime(entry.created_at)}</div>
                                                    </div>
                                                    <div className={badgeClass(entry.analysis.status)}>{entry.analysis.status}</div>
                                                </div>
                                                <div className="chipWrap topGap">
                                                    <span className="softChip">{indicatorCount} indicators</span>
                                                    <span className="softChip">{abnormalCount} abnormal</span>
                                                    <span className="softChip">{criticalCount} critical</span>
                                                </div>
                                            </button>
                                        );
                                    })
                                ) : (
                                    <div className="emptyState large">Chưa có history nào.</div>
                                )}
                            </div>
                        </article>

                        <article className="panel">
                            <div className="panelHeader">
                                <div>
                                    <div className="panelTitle">Selected detail</div>
                                    <div className="panelSubtitle">Xem lại kết quả đã chọn.</div>
                                </div>
                                {selectedHistory ? <div className="panelBadge">#{selectedHistory.id.slice(0, 8)}</div> : <div className="panelBadge muted">None</div>}
                            </div>

                            {currentAnalysis ? (
                                <div className="analysisStack">
                                    <div className="analysisHeaderCard">
                                        <div>
                                            <div className="metricLabel">Patient</div>
                                            <strong>{currentAnalysis.patient_name?.trim() || 'Unknown patient'}</strong>
                                        </div>
                                        <div>
                                            <div className="metricLabel">Status</div>
                                            <strong>{currentAnalysis.status}</strong>
                                        </div>
                                        <div>
                                            <div className="metricLabel">Date</div>
                                            <strong>{currentAnalysis.analysis_date || 'N/A'}</strong>
                                        </div>
                                    </div>

                                    <div className="resultGrid">
                                        {currentAnalysis.results.slice(0, 6).map((result) => (
                                            <div key={`${result.indicator_name}-${result.organ_id}`} className="resultCard">
                                                <div className="resultTopRow">
                                                    <div>
                                                        <div className="resultName">{result.indicator_name}</div>
                                                        <div className="resultMeta">{organLabel(result.organ_id)} · {result.reference_range || 'N/A'}</div>
                                                    </div>
                                                    <div className={severityClass(result.severity)}>{severityLabel(result.severity)}</div>
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
                                <div className="emptyState large">Chọn một lịch sử để xem chi tiết.</div>
                            )}
                        </article>
                    </section>
                )}
            </main>
        </div>
    );

    function appendLog(line: string) {
        setAnalysisLogs((current) => [...current, line]);
    }
}

function parseEventPayload(event: SseEvent) {
    try {
        return JSON.parse(event.data) as Record<string, unknown>;
    } catch {
        return null;
    }
}

function formatError(error: unknown) {
    const message = error instanceof Error ? error.message : String(error);

    if (message.includes('does not expose /api/chat') || message.includes('Cannot POST /api/chat')) {
        return 'Backend hiện tại chưa có route chat (/api/chat). Hãy restart backend bằng ./start.sh.';
    }

    if (message.includes('Backend unreachable') || message.includes('Failed to start stream')) {
        return 'Không kết nối được backend. Kiểm tra backend đang chạy ở cổng 9000.';
    }

    return message;
}

function organLabel(organId: string) {
    return (ORGAN_LABELS[organId] ?? organId) || 'Khác';
}

function severityLabel(severity: string) {
    return STATUS_LABELS[severity] ?? severity;
}

function severityClass(severity: string) {
    return `severityBadge severity-${severity}`;
}

function badgeClass(status: string) {
    const normalized = status.toLowerCase();
    if (normalized === 'error') {
        return 'panelBadge danger';
    }

    if (normalized === 'success' || normalized === 'complete') {
        return 'panelBadge success';
    }

    return 'panelBadge';
}

function createId(prefix: string) {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
        return `${prefix}_${crypto.randomUUID()}`;
    }

    return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
}

function formatDateTime(value: string) {
    if (!value) {
        return 'N/A';
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return value;
    }

    return new Intl.DateTimeFormat('vi-VN', {
        dateStyle: 'medium',
        timeStyle: 'short'
    }).format(date);
}

function formatFileSize(size: number) {
    if (size < 1024) {
        return `${size} B`;
    }

    const units = ['KB', 'MB', 'GB'];
    let value = size / 1024;
    let index = 0;

    while (value >= 1024 && index < units.length - 1) {
        value /= 1024;
        index += 1;
    }

    return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[index]}`;
}