<!-- LIFETIME: DURABLE -->
# The visible bubble is ~100 world units across

**Measured 2026-08-05 on the live chase camera, headless real-GPU Chrome, 1920x1080, seed 12345,
`sector_helios_prime`.** This is the single most load-bearing number found so far in the expansion
program, and it invalidates an assumption that several earlier lanes reasoned from.

---

## The measurement

Camera: `fov 50`, positioned `y 54.9`, `z -31.7` in the render's player-centred local frame. The
player projects to screen centre `(960, 540)`, which confirms the projection is being read correctly.

Projecting a point on the ground plane (`y = 0`) directly ahead of the player:

| local z | screen y (1080-tall frame) | |
|---|---|---|
| 0 | 540 | the player, dead centre |
| 20 | 267 | |
| 45 | **14** | the very top edge of the frame |
| 60 | **-105** | off-screen |
| 100 | -345 | |
| 200 | -688 | |
| 400 | -983 | |
| 800 | -1192 | |
| 1600 | -1319 | |

Lateral limit is **±50**. The visible strip runs from about `z = -27` (behind the hull) to `z = +45`
ahead.

> **The camera shows a ground-plane bubble roughly 100 world units across.**

Cross-check: the player hull is 28 units wide and occupies ~23% of frame width. 28/100 = 28%. The
geometry and the pixels agree.

## What is therefore invisible

At the same instant, in the same frame:

* The four nearest asteroids sat at **678, 794, 889 and 995** world units. Projected: screen y
  **-2728 to -327266**. All far above the top of the monitor.
* The HUD's own **Local Contacts** panel listed five derelicts at **261-995** units. None of them
  can appear in frame.
* The five live NPC jobs sat at **1083, 1694, 1841, 3815 and 13491** units from the player.

The things the game tells the player are "local" are, without exception, off-screen. What is actually
visible is whatever happens to lie inside ~50 units, plus the skybox, the hero planet, and any object
tall or large enough to clear the horizon.

## Why this matters more than any shader

The program's standing puzzle is that **twelve controlled single-lever experiments all returned
exactly 2.25/5** while a real EVE frame through the same harness scored 3.63
(`EXPANSION_PROGRAM.md` §1). Roughness breakup, albedo zones, rim x2, ambient x4, AO bakes, per-role
repaints, authored deep-field ribbons — none moved a single axis.

This is why. Those levers all change how *existing content* is lit or surfaced. The frame's problem
is that inside the only 100 units the camera can see, there is usually **nothing to light**. You
cannot shade your way out of an empty frame.

It also retires, by measurement, the natural reading of the research finding in
`RESEARCH_work_signatures.md` that ambient job signals are read at "500-2000 world units". That is
true of games with free or cockpit cameras — EVE, Elite, X4. It is not true here, and reasoning from
it directly produced a work-signature draw range of 1500 and then 2000, both of which faithfully
drew signals **hundreds of pixels above the top of the screen** while the diagnostic counters
reported them as `drawn`. A counter that increments when a spawn function returns non-null is not
evidence that anything is visible.

## The consequence for content

Density has to be authored at the scale the camera can see:

* **~50 units** is the working radius. Anything a player is meant to *notice* has to arrive inside
  it, or come to them.
* Objects at 200-1000 units are map and radar content. They are legitimate — they populate the
  Local Contacts list, the minimap, and the sense of a place having extent — but they contribute
  **nothing to the frame** and must not be counted as visual density.
* "More traffic per sector" does not help on its own if the traffic disperses over a 4200-unit
  sector radius. Six more hulls spread evenly across that area put approximately zero of them on
  screen. What matters is hulls, structures and events *near the player's actual position*.
* Conversely, this is cheap: filling a 100-unit bubble needs very few objects. The gate is
  placement, not budget.

## How to re-measure

`scripts/capture-gameplay.mjs --evalAfter` with a projection ladder. The `--evalAfter` hook exists
because `--eval` fires the instant the scenario is applied and can only ever observe t=0.

```bash
node scripts/capture-gameplay.mjs 8161 --scenario idle --warmup 15000 --duration 3000 --width 1920 --height 1080 --evalAfter "JSON.stringify((()=>{const s=window.SF.state;const T=window.SF.THREE;const cam=s.render.camera;const v=new T.Vector3();const out={};for(const D of [0,20,45,60,100,400,1600]){v.set(0,0,D);v.project(cam);out['z'+D]=Math.round((-v.y*0.5+0.5)*1080);}return out;})())"
```

Re-run it after any change to `src/render/camera.js`, the default FOV, or the chase offset. If the
bubble ever changes size, every density judgement above changes with it.
