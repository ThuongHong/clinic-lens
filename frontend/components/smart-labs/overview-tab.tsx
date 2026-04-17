import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
    overviewUploadDateTime: string;
    isReorderingResults: boolean;
    onStartNewUpload: () => void;
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
    overviewSource,
    overviewUploadDateTime,
    isReorderingResults,
    onStartNewUpload
}: OverviewTabProps) {
    const [activeInfoResult, setActiveInfoResult] = useState<LabAnalysis['results'][number] | null>(null);
    const [indicatorExplainCache, setIndicatorExplainCache] = useState<Record<string, IndicatorExplanation>>({});
    const [indicatorExplainLoading, setIndicatorExplainLoading] = useState(false);
    const [indicatorExplainError, setIndicatorExplainError] = useState<string | null>(null);
    const [indicatorExplainRequestVersion, setIndicatorExplainRequestVersion] = useState(0);
    const resultCardRefs = useRef<Record<string, HTMLDivElement | null>>({});
    const previousCardPositionsRef = useRef<Record<string, DOMRect>>({});
    const reorderAnimationFrameRef = useRef<number | null>(null);

    const activeInfoResultKey = useMemo(() => {
        if (!activeInfoResult) {
            return '';
        }

        return createIndicatorExplainKey(activeInfoResult);
    }, [activeInfoResult]);

    const activeModelExplanation = activeInfoResultKey
        ? indicatorExplainCache[activeInfoResultKey]
        : undefined;

    const activeReferenceDisplay = activeInfoResult
        ? activeInfoResult.reference_range_structured?.normalized_text_en
        || activeInfoResult.reference_range
        || activeInfoResult.reference_range_original
        || 'N/A'
        : 'N/A';

    const activePatientAdvice = activeInfoResult?.patient_advice?.trim() || '';

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
                    reference_range: activeReferenceDisplay,
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
    }, [activeInfoResult, activeInfoResultKey, indicatorExplainCache, indicatorExplainRequestVersion, activeReferenceDisplay]);

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

    useEffect(() => {
        return () => {
            if (reorderAnimationFrameRef.current != null) {
                window.cancelAnimationFrame(reorderAnimationFrameRef.current);
                reorderAnimationFrameRef.current = null;
            }
        };
    }, []);

    const buildResultStableKey = (result: LabAnalysis['results'][number]) => {
        return [
            String(result.indicator_name || '').trim(),
            String(result.organ_id || '').trim(),
            String(result.value || '').trim(),
            String(result.unit || '').trim(),
            String(result.reference_range || '').trim(),
            String(result.severity || '').trim()
        ].join('|');
    };

    useLayoutEffect(() => {
        if (reorderAnimationFrameRef.current != null) {
            window.cancelAnimationFrame(reorderAnimationFrameRef.current);
            reorderAnimationFrameRef.current = null;
        }

        const nextPositions: Record<string, DOMRect> = {};
        const activeKeys = new Set(visibleResults.map((result) => buildResultStableKey(result)));
        const movingParticles: Array<{
            key: string;
            node: HTMLDivElement;
            x: number;
            y: number;
            vx: number;
            vy: number;
            cx: number;
            cy: number;
            radius: number;
        }> = [];

        Object.keys(resultCardRefs.current).forEach((key) => {
            if (!activeKeys.has(key)) {
                delete resultCardRefs.current[key];
            }
        });

        for (const result of visibleResults) {
            const cardKey = buildResultStableKey(result);
            const node = resultCardRefs.current[cardKey];
            if (!node) {
                continue;
            }

            const currentRect = node.getBoundingClientRect();
            const previousRect = previousCardPositionsRef.current[cardKey];

            if (isReorderingResults && previousRect) {
                const deltaX = previousRect.left - currentRect.left;
                const deltaY = previousRect.top - currentRect.top;

                if (Math.abs(deltaX) > 0.5 || Math.abs(deltaY) > 0.5) {
                    movingParticles.push({
                        key: cardKey,
                        node,
                        x: deltaX,
                        y: deltaY,
                        vx: 0,
                        vy: 0,
                        cx: currentRect.left + currentRect.width / 2,
                        cy: currentRect.top + currentRect.height / 2,
                        radius: Math.min(currentRect.width, currentRect.height) * 0.3
                    });

                    node.style.transition = 'none';
                    node.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
                    node.style.zIndex = '1';
                    node.style.willChange = 'transform';

                    // Force layout after inversion before physics loop begins.
                    node.getBoundingClientRect();
                }
            }

            nextPositions[cardKey] = currentRect;
        }

        previousCardPositionsRef.current = nextPositions;

        if (movingParticles.length > 0 && isReorderingResults) {
            let frames = 0;
            const stiffness = 0.16;
            const damping = 0.82;
            const repelFactor = 0.19;
            const gap = 10;
            const maxFrames = 84;

            const finish = () => {
                for (const particle of movingParticles) {
                    particle.node.style.transform = 'translate(0, 0)';
                    particle.node.style.transition = 'transform 220ms ease-out';
                    particle.node.style.zIndex = '';
                    particle.node.style.willChange = '';
                }

                window.setTimeout(() => {
                    for (const particle of movingParticles) {
                        if (resultCardRefs.current[particle.key]) {
                            particle.node.style.transition = '';
                        }
                    }
                }, 240);
            };

            const step = () => {
                frames += 1;

                for (const particle of movingParticles) {
                    particle.vx = (particle.vx - stiffness * particle.x) * damping;
                    particle.vy = (particle.vy - stiffness * particle.y) * damping;
                }

                for (let i = 0; i < movingParticles.length; i += 1) {
                    for (let j = i + 1; j < movingParticles.length; j += 1) {
                        const a = movingParticles[i];
                        const b = movingParticles[j];
                        const dx = (a.cx + a.x) - (b.cx + b.x);
                        const dy = (a.cy + a.y) - (b.cy + b.y);
                        const dist = Math.max(Math.hypot(dx, dy), 0.001);
                        const minDist = a.radius + b.radius + gap;

                        if (dist < minDist) {
                            const nx = dx / dist;
                            const ny = dy / dist;
                            const overlap = minDist - dist;
                            const impulse = overlap * repelFactor;

                            a.vx += nx * impulse;
                            a.vy += ny * impulse;
                            b.vx -= nx * impulse;
                            b.vy -= ny * impulse;
                        }
                    }
                }

                let totalMotion = 0;
                for (const particle of movingParticles) {
                    particle.x += particle.vx;
                    particle.y += particle.vy;
                    totalMotion += Math.abs(particle.x) + Math.abs(particle.y) + Math.abs(particle.vx) + Math.abs(particle.vy);
                    particle.node.style.transform = `translate(${particle.x}px, ${particle.y}px)`;
                }

                const settled = totalMotion < movingParticles.length * 0.16;
                if (settled || frames >= maxFrames) {
                    finish();
                    reorderAnimationFrameRef.current = null;
                    return;
                }

                reorderAnimationFrameRef.current = window.requestAnimationFrame(step);
            };

            reorderAnimationFrameRef.current = window.requestAnimationFrame(step);
            return;
        }

        for (const result of visibleResults) {
            const cardKey = buildResultStableKey(result);
            const node = resultCardRefs.current[cardKey];
            if (!node) {
                continue;
            }

            node.style.transform = '';
            node.style.transition = '';
            node.style.zIndex = '';
            node.style.willChange = '';
        }
    }, [visibleResults, isReorderingResults]);

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
                                <button
                                    type="button"
                                    className="btn btn-secondary btn-label compactHeaderUploadBtn"
                                    onClick={onStartNewUpload}
                                    aria-label="Return to the initial upload screen to choose a new file"
                                >
                                    <IconFile />
                                    Start new upload
                                </button>
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
                                    <strong className="analysisHeaderValue">
                                        {currentAnalysis.patient_name?.trim() || 'Unknown patient'}
                                    </strong>
                                </div>
                                <div className="analysisHeaderCell">
                                    <div className="metricLabel">Test date</div>
                                    <strong className="analysisHeaderValue">
                                        {overviewTestDate}
                                    </strong>
                                </div>
                                <div className="analysisHeaderCell">
                                    <div className="metricLabel">Source</div>
                                    <strong className="analysisHeaderValue" title={overviewSource}>
                                        {overviewSource}
                                    </strong>
                                </div>
                                <div className="analysisHeaderCell">
                                    <div className="metricLabel">Upload datetime</div>
                                    <strong className="analysisHeaderValue" title={overviewUploadDateTime}>
                                        {overviewUploadDateTime}
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

                                    <div className={isReorderingResults ? 'resultGrid resultGridReordering' : 'resultGrid'}>
                                        {visibleResults.map((result, index) => {
                                            const resultKey = buildResultStableKey(result);
                                            return (
                                            <div
                                                key={resultKey}
                                                ref={(node) => {
                                                    resultCardRefs.current[resultKey] = node;
                                                }}
                                                className={`${getResultCardClass(result.severity)} resultCardEnter`}
                                                style={{
                                                    ['--result-enter-delay' as string]: `${Math.min(index, 12) * 36}ms`
                                                }}
                                            >
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
                                                    referenceRangeStructured={result.reference_range_structured}
                                                    referenceRangeOriginal={result.reference_range_original}
                                                    severity={result.severity}
                                                />

                                            </div>
                                            );
                                        })}
                                    </div>

                                    {visibleResults.length === 0 && (
                                        <div className="emptyState" role="status">
                                            <div className="emptyStateIcon" aria-hidden="true"><IconEmpty /></div>
                                            <p>No indicators found for this organ.</p>
                                        </div>
                                    )}
                                </>
                            )}

                            {/* {currentAnalysis.summary?.organ_summary?.length ? (
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
                            ) : null} */}

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
                            <span>Reference: {activeReferenceDisplay}</span>
                        </div>

                        {activePatientAdvice && (
                            <section className="indicatorInfoSection indicatorInfoSectionAdvice">
                                <div className="indicatorInfoSectionHead">
                                    <h4>Advice for this result</h4>
                                </div>
                                <p>{activePatientAdvice}</p>
                            </section>
                        )}

                        {activeModelExplanation && (
                            <div className="indicatorInfoExplainGrid">
                                <section className="indicatorInfoSection indicatorInfoSectionExplain">
                                    <div className="indicatorInfoSectionHead">
                                        <span className="indicatorInfoStep">01</span>
                                        <h4>What this indicator means?</h4>
                                    </div>
                                    <p>{activeModelExplanation.what_is_it}</p>
                                </section>

                                <section className="indicatorInfoSection indicatorInfoSectionExplain">
                                    <div className="indicatorInfoSectionHead">
                                        <span className="indicatorInfoStep">02</span>
                                        <h4>When to be concerned?</h4>
                                    </div>
                                    <ul>
                                        {activeModelExplanation.when_to_be_concerned.map((item, index) => (
                                            <li key={`${item}-${index}`}>{item}</li>
                                        ))}
                                    </ul>
                                </section>

                                <section className="indicatorInfoSection indicatorInfoSectionExplain">
                                    <div className="indicatorInfoSectionHead">
                                        <span className="indicatorInfoStep">03</span>
                                        <h4>What to do next?</h4>
                                    </div>
                                    <ul>
                                        {activeModelExplanation.what_to_do_next.map((item, index) => (
                                            <li key={`${item}-${index}`}>{item}</li>
                                        ))}
                                    </ul>
                                </section>
                            </div>
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
