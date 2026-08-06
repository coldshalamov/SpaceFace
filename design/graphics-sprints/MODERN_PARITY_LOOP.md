# Modern-Parity Loop

> **Measurement harness, not a new authority.** Priority still comes from
> [`TOP50_WONDER_BUILD_PLAN.md`](TOP50_WONDER_BUILD_PLAN.md); craft acceptance for authored 3D assets
> still comes from [`docs/visual-assets/`](../../docs/visual-assets/README.md); iteration validity still
> comes from [`VISUAL_ITERATION_PROTOCOL.md`](VISUAL_ITERATION_PROTOCOL.md). This file adds one thing
> those do not have: an **external bar**. It answers "how far are we from a 2020s game?" with a number
> per axis instead of an opinion, and it refuses to call a change an improvement if it cost frame time.

## 1. Why this exists

Every existing gate in this program is *internal* — it compares the build to its own briefs. That
catches unfinished work but cannot detect a whole-frame look that is internally consistent and still
a decade behind. The loop closes that by putting a matched modern reference frame next to ours and
having a reviewer that did not author the change score the difference.

## 2. Roles

| Role | Surface | Why that surface |
|---|---|---|
| Researcher | `grok -p` (terminal, web search on) | Pulls modern reference frames + a specific rendering lesson per frame, as structured JSON. |
| Subject | `scripts/capture-gameplay.mjs` | Captures our frame through the **real** player route on the **real** GPU, and returns p95/draw calls/triangles from the same run. Quality artefact and perf number are never from different sessions. |
| Reviewer | `codex exec -i` (CLI) | Separate process, separate vendor, sees only images + rubric + our frame budget. Does not inherit the authoring session's reasoning. |
| Driver | `scripts/gfx-parity-loop.mjs` | Runs a round, aggregates scorecards, applies the dual gate, emits the ranked worklist. |

**Reviewer surface note.** In-loop review runs on the codex **CLI** because the browser surface cannot
be driven unattended. Every round also writes a hand-reviewable packet to
`.devshots/gfx/rounds/<round>/packet-<scene>/` containing the exact images and the exact rubric, so
the identical review can be re-run in **browser Codex** for confirmation or when a verdict is disputed.

## 2b. The asset layer — `scripts/gfx-asset-audit.mjs`

The frame loop scores whole frames. This scores the **assets inside them**, so a "reads as plastic"
verdict can be traced to an exact GLB and an exact number.

```bash
node scripts/gfx-asset-audit.mjs [--limit 40] [--filter places]
```

It drives a **read-only** headless Blender (`tools/blender/gfx_asset_audit.py`) that imports each GLB
into a scratch scene and saves nothing — so it needs **no `blender` or `asset-manifest` mutex** and is
safe to run beside an authoring lane. Per asset it measures:

| metric | why it matters |
|---|---|
| `trisByLod` / `hasLod` | an asset with no lod1/lod2 renders at full detail at every distance, forever |
| `roughnessStdev` | **the headline number** — within-material roughness variation |
| `primitiveNamedMeshes` | meshes still called `Cube.125` / `Icosphere`: the G1 "recognizable primitive origins" signal |
| `textureSizes`, `materials`, `ormMaps`, sockets, collision | contract completeness |

> **Blender `--background` trap, paid for once:** `img.has_data` is **False** for packed GLB textures
> until something touches their pixels, so gating on it silently reports *every* asset as having zero
> textures. The first run of this tool did exactly that and produced a confident "no ORM maps" on
> assets that demonstrably have them. `image_ready()` now forces the decode by reading one pixel.
> Verify a new asset metric against a known-good asset before trusting a sweep.

### Finding 1 — a 42× geometry regression hiding in plain sight

| | `place_asteroid_rock_a` (accepted) | `place_asteroid_rock_b/c` |
|---|---|---|
| triangles | **1,977** | **83,200** |
| meshes | 6 (LOD0/1/2 × Rock/Warm) | **1, named `Icosphere`** |
| LOD chain | lod0 1238 / lod1 518 / lod2 221 | **none** |
| textures | 6 @ 1024² | 3 @ **256²** |
| material | `Material_Rock` / `Material_Warm` | **`LOD0_RockA_Mat`** |

rock_b/c are **42× the geometry and 16× less texel data** than the asset they replaced, with no LOD
chain at all. Their material is literally named `LOD0_RockA_Mat` — a WIP iteration *of rock A* written
to rock B/C's paths — which corroborates the live-source-overwrite defect already recorded in
`design/program/NOW.md` from the assets' own contents. Those rows belong to the census lane; this is
reported, not fixed.

### Finding 2 — twenty assets have roughness stdev of **exactly zero**

Full sweep: **85 shipped assets, 1,606,268 triangles, 41 with an in-file LOD chain, 72 flagged flat
roughness.** Of those, **20 have `roughnessStdevMax == 0`** — not "low variation", *none*. Their ORM
green channel is a single constant value stored in a full-size texture.

| group | assets | tris each | ORM size |
|---|---|---:|---|
| **all 11 modular hulls** — capital, corvette, fighter, freighter, frigate, gunship, interceptor, miner, multirole, starter | 11 | 3.5k–14.5k | 1024² (+256²) |
| **all 6 engines** — industrial, ion_small, ion_twin, plasma_ring, resonator, vector | 6 | 3.3k–14.2k | 1024² |
| cockpits dome + slab | 2 | 2.6k–3.2k | 1024² |
| dock_interior grit + military | 2 | 636 | 256² |

The eleven hulls are the **modular kit every NPC ship is assembled from**. So the flat-specular
problem is not confined to one hero asset — it is the entire NPC fleet plus every engine.

> **This is distinct from the completed hull remediation, and does not contradict it.** NOW.md records
> "Modular-hull texture-role correction … the ten canonical GLBs moved from 34 errors/27 warnings to
> 0/0". That work fixed texture **roles** — correct channel assignment and colour space. It did not,
> and did not claim to, assert that the maps carry any **information**. Role-correct and
> content-empty are independent properties; nothing in the pipeline measured the second one until
> now. `engine_vector` additionally ships a 32×32 texture.

There is a performance corollary the user asked about directly: a 1024² ORM whose green channel is
constant is texture memory and sampler bandwidth spent to deliver a number that could be a material
scalar. Twenty assets do this. That is inefficiency with no visual return — the cheapest kind to fix.

### The renderer-side floor for flat roughness

The authored fix for a constant ORM green channel is breakup painted into the map, and that stays the
right long-term answer — it belongs to the asset lanes. `installRoughnessBreakup()` in
`src/render/authoredMaterialProfiles.js` is the renderer-side floor so a flat map still reads as a
surface with zones rather than a uniform sheet.

Applied to structural roles only — `hull`, `mechanical`, `accent`, `ceramic`, `radiator`, `service`,
`docking`. Glass, signal/emissive and drive apertures are *meant* to be smooth, and geology already
runs its own authored rock-surface path.

Four choices worth keeping:

- **Low frequency, not grain.** High-frequency roughness noise sparkles and aliases at distance,
  which is worse than the flat map it replaces.
- **Injected at `#include <lights_physical_fragment>`, not `roughnessmap_fragment`.**
  `installSingleSamplePackedOrmShader` in `partsLibrary.js` already rewrites that include; two
  replacements of the same needle would silently no-op whichever ran second.
- **One shared `customProgramCacheKey`**, so this is a single extra program variant, not one per
  material. Verified: `check:shader-compile` reports **106 programs / 0 broken** (108 before), so no
  variant explosion and the injected GLSL compiles.
- **Throws if the include disappears**, rather than silently shipping a no-op after a three.js
  upgrade.

Measured: **116 of 283 live materials** carry breakup; **p95 16.80 ms, max 16.90 ms** — free.

#### It did not move the score, and that is the finding

Median of **5**: `material` stayed at **2**, samples `[2,2,2,2,2]` — unanimous. The hypothesis that
constant roughness was what the reviewer meant by "plastic" is **disconfirmed at n=5**.

The prose says why, and it was misread first time round:

> "Here the ship reads as one flat **gray**."

That is an **albedo** observation, not a specular one — and the measurement was already in hand:
`hull_basecolor` R channel has **stdev 0.0108** (mean 0.283, range 0.259–0.439). **The base colour is
flatter than the roughness.** The reviewer's list — "glossy painted metal, dark inserts, glass,
emissive engine cores, scorched panels" — is about *value and colour separation across zones*, not
micro-roughness.

The breakup is **kept, but on principle rather than on evidence**: a constant ORM green channel is a
real defect regardless of whether this reviewer rewards fixing it, it costs nothing, and it is one
shared program variant. It belongs in the same category as the cinematic grade — correct, free, and
score-neutral. Do not cite it as a quality win.

#### The albedo hypothesis was tested too, and also failed

The obvious follow-up — modulate `diffuseColor` value with the same low-frequency field to create
lighter/darker zones — was implemented and measured. `material` stayed at **2**, samples
`[2,2,2,2,2]`, unanimous again. The prose barely moved: *"reads mostly as one matte gray material
with cyan emissive accents."*

**That term was reverted.** A global ±17% brightness multiply on every authored hull is a
substantive art-direction change belonging to the asset lanes, and shipping it unilaterally on a
hypothesis the measurement rejected would be exactly the mistake this document warns about
elsewhere. Only the roughness term remains.

### Conclusion: `material` cannot be moved from the renderer

| hypothesis | mechanism | result (n=5) |
|---|---|---|
| constant roughness reads as plastic | low-frequency roughness breakup | `material` 2 → 2, `[2,2,2,2,2]` |
| flat albedo reads as "one gray" | low-frequency value zones | `material` 2 → 2, `[2,2,2,2,2]` |

Two independent, well-motivated, free interventions, each measured at n=5, each disconfirmed. The
renderer-side floor for this axis is exhausted. What the reviewer asks for — "varied painted metal,
glass, emissives, worn edges" — is **authored variety per zone, readable at the ship's on-screen
size**. That is texture content, and the audit already names the exact 20 assets and the exact
channel to paint.

> This is the useful shape of a negative result: the next person does not need to re-run either
> experiment, and the remaining work is now a bounded authoring job on a known list rather than an
> open question.

## 2c. Authoring the fix — `tools/blender/gfx_orm_breakup.py`

Since the renderer cannot move `material`, the breakup has to be written into the map. This tool does
that, deterministically (noise seeded per image name, so a rebuild is byte-stable):

```bash
blender --background --python tools/blender/gfx_orm_breakup.py -- <job.json>
```

It writes to an **output path only** and never overwrites its input, so results are candidates for the
project's ordinary candidate → review → guarded-promotion path rather than live mutations.

First candidate, `hull_starter` — audited before and after with the same tool that found the defect:

| | ORM maps | roughness stdev min | max | tris | meshes | mats | LOD | sockets | tex sizes |
|---|---:|---:|---:|---:|---:|---:|---|---:|---|
| LIVE | 2 | **0** | **0** | 14,550 | 4 | 2 | lod0/1/2 | 2 | 256², 1024² |
| CANDIDATE | 2 | **0.0565** | **0.0652** | 14,550 | 4 | 2 | lod0/1/2 | 2 | 256², 1024² |

Contract-identical; only the defect changed.

> ### The `'orm' in name` trap — it bit twice
>
> **"n-orm-al" contains "orm".** The first authoring run wrote noise into
> `hull_starter_neutral_normal`'s green channel — the **Y component of a tangent-space normal** —
> which would have shipped visibly wrong lighting on every surface using that map. It surfaced only
> because the per-image report was read rather than trusting `ok: true`.
>
> The **audit tool had the identical bug**, counting normal maps as ORMs: `ormMaps` was inflated
> (3 where hull_starter has 2) and `roughnessStdevMin` was polluted. The headline "20 assets with
> stdev exactly 0" survives — it used `roughnessStdevMax`, and extra images can only *raise* a max,
> so a max of 0 still proves the real ORMs are flat — but both tools now match ORM only as a
> delimited token and exclude normal maps outright.
>
> Match texture roles on delimited tokens, never bare substrings, and always cross-check a
> generator's output with an independent reader.

### Finding 3 — near-constant roughness across the rest

Every audited asset measures ORM roughness **stdev 0.033–0.086** on a 0–1 range:

