import { describe, expect, it } from 'bun:test';
import { resolveProjectScope } from '../../core/runtime/trust-state.js';

describe('trust-state', () => {
  it('marks explicit project paths as explicit', async () => {
    const scope = await resolveProjectScope(process.cwd());
    expect(scope.currentProject.path).toBe(process.cwd());
    expect(['explicit', 'auto-created']).toContain(scope.currentProject.resolution);
  });
});
