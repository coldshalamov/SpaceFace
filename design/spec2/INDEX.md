# SPEC2 INDEX — dispatch map for implementing agents

**What this is:** the polish and release-bar implementation suite for taking SpaceFace to a premium
PC/browser release bar. Written 2026-07-04 by the lead-design session. Every file is self-contained for one agent
lane; `00_MASTER_TASTE.md` is historical context, not a visual constitution that every task must inherit.

**Current status:** before activating a spec, read `design/program/README.md`, then
`design/program/02_REMAINING_WORK.md` and `design/program/03_LIVE_ACCEPTANCE_MATRIX.md`. This index
describes the suite's intended relationships; it does not own completion claims. Trust live checks
and player-route evidence over dated prose.

## Dispatch order (respects dependencies + file-conflict lanes)
| Wave | Spec | Lane / files | Parallel-safe with |
|---|---|---|---|
| 1 | `01_MASSLINE_FEEL` | sim: sg02DynamicBodyOwner, combatDefs | 03, 07 |
| 1 | `03_FIRST_HOUR` | content: onboarding, story, missions data, menus | 01, 07 |
| 1 | `07_AUDIO_IDENTITY` | audio: audioSystem, synth, audioRecipes | 01, 03 |
| 2 | `02_FLIGHT_CAMERA_JUICE` | presentation: camera, vfx, feel + cruise system | 05 |
| 2 | `05_ECONOMY_PROGRESSION` | systems: market/starmap screens, data tuning | 02 |
| 3 | `04_WORLD_ALIVE` | sim: encounterDirector, traffic, world dressing | 06 |
| 3 | `06_UI_IDENTITY` | frontend: hud, radar, targetPanel, ui.css | 04 |
| 4 | `08_RELEASE_READINESS` | PC/browser release/QA: checks, captures, soak | (after all) |
Coordinate only genuinely overlapping files among concurrently active specs. Wave 2 waits for 01 (juice binds to tether
phases). Wave 3 waits for 02 (encounters use cruise; UI uses juice events). BEFORE wave 4: run the
47a golden re-record batch (BUILD_PLAN "Golden/tape note").

## How to dispatch (proven invocations, from .tmp/multi-loop history)
```
codex exec -c approval_policy=never "Read the relevant spec and implement its behavior and player-facing
result. Acceptance is the named check plus screenshot/evidence review. Touch the files needed for a
coherent result, including integration files. Never edit test/*.expected.json. Print a
10-line summary." > out.md 2>&1
```
Same pattern per spec. `agy -p "..." --dangerously-skip-permissions` works for the UI spec;
`grok --prompt-file brief.md --always-approve --check` for contained new modules.

## Current dispatch guardrails
- Read root `AGENTS.md`, `design/GDD_2_0.md`, and the activated spec. Historical taste material is
  optional context, not inherited authority.
- Explain deliberate changes to behavioral acceptance values in the same change. Historical visual
  values are references, not mandatory palette, glow, radius, shell, texture, or triangle ceilings.
- Acceptance assertions are the definition of done; transcripts are not evidence — checks are.
- Never edit `test/*.expected.json` merely to make something pass. Dependencies require documented
  license, bundle/performance, determinism/save, browser/Electron parity, and maintenance impact;
  architectural changes require the normal architecture review.
- Regression floor after every task: the spec's named checks + `npm run check:sim:compare`
  (hashEqual:true) + `node scripts/check-tether-gameplay.mjs`.

## Review gate (run by whoever dispatches — human or lead agent)
1. `git status` — only the spec's named files changed.
2. Run the spec's acceptance script + regression floor yourself.
3. For anything visual: require representative `.devshots` evidence and judge the normal player route.
4. Reject functional regressions, incoherent integration, or weak player-facing quality—not deviation
   from a historical Forbidden list, fixed technique recipe, or process ritual.
