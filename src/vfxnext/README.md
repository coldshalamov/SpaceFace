<!-- LIFETIME: DURABLE -->
# VFX NEXT — isolated reference library

Twelve reference-quality effect families built on five shared substrates, plus a laboratory
(`_vfxlab.html`) and a deterministic capture harness (`scripts/capture-vfxnext.mjs`).

**Nothing imports this tree, and this tree imports nothing from `src/render/`.** Both directions are
deliberate. Unimported downward, the library cannot touch the live game, the goldens or the frame
budget. Importing nothing upward, a promoted effect carries no dependency on live internals, which is
what makes "replace individual effects one at a time" real rather than aspirational.

The live VFX renderer was **read, not modified**: `src/render/vfx.js` was inspected for its event
surface, its pool caps and its performance assumptions, all of which are quoted below and in the
family briefs. No file under `src/render/` was changed.

## Where it sits

```
src/vfxnext/
  core/
    force.js      the causality contract — ONE input record, plus seeded variation helpers
    gpuAged.js    instanced substrate: sparks (additive) and smoke (normal-blended)
    solids.js     instanced substrate: ballistic debris (lit) and oriented shock fronts
    ribbons.js    CPU substrate: trails, wakes, tether pulses
    lights.js     bounded event lights
    stage.js      substrate ownership, the beat scheduler, screen-size LOD, cost readout
  families/       the twelve families, grouped by kind of event
  index.js        registry + promotion adapter map
_vfxlab.html                the laboratory
scripts/capture-vfxnext.mjs the capture harness
design/vfx/VFX_NEXT.md      the design record: budgets, briefs, findings
```

### Why `src/vfxnext/` and not `src/render/vfxnext/`

`scripts/check-src-reachability.mjs` is a **ratchet**: a new module under `src/systems/`, `src/ui/`
or `src/render/` that nothing imports from `src/main.js` fails `npm run check:contracts`. An isolated
library inside `src/render/` would therefore break the build on the day it landed.

`src/vfxnext/` is scanned by that ratchet and counted as an orphan, but it is outside all three
ratcheted roots, so it does not fail. That is the correct status for a library that is *deliberately*
unwired — and the ratchet starts biting at exactly the right moment, because **promotion moves an
effect into `src/render/`**, where reachability from `main.js` becomes mandatory.

`test/src-reachability.baseline.json` was NOT edited. Adding `src/vfxnext/` to its `toolingRoots`
would assert "not part of the game", which is false for something built to be promoted.

## The causality contract

Every family takes one `ForceRecord` (`core/force.js`) and may read nothing else. The record carries
position, radius, inherited velocity, impulse, severity, seed, palette — and a direction that is
split two ways:

| field | meaning | who supplies it |
|---|---|---|
| `dir` + `hasDir` | **signed** force direction | weapon fire, thrust, tether release, field centres, lethal `entity:killed.presentation` |
| `axis` + `hasAxis` | **unoriented** contact axis | `combat:collisionConsequence` — and nothing else |

A family branches on `hasSignedDirection(force)`. With a sign it may bias one way; without one it
must respond symmetrically about the axis. This mirrors the ruling in
[`design/PHYSICS_AS_SPECTACLE_ART_BIBLE.md`](../../design/PHYSICS_AS_SPECTACLE_ART_BIBLE.md) §6/§7
and is the difference between illustrating physics and inventing it. The lab ships the pair
`impact_concussion` and `impact_collision_axis` — the same family driven signed and unsigned — so the
branch is visible in a capture rather than asserted in a comment.

## Budgets, in the live game's currency

Stated against the caps actually present in `src/render/vfx.js`, so a swap decision is arithmetic:

| substrate | VFX NEXT cap | live analogue |
|---|---:|---|
| sparks (additive instances) | 2048 | `PARTICLE_CAP` 1500 / 3000 / 4000 by quality |
| smoke (normal-blended) | 256 | `SPRITE_CAP` 256 |
| debris (lit ballistic solids) | 384 | no direct analogue; nearest is the sprite bucket |
| shock fronts (oriented discs) | 48 | no direct analogue |
| ribbons | 64 × 24 segments | `TRAIL_STREAK_CAP` 96 |
| event lights | **4** | `EVENT_LIGHT_POOL_SIZE` **6** — for the entire live game |
| scheduled beats | 96 | none |

**Draw calls are constant at five** regardless of how many effects are live: one per substrate.

Per-family budgets are declared on each family object as `budget` and printed by the lab. The
`EVENT_LIGHT_POOL_SIZE = 6` line is the likeliest promotion blocker — a heavy explosion asks for 3,
so two cannot coexist with anything else that wants a light.

### Performance shape

* **One CPU write per instance, then nothing.** Origin, velocity, acceleration, drag, birth,
  lifetime, size ramp, colour ramp, spin and axis go up at spawn; the vertex shader integrates
  `p(t) = origin + vel·τ(t) + ½·accel·t²` with `τ(t) = (1 − e^(−kt))/k`. No per-frame particle loop.
* **No allocation in the hot path.** Every spawn argument is a scalar, force records are pooled and
  reused, scheduled beats own pre-allocated copies, and ribbon state lives in flat typed arrays.
* **Uploads are dirty-flagged.** A frame with no spawns uploads nothing.
* **Graceful saturation.** Slot claiming evicts by priority, so under pressure the cheapest, oldest
  residents die and the hero event keeps its instances. A dropped spawn is counted, never hidden.
* **Screen-size LOD.** `stage.count(base, force)` scales by quality and projected size, floored at 1 —
  an effect can get cheap but never silently become nothing.

The one thing this substrate cannot do: **a live instance cannot be steered.** Anything that must
change course mid-life belongs on the ribbon substrate or must be re-spawned.

## Promotion adapter

Wiring one family is a translation from a bus payload the live game already emits into one
`ForceRecord`. The full map lives in [`index.js`](index.js); the shape is:

```js
// in a live handler, e.g. src/render/vfx.js _onProjectileHit
const f = scratchForce();
setPos(f, hit.x, hit.y, hit.z);
setDir(f, proj.vx, proj.vy, proj.vz);        // signed: a projectile knows its direction
setVelocity(f, target.vx, target.vy, target.vz);
setSurface(f, n.x, n.y, n.z);
f.radius = 1.6; f.severity = dmg01; f.seed = hit.id >>> 0;
vfxNext.emit('impact_normal', f);
```

`setAxis()` instead of `setDir()` for `combat:collisionConsequence`. That is the one rule an adapter
must not break.

## Running it

Interactive lab (dev server on 8123 via `npm run start`):

```bash
node server.js 8123
```

then open `http://localhost:8123/_vfxlab.html`. Every control is also a query parameter, so a view is
a URL. Camera distance defaults to **110 wu — the R1 normal-play band, and the only distance at which
an effect may be approved.**

Deterministic capture sheet:

```bash
node scripts/capture-vfxnext.mjs
```

Deliberately not in `npm run check`: it needs a GPU and a browser, which the repo keeps opt-in.

## What is not here

* No live VFX was modified, and no effect is wired into the game.
* No runtime asset, GLB, manifest entry or render-package change — the art bible §9/§11 gate those
  behind the Ceres gate and an R8 lease, and this packet stays clear of all of it.
* No old-versus-new side-by-side capture. Standing up the live `vfx.js` singleton in the lab needs
  `init(ctx)` with state, bus and helpers from a 512 KB module, which would couple the library to
  exactly what it is meant to be independent of. The brief hedges this deliverable with "where
  possible"; the comparison is made in prose against the brief's own failure-mode list in
  [`design/vfx/VFX_NEXT.md`](../../design/vfx/VFX_NEXT.md).
