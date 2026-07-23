# Execution Protocol — Autonomous Packet Workflow

## Goal

Make every packet independently executable, collision-aware, evidence-bearing, and recoverable without
turning agent commentary into status authority.

## Assumptions and constraints

- The primary worktree is shared and may contain work newer than `HEAD`.
- Browser, Electron, simulation, render, and save claims are different proof classes.
- A packet may be implemented while still lacking player-route or visual acceptance.
- The lead owns global status, shared integration files, and packet promotion. Feature agents own their
  bounded diff and evidence receipt.
- An agent does not need an approval pause for an already `READY` packet. It must stop if evidence changes
  the product decision, expands paths materially, or reveals an unidentified collision.

## Packet states

| State | Meaning |
|---|---|
| `PLANNED` | Outcome is retained but dependencies or acceptance are incomplete. |
| `READY` | Dependencies, path budget, and focused proof are explicit. |
| `CLAIMED` | Lead recorded an agent, base commit, and non-overlapping path lease in `NOW.md`. |
| `IMPLEMENTED` | Coherent code/content exists; no acceptance implied. |
| `FOCUSED_GREEN` | Named narrow checks pass at the receipt commit. |
| `ROUTE_ACCEPTED` | Normal public input and current player-facing evidence pass. |
| `INTEGRATED` | Reviewed logical commit is on the active branch and program ledgers agree. |
| `BLOCKED` | A named dependency or external condition prevents meaningful progress. |
| `HISTORICAL` | Superseded build/plan retained for archaeology and later verification only. |

Do not abbreviate several states to “done.” A packet is complete for milestone accounting only when its
declared terminal state and proof are both present.

## Required packet contract

Every packet row or brief must provide:

1. Stable ID and one player/system outcome.
2. Dependencies by stable ID, including evidence dependencies.
3. Path budget: expected owner files, new files, and mutex files it may only request.
4. Research anchors: current entrypoints, owning `AGENTS.md`, and existing patterns/checks.
5. Explicit non-goals and compatibility paths not to edit.
6. Focused proof, broader risk-triggered proof, and public-route proof when player-visible.
7. Receipt shape and terminal state.

If any of those are absent, the packet is not `READY`.

## Agent workflow

### 1. Ground in the live tree

Run:

```powershell
git log -1 --oneline
git status --short
git diff -- <each-expected-owner-file>
git rev-list --left-right --count origin/master...HEAD
```

Read root `AGENTS.md`, the nearest nested `AGENTS.md`, `NOW.md`, this protocol, the packet brief, and only
the linked technical/design authority. Do not sweep archives, campaigns, screenshots, or all of
`design/` for an ordinary packet.

### 2. Re-prove the problem before editing

- Run the narrow current check or inspect the public route that demonstrates the gap.
- Separate `confirmed`, `inferred`, and `unknown` findings in working notes.
- If the reported defect is already fixed, return evidence and propose reclassification; do not invent a
  replacement feature inside the same lease.

### 3. Claim paths through the lead

Return `packet`, `base_commit`, `expected_paths`, `mutex_requests`, and `dependencies_seen`. The lead adds
the claim to `NOW.md`. A branch name is not isolation; if a separate worktree is named, verify it with
`git worktree list --porcelain` before relying on it.

Agents never independently edit `NOW.md`, global status, `package.json`, registry/default state, shared
input, save/load owners, shared CSS, or generated indexes during parallel work unless those exact paths
are the recorded lease.

### 4. Establish a red or characterization baseline

- Defect/behavior change: add the smallest public-contract test and observe the expected failure.
- Coverage-only packet: add deterministic characterization at the ownership seam and state that it was
  green against existing behavior; do not pretend it exposed a defect.
- Visual/feel packet: capture current player-route evidence and machine-readable metrics before changing
  behavior. Source inspection alone is not a visual baseline.

Add every new file to intent with `git add -N <file>` immediately.

### 5. Implement the smallest coherent outcome

- Follow the live default route and single-writer contracts.
- Use `state.rng`/serializable streams and `state.simTime` in simulation.
- Keep compatibility implementations intact unless the packet explicitly owns them.
- Avoid unrelated cleanup, generated-output edits, expected-golden rewrites, or quality reductions.
- When a shared change is needed, return a concrete integration request instead of crossing the mutex.

