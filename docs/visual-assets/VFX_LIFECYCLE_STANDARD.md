# VFX lifecycle standard — v3

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

**Owner correction, 2026-09-27:** a uniformly growing object, constant-speed spin, and reversed
shrink on shutdown fail this standard. The player must see interacting material, not a lifecycle
state machine. This supersedes the earlier v2 scale envelope and frozen-transport prescription.

Use `effectLifecycle.js` for shared timing vocabulary. A persistent effect has five logical states:

`ignition → build → sustain → release → dead`

This state is separate from the simulation's travel/locking/active/warning phases. Those phases
articulate Seed's geometry and warning color; they do not disable its presentation lifecycle.
The same distinction applies to a charge/beam/impact weapon: the lifecycle describes the rendered
object, not a second source of damage or force.

| Tool | Build | Sustain, including no targets | Release |
|---|---:|---|---:|
| Seed | 0.50 s; staggered latch and jaw engagement | Independent jaw strokes and travelling ratchet passes; travel, locking and warning articulate the mechanism | 0.64 s; unload and separate individual elements; no global shrink |
| Well | 0.70 s; material propagates from outer intake toward the throat | Differential shear, unequal feeder cadence, mature recirculation where streams meet | 0.86 s; stop supply, drain remaining channels, detach cooling reaches |
| Repulsor | 0.42 s; separately arriving bowed pressure fronts | Crests advance independently, deform and interact with nearby surfaces | 0.68 s; stop generating fronts; existing fronts peel and dissipate outward |
| Cone | 0.46 s; source-to-tip transport establishes separate paths | Advancing material with unequal lateral flex inside the sector | 0.56 s; source cutoff travels toward the tip; remaining parcels continue |
| Skim (`sheet`) | 0.58 s; staggered intake strokes | Different lateral travel rates toward the axis; secondary motion develops as the intake establishes | 0.72 s; detach and erode remaining strokes without reversing onset |
| Singularity bomb | Unequal intake arrival, followed by throat closure | Accelerating inner shear and later recirculation; bodies divert the channels | Stop feeding outside; trailing matter drains inward while the lip tears in sectors |
| Goo bomb | Separate local nucleation sites spread and coalesce | Connected wet folds, travelling reaction contours, local surface displacement | Pores open at unrelated sites, folds lose height and residue breaks down in place |

These are presentation durations, not delays before the tool works. There is no hold timeout:
a sustained field may remain alive indefinitely while its authoritative record exists.

### Transport and retirement

The logical state does not scale the whole construction. Give material a path coordinate,
arrival time and flow speed. Offset those values between related elements using stable deployment
identity. Full-stride interactions begin only after their contributing flows have arrived.
Internal advection, differential deformation and source variation continue throughout a sustained
action; perpetual rigid rotation alone fails.

On release, stop the source. Existing material continues along its trajectory while a cutoff,
tear or cooling front overtakes it. Remove active gameplay boundaries immediately. Do not freeze
the material clock, reverse the startup geometry, synchronize every element's fade, or create new
powered parcels after release. An interrupted onset only retires matter already present.

Use smooth, independently phased transitions; no abrupt change in speed at a global "full size"
threshold. A fade complements deformation and supply transport rather than replacing them.

### Environment response

`FlowEnvironment` reads the existing spatial neighborhood and retains at most three nearby solid
bodies. It uses the drawn/interpolated anchors, material and velocity, with bounded query cadence.
Fields and bomb bodies bend near those surfaces, shear with local motion, and expose a local hot
contact seam. Empty space remains alive without inventing contacts. The actual force boundary is
never displaced, and presentation never moves an entity or changes damage. These are approximate
surface reactions, not a fluid simulation or mesh-accurate collision solver.

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
footprint indicates the real full extent while material arrives. It is not an expanding damage
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

Singularity bombs add one bounded instanced channel draw (72 channels for 24 bombs).
Each channel has a fixed 96-by-10 grid, with curvature, contact response and smooth normals
calculated in the vertex shader. The CPU uploads retained descriptors rather than rebuilding
those channel vertices. Basins and tar surfaces share the existing bounded mesh; transported
parcels share one lazy batch. The loading cook warms the exact channel material variant.

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
Birth must start with locally arriving matter, establish a fuller interaction, and release must
visibly diminish before all instances are gone. Growing/shrinking the whole object is not an
acceptable way to satisfy pixel-change checks. Also compare near-body and empty-space views.
Steady descriptor versions remain unchanged when neither source pose nor contact data changes.

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
Arrival: source position, separate paths/fronts, interaction onset, seconds:
Sustain: deformation + transport direction + rhythm, including zero targets:
Contact: what changes, without becoming the only source of motion?
Warning: read from which authoritative phase/time?
Release: when supply stops; how existing material travels, tears, cools and retires:
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
