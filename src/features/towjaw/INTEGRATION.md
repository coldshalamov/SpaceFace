# TOWJAW source candidate

Base: `coldshalamov/SpaceFace` master `45a97fdbda62611cc13001bd16790f8afa844753`.
Result branch: `codex/pro-five-towjaw-20261022`.

This candidate implements the fight, its production adapter, encounter contract,
presentation, and executable focused tests. Shared integration remains with
Codex in the current local tree. No global owner, registry, save, balance, or
status file is changed. No local dirty state was available to this build.

## Required shared hooks

1. Register a fresh `createTowjawSystem()` from `src/features/towjaw/index.js`
   as system `towjaw`. It must run on the fixed pre-physics clock after actions
   and fields and before `physics`. The encounter director calls scripts at
   1 Hz and is deliberately not the spring/attack clock. Add its module and
   `INIT_ORDER`, `UPDATE_ORDER`, and `TABLE_CLOCK_IDS` entries through the existing
   registry and manifest owners; do not add it to `CALENDAR_CLOCK_IDS`.
2. Discover `src/data/encounters/8101-pro-five-towjaw.js` through the existing
   encounter catalog generator. It supplies the existing `selfRegistered`
   `fire/choose/tick` contract. Its route is optional, Vesta-only, in a derelict
   field, and spawns nothing before the explicit investigate choice.
3. In `src/combat/damage.js`, import `interceptTowjawDamage` directly from
   `../features/towjaw/damageBridge.js` and apply
   `input = interceptTowjawDamage(state, input);` at the start of the nested
   `routeDamage(input)`, before resolving attacker/target/packet. This is the
   one incoming damage hook: interception redirects an ordinary packet to the
   first live physical plate; the production damage owner still owns all HP.
   The bridge returns the original object for unrelated targets. Do not add a
   second damage listener, refund HP, or monkey-patch the kernel.
4. In `src/save/saveSystem.js`, capture `towjaw` via `_callSerialize('towjaw')`
   alongside the capital boss entry in `_saveCapturePlan`, write it in
   `_serializeDataSteps`, and pass it to `_callDeserialize('towjaw', data.towjaw)`
   after world/entities/combat restore near `_restoreCapitalBossFightsChunked`.
   The fixed-clock system intentionally delays its rebind until the first
   flight tick. Keep that ordering; never spawn the encounter from save data.
5. Mount the optional HUD adapter with `mountTowjawPresentation` from the
   existing HUD/render host, using its existing `helpers.worldToScreen`. Pass
   the active runtime, call the returned `draw()` per presentation frame, and
   `destroy()` on replacement/teardown. It draws only warnings, cables, labels,
   and mechanism markers over actual normal-renderer ship/wreck/cargo bodies.
   A headless event adapter already emits existing audio and structural FX cues.

## Focused checks

In a complete exact-base checkout:

```sh
node --test --test-isolation=none test/pro-five-towjaw.test.mjs
```

The uploaded context omits large generated sources and Rapier. VM verification
uses an external loader for three unchanged files fetched at the exact base:
`src/data/modelTruthCensus.generated.js`,
`src/localization/catalogs/en-US.generated.js`, and
`vendor/rapier3d-compat/rapier.mjs`. No stubs, new dependencies, or shared source
edits are used. The loader/cache is not part of this candidate.

This early checkpoint passes 25 named tests, including seeds 4242 and 7331,
real native Rapier cage assembly, directional damage, production Pin, native
Massline theft, mechanism damage, physical scrap impact, salvage uniqueness,
lost/recycled entity protection, rollback, director admission, and fixed-clock
save rebind. Further attack and presentation verification is in progress.

Codex owns full shared-wiring checks, save envelope integration, authored-model
rendering and Adventure player-truth. No GPU or player acceptance is claimed.
