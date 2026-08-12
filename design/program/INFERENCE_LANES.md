<!-- LIFETIME: STABLE -->
# SpaceFace INFERENCE — production-first, bounded execution

```
SPACEFACE COMMANDS

NEXT
Continue one existing admitted queue unit.

INFERENCE <N> [optional scope]
Complete up to N independently useful production units, sequentially.

Examples:
INFERENCE 1
INFERENCE 5 NPCS
INFERENCE 20 WORLD
INFERENCE 8 GRAPHICS
WF-12 3
```

This file is the authoritative execution contract for an `INFERENCE` request.

## 1. What `N` means

`N` is a positive integer target for **production units**, not an effort multiplier, candidate-pool
size, review quota, document count, file count, or acceptance campaign.

One production unit is one coherent, independently useful change to at least one production surface:

- runtime code under `src/`;
- player-consumed game data;
- a shipped asset plus its live integration;
- build/release code that materially changes the shipped game.

A unit does **not** count when it changes only plans, candidate lists, ledgers, receipts, tests,
screenshots, reviews, probes, manifests used only by validation, or harness/infrastructure code.

`N` may be larger than five. Large requests are not converted into one giant portfolio. They are
executed as a sequence of small committed slices.

## 2. Two honest terminal states for a built unit

- `implemented` — production is committed; focused verification is green or the exact remaining route
  claim is recorded as `unproven` (`route-unproven`).
- `accepted` — production is committed and current ordinary-route evidence supports the claimed
  player-facing result.

`implemented` is a legitimate terminal outcome. Do not hold completed production hostage while
manufacturing a route harness, a fresh reviewer, or a perfect acceptance record.

## 3. PRODUCTION-FIRST loop

Run this loop once per unit:

1. Read the user's scope, root `AGENTS.md`, the relevant live owner, and only the selected workflow
   needed to understand the domain.
2. Run `node scripts/inference-detect.mjs [--scope=SCOPE]` at most once at the beginning of the task.
   The detector suggests a domain; it does not set `N`, dispatch work, or require a portfolio.
3. Choose one small player-facing unit. At most three alternatives may be compared; a candidate
   dossier is not required.
4. Reproduce or characterize the relevant behavior at the owning seam.
5. Make a production mutation. The first commit in the task must contain production paths. A focused
   regression test may be included in the same commit.
6. Run the cheapest existing checks that can falsify the change. Escalate only when the unit actually
   makes the higher-level claim.
7. Self-review the diff and evidence. Fix verified in-scope defects once.
8. Commit the production unit and record it with `scripts/inference-record.mjs`.
9. Select the next unit only after the previous one has a terminal record.

Do not pre-plan, pre-review, or pre-validate all `N` units before implementing the first.

## 4. SUPPORT-WORK CAP

Support work can unlock production; it cannot replace production.

Unless the user explicitly requested tooling, tests, validation, or infrastructure:

- no support-only commit may occur before the first production commit;
- never make two support-only commits in a row;
- support-only commits may not exceed `max(1, ceil(completed production units / 5))`;
- a new browser/Electron acceptance harness is forbidden when existing owner-level evidence can
  establish the narrower claim;
- a failed harness does not automatically become the task;
- the same `(command, production digest, harness digest, environment, failure fingerprint)` may not
  be run twice without a relevant change.

When a harness fails, classify it once. Repair it only when the current unit genuinely requires that
exact route claim and one bounded repair is likely to unlock it. Otherwise record the route claim as
unproven, finish the production unit, and continue.

## 5. Review is evidence, not a recursive institution

The implementer performs an evidence-bound self-review by default. A separate cold reviewer is useful,
but is required only when the user explicitly requests one, an active packet explicitly requires one,
or the change crosses a high-risk human-taste/architecture boundary.

A review returns at most three causal findings. One repair pass and one causal re-review are allowed.
A new general audit does not begin after causal re-review. Unrelated discoveries become follow-ups.

No review file is required to record an `implemented` unit. A review file is optional metadata for an
`accepted` unit; route evidence, not reviewer theater, supports acceptance.

## 6. Batches larger than five

For `N > 5`:

- commit and record every unit independently;
- preserve a running count of production units, not a speculative portfolio;
- after each five production units, run one proportionate aggregate smoke check if it is already
  available;
- do not stop production to create portfolio prose, reels, fresh graders, or acceptance infrastructure;
- diversify naturally across the requested scope, but do not force a weak unit merely to fill a slot.

## 7. TERMINATION

Stop the task and report immediately when any one condition is true:

1. `N` production units are committed and recorded;
2. the user's declared product outcome is already satisfied;
3. every remaining candidate has a concrete external dependency or exact live-path collision;
4. the next action would repeat an unchanged failure fingerprint;
5. the remaining candidates are filler or would regress the game;
6. the execution environment ends before `N`.

Condition 6 produces an honest partial result. Report completed production units and exact remaining
work. Do not spend the remainder of the run polishing the report or repairing the referee.

Forbidden stopping conditions include “until perfect,” “until no faults remain,” “until every reviewer
agrees,” and “until every acceptance cell is green.”

## 8. Workflow router

The workflow files are domain checklists, not mandatory ceremonies:

| ID | Domain |
|---|---|
| WF-01 | NPC occupations and living world |
| WF-02 | enemy roster and encounters |
| WF-03 | sector/world composition |
| WF-04 | stations, planets, and world sites |
| WF-05 | weapons, physics tools, and modules |
| WF-06 | economy, industry, and logistics |
| WF-07 | progression, ships, and infrastructure |
| WF-08 | missions, heists, and activities |
| WF-09 | narrative, characters, and ledger |
| WF-10 | exploration and discovery |
| WF-11 | graphics asset families and world dressing |
| WF-12 | VFX, camera, lighting, and visual feel |
| WF-13 | audio, music, and world sound |
| WF-14 | UI, UX, onboarding, and information |
| WF-15 | gameplay feel, controls, and balance |
| WF-16 | variants, states, and aftermath |
| WF-17 | vertical-slice integration |
| WF-18 | design recovery and simplification |
| WF-19 | technical production and scaling |

Use `design/inference-workflows/07_WORKFLOW_ROUTER.md` only when the scope is ambiguous.

## 9. Recording

After committing a production slice:

```bash
node scripts/inference-record.mjs unit \
  --id <slug> --wf WF-XX --mode <mode> \
  --verdict implemented --verification focused_green \
  --commit <sha> --reason "<player-facing change>" \
  --fp "verb=...,subject=...,sector=...,domain=wf-xx"
```

Use `--verdict accepted --verification route_accepted --evidence <path>` only when current route
evidence genuinely supports that stronger claim. `--review` is optional.

## 10. Final report

Return a compact production ledger:

```text
Requested production units:
Completed production units:
Accepted:
Implemented / focused green:
Implemented / route unproven:
Support-only commits:
Production commits and player-facing changes:
Checks run once:
Remaining blockers or next units:
```

The governing sentence is simple:

> Build the game, prove only the claim actually made, commit the slice, and move on.
