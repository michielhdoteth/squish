import { describe, expect, test } from 'bun:test';
import { mergeHookEvents, removeHookEvents } from '../../bin/installer-core.mjs';

describe('installer hook event merge helpers', () => {
  describe('mergeHookEvents', () => {
    test('unwraps the template outer "hooks" key (no double-nest)', () => {
      const template = {
        hooks: {
          'session.start': [{ matcher: '*', hooks: [{ type: 'prompt', prompt: 'hi' }] }],
          'session.idle': [{ matcher: '*', hooks: [{ type: 'command', command: 'save.sh' }] }],
        },
      };

      const merged = mergeHookEvents(undefined, template);

      // The merged object must be a flat event map, NOT wrapped again.
      // Note: event names contain dots, so we MUST use bracket-notation paths
      // in toHaveProperty (string paths get parsed as nested keys).
      expect(merged).not.toHaveProperty(['hooks']);
      expect(merged).toHaveProperty(['session.start']);
      expect(merged).toHaveProperty(['session.idle']);
      expect(merged['session.start']).toEqual(template.hooks['session.start']);
      expect(merged['session.idle']).toEqual(template.hooks['session.idle']);
    });

    test('preserves user-defined hook events not in the template', () => {
      const template = {
        hooks: {
          'session.start': [{ matcher: '*', hooks: [{ type: 'prompt', prompt: 'squish' }] }],
        },
      };
      const existing = {
        'session.created': [{ matcher: '*', hooks: [{ type: 'prompt', prompt: 'user-defined' }] }],
        'session.idle': [{ matcher: '*', hooks: [{ type: 'command', command: 'user.sh' }] }],
      };

      const merged = mergeHookEvents(existing, template);

      // User-defined events that the template does NOT define must survive untouched.
      expect(merged).toHaveProperty(['session.created']);
      expect(merged).toHaveProperty(['session.idle']);
      expect(merged['session.created']).toEqual(existing['session.created']);
      expect(merged['session.idle']).toEqual(existing['session.idle']);
      // Template events are present.
      expect(merged['session.start']).toEqual(template.hooks['session.start']);
    });

    test('template value wins for events it defines (no per-event deep-merge yet)', () => {
      // This is the documented behavior: the template's value for an event
      // replaces whatever the user had for that event. Preserving user
      // matchers within a squish-managed event is a separate concern that
      // would need a richer helper. For now, document the behavior with a test.
      const template = {
        hooks: {
          'session.start': [{ matcher: '*', hooks: [{ type: 'prompt', prompt: 'squish' }] }],
        },
      };
      const existing = {
        'session.start': [{ matcher: '*', hooks: [{ type: 'prompt', prompt: 'user-wins?' }] }],
      };

      const merged = mergeHookEvents(existing, template);
      expect(merged['session.start']).toEqual(template.hooks['session.start']);
    });

    test('handles null/missing/array inputs defensively', () => {
      expect(mergeHookEvents(null, null)).toEqual({});
      expect(mergeHookEvents(undefined, undefined)).toEqual({});
      expect(mergeHookEvents(null, { hooks: { 'session.start': [] } })).toEqual({
        'session.start': [],
      });
      expect(mergeHookEvents({ a: 1 }, null)).toEqual({ a: 1 });
      expect(mergeHookEvents([], { hooks: { a: 1 } })).toEqual({ a: 1 });
      expect(mergeHookEvents({ a: 1 }, { hooks: [] })).toEqual({ a: 1 });
    });
  });

  describe('removeHookEvents', () => {
    test('removes only template-defined event keys, preserves user-defined events', () => {
      const template = {
        hooks: {
          'session.start': [],
          'session.idle': [],
          'session.stop': [],
        },
      };
      const existing = {
        'session.start': [{ matcher: '*', hooks: [{ type: 'prompt', prompt: 'squish' }] }],
        'session.idle': [{ matcher: '*', hooks: [{ type: 'command', command: 'save.sh' }] }],
        'session.stop': [{ matcher: '*', hooks: [{ type: 'command', command: 'save.sh' }] }],
        'session.created': [{ matcher: '*', hooks: [{ type: 'prompt', prompt: 'user-defined' }] }],
        'tool.execute.before': [{ matcher: '*', hooks: [{ type: 'command', command: 'user.sh' }] }],
      };

      const remaining = removeHookEvents(existing, template);

      expect(remaining).not.toBeNull();
      // Squish-managed events are gone.
      expect(remaining).not.toHaveProperty(['session.start']);
      expect(remaining).not.toHaveProperty(['session.idle']);
      expect(remaining).not.toHaveProperty(['session.stop']);
      // User-defined events survive.
      expect(remaining).toHaveProperty(['session.created']);
      expect(remaining).toHaveProperty(['tool.execute.before']);
      expect(remaining!['session.created']).toEqual(existing['session.created']);
      expect(remaining!['tool.execute.before']).toEqual(existing['tool.execute.before']);
    });

    test('returns null when removing the template leaves an empty object', () => {
      const template = {
        hooks: {
          'session.start': [],
          'session.idle': [],
        },
      };
      const existing = {
        'session.start': [{ matcher: '*', hooks: [] }],
        'session.idle': [{ matcher: '*', hooks: [] }],
      };

      const remaining = removeHookEvents(existing, template);
      expect(remaining).toBeNull();
    });

    test('returns null defensively for null/missing/array inputs', () => {
      expect(removeHookEvents(null, null)).toBeNull();
      expect(removeHookEvents(undefined, undefined)).toBeNull();
      expect(removeHookEvents([], null)).toBeNull();
      expect(removeHookEvents('not-an-object', null)).toBeNull();
    });

    test('returns the existing object unchanged when template has no event keys', () => {
      const template = { hooks: {} };
      const existing = {
        'session.created': [{ matcher: '*', hooks: [] }],
        'tool.execute.before': [{ matcher: '*', hooks: [] }],
      };

      const remaining = removeHookEvents(existing, template);
      expect(remaining).toEqual(existing);
    });
  });
});
