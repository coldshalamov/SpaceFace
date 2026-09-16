<!-- LIFETIME: DURABLE -->
# Table authority — implement the living sector without a 60 Hz CMS

**Date:** 2026-09-09  
**Goal prompt:** [`../program/TABLE_AUTHORITY_GOAL.txt`](../program/TABLE_AUTHORITY_GOAL.txt)  
**Picture contract:** default bloom, shadows, particles, population, near meshes stay on. Browser and Electron stay one game.

This file is the implementation plan from an independent 2026-09-09 research session. It is **not**
another hitch-classifier catalog. Older operator text that says the next 50% is “sleep 317 Rapier
bodies” is **wrong on this build**. Rapier is already filtered. The remaining cost is 98 systems
walking a fat `entityList`.

Scaffolding for the island is **already in the tree**. Do not start a second asteroid field, dressing
table, far-actor table, or clock system. Finish, prove, then do runway and present-first.

---

## 1. What the player needs

A tilted table with ~10 visible ships should lock 60 fps on the owner laptop (Ultra 7 155U + Intel
iGPU) with the default picture. Off-screen life must still exist when you return: same rocks, same
hauler on its route, same wreck. Things must not blip in as empty slots at the rim.

Two failures — do not merge them:

| Feel | Owner |
|---|---|
| Sticky 30–50 fps while nothing new appears | Fat 60 Hz tick: too many live objects + too many systems |
| 100 ms–9 s freeze when something new appears | First-use compile / compose / upload on the present beat |

---

## 2. Measured starting point (do not re-derive from old memos)

**Headless Ceres refinery pocket**, seed 14920, production runtime, Rapier dynamic, Node only
(no Three.js, no DOM). 2026-09-09.

| Fact | Number |
|---|---|
| Live `entityList` | **408** (290 asteroids, 64 FX, 20 wrecks, 17 stations, 15 ships) |
| Rapier bodies / dynamic | **66 / 17** |
| Activity stamps | S0 23 · S1 41 · S3 dormant 344 |
| Systems with `update()` | **98** of 107 in `PRODUCTION_UPDATE_ORDER` |
| Headless tick | p50 **6.2 ms** · p95 **9.8 ms** · max **46 ms** (budget **5.0 ms**) |
| Physics avg | **0.79 ms** — not the pole |
| Next CPU: surrender, actions, world, npcJobs, traffic, law, combat, flyby… | long tail; none is 5 ms; they sum to ~5.4 ms |

**RAM (JSON floor, same pocket):**

| Thing | Size | Count | Total |
|---|---|---|---|
| All live entities | — | 408 | **600 KB** JSON (~1.5–3 MB live JS) |
| Live ship | ~7 KB | 15 | 107 KB |
| Live asteroid | ~1.3 KB | 290 | 370 KB |
| Existing world record | 1.3–3 KB | 11 | ~18 KB |
| Lean ledger row (id, pose, intent, wake) | **215 B** | — | — |

RAM is not why it hitches. Disk-paging 215-byte rows would be slower than keeping them. Disk is for
**saves** and **GLB/texture residency**.

**Other sectors:** atlas is 24 authored sectors. `RESIDENCY_MATERIALIZED_CAP = 3` (1 FULL + 2
REDUCED). The rest are `RECORD_ONLY`, cap **48 records/sector**. Worst-case record bag ≈ 2 MB.

**Player-route (headed, PQ-144.01, 2026-09-06, same laptop class):** sim-frame p95 7–17 ms; admission
gaps 0.5–9 s. Matches “fat tick + first-use GPU on the same rAF.”

---

## 3. Target architecture

**The glass plus a short approach runway is the only 60 Hz world.** Everything else is a formula
evaluated at `simTime` when it wakes.

### Three rings

| Ring | What exists | Clock |
|---|---|---|
| **Glass** | Player, nearby ships, shots, tethers, pinned missions | 60 Hz · Rapier · full AI |
| **Runway** | About to enter. Catch-up already applied. Mesh/shader already cooking | Warm *before* visible |
| **Ledger** | Compact row or seed. No Rapier. Not in `entityList` | Formula at wake |

### What each kind becomes

| Kind | Off-table representation | Wake |
|---|---|---|
| Unnamed rocks | Seeded field (`asteroidField`) + hash. **Not 290 entities. Not 290 records.** | Promote on mine / ram / tether / decode runway |
| Dressing / landmarks | `dressing` table rows | Presenter only unless a job pin |
| FX | Presenter pools | Never `entityList` |
| Unnamed traffic | Far-actor row + itinerary + `nextEventAtT` | Promote at runway; catch-up first |
| Named / mission / player-owned | Permanent world record (already exists) | Always exact if pinned |
| Off-screen NPC vs NPC fight | Scheduled outcome + seed — do **not** replay a dogfight | Resolve on wake if the player could have seen it |

### Catch-up (already written, must be *used* on promote)

