# MCP Mode Model

Squish MCP uses two deployment modes only:

- `local`: run memory and MCP services on the same machine.
- `remote`: connect to a remote Squish service endpoint.

Legacy `team` mode naming is deprecated and mapped to `remote` during upgrade windows.

Remote auth supports both OAuth-capable flows and token flows.

- Default for CLI clients (including OpenClaw): token (`SQUISH_REMOTE_TOKEN`).
- OAuth remains supported for browser-capable managed onboarding.
- Method precedence for CLI flows: token first, OAuth fallback.
