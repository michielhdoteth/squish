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

import { config } from '../../config.js';
import { logger } from '../logger.js';
import type { LLMCallOptions, LLMProvider } from './types.js';

// ─── Provider Registry ──────────────────────────────────────────────────────

const providers = new Map<string, LLMProvider>();

/**
 * Register a provider. Called automatically by the barrel export.
 */
export function registerProvider(name: string, provider: LLMProvider): void {
  providers.set(name, provider);
}

/**
 * Get the currently active provider based on config.
 * Returns null if LLM is disabled or provider is not registered.
 */
function getActiveProvider(): LLMProvider | null {
  if (!config.llmEnabled) return null;
  const name = config.llmProvider;
  const provider = providers.get(name);
  if (!provider) {
    logger.debug(`LLM provider '${name}' not registered (available: ${[...providers.keys()].join(', ')})`);
    return null;
  }
  if (!provider.isAvailable()) {
    logger.debug(`LLM provider '${name}' is not available (missing config)`);
    return null;
  }
  return provider;
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Call an LLM with a plain text prompt.
 * Backward-compatible wrapper around the provider system.
 *
 * @param prompt - The prompt to send to the LLM
 * @returns The LLM response text, or null if unavailable
 */
export async function callLLM(prompt: string): Promise<string | null> {
  const provider = getActiveProvider();
  if (!provider) return null;

  return provider.call({
    prompt,
    maxTokens: config.llmMaxTokens,
    temperature: config.llmTemperature,
  });
}

/**
 * Call an LLM with full options (multimodal, system prompt, etc.).
 *
 * @param options - Full call options
 * @returns The LLM response text, or null if unavailable
 */
export async function callLLMWithContent(options: LLMCallOptions): Promise<string | null> {
  const provider = getActiveProvider();
  if (!provider) return null;

  return provider.call(options);
}

/**
 * Get the name of the currently active provider (for logging/status).
 */
export function getActiveProviderName(): string | null {
  if (!config.llmEnabled) return null;
  return config.llmProvider;
}
