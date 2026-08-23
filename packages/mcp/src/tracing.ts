// In-memory tool-call tracing for the MCP server.
// Bounded ring buffer (~500 entries), zero external deps.
// Exposed via squish_stats action "traces".

export interface ToolTrace {
  tool: string;
  ok: boolean;
  durationMs: number;
  at: string;
}

const MAX_TRACES = 500;

const ring: ToolTrace[] = [];

// Aggregate counters (survive ring eviction)
const totals = { calls: 0, errors: 0 };
const byTool = new Map<string, { calls: number; errors: number; totalMs: number }>();

function record(entry: ToolTrace): void {
  ring.push(entry);
  if (ring.length > MAX_TRACES) {
    ring.shift();
  }

  totals.calls++;
  if (!entry.ok) totals.errors++;

  const agg = byTool.get(entry.tool) ?? { calls: 0, errors: 0, totalMs: 0 };
  agg.calls++;
  if (!entry.ok) agg.errors++;
  agg.totalMs += entry.durationMs;
  byTool.set(entry.tool, agg);
}

/**
 * Wrap a tool handler with tracing. Records tool name, duration ms, ok/error.
 */
export async function traceToolCall<T>(
  tool: string,
  fn: () => Promise<T>
): Promise<T> {
  const start = Date.now();
  let ok = true;
  try {
    return await fn();
  } catch (error) {
    ok = false;
    throw error;
  } finally {
    record({
      tool,
      ok,
      durationMs: Date.now() - start,
      at: new Date().toISOString(),
    });
  }
}

/**
 * Summary of recorded traces for squish_stats action "traces".
 */
export function getTraceSummary() {
  const perTool = Array.from(byTool.entries())
    .map(([tool, agg]) => ({
      tool,
      calls: agg.calls,
      errors: agg.errors,
      avgDurationMs: agg.calls > 0 ? Math.round(agg.totalMs / agg.calls) : 0,
    }))
    .sort((a, b) => b.calls - a.calls);

  return {
    totalCalls: totals.calls,
    totalErrors: totals.errors,
    bufferSize: ring.length,
    bufferMax: MAX_TRACES,
    perTool,
    recent: ring.slice(-20).reverse(),
  };
}
