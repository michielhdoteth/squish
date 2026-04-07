/**
 * Judge Registry
 */

import { OpenAIJudge } from './openai.js';
import { AnthropicJudge } from './anthropic.js';
import { LocalJudge } from './local.js';
import { HuggingFaceJudge, createHFJudge, RECOMMENDED_MODELS } from './huggingface.js';
import type { Judge } from '../types/index.js';

export function createJudge(name: string): Judge {
  // Normalize name
  const normalized = name.toLowerCase();

  if (normalized === 'local') {
    return new LocalJudge();
  }

  // HuggingFace models (format: hf:model/name or just model/name)
  if (normalized.startsWith('hf:') || normalized.includes('/')) {
    const model = normalized.replace(/^hf:/, '');
    return createHFJudge(model);
  }

  // Local Ollama models
  if (['llama3.2', 'mistral', 'qwen2.5', 'phi3', 'gemma'].some(m => normalized.includes(m))) {
    return createHFJudge(name, true);
  }

  if (normalized.includes('gpt') || normalized.includes('openai')) {
    return new OpenAIJudge(name.includes('4o-mini') ? 'gpt-4o-mini' : 'gpt-4o');
  }

  if (normalized.includes('claude') || normalized.includes('anthropic')) {
    const model = normalized.includes('sonnet') 
      ? 'claude-3-sonnet-20240229'
      : normalized.includes('haiku')
      ? 'claude-3-haiku-20240307'
      : 'claude-3-opus-20240229';
    return new AnthropicJudge(model);
  }

  // Default to local for testing
  return new LocalJudge();
}

export { OpenAIJudge, AnthropicJudge, LocalJudge, HuggingFaceJudge, createHFJudge, RECOMMENDED_MODELS };
