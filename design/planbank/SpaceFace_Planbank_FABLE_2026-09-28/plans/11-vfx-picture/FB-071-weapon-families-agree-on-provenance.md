# FB-071 — Every weapon's picture and voice agree, keyed on the impulse provenance it already carries

**Kind:** build · **Lane:** THE FIGHT · **Routing:** open
**Seam tags:** seam: vfxProfiles.js, seam: audioSystem.js
**Write-set:** `src/render/vfxProfiles.js`, `src/audio/audioSystem.js`, `test/fb-weapon-family-provenance.test.mjs`
**Neighbours (extend, never restate):** SFQ-B182, SFQ-B193, SF-229

## The gap
`WEAPON_PRESENTATION` has 10 families for 31 weapons, resolved by damage type and id substring;
`recipeForWeapon` resolves audio by a different branch order. Neither reads `impulseProvenance`, which
`src/data/weapons.js` claims keeps identities from collapsing. Result: `wpn_snarl_s` (a web) draws as an
autocannon tracer, `wpn_gravity_marker_s` and `wpn_momentum_sink_s` draw as EMP bolts, `wpn_gravity_well_m`
draws as a vector mine, and `wpn_inertial_shunt_s` is autocannon on screen but gravitic in the ear.

## Why this direction
New per-weapon VFX was rejected (feel is not content). The provenance string is already on every def and
already stable; branching on it first gives the four physics-first verbs their own families and makes render
and audio use one classification.

## Mechanism
- Add `gravitic`, `latch` and `ram` families to `WEAPON_PRESENTATION` (built from existing primitives: field
  ring, filament, wedge) and make `resolveWeaponPresentationFamily` branch on `impulseProvenance` before damage
  type.
- Export the same classifier for audio so `recipeForWeapon` shares it; keep the family→recipe table in one
  place.
- Pin a table test: every id in `WEAPONS` (including the four `EMERGENT_WEAPON_DEFS`) resolves to the same
  family in render and audio, and no two verbs with different provenance share a family.

## Done when
`test/fb-weapon-family-provenance.test.mjs` passes the table for all 31 weapons; snarl, marker, sink, well and
shunt each have a distinct family; the seed-4242 Crucible draft with the snarl shows the web family on the
first shot (record from the VFX record log, not a still).

## Do not
Do not add a family per weapon id. Do not touch damage or impulse numbers. Do not change the starter pulse
voice.

## Focus test starting points
- `test/emergent-vfx-materials.test.mjs`
- `test/combat-verb-cues.test.mjs`
- Locate `vfxProfiles` suites with `rg vfxProfiles test/`.
