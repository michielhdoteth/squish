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

import { config } from '../../config.js';
import { logger } from '../logger.js';

const TIMEOUT_MS = 10000; // 10s timeout - never block

/**
 * Call an LLM with the given prompt.
 * Returns the text response, or null if LLM is disabled, unavailable, or errors.
 *
 * @param prompt - The prompt to send to the LLM
 * @returns The LLM response text, or null if unavailable
 */
export async function callLLM(prompt: string): Promise<string | null> {
  if (!config.llmEnabled) {
    return null;
  }

  const endpoint = config.llmEndpoint || 'http://localhost:1234';
  const model = config.llmExtractionModel || 'gpt-4o-mini';
  const apiKey = config.llmApiKey || '';

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    // Normalize endpoint - add /v1 path if not present
    const baseUrl = endpoint.endsWith('/v1') ? endpoint : `${endpoint}/v1`;

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_tokens: 300,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      logger.debug(`LLM call failed with status ${response.status}`, {
        endpoint,
        status: response.status,
      });
      return null;
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content?.trim() ?? null;

    if (content === null || content === '') {
      logger.debug('LLM returned empty response');
      return null;
    }

    return content;
  } catch (err: any) {
    // Log as debug, not error - LLM failures are expected when not configured
    logger.debug(`LLM call failed: ${err?.message ?? err}`, {
      endpoint,
      error: err?.message,
    });
    return null; // Silent fallback
  }
}
