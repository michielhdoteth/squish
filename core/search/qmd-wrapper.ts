import { getQMDClient, type QMDSearchResult } from '../embeddings/qmd-client.js';

export type { QMDSearchResult };

export interface QMDStatus {
  indexHealth: string;
  documentCount: number;
  collections?: Array<{
    name: string;
    path: string;
    documentCount: number;
  }>;
}

export async function isAvailable(): Promise<boolean> {
  const client = await getQMDClient();
  return client.isAvailable();
}

export async function search(
  query: string,
  options: { collection?: string; limit?: number; minScore?: number } = {}
): Promise<QMDSearchResult[]> {
  const client = await getQMDClient();
  if (!(await client.isAvailable())) return [];
  return client.search({ query, ...options });
}

export async function vsearch(
  query: string,
  options: { collection?: string; limit?: number; minScore?: number } = {}
): Promise<QMDSearchResult[]> {
  const client = await getQMDClient();
  if (!(await client.isAvailable())) return [];
  return client.vsearch({ query, ...options });
}

export async function query(
  queryText: string,
  options: { collection?: string; limit?: number; minScore?: number } = {}
): Promise<QMDSearchResult[]> {
  const client = await getQMDClient();
  if (!(await client.isAvailable())) return [];
  return client.query({ query: queryText, ...options });
}

export async function get(
  pathOrDocid: string,
  options: { full?: boolean; maxBytes?: number } = {}
): Promise<string> {
  const client = await getQMDClient();
  if (!(await client.isAvailable())) return '';
  return client.get({ pathOrDocid, ...options });
}

export async function status(): Promise<QMDStatus | null> {
  const client = await getQMDClient();
  if (!(await client.isAvailable())) return null;
  const result = await client.status();
  if (!result) return null;

  return {
    indexHealth: result.indexHealth,
    documentCount: result.collections.reduce((sum, collection) => sum + collection.documentCount, 0),
    collections: result.collections,
  };
}

export async function embed(): Promise<number[] | null> {
  return null;
}

export async function ensureWikiDir(projectPath: string): Promise<string> {
  const { join } = await import('path');
  const { mkdirSync, existsSync } = await import('fs');
  const wikiDir = join(projectPath, '.squish', 'wiki');
  if (!existsSync(wikiDir)) mkdirSync(wikiDir, { recursive: true });
  return wikiDir;
}

export async function close(): Promise<void> {
  const client = await getQMDClient();
  await client.disconnect();
}
