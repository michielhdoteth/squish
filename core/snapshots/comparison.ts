/**
 * Snapshot Comparison Operations
 * Functions for comparing and diffing snapshots
 */

import { getMemorySnapshot } from './retrieval.js';

export interface MemoryDiff {
  added?: string[];
  removed?: string[];
  changed?: Record<string, { from: unknown; to: unknown }>;
}

function calculateDiff(before: string, after: string): MemoryDiff {
  const beforeLines = before.split('\n');
  const afterLines = after.split('\n');

  const beforeSet = new Set(beforeLines);
  const afterSet = new Set(afterLines);

  const added = afterLines.filter(line => !beforeSet.has(line));
  const removed = beforeLines.filter(line => !afterSet.has(line));

  return {
    added: added.length > 0 ? added : undefined,
    removed: removed.length > 0 ? removed : undefined,
  };
}

export async function compareSnapshots(
  snapshotId1: string,
  snapshotId2: string
): Promise<{ diff: MemoryDiff; contextBefore: string; contextAfter: string }> {
  try {
    const snap1 = await getMemorySnapshot(snapshotId1);
    const snap2 = await getMemorySnapshot(snapshotId2);

    if (!snap1 || !snap2) {
      throw new Error('One or both snapshots not found');
    }

    return {
      diff: calculateDiff(snap1.content, snap2.content),
      contextBefore: snap1.content.substring(0, 200),
      contextAfter: snap2.content.substring(0, 200),
    };
  } catch (error) {
    console.error('[squish] Error comparing snapshots:', error);
    throw error;
  }
}