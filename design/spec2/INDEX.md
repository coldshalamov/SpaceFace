# SPEC2 INDEX — dispatch map for implementing agents

**What this is:** the taste-locked implementation spec suite for taking SpaceFace to a premium
PC/browser release bar. Written 2026-07-04 by the lead-design session. Every file is self-contained for one agent
lane; `00_MASTER_TASTE.md` is the constitution they all inherit.

**Current status:** before dispatching, read `design/CURRENT_BUILD_STATUS.md`. As of 2026-07-04,
SPEC2/01, /06, and /07 are built on targeted checks. SPEC2/02, /03, and /05 have passing targeted
checks but still need broader runtime/browser proof (`check:flight:clean`, `check:first-15-runtime`,
`check:market-first-loop`). SPEC2/04 is not built. SPEC2/08 remains a PC/browser release-readiness
lane, not handheld-specific work.

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
Do not run two specs that share a lane concurrently. Wave 2 waits for 01 (juice binds to tether
phases). Wave 3 waits for 02 (encounters use cruise; UI uses juice events). BEFORE wave 4: run the
47a golden re-record batch (BUILD_PLAN "Golden/tape note").

## How to dispatch (proven invocations, from .tmp/multi-loop history)
```
codex exec -c approval_policy=never "Read design/spec2/00_MASTER_TASTE.md fully, then implement
design/spec2/01_MASSLINE_FEEL.md exactly. The acceptance assertions section is your definition of
done — write the named check script and make it pass. Touch only the files the spec names. Print a
10-line summary." > out.md 2>&1
```
Same pattern per spec. `agy -p "..." --dangerously-skip-permissions` works for the UI spec;
`grok --prompt-file brief.md --always-approve --check` for contained new modules.

## Non-negotiables for every dispatch (paste into every brief)
- Read 00_MASTER_TASTE first. Where interpolating, choose the QUIETER option.
- Deviating from any number requires editing the spec in the same change with a one-line reason.
- Acceptance assertions are the definition of done; transcripts are not evidence — checks are.
- Never edit test/*.expected.json to make something pass. Never add dependencies.
- Regression floor after every task: the spec's named checks + `npm run check:sim:compare`
  (hashEqual:true) + `node scripts/check-tether-gameplay.mjs`.

## Review gate (run by whoever dispatches — human or lead agent)
1. `git status` — only the spec's named files changed.
2. Run the spec's acceptance script + regression floor yourself.
3. For anything visual: demand the .devshots screenshot pairs, apply the five-second test.
4. Reject on any Forbidden-list item (00 §6). Patch small, re-brief structural.
