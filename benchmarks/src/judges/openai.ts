/**
 * OpenAI GPT-4 Judge
 */

import OpenAI from 'openai';
import type { Judge, EvaluationResult } from '../types/index.js';

export class OpenAIJudge implements Judge {
  name = 'gpt-4o';
  private client: OpenAI;
  private model: string;

  constructor(model: string = 'gpt-4o') {
    this.client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    this.model = model;
    this.name = model;
  }

  async evaluate(answer: string, groundTruth: string, question: string): Promise<EvaluationResult> {
    const prompt = `You are an expert evaluator assessing answer quality for a memory/retrieval system.

Question: ${question}

Ground Truth (expected answer): ${groundTruth}

Generated Answer: ${answer}

Evaluate the generated answer against the ground truth. Consider:
1. Factual accuracy - does it contain the correct information?
2. Completeness - does it cover all key points?
3. Relevance - does it directly answer the question?

Respond with ONLY a JSON object in this exact format:
{
  "correct": true/false,
  "score": 0.0-1.0,
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation"
}`;

    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: 'You are a precise evaluation system. Respond only with valid JSON.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0,
        max_tokens: 500,
      });

      const content = response.choices[0]?.message?.content || '{}';
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      const result = JSON.parse(jsonMatch ? jsonMatch[0] : '{}');

      return {
        correct: result.correct ?? false,
        score: Math.max(0, Math.min(1, result.score ?? 0)),
        confidence: Math.max(0, Math.min(1, result.confidence ?? 0)),
        reasoning: result.reasoning ?? 'No reasoning provided',
      };
    } catch (error) {
      console.error('OpenAI evaluation error:', error);
      return {
        correct: false,
        score: 0,
        confidence: 0,
        reasoning: `Evaluation failed: ${error}`,
      };
    }
  }
}
