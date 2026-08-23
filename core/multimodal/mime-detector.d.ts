/**
 * MIME Type Detector
 *
 * Maps file extensions to MIME types and media categories.
 * Supports 27+ file types across images, audio, video, and documents.
 */
import type { MediaCategory } from './types.js';
/**
 * Detect MIME type and media category from a file path.
 */
export declare function detectMimeType(filePath: string): {
    mime: string;
    category: MediaCategory;
};
/**
 * Check if a file extension is a known media type (not 'other').
 */
export declare function isKnownMediaType(filePath: string): boolean;
/**
 * Get all supported file extensions.
 */
export declare function getSupportedExtensions(): string[];
//# sourceMappingURL=mime-detector.d.ts.map