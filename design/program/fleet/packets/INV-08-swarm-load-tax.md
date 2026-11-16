# INV-08 — What does a Swarm load cook that an Adventure load does not? (READ-ONLY, measured)

**You change no tracked file.** Files only under `.devshots/fleet/inv08/`. Output: RECEIPT.md.

## Why
Adventure New Game cooks the Helios sector (more entities) in ~28 s; Swarm PLAY takes 34–54 s and its arena runs
INSIDE the same Helios sector (36 stations alive at first hostile vs 19 at the Armory). Before anyone rebuilds Swarm
as its own clean world, we need the Swarm-only tax, itemised. Prior receipts: INV-01, INV-07, INV-07b (your runs).

## Do this — both doors in ONE lock session, back to back, same probe
1. Boot the Adventure opening (New Game → first flight) and Swarm (title → SWARM → PLAY → first hostile), each
   from a clean profile. For each, record `state.render.openingCookLedger` (every row: step, wall ms, issues,
   programs, yields) and the label timeline.
2. **Ledger diff:** a table of every step: Adventure ms | Swarm ms | only-in-Swarm? Rank the Swarm-only and
   Swarm-much-bigger rows.
3. **Attribution at first hostile (Swarm):** for every resident drawable (visible or not) record the owning
   entity (walk parents to `userData.entityId`) and classify it **arena-owned** (survival / swarm floor / wave /
   arena props) vs **sector-owned** (stations, world sites, landmarks, beacons, campaign entities, sky). Report
   meshes, unique materials, unique geometries, textures, programs per class.
4. **Native time:** take a CDP `Tracing` trace (categories `devtools.timeline,disabled-by-default-devtools.timeline,
   v8.execute,gpu`) over the Swarm load window and split the native bucket INV-07 could not name: style recalc,
   layout, paint, GPU/compile tasks, image decode, GC. For style recalc, give the top invalidation initiators
   (the trace's `UpdateLayoutTree` / `ScheduleStyleRecalculation` stack or element) — something invalidates style
   ~50×/s during loading even with a small DOM.
Run ONLY through the lock. Never kill a lock holder you did not start.

## Receipt
The ledger diff table, the arena-vs-sector attribution table, the native-time split with the style-invalidation
source(s) (`file:line`), and your ranked list of the 3 changes that would cut the most Swarm load seconds.