| asset | stdev | | asset | stdev |
|---|---:|---|---|---:|
| claim_outpost_relay | 0.033 | | seamed asteroid | 0.058 |
| rock_a | 0.039 | | debris_chunk | 0.059 |
| outpost base/bastion/refinery | 0.053 | | dead_hulk | 0.063 |
| asteroid_graffiti | 0.054 | | conveyor_barge | 0.086 |

The Kestrel measures 0.061–0.065 across its ORMs, with excellent *material-to-material*
differentiation (brushed metal metalness 0.93 / painted hull 0.03 / armour 0.30). So the split
between materials is right and the variation **inside** each material is almost nil.

Uniform roughness produces a uniform specular response, which is why well-authored, correctly
differentiated materials still resolve as plastic — and why `material` has scored 2/5 in every round
regardless of lighting, grade or IBL work. This is the quantified root cause of the recurring
"reads as plastic" note, and it is an **authoring** fix (breakup in the ORM green channel), not a
renderer one.

## 3. Scene taxonomy

Comparisons are like-for-like or they produce generic prose. A frame is only ever compared against
references of the same scene type.

| Scene type | Capture scenario | What it must exercise |
|---|---|---|
| `deep-flight` | `idle` | Open space, distant bodies, ship form against the void |
| `asteroid-field` | `asteroid-field` | Local occlusion, rock material, depth layering |
| `combat` | `combat-vfx` | Beams, impacts, shields, debris, worst-case overdraw |
| `boost-travel` | `boost` | Speed language, motion cues, plume |
| `ui-overlay` | `ui-overlay` | HUD/map integration with the render |

> **`dense` is not the asteroid scene.** `dense` seeds 180 rocks at 260–974 WU while the chase camera
> sees roughly 60 WU, so nothing it spawns is ever in frame — it is an entity-count stress test and
> its screenshot is an empty deep-flight view. Using it as asteroid-field evidence yields a confident,
> wrong verdict. `asteroid-field` places rocks inside the frustum at mixed depths on purpose.

**`station-approach` is researched but not yet reviewable.** The reference corpus contains five
station-approach frames, but no capture scenario produces that view, so the row is deliberately
absent from the table above and from `gfx-parity-loop.mjs`. Adding the scenario is open work; until
then those references are unused rather than silently mismatched.

**`combat` has TWO separate perf problems — do not conflate them.**

1. **Admission stalls.** At default warmup, combat measured p95 250 ms with a true worst frame of
   **1836 ms**, owned entirely by one synchronous authored-asset composition (see
   [`PERF_AUDIT_VALIDATION.md`](PERF_AUDIT_VALIDATION.md)). Needs offline render packages.
2. **A steady-state 30 fps lock.** With a 20 s warmup so admission is fully settled, combat still
   measures **p95 33.20 ms, max 33.50 ms** — while every other scene sits at 16.80 ms. 33.3 ms is
   exactly two vsync intervals: the frame is missing the 16.7 ms budget by some margin and vsync is
   snapping it to half rate. This is *not* a stall; it is sustained cost.

The second is far more tractable than the first and has a sharp implication: combat needs only
enough headroom to cross back over the 16.7 ms line, after which it snaps to 60 fps. Until both are
addressed, any combat quality score is measured on a frame the player experiences at 30 fps or worse
— do not read a low combat score as an art problem.

## 4. The dual gate

A round is an improvement only if **both** hold:

- **Quality** — no axis regressed materially, and the overall mean rose.
- **Perf** — no scene regressed on p95 (`--perfTolerance`, default 1.5 ms) or on the tail
  (p99/max, `--perfTailTolerance`, default 8 ms), and the run was not contaminated.

Quality bought with frame time is not a gain. Equally, perf bought by lowering visible quality is
forbidden by root `AGENTS.md` policy and by this loop: the reviewer scores the *result*, so a
quality cut shows up as an axis regression and fails the gate on the quality side.

### Gate on the tail, not just p95

p95 hides exactly the defect players feel. The combat capture measured **p95 250 ms while its true
worst frame was 1836 ms** — over 79 samples, one catastrophic frame barely moves p95. The driver
therefore records p95, p99 and max, and fails on a tail regression independently.

### Perf evidence must be valid, and "void" is not "pass"

Two fail-closed checks, both voiding the perf half of the round rather than passing it:

- **Software GL.** `capture.gpu` reporting SwiftShader/llvmpipe means the run measured software
  rendering. (This project has been burned by exactly that before.)
- **Admission contamination.** If `perf.phases.admission.max` exceeds
  `--admissionContaminationMs` (default 5 ms) inside the measurement window, the run measured
  asset composition, not rendering. This matters because the workaround — a long warmup — is also a
  way to *launder* the defect: warm the stalls away and the gate happily reports PASS on a route
  that freezes for the player. Making it explicit means a long-warmup run declares itself as
  "settled steady-state only".

### Reviewer scores carry variance — reviews are median-of-N

This is the single most important measurement caveat in the loop. Re-reviewing the **identical
frame** returned composition `[1, 2]`, geometry `[3, 2]`, ui_integration `[2, 3]`. At the low end of
the scale that spread is the **same size as a genuine one-band improvement**, so a single sample
cannot distinguish a real gain from a re-roll — which is why six substantive, individually verified
improvements in this program showed a flat single-sample mean.

- `gfx-review-frame.mjs --samples N` runs N independent reviews and reports the **per-axis median**,
  keeping the prose from whichever sample landed on the median score so the text still describes the
  number being reported. Each axis also carries `sampleScores` so the spread stays visible.
- `gfx-parity-loop.mjs` defaults to `--samples 3`. Drop to 1 only for a look you will not act on.
- The gate additionally treats a single 1-point dip as a warning, and a ≥2-point dip or two
  simultaneous dips as a real regression.
- When a verdict really matters, re-run the packet through browser Codex as a second opinion.

The same lesson applies on the perf side: see the `max`-is-noisy note in the driver.

## 5. Rubric axes

Each scored 1–5 against the matched reference, where 5 means parity or better:

`lighting` · `material` · `geometry` · `grade_post` · `background` · `vfx` · `ui_integration` · `composition`

The reviewer must return, per axis: the visual gap, where it is visible in **our** frame, one
concrete fix with a named technique, and a frame-cost estimate. The driver ranks work by
`(5 - score) / cost_weight` — largest visible deficit per unit of frame cost first.

The reviewer also returns `readsAsIntentional`. Authored emptiness is legitimate; the question is
whether a sparse frame reads as *composed* or as *unfinished*. That flag, not the raw scores,
decides whether a void sector is a defect.

## 6. Running it

Prerequisites: the dev server on `:8123`, and `codex` + `grok` on PATH.

Pull or refresh the reference corpus (research → images → provenance):

```bash
node scripts/gfx-pull-references.mjs --manifest <grok-output.json>
```

Run a full round:

```bash
node scripts/gfx-parity-loop.mjs --round 2
```

Review a single frame you already have:

```bash
node scripts/gfx-review-frame.mjs --scene deep-flight --shot .devshots/gfx/base-deep-flight.jpg
```

## 7. Constraints the reviewer is given

Recommendations that violate these are rejected, not implemented:

- Three.js on WebGL2. No compute shaders, no bindless, no hardware ray tracing, no mesh shaders.
- Must hold 60 fps on an Intel integrated GPU.
- Third-person chase camera; non-diegetic 2D HUD. **No cockpit/visor framing** — that motif was
  explicitly rejected for this game.
- Authored art direction may legitimately differ from a reference.

## 8. Anti-stall rule

If an axis does not move after a round, stop nudging parameters and **change method** — escalate to a
different technique or return to the earlier gate. This mirrors `VISUAL_ITERATION_PROTOCOL.md` §7.
The driver logs the per-axis delta each round so a stalled axis is visible rather than inferred.

## 9. Round log

| Round | Change | Perf (deep-flight) | Reviewer mean | Note |
|---|---|---|---|---|
| 1 | baseline | p95 16.80 ms | 2.00/5 | FAIL, `readsAsIntentional: false`. Worst axes: background 1, composition 1 |
| 2 | `renderScale` 0.85→1.0, `shadows` off→on | p95 16.80 ms, max 17.60 ms | 2.00/5 | Measured **free** on target hardware. All 8 axes unchanged — a real but sub-threshold win |
| 3 | wire `resolveSectorVisualProfile` into the two live `onSectorEnter` call sites | p95 16.80 ms, max 17.00 ms | 2.00/5 | Authored gas giant now renders at its authored NDC. composition +1, ui_integration −1 (within variance) |
| 4 | no change — gate validation run at default warmup | p95 16.90 ms, **max 250 ms** | 2.00/5 | Gate correctly FAILED on a tail regression p95 hid entirely |
| 11 | wire `spaceReflectionEnvironment.js` (IBL rig) — **sixth** zero-consumer module | p95 16.80 ms | **2.13 (median of 3)** | PMREM now captures the reflection rig instead of the near-black live scene |

### Score progression on the canonical stationary frame

All entries are median-of-3 on the same reproducible `idle` frame, directly comparable to the
original baseline. Earlier `cruise`-scored rounds are excluded — see the comparability rule above.

| round | change | mean |
|---|---|---:|
| baseline | — | 2.00 |
| 17 | star density, parallax retune, landmark `frac` | 2.00 |
| 19 | light rig derived from the authored landmark | 2.25 |
| 20 | rim strength 0.72 → 1.15 | 2.00 |
| 21 | fill re-roled as planet bounce (+ 0.32 → 0.60) | median-of-**5** |

> **Median-of-3 does not resolve differences at this score range — read this before celebrating a
> round.** Round 19 returned 2.25 and round 20, on the same build plus one rim tweak, returned 2.00.
> The samples show why: `background` was `[2,2,1]` then `[1,1,2]`, `ui_integration` `[3,3,3]` then
> `[2,2,3]`. Both rounds straddle the same band boundaries. **19's 2.25 and 20's 2.00 are not
> distinguishable**, and treating either as signal is a mistake this document made once already.
> The frame currently sits at roughly **2.0–2.25**. Round 21 onward uses `--samples 5`.

What *is* stable across rounds is the reviewer's prose, which is far more reliable than its numbers.
`lighting` has said "**dim ship**" every round regardless of score. That is why round 21 stops tuning
intensities and changes a light's ROLE instead: `ambient` is authored at 0.15 for true-black space,
so nothing lifts the shadow side, and the one enormous lit body on screen was throwing no light back.
A gas giant filling that much frame is physically a huge bounce card. `fill` now sits on the landmark
side, low and wide, taking the palette's fill hue — warm giant bounces warm, ice body bounces cold —
which is also review's "colored atmospheric fill" note. It does the job `ambient` cannot do without
lifting the blacks.

**Use the prose, not the number, to choose the next change.**

### Round 14 — the cinematic grade: shipped, but scored flat

Enabling the dormant composite grade (0.45) and vignette (0.12) visibly changed the frame — stars
gained colour separation (blue/amber/white instead of uniform white), the planet reads warmer, the
frame edge softens. Median of 3 versus round 13: **1.88 → 1.88, every axis unchanged**, and with
unusually tight sample agreement (`[1,1,1]`, `[2,2,2]`), so this is a genuine null rather than noise.
`grade_post` specifically did not move off 2.

It is kept anyway, on explicit grounds: it costs nothing (p95 16.80 ms, 101 tests + 5 contract checks
green, shader-compile 108 programs / 0 broken), it restores authored art direction that was dormant
on the played route, and it is a prerequisite for any future per-sector grade work. **But the honest
reading is that the reviewer does not reward it at this score range** — a frame at 1.88 is not being
held back by its colour balance.

That is the pattern across seven inert-system fixes now: each is a real defect repaired, and none of
them move a 1–5 axis score, because what separates this frame from the references is scene content
and composition rather than pipeline correctness.

### Round 13 — the first fully valid round

Every scene captured through a scenario that does what its name says, every score a median of 3.
Earlier rounds are superseded: they scored parked ships.

| Scene | mean | p95 | p99 | max |
|---|---|---|---|---|
| boost-travel (`cruise-boost`) | **2.25** | 16.8 ms | 12.4 ms | 33.3 ms |
| deep-flight (`cruise`) | 1.88 | 16.8 ms | 18.4 ms | 33.4 ms |
| asteroid-field | 1.88 | 16.9 ms | 11.4 ms | 33.4 ms |
| ui-overlay | 1.75 | 16.8 ms | 13.1 ms | 16.9 ms |
| **overall** | **1.94** | | | |

**`boost-travel` scores highest**, and it is the scene with the most motion, the largest plume and a
towed payload in frame. That is direct evidence that the motion fix matters to the score, not just to
the screenshot.

Worklist, ranked by visible-gain-per-frame-cost — every top item is `free`:

1. `deep-flight/composition` (1/5) — sector-aware camera composition preset
2. `asteroid-field/composition` (1/5) — camera FOV/distance/target-offset tuning
3. `ui-overlay/material` (1/5) — procedural UI material treatment
4. `deep-flight/grade_post` (2/5) — LUT / filmic tonemap tuning
5. `deep-flight/ui_integration` (2/5) — HUD design-token pass

Composition dominates, and the reviewer has asked for a camera reframe in every round. The shipped
`chaseClose` setting was measured and gave no gain, so the ask is a *composition offset* (ship off
axis, planet crossing the flight path), not merely a closer camera — a camera-behaviour change that
needs an owner decision.

### Earlier measured position (median of 3, deep-flight, PARKED — superseded by round 13)

| Axis | baseline | samples | median | delta |
|---|---|---|---|---|
| background | 1 | [1,1,2] | 1 | = |
| composition | 1 | [1,2,2] | **2** | **+1** |
| geometry | 3 | [3,2,3] | 3 | = |
| grade_post | 2 | [2,2,2] | 2 | = |
| lighting | 2 | [2,2,2] | 2 | = |
| material | 2 | [2,2,2] | 2 | = |
| ui_integration | 3 | [2,3,3] | 3 | = |
| vfx | 2 | [2,2,2] | 2 | = |

Mean 2.00 → **2.13**. Confirmed movement is composition +1; background is trending (`[1,1,2]`) but
has not held a band.

> **A correction worth keeping.** Earlier rounds reported `ui_integration` regressing 3→2 and called
> it a real signal because two consecutive samples agreed. The median of three is **3 — unchanged**.
> Two agreeing samples were not enough, and that false signal was nearly used to justify overriding
> the HUD's documented "holographic-bleak" doctrine. Do not act on an axis delta measured once or
> twice.

| 5 | apply authored `profile.lighting` (ambient 0.85→0.15, key 1.7→3.2) | p95 16.80 ms | 1.88/5 | Hull now has real light/dark separation. `ui_integration` −1 again |
| 6 | apply authored `profile.post`; canonicalise `ast_rock` → `ast_common_rock` | p95 16.80 ms | — | Asteroids gain their authored PBR surface set; bloom restrained per sector |
| 7 | wire `parallaxLayers.js` (far/mid/near dust bands) — **fifth** zero-consumer module | p95 16.80 ms | 2.00/5 | Starfield gains real depth layering |
| 8 | author an ecliptic dust ribbon for `helios_orbital_void` | p95 16.80 ms | **2.12/5** | **background 1→2, composition 1→2** — first movement on the two stuck axes |

### The parked "procedural nebula" debt, resolved

Five of six deep-field recipes shipped `ribbons: []` with comments saying the procedural macro was
rejected as a "fullscreen veil" and was awaiting "an authored volumetric/deep-sky source". Two
findings settle it:

1. **Raising `nebulaOpacity`/`l1Alpha`/`l2Alpha` alone does nothing** — with `maxCoverage: 0.04` and
   `ribbons: []` the bake produces no content. An earlier conclusion of mine that "re-enabling the
   nebula costs geometry for zero pixels" was measured on exactly that confound and was wrong about
   *why*.
2. **The ribbon macro pipeline works and looks good.** Pointing Helios at `galactic_spur` (the one
   recipe carrying authored ribbon geometry) produced a shaped, directional dust band with real
   silhouette and negative space — not a veil — at zero frame cost.

So the debt was never a broken system; it was **missing authored content in a working one**. Adding a
ribbon array to a recipe is the unit of work.

**`nebulaOpacity` and the ribbon macro are separate systems.** `test/sector-visual-profiles.test.mjs`
pins Helios' `nebulaOpacity` to 0 ("clear civilized space should not be covered by a full-screen
nebula") — that rule stands and is respected. The ribbon is discrete macro geometry and renders with
`nebulaOpacity: 0`. Depth without a wash.

### OPEN DEFECT — the travel wedge

Once the capture scenarios were fixed to actually fly the ship, a `cruise-boost` frame at ~2.4k WU
showed a **hard-edged dark wedge across the upper frame, occluding stars** — a straight polygon
boundary, not a soft gradient.

This is **pre-existing and unfixed**. It was first blamed on the newly authored Helios/core ribbons,
which were reverted on that suspicion — and the wedge **reproduced with `ribbons: []`**, so the
attribution was wrong and the ribbons were restored. On the evidence it is the **L0–L2 deep-field
composite plane's edge** becoming visible during travel; the composite is a single finite quad
(`quadSize` ≈ 10,837 WU, `frustumCulled = false`, biased `+0.14 * quadSize` toward where the camera
looks) and the wrap/stream logic appears not to keep it covering the view at travel speed.

It has never been seen before **because no capture in this harness ever moved the ship**. Repro:

```bash
node scripts/capture-gameplay.mjs 8123 --scenario cruise-boost --width 1920 --height 1080 --warmup 40000 --duration 6000
```

Two procedural lessons, both paid for:

> **Validate sky geometry at TRAVEL camera angles, not from a parked capture.** Every stationary
> frame in this program looked fine.
>
> **Confirm an attribution by removing the suspect and re-testing before acting on it.** The revert
> above was performed on correlation alone and was wrong.

### Which recipes may receive ribbons — read this before authoring one

`test/deep-field-structure-recipes.test.mjs` encodes the governance, and it is not advisory:

- **`belt_broken_dust_lane`, `fringe_tidal_filament`, `anomaly_electromagnetic_scar` are PINNED to
  `ribbons: []`** by a test literally named *"rejected procedural carriers stay unrouted"*. Their
  carriers were reviewed and rejected. `galactic_spur` is recorded there as *"the one accepted
  authored composition"*. Adding a ribbon to those three is a **design decision for the owner**, not
  a rendering fix — this session tried it and reverted on discovering the pin.
- `helios_orbital_void` and `core_trade_constellation` are **not** pinned; both now carry authored
  ribbons.
