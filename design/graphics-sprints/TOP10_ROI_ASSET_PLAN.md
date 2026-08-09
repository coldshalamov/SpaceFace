<!-- LIFETIME: VOLATILE -->
# Top-10 ROI asset research ranking — candidates for admitted graphics work

```yaml
refreshed: 2026-08-09
baseCommit: 9772dfbd
expiresAfterCommits: 40
expiresAfterDays: 14
```

Companion to [`design/program/EXPANSION_PROGRAM.md`](../program/EXPANSION_PROGRAM.md) (the standing
brief) and [`GRAPHICS_ORPHAN_CENSUS.md`](./GRAPHICS_ORPHAN_CENSUS.md) (what already exists and
lacked a literal source reference in the captured audit). This file owns **research ranking and
justification only**. It is not an active
packet or dispatch order: every implementation needs an admitted queue leaf, exact live ownership,
and its own proof. Any row overlapping Physics-as-Spectacle remains downstream of that packet's
accepted R5/five-minute-Ceres/R8 gates. Acceptance remains
`docs/visual-assets/VISUAL_ASSET_PRODUCTION_STANDARD.md` G0-G7, and no row here grants a lease.

---

## 1. The ROI model, and its honest weakness

```
ROI  =  (pixel coverage in the visible bubble  x  defect severity)  /  cost to fix
```

**Pixel coverage, not reference count.** `CAMERA_VISIBLE_BUBBLE.md` measures visible ground-plane
depth at **93–125 WU normally** and about **145–164 WU when physics-earned**. Its old lateral-strip
figure is explicitly invalid and must not be used.
Objects at 200–1000 WU are map and radar content: they contribute nothing to the frame. The
catalog's "high-exposure places" table counts *authored static references* and says so explicitly —
`place_debris_chunk` having 18 references means little if those instances sit outside the bubble.

**Defect severity** is weighted by what the independent reviewer actually said, not by what is easy
to measure. The controlling observation is `EXPANSION_PROGRAM.md` §1:

> in the asteroid-field frame, the *asteroids read as rock* — varied surface, believable light, real
> silhouette — while the *ship beside them reads as flat plastic*. Same renderer, same lights, same
> frame.

Twelve controlled experiments, nine of which returned byte-identical scores, disconfirmed those
exact single-lever hypotheses for one scene/scorer while a chase-zoom change looked better without
moving the score. This ranking therefore weights **authored surface content** highly without
pretending every renderer, composition, or camera hypothesis is closed.

### The weakness, stated plainly

**No runtime telemetry for screen-space coverage exists.** Every coverage claim below is inferred
from selector role (is it the player ship? is it a hostile the player closes with?) plus the visible
bubble, not measured. That is good enough to separate tier 1 from tier 3, and *not* good enough to
order items within a tier. Gate 0 fixes this before the ranking is used for anything finer.

---

## 2. Gate 0 — three preflight tasks that make the ranking honest

Each is hours, not days. Two are free wins on their own merits. **Do these first.**

### G0-1. Measure actual screen coverage (makes the ranking real)

Extend `scripts/gfx-frame-stats.mjs` or the capture harness to report per-asset screen-space area
across a representative route. Rank the manifest by measured pixels. Until this exists, §3's order is
argued, not proven.

Cheapest honest version: render the route with a per-asset ID buffer and histogram it. Do not
estimate from bounding spheres — a hollow truss and a solid slab of the same radius differ by an
order of magnitude in covered pixels.

### G0-2. Re-run the corrected ORM audit (gates all material targeting)

The "twenty assets at ORM roughness stdev exactly zero" figure is **withdrawn** — the audit matched
textures by filename, counting normal maps as ORMs and missing real ones. `engine_ion_small` reported
0 when its true stdev was **0.2011**. Both `gfx_asset_audit.py` and `gfx_orm_breakup.py` were
repaired to read the Principled BSDF material graph; the re-audit was never run.

`src/render/authoredMaterialProfiles.js:27-33` still states the withdrawn figure as fact. Re-run,
publish the corrected table, and correct that comment in the same commit.

Until this runs, **nobody knows which assets actually have flat roughness.** Every material-targeting
decision below inherits that uncertainty.

### G0-3. Verify or repair the codex image-generation CLI (gates the whole loop)

