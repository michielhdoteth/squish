/**
 * Image Extractor
 *
 * Extracts descriptions from images using LLM vision capabilities.
 * Generates embeddings via Google Multimodal when available.
 */

import { readFile } from 'fs/promises';
import { logger } from '../../logger.js';
import type { MediaExtractor, ProcessedMedia } from '../types.js';

// Lazy imports to avoid circular deps
let callLLMWithContent: ((opts: any) => Promise<string | null>) | null = null;

async function loadLLMClient() {
  if (!callLLMWithContent) {
    try {
      const mod = await import('../../llm/client.js');
      callLLMWithContent = mod.callLLMWithContent;
    } catch {
      // LLM not available
    }
  }
  return callLLMWithContent;
}

export const imageExtractor: MediaExtractor = {
  category: 'image',

  canHandle(mimeType: string): boolean {
    return mimeType.startsWith('image/');
  },

  async extract(filePath: string, mimeType: string): Promise<ProcessedMedia> {
    const buffer = await readFile(filePath);
    const base64 = buffer.toString('base64');

    // 1. LLM vision description (optional — returns empty string if unavailable)
    let description = '';
    const llm = await loadLLMClient();
    if (llm) {
      try {
        const result = await llm({
          prompt: 'Describe this image in detail. Focus on: what it shows, any text visible, key elements, colors, and context. Be specific and factual.',
          contentParts: [
            { type: 'image', mediaType: mimeType, data: base64 },
          ],
          maxTokens: 500,
          temperature: 0.1,
        });
        description = result ?? '';
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.debug(`Image LLM description failed: ${msg}`);
      }
    }

    // 2. Try Google Multimodal embedding (optional)
    let embedding: number[] | undefined;
    try {
      const { getGoogleMultimodalEmbedding } = await import(
        '../../embeddings/google-multimodal.js'
      );
      const embedResult = await getGoogleMultimodalEmbedding({ image: buffer });
      embedding = embedResult?.embedding;
    } catch {
      // Google Multimodal not available — that's fine
    }

    // 3. Basic image metadata
    const metadata: Record<string, unknown> = {
      size: buffer.length,
      mimeType,
    };

    // Try to get dimensions if sharp is available
    try {
      const sharp = (await import('sharp')).default;
      const info = await sharp(buffer).metadata();
      if (info.width) metadata.width = info.width;
      if (info.height) metadata.height = info.height;
      if (info.format) metadata.format = info.format;
    } catch {
      // sharp not available — skip dimensions
    }

    return {
      textContent: description,
      description,
      metadata,
      embedding,
    };
  },
};
