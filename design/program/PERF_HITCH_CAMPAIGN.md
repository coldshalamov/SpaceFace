<!-- LIFETIME: DURABLE -->
# Hitch smoothness campaign

Admitted executor for the reserved same-picture catalog in
[`PERF_OPTION_SPACE.md`](../PERF_OPTION_SPACE.md). Queue identity:
[`PQ-129`](./roadmap/active/PQ-129.md). Map door: [`CANONICAL_BUILD_MAP.md`](../../CANONICAL_BUILD_MAP.md)
§1 and §8.4.

This file is method and evidence. It does not replace the catalog. It does not lower default
quality. It does not start Worker / WebGPU / native work because those ports are fashionable.

## Why a new campaign exists

`PQ-051`–`PQ-128` were reserved in the map and never admitted to `program-queue.json`. The last
queued performance parent is `PQ-034`–`PQ-044`. Green `check:perf-packets` proves eleven Node
unit tests, not a smooth player fly. That is why a large option list sat next to a hitching game.

When the owner says the game hitches, run **`PQ-129`**, not `--next` (that still returns fleet
remaster) and not INFERENCE.

```text
node scripts/program-dispatch.mjs --id PQ-129
```

Take the first claimable leaf. Finish it. Commit that leaf. Take the next. Keep going until
the stop condition below is met.

## Picture and behavior contract

Same as `PERF_OPTION_SPACE.md` §1 and `PERF_BUDGET.md` §3:

- Default bloom, shadows, particles, render scale, pixel-ratio cap, authored near meshes, and
  on-glass population stay on.
- Input, flight, weapons, collisions, and required physics stay 60 Hz and deterministic.
- Browser and Electron remain one game.
- A timer win that empties the table is a failed cycle.
- Quality knobs, triangle-count trims, and ~2% easy-road opts are not the plan.

## Two different problems (do not collapse them)

| Class | What the player feels | Typical owner | First leaves |
|---|---|---|---|
| **Hitch** | The picture stutters or freezes for a beat, then catches up | One main-thread brick: compose, compile, upload, Continue/sector admit, autosave, GC | `.01`–`.10` |
| **Crowded p95** | Flight is a sticky 30 fps even when nothing new appears | On-glass GPU submit / fill / shadow on Intel iGPU | `.11`–`.16` after hitch count is halved |

July 2026 crowded-flight already showed both: idle windows can hold 60 fps, while one compile or
compose brick drops a 40–500+ ms frame. August 2026 still matches that split.

## 2026-08-20 measurement (headed Electron, real Intel iGPU)

`npm run probe:runtime-witness` — New Game → flight, seed 47, ~20 s sample.

**Verdict: hitching.** The canvas was updating. Eight of the last eight samples were hitches.
Biggest bucket: **presentation**. GPU was real (`ANGLE Intel Direct3D11`, integrated), not
SwiftShader.

| Window | presentation | admission | render | sim / simFrame | ui | vfx |
|---|---:|---:|---:|---:|---:|---:|
| First flight samples | max **13483 ms**, p95 151 | max **2003 ms**, p95 85 | max 13321 | sim max 188 | max 364 | max 207 |
| Last 8 samples | p95 **99**, max **515** | 0 in the tail | p95 96, max 510 | sim p95 14 / simFrame p95 47, max 416 | p95 4.8 | p95 2.0 |

Disclosed confounders (do not hide them, do not ignore the bricks):

- Lifecycle reported `foreground-occluded` (the probe window may not have been frontmost).
  Occlusion can inflate steady frame time. It does **not** invent a 13 s present or a 2 s
  admission slice.
- `drawCalls: 0` on the witness sample is a counter hole, not proof that nothing drew. Canvas
  hashes still changed (3 unique of 3).
- Shader `WebGLProgram` warnings fired during the fly — first-use programs still link on the
  playable path.
- Concurrent Blender/agent load may be present. Use **names and ratios**, not a single
  millisecond as gospel.

## What live code already proved (seven read-only reviews, 2026-08-20)

Do not rediscover these. Do not undo them. Invalidate a leaf if a new headed census disagrees.

1. **Sync `buildComposedShip` still runs in flight.** The “no compose on the combat thread” gate
   only blocks a *visible procedural hull*. Live ships mount as empty slots, and empty slots are
   an explicit exception, so ordinary NPCs still compose on rAF. No part yield. This is the
   named 40–250 ms brick (`PQ-073`). Witness admission max 2003 ms is this class.
2. **Hitch classifier exists and is off on default play.** Owners are named in unit tests
   (`compose`, `compile`, `upload`, `autosave`, …) but live frames only pass coarse
   sim/present/ui/vfx/admission lumps (`PQ-062`).
