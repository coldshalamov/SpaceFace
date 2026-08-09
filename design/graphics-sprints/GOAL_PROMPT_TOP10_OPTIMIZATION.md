<!-- LIFETIME: VOLATILE -->
# Draft goal prompt — one admitted leaf from the top-10 ROI research ranking

```yaml
refreshed: 2026-08-09
baseCommit: 9772dfbd
expiresAfterCommits: 40
expiresAfterDays: 14
```

> **RESEARCH TEMPLATE — DO NOT RUN AS A TEN-ITEM AUTONOMOUS CAMPAIGN.** The integrator must convert
> one bounded row into an admitted queue/active packet first. Any Physics-as-Spectacle overlap stays
> downstream of accepted R5/five-minute-Ceres/R8 gates.

Copy everything below the line into a fresh thread. It is written to be self-contained: the receiving
thread starts cold and must not need this conversation.

---

## GOAL

For the one exact row admitted by the integrator, raise its player-facing quality without losing
performance or sacrificing quality to buy performance. The ten rows below are research candidates,
not permission to claim or execute the portfolio in order.

## READ FIRST, IN THIS ORDER

1. `CANONICAL_BUILD_MAP.md` §1 — the implementation front door.
2. `design/program/EXPANSION_PROGRAM.md` — **the standing research brief. Read it fully.** §1 records
   twelve controlled experiments and their exact scene, scorer, and tested hypotheses. Treat a
   disconfirmed result only as a reason not to repeat that same hypothesis unchanged; other renderer,
   composition, camera, and route hypotheses remain open until measured.
3. `design/graphics-sprints/TOP10_ROI_ASSET_PLAN.md` — the research ranking and evidence. Execute
   only the exact admitted leaf named by the integrator.
4. `design/graphics-sprints/GRAPHICS_ORPHAN_CENSUS.md` — the historical candidate/literal-source
   screen and withdrawn-claim evidence; rerun owning reachability validators before acting on it.
5. `design/PERF_BUDGET.md` — the binding quality contract and measurement rules.
6. `docs/visual-assets/VISUAL_ASSET_PRODUCTION_STANDARD.md` — G0-G7 acceptance. A valid GLB is not
   accepted art.
7. For any Blender form or surfacing change:
   `.grok/skills/spaceface-blender-material-truth/SKILL.md` and its material-truth preflight.
8. `design/graphics-sprints/CAMERA_VISIBLE_BUBBLE.md` — visible depth is **93–125 WU normally** and
   about **145–164 WU when physics-earned**; its old lateral-strip figure is invalid.

## BEFORE YOU CLAIM ANYTHING

Treat `design/program/NOW.md` as one input to a live collision check, not as sufficient ownership
proof. Before claiming work, refresh its header and exact rows, then inspect `git status --short`,
staged and unstaged diffs, current `HEAD`/`origin/master`, and demonstrably live exact writers.
Register only the exact paths needed by the admitted leaf; a stale lane label or thread title does
not create a broad subsystem lease.

## NON-NEGOTIABLE CONSTRAINTS

**Quality contract — the user's standing rule:**

> Never reduce resolution, draw distance, population, geometry/LOD quality, material roles, shadows,
> post-processing, effect capacity, authored lighting, texture quality, or gameplay complexity.
> Optimization comes only from algorithms, allocation, batching, cadence, culling, residency, state
> ordering, persistent resources, and backend ownership.

There is no triangle ceiling, texture-size cap, or material-count limit. Budget the *measured* cost
at supported camera sizes. **Do not make anything simpler to make it faster — find the waste
instead.**

**Performance gate:** target-profile p95 **≤16.7 ms**, with p99 and hitch count no worse than the
matched baseline. Also report the 16.80 ms Intel-iGPU route guardrail when applicable; it never
relaxes the repository target.

**Measurement rules, each learned from a recorded failure:**
- Match the active profile/manifest and dimensions between arms. The current probe default is
  1830×973; 1920×1080 belongs only to the explicitly named legacy Intel route. Do not compare either
  with archived 1262×648 captures.
- Re-capture the baseline in the same session. An archived comparison once showed a fake win that a
  same-session baseline revealed as noise.
- A contaminated sample is not a measurement. Discard it, use the validation broker or a fresh
  context, and close only resources or exact PIDs owned and returned by that probe. Never perform
  ambient process-name cleanup. The same scene has read p95 33.30 and 16.80 on the same day.
- Counters count work, not durations. **A counter must never fail toward good news** — an
  uninstrumented path reports zero, indistinguishable from "fixed".
- Prefer `structFrac` from `scripts/gfx-frame-stats.mjs` over "dead black %", which a flat +0.02 luma
  lift moves 84% → 0.2% while adding nothing.

**Pre-existing, not yours:** a stochastic ~250 ms combat spike from a non-preemptible
`buildComposedShip` admission stall; `check-helios-sky-kit.mjs` failing on `cycle 10: core fog
density`. Attribute through a clean isolated worktree or candidate-only path; never stash or restore
foreign work in the shared checkout.

