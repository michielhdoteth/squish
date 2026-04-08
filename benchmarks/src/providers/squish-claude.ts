/**
 * REAL Squish Provider + Claude Generation/Judging
 * 
 * This uses ACTUAL Squish memory architecture:
 * - Real database (SQLite or PostgreSQL)
 * - Real search (FTS5 for SQLite, pgvector for PostgreSQL)
 * - Claude for answer generation and evaluation
 */

import type { MemoryProvider, ConversationSession, SearchResult, SearchOptions } from '../types/index.js';
import { dirname, join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { extractFacts, factsToMemoryInputs } from '../../../squish/dist/core/memory/fact-extractor.js';
import { hybridSearch } from '../../../squish/dist/core/memory/hybrid-retrieval.js';

// Environment
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-3-haiku-20240307';

// Resolve Squish path relative to this file
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SQUISH_DIST_PATH = join(__dirname, '../../../squish/dist');

// Squish imports (dynamically loaded)
let squishModule: any = null;
let dbModule: any = null;
let drizzleOrm: any = null;

export interface SquishClaudeProviderOptions {
  project?: string;
  claudeModel?: string;
}

export class SquishClaudeProvider implements MemoryProvider {
  name = 'squish-claude';
  private project: string;
  private claudeModel: string;
  private initialized = false;
  private stats: { mode: string; db: string } = { mode: 'unknown', db: 'unknown' };

  constructor(options: SquishClaudeProviderOptions = {}) {
    this.project = options.project || 'benchmark-test';
    this.claudeModel = options.claudeModel || CLAUDE_MODEL;
  }

  async init(): Promise<void> {
    if (this.initialized) return;

    console.log('  📦 Initializing REAL Squish core...');
    console.log(`     Path: ${SQUISH_DIST_PATH}`);

    try {
      // Import Squish core modules from dist folder (use file:// URLs for Windows compatibility)
      squishModule = await import(pathToFileURL(join(SQUISH_DIST_PATH, 'core/memory/memories.js')).href);
      dbModule = await import(pathToFileURL(join(SQUISH_DIST_PATH, 'db/index.js')).href);
      
      // Import drizzle-orm operators (needed for queries)
      drizzleOrm = await import('drizzle-orm');
      
      // Get Squish config to determine mode
      const { config } = await import(pathToFileURL(join(SQUISH_DIST_PATH, 'config.js')).href);
      
      this.stats = {
        mode: config.isTeamMode ? 'team (PostgreSQL + pgvector)' : 'local (SQLite + FTS5)',
        db: config.isTeamMode ? 'postgresql' : 'sqlite',
      };

      console.log(`  ✅ Squish mode: ${this.stats.mode}`);
      
      // Test DB connection
      const db = await dbModule.getDb();
      console.log(`  ✅ Database connected`);

      this.initialized = true;
    } catch (e: any) {
      console.error(`  ❌ Failed to initialize Squish: ${e.message}`);
      throw new Error(
        'Squish not available. Make sure:\n' +
        '  1. Squish is built (cd ../squish && npx tsc)\n' +
        '  2. Database is running (SQLite: .squish/ folder exists, PostgreSQL: docker-compose up -d)\n' +
        '  3. Schema is migrated (cd ../squish && bun run db:migrate)'
      );
    }
  }

  /**
   * Ingest with FACT EXTRACTION - breaks sessions into atomic facts
   * This improves retrieval accuracy by storing granular facts instead of whole sessions
   */
  async ingest(session: ConversationSession): Promise<void> {
    await this.init();

    const content = session.turns
      .map(t => `${t.role}: ${t.content}`)
      .join('\n');

    // Extract facts using Claude (REAL API call - no fallbacks)
    const extraction = await extractFacts(content, this.callClaude.bind(this));
    
    // Store each fact as an individual memory entry
    const factMemories = factsToMemoryInputs(
      {
        content,
        type: 'observation',
        tags: ['benchmark', session.id],
        project: this.project,
      },
      extraction,
      session.id
    );
    
    // Store all facts to Squish
    for (const factMemory of factMemories) {
      await squishModule.rememberMemory(factMemory);
    }
    
    // Also store a summary of the session
    await squishModule.rememberMemory({
      content: extraction.summary || content.substring(0, 500),
      type: 'context',
      tags: ['benchmark', 'summary', session.id],
      project: this.project,
      metadata: {
        sessionId: session.id,
        turns: session.turns.length,
        factCount: factMemories.length,
        entities: extraction.entities,
        ...session.metadata,
      },
    });
  }

  async index(): Promise<void> {
    // Squish indexes automatically via FTS5 or pgvector
    // Small delay to ensure async operations complete
    await new Promise(r => setTimeout(r, 50));
  }

  /**
   * Escape FTS5 special characters for SQLite mode
   * FTS5 treats "", *, AND, OR, NOT as special operators
   */
  private escapeFts5(query: string): string {
    // Remove or escape FTS5 special characters
    return query
      .replace(/["']/g, '') // Remove quotes
      .replace(/[\?\.\,\!\;\:]/g, ' ') // Replace punctuation with spaces
      .replace(/\s+/g, ' ') // Collapse multiple spaces
      .trim();
  }

  /**
   * Search using HYBRID retrieval (Phase 2)
   * 
   * Combines: vector similarity + recency + coactivation + importance
   * Fetches 50 candidates, re-ranks using multi-factor scoring, returns top N
   */
  async search(query: string, options?: SearchOptions & { sessionId?: string }): Promise<SearchResult[]> {
    await this.init();

    // Escape special characters for FTS5 in SQLite mode
    const safeQuery = this.stats.db === 'sqlite' ? this.escapeFts5(query) : query;

    // Use HYBRID search with re-ranking
    const results = await hybridSearch({
      query: safeQuery,
      project: this.project,
      candidateLimit: 50,  // Fetch many for re-ranking
      resultLimit: options?.limit || 5,
      hybridOptions: {
        weights: {
          semantic: 0.35,
          recency: 0.25,
          coactivation: 0.20,
          importance: 0.20,
        },
        decayDays: 7, // Weekly decay for benchmark data
      },
    });

    // Return with hybrid scores
    return results.map((r) => ({
      id: r.id,
      content: r.content,
      score: r.hybridScore / 100, // Normalize to 0-1
      metadata: r.metadata || undefined, // Convert null to undefined
    }));
  }

  /**
   * Generate answer using Claude with retrieved context
   */
  async generateAnswer(question: string, context: SearchResult[]): Promise<string> {
    const contextText = context
      .map((r, i) => `[Memory ${i + 1}]\n${r.content.slice(0, 1500)}`)
      .join('\n\n---\n\n');

    const prompt = `You are Claude, an AI assistant with access to the user's memory.

<retrieved_memories>
${contextText}
</retrieved_memories>

Based ONLY on the retrieved memories above, answer this question concisely:

Question: ${question}

Answer:`;

    return await this.callClaude(prompt, 300);
  }

  /**
   * Evaluate answer using Claude (LLM-as-judge)
   */
  async evaluateAnswer(question: string, answer: string, groundTruth: string): Promise<{ correct: boolean; score: number; reasoning: string }> {
    const prompt = `You are an expert evaluator. Assess if the answer is correct compared to ground truth.

Question: ${question}
Ground Truth: ${groundTruth}
Generated Answer: ${answer}

Respond with ONLY JSON:
{"correct": true/false, "score": 0.0-1.0, "reasoning": "brief explanation"}`;

    const response = await this.callClaude(prompt, 150);
    
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          correct: parsed.correct ?? false,
          score: Math.max(0, Math.min(1, parsed.score ?? 0)),
          reasoning: parsed.reasoning ?? 'No reasoning',
        };
      }
    } catch {
      // Fallback to heuristic
    }
    
    // Fallback: simple keyword matching
    const answerLower = answer.toLowerCase();
    const truthLower = groundTruth.toLowerCase();
    const truthWords = truthLower.split(/\s+/).filter(w => w.length > 3);
    const matches = truthWords.filter(w => answerLower.includes(w)).length;
    const score = truthWords.length > 0 ? matches / truthWords.length : 0;
    
    return {
      correct: score > 0.7,
      score,
      reasoning: 'Heuristic fallback (Claude response parsing failed)',
    };
  }

  private async callClaude(prompt: string, maxTokens: number): Promise<string> {
    const apiKey = process.env.ANTHROPIC_API_KEY || ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY not set. Set it in environment or .env file.');
    }
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.claudeModel,
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Claude API error: ${response.status} ${error}`);
    }

    const data = await response.json();
    return data.content?.[0]?.text?.trim() || '';
  }

  /**
   * Clear all memories for this project using Squish core
   */
  async clear(): Promise<void> {
    await this.init();

    try {
      // Import Squish projects module
      // @ts-ignore - Runtime import
      const projectsModule = await import(pathToFileURL(join(SQUISH_DIST_PATH, 'core/projects.js')).href);
      const project = await projectsModule.getProjectByPath(this.project);

      if (project && dbModule) {
        const db = await dbModule.getDb();
        const { eq } = drizzleOrm;
        
        // Import schema dynamically
        // @ts-ignore - Runtime import
        const schemaModule = await import(pathToFileURL(join(SQUISH_DIST_PATH, 'db/schema.js')).href);
        const schema = await schemaModule.getSchema();
        
        // Delete memories for this project using proper Drizzle ORM
        await db.delete(schema.memories)
          .where(eq(schema.memories.projectId, project.id));
        
        console.log(`  🗑️  Cleared memories for project: ${this.project}`);
      }
    } catch (e: any) {
      console.warn(`  ⚠️  Could not clear memories: ${e.message}`);
    }
  }

  getStats(): { mode: string; db: string } {
    return this.stats;
  }
}

export function createSquishClaudeProvider(options?: SquishClaudeProviderOptions): SquishClaudeProvider {
  return new SquishClaudeProvider(options);
}
