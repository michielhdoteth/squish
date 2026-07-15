/**
 * Multimodal Type Definitions
 *
 * Shared types for the multimodal ingestion pipeline.
 */

export type MediaCategory = 'image' | 'audio' | 'video' | 'document' | 'other';

// Re-export MediaExtractor from base for convenience
export type { MediaExtractor } from './extractors/base.js';

export interface MediaFile {
  id: string;
  projectId: string | null;
  memoryId: string | null;
  filePath: string;
  fileName: string;
  mimeType: string;
  mediaCategory: MediaCategory;
  fileSize: number;
  textContent: string | null;
  description: string | null;
  transcript: string | null;
  embeddingJson: string | null;
  embedding: Buffer | null;
  metadata: Record<string, unknown>;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProcessedMedia {
  /** Extracted text content (OCR, speech-to-text, PDF parse, etc.) */
  textContent: string;
  /** LLM-generated description of the media */
  description: string;
  /** For audio/video: speech-to-text output */
  transcript?: string;
  /** Media-specific metadata (dimensions, duration, pages, etc.) */
  metadata: Record<string, unknown>;
  /** Generated embedding vector */
  embedding?: number[];
}

export interface IngestResult {
  mediaFileId: string;
  memoryId: string;
  status: 'success' | 'partial' | 'failed';
  textExtracted: boolean;
  embeddingGenerated: boolean;
}
