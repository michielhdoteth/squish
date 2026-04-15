/**
 * External Folder Integration
 * 
 * This module provides integration with external folder-based storage.
 * Currently a placeholder - not yet implemented.
 * 
 * To enable: set SQUISH_EXTERNAL_MEMORY_ENABLED=true and SQUISH_EXTERNAL_MEMORY_PATH=<path>
 */

// Placeholder - not yet implemented
export interface ExternalMemory {
  writeMemory(content: string): Promise<void>;
  toMarkdownFormat(record: any): string;
}

export function getExternalMemory(): ExternalMemory {
  throw new Error('External folder integration not yet implemented');
}