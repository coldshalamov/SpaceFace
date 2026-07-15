# P2 — Story-Beat Embodiment

**Thread:** depth-P2 · **Reads:** `00_DEPTH_PROGRAM.md`, `design/spec2/00_MASTER_TASTE.md`, `src/story/campaign47a/` (the existing pattern), `src/systems/story.js`, `src/systems/missions.js` (story-trigger regions), `src/data/missions.js`, `src/data/narrative.js` · **Status:** PLAN
**Thread pitch:** The 8-beat story spine and 17 campaign-47a beats already exist as *prose and objective-trackers*, and campaign-47a already has a working **embodied-mission pattern** that turns a beat into real player actions (mine → dock → identify → resolve). This pipeline does *not* build a new story system — it **deepens each beat's embodiment** and stages it at a signature location (from P1), with a tied encounter, a custom comms voice, and a memorable set-piece. It is the narrative-actualization pipeline you described as your priority.

---

## Ground truth (verified against the working tree 2026-07-12)

- **The spine:** `STORY_BEATS` — 8 beats at `src/data/missions.js:212-229`. Shape: `{beat, id, objective, reward, introduces, next}`. Beat ids: `cold_start → honest_work → first_blood → bigger_boat → pick_a_side → proving_ground → empire_seed → deep_reach`.
- **The embodiment pattern already exists.** `src/story/campaign47a/embodiedMissions.js:82-178` defines `EMBODIED_MISSIONS` — exactly 8 entries, one per beat, with `physicalContact` steps that bind world signals (`mining:yield`, `dock:docked`, `scan:completed`, `tether:reel`, `entity:killed`) into ordered sequences. **The pipeline extends this pattern; it does not invent one.**
- **The narrative overlay:** `src/systems/story.js` (1074 lines) owns NO progression. It reads `state.story` (owned by missions) and, on `story:beatAdvanced{fromIndex,toIndex,branch}` (`story.js:86`, emitted by missions at `missions.js:2689`), fires the beat's devices from `BEAT_CONTENT` via `_onBeatAdvanced` (`story.js:172-221`).
- **The prose:** `BEAT_CONTENT` at `src/data/narrative.js` covers the playable B0-B7 spine; triggered extensions use `POST_SPINE_BEAT_CONTENT`. Both use shape `{beat, phase, hint, graffiti:[{line, where, delayS?, author?}], comms:[ids], hudLie}`.
- **Transition sidecar (read-only):** `src/story/campaign47a/campaignTransitions.js` observes `state.story`, records step progress / fail-recovery, **never advances `beatIndex`**. Sole writer of `beatIndex` is missions' `_advanceStory` (`missions.js:2663`).
- **Validator exists:** `validateEmbodiedMissions()` at `embodiedMissions.js:412-432` asserts beat-count match + id parity + canonical signals. Exercised by `test/story-campaign47a-embodied-missions.test.mjs` (run via `node scripts/check-m5-story-progression.mjs`).
- **Contact/dialogue:** `src/story/campaign47a/embodiedDialogue.js` — `card()` factory (id/name/roleLabel/stationHint/blurb/namedCaptainId) and `line()` factory (id/beatIndex/variant/contactId/sender/text/choiceId). The live file may still contain legacy word-count constants; they are implementation history, not a universal prose-quality law. Judge copy by clarity, voice, display duration, localization resilience, and player-route readability, and coordinate any validator change with the owning story task.
- **`state.story` ownership (story.js:18-31):** missions owns `beatIndex, branch, flags, chainProgress`; story owns `phase, seenComms, ambientQueue, ambientTimerS, rngSeed, scheduled, graffitiShown, endgameChoice`.

KNOWN BUGS: none P2-specific. The M5 story checks exist as test files under `test/` and run via `scripts/check-m5-story-progression.mjs` — they are **not** wired into `npm run check:*`; run them explicitly.

---

## §1. Why

Campaign 47-A is already a genuine interactive story — but the beats are **thin and under-staged**. Beat 0 is "mine, then dock." Beat 1 is "deliver cargo." The richest beat (B2 `first_blood`) has scan→tether, a named story target (Elroy), and an aftermath hook — that is the **shape every beat should have**, and most don't. The story is laid out (23 worldbuilding docs, 5 endings, 10 contacts); what's missing is the **actualization** — making each beat a set-piece you fly and remember, staged at a place (P1) with a voice and a consequence.

## §2. The design

"Deepening a beat's embodiment" means adding (or enriching) five things, in this priority order:

1. **A physical-contact sequence** that uses *multiple* world signals in an *ordered* way (not a single threshold). B2's `identify → resolve` is the template. A beat that currently fires on one signal should grow a second staged step.
2. **A signature location** (from P1). The beat's `location.zoneId` / `location.poiId` should resolve to a place with a landmark, not a generic POI.
3. **A tied encounter** via `encounterDirector` (authority field `encounters:'encounterDirector'`). The beat should *meet* someone, not just receive a comms.
4. **A custom comms voice** — a `primary` and `failure_recovery` variant in `BEAT_COMMS` (`embodiedDialogue.js:34-56`), concise enough to read in play but long enough to carry voice and actionable meaning.
5. **A consequence** — a `storyTarget` (named NPC), an `aftermath` (combat wreckage via `aftermathWrecks`), or a `consequenceRoute` (B3) / `consequenceStakes` (B4). Beats that *cost* something are remembered.

**Hard constraint — do NOT advance progression outside missions.** The transition sidecar (`campaignTransitions.js`) is read-only by contract. Beat advancement happens only via missions' `_advanceStory`. This is the #1 way an enthusiastic agent breaks the spine.

## §3. Architecture & wiring (touch files)

| Touch | Purpose | Notes |
|---|---|---|
| `src/story/campaign47a/embodiedMissions.js` | deepen the target beat's `EMBODIED_MISSIONS[beat]` entry | main work — add steps, storyTarget, aftermath, consequence routes |
| `src/story/campaign47a/embodiedDialogue.js` | add `primary` + `failure_recovery` comms + any contact card | preserve voice, legibility, localization, and the live dialogue schema; do not truncate meaningful copy to satisfy an inherited word count |
| `src/story/campaign47a/campaignTransitions.js` | **only if** the beat needs a new step-validation rule | read-only contract — do not add progression writes |
| `src/data/narrative.js` | enrich `BEAT_CONTENT[beat]` (hint/graffiti/comms/hudLie) | the prose the overlay fires |
| `src/data/missions.js` | **rarely** — only if the beat's reward/objective in `STORY_BEATS` genuinely changes | the spine is frozen-ish; prefer enriching embodiment, not rewriting the beat def |
| `src/systems/missions.js` | **only if** the beat needs a new world-signal listener (e.g. a new `bus.on` for a P4 mission type) | fan-in is `_storyTrigger` (`missions.js:2455`); see §4 |
| `src/systems/story.js` | **rarely** — `_onBeatAdvanced` already fires BEAT_CONTENT; usually no change needed | only if the beat needs a bespoke overlay device |

**Do NOT touch:** `test/*.expected.json` (goldens — determinism). `src/systems/input.js` (lead-only, AGENTS.md §6). Legacy `flight.js`/`ai.js` (no effect).

## §4. Key code — the embodiment entry shape & the trigger fan-in

The entry shape to extend (B2 `first_blood` is the gold-standard template — copy it):

```js
// src/story/campaign47a/embodiedMissions.js — the contract per beat
{
  beat, id, contactId, contactName,
  location: { sectorId, stationId, [fieldId], [destSectorId], [destStationId], [zoneId], [poiId] },
  physicalContact: {
    mode: 'ordered_and' | 'mission' | 'any' | 'existing_branch_intro' | 'chain_count' | 'observe',
    steps: [ { id, signal, accept:[...canonical signals...], requiresPrior?, requireStoryTag?, requireChainComplete? } ],
    gate?: { netWorthCr?, repMin? }   // for observe-only beats
  },
  missionBoardContract: <real contract from MISSION_TYPES> | null | { kind:'existing_branch_intro'|'branch_chain', storyTag },
  consequenceRoutes?, consequenceStakes?, empireSeedPrograms?, observeOnly?, aftermath?,
  recovery: '<clear recovery hint>',
  careerIds: [...],
}
```

The world-signal fan-in (how a player action reaches the beat):

```js
// src/systems/missions.js:2455 — _storyTrigger(kind, data) is the spine fan-in.
// World listeners (missions.js:266-306) call it: dock:docked, mining:yield,
// entity:killed, scan:completed, tether:reel, ship:purchased, asset:deployed,
// automation:programAssigned, sector:enter. Each fans to per-beat handlers.
// recordBeatStep (campaignTransitions.js:115) then enforces ordered-AND;
// isBeatStepsComplete gates _advanceStory (missions.js:2663, the SOLE beatIndex writer).
```

Canonical step signals (must be one of — `embodiedMissions.js:23-29`): `mining:yield` / `dock:docked` / `entity:killed` / `scan:completed` / `tether:reel` / `mission:completed` / `sector:enter` / `salvage:communicatorFound` (B8) / `automation:programAssigned` (B6) / `asset:deployed` (B6). **A new step signal requires a matching `bus.on` listener in missions.js init** — that's the only reason to touch missions.js.

## §5. The beat backlog — depth priorities

Ordered by "current embodiment thinness × story weight." Each row is one iteration. The template beat (B2) is already rich — others copy its shape.

| Pri | Beat | Current embodiment | Depth to add | Stages at (P1 landmark) | Voice |
|---|---|---|---|---|---|
| **0 (template)** | B2 `first_blood` | scan→tether, Elroy, aftermath | **already rich — use as template, polish only** | `zone_charon_ambush` (charon) | Rook |
| 1 | B0 `cold_start` | mine → dock (2 steps) | add a `scan` identify step + a Pit-convoy lore comms + tie to Memorial landmark | `zone_helios_memorial` / `place_landmark_pit_anchor` (P1#3) | Kessler |
| 2 | B7 `deep_reach` | observe-only, gate on netWorth | add a physical `sector:enter` step at the Vault Maw + an endgame comms beat | `zone_ashfall_vault` / `place_landmark_vault_maw` (P1#4) | Director Vale / Kurtz |
| 3 | B6 `empire_seed` | asset:deployed (1 step) | add `automation:programAssigned` as a 2nd ordered step + consequence stakes | player claimable body (claimableBodies.js) | Kurtz |
| 4 | B3 `bigger_boat` | ship:purchased (1 step) | add a `dock` step at the shipyard + a consequence route (the "bigger boat" as a choice with a cost) | station shipyard | Kessler |
| 5 | B4 `pick_a_side` | branch_intro | add consequence stakes per branch + a tied encounter per faction chosen | faction station (P3 livery) | faction contact |
| 6 | B5 `proving_ground` | chain_count | add a named storyTarget (a 2nd ace) + aftermath | `zone_io_derelict` / `place_landmark_wreck_cathedral` (P1#1) | named captain |
| 7 | B1 `honest_work` | mission:completed (1 step) | add a `scan` anomaly step en route + a Tycho-variance lore beat | en-route between Helios↔Tethys | Kessler |

**First worked example (the template):** polish B2 `first_blood` — it is already the richest beat; use it to *codify the pattern* (multi-step, storyTarget, aftermath, primary+recovery comms, signature zone) that B0/B7/etc. then copy. Then iteration 1 proper = **B0 `cold_start`** (add the scan identify step + Pit-convoy comms + Memorial landmark tie).

## §6. Libraries / tooling

- **Prefer the existing seams.** This pipeline is expected to be mostly data plus occasional missions wiring because `encounterDirector`, `aftermathWrecks`, `campaignTransitions`, and `story.js` already cover the core need. A runtime or build dependency is still allowed when it materially improves the result and its license, bundle/performance, determinism/save, and maintenance impact are documented.
- **New acceptance check recommended:** a `scripts/check-story-beat-embodiment.mjs` that, for each beat, asserts ≥2 `physicalContact.steps` (or an `observe` gate), a `recovery` string, a `primary` comms variant, and a `consequenceRoutes`/`aftermath`/`storyTarget`/`observeOnly` field (i.e. "the beat has a consequence"). Model it on `scripts/check-mission-standing-ladder.mjs` (data-contract flavor) and call `validateEmbodiedMissions()` first. Wire it as `check:story-beat-embodiment` and add to the `check` aggregate. **Build this check as iteration 0** so every subsequent beat lands against it.

## §7. Build plan (per beat)

1. Read the target beat's current `EMBODIED_MISSIONS[beat]` entry, its `BEAT_CONTENT[beat]`, and its `STORY_BEATS[beat]`.
2. Decide the depth adds (§5 row's "Depth to add"). Confirm the staging location's P1 landmark status — if the landmark isn't built yet, either (a) block on P1, or (b) stage at the existing POI and add a TODO to re-stage when the P1 landmark lands. **Don't silently leave it un-staged.**
3. Add the `physicalContact` steps (ordered-AND), keeping all `signal` values canonical. Add a `storyTarget` / `aftermath` / `consequenceRoutes` as appropriate.
4. Add `primary` + `failure_recovery` comms in `embodiedDialogue.js`. Review them at the real display duration and enrich the contact card if needed.
5. Enrich `BEAT_CONTENT[beat]` (hint, graffiti, comms refs, hudLie) in `narrative.js`.
6. If the beat needs a new world-signal listener, add it in missions.js init → `_storyTrigger`. Otherwise, no missions.js change.
7. Run acceptance: `node scripts/check-m5-story-progression.mjs` green · `node scripts/check-story-beat-embodiment.mjs` green (after iteration 0) · `npm run check:sim:compare` (hashEqual:true) · `node scripts/check-tether-gameplay.mjs`.
8. Run `npm run check:story-beats` and `npm run check:encounter-director` if the beat adds an encounter.
9. Screenshot the beat's comms/graffiti in-play into `.devshots/` (default game path).
10. Update this doc's `**Status:**` line. Print the 10-line summary.

## §8. Anti-patterns

- **DON'T** advance `beatIndex` from anywhere but missions' `_advanceStory`. The transition sidecar is read-only by contract; violating this double-advances beats and corrupts the spine.
- **DON'T** use a non-canonical step `signal`. The validator rejects it. If you genuinely need a new signal, add the `bus.on` listener in missions.js first.
- **DON'T** rewrite `STORY_BEATS` reward/objective casually — the spine is the contract. Enrich *embodiment*, not the beat definition, unless the beat def is genuinely wrong.
- **DON'T** turn comms into unreadable text walls or strip them down until voice and instructions disappear. Use player-route timing, localization, and legibility evidence rather than a universal word count.
- **DON'T** write progression state from `story.js` — it's an overlay, read-only on `state.story` progression fields.
- **DON'T** leave a beat "sometimes staged" (landmark not built) without a tracked TODO — Wired Feature Policy rejects half-wired work.
- **DON'T** touch `test/*.expected.json` to make `check:sim:compare` pass — fix the code or flag the golden for a deliberate re-record batch with a named reason.

## §9. Ambition ceiling

A fully-embodied spine is the foundation for the **5 endings (A–E + sandbox)** at `src/story/endings/endingDefs.js`. Each ending currently resolves as a summary + hiddenCost prose; the ceiling is making each ending a *final set-piece* (a last fly-to, a last choice, a last consequence) staged at a signature landmark (the Vault Maw for the Kurtz ending, the Memorial for Clean Uniform, the wormhole for Only Honest). That's P2's natural sequel — a "P2-endings" mini-pipeline — but only after the 8 spine beats are each a real set-piece. Don't build endings in P2-spine; scope them separately.

---

## Dispatch block (copy into the agent thread)

> **You are THREAD depth-P2 — Story-Beat Embodiment only.**
>
> Read in order: `AGENTS.md` §1, §3, §5, §6 · `design/spec2/00_MASTER_TASTE.md` · `design/depth-program/00_DEPTH_PROGRAM.md` · `design/depth-program/P2-story-beat-embodiment.md` (this file) · `src/story/campaign47a/embodiedMissions.js` (the B2 entry is your template) · `src/story/campaign47a/campaignTransitions.js` · `src/story/campaign47a/embodiedDialogue.js` · `src/systems/story.js` · `src/data/narrative.js`. Then stop reading and do the work.
>
> **Target beat:** `<BEAT_ID>` (e.g. B0 `cold_start` — see §5 backlog row).
>
> **If this is iteration 0:** build `scripts/check-story-beat-embodiment.mjs` first (model on `check-mission-standing-ladder.mjs`), wire it as `check:story-beat-embodiment`, then run it against the current beats to establish the baseline. Subsequent beats land against it.
>
> **Do:** deepen the beat's `physicalContact` steps (≥2 ordered, or an `observe` gate), add a consequence (`storyTarget`/`aftermath`/`consequenceRoutes`), add readable and voice-specific `primary`+`failure_recovery` comms, enrich `BEAT_CONTENT`, confirm the staging location (P1 landmark or tracked TODO), run the acceptance checks.
>
> **FORBIDDEN:** advancing `beatIndex` outside missions' `_advanceStory`. Writing progression state from `story.js`. Non-canonical step signals. Rewriting `STORY_BEATS` casually. Editing `test/*.expected.json`. Editing `src/systems/input.js`. Unreadable comms walls. "Sometimes staged" work without a tracked TODO.
>
> **Acceptance:** `node scripts/check-m5-story-progression.mjs` green · `node scripts/check-story-beat-embodiment.mjs` green (after iter 0) · `npm run check:story-beats` · `npm run check:sim:compare` (hashEqual:true) · `node scripts/check-tether-gameplay.mjs` · screenshot pair in `.devshots/`.
>
> `git add -N` every new file immediately. Print a 10-line summary: which beat, what depth added, which signals/consequences, staging location + landmark status, which checks green, screenshot paths, deferred items.