**Two traps that will cost you a day:**
1. **Silent fallback.** `assetLoader.js` returns `null` on authored-load failure and `partsLibrary.js`
   substitutes procedural geometry. The entity stays *visible*, so a broken load reads as an art
   defect. Check `getAuthoredAssetDiagnostic` and run `npm run check:assets:live`.
2. **Shader cache keys.** Changing injected shader source without changing its program cache key makes
   three.js reuse the old program. The change measures as "no effect" — which reads as a disconfirmed
   hypothesis rather than a bug. This has already happened here.

**Do not re-run these — they are measured and closed:** roughness-breakup and albedo-zone shader
terms (both disconfirmed at n=5); `rim` and `ambient` lighting multipliers (no visible change at 2x
and 4x); raising `nebulaOpacity` (makes the frame *darker*, because L1 is dark dust and `mix()`
replaces L0 with it).

## GATE 0 — DO THESE THREE FIRST

**G0-1. Measure real screen coverage.** Extend `scripts/gfx-frame-stats.mjs` or the capture harness to
report per-asset screen-space pixel area across a representative route. The current ranking is argued
from selector role and the visible bubble, not measured. Do not estimate from bounding spheres — a
hollow truss and a solid slab of equal radius differ by an order of magnitude. Use the result to
confirm or reorder items *within* tiers.

**G0-2. Re-run the corrected ORM audit.** The "twenty assets at roughness stdev exactly zero" figure
is **withdrawn** — the audit matched textures by filename, counting normal maps as ORMs and missing
real ones (`engine_ion_small` reported 0; true value 0.2011). Both `tools/blender/gfx_asset_audit.py`
and `gfx_orm_breakup.py` were repaired to read the Principled BSDF material graph, but the re-audit
was never run. `src/render/authoredMaterialProfiles.js:27-33` still states the withdrawn figure as
fact — correct that comment in the same commit. **All material targeting is guesswork until this
runs.**

**G0-3. Verify or repair the codex image-generation CLI.** The concept-art and adversarial-review
steps depend on it. It is recorded non-functional here: answers "requires a newer version of Codex",
model refresh fails on an unknown reasoning-effort variant, and `~/.codex/config.toml` carries an
invalid `service_tier = "default"` that aborts config load *before any CLI override applies*. Repair
it, or record `blocked:image-generation-capability` and use the bounded handoff in
`docs/visual-assets/AGENT_PROMPTS.md` § E. **If you substitute a different reviewer, record that you
did.** An unrecorded substitution turns the review gate into a rubber stamp.

## THE TEN — RESEARCH RANKING, NOT DISPATCH ORDER

**Tier A — free wins, both visual and performance**

1. **`place_asteroid_rock_b` / `rock_c` — recover from an unaccepted overwrite.** Live: 83,200
   triangles, no LOD chain, 256² textures, single `Icosphere`, material named `LOD0_RockA_Mat`.
   `rock_a`: 1,977 triangles, 3 LODs, 1024². Extract reviewed donor bytes into an isolated candidate;
   never `checkout`/`restore` over the shared tree. WIP remains recoverable at `ede16953`. Proves it:
   `check:graphics:asset-receipts` green plus matched capture.

2. **Stop baking the two dead nebula layers.** `nebulaOpacity: 0.0` on all five profiles
   (`src/data/sectorVisualProfiles.js` lines 61, 112, 140, 173, 216) zeroes the L1/L2 composite
   alphas. **32.2 MB of baked texture and a 14.6 ms bake produce no pixels.** Make the bake
   conditional on non-zero resolved opacity — **do not hard-delete**, that forecloses an open owner
   decision. Do not "fix" it by raising the dial. Proves it: bake time and residency to zero at
   byte-identical output.

**Tier B — the player ship, on screen 100% of normal play**

3. **Kestrel hull — authored per-zone material variety.** This is *the* "reads as flat plastic"
   asset. The exact tested shader hypotheses were disconfirmed; the strongest measured next bet is
   texture content — painted metal vs
   glass vs worn edge, readable at ship size. **The input already existed without a literal source
   reference at capture:**
    `assets/ships/foundry/spacepunk_markings_v1/` is a focused-green 32-cell paint/emissive atlas
    (13 emissive cells, exact serial/dock text, stable UV metadata, mip gutters, verified 64px
    survival). The captured literal-source screen did not demonstrate runtime wiring; run current
    manifest, bundle, selector, and route validators before authoring anything new.

4. **Kestrel engine and thruster surfaces.** Always in frame, always bright. Real state is **unknown
   until G0-2 runs** — `engine_ion_small` is the specific asset the broken audit mis-reported.
   Existing production machinery is `ContinuousPlumeSystem` plus its recipe, with GLSL-source test
   gates and recipe length invariants — do not rebuild it.

**Tier C — hulls met at close range; one fix multiplies across every NPC**

5. **The ten modular hulls (`hull_*.glb`).** The kit every NPC ship is assembled from — the best
   multiplier in the repository. Their recent 34-errors → 0 repair was *texture-role correctness*,
   not art. Geometry, sockets, scale, collision, and selection are frozen; V2 contact sheets and
   LOD acceptance are open.

6. **Ashline V2 Dart / Lode / Rig — promote finished candidates.** Live hostile selectors still
   resolve the *older* Ashline family while offline V2 sources and KTX2/Meshopt candidates exist
   (Rig mirrors exactly at 3,610,796 bytes, G1-G4 green offline). This is acceptance work, not
   modeling — cheapest quality-per-hour in this tier.

7. **Corsair / Reaver identity split.** `reaver_pirate` and `corsair_raider` both select
   `wholeship_ashline_rig` — two live hostile roles are the same ship. Donor directions exist
   (`foundry_ashline_rig_corsair_blade`, `foundry_ashline_rig_reaver_hook`); never promote a donor
   wholesale.

**Tier D — places and effects that enter the measured 93–165 WU depth bands**

8. **`place_debris_chunk` / `place_dead_hulk` — close the acceptance chain.** The two
   highest-reference places. **The modeling is done** and blocked at G5/G6/G7 after an offline KEEP.
   Missing: live Browser/Electron presentation, LOD/residency performance, independent art verdict.
   Resume at `assets/ships/parts/places/REMASTER_HANDOFF_dock_hulk_debris.md`, which owns the bans and
   KEEP/RESTORE rules. **Do not restart these assets.**

9. **Validate and, if still isolated, wire the VFX NEXT library.** `src/vfxnext/**` is a 12-family
   reference library that was deliberately isolated with no external import at capture. Re-run the
   owning manifest/bundle/route checks before promotion into `src/render/vfx.js`.
   `EVENT_LIGHT_POOL_SIZE = 6` is the ceiling **and a shader cache key `precompile.js` must match**;
   sustained-emitter occupancy is `rate x lifetime`. Documented invisible-effect traps: reversed
   `smoothstep` is undefined, `RingGeometry` UVs are planar, `cross` + `cameraPosition` billboarding
   yields NaN.

10. **Promote one selected family from the incubator packs.** 98 source-only GLBs across
    `everyday_space_kit` (46), `npc_activity_pack` (15), and `wreck_aftermath_pack` (37). Each has a
    controlling independent review that **rejects wholesale promotion** — primitive blockout forms,
    flat materials, missing LODs, scale deltas. **Select one family and re-author it** under the
    current whole-asset pipeline. Ranked last because doing it wrong injects the exact flat-material
    defect items 3-7 exist to remove.

## PER-ITEM LOOP

1. Register the exact-path lease in `NOW.md`.
2. Capture a **same-session** before-baseline with the admitted manifest's active profile and exact
   dimensions (currently 1830×973 by default; use 1920×1080 only for the named legacy Intel route).
3. Write or read the fiction entry — who made it, why it is worn where it is worn, what the markings
   mean. Vague descriptions converge into "same"; detailed ones diverge into variety.
4. Produce concept art as the visual target (G0-3's tooling, or the recorded fallback).
5. Build — Blender form/surfacing per the material-truth preflight, or code for wiring items.
6. Adversarial review against **both** the concept and professional reference frames. Demand
   specifics, not vibes.
7. Iterate until the reviewer stops finding substantive faults.
8. Capture the after-measurement in the same session. Confirm target-profile p95 ≤16.7 ms, no p99
   or hitch regression, and report the 16.80 ms Intel-iGPU guardrail separately when applicable.
9. Run `npm run check:baseline`, plus `check:assets:live` for any asset change.
10. Commit the asset, its fiction, its concept, and its evidence together — that chain is the
    provenance that makes a later regression debuggable.
11. Release the lease.

## WHEN TO STOP AND ASK

- An item requires resolving whether the deep field carries authored content or stays a true-black
  void. **That is the project owner's art-direction call**, pinned by
  `test/sector-visual-profiles.test.mjs`. All ten items are executable without resolving it.
- A fix would require reducing any quality axis. Report the tradeoff; do not take it.
- G0-3 cannot be repaired and no acceptable review substitute exists — record
  `blocked:image-generation-capability` rather than lowering the brief.
- An exact path you need has a live writer. Take the next disjoint item.

## DEFINITION OF DONE PER ITEM

1. Written fiction entry with real specificity.
2. Concept art matching it.
3. Built asset matching the concept.
4. An adversarial reviewer compared it against professional references and stopped finding
   substantive faults.
5. Target-profile p95 ≤16.7 ms and p99/hitch protections hold in a matched same-session run; any
   applicable 16.80 ms Intel-iGPU route guardrail is reported separately.
6. Checks pass; fiction, concept, and provenance are committed.

Report honestly: what changed, what passed, what route was observed, what performance profile was
measured, what remains unproven, and what you deliberately excluded. "Tests pass" is not a substitute
for those facts, and a screenshot is not a substitute for simulation truth.
