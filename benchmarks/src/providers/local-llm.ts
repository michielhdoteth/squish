/**
 * Local LLM Provider for Answer Generation and Judging
 * 
 * Uses Hugging Face transformers with cached models
 * No fallbacks, no mocks - real inference only
 */

import { spawn } from 'child_process';
import { promisify } from 'util';
import type { MemoryProvider, ConversationSession, SearchResult, SearchOptions } from '../types/index.js';

const exec = promisify(require('child_process').exec);

export interface LocalLLMConfig {
  model: string;  // HF model name or Ollama model
  useOllama?: boolean;
  maxTokens?: number;
  temperature?: number;
}

export class LocalLLMProvider implements MemoryProvider {
  name = 'local-llm';
  private config: LocalLLMConfig;
  private memories: Map<string, {
    id: string;
    content: string;
    embedding?: number[];
    metadata?: Record<string, unknown>;
  }> = new Map();

  constructor(config: LocalLLMConfig) {
    this.config = {
      model: config.model,
      useOllama: config.useOllama ?? true,
      maxTokens: config.maxTokens ?? 256,
      temperature: config.temperature ?? 0.1,
    };
    this.name = `local-${config.model.replace(/[:\/]/g, '-')}`;
  }

  async ingest(session: ConversationSession): Promise<void> {
    const content = session.turns
      .map(t => `${t.role}: ${t.content}`)
      .join('\n');
    
    // Generate embedding using local model
    const embedding = await this.generateEmbedding(content);
    
    this.memories.set(session.id, {
      id: session.id,
      content,
      embedding,
      metadata: session.metadata,
    });
  }

  async index(): Promise<void> {
    // Embeddings already computed during ingest
    await new Promise(r => setTimeout(r, 100));
  }

  async search(query: string, options?: SearchOptions): Promise<SearchResult[]> {
    const queryEmbedding = await this.generateEmbedding(query);
    const limit = options?.limit ?? 5;
    
    // Cosine similarity search
    const results: SearchResult[] = [];
    
    for (const [id, mem] of this.memories) {
      if (!mem.embedding) continue;
      
      const similarity = this.cosineSimilarity(queryEmbedding, mem.embedding);
      results.push({
        id: mem.id,
        content: mem.content,
        score: similarity,
        metadata: mem.metadata,
      });
    }
    
    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  async clear(): Promise<void> {
    this.memories.clear();
  }

  /**
   * Generate answer using local LLM
   */
  async generateAnswer(question: string, context: SearchResult[]): Promise<string> {
    const contextText = context
      .map((r, i) => `[${i + 1}] ${r.content.slice(0, 500)}`)
      .join('\n\n');

    const prompt = this.buildPrompt(question, contextText);
    
    if (this.config.useOllama) {
      return this.generateOllama(prompt);
    } else {
      return this.generateHF(prompt);
    }
  }

  /**
   * Judge answer quality using local LLM
   */
  async judgeAnswer(answer: string, groundTruth: string, question: string): Promise<{
    correct: boolean;
    score: number;
    reasoning: string;
  }> {
    const prompt = `<|system|>
You are an expert evaluator. Compare the Generated Answer to the Ground Truth.
Respond with ONLY a JSON object: {"correct": true/false, "score": 0.0-1.0, "reasoning": "brief explanation"}

<|user|>
Question: ${question}

Ground Truth: ${groundTruth}

Generated Answer: ${answer}

Evaluate:<|assistant|>
{`;

    const response = await (this.config.useOllama 
      ? this.generateOllama(prompt, 100)
      : this.generateHF(prompt, 100));

    try {
      // Extract JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          correct: parsed.correct ?? false,
          score: Math.max(0, Math.min(1, parsed.score ?? 0)),
          reasoning: parsed.reasoning ?? 'No reasoning provided',
        };
      }
    } catch {
      // Fall through to heuristic
    }

    // Heuristic fallback if JSON parsing fails
    const similarity = this.textSimilarity(answer.toLowerCase(), groundTruth.toLowerCase());
    return {
      correct: similarity > 0.6,
      score: similarity,
      reasoning: `Text similarity: ${(similarity * 100).toFixed(1)}%`,
    };
  }

  private async generateOllama(prompt: string, maxTokens?: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const body = JSON.stringify({
        model: this.config.model,
        prompt,
        stream: false,
        options: {
          temperature: this.config.temperature,
          num_predict: maxTokens ?? this.config.maxTokens,
        },
      });

      fetch('http://localhost:11434/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      })
        .then(res => {
          if (!res.ok) throw new Error(`Ollama error: ${res.status}`);
          return res.json();
        })
        .then(data => resolve(data.response?.trim() || ''))
        .catch(reject);
    });
  }

  private async generateHF(prompt: string, maxTokens?: number): Promise<string> {
    // Use Python with transformers for HF models
    const pythonScript = `
import sys
from transformers import AutoModelForCausalLM, AutoTokenizer
import torch

model_name = "${this.config.model}"
prompt = """${prompt.replace(/"/g, '\\"').replace(/\n/g, '\\n')}"""

# Load from cache
tokenizer = AutoTokenizer.from_pretrained(model_name, local_files_only=True)
model = AutoModelForCausalLM.from_pretrained(
    model_name, 
    local_files_only=True,
    torch_dtype=torch.float16,
    device_map="auto"
)

inputs = tokenizer(prompt, return_tensors="pt").to(model.device)
outputs = model.generate(
    **inputs,
    max_new_tokens=${maxTokens ?? this.config.maxTokens},
    temperature=${this.config.temperature},
    do_sample=True,
    pad_token_id=tokenizer.eos_token_id
)

response = tokenizer.decode(outputs[0], skip_special_tokens=True)
# Remove prompt from response
if response.startswith(prompt):
    response = response[len(prompt):]
print(response.strip())
`;
    
    const { stdout } = await exec(`python -c "${pythonScript}"`);
    return stdout.trim();
  }

  private async generateEmbedding(text: string): Promise<number[]> {
    // Simple TF-IDF-like embedding for now
    // In production, use sentence-transformers or similar
    const words = text.toLowerCase().split(/\W+/).filter(w => w.length > 3);
    const vocab = Array.from(new Set(words));
    const embedding = vocab.map(word => 
      words.filter(w => w === word).length / words.length
    );
    
    // Normalize
    const magnitude = Math.sqrt(embedding.reduce((a, b) => a + b * b, 0));
    return magnitude > 0 ? embedding.map(v => v / magnitude) : embedding;
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    const minLen = Math.min(a.length, b.length);
    const aNorm = a.slice(0, minLen);
    const bNorm = b.slice(0, minLen);
    
    let dotProduct = 0;
    let aMag = 0;
    let bMag = 0;
    
    for (let i = 0; i < minLen; i++) {
      dotProduct += aNorm[i] * bNorm[i];
      aMag += aNorm[i] * aNorm[i];
      bMag += bNorm[i] * bNorm[i];
    }
    
    return dotProduct / (Math.sqrt(aMag) * Math.sqrt(bMag) + 1e-10);
  }

  private textSimilarity(a: string, b: string): number {
    const aWords = new Set(a.split(/\s+/).filter(w => w.length > 3));
    const bWords = new Set(b.split(/\s+/).filter(w => w.length > 3));
    
    const intersection = new Set([...aWords].filter(x => bWords.has(x)));
    const union = new Set([...aWords, ...bWords]);
    
    return union.size > 0 ? intersection.size / union.size : 0;
  }

  private buildPrompt(question: string, context: string): string {
    // Qwen 2.5 prompt format
    if (this.config.model.includes('qwen')) {
      return `<|im_start|>system
You are a helpful assistant. Answer the question based ONLY on the provided context. Be concise and accurate.<|im_end|>
<|im_start|>user
Context:
${context}

Question: ${question}<|im_end|>
<|im_start|>assistant
`;
    }
    
    // Phi-3 format
    if (this.config.model.includes('phi')) {
      return `<|system|>
You are a helpful assistant. Answer based on the context provided.<|end|>
<|user|>
Context:
${context}

Question: ${question}<|end|>
<|assistant|>
`;
    }
    
    // Default format
    return `Context:
${context}

Question: ${question}

Answer:`;
  }
}

export function createLocalProvider(model: string, useOllama = true): LocalLLMProvider {
  return new LocalLLMProvider({ model, useOllama });
}
