/**
 * Singleton event bus for core modules.
 *
 * Import this in any core module to emit events:
 *   import { eventBus } from '../event-bus.js';
 *   eventBus.emit({ type: 'memory:stored', payload: { ... } });
 *
 * The bus is a DefaultEventBus from the SDK. Handlers are registered
 * by the MCP server, CLI, or any consumer that imports the SDK.
 */
import { DefaultEventBus } from '../packages/sdk/src/events/event-bus.js';
import type { SquishEvent } from '../packages/sdk/src/interfaces/events.js';

export const eventBus = new DefaultEventBus();

/**
 * Convenience emitter that swallows errors (fire-and-forget).
 */
export function emit(event: SquishEvent): void {
  try {
    eventBus.emit(event);
  } catch {
    // Event handlers should never crash the caller
  }
}