`src/world/worldCatchup.js`: `ballisticDrift`, itinerary lerp, vitals regen, scheduled events.
`state.simTime` is the clock. On `promoteFarActor` / `promoteAsteroidFieldRock`, advance
`lastExactT → simTime` **before** the mesh submits.

### Runway times (already in `tabletopPolicy.js`)

Do not invent a second radius. Drive **promote + decode + submit** from these:

- Submit / no-pop: `TABLE_SUBMIT_APPROACH_SECONDS` ≈ 0.75 s
- Mesh resident: `TABLE_RESIDENCY_PREFETCH_SECONDS` ≈ 2.0 s
- Authored GLB decode: `TABLE_AUTHORED_DECODE_SECONDS` ≈ 4.0 s
- Evict farther than admit: `TABLE_RESIDENCY_EVICT_SECONDS` ≈ 2.5 s

At ~160 WU/s, 4 s ≈ 640 WU. Start load there. Never compose/`linkProgram` on the first glass frame.

### Lean far row (not a cloned ship)

Keep: id, type, pose, vel, rot, hull, shield, team, faction, hull/ship def id, intent, route,
`lastExactT`, `nextEventAtT`, home sector. Recipes restamp the rest. **Do not** `{ ...entity.data }`.

---

## 4. What is already in the tree (2026-09-09) — do not rebuild

Inspect before editing. If a helper exists, call it.

| Piece | Path | Status |
|---|---|---|
| Clocks | `src/runtime/authoritativeSystemManifest.js` `SYSTEM_CLOCK` / `CALENDAR_CLOCK_IDS` / `NEAR_CLOCK_IDS` | Calendar ≈ 2 Hz (30 ticks). HUD/voice = glass. |
| Skip | `src/core/catchupPolicy.js` `shouldSkipSystemThisStep` | Wired in `registry.js` and `sim.js`. Catch-up extra steps = **table only**. |
| Rock field | `src/world/asteroidField.js` | World spawn uses `insertAsteroidFieldRock` unless mine/tether/geology pin. |
| Dressing | `src/world/dressingTable.js` | Most world props. Activity-slot FX still `spawnEntity`. |
| Far ships/wrecks | `src/world/farActorTable.js` | `tickFarActors` from `world.js`. Snapshot still copies all `data`. |
| Living walks | `src/world/livingWorldViews.js` | Law/jobs skip rocks and FX **if callers use it**. |
| Catch-up math | `src/world/worldCatchup.js` | Exists; promote must call it. |
| Durable records | `src/world/worldRecords.js` | 48/sector; demote still often **leaves the live entity**. |
| Sector cap | `RESIDENCY_MATERIALIZED_CAP = 3` | Neighbors REDUCED; rest RECORD_ONLY. |
| Tests | `test/sim-clock-catchup.test.mjs`, `test/asteroid-field.test.mjs`, `test/far-actors.test.mjs` | Scaffold tests. Not a Ceres census. |

**Island is not done** until a Ceres quiet boot shows tens of live entities, not ~400, and headless
p50 is under the 5 ms sim budget.

---

## 5. Lanes (spawn one subagent per lane; never two on one file)

The parent agent is an orchestrator. It reads this file, claims `NOW.md` only for coordination,
and **spawns subagents**. Each subagent gets exactly one lane, the stay-off list, and the done-when.

A canvas agent may already own **Lane A**. If those files are dirty, **do not spawn a second A**.
Spawn B, C, then D after A’s census is green.

### Lane A — Combat island (membership)

**Outcome:** Off-table rocks, FX, and unnamed ships are not in `entityList`. Promote + catch-up on
approach. Calendar systems do not walk the fat list.

**Owns**

- `src/world/farActorTable.js`
- `src/world/asteroidField.js`
- `src/world/activityRuntime.js`
- `src/world/activityClassification.js`
- `src/world/livingWorldViews.js`
- `src/core/catchupPolicy.js`
- `src/runtime/authoritativeSystemManifest.js`
- `src/core/registry.js`
- `src/core/sim.js`
- `src/systems/world.js` (spawn / evict / `tickFarActors` only)
- `src/systems/missions.js`, `src/systems/factions.js` (iterator only — `forEachLivingWorldActor`)
- tests: `test/far-actors.test.mjs`, `test/asteroid-field.test.mjs`, `test/sim-clock-catchup.test.mjs`, plus a Ceres census test

**Stay off:** renderer, `presentationRunner.js`, the four leftover FX spawners (Lane B).

**Work**

1. Prove `tickFarActors` **removes** dormant ships/wrecks from `entityList`.
2. On promote, run catch-up (`lastExactT → simTime`) before submit.
3. Lean `snapshotActor` (no full `data` clone).
4. Point leftover `entityList` scans in missions/factions at living-world views / far queries.
5. Re-measure Ceres seed 14920: print `entityList.length`, field rock count, far-actor count, tick p50/p95.

**Done when:** quiet Ceres `entityList` is tens of objects; rocks are in `world.asteroidField`;
dormant traffic is in `world.farActors` and gone from the list; headless p50 **< 5 ms**.

### Lane B — Dressing leftovers

