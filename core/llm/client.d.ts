/**
 * LLM Client Helper
 * Minimal LLM API client with fast timeout and silent fallback.
 * All LLM calls MUST go through this module for consistency.
 *
 * Design principles:
 * - LLM is ALWAYS optional. Callers must handle null returns.
 * - Never blocks longer than TIMEOUT_MS (10s).
 * - All errors are silently swallowed; callers always have fallback paths.
 * - No new dependencies beyond fetch (built into Node 18+).
 */
/**
 * Call an LLM with the given prompt.
 * Returns the text response, or null if LLM is disabled, unavailable, or errors.
 *
 * @param prompt - The prompt to send to the LLM
 * @returns The LLM response text, or null if unavailable
 */
export declare function callLLM(prompt: string): Promise<string | null>;
//# sourceMappingURL=client.d.ts.map