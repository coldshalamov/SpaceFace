# P4 — Set-Piece Mission Types

**Thread:** depth-P4 · **Reads:** root `AGENTS.md`, `docs/MODULE_MAP.md`, this pipeline,
`src/data/missions.js`, and `src/systems/missions.js` (the generator + completion dispatch) ·
**Status:** PLAN
**Thread pitch:** The mission engine is 3,170 lines and supports **10 archetypes** — but every one is a *single-stage, single-destination, single-threshold* activity: fetch, kill, or scan. After a few hours, procedural boards feel samey no matter how much art (P1/P3) or story (P2) you add, because the *shape of the activity* never changes. This pipeline adds **3–5 structurally distinct mission types** — boarding, blockade run, station defense, investigation, escort-with-twist — each a *new shape*, not a parameterized variant. Each new type creates a *class* of content the generator fills forever after. It is bespoke (not churn), small-batch, and the highest-leverage structural investment in the program.

---

## Ground truth (verified against the working tree 2026-07-12)

- **10 MISSION_TYPES** at `src/data/missions.js:113-194`. Shape: `{type, riskTierRange:[lo,hi], chainable, [collateral], completionEvent (string — documentation only), rewardFormula (string — doc only), timeFormula (doc only), taskTime, failureCondition (string), constraints:{...}}`. The formula/completion strings are **NOT executed** — live math is re-implemented inline in missions.js.
- **OFFER_MIX** at `src/data/missions.js:198-206` — 7 station-type rows, each a **positional array on `TYPE_ORDER`** (= `MISSION_TYPES.map(t => t.type)`, `missions.js:76`):
  ```
  // [cargo, trade, bounty, mining, salvage, escort, patrol, smuggling, passenger, recon]
  mining:      [3, 2, 1, 4, 2, 1, 1, 0, 1, 1],
  trade_hub:   [4, 4, 1, 1, 1, 2, 1, 1, 3, 1],
  military:    [1, 1, 4, 0, 1, 2, 4, 0, 1, 2],
  ...
  ```
  **Adding an 11th type means appending to `MISSION_TYPES` AND appending an 11th number to every one of the 7 rows.** A missing trailing element reads as weight=0 (never picked) but array-length mismatch is a latent footgun — the new check (§6) must enforce parity.
- **Offer generation:** `_generateOffers(info, epoch)` (`missions.js:515-546`) → `_pickType(weights, rng, repBoost, stationType)` (`:549-562`) → `_rollOffer` (`:565-621`) → `_rollParams(typeId, ...)` (`:592`). Reward is inline: `reward_cr = round(base * fDist * fRisk * fValue * fFaction * fTime)` where `base = MISSION_TUNING.BASE[typeId]` (`data/missions.js:6-10`).
- **Completion is HAND-WIRED per type, NOT data-driven.** Each type has its own `bus.on` listener in missions init (`missions.js:266-306`): `mining:yield`→`_onMiningYield`, `entity:killed`→`_onKill`, `scan:completed`→`_onScan`, `dock:docked`→`_onDockedObjectives`, `entity:destroyed`→`_onEntityDestroyed`. Each handler switches on `m.type`, increments `objectiveProgress`, and calls `_completeMission(m, i)` at a threshold. **There is no generic completion registry.** A new mission type needs a new event listener (or a new branch in an existing handler).
- **Structurally FIXED (the constraints this pipeline pushes against):**
  - **Single-stage.** No `stages`/`phase` field on a mission instance. `objectiveProgress` climbs to one `objectiveTarget`.
  - **One origin, one destination.** Offer shape has exactly `stationId` + `destStationId`/`destSectorId`. No waypoint/route list.
  - **One target set.** `m.targetEntityIds` is a flat array.
  - **One reward family.** `base * fDist * fRisk * fValue * fFaction * fTime`. No per-stage payouts.
  - **Linear chaining only.** `chainable` + `chainNextSeed` auto-offers one next leg. No branching within a mission.
- **`_completeMission`** at `missions.js:1988-2065`; `_advanceStory` (sole `beatIndex` writer) at `missions.js:2663`. Embodied-story offer injection at `_syncEmbodiedStoryOffer` (`missions.js:358, 366-400`).

KNOWN BUGS: no `MISSION_TYPES` structural validator exists (gap — `check:mission-standing-ladder` checks the standing ladder, not the type contract). No `check:missions` aggregate. The positional `OFFER_MIX` parity footgun is unguarded.

---

## §1. Why

No amount of art (P1/P3) or story (P2) fixes the *activity-shape* gap. If every mission is "fly to A, do X, fly to B," the game feels repetitive at the verb level regardless of how good the places and people look. P4 is the only pipeline that changes **what the player does**, structurally. And it's force-multiplier work: one new mission *type* (e.g. boarding) creates a *class* of boarding missions the generator fills across every station, every faction, every sector, forever. Three to five new types transforms variety for the cost of 3–5 bespoke implementations.

## §2. The design — five candidate new types

Each is a *new shape*. Ranked by (structural novelty × feasibility given the current engine).

### Candidate 1 — `boarding` (HIGHEST priority — the template)
- **Shape:** fly to a derelict/wreck, **dock with it** (new interaction), run a **multi-step onboard sequence** (scan → override → extract), defend against a boarder-counter, depart before a self-destruct timer.
- **Why new:** multi-stage onboard sequence; uses `dock:docked` in a new context (docking a *wreck*, not a station); ties to P1 landmarks (wreck_cathedral, well_mouth) and the `wreckClasses.js` salvage system.
- **Engine change:** add `stages`/`phase` field to the mission instance (the load-bearing structural change — unblocks candidates 2–5); new `boarding:completed` signal; new `bus.on` listener.
- **Stages at:** P1 wreck landmarks. Feeds `aftermathWrecks`.

### Candidate 2 — `blockade_run`
- **Shape:** deliver cargo to a blockaded station through a ring of interdicting hostiles, with a **time pressure** that's a *real fail condition* (not the opt-in `f_time` rush). Hostiles scale with attempted runs.
- **Why new:** time-pressure-as-primary-mechanic; spawns a * bespoke hostile placement* (a ring, not the standard squad template); reads the live economy's "blockade_relief" contract template (`economyContractTemplates.js`).
- **Engine change:** a `hardTimeLimit` flag distinct from `time_limit_s`; a bespoke spawner hook.

### Candidate 3 — `station_defense`
- **Shape:** dock at a station, accept the defense contract, **waves spawn and attack the station** (not the player directly); player must clear waves before the station's HP zero. Inverted agro — the station is the objective.
- **Why new:** the *station* is the fail-condition entity, not the player or an escortee. Reads the heat/faction system for who attacks.
- **Engine change:** a `protectEntityId` field + station-HP tracking (may already exist for stations — check); a wave-spawner.

### Candidate 4 — `investigation` (multi-clue)
- **Shape:** a **multi-location clue chain** — scan clue A at sector X → reveals clue B at sector Y → reveals target C. Not a single scan; a deduction.
- **Why new:** multi-destination route (breaks the one-origin/one-dest fixed structure); `scan:completed` chained; ties to P1 landmarks as clue sites and P2 story beats.
- **Engine change:** the `stages`/`phase` field (shared with candidate 1); a `clueChain` data structure; multi-dest offer shape.

### Candidate 5 — `escort_with_twist`
- **Shape:** escort mission where the escortee is **not what they seem** — at a mid-point they reveal hostile intent (turn coat) or signal ambush. The "twist" is authored per-instance.
- **Why new:** branching-within-a-mission (the escortee transitions from protect→threat); reuses `entity:destroyed` fail path but with a mid-mission inversion.
- **Engine change:** a mid-mission `phaseTransition` event; an escortee-faction-flip hook.

**Recommended batch:** **1 (boarding) + 4 (investigation) + 2 (blockade_run)**. These three share the `stages`/`phase` structural change (do it once), give a multi-stage combat mission, a multi-stage non-combat mission, and a time-pressure mission — three genuinely new shapes. Candidate 3 (station_defense) and 5 (escort_twist) are good follow-ons.

## §3. Architecture & wiring (touch files)

| Touch | Purpose | Notes |
|---|---|---|
| `src/data/missions.js` | add the new type to `MISSION_TYPES`; add its `MISSION_TUNING.BASE` entry; **append a column to every `OFFER_MIX` row** | the positional-array footgun — parity enforced by the new check |
| `src/systems/missions.js` | add `_rollParams` branch for the new type; add the completion `bus.on` listener / handler branch; **add the `stages`/`phase` field** to the mission instance for multi-stage types | the load-bearing file |
| `src/systems/missions.js` (`_completeMission`, ~1988) | support per-stage completion for staged types | branch on `m.stages` presence |
| `scripts/check-mission-types.mjs` (NEW) | structural validator: every type in `MISSION_TYPES` has all required fields; `OFFER_MIX` row lengths === `TYPE_ORDER.length`; every completion signal has a `bus.on` listener; every `MISSION_TUNING.BASE` key matches a type | iteration 0 deliverable |
| `src/data/missions.js` `MISSION_TUNING` | reward base + tuning for the new type | |

