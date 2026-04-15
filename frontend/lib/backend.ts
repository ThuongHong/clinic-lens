import type {
    AnalysisHistoryEntry,
    LabAnalysis,
    SseEvent,
    StsTokenResponse,
    ChatResultEvent,
    IndicatorExplanationResponse
} from '@/lib/types';

const DEFAULT_BACKEND_URL = 'http://localhost:9000';

export function resolveBackendBaseUrl() {
    const configured = process.env.NEXT_PUBLIC_BACKEND_BASE_URL?.trim();
    if (configured) {
        return configured.replace(/\/$/, '');
    }

    return DEFAULT_BACKEND_URL;
}

function buildUrl(path: string) {
    return new URL(path, `${resolveBackendBaseUrl()}/`).toString();
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
    const headers = new Headers(init?.headers);
    headers.set('Accept', 'application/json');

    const response = await fetch(buildUrl(path), {
        ...init,
        headers,
        cache: 'no-store'
    });

    const text = await response.text();

    if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${compactBody(text)}`);
    }

    return text ? (JSON.parse(text) as T) : ({} as T);
}

function compactBody(body: string) {
    const collapsed = body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (collapsed) {
        return collapsed.length > 220 ? `${collapsed.slice(0, 220)}...` : collapsed;
    }
    return body.length > 220 ? `${body.slice(0, 220)}...` : body;
}

export async function fetchStsToken() {
    return requestJson<StsTokenResponse>('/api/sts-token');
}

export async function fetchAnalysisHistory(limit = 12) {
    const payload = await requestJson<{ items: AnalysisHistoryEntry[] }>('/api/analyses?limit=' + limit);
    return Array.isArray(payload.items) ? payload.items : [];
}

export async function fetchIndicatorExplanation(body: {
    indicator_name: string;
    organ_id: string;
    value?: string;
    unit?: string;
    reference_range?: string;
    severity?: string;
}) {
    return requestJson<IndicatorExplanationResponse>('/api/indicator-explanation', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
    });
}

export async function* streamAnalysis(body: Record<string, string>): AsyncGenerator<SseEvent> {
    yield* streamSsePost('/api/analyze', body);
}

export async function* streamChat(body: {
    history_id: string;
    message: string;
    conversation_id?: string;
    language?: string;
    detail_level?: string;
}): AsyncGenerator<SseEvent> {
    yield* streamSsePost('/api/chat', body);
}

export function parseAnalysis(raw: Record<string, unknown>): LabAnalysis {
    const results = Array.isArray(raw.results)
        ? raw.results.filter((item): item is Record<string, unknown> => Boolean(item))
        : [];

    return {
        status: String(raw.status || 'unknown'),
        analysis_date: String(raw.analysis_date || ''),
        patient_name: raw.patient_name ? String(raw.patient_name) : undefined,
        results: results.map((item) => ({
            indicator_name: String(item.indicator_name || ''),
            value: String(item.value || ''),
            unit: String(item.unit || ''),
            reference_range: String(item.reference_range || ''),
            organ_id: String(item.organ_id || ''),
            severity: String(item.severity || 'unknown') as LabAnalysis['results'][number]['severity'],
            patient_advice: String(item.patient_advice || '')
        })),
        summary: raw.summary && typeof raw.summary === 'object' ? (raw.summary as LabAnalysis['summary']) : undefined,
        advice: raw.advice && typeof raw.advice === 'object' ? (raw.advice as LabAnalysis['advice']) : undefined,
        error_code: raw.error_code ? String(raw.error_code) : undefined,
        error_message: raw.error_message ? String(raw.error_message) : undefined,
        history_id: raw.history_id ? String(raw.history_id) : undefined,
        created_at: raw.created_at ? String(raw.created_at) : undefined
    };
}

export function parseChatResult(raw: Record<string, unknown>): ChatResultEvent | null {
    if (!raw.assistant || typeof raw.assistant !== 'object') {
        return null;
    }

    const assistant = raw.assistant as Record<string, unknown>;

    return {
        history_id: String(raw.history_id || ''),
        conversation_id: String(raw.conversation_id || ''),
        model: raw.model ? String(raw.model) : undefined,
        language: raw.language ? String(raw.language) : undefined,
        detail_level: raw.detail_level ? String(raw.detail_level) : undefined,
        stream_completed: raw.stream_completed === true,
        message_count: typeof raw.message_count === 'number' ? raw.message_count : undefined,
        assistant: {
            answer_text: String(assistant.answer_text || ''),
            risk_level: String(assistant.risk_level || 'unknown'),
            cited_indicators: Array.isArray(assistant.cited_indicators)
                ? assistant.cited_indicators.map((item) => String(item))
                : [],
            cited_organs: Array.isArray(assistant.cited_organs)
                ? assistant.cited_organs.map((item) => String(item))
                : [],
            recommended_actions: Array.isArray(assistant.recommended_actions)
                ? assistant.recommended_actions.map((item) => String(item))
                : [],
            follow_up_questions: Array.isArray(assistant.follow_up_questions)
                ? assistant.follow_up_questions.map((item) => String(item))
                : [],
            disclaimer: String(assistant.disclaimer || ''),
            escalation: assistant.escalation === true
        }
    };
}

async function* streamSsePost(path: string, body: Record<string, unknown>): AsyncGenerator<SseEvent> {
    const response = await fetch(buildUrl(path), {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Accept: 'text/event-stream'
        },
        body: JSON.stringify(body),
        cache: 'no-store'
    });

    if (!response.ok) {
        const text = await response.text();
        if (response.status === 404 && text.includes('Cannot POST /api/chat')) {
            throw new Error('Current backend instance does not expose /api/chat. Restart backend with ./start.sh and try again.');
        }
        throw new Error(`Failed to start stream (HTTP ${response.status}): ${compactBody(text)}`);
    }

    if (!response.body) {
        throw new Error('Streaming response body is unavailable.');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let currentEvent = 'message';
    let dataLines: string[] = [];

    const flush = async function* () {
        if (dataLines.length === 0) {
            return;
        }

        yield {
            event: currentEvent,
            data: dataLines.join('\n')
        } satisfies SseEvent;

        currentEvent = 'message';
        dataLines = [];
    };

    while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value || new Uint8Array(), { stream: !done });

        let newlineIndex = buffer.indexOf('\n');
        while (newlineIndex !== -1) {
            const rawLine = buffer.slice(0, newlineIndex).replace(/\r$/, '');
            buffer = buffer.slice(newlineIndex + 1);

            if (rawLine.length === 0) {
                yield* flush();
            } else if (rawLine.startsWith('event:')) {
                currentEvent = rawLine.slice(6).trim();
            } else if (rawLine.startsWith('data:')) {
                dataLines.push(rawLine.slice(5).trimStart());
            }

            newlineIndex = buffer.indexOf('\n');
        }

        if (done) {
            break;
        }
    }

    if (buffer.trim().length > 0) {
        const trailing = buffer.split(/\r?\n/);
        for (const line of trailing) {
            if (line.startsWith('event:')) {
                currentEvent = line.slice(6).trim();
            } else if (line.startsWith('data:')) {
                dataLines.push(line.slice(5).trimStart());
            }
        }
    }

    yield* flush();
}