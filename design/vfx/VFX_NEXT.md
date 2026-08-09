<!-- LIFETIME: DURABLE -->
# VFX NEXT — reference library design record

**Status:** isolated reference library. Nothing is wired into the live game, no live VFX file was
modified, and no runtime asset, manifest entry or render package was created. This document records
what was built, what it costs (measured, not estimated), what the captures prove, and what they do
not.

**Authority.** [`PHYSICS_AS_SPECTACLE_ART_BIBLE.md`](../PHYSICS_AS_SPECTACLE_ART_BIBLE.md) controls
the visual grammar. Its §6 force-shape matrix already fixes the form of three of these twelve
families (concussion, well, repulsor) and its §6.1 "shared directional-force kit contract" is
implemented here as the five substrates. Its §9/§11 gate runtime assets and matched acceptance
evidence behind the Ceres gate and an R8 lease; this packet stays clear of all of it. The R1 camera
bands in [`CAMERA_VISIBLE_BUBBLE.md`](../graphics-sprints/CAMERA_VISIBLE_BUBBLE.md) control framing.

Code and promotion notes: [`src/vfxnext/README.md`](../../src/vfxnext/README.md).

## 1. What the brief asked for, and where it landed

| Brief failure mode | What replaces it |
|---|---|
| translucent geometry plus bloom | shock fronts are SDF power ramps concentrated at the rim, not filled discs; smoke is a handful of small wisps, not a body; ribbons are sheath-dominant so they do not blow to white |
| uniform round particle bursts | every matter-emitting family routes through `coneSample()` with a cos-weighted cap; there is no isotropic burst anywhere in the library |
| weak impacts | impact flash is 75 ms, not 300; the concussion flash *collapses* while the front expands, so two things are never growing at once |
| tiny effects at normal camera scale | 110 wu is the lab's DEFAULT camera and the only distance at which a capture may approve an effect; near zoom is explicitly diagnostic |
| same visual language for unrelated phenomena | fronts are axis-oriented meshes, so concussion (wedge normal to force path), repulsor (convex dome, empty centre) and reentry (bow shock across the flow) cannot collapse into one round flash |
| insufficient aftermath | embers live 2–6 s and drift on inherited velocity; debris lives 2–6 s; the heavy explosion's last cook-off is at 1.70 s |
| dark effects lost against dark environments | every family is captured on `bg 0.03` **and** `bg 0.62`; the harness fails a cell that renders empty |

Twelve families, all present: normal impact, concussion impact, light-ship destruction, heavy
explosion, boost/thruster transition, extreme-speed flight, Massline latch / high tension / release,
attractive field, repulsor field, atmospheric reentry. No optional families were attempted — twelve
done properly beats nineteen sketched.

## 2. Measured cost

From `.devshots/vfxnext/captures.json`, 75 cells, peak live occupancy across the whole sheet:

| substrate | peak | cap | peak cell |
|---|---:|---:|---|
| sparks | 960 | 2048 | `explosion_heavy__dense` |
| smoke | 181 | 256 | `reentry-breakup__normal-dark` |
| debris | 273 | 384 | `explosion_heavy__dense` |
| fronts | 12 | 48 | `impact_concussion__dense` |
| **ribbons** | **64** | **64** | `reentry-breakup__dense` |
| **lights** | **4** | **4** | `impact_normal__dense` |

Draw calls attributable to VFX: **5, constant**, independent of effect count.

### Two substrates saturate, and it is reported rather than hidden

At the `dense` condition (six concurrent instances of one family) **ribbons and event lights hit
their caps.** The arithmetic is straightforward and was not a surprise: reentry declares 12 ribbons
each, so six of them want 72 against a pool of 64; six impacts want 6 lights against a pool of 4.

Saturation degrades by priority eviction — the cheapest, oldest resident dies and the hero event
keeps its slot — so the failure mode is "an ambient trail is missing", not a stall or a visual
glitch. But two consequences matter for promotion:

* **Six concurrent reentries is not a supported scenario.** One or two is.
* **`EVENT_LIGHT_POOL_SIZE = 6` is the real ceiling.** The live game has six lights *in total*. A
  heavy explosion here asks for 3. Two heavy explosions plus any other lit effect will not fit, and
  no amount of pool tuning inside this library changes that — it is a live-game budget question that
  the integration task has to answer explicitly.

Dense is a diagnostic condition, not an acceptance one. It exists to find exactly this.

## 3. The five substrates

| substrate | technique | why this one |
|---|---|---|
| sparks | GPU-aged `InstancedMesh`, additive, camera-facing quad, kinds FLASH / SPARK / EMBER / RING / FIRE | one shader covers every hot element; per-instance ballistic integration means no CPU particle loop |
| smoke | same substrate, normal-blended, sorted behind | additive smoke cannot occlude, and occlusion is the only thing smoke is for |
| debris | GPU-aged instanced chunk mesh, **lit, not emissive**, axis-angle tumble | the bible's "industrial solid" role: reads by silhouette and lit form, so it survives bloom-off and grayscale |
| fronts | GPU-aged instanced `RingGeometry`, oriented to an axis, SDF wall, optional dome lift | orientation is the whole point — a billboard cannot express "normal to the force path" |
| ribbons | CPU history ring, camera-facing strips, one draw for all | the one thing the ballistic path cannot express: shape that depends on where the head has been |

`KIND_FIRE` was added late and is worth its own note: it is **not** a dim `KIND_FLASH`. FLASH forces
a white-hot centre, which is right for a detonation and wrong for combustion. Reusing FLASH for
burning fuel produced a field of small white dots where a fireball belonged.

## 4. Findings

Five of these were found by looking at gameplay-scale captures, not by reading the code. All five
produce plausible-looking output that is simply wrong, which is the argument for the capture harness
existing at all.

**1 — `smoothstep(hi, lo, x)` is undefined in GLSL.** Used in four places to mean "1 at the centre,
0 at the edge". The spec leaves the result undefined when `edge0 >= edge1`; ANGLE/D3D returns ~0.
Fixed to the explicit `1.0 - smoothstep(lo, hi, x)` everywhere.

**2 — `THREE.RingGeometry` does not emit radial UVs.** It emits a planar
`uv = (vertex.xy / outerRadius + 1) / 2` projection. The front shader read `uv.x` as "distance across
the annulus", so the SDF wall became a left-to-right gradient and every shock front rendered as a
soft filled disc instead of an edge. The radial coordinate is now computed in the vertex shader.

**3 — the velocity-aligned spark branch produced NaN positions.** It built its side vector with
`normalize(cross(sr, normalize(cameraPosition - wp)))`, which is degenerate in cases the attractor
field hits constantly. The quads vanished entirely — **every spark in the library rendered as
nothing, while pool counters, positions, lifetimes and ages all looked perfectly healthy.** This is
the most important finding in the packet: the diagnostic that mattered was reading back framebuffer
luminance with the mesh toggled, not inspecting state. Rewritten to stay in 2D inside the
orthonormal camera basis, with an explicit fallback for motion along the view axis.

**4 — shock front reach is a camera-distance decision, not a taste decision.** The first draft
expanded to 28× the event radius. At the 110 wu acceptance distance that is a 224 wu radius: the
front flies past the frame edge and reads as nothing. Library convention is now **2.5×–5×**, stated
in the code where the numbers live.

**5 — in space there is no such thing as dark smoke.** The terrestrial model — smoke is the dark
plate the fire reads against — inverts against a near-black void: any puff bright enough to be seen
is *brighter* than the background, so a large smoke mass can only lighten the frame. Drafts at 26, 20
and 10 large puffs all produced the same pale translucent dome. Heavy-explosion smoke is now six
small wisps and the fireball body is carried by `KIND_FIRE` cores instead. **Anyone adding a smoke
plume later will reach for the same wrong model.**

**6 — the heavy explosion had a 400 ms hole in the middle of itself.** Flash died at 0.16 s, first
secondary fired at 0.55 s, and nothing carried the interval. A `COMBUSTION` beat at 0.10 s now does.
Found by reading the beat sheet against a capture, and it is the reason the beat sheet is written out
as a table in the source.

## 5. Family briefs

Budgets are per-event for one-shots and steady-state occupancy for sustained families. Lights are
counted against the live `EVENT_LIGHT_POOL_SIZE = 6`.

| # | family | primary form | motion grammar | causality inputs | sparks | debris | ribbons | lights |
|---|---|---|---|---|---:|---:|---:|---:|
| 1 | `impact_normal` | spall cone + contact ring on the surface | 75 ms flash, cone opposing the projectile, embers persist ~1 s | `dir` signed, `v` inherited, surface normal | 34 | 4 | 0 | 1 |
| 2 | `impact_concussion` | **compression front** normal to the force path | flash collapses while the front expands; second slower wash behind | `dir` **or** `axis`, `impulse` drives debris kick | 62 | 14 | 4 | 1 |
| 3 | `destruction_light` | breakup + engine flare-out | 8 ballistic pieces in a size ladder; drive over-runs along the hull's own heading, then cuts | `v` inherited, `dir` if the lethal receipt has one | 70 | 22 | 8 | 1 |
| 4 | `explosion_heavy` | 8-beat sheet, not one sprite | flash → front → combustion → breakup → plume → 3 weakening offset secondaries → embers | as above; every beat carries the same record, so the whole event travels with the wreck | 220 | 46 | 10 | 3 |
| 5 | `thruster_boost` | plume whose **structure** changes at the boost knee | cone narrows, exhaust accelerates, shock beads appear, turbulence rises — three separate channels | `severity` = throttle, `dir` = thrust, `v` | 170 | 0 | 2 | 1 |
| 6 | `speed_extreme` | annulus of velocity-aligned streaks | streaks are near-stationary motes the ship overtakes; **nothing spawns inside a clear radius** | `v` actual, `severity` = speed band | 240 | 0 | 14 | 0 |
| 7 | `massline_latch` | simultaneous flash at BOTH ends + travelling pulse | pulse walks ship→anchor as a segment of the line, not a particle near it | `pos` ship, `dir`→anchor, `radius` = line length | 40 | 0 | 1 | 1 |
| 8 | `massline_tension` | a line that stays a line | width moves only 1.0×→1.35×; load is carried by core brightness, shiver frequency and shed sparks | `impulse` = tension 0..1 | 90 | 0 | 2 | 0 |
| 9 | `massline_release` | snap at both ends + recoil along the line | burst aimed by **retained velocity**, streak length scaling with it | `v` retained, `impulse` = tension at break | 84 | 0 | 4 | 1 |
| 10 | `field_attractor` | concave intake, compact framed anchor, **contracting** ring | tangential velocity + centripetal acceleration = a real decaying arc; tracers grow as they crowd inward | `pos`, `radius`, `severity` | 300 | 0 | 0 | 1 |
| 11 | `field_repulsor` | convex dome, **clear centre**, outward ribs | zero tangential component, outward acceleration = straight radial divergence; tracers thin as they leave | `pos`, `radius`, `severity` | 300 | 0 | 3 | 1 |
| 12 | `reentry` | standing bow shock ahead of the hull | severity ramp 0→1 over ~22 s: wake lengthens before anything brightens; shedding only past 0.55 | `v` = **relative** velocity, `severity` = ramp | 420 | 26 | 12 | 1 |

Families 10 and 11 are the library's legibility test: same volume, same cost, same substrates. Their
motions come from different physics (centripetal vs divergent acceleration), not different art, so
they cannot be confused. The captures show inward-pointing dashes crowding a centre versus outward
wedges leaving a clear one.

## 6. Evidence

`.devshots/vfxnext/` — 75 cells, 15 family/beat entries × 5 conditions, plus `captures.json`
recording every cell's URL, pool occupancy, and declared budget.

`.devshots/` is gitignored, as it is for every other capture probe in the repo, so the sheet is
**regenerated, not committed** — `node scripts/capture-vfxnext.mjs` rebuilds it. That is only
tolerable because the captures are deterministic: the numbers quoted in §2 came from a run of this
harness at this commit and can be reproduced exactly.

| condition | camera | background | concurrent | may approve? |
|---|---:|---:|---:|---|
| `normal-dark` | 110 wu | 0.03 | 1 | **yes** |
| `normal-bright` | 110 wu | 0.62 | 1 | **yes** |
| `near` | 45 wu | 0.03 | 1 | no — diagnostic |
| `sling` | 155 wu | 0.03 | 1 | no — diagnostic |
| `dense` | 110 wu | 0.03 | 6 | no — saturation probe |

Captures are **deterministic**: the lab fixed-steps to `?t=` and renders exactly one frame, so a cell
is a URL and the same URL produces the same pixels. That is what makes a matched sheet possible at
all; a wall-clock capture of a particle system is unmatched by construction (bible §5.1).

The harness fails a cell whose PNG is undersized, whose console logged an error, or whose pools were
all empty. That last check earned its keep immediately: it caught a capture timed *before* its own
event fired.

## 7. What this does not prove

* **No acceptance claim.** The brief's bar is a reviewer's judgement on ordinary gameplay-scale
  captures. The sheet makes that judgement possible; it does not substitute for it.
* **No in-game evidence.** Every capture is the lab: a reference hull, one asteroid, a starfield and
  a flat background. Performance against the live scene graph, the real post chain, sector lighting
  and a populated sector is unmeasured.
* **CPU/GPU cost is approximated by draw calls, triangles and JS frame time.** No GPU timer query.
  `src/render/gpuTimers.js` exists in the live tree and is the right instrument at promotion time.
* **No old-vs-new comparison capture.** See the README for why; the comparison is made in prose in
  §1 above against the brief's own failure-mode list.
* **Sustained families hold per-family emission state**, so one held instance per family id is
  supported. A fleet-wide system needs that state moved per-emitter. It is one accumulator per
  family and it is flagged in `families/propulsion.js`.

## 8. Promotion order

Cheapest first, and each one is independently useful:

1. **`impact_normal`** — highest frequency, smallest budget, one light. Proves the adapter shape.
2. **`impact_concussion`** — first family needing the signed/unsigned branch. Wire it from
   `combat:collisionConsequence` with `setAxis()` and confirm the symmetric response in-game.
3. **`destruction_light`** — first family whose whole read depends on inherited velocity.
4. **`massline_latch` / `_release`** — self-contained, and the tether already carries both endpoints.
5. **`thruster_boost`** — first sustained family; needs per-emitter state first.
6. **`explosion_heavy`** — last, because of the 3-light ask against a pool of 6.

Before any of it: re-run `node scripts/capture-vfxnext.mjs` and read the sheet. `src/**` moves, and
so does the renderer this library will eventually live beside.
