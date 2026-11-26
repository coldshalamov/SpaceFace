# PERF-09 — three repeated costs in every simulation step

**For:** a careful engineer. **Kind:** performance, no behaviour change. **Commit when green.**

## Why

The 60 Hz simulation step must fit in 16.7 ms. In a busy Swarm wave it averages 9.5 ms on a quiet
machine and spikes past the budget, and the player sees the world stall. A CPU profile found three
places that redo the same work every tick. Remove the repeats. The game must behave identically.

## Measure first

```
node scripts/sim-crowd-stress.mjs --ticks=600 --warmup=240
```

Save the whole output as your "before" (the `sim-step ms` line and the per-system table). For a
function-level view: `node --cpu-prof --cpu-prof-dir=.devshots/perf09 scripts/sim-crowd-stress.mjs --ticks=600 --warmup=240`.
Run each measurement twice and report both; other agents share this machine, so compare runs taken
minutes apart, never hours apart.

## The three repeats

1. **Activity classification re-runs every tick.** `tacticalAI.update` calls
   `ensureActivityClassified`, which re-runs `classifyWorld` whenever the entity-index membership
   version changed, and every projectile spawn bumps that version (about 1.4 ms per tick). Find the
   membership version and the classifier (`src/world/activityRuntime.js`, `src/systems/tacticalAI*`,
   the entity index in `src/core/`). Make classification depend only on what it actually reads:
   projectiles (and other short-lived bodies that are never classified) must not invalidate it.
   Keep the result identical for every entity that is classified.
2. **Collision proxy manifests are resolved per body per tick.** `resolveCollisionProxyManifest` is
   called from `sg02DynamicBodyOwner._syncRecord` (`src/core/sg02DynamicBodyOwner.js`) and from
   `physics._syncProjectileBroadphase` (`src/systems/physics.js`), about 0.6 ms per tick. A body's
   manifest only changes when its hull, scale or proxy data changes. Cache it on the record, keyed
   by exactly the inputs the resolver reads, and invalidate on those.
3. **Run state is validated on every query.** `liveSwarmRun` runs `validateRunState` on every
   projectile query and propulsion resolve (about 0.2 ms per tick). Validate when the run state
   changes, not when it is read.

If the profile shows one of these is no longer true at the current commit, say so with the profile
lines and move on. If you see another repeat of the same kind costing more than 0.2 ms per tick,
fix it too and report it.

## Prove it

- The "after" numbers from the same command, twice. State the change in `sim-step ms` mean and p95
  and in each touched system's row.
- `npm run check:sim` must print the same hash as before your change (it replays a recorded flight
  against a golden file). Run it before you start so you know it passes. A moved hash means you
  changed behaviour: find out why and fix it.
- Run the focused tests that import the modules you touched
  (`grep -rln "<module name>" test | head -30`, then `node --test <those files>`), before and after.
  Report any test that changed result.

## Files you will touch

`src/systems/tacticalAI.js` (or the file that holds `ensureActivityClassified`),
`src/world/activityRuntime.js`, `src/core/sg02DynamicBodyOwner.js`, `src/systems/physics.js`, the
file that defines `liveSwarmRun`, and tests for them. Nothing in `src/render/` or `src/ui/`.
