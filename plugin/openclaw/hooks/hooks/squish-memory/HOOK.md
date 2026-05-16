# Squish Memory Hook

Injects Squish memory context on session start and captures important context on session end.

## Events

- `session.start`: Loads recent project memories from Squish
- `session.idle`: Captures important context before idle
- `session.end`: Saves session summary to Squish

## Configuration

Enable in your OpenClaw config:
```json
{
  "hooks": {
    "internal": {
      "entries": {
        "squish-memory": { "enabled": true }
      }
    }
  }
}
```

Or install via CLI:
```bash
openclaw hooks install @squish-memory/hooks
openclaw hooks enable squish-memory
```

## Handler

The handler (`handler.ts`) runs on session lifecycle events.
It calls the `squish` CLI to inject and capture memories.
