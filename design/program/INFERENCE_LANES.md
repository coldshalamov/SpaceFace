<!-- LIFETIME: STABLE -->
# SpaceFace INFERENCE — production-first, bounded execution

```
SPACEFACE COMMANDS

NEXT
Continue one existing admitted queue unit.

INFERENCE <N> [optional scope]
Complete N independently useful production units, sequentially.

JULES <N> [optional model/lane]
Dispatch N directed candidate cloud tasks from the 1,000-task Jules bank; stronger local review remains merge authority.

Examples:
INFERENCE 1
INFERENCE 5 NPCS
INFERENCE 20 WORLD
INFERENCE 8 GRAPHICS
WF-12 3
JULES 20 FLASH
JULES 10 PRO
```

This file is the authoritative execution contract for an `INFERENCE` request.

## Jules cloud bank

`JULES` is deliberately **not** another admitted queue and does not change the production-first meaning of `INFERENCE N`. It is the cloud-capacity door requested for expendable, directed external work: tests, bounded bug hunts, lifecycle/performance investigations, UI/UX audits, AI/flight/combat slices, world/economy/mining work, asset/VFX/audio integrity, tooling/data checks, and small creative expansions.

Start at [`jules/README.md`](./jules/README.md). The bank contains 1,000 stable task identities (`JULES-0001`…`JULES-1000`) produced from 200 repository-specific collision domains and five directed facets each, with a fixed 700 Flash / 300 Pro model split. Render one exact prompt with `node scripts/jules-dispatch.mjs --id JULES-XXXX --format prompt`, or select non-colliding work with `--next --model flash|pro --count N`. Each Jules task may create at most one bounded cloud PR. A stronger local agent reviews/rebases/ports the useful delta and decides whether anything reaches master. A `NO_CHANGE` result is valid and preferable to filler.

The Jules bank grants no priority, lease, PQ identity, acceptance, or permission to edit the canonical control surfaces. Its tasks explicitly forbid edits to `CANONICAL_BUILD_MAP.md`, `program-queue.json`, `NOW.md`, the Jules bank itself, and simulation goldens.

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

- `implemented` — production is committed and the smallest direct verification needed for the
  implementation-level claim has passed. A broader ordinary-route claim may remain explicitly
  `unproven` (`route-unproven`).
- `accepted` — production is committed and current ordinary-route evidence supports the claimed
  player-facing result.

`implemented` is a legitimate terminal outcome. Do not hold completed production hostage while
manufacturing a route harness, a fresh reviewer, or a perfect acceptance record.

## 3. PRODUCTION-FIRST loop

For each unit, choose one bounded player-facing result, implement it through the live production
owner, perform sufficient direct verification for the claim being made, then commit and record it.
Select the next unit only after the previous one has a terminal record.

Process is subordinate to fulfillment. Candidate comparison, reproduction, tests, review, and route
evidence are available tools, not mandatory phases or deliverables. Use them when they can materially
change the implementation, verdict, minimum fix, or significant risk. Use the narrowest adequate
method rather than a universal sequence.

`inference-detect.mjs` may suggest a domain once when selection is genuinely ambiguous. It does not
set `N`, dispatch work, or require a portfolio. A unit cannot be recorded without its production
commit; optional support work before production must not become a substitute project.

Do not pre-plan, pre-review, or pre-validate all `N` units before implementing the first.

## 4. SUPPORT-WORK BOUNDARY

Support work can unlock production; it cannot replace production.

Before support work beyond the current unit's required direct verification, name the load-bearing
uncertainty and the material delta the work could produce. Proceed only when the user or governing
specification requires it, a relevant check failed or conflicts, a significant safety risk exists,
or the claimed result cannot otherwise be stated honestly. Use the narrowest adequate process.

A failed harness does not automatically become the task. Repair verification infrastructure only
when it is explicitly requested or the smallest necessary repair for the current production claim.
Otherwise retain the failure fingerprint, narrow or mark the broader route claim as unproven, and
continue production. Never rerun the same `(command, production digest, harness digest, environment,
failure fingerprint)` without a relevant change.

Support-only commits never count as production units. Their number is a diagnostic signal, not a
quota: repeated support-only work without a new production delta requires stopping that line of work
and returning to an eligible production unit.

## 5. Review is evidence, not a recursive institution

The implementer remains responsible for checking its work. A separate cold reviewer is required only
when the user or governing specification requires one, or a material high-risk boundary makes the
independent perspective load-bearing.

Review findings reopen work only when they can materially change the current result, minimum fix, or
significant risk. Confidence-only corroboration, unrelated discoveries, and renewed general audits do
not reopen a completed unit.

No review file is required to record an `implemented` unit. A review file is optional metadata for an
`accepted` unit; route evidence, not reviewer theater, supports acceptance.

## 6. Batches larger than five

For `N > 5`:

- commit and record every unit independently;
- preserve a running count of production units, not a speculative portfolio;
- use an aggregate check only when the batch makes an aggregate claim that unit-level checks cannot
  support;
- do not stop production to create portfolio prose, reels, fresh graders, or acceptance infrastructure;
- diversify naturally across the requested scope, but do not force a weak unit merely to fill a slot.

## 7. TERMINATION

Stop the task when `N` production units are committed and recorded, when the user explicitly changes
or stops the task, when the execution environment ends, or when every remaining eligible unit has a
concrete external dependency or exact live-path collision. A blocked candidate, unchanged failure
fingerprint, or weak filler is skipped while other eligible production units remain; it does not end
the multi-unit request.

An interrupted or fully blocked run produces an honest partial result. Report completed production
units and exact remaining blockers without spending the remainder polishing process artifacts or
repairing the referee.

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
