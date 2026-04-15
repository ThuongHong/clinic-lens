import type { AnalysisHistoryEntry, LabAnalysis } from '@/lib/types';

import { IconClock, IconEmpty, IconRefresh } from './icons';
import { ReferenceRangeBar } from './reference-range-bar';
import {
    displayStatusIcon,
    displayStatusLabel,
    formatDateTime,
    getBadgeClass,
    getResultCardClass,
    getSeverityClass,
    organLabel
} from './utils';

interface HistoryTabProps {
    history: AnalysisHistoryEntry[];
    selectedHistoryId: string | null;
    selectedHistory: AnalysisHistoryEntry | null;
    historyLoading: boolean;
    historyError: string | null;
    currentAnalysis: LabAnalysis | null;
    loadHistory: () => Promise<void>;
    onSelectHistory: (entry: AnalysisHistoryEntry) => void;
    onGoOverview: () => void;
}

export function HistoryTab({
    history,
    selectedHistoryId,
    selectedHistory,
    historyLoading,
    historyError,
    currentAnalysis,
    loadHistory,
    onSelectHistory,
    onGoOverview
}: HistoryTabProps) {
    return (
        <section id="panel-history" className="workspaceGrid workspaceGridHistory" role="tabpanel" aria-labelledby="tab-history" tabIndex={0}>
            <article className="panel">
                <div className="panelInner">
                    <div className="panelHeader">
                        <div className="panelTitleGroup">
                            <div className="panelTitle">Analysis history</div>
                            <div className="panelSubtitle">Reload and select a previous analysis record.</div>
                        </div>
                        <button className="btn btn-secondary" type="button"
                            onClick={() => { void loadHistory(); }} disabled={historyLoading} aria-busy={historyLoading}
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
                                            onClick={() => onSelectHistory(entry)}
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
                                    <button type="button" className="btn btn-secondary emptyStateAction" onClick={onGoOverview}>
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
    );
}
