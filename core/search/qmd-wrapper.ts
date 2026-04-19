/**
 * QMD Wrapper - Local search using @tobilu/qmd library
 * 
 * Provides BM25, semantic vector, and hybrid search over markdown files
 * Used for hot memory / wiki layer search
 */

import { createStore, type QMDStore, type SearchOptions, type QueryOptions } from '@tobilu/qmd';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { logger } from '../logger.js';
import { getProjectPath } from '../projects.js';

export interface QMDSearchResult {
  docid: string;
  path: string;
  title: string;
  context: string;
  score: number;
  snippet: string;
}

export interface QMDStatus {
  indexHealth: string;
  documentCount: number;
  collections: string[];
}

// Store instances per project
const storeInstances = new Map<string, QMDStore>();

/**
 * Get or create QMD store for a project
 */
async function getStore(projectPath: string): Promise<QMDStore | null> {
  const cached = storeInstances.get(projectPath);
  if (cached) {
    return cached;
  }

  try {
    const store = await createStore({
      dbPath: join(projectPath, '.squish', 'qmd-index.sqlite'),
      config: {
        collections: {
          wiki: {
            includeByDefault: true,
            paths: [join(projectPath, '.squish', 'wiki')],
          },
          hot: {
            includeByDefault: true,
            paths: [join(projectPath, '.squish')],
          },
        },
      },
    });
    storeInstances.set(projectPath, store);
    return store;
  } catch (error) {
    logger.warn('[QMD] Failed to create store', { projectPath, error });
    return null;
  }
}

/**
 * Check if QMD is available for a project
 */
export async function isAvailable(projectPath?: string): Promise<boolean> {
  try {
    const path = projectPath || await getProjectPath();
    if (!path) return false;
    
    const store = await getStore(path);
    return store !== null;
  } catch {
    return false;
  }
}

/**
 * BM25 keyword search
 */
export async function search(
  query: string,
  options?: {
    projectPath?: string;
    limit?: number;
    collection?: string;
    minScore?: number;
  }
): Promise<QMDSearchResult[]> {
  const path = options?.projectPath || await getProjectPath();
  if (!path) return [];

  const store = await getStore(path);
  if (!store) return [];

  const searchOptions: SearchOptions = {
    query,
    limit: options?.limit || 5,
    collection: options?.collection,
    minScore: options?.minScore,
  };

  try {
    const results = await store.search(searchOptions);
    return results.map((r: any) => ({
      docid: r.docid,
      path: r.path,
      title: r.title || r.path.split('/').pop() || 'Untitled',
      context: r.context || '',
      score: r.score || 0,
      snippet: r.snippet || r.context?.slice(0, 200) || '',
    }));
  } catch (error) {
    logger.warn('[QMD] Search failed', { query, error });
    return [];
  }
}

/**
 * Semantic vector search (requires embeddings)
 */
export async function vsearch(
  query: string,
  options?: {
    projectPath?: string;
    limit?: number;
    collection?: string;
  }
): Promise<QMDSearchResult[]> {
  const path = options?.projectPath || await getProjectPath();
  if (!path) return [];

  const store = await getStore(path);
  if (!store) return [];

  const searchOptions: SearchOptions = {
    query,
    limit: options?.limit || 5,
    collection: options?.collection,
  };

  try {
    const results = await store.search({ ...searchOptions, mode: 'vec' });
    return results.map((r: any) => ({
      docid: r.docid,
      path: r.path,
      title: r.title || r.path.split('/').pop() || 'Untitled',
      context: r.context || '',
      score: r.score || 0,
      snippet: r.snippet || r.context?.slice(0, 200) || '',
    }));
  } catch (error) {
    logger.warn('[QMD] Vector search failed', { query, error });
    return [];
  }
}

/**
 * Hybrid search with query expansion and reranking (recommended)
 */
export async function query(
  query: string,
  options?: {
    projectPath?: string;
    limit?: number;
    collection?: string;
  }
): Promise<QMDSearchResult[]> {
  const path = options?.projectPath || await getProjectPath();
  if (!path) return [];

  const store = await getStore(path);
  if (!store) return [];

  const queryOptions: QueryOptions = {
    query,
    limit: options?.limit || 5,
    collection: options?.collection,
  };

  try {
    const results = await store.query(queryOptions);
    return results.map((r: any) => ({
      docid: r.docid,
      path: r.path,
      title: r.title || r.path.split('/').pop() || 'Untitled',
      context: r.context || '',
      score: r.score || 0,
      snippet: r.snippet || r.context?.slice(0, 200) || '',
    }));
  } catch (error) {
    logger.warn('[QMD] Query failed', { query, error });
    return [];
  }
}

/**
 * Embed/re-index documents in a collection
 */
export async function embed(
  options?: {
    projectPath?: string;
    collection?: string;
    force?: boolean;
  }
): Promise<{ success: boolean; indexed: number }> {
  const path = options?.projectPath || await getProjectPath();
  if (!path) return { success: false, indexed: 0 };

  const store = await getStore(path);
  if (!store) return { success: false, indexed: 0 };

  try {
    // Re-index with embeddings
    await store.index({
      collection: options?.collection,
      force: options?.force,
    });
    return { success: true, indexed: 1 };
  } catch (error) {
    logger.warn('[QMD] Embed failed', { error });
    return { success: false, indexed: 0 };
  }
}

/**
 * Get document by path or docid
 */
export async function get(
  pathOrDocid: string,
  options?: {
    projectPath?: string;
    full?: boolean;
    maxBytes?: number;
  }
): Promise<string | null> {
  const path = options?.projectPath || await getProjectPath();
  if (!path) return null;

  const store = await getStore(path);
  if (!store) return null;

  try {
    const content = await store.getDocument(pathOrDocid, {
      full: options?.full,
      maxBytes: options?.maxBytes,
    });
    return content || null;
  } catch (error) {
    logger.warn('[QMD] Get failed', { pathOrDocid, error });
    return null;
  }
}

/**
 * Get index status
 */
export async function status(
  projectPath?: string
): Promise<QMDStatus | null> {
  const path = projectPath || await getProjectPath();
  if (!path) return null;

  const store = await getStore(path);
  if (!store) return null;

  try {
    const collections = await store.getDefaultCollectionNames();
    return {
      indexHealth: 'healthy',
      documentCount: collections.length,
      collections,
    };
  } catch (error) {
    logger.warn('[QMD] Status failed', { error });
    return null;
  }
}

/**
 * Ensure wiki directory exists
 */
export async function ensureWikiDir(projectPath: string): Promise<string> {
  const wikiDir = join(projectPath, '.squish', 'wiki');
  if (!existsSync(wikiDir)) {
    mkdirSync(wikiDir, { recursive: true });
  }
  return wikiDir;
}

/**
 * Close store (cleanup)
 */
export async function close(projectPath?: string): Promise<void> {
  const path = projectPath || await getProjectPath();
  if (!path) return;

  const store = storeInstances.get(path);
  if (store) {
    await store.close();
    storeInstances.delete(path);
  }
}