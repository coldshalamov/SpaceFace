# W1 — 47-A determinism note (2026-11-06)

The v24 47-A tape `1fedbd09…` is red on the current tree. This note records the isolation so
nobody re-records foreign motion under W1.

## Evidence

| Tree | Legacy hash | Verdict vs previous |
|---|---|---|
| `dd57d3ae` — pre-W1 third pass | `1fedbd09dc3d8b70c4c392f6258b44f41a3969295e2df550b5eeeaa723084331` | recorded v24 |
| `0405699d` — W1 third pass | `80abf1e4b3401fdffdaea1a1c2c526312e01725843927cdb2724dc10da78d5ae` | CONTENT_ONLY |
| `53f34e42` / `b1d5cc3f` — render / E1 | `80abf1e4…` | unchanged |
| `65f09fb8` — P1/P2 | `ebbfe82a6bf1e87ac1912942751e661fe6cf4ba42e69a2ddce360c408385061b` | MOTION_CHANGED |
| `cc6df5dc` — current (X1/X3/X5) | `ebbfe82a…` | identical to P1/P2 |

`node scripts/sim-golden-diff.mjs --ref 0405699d4180` against an exported W1 tree is not the
right comparison because the working tree has later commits. Exporting the W1 tree and inspecting
it directly gives the exact W1-only delta:

- tick 1, 60 and 720: the only field difference is `$.story.journeyActs` (`{seen,current}` added);
- zero `pos` / `vel` / `rot` / `angVel` / `prevPos` fields moved;
- no event-count change (combat:damage stays 2, projectile:hit stays 2).

So W1's third pass is content-only. The motion appears exactly at P1/P2:

- `65f09fb8` changed `NEW_GAME.modules` from `mod_shield_booster_s` to `mod_shield_liner_s`
  (`src/data/newGameDefaults.js`), a deliberate P1/P2 loadout decision.
- Tick-1 effect: dry mass `35 → 33`, shield `345 → 210`, max speed `136.80 → 142.13`.
- Tape effect: 215 fields (143 entities, 69 physics, 2 input, 1 entity-list), 70 motion fields;
  combat:damage and projectile:hit `2 → 4` as the scripted intercept evolves around the lighter,
  faster, less-shielded starter. No flight, gunnery or projectile code changed in that commit.
- `sim-golden-diff --ref 65f09fb8` reproduces current exactly, so no later commit adds motion.

## Decision

- **No W1 re-record.** v24 remains the active reference; do not record v26 from this lane.
- P1/P2 owns the version decision: either accept the starter-loadout tape change and record v26
  with the exact delta above, or revert `mod_shield_liner_s` to restore `80abf1e4…`.
- Any eventual v26 must include W1's content-only `story.journeyActs` field; that field is the
  only W1 delta and it is not motion.

## Guard

`test/w1-third-pass.test.mjs` now proves the W1 act-receipt path never rewrites the starter fit or
flight-derived stats, never draws `state.rng`, and emits no combat/flight/physics event.
