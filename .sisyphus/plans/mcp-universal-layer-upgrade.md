# MCP Universal Layer Upgrade

## TL;DR

> Replace profile-based MCP generation with a single universal config model, align runtime naming to `local` + `remote`, and ship installer/bootstrap/verification tooling with TDD and agent-executable QA.
>
> Deliverables:
> - One universal MCP artifact set in `generated/mcp/`
> - Installer + OpenClaw bootstrap + verification scripts
> - Docs migration from `team mode` to `remote mode`
> - Auth model: OAuth primary, token fallback for OpenClaw/CLI
>
> Estimated Effort: Large
> Parallel Execution: YES - 4 waves + final verification wave
> Critical Path: 1 -> 3 -> 6 -> 9 -> F1/F4
> Launch Target: Public launch readiness (no beta shortcuts)

---

## Context

### Original Request
User wants MCP to be universal (no profiles), improve quality to top-tier, and evolve runtime language from old `team mode` to `local` + `remote` while keeping OpenClaw usability strong.

### Interview Summary
- Confirmed: no profile variants, one universal config.
- Confirmed: 2 mode product model only: `local` and `remote`.
- Confirmed: remote auth preference is token-centric for OpenClaw users.
- Confirmed: TDD workflow required.
- Constraint: avoid subagent expansion; proceed from direct repo + web research.

### Research Findings
- MCP standard config centers on `mcpServers` entries with command/args/env.
- mcporter supports imports for broad client compatibility.
- OpenClaw memory integration depends on robust QMD/mcporter wiring and practical setup UX.
- Current repo already has OpenClaw gateway and dual DB runtime implementation.

### Competitor Analysis (Claude/OpenClaw memory ecosystem)
- **OpenClaw native memory (docs.openclaw.ai)**
  - Strength: file-first memory (`MEMORY.md` + daily logs), predictable and transparent.
  - Gap: retrieval quality can degrade at scale without stronger ranking/governance.
- **Supermemory (supermemory.ai + GitHub repos)**
  - Strength: universal memory positioning across clients, strong onboarding UX, plugin-led adoption.
  - Pattern to copy: one integration contract, fast install, auto-recall/auto-capture loop.
  - Tradeoff: hosted-first monetization model may not fit self-managed users.
- **mem0/self-hosted memory-server patterns (community guides)**
  - Strength: control and privacy for teams wanting own infra.
  - Tradeoff: setup complexity and ops burden.

**Strategic Position for Squish**
- Win on: `local + remote` duality, open deployment path, and universal MCP artifact contract.
- Differentiate with: deterministic generator, first-class OpenClaw bootstrap, and explicit token-first remote auth for CLI users.

### Feature Comparison Matrix

| Capability | Squish Target | OpenClaw Native | Supermemory | Mem0 MCP | Zep |
| --- | --- | --- | --- | --- | --- |
| Universal MCP artifact | Yes (single source) | Partial (memory-focused) | Yes (integration-led) | Yes (server-led) | Partial |
| Local-first mode | Yes | Yes | Limited | Yes | Yes |
| Remote mode | Yes (token-first) | N/A (core runtime) | Yes | Yes | Yes |
| OpenClaw bootstrap UX | Yes (planned) | Built-in memory only | Strong plugin UX | Indirect | Indirect |
| Deterministic generation + manifest | Yes (planned) | N/A | Not core focus | Not core focus | Not core focus |
| Verification CLI for CI | Yes (planned) | N/A | Unknown | Partial | Partial |
| Cross-client installer workflow | Yes (planned) | No | Strong | Moderate | Moderate |
| Deployment openness | High (local + remote) | High local | Hosted-first | Flexible | Cloud-centric |

### Positioning Statement

Squish is the market-ready universal memory integration layer for coding agents that combines a local-first developer experience with a remote-ready deployment path, using one deterministic MCP contract across Claude Code, OpenClaw, and other MCP clients. Unlike hosted-only memory products, Squish gives teams portability and control; unlike file-only memory defaults, Squish adds stronger retrieval wiring, bootstrap automation, and CI-verifiable reliability.

