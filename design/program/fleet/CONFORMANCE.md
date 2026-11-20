<!-- LIFETIME: HUNT-LEDGER -->
<!-- HISTORY-2026-11-20 -->
> **History, not instructions (2026-11-20).** This file no longer assigns, orders or blocks any work.
> States such as READY, TAKEN, HOLD, PARKED and NEEDS-PACKET mean nothing now. Read it for facts
> about what was built or planned. The rule and the live board are in the root `AGENTS.md` and
> `design/overhaul/12_PIPELINE.md`.

# Spec→code conformance ledger

One pass: every `design/game/` claim traced to live source. This is a **hunt artifact** —
findings are candidates until a verifier reproduces them on a route. It is not a plan doc
(see `18_SOUND_LOOK_AND_DONE.md`); it exists to generate bounded packets, then gets retired
as rows land in QUEUE.md.

Verification tiers: **CODE** = identifier/def found in live source (not wiring proof).
**ROUTE** = needs runtime/player-route verification. **MISSING** = not found by name or
synonym search. **DIVERGENT** = exists but differs from what the spec wrote.

## Headline findings

1. `simLaneCommands.js:218` writes `state.timeScale` directly, bypassing `timeEffects.js`
   ownership — CANDIDATE BUG (can desync slow-mo lerp state). Caught by the new
   `scripts/check-single-writers.mjs`; the one remaining un-allowed violation.
2. Outpost jobs from `14_OUTPOSTS_AND_WAYSTATIONS` (Target Practice, Funeral Freight,
   Green Debt, Lightning Rod, Surface Rights, etc.) — **zero matches under spec names.**
   Waystation jobs partially exist (`landmarkMissions.js`, `sectors.js`).
3. `Kiln's mood` (Generous/Fair/Cruel difficulty selector from doc 12) — not found by
   name; a stakes system exists in `crucibleDraft.js`. Verify whether stakes are the
   intended vehicle or the mood is genuinely absent.
4. Mods: 10 of 12 spec'd — `volatile_wake` and `second_reel` deliberately absent
   ("later packets") in `swarmMods.js`.
5. Hero Forge forms: 1 of 6 bespoke (Wrecking Ball); five null reservations.
6. Line heads: spec names Hook/Coupler/Breaker/Harpoon/Chain/Reel; code catalog has
   Standard/Coupler/Breaker/Barb/Weld/Hush/Override/Bell/Spore/Index/Evidence Clamp —
   DIVERGENT naming, needs owner decision on which is current.

## Per-doc conformance

