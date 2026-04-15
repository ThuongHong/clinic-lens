import { useMemo } from 'react';

interface ReferenceRangeBarProps {
    value: string;
    unit: string;
    referenceRange: string;
    severity: string;
}

export function ReferenceRangeBar({ value, unit, referenceRange, severity }: ReferenceRangeBarProps) {
    const visual = useMemo(() => buildReferenceRangeVisual(referenceRange, value), [referenceRange, value]);

    if (!visual) {
        return null;
    }

    const normalLeft = toPercent(visual.normalMin, visual.domainMin, visual.domainMax);
    const normalRight = toPercent(visual.normalMax, visual.domainMin, visual.domainMax);
    const markerLeft = toPercent(visual.current, visual.domainMin, visual.domainMax);
    const markerClass = visual.currentInNormal
        ? 'resultRangeMarker marker-normal'
        : severity === 'critical'
            ? 'resultRangeMarker marker-critical'
            : 'resultRangeMarker marker-abnormal';
    const markerEdgeClass = markerLeft < 16
        ? 'align-left'
        : markerLeft > 84
            ? 'align-right'
            : 'align-center';

    return (
        <div className="resultRangeBlock" aria-label="Reference range visualization">
            <div className="resultRangeHeader">
                <span>Reference range</span>
                <span>{referenceRange || 'N/A'}</span>
            </div>
            <div className="resultRangeTrack" role="img" aria-label={`Normal range between ${referenceRange}. Current value is ${value || 'N/A'} ${unit || ''}.`}>
                <div
                    className="resultRangeNormalBand"
                    style={{ left: `${normalLeft}%`, width: `${Math.max(normalRight - normalLeft, 3)}%` }}
                />
                <div className={`resultRangeMarkerAnchor ${markerEdgeClass}`} style={{ left: `${markerLeft}%` }}>
                    <div className={markerClass} />
                </div>
            </div>
            <div className="resultRangeLegend">
                <span>Low</span>
                <span>Normal</span>
                <span>High</span>
            </div>
        </div>
    );
}

function toPercent(value: number, min: number, max: number) {
    if (max <= min) {
        return 50;
    }
    const ratio = (value - min) / (max - min);
    return Math.max(0, Math.min(100, ratio * 100));
}

function parseNumericValue(input: string) {
    const normalized = String(input || '')
        .replace(/,/g, '')
        .match(/-?\d+(?:\.\d+)?/);

    if (!normalized) {
        return null;
    }

    const parsed = Number.parseFloat(normalized[0]);
    return Number.isFinite(parsed) ? parsed : null;
}

function buildReferenceRangeVisual(referenceRange: string, value: string) {
    const current = parseNumericValue(value);
    if (current === null) {
        return null;
    }

    const text = String(referenceRange || '').replace(/,/g, '').trim();
    if (!text) {
        return null;
    }

    const betweenMatch = text.match(/(-?\d+(?:\.\d+)?)\s*(?:-|–|to|~)\s*(-?\d+(?:\.\d+)?)/i);
    if (betweenMatch) {
        const low = Number.parseFloat(betweenMatch[1]);
        const high = Number.parseFloat(betweenMatch[2]);
        if (!Number.isFinite(low) || !Number.isFinite(high)) {
            return null;
        }

        const min = Math.min(low, high);
        const max = Math.max(low, high);
        const span = Math.max(max - min, Math.max(Math.abs(max), 1) * 0.25);
        const pad = span * 0.35;

        return {
            domainMin: min - pad,
            domainMax: max + pad,
            normalMin: min,
            normalMax: max,
            current,
            currentInNormal: current >= min && current <= max
        };
    }

    const maxOnlyMatch = text.match(/(?:<=|≤|<)\s*(-?\d+(?:\.\d+)?)/i);
    if (maxOnlyMatch) {
        const max = Number.parseFloat(maxOnlyMatch[1]);
        if (!Number.isFinite(max)) {
            return null;
        }

        const span = Math.max(Math.abs(max) * 0.8, 1);
        const domainMin = Math.min(0, max - span);
        const domainMax = max + span * 0.4;

        return {
            domainMin,
            domainMax,
            normalMin: domainMin,
            normalMax: max,
            current,
            currentInNormal: current <= max
        };
    }

    const minOnlyMatch = text.match(/(?:>=|≥|>)\s*(-?\d+(?:\.\d+)?)/i);
    if (minOnlyMatch) {
        const min = Number.parseFloat(minOnlyMatch[1]);
        if (!Number.isFinite(min)) {
            return null;
        }

        const span = Math.max(Math.abs(min) * 0.8, 1);
        const domainMin = min - span * 0.4;
        const domainMax = min + span;

        return {
            domainMin,
            domainMax,
            normalMin: min,
            normalMax: domainMax,
            current,
            currentInNormal: current >= min
        };
    }

    return null;
}
