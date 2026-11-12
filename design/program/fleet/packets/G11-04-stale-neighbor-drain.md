# G11-04 — A superseded sector load stops; it never overwrites the new one

**Lane 2. Stability.** From G11-03 (stand-in repro, `.devshots/sim-step-profile/stand-in-continue-residency.json`): an
interrupted neighbor-candidate drain **resumed an old Ceres neighbor after a new Ceres entry** — it replaced the active bag,
downgraded FULL to REDUCED, left 19 extra bodies, and published a stale `world:residency` receipt. That is a real bug today,
independent of any Continue performance work.

## Build
Bind every deferred/generator drain in the world owner to its originating **world, enter epoch and queue** (read how
`world.enterSectorChunked()` and the neighbor drain yield — `src/systems/world.js`). After every yield, and before any spawn,
tier write, resident-metadata write or receipt emit, check those identities; a superseded drain stops cleanly (and releases
anything it reserved). Do not change entity allocation order or the resident set at `sector:enter` for the normal path.

## Write set
`src/systems/world.js`, `src/save/saveSystem.js` only if the restore path owns the drain, and focused tests.

## Checks
- New test: supersede a queued neighbor between two materialization yields → the old generator stops before any spawn, tier
  write or receipt; the new active bag stays FULL; no extra bodies.
- Existing world/restore tests (`ls test | grep -i "world\|residency\|restore\|continue\|sector-enter"` — run those).
- `npm run check:sim` (v27 identical) and `npm run gate -- --quick`.
Commit: `fix(G11-04): a superseded sector load stops before it can overwrite the new sector`.