| Doc | Claims checked | Result |
|---|---|---|
| 10 THE_GAME | Two doors (ADVENTURE/SWARM one-press PLAY) | CODE ✓ (`mainMenu.js` TITLE-01) |
| | Six inputs / context wheel | CODE ✓ (`contextWheel.js`, `inputContexts.js`) |
| | Throws-kill / thrown physics pays | CODE ✓ (`killCausality.js`, `tumbleStates.js`, `stuntContracts.js`) — ROUTE for payout numbers |
| | Death→job: wreck stays, respawn at berth, map marker | CODE ✓ (`aftermathWrecks.js` durable markers, `playerDefeat.js` berth re-entry) — ROUTE |
| | One voice (voiceArbiter), aim tag | CODE ✓ (`ui/voiceArbiter.js`, `hud.js` aimtag, `throwCue.js`) |
| | Hauling ≥3× hunting pay parity | UNVERIFIED — needs economy route numbers |
| 11 THE_ARMORY | 12 guns | CODE ✓ — but spec's 4th stat "Kick" not a field (3 kick refs are flavor text) — ROUTE |
| | 8 line heads | DIVERGENT (see headline 6) |
| | 8 ships | CODE ✓ — all hulls present (kestrel, wasp, mule, bastion, atlas, leviathan, +pelican/hornet/ironback/hawser/ranger/colossus/saucer) |
| | 12 mods | PARTIAL 10/12 (headline 4) |
| | 6 hero Forged forms | PARTIAL 1/6 bespoke (headline 5) |
| | Bends | PARTIAL/unverified (`swarmMods` bend entries exist) |
| 12 SWARM_THE_PIT | 30 named rounds | CODE ✓ spec-exact names/descriptions (`swarmCourse.js`) |
| | 15 enemies, 14 bosses | CODE ✓ all ids in `swarmMode.js` |
| | 7 arenas | CODE ✓ (FOUNDRY/LAGRANGE/CINDER/CRYO/STORM/MILL/HIVE) — doc 15's own gap list stands (wings/pads) |
| | Forge + Taps floor items | CODE ✓ (`SWARM_FORGE_PRICE=5000`, 10 taps, price schedule) |
| | 8 named drops | CODE ✓ (`swarmDrops.js`) |
| | Wall guns / crate / doors / traps / bench | PARTIAL — `swarmFloor.js` has forge+loot; per-item ROUTE |
| | "THE PIT IS YOURS" + Keep going | CODE ✓ (`crucible.js`, `survivalResults.js` C01-03) |
| | Kiln's mood difficulty | MISSING/PARTIAL (headline 3) |
| | Save per round | PARTIAL — swarm never writes campaign slots (saveSystem PRO-20); crucible persistence separate — ROUTE |
| | Room changes (crusher r10, slag r20) | PARTIAL — crusher/slag defs exist; round-triggered changes ROUTE |
| 13 JOBS_AND_HEISTS | Empty Plinth (Orla Venn) | CODE ✓ (`pl230VennsWindow.js`, `lanternWardWork.js`) |
| | Ninth Mouth heist | CODE ✓ (`ceresNinthMouth.js` system+data+render+bodies, `heistFacilities.js`, `heistMission.js`) |
| | Counterweight | CODE ✓ (`features/counterweightCircuit/` full feature) |
| | Whole String / Chop Line / town job givers | CODE ✓ (`missionsData.js`, `missionBoardOps.js`, `missions.js`) — per-job ROUTE |
| | Road cast (Juno, Benny, Tolliver, Kind Regards, Lane Nine, Static) | CODE ✓ (`bandRadio.js`, `activityRuntime.js`, `busDoesntMove.js`, `rubricModel.js`) |
| 14 OUTPOSTS | Named outpost jobs | **MISSING** (headline 2) |
| | Named waystation jobs | PARTIAL — some names in `landmarkMissions.js`, `sectors.js` |
| 15 ARENA_FLOORS | Foundry wings/pads/conveyor | MISSING — doc itself records gaps (Casting Hall, Scrap Yard, conveyor/crusher, gem pads) |
| | Other 6 floor plans | CODE ✓ arenas exist; per-floor authored detail ROUTE |
| 16 STORY_SHOWN | Embodied story beats | CODE ✓ (`story/campaign47a/` embodiedMissions/Dialogue/Spine/Transitions/Interludes/Schema) |
| | Tessera, 47-A, Wren, Kessler | CODE ✓ |
| | Five doors endings | CODE ✓ (`story/endings/` finaleContent, endingDefs, lifeLedger) |
| | Text-off staging comprehension | UNVERIFIED — ROUTE only |
| 17 LADDER | 8 line classes I–VIII, finite, spec-exact | CODE ✓ (`lineProgression.js` names/thresholds/holds/moves match) |
| | Class-up event (cable thickens, town remarks) | UNVERIFIED — ROUTE |
| | Yard (claims/drill/hopper/turret/raid) | PARTIAL — `features/shipbreakingYard/` exists; per-component ROUTE |
| 18 SOUND_LOOK | Rope instrument | CODE ✓ (`audio/masslineInstrument.js`) |
| | Gun family voices | CODE ✓ (`combatVerbCues.js`, `elementaryVoices.js`) |
| | Motion/flash settings | CODE ✓ (widespread) |
| | Three looks / owner eval | Process artifacts exist (`scripts/fleet/looks/*`) |
| 20 FIRST_HOUR | Judge route | CODE ✓ `scripts/fleet/looks/demo-route.mjs` exists |
| | One-press PLAY, loading card, PILE-UP callout | CODE partial (`onboarding.js` extensive) — ROUTE |

## Hygiene audit

- `.dev/pr-expansion/work/`: ~90 numbered untracked snapshot trees, each a stale copy
  with its own stale `AGENTS.md`. Not a git clone — the branches seen inside were this
  repo's own. Prime candidate for register-gated cleanup (docs/REPOSITORY_HYGIENE.md).
- Check topology: 694 cataloged checks, 299 reachable from gate composites, **334 in no
  composite** — classify as release-gate / contract / probe / historical.
- `scripts/SCRIPT_TIERS.md` exists — check-tier conventions already partly defined.
- New check: `scripts/check-single-writers.mjs` — 6 owned fields vs declared exception
  writers. One open violation: `simLaneCommands.js:218` (headline 1).

## Candidate bug log (verify-gate queue)

| # | Finding | Verdict needed |
|---|---|---|
| C-1 | `state.timeScale` direct write in `core/simLaneCommands.js` bypasses `timeEffects` — may desync lerp/decay | Confirm on route: set timescale via lane command, observe whether slow-mo state corrupts |
| C-2 | Outpost job names absent — feature absent or renamed | Search mission generator for equivalent unnamed outpost offers |
| C-3 | Kiln's mood absent — stakes may substitute | Compare crucibleDraft stake tiers vs spec's Generous/Fair/Cruel |
| C-4 | Gun "Kick" bar not a real stat field | Check shipworks/armory UI stat display |
| C-5 | Line-head catalog diverged from spec names | Owner ruling: spec update or code rename |
| C-6 | `volatile_wake`/`second_reel` absent | Confirm "later packets" still intended |
| C-7 | Hero Forge forms 5/6 null | Confirm "later packets" still intended |
| C-8 | Round-triggered room changes (crusher r10, slag river r20) | Route: run rounds 10/20, observe floor |
| C-9 | Save-per-round on ordinary route | Route: die mid-run, check resume point |
| C-10 | Hauling/hunting pay parity | Route: compare earning rates |
