/**
 * Backfill utility for v1.5.0 multi-place routing and tag-aware retrieval
 * 
 * This script:
 * 1. Reads all existing memories with placeId set
 * 2. For each, looks up the placeType from the places table
 * 3. Sets primaryPlace = placeType on the memory
 * 4. Inserts a memory_places row with source='legacy', isPrimary=true, weight=1.0
 * 5. Parses existing tags JSON array on each memory
 * 6. For each tag, normalizes it and inserts into memory_tags
 */

import { getDb } from './index';
import { memories, places, memoryPlaces, memoryTags } from './drizzle/schema-sqlite';
import { eq, and } from 'drizzle-orm';

/**
 * Normalize a tag string: lowercase, trim, replace spaces with hyphens
 */
function normalizeTag(tag: string): string {
  return tag
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '') // Remove special characters except hyphens
    .replace(/-+/g, '-') // Collapse multiple hyphens
    .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens
}

/**
 * Main backfill function
 */
export async function backfillV1_5_0(): Promise<{
  memoriesUpdated: number;
  placesCreated: number;
  tagsCreated: number;
}> {
  let memoriesUpdated = 0;
  let placesCreated = 0;
  let tagsCreated = 0;

  console.log('Starting v1.5.0 backfill...');

  const db = await getDb();

  // 1. Get all memories with placeId set
  const memoriesWithPlace = await db
    .select({
      id: memories.id,
      placeId: memories.placeId,
      tags: memories.tags,
    })
    .from(memories)
    .where(
      and(
        eq(memories.isActive, true),
        memories.placeId.isNotNull()
      )
    );

  console.log(`Found ${memoriesWithPlace.length} memories with placeId`);

  // 2. Process each memory
  for (const memory of memoriesWithPlace) {
    if (!memory.placeId) continue;

    // Look up place type from places table
    const placeResult = await db
      .select({ placeType: places.placeType })
      .from(places)
      .where(eq(places.id, memory.placeId))
      .limit(1);

    if (placeResult.length === 0) {
      console.warn(`Memory ${memory.id} has invalid placeId ${memory.placeId}, skipping`);
      continue;
    }

    const placeType = placeResult[0].placeType;

    // Update memory's primaryPlace
    await db
      .update(memories)
      .set({ primaryPlace: placeType })
      .where(eq(memories.id, memory.id));

    memoriesUpdated++;

    // Insert memory_places row with source='legacy'
    const existingPlace = await db
      .select()
      .from(memoryPlaces)
      .where(
        and(
          eq(memoryPlaces.memoryId, memory.id),
          eq(memoryPlaces.placeType, placeType),
          eq(memoryPlaces.source, 'legacy')
        )
      )
      .limit(1);

    if (existingPlace.length === 0) {
      await db.insert(memoryPlaces).values({
        memoryId: memory.id,
        placeType: placeType,
        weight: 1.0,
        source: 'legacy',
        isPrimary: true,
        reason: 'Backfilled from v1.4.x placeId',
      });
      placesCreated++;
    }
  }

  // 3. Process tags for ALL active memories
  const allMemories = await db
    .select({
      id: memories.id,
      tags: memories.tags,
    })
    .from(memories)
    .where(eq(memories.isActive, true));

  console.log(`Processing tags for ${allMemories.length} memories...`);

  for (const memory of allMemories) {
    if (!memory.tags || !Array.isArray(memory.tags) || memory.tags.length === 0) {
      continue;
    }

    for (const rawTag of memory.tags) {
      const normalizedTag = normalizeTag(rawTag);
      
      if (normalizedTag.length === 0) {
        continue; // Skip empty tags after normalization
      }

      // Check if tag already exists
      const existingTag = await db
        .select()
        .from(memoryTags)
        .where(
          and(
            eq(memoryTags.memoryId, memory.id),
            eq(memoryTags.tag, normalizedTag)
          )
        )
        .limit(1);

      if (existingTag.length === 0) {
        await db.insert(memoryTags).values({
          memoryId: memory.id,
          tag: normalizedTag,
          source: 'legacy',
          confidence: 1.0, // Legacy tags are considered certain
        });
        tagsCreated++;
      }
    }
  }

  console.log('v1.5.0 backfill complete:', {
    memoriesUpdated,
    placesCreated,
    tagsCreated,
  });

  return { memoriesUpdated, placesCreated, tagsCreated };
}

// Run if executed directly
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  backfillV1_5_0()
    .then((result) => {
      console.log('Backfill finished:', result);
      process.exit(0);
    })
    .catch((error) => {
      console.error('Backfill failed:', error);
      process.exit(1);
    });
}