The production loop's concept-art step (§2.3) and adversarial-review step (§2.5) both depend on a CLI
that is recorded as non-functional here: it answers "requires a newer version of Codex", its model
refresh fails on an unknown reasoning-effort variant, and `~/.codex/config.toml` carries an invalid
`service_tier = "default"` that aborts config load **before any CLI override applies**.

Repair it, or record `blocked:image-generation-capability` and use the bounded terminal handoff in
`docs/visual-assets/AGENT_PROMPTS.md` § E. **Do not silently substitute a weaker reviewer** — the
prior lane substituted grok and *recorded that it had done so*. An unrecorded substitution turns the
review gate into a rubber stamp, which is precisely how nine experiments returned identical scores
without anyone noticing the grader was not discriminating.

---

## 3. The ranked ten

Tiers are ordered. Within a tier, order is provisional until G0-1 lands.

### Tier A — free wins (defect is recorded, fix is near-zero cost, both visual *and* performance)

#### 1. `place_asteroid_rock_b` and `place_asteroid_rock_c` — restore from the overwrite

| | `rock_a` (repaired) | `rock_b` / `rock_c` (live) |
|---|---:|---:|
| Triangles | 1,977 | **83,200** |
| LOD chain | 3 levels | **none** |
| Texture | 1024² | 256² |
| Mesh | authored | single `Icosphere` |

**42x the triangles at a quarter of the texture resolution with no LOD.** Their material is named
`LOD0_RockA_Mat`, corroborating the recorded live-source-overwrite: four art-lane commits
(`d2df9994`/`af287fc6`/`d17cc678`/`ede16953`) overwrote three live sources with unaccepted WIP while
touching no manifest. `rock_a` was proven and restored; these two were not.

Asteroids are the single most common object in the visible bubble, and — per §1 — they are the asset
class the reviewer says *already reads correctly*. Two of three are silently the worst geometry in
the game.

**Fix:** extract the accepted donor bytes from the reviewed commit into an isolated candidate, prove
the exact source/release contract, then promote through a path-limited transaction. Never run a
shared-tree `checkout`/`restore`; WIP iterations remain recoverable at `ede16953`.
**Proves it:** `check:graphics:asset-receipts` green, triangle count and LOD chain matching `rock_a`,
matched before/after capture.

#### 2. Stop baking the two dead nebula layers

`nebulaOpacity: 0.0` on **all five** sector profiles (`src/data/sectorVisualProfiles.js` lines 61,
112, 140, 173, 216) drives the deep-field composite's L1/L2 alphas to exactly zero. Both layers are
still baked and sampled every frame: **32.2 MB of texture and a 14.6 ms bake, contributing no
pixels.** Every authored per-sector `l1Alpha` (`core` 0.28, `belt` 0.48, `anomaly` 0.55) is inert.

This is the model case from `EXPANSION_PROGRAM.md` §6 — find the waste, do not cut the quality.

**Do not fix by raising the dial.** That was measured and disconfirmed: L1 is authored as dark dust
and `mix()` *replaces* L0 with it, so the frame gets darker (73.4% → 76.8% dead).

**Fix:** make the bake conditional on non-zero resolved opacity, so the cost disappears at zero
*without* deleting the capability. Do not hard-delete — that forecloses §5's owner decision.
**Proves it:** bake time and texture residency both drop to zero at unchanged pixels; frame output
byte-identical.

### Tier B — the player ship (on screen 100% of normal play, largest single pixel area)

#### 3. Kestrel hull — authored per-zone material variety

The default player ship. It is *the* asset behind "reads as flat plastic", and it is in frame
whenever the player is flying.

Two renderer-side hypotheses are disconfirmed for the recorded scene and scorer
(`authoredMaterialProfiles.js:53-58`): roughness breakup and albedo value zones were tested at n=5,
and the reviewer note remained *"reads mostly as one matte gray material"*. Do not repeat those two
hypotheses unchanged; this does not exhaust other renderer, composition, camera, or route work. The
comment's own conclusion is the brief for this item:

> It wants authored variety per zone — painted metal vs glass vs worn edge, readable at ship size —
> which is texture content, not a shader modulation.

**The input already exists and had no literal source reference at capture.**
`assets/ships/foundry/spacepunk_markings_v1/` is a
focused-green 32-cell paint/emissive atlas with 13 intentional emissive cells, exact serial/dock
text, stable UV metadata, mip gutters, and verified 64px survival. No runtime wiring was demonstrated
by the captured screen; re-run current manifest, bundle, selector, and route validators before using it.

Related and separate: the `DIE LAUGHING` stencil candidate (one-sided, 0.3 mm conforming, 7 paint-loss
gaps, 34-quad wear layer) is integrated offline with green triangle contracts and hashes, but its
runtime G5/G6 and independent G7 art verdict remain open.

**Fix:** author per-zone material response against the atlas — painted metal, glass, worn edge,
exposed mechanical — at ship-size readability. **Proves it:** G7 independent art verdict plus a
matched capture satisfying the repository p95 ≤16.7 ms target plus p99/hitch protections; report
the 16.80 ms Intel-iGPU route guardrail separately when applicable.

#### 4. Kestrel engine and thruster surfaces

Always in frame during flight, always *bright*, and therefore always drawing the eye — the exact
place a flat surface is least forgivable. `EXPANSION_PROGRAM.md`'s hierarchy puts engines and
machinery in the bright band against darker hulls.

The engine family was in the withdrawn stdev-zero set, and `engine_ion_small` is the specific asset
whose true roughness stdev (0.2011) the broken audit reported as 0 — so this item's real state is
**unknown until G0-2 runs**. Rank it here; confirm before authoring.

Note there is production thruster machinery already: real exhaust is `ContinuousPlumeSystem` plus its
recipe, with GLSL-source test gates and recipe length invariants. Do not rebuild it.

### Tier C — hulls the player meets at close range (one fix multiplies across every NPC)

#### 5. The ten modular hulls (`hull_*.glb`)

**The kit every NPC ship is assembled from.** One material improvement propagates to the entire
non-whole-ship fleet — the best multiplier in the repository.

Their recent repair was explicitly *technical*: 34 errors / 27 warnings → 0/0 on texture roles, with
geometry, sockets, scale, collision, names, and runtime selection frozen. That is correctness, not
art. Fresh V2 CPU contact sheets and Browser/Electron/LOD acceptance are recorded open.

#### 6. Ashline V2 Dart / Lode / Rig — promote the finished candidates

**Promotion work, not authoring.** These map to live hostile selectors (`wasp_swarmer`,
`bruiser_brawler`, `reaver_pirate`) while the live selectors still resolve the *older* Ashline
family. Offline V2 sources and KTX2/Meshopt candidates exist; the Rig checkpoint is an exact
source/candidate mirror at 3,610,796 bytes bound into a 29-artifact family epoch, with G1-G4 green
offline.

What is open: G5/G6/G7, inherited donor-hull surfacing, and live manifest/selector wiring. Cost is
acceptance, not modeling — the cheapest quality-per-hour in tier C.

#### 7. Corsair / Reaver identity split

`reaver_pirate` and `corsair_raider` **both select `wholeship_ashline_rig`**. Two distinct live
hostile roles are visually the same ship — a direct hit on the variety goal, and the kind of
repetition the player reads as "same".

Donor directions exist (`foundry_ashline_rig_corsair_blade`, `foundry_ashline_rig_reaver_hook`) and
are explicitly never-promote-wholesale. This is a real authoring task; it is ranked here because
variety multiplies (§3 of the brief: ten ship types x six professions x eight events).

### Tier D — places and effects that enter the measured 93–165 WU depth bands

#### 8. `place_debris_chunk` and `place_dead_hulk` — close the acceptance chain

The two highest-reference places (18 and 15). Their remaster is **source-complete and blocked at
G5/G6/G7 after an offline KEEP**: debris replaces the soft twin-pod read with one ruptured pressure
module; hulk replaces iter219 with a continuous carrier/drill-tender rupture. Source GLBs, exact
release pairs, texture roles, structural contracts, and offline matched reviews are green.

**The modeling is done.** What is missing is live Browser/Electron presentation, LOD/residency
performance, and an independent art verdict. Resume at
`assets/ships/parts/places/REMASTER_HANDOFF_dock_hulk_debris.md`, which owns the bans and KEEP/RESTORE
rules — do not restart the assets.

#### 9. Validate and, if still isolated, wire the VFX NEXT library into the live effect set

