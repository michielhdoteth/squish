/**
 * Hugging Face Judge
 * 
 * Uses Hugging Face Inference API or local models for evaluation
 */

import type { Judge, EvaluationResult } from '../types/index.js';

export interface HFConfig {
  model: string;
  apiToken?: string;
  apiUrl?: string;
  useLocal?: boolean;
}

export class HuggingFaceJudge implements Judge {
  name = 'huggingface';
  private config: HFConfig;

  constructor(config: HFConfig) {
    this.config = {
      model: config.model,
      apiToken: config.apiToken || process.env.HF_TOKEN || process.env.HUGGINGFACE_TOKEN,
      apiUrl: config.apiUrl || 'https://api-inference.huggingface.co/models',
      useLocal: config.useLocal || false,
    };
    this.name = `hf-${config.model.split('/').pop()}`;
  }

  async evaluate(answer: string, groundTruth: string, question: string): Promise<EvaluationResult> {
    const prompt = `<|system|>
You are an expert evaluator. Compare the Generated Answer to the Ground Truth and determine if the answer is correct.
Respond with ONLY: CORRECT or INCORRECT, followed by a brief reason.

<|user|>
Question: ${question}

Ground Truth: ${groundTruth}

Generated Answer: ${answer}

Is the Generated Answer correct?<|assistant|>`;

    try {
      if (this.config.useLocal) {
        return await this.evaluateLocal(prompt, answer, groundTruth);
      } else {
        return await this.evaluateAPI(prompt, answer, groundTruth);
      }
    } catch (error) {
      console.error('HuggingFace evaluation error:', error);
      return this.fallbackEvaluation(answer, groundTruth);
    }
  }

  private async evaluateAPI(prompt: string, answer: string, groundTruth: string): Promise<EvaluationResult> {
    const response = await fetch(`${this.config.apiUrl}/${this.config.model}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.config.apiToken && { 'Authorization': `Bearer ${this.config.apiToken}` }),
      },
      body: JSON.stringify({
        inputs: prompt,
        parameters: {
          max_new_tokens: 100,
          temperature: 0.1,
          return_full_text: false,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`HF API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const generatedText = Array.isArray(data) ? data[0]?.generated_text : data.generated_text;
    
    return this.parseResult(generatedText || '', answer, groundTruth);
  }

  private async evaluateLocal(prompt: string, answer: string, groundTruth: string): Promise<EvaluationResult> {
    // For local inference using Ollama or similar
    const response = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.config.model,
        prompt,
        stream: false,
        options: {
          temperature: 0.1,
          num_predict: 100,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Local model error: ${response.status}`);
    }

    const data = await response.json();
    return this.parseResult(data.response || '', answer, groundTruth);
  }

  private parseResult(generatedText: string, answer: string, groundTruth: string): EvaluationResult {
    const text = generatedText.toUpperCase();
    
    // Check for CORRECT/INCORRECT in response
    const isCorrect = text.includes('CORRECT') && !text.includes('INCORRECT');
    
    // Calculate simple text similarity as score
    const similarity = this.calculateSimilarity(answer.toLowerCase(), groundTruth.toLowerCase());
    
    return {
      correct: isCorrect || similarity > 0.6,
      score: isCorrect ? Math.max(0.8, similarity) : similarity,
      confidence: 0.75,
      reasoning: generatedText.slice(0, 200),
    };
  }

  private calculateSimilarity(a: string, b: string): number {
    // Simple Jaccard similarity
    const aWords = new Set(a.split(/\s+/).filter(w => w.length > 3));
    const bWords = new Set(b.split(/\s+/).filter(w => w.length > 3));
    
    const intersection = new Set([...aWords].filter(x => bWords.has(x)));
    const union = new Set([...aWords, ...bWords]);
    
    return union.size > 0 ? intersection.size / union.size : 0;
  }

  private fallbackEvaluation(answer: string, groundTruth: string): EvaluationResult {
    const similarity = this.calculateSimilarity(answer.toLowerCase(), groundTruth.toLowerCase());
    return {
      correct: similarity > 0.5,
      score: similarity,
      confidence: 0.5,
      reasoning: 'Fallback evaluation due to API error',
    };
  }
}

// Factory function
export function createHFJudge(model: string, useLocal?: boolean): HuggingFaceJudge {
  return new HuggingFaceJudge({ model, useLocal });
}

// Popular models for evaluation
export const RECOMMENDED_MODELS = {
  // Small, fast models (good for quick eval)
  small: [
    'microsoft/Phi-3-mini-4k-instruct',
    'google/gemma-2b-it',
    'HuggingFaceH4/zephyr-7b-beta',
  ],
  // Medium models (good balance)
  medium: [
    'meta-llama/Llama-2-7b-chat-hf',
    'mistralai/Mistral-7B-Instruct-v0.2',
    'microsoft/Phi-3-small-8k-instruct',
  ],
  // Large models (best quality)
  large: [
    'meta-llama/Llama-2-13b-chat-hf',
    'mistralai/Mixtral-8x7B-Instruct-v0.1',
    'Qwen/Qwen2.5-14B-Instruct',
  ],
  // Local/Ollama models
  local: [
    'llama3.2',
    'mistral',
    'qwen2.5',
    'phi3',
  ],
};
