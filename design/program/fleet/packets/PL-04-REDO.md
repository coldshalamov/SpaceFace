# PL-04-REDO — Civilians scramble for spilled cargo (rebuild, by the rules)

**Lane 2.** PL-04 in `design/program/INFERENCE_PLANTS.md` (read the row exactly). The first build (ac34b298) was reverted
(8069dd80): it fired the player's `pickup:collected` for an NPC, and it "recovered" a stolen pod by its **stale numeric id**
after the end-of-step sweep had recycled that id — reviving an unrelated new entity. Read the revert's diff
(`git show ac34b298`) for what to keep (the timing, the barks) and the review finding in
`design/program/fleet/reviews/2026-11-12-9615eb79.md` ("Recovering a stolen pod bypasses entity lifecycle").

## Rules (hard)
- Follow `design/program/fleet/packets/PLANT-NEXT.md` in full, **including both hard rules** at its end: emit only your
  own events; lease job-owned hulls through `helpers.npcJobs`, never mint ships.
- A grabbed pod is **carried as data** on the civilian (commodity, amount) — the pod entity is despawned through the canonical
  helper. Killing or Shoving the civilian **spawns a fresh pod through the canonical spawn helper** with a freshly allocated
  id and the carried cargo. Never look an entity up by an id you stored across ticks without checking it is still the same
  entity (generation — `occupantGenerationOf` in `src/core/entity.js`).
- Node tests only (no browser): the grab, the drop on kill/Shove with a NEW id, an id-recycle case (the old id reassigned to
  another entity must be untouched), and asserting `pickup:collected`/`dock:*`/`entity:killed` are never emitted by the plant.

Commits: `plant: <the line> (PL-04)`.
