<!-- LIFETIME: STABLE -->
# SpaceFace INFERENCE — think, complete, rotate

```
SPACEFACE COMMANDS

NEXT
Continue one existing admitted queue unit.

INFERENCE
Five complete units, no scope: round-robin whatever is weak or ill-built.

INFERENCE <N>
N complete units, still unscoped weakness round-robin.

INFERENCE <N> <SCOPE>
N complete units inside that domain, rotating kinds.

Examples:
INFERENCE
INFERENCE 8
INFERENCE 3 MISSIONS
INFERENCE 5 NPCS
WF-12 3
```

This file is the authoritative execution contract for an `INFERENCE` request.
Operator prompt: [`INFERENCE_GOAL.txt`](./INFERENCE_GOAL.txt). Domain checklists:
[`../inference-workflows/README.md`](../inference-workflows/README.md). Per-unit
consideration: [`../inference-workflows/02_CREATIVE_CONVERGENCE_LOOP.md`](../inference-workflows/02_CREATIVE_CONVERGENCE_LOOP.md).

INFERENCE is the direction you throw agents at when the queue is not the job.
It is a **loose framework**: agents infer, extend live owners, and spend real
time on the idea. It is not a recipe for the smallest row that compiles.

The failure this exists to end: `INFERENCE 3 MISSIONS` producing three board
entries with no place, no script, and not enough people in them. The other
failure: bare `INFERENCE` following a detector score into five narrow registry
edits, with no common sense.

## 0. Bare `INFERENCE` — look, then rotate

When the owner says **`INFERENCE`** with no number and no scope, the work is
to **find out** what is weak or ill-built, then fix a complete instance of
it, then fix a *different kind* of weakness you also actually saw.

A script cannot deterministically detect architectural mistakes, thin
missions, empty cameras, or bad script beats. `inference-detect.mjs` can
count registry breadth, staleness, ghosts, and unwired files. Those counts
are **optional hints**. They are not the task, not a pick list, and not
permission to skip looking.

`N` defaults to **5**.

For each unit:

1. **Look.** Read the live owner, the ordinary route, `VISION.md`, and the
   code path a stranger would hit. Name what is actually weak or ill-built
   in player words — not what is easiest to increment.
2. **Consider** two or three real alternatives. Pick the one that would
   most help someone playing.
3. **Complete** that whole thing through live owners.
4. **Rotate.** The next unit is a different kind of weakness you also found
   by looking (a different workflow, or a different kind inside one). Do not
   spend the batch on one registry.

Glance at detect at most once per batch if a count would change your mind.
If the hint disagrees with what you saw, **ignore the hint**. If you cannot
explain the unit without quoting a detect score, you have not inferred yet.

`INFERENCE 8` is the same loop with a longer batch. `INFERENCE 3 MISSIONS`
stays in missions and rotates kinds inside that domain — still by looking,
not by adding three rows.

## 1. What `N` means

`N` is a positive integer target for **complete, independently useful
production units**, not an effort multiplier, candidate-pool size, review
quota, document count, or acceptance campaign.

Bare `INFERENCE` (no number, no scope) means **N = 5** and the look-then-rotate
loop in §0. `INFERENCE 8` is the same loop with a longer batch.
A named scope always needs a number: `INFERENCE 3 MISSIONS`, not
`INFERENCE MISSIONS`.

One production unit is one coherent change the player would actually notice,
on at least one production surface:

- runtime code under `src/`;
- player-consumed game data;
- a shipped asset plus its live integration;
- build/release code that materially changes the shipped game.

A unit does **not** count when it changes only plans, candidate lists, ledgers,
receipts, tests, screenshots, reviews, probes, manifests used only by
validation, or harness/infrastructure code.

A unit also does **not** count when it is **thin**: a new table row, a briefing
string, one extra enemy type with nowhere to stand, a scatter of props, or a
mission that is "go there and hold E." Use the selected workflow's **"One
production unit"** list as the depth bar. Fill it with play, not stubs.

`N` may be larger than five. Large requests are a sequence of complete slices,
not one giant portfolio and not `N` first drafts.

