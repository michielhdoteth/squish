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
/**
 * Main backfill function
 */
export declare function backfillV1_5_0(): Promise<{
    memoriesUpdated: number;
    placesCreated: number;
    tagsCreated: number;
}>;
//# sourceMappingURL=backfill-v1.5.0.d.ts.map