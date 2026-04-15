import { useEffect, useMemo, useState } from 'react';
import type { ChangeEvent } from 'react';

import { fetchIndicatorExplanation } from '@/lib/backend';
import type { IndicatorExplanation, LabAnalysis } from '@/lib/types';

import { IconEmpty, IconFile, IconRefresh, IconUpload } from './icons';
import { ReferenceRangeBar } from './reference-range-bar';
import {
    STATUS_LABELS,
    createIndicatorExplainKey,
    displayStatusIcon,
    displayStatusLabel,
    formatError,
    formatFileSize,
    getBadgeClass,
    getResultCardClass,
    getSeverityClass,
    organAbbr,
    organLabel
} from './utils';

export interface OverviewTabProps {
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

export function OverviewTab({
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
