/**
 * Document Extractor
 *
 * Extracts text from documents: plain text, markdown, JSON, CSV, XML, YAML.
 * PDF extraction requires a PDF parsing library (pdf-parse or pdfjs-dist).
 */

import { readFile } from 'fs/promises';
import { logger } from '../../logger.js';
import type { MediaExtractor, ProcessedMedia } from '../types.js';

interface ExtractResult {
  text: string;
  metadata: Record<string, unknown>;
}

/** MIME types this extractor can handle */
const HANDLED_MIMES = new Set([
  'text/plain',
  'text/markdown',
  'text/csv',
  'text/tab-separated-values',
  'text/html',
  'text/yaml',
  'application/json',
  'application/jsonl',
  'application/xml',
  'application/toml',
  'application/rtf',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

/** Extract plain text from various text-based formats */
async function extractTextContent(
  filePath: string,
  mimeType: string,
): Promise<ExtractResult> {
  const raw = await readFile(filePath, 'utf-8').catch(() => null);

  // If file couldn't be read as UTF-8, try as binary (PDF, DOCX, etc.)
  if (raw === null) {
    return extractBinaryDocument(filePath, mimeType);
  }

  const metadata: Record<string, unknown> = { mimeType };

  switch (mimeType) {
    case 'text/plain':
    case 'text/markdown':
    case 'text/html':
    case 'text/yaml':
    case 'application/xml':
    case 'application/toml':
    case 'application/rtf':
      return { text: raw, metadata };

    case 'application/json':
      try {
        JSON.parse(raw);
        metadata.parsed = true;
      } catch {
        metadata.parsed = false;
      }
      return { text: raw, metadata };

    case 'application/jsonl': {
      const lines = raw.split('\n').filter(Boolean);
      metadata.lineCount = lines.length;
      return { text: raw, metadata };
    }

    case 'text/csv': {
      const lines = raw.split('\n').filter(Boolean);
      metadata.rowCount = lines.length;
      if (lines.length > 0) {
        metadata.headers = lines[0].split(',').map((h) => h.trim());
      }
      return { text: raw, metadata };
    }

    case 'text/tab-separated-values': {
      const lines = raw.split('\n').filter(Boolean);
      metadata.rowCount = lines.length;
      if (lines.length > 0) {
        metadata.headers = lines[0].split('\t').map((h) => h.trim());
      }
      return { text: raw, metadata };
    }

    default:
      return { text: raw, metadata };
  }
}

/** Extract text from binary document formats (PDF, DOCX, etc.) */
async function extractBinaryDocument(
  filePath: string,
  mimeType: string,
): Promise<ExtractResult> {
  const metadata: Record<string, unknown> = { mimeType };

  // Try PDF extraction
  if (mimeType === 'application/pdf') {
    try {
      const pdfParse = (await import('pdf-parse' as string)).default;
      const buffer = await readFile(filePath);
      const result = await pdfParse(buffer);
      metadata.pages = result.numpages;
      metadata.info = result.info;
      return { text: result.text, metadata };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.debug(`PDF extraction failed: ${msg}`);
      return { text: '', metadata };
    }
  }

  // For other binary formats, return empty (no extraction possible)
  return { text: '', metadata };
}

export const documentExtractor: MediaExtractor = {
  category: 'document',

  canHandle(mimeType: string): boolean {
    return HANDLED_MIMES.has(mimeType);
  },

  async extract(filePath: string, mimeType: string): Promise<ProcessedMedia> {
    const { text, metadata } = await extractTextContent(filePath, mimeType);

    return {
      textContent: text,
      description: `Document: ${filePath.split('/').pop() ?? filePath} (${mimeType})`,
      metadata,
    };
  },
};