### GTM Hooks
- **Primary message**: "One MCP contract, everywhere. Local by default, remote when you need scale."
- **OpenClaw wedge**: token-first remote setup + QMD/bootstrap assistant.
- **Claude Code wedge**: zero-friction universal installer from generated artifact.
- **Trust signal**: deterministic outputs + verification script + migration safety checks.

### Metis Review (Applied)
- Locked guardrails against scope creep in hosting/platform rewrite.
- Added explicit migration checks for old profile directories and naming references.
- Added concrete acceptance and QA evidence requirements per task.

---

## Work Objectives

### Core Objective
Deliver a universal MCP layer that is client-agnostic, operationally reliable, and aligned to a product model of `local` and `remote` without profile fragmentation.

### Concrete Deliverables
- `config/mcp.json` no longer contains profile matrix.
- `scripts/generate-mcp.mjs` emits one artifact set + manifest.
- New installer script for client targets from universal artifact.
- New OpenClaw bootstrap helper with token-friendly remote setup.
- New verification script + reproducibility checks.
- Docs and examples migrated to local/remote terminology.

### Definition of Done
- [ ] Universal generation command produces one valid artifact set.
- [ ] Installer command configures each supported client from same artifact.
- [ ] OpenClaw bootstrap validates required tools and writes safe config merge.
- [ ] Verification command passes in CI and detects malformed artifacts.
- [ ] Documentation no longer uses `team mode` wording for product model.

### Must Have
- Single universal MCP output model.
- Two deployment modes in documentation and config semantics: local and remote.
- Remote auth defaults to OAuth-capable architecture with token fallback flow documented and supported.
- Controlled CLI fallback path: if MCP call path is unavailable, CLI may execute equivalent operation via bash wrapper with strict command allowlist.

### Must NOT Have
- No per-client profile forks in source of truth.
- No reintroduction of `openclaw/nanoclaw/picoclaw/default` output directories.
- No manual-only verification steps.

---

## Verification Strategy

> ZERO HUMAN INTERVENTION. All checks must be executable by agent commands/tools.

### Test Decision
- Infrastructure exists: YES
- Automated tests: TDD
- Framework: project-native Node/Bun test setup (new script tests added under existing test conventions)

### QA Policy
- Script tasks: run via Bash with deterministic assertions on files and JSON shape.
- OpenClaw tasks: validate config snippet content + command outcomes + safe merge behavior.
- Evidence path: `.sisyphus/evidence/task-{N}-{scenario}.txt` or `.json`

---

## Execution Strategy

### Parallel Execution Waves

Wave 1 (foundation + contracts):
- T1 Universal schema contract and migration map
- T2 Runtime naming model (`local`/`remote`) spec and compatibility matrix
- T3 Generator refactor test harness (RED tests first)
- T4 Auth contract for remote (`oauth` + `token` fallback)

Wave 2 (core implementation):
- T5 Implement universal generator + manifest
- T6 Implement client installer from universal artifact
- T7 Implement OpenClaw bootstrap helper
- T8 Implement verify script + reproducibility checks

Wave 3 (integration and migration):
- T9 Migrate old generated profile layout and compat warnings
- T10 Update docs/readme/env templates to local/remote model
- T11 CI integration for generate/verify/install smoke

Wave 4 (hardening):
- T12 End-to-end acceptance run across supported clients (local fixtures)

Critical Path: T1 -> T3 -> T5 -> T9 -> T12 -> F1/F4

### Dependency Matrix
- T1: blocked by none; blocks T5,T9,T10
- T2: blocked by none; blocks T10,T12
- T3: blocked by none; blocks T5,T8
- T4: blocked by none; blocks T6,T7,T10
- T5: blocked by T1,T3; blocks T6,T8,T9,T11,T12
- T6: blocked by T4,T5; blocks T11,T12
- T7: blocked by T4,T5; blocks T12
- T8: blocked by T3,T5; blocks T11,T12
- T9: blocked by T1,T5; blocks T12
- T10: blocked by T1,T2,T4; blocks T12
- T11: blocked by T5,T6,T8; blocks T12
- T12: blocked by T2,T5,T6,T7,T8,T9,T10,T11; blocks F1-F4

