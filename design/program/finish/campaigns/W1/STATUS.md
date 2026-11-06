<!-- LIFETIME: CAMPAIGN -->
# W1 STATUS

**Phase: IMPLEMENTATION LANDED — act framing + story-first board + March emitter committed
(fe1e3bb). Play-walk blocked by foreign in-flight flight-mode breakage (evidence below).**

## Done (2026-11-06)

1. **Doc phase** (owner approved via "build all the things"): DIAGNOSIS.md, three inventories +
   consolidated INVENTORY.md, JOURNEY.md (4 acts; heist re-scope correction recorded).
2. **Implementation** (commit fe1e3bb, exact paths):
   - `src/data/journeyActs.js` (NEW) — the four-act table, dependency-free.
   - `src/systems/missions.js` — `storyBeatTitle` prefixes the act on story waypoint/tracker
     labels ("The Pit · Cold Start" style).
   - `src/systems/missionStoryOps.js` — the beat-advance toast opens the act by name on act-turn
     beats (B2→Act II, B4→Act III, B6→Act IV).
   - `src/ui/station/stationMissionModel.js` — campaign47a book/chain/intro rows outrank
     procedural board rows and recommend as **THE BOOK**; blocked rows still name the book and
     demand prep; disposition filings are never recommended.
   - `src/systems/stationContacts.js` — `march.reconciliation` writer (aftermath wreck
     recoveries, deduped per wreck) — the last frozen depth counter now moves.
   - `src/data/missionsData.js` (NEW) — verbatim restore of the pure mission data, recovery
     anchor for the unclaimed `data/missions.js` overwrite incident (see NOW.md defect note).
3. **Focused checks (green, on the coherent architecture):**
   - `test/w1-journey-framing.test.mjs` — 5/5: acts tile beats 0–7 exactly; act mapping incl.
     boundaries; book job outranks juicier procedural rows (label THE BOOK); branch intros count
     as journey steps; disposition filings never recommended; blocked book names prep.
   - `test/w1-march-reconciliation.test.mjs` — 2/2: one wreck files once (dedup), counter clamps
     at def max, id-less payloads are no-ops.
   - Attribution A/B: reverting my four implementation files does NOT change any failing
     behavior (probe: game:new → flight fails identically at pre-change versions).

## Blocked: the W1 Verify play walk (act 1 on the ordinary route)

- The working tree's `game:new → flight` transition is broken by foreign in-flight edits
  (~25 modified src files owned by other lanes: world.js, input.js, bootMediaPlayback.js,
  swarmBrood, waveMaterialization, renderer, orrery, …). Evidence: `check-game-playable` BOOT
  fails (sf:false at 60 s) with zero uncaught errors and all assets served; a direct CDP probe
  shows the sim lane starts and three.quarks loads but flight mode never arrives after
  `game:new`; `capture-gameplay` reproduces on a live server. A/B with HEAD versions of my
  files reproduces identically — not this change set.
- Also pre-existing: `test/story-campaign47a-live.test.mjs` fails (B0 advance 0 !== 1) with and
  without my files — foreign in-flight state; A/B-proven.
- Interlude reliability (piece 3): wired in code (`missionStoryOps` 4 s scan + retry); its
  fire-rate on the ordinary route is part of the blocked play walk.
- Ten-moments check: pending the same walk. The persistent "what do I do next" surface it will
  check already exists (`_ensureStoryWaypoint` covers every beat incl. world-work steps) and now
  carries act names.

## Resume here (next agent)

1. When the foreign flight-mode breakage lands/heals: run `node scripts/check-game-playable.mjs`
   (boot gate), then walk act 1 fresh-save on the ordinary route with the Browser pane VISIBLE:
   B0 mine → skim → dock Helios; B1 alloy run → Scale 4 → furnace detail; verify act labels
   ("The Pit · …"), the B2 act-turn toast (ACT II), interludes firing, and the ten-moments check.
2. Publish W1 doc+impl paths (local master currently ahead of origin with shared commits).
3. Then W5 (first hour, Gold) consumes act 1.

## Paths claimed (NOW.md)

Implementation: `src/data/journeyActs.js`, `src/data/missionsData.js`, `src/systems/missions.js`
(act framing import + title prefix only), `src/systems/missionStoryOps.js` (import + act-turn
toast only), `src/ui/station/stationMissionModel.js` (recommendation policy only),
`src/systems/stationContacts.js` (March listener + handler only), `test/w1-*.test.mjs`,
`finish/campaigns/W1/*`, NOW.md append-only sections. `src/data/missions.js` working-tree state
belongs to the unclaimed refactor; Lane 5's repairs to it are recorded in NOW.md and are NOT
committed.

## Publish state

Doc phase published (with the 616aecbc tree repair — see git log). Implementation commit
fe1e3bb is local; publish follows the paths-only procedure when this phase closes.
