<!-- LIFETIME: DURABLE -->
# The visible ground-plane bubble is ~45-50 units deep, at rest and at cruise

**Measured 2026-08-05, headless real-GPU Chrome, 1920x1080, seed 12345, `sector_helios_prime`,
across three scenarios at three different speeds.** This is the most load-bearing number found so
far in the expansion program, and it invalidates an assumption several earlier lanes reasoned from.

---

## The measurement

Screen y of a point on the ground plane (`y = 0`) directly ahead of the player, in a 1080-tall frame.
`fwdEdge` is the greatest forward distance still inside the frame.

| scenario | player speed | cam y / z | **fwdEdge** | z=0 | z=45 | z=100 | z=200 | z=400 |
|---|---|---|---|---|---|---|---|---|
| `idle` | 0 | 54.9 / -31.7 | **45** | 540 | 14 | -345 | -688 | -983 |
| `cruise` | 34 | 59.1 / -34.1 | **50** | 540 | 43 | -308 | -652 | -956 |
| `cruise-boost` | 53 | 59.8 / -33.8 | **45** | 419 | 11 | -280 | -567 | -822 |

The player projects to screen centre in the parked and cruise cases, which confirms the projection is
being read correctly.

> **The forward visible ground-plane depth is 45-50 world units, and it does not materially change
> with speed.**

This was worth checking specifically, because the camera has speed-zoom (`_dynamicZoom`, `zoomBias`,
`ZOOM_LERP` in `src/render/camera.js`) and a first measurement taken only at `SPD 0` would have been
the tightest the camera ever is. It isn't: the rig moves from 54.9 to 59.8 units up between parked
and boosting — about 9% — and the ground-plane depth is flat across that range.

Frame width: the 28-unit-wide player hull occupies ~23% of frame width, so the visible strip is
roughly **120 units across** at the player's own depth.

### One number in the probe is NOT trustworthy — do not quote it

The same probe also scanned laterally and returned 50 / 490 / 760 for the three scenarios. **Ignore
those.** Points far out on the ground plane sit near the horizon where the projection is
near-degenerate; the same probe returned screen x values like `1979270` for real asteroids. A
scan-for-the-largest-in-range-value is not robust there, and the apparent speed correlation is an
artifact of that degeneracy, not a widening view. Only the forward ladder — where the projected
values are smooth and monotonic — is reliable.

## What is therefore invisible

At the same instant, in the same frame:

* The four nearest asteroids sat at **678, 794, 889 and 995** world units. All projected far above
  the top of the frame.
* The HUD's own **Local Contacts** panel listed five derelicts at **261-995** units. None of them
  can appear on screen.
* The five live NPC jobs sat at **1083, 1694, 1841, 3815 and 13491** units from the player.

The things the game tells the player are "local" are, without exception, off-screen. What is actually
visible is whatever lies inside ~50 units ahead, plus the skybox, the hero planet, and any object
tall or large enough to clear the horizon.

## Consequence for content

Density has to be authored at the scale the camera can see:

* **~50 units of forward depth** is the working radius. Anything a player is meant to *notice* has to
  arrive inside it, or come to them.
* Objects at 200-1000 units are map and radar content. They are legitimate — they populate Local
  Contacts, the minimap, and the sense of a place having extent — but they contribute **nothing to
  the frame** and must not be counted as visual density.
* "More traffic per sector" does not help on its own if the traffic disperses over a 4200-unit sector
  radius. Six more hulls spread evenly across that area put approximately zero of them on screen.
  What matters is hulls, structures and events near the player's actual position.
* Conversely this is cheap: filling a 120-unit-wide strip needs very few objects. The gate is
  placement, not budget.

This is also why the NPC work-signature layer's draw range is 300 and not the 500-2000 the research
reports for shipped space games (`RESEARCH_work_signatures.md`). That band is real, but it comes from
games with free or cockpit cameras — EVE, Elite, X4. Reasoning from it directly produced draw ranges
of 1500 and then 2000, both of which faithfully drew signals **hundreds of pixels above the top of
the screen** while the diagnostic counters reported them as `drawn`. A counter that increments when a
spawn function returns non-null is not evidence that anything is visible.

## An untested hypothesis, flagged as such

It is tempting to say this explains the program's standing puzzle — that twelve controlled
single-lever experiments all returned exactly 2.25/5 while a real EVE frame scored 3.63 through the
same harness (`EXPANSION_PROGRAM.md` §1) — on the grounds that those levers change how existing
content is lit, and inside the visible strip there is often nothing to light.

**That is a hypothesis, not a result.** No frame has been scored through the grader as part of this
measurement. §5 of the standing brief names precisely this failure mode: a plausible lesson written
into the codebase before it was measured ("idle unfairly depresses vfx" was committed as a comment
and then refuted by a capture that scored *lower*).

The test that would settle it: score two frames through the existing grader that differ **only** in
how much authored content sits inside the visible strip, holding lighting, materials, post and camera
fixed. If the populated frame moves off 2.25 on `composition` or `background` while every previous
single-lever change did not, the hypothesis survives. Until someone runs that, this section is a
question.

## How to re-measure

`scripts/capture-gameplay.mjs --evalAfter`, which awaits its promise so a probe can let frames elapse
before reading render state. Use a scenario that actually moves the ship — `cruise`, not `idle` or
`boost`; the harness's own `report.motion.speed` confirms it moved, and `boost`/`combat-vfx` assign
`state.input` directly, which `systems/input.js` overwrites every frame.

```bash
node scripts/capture-gameplay.mjs 8161 --scenario cruise --warmup 18000 --duration 4000 --width 1920 --height 1080 --evalAfter "(async()=>{const s=window.SF.state;const T=window.SF.THREE;const cam=s.render.camera;await new Promise(r=>requestAnimationFrame(r));const v=new T.Vector3();const o={};for(const D of [0,45,100,200,400]){v.set(0,0,D);v.project(cam);o['z'+D]=Math.round((-v.y*0.5+0.5)*1080);}return JSON.stringify(o);})()"
```

Re-run after any change to `src/render/camera.js`, the default FOV, or the chase offset. If the
bubble ever changes depth, every density judgement above changes with it.
