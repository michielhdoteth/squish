/**
 * Answer Generation using Hugging Face or Local Models
 */

import type { SearchResult } from '../types/index.js';

export interface AnswerGeneratorConfig {
  model: string;
  useLocal?: boolean;
  apiToken?: string;
}

export class HFAnswerGenerator {
  private config: AnswerGeneratorConfig;

  constructor(config: AnswerGeneratorConfig) {
    this.config = {
      model: config.model,
      useLocal: config.useLocal || false,
      apiToken: config.apiToken || process.env.HF_TOKEN,
    };
  }

  async generateAnswer(question: string, context: SearchResult[]): Promise<string> {
    const contextText = context
      .map((r, i) => `[${i + 1}] ${r.content}`)
      .join('\n\n');

    const prompt = this.buildPrompt(question, contextText);

    try {
      if (this.config.useLocal) {
        return await this.generateLocal(prompt);
      } else {
        return await this.generateAPI(prompt);
      }
    } catch (error) {
      console.error('Answer generation error:', error);
      // Fallback: return context that matches the question keywords
      return this.fallbackAnswer(question, context);
    }
  }

  private buildPrompt(question: string, context: string): string {
    // Format depends on the model
    if (this.config.model.includes('mistral') || this.config.model.includes('Mixtral')) {
      return `<s>[INST] You are a helpful assistant. Answer the question based on the provided context.

Context:
${context}

Question: ${question} [/INST]`;
    }

    if (this.config.model.includes('Llama')) {
      return `<|system|>
You are a helpful assistant. Answer the question based only on the provided context.</s>
<|user|>
Context:
${context}

Question: ${question}</s>
<|assistant|>`;
    }

    if (this.config.model.includes('Phi')) {
      return `<|system|>
You are a helpful assistant. Answer based on the context provided.<|end|>
<|user|>
Context:
${context}

Question: ${question}<|end|>
<|assistant|>`;
    }

    // Default format
    return `Context:
${context}

Question: ${question}

Answer:`;
  }

  private async generateAPI(prompt: string): Promise<string> {
    const response = await fetch(`https://api-inference.huggingface.co/models/${this.config.model}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.config.apiToken && { 'Authorization': `Bearer ${this.config.apiToken}` }),
      },
      body: JSON.stringify({
        inputs: prompt,
        parameters: {
          max_new_tokens: 150,
          temperature: 0.3,
          return_full_text: false,
          stop: ['<|end|>', '</s>', '[INST]', '<|user|>'],
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`HF API error: ${response.status}`);
    }

    const data = await response.json();
    const text = Array.isArray(data) ? data[0]?.generated_text : data.generated_text;
    return this.cleanAnswer(text || '');
  }

  private async generateLocal(prompt: string): Promise<string> {
    const response = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.config.model,
        prompt,
        stream: false,
        options: {
          temperature: 0.3,
          num_predict: 150,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Local model error: ${response.status}`);
    }

    const data = await response.json();
    return this.cleanAnswer(data.response || '');
  }

  private cleanAnswer(text: string): string {
    return text
      .replace(/<(\|)?(system|user|assistant|end|s)(\|)?>/g, '')
      .replace(/\[INST\]|\[\/INST\]/g, '')
      .trim();
  }

  private fallbackAnswer(question: string, context: SearchResult[]): string {
    // Extract keywords from question
    const keywords = question.toLowerCase()
      .replace(/\?|what|who|where|when|why|how|is|are|was|were|the|a|an/g, '')
      .split(/\s+/)
      .filter(w => w.length > 3);

    // Find best matching context
    const bestMatch = context
      .map(c => ({
        content: c.content,
        score: keywords.filter(k => c.content.toLowerCase().includes(k)).length,
      }))
      .sort((a, b) => b.score - a.score)[0];

    if (bestMatch) {
      return `Based on the context: ${bestMatch.content.slice(0, 200)}`;
    }

    return 'Unable to find relevant information in the context.';
  }
}

// Factory function
export function createAnswerGenerator(model: string, useLocal?: boolean): HFAnswerGenerator {
  return new HFAnswerGenerator({ model, useLocal });
}
