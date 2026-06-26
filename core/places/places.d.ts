/**
 * Places Module - Spatial memory organization
 *
 * Provides spatial "places" for memory organization:
 * - Inbox: New memories, unprocessed
 * - Ref: Reference, patterns, research
 * - WIP: Active work, implementations
 * - Sandbox: Experiments, tests
 * - Board: Decisions, planning, roadmap
 * - Sparks: Ideas, future concepts
 * - Archive: Completed, historical
 */
/**
 * Well-known project path for global scope
 * Used for places and rules that are global (not per-project)
 */
export declare const GLOBAL_PROJECT_PATH = "__squish_global__";
/**
 * Ensure the global project record exists
 */
export declare function ensureGlobalProject(): Promise<{
    id: string;
}>;
export type PlaceType = 'inbox' | 'ref' | 'wip' | 'sandbox' | 'board' | 'sparks' | 'archive';
export interface Place {
    id: string;
    projectId: string;
    name: string;
    placeType: PlaceType;
    parentId: string | null;
    sortOrder: number;
    positionX: number;
    positionY: number;
    description: string | null;
    purpose: string | null;
    memoryCount: number;
    createdAt: Date;
    updatedAt: Date;
}
export interface PlaceCreateInput {
    projectId?: string;
    name: string;
    placeType: PlaceType;
    parentId?: string | null;
    sortOrder?: number;
    description?: string;
    purpose?: string;
}
export interface PlaceUpdateInput {
    name?: string;
    description?: string;
    purpose?: string;
    sortOrder?: number;
    positionX?: number;
    positionY?: number;
}
export declare const DEFAULT_PLACES: Omit<PlaceCreateInput, 'projectId'>[];
/**
 * Create a new place.
 * If no projectId provided, uses the global project scope.
 */
export declare function createPlace(input: PlaceCreateInput): Promise<Place>;
/**
 * Get a place by ID
 */
export declare function getPlace(id: string): Promise<Place | null>;
/**
 * Get places, optionally filtered by project.
 * If no projectId is provided, returns global places.
 */
export declare function getProjectPlaces(projectId?: string): Promise<Place[]>;
/**
 * Get place by type for a project or global scope.
 */
export declare function getPlaceByType(projectId: string | undefined, placeType: PlaceType): Promise<Place | null>;
/**
 * Update a place
 */
export declare function updatePlace(id: string, input: PlaceUpdateInput): Promise<Place | null>;
/**
 * Delete a place
 */
export declare function deletePlace(id: string): Promise<boolean>;
/**
 * Initialize 7 default places in the global scope
 * These places are shared across all projects/profiles
 */
export declare function initializeGlobalPlaces(): Promise<Place[]>;
/**
 * Get places in the global scope
 */
export declare function getGlobalPlaces(): Promise<Place[]>;
/**
 * Initialize default 7 places for a project.
 * If no projectId is provided, initializes global places.
 */
export declare function initializeDefaultPlaces(projectId?: string): Promise<Place[]>;
/**
 * Get place by loci index
 */
export declare function getPlaceByLociIndex(projectId: string | undefined, sortOrder: number): Promise<Place | null>;
/**
 * Update memory count for a place
 */
export declare function updatePlaceMemoryCount(placeId: string): Promise<void>;
/**
 * Sync all place memory counts - recalculate counts for all places in a project
 * Useful for fixing counts after bulk operations or data recovery
 */
export declare function syncAllPlaceMemoryCounts(projectId?: string): Promise<void>;
//# sourceMappingURL=places.d.ts.map