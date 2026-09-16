# VFX lifecycle standard — v2

**Authority:** mandatory companion to `VFX_FORCE_LANGUAGE_STANDARD_2026-09-16.md`.
**Owner:** presentation only. Physics, damage, cooldowns, lock times, and tool ownership remain
in their existing simulation systems. This revision fixes animation; it does not retime gameplay.

## The failure this standard prevents

A good still is necessary, not sufficient. The original force-language checkpoint expressed
shapes, but used `rec.engaged` to enable field motion. The publisher sets that flag from affected
bodies; an active empty-space Well was consequently frozen. Seed explicitly disabled flow and
had no alternative sustained articulation. Birth was mainly a quick reveal; removal replaced
most of the effect with a short generic core. These are authoring defects, not evidence of an
installer failing to copy files.

A powered effect must be alive **before, during, and after contact**. Contact may change pressure,
brightness, or local response. It must not be the only animation clock.

## One lifecycle, distinct choreography

Use `effectLifecycle.js` for timings/envelopes. Do not implement another private lifetime scheme
for each weapon. A persistent effect has five presentation stages:

`ignition → build → sustain → release → dead`

This state is separate from the simulation's travel/locking/active/warning phases. Those phases
articulate Seed's geometry and warning color; they do not disable its presentation lifecycle.
The same distinction applies to a charge/beam/impact weapon: the lifecycle describes the rendered
object, not a second source of damage or force.

| Tool | Build | Sustain, including no targets | Release |
|---|---:|---|---:|
| Seed | 0.50 s; compact plates unfold from the source | Four phased jaw strokes and luminous ratchet passes; travel opens the frame, locking closes it, warning drains the inner teeth. No vortex. | 0.64 s; close, cool, and fracture the plates |
| Well | 0.70 s; curled folds unfurl from the throat | Inward-moving highlights on a continuously rotating, flexing silhouette; the throat counterturns | 0.86 s; wind down and contract into the throat |
| Repulsor | 0.42 s; pressure structure opens outward | Three offset broken fronts propagate, with a broad pressure skirt | 0.68 s; stop live fronts, lift and erode cooling shell fragments; do not turn it into a Well |
| Cone | 0.46 s; transport curtains extend from the emitter | Advancing bowed fronts with lateral flex inside the sector | 0.56 s; peel the curtain from source to tip |
| Skim (`sheet`) | 0.58 s; intake banks extend | Scoops advance laterally toward the axis; the long banks remain parallel | 0.72 s; fold the banks inward and erode the remaining strokes |

These are presentation durations, not delays before the tool works. There is no hold timeout:
a sustained field may remain alive indefinitely while its authoritative record exists.

### Shared envelope formula

Let `S(x) = clamp(x,0,1)^2 * (3 - 2*clamp(x,0,1))`. For birth time `b`, current
simulation time `t`, and release time `r` (negative until release):

```
poweredTime = r >= 0 ? min(t, r) : t
age         = max(0, poweredTime - b)
build       = S(age / buildSeconds)
release     = r >= 0 ? S((t - r) / releaseSeconds) : 0
baseGrowth  = 0.055 + 0.945 * build
opacity     = S(age / min(0.10, buildSeconds)) * (1 - release)
```

Stopping during build releases from the **current**, partially built shape. It must not jump
up to full scale before shrinking. On release, directional transport time freezes at `r`;
retirement motion takes over. This is why a stopped Repulsor does not continue advertising a
live expanding force front. GPU formulas and the CPU diagnostic envelope share these curves.
Family-specific rotation, folding, and erosion live in `sweptSurfaceBatch.js`.

Birth envelope does not replace the authored sustained shape motion. Merely making a spiral
fade in and out still fails the standard.

### Mechanical/energy weapon sources

`sampleDischargeLifecycle` gives short muzzle objects separate ignition, extrusion, peak, and
cooling curves, parameterized by the weapon's existing flash lifetime. Mechanical blades, rail
shears, coherent apertures, thermal lobes, and current forks retain distinct shapes. The source
remains socket-following. Existing flight trails, impacts, casings, and scorch marks are not
replaced with a second generic effect. Rapid repeated source shots coalesce per owner/variant,
so brightness does not accumulate into an opaque blob.

Main-drive/plasma history and the prior reverse-jet shape improvements are preserved. This
revision does not claim that every unrelated legacy effect, bomb, or thruster has been migrated
to the field lifecycle implementation. New work in those families must meet this standard with
its own physical material vocabulary, not reuse a Well because a shared renderer exists.

## Truth boundary versus expressive body

A tool has an authoritative footprint and a decorative body. During deployment, the quiet
footprint can indicate the real full extent while the body grows. It is not an expanding damage
range unless the simulation says so. Footprint strips are tagged `FIELD_ROLE.BOUNDARY`.

When the authoritative tool disappears, remove those boundary strips immediately. Preserve
only the last body as a short cooling afterimage. No damage outline, targeting arc, force front,
or continuing transport symbol may survive with its active meaning. Cooling fragments are not
another gameplay field. After release, mesh count goes to zero and descriptor uploads sleep.

## Runtime ownership and clock

- `vfx.update` calls `_updateFieldGeometry`, which owns `FieldForcePresentation`. Do not add a
  separate requestAnimationFrame loop to the game or animate only the lab.
- Read `state.simTime`. Positive display `dt` must not advance effects while that clock is paused.
  Use accumulated positive `dt` only for isolated callers with no simulation clock.
- Animation is effect-local (`time - born`), so repeated deployments have repeatable onset.
  A simulation rewind clears stale cosmetic identities. No simulation random number source is
  consumed and no fields are written back.
- Published active records are reused in place. Copy the small values needed for retirement
  into a pooled slot; never hold a mutable producer record as the retiring field's authority.
- Reappearance after removal is a new birth even when the string id is reused. A relaunch of
  Seed is additionally distinguished by `massSeed.seedId`. Old residue can coexist briefly with
  the new powered effect, within the pool budget.
- Floating-origin reprojection moves both strip origins and whole-effect pivots. Do not animate
  around the stale world origin or require a nonzero simulation delta to fix the position.

Diagnostics: the existing VFX `inspect` result includes `fieldForceLanguage` with schema
`spaceface.force-language.lifecycle.v2`, clock, accessibility status, active/releasing counts,
and per-instance lifecycle stages. A build missing this schema has not integrated the full fix.
If `motionReduced` is true, suppressed sustained motion is intentional accessibility behavior,
not an animation failure. Do not override the user's accessibility preference to pass a test.

## Performance contract

The field owner uses one instanced folded-surface mesh, capacity 224 strips, and ten retained
slots. Seven live tools (six ordinary fields plus the separately published Seed) take priority
over decorative residue. Normal active counts remain Seed 16, Well 19, Repulsor 23, Cone 14,
Skim 18. Steady effects advance with shader uniforms: no geometry rebuild and no descriptor
upload is needed just to make time move. Contact, pose, or phase changes may update descriptors.

The extended layout has nine vec4 instance attributes. Together with position and the possible
four instance-matrix attributes it fits 14 of WebGL2's minimum 16 slots. Old 24-float weapon
callers get explicit defaults for the new fields. No textures, new render targets, extra point
lights, independent animation loops, or new runtime dependencies are introduced by this fix.
The earlier checkpoint's accidental increase to 16 weapon point lights is reversed: preserve
upstream's two-weapon plus six-event budget. Do not alter a performance budget to satisfy an
obsolete hardcoded test.

Reduced motion freezes ongoing geometry/flow but retains phase and lifecycle fades. Reduced
flash lowers hot-fold intensity without deleting silhouettes or suppressing ongoing movement.

## Proof required before handing work off

Run the Node contracts, the existing sleep/technique gates, and the actual-render motion gate:

```sh
npm run check:vfx-force-language
npm run check:vfx-sleep
npm run check:vfx-techniques
python3 -m pip install playwright
python3 -m playwright install chromium
npm run capture:vfx-force-language -- --video
```

On Linux without a display, use `xvfb-run -a` before the Python capture command. A local Chromium
can be selected with `--browser /path/to/chromium`; `ffmpeg` is needed only for `--video`.
Python/Playwright/ffmpeg are developer verification tools, not dependencies of the shipped game.

The default capture mounts the unchanged local ES-module graph into a blank browser document,
so no HTTP service is required. Only import specifiers are rewritten. To exercise ordinary
HTTP loading, run the game server and add:

```sh
python3 scripts/capture-vfx-field-lifecycle.py \
  --url http://localhost:8765/scripts/vfx-force-language-lab.html --video
```

The lab uses the production `_updateFieldGeometry` adapter, fixed camera and fixed reference
objects. Only WebGL canvas pixels are compared; the HTML timestamp cannot make a frozen effect
pass. It tests each of the five tools at 2.00 and 2.35 seconds with no targets, with contact,
and under reduced flash. A same-time negative control must have zero changed pixels. Reduced
motion must have zero sustained-motion change, while lifecycle transition remains readable.
Birth must start with no body, grow into a fuller effect, and release must visibly diminish
before all instances are gone. It also asserts steady descriptor versions are unchanged.

Ship `temporal-results.json`, the source hashes, and the full-cycle movie. Pixel change establishes
motion and guards this regression; it does **not** establish aesthetic quality, force correctness,
or hardware frame rate. Review the movie with human eyes. Full-game density, camera/occlusion,
asset interaction, controller feel, and hardware performance still require the representative
play route in a complete checkout. Never label the diagnostic fixture a full-game playtest.

## Recipe brief for the next agent

Before coding, complete this concise brief:

```
Name / force family / simulation record owner:
What is the verb? What can it NOT imply?
Birth: source position, onset cue, growth trajectory, seconds:
Sustain: deformation + transport direction + rhythm, including zero targets:
Contact: what changes, without becoming the only source of motion?
Warning: read from which authoritative phase/time?
Release: what freezes immediately; how does the body cool/fold/fracture?
Identity reset: stable id plus generation key:
Footprint: radius/sector/width; separate truthful boundary:
Motion/flash-reduced behavior:
Pool/strip/overdraw budget and saturation rule:
Temporal test times, negative control, motion clip path:
```

Brainstorm at least three motion silhouettes, not just three palettes. Choose the one that
communicates the verb at play distance. Reuse family material behavior; do not reuse an entire
sibling choreography. For a new reactive-matter tool, for example, growth should be deposition,
sustain should be adhesion/creep, and release should be breakup/evaporation—not a recolored
spiral. A common lifecycle is a common sentence structure, not a demand that every sentence say
the same thing.
