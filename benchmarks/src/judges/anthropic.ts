/**
 * Anthropic Claude Judge
 */

import Anthropic from '@anthropic-ai/sdk';
import type { Judge, EvaluationResult } from '../types/index.js';

export class AnthropicJudge implements Judge {
  name = 'claude-sonnet';
  private client: Anthropic;
  private model: string;

  constructor(model: string = 'claude-3-sonnet-20240229') {
    this.client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
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
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 500,
        temperature: 0,
        messages: [
          { role: 'user', content: prompt },
        ],
      });

      const content = response.content[0]?.type === 'text' 
        ? response.content[0].text 
        : '{}';
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      const result = JSON.parse(jsonMatch ? jsonMatch[0] : '{}');

      return {
        correct: result.correct ?? false,
        score: Math.max(0, Math.min(1, result.score ?? 0)),
        confidence: Math.max(0, Math.min(1, result.confidence ?? 0)),
        reasoning: result.reasoning ?? 'No reasoning provided',
      };
    } catch (error) {
      console.error('Anthropic evaluation error:', error);
      return {
        correct: false,
        score: 0,
        confidence: 0,
        reasoning: `Evaluation failed: ${error}`,
      };
    }
  }
}
