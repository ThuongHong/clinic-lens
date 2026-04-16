import React from 'react';
import {
    Sparkles,
    ChevronRight
} from 'lucide-react';

export interface HomeTabProps {
    patientName?: string;
    hasAnalysis?: boolean;
    totalIndicators?: number;
    abnormalIndicators?: number;
    onGoOverview?: () => void;
    onGoHistory?: () => void;
    onGoChat?: () => void;
}

/**
 * HOME TAB COMPONENT
 * Keep home visual language while using shared app page sizing.
 */
export function HomeTab({
    patientName = '',
    hasAnalysis = false,
    totalIndicators = 0,
    abnormalIndicators = 0,
    onGoOverview = () => { }
}: HomeTabProps) {
    return (
        <section
            id="panel-home"
            className="workspaceGrid workspaceGridOverviewIdle"
            role="tabpanel"
            aria-labelledby="tab-home"
            tabIndex={0}
        >
            <article className="panel">
                <div className="panelInner homeTabPanel">
                    <div className="homeHero">
                        <div className="homeEyebrow">
                            <Sparkles size={12} />
                            ClinicLens Intelligence
                        </div>
                        <h1 className="homeTitle">
                            Welcome to ClinicLens
                        </h1>

                        <p className="homeLead">
                            Smart health indicator analysis platform. Discover AI analysis tools, explore your medical
                            history, or chat with an expert assistant.
                        </p>
                    </div>

                    <div className="homePlaceholderCard" role="status">
                        <div className="flex justify-between items-start gap-3">
                            <div className="grid gap-1">
                                <div className="homePlaceholderTitle">System Status</div>
                                <p>Home interface optimized for quick monitoring of your recent sessions.</p>
                            </div>
                            <div className={hasAnalysis ? 'badge accent' : 'badge'}>
                                <span className="badgeDot" />
                                {hasAnalysis ? 'Data Connected' : 'Ready'}
                            </div>
                        </div>

                        <div className="divider" />

                        {hasAnalysis ? (
                            <div className="statsRow">
                                <div className="statCell">
                                    <span className="metricLabel">Total Indicators</span>
                                    <span className="metricValueLarge text-teal-600">{totalIndicators}</span>
                                </div>
                                <div className="statCell">
                                    <span className="metricLabel">Abnormal</span>
                                    <span className={`metricValueLarge ${abnormalIndicators > 0 ? 'text-rose-500' : 'text-teal-600'}`}>
                                        {abnormalIndicators}
                                    </span>
                                </div>
                                <div className="md:col-span-2 flex items-center justify-end">
                                    <button className="btn btn-ghost text-xs uppercase tracking-widest font-bold" onClick={onGoOverview}>
                                        View Details <ChevronRight size={14} />
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <p className="homePlaceholderMeta py-2 italic opacity-60">
                                No analysis sessions performed today.
                            </p>
                        )}
                    </div>
                </div>
            </article>
        </section>
    );
}