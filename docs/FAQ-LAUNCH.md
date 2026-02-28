# Launch FAQ

## Is Squish profile-based?

No. Squish now uses one universal MCP contract.

## What if MCP fails during runtime?

Use controlled CLI fallback via `scripts/squish-fallback.mjs` for allowed operations (`remember`, `search`, `recall`, `health`).

## Can OpenClaw use Squish?

Yes. Use `scripts/openclaw-bootstrap.mjs` and token-first remote auth where needed.

## Does Squish support local and remote deployments?

Yes. Local mode is SQLite-first; remote mode uses PostgreSQL/Redis.

## Which package should users install?

`npm install -g squish-memory` (or Bun alternative).
