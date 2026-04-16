/**
 * Remember Command - Unified memory write
 * 
 * Single implementation for both CLI and MCP.
 */

import { rememberMemory, findSimilarMemories } from '../memory/memories.js';
import { createLearning } from '../ingestion/learnings.js';
import { pinMemory, unpinMemory } from '../security/governance.js';
import { detectMemorySignals } from '../memory/trigger-detector.js';
export interface CommandResult {
  ok: boolean;
  [key: string]: any;
}

export interface RememberOptions {
  content: string;
  project?: string;
  tags?: string;
  tier?: 'hot' | 'cold';
  type?: string;
  learningType?: 'success' | 'failure' | 'fix' | 'insight';
  confidence?: string;
  source?: 'cli' | 'voice' | 'chat' | 'document';
  route?: 'auto' | 'memory' | 'learning' | 'note';
  pin?: boolean;
  unpin?: boolean;
}

export async function executeRemember(options: RememberOptions): Promise<CommandResult> {
  const { content, project, tags, tier, type, learningType, source, route, pin, unpin } = options;
  
  const signals = detectMemorySignals(content);

  let routing: "memory" | "learning" | "note" = "memory";
  let inferredType = type || signals.suggestedType;
  let routingReason = "";

  // Check for learning patterns if auto mode
  if (route === "auto" || !route) {
    const hasLessonPattern = /(\bfailed\s+because\b|\blesson\s+learned\b|\bnext\s+time\b|\broot\s+cause\b|\bsuccess\b.*\bbecause\b|\bi\s+learned\b|\binsight\b)/i.test(content);
    const hasLearningType = /(\bsuccess\b|\bfailure\b|\bfix\b|\binsight\b)/i.test(content);
    
    const hasHackPattern = /(\bHACK\b|\bworkaround\b|\btemporary\s+fix\b)/i.test(content);
    const hasFixmePattern = /(\bFIXME\b|\bXXX\b|\bbug\b.*\bfix\b)/i.test(content);
    
    if (hasLessonPattern || hasLearningType || hasHackPattern || hasFixmePattern) {
      routing = "learning";
      if (hasHackPattern || hasFixmePattern) {
        routingReason = "Detected code pattern (HACK/FIXME)";
      } else {
        routingReason = "Detected learning pattern in content";
      }
    } else if (signals.suggestedType === 'task') {
      routing = "memory";
      routingReason = "Detected TODO pattern";
    } else if (signals.suggestedType === 'observation' && /\b(note|note\s+that|log|remember)\b/i.test(content)) {
      routing = "note";
      routingReason = "Detected note pattern";
    } else {
      routing = "memory";
      routingReason = `Detected as ${inferredType}`;
    }
  } else if (route === "learning") {
    routing = "learning";
    routingReason = "Override: forced to learning";
  } else if (route === "note") {
    routing = "note";
    routingReason = "Override: forced to note";
  } else {
    routing = "memory";
    routingReason = "Override: forced to memory";
  }

  let result: any;
  const parsedTags = tags ? tags.split(',').map((t: string) => t.trim()) : [];
  const parsedTier = tier === "cold" ? "cold" : "hot";

  if (routing === "learning") {
    let parsedLearningType: "success" | "failure" | "fix" | "insight" = "insight";
    if (learningType) {
      parsedLearningType = learningType as any;
    } else {
      if (/(\bsuccess\b|\bworked\b|\bfinished\b)/i.test(content)) parsedLearningType = "success";
      else if (/(\bfailed\b|\berror\b|\bbroke\b)/i.test(content)) parsedLearningType = "failure";
      else if (/(\bfix\b|\b workaround\b|\bsolved\b)/i.test(content)) parsedLearningType = "fix";
    }

    const learning = await createLearning({ 
      type: parsedLearningType, 
      content, 
      project,
      autoLink: true 
    });
    result = { id: learning.id, type: "learning", learningType: parsedLearningType, content };
  } else {
    // Check for similar memories to avoid duplicates (deduplication)
    const similarMemories = await findSimilarMemories(content, 0.85, 3);
    
    const memory = await rememberMemory({ 
      content, 
      type: inferredType as any, 
      tags: parsedTags, 
      project,
      tier: parsedTier,
      source: source || 'cli'
    });
    
    // If found similar memories, create association instead of duplicate
    if (similarMemories.length > 0) {
      const { createAssociation } = await import('../associations.js');
      for (const similar of similarMemories) {
        await createAssociation(memory.id, similar.id, 'duplicate', similar.similarity ?? 0.85);
      }
      (memory as any).similarTo = similarMemories.map(s => s.id);
    }
    
    if (pin) {
      await pinMemory(memory.id);
    } else if (unpin) {
      await unpinMemory(memory.id);
    }
    
    result = { id: memory.id, type: "memory", memoryType: inferredType, tier: parsedTier, content, pinned: pin };

    // Auto-update knowledge graph (fire-and-forget, don't fail remember on graph error)
    const { addMemoryToGraph } = await import('../graph/graph-builder.js');
    const graphResult = await addMemoryToGraph(memory.id).catch((e: Error) => {
      console.warn('[Graph] Auto-update failed:', e.message);
      return null;
    });
    if (graphResult) {
      (result as any).graph = { entities: graphResult.entitiesCreated, relations: graphResult.relationsCreated };
    }
    
    // Auto-assign to place (fire-and-forget)
    const { autoAssignMemory } = await import('../places/memory-places.js');
    const projectId = (memory as any).projectId || project;
    const placeResult = await autoAssignMemory({
      memoryId: memory.id,
      projectId: projectId,
      content: content,
      tags: parsedTags,
      memoryType: inferredType as string
    }).catch((e: Error) => {
      console.warn('[Places] Auto-assign failed:', e.message);
      return null;
    });
    if (placeResult?.assigned && placeResult.placeId) {
      (result as any).place = { id: placeResult.placeId, type: placeResult.placeType ?? 'inbox' };
    }
  }

  return {
    ok: true,
    id: result.id,
    routing,
    type: routing === "learning" ? result.learningType : result.memoryType,
    tier: routing === "memory" ? parsedTier : 'N/A',
    priority: signals.priority,
    confidence: signals.confidence,
    pinned: result.pinned,
    reason: routingReason
  };
}
