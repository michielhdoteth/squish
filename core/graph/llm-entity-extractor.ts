/**
 * LLM Entity Extractor
 * 
 * Extracts named entities and relationships from memory content using
 * LLM-powered analysis. Falls back to regex extraction when LLM is unavailable.
 */

import { logger } from '../logger.js';
import { config } from '../../config.js';
import {
  extractEntities as regexExtractEntities,
  linkEntitiesToMemories,
  type EntityType,
  type ExtractedEntity,
} from '../memory/entity-extractor.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export type RelationType =
  | 'works_on'
  | 'depends_on'
  | 'manages'
  | 'uses'
  | 'caused'
  | 'located_in'
  | 'belongs_to'
  | 'reports_to'
  | 'occurred_on'
  | 'affects'
  | 'contains'
  | 'implements'
  | 'extends'
  | 'related_to'
  | 'part_of'
  | 'owns'
  | 'created'
  | 'resolved'
  | 'blocks';

export interface ExtractedRelation {
  fromEntity: string;
  toEntity: string;
  relationType: RelationType;
  confidence: number;
  context: string;
}

export interface LLMExtractionResult {
  entities: ExtractedEntity[];
  relations: ExtractedRelation[];
  source: 'llm' | 'regex' | 'none';
}

// ─── LLM Prompt ─────────────────────────────────────────────────────────────

const ENTITY_EXTRACTION_PROMPT = `You are an entity and relationship extractor for an AI memory system. Given text, extract:

1. ENTITIES: Named things mentioned (people, projects, systems, tools, concepts, events)
2. RELATIONSHIPS: How entities connect to each other

Return ONLY valid JSON in this exact format:
{
  "entities": [
    {"name": "Alice", "type": "person", "confidence": 0.95},
    {"name": "Project Atlas", "type": "concept", "confidence": 0.9}
  ],
  "relations": [
    {"from": "Alice", "to": "Project Atlas", "type": "works_on", "confidence": 0.85, "context": "Alice is the tech lead on Project Atlas"},
    {"from": "Project Atlas", "to": "PostgreSQL", "type": "uses", "confidence": 0.9, "context": "Project Atlas uses PostgreSQL for its primary datastore"}
  ]
}

Entity types: person, file, function, class, concept, tool, date, location, pattern, technique, other
Relation types: works_on, depends_on, manages, uses, caused, located_in, belongs_to, reports_to, occurred_on, affects, contains, implements, extends, related_to, part_of, owns, created, resolved, blocks

Rules:
- Extract only explicitly mentioned entities and relationships
- Use the most specific relation type available
- Include confidence scores (0-1)
- Keep entity names as they appear in text (preserve capitalization)
- For ambiguous relationships, use "related_to"
- Do NOT invent entities or relationships not present in the text`;

// ─── LLM Call Abstraction ───────────────────────────────────────────────────

/**
 * Call an LLM for entity extraction.
 * Uses OpenAI-compatible API (works with OpenAI, Ollama, LM Studio).
 */
