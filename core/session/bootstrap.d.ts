/**
 * Session Bootstrap Composer - Batch 7.
 *
 * THE single entry point any harness calls to boot a session with squish
 * context. The MCP `squish_context` action `session-start` is canonical;
 * plugin auto-inject paths and hook scripts call this through
 * `squish context --session-start`.
 */
export type BootstrapSectionName = 'core-memory' | 'beliefs' | 'working-set' | 'pinned' | 'recent-decisions';
export declare const BOOTSTRAP_SECTION_PRIORITY: BootstrapSectionName[];
export interface ComposeSessionBootstrapOptions {
    projectPath?: string;
    /** Explicit harness/squish session ID for the working-set lookup. */
    sessionId?: string;
    /** Hard ceiling in estimated tokens (chars/4). Default 2000. */
    totalTokenCeiling?: number;
    /** Max rendered items per section. Default 4. */
    maxItemsPerSection?: number;
}
export interface BootstrapSectionInfo {
    name: BootstrapSectionName;
    priority: number;
    tokens: number;
    included: boolean;
    itemCount: number;
    dropReason?: 'ceiling-exceeded' | 'empty';
}
export interface SessionBootstrapResult {
    /** Single formatted context block ready for injection. */
    block: string;
    totalTokens: number;
    ceilingTokens: number;
    sections: BootstrapSectionInfo[];
}
/**
 * Compose the canonical session-bootstrap context block under a hard token
 * ceiling. Never throws - failures degrade to an empty block with section
 * diagnostics so callers (MCP tool, CLI, hooks) always get a response.
 */
export declare function composeSessionBootstrap(options?: ComposeSessionBootstrapOptions): Promise<SessionBootstrapResult>;
/** Expand `~` in a project path argument coming from CLI/hooks. */
export declare function expandHomePath(input: string): string;
