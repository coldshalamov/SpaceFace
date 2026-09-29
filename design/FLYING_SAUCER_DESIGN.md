# Flying Saucer — the inertialess exotic hull

Status: implemented on branch `devin/1790686754-flying-saucer`. This document is the full
design record: the brief, the system-by-system audit it demanded, the implementation map,
the agentic workflow that produced it, and the measured verification numbers.

## 1. The brief

> The first ship that we'll make of this type will be a flying saucer. It will have all the
> characteristics of flying saucers in traditional mythology, where they can take right-angle
> turns and they can just stop on a dime. The flight would have to be almost irrespective of
> the inertia, the pilot would have to have complete control over the flight of the ship, and
> even though it maneuvers super well, it has an extremely high mass, like if it tugs
> something it just drags it around like a ragdoll, or if it bumps into something it'd knock
> it around like it was nothing.

Three properties, none of which is a "stat buff":

1. **Inertialess authority.** Right-angle turns with no drift arc, stops on a dime. The hull
   does not coast — it *obeys*. In this codebase that means a drive whose servo answers far
   faster than the fleet band, plus a feel envelope that erases lateral error rather than
   shaping a long decay.
2. **Extreme mass that nothing pushes back on.** 520 operational mass — heavier than every
   hull but the Leviathan (600) — so contact impulses and tethers read as ragdoll physics on
   the other body. The saucer itself never staggers: the same mass that bullies absorbs.
3. **A real production hull, not a cheat flag.** It must pass the same gates every other
   live body passes: role lattice, Pareto legality, feel envelope, model LOD family, render
   package, part wiring, tests that count the roster.

## 2. System-by-system audit

Everything was examined before anything was written. For each system: what it does, whether
it fights the brief, and what was built.

### Propulsion kernel — `src/core/flight/propulsionCatalog.js`, `propulsionKernel.js`

The kernel is already the right shape for inertialessness: a drive profile carries
`maxAccel`, `maxBrakeAccel`, and `responseHz` — how hard the field pushes and how fast the
servo converges. No code change required; inertialessness is a *value* problem, not a
*mechanism* problem.

What was fighting it: nothing structurally — but no stock drive anywhere near the needed
band. The heaviest authority in the catalog is `drive_pulse_plate_m` (maxAccel 31 raw RCS
figures, multi-axis plates) and the fastest servo is `drive_gravimetric_s` at 4.8 Hz. The
saucer needed ~6x the gravitic accel and ~2x the response.

Built: `drive_inertialess_s` in the GRAVIMETRIC family — maxSpeed 340, boostMaxSpeed 900,
maxAccel 1800, maxBrakeAccel 2800, responseHz 14, yawAccel 44 / yawBrake 60 / maxYawRate 6.5,
solverSpeedLimit 1024, travelCeiling 420, resources idle 0.9 / perAccel 0.034 / heat 0.028 /
cooling 7.0. The GRAVIMETRIC family choice is load-bearing: `TRAVEL_CEILING_FAMILY_MULT`
gives gravimetric drives ×1.5 supercruise ceiling — the saucer keeps that reach.

Revision 2 took the drive from "best in fleet" to "cheat code": maxSpeed 190→340 (fleet
fastest is ~280), boost ceiling 255→900 (nearly 3× the next highest), accel 950→1800 and
brake 1200→2800 (roughly 3× the heaviest authority anywhere else), responseHz 9.5→14,
maxYawRate 4.2→6.5 rad/s. `solverSpeedLimit` 1024 stays above boostMaxSpeed so the kernel
never clips the boost band.

Counterweights that keep it honest: the drive spends a capacitor at 0.034 energyPerAccel —
sustained maximum-authority flight drains `energyCap` against `energyRegen`; mining utility
and cargo stay deliberately weak so the hull wins fights by repositioning, not by hauling.
The identity is *control authority*, and now also raw pace.

### Dynamic body owner — `src/core/sg02DynamicBodyOwner.js`

Collision physics is impulse-based and capped per tick (`MAX_CONTACT_DV = 40` wu/s of
contact-sourced Δv per tick per body). The cap bounds solver sanity; it does not prevent
the brief's ragdoll behavior — the *ratio* `m_saucer/m_other` does that work inside the
impulse math. At 520 vs a 30-mass fighter the saucer transfers its capped Δv while the
light hull takes the same impulse divided by its tiny mass: it leaves the contact moving.
Nothing was fighting the brief here; no changes needed. The mass does the work.

### Flight feel — `src/data/flightFeelEnvelopes.js`

`applyFeelEnvelope` scales the resolved drive profile per player hull (or per class via
`CLASS_FALLBACK`). This is where "irrespective of inertia" gets its last shaping:
`lateralKill` (how fast uncommanded lateral velocity dies), `stopHorizon`/`brakeHorizon`
(how far ahead the stop engages), `neutralBrake` (stick-neutral braking), `governor`.

Built: a `ship_saucer` envelope — translation 1.0, strafe 1.0 (the field answers
identically in every direction — a disc has no preferred axis), yaw 1.30/1.40/1.30,
lateralKill 1.45, stopHorizon 0.45, governor 1.0, brakeHorizon 0.50, neutralBrake 1.30 —
the revision-2 pass sharpened every stop/turn axis to match the drive's new numbers:
lateral velocity dies ~45% faster and the stop engages much closer to the contact.
New `CLASS_FALLBACK.exotic` entry so any future exotic hull inherits the shaping, and a
`ENEMY_HULL_FEEL_ALIASES.ship_saucer` self-map so an NPC saucer keeps the same envelope
rather than silently borrowing the capital row.

### Ship roster + lattice — `src/data/ships.js`, `src/data/shipRoleLattice.js`

`ship_saucer`: T5 `role: 'exotic'` — the first hull of a new role class. mass 520,
cargo 120, handling 2.2, designMass 760 — mass + full outfit space, the maximum legal
rating under the mass-is-the-law check (a fully outfitted saucer is still at 100 % drive;
only carried cargo or a tow can push it past rating, and the inertialess field never
wallows to the pilot), hull 2200 / shield 2600 / regen 30, energyCap 2200 /
regen 170, collisionRadius 19, price 4.2 M, bankFactor 0.10 (saucers bank almost
imperceptibly — the field doesn't roll to turn), outfitSpace 240 / weaponCapacity 96 /
engineCapacity 14.

Boost spec is the mega-boost the revision brief asked for: pool `max 360` (largest boost
pool in the fleet), `dashImpulse 400` (the strongest instant velocity kick in the fleet —
the same number feeds the tether-swing pendulum, so a saucer slinging a tow gets the
biggest swing impulse too), `drainRate 22`, authored `regenRate 48` (doubled at spawn),
cooldown 1.4 s. Full pool at authored regen recharges in 7.5 s.

Weapon map: two L hardpoints plus `{size:'L', facing:'turret'}` — all large mounts, with
the turret-facing L load-bearing for the fiction. A disc has no nose arc; the turret is
its native engagement cone. `combat` computes to 146 on the hull-dimension pass.

Lattice row: `flightClass: 'exotic'` (new class — `flightClassForHull` consults the row
first), `roleLabel 'Inertialess Disc'`, biases opMass 1.20 / handling 1.15 / thrust 0.85 /
turn 1.20 (all inside the validator's 0.8–1.2 band), careerFit hunter 0.75 / hauler 0.60 /
prospector 0.35 — the hull hunts by repositioning and hauls by dragging.

Pareto legality: `findDominatedSameTierHulls` pairs every same-tier hull. With the
revision-2 numbers the saucer wins handling (100), speed (17.2) and tank (77.4) while
losing cargo/mining/utility — strictly non-dominated and non-dominating. Verified: zero
dominated pairs with the row live.

Role path (`path_inertialess_disc`): signature verb "Stop on a dime, turn on the spot, and
tow what outweighs the escorts." Kit is the graviton line the hull's tech already unlocks:
`wpn_gravity_well_m` + `wpn_momentum_sink_s` + `mod_massline_spool_m` + `mod_frame_coupler_m`
— 4 fittings, all fit the declared slots, one massline head (validator cap respected).

### Tech gate — `src/data/tech.js`

`tech_graviton_drives` now also unlocks `ships: ['ship_saucer']`. The hull arrives through
the same research branch that unlocks the graviton weapon line its role path carries.

### Visual wiring — `src/render/partsLibrary.js`, `src/render/vfxProfiles.js`

The saucer joined `REQUIRED_WHOLE_SHIP_DEF_IDS` (player hulls always take the whole-ship
path, never modular kit), `HULL_FILE_BY_DEF_ID` (capital hull chassis fallback),
`ENGINE_FILE_BY_DEF_ID`/`ENGINE_FILE_BY_DRIVE_ID` (resonator pod — the nearest gravimetric
engine visual; the saucer's real drive glow is the authored rim light chain in the model),
`WHOLE_SHIP_FILE_BY_DEF_ID` → `wholeships/saucer_production_v1.glb`,
`WHOLE_SHIP_ASSET_ID_BY_DEF_ID` → `SF_SAUCER_PRODUCTION_V1`, and
`WHOLE_SHIP_LOD_FAMILY_BY_DEF_ID` → the authored lod0/1/2 family so distant NPC saucers
LOD correctly. `vfxProfiles.js` maps both def and drive to `engine_field_sprint` — a new
profile authored for revision 2: a brighter, longer, faster-flowing resonator plume
cyan-shifted toward the saucer's rim-light identity (coreIntensity 10.5, streak/particle
multipliers ~1.5×, plume length ×1.6) so the boost reads as oversized as the drive feels.

Note: master commit 33184a813 swept in `renderer.js` hunks importing `./cameraOccluders.js`
without the module itself. This branch carries a minimal placeholder implementing the
interface (`createCameraOccluderState` / `updateCameraOccluders` / `cameraOccluderDiagnostics`,
ducks nothing) so the renderer and the suites that import it stay green; when the owning
lane lands the real module it should replace the placeholder wholesale.

### Model toolchain — `tools/blender/forge/`

Five-word idea: *lit-rim gunmetal inertialess disc*. `tools/blender/forge/ships/saucer.py`
lofts a lenticular disc along +X — circular planform `w(x)=sqrt(R²−x²)` with a rim floor so
the edge keeps finite thickness and a slight rim droop for the classic lenticular profile.
Metallic central dome with dark glass canopy and a cyan light ring at its base; ventral
gunmetal dish with the glowing cyan drive core (`HOOK_DRIVE_CORE` + `SOCKET_Engine_Main`);
a 24-bead `glow_cyan` rim light chain that persists through every LOD (the identity element
and the de-facto drive visual); annulus rim bezel + groove; radial `band()` seams as panel
lines; a warm-porthole row around the dome base; a dark glass collar under the dome glass;
mast antenna + apex beacon; two dorsal `sensor_dome` blisters; 24 rim armor tabs; eight
ventral field vanes with `glow_cyan` emitter tips; red port / green starboard nav lights.

Revision 2 added the guns the brief asked for — three `emitter_turret` rim turrets in the
fleet's barbette/collar/house/mantlet vocabulary, saucer-accented: a 4-barrel emitter
battery on the nose rim and twin-barrel mounts at the port and starboard rim points, every
barrel sleeved and ending in a `glow_amber` lens. The ventral dish became a real concave
`dish()` bowl with a `glow_cyan` throat ring, and the glowing drive core hangs in a
gyroscope cage of three orthogonal machine rings. Damage hooks on the ventral core, a rim
segment, the apex beacon, and a rim plate. Sockets: camera focus, cargo ventral, engine
main, RCS port/starboard, tether massline (ventral core offset —
the tow point lives under the drive core), trail main/port/starboard on the underside rear
rim, utility dorsal, and weapon front/port/starboard on the rim.

`fleet.json` registers `saucer` → player layout, `saucer_production_v1`,
`SF_SAUCER_PRODUCTION_V1`, part `wholeship_saucer_production_v1`, root `SAUCER`.
`publish.mjs` then synced the parts manifest row, refreshed the three pilots.json rows,
rebuilt all render packages (every package embeds the pilots hash), and the model-truth
census regenerated to match.

### Tests

Roster-count assertions bumped 14→15 (`live-ship-visual-package-coverage`), the saucer was
added to `fleet-player-wholeship-routing` expected map and to `FAMILY_DEF_IDS` in
`whole-ship-lod-policy` (its authored lod family must be installable for NPC use).

### Deliberately not built

- ~~**Custom drive VFX body**~~ — revision 2 built it (`engine_field_sprint`): the rim
  light chain stays the identity read; the profile only lengthens and brightens the
  resonator plume under boost, not a second visual system.
- **Saucer audio cue** — engine cue routing already keys off drive family (gravimetric).
- **NPC saucer variant** — the LOD family and enemy feel alias leave the door open; no
  roster or traffic wiring yet.

## 3. Implementation map

| Concern | File | Change |
|---|---|---|
| Drive envelope | `src/core/flight/propulsionCatalog.js` | `drive_inertialess_s` profile |
| Hull def | `src/data/ships.js` | `ship_saucer` (T5 exotic, roster 15) |
| Tech gate | `src/data/tech.js` | `tech_graviton_drives.unlocks.ships` |
| Identity + path | `src/data/shipRoleLattice.js` | row, role path, 15-ship validation |
| Feel shaping | `src/data/flightFeelEnvelopes.js` | `ship_saucer` envelope, `exotic` fallback, enemy alias |
| VFX route | `src/render/vfxProfiles.js` | def + drive → `engine_resonator` |
| Visual route | `src/render/partsLibrary.js` | required-def id, engine/hull/wholeship/asset/LOD maps |
| Forge source | `tools/blender/forge/ships/saucer.py` | authored lenticular disc |
| Fleet registry | `tools/blender/forge/fleet.json` | `saucer` player-layout entry |
| Part record | `assets/ships/parts/parts_manifest.json` | `wholeship_saucer_production_v1` row |
| Package pilots | `assets/ships/render-packages/pilots.json` | lod0/1/2 rows |
| Claim | `design/program/NOW.md` | `devin-saucer` row |
| Roster tests | `test/*` | count 15, routing map, LOD family ids |

## 4. Agentic workflow

The working recipe that produced this, in the order it ran:

1. **Audit before edits.** Read every system the brief touches (propulsion catalog/kernel,
   body-owner contact solver, feel envelopes, lattice validation, visual factory, forge
   kit, publish pipeline) and classify each as *supports*, *needs values*, or *fights*.
   The only real fights were value-level — no mechanism fought inertialessness.
2. **Author the drive, then the hull, then the identity.** Drive profile first (it defines
   what "inertialess" can mean numerically), hull def next (slots encode the turret-facing
   fiction), lattice + feel last (they are checked against the def by validators).
3. **Verify numerically before visually.** Import-only node checks: derived dims,
   Pareto legality, lattice errors, role-path kit fit — all green before any GLB existed.
   Measured on the live kernel (revision 2 numbers): a commanded 90° turn at full 340
   wu/s cruise settles rot+velocity onto the new heading in ~2.3 s; 340→0 in 0.37 s;
   900→0 in 0.53 s; 0→340 in 0.30 s. Those are the mythology numbers — a 520-tonne hull
   doing fighter-in-a-drill choreography.
4. **Model through the forge loop.** Design on paper (five words, silhouette, three values,
   one identity color) → `saucer.py` → Blender preview export → `fleet-look.mjs`
   inspect/close/top renders → critique the PNGs → iterate ≥10 cycles → `publish.mjs`
   → census regen → push each packet so nothing lives only on the VM.
5. **PR last.** The branch carries data + model + regenerated packages + tests in one
   reviewable packet.

## 5. Verification

- `validateRoleLattice(SHIPS)` → zero errors; `findDominatedSameTierHulls` → none.
- Dims: `{combat 146, cargo 23.1, mining 0, handling 100, tank 77.4, utility 132, speed 17.2}`.
- Kernel feel (measured, revision 2): 90° right-angle turn settles heading+velocity in
  ~2.3 s at cruise; 340→0 in 0.37 s; boost-ceiling 900→0 in 0.53 s; 0→340 in 0.30 s.
- Boost: pool 360 (fleet largest), `dashImpulse` 400 (fleet strongest kick), authored
  regen 48 (doubled at spawn) — drain 22 gives ~16 s of continuous burn or nine full
  dashes per pool.
- Mass authority: 520 t operational (2nd heaviest hull); contact solver transfers the
  capped 40 wu/s contact Δv — a 30 t fighter takes ~17× the saucer's Δv from the same
  impulse. It is knocked around; the saucer is not.
- Publish pipeline: manifest row synced (tris/bytes/bounds from real GLB), pilots
  refreshed (real hashes), all render packages rebuilt, census regenerated clean.
- Baseline: `check:baseline` green with the `cameraOccluders.js` placeholder in the
  tree (see note); `hull-integrity` + `j07-hud-contract` + wholeship LOD/admission/roles/
  propulsion suites green — 101 focused tests. The revision-2 model went through the
  forge critique loop again (buried field vanes re-seated, dish throat light added;
  60,570 tris LOD0 — mid-pack vs the 65k fleet ceiling) after the first pass's 10
  critique-driven iterations (tri budget, rim language, gun placement, dish/drive-core
  exposure, dome ring, mass-read proportions) plus a LOD1 identity check before publish.
