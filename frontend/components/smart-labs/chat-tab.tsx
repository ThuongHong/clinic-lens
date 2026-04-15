import type { MutableRefObject } from 'react';

import type { AnalysisHistoryEntry, LabAnalysis } from '@/lib/types';

import { IconChat, IconEmpty, IconSend } from './icons';
import type { ChatMessage } from './types';

interface ChatTabProps {
    chatBusy: boolean;
    chatMessages: ChatMessage[];
    chatInput: string;
    setChatInput: (value: string) => void;
    onSendChat: () => Promise<void>;
    selectedHistoryId: string | null;
    chatError: string | null;
    chatEndRef: MutableRefObject<HTMLDivElement | null>;
    selectedHistory: AnalysisHistoryEntry | null;
    currentAnalysis: LabAnalysis | null;
    onGoOverview: () => void;
}

export function ChatTab({
    chatBusy,
    chatMessages,
    chatInput,
    setChatInput,
    onSendChat,
    selectedHistoryId,
    chatError,
    chatEndRef,
    selectedHistory,
    currentAnalysis,
    onGoOverview
}: ChatTabProps) {
    return (
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
                                <button type="button" className="btn btn-secondary emptyStateAction" onClick={onGoOverview}>
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
                                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                                    void onSendChat();
                                }
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
                                onClick={() => { void onSendChat(); }}
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
    );
}
