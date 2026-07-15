/**
 * Base Media Extractor Interface
 *
 * All media extractors implement this interface.
 * Each extractor handles a specific media category (image, audio, video, document).
 */

import type { MediaCategory, ProcessedMedia } from '../types.js';

export interface MediaExtractor {
  /** The media category this extractor handles */
  category: MediaCategory;

  /** Can this extractor handle the given MIME type? */
  canHandle(mimeType: string): boolean;

  /** Extract text/content from the media file */
  extract(filePath: string, mimeType: string): Promise<ProcessedMedia>;
}
