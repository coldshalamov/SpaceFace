# BP-05 — STORY WIRE

> **Extends** `SPEC3-F7` §32 (narrative spine). **Single authority** for story beat numbering (B8+).
> Canon lives in `docs/worldbuilding/`. Delivery rule: **through systems, one voice at a time** (pillar 3,
> via `voiceArbiter`). Never a wall of lore.

## Goal
Objective #5: *the story is in the paperwork*. The player grasps Vale is an administrator — the system is the
antagonist — before any cutscene says so.

## Scope
- [ ] **Beat registry B8+** — all written-not-wired content gets B8+ ids in `src/data/narrative.js`; extend the
      `story.js` trigger table. B0–B7 are code truth; do not renumber.
- [ ] **Wren artifact thread** — the Vethari hull fragment as a carried cargo item; scanning/anomaly/salvage
      events (from Wave-1 `salvage.js` + BP-01 anomalies) advance it; quest-marker updates; the coordinates
      file that never decodes.
- [ ] **Manifest phases 2–3** — the 3-phase HUD manifest conceit ("STABLE LOAD" never corrects → self-corrects
      silently → "CONTRACT 47-A: STATUS PENDING" cannot close). Weight never matches.
- [ ] **NPC-ecology graffiti web** — the Kessler↔Drift↔Voss↔Slate↔Mira↔Hale↔Rook↔Quinn connections; graffiti
      *confirms* but never explains; it appears at the fictionally-correct locations/timings.
- [ ] **Callum encounter** at Meridian; **Elroy** kill-feed civilian-tag flicker (B2); **VALE HOLDINGS LLC** ship
      registry sightings (B5) integrated into mission ship generation.
- [ ] **Endgame Choices A–E** presentation (Choice C wormhole jump special-case; Choice D soft "stay at desk";
      Choice E "next run" extends the loop). **Consult the advisor before wiring these — irreversible-feeling.**
- [ ] **Helix Directorate** narrative role (Reconciliation 1): paper faction in dock-deny/contracts/news/barks.
- [ ] **Faction bark corpus** use (`barks.js` from Wave 1) tied to SG-06 tactic transitions + encounters.

## Primary files
`src/systems/story.js`, `src/data/narrative.js`, `src/systems/missions.js` (single owner), `src/data/barks.js`
(read), `voiceArbiter` (all comms route through it).

## Acceptance
`check:story-beats` (new): B8+ beats fire deterministically on their triggers; no two voices surface at once
(voiceArbiter); manifest phase transitions fire on the scripted milestones.

## Dependencies
Wave-1 `voiceArbiter`, `salvage`, `barks`; Wave-2 combat (kill-feed flicker); advisor sign-off for endgame.
