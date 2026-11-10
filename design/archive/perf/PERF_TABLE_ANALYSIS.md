<!-- LIFETIME: DURABLE -->
# Full performance analysis for this camera (not a flight sim)

This is the analysis, not an implementation pass. Do not start coding from
this file until a leaf names one pole.

The game is a **tilted bird’s-eye table**. The readable ground at default
chase is about **156 × 96** world units (live census). Maximum zoom-out is
still a few hundred units, not a horizon. Agents who talk about “far ships,”
LOD2 fleets, and Destiny-style unique-look budgets are pattern-matching the
wrong genre.

## 1. The live numbers (not guesses)

Headed Intel D3D11, New Game, seed 47, 20 s thrust. Source:
`PQ-129-01-tabletop-census-REPORT.md`.

| Band | Count | Meaning |
|---|---:|---|
| On the glass (what the camera covers) | **2–3** | Actually in the picture |
| Runway (about to enter) | **4–8** | Kept so a fast ship does not pop |
| Beyond | **315–319** | Exist in the sector, **not on the table** |
| Submitted (policy) | **7–11** | Allowed to draw |
| Meshes in memory | **12–16** | Resident, including prefetch |
| Persistent landmarks | **42** | Sector fixtures; not all meshed |

Final frame: 3 glass, 7 runway, **317 beyond**, 10 submitted, 16 resident.

**The big mismatch:** the GPU is asked to draw about **ten** things. The
sim still owns about **three hundred and twenty**. Optimizing draw for “far
ships” is solving a problem the submit path already solved.

After the shadow-refresh gate (`PQ-129-16`), a sector-entry fly reported
`presenting`: `bloomScene` p95 **3.6 ms**, presentation p95 **6.8 ms**,
**simFrame p95 9.0 ms** (budget 5 ms). GPU present is no longer the 50%
hitch. Simulation of the sector is.

## 2. What “awake” means (no metaphor)

Three clocks, three different answers.

### Drawing (GPU)

A thing is **drawn** if it is submitted this frame.

- Off-glass roots are **not** submitted. That is already law.
- Resident meshes (12–16) include a short prefetch so something entering
  the table is not built on the same frame it appears.
- 317 “beyond” are **not** in the picture. Rocks blinking at the rim is
  this cull, not a hitch.

### Thinking (AI / traffic)

A thing is **thinking** if its AI/traffic planner runs this tick.

- Player, hostiles, and combatants think **every tick**, even if far.
- Passive traffic is supposed to slow down outside an “authority” radius.
- That radius is **the largest table you can zoom to**, not the current
  view (`tableSimAuthorityWuFromState` uses zoom 144–330 and a 48:9
  worst-case aspect, hearing far **under 800 WU**).
- “Sleep” is not off. Inactive owners still think about **every 8 ticks**
  (`shouldOwnerThink` → `sleepPeriodTicks` default 8). So far haulers still
  wake ~7.5 times a second.

That is what “sleep far traffic” meant, badly said: **stop paying 60 Hz
(or 7.5 Hz) for ships you cannot see and that are not fighting you.**

### Physics (Rapier)

A thing is **physical** if it has a rigid body the solver steps.

- Dynamic bodies are created with **`setCanSleep(false)`** so save/reload
  stays deterministic. They never nap.
- Each physics step **`syncFromEntities(state.entityList)`** — the whole
  list, not the table.
- Spatial hash rebuilds from the full list (or layered static/dynamic
  indexes), then steps.

So: **not drawn ≠ not simulated.** 317 beyond still cost CPU every tick
unless an owner explicitly skips them. Drawing is cheap relative to that.
This is the sector-as-open-world mistake.

## 3. LOD — mostly the wrong tool here

The selector (`lod.js`) picks lod0 / lod1 / lod2 from **projected pixels**.
Hitch (the player ship) is **forced lod0**. Extra lod1/lod2 GLB files exist
for several hulls. Stations “LOD” only **hide greebles** when the mesh is
already small on screen.

Why agents love LOD: in a horizon FPS, a ship 2 km away is still drawn as
a speck, so a cheap mesh pays.

Why it does not apply as the main win here:

- A ship that is truly far is **beyond**. It should have **no mesh**, not
  lod2. The census already shows that (317 beyond, 16 meshes).
- Putting lod2 on beyond traffic would **re-introduce** meshes you currently
  do not draw. That is a regression dressed as optimization.
- The only LOD that belongs: **on-glass** contacts that are already
  submitted but only occupy tens of pixels (a fighter on the table, not a
  fleet on the horizon). That is a small crowded-frame leaf after sim is
  cheap. It is not the big mistake.

If a task says “add LOD for far ships,” reject it unless the census shows
those ships are **already submitted**.

## 4. Batching — what is on, what was tried, what is off

