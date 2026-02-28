# Competitive Positioning Plan - Squish vs Memory Market

## TL;DR

> **Position Squish as the local-first, privacy-focused alternative** to SaaS-heavy competitors. Differentiate on: CLI fallback, OpenClaw native, deterministic artifacts, and zero recurring cost for local mode.
>
> **Deliverables:**
> - Competitive analysis documentation
> - Positioning statements and GTM hooks
> - Feature parity roadmap
> - Quick wins for immediate differentiation
>
> **Estimated Effort:** Medium
> **Parallel Execution:** YES - 3 waves
> **Critical Path:** T1 -> T3 -> T5 -> F1

---

## Context

### Original Request
User wants comprehensive competitive analysis against the memory market, specifically Supermemory AI and Claude-mem, to position Squish for launch.

### Competitor Profiles

#### COMPETITOR 1: Claude-mem (thedotmack)

| Metric | Value |
|--------|-------|
| **GitHub Stars** | 31,800 |
| **Forks** | 2,200 |
| **Contributors** | 66 |
| **License** | AGPL-3.0 |
| **Latest Version** | v10.5.2 |
| **Releases** | 209 |
| **Homepage** | claude-mem.ai |
| **Docs** | docs.claude-mem.ai |

**Key Features:**
- 5 lifecycle hooks (SessionStart, UserPromptSubmit, PostToolUse, Stop, SessionEnd)
- Worker service on port 37777 with web viewer UI
- SQLite + ChromaDB hybrid search
- Progressive disclosure (3-layer: search -> timeline -> get_observations)
- OpenClaw gateway integration
- AI-powered compression with Claude Agent SDK
- Before/after context for observations
- File & concept scoping
- 22 language translations
- Token-efficient index (~50-100 tokens/result)

**Architecture:**
- TypeScript + Bun runtime
- SQLite for storage
- ChromaDB for vector search
- HTTP API + WebSocket
- MCP tools for search

#### COMPETITOR 2: Supermemory AI

| Metric | Value |
|--------|-------|
| **GitHub Stars** | 16,700 (main) + 2,300 (Claude plugin) |
| **Forks** | 1,700 |
| **Contributors** | 65+ |
| **License** | MIT |
| **Homepage** | supermemory.ai |
| **Twitter** | 20k followers |

**Pricing:**
- Free: $0/mo - 1M tokens, 10K queries
- Pro: $19/mo - 3M tokens, 100K queries
- Scale: $399/mo - 80M tokens, 20M queries
- Enterprise: Custom
- Overages: $0.01/1K tokens, $0.10/1K queries

**Key Features:**
- Knowledge graph memory
- Built-in reranking
- Browser extension (Chrome, Raycast)
- Multi-platform SDKs (Python, TypeScript, OpenAI middleware)
- Startup program ($1,000 credits for 6 months)
- 5 billion tokens/day capacity
- Cloudflare Durable Objects
- Hosted-first SaaS

### Research Findings

**Market Leaders by Stars:**
1. Claude-mem: 31.8k stars - Claude Code specific, AGPL
2. Supermemory: 16.7k stars - Universal memory, SaaS-first
3. Squish: ~50-100 stars - Local-first, MIT

**Market Positioning:**
- Claude-mem = "Your AI's note-taking sidekick" (Claude Code specific)
- Supermemory = "Universal Memory API for AI apps" (SaaS-first)
- Squish = "Universal MCP Memory Layer" (Local-first, remote optional)

---

## Work Objectives

### Core Objective
Create comprehensive competitive positioning documentation and actionable roadmap to differentiate Squish in the crowded AI memory market.

### Concrete Deliverables
- `docs/COMPETITIVE-ANALYSIS.md` - Full competitor comparison
- `docs/POSITIONING.md` - Positioning statements and GTM hooks
- `README.md` updates - Competitive differentiation section
- Feature parity checklist with priority rankings

### Definition of Done
- [ ] Competitive analysis documents all major competitors
- [ ] Positioning clearly differentiates Squish from Claude-mem and Supermemory
- [ ] README includes "Why Squish vs alternatives" section
- [ ] Feature roadmap prioritizes competitive gaps

### Must Have
- Accurate competitor data (verified from research)
- Clear differentiation points
- Actionable roadmap items
- Honest feature comparison

