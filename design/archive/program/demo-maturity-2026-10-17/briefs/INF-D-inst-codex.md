# Task INF-D — three INFERENCE catalog units: INST-36, INST-37, INST-38 (one bounded batch)

Read first: `_constraints-codex.md`, and the three catalog lines INST-36, INST-37, INST-38 in
`design/program/INFERENCE_IDEAS.md`. Law: `design/program/INFERENCE_LANES.md` §0.1 — do the line,
do not expand it; share setup across the batch; each line keeps its own done sentence and test.

## The three lines (owner family: feedback cue + HUD chip readers)

- **INST-36** — a full hold chirps once when it fills, not once per rejected rock
  (`src/core/pickupAcceptance.js`, `src/audio/audioSystem.js`). Seed 4242: the full-hold crossing
  plays one soft cue and stays silent until capacity frees; pin one play per crossing.
- **INST-37** — a surrendered ship's target chip says so before you fire again
  (`src/systems/surrenderRecovery.js`, `src/ui/hud.js`). Pin: an accepted surrender rewords the
  hull's lock chip within one tick and a cleared surrender restores it; pin both.
- **INST-38** — a locked station's contact card names its services before you dock
  (`src/ui/hud.js`, `src/data/sectors.js`). Pin: locking Helios and the Vesta depot shows each
  station's authored service words from its data row; pin both stations.

Boundaries from the lines: audio→cue through the existing audio system (no new event bus voice);
HUD reads only — never write sim state from a chip renderer.

## Done when

- Three focused tests: `test/inf-inst-36-full-hold-chirp.test.mjs`,
  `test/inf-inst-37-surrender-chip.test.mjs`, `test/inf-inst-38-station-services-card.test.mjs`.
- Report all player-visible strings verbatim in your final message (a taste pass follows).