**Outcome:** Cosmetic `type: 'fx'` that is not a job pin or collider leaves `entityList`.

**Owns**

- `src/systems/heistFacilities.js`
- `src/systems/travelLanes.js`
- `src/systems/automation.js`
- `src/systems/asteroidSites.js`
- `src/world/dressingTable.js` (only if a helper is missing)
- focused tests next to those systems

**Stay off:** Lane A files, `renderer.js`, `world.js` residency.

**Work:** route through `insertDressingRow` unless the object must collide or is an activity pin
(those stay live entities — same rule world.js already uses).

**Done when:** a Ceres/Helios boot does not grow `entityList` by dozens of dressing FX; pins still work.

### Lane C — Runway / no-pop

**Outcome:** Anything that will hit the glass in a few seconds is already posed and decoded. Rim
does not blink. Oscillating on the lip does not thrash.

**Owns**

- `src/render/tabletopPolicy.js` (consume; do not fork numbers)
- `src/render/assetResidency.js`
- `src/render/startupGpuResidency.js`
- `src/world/presentationSources.js`
- compose / precompile **consumers** (inspect first; do not add dummy prewarm)
- residency tests

**Stay off:** Lane A membership files, `presentationRunner.js` until Lane D.

**Work**

1. Find the live “may draw / may build / may decode” path.
2. Drive it from the existing seconds constants × current top speed.
3. Inside the decode runway, **request** promote via existing `promoteFarActor` /
   `promoteAsteroidFieldRock` / field query. If promote is broken, do not reimplement membership —
   note it and keep the GPU side honest.
4. Never `buildComposedShip` or first `linkProgram` on a frame where that hull is already on-glass.
   Real next-contact keys only; idle-after-present or the loading shell. Dummy prewarm already lost.

**Done when:** approach at default chase zoom does not show an empty slot then a pop; lip oscillation
does not spam create/destroy; picture contract holds.

### Lane D — Present-first loop (after A census is green)

**Outcome:** A late present does not run 2–4 full CMS ticks before the next picture.

**Owns**

- `src/core/presentationRunner.js`
- `src/core/simulationRunner.js` (catch-up cap / shed only)
- loop tests

**Stay off:** membership, residency, clocks.

**Work:** present last snapshot first; leftover time to sim; max **one** extra **table** catch-up
after a late present. Do not start a Worker.

**Done when:** one hitch does not become three; hashes hold; flight still 60 Hz deterministic.

### Later (do not spawn now)

- Snapshot fence + sim Worker — only after A’s island is small and packed.
- Shared material-role collapse (fewer program keys) — if C still sees first-use compile after
  admission moved off-glass.
- WebGPU / native / Rust rewrite — new game if you port 107 systems unchanged.

---

## 6. Orchestrator rules

1. `git status --short` first. If Lane A files are dirty under another NOW row, skip A.
2. Spawn **B and C in parallel**. Spawn D only after A reports the Ceres census.
3. Each subagent: `agent-checkpoint.mjs start`, NOW row for **exact paths only**, `git add -N` new
   files, `check:baseline` after the lane.
4. One pole per subagent. No bloom-off, no quality knobs, no emptying the sky, no Rapier
   `setCanSleep(true)` as the campaign, no second option-space doc.
5. Parent integrates, re-runs the Ceres headless census, and reports in player words.

Ceres census recipe (parent or Lane A): production `createAuthoritativeRuntime`, seed **14920**,
`world.enterSector('sector_ceres_belt')`, relocate to the refinery pocket used by
`test/pq-149-02-ordinary-life.test.mjs` / `proofSixtySeconds.js`, 180 warm ticks, then count
`entityList`, `world.asteroidField.rocks`, `world.farActors.rows`, `world.dressing.rows`, and step
p50/p95 for 240 ticks.

---

## 7. Forbidden (this is how the last hundred answers failed)

- Another hitch classifier / option catalog / “sleep Rapier” leaf as the campaign
- Dummy exact-key prewarm during flight (measured worse)
- Per-frame BatchedMesh / mixed mega-batch (measured worse on Intel)
- LOD meshes for things that should have **no** mesh
- Bloom-off, dynres, shrinking hail as a default fix
- Disk-paging the ledger
- Two agents on `world.js` membership or `farActorTable.js`
- Treating `PERF_WHAT_MATTERS.md` “next 50% = sleep 317 bodies” as current truth

---

## 8. Campaign done when

On the owner GPU, default picture, New Game + Continue + quiet Ceres + one crowded fight:

- Hitch frames >32 ms are rare (not most samples).
- Headless quiet Ceres sim p50 ≤ 5 ms; crowded sim p95 in the same band once GPU is ignored.
- First new hull is not a 40 ms+ compose/compile on-glass.
- Leave and return: rocks, named wrecks, and itinerary traffic are still there (catch-up, not delete).
- Rim does not blink empty→mesh.

`PERF_BUDGET.md` still owns 16.7 ms / 5 ms sim. This file owns **how** to get there from the
2026-09-09 measured CMS.