### Must NOT Have
- Hype or exaggerated claims
- Outdated competitor information
- Vague positioning statements
- Feature promises without timeline

---

## Competitive Feature Matrix

### Core Capabilities

| Feature | Claude-mem | Supermemory | Squish | Winner |
|---------|------------|-------------|--------|--------|
| **GitHub Stars** | 31.8k | 16.7k | ~100 | Claude-mem |
| **Local-first** | Yes (SQLite) | No (cloud) | Yes (SQLite) | TIE (Claude-mem, Squish) |
| **Offline operation** | Yes | No | Yes | TIE |
| **Zero recurring cost** | Yes | No (SaaS) | Yes | TIE |
| **CLI fallback** | No | No | Yes | SQUISH |
| **Core memory (always in context)** | No | No | Yes (2KB) | SQUISH |
| **Context paging** | No | No | Yes (8KB budget) | SQUISH |
| **OpenClaw native** | Yes (plugin) | No | Yes (QMD/mcporter) | TIE |
| **Knowledge graph** | No | Yes | Partial | Supermemory |
| **Reranking** | No | Yes | No | Supermemory |
| **Browser extension** | No | Yes | No | Supermemory |
| **Web UI** | Yes (37777) | Yes | No | TIE |
| **Progressive disclosure** | Yes (3-layer) | No | No | Claude-mem |
| **AI compression** | Yes (Agent SDK) | No | No | Claude-mem |
| **Before/after context** | Yes | No | No | Claude-mem |
| **Multi-client support** | Claude Code only | Universal | Universal | TIE |
| **Deterministic artifacts** | No | No | Yes | SQUISH |
| **CI verification** | No | No | Yes | SQUISH |
| **License** | AGPL-3.0 | MIT | MIT | TIE |
| **Self-hosting** | Yes | Yes | Yes | TIE |
| **Remote mode** | No | Yes | Yes | TIE |
| **Token budgeting** | No | No | Yes | SQUISH |
| **Memory lifecycle** | No | No | Yes (decay, merge) | SQUISH |

### Squish Unique Advantages

1. **CLI Fallback** - Only Squish works when MCP fails
2. **Core Memory** - 2KB always-visible 4-section memory
3. **Context Paging** - Token-aware memory loading with 8KB budget
4. **Deterministic Artifacts** - Reproducible generation with verification
5. **Memory Lifecycle** - Decay, merge, governance features
6. **MIT License** - More permissive than Claude-mem's AGPL

### Competitive Gaps to Address

| Gap | Priority | Effort | Impact |
|-----|----------|--------|--------|
| GitHub stars deficit | High | Ongoing | High |
| No Web UI | Medium | Large | Medium |
| No AI compression | Medium | Large | High |
| No progressive disclosure | Low | Medium | Medium |
| No before/after context | Low | Medium | Low |
| No reranking | Low | Medium | Medium |
| No browser extension | Low | Large | Low |

---

## Positioning Strategy

### Market Segments

1. **Claude Code Power Users** - Target with local-first + CLI fallback
2. **OpenClaw Users** - Target with native QMD/mcporter integration
3. **Privacy-Conscious Developers** - Target with local-only option
4. **Cost-Conscious Teams** - Target with zero recurring cost for local
5. **Enterprise** - Target with self-hosted remote mode

### Differentiation Statements

**vs Claude-mem:**
> "Claude-mem is excellent for Claude Code users who want automatic memory. Squish adds CLI fallback for reliability, core memory for always-visible context, and MIT license for commercial flexibility. Choose Claude-mem for Claude Code deep integration. Choose Squish for multi-client support and resilience."

**vs Supermemory:**
> "Supermemory is the best choice for teams wanting managed SaaS memory. Squish is for developers who prioritize local-first operation, privacy, and zero recurring costs. Choose Supermemory for hosted convenience. Choose Squish for control and offline capability."

### GTM Hooks

1. **Primary**: "One MCP contract, everywhere. Local by default, remote when you need scale."
2. **Privacy Wedge**: "Your memories, your machine. No cloud required."
3. **Reliability Wedge**: "MCP-first with CLI fallback. Works even when MCP doesn't."
4. **OpenClaw Wedge**: "Native QMD + mcporter integration. First-class OpenClaw support."
5. **Cost Wedge**: "Zero recurring cost for local mode. Pay only for managed remote."

