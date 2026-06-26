# Squish Launch Readiness Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align the public release, CLI surface, and launch messaging so Squish is installable, verifiable, and ready to sell.

**Architecture:** Keep the release source of truth in `squish/` and treat npm, GitHub metadata, README, and landing page as synchronized launch surfaces. Use a small top-level CLI status entrypoint to summarize local health, cloud connectivity, and install state without duplicating the existing nested `cloud` and `sessions` status flows.

**Tech Stack:** TypeScript, Commander, npm, GitHub CLI, Tailscale SSH, Vite/React landing page.

---

### Task 1: Publish the current source to npm

**Files:**
- Inspect: `package.json`
- Test: release tarball and registry metadata

- [ ] **Step 1: Verify the tarball contents**

Run:

```bash
cd squish
npm pack --dry-run
```

Expected: package builds a tarball from version `1.7.0` with the current README, CLI, core, and dist artifacts, with no unexpected secret or workspace files.

- [ ] **Step 2: Publish the release**

Run:

```bash
cd squish
npm publish --access public
```

Expected: npm now serves `squish-memory@1.7.0` instead of the older `1.6.0` registry release.

- [ ] **Step 3: Verify public metadata**

Run:

```bash
npm view squish-memory version homepage description repository.url maintainers --json
```

Expected: `version` is `1.7.0`, `homepage` is `https://squishplugin.dev`, and the description matches the buyer-facing launch copy.

### Task 2: Add a top-level `squish status` command

**Files:**
- Create: `packages/cli/src/commands/status.ts`
- Modify: `packages/cli/src/program.ts`
- Test: `tests/cli/status.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { createProgram } from '../../packages/cli/src/program.js';

test('registers a top-level status command', () => {
  const program = createProgram();
  const names = program.commands.map((cmd) => cmd.name());
  expect(names).toContain('status');
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run:

```bash
bun test tests/cli/status.test.ts
```

Expected: failure because `status` is not registered yet.

- [ ] **Step 3: Implement the command**

`status` should print a compact readiness report that includes:

```ts
{
  cli: 'installed',
  schema: 'ok | drifted | broken',
  cloud: 'connected | disconnected',
  sessions: 'available | unavailable',
  tailscale: 'reachable | unreachable'
}
```

Use the existing doctor, cloud, and sessions helpers instead of duplicating health logic.

- [ ] **Step 4: Run the test and confirm it passes**

Run:

```bash
bun test tests/cli/status.test.ts
```

Expected: pass.

### Task 3: Keep launch messaging synchronized

**Files:**
- Modify: `README.md`
- Modify: `../squish-landing/index.html` if any launch copy regresses

- [ ] **Step 1: Verify the launch hero text**

Check that the installed package and landing page still use the buyer-facing copy:

```text
One command. Memory everywhere.
```

- [ ] **Step 2: Update the README intro if it drifts**

Ensure the README points to the cloud dashboard, the install command, and the buyer-facing value prop without reverting to technical jargon.

- [ ] **Step 3: Re-check the landing page**

Confirm the hero still shows the install command and cloud CTA language already present in the current landing page.

### Task 4: Verify the VPS and tailnet path

**Files:**
- None

- [ ] **Step 1: Check Tailscale**

Run:

```bash
tailscale status
```

Expected: both `4m-server` and `squish-server` appear reachable on tailnet.

- [ ] **Step 2: SSH to the VPS**

Run:

```bash
ssh 4m-server "hostname && uname -a && whoami"
```

Expected: host responds successfully, proving the remote box is reachable for production maintenance.

- [ ] **Step 3: Record the operational baseline**

Note the host identity and any live services before making sales-facing claims.

