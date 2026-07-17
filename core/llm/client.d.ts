/**
 * LLM Client — Provider Router
 *
 * Routes LLM calls to the configured provider. All LLM calls in the
 * system MUST go through this module for consistency.
 *
 * Design principles:
 * - LLM is ALWAYS optional. Callers must handle null returns.
 * - Never blocks longer than the configured timeout.
 * - All errors are silently swallowed; callers always have fallback paths.
 * - No new dependencies beyond fetch (built into Node 18+ / Bun).
 */
import type { LLMCallOptions, LLMProvider } from './types.js';
/**
 * Register a provider. Called automatically by the barrel export.
 */
export declare function registerProvider(name: string, provider: LLMProvider): void;
/**
 * Call an LLM with a plain text prompt.
 * Backward-compatible wrapper around the provider system.
 *
 * @param prompt - The prompt to send to the LLM
 * @returns The LLM response text, or null if unavailable
 */
export declare function callLLM(prompt: string): Promise<string | null>;
/**
 * Call an LLM with full options (multimodal, system prompt, etc.).
 *
 * @param options - Full call options
 * @returns The LLM response text, or null if unavailable
 */
export declare function callLLMWithContent(options: LLMCallOptions): Promise<string | null>;
/**
 * Get the name of the currently active provider (for logging/status).
 */
export declare function getActiveProviderName(): string | null;
//# sourceMappingURL=client.d.ts.map