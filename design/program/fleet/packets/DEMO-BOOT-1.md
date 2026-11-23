# DEMO-BOOT-1 — seconds, not tens of seconds, from launch to play

**For:** Devin SWE-2 Max. **Kind:** measure, then fix the biggest cost you can prove. Commit your own files.

## Why

The game is being readied for a demo to strangers. Waiting kills a demo. Targets
(`design/overhaul/14_PERF_PLAN.md` table): launch to title ≤ 10 s; title → Swarm round 1 with a
hostile on screen ≤ 5 s warm (10 cold); New Game → flying in Helios ≤ 10 s. Last measured on the
owner's 15 W laptop: 38.5–65 s to title, 22.6 s into Swarm, 13.5 s into Adventure flight. The owner
plays the **Electron** desktop build (`npm run electron` → `scripts/launch-electron.mjs`).
Another agent is making the boot film skippable on any key and the title appear early (front-door
UI files): your job is the engine's own start-up and load cost, not the screens.

## Do

1. **Measure first, through the lock, on the Electron build** (every game boot:
   `node scripts/fleet/game-lock.mjs run -- <command>`; windows hidden/inactive, never focused —
   the owner may be using the machine). Find or adapt the existing probes
   (`scripts/check-boot-flow.mjs`, `scripts/probe-startup-transition.mjs`,
   `scripts/check-electron-packaged-startup.mjs`, `scripts/check-hitch-budget.mjs`,
   `scripts/check-asset-startup-readiness.mjs`) into ONE script `scripts/probe-demo-timings.mjs`
   that reports, for a cold start (fresh caches) and a warm start (second launch):
   launch → title interactive; title → Swarm round 1 with a hostile visible; title → New Game →
   flying in Helios. Three runs each; print the median. Use the game's own readiness signals,
   not fixed sleeps. The machine is busy with other agents: note the "other load" CPU % with
   every run, and only compare numbers taken back to back.
2. **Attribute**: with a trace or the game's own boot/load timeline (search `src/` for
   `performance.mark`, `bootTimeline`, `loadingProgress`), list the ten biggest costs on each route
   (file:function, ms).
3. **Fix the biggest costs you can prove**, using architecture, never by dropping content or
   quality (no lower textures, no fewer ships): candidates already identified in
   `design/overhaul/14_PERF_HANDOFF.md` §4 (world textures to KTX2: rock families, painted planets,
   deep-sky plates) and §5 (a transcode cache keyed by content hash, following
   `src/render/canvasTextureStore.js`), plus anything your attribution shows that is plainly
   repeated work (deriving the same thing every boot, decoding on the main thread, waiting
   serially for independent loads). Re-measure after each fix with an interleaved before/after.
4. If a fix changes what something looks like, write the before/after frame paths in your receipt
   so the director can look; do not judge looks yourself.
5. Commit each working fix by exact path, plain-English message saying what the player now gets
   and the measured before/after.

## You may edit

`scripts/probe-demo-timings.mjs` (new), `src/render/assetLoader.js`, `src/render/canvasTextureStore.js`,
`src/render/rockFamilyLibrary.js`, `src/render/paintedPlanets.js`, `src/render/deepSkyPlates.js`,
`src/render/decodeTaskBudget.js`, `src/render/startupGpuResidency.js`, asset files you convert (keep
the originals' paths working until the loader is switched), `server.js` boot/static paths, the
Electron shell's start-up path in `electron/main.cjs` (only what affects start-up time), and tests
for these. If another file is clearly the cost, make the smallest change and name it in the receipt.

## Do NOT edit

`src/ui/**`, `styles/**`, `src/core/**`, `src/systems/**`, `src/missions/**`, the sim worker, and
`src/render/renderer.js` / `src/render/partsLibrary.js` — other agents own them right now.

## Checks

`npm run check:playable` through the lock once at the end; the focused tests of files you touched.

## Receipt

Protocol headings, plus the before/after timing table (cold/warm × three routes, medians, other load %).
