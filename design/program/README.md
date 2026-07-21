# SpaceFace Professional Alpha Completion Program

**Status:** ACTIVE · execution reset 2026-07-18; acceptance rows retain their own audit dates

**Agent entry for program work:** start at repo-root
[`../../CANONICAL_BUILD_MAP.md`](../../CANONICAL_BUILD_MAP.md). That map is the single front door for
"next N", check-off, and plan routing. This folder remains the **live status and ledger set** the map
points into. Do not invent a parallel status system.

**Overall task:** turn SpaceFace into a professional-feeling solo space game with a polished first
ninety minutes, a seamless persistent galaxy, deep readable world content, complete B0–B7 story and
ownership progression, dramatically improved visual/audio presentation, and a stable browser and
desktop release candidate.

This folder is the **sole cross-program status surface** for the two previously separate task
collections:

- **SpaceFace Full Solo Alpha** — canonical M0–M6 scope and acceptance spine.
- **The SpaceFace Depth Program — “The Galaxy Keeps Receipts”** — subordinate content, faction,
  landmark, encounter, audio, and world-history expansion.

The detailed source plans remain in place. This folder owns the unified status roll-up so agents do
not have to reconcile several conflicting handoffs before working.

## Read this set in order

0. [`../../CANONICAL_BUILD_MAP.md`](../../CANONICAL_BUILD_MAP.md) — **canonical agent front door**
   (workflow, authority, plan directory, anti-nesting).
1. [`PROGRAM_MAP.md`](./PROGRAM_MAP.md) — expanded plan-family routing and the "next N" controller notes.
2. [`NOW.md`](./NOW.md) — volatile active leases, occupied paths, and packets ready to claim.
3. [`roadmap/program-queue.json`](./roadmap/program-queue.json) — explicit cross-plan priority and
   dependency overlay; its `PQ-*` handles do not replace stable packet IDs.
4. [`roadmap/README.md`](./roadmap/README.md) — the 113-packet work order and dependency spine.
5. [`roadmap/00_EXECUTION_PROTOCOL.md`](./roadmap/00_EXECUTION_PROTOCOL.md) — mandatory autonomous
   workflow, collision control, proof, receipts, and integration.
6. [`01_VERIFIED_DONE.md`](./01_VERIFIED_DONE.md) — committed or freshly proved outcomes.
7. [`02_REMAINING_WORK.md`](./02_REMAINING_WORK.md) — milestone-level Alpha/Depth remaining-work roll-up.
8. [`03_LIVE_ACCEPTANCE_MATRIX.md`](./03_LIVE_ACCEPTANCE_MATRIX.md) — checks, public routes, evidence,
   and milestone-exit truth at its stated audit revision.
9. [`04_WORKTREE_AND_INTEGRATION.md`](./04_WORKTREE_AND_INTEGRATION.md) and
   [`05_RESUME_AND_FINAL_REVIEW.md`](./05_RESUME_AND_FINAL_REVIEW.md) — recoverability and review.
10. [`06_RETAINED_FUTURE_BACKLOG.md`](./06_RETAINED_FUTURE_BACKLOG.md) — only valuable outcomes not yet
   mapped to an `F/G/T/A/W/R` packet.
11. [`07_HISTORICAL_BUILDS.md`](./07_HISTORICAL_BUILDS.md) — finished handoffs and later verification.
12. [`08_GRAPHICS_OVERHAUL_CHECKPOINT.md`](./08_GRAPHICS_OVERHAUL_CHECKPOINT.md) — promoted graphics
    checkpoint truth, rejected evidence, remaining visual work, integration record, and donor
    worktree cleanup criteria.

The program map and queue own cross-plan **selection order**, and the roadmap owns stable packet
identity; neither owns completion truth. Files `01–05` own verified/remaining/
acceptance/integration truth at their stated evidence revision. `06` is not a competing queue: when an
outcome maps to a roadmap packet, update the packet; when it does not, retain it in `06` until the lead
assigns a packet ID and milestone roll-up. This split prevents two “next work” systems.

## Authority and source plans

This status set does not replace technical or design authority:

