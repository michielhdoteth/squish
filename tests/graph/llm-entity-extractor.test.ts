/**
 * Tests for LLM Entity Extractor
 * 
 * Tests the extraction of entities and relationships from text,
 * including LLM response parsing, validation, and fallback behavior.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the config module
vi.mock('../../config.js', () => ({
  config: {
    embeddingsProvider: 'local',
    openAiApiKey: '',
    ollamaUrl: '',
    lmStudioUrl: '',
    openAiApiUrl: 'https://api.openai.com/v1/embeddings',
  },
}));

// Mock the logger module
vi.mock('../logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock the entity-extractor module (regex fallback)
vi.mock('../memory/entity-extractor.js', () => ({
  extractEntities: vi.fn().mockResolvedValue([
    {
      name: 'PostgreSQL',
      type: 'tool',
      confidence: 0.9,
      startIndex: 0,
      endIndex: 10,
      context: 'Project Atlas uses PostgreSQL',
    },
  ]),
  linkEntitiesToMemories: vi.fn().mockResolvedValue(undefined),
}));

import {
  extractEntitiesAndRelations,
  testParseLLMResponse,
  getExtractionPrompt,
  batchExtractEntitiesAndRelations,
  type ExtractedRelation,
  type RelationType,
} from '../../core/graph/llm-entity-extractor.js';

describe('LLM Entity Extractor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('parseLLMResponse', () => {
    it('should parse valid JSON response with entities and relations', () => {
      const response = JSON.stringify({
        entities: [
          { name: 'Alice', type: 'person', confidence: 0.95 },
          { name: 'Project Atlas', type: 'concept', confidence: 0.9 },
        ],
        relations: [
          { from: 'Alice', to: 'Project Atlas', type: 'works_on', confidence: 0.85, context: 'Alice is the tech lead' },
        ],
      });

      const result = testParseLLMResponse(response);
      expect(result).not.toBeNull();
      expect(result!.entities).toHaveLength(2);
      expect(result!.relations).toHaveLength(1);
      expect(result!.entities[0].name).toBe('Alice');
      expect(result!.entities[0].type).toBe('person');
      expect(result!.relations[0].fromEntity).toBe('Alice');
      expect(result!.relations[0].relationType).toBe('works_on');
    });

    it('should parse JSON from markdown code blocks', () => {
      const response = '```json\n{"entities": [{"name": "Bob", "type": "person", "confidence": 0.9}], "relations": []}\n```';
      const result = testParseLLMResponse(response);
      expect(result).not.toBeNull();
      expect(result!.entities).toHaveLength(1);
      expect(result!.entities[0].name).toBe('Bob');
    });

    it('should parse JSON with surrounding text', () => {
      const response = 'Here are the extracted entities:\n{"entities": [{"name": "Test", "type": "concept", "confidence": 0.8}], "relations": []}\nDone.';
      const result = testParseLLMResponse(response);
      expect(result).not.toBeNull();
      expect(result!.entities).toHaveLength(1);
    });

    it('should return null for invalid JSON', () => {
      const result = testParseLLMResponse('not json at all');
      expect(result).toBeNull();
    });

    it('should return null for JSON without entities array', () => {
      const result = testParseLLMResponse('{"stuff": []}');
      expect(result).toBeNull();
    });

    it('should filter out entities without name or type', () => {
      const response = JSON.stringify({
        entities: [
          { name: 'Valid', type: 'person', confidence: 0.9 },
          { name: '', type: 'person', confidence: 0.5 }, // Missing name
          { name: 'NoType', confidence: 0.5 }, // Missing type
        ],
        relations: [],
      });
      const result = testParseLLMResponse(response);
      expect(result).not.toBeNull();
      expect(result!.entities).toHaveLength(1);
      expect(result!.entities[0].name).toBe('Valid');
    });

    it('should validate and normalize entity types', () => {
      const response = JSON.stringify({
        entities: [
          { name: 'Alice', type: 'PERSON', confidence: 0.9 }, // Should be lowercased
          { name: 'Thing', type: 'unknown_type', confidence: 0.7 }, // Should become 'other'
        ],
        relations: [],
      });
      const result = testParseLLMResponse(response);
      expect(result).not.toBeNull();
      expect(result!.entities[0].type).toBe('person');
      expect(result!.entities[1].type).toBe('other');
    });

    it('should validate and normalize relation types', () => {
      const response = JSON.stringify({
        entities: [
          { name: 'Alice', type: 'person', confidence: 0.9 },
          { name: 'Project', type: 'concept', confidence: 0.9 },
        ],
        relations: [
          { from: 'Alice', to: 'Project', type: 'WORKS_ON', confidence: 0.8, context: '' }, // Should be lowercased
          { from: 'Alice', to: 'Project', type: 'unknown_relation', confidence: 0.5, context: '' }, // Should become 'related_to'
        ],
      });
      const result = testParseLLMResponse(response);
      expect(result).not.toBeNull();
      expect(result!.relations[0].relationType).toBe('works_on');
      expect(result!.relations[1].relationType).toBe('related_to');
    });

    it('should clamp confidence scores to 0-1 range', () => {
      const response = JSON.stringify({
        entities: [
          { name: 'High', type: 'person', confidence: 1.5 }, // Should be clamped to 1
          { name: 'Low', type: 'person', confidence: -0.5 }, // Should be clamped to 0
        ],
        relations: [],
      });
      const result = testParseLLMResponse(response);
      expect(result).not.toBeNull();
      expect(result!.entities[0].confidence).toBe(1);
      expect(result!.entities[1].confidence).toBe(0);
    });

    it('should default confidence to 0.8 for entities and 0.7 for relations when missing', () => {
      const response = JSON.stringify({
        entities: [
          { name: 'Test', type: 'concept' }, // No confidence
        ],
        relations: [
          { from: 'Test', to: 'Other', type: 'related_to', context: '' }, // No confidence
        ],
      });
      const result = testParseLLMResponse(response);
      expect(result).not.toBeNull();
      expect(result!.entities[0].confidence).toBe(0.8);
      expect(result!.relations[0].confidence).toBe(0.7);
    });

    it('should filter out relations without required fields', () => {
      const response = JSON.stringify({
        entities: [
          { name: 'Alice', type: 'person', confidence: 0.9 },
        ],
        relations: [
          { from: 'Alice', to: 'Bob', type: 'works_on', confidence: 0.8, context: '' }, // Valid
          { from: '', to: 'Bob', type: 'works_on', confidence: 0.5, context: '' }, // Missing 'from'
          { from: 'Alice', to: '', type: 'works_on', confidence: 0.5, context: '' }, // Missing 'to'
          { from: 'Alice', to: 'Bob', confidence: 0.5, context: '' }, // Missing 'type'
        ],
      });
      const result = testParseLLMResponse(response);
      expect(result).not.toBeNull();
      expect(result!.relations).toHaveLength(1);
    });
  });

  describe('getExtractionPrompt', () => {
    it('should return the extraction prompt', () => {
      const prompt = getExtractionPrompt();
      expect(prompt).toContain('entity and relationship extractor');
      expect(prompt).toContain('entities');
      expect(prompt).toContain('relations');
      expect(prompt).toContain('JSON');
    });
  });

  describe('extractEntitiesAndRelations', () => {
    it('should fall back to regex extraction when no LLM is available', async () => {
      // No LLM API keys configured, so it should fall back to regex
      const result = await extractEntitiesAndRelations(
        'Project Atlas uses PostgreSQL for its primary datastore',
        { preferLLM: true }
      );

      // Should use regex fallback since no LLM is configured
      expect(result.source).toBe('regex');
      expect(result.entities.length).toBeGreaterThan(0);
    });

    it('should return empty result for empty content', async () => {
      const result = await extractEntitiesAndRelations('');
      expect(result.entities).toHaveLength(0);
      expect(result.relations).toHaveLength(0);
    });

    it('should skip LLM when preferLLM is false', async () => {
      const result = await extractEntitiesAndRelations(
        'Project Atlas uses PostgreSQL for its primary datastore',
        { preferLLM: false }
      );

      // Should go straight to regex (mock returns entities for this content)
      expect(result.source).toBe('regex');
    });

    it('should truncate very long content', async () => {
      const longContent = 'x'.repeat(5000);
      const result = await extractEntitiesAndRelations(longContent, {
        preferLLM: false,
        maxContentLength: 100,
      });

      // Regex extraction on 'xxxx...' should return empty or minimal results
      // The key test is that it doesn't crash on long content
      expect(result).toBeDefined();
    });
  });

  describe('batchExtractEntitiesAndRelations', () => {
    it('should process multiple contents in batch', async () => {
      const contents = [
        'Project Atlas uses PostgreSQL for its primary datastore',
        'Project Atlas uses PostgreSQL for its primary datastore',
      ];

      const results = await batchExtractEntitiesAndRelations(contents, {
        preferLLM: false,
        batchSize: 2,
      });

      expect(results).toHaveLength(2);
      // Each result should have entities from regex extraction (mock returns entities)
      expect(results[0].source).toBe('regex');
      expect(results[1].source).toBe('regex');
    });

    it('should handle empty batch', async () => {
      const results = await batchExtractEntitiesAndRelations([], {
        preferLLM: false,
      });
      expect(results).toHaveLength(0);
    });
  });

  describe('relation type validation', () => {
    it('should accept all valid relation types', () => {
      const validTypes: RelationType[] = [
        'works_on', 'depends_on', 'manages', 'uses', 'caused',
        'located_in', 'belongs_to', 'reports_to', 'occurred_on',
        'affects', 'contains', 'implements', 'extends', 'related_to',
        'part_of', 'owns', 'created', 'resolved', 'blocks',
      ];

      const response = JSON.stringify({
        entities: validTypes.map((_, i) => ({ name: `Entity${i}`, type: 'concept', confidence: 0.8 })),
        relations: validTypes.map((type, i) => ({
          from: `Entity${i}`,
          to: `Entity${(i + 1) % validTypes.length}`,
          type,
          confidence: 0.7,
          context: '',
        })),
      });

      const result = testParseLLMResponse(response);
      expect(result).not.toBeNull();
      expect(result!.relations).toHaveLength(validTypes.length);
      result!.relations.forEach((r, i) => {
        expect(r.relationType).toBe(validTypes[i]);
      });
    });
  });

  describe('multi-hop scenario test', () => {
    it('should extract entities and relations for the Alice/Atlas/PostgreSQL scenario', () => {
      const response = JSON.stringify({
        entities: [
          { name: 'Alice', type: 'person', confidence: 0.95 },
          { name: 'Project Atlas', type: 'concept', confidence: 0.9 },
          { name: 'PostgreSQL', type: 'tool', confidence: 0.95 },
        ],
        relations: [
          { from: 'Alice', to: 'Project Atlas', type: 'works_on', confidence: 0.85, context: 'Alice is the tech lead on Project Atlas' },
          { from: 'Project Atlas', to: 'PostgreSQL', type: 'uses', confidence: 0.9, context: 'Project Atlas uses PostgreSQL for its primary datastore' },
        ],
      });

      const result = testParseLLMResponse(response);
      expect(result).not.toBeNull();
      expect(result!.entities).toHaveLength(3);
      expect(result!.relations).toHaveLength(2);

      // Verify the bridge relation exists (this is the key multi-hop connection)
      const bridgeRelation = result!.relations.find(
        r => r.fromEntity === 'Project Atlas' && r.toEntity === 'PostgreSQL'
      );
      expect(bridgeRelation).toBeDefined();
      expect(bridgeRelation!.relationType).toBe('uses');
    });
  });
});