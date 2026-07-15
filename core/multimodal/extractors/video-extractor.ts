/**
 * Video Extractor
 *
 * Extracts descriptions from videos using LLM vision capabilities.
 * Generates embeddings via Google Multimodal when available.
 * Extracts duration via ffprobe when available.
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

const VIDEO_MIMES = new Set([
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-msvideo',
  'video/x-matroska',
  'video/x-ms-wmv',
  'video/x-flv',
]);

export const videoExtractor: MediaExtractor = {
  category: 'video',

  canHandle(mimeType: string): boolean {
    return VIDEO_MIMES.has(mimeType) || mimeType.startsWith('video/');
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
          prompt:
            'Describe this video content. Focus on: what it shows, key scenes, any text visible, and context. Be specific and factual.',
          contentParts: [
            { type: 'video', mediaType: mimeType, data: base64 },
          ],
          maxTokens: 500,
          temperature: 0.1,
        });
        description = result ?? '';
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.debug(`Video LLM description failed: ${msg}`);
      }
    }

    // 2. Try Google Multimodal embedding (optional)
    let embedding: number[] | undefined;
    try {
      const { getGoogleMultimodalEmbedding } = await import(
        '../../embeddings/google-multimodal.js'
      );
      const embedResult = await getGoogleMultimodalEmbedding({ video: base64 });
      embedding = embedResult?.embedding;
    } catch {
      // Google Multimodal not available — that's fine
    }

    // 3. Basic video metadata
    const metadata: Record<string, unknown> = {
      size: buffer.length,
      mimeType,
    };

    // Try to get duration via ffprobe if available
    try {
      const { execFile } = await import('child_process');
      const { promisify } = await import('util');
      const execFileAsync = promisify(execFile);
      const { stdout } = await execFileAsync('ffprobe', [
        '-v', 'quiet',
        '-print_format', 'json',
        '-show_format',
        filePath,
      ]);
      const probe = JSON.parse(stdout);
      const duration = parseFloat(probe?.format?.duration);
      if (!Number.isNaN(duration)) {
        metadata.duration = duration;
      }
      const sizeStr = probe?.format?.size;
      if (sizeStr) {
        metadata.probeSize = parseInt(sizeStr, 10);
      }
    } catch {
      // ffprobe not available — skip duration
    }

    return {
      textContent: description,
      description,
      metadata,
      embedding,
    };
  },
};