**Do NOT touch:** `test/*.expected.json` (goldens). `src/systems/input.js`. Legacy files. `STORY_BEATS` (P2 owns story embodiment; P4 types are generator content, though a P4 type *can* be used by a P2 embodied beat's `missionBoardContract.type`).

**Determinism note:** any new spawner (candidate 2 ring, candidate 3 waves) MUST use `state.rng`, never `Math.random()`, and MUST be seeded per-offer so `check:sim:compare` holds hashEqual. Document the seed source.

## §4. Key code — the structural change (stages) and the completion dispatch

The single load-bearing engine change (unblocks candidates 1, 4, and 5):

```js
// PROPOSED — extend the mission instance shape (missions.js offer construction ~:612)
{
  ...existing fields,
  stages?: [                          // NEW — present only for multi-stage types
    { id, signal, accept:[...], requiresPrior?: [...], target?: count_or_entityId },
    ...
  ],
  phase?: 0,                          // NEW — current stage index (missions increments)
  objectiveProgress: 0,               // EXISTING — now interpreted per-current-phase
  objectiveTarget: <current stage target>,  // now recomputed on phase advance
}
```

The completion dispatch that must learn about stages (today: per-type hand-wired, single threshold):

```js
// src/systems/missions.js — e.g. _onScan (~:1564) today:
function _onScan({ entityId }) {
  for (const m of activeMissions) {
    if (m.type !== 'recon_scan') continue;
    m.objectiveProgress++;
    if (m.objectiveProgress >= m.objectiveTarget) _completeMission(m, i);
  }
}
// PROPOSED — a stage-aware wrapper:
function _progressMission(m, i, signal) {
  if (m.stages) {
    const stage = m.stages[m.phase];
    if (!stage.accept.includes(signal)) return;
    m.objectiveProgress++;
    if (m.objectiveProgress >= (stage.target ?? 1)) {
      m.phase++;
      m.objectiveProgress = 0;
      if (m.phase >= m.stages.length) _completeMission(m, i);
      else { /* emit phase-advanced event for UI/story */ }
    }
  } else {
    m.objectiveProgress++;
    if (m.objectiveProgress >= m.objectiveTarget) _completeMission(m, i);
  }
}
```

A minimal new type entry:

```js
// src/data/missions.js — append to MISSION_TYPES
{ type: 'boarding', riskTierRange: [2, 4], chainable: false,
  completionEvent: 'boarding:completed (all stages resolved)',
  rewardFormula: 'round(150 * (1 + distance/2000) * RISK_MULT[riskTier] * stageCount * f_faction * f_time)',
  timeFormula: 'round((distance/140 + stageCount*40) * slack)', taskTime: 'stageCount*40',
  failureCondition: 'self-destruct timer OR player abandons wreck zone',
  constraints: { isStaged: true, needsWreckTarget: true } },
```

## §5. The type backlog

| Pri | Type | New shape | Shares `stages` change? | Stages at (P1) | Recommended batch |
|---|---|---|---|---|---|
| 1 | `boarding` | multi-stage onboard wreck sequence | YES (defines it) | wreck_cathedral, well_mouth | **Batch 1** |
| 2 | `investigation` | multi-location clue chain | yes | clue-site landmarks | **Batch 1** |
| 3 | `blockade_run` | time-pressure-primary, ring spawner | no (single-stage but hard-fail) | blockaded station | **Batch 1** |
| 4 | `station_defense` | station-as-objective, wave spawner | no | defended station | Batch 2 |
| 5 | `escort_with_twist` | mid-mission faction flip | yes (phaseTransition) | escort route | Batch 2 |

**First worked example (the template):** `boarding`. It defines the `stages`/`phase` field, the stage-aware completion wrapper, the new `boarding:completed` signal + listener, the `MISSION_TUNING.BASE` entry, and the `OFFER_MIX` column append. **Build iteration 0 (the `stages` field + wrapper + check script) first**, then the boarding type on top, then investigation (reuses stages), then blockade_run.

## §6. Libraries / tooling

- **No new runtime deps.** Pure data + missions.js engine work.
- **New acceptance check required (iteration 0):** `scripts/check-mission-types.mjs` — asserts (a) every `MISSION_TYPES` entry has `{type, riskTierRange, completionEvent, failureCondition}`, (b) `OFFER_MIX` row lengths === `TYPE_ORDER.length` (the parity guard), (c) every `MISSION_TUNING.BASE` key matches a `MISSION_TYPES.type`, (d) every type's completion signal has a corresponding `bus.on` listener in `missions.js` (grep the source). Model on `check-mission-standing-ladder.mjs`. Wire as `check:mission-types`, add to the `check` aggregate. **This check must exist before any new type lands** — it guards the positional-array footgun for all future work.

## §7. Build plan

### Iteration 0 (the structural prerequisite)
1. Build `scripts/check-mission-types.mjs` (iteration 0 check). Wire `check:mission-types`. Run it — it should pass on the current 10 types (and expose any pre-existing parity drift).
2. Add the `stages`/`phase` fields to the mission instance constructor (no-op for existing types — `stages` is optional).
3. Add the `_progressMission(m, i, signal)` stage-aware wrapper; migrate one existing handler (e.g. `_onScan` for `recon_scan`) to it as a proof. Run `npm run check:sim:compare` (must stay hashEqual:true — the migration is behavior-preserving).
4. Commit-... no — `git add -N` the new check script. Print baseline.

### Per type (boarding first)
1. Add the type to `MISSION_TYPES` + `MISSION_TUNING.BASE` + the new `OFFER_MIX` column (all 7 rows).
2. Add the `_rollParams` branch + the completion `bus.on` listener / handler.
3. For staged types, define the stage sequence; wire `_progressMission`.
4. For types needing a bespoke spawner (blockade ring, defense waves), add the spawner — seeded per-offer via `state.rng`.
5. Run `check:mission-types`, `check:mission-standing-ladder`, `npm run check:sim:compare` (hashEqual:true — or flag a deliberate golden re-record with a named reason if the new type perturbs determinism), `node scripts/check-tether-gameplay.mjs`.
6. Playtest one generated instance of the new type (default game path). Screenshot the board offer + the in-mission state into `.devshots/`.
7. Update `**Status:**`. Print 10-line summary.

## §8. Anti-patterns

- **DON'T** add a type without appending the `OFFER_MIX` column to all 7 rows — the positional-array footgun silently makes it unpickable, and pre-iteration-0 there's no guard.
- **DON'T** use `Math.random()` or wall-clock in a new spawner — determinism is sacred (AGENTS.md §6). Seed per-offer via `state.rng`; document the seed.
- **DON'T** edit `test/*.expected.json` to make `check:sim:compare` pass. If a new type genuinely perturbs the golden, flag it for a deliberate re-record batch with a named reason (AGENTS.md §6 / §9).
- **DON'T** hand-wire completion in a way that bypasses `_completeMission` — rewards, story advance, and rep all flow through it.
- **DON'T** make a new type that's structurally identical to an existing one (another fetch/kill/scan variant). The whole point is a *new shape*. If you can't articulate the new shape in one sentence, don't build it.
- **DON'T** couple a new type to `STORY_BEATS` advancement — P4 types are generator content. A P2 embodied beat may *use* a P4 type (`missionBoardContract.type`), but the type itself is spine-agnostic.
- **DON'T** build all 5 candidates at once. Batch 1 (boarding + investigation + blockade_run) shares the stages change; land it, playtest, then decide on Batch 2.

## §9. Ambition ceiling

Once 3–5 new shapes exist, the generator composes them: a `boarding` mission that reveals an `investigation` clue-chain that ends in a `blockade_run`. Multi-type chains (extending the current linear `chainNextSeed` to a *typed* chain) are the natural ceiling — missions that are themselves mini-campaigns. Beyond that: **player-authored missions** (the claim system + automation could let a player post a contract), and **faction-specific signature mission types** (only Reach posts `smuggling`-adjacent types; only Concord posts `patrol` variants) — tying P4 to P3's faction identity. Don't build the ceiling in P4-first-pass; land the 3 shapes and let the generator prove they compose.

---

## Dispatch block (copy into the agent thread)

> **You are THREAD depth-P4 — Set-Piece Mission Types only.**
>
> Read in order: root `AGENTS.md` (especially determinism and live-backend routing) ·
> `docs/MODULE_MAP.md` mission routing · this file · `src/data/missions.js` (`MISSION_TYPES`,
> `OFFER_MIX`, `MISSION_TUNING`) · the live `src/systems/missions.js` generation, completion, and
> progression seams. Verify dated line numbers before editing.
>
> **Target type:** `<TYPE>` (e.g. `boarding` — see §5 backlog) **OR iteration 0** (the structural prerequisite).
>
> **Iteration 0 (must land first):** build `scripts/check-mission-types.mjs` (wire `check:mission-types`); add the `stages`/`phase` fields; add the `_progressMission` stage-aware wrapper; migrate one handler as proof; `check:sim:compare` must stay hashEqual:true.
>
> **Do (per type):** add to `MISSION_TYPES` + `MISSION_TUNING.BASE` + the `OFFER_MIX` column (ALL 7 rows); add the `_rollParams` branch; add the completion `bus.on` listener/handler; for staged types define the stage sequence; for bespoke spawners seed per-offer via `state.rng`; run the acceptance checks; playtest one generated instance.
>
> **FORBIDDEN:** adding a type without the full `OFFER_MIX` column. `Math.random()` or wall-clock in a spawner. Editing `test/*.expected.json` to pass `check:sim:compare`. Bypassing `_completeMission`. A "new type" that's structurally a fetch/kill/scan variant. Coupling a type to `STORY_BEATS` advancement. Building all 5 candidates before playtesting Batch 1. Editing `src/systems/input.js` or legacy files.
>
> **Acceptance:** `node scripts/check-mission-types.mjs` green (after iter 0) · `npm run check:mission-standing-ladder` · `npm run check:sim:compare` (hashEqual:true, or named deliberate re-record) · `node scripts/check-tether-gameplay.mjs` · playtest screenshot pair (board offer + in-mission) in `.devshots/`.
>
> `git add -N` every new file immediately. Print a 10-line summary: which type, the one-sentence new shape, engine changes (stages? new listener? spawner?), OFFER_MIX column added to all 7 rows, which checks green, determinism-preserved how, screenshot paths, deferred items.