async function callLLM(prompt: string, content: string): Promise<string | null> {
  // Determine which provider to use for extraction
  const provider = config.embeddingsProvider;
  
  // Try OpenAI first if configured
  if (config.openAiApiKey) {
    try {
      const chatUrl = config.openAiApiUrl.replace('/embeddings', '/chat/completions');
      const response = await fetch(chatUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.openAiApiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: prompt },
            { role: 'user', content },
          ],
          temperature: 0.1,
          max_tokens: 2000,
        }),
      });

      if (!response.ok) {
        logger.warn(`LLM entity extraction failed: ${response.status}`);
        return null;
      }

      const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
      return payload.choices?.[0]?.message?.content ?? null;
    } catch (error) {
      logger.warn('LLM entity extraction error (OpenAI):', { error: error as Error });
    }
  }

  // Try Ollama if configured
  if (config.ollamaUrl) {
    try {
      const response = await fetch(`${config.ollamaUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: config.ollamaEmbeddingModel || 'llama3.2',
          messages: [
            { role: 'system', content: prompt },
            { role: 'user', content },
          ],
          stream: false,
          options: { temperature: 0.1 },
        }),
      });

      if (!response.ok) {
        logger.warn(`Ollama entity extraction failed: ${response.status}`);
        return null;
      }

      const payload = await response.json() as { message?: { content?: string } };
      return payload.message?.content ?? null;
    } catch (error) {
      logger.warn('LLM entity extraction error (Ollama):', { error: error as Error });
    }
  }

  // Try LM Studio if configured
  if (config.lmStudioUrl) {
    try {
      const response = await fetch(`${config.lmStudioUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: config.lmStudioEmbeddingModel || 'default',
          messages: [
            { role: 'system', content: prompt },
            { role: 'user', content },
          ],
          temperature: 0.1,
          max_tokens: 2000,
        }),
      });

      if (!response.ok) {
        logger.warn(`LM Studio entity extraction failed: ${response.status}`);
        return null;
      }

      const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
      return payload.choices?.[0]?.message?.content ?? null;
    } catch (error) {
      logger.warn('LLM entity extraction error (LM Studio):', { error: error as Error });
    }
  }

  return null;
}

// ─── JSON Parsing ────────────────────────────────────────────────────────────

/**
 * Parse LLM response into structured extraction result.
 * Handles various response formats (raw JSON, markdown code blocks, etc.)
 */
function parseLLMResponse(response: string): { entities: ExtractedEntity[]; relations: ExtractedRelation[] } | null {
  // Try to extract JSON from the response
  let jsonStr = response.trim();

  // Handle markdown code blocks
  const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1].trim();
  }

  // Try to find JSON object in the response
  const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    logger.debug('No JSON found in LLM response');
    return null;
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]);

    // Validate structure
    if (!parsed.entities || !Array.isArray(parsed.entities)) {
      logger.debug('LLM response missing entities array');
      return null;
    }

    const entities: ExtractedEntity[] = (parsed.entities as any[])
      .filter((e: any) => e.name && e.type)
      .map((e: any) => ({
        name: String(e.name),
        type: validateEntityType(String(e.type)),
        confidence: typeof e.confidence === 'number' ? Math.min(1, Math.max(0, e.confidence)) : 0.8,
        startIndex: 0,
        endIndex: 0,
        context: String(e.context || ''),
        normalized: e.normalized ? String(e.normalized) : undefined,
      }));

    const relations: ExtractedRelation[] = (parsed.relations || [])
      .filter((r: any) => r.from && r.to && r.type)
      .map((r: any) => ({
        fromEntity: String(r.from),
        toEntity: String(r.to),
        relationType: validateRelationType(String(r.type)),
        confidence: typeof r.confidence === 'number' ? Math.min(1, Math.max(0, r.confidence)) : 0.7,
        context: String(r.context || ''),
      }));

    return { entities, relations };
  } catch (error) {
    logger.debug('Failed to parse LLM response as JSON', { error: error as Error });
    return null;
  }
}

function validateEntityType(type: string): EntityType {
  const validTypes: EntityType[] = ['person', 'file', 'function', 'class', 'concept', 'tool', 'date', 'location', 'pattern', 'technique', 'other'];
  const lower = type.toLowerCase() as EntityType;
  if (validTypes.includes(lower)) return lower;
  return 'other';
}

function validateRelationType(type: string): RelationType {
  const validTypes: RelationType[] = [
    'works_on', 'depends_on', 'manages', 'uses', 'caused', 'located_in',
    'belongs_to', 'reports_to', 'occurred_on', 'affects', 'contains',
    'implements', 'extends', 'related_to', 'part_of', 'owns', 'created',
    'resolved', 'blocks',
  ];
  const lower = type.toLowerCase() as RelationType;
  if (validTypes.includes(lower)) return lower;
  return 'related_to';
}

// ─── Main Extraction Functions ───────────────────────────────────────────────

