# Remote Memory Operations

This document defines how Squish handles memory in remote mode for launch.

## Memory handling model

- **Write path**: tool call (`remember`/`observe`) -> validation -> secret filtering -> embedding -> persistence.
- **Read path**: query (`search`/`context`/`recall`) -> hybrid retrieval (BM25 + semantic) -> ranking -> visibility filter.
- **Lifecycle**: hot -> warm -> cold archive tiers with decay and optional merge governance.

## Isolation and tenancy

- Default visibility is `private`.
- Cross-user leakage is blocked by project/user scoping.
- Shared context uses explicit `project` visibility.

## Storage in remote mode

- Primary DB: PostgreSQL (`DATABASE_URL`).
- Queue/cache: Redis (`REDIS_URL`).
- Embeddings provider can be local, OpenAI, or Ollama by config.

## Auth and access control

- Token-first remote auth (`SQUISH_REMOTE_TOKEN`).
- OAuth-capable secondary path for browser-managed onboarding.
- CLI/OpenClaw default to token path.

## Operational safety

- Run preflight before deploy:

```bash
node scripts/remote-preflight.mjs
```

- Validate MCP artifacts:

```bash
node scripts/generate-mcp.mjs
node scripts/verify-mcp.mjs
```

## Backups and recovery

- Enable daily PostgreSQL backups and point-in-time restore.
- Keep merge snapshots and audit trails for recovery.
- Use rollback protocol from `docs/GO-NO-GO-ROLLBACK.md` for release incidents.
