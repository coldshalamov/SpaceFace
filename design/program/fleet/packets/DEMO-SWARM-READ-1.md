# DEMO-SWARM-READ-1 — in a Swarm fight a stranger can tell enemies, rocks, pickups and hazards apart

**For:** Gemini Neon (designer-engineer with eyes). **Kind:** look, fix, prove. Commit your own files.

A stranger reviewing two real Swarm runs (`.devshots/fleet/runs/DEMO-SWARM-LOOK-2.deepseek.*/RECEIPT.md`
section 15) could not tell some things apart: the tan diamonds (frames
`.devshots/demo/swarm-minute/2026-11-23T22-51-26/49-s112.png`, `54-s121.png`; `2026-11-23T23-09-08/24-s063.png`)
look like pickups but also like debris; the purple crystal clusters (`22-51-26/61-s136.png`,
`63-s140.png`; `23-09-08/41-s111.png`) read as hazards and it is not clear what they do.
Also still ring-like after tonight's ring removal (`.devshots/demo/rings2/after-r1/` frames 19-20: an
upright cyan hoop on a long box; `after-r5/03-r5-combat-boss.png`: small orange arcs on the boss hull).

## Do
1. Identify each of those things in code (what the tan diamond and the purple cluster ARE, what
   the cyan hoop and the orange arcs are).
2. Give each class one clear read at the default zoom: pickups (Scrap chips, repair cells) glow and
   bob in one warm family and never look like debris; hazards say what they do by shape and colour
   (not by a ring); inert debris stays matte. Remove or replace the cyan hoop and the orange arcs
   unless they carry a real decision, in which case keep the information in a non-circular form.
3. Capture a real fight through the game lock (`node scripts/fleet/game-lock.mjs run -- node scripts/probe-first-swarm-minute.mjs`,
   no focus steal) before and after; open every frame. No rings, no white-outs, no new clutter.

## You may edit
src/render/** visuals for those bodies (not the simulation), their tests. Before editing a file run
`git diff -- <file>`; if it has changes you did not make, use `bash scripts/fleet/own-commit.sh begin <file>`
before and `... commit "<msg>" <file>` after. Never git add -A, reset, stash, restore or checkout.
Another Neon is changing render performance (src/render/frameCostSwitches.js, renderer.js, materials):
stay out of those files. COMMIT AS YOU GO and write RECEIPT.md early.

## Receipt
Protocol headings; per thing: what it is (file:line), what changed (commit), before/after frames.