/**
 * Extract entities and relationships from text using LLM.
 * Falls back to regex extraction when LLM is unavailable.
 */
export async function extractEntitiesAndRelations(
  content: string,
  options?: {
    preferLLM?: boolean;
    maxContentLength?: number;
  }
): Promise<LLMExtractionResult> {
  const { preferLLM = true, maxContentLength = 4000 } = options || {};

  // Truncate very long content
  const truncatedContent = content.length > maxContentLength
    ? content.substring(0, maxContentLength) + '...'
    : content;

  // Try LLM extraction first if preferred
  if (preferLLM) {
    const llmResult = await extractWithLLM(truncatedContent);
    if (llmResult) {
      logger.debug('LLM entity extraction succeeded', {
        entityCount: llmResult.entities.length,
        relationCount: llmResult.relations.length,
      });
      return { ...llmResult, source: 'llm' };
    }
  }

  // Fall back to regex extraction
  const regexEntities = await regexExtractEntities(content);
  if (regexEntities.length > 0) {
    logger.debug('Regex entity extraction fallback', {
      entityCount: regexEntities.length,
    });
    return {
      entities: regexEntities,
      relations: [], // Regex extraction doesn't produce relations
      source: 'regex',
    };
  }

  return { entities: [], relations: [], source: 'none' };
}

/**
 * Extract entities and relations using LLM.
 */
async function extractWithLLM(content: string): Promise<Omit<LLMExtractionResult, 'source'> | null> {
  const response = await callLLM(ENTITY_EXTRACTION_PROMPT, content);
  if (!response) return null;

  const parsed = parseLLMResponse(response);
  if (!parsed) return null;

  // Validate that extracted entities actually appear in the content
  const validatedEntities = parsed.entities.filter((entity) => {
    // Allow entities whose name or a significant substring appears in content
    const nameLower = entity.name.toLowerCase();
    const contentLower = content.toLowerCase();
    // Check if the entity name or a key part of it appears in content
    const words = nameLower.split(/\s+/);
    return words.some(word => word.length > 2 && contentLower.includes(word));
  });

  // Validate that relation entities exist in the entity list
  const entityNames = new Set(validatedEntities.map(e => e.name.toLowerCase()));
  const validatedRelations = parsed.relations.filter((relation) => {
    const fromExists = entityNames.has(relation.fromEntity.toLowerCase());
    const toExists = entityNames.has(relation.toEntity.toLowerCase());
    // Allow relations where at least one entity is known
    // (the LLM might use slightly different names)
    return fromExists || toExists || 
      // Also allow if both entity names appear in the content
      (content.toLowerCase().includes(relation.fromEntity.toLowerCase()) &&
       content.toLowerCase().includes(relation.toEntity.toLowerCase()));
  });

  return {
    entities: validatedEntities,
    relations: validatedRelations,
  };
}

/**
 * Extract entities and relations from multiple memories in batch.
 * More efficient than calling extractEntitiesAndRelations for each memory.
 */
export async function batchExtractEntitiesAndRelations(
  contents: string[],
  options?: {
    preferLLM?: boolean;
    maxContentLength?: number;
    batchSize?: number;
  }
): Promise<LLMExtractionResult[]> {
  const { batchSize = 5 } = options || {};
  const results: LLMExtractionResult[] = [];

  // Process in batches to avoid overwhelming the LLM
  for (let i = 0; i < contents.length; i += batchSize) {
    const batch = contents.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(content => extractEntitiesAndRelations(content, options))
    );
    results.push(...batchResults);
  }

  return results;
}

/**
 * Get the extraction prompt for testing/debugging purposes.
 */
export function getExtractionPrompt(): string {
  return ENTITY_EXTRACTION_PROMPT;
}

/**
 * Parse an LLM response for testing/debugging purposes.
 */
export function testParseLLMResponse(response: string): { entities: ExtractedEntity[]; relations: ExtractedRelation[] } | null {
  return parseLLMResponse(response);
}