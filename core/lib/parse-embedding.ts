/**
 * Parse embedding from various storage formats.
 * Converted from 4 locations: hybrid-search.ts, consolidation.ts, memories.ts, entity-deduplicator.ts
 * 
 * @param embeddingData - Input in Float32Array, Buffer, Uint8Array, JSON string, or Array format
 * @returns Array of numbers or null if parsing fails
 */
export function parseEmbedding(embeddingData: unknown): number[] | null {
  if (!embeddingData) return null;

  // Handle Array directly (most common case)
  if (Array.isArray(embeddingData)) {
    return embeddingData;
  }

  // Handle Float32Array directly
  if (embeddingData instanceof Float32Array) {
    return Array.from(embeddingData);
  }

  // Handle Uint8Array and Buffer - try JSON first, then binary Float32
  if (embeddingData instanceof Uint8Array || Buffer.isBuffer(embeddingData)) {
    // Try to parse as JSON string first
    try {
      const json = JSON.parse(embeddingData.toString());
      if (Array.isArray(json)) {
        return json;
      }
    } catch {
      // Not JSON, try binary Float32
    }

    // Try to parse as binary Float32Array
    try {
      const buffer = embeddingData.buffer;
      const arrayBuffer = buffer instanceof ArrayBuffer
        ? buffer
        : (buffer as unknown as ArrayBuffer);
      const floatArray = new Float32Array(arrayBuffer);
      return Array.from(floatArray);
    } catch {
      return null;
    }
  }

  // Handle JSON string
  if (typeof embeddingData === 'string') {
    try {
      const parsed = JSON.parse(embeddingData);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      return null;
    }
  }

  return null;
}