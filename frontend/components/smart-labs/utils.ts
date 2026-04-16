import type { LabAnalysis, SseEvent } from '@/lib/types';

export const ORGAN_LABELS: Record<string, string> = {
    kidneys: 'Kidneys',
    liver: 'Liver',
    heart: 'Heart',
    lungs: 'Lungs',
    blood: 'Blood',
    pancreas: 'Pancreas',
    thyroid: 'Thyroid',
    bone: 'Bone',
    immune: 'Immune',
    other: 'Other'
};

export const STATUS_LABELS: Record<string, string> = {
    normal: 'Normal',
    abnormal_high: 'High',
    abnormal_low: 'Low',
    critical: 'Critical',
    unknown: 'Unknown'
};

export const SESSION_HISTORY_STORAGE_KEY = 'smartlabs.session_history';
export const PATIENT_NAME_STORAGE_KEY = 'smartlabs.patient_name';
export const MAX_UPLOAD_SIZE_BYTES = 20 * 1024 * 1024;

const ALLOWED_UPLOAD_TYPES = new Set([
    'application/pdf',
    'image/png',
    'image/jpg',
    'image/jpeg',
    'image/webp'
]);

export function parseEventPayload(event: SseEvent) {
    try {
        return JSON.parse(event.data) as Record<string, unknown>;
    } catch {
        return null;
    }
}

export function formatError(error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('does not expose /api/chat') || message.includes('Cannot POST /api/chat')) {
        return 'Backend has no chat route (/api/chat). Restart backend with ./start.sh.';
    }
    if (message.includes('Backend unreachable') || message.includes('Failed to start stream')) {
        return 'Cannot reach backend. Check that it is running on port 9000.';
    }
    return message;
}

export function organLabel(organId: string) {
    const normalized = String(organId || 'other').trim().toLowerCase();
    if (ORGAN_LABELS[normalized]) {
        return ORGAN_LABELS[normalized];
    }
    if (!normalized) {
        return 'Other';
    }
    return normalized
        .replace(/[_-]+/g, ' ')
        .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function organAbbr(organId: string) {
    const map: Record<string, string> = {
        kidneys: '🫘',
        liver: '🟤',
        heart: '❤️',
        lungs: '🫁',
        blood: '🩸',
        pancreas: '🧪',
        thyroid: '🦋',
        bone: '🦴',
        immune: '🛡️',

        electrolytes: '⚡',
        endocrine: '🔬',
        metabolism: '🍬',
        urine: '🚽',
        coagulation: '🩹',
        lipid: '🧈',
        infection: '🦠',

        other: '🧪'
    };
    return map[organId] ?? '🧪';
}

export function displayStatusLabel(severity: string) {
    const normalized = String(severity || '').trim().toLowerCase();
    return STATUS_LABELS[normalized] ?? 'Unknown';
}

export function displayStatusIcon(severity: string) {
    return String(severity || '').toLowerCase() === 'normal' ? '✓' : '!';
}

export function getSeverityClass(severity: string) {
    return `severity-badge severity-${severity}`;
}

export function getResultCardClass(severity: string) {
    return `resultCard resultCardSeverity-${severity}`;
}

export function getBadgeClass(status: string) {
    const s = status.toLowerCase();
    if (s === 'error') return 'badge danger';
    if (s === 'success' || s === 'complete') return 'badge success';
    return 'badge';
}

export function createId(prefix: string) {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
        return `${prefix}_${crypto.randomUUID()}`;
    }
    return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
}

export function formatDateTime(value: string) {
    if (!value) return 'N/A';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

export function sourceNameFromPath(value: string) {
    if (!value) return 'Unknown source';
    const normalized = value.split('?')[0].replace(/\\/g, '/');
    const parts = normalized.split('/').filter(Boolean);
    return parts[parts.length - 1] || value;
}

export function formatFileSize(size: number) {
    if (size < 1024) return `${size} B`;
    const units = ['KB', 'MB', 'GB'];
    let value = size / 1024;
    let index = 0;
    while (value >= 1024 && index < units.length - 1) {
        value /= 1024;
        index++;
    }
    return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[index]}`;
}

export function createIndicatorExplainKey(result: LabAnalysis['results'][number]) {
    return [
        String(result.indicator_name || '').trim().toLowerCase(),
        String(result.organ_id || '').trim().toLowerCase(),
        String(result.severity || '').trim().toLowerCase()
    ].join('|');
}

export function validateUploadFile(file: File) {
    if (!ALLOWED_UPLOAD_TYPES.has(file.type)) {
        return 'Unsupported file type. Please upload PDF, PNG, JPG, JPEG, or WEBP.';
    }

    if (file.size > MAX_UPLOAD_SIZE_BYTES) {
        return 'File is too large. Maximum supported size is 20 MB.';
    }

    return null;
}
