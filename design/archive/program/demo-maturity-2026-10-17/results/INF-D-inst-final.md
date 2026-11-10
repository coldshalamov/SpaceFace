Implemented all three units, left uncommitted for orchestrator review.

- **INST-36:** A full hold sounds once per crossing; rejected rocks stay silent until capacity frees.
- **INST-37:** Surrender updates the target chip immediately; clearing surrender restores its normal wording.
- **INST-38:** Locked station cards show authored public services before docking.

Audio follows cargo-volume transitions and suppresses the existing refusal alias. HUD readers use live surrender state and canonical station data without writing simulation state; black-market services remain hidden.

Player-visible copy, verbatim:

- `SURRENDERED` — restores `LOCKED` for a completed lock.
- `Services: Market · Shipyard · Refuel · Repair · Missions`
- `Services: Refuel · Missions`

Focused tests:

| File | Result |
|---|---|
| `test/inf-inst-36-full-hold-chirp.test.mjs` | pass 3, fail 0 |
| `test/inf-inst-37-surrender-chip.test.mjs` | pass 2, fail 0 |
| `test/inf-inst-38-station-services-card.test.mjs` | pass 2, fail 0 |

Adjacent regressions: **59 passed**. Player-facing label check passed.

Other changed files:

- `src/core/pickupAcceptance.js`
- `src/audio/audioSystem.js`
- `src/systems/surrenderRecovery.js`
- `src/ui/hud.js`
- `src/ui/targetPanel.js`
- `src/data/sectors.js`
- `test/helpers/infInstrumentScenario.mjs`

Adjacent gameplay defects observed: none.