1. [`../../ARCHITECTURE.md`](../../ARCHITECTURE.md) — technical contract.
2. [`../GDD_2_0.md`](../GDD_2_0.md) — game-design authority.
3. [`../vision/ALPHA_PROGRAM.md`](../vision/ALPHA_PROGRAM.md) — canonical Alpha scope/order; its
   embedded ledger is supporting detail, not a second global status roll-up.
4. [`../production/01_BUILD_PROGRAM.md`](../production/01_BUILD_PROGRAM.md) — draft production
   acceptance and clean-wave proposal; it becomes binding only when the controller explicitly adopts
   it for the release run.
5. [`../depth-program/README.md`](../depth-program/README.md) and
   [`../depth-program/BUILD_PLAN.md`](../depth-program/BUILD_PLAN.md) — Depth routing and detailed
   31-chunk spec.
6. [`../depth-program/PROGRESS_LEDGER.md`](../depth-program/PROGRESS_LEDGER.md) — detailed Depth
   evidence ledger; live checks and git still outrank it.

`ORCHESTRATOR_GOAL.md`, `SESSION_PLAN.md`, older build plans, terminal transcripts, and chat summaries
are procedures or historical handoffs. They are not additional status authorities.

## Status ownership

- Only the lead/status integrator writes cross-program completion claims in `design/program/**`.
- Feature owners update their detailed packet/chunk ledger and return proof; they do not promote a
  milestone globally.
- `design/vision/ALPHA_PROGRAM.md` owns Alpha scope and order.
  `design/depth-program/BUILD_PLAN.md` owns Depth scope. Their progress ledgers are subordinate
  evidence indexes.
- A status change is not complete until the detailed source ledger and this roll-up agree in the
  same integration pass. Live code, checks, public routes, evidence, and git identity still outrank
  every prose status.
- The family-level authority and retention map is [`../PLAN_REGISTRY.md`](../PLAN_REGISTRY.md).

## Status language

| Term | Meaning |
|---|---|
| **Committed** | Present in `master`; says nothing by itself about quality or acceptance. |
| **Implemented** | Code/content exists in the current tree, possibly only as dirty work. |
| **Focused green** | Its named narrow check passed in the current audited tree. |
| **Player-route accepted** | A normal public-input route and current visual/runtime evidence pass. |
| **Milestone exited** | All required routes and evidence pass, plus clean waves when the controller has adopted the draft production policy. |

These levels must never be collapsed into a single “done” label.

## Current position

| Track | Current audited truth |
|---|---|
| Repository | Foundation runtime repair `77a09790` and diagnostic implementation `32596ec7` are committed; the containing program commit closes the planning/history slice. Concurrent map/render/game-state and user-confirmed HUD/visual-asset work remains occupied and excluded; refresh identity/status before every claim. |
| Foundation | `F01–F17` are integrated: focused foundation tests are 68/68, census/data references are clean, the 113-packet graph and links are clean, and the stale sim envelopes remain explicit debt rather than an unreviewed re-record. |
| Gold corridor | `G01` is the first READY route-harness packet. No corridor completion or ninety-minute acceptance is newly claimed by this reset. |
| Massline / Asteroid Ops / encounters | `T01`, `A01`, and `W01` are READY pure/focused contracts with separate path budgets. Later player-visible packets remain PLANNED. |
| Alpha / Depth acceptance | Existing `01–03` rows remain the acceptance truth at their stated audit revisions. This roadmap does not promote M0–M6 or any Depth chunk. Refresh those matrices after packet integration and player-route evidence. |
| Historical builds | The 7/17 menu and 3D-drill implementation handoffs are retired behind tombstones and listed in `07_HISTORICAL_BUILDS.md`; their deferred browser/Electron/visual/perf verification remains explicit. The map handoff stays active and occupied. |

## Current order

1. Claim `G01`, `T01`, `A01`, and `W01` in parallel; serialize browser/Electron and Git-index ownership.
2. Use the G01 diagnosis and pure interfaces to complete the Helios→Ceres→Tethys corridor.
3. Deepen Massline/Asteroid Ops and early encounter doctrines while corridor producers/carriers are known.
4. Embody world/story packets, then close cross-feature UX, accessibility, performance, platform, and
   release evidence.

No broad wave may hide unfinished integration. Every shared-worktree lane returns an uncommitted diff and
receipt; the lead owns staging and atomic commits unless a verified isolated worktree was assigned.
