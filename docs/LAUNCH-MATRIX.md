# Launch Verification Matrix

Status legend: PASS, FAIL, BLOCKED

## Client x Mode x Auth

| Client | Mode | Auth | MCP Path | CLI Fallback | Status |
| --- | --- | --- | --- | --- | --- |
| claude-code | local | n/a | PASS | PASS | PASS |
| opencode | local | n/a | PASS | PASS | PASS |
| codex | local | n/a | PASS | PASS | PASS |
| openclaw | local | token | PASS | PASS | PASS |
| claude-code | remote | token | PASS (config-level) | PASS | PASS |
| opencode | remote | token | PASS (config-level) | PASS | PASS |
| codex | remote | token | PASS (config-level) | PASS | PASS |
| openclaw | remote | token | PASS (config-level) | PASS | PASS |
| openclaw | remote | oauth | PASS (optional) | PASS | PASS |

## Evidence pointers

- `.sisyphus/evidence/task-4-generator-universal-verification.txt`
- `.sisyphus/evidence/task-5-installer-verification.txt`
- `.sisyphus/evidence/task-6-openclaw-bootstrap-verification.txt`
- `.sisyphus/evidence/task-7-verify-mcp-verification.txt`
- `.sisyphus/evidence/task-11-ci-workflow-verification.txt`
