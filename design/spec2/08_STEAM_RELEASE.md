# SPEC2/08 — THE $30 BAR (release hygiene, performance, Steam readiness)

**Owner lane:** release/QA agent. Read `spec2/00_MASTER_TASTE.md`. This spec is the exit checklist —
it has no features, only bars. A build that passes this file is demo-able and wishlist-worthy.

## 1. Performance bars (real hardware, not headless)
- 60 fps sustained, ZERO frames > 32 ms during: 6-ship brawl, 3-asteroid fracture, station approach
  with 8 ambient NPCs, cruise through a dust field. Measure via `check:hitch-budget` run in
  Electron on the dev machine (`npm run electron` after `build:bundle`) — the headless harness
  numbers are driver-polluted (known); the Electron run is the bar.
- Boot to main menu < 5 s; menu to flight < 3 s (precompile stays behind the veil).
- Memory: heap growth < 30 MB over a 30-min soak (no leak); entity/mesh counts return to baseline
  after sector round-trip.
- If bars fail: renderScale auto-tune (0.85→0.7 under sustained > 24 ms frames, restore on calm,
  notify once via one-voice info line "Render scale adjusted.") — implement only if needed.

## 2. Input completeness
- Gamepad: EVERY verb bound (tether=RB, charge throw=X hold, detonate=X tap, scan=D-pad up,
  cruise=Y, reel=D-pad down+stick Y). Prompts swap automatically (plumbing exists). Rebindable
  flight actions include the new verbs (shipped for KBM; mirror for pad).
- Full keyboard rebind persists and round-trips through save/profile (`check:settings-profile`).
- Steam Deck sanity: UI readable at 1280×800 (min font 11 px rule), gamepad-only playthrough of
  the first 15 minutes possible (no mouse-only interactions — audit every screen's key handling).

## 3. Content completeness floor (what "a full game" means at 1.0)
8 factions (exist), ≥ 24 sectors with palette identity, 13 hulls + 6 role-kit modules (spec2/05),
10 mission types (exist) + bulk-haul + named bounties, the 8-beat story (exists) with B4 branch
choice, 3 endings via endgame choice modal (exists — verify reachable), tech tree 28 nodes
purchasable, automation/claims loops functional post-tutorial.

## 4. Trust & polish sweep (the things reviewers dock $10 for)
- Save anywhere except combat; autosave never corrupts (checksum verified — exists); "Continue"
  never dead-ends (title-continue check exists).
- Pause is instant and silent; alt-tab safe (rAF clamp exists); window resize reflows HUD anchors.
- Zero console errors/warnings across a full loop (boot→tutorial→trade→fight→jump→dock→save→load→
  quit). `renderer.info.programs` all valid (shader precision rule: fragment `precision highp
  float` — one already bit us).
- Every check in `npm run check:ci` green, INCLUDING the re-recorded 47a goldens (the deliberate
  re-record batch documented in BUILD_PLAN — do it first, it unblocks the suite).
- Accessibility: colorblind palettes on radar/overview/target arcs, motionReduce/flashReduce honored
  everywhere (assertions exist), UI scale 0.85–1.25 without clipping.

## 5. Store-page ammunition (produced by the build, not Photoshop)
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
2. Electron hitch run recorded into `.devshots/spec2/perf-electron.json`, all §1 bars met.
3. Gamepad-only first-15 recorded (input trace) with zero mouse events required.
4. Capsule shots + capture script outputs exist and pass the five-second test.
5. `npm run check:ci` fully green on the release candidate commit.