### Agent Dispatch Summary
- Wave 1: T1 quick, T2 writing, T3 quick, T4 unspecified-high
- Wave 2: T5 deep, T6 quick, T7 unspecified-high, T8 quick
- Wave 3: T9 deep, T10 writing, T11 quick
- Wave 4: T12 unspecified-high
- Final: F1 oracle, F2 unspecified-high, F3 unspecified-high, F4 deep

---

## TODOs

- [x] 1. Define universal MCP schema + migration contract (TDD)

  **What to do**:
  - Write failing tests for profile-removal behavior and single-artifact shape.
  - Define exact contract for `config/mcp.json` and `generated/mcp/*` outputs.
  - Add migration map from old profile directories to new flat output.

  **Market alignment implication**:
  - Ensures product claim "one MCP contract everywhere" is technically enforceable.

- [x] 2. Define `local` and `remote` mode semantics in config/docs (TDD)

  **What to do**:
  - Add failing tests for legacy naming rejection/alias handling.
  - Specify canonical naming and compatibility behavior.
  - Document mode behavior in one reference source.

  **Market alignment implication**:
  - Creates simple product language users can understand and buy into.

- [x] 3. Add remote auth contract (`oauth` capable, token fallback default path)

  **What to do**:
  - Add failing tests for token-required OpenClaw CLI path.
  - Define config fields and precedence for token vs oauth.
  - Add validation rules and actionable error messages.

  **Market alignment implication**:
  - Removes onboarding friction in OpenClaw-heavy adoption scenarios.

- [x] 4. Refactor `scripts/generate-mcp.mjs` to universal output + manifest

  **What to do**:
  - Implement strict validation, deterministic ordering, checksum manifest.
  - Remove profile directory generation path.
  - Preserve MCP/mcporter compatibility in single output.

  **Market alignment implication**:
  - Enables reliability story (reproducible, auditable artifacts).

- [x] 5. Implement `scripts/install-mcp.mjs` for supported clients

  **What to do**:
  - Build installer from one artifact source.
  - Support client path resolution + dry-run + backup behavior.
  - Add tests per client fixture.

  **Market alignment implication**:
  - Directly improves conversion by reducing setup time.

- [x] 6. Implement `scripts/openclaw-bootstrap.mjs`

  **What to do**:
  - Validate prerequisites (mcporter/qmd/path checks).
  - Merge/write OpenClaw memory snippet safely.
  - Add token-first remote setup helper output.

  **Market alignment implication**:
  - Competitive response to Supermemory/OpenClaw plugin UX expectations.

- [x] 7. Implement `scripts/verify-mcp.mjs` + reproducibility checks

  **What to do**:
  - Validate JSON schema and required fields.
  - Validate manifest checksums and deterministic regeneration.
  - Exit non-zero on any drift/failure.

  **Market alignment implication**:
  - Supports enterprise trust and CI gating requirements.

- [x] 8. Migrate existing generated layout and provide compatibility messaging

  **What to do**:
  - Remove/retire profile outputs in generation flow.
  - Add clear migration warnings and upgrade docs.
  - Ensure no silent breakage in installer paths.

  **Market alignment implication**:
  - Protects existing users during product transition.

- [x] 9. Update docs for market-ready positioning and adoption

  **What to do**:
  - Update README/docs from `team mode` to `remote mode`.
  - Add clear "local vs remote" quickstart paths.
  - Add competitor-aware differentiation copy (factual, non-hype).

  **Market alignment implication**:
  - Sharpens product narrative and reduces confusion in evaluation.

- [x] 10. Add env templates and secure defaults for onboarding

  **What to do**:
  - Provide `.env` templates for local and remote flows.
  - Include token variables and optional oauth placeholders.
  - Validate examples against installer/bootstrap behavior.

  **Market alignment implication**:
  - Cuts onboarding errors and support burden.

- [x] 11. Add CI workflow hooks for generation/verification/install smoke

  **What to do**:
  - Run generation and verify on PRs.
  - Run installer dry-run against fixtures.
  - Fail fast on nondeterminism.

  **Market alignment implication**:
  - Reinforces reliability promise for production buyers.

