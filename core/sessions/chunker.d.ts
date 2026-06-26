/**
 * Pure chunk extractors. No IO. Take raw OpenCode SDK output and
 * produce Chunk[]. Each extractor corresponds to one ChunkType:
 *   - summary  -> first user message
 *   - decision -> assistant messages with decision language
 *   - command  -> bash tool invocations
 *   - file     -> file edits
 *   - error    -> error events
 *   - todo     -> todo updates
 *
 * All extractors:
 *   - skip empty content
 *   - truncate chunk.content to MAX_CONTENT_CHARS
 *   - fall back to "now" if no timestamp given
 *   - return chunks in chronological order
 */
import type { AgentId, Chunk } from './types.js';
interface CommonContext {
    session_id: string;
    title: string;
    project: string;
    repo_path: string;
    branch: string;
    agent: AgentId;
    agent_session_id: string;
}
export interface SummaryInput extends CommonContext {
    firstUserMessage: string;
    timestamp?: string;
}
export declare function makeSummaryChunk(input: SummaryInput): Chunk;
export interface MessageLike {
    role: string;
    content: string;
    timestamp?: string;
}
export interface DecisionInput extends CommonContext {
    messages: MessageLike[];
}
export declare function extractDecisionChunks(input: DecisionInput): Chunk[];
export interface BashInvocation {
    command: string;
    timestamp?: string;
    cwd?: string;
}
export interface CommandInput extends CommonContext {
    bashInvocations: BashInvocation[];
}
export declare function extractCommandChunks(input: CommandInput): Chunk[];
export interface FileEdit {
    path: string;
    timestamp?: string;
    summary?: string;
}
export interface FileInput extends CommonContext {
    fileEdits: FileEdit[];
}
export declare function extractFileChunks(input: FileInput): Chunk[];
export interface ErrorEvent {
    message: string;
    timestamp?: string;
    stack?: string;
}
export interface ErrorInput extends CommonContext {
    errors: ErrorEvent[];
}
export declare function extractErrorChunks(input: ErrorInput): Chunk[];
export interface TodoEntry {
    content: string;
    status: string;
    timestamp?: string;
}
export interface TodoInput extends CommonContext {
    todos: TodoEntry[];
}
export declare function extractTodoChunks(input: TodoInput): Chunk[];
export {};
//# sourceMappingURL=chunker.d.ts.map