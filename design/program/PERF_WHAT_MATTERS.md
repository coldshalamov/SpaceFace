<!-- LIFETIME: DURABLE -->
# What actually matters for performance

Owner instruction. Full analysis: [`PERF_TABLE_ANALYSIS.md`](./PERF_TABLE_ANALYSIS.md).
Campaign: [`PERF_PERSISTENCE_GOAL.txt`](./PERF_PERSISTENCE_GOAL.txt) and
[`PERF_PERSISTENCE_CAMPAIGN.md`](./PERF_PERSISTENCE_CAMPAIGN.md).
If an agent is “working on perf” and the work is not a row in **Do this**, they
are slog. Stop them.

Picture contract is unchanged: default bloom, shadows, particles, population,
and near meshes stay on. This is not a quality-cut campaign.

## The two problems (do not mix them)

| What you feel | What it is | Size |
|---|---|---|
| Picture freezes for a beat when something **new** appears, then catches up | **Hitch** — one expensive one-shot on the main thread | Used to be 50–500+ ms. Sector-entry GPU hitch is largely **gone**. |
| Sticky 30 fps even while nothing new is happening | **Crowded frame** — every-frame work too fat for 16.7 ms | Remaining pole. |

Agents collapse these and then tweak bloom, prewarm, and classifiers forever.

## What already landed (do not redo)

Measured on the owner Intel iGPU, headed, default picture.

1. **Shadow map was redrawn every frame even when nothing moved.** That was
   the “bloomScene” bill. Gating refresh to real motion cut that pass
   **247 ms → 3.6 ms** on the sector-entry route (about **98%**). Continue and
   New Game then reported `presenting`. **This was the 50% GPU hitch.**
2. Hitch classifier, shader-key census, compose-slice, admission-slice,
   upload-after-present, and exact-key **prewarm** were measured. Compose,
   upload, admission, and autosave were **not** the pole on the live 20 s fly.
   Exact-key prewarm **made the fly worse** (147 ms → 207–219 ms). **Do not
   retry prewarm** without a new census that names a new owner.
3. Bloom-off did not save crowded p95. Bloom extra work is ~0.5 ms. **1%. Drop it.**

Stale campaign text that still says “presentation is the hitch” or “sim is
not the owner” is **wrong after the shadow gate**. Believe the latest headed
witness, not Wave A tables from 2026-08-20.

## What is not the problem

| Idea | Verdict |
|---|---|
| Turn bloom down / off | 1%. Already measured. Illegal as a default fix. |
| Retry shader prewarm | Tried. Fly got worse. Closed. |
| Seats / cabins in Hornet | You fly **Hitch**, not Hornet. Hornet seats were Blender authoring, not the live ship. Dock interiors draw **when you are docked**. They are not the fly hitch. |
| Delete hidden triangles at runtime | Offline export concern. Runtime occlusion-culling every triangle is more expensive than drawing the table. |
| Port the renderer to Rust / Bevy | Three.js **is** the renderer. A rewrite is a new game. Illegal as a silent swap. |
| WebGPU because it is new | Long-horizon after the table is cheap. Not the current pole. |
| Empty the sky / shrink hail range | Quality cut. Illegal. |
| Classifier coverage, extra timers, more probes | Measurement is done enough to pick a pole. More probes are slog. |

## Seats, cabins, invisible stuff

Industry rule: don’t pay for what the camera cannot use.

- **Live fly:** the table already hides off-glass roots. Rocks popping at the
  rim is that cull, not a hitch. Far AI still **simulates** even when not drawn.
- **Inside a ship:** Hitch’s live mesh is the outside. Hornet cockpit furniture
  is not in the ship you are flying. If a future GLB ships interior triangles,
  they **would** still be transformed (the GPU does not know they are “inside”).
  Fix that at **export**, not with a runtime “don’t draw seats” system.
- **Dock interiors:** supposed to draw at the dock. Leave them.

Invisible work that **does** still run every tick: physics bodies that cannot
sleep, AI/traffic beyond the table, unique shader programs the first time a
new look appears.

## Real remaining work (this is the list)

Ranked by expected player-facing win. One pole at a time. Headed A/B or revert.

### 1. Sleep work that is not on the table — **the next 50%**

**Do this.** `PQ-129.15` / `PQ-080`, then `PQ-084` if physics is still fat.

After the shadow gate, the biggest remaining bucket on the green sector-entry
fly was **simFrame p95 ~9 ms** (budget is 5 ms). Rapier dynamic bodies are
forced awake (`setCanSleep(false)`). AI still thinks across a huge radius.

Player outcome: far ships and rocks stop burning the tick; hostiles and
anything on the glass stay 60 Hz. Picture unchanged.

This is a **cadence refactor**, not a tweak. If an agent is not changing who
runs each sim step, they are not on this leaf.

### 2. Fewer unique GPU programs — **the “new ship hitch”**

**Do this** if a headed fly still hitchs the first time a new hull, canopy, or
plume appears.

Census still found **12–14 shader programs linking at draw time** after boot.
Prewarming dummies made the frame worse. The legal fix is **fewer keys**, not
more warmup: share materials by role, collapse canopy/plume lanes that already
share a program (`PQ-129.13` / `PQ-076`). First sight of a new ship then has
nothing new to compile.

If an agent is adding more dummy meshes to precompile.js, stop them.

### 3. Batch unique on-glass hulls — **crowded 30 fps, if still true after 1**

**Do this** only after a crowded fly shows **draw-call / GPU present** as the
pole while sim is already ≤5 ms.

Rocks are already instanced. Unique ships still pay many opaque draws. Intel
iGPUs tax draw count. **Same-material BatchedMesh** is legal (`PQ-129.12`).
The old “one mixed mega-batch” **lost 250–616 ms**. Do not replay it.

### 4. Snapshot fence — **only as a door to a Worker**

`PQ-081`: present reads a packed snapshot, not live entity objects. Required
**before** a sim Worker. Do not start a Worker without this; copy cost will
eat the 4 ms you are chasing.

### 5. Rust / WASM / Worker / WebGPU — **not yet**

Physics is already Rapier WASM. Extra Rust islands (`PQ-083` / `PQ-091`) and a
sim Worker (`PQ-082`) are legal **after** (1) and (4), and only if a spike
(`PQ-067`) shows copy cost < savings. Do not wrap Three.js. Do not rewrite
the engine.

WebGPU (`PQ-089`) is a backend swap after the table is cheap. Not a hitch fix.

## Forbidden slog (kill these tasks)

- Bloom strength, bloom-off, “just one more pass timer”
- Retry exact-key prewarm
- Hitch classifier % coverage
- Living-hull decal / sticker micro-opts as the perf campaign
- Hornet seats as a perf task
- Quality presets, dynres, FSR
- “Port it to Rust” with no named CPU island and no copy bench

## How to run this

```
node scripts/program-dispatch.mjs --id PQ-129
```

Take **`PQ-129.15`** (table cadence / sleep off-table). Finish it. Headed
witness. If sim p95 is still >5 ms, take physics sleep (`PQ-084`). If the
player still hitchs on first new ship, take program-lane collapse (`.13`).
If crowded flight is still 30 fps with sim already cheap, take unique-hull
batch (`.12`) with the mixed-batch ban in the leaf.

`--next` still returns fleet remaster. That is not perf.

## Done when

Matched headed Continue + combat fly on the owner GPU:

- Hitch frames >32 ms stay rare (not 8/8).
- Sim p95 ≤ 5 ms in crowded flight.
- Present stays in the 16.7 ms budget with bloom and shadows on.
- First hostile / new traffic is not a 40+ ms compile brick.
- Picture unchanged.

Until then, the magical combination of words is: **sleep off-table sim, then
collapse shader keys, then batch same-material hulls. Nothing else.**