## 2. Two honest terminal states for a built unit

- `implemented` — production is committed and the smallest direct verification
  needed for the implementation-level claim has passed. A broader ordinary-route
  claim may remain explicitly `unproven` (`route-unproven`).
- `accepted` — production is committed and current ordinary-route evidence
  supports the claimed player-facing result.

`implemented` is a legitimate terminal outcome. Do not hold completed production
hostage while manufacturing a route harness, a fresh reviewer, or a perfect
acceptance record. Headed captures are not the review method
(`docs/AGENT_LESSONS.md`, owner 2026-09-16).

## 3. The loop for every unit

```text
CONSIDER  →  COMPLETE  →  PROVE  →  ROTATE
```

Process is subordinate to fulfillment. Candidate dossiers, capture campaigns,
and review institutions are not the work. **Thinking is.** The first idea is
usually the thin one. Spend time on what should exist, then build that whole
thing, then point at a different kind of value.

Do not pre-plan, pre-review, or pre-validate all `N` units before implementing
the first. Do think hard about **this** unit before typing production code.

### 3.1 CONSIDER

Read the live owner and the ordinary route. Name the deficit in player words.
Generate **two or three real alternatives** — different verbs, places, or
complications, not paraphrases of the same row. Pick the one a stranger would
remember after thirty seconds of play.

The consider step lives in
[`02_CREATIVE_CONVERGENCE_LOOP.md`](../inference-workflows/02_CREATIVE_CONVERGENCE_LOOP.md).
It produces no Markdown deliverable. If you cannot say why the other ideas lost,
you have not considered yet.

Feel guts (the ship ignores you, shove does nothing, camera loses the fight)
go through [`FUN_CONVERGENCE_LOOP.md`](./FUN_CONVERGENCE_LOOP.md). Do not hide a
handling bug inside a new wreck field.

On **unscoped** INFERENCE, looking is the selector (§0). Detect is an optional
count hint, at most once per batch. A count of "too few X" does not beat an
empty camera or a mission with nobody in it. If you cannot name the weakness
without a detect score, keep looking.

### 3.2 COMPLETE — the whole playable thing

Implement through the live owner. **Logical extensions are part of the unit.**
If the idea is a salvage job, the unit includes the wreck placement, the
people working it, the scripted beats, the density of opposition, and the
consequence — not a board row that assumes the rest exists.

Do not invent a second cargo, heat, AI, or mission system. Extend what is
already live. Tweaks to an existing mission, encounter, or pocket count when
they make that thing actually good.

If the first implementation is thin, **iterate inside this unit**. Adding a
second thin row is not iteration.

### 3.3 PROVE

Prove only the claim actually made. Default proof is the live owner plus a
number or a focused test. Inspect spawn, listeners, and counts in code. Do not
stall for Chromium. A still is optional, in-session, deleted, and only for a
purely visual leftover doubt.

A failed harness does not automatically become the task. Leave a broader route
claim `unproven` and keep the production.

### 3.4 ROTATE

After the unit is committed, the next unit is a **different kind of value**,
not another copy of what just shipped. Consecutive units differ on at least
two fingerprint axes (`verb`, `subject`, `sector`, `domain`) and, on an
unscoped run, a **different workflow**.

When the request is unscoped (`INFERENCE` / `INFERENCE 8`), look again and
pick a **different kind of weakness you already saw** — not the next detect
cell. Detect does not rotate for you.

When the request names a type (`INFERENCE 3 MISSIONS`, `WF-08 3x`), stay in
that domain but rotate **kinds** inside it (escort, salvage, heist, emergency,
mystery — not three courier reskins). Each kind still arrives complete
(place + people + script + density). Completing those supporting pieces is
not scope creep; it is the unit.

Do not force a weak filler merely to touch a taxonomy slot. Skip a blocked or
thin candidate and rotate to the next direction that would unambiguously help.

## 4. SUPPORT-WORK BOUNDARY

Support work can unlock production; it cannot replace production.

