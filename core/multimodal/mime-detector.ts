/**
 * MIME Type Detector
 *
 * Maps file extensions to MIME types and media categories.
 * Supports 27+ file types across images, audio, video, and documents.
 */

import { extname } from 'path';
import type { MediaCategory } from './types.js';

const MIME_MAP: Record<string, { mime: string; category: MediaCategory }> = {
  // Images
  '.jpg': { mime: 'image/jpeg', category: 'image' },
  '.jpeg': { mime: 'image/jpeg', category: 'image' },
  '.png': { mime: 'image/png', category: 'image' },
  '.gif': { mime: 'image/gif', category: 'image' },
  '.webp': { mime: 'image/webp', category: 'image' },
  '.svg': { mime: 'image/svg+xml', category: 'image' },
  '.bmp': { mime: 'image/bmp', category: 'image' },
  '.tiff': { mime: 'image/tiff', category: 'image' },
  '.tif': { mime: 'image/tiff', category: 'image' },
  '.ico': { mime: 'image/x-icon', category: 'image' },
  '.heic': { mime: 'image/heic', category: 'image' },
  '.heif': { mime: 'image/heif', category: 'image' },

  // Audio
  '.mp3': { mime: 'audio/mpeg', category: 'audio' },
  '.wav': { mime: 'audio/wav', category: 'audio' },
  '.ogg': { mime: 'audio/ogg', category: 'audio' },
  '.flac': { mime: 'audio/flac', category: 'audio' },
  '.m4a': { mime: 'audio/mp4', category: 'audio' },
  '.aac': { mime: 'audio/aac', category: 'audio' },
  '.wma': { mime: 'audio/x-ms-wma', category: 'audio' },
  '.opus': { mime: 'audio/opus', category: 'audio' },

  // Video
  '.mp4': { mime: 'video/mp4', category: 'video' },
  '.webm': { mime: 'video/webm', category: 'video' },
  '.avi': { mime: 'video/x-msvideo', category: 'video' },
  '.mov': { mime: 'video/quicktime', category: 'video' },
  '.mkv': { mime: 'video/x-matroska', category: 'video' },
  '.wmv': { mime: 'video/x-ms-wmv', category: 'video' },
  '.flv': { mime: 'video/x-flv', category: 'video' },

  // Documents
  '.pdf': { mime: 'application/pdf', category: 'document' },
  '.doc': { mime: 'application/msword', category: 'document' },
  '.docx': {
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    category: 'document',
  },
  '.xls': { mime: 'application/vnd.ms-excel', category: 'document' },
  '.xlsx': {
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    category: 'document',
  },
  '.ppt': { mime: 'application/vnd.ms-powerpoint', category: 'document' },
  '.pptx': {
    mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    category: 'document',
  },
  '.txt': { mime: 'text/plain', category: 'document' },
  '.md': { mime: 'text/markdown', category: 'document' },
  '.markdown': { mime: 'text/markdown', category: 'document' },
  '.csv': { mime: 'text/csv', category: 'document' },
  '.tsv': { mime: 'text/tab-separated-values', category: 'document' },
  '.json': { mime: 'application/json', category: 'document' },
  '.jsonl': { mime: 'application/jsonl', category: 'document' },
  '.xml': { mime: 'application/xml', category: 'document' },
  '.yaml': { mime: 'text/yaml', category: 'document' },
  '.yml': { mime: 'text/yaml', category: 'document' },
  '.toml': { mime: 'application/toml', category: 'document' },
  '.html': { mime: 'text/html', category: 'document' },
  '.htm': { mime: 'text/html', category: 'document' },
  '.rtf': { mime: 'application/rtf', category: 'document' },
};

/**
 * Detect MIME type and media category from a file path.
 */
export function detectMimeType(filePath: string): { mime: string; category: MediaCategory } {
  const ext = extname(filePath).toLowerCase();
  return MIME_MAP[ext] ?? { mime: 'application/octet-stream', category: 'other' };
}

/**
 * Check if a file extension is a known media type (not 'other').
 */
export function isKnownMediaType(filePath: string): boolean {
  return detectMimeType(filePath).category !== 'other';
}

/**
 * Get all supported file extensions.
 */
export function getSupportedExtensions(): string[] {
  return Object.keys(MIME_MAP);
}
