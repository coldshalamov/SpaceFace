<!-- LIFETIME: RECEIPT -->
# PQ-130.08 The mine's voice — receipt

**State:** done (2026-08-21). **Law:** design law §8, §5 (what-you-hear column), §2.6, §11.9.

## Premise correction (verified live)
The pause path zeroes only the music bus; ambient/sfx/ui/combat stayed live and cues were never
pause-gated. A silent score inside the rock is what §8 asks for. The real hole: nothing was authored
to take the score's place, and several §5 rows had no reachable cue (the hopper-full path keyed on a
string that appears nowhere in `src/`; vein/gas breaks were suppressed when yield/gasHit could not fire).

## What shipped
- `src/audio/audioSystem.js` (+916): the mine owns its soundscape, all procedurally synthesized (no
  files, no manifest, no licensing). `mineBus → ambientBus` with bed / grind / cue faders. Bed = 41 +
  61.5 Hz room tone under a 168 Hz lowpass + moving air + settling creaks every 5.5–14 s (fade in
  0.55 s, out 0.45 s; a pause menu over the mine ducks it to 0.30). Grind = three layers (matrix /
  basalt / locked) crossfaded by the target cell's hardness, rising with bore, silent when idle. A
  local one-voice arbiter owns priority (hazard > payoff > machine > ambience), repeat suppression,
  ducking (others 0.45, bed 0.35, grind 0.5 under a live alert). Pure exports (`resolveMineAudioIntent`,
  `mineGrindLayers`, `createMineVoiceArbiter`, `MINE_CUES`, `MINE_LAW_EVENT_ROWS`) make the policy
  testable without Web Audio.
- `src/systems/presentationOrchestrator.js` (+45): `drill:cargoFull` → hopper cue; gas break voices the
  hazard when `drill:gasHit` cannot fire; vein break no longer suppressed.
- Event → cue: ore extracted (`drill:yield`, pitch with value) · bore bite (`drill:spark` bite) · grind
  (state poll) · gas breached (`drill:gasHit`) · MK refusal (`drill:warn` tier, 5 s suppression) ·
  hopper full · heat critical/vent (`drillTemp` 78/46) · machine placed (`site:machineInstalled`) ·
  machine starved (`site:machineStatus` — contract wired; see gaps) · courier launch
  (`site:courierLaunched`) · assay ping (`drill:scanPulse`) · rock break / played out.
- `test/asteroid-sound-routing.test.mjs` (`npm run check:asteroid-sound`): 22 sections incl. mutation
  guards; proves the pause path is bit-identical for every other `PAUSING_SCREENS` entry; measured
  levels off the live graph (bed 0.070, grind 0.237, gas breach 0.901 vs shipped references 0.038 /
  0.240); idle mine schedules ≤ 12 automation events / 10 s.

## Evidence
- `check:asteroid-sound` PASS; `check:one-voice` 16/16; `check:first-hour-audio` ALL PASSED;
  `check:playable` 14/14 (one CLEAN flake attributed by A/B to the concurrent renderer rewrite).
- `check:baseline` 8/12 — the four 47a sim links red before the first edit and identical after.
- Pre-existing reds proven not this leaf's by file swap: `check-audio-identity` (unlisted `ui_hover`
  emitter), `check-professional-mining-presentation`, `check-sg08-render-vfx`, three rows of
  `check-professional-first-hour-one-voice`.

## Gaps recorded
- No sim owner emits per-machine status transitions; the mine listens for `site:machineStatus
  { siteId, machineId, state }` — `.10` should emit it from `asteroidSites` (additive, not a law change).
- Presentation cue ids for MK refusal / machine placed / starved / courier need `cueRecipes.js` +
  `presentationAdapters.js` entries (outside this write set); the mine voices them directly meanwhile.
- Headless Chrome cannot prove a speaker moved. Manual check: tether in → low room tone within ~0.5 s,
  grind deepens on stone vs regolith and skates on an unrated cell, a mineral tick per unit of ore, no
  flight score.