Before support work beyond the current unit's required direct verification,
name the load-bearing uncertainty and the material delta the work could
produce. Proceed only when the user or governing specification requires it, a
relevant check failed or conflicts, a significant safety risk exists, or the
claimed result cannot otherwise be stated honestly. Use the narrowest adequate
method.

A failed harness does not automatically become the task. Repair verification
infrastructure only when it is explicitly requested or the smallest necessary
repair for the current production claim. Otherwise retain the failure
fingerprint, narrow or mark the broader route claim as unproven, and continue
production. Never rerun the same `(command, production digest, harness digest,
environment, failure fingerprint)` without a relevant change.

Support-only commits never count as production units. Their number is a
diagnostic signal, not a quota: two support-only commits without a new
production delta means stop that line and return to an eligible production
unit.

## 5. Review is evidence, not a recursive institution

The implementer remains responsible for checking its work. A separate cold
reviewer is required only when the user or governing specification requires
one, or a material high-risk boundary makes the independent perspective
load-bearing.

Review findings reopen work only when they can materially change the current
result, minimum fix, or significant risk. Confidence-only corroboration,
unrelated discoveries, and renewed general audits do not reopen a completed
unit.

No review file is required to record an `implemented` unit. A review file is
optional metadata for an `accepted` unit; route evidence, not reviewer theater,
supports acceptance.

## 6. Batches larger than five

For `N > 5`:

- commit and record every unit independently;
- preserve a running count of **complete** production units, not a speculative
  portfolio and not a pile of first drafts;
- rotate kinds of value as in §3.4;
- use an aggregate check only when the batch makes an aggregate claim that
  unit-level checks cannot support;
- do not stop production to create portfolio prose, reels, fresh graders, or
  acceptance infrastructure.

## 7. TERMINATION

Stop the task when `N` complete production units are committed and recorded,
when the user explicitly changes or stops the task, when the execution
environment ends, or when every remaining eligible unit has a concrete
external dependency or exact live-path collision. A blocked candidate,
unchanged failure fingerprint, or thin filler is skipped while other eligible
production units remain; it does not end the multi-unit request.

An interrupted or fully blocked run produces an honest partial result. Report
completed production units and exact remaining blockers without spending the
remainder polishing process artifacts or repairing the referee.

Forbidden stopping conditions include “until perfect,” “until no faults
remain,” “until every reviewer agrees,” and “until every acceptance cell is
green.”

Shipping `N` thin rows to hit the count is also a forbidden stopping
condition. Those units did not happen.

## 8. Value directions and workflow router

Round-robin across kinds of value that unambiguously help the game. Workflow
files are domain checklists and **depth bars**, not mandatory ceremonies.

| Direction | Typical WF | The player gets |
|---|---|---|
| A place that plays | WF-03 | A camera that can name the verb |
| Life in that place | WF-01 | Someone working for a reason |
| Pressure there | WF-02 | A fight that uses the geometry |
| A reason to go | WF-08 | An activity with a script |
| Memory of what you did | WF-09, WF-16 | The world changed |
| A new way to solve it | WF-05, WF-15 | A toy or a feel fix |
| How it looks or sounds once it already plays | WF-11, WF-12, WF-13 | Presentation of a real moment |
| A destination that is a place | WF-04 | Stations/planets you can use |
| A flow of value | WF-06, WF-07 | Industry and progression you can see |
| A thing to find | WF-10 | Curiosity with a physical site |
| Information that helps play | WF-14 | HUD/UI that serves a verb |
| Ingredients that do not yet compose | WF-17 | One playable beat |
| It technically exists and misses the point | WF-18 | Recovery / deletion |
| Density the engine cannot yet carry | WF-19 | Capacity that enables content |

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

Use `design/inference-workflows/07_WORKFLOW_ROUTER.md` when the symptom does
not identify a domain. Presentation (WF-11/12/13) does not rotate in until
something already plays.

### Missions as the worked example

`INFERENCE 3 MISSIONS` means three complete activities, different kinds, each
passing WF-08's depth bar:

1. a world-grounded premise;
2. a **placed** scene (geometry, toys, approach);
3. live participants at a density that can actually go wrong;
4. a **script** the player can feel without reading: assess, approach, commit,
   complication, resolve, aftermath;