### 6. Verify in layers

1. New/focused unit or contract test.
2. Owning subsystem check.
3. Determinism/save/launch/a11y/perf checks triggered by the changed seam.
4. Normal browser/Electron route and current media for player-visible work.
5. `git diff --check`, `git status --short`, and a complete review of the intended diff.

An expensive route probe is acceptance evidence, not an iterative debugger. After its first new
failure family, reduce the failure to a deterministic, seconds-scale regression that drives the real
owning systems through fixed ticks and public control intent. Observe that regression fail and pass
before another live attempt. Where a route is costly or historically flaky, enforce the boundary with
a source-bound fast receipt and a stable failure fingerprint so an unchanged test suite cannot launch
the same acceptance attempt again.

Report exact commands, exit status, passed/failed counts, artifact paths, and current commit. A failed
command stays in the receipt with its classification; it is never erased by a later green subset.

### 7. Hand the logical slice to the commit owner

The Git index and commit operation are mutexes. In the shared primary worktree, feature agents do not
stage content or commit: after the required intent-to-add marker for a new file, they return an
uncommitted diff and receipt. Only the lead/integration owner holds the index mutex, confirms no other
agent has staged work, stages explicit packet paths, inspects `git diff --cached --stat` and
`git diff --cached`, and creates the atomic commit.

An agent may stage and commit independently only in a verified isolated worktree whose path and branch
the lead explicitly assigned. Branch names alone do not qualify. If a packet naturally splits into a
contract/tool commit and a gameplay commit, the integration owner makes two commits whose messages
explain the dependency.

### 8. Return the receipt

```yaml
packet: G01
agent: <task-or-agent-id>
base_commit: <sha>
result_commit: <sha-or-uncommitted>
state_reached: FOCUSED_GREEN
paths_changed:
  - path
shared_change_requests: []
proof:
  - command: node --test test/example.test.mjs
    result: 5/5 pass
public_route:
  status: not-run
  artifacts: []
known_failures: []
follow_ons: []
```

The lead rechecks the diff, integrates it, updates detailed and global ledgers together, and releases the
lease. Agent self-scores, prose confidence, and screenshots without route/build identity are not status.

## Collision and drift protocol

### Path collision

Stop before editing when an expected file is dirty outside the recorded lease. Inspect its diff without
changing it, report the path and likely owner, and continue only on independent files. Never use reset,
restore, checkout, clean, or stash to manufacture a clean tree.

### Semantic collision

Even separate files collide when they change the same contract. Treat these as mutex domains:

- physics body ownership and transform writes;
- credit/reputation/cargo/derived-stat single writers;
- input actions and rebind semantics;
- save schema, migrations, normalization, and Continue;
- registry/update order and default backend selection;
- common UI tokens and screen lifecycle;
- runtime asset manifests and release metadata.

The lead sequences interface changes before dependent packets, then asks dependents to rebase their
assumptions by re-reading the interface and rerunning focused proof.

### Status drift

Every receipt is bound to `result_commit`. Checks without a commit are local observations only. The lead
must rerun at least the focused proof if intervening commits touch an owner, dependency, test harness, or
shared runtime seam. Historical green results never automatically promote current work.

## Parallel wave rules

- Parallelize pure kernels, independent data/content, focused harnesses, and separate visual assets.
- Serialize registry/default/save/package wiring through the integration owner.
- Serialize all real staging and commits in the shared worktree through the integration owner; an
  agent's `git add -N` marker is not authorization to populate the shared index.
- Give each visible feature one route-evidence owner; several agents must not launch competing browser or
  Electron probes against the same port/profile.
- Land interface/contract commits before consumers. Consumer agents may research in parallel but must
  implement against the landed interface.
- End each lane with a recoverable commit and receipt before opening another broad wave.

## Final review checklist

- Outcome is reachable on the default route.
- No compatibility path was mistaken for the live implementation.
- Determinism and single-writer rules hold.
- Save/reload behavior is explicit where state persists.
- Accessibility and reduced-motion/flash behavior are preserved.
- Visual/performance claims use current player-facing evidence.
- The diff contains no foreign paths, fake fixtures, stale goldens, or report-only completion.
- `NOW.md`, the packet brief, acceptance matrix, and historical ledger agree.
