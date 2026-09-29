# FB-075 — Cargo pods, ore gems, credit chips and small wrecks read by silhouette at chase distance

**Kind:** build · **Lane:** THE PICTURE · **Routing:** open
**Seam tags:** seam: fragmentFamilies.js, seam: pickupMotionPresentation.js, seam: wholeShipLodPolicy.js
**Write-set:** `src/render/vfx/fragmentFamilies.js`, `src/render/pickupMotionPresentation.js`, `src/render/visualFactory.js`, `test/fb-pickup-role-silhouettes.test.mjs`
**Neighbours (extend, never restate):** SFQ-B171, SF-211

## The gap
Optic cells and debris have physically distinct bodies you can name before firing (`opticCellPresentation.js`,
`fragmentFamilies.js` authors four fragment families with their own construction logic). Pickups and small
wrecks have motion identity only: at chase distance a cargo pod, an ore gem and a credit chip are the same
speck. Adjacent to SF-211 (player hull silhouette), which is about the player's own hull, not pickups.

## Why this direction
Icons over pickups were rejected (HUD is not the world). `buildFragmentGeometry` already builds role-keyed
geometry procedurally; applying it per pickup class needs no Forge asset and no new pool.

## Mechanism
- Define one silhouette per pickup role (pod: capsule with a seam; ore: faceted block; chip: flat disc with a
  notch; volatile: sphere with a collar) as fragment-family recipes.
- Select the recipe in `visualFactory.js` where pickups get their mesh; keep the buoyant tumble from
  `pickupMotionPresentation.js`.
- Pin projected width at the chase camera: each role stays ≥ 6 px at zoom 144 and no two roles share a
  silhouette hash.

## Done when
`test/fb-pickup-role-silhouettes.test.mjs` asserts distinct geometry per role and the projected-width floor;
`node scripts/flight-look.mjs` at the gameplay camera over a seed-4242 pickup field is inspected and the four
roles are nameable without the HUD.

## Do not
Do not author GLBs for pickups (graphics lane). Do not add a sprite or billboard. Do not change pickup physics
radii.

## Focus test starting points
- `test/debris-fragment-families.test.mjs`
- `test/lod-selector-guards.test.mjs`