5. at least two honest approaches;
6. a consequence through current owners (cargo, heat, ledger, wreck).

A board entry, an encounter JSON with `twist: none`, or "three more pirates
on the same rock" is not a unit. Placement and script are not extras; they
are the mission.

When composing the place, the twelve role tiles in
[`INFERENCE_INTENTIONAL_FUN.md`](./INFERENCE_INTENTIONAL_FUN.md) are a useful
language. They are not a requirement for every INFERENCE unit.

## 9. Recording

After committing a production slice:

```bash
node scripts/inference-record.mjs unit \
  --id <slug> --wf WF-XX --mode <mode> \
  --verdict implemented --verification focused_green \
  --commit <sha> --reason "<player-facing change>" \
  --fp "verb=...,subject=...,sector=...,domain=wf-xx"
```

Use `--verdict accepted --verification route_accepted --evidence <path>` only
when current route evidence genuinely supports that stronger claim.
`--review` is optional.

## 10. Final report

Return a compact production ledger:

```text
Requested production units:
Completed production units:
Accepted:
Implemented / focused green:
Implemented / route unproven:
Support-only commits:
CONSIDERED         three ideas in one line; why this one won (per unit)
Production commits and player-facing changes:
Checks run once:
Remaining blockers or next units:
```

The governing sentence:

> Think until the idea would actually play. Build that whole thing. Prove only
> the claim. Then rotate to a different kind of value.

## 11. How agents get this wrong

- **Thin volume.** Three mission rows, three enemy ids, three prop scatters.
  The count hit `N`. Nobody would remember any of them.
- **Favorite domain.** Bare `INFERENCE` and they add more enemies because
  enemies are easy to count. Look at play. Rotate kinds of weakness you saw.
- **Detector as assignment.** Implementing `inference-detect`'s top score.
  Counts cannot see architectural mistakes. Common sense is the selector.
- **Skipping CONSIDER.** Implementing the first idea that compiles.
- **Same thing three times.** Three couriers, three pirate tolls, three
  dressing passes. Rotate kinds.
- **Board without a scene.** Briefing text, no placement, no script, two
  ships where a fight needs a crowd.
- **New system instead of an extension.** A second mission runner because
  the live one needed a complication beat.
- **Presentation of emptiness.** VFX or new GLBs on a place that still has
  no verb.
- **Capture stall.** Headed stills as the review. Inspect the owner and
  print a number.
- **Feel via scenery.** Rocks to fake handling. Fun Loop owns guts.
- **Harness campaign.** Gallery, measurer, critic strip. Zero play.
- **Second queue.** A new PQ for inference work. Rank through Central Brain;
  build through INFERENCE.

## 12. Intentional-fun overlay

When the deficit is specifically "busy sim, undesigned moments," also use
[`INFERENCE_INTENTIONAL_FUN.md`](./INFERENCE_INTENTIONAL_FUN.md). Operator:
[`INFERENCE_INTENTIONAL_FUN_GOAL.txt`](./INFERENCE_INTENTIONAL_FUN_GOAL.txt).
Scope `INTENTIONAL`. It does not replace this contract, the Fun Loop, or the
queue. A gallery or bind table with no pocket is support-only. Headed
captures are not the review method.

## 13. Hygiene playbook (memory, staleness, round-robin)

[`INFERENCE_CONVERGENCE.md`](./INFERENCE_CONVERGENCE.md) is the developer-on-duty
mindset and cross-session memory: run `node scripts/inference-ledger.mjs`,
pick the weakest/stalest domain verifiable by looking, inspect, grade,
improve one thing completely (build, polish, simplify, optimize, or delete),
record the row in place, rotate. Inspections die when their paths change
(§3 staleness law); rows and gaps are capped and update in place (§4
anti-bloat law). Owner ideas enter at PICK via EXPAND or the capped
[`INFERENCE_IDEAS.md`](./INFERENCE_IDEAS.md) inbox (raw material, never a
queue). This section adds memory and intakes; it changes no rule above.
