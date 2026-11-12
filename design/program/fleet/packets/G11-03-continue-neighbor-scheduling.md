# G11-03 — Continue without stale sector work

**Status** Open. Keep the current restore order until a measured Continue bottleneck calls for a change.

Continue requests `sliceNeighbors`, but `world.enterSectorChunked()` omits it from the residency plan. The live restore already yields inside each neighbor build. A production Node restore from a Helios save had 61 materialization yields both ways. Forwarding the option changed what `sector:enter` listeners saw from three resident sectors and 66 live bodies to Helios alone and 45. Both runs ended with the same 102 semantic bodies, but their entity IDs and serialized entity slices differed.

An interrupted candidate drain also resumed an old Ceres neighbor after a new Ceres entry. It replaced the active bag, downgraded FULL to REDUCED, left 19 extra bodies, and published a stale `world:residency` receipt.

## Build when a Continue trace identifies a blocking neighbor chunk

Keep the current entity allocation order and the complete resident set at `sector:enter`. Split the blocking chunk at an existing world-owner phase boundary. If the fix needs a deferred queue, bind the drain to its originating world, enter epoch, and queue. Check those identities after every yield and before writing resident metadata or emitting the arrival receipt.

## Write set and acceptance

- Edit `src/systems/world.js`, `src/save/saveSystem.js`, and focused world or restore tests only.
- Continue the same Helios save through both schedules. Check player pose, resident tiers at arrival, restored actor IDs and durable records, and the reserialized entity slice. The 47-A v27 tape does not exercise the world owner.
- Supersede a queued neighbor between two materialization yields. The old generator must stop before a spawn, tier write, or receipt. The new active bag must remain FULL.
- Compare the identified blocking phase on the same save through ordinary Continue using the game lock. Record whether the loading shell keeps painting and whether the save resumes into playable flight.

Local reproduction evidence is in `.devshots/sim-step-profile/stand-in-continue-residency.json`.