3. **One late present still cascades extra sim ticks** (`MAX_CATCHUP_STEPS = 4` + shed). Not an
   unbounded spiral; still “one hitch can become three” (`PQ-101`). Witness simFrame max 416 ms
   in the tail is this amplifier, not the first owner.
4. **Continue/opening admission is sliced; combat/traffic first-use is not.** The stall moved
   into the fight (`PQ-054` leftovers, `PQ-075`).
5. **Off-glass 3D horizons are mostly retired.** Glass + 0.75 s runway submit, approach-seconds
   residency, table VFX/trails/instance cull. Hail/radar **5200** and region fade **1500** are
   gameplay/sky — do not shrink them as a cull (`PQ-124`, `PQ-125`). Remaining off-table mesh
   cost is already-authored landmarks in the current sector (`PQ-071`).
6. **Crowded p95 is still GPU submit/present** on this iGPU once spikes are ignored. Bloom-off
   did not save the July 6 crowded fly. Rigid opaque batching is only partial (`PQ-052`).
   Adaptive resolution is **off** on hardware (illegal as a default fix).
7. **Sim is not the hitch owner.** Rapier bodies cannot sleep (`setCanSleep(false)` for replay).
   AI sensors still query ~1600 WU. That is a later p95 leaf (`PQ-080`, `PQ-084`) **after**
   presentation bricks die. Do not start a sim Worker (`PQ-043` / `PQ-082`) now.

## Execution law (every leaf)

```
symptom → detector → census
       → invalidate if not the pole, A/B worse, pixels change, stall moved, or quality cut
       → else one IMPL leaf → tests of real functions → headed A/B → keep | revert
```

- One pole per cycle. Do not stack bloom, batching, and compose in one commit.
- Headed Electron or headed Chrome on the real GPU. Headless hitch-budget is SwiftShader.
- `flight-compose-gate.test.mjs` is a policy test. It does not prove combat is smooth.
- `check:playable` after every IMPL leaf. A green module check is not smoothness.
- If the same candidate fails with the same fingerprint, keep the evidence and switch leaves.
  Do not rerun the unchanged probe.

## Leaf order

Reserved catalog IDs in parentheses are the work. `PQ-129.xx` is the admitted dispatch unit.

### Wave A — name the hitch (do not skip)

| Leaf | Reserved work | Player outcome | Done when |
|---|---|---|---|
| **`PQ-129.01`** | `PQ-061` tabletop census | We know glass vs runway vs beyond counts on a fixed-seed fly | Repeatable probe writes those bands |
| **`PQ-129.02`** | `PQ-062` hitch classifier | Every >32 ms frame has a named owner on the **live** path | Headed fly attributes ≥90% of hitches; compose/compile/upload/autosave are distinct |
| **`PQ-129.03`** | `PQ-063` phase timers | Sim / prep / submit / present / UI / VFX clocks are honest on the bloom path | Matched A/B can say which bill grew |

### Wave B — kill the named bricks (invalidate if the classifier disagrees)

| Leaf | Reserved work | Player outcome | Done when |
|---|---|---|---|
| **`PQ-129.04`** | `PQ-073` compose-part-slice | Building a ship cannot drop a 40–250 ms present brick | Empty-slot live path no longer sync-composes a whole hull on rAF; on-glass ships still appear |
| **`PQ-129.05`** | `PQ-075` next-contact warm | Hulls about to enter the glass are prepared before the lock | First combat/traffic is not an on-glass compose |
| **`PQ-129.06`** | `PQ-064` shader-variant census | Live program keys vs precompile keep-alives are listed | First-use keys that still compile on the playable path are named |
| **`PQ-129.07`** | `PQ-072` exact-key prewarm | First sight of a live shader key is not one display callback | Classifier loses that first-use bucket; Continue does not absorb the stall |
| **`PQ-129.08`** | `PQ-074` upload-after-present | First texture/buffer upload does not share the present beat | Upload bucket falls |
| **`PQ-129.09`** | `PQ-054` leftover admission | Continue / sector entry / `prepareSectorEntry` no longer dump a seconds-scale stall onto first flight | Opening watermark holds; late roots cannot extend it |
| **`PQ-129.10`** | `PQ-101` catch-up spiral | A late present does not force 2–4 extra sim ticks into the next miss | One hitch does not become three; hashes hold |

### Wave C — crowded 60 fps after hitch count is halved

