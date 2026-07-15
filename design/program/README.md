# SpaceFace Professional Alpha Completion Program

**Status:** ACTIVE · unified audit snapshot 2026-07-14

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

1. **This index** — overall goal, present position, and current order.
2. [`01_VERIFIED_DONE.md`](./01_VERIFIED_DONE.md) — what is actually committed or freshly proven.
3. [`02_REMAINING_WORK.md`](./02_REMAINING_WORK.md) — every open Alpha and Depth item.
4. [`03_LIVE_ACCEPTANCE_MATRIX.md`](./03_LIVE_ACCEPTANCE_MATRIX.md) — current checks, public routes,
   evidence, and milestone-exit truth.
5. [`04_WORKTREE_AND_INTEGRATION.md`](./04_WORKTREE_AND_INTEGRATION.md) — what exists only in the
   shared dirty tree and how to preserve it.
6. [`05_RESUME_AND_FINAL_REVIEW.md`](./05_RESUME_AND_FINAL_REVIEW.md) — exact pickup and final review
   procedure.
7. [`06_RETAINED_FUTURE_BACKLOG.md`](./06_RETAINED_FUTURE_BACKLOG.md) — valuable partial/future
   outcomes that are preserved but not committed until admitted here.

The distinction between steps 3 and 6 is deliberate: `02_REMAINING_WORK.md` is committed program
scope; `06_RETAINED_FUTURE_BACKLOG.md` is the deduplicated reservoir of plans worth keeping. A
retained item becomes work only when the lead admits a bounded slice with dependencies and acceptance
to `02_REMAINING_WORK.md`.

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
| Repository | `master` and `origin/master` are synchronized at `05b9cf60`; the worktree is deeply dirty and the index is empty. |
| M0 | Validator contract and Observatory Phase A are green; the live Alpha evidence corpus is red with 13 issues across 20 records, and the asset-classification corpus currently accepts 0 visual candidates. |
| M1 | Core mechanics are substantially implemented and focused combat/tether checks pass; the strict Helios public route still fails before docking, and the starter/Helios/feedback visual family is not accepted. |
| M2 | Seamless-world architecture is substantially built; the fresh combined acceptance run exited red during Electron launch, so current milestone exit is unconfirmed. |
| M3 | Origins, cohorts, Hunter intent, damage, and Game Over are implemented; natural recovery and complete unassisted ninety-minute routes remain. |
| M4 | Regional ecology implementation is broad, but its fresh gate is 8/9 and player-facing art/diversity acceptance remains. |
| M5 | Story/role/ownership systems are substantial and role continuity is green; ordinary B0–B7, ending, sandbox, and ownership routes remain. |
| M6 | Capture machinery and Wasp routing exist; performance is red, store capture is absent, Wasp lacks the classification record required for canonical acceptance, and visible Hitch-glare/Helios-material defects remain. |
| Depth | 0 chunks are DONE. After correcting W1’s existing data groundwork: 16 are IN-PROGRESS and 15 are TODO. Most July-14 work exists only in the dirty tree. |

## Current order

1. Preserve and classify the dirty Depth/asset work so it is recoverable from `master`.
2. Repair the 20-record Alpha evidence corpus and bind baselines to the current revision.
3. Restore the strict M1 Helios public route; then finish Focus/camera/tether/doctrine acceptance.
4. Close M3 natural recovery and the three unassisted career routes.
5. Restore M4 ecology to green and complete its real sparse/normal/crowded visual routes.
6. Repair crowded-flight/startup performance without reducing visual quality.
7. Finish M5 story/ownership routes, remaining Depth chunks, and M6 release/store acceptance.

No new broad feature wave should hide unfinished integration. Parallel work is still appropriate when
lanes do not overlap, but every lane must end in a recoverable logical commit and a current acceptance
record.
