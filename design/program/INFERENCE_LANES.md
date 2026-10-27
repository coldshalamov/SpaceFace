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

## 0.1 Directed catalog — the grunt pass

Owner, 2026-09-22. Two kinds of agent work this repo.

- A strong agent takes an open campaign in [`../../build_map.md`](../../build_map.md) §23.
  The campaign is a feeling. Invent the system. If it needs an outside resource, use the named
  list in [`../../docs/OPEN_SOURCE_INTAKE.md`](../../docs/OPEN_SOURCE_INTAKE.md) §0. A better
  foundation than the paragraph is the point.
- This pass, when [`INFERENCE_IDEAS.md`](./INFERENCE_IDEAS.md) has an OPEN catalog line,
  **does the line**. The line is already considered. It names the player-visible change,
  the owner, the done check, and what not to invent.

This catalog is the job only when the owner said INFERENCE. An empty `program-dispatch`
result is not that order. A "do N tasks" sitting claims free seams on `build_map.md` §1C
and does N open rows there. An OPEN line whose files sit in the seam you claimed is part of
that row: ship it or mark it already true, and do not count it as one of the N.

For bare INFERENCE or an explicit catalog request (not an explicit section-development
request under §0.2), when the catalog has an OPEN line, that line outranks
look-then-rotate (§0) and outranks a §23 campaign. `N` counts new complete production changes from catalog lines.
Take the first OPEN line whose paths are not in a live NOW row, not named by another CLAIMED
line, and not inside a seam another agent has claimed on §1C. The next line is a different
group (picture, verb, world, instrument, fight, econ, story, law, mach, pro, teach — the
seven latter opened by the Fable bank 2026-09-29) when one is free.

Do not EXPAND a catalog line into a new fantasy, a new system, or a second queue. If the
live owner already meets the done check, mark the line SHIPPED with "already true" and
take the next. Already-true checks, duplicate reconciliation, and status-only edits
are bookkeeping, not newly built production units; they do not count toward a
requested production N. If the line fights the vision, CUT it with one causal sentence and record
`--verdict cut`.