- [x] 12. Run end-to-end acceptance and produce launch evidence bundle

  **What to do**:
  - Execute scripted acceptance for all supported clients.
  - Capture evidence artifacts under `.sisyphus/evidence/`.
  - Produce concise release-readiness checklist.

  **Market alignment implication**:
  - Converts engineering completion into launch confidence.

- [x] 13. Add MCP-to-CLI fallback policy (bash bridge with guardrails)

  **What to do**:
  - Define fallback trigger conditions (MCP unreachable/timeouts/schema errors).
  - Implement CLI fallback only for approved Squish operations (`remember`, `search`, `recall`, `health`).
  - Enforce denylist for dangerous shell patterns and non-Squish commands.
  - Add telemetry flag in outputs: `executionPath: mcp|cli-fallback`.

  **Market alignment implication**:
  - Increases reliability under degraded MCP conditions without sacrificing security posture.

- [x] 14. Build launch-ready install UX (copy-paste quickstarts)

  **What to do**:
  - Add one-command examples for OpenClaw, Claude Code, OpenCode, Codex.
  - Add "MCP primary + CLI fallback" example blocks.
  - Add explicit expected outputs so users can self-verify setup.

  **Market alignment implication**:
  - Improves first-run success rate and reduces drop-off in evaluation.

- [x] 15. Add production safety + secrets hardening checklist

  **What to do**:
  - Document required env vars and forbidden defaults.
  - Add startup warnings for missing critical auth/token vars.
  - Add launch checklist item to rotate any exposed credentials.

  **Market alignment implication**:
  - Builds trust and avoids reputation risk at launch.

- [x] 16. Add launch verification matrix (client x mode x auth)

  **What to do**:
  - Validate local/remote across each client target.
  - Validate auth paths (token primary, oauth optional).
  - Validate MCP success path and CLI fallback path per client.

  **Market alignment implication**:
  - Proves cross-client reliability claim with hard evidence.

- [x] 17. Prepare launch package artifacts

  **What to do**:
  - Publish release notes with migration guide (profiles -> universal).
  - Add FAQ for common install/fallback issues.
  - Bundle evidence links from `.sisyphus/evidence/` for internal sign-off.

  **Market alignment implication**:
  - Converts technical completion into market-facing readiness.

- [x] 18. Go/No-Go gate and rollback protocol

  **What to do**:
  - Define explicit go/no-go thresholds (pass rate, critical bugs, setup success).
  - Define rollback path to previous generator/install behavior.
  - Add day-1 monitoring checklist and owner assignments.

  **Market alignment implication**:
  - Enables confident launch with controlled downside.

---

## Final Verification Wave

- [x] F1. Plan Compliance Audit (`oracle`)
  Verify every Must Have/Must NOT Have against files, generated outputs, and evidence artifacts.

- [x] F2. Code Quality Review (`unspecified-high`)
  Run type/lint/test and anti-slop checks over changed scripts/docs.

- [x] F3. Real QA Execution (`unspecified-high`)
  Execute all QA scenarios from T1-T12, gather evidence under `.sisyphus/evidence/final-qa/`.

- [x] F4. Scope Fidelity Check (`deep`)
  Confirm delivered changes match plan exactly with no out-of-scope creep.

---

## Commit Strategy

- C1: `refactor(mcp): collapse profile model into universal artifacts`
- C2: `feat(mcp): add installer bootstrap and verification scripts`
- C3: `docs(mcp): migrate to local remote model and auth guidance`

---

## Success Criteria

### Verification Commands
```bash
bun run scripts/generate-mcp.mjs
bun run scripts/verify-mcp.mjs
bun run scripts/install-mcp.mjs --client claude-code --dry-run
bun run scripts/openclaw-bootstrap.mjs --dry-run
```

### Final Checklist
- [x] Universal artifact generation is deterministic and validated.
- [x] Installer supports all target clients from one artifact source.
- [x] OpenClaw bootstrap supports token flow for remote setup.
- [x] Docs consistently use local/remote model.
- [x] All final verification agents approve.
- [x] Launch gate passed: client x mode x auth matrix complete with no critical failures.
- [x] Rollback protocol tested and documented.
