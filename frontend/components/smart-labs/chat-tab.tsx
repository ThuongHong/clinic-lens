import type { MutableRefObject } from 'react';

import type { AnalysisHistoryEntry, LabAnalysis } from '@/lib/types';

import { IconChat, IconEmpty, IconSend } from './icons';
import type { ChatMessage } from './types';
import { formatDateTime, sourceNameFromPath } from './utils';

const PRESET_CHAT_COMMANDS = [
    { label: 'Summary', prompt: 'Summary result for me with key findings and what matters most.' },
    { label: 'Urgent risks', prompt: 'Which indicators are most urgent and why?' },
    { label: 'Compare trends', prompt: 'Compare selected results and explain notable changes.' },
    { label: 'Action plan', prompt: 'Give me a simple 7-day action plan based on these results.' }
] as const;

interface ChatTabProps {
    chatBusy: boolean;
    chatMessages: ChatMessage[];
    chatInput: string;
    setChatInput: (value: string) => void;
    onSendChat: (messageOverride?: string) => Promise<void>;
    onRunPresetCommand: (command: string) => void;
    chatError: string | null;
    chatEndRef: MutableRefObject<HTMLDivElement | null>;
    history: AnalysisHistoryEntry[];
    chatContextHistoryIds: string[];
    onToggleChatContextHistory: (historyId: string) => void;
    currentAnalysis: LabAnalysis | null;
    onGoOverview: () => void;
}

export function ChatTab({
    chatBusy,
    chatMessages,
    chatInput,
    setChatInput,
    onSendChat,
    onRunPresetCommand,
    chatError,
    chatEndRef,
    history,
    chatContextHistoryIds,
    onToggleChatContextHistory,
    currentAnalysis,
    onGoOverview
}: ChatTabProps) {
    const selectedContextCount = chatContextHistoryIds.length;

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
                        <div className="chatPresetWrap" role="group" aria-label="Preset commands">
                            {PRESET_CHAT_COMMANDS.map((item) => (
                                <button
                                    key={item.label}
                                    type="button"
                                    className="chatPresetBtn"
                                    onClick={() => onRunPresetCommand(item.prompt)}
                                    disabled={chatBusy || selectedContextCount === 0}
                                >
                                    {item.label}
                                </button>
                            ))}
                        </div>
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
                                {selectedContextCount > 0
                                    ? `Using ${selectedContextCount} selected context record${selectedContextCount > 1 ? 's' : ''}`
                                    : 'Select one or more history records before chatting.'}
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
                            <div className="panelSubtitle">Selected history records are treated equally for context.</div>
                        </div>
                        <div className="badge">{selectedContextCount > 0 ? 'Active' : 'None'}</div>
                    </div>

                    {currentAnalysis ? (
                        <div className="contextCard">

                            {history.length > 0 && (
                                <>
                                    <div className="miniSectionTitle" style={{ marginTop: '8px' }}>History context toggles</div>
                                    <div className="contextToggleList">
                                        {history.slice(0, 12).map((entry) => {
                                            const isActive = chatContextHistoryIds.includes(entry.id);
                                            const abnormalCount = entry.analysis.results.filter((item) => item.severity !== 'normal').length;
                                            const sourceName = entry.source_file_name?.trim()
                                                || (entry.object_key ? sourceNameFromPath(entry.object_key) : '')
                                                || (entry.file_url ? sourceNameFromPath(entry.file_url) : '')
                                                || 'Unknown source';
                                            const uploadDateTime = formatDateTime(entry.created_at);

                                            return (
                                                <button
                                                    key={entry.id}
                                                    type="button"
                                                    className={isActive ? 'contextToggleItem active' : 'contextToggleItem'}
                                                    onClick={() => onToggleChatContextHistory(entry.id)}
                                                    aria-pressed={isActive}
                                                    title="Toggle chat context"
                                                >
                                                    <span className="contextToggleMain">
                                                        {sourceName}
                                                    </span>
                                                    <span className="contextToggleMeta">
                                                        {entry.analysis.results.length} indicators · {abnormalCount} abnormal
                                                    </span>
                                                    <span className="contextToggleSubMeta">
                                                        Uploaded: {uploadDateTime}
                                                    </span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </>
                            )}
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