`src/vfxnext/**` is a 12-family isolated reference library that **deliberately** dodges the
reachability ratchet — it was by-design isolated and had no external import at the 2026-08-08
capture. Current manifest, bundle, dynamic-route, and player reachability must be revalidated.
No promotion ownership was recorded at capture; current exact ownership must be rechecked.

Effects are the brief's "brightest" band and the cheapest perceived-quality-per-triangle in the
project. Constraints already recorded: `EVENT_LIGHT_POOL_SIZE = 6` is the promotion ceiling and is a
shader cache key `precompile.js` must match; sustained-emitter occupancy is `rate x lifetime`. Three
invisible-effect traps are documented — reversed `smoothstep` is undefined, `RingGeometry` UVs are
planar, and `cross` + `cameraPosition` billboarding yields NaN.

#### 10. Promote a selected family from the incubator packs

The captured incubator census contains 98 source-only GLBs across three packs:
`everyday_space_kit` (46), `npc_activity_pack` (15), and `wreck_aftermath_pack` (37). Current runtime
reachability must be revalidated. Each has a controlling independent review that
**rejects wholesale promotion** — primitive blockout forms, flat materials, missing authored LODs,
scale deltas, 19 REVISE-first assets in the everyday kit alone.

Ranked last deliberately: the reviews are right, and promoting a pack wholesale would inject exactly
the flat-material defect tiers B and C exist to remove. The correct move is to **select one family**,
re-author it under the current whole-asset pipeline, and accept it on its own hashes.

This item is where world density comes from. It is last because doing it wrong is worse than not
doing it.

---

## 4. Performance doctrine for every item

The binding contract is [`design/PERF_BUDGET.md`](../PERF_BUDGET.md), including the
user's standing rule:

> Never reduce resolution, draw distance, population, geometry/LOD quality, material roles, shadows,
> post-processing, effect capacity, authored lighting, texture quality, or gameplay complexity.
> Optimization comes only from algorithms, allocation, batching, cadence, culling, residency, state
> ordering, persistent resources, and backend ownership.

**Gate:** the repository target-profile p95 remains **≤16.7 ms**, with p99 and hitch count no worse
than baseline. When the Intel-iGPU route applies, also report its 16.80 ms guardrail; it never relaxes
16.7. Use the same active profile/manifest and dimensions for both arms (the current probe default is
1830×973), then report p95, p99, and hitches rather than a single frame. Retain 1920×1080 only when
running the explicitly named legacy Intel route that owns that profile.

Non-negotiable measurement rules, each learned from a recorded failure:

- **Match resolution.** Historical session images used 1262×648 while archived rounds used
  1920×1080. The HUD occupies a different *fraction* of each, so statistics are not comparable
  across them; current evidence follows its admitted manifest/profile.
- **Re-capture the baseline in the same session.** An archived frame once showed a fake 80.3% → 73.0%
  win that a same-session baseline revealed as 73.4% → 73.0% noise.
- **A contaminated perf sample is not a measurement.** Late-session captures read p95 33.30 where the
  same scene read 16.80 earlier the same day; a same-session A/B read 33.30 in *both* arms. Discard
  contaminated samples, use the validation broker or a fresh context, and close only resources or
  exact PIDs owned and returned by that probe. Never perform ambient process-name cleanup.
- **Counters count work, not durations**, and **a counter must never fail toward good news** — an
  uninstrumented path reports zero, indistinguishable from "fixed".
- **Prefer `structFrac`** (fraction of 16x16 tiles with luma stdev > 0.01) over "dead black %", which
  a flat +0.02 luma lift moves 84% → 0.2% while adding nothing.

Known and pre-existing, not to be attributed to new work: a stochastic ~250 ms combat spike from a
non-preemptible `buildComposedShip` admission stall, and `check-helios-sky-kit.mjs` failing on
`cycle 10: core fog density`. Attribute using an isolated clean worktree or candidate path; never
stash or restore the shared checkout to manufacture a baseline.

---

## 5. The owner decision this plan does not make

Whether the deep field carries **authored content** (structure, dust, distant light) or stays a
**true-black void** is art direction, not an agent's call. It is pinned by
`test/sector-visual-profiles.test.mjs` and it decides whether item 2's dead bake is reclaimed or
revived. `SECTOR_POST_TOE = 0.020` already removed the acute dead-black symptom, so this is now a
question about richness, not about a broken frame.

Items 1-10 are all executable without resolving it.