| Mechanism | Status | What it is |
|---|---|---|
| Common rocks as InstancedMesh (5 variants) | **On** | Many rocks, few draws |
| Authored instance chunks for repeated plates | **On** | Traffic kit pieces |
| Fold those chunks into Three `BatchedMesh` | **Written, shipping OFF** | Per-frame repack. On Intel, enabling it moved `bloomScene` **11 ms → 114 ms**. Disabled on purpose in the renderer. |
| One mixed mega-batch of unique hulls | **Rejected earlier** | Lost 250–616 ms p95 |

So: we did batch the thing that repeats (rocks). We did **not** forget
batching. The next batching idea (merge unique ships every frame) **already
hitchd worse**. Do not tell an agent to “just batch” without a new census
that names draw-count as the pole **and** a design that does not repack
every frame.

Destiny can have thousands of unique looks because albedo/normal maps share
**already-cooked GPU programs**. This game hitchs on **new WebGL programs**
(first `linkProgram` of a permutation: lights × maps × skinning × tone-map).
PQ-129.06 measured **12–14 programs still linking at draw time** after boot.
PQ-129.07 tried to prewarm those keys; **the fly got worse**. Unique *paint*
is fine. Unique *programs* are the hitch. The legal fix is fewer programs
(shared material roles), not fewer ships, and not dummy prewarm.

## 5. Insides of ships — art mistake vs GPU pole

These are different questions.

**Does the fly hitch because of seats?** No. The glass has **two or three**
entities. Hitch (player) is lod0 outside. Hornet seats live in **Hornet /
Drifter / Ranger construction scripts**, not in the ship you start in.
Dock interiors (`place_dock_interior*`) draw **in dock**, which is correct.

**Did agents still model insides nobody sees?** Yes. That is an art-pipeline
defect. It must be forbidden on **every** ship, not excused because you are
on Hitch today. If interior triangles ship in a live GLB, the GPU **will**
transform them (it does not know they are “inside”). Fix at **export**
(chase-camera dry run), not a runtime occlusion system (that would cost
more than drawing ten objects).

Live Hitch hero script still builds a **service-bay inner volume**
(`BayInterior`) — open machinery, not a walkable cabin. Wreck Cathedral
has `InteriorExposedAlloy` as a landmark surface. Audit those at export.
They are not the 317-body sim bill.

## 6. What does not belong (the actual mistakes)

1. **Simulating the whole sector at combat rates** while drawing a table.
   Physics never sleeps. Far AI still ticks. Spatial hash still sees
   hundreds of collidables (`shouldMaintainDynamicSpatialHash` turns on at
   96 collidables / 96 asteroids — the Helios fly is over that).
2. **Applying FPS LOD/horizon recipes** to a camera that already dropped
   317 meshes. LOD2 as “keep far ships cheaper” would put meshes back.
3. **Retrying GPU tricks that already lost** (exact-key prewarm, per-frame
   BatchedMesh, bloom-off).
4. **Modeling interiors** for a chase camera that never enters the hull.
5. **Treating the packaged GLB manifest as the whole picture** — code-built
   cans, rocks, gates, drones still exist (`WORLD_VISUAL_CENSUS.md`).

What **does** belong and is already roughly right:

- Draw only glass + short runway.
- Instance repeated rocks.
- Keep bloom/shadows/particles on; shadows now refresh only when casters
  actually move (that was the 50% GPU hitch).

## 7. Ranked work (plans, not slog)

One pole per leaf. Headed A/B. Revert if worse.

| # | Pole | Why it is real | Do | Do not |
|---|---|---|---|---|
| **1** | Sim of the 317 | simFrame p95 9 ms vs 5 ms budget after GPU present got cheap | Really stop far passive bodies: physics sleep or exclude from Rapier step; AI **off** not 8-tick; keep hostiles and on-table 60 Hz | LOD2 them; shrink hail; Worker before a snapshot fence |
| **2** | First-use WebGL programs | 12–14 `linkProgram` after boot; prewarm failed | Fewer programs (shared roles, collapse canopy/plume if they already share a shader) | Dummy prewarm, “fewer unique ships” |
| **3** | On-glass tiny fighters | Only if crowded fly is still 30 fps **after** 1, and those ships are **submitted** | Cheap on-table mesh for tens-of-pixels contacts | Horizon impostors, far fleets |
| **4** | Same-material batch without per-frame repack | Only if draw count is the pole after 1 | Persistent batches, update dirty slots only | Re-enable the disabled per-frame BatchedMesh; mixed mega-batch |
| **5** | Worker / Rust / WebGPU | Only after 1, and after present reads a packed snapshot | Spike copy cost first (`PQ-067`). Rapier is already WASM. Never port Three.js | “Rewrite in Rust” as the campaign |

## 8. Forbidden from this analysis

- Bloom knobs, classifier coverage, extra probes as the work
- Retry `.07` prewarm
- LOD for beyond
- “Just batch” without saying rocks are already instanced and BatchedMesh hitchd
- Interior deletion as the GPU strategy
- Quality cuts

## 9. How an agent is allowed to proceed

Read this file. Take **one** row from §7. Dispatch `PQ-129` only for that
row. If the task is not a row, it is slog.

`--next` is fleet remaster, not perf.
