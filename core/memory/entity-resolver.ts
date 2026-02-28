export interface ExtractedEntities {
  primary: string[]; // Main entities (people, projects)
  secondary: string[]; // Supporting entities
  queryType: 'factual' | 'relational' | 'temporal';
}

/**
 * Extract entities from a query using Claude
 * NO FALLBACKS - real extraction or throw
 */
export async function extractQueryEntities(
  query: string,
  callClaudeFn: (prompt: string, maxTokens: number) => Promise<string>
): Promise<ExtractedEntities> {
  const prompt = `Extract entities from this question. Return ONLY JSON:
{
  "primary": ["Alice", "project name"],
  "secondary": ["team", "budget"],
  "queryType": "factual"
}

Question: ${query}`;

  const response = await callClaudeFn(prompt, 500);
  
  const jsonMatch = response.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('No JSON in entity extraction');
  }

  const parsed = JSON.parse(jsonMatch[0]) as ExtractedEntities;
  
  return {
    primary: parsed.primary || [],
    secondary: parsed.secondary || [],
    queryType: parsed.queryType || 'factual',
  };
}

/**
 * Score memory relevance based on entity matching
 * Returns boost factor (0-1)
 */
export function scoreEntityMatch(
  memoryEntities: string[],
  queryEntities: string[]
): number {
  if (!queryEntities.length || !memoryEntities.length) {
    return 0.5; // Neutral if no entities
  }

  const querySet = new Set(queryEntities.map(e => e.toLowerCase()));
  const memorySet = new Set(memoryEntities.map(e => e.toLowerCase()));
  
  // Count matches
  let matches = 0;
  for (const entity of querySet) {
    if (memorySet.has(entity)) {
      matches++;
    }
  }
  
  // Calculate boost (0-1)
  const matchRatio = matches / querySet.size;
  return 0.5 + (matchRatio * 0.5); // 0.5 to 1.0
}

/**
 * Filter and boost memories by entity relevance
 */
export function filterByEntities(
  memories: any[],
  queryEntities: string[]
): Array<{ memory: any; entityBoost: number }> {
  if (!queryEntities.length) {
    // No entities to filter by, return all with neutral boost
    return memories.map(m => ({ memory: m, entityBoost: 0.5 }));
  }

  return memories.map(memory => {
    const memoryEntities = (memory.metadata?.entities as string[]) || [];
    const boost = scoreEntityMatch(memoryEntities, queryEntities);
    
    return {
      memory,
      entityBoost: boost,
    };
  });
}
