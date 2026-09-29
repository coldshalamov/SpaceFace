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

Built: `drive_inertialess_s` in the GRAVIMETRIC family — maxSpeed 190, boostMaxSpeed 255,
maxAccel 950, maxBrakeAccel 1200, responseHz 9.5, yawAccel 26 / yawBrake 34 / maxYawRate 4.2,
solverSpeedLimit 640, travelCeiling 252, resources idle 0.6 / perAccel 0.03 / heat 0.024 /
cooling 5.0. The GRAVIMETRIC family choice is load-bearing: `TRAVEL_CEILING_FAMILY_MULT`
gives gravimetric drives ×1.5 supercruise ceiling — the saucer keeps that reach.

Counterweights that keep it honest: maxSpeed 190 is *below* the gravimetric S drive's own
168→245 boost profile; the drive spends a capacitor at 0.03 energyPerAccel — sustained
maximum-authority flight drains `energyCap` against `energyRegen`. The identity is *control
authority*, not raw pace.

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

Built: a `ship_saucer` envelope — translation 1.0 (the drive is already past sanity;
scaling further would clip the kernel), strafe 1.0 (the field answers identically in every
direction — a disc has no preferred axis), yaw 1.10/1.15/1.10, lateralKill 1.15,
stopHorizon 0.72, governor 0.95, brakeHorizon 0.75, neutralBrake 1.10. New
`CLASS_FALLBACK.exotic` entry so any future exotic hull inherits the shaping, and a
`ENEMY_HULL_FEEL_ALIASES.ship_saucer` self-map so an NPC saucer keeps the same envelope
rather than silently borrowing the capital row.

### Ship roster + lattice — `src/data/ships.js`, `src/data/shipRoleLattice.js`

`ship_saucer`: T5 `role: 'exotic'` — the first hull of a new role class. mass 520,
cargo 120, handling 2.2, designMass 780 (the drive is rated well above the hull's own
operational mass: loading cargo or hanging a tow never wallows it — the inertialess field
reads the same to the pilot), hull 1700 / shield 1900 / regen 26, energyCap 1400 /
regen 120, collisionRadius 19, price 3.2 M, bankFactor 0.12 (saucers bank almost
imperceptibly — the field doesn't roll to turn).

Weapon map: two M hardpoints plus `{size:'S', facing:'turret'}` — the turret-facing S mount
is load-bearing for the fiction. A disc has no nose arc; the turret is its native
engagement cone. `combat` computes to 90 from the slot score (5×14 + tier 5×4).

Lattice row: `flightClass: 'exotic'` (new class — `flightClassForHull` consults the row
first), `roleLabel 'Inertialess Disc'`, biases opMass 1.20 / handling 1.15 / thrust 0.85 /
turn 1.20 (all inside the validator's 0.8–1.2 band), careerFit hunter 0.75 / hauler 0.60 /
prospector 0.35 — the hull hunts by repositioning and hauls by dragging.

Pareto legality: `findDominatedSameTierHulls` pairs every same-tier hull. The saucer wins
handling (100) and speed (17.2) vs the Leviathan while losing combat/cargo/tank/utility —
strictly non-dominated and non-dominating. Verified: zero dominated pairs with the row live.

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
LOD correctly. Matching `vfxProfiles.js` entries map def and drive to `engine_resonator`.

### Model toolchain — `tools/blender/forge/`

Five-word idea: *lit-rim gunmetal inertialess disc*. `tools/blender/forge/ships/saucer.py`
lofts a lenticular disc along +X — circular planform `w(x)=sqrt(R²−x²)` with a rim floor so
the edge keeps finite thickness and a slight rim droop for the classic lenticular profile.
Metallic central dome with dark glass canopy and a cyan light ring at its base; ventral
gunmetal dish with the glowing cyan drive core (`HOOK_DRIVE_CORE` + `SOCKET_Engine_Main`);
a 24-bead `glow_cyan` rim light chain that persists through every LOD (the identity element
and the de-facto drive visual); annulus rim bezel; radial `band()` seams as panel lines;
small ventral field vanes; red port / green starboard / amber apex nav lights. Damage hooks
on the ventral core, a rim segment, the apex beacon, and a rim plate. Sockets: camera focus,
cargo ventral, engine main, RCS port/starboard, tether massline (ventral core offset —
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

- **Custom drive VFX body** — the rim light chain *is* the drive visual; a separate VFX
  profile would double-read.
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
   Measured on the live kernel: 90° turn converges in ~0.3 s with ~1 hull-length of drift;
   190→0 in 0.47 s. Those are the mythology numbers.
4. **Model through the forge loop.** Design on paper (five words, silhouette, three values,
   one identity color) → `saucer.py` → Blender preview export → `fleet-look.mjs`
   inspect/close/top renders → critique the PNGs → iterate ≥10 cycles → `publish.mjs`
   → census regen → push each packet so nothing lives only on the VM.
5. **PR last.** The branch carries data + model + regenerated packages + tests in one
   reviewable packet.

## 5. Verification

- `validateRoleLattice(SHIPS)` → zero errors; `findDominatedSameTierHulls` → none.
- Dims: `{combat 90, cargo 23.1, mining 0, handling 100, tank 58.1, utility 132, speed 17.2}`.
- Kernel feel (measured): 90° right-angle turn ~0.3 s, ~1 hull-length drift;
  190 WU/s→0 in 0.47 s under `maxBrakeAccel` 1200.
- Mass authority: 520 t operational (2nd heaviest hull); contact solver transfers the
  capped 40 wu/s contact Δv — a 30 t fighter takes ~17× the saucer's Δv from the same
  impulse. It is knocked around; the saucer is not.
- Publish pipeline: manifest row synced (tris/bytes/bounds from real GLB), pilots
  refreshed (real hashes), all render packages rebuilt, census regenerated clean.
- Baseline: `check:baseline` 16/16 green; `hull-integrity` + `j07-hud-contract` 63 green;
  wholeship LOD/admission/roles/propulsion suites green. Model went through 10
  critique-driven iterations (tri budget, rim language, gun placement, dish/drive-core
  exposure, dome ring, mass-read proportions) plus a LOD1 identity check before publish.
