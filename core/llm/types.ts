/**
 * LLM Provider Types
 *
 * Shared interfaces for the multi-provider LLM client.
 * All providers implement LLMProvider; callers use LLMCallOptions.
 */

/** Content part for multimodal LLM calls */
export type LLMContentPart =
  | { type: 'text'; text: string }
  | { type: 'image'; mediaType: string; data: string } // base64-encoded
  | { type: 'audio'; mediaType: string; data: string } // base64-encoded
  | { type: 'video'; mediaType: string; data: string }; // base64-encoded

/** Options for a single LLM call */
export interface LLMCallOptions {
  /** The text prompt (used when contentParts is not provided) */
  prompt: string;
  /** Optional system prompt prepended to the conversation */
  systemPrompt?: string;
  /** Max tokens to generate (provider-specific default if omitted) */
  maxTokens?: number;
  /** Temperature 0-1 (provider-specific default if omitted) */
  temperature?: number;
  /** Timeout in milliseconds (provider-specific default if omitted) */
  timeoutMs?: number;
  /** For multimodal: pass content parts instead of plain prompt */
  contentParts?: LLMContentPart[];
}

/** Provider capability description */
export interface LLMProvider {
  /** Canonical name (e.g. 'openai', 'anthropic', 'google') */
  name: string;

  /** Whether this provider is configured and reachable */
  isAvailable(): boolean;

  /** Execute an LLM call. Returns null on any failure. */
  call(options: LLMCallOptions): Promise<string | null>;
}
