export interface ConversationRecord {
    id: string;
    projectId?: string | null;
    sessionId: string;
    title?: string | null;
    summary?: string | null;
    messageCount?: number | null;
    tokenCount?: number | null;
    startedAt?: string | null;
    endedAt?: string | null;
}
export interface ConversationSearchInput {
    query: string;
    limit?: number;
    role?: 'user' | 'assistant';
}
export interface RecentConversationsInput {
    n?: number;
    before?: string;
    after?: string;
    project?: string;
}
export declare function searchConversations(input: ConversationSearchInput): Promise<ConversationRecord[]>;
export declare function getRecentConversations(input: RecentConversationsInput): Promise<ConversationRecord[]>;
//# sourceMappingURL=conversations.d.ts.map