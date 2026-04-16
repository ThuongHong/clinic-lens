import type { ChatAssistantPayload } from '@/lib/types';

export type ChatRole = 'user' | 'assistant';

export interface ChatMessage {
    id: string;
    role: ChatRole;
    text: string;
    assistant?: ChatAssistantPayload;
    pending?: boolean;
}
