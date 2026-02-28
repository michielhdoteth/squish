# Go/No-Go and Rollback Protocol

## Go criteria

- MCP smoke workflow green (`mcp-launch-checks.yml`).
- MCP script tests all passing.
- Launch matrix has no critical failures.
- Verification command passes with reproducibility check.
- Security checklist complete and secrets rotation verified.

## No-Go triggers

- Any checksum/reproducibility mismatch in `verify-mcp`.
- Any install/bootstrap smoke failure.
- Any fallback policy bypass or unsafe command execution path.
- Any unresolved critical security finding.

## Rollback protocol

1. Restore previous release tag/package.
2. Restore previous generated artifact behavior in release docs.
3. Disable new installer/bootstrap scripts in release notes if needed.
4. Communicate rollback with impact + ETA.

## Day-1 monitoring

- Track verification failures (`verify-mcp`) in CI.
- Track install script errors by client target.
- Track fallback executionPath ratio (`mcp` vs `cli-fallback`).
- Track OpenClaw bootstrap failures and tool-check errors.
