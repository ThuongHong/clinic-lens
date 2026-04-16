interface HomeTabProps {
    patientName: string;
    hasAnalysis: boolean;
    totalIndicators: number;
    abnormalIndicators: number;
    onGoOverview: () => void;
    onGoHistory: () => void;
    onGoChat: () => void;
}

export function HomeTab({
    patientName,
    hasAnalysis,
    totalIndicators,
    abnormalIndicators,
    onGoOverview,
    onGoHistory,
    onGoChat
}: HomeTabProps) {
    return (
        <section id="panel-home" className="workspaceGrid workspaceGridOverviewIdle" role="tabpanel" aria-labelledby="tab-home" tabIndex={0}>
            <article className="panel">
                <div className="panelInner homeTabPanel">
                    <div className="homeHero">
                        <p className="homeEyebrow">Landing</p>
                        <h2>Welcome to ClinicLens</h2>
                        <p className="homeLead">
                            {patientName.trim()
                                ? `Hi ${patientName.trim()}, use this home tab as your start point before analysis, history, and AI chat.`
                                : 'Use this home tab as your start point before analysis, history, and AI chat.'}
                        </p>
                    </div>

                    <div className="homeActionGrid" role="group" aria-label="Quick actions">
                        <button type="button" className="btn btn-primary" onClick={onGoOverview}>
                            Start New Analysis
                        </button>
                        <button type="button" className="btn btn-secondary" onClick={onGoHistory}>
                            Open History
                        </button>
                        <button type="button" className="btn btn-secondary" onClick={onGoChat}>
                            Open AI Chat
                        </button>
                    </div>

                    <div className="homePlaceholderCard" role="status" aria-live="polite">
                        <div className="homePlaceholderTitle">Placeholder status</div>
                        <p>
                            This Home tab is currently a landing placeholder. You can expand it later with onboarding,
                            tutorial cards, or system announcements.
                        </p>
                        {hasAnalysis ? (
                            <p className="homePlaceholderMeta">
                                Latest session snapshot: {totalIndicators} indicators, {abnormalIndicators} abnormal.
                            </p>
                        ) : (
                            <p className="homePlaceholderMeta">
                                No analysis loaded yet in this session.
                            </p>
                        )}
                    </div>
                </div>
            </article>
        </section>
    );
}