**Owner batching direction, 2026-10-11:** resolved small leaves of the same causal repair and
owner family may share scenario setup, adjacent checks and the meaningful integration critique.
Claim each line's exact paths and retain its individual done sentence. Complete that bounded
batch before rotating to an unrelated group. Count only distinct completed production outcomes;
shared scaffolding, receipts and already-true reconciliation add no units. A new unresolved
physical/design/system choice belongs on the build map, not in a grunt assignment. See
[`build_map.md` §1.9](../../build_map.md#19-agentic-production--short-learning-loops-complete-outcomes)
and the first integrated parent in [§29](../../build_map.md#29-professional-experience--the-complete-starter-region).

Look-then-rotate is what you do when the catalog has no OPEN line, or the owner named a
domain (`INFERENCE 3 MISSIONS`) instead of the catalog. A named domain still rotates kinds
inside that domain. It does not shop the catalog for a different domain unless the owner
said to.

`INFERENCE 8` is the same loop with a longer batch. `INFERENCE 3 MISSIONS`
stays in missions and rotates kinds inside that domain — still by looking,
not by adding three rows.

## 0.2 Explicit section-development requests — continue the existing area

If the owner asks to take a section, develop an area, or fill out the game/world,
that intent outranks catalog-first selection even when the request is called
INFERENCE. Use the relevant existing [`FINISH_LANES.md`](./FINISH_LANES.md) area
and its current live owners. Do not create another map, queue, or lane. Bare
INFERENCE and explicit catalog/row requests keep §0.1; named-domain requests
keep their existing scope unless the owner explicitly asks for area ownership.

At entry, name one bounded slice and its player-visible outcome within that
area. Read the existing lane and the relevant ledger finding/next action, then
inspect the ordinary route. Existing rows are the known work, not a ceiling on
what the named slice needs. Related catalog lines are constituent repairs,
not separate N credit and not permission to build an unrelated feature.

Design the required experience before limiting it to the current asset kit. Reuse
is an implementation choice, not a creative ceiling: if an absent hull, creature,
structure, mechanism or state is necessary, include its authored production and
live integration in the slice. Check for an equivalent shipped or unintegrated
asset first; neither automatic reuse nor automatic replacement is the goal.

Finish the named slice through existing owners, including the causal connections
needed for its outcome. Rotate after the slice is coherent, not between its
dependent leaves. Stop at the requested outcome or under §7's termination rules;
never turn area ownership into an unbounded run or invent a session timer.
One blocked leaf does not end an authorized multi-unit request while eligible
work remains. If the owner or execution environment ends the session, retain
incomplete work and name the next action in the existing ledger/owner context.
An unfinished slice is not counted complete.
Broader area acceptance remains with the existing lane; it need not hold a
finished local implementation hostage. Planning-only requests remain planning:
this route does not grant runtime implementation authority.

## 1. What `N` means

`N` is a positive integer target for **complete, independently useful
production units**, not an effort multiplier, candidate-pool size, review
quota, document count, or acceptance campaign.

Bare `INFERENCE` (no number, no scope) means **N = 5**. If the directed catalog
has an OPEN line, those lines are the N (§0.1). Otherwise it is the
look-then-rotate loop in §0. `INFERENCE 8` is the same rule with a longer batch.
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

## 3. PRODUCTION-FIRST — the loop for every unit

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

Evidence must cover the exact claim and its named boundary cases. Source
inspection establishes wiring; it does not establish an unobserved player
lifecycle. Keep `implemented`/`focused_green` for local proof, and retain any
broader acceptance action with the existing area owner. Do not promote nearby
unit tests to `accepted` for an ordinary route they did not exercise.

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
Requested production units: 30
Completed production units: 30
Accepted: 0
Implemented / focused green: 30
Implemented / route unproven: 0
Support-only commits: 30 memory rows, not counted — 83ff382cbf, d091d6cf67, 9a2dbb2a8a, 6d787d8791, d13e3e298d, 8491f7ae74, 5aae764cc2, c915645e1c, 7b9824e84c, 45e11497fb, 5d42446e4d, 36673ed57e, 1151303770, 40f5393b18, 229369d31e, 6276558484, 8c86516dde, a716821313, 0ce4e27b83, 9071269dc2, 2d456c58fa, 6994f9a64a, b27142d48f, 88fcc966c3, c294540bec, bcfa66ed3a, b827ac3ba4, a278a80570, d8b9ffd93a, 9dd74e1fb3
CONSIDERED         the taken sentence won because it was still false. The other two lost.
seed-sc-09: open mouth in the ice. A second stock prop, and a caption on the closed sheet, lost.
seed-sc-12: sixty fragments in a hollow sphere. A second stock prop, and a caption on the empty shrine, lost.
inf-clamp-stern-bolt: a dead-center stern shot hits the clamp and the load lets go. A new weapon, and a damage retune, lost.
inf-veil-planet: the veil step stops on the world's skin. A new blink mode, and a scenery pass, lost.
inf-pilgrim-call: the spine plays its own call. A migrant caption, and a new voice system, lost.
inf-pod-buyer: only the fence who buys pods takes a towed mayday pod. Paying every black market, and changing the lawful rescue fee, lost.
inf-hunter-dock: the ledger and the capture count only at the dock that choice names. Changing the posted pays, and retuning heat, lost.
inf-yard-starved: a thin hopper is named when the price jumps. Editing the economy writer, and changing the starve fill, lost.
inf-berth-goods: the yard names Composite Alloys and Fuel Cells. Changing the stage prices, and a new good, lost.
inf-trader-ports: the hired trader's card names the ports on its route. Undoing the automation polish, and a new trader system, lost.
inf-forty-tag: rocks beside the claim carry the Drift stake, and flying onto that face says the stamp is live. A map pin with no verb, and a second stake type, lost.
inf-bounty-standing: helping the hunter kill the quarry pays guild standing with the collector's cut. Changing the cut, and paying a surrender, lost.
inf-airlock-line: the scratched line stays readable when the dock opens. Adding graffiti, and lengthening the hold, lost.
inf-berth-gone: the nearer empty berth says the hauler is gone. Offering a second berth inside reach, and a new scan system, lost.
inf-weep-dry: an empty tank on a cracked hull does not seal the weep. Changing the hull fraction, and changing the weep rate, lost.
inf-nozzle-light: the warm light stays behind the nozzles when the ship turns. Moving the light's parent, and a second light pass, lost.
inf-printer-follow: the kill printer follows the ship through the wreck yard. Writing the wreck's velocity, and putting a position on the player, lost.
inf-solstice-crystal: scooping a bloom puts two Phosphor Crystals in the hold. Changing the amount, and editing the character sheet, lost.
inf-auction-lots: the middle-dud win spills Platinoid Ore with the Refined Metals. Counting every dud, and changing the lot amounts, lost.
inf-fine-again: a new warrant at the same desk offers the scan fine again. Clearing the fine while heat stays up, and changing the fine formula, lost.
inf-gate-quote: the chart quotes a gate hop as no fuel and a three-second align. Changing route weights, and editing sector data, lost.
inf-surveyor-mark: scanning the seam surveyor points at the mark that ship is working. Another worker destination, and a new job runner, lost.
inf-void-deposit: a voided contract says the deposit came back only when a deposit was charged. A new mission runner, and rewriting the older void pin, lost.
inf-chart-hold: the Economy tab counts the ore already in the hold. Reading a hull field the ship does not have, and a second chart, lost.
inf-repair-points: a short repair names the hull points the weld puts back. Unpicking the foreign sweep, and rounding the refuel quote the same way, lost.
inf-repair-price: the market repair choice names the price the yard charges. A partial-repair choice, and farming the ammo and refuel lists, lost.
inf-grudge-note: a berth that refuses the dock-slam note names the credits still owed. A second note sentence, and a punctuation pass, lost.
inf-berth-rumor: a berth keeps a pirate rumor in the sector it came from. Retuning rumor heat, and another wrong-sector headline, lost.
inf-relay-shelved: a launched hauler off the map is not paid as if it docked. Paying on the clock, and booking a freight loss while it is only shelved, lost.
inf-drone-recall: the recall names the credits the cap actually paid. Raising the passive cap, and holding the ore when the bucket is empty, lost.
Production commits and player-facing changes:
seed-sc-09 5c0734cd9b8affc13f941930a9cd047ae8f2fff3 — Haumea's fissure is a cracked ice sheet with an open mouth.
seed-sc-12 1af8e31616be8da51e3c1937adaa619a5a7ecb46 — Phoebe's shrine sits in a hollow sphere of sixty crystal fragments.
inf-clamp-stern-bolt cb51917ef47cdd2d8ded1378c9e5d12d070197ff — A dead-center shot into the tug's stern hits the clamp and the load lets go.
inf-veil-planet 46b17dc9983dc2b78c106e20e36bd7cd3f593d7a — The veil step stops on the world's skin.
inf-pilgrim-call ec222ba6a9691eebfb501aa902072cf2dd2b1d2f — A Pilgrim Spine plays its own call.
inf-pod-buyer d5067163de58fc190975db363d3bb297eebc50cc — Only the fence who buys pods takes a towed mayday pod.
inf-hunter-dock edf9aec1f925124f3a71d17644542e67bc24e5b7 — Filing a hunter ledger or finishing a capture only counts at the dock that choice names.
inf-yard-starved 5ddcbdd39df54432076e4ffe678b2479955e66c0 — A thin hopper at a yard is named when the price jumps.
inf-berth-goods 7d75d98a52406b56eec7193ac7658c05eba65875 — The Long Berth yard card and refusal name Composite Alloys and Fuel Cells.
inf-trader-ports d5d2ba8931387d14f0b5cd848d4476145885ee7e — A hired trader card names the ports on its route and on the last delivery.
inf-forty-tag 160f5fc1008ea6e5f4d58e5a0e159c7daf7b047c — Rocks beside Claim Forty-Tag carry the Drift stake, and flying onto that face says the stamp is live.
inf-bounty-standing a68d2a27a4523f5c7edbb6e60aff73e17e9ad44f — Helping a bounty hunter kill the quarry pays the guild standing with the collector cut.
inf-airlock-line cf6ece9d547ff794fec3170e2a03b0605809ea57 — A line scratched on the airlock stays readable, including THEY KNEW THE MASS.
inf-berth-gone 33469628691631b05a9eb210847173bb8af0a3ee — Standing at the nearer empty berth, the scan says the hauler is gone.
inf-weep-dry 88b1ef869b9d86ea8e99fa29098b6d57858da8bc — An empty tank on a cracked hull does not seal the weep.
inf-nozzle-light 3b512c0b15f00f62238d4bccb4b03c1f4a3d1c10 — The warm light stays behind the nozzles when the ship turns.
inf-printer-follow 847893aef07bb18eeaad23737f1fc7a4fdb67325 — The kill printer follows the ship through the wreck yard.
inf-solstice-crystal 20f04f85191f76445880e54b0a5d7cc01efaef8f — Scooping a Solstice bloom crystal puts two Phosphor Crystals in the hold.
inf-auction-lots fc7e1f3b89ea912f9db32717741cb3d3ce66be75 — Winning the platinoid crate at the middle-dud Drift Auction spills six Platinoid Ore.
inf-fine-again 95e18bf9fa29cf8d3f02a3b12ac18be68fe9d7e0 — A new warrant at the same desk offers the scan fine again.
inf-gate-quote ad1b3ba4acbbcbc1942238efcd14001187121785 — The chart quotes a gate hop as no fuel and a three-second align.
inf-surveyor-mark c6a40ea73cfb62b135fcb01c43382dbe7dca91b4 — Scanning the seam surveyor points at the mark that ship is working.
inf-void-deposit 090d61caa576a6f4caaf228defc2422aaf7ac079 — A voided contract says the deposit came back only when a deposit was charged.
inf-chart-hold daf38fa41dcfb9dfe01a6444837787ac3ef20276 — The chart Economy tab counts the ore already in the hold.
inf-repair-points e0a4c7eb51582499d76df1cfafea336e74cc5b31 — A short repair names the hull points that weld will put back.
inf-repair-price a459ec64052a023b7cf749ed1063b1efb45e2566 — The market repair choice names the price the yard charges.
inf-grudge-note f1e9927cde5432b980d564c9654fe4feaf9c6d50 — A berth that refuses a dock-slam note names the credits still owed.
inf-berth-rumor 8ccbb59fcef3e12b6bc00894925c64257aa3b3bf — A berth arrival does not repeat a pirate rumor from another sector.
inf-relay-shelved 158c8604baeb3b3ca7bc1853ca1e26e9b6432d4e — A launched relay hauler that is off the map is not paid as if it docked.
inf-drone-recall 0c7a49433fc31a9c2e0e45445ce4300f0d2ac2e2 — Recalling a mining drone names the credits that recall paid.
Checks run once: 89 focused tests, 89 pass, 0 fail, exit 0, on the clean checkout. check:baseline on that checkout: 17/17 checks passed; exit 1 is wall time 105313ms against a 90000ms budget (massline alone 105312ms). That budget fingerprint predates this batch. These thirty do not edit that owner.
Remaining blockers or next units: none. RC-49 stays released to ORRERY and was not taken.
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
anti-bloat law). Owner ideas enter at PICK via EXPAND. The directed catalog in
[`INFERENCE_IDEAS.md`](./INFERENCE_IDEAS.md) follows §0.1; only raw owner notes
have the capped-inbox treatment. Explicit section-development requests follow
§0.2. This section adds memory and intakes; it changes no precedence above.