| Leaf | Reserved work | Player outcome | Done when |
|---|---|---|---|
| **`PQ-129.11`** | `PQ-068` glass-runway submit | Runway draws are the measured approach, not leftover fake-visible | On-glass submit holds; total submits fall; no pop |
| **`PQ-129.12`** | `PQ-052` rigid opaque batching | Crowded fleets keep authored look with fewer opaque submissions | Same-scene GPU-frame reduction; mixed unique hulls included |
| **`PQ-129.13`** | `PQ-076` on-glass lanes | Canopy / plume / transparent programs collapse without pixel change | Fewer submits; stills match |
| **`PQ-129.14`** | `PQ-108` tiny-on-glass LOD | A 30-pixel fighter is cheap; a close ship stays full | Pixel histogram; close lod0 unchanged |
| **`PQ-129.15`** | `PQ-080` table cadence | 60 Hz is the table and the fight; off-table AI/traffic sleep | Sim p95 ≤ 5 ms in crowded flight; hostiles stay awake |
| **`PQ-129.16`** | `PQ-097` / `PQ-078` present fusion | Cheaper bloom/HDR only if present is the remaining pole | Stills keep the halo; else close no-mutation |
| **`PQ-129.17`** | `PQ-087` autosave hitch | Autosave cannot occupy a display callback | Autosave disappears from the classifier |
| **`PQ-129.18`** | `PQ-094` pole sweep | New poles become new reserved leaves instead of folklore | Keep / reject / new-leaf note |

Wave C leaves stay **planned** until Wave B has a headed receipt that hitch count is ≤ half the
2026-08-20 tail (8/8 hitch samples) **or** the classifier names that Wave C owner as the live
pole. Promoting a Wave C leaf early is allowed only when `.02` names it.

## Routing table (after `.02`)

If the census says… | Do this leaf | Do not do
---|---|---
Compose / `buildComposedShip` / `admissionMs` 40–2000 ms | `.04` then `.05` | Bloom off, LOD trim
First-use `WebGLProgram` / compile | `.06` then `.07` | Skip shaders, raise timeouts
Upload / `texImage` / buffer grow | `.08` | Shrink textures as a “fix”
Continue / sector-entry seconds | `.09` | Move the stall into first shot
Echo misses after a named brick | `.10` | Raise `MAX_CATCHUP_STEPS`
On-glass draw count, GPU present, idle 33 ms | `.11`–`.14` then `.16` | Worker, WebGPU
Sim p95 > 5 ms and GPU already cheap | `.15` then later `PQ-084` | Sim Worker before snapshot fence
Autosave / unknown gap near save toast | `.17` | Drop transactional save
Unknown | `.18` mint a reserved leaf | Invent a parallel catalog

## Stop condition

Matched headed Continue + combat fly on the owner GPU:

- Hitch count (frames >32 ms) ≤ half the Wave A baseline, **and**
- No 40+ ms compose/admission brick on first hostile, **and**
- Picture contract holds, **and**
- `check:playable` green.

Then either Wave C until crowded p95 is ≤16.7 ms or already vsync-locked, or `.18` records that
the remaining pole has no leaf.

## Illegal as this campaign

- Lowering default `renderScale`, bloom, shadows, particles, or population.
- Replaying heterogeneous BatchedMesh that already lost 250–616 ms p95.
- Headless hitch-budget as acceptance.
- Editing sim goldens to hide a cadence change.
- Treating `NOW.md` as a stop.
- Sweeping Hornet / drill / other dirty lanes into a perf commit.

## Probes this campaign actually trusts

| Command | Trust for |
|---|---|
| `npm run probe:runtime-witness` | Freeze vs hitch vs live picture; coarse phase lumps |
| `npm run check:hitch-budget -- --headed` | Frame >32 ms on real GPU (not SwiftShader) |
| `npm run check:perf` | Crowded-flight p95 / submit once hitches are named |
| Headed fly with hitch attribution **on for a window only** | Named owner (`PQ-129.02`) |
| `npm run check:playable` | Game still boots and flies after an IMPL leaf |
| `node --test test/flight-compose-gate.test.mjs` | Policy only — not smoothness |

## References

- [`PERF_BUDGET.md`](../PERF_BUDGET.md) — 16.7 / 33.3 ms, forbidden quality cuts
- [`PERF_OPTION_SPACE.md`](../PERF_OPTION_SPACE.md) — reserved identities this campaign consumes
- [`PERF_SYSTEMATIC_PROGRAM.md`](../PERF_SYSTEMATIC_PROGRAM.md) — 2× / 5× hitch stop conditions
- [`PERFORMANCE_CAMPAIGN.md`](./roadmap/PERFORMANCE_CAMPAIGN.md) — 2026-07-29 hitch-bound Phase 0
