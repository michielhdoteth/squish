/**
 * Answer Generation using LLM with fallback
 */

import OpenAI from 'openai';
import type { SearchResult } from '../types/index.js';

const openai = process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'lm-studio' 
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

export async function generateAnswer(
  question: string,
  context: SearchResult[],
  model: string = 'gpt-4o'
): Promise<string> {
  // If no OpenAI, use local extraction
  if (!openai) {
    return generateLocalAnswer(question, context);
  }

  const contextText = context
    .map((r, i) => `[${i + 1}] ${r.content}`)
    .join('\n\n');

  const prompt = `You are a helpful assistant answering questions based on the provided context.

Context from memory:
${contextText}

Question: ${question}

Provide a concise, accurate answer based only on the context above. If the context doesn't contain enough information, say so.

Answer:`;

  try {
    const response = await openai.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: 'You answer questions based on provided context.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0,
      max_tokens: 500,
    });

    return response.choices[0]?.message?.content?.trim() || 'No answer generated';
  } catch (error) {
    console.error('OpenAI error, falling back to local:', error);
    return generateLocalAnswer(question, context);
  }
}

function generateLocalAnswer(question: string, context: SearchResult[]): string {
  // Extract keywords from question (remove stop words)
  const stopWords = new Set(['what', 'who', 'where', 'when', 'why', 'how', 'is', 'are', 'was', 'were', 'the', 'a', 'an', 'in', 'on', 'at', 'to', 'for', 'of', 'and', 'or', 'but']);
  const questionWords = question.toLowerCase()
    .replace(/[?.,!]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopWords.has(w));

  // Find the best matching context
  let bestMatch: SearchResult | null = null;
  let bestScore = 0;

  for (const ctx of context) {
    const content = ctx.content.toLowerCase();
    let score = 0;
    
    for (const word of questionWords) {
      if (content.includes(word)) {
        score += 1;
        // Bonus for exact phrase match
        if (content.includes(question.toLowerCase().replace('?', ''))) {
          score += 5;
        }
      }
    }
    
    // Boost score by similarity score if available
    score += (ctx.score || 0) * 10;
    
    if (score > bestScore) {
      bestScore = score;
      bestMatch = ctx;
    }
  }

  if (bestMatch && bestScore > 0) {
    // Extract relevant sentence(s) from the best match
    const sentences = bestMatch.content.split(/[.!?]+/);
    
    for (const sentence of sentences) {
      const sentenceLower = sentence.toLowerCase().trim();
      for (const word of questionWords) {
        if (sentenceLower.includes(word) && sentence.length > 20) {
          return sentence.trim() + '.';
        }
      }
    }
    
    // Fallback to first sentence if no keyword match
    return sentences[0].trim() + '.';
  }

  return 'Based on the context, I could not find a specific answer to this question.';
}
