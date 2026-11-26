# DEMO-BOOT-2 — finish (or back out) the world-texture KTX2 work left in the tree

**For:** Devin SWE-2 Max. **Kind:** finish a predecessor's uncommitted work, prove it, commit. You
continue DEMO-BOOT-1, which timed out at 180 minutes mid-change. Read its log first:
`.devshots/fleet/runs/DEMO-BOOT-1.devin3.2026-11-23T09-14-47/run.log` (the end says what it was doing).

## Why it matters now

The owner plays the working tree. Your predecessor's edits are LIVE in his game right now,
uncommitted: `src/render/assetLoader.js`, `src/render/deepSkyPlates.js`, `src/render/paintedPlanets.js`,
`src/render/rockFamilyLibrary.js`, `src/render/rockSurfaceLibrary.js`, new `scripts/encode-world-ktx2.mjs`,
`scripts/probe-demo-timings.mjs`, `scripts/probe-sky-plate.mjs`, `test/world-ktx2-pipeline.test.mjs`,
and many `assets/**.ktx2` + `.ktx2.sha256` files. Half-finished loader work can break the sky,
planets or rocks for him. Either finish it properly or back it out cleanly — never leave it half.
(`src/ui/asteroid/rockReport.js` is also modified but is NOT yours: another agent's; leave it.)

## Do

1. `git diff -- <each file above>` and read it all. Run `node --test test/world-ktx2-pipeline.test.mjs`
   and the focused tests of every touched loader (`grep -rln "<file stem>" test`).
2. Finish the job: every converted texture loads through the configured KTX2 loader with a fallback
   to the original PNG/JPG if KTX2 is unsupported or the file is missing; a freshness test fails if a
   `.ktx2` is older than its source (the predecessor started this); nothing changes how anything
   looks except compression artifacts you must keep invisible (UASTC for colour maps that need it,
   ETC1S only where it is indistinguishable).
3. **Before/after frames for the director**: through the lock, with the window hidden, capture the
   Helios opening sky, a planet, and a close rock field with the KTX2 path on and off (add an off
   switch if none exists, e.g. a `?rfx=-worldKtx2` style query or `globalThis.__sfRfx` flag like the
   render code's other switches). Save pairs to `.devshots/demo/ktx2/<name>-{on,off}.png`. Do NOT
   judge looks yourself; list the pairs in your receipt.
4. **Measure** with the owner's real worker artifact: set `SPACEFACE_EVIDENCE_PLAYER_WORKER_BUNDLE=1`
   (see `electron/main.cjs` ~line 497: the owner's launcher serves the sim worker as ONE bundle; an
   isolated probe without this switch loads ~700 loose modules, which is NOT what he gets). Report
   launch → title interactive, title → Swarm round 1 with a hostile, New Game → flying in Helios:
   three runs each, cold and warm, medians, other-load %, with KTX2 on vs off interleaved.
5. If the textures are proven (frames listed, tests green, timings no worse): commit by exact path
   (loaders + script + test + assets in sensible separate commits). If you cannot make it right in
   this run: back it out cleanly (restore those files to HEAD one path at a time with
   `git show HEAD:<path> > <path>`, delete the untracked files you are sure the predecessor created,
   and say exactly what you removed).
6. Commit `scripts/probe-demo-timings.mjs` (fixed to support the player-parity worker bundle).

## You may edit
The files listed above, plus their tests. Not `src/core/**`, `src/ui/**`, `src/systems/**`.

## Receipt
Protocol headings + the timing table + the list of before/after frame pairs.