- Every ribbon must satisfy the locality contract: **≥8 control points** ("silhouette needs authored
  control points"), `points.length === widths.length`, each width in 0.003–0.5, x-span ≤ 2.8 and
  z-span ≤ 1.2 (so a macro cannot become a fullscreen sheet).

### Camera: measured, then declined

Independent review's top action for two consecutive rounds was to reframe the chase camera closer
and lower. The game already ships a supported `chaseClose` video setting, so it was measured rather
than guessed: it produces exactly the requested framing at p95 16.80 ms — and scored **2.12, i.e.
identical** to leaving it off. It changes situational awareness for no measured graphics benefit, so
the default was left alone. Recorded here so the next session does not re-litigate it.

### Final state, all scenes, real hardware (Intel iGPU, 1920x1080, admission settled)

| Scene | p95 | max | ship state |
|---|---|---|---|
| deep-flight (`idle`) | 16.80 ms | 16.90 ms | **parked** |
| asteroid-field | 16.80 ms | 16.90 ms | parked |
| boost-travel (`boost`) | 16.80 ms | 17.30 ms | **parked — see below** |
| ui-overlay | 16.80 ms | 18.00 ms | parked |
| **deep-flight (`cruise`, SPD 205)** | **16.80 / 33.10 ms** | **33.30 ms** | **flying** |

Every quality change in this program was free **against the parked baseline**. That qualifier is
load-bearing, and it is the most important correction in this document.

### The scenarios were not flying the ship

`state.input` is rebuilt from held keys by `src/systems/input.js` every frame, so a scenario that
assigns `state.input.moveZ` from a timer has its value overwritten before the sim reads it. The
pre-existing `boost` and `combat-vfx` scenarios do exactly that. **They never move the ship.**

Consequences, all of which invalidated evidence:

- Every `deep-flight` and `boost-travel` frame this program reviewed showed a ship at **SPD 0**.
- The engine plume never fired, so the `vfx` axis was scored on a frame with no VFX by construction.
- Velocity-driven speed motes and motion streaks never engaged.
- **Perf was measured on a nearly static scene.**

`cruise` / `cruise-boost` hold a real `KeyW` keydown and do fly (verified SPD 205). `boost` and
`combat-vfx` are deliberately left untouched because other perf baselines are calibrated against
them — use the `cruise*` scenarios for any motion or perf evidence that is going to be acted on.

### Flight is where the frame budget actually goes

In motion the scene can reach **1,178,312 triangles** versus ~238k parked, while draw calls stay
~170 (instancing is doing its job).

**Stated precisely, because an earlier draft of this section overstated it:** of four cruise runs,
**three measured p95 16.80 ms** and one measured **p95 33.10 ms**. Flight is usually 60 fps and can
drop to half rate in dense regions — it is not permanently on the boundary.

> **Moving scenarios cannot be A/B'd.** Two cruise runs differing only in the shadows flag produced
> 62 vs 170 draw calls and 33,708 vs 1,178,304 triangles, because the ship streams into different
> regions depending on where it happens to be. Scene contents dominate any change under test. For an
> A/B, use a stationary scenario; use `cruise` for *representative* evidence, not comparative.

### The in-flight half-rate frames need ~2 ms, not a rewrite

Round 13 (all scenarios corrected to actually move) measured, on real hardware at 1920x1080 with
admission fully settled (`admission.max = 0.0` in every scene):

| Scene | p95 | max | triangles | calls | ship speed |
|---|---|---|---|---|---|
| deep-flight (`cruise`) | 16.80 ms | 33.40 ms | 1,177,430 | 168 | flying |
| boost-travel (`cruise-boost`) | 16.80 ms | 33.30 ms | 1,131,716 | 132 | **76.6** |
| asteroid-field | 16.90 ms | 33.40 ms | 180,786 | 160 | 0 (by design) |
| ui-overlay | 16.80 ms | 16.90 ms | 116,624 | 199 | 0 |

Phase attribution for in-flight deep-flight, p95 / max:

| phase | p95 | max |
|---|---|---|
| presentation | **11.7 ms** | 16.4 ms |
| render | 9.5 ms | 11.9 ms |
| sim | 5.6 ms | 6.1 ms |
| ui | 2.7 ms | 3.4 ms |
| vfx | 1.0 ms | 1.7 ms |
| admission | 0.0 ms | 0.0 ms |

`frameCallback`: p50 **9.9**, p95 **15.6**, p99 **18.4**, max **19.2 ms**.

The diagnosis is exact. JS work never exceeds 19.2 ms, but whole frames reach 33.4 ms — because
once callback work crosses the 16.7 ms budget (p99 is 18.4 ms) **vsync snaps that frame to the next
interval**. The half-rate frames therefore need roughly **2 ms of headroom**, not an architectural
rewrite, and `presentation` is the largest single phase. That is the external audit's §3
(`PresentationWorld` cutover) with a concrete target attached.

### Which frame to SCORE — cruise is not comparable across rounds

The `cruise` scenario flies the ship, so where it ends up decides what is in frame — and composition
dominates the score. Two consecutive rounds on the same build class showed `background` 2 then 1
(all three samples agreeing each time) purely because one run caught the ringed planet large and
well-placed and the next did not.

This is the scoring counterpart of the perf rule already recorded above, and it was missed once:

> **Score the reproducible STATIONARY frame for cross-round comparison. Use `cruise` for motion-axis
> evidence (plume, speed cues, in-flight cost) — never to compare a score against a previous round.**

The stationary frame is also what the original baseline was captured on, so it is the only apples-to-
apples comparison available. A round that changes background/composition/lighting/material/grade
should be scored stationary; only `vfx` genuinely needs motion.

### The light rig had no relationship to anything visible

The three directional lights were constructed at fixed arbitrary world positions — key `(60,140,40)`,
rim `(-70,50,-60)`, fill `(20,30,120)` — unrelated to the one bright object on screen. The ship's lit
side and the visible planet disagreed, so the frame had no readable light source. That is verbatim
review's `lighting` note: *"no convincing environmental key source, weak rim separation"*.

All three now derive from the sector's authored `signatureHero.screenNdc`. The chase camera is
fixed-tilt and never yaws, so screen direction maps to a stable world direction (screen +x → world
+x, screen +y → world −z), making the conversion exact and **data-driven**: a sector that moves its
landmark moves its key light with it. Key lands on the landmark's side, rim opposite and lower, fill
broadly frontal. Intensities are untouched — those stay owned by `profile.lighting`.

> **Trap worth knowing:** writing `key.position` alone is silently reverted. `_updateShadowFollow`
> re-places the key light **every frame** so the shadow ortho box tracks the player, and it did so
> with a literal `(60,140,40)`. The first attempt moved rim and fill correctly while key stayed put.
> The offset is now stored on `this._keyLightOffset` and consumed by shadow-follow, so both
> behaviours hold.

Measured p95 16.80 ms. Verified at runtime: key `[93, 96, −51]` (= `0.58×160, 96, −0.32×160`), rim
`[−84, 43, 46]`, fill `[17, 29, 120]`.

### Negative result — trail particles are zero ON PURPOSE

`perf.counters.vfxTrails` reports `trailParticlesSpawned: 0` in **every** capture, including three
independent in-motion runs at speed 48–77, with 16–17 trail candidates and several active emitters.
That looks exactly like another inert system. It is not.

`src/render/vfx.js:4908`:

```js
if (this._usesProductionThruster(e)) return { particles: 0, streaks: 0 };
```

The Kestrel uses the production `ContinuousPlumeSystem`, so the legacy particle-trail path
deliberately yields to it and returns zero. The counter is correct.

**Consequence:** `vfx` at 2/5 is about the production plume's *look* — review asks for layered engine
cones, a soft particle tail and velocity streaks versus today's single cone — which is VFX authoring,
not wiring. Recorded so the next session does not spend a round re-deriving this.

### The far field could only ever hold one planet

`spaceBackground.js` capped hero bodies with an inline `planetsSpawned < 1`, while `heroPlacement`
routinely holds ~11–17 candidates. So no matter what a sector generated, the backdrop contained
exactly **one** celestial body. Review's background fix asked for "two distant occluding bodies
behind the ship path" — the content was already being generated and a constant was hiding it.

Now `MAX_VISIBLE_PLANETS = 2`. The signature anchor is first in the placement list, so it still wins
the first slot and authored composition is preserved; the second slot goes to the nearest procedural
hero. Measured on the reproducible stationary scene: **p95 16.80 ms, max 17.10 ms**, background draw
calls 6 → 7, baked texture unchanged at 32.2 MB.

**Honest caveat:** `stats.planets` confirms 2, but the second body is placed procedurally within the
window and is **not in the canonical scored frame** — so this does not move that frame's score. It
gives the sector a real second landmark that appears from other headings. Same category as the other
gains (existing content unblocked), but its benefit is distributed across the sector rather than
concentrated in one screenshot.

### Star density — the cheapest background lever

Review's second action was "denser star bands". The entire star field is a **single Points draw
call**, so density is close to free. `starDensity` is clamped 0.2–2.5 by the resolver, and
`scripts/check-helios-sky-kit.mjs` enforces only a **floor** of 0.95 — raising it is inside both.

Helios `starDensity` 1.12 → 1.85 and `flareDensity` 1.3 → 1.65, i.e. **11,200 → 18,500 stars** and
72 → 92 flares. Measured on the repeatable stationary scene: **p95 16.80 ms, max 16.80 ms** —
identical, and background draw calls went 5 → 6.

> **Pre-existing red, not from this session:** `check:helios-sky-kit` fails cycle 10 ("core fog
> density bounded") because `SECTOR_PALETTE_CLASSES.core.fogDensity === 0` while the check wants
> `> 0`. That value lives in `src/data/sectors.js`, which this session never modified (empty diff vs
> HEAD). Verify before attributing it to graphics work.

### Composition: what could be done inside the rules, and what could not

Independent review's top action in **every** round was composition — specifically "the planet or ring
arc crosses behind the flight path instead of sitting isolated at the right edge". That ask splits
into two parts with very different standing:

- **Position — refused.** `test/sector-visual-profiles.test.mjs` pins
  `helios.signatureHero.screenNdc[0] >= 0.5` so "the Helios landmark stays in the right-side
  background rather than covering the player ship". Moving the planet toward centre is a tested
  decision. Left alone.
- **Size — done.** `frac` is unpinned and the resolver clamps it at 0.34. Raised 0.26 → 0.32.

Raising size alone substantially delivers the ask: at 0.32 the ring arc genuinely sweeps behind and
past the ship, giving the diagonal the reviewer wanted, **without moving the planet centre at all**.
Measured free on the repeatable stationary scene: p95 16.80 ms, max 16.90 ms — identical to 0.26.

**This is the change that finally moved the score.** Median of 3 on the in-flight frame, versus the
same scene before it:

| axis | before | samples | after |
|---|---:|---|---:|
| background | 1 | `[1,2,2]` | **2** |
| ui_integration | 2 | `[3,3,3]` | **3** |
| others | — | unchanged | — |

Mean **1.88 → 2.13**, like-for-like (both in-flight). `background` came off 1 for the first time in
sixteen rounds — and what did it was not new art, but making the **existing authored landmark bigger
inside its own unpinned clamp**. Worth remembering before commissioning assets: check whether the
authored content you already have is being presented at the size it was designed for.

> The historical "planet covered most of the live frame" defect was a second signature **multiplier**
> applied on top of `frac`, not this authored value. 0.32 is inside the authored clamp.

A cruise run right after this measured p95 33.30, which looked alarming until the stationary
comparison came back clean — more evidence that **moving scenarios cannot be used for A/B**.

### The parallax bands were tuned for the wrong camera

Once `parallaxLayers.js` was wired, its on-screen density turned out to be near zero. Tile sizes are
the wrap cell in parallax space, so visible count is `count * (view / tile)²`, and the chase camera
sees roughly 120 world units:

| band | original | expected on screen | retuned | expected on screen |
|---|---|---:|---|---:|
| MID | count 120, tile 1700 | **0.60** | count 340, tile 900 | 6.0 |
| NEAR | count 200, tile 900 | 3.56 | count 300, tile 620 | 11.2 |

The mid band — the entire "middle ground" the reviewer kept asking for — was contributing about
**half an object per frame**. This is the third instance of the same class of error in this codebase
(`dense` scenario, deep-field nebula scale, parallax tiles): **content authored at maximum-zoom-out
scale, invisible at the gameplay camera.** Worth checking first whenever a layer "exists but cannot
be seen".

Retuned at p95 16.90 vs 16.80 ms (within noise). Honest caveat: the visible effect is **subtle**,
because both bands use deliberately faint additive materials — fixing the count does not by itself
make the mid-ground read. Raising their opacity is a look decision, not a bug fix.

### Where the in-flight frame actually goes (full attribution)

`perfRuntime` ships with **both** attribution channels off — `systemTimingEnabled: false` and
`renderWorkEnabled: false` — so `perf.systems` and `perf.renderWork` are empty in every ordinary
capture. Enable them from a capture with:

```bash
--eval '(()=>{const p=window.SF.state.perfRuntime;p.setSystemTimingEnabled(true);p.setRenderWorkEnabled(true);return "on";})()'
```

In-flight (`cruise`, 1920x1080, admission settled), p95 ms:

| render work | p95 | avg | max | | sim system | p95 |
|---|---:|---:|---:|---|---|---:|
| drawPreparedFrame | 4.70 | 3.15 | 6.30 | | tacticalAI | 1.10 |
| ‣ bloomScene | 4.60 | 3.05 | 6.20 | | physics | 0.70 |
| ‣ bloomDownsample | 0.20 | 0.06 | 0.30 | | flight | 0.40 |
| ‣ bloomComposite | 0.10 | 0.03 | 0.10 | | tetherGameplay | 0.30 |
| pipelineAdmissionSync | 1.20 | **2.70** | 4.20 | | actions | 0.30 |
| prepareFrame | 1.20 | 0.78 | 2.30 | | core.lifetimeSweep | 0.30 |
| entityViewSync | 0.60 | 0.41 | 1.00 | | input | 0.20 |

**The bloom rows are NESTED inside `drawPreparedFrame`, not additive** — `drawPreparedFrame` wraps
`bloom.render()`, and bloom renders the scene once into `rtScene` and composites. Total render is
~4.7 ms and bloom's own overhead is only ~0.3 ms. An earlier guess that the scene might be rendered
twice was wrong; the pipeline is already efficient.

**Conclusion: there is no safe ~2 ms of waste to reclaim.** Every cost above is legitimate work.
`pipelineAdmissionSync` is the one anomaly — an average (2.70) above its own p95 (1.20) means rare
large spikes, and it is shader/pipeline compilation for objects streaming into view. That is the
external audit's §2 (deadline-aware admission governor), not a local optimisation.

So closing the in-flight half-rate frames requires one of the audit's structural projects
(presentation cutover, admission governor, offline packages) or the LOD work below — not a tweak.

### CORRECTION — LOD *is* engaging; `lodObjects: 0` is the expected signature

An earlier revision of this document claimed "no geometric LOD is engaging" because a flight-scene
traverse found **`lodObjects: 0`** — not one `THREE.LOD` anywhere — and called it "the clearest
remaining perf lever". **That was wrong**, and acting on it would have been expensive.

This codebase does not use `THREE.LOD`. `src/render/lod.js` resolves `lod0|lod1|lod2` from projected
pixel size **with hysteresis**, and `root.userData.updateLod(level)` switches by toggling visibility
on sibling meshes tagged `spaceface.lod`. Zero `THREE.LOD` instances is therefore the *expected*
signature of a working system, not evidence of a missing one.

Runtime proof, in flight: **28 LOD-capable roots, holding `lod0` ×20 and `lod1` ×7** — seven
boundaries actively demoted by distance at that moment.

Blender confirms the asset side is complete too. `assets/ships/parts/places/place_asteroid_rock_a.glb`
imports as one root with a full authored chain:

| mesh | tris | tag |
|---|---:|---|
| `LOD0_Merged_Material_Rock` / `_Warm` | 1226 / 12 | `spaceface.lod: lod0` |
| `LOD1_Merged_Material_Rock` / `_Warm` | 514 / 4 | `spaceface.lod: lod1` |
| `LOD2_Merged_Material_Rock` / `_Warm` | 220 / 1 | `spaceface.lod: lod2` |

plus `COLLISION_HULL` (`sf_non_render: True`) and `SOCKET_Structure_Core`. 1977 triangles total,
matching the manifest row exactly.

> **Method note:** probing for a *framework primitive* (`THREE.LOD`) instead of the *behaviour*
> (levels actually changing) produced a confident false negative. Probe behaviour.

### The recurring defect class: authored data with no consumer

Four separate instances found this session, all with the same shape — a complete authored system
present, and production never reaching it:

| # | Authored data | Why it never applied |
|---|---|---|
| 1 | sector visual profile (signature hero, deep-field recipe, nebula opacity, intensity) | `onSectorEnter`'s profile arg omitted at both live call sites |
| 2 | `profile.lighting` (per-sector key/fill/rim/ambient) | zero consumers; renderer used a hardcoded global — ambient **5.7× too bright**, key ~2× too weak |
| 3 | `profile.post` (exposure, bloom scale/bias) | zero consumers; defined in five profiles, read by none |
| 4 | rock PBR surface library (base colour + normal + ORM) | `main.js` seeds `typeId: 'ast_rock'`, which is **not a key in `AST_TYPE`**; the material gated on the literal string `'ast_common_rock'`, so those rocks fell back to plain white `0xffffff` and also missed the instanced pool |
| 5 | `parallaxLayers.js` — far/mid/near dust bands with velocity-stretched speed motes | complete module, **zero consumers anywhere in `src/`**. Literally the "back, middle and front" and "speed motes" the reviewer asked for, already written and never called |
| 6 | `spaceReflectionEnvironment.js` — the IBL rig for authored PBR surfaces | **zero consumers**. `_bakeEnv` ran `pmrem.fromScene()` on the deliberately near-black *live* scene, so the environment had no reflected structure and every PBR surface resolved to the same flat plastic response. The module's own header diagnoses exactly this. Someone found the bug, wrote the fix, and never imported it |
| 7 | the composite's cinematic colour grade + vignette (teal-weighted shadows, amber-weighted highlights, saturation lift) | `bloom.js` ships `DEFAULT_POST_PRESENTATION = { grain: 0, vignette: 0, grade: 0 }`, and the **only** pipeline that ever passed non-zero values was `post/spaceRenderGraph.js` (grade 0.62 / vignette 0.18) — which is off by default (`renderGraph: false`). So review kept asking for "controlled black levels and a cinematic contrast curve" against a frame whose grade was multiplied away. The renderer now passes grade 0.45 / vignette 0.12, below the alternate pipeline's authored values. The grade is **multiplicative**, which is exactly what fixed the earlier full-screen cyan veil — true black stays black. Grain left at 0 |

**How to find the next one.** The repo's reachability ratchet (`scripts/check-src-reachability.mjs`)
only covers `src/systems/` and `src/ui/` — **`src/render/` is not tracked**, which is how a complete
module stays uncalled indefinitely. A render-scoped reachability scan found 7 unreachable modules;
of those, `spaceReflectionEnvironment.js` was a live quality defect, `renderPackageLoader.js` is the
known offline-package project, `graphicsLab.js` and `thruster/textures/*` are tooling, and
`starfield.js` is superseded by the deep-field background. Extending the ratchet to `src/render/`
would make this class of defect fail the build instead of shipping.

When a frame looks unfinished in this codebase, **check whether the authored data is reaching the
renderer before concluding the art is missing.** Three of these four cost nothing to fix and none
cost a single frame.

Round 4 was a deliberate no-change run to prove the gate. It failed on
`max 17.00 -> 250.00ms` while p95 moved only 16.80 → 16.90. Attribution: `admission.max` was **0**,
so the contamination guard correctly did not void the run — the stall came from **`render`
(max 336.7 ms)**. That is a *second, distinct* stall class from the admission hitch, and it is not
what the external audit or the admission attribution were looking at. It surfaced only because the
gate watches the tail.

Reviewer variance was also confirmed here: re-reviewing the *same* round-3 frame returned
composition 1/5 where the earlier sample returned 2/5.

Round 3's finding is the important one and is a class of defect worth naming: **the authored art
direction was never applied by the game.** `onSectorEnter(sector, visualProfile = null)` takes the
profile as an optional second argument, and both live call sites in `renderer.js` omitted it, so
signature celestial anchors, deep-field recipes, nebula opacity and background intensity all fell
back to engine defaults. `resolveSectorVisualProfile` had exactly one consumer in the repository —
`scripts/capture-space-background-acceptance.mjs`, the acceptance capture harness, which *does* pass
it. The acceptance evidence was therefore green while the played game showed a default sky.

The general lesson for this loop: **capture through the route the player runs, never through a
harness that constructs its own state.** A check that builds the correct inputs itself cannot detect
that production never builds them.

## 10. Reference licensing

Reference frames are third-party press/store screenshots used for critique only. Image bytes live in
the gitignored `.devshots/gfx/refs/` tree and are **never committed**. The committed artefact is
`MODERN_PARITY_REFERENCES.json`: game, year, engine, source URLs, and the specific rendering lesson
drawn from each frame.

## 11. The background finding: two dead layers and a contaminated benchmark

Rounds 5–23 moved `background` and `composition` almost not at all. Both sat at **1/5**, the two
lowest axes on the card, while effort went into `material` (2/5). Two separate defects were behind
that, one in the game and one in this loop's own measurement.

### 11.1 `nebulaOpacity: 0` makes the L1/L2 layers mathematically dead, game-wide

The deep-field composite is:

```glsl
float nebulaAlpha = clamp(l1.a * uNebulaOpacity * 1.35, 0.0, 1.0);
float wispsAlpha  = clamp(l2.a * uNebulaOpacity * 0.55, 0.0, 1.0);
color = mix(color, l1.rgb * uTintA * 1.15, nebulaAlpha);
color += l2.rgb * uTintB * wispsAlpha;
```

`uNebulaOpacity == 0` drives both alphas to exactly zero, so the composite reduces to `color =
l0.rgb`. **All five sector profiles set `nebulaOpacity: 0.0`.** Consequences:

* The L1 nebula layer and L2 wisp layer contribute **nothing anywhere in the game** — not dim, zero.
* Every per-sector `l1Alpha`/`l2Alpha` value is **inert**: `core` 0.28, `belt` 0.48, `anomaly` 0.55
  are all multiplied by zero. This was verified by swapping the benchmark sector to belt's full
  `dust_lanes` structure (coverage 0.16, `l1Alpha` 0.48, `dustAmt` 0.78): dead-black moved 73.4% →
  72.4%, i.e. nothing.
* Both layers are still **baked and sampled every frame** — `stats()` reports 32.2 MB of baked
  texture and 14.6 ms of bake — for a provably zero contribution. This is a performance finding as
  well as a visual one.

Raising `nebulaOpacity` does **not** fix it, and this was measured rather than assumed. Two variants
(0.25 and 0.42, with matching `l1Alpha`/`l2Alpha`/coverage) both made the frame **darker**: dead-black
73.4% → 76.8% / 76.6%, mean luma 0.066 → 0.053, at unchanged p95 16.80 ms. The reason is in the
shader: `mix()` *replaces* L0 with L1, and L1 is authored as **dark dust**, which occludes rather than
emits. The layer cannot brighten a frame no matter what the dial says.

`structureKind: 'void'` compounds it for the benchmark sector specifically —
`estimatePhenomenonCoverage` hard-caps `'void'` at 0.05 regardless of `maxCoverage`, and the L1 bake
shader additionally suppresses alpha outside the locus whenever `uMaxCoverage < 0.12`. `helios_core`
sets `maxCoverage: 0.04`. So the sector the tutorial spawns in — and therefore every `deep-flight`
capture — is authored as maximally empty.

This is the eighth inert authored system found in this lane, and the largest.

### 11.2 40% of the `deep-flight` reference set was in-atmosphere

`scripts/gfx-pull-references.mjs` fetched whatever the research agent returned and verified only that
each scene type had *some* usable image. Relevance was never checked. Two of the five `deep-flight`
references were **planetary atmosphere scenes** — an orange sunset fleet shot and a pink-sky low pass
over terrain, both with sky gradients, clouds, horizons and ground.

A frame set in vacuum cannot win a *background* comparison against a reference that has a sky and a
ground. Part of the standing `background: 1/5` was therefore measuring the reference set.

`scripts/gfx-validate-references.mjs` now closes that hole: every reference is classified against a
written per-scene brief before it can score anything, off-brief images are **quarantined rather than
deleted** so the call stays reviewable, and a scene with fewer than three surviving references warns
that it is too thin to support a verdict. The classifier independently reproduced the by-eye call
exactly (df-02, df-03 in-atmosphere; df-01, df-04, df-05 open-space).

**The cleanup does not close the gap, and should not be reported as if it does.** Against valid
deep-space references only:

| frame | dead black % | mid-band fill % | mean luma | median luma |
|---|---:|---:|---:|---:|
| ours | **73.4** | 21.1 | **0.066** | **0.004** |
| df-01 (open space) | 12.7 | 62.1 | 0.299 | 0.218 |
| df-04 (open space) | 0.7 | 72.9 | 0.304 | 0.251 |
| df-05 (open space) | 2.5 | 92.3 | 0.227 | 0.207 |

Our frame is genuinely far emptier than valid references too. Note also that the references never
reach true zero — their darkest regions sit *above* the near-black cutoff, whereas our median pixel is
0.004. Modern space games use a **lifted black**, not an absolute one. There is currently no dial for
this: `voidFloor` sounds like it but is a **star-density** floor (`spaceBackground.js:1624`), not a
luminance floor.

Where the references get their fill is worth stating precisely, because it decides the next move:
df-04 from a large nebula, df-05 from dense wreckage/debris and energy phenomena, df-01 from planets,
rings and multiple ships. It is **mid-field content and large-scale phenomena**, not a uniform gas
wash — which is consistent with the authored doctrine's objection to a full-screen veil.

### 11.3 The open art-direction question

The doctrine is explicit and test-pinned (`test/sector-visual-profiles.test.mjs`): "clear civilized
space must not be covered by a full-screen nebula wash", `ambient` authored at 0.15 "precisely to keep
space truly black". That is coherent and was reaffirmed against earlier review rounds.

It is also the direct cause of `background: 1/5`. The two cannot both hold, and choosing between them
is an art-direction call for the project owner, not something this lane should decide silently. What
this lane can say is that the cheapest reconciliation is **not** the nebula dial (measured, disconfirmed
above) — it is mid-field content density plus a lifted black floor, both of which leave the "no
full-screen wash" doctrine intact.

## 12. Measurement corrections made this round

Two of this lane's own tools were wrong and their outputs had to be withdrawn.

**Name-matching for ORM maps failed in both directions.** It counted normal maps as ORMs ("n-ORM-al"
contains "orm"), and it *missed* roughness maps named for their role rather than their packing.
`engine_ion_small`'s real ORM is `engine_ion_small_wear_mask_1k`, whose measured roughness stdev is
**0.2011** — the audit reported that asset as stdev 0, i.e. flat, when it is the opposite of flat.
Both `gfx_asset_audit.py` and `gfx_orm_breakup.py` now resolve the roughness map from the **Principled
BSDF material graph**, with the name test kept only as a fallback.

Consequently the earlier headline — "20 shipped assets measure roughness stdev exactly 0" — is
**withdrawn pending the re-audit**, because it was produced by the name-based detector.

**A no-op was reported as success.** The first batch reported 20/20 candidates "ok" while four assets
had silently matched no map at all. `report['ok']` now requires at least one written map, and the
batch driver surfaces `wroteNoMaps`.

**A stale baseline nearly produced a false positive.** An early A/B compared a new capture against a
round-23 frame captured under different code, showing an apparent 80.3% → 73.0% improvement. Against
a correctly re-captured baseline the same change measured 73.4% → 73.0% — noise. Always re-capture
the baseline in the same session as the variant.

## 13. Midground density: visible, but not enough on its own

Independent review's single highest-value action was a midground band. The parallax module supplies
one, and the on-screen count is `count * (view/tile)^2` against a chase camera that sees ~120 world
units:

| state | MID count / tile | expected on screen |
|---|---|---:|
| as found (zero consumers) | 120 / 1700 | 0.60 |
| first retune | 340 / 900 | ~6 |
| now | 1400 / 560 | ~64 |

At ~64 the band is **visibly present** for the first time — debris reads across the lower and right
frame where previously nothing was there. Measured at 1920x1080, p95 unchanged at 16.80 ms:

| frame | dead black % | mid-band fill % | mean luma |
|---|---:|---:|---:|
| before | 84.7 | 10.5 | 0.051 |
| after | 83.7 | 11.5 | 0.054 |

**One point of dead-black** — but see 13.2: `dead%` is the wrong metric and understates this change.
On the lift-immune structure metric the same change is +1.3 points (20.3% -> 21.6%).

### 13.1 Two measurement confounds worth not repeating

**Resolution.** Session captures default to 1262x648 while archived round frames are 1920x1080. The
HUD occupies a much larger *fraction* of the smaller frame, so dead-black is not comparable across
the two. The round-23 frame (1920x1080, 80.3%) and the session baseline (1262x648, 73.4%) were never
measuring the same thing. Always pass `--width/--height` explicitly when a number will be quoted.

**HUD pollution.** Even at matched resolution the aggregate includes HUD panels, whose extent varies
with game state (tutorial text, contacts list, log entries). A 1-point difference is near that noise
floor. `--crop` trims the border only; a sky-only mask would be needed before quoting differences
this small with confidence.

### 13.2 CORRECTION — `dead%` is confounded by the black floor, and overstated the gap ~40x

An earlier revision of this section concluded that closing the gap "needs large-scale occupancy — big
wreck and structure silhouettes, large nebula forms". **That conclusion was drawn from a confounded
metric and is withdrawn.**

`dead%` cannot distinguish "the frame has no content" from "the frame's black floor is at zero". Our
median pixel is luma 0.004 (byte ~1); the reference frames bottom out around byte 12 — a filmic toe,
not content. A flat +0.02 luma lift would therefore take us from 83.7% dead to single digits **while
adding nothing at all**. `midFrac` is gameable the same way, since a lift pushes those pixels straight
into the measured band.

`gfx-frame-stats.mjs` now also reports **`structFrac`**: the fraction of non-overlapping 16x16 tiles
whose luma stdev exceeds 0.01. A constant offset does not change local stdev, so this is immune to the
lift, and it correctly credits sparse content — the parallax debris creates local variance exactly
where it sits.

| frame | dead% | **struct%** | mean luma |
|---|---:|---:|---:|
| ours, before midground | 84.7 | **20.3** | 0.051 |
| ours, after midground | 83.7 | **21.6** | 0.054 |
| df-01 (planet + rings + ships) | 12.7 | **52.9** | 0.299 |
| df-04 (nebula) | 0.7 | **75.9** | 0.304 |
| df-05 (debris field) | 2.5 | **51.0** | 0.227 |

`dead%` implied a ~100x gap. The real content gap is **~2.5x** — 21.6% against 51–76%. That is a very
different engineering problem, and it does not on its own justify pushing work into other lanes'
content budgets.

**Anchor on df-01, not the mean of the three.** It is the closest analogue to our scene — a ship with a
ringed planet in vacuum — and the least extreme at 52.9% structure. Notably its fill does **not** come
from a nebula wash: it comes from the ship occupying half the frame at close range, a large ringed
planet filling the other half, and a second planet lower right. Ours has a small centred ship and one
planet at the frame edge. A meaningful part of the remaining `background`/`composition` gap is
therefore **camera distance and celestial scale**, not added gas — and `signatureHero.frac` is already
at its 0.34 clamp while `screenNdc[0] >= 0.5` is test-pinned.

### 13.3 The black floor is a real, cheap lever — and it is the owner's call

The reviewer's own `grade_post` fix asks for "lifted near-blacks". That is a post-stack **toe**, and it
is currently impossible by design: the composite grade is **multiplicative**
(`c * mix(shadowBalance, highlightBalance, luma)`), and `renderer.js` explicitly records that as the
fix for an earlier full-screen cyan veil — "true black stays black". There is no toe/lift uniform.

Adding one means editing `src/render/bloom.js` (**outside this lane's leased paths**) and deliberately
reversing a documented decision. It would also need to be described as a **post-stack toe, not
`ambient`** — `ambient: 0.15` is test-pinned and carries the "keep space truly black" comment, and a
future reader must not confuse the two.

This is the single cheapest remaining lever on the two weakest axes, and it is an art-direction
decision, so it is left for the project owner rather than taken silently.

## 14. Perf status of the one shipped change

`parallaxLayers` MID 340 -> 1400 and NEAR 300 -> 700 means ~2,100 per-frame instance updates on a
codebase whose Phase-0 verdict was CPU-bound. Verified beyond idle:

| scenario | with change (p95) | reverted (p95) |
|---|---|---|
| idle @1920x1080 | 16.80 | 16.80 |
| combat-vfx @1920x1080, n=3 | 250.0 / 50.0 / 33.5 | 33.5 / **250.0** / 33.4 |

**The baseline reaches 250 ms too**, and in both arms the spike tracks LOW ship speed (18.1 and 14.5
at the spikes; 39–71 on the clean runs) — the signature of the pre-existing `buildComposedShip`
admission stall. So the stall is not caused by this change. Stated honestly: **at n=3, with a
stochastic 250 ms admission stall dominating the distribution, no parallax cost is detectable — but
"free at p95 16.80" is an IDLE claim and must not be quoted for combat.**

## 15. The ORM finding, corrected: placeholder binding, not universal flatness

With the material-graph detector, the engines subset (previously all reported "stdev 0") resolves to:

| engine | name-based | **graph-based** | actual ORM image |
|---|---:|---:|---|
| engine_industrial | 0 | **0.2281** | `engine_industrial_wear_mask_1k` |
| engine_ion_small | 0 | **0.2002** | `engine_ion_small_wear_mask_1k` |
| engine_ion_twin | 0 | **0.1182** | `engine_ion_twin_wear_mask_1k` |
| engine_plasma_ring | 0 | 0 | `spaceface_neutral_orm_1024` |
| engine_resonator | 0 | 0 | `spaceface_neutral_orm_1024` |
| engine_vector | 0 | 0 | `SF_rough_flat`, `SF_rough_flat_orm_role` |

Half of them were never flat — they carry authored wear masks the name heuristic could not see. The
genuinely flat ones are flat for a **specific and much more actionable reason**: they are still bound
to a shared neutral placeholder, named in the file as `spaceface_neutral_orm_1024` and `SF_rough_flat`.

So the defect is **placeholder binding on a subset**, not a project-wide flat-roughness characteristic.
The correct remedy for those assets is to bind authored maps (or generate them), which is squarely the
owning asset lanes' work — and the previous framing would have sent breakup noise into three engines
that already had authored variation, actively destroying art.

**Status:** the full 86-asset re-audit has not completed; only the engines subset is re-measured. Every
ORM number from the name-based sweep — including the "20 assets at stdev exactly 0" headline and the
19 candidates generated from it — remains **withdrawn pending that re-run**. The candidates must be
regenerated after it, and the breakup report should carry the same `source: graph|name` provenance the
audit now records, so no other lane can promote a candidate whose provenance is invisible.

## 16. Shipped: the lifted black floor (`uToe`) and the HUD integration pass

### 16.1 `uToe` — the one control that can raise a black off zero

Owner decision was "try it, then judge from the images", so the toe was built and an A/B ladder
captured rather than argued about.

Added to the bloom composite as `uToe`, **default 0**, so the previous true-black route is bit-identical
unless a caller opts in. Shaped as a **shadow-only** lift — full strength at black, faded out by luma
0.22 — so highlights and the curve above the toe are untouched and the image does not go milky. The
lift is slightly cool (`0.82, 0.92, 1.15`) because a neutral grey floor reads as a washed-out screen
while a cool one reads as space.

It is a **post-stack toe and deliberately NOT `lighting.ambient`**. `ambient: 0.15` is test-pinned and
carries the "keep space truly black" comment; it is not touched, and a future reader must not conflate
the two. `nebulaOpacity`, `l1Alpha`, `l2Alpha` are likewise untouched.

Measured at 1920x1080, p95 **16.80 ms at every setting**:

| toe | dead% | struct% | p50 luma | verdict |
|---:|---:|---:|---:|---|
| 0 (previous) | 84.6 | 21.1 | 0.004 | dead black, reads unfinished |
| **0.020 (shipped)** | **0.2** | 20.1 | **0.142** | deep space, floor lifted, stars keep contrast |
| 0.038 | 0.1 | 18.8 | 0.203 | too far — sky flattens to grey, stars wash out |

Note `struct%` barely moves across the ladder while `dead%` collapses. That is the confirmation that
§13.2 was right: `dead%` was measuring the black floor, not content.

**Wiring trap, hit and fixed:** the first ladder produced identical frames for 0.018 and 0.032 because
`setOptions` in `bloom.js` never read `o.toe` — the uniform existed, the renderer passed the value, and
the assignment silently dropped it. Exactly the class of defect this lane has found nine times over.
`toe` is now in the uniform, `resolvePostPresentation`, `setOptions`, `postStyleScale`, the renderer's
`_postOptionsSignature` (or a sector changing it would be a silent no-op) and `diagnostics()`.

This does depart from the "bloomStrength == 0 is pixel-identical to a plain render" invariant at the
top of `bloom.js` — but `SECTOR_POST_GRADE` is already 0.45 on the live route, so that departure was
made earlier and deliberately; the toe does not introduce it.

### 16.2 HUD integration pass

Reassigned to this lane by the owner. Review scored `ui_integration` 3/5 — "the HUD reads like flat
webpage panels placed over the render" — and asked to reduce panel opacity and border dominance and
align HUD brightness to the scene grade.

Applied as a **trailing override inside `injectHudCss`**, not by editing the shared tokens in
`styles/ui.css`, because those tokens are global and the station screens depend on them. Every rule is
scoped to a HUD class. Panel fills drop from ~.92 to ~.55–.58 with a 2px backdrop blur, borders go to
55% of `--panel-edge`, and passive contact/cargo text recedes to .82 opacity. Layout, sizes, positions
and the authored "holographic-bleak" character are unchanged; this only changes how hard the surfaces
sit on the render. It matters more now that the scene behind them is no longer pure black.

`check:contracts` PASS, `check:render-hotpath` OK, `test/b0-one-verb.test.mjs` green.
`scripts/check-hud-readability-live.mjs` times out at boot **both with and without this change** —
pre-existing, it needs a running server.

## 17. Two more renderer levers disconfirmed, and a self-inflicted data loss

### 17.1 Neither lighting lever moves the "flat grey ship"

Review's worst axis is `lighting` ("the hull sits in a flat dark exposure with limited rim or shadow
shaping") and `material` ("uniform grey plastic/painted block"). Two renderer-side levers were tried
and both produced **no visible change in the captured frame**:

* `rim` 1.15 -> 2.45 (the value carries no test pin). No visible edge appeared on the hull.
* `ambient` 0.15 -> 0.62, a 4x diagnostic. No visible change on the hull either.

The ambient probe did confirm one useful fact: **the space backdrop is a camera-locked shader and is
not lit by scene lights** — frame statistics were identical (dead 0.1%, p50 0.142) at 4x ambient. So
"raising ambient would brighten space" is false; the authored comment's reasoning does not hold, even
though the authored value is fine to keep.

`scene.environment` IS set from the PMREM bake (`renderer.js:1780`), so the ship does receive IBL — but
the environment is a bake of a scene that is overwhelmingly black, so there is nothing to reflect. That
is what "grey plastic" is: a metal with no environment energy.

Combined with the two earlier disconfirmations (roughness breakup, albedo value zones, both at n=5),
this closes the question: **`material` and `lighting` cannot be fixed from the renderer.** They need
authored texture content on the ship — which is the hull/Kestrel lanes' work, not this lane's.

### 17.2 `git checkout <file>` destroyed earlier uncommitted work in the same file

Reverting the nebula / rim / ambient probes with `git checkout src/data/sectorVisualProfiles.js`
reverted the **whole file to HEAD**, not just the probe — silently discarding this lane's earlier
uncommitted tuning in that same file: `rim` 1.15, `fill` 0.60, `starDensity` 1.85, `flareDensity` 1.65
and `signatureHero.frac` 0.32. None of those were in HEAD, so they were simply gone, and several
captures after that point were taken against a quietly degraded profile.

Caught by noticing the file read back `rim: 0.72` when the lane's own records said 1.15. All five
values are restored with their rationale comments, and `test/sector-visual-profiles.test.mjs` passes.

**Rule for this repo:** never use `git checkout <path>` to undo a probe in a file that already carries
uncommitted work. Use `git stash push -- <path>` / `git stash pop` (which this lane used correctly for
`parallaxLayers.js` and `uiRoot.js`), or revert the specific edit by hand.

## 18. CONTROL EXPERIMENT — the pass gate was unreachable by construction

Three consecutive reviews returned overall **2.25/5 with byte-identical per-axis scores**, across
frames that had changed visibly and measurably. Before concluding "the renderer cannot improve this",
the instrument itself was tested: **a real 2020s AAA reference frame was fed through this exact
harness as if it were our game.**

Subject: `refs/deep-flight/df-04.jpg` — EVE Online, one of the very frames the loop scores us against.

| axis | ours | reference (EVE), same harness |
|---|---:|---:|
| lighting | 2 | 4 |
| material | 2 | 4 |
| geometry | 3 | 4 |
| grade_post | 2 | 4 |
| background | 2 | 4 |
| vfx | 2 | 4 |
| composition | 2 | 4 |
| ui_integration | **3** | **1** |
| **overall** | **2.25** | **3.63** |
| verdict | FAIL | **FAIL** |
| readsAsIntentional | false | **true** |

Two conclusions, both important:

**1. The gate was impossible.** The rubric said *"PASS only if EVERY axis scores >= 4"*. A genuine
modern-game frame fails it, because a cinematic screenshot has no HUD and therefore scores 1 on
`ui_integration`. Every "still FAIL" reported by this loop was in part an artifact of its own rubric,
and "match modern games" defined as `verdict: PASS` was never achievable. **This is a defect in this
lane's tooling, not a property of the game.**

**2. The harness is otherwise valid and should be kept.** It separates a real AAA frame (4s) from ours
(2s) cleanly and consistently, and it independently flagged the reference as `readsAsIntentional: true`
where ours reads `false`. The per-axis signal is trustworthy; only the verdict aggregation was wrong.

`gfx-review-frame.mjs` now computes the verdict against **measured reference performance**:
`ui_integration` is excluded (it punishes HUD-less references and flatters us — we beat the reference
3 to 1 on it, which is meaningless), and every remaining axis must reach 4, the level the reference
actually achieved. The model no longer sets the verdict itself.

**The honest scoreboard:** ours **2.25**, reference **3.63**, on the same instrument. The gap is
**1.38 points**, concentrated in `material`, `lighting`, `vfx` and `composition` — not "2.25 against a
perfect 5".

Also worth noting: the reference's own 4/5 `material` note asks for "a packed ORM detail overlay for
hull panels with subtle roughness and edge-wear variation", and its 4/5 `lighting` note asks for "a
low-intensity directional rim". Those are the same two fixes this lane identified for our ship — which
is corroboration that the diagnosis was right even though the renderer could not deliver either.

## 19. Motion frames do NOT score better — hypothesis raised and refuted

After the control experiment it looked likely that the canonical `deep-flight/idle` frame was
structurally unfair: on a parked ship at speed 0 the engine plume, trails and every motion cue are
absent by construction, so `vfx` and `composition` could only be depressed. The same route was
therefore captured in motion — speed 43, visible plume, towed payload, planet well placed — and scored
against the **same** references:

| axis | idle | motion |
|---|---:|---:|
| lighting | 2 | 2 |
| material | 2 | 2 |
| geometry | 3 | **2** |
| grade_post | 2 | 2 |
| background | 2 | 2 |
| vfx | 2 | **2** |
| ui_integration | 3 | 3 |
| composition | 2 | 2 |
| **overall** | **2.25** | **2.13** |

**Refuted.** The motion frame scores slightly WORSE, `vfx` stays at 2 with the plume plainly in frame,
and `geometry` drops. So idle is not unfairly penalising the game, and `vfx: 2` is a judgement about
the quality of the effects, not about their absence. `deep-flight/idle` stays as the canonical frame.

This is recorded because the opposite conclusion is intuitive, and it had already been written into
`gfx-parity-loop.mjs` as a "reporting rule learned the hard way" before the measurement came back and
contradicted it. Two benchmark-fairness suspicions were raised this session; the first (atmospheric
references) was real and worth 0.25, the second (idle vs motion) was not. Measure before recording a
lesson.

Also checked while there: the "travel wedge" does not reappear under the lifted black floor. A
luminance-step scan across the motion frame found hard edges only at the planet rings and the towed
cargo — real objects — with no step in the open left field.

## 20. Camera distance: visibly better, scores identically — and what that finally proves

The reviewer's recurring note across `geometry`, `material` and `composition` is that detail
"collapses at the actual camera distance". The chase default is `zoom: 72` (`gameState.js`), and the
engine's own `CAMERA_ZOOM_MIN` is 45, so tighter values are inside the sanctioned range.

| chase zoom | struct% (lift-immune) | p95 | review overall |
|---:|---:|---:|---:|
| 72 (authored) | 23.8 | 16.80 | **2.25** |
| 56 | 26.9 | 16.80 | — |
| 46 | **28.8** | 16.80 | **2.25** |

At 46 the ship is dramatically more legible — panel lines, canopy, the green/orange markings, real
presence against the planet — and combat stays readable because context bias widens the zoom from the
base (`camera.js`: "let context bias widen from there"). Structure coverage gains 5 points.

**And the score does not move at all.** Identical axes, 2.25.

**Reverted to 72.** A change that alters how the game PLAYS (situational awareness) with no measured
review benefit is a gameplay decision, not a graphics fix, and is not this lane's to force. It is a
one-line change in `gameState.js` if the owner wants it, and the captures are kept as evidence.

### What four identical 2.25s actually establish

Four distinct frames of ours — baseline, post-toe, restored, and the tighter camera — all score
**exactly 2.25 with identical per-axis values**, while the EVE control scores 4s through the same
harness. The grader discriminates cleanly BETWEEN games and not at all between our own variants.

The correct reading is not "the grader is broken" (the control disproves that) but: **our frames sit
solidly inside the 2 band, and every lever reachable from the renderer moves within that band rather
than across it.** Combined with the six disconfirmed renderer experiments — roughness breakup, albedo
value zones, nebula opacity, rim 2.45, ambient 4x, camera distance — this is now well-evidenced rather
than assumed:

> Crossing 2 -> 3 on `material`, `lighting` and `vfx` requires authored content (ship textures and
> effect quality), not renderer configuration. The renderer-side search is complete and negative.

The remaining actionable item this lane can hand over is concrete: assets still bound to the shared
placeholder ORM (`spaceface_neutral_orm_1024`, `SF_rough_flat`) rather than authored maps — see §15.

## 21. The authored-content test: AO baked into the Kestrel's ORMs

The renderer-side search being complete and negative (§20), the remaining question was whether
AUTHORED within-material variation moves `material`. That required touching an asset, so it was done
under a short-lived exact-path MEASUREMENT lease recorded in `design/program/NOW.md` — the mechanism
that row 19 of that board prescribes ("requires its own fresh exact-path lease before mutation").
`blender` and `asset-manifest` were free.

### What the Kestrel's materials actually are

The corrected graph-based audit gives a much more precise picture than "flat" or "placeholder":

| ORM | roughness mean | roughness stdev |
|---|---:|---:|
| brushed_metal | 0.413 | 0.062 |
| hull | 0.428 | 0.067 |
| mechanical | 0.466 | 0.074 |
| frontier_cyan | 0.503 | 0.061 |
| radiator | 0.569 | 0.057 |
| repair_green | 0.664 | 0.063 |
| armor_dark | 0.682 | 0.066 |
| engine_ceramic | 0.746 | 0.048 |
| rubber (lod1/2) | 0.849 | 0.049 |

Ten role-authored maps with means spanning 0.41–0.85: **material-to-material differentiation is
genuinely good.** The defect is entirely WITHIN each material — every map's own stdev is ~0.05–0.07,
i.e. near-constant across its own surface. That is the quantified form of "uniform grey plastic", and
it is exactly what the audit tool's own header predicted.

### The fix, and why noise was never going to do it

`tools/blender/gfx_orm_ao_bake.py` bakes real ambient occlusion from the mesh and writes it into the
ORM red channel, then raises roughness in the occluded areas (cavities collect grime, so they scatter
more). Metalness is never touched — that is material identity, not wear.

This is categorically different from `gfx_orm_breakup.py`'s fbm noise, which is uncorrelated with the
model: it adds texture but not *structure*. The renderer could never produce this because **the
renderer does not know where a panel recess is** — that information only exists in the geometry.

Result across all ten maps, geometry-correlated:

| | occlusion stdev | roughness stdev |
|---|---|---|
| before | 0.013 | 0.048–0.074 |
| after | **0.207–0.210** (~16x) | **0.099–0.135** (~2x) |

Candidate is 45,307,244 bytes against the live 44,916,544 — **+0.9%**, contract-comparable. (Source
GLBs here are uncompressed; KTX2/Meshopt compression happens in the release pipeline.)

### Two tool defects caught by failing loudly

* The bake aborted on `COLLISION_HULL`. First fix filtered on `o.data.uv_layers` being non-empty — which
  that object passes, because it has a UV layer *collection* with no ACTIVE layer. Correct test is
  `uv_layers.active is not None`, plus a name-based exclusion of collision/socket helpers.
* An earlier swap attempt **timed out mid-swap and left the candidate in the live path.** `git checkout`
  restored it byte-for-byte (`979d2c17` -> `0c0be004`) because the file carries no uncommitted work.
  The measurement was then re-run as a background script with an `EXIT`/`INT`/`TERM` trap so the restore
  cannot be skipped, and it reported `RESTORED OK` with `git status --porcelain assets/` empty.

**No live asset is modified.** The lease row is removed on completion.

### 21.1 Result: authored ORM content does NOT move `material` either — and the note says why

| axis | before | AO-baked |
|---|---:|---:|
| material | 2 | **2** |
| geometry | 3 | 2 (sampling noise) |
| everything else | — | unchanged |
| overall | 2.25 | 2.13 |

Seven disconfirmations now, and this is the decisive one: even **real geometry-correlated authored
variation** — 16x more occlusion variation, baked from the actual mesh — does not move the axis.

Reading the reviewer's note closely explains it, and it redirects the whole diagnosis:

> "This frame's ship surfaces read as similar matte **gray plastic panels**…"
> "The references distinguish painted metal, glass, hot engine elements… through roughness **and
> specular variation**."

It is judging **albedo/colour similarity between panels**, not roughness or occlusion. EVE's ship has a
white hull, dark recessed panels, coloured markings and hot emissives; the Kestrel is grey panels
sharing one palette with small accents. Two supporting facts already in hand point the same way: the
ship's ten ORMs already differentiate roughness well between materials (means 0.41–0.85) and that never
scored, and `scene.environment` is set but reflects a near-black scene, so specular variation has
nothing to reflect.

**Conclusion: `material: 2` is a PAINT problem, not a roughness/occlusion problem.** Closing it means
repainting the Kestrel's base-colour maps — deciding the ship should read as white/dark/marked rather
than uniform grey. That is an art-direction decision about what the ship IS, not a graphics-quality
fix, and it is the owner's call rather than this lane's.

The AO work is not wasted: the candidate is real, contract-comparable (+0.9% bytes), and the tool is
reusable for any asset. But it should be promoted as part of a paint pass, not on its own — on its own
it is invisible at the gameplay camera distance, which is precisely the reviewer's other standing note.

### 21.2 The complete negative result

Seven measured attempts at `material`/`lighting`, all p95 16.80, none moving the axis:

| # | attempt | layer | result |
|---|---|---|---|
| 1 | roughness breakup (shader) | renderer | no change (n=5) |
| 2 | albedo value zones | renderer | no change (n=5) |
| 3 | nebulaOpacity raise | renderer | frame got DARKER |
| 4 | rim light 1.15 -> 2.45 | renderer | no visible change |
| 5 | ambient 0.15 -> 0.62 (4x) | renderer | no visible change |
| 6 | chase zoom 72 -> 46 | renderer | visibly better, score identical |
| 7 | **AO baked into 10 ORMs** | **asset** | **no change** |

The search space this lane can reach is exhausted. What remains is authored paint and effect quality.

## 22. Paint pass, and the "low-spec" clue that reframes all of it

`tools/blender/gfx_albedo_paint.py` differentiates BASE COLOUR per material role (roles resolved from
the material graph, not image names) and beds AO into it. Value separation is what reads at gameplay
distance; hue is never rotated, so the ship keeps its identity.

Two bugs caught by reading the report instead of trusting `ok: true`:

* **Classification precedence.** `engine_ceramic` was driven DARK because 'engine' sat in the DARKEN
  list and DARKEN was tested before LIGHTEN. Ceramic is a light surface. LIGHTEN is now tested first
  and 'engine' is removed from DARKEN — it is a location word, not a value word.
* **AO applied after the role gain**, cancelling it: the hull's 1.42x lighten came out as 0.283 ->
  0.289, i.e. nothing, while every other surface got darker. The first candidate would have made the
  ship muddier, not better. AO is now applied before the gain, accents are exempt from AO entirely
  (paint sits ON the hull), and `aoAlbedo` dropped 0.45 -> 0.18.

Corrected run achieves real value separation:

| map | role | before -> after |
|---|---|---|
| hull | lighten | 0.283 -> **0.390** |
| brushed_metal | lighten | 0.474 -> **0.652** |
| engine_ceramic | lighten *(was mis-binned)* | 0.260 -> **0.358** |
| armor_dark | darken | 0.253 -> **0.157** |
| mechanical | darken | 0.205 -> **0.128** |
| warning_orange | accent | 0.599 -> **0.732** |

Hull/plating now sit at 0.39–0.65 against structure at 0.13–0.16 — a 3–5x value ratio where it was
~1.2x. **And `material` stayed at 2/5.**

### The clue

The reviewer's note on the painted frame says the surfaces share "a dull, **low-spec** gray response".

The first reading was: albedo, roughness and occlusion are all **modulators of a specular response**,
so if the specular response were near zero none of them could matter. That would have explained all
eight failures at once.

**That explanation is WRONG and is retracted.** `createSpaceReflectionEnvironment` does not bake the
dark game scene — it builds a purpose-made studio rig in its own offscreen scene: three emissive cards
at radiance **4.2 / 2.4 / 1.15**. It has plenty of energy, and `state.render.envMap` is confirmed
present at runtime. The ship is not reflecting blackness.

Checking the code confirmed the mechanism was worse than assumed: `applyAuthoredMaterialProfile`
assigned `envMapIntensity` **only to `glass`**. Every solid role — hull, mechanical, accent, ceramic,
radiator, drive — fell through to three.js's default of 1.0 against that near-black bake.

The environment is not FULLY black: it contains the sector's signature planet. So there is real
headroom. `SOLID_ENV_ROLES` now receive 2.1 (2.8 for metals, which have no diffuse response at all —
reflection is the only thing that shapes them). p95 unchanged at 16.80;
`test/authored-material-profiles.test.mjs` 9/9 and `test/sector-visual-profiles.test.mjs` 5/5 green.

### 22.1 Ninth disconfirmation, and the actual reason the ship is matte

Raising `envMapIntensity` for solid roles (2.1, 2.8 for metals) also left the score at **2.25**, every
axis identical. The change is kept: it is physically right — metals have no diffuse response, so
reflection is the only thing that shapes them — it costs nothing at p95 16.80, and
`test/authored-material-profiles.test.mjs` is 9/9 green. But it is not what the reviewer is scoring.

With the environment ruled out as the cause, the remaining explanation is the simplest one: **the ship
is matte because its materials are AUTHORED matte.** The `hull` role clamps roughness to 0.62–0.9
(default 0.76) at metalness 0.08–0.42 (default 0.2), and the shipped ORM roughness MEANS measure
0.41–0.85. High roughness at low metalness is, by definition, matte painted plastic. "Uniform matte
plastic" is an accurate description of the authored specification, not a rendering fault.

Making it read otherwise means LOWERING roughness means on the metal roles (0.43 -> ~0.25) so the hull
takes a specular hit from the rig that is already there — not adding more variation to a value that is
simply too high. That is a further authored-content change on top of the paint pass, and at that point
it is a full re-surfacing of the ship rather than a graphics-quality fix.

## 23. Full re-surface: every fix the reviewer prescribed, applied — score unchanged

The final experiment applied ALL THREE authored-content fixes to the player ship at once, which
together are exactly what review asked for ("varied roughness, darker recessed panels, edge wear",
"a packed ORM detail overlay for hull panels"):

1. **AO bake** — occlusion stdev 0.013 -> 0.208 across all ten ORMs
2. **Per-role repaint** — hull 0.283 -> 0.390, armor 0.253 -> 0.157 (3-5x value ratio between panel
   roles, up from ~1.2x)
3. **Roughness re-target** — armor 0.678 -> 0.448, mechanical 0.473 -> 0.356, hull 0.435 -> 0.339,
   brushed_metal 0.420 -> 0.332, with rubber/radiator/ceramic and all accents deliberately left rough
   so the result is surface-family SEPARATION rather than a uniformly glossy ship

Candidate 44,937,824 bytes vs live 44,916,544 (**+0.05%**). Swapped in under the measurement lease,
captured, restored, hash-verified `0c0be004`, `git status --porcelain assets/` empty.

**Result: 2.25. Every axis identical. `material` still 2/5.** p95 16.80.

### The conclusion, now well-evidenced

Ten controlled experiments, spanning both the renderer and the asset content, all at p95 16.80:

| # | attempt | layer | result |
|---|---|---|---|
| 1 | roughness breakup (shader) | renderer | no change (n=5) |
| 2 | albedo value zones | renderer | no change (n=5) |
| 3 | nebulaOpacity raise | renderer | frame got DARKER |
| 4 | rim light 1.15 -> 2.45 | renderer | no visible change |
| 5 | ambient 0.15 -> 0.62 (4x) | renderer | no visible change |
| 6 | chase zoom 72 -> 46 | renderer | visibly much better, score identical |
| 7 | envMapIntensity 2.1/2.8 | renderer | no change (kept: physically correct) |
| 8 | AO baked into 10 ORMs | asset | no change |
| 9 | per-role repaint | asset | no change |
| 10 | **all three combined + roughness re-target** | asset | **no change** |

Against the control — a real EVE Online frame scoring 4s through this same harness — the reading is
consistent and should be stated plainly:

> **The gap between this game and a 2020s AAA frame is not one defect, or ten. Our frames sit solidly
> inside the "2" band, and no single dial or single-asset change crosses it.** Reference frames earn
> their 4s through the accumulation of model detail density, effect quality, scene population and a
> coherent art direction — which is a production effort, not a parameter search.

Continuing to try single levers would be repeating a disproven method. The honest next step is a
scoped art-production plan (ship detail pass, effect authoring, scene population), estimated and
prioritised against the axis scores — not another tuning round.

**What this lane did deliver, all measured:** ten inert authored systems found and wired, a lifted
black floor (dead-black 80.3% -> 0.1%), a midground that exists for the first time (0.6 -> ~64 objects
on screen), a HUD that no longer sits on top of the render, a benchmark whose references are now
validity-gated, a grader whose pass condition is calibrated against measured reference performance
rather than an unreachable ideal, three reusable Blender authoring tools, and **p95 16.80 ms held
through every single change**.

## 24. Deep-field authoring, and the end of the parameter search

Review's most-repeated composition note is "a very large unused void across the left half". The helios
recipe had 2 ribbons and 3 star associations, ALL right of centre framing the gas giant. Added:

* two star associations in the **upper-left** field (`x: -0.34` and `-0.21`, both at positive z)
* a third ribbon (`helios-left-drift`) at a **separated depth**, reaching further left — two bands read
  as a stripe pair, three at different depths read as volume

This does not contradict the sector doctrine. What that protects is the lower-left **play corridor**
(negative z, below the flight line); both additions sit high in the frame at positive z, so the
corridor stays genuinely black while the dead upper-left does not. Star associations are density
weights on the existing single Points draw call — no new draw call, no new geometry.

`test/deep-field-structure-recipes.test.mjs` 3/3 green, p95 16.80. Star distribution is visibly wider.
`scripts/check-helios-sky-kit.mjs` fails on `cycle 10: core fog density bounded` **identically with and
without this change** — pre-existing, verified by stashing.

### Closing position

Eleven measured changes. The score has been 2.25 for the last eight of them, with identical per-axis
values, while the control (a real EVE Online frame through the same harness) sits at 3.63 with 4s.

**The parameter and single-asset search is over, and its result is negative.** Every remaining axis
needs production work of a kind that is not a dial:

| axis | at | what would actually move it |
|---|---|---|
| material | 2 | ship re-surfacing beyond value/roughness — decals, wear zones, distinct surface families authored per panel |
| lighting | 2 | authored per-ship light rigs; the sector rig is already at its useful limit |
| vfx | 2 | effect authoring — trails, wake, impact and engine treatments as art, not parameters |
| background | 2 | large-scale authored macro geometry (structures, wrecks, nebula forms), not more particles |
| composition | 2 | camera framing (tested: visibly much better at zoom 46, score unchanged) + scene population |
| geometry | 3 | model detail density at gameplay camera distance |

Each is a scoped art task with a real cost. Estimating and sequencing those against the axis scores is
the honest next step, and it is a decision about budget, not a technical unknown.

**Delivered and verified:** ten inert authored systems wired; a lifted black floor (dead-black 80.3% ->
0.1%); a midground that exists for the first time (0.6 -> ~64 objects on screen, then size-graded);
authored deep-field content in the previously dead upper-left; a HUD that no longer sits on top of the
render; env reflection on solid roles; a reference set that is now validity-gated; a grader calibrated
against measured reference performance instead of an unreachable ideal; three reusable Blender tools;
and **p95 16.80 ms held through every single change, with zero live assets modified.**

## 25. Authored deep-field structures — the reviewer's own named fix, built and measured

Review names "almost no middle layer" in every round, and its reference frames build one from distant
SOLID FORMS — wrecks, hulls, station structure. The recipe format could not express that: ribbons are
dust and have no silhouette. So the capability was added.

**New primitive.** `structures: [{ id, silhouette, scale, offset, opacity, color }]` in a deep-field
recipe, built in `spaceBackground.js` as a `ShapeGeometry` plate in the deep-field group. The macro
guard was widened so a recipe with structures but no ribbons still builds. Two authored for helios: a
broken long-hauler hull and a relay mast, fictionally consistent with the derelicts the sector's own
contact list already reports.

**Two things learned while making them read:**

* **Placement.** World-x is inverted relative to screen-x here and the group anchor dominates the
  offsets, so the first attempt landed both plates behind the planet instead of in the empty left
  field. Found with a diagnostic capture using flat red/green fills and a pixel scan for their bounding
  boxes — far faster than guessing at the anchor maths.
* **Value direction.** The first version was DARK, on the theory that a distant object reads by
  occluding the starfield. It was invisible: occlusion only reads as depth when something bright sits
  behind it, and this sector's field is dark. Reference frames sell distant wrecks by having them
  **catch light**. Inverted to sit just above the background value, and they read.

`test/deep-field-structure-recipes.test.mjs` 3/3, `check:render-hotpath` OK, p95 **16.80**.

**Result: 2.25. Every axis identical, `background` still 2/5.** Twelfth measured change.

The structures are kept — they are a real capability the engine did not have, they add a middle layer
that genuinely was not there, and they cost nothing. But as evidence they are decisive: **the exact
fix the independent reviewer asked for, implemented and visibly rendering, does not move the axis.**

## 26. Final position

Twelve measured changes. The last nine all scored 2.25 with identical per-axis values. The control — a
real EVE Online frame through this same harness — scores 3.63 with 4s.

That combination is the finding. The grader discriminates between games and not between our variants,
because **our frames sit solidly inside the "2" band and no individual change crosses it.** This is not
one missing feature; a 2020s AAA frame earns its 4s through the accumulation of authored model detail,
effect craft, scene population and art direction working together. That is a production programme
measured in artist-weeks, not a parameter search, and no further single change from this lane will
demonstrate otherwise.

**What this lane delivered, all verified, all at p95 16.80 ms with zero live assets modified:**

* ten inert authored systems found and wired — art the game paid for and never displayed
* a lifted black floor (dead-black 80.3% -> 0.1%) with the "true blacks" doctrine left intact
* a midground that exists for the first time (0.6 -> ~64 on-screen objects, then size-graded)
* authored deep-field structures — a new engine capability
* a HUD that sits in the render instead of on top of it
* environment reflection on solid material roles (previously only `glass` had any)
* a reference set that is validity-gated, after 2 of 5 proved to be in-atmosphere scenes
* a grader whose pass condition is calibrated against measured reference performance, after the
  original condition proved unreachable by a real AAA frame
* four reusable Blender tools: asset audit, ORM breakup, AO bake, albedo paint
* a proven candidate -> measure -> restore loop for live assets, trap-guarded

**Not delivered: parity.** 2.25 against the reference's 3.63.

## 27. Cross-scene check: 2.25 is a CEILING, not one unlucky frame

Every one of the twelve experiments was run on `deep-flight/idle`. A fair objection is that the brief
was "all aspects" and that scene might simply be the game's worst. It is not — it is its best.

`asteroid-field` (references validated first: 5/5 on-brief, none quarantined):

| axis | deep-flight | asteroid-field |
|---|---:|---:|
| lighting | 2 | 2 |
| material | 2 | 2 |
| geometry | 3 | **2** |
| grade_post | 2 | 2 |
| background | 2 | 2 |
| vfx | 2 | **1** |
| ui_integration | 3 | **2** |
| composition | 2 | 2 |
| **overall** | **2.25** | **1.88** |

Three axes drop and none rise. So the number this lane has been reporting is the **ceiling** across the
game's scenes, not a floor peculiar to one frame, and the twelve experiments were not aimed at an
unrepresentative target.

One observation from that frame worth carrying into any art plan: **the asteroids read as rock** —
varied surface, believable lighting, real silhouette — while the ship beside them reads as flat
plastic. Same renderer, same lights, same frame. That is direct evidence the engine is not the
limitation on `material`; the rocks are simply better authored than the ship. It is the strongest
single argument that the remaining gap is production, and it also names where to spend first.

## 28. Closing this lane

Thirteen measured changes across two scenes. Nine consecutive identical 2.25s on the primary scene, a
1.88 on the second, and a control (real EVE frame, same harness) at 3.63.

I am not going to run a fourteenth single-lever experiment. Twelve on record disconfirm that method,
the cross-scene check shows the target was representative, and repeating it would spend the owner's
budget to reprint a number that is already established to three significant figures.

**Parity was not reached: 2.25 against 3.63.** The performance half of the brief was met in full —
p95 16.80 ms held through every change, with zero live assets modified.

The next step is a costed art programme, and the asteroid-vs-ship comparison above says to start with
ship surfacing. That is a decision about budget, and it belongs to the project owner.
