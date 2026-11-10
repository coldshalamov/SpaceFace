RESULT: DONE — Added a Foundry conveyor trial reachable through “Launch conveyor trial” on the ordinary Crucible screen, with a safe workpiece demonstration and quiet side pockets.

It reuses the existing trial registry, field kernel, physics, and authored enemy roster. The standard rulesets remain unchanged.

Changed files:

- `src/data/survivalMutators.js`
- `src/render/lawArenaDressing.js`
- `src/systems/survivalArena.js`
- `src/systems/survivalRun.js`
- `src/ui/crucibleLaunch.js`
- `src/ui/sandbox/sandboxSetup.js`
- `src/ui/screens/crucible.js`
- `test/m20-room-with-a-different-law.test.mjs`

Verification:

- M20 fixture: **9 passed, 0 failed**.
- Final M20 + law-dressing checks: **22 passed, 0 failed**.
- Related Crucible regressions: **101/101 passed**; phase/meta checks: **61/61 passed**.
- Sim save/reload hashes matched; the recorded golden hash differed.
- UI bench mounted successfully; its control walk was partial, 24/49. Full player-truth acceptance was not run.

Adjacent defect: Foundry Block is absent from the sandbox launch whitelist and falls back to scored. Left untouched per campaign constraints.

MJ6’s brief is intact. Nothing staged or committed.

