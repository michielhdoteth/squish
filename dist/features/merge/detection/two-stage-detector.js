/**
 * Two-stage duplicate detection orchestrator.
 * Stage 1: Hash-based prefiltering (SimHash + MinHash)
 * Stage 2: Semantic ranking using embeddings
 */
import { getEmbedding } from '../../../core/embeddings.js';
import { SimHashFilter, MinHashFilter, findCandidatePairs } from './hash-filters.js';
import { rankCandidates, analyzePair } from './semantic-ranker.js';
import { getDb } from '../../../db/index.js';
import { getSchema } from '../../../db/schema.js';
import { createDatabaseClient } from '../../../core/database.js';
import { eq, and } from 'drizzle-orm';
export async function detectDuplicates(options) {
    const startTime = Date.now();
    const db = createDatabaseClient(await getDb());
    const schema = await getSchema();
    let query = db.select().from(schema.memories);
    if (options.projectId) {
        query = query.where(eq(schema.memories.projectId, options.projectId));
    }
    if (options.type) {
        query = query.where(eq(schema.memories.type, options.type));
    }
    query = query.where(and(eq(schema.memories.isMerged, false), eq(schema.memories.isMergeable, true), eq(schema.memories.isActive, true)));
    const memories = await query.execute();
    if (memories.length < 2) {
        return {
            candidates: [],
            stage1Time: 0,
            stage2Time: 0,
            totalCandidates: 0,
            filteredCandidates: 0,
            statistics: {
                totalMemories: memories.length,
                memoriesByType: countByType(memories),
            },
        };
    }
    const memoriesById = new Map(memories.map((m) => [m.id, m]));
    const contentById = new Map(memories.map((m) => [m.id, m.content]));
    const simhashFilter = new SimHashFilter();
    const minhashFilter = new MinHashFilter();
    const allSimhashes = new Map();
    const allMinhashes = new Map();
    for (const memory of memories) {
        allSimhashes.set(memory.id, simhashFilter.generateHash(memory.content));
        allMinhashes.set(memory.id, minhashFilter.generateSignature(memory.content));
    }
    const stage1Start = Date.now();
    const stage1Candidates = findCandidatePairs(contentById, allSimhashes, allMinhashes, {
        simhashThreshold: options.simhashThreshold ?? 4,
        minhashThreshold: options.minhashThreshold ?? 0.7,
    });
    const stage1Time = Date.now() - stage1Start;
    if (options.stage1Only) {
        return {
            candidates: stage1Candidates.map((pair) => ({
                memory1: memoriesById.get(pair.memoryId1),
                memory2: memoriesById.get(pair.memoryId2),
                similarityScore: Math.max(1 - pair.simhashDistance / 64, pair.minhashSimilarity),
                detectionMethod: pair.matched === 'both' ? 'simhash' : pair.matched,
                confidenceLevel: 'low',
                mergeReason: 'Stage 1 candidate (embedding analysis skipped)',
            })),
            stage1Time,
            stage2Time: 0,
            totalCandidates: stage1Candidates.length,
            filteredCandidates: stage1Candidates.length,
            statistics: {
                totalMemories: memories.length,
                memoriesByType: countByType(memories),
            },
        };
    }
    const stage2Start = Date.now();
    const embeddings = new Map();
    for (const memory of memories) {
        if (memory.embedding) {
            embeddings.set(memory.id, memory.embedding);
        }
        else {
            const embedding = await getEmbedding(memory.content);
            if (embedding) {
                embeddings.set(memory.id, embedding);
            }
        }
    }
    const rankedCandidates = await rankCandidates(stage1Candidates.map((pair) => ({
        memoryId1: pair.memoryId1,
        memoryId2: pair.memoryId2,
    })), memoriesById, embeddings, {
        semanticThreshold: options.threshold ?? 0.85,
        topK: 10,
    });
    const stage2Time = Date.now() - stage2Start;
    const candidates = rankedCandidates.map((ranked) => ({
        memory1: ranked.memory1,
        memory2: ranked.memory2,
        similarityScore: ranked.cosineSimilarity,
        detectionMethod: 'embedding',
        confidenceLevel: ranked.confidenceLevel,
        mergeReason: ranked.mergeReason,
    }));
    const limited = candidates.slice(0, options.limit ?? 50);
    return {
        candidates: limited,
        stage1Time,
        stage2Time,
        totalCandidates: stage1Candidates.length,
        filteredCandidates: rankedCandidates.length,
        statistics: {
            totalMemories: memories.length,
            memoriesByType: countByType(memories),
        },
    };
}
export async function analyzeMergePair(memoryId1, memoryId2) {
    const db = createDatabaseClient(await getDb());
    const schema = await getSchema();
    const [memory1] = await db
        .select()
        .from(schema.memories)
        .where(eq(schema.memories.id, memoryId1));
    const [memory2] = await db
        .select()
        .from(schema.memories)
        .where(eq(schema.memories.id, memoryId2));
    if (!memory1 || !memory2) {
        return null;
    }
    const embedding1 = memory1.embedding || (await getEmbedding(memory1.content)) || [];
    const embedding2 = memory2.embedding || (await getEmbedding(memory2.content)) || [];
    if (!embedding1 || !embedding2 || embedding1.length === 0 || embedding2.length === 0) {
        return null;
    }
    const analysis = analyzePair(memory1, memory2, embedding1, embedding2);
    return {
        memory1,
        memory2,
        analysis,
    };
}
function countByType(memories) {
    const counts = {
        observation: 0,
        fact: 0,
        decision: 0,
        context: 0,
        preference: 0,
    };
    for (const memory of memories) {
        const type = memory.type;
        if (type in counts) {
            counts[type]++;
        }
    }
    return counts;
}
export async function getDetectionStats(projectId) {
    const db = createDatabaseClient(await getDb());
    const schema = await getSchema();
    const memories = await db
        .select()
        .from(schema.memories)
        .where(eq(schema.memories.projectId, projectId));
    const totalMemories = memories.length;
    const mergedMemories = memories.filter((m) => m.isMerged).length;
    const canonicalMemories = memories.filter((m) => m.isCanonical).length;
    const mergeableMemories = memories.filter((m) => m.isMergeable && !m.isMerged).length;
    return {
        totalMemories,
        mergeableMemories,
        mergedMemories,
        canonicalMemories,
        memoriesByType: countByType(memories),
    };
}
//# sourceMappingURL=two-stage-detector.js.map