# DEMO-FRAME-1 — Swarm holds frame rate on this machine's integrated GPU

**For:** Gemini Neon (designer-engineer with eyes). **Kind:** measured render performance, no uglier.

The demo machine has only Intel integrated graphics. Real Swarm fights run 10-35 fps with 12-14
hostiles (`.devshots/fleet/runs/DEMO-SWARM-LOOK-2.deepseek.*/RECEIPT.md` section 2). A profiled
round-6 frame was ~47 ms: WebGL drawing ~19 ms (7.5 ms switching shader programs), preparing the
frame ~12, ship views ~6, effects ~5.6, HUD ~6. An Opus engineer started this and left one tool:
the smoothness probe can now A/B a render switch against its own absence in ONE run
(commit a7c8f7205b: `--ab=<switch>[,<switch>]`; read its message and scripts/check-smooth*).

## Do, in this order, each behind a switch in src/render/frameCostSwitches.js (?rfx=-<name> = off)
1. **Dynamic resolution:** a render-scale governor that lowers the 3D internal resolution when frames
   miss budget and raises it with headroom (UI stays native). If one exists, make it effective on this
   GPU; if not, build it (smooth, hysteresis, never below ~0.6 scale).
2. **Fewer program switches:** sort opaque draws by program/material, merge identical materials,
   instance repeated meshes (debris, rocks, furniture) where they are not already.
3. **Effects budget:** cap particles/overdraw per frame (big translucent clouds are expensive on an
   iGPU — DEMO-VFX-CLOUDS-1 already made them smaller; build on it).
Measure each with the one-run A/B through the game lock
(`node scripts/fleet/game-lock.mjs run -- npm run check:smooth -- --routes=swarm-r6 --ab=<switch>`,
read the script for exact flags; never steal focus). Report frame p50/p95, frames >33 ms and >100 ms,
OFF vs ON. Open before/after frames: nothing may look worse; no rings.

## You may edit
src/render/** (not the simulation), src/render/frameCostSwitches.js, tests. Before editing a file run
`git diff -- <file>`; if it has changes you did not make, use `bash scripts/fleet/own-commit.sh begin <file>`
before and `... commit "<msg>" <file>` after. Never git add -A, reset, stash, restore or checkout.
COMMIT EACH MEASURED WIN AS YOU GO and write RECEIPT.md early (your last run timed out uncommitted).

## Receipt
Protocol headings; per change: what, commit, OFF/ON numbers, before/after frames.
