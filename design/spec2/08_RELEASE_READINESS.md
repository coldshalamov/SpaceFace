# SPEC2/08 — THE PC/BROWSER RELEASE READINESS BAR (release hygiene, performance, capture readiness)

**Owner lane:** release/QA agent. Read `spec2/00_MASTER_TASTE.md`. This spec is the exit checklist —
it has no features, only bars. A build that passes this file is demo-able as a PC/browser game.

**Scope correction (2026-07-04):** SpaceFace is a PC/browser game. Do not add handheld-specific
gates or gamepad-only release blockers. Browser play is the primary route; packaged desktop is an
optional shell that must boot the same player-facing route when distributed.

## 1. Performance bars (real hardware, not headless)
- 60 fps sustained, ZERO frames > 32 ms during: 6-ship brawl, 3-asteroid fracture, station approach
  with 8 ambient NPCs, cruise through a dust field. Measure via `check:hitch-budget` on the primary
  PC browser route; if a desktop shell is distributed, repeat the same proof in Electron after
  `build:bundle`. Headless harness numbers are driver-polluted (known); real hardware is the bar.
- Current measured state (2026-07-04): `npm run check:perf` runs to completion on the PC browser
  route with authored visuals enabled, but strict mode is still red: rAF p95 16.9 ms vs the 16.7 ms
  target. The same profile passes the 30fps floor, asset fallback, draw-call, render/sim/UI, and heap
  budgets. Treat the remaining work as a release performance polish pass, not an asset-loading fix.
- Boot to main menu < 5 s; menu to flight < 3 s (precompile stays behind the veil).
- Memory: heap growth < 30 MB over a 30-min soak (no leak); entity/mesh counts return to baseline
  after sector round-trip.
- If bars fail: renderScale auto-tune (0.85→0.7 under sustained > 24 ms frames, restore on calm,
  notify once via one-voice info line "Render scale adjusted.") — implement only if needed.

## 2. Input completeness
- Keyboard/mouse is the primary release input. Every player verb has a documented KBM binding,
  visible prompts use the live binding registry, and full keyboard rebind persists and round-trips
  through save/profile (`check:settings-profile`).
- Gamepad/controller support is allowed for PC players where plumbing already exists, but it is not a
  gamepad-only release blocker. If controller prompts are present, they must stay accurate and must
  not create a divergent gameplay path.
- Browser viewport sanity: UI readable at 1280x800 and common desktop sizes; no mouse-only trap in
  required modal flows; UI scale 0.85-1.25 without clipping.

## 3. Content completeness floor (what "a full game" means at 1.0)
8 factions (exist), current authored 10-sector graph with palette identity, 13 hulls + 6 role-kit
modules (spec2/05), 10 mission types (exist) + bulk-haul + named bounties, the 8-beat story (exists)
with B4 branch choice, 3 endings via endgame choice modal (exists — verify reachable), tech tree 28
nodes purchasable, automation/claims loops functional post-tutorial. Expanding beyond 10 sectors is
future content production, not a PC/browser release hygiene prerequisite unless GDD/BUILD_PLAN is
explicitly revised.

## 4. Trust & polish sweep (the things reviewers dock $10 for)
- Save anywhere except combat; autosave never corrupts (checksum verified — exists); "Continue"
  never dead-ends (title-continue check exists).
- Pause is instant and silent; alt-tab safe (rAF clamp exists); window resize reflows HUD anchors.
- Zero console errors/warnings across a full loop (boot→tutorial→trade→fight→jump→dock→save→load→
  quit). `renderer.info.programs` all valid (shader precision rule: fragment `precision highp
  float` — one already bit us).
- Every check in `npm run check:ci` green, INCLUDING the re-recorded 47a goldens (the deliberate
  re-record batch documented in BUILD_PLAN — do it first, it unblocks the suite).
- `npm run check:assets:live` green: declared authored visual assets load in the browser route with
  `failureCount: 0`; no intended whole-ship body silently downgrades to a modular/procedural fallback.
- `npm run check:visual-stability` green: over a live browser flight window, visible ships keep a stable
  mesh root, authored composition id, LOD state, bounds, and static-batch/part visibility unless the
  sim actually spawns, despawns, damages, or swaps the ship. No flicker, invisible-frame gaps, or
  large malformed geometry planes are acceptable release behavior.
- Accessibility: colorblind palettes on radar/overview/target arcs, motionReduce/flashReduce honored
  everywhere (assertions exist), UI scale 0.85–1.25 without clipping.

## 5. Release capture ammunition (produced by the build, not Photoshop)
- `scripts/capture-capsule-shots.mjs`: scripted flythroughs that screenshot the 6 money moments —
  tether slingshot mid-arc (cable taut, amber), seam-lit asteroid under beam, station approach in
  core palette, wedge formation telegraphing, cruise streaks, capital kill bloom. 2560×1440.
- 60 s gameplay capture script (devshots pipeline exists) hitting: launch → scan → mine →
  interdiction → slingshot escape → dock. No UI hidden — our HUD IS the aesthetic.
- Demo slice definition: first-15 + one belt sector + one bounty; save-disabled export flag
  (`?demo` build gate patterns exist under the prod debug-gate).

## 6. Acceptance
1. A full playthrough script (`scripts/check-release-soak.mjs`, may be long-running/manual-ish)
   completes the §4 loop with zero errors and all autosaves loadable.
2. PC browser hitch run recorded into `.devshots/spec2/perf-browser.json`, all §1 bars met; add
   `.devshots/spec2/perf-electron.json` only when shipping the optional desktop shell.
3. KBM first-15 runtime proof passes in browser; controller prompt coverage remains optional unless
   controller support is intentionally touched.
4. Capsule shots + capture script outputs exist and pass the five-second test.
5. `npm run check:ci` fully green on the release candidate commit.