---

## TODOs

- [ ] 1. Create competitive analysis documentation

  **What to do**:
  - Create `docs/COMPETITIVE-ANALYSIS.md` with full competitor profiles
  - Include feature matrix, pricing comparison, architecture details
  - Add honest assessment of competitive position

  **Recommended Agent Profile**:
  - **Category**: `writing`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with T2)
  - **Blocks**: T5
  - **Blocked By**: None

  **References**:
  - Research data from this plan
  - Supermemory pricing page: https://supermemory.ai/pricing
  - Claude-mem README: https://github.com/thedotmack/claude-mem

  **Acceptance Criteria**:
  - [ ] All three products documented with accurate data
  - [ ] Feature matrix is complete and honest
  - [ ] No hype or misleading claims

- [ ] 2. Create positioning documentation

  **What to do**:
  - Create `docs/POSITIONING.md` with differentiation statements
  - Include GTM hooks for each target segment
  - Add elevator pitches and taglines

  **Recommended Agent Profile**:
  - **Category**: `writing`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with T1)
  - **Blocks**: T5
  - **Blocked By**: None

  **References**:
  - Competitive analysis from T1
  - Squish README for current positioning

  **Acceptance Criteria**:
  - [ ] Clear differentiation from Claude-mem and Supermemory
  - [ ] GTM hooks for each target segment
  - [ ] Honest assessment of competitive position

- [ ] 3. Update README with competitive section

  **What to do**:
  - Add "Why Squish vs Alternatives" section to README
  - Include quick comparison table
  - Link to full competitive analysis

  **Recommended Agent Profile**:
  - **Category**: `writing`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2
  - **Blocks**: T5
  - **Blocked By**: T1, T2

  **References**:
  - Current README.md
  - Competitive analysis from T1
  - Positioning from T2

  **Acceptance Criteria**:
  - [ ] "Why Squish" section added
  - [ ] Comparison table is accurate
  - [ ] Links to docs work

- [ ] 4. Create feature parity roadmap

  **What to do**:
  - Create `docs/ROADMAP.md` with prioritized feature gaps
  - Include effort estimates and timeline suggestions
  - Categorize as quick wins vs long-term investments

  **Recommended Agent Profile**:
  - **Category**: `writing`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with T3)
  - **Blocks**: T5
  - **Blocked By**: T1

  **References**:
  - Feature matrix from competitive analysis
  - Current Squish features

  **Acceptance Criteria**:
  - [ ] All competitive gaps documented
  - [ ] Priority and effort estimates included
  - [ ] Quick wins clearly identified

- [ ] 5. Update package.json with competitive keywords

  **What to do**:
  - Add keywords that help with discoverability
  - Include competitor-alternative keywords
  - Update description to highlight differentiation

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3
  - **Blocks**: F1
  - **Blocked By**: T3, T4

  **References**:
  - Current package.json
  - Competitor keywords from research

  **Acceptance Criteria**:
  - [ ] Keywords include: claude-mem-alternative, supermemory-alternative
  - [ ] Description highlights local-first + CLI fallback
  - [ ] No trademark violations

---

## Final Verification Wave

- [ ] F1. Plan Compliance Audit
  Verify all documentation created, all sections complete, no missing references.

- [ ] F2. Accuracy Review
  Verify all competitor data is accurate and current.

- [ ] F3. Positioning Consistency
  Verify positioning is consistent across all documents.

- [ ] F4. Link Verification
  Verify all external links work and point to correct resources.

---

## Commit Strategy

- C1: `docs(competitive): add competitive analysis documentation`
- C2: `docs(positioning): add positioning and GTM strategy`
- C3: `docs(readme): add competitive comparison section`

---

## Success Criteria

### Verification Commands
```bash
# Verify docs exist
ls docs/COMPETITIVE-ANALYSIS.md
ls docs/POSITIONING.md
ls docs/ROADMAP.md

# Verify README updated
grep -q "Why Squish" README.md
grep -q "Alternatives" README.md

# Verify package.json keywords
grep -q "local-first" package.json
```

### Final Checklist
- [ ] Competitive analysis complete and accurate
- [ ] Positioning documentation created
- [ ] README includes competitive section
- [ ] Feature roadmap prioritized
- [ ] All links verified
