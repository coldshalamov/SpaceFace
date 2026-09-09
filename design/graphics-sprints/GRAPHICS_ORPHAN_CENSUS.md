<!-- LIFETIME: DURABLE -->
# Graphics evidence census — historical plans, candidate sources, stale claims

```yaml
captured: 2026-08-09
baselineCommit: f66f6768
reconciledThrough: 9772dfbd
method: literal source-reference screen, git history, generated catalog, and LIFETIME marker sweep
```

This file preserves a graphics salvage and authority census captured on 2026-08-09. It identifies
candidate work that lacked a literal source reference at that snapshot; that screen alone does not
prove absence from manifests, bundles, dynamic routes, or current runtime selection.

It is durable evidence, not current routing. It declares nothing visually accepted, grants no lease,
and does not supersede `docs/visual-assets/VISUAL_ASSET_PRODUCTION_STANDARD.md` for acceptance. A
current worker must refresh the named probes, manifests, catalog, NOW/status/diffs, and exact live
writers rather than trusting a captured disposition.

Companion documents:

- `design/program/EXPANSION_PROGRAM.md` — the standing graphics brief (durable; this census exists
  because nothing routed to it at the captured baseline).
- `design/graphics-sprints/TOP10_ROI_ASSET_PLAN.md` — the measured research ranking built from these
  findings; it does not dispatch work.
- `design/graphics-sprints/VISUAL_ASSET_CATALOG.md` — the generated release census; regenerate it
  with `tools/art/build_visual_asset_catalog.mjs --check` instead of copying a timeless row count.

---

## 0. The finding that produced this file

`design/program/EXPANSION_PROGRAM.md` is marked `LIFETIME: DURABLE`, states the exact goal
("A-list 2026 parity in graphics, animation, VFX, variety and world density"), and encodes the
research → worldbuild → concept → build → adversarial-review loop in §2.

**Nothing routed to it at the captured baseline.** At `f66f6768`, a repository-wide grep for
`EXPANSION_PROGRAM` returned two
hits: `design/program/NOW.md` (volatile, and see §1) and a gitignored `.devshots/` scratch file. It
was absent from `CANONICAL_BUILD_MAP.md`, the repository's declared implementation front door.

An agent following the documented entry path could not find the graphics brief. That is the root
cause of most of what follows: work restarted from dated sprint prompts instead of continuing the
standing plan. **Fixed in this pass** — `CANONICAL_BUILD_MAP.md` §1 now carries a
"Graphics / expansion program" route.

---

## 1. Historical `NOW.md` expiry finding

| Field | Declared | Actual at `f66f6768` |
|---|---|---|
| `baseCommit` | `b5e4f2fe` (2026-08-05) | HEAD is 2026-08-09 |
| `expiresAfterCommits` | 25 | **≥305 commits elapsed** |
| `expiresAfterDays` | 7 | 4 days (within) |

Two methods disagree slightly and neither changes the conclusion: `git rev-list --count
b5e4f2fe..HEAD` returns **305**, while `node scripts/check-program-docs.mjs` reports **"stale by 307
commits"**. Quote the checker's number when citing the failing gate.

It is **>12x past its commit expiry** and self-contradicts: row 82 says "the only active writer is the
`claude-graphics` modern-parity lane" while row 69 marks that lane RELEASED, and row 72 reads
"ACTIVE WRITER — holds `blender`" and "COMPLETE AND RELEASED" in the same cell.

**Consequence at capture:** the board alone could not answer "what is being altered?" The three
lanes live in that snapshot's last 30 commits were absent from it entirely:

| Live lane | Evidence | Touches |
|---|---|---|
| Ceres content/law | `f66f6768`, `fc5e54a0`, `446e4e06`, `f050670b`, `5a67a236`, `be47da74` | `src/systems/**`, Ceres job/law seams |
| VFX NEXT reference library | `7933bbde`, `e776bf11` | `src/vfxnext/**`, `_vfxlab.html` |
| Performance rescue | `39f2841f`, `216099e9`, `36fec14b`, `3ae3fce3`, `a0e9cd9a`, `3841f1f1`, `4b568d45`, `1eb4fd9b` | `design/PERF_RESCUE_LEDGER.md`, render/UI hot paths |

**None of those three was authored-asset surfacing.** That is a historical statement, not current
ownership; receiver-facility Blender/GLB/evidence work was live at the `9772dfbd` reconciliation.

Before claiming any lease, refresh `NOW.md`, Git status and diffs, refs, and demonstrably live exact
writers. Treat the counts and lane list above as archaeology.

---

## 2. Abandoned plan documents

At the `f66f6768` baseline, `design/graphics-sprints/` held 25 markdown files and **23 carried no
`LIFETIME:` marker**. This pass adds four research/audit documents, bringing the folder to 29. Most
of the baseline documents froze on 2026-07-14 or 2026-07-29.

Classification below is by last commit date, `LIFETIME` marker, and whether the document's claims
survive the twelve-experiment result in `EXPANSION_PROGRAM.md` §1.

### 2a. Durable, stable, and generated references — refresh live facts before use

| Document | Last commit | Role |
|---|---|---|
| `CAMERA_VISIBLE_BUBBLE.md` | 2026-08-08 | `DURABLE`. Visible ground-plane depth is 93–125 WU normally and about 145–164 WU when physics-earned; the old lateral-strip figure is invalid. **Load-bearing for any density or ROI decision.** Read it rather than quoting it secondhand. |
| `VISUAL_ASSET_CATALOG.md` | 2026-08-08 | `GENERATED` release census; regenerate and run `--check` rather than copying its current row count. |
| `RESEARCH_work_signatures.md` | 2026-08-05 | `DURABLE`. Fiction research substrate. |
| `MODERN_PARITY_LOOP.md` | 2026-08-05 | The twelve-experiment table and EVE control. Do not repeat the same tested settings, scene, and scorer unchanged; other hypotheses remain open. |
| `PERF_AUDIT_VALIDATION.md` | 2026-08-05 | Method for the parity harness. |
| `VISUAL_ITERATION_PROTOCOL.md` | 2026-07-29 | Still cited as mandatory by `src/render/AGENTS.md` and `docs/visual-assets/README.md`. Keep. |
| `LONG_TERM_GRAPHICS_OVERHAUL.md` | 2026-07-19 | `DURABLE` architecture/evidence reference only; its old build order and acceptance language is non-authoritative. |
| `ASSET_PRODUCTION_LEDGER.md` | 2026-08-04 | `DURABLE` PQ-022/PQ-023 family subdivision and evidence only; it cannot dispatch or accept. |
| `README.md`, `INTEGRATION_GATE.md` | 2026-07-29 | `STABLE` folder routing and integration checks; neither replaces the program queue or visual-asset acceptance standard. |

### 2b. Superseded by `EXPANSION_PROGRAM.md` — do not enter through these

These predate the twelve-experiment result and route agents into work it disproved, or into thread
structures whose lanes closed. They are archaeology with real technical content.

| Document | Last commit | Why superseded |
|---|---|---|
| `TOP50_WONDER_BUILD_PLAN.md` | 2026-07-29 | Priority order predates the "rocks read as rock, the ship reads as plastic" finding and the visible-bubble measurement. Its ranking is not exposure-weighted. |
| `FULL_GRAPHICS_REVAMP_GOAL.md` | 2026-07-29 | Coverage bar folded into `EXPANSION_PROGRAM.md` §8. |
| `GOAL_FULL_PROFESSIONAL_GRAPHICS_REVAMP.md` | 2026-07-14 | README already calls it "historical correction/evidence… not an active acceptance contract". |
| `THREAD_A_KIT_QUALITY.md` … `THREAD_E_WHOLESHIP_REPAIR.md` | 2026-07-14/29 | Five-lane concurrency structure. Those lanes are all released; the README already says the kit "coordinates named concurrent threads **only when a user/lead launches them**". |
| `00_ORCHESTRATION.md`, `BLENDER_EXCLUSIVE_LOCK.md`, `GOAL_PROMPTS.md`, `HANDOFF_TEMPLATE.md`, `QUALITY_RITUAL.md` | 2026-07-14/29 | Process scaffolding for the thread structure above. |
| `CLI_ASSET_FOUNDRY_EXECUTION_PLAN.md` | 2026-07-29 | Six-checkpoint CLI pipeline. **Partially salvageable** — see §5, the codex generator gate. |
| `TOP_FIVE_MATERIAL_TRUTH_PLAN.md` | 2026-07-29 | Its five items are still correct and appear in the ROI plan; the surrounding sequencing is stale. |
| `ROI_PLAN_CLAIM_AUDIT.md` | 2026-08-09 | Historical claim-review evidence; rerun its probes before relying on any captured result. |

### 2c. Marker pass — reconciled

All **29** files in `design/graphics-sprints/` carry a `LIFETIME:` marker; 23 baseline files
previously had none. The generator now emits `LIFETIME: GENERATED` for
`VISUAL_ASSET_CATALOG.md`, and the deterministic catalog test pins that first-line marker.

- **16 marked `HISTORICAL`** — superseded roadmaps, all five `THREAD_*` briefs, process scaffolds, the
  old top-five material-truth execution plan, and the claim audit. They cannot dispatch work.
- **7 marked `DURABLE`** — long-lived architecture, research, evidence, or rationale only: camera
  framing, work signatures, the parity experiment record, performance-audit validation, the
  PQ-022/PQ-023 evidence ledger, the long-term architecture reference, and this census.
- **3 marked `STABLE`** — the folder README, integration checks, and visual-iteration protocol.
- **2 marked `VOLATILE`** — the ROI ranking and draft one-leaf prompt.
- **1 marked `GENERATED`** — `VISUAL_ASSET_CATALOG.md`, owned by its generator and check.

**Lifetime consistency resolved in this pass.** `CANONICAL_BUILD_MAP.md` §9 and
`docs/POLICY_MANIFEST.md` now define `DURABLE` consistently for long-lived research, evidence, and
rationale that may inform planning but cannot lease, dispatch, accept, or prioritize work.

---

## 3. Candidate assets with no literal source reference at capture

Each row was screened by grepping `src/**` for the identifier. An empty result proves only that no
literal source reference was present in the captured tree; manifests, bundles, generated maps,
dynamic selectors, and live route reachability require their owning validators.

| Orphan | Size | Probe result | Disposition |
|---|---|---|---|
| `src/vfxnext/**` | 12 effect families + `_vfxlab.html` | No import outside itself at capture | **By design at capture** — isolated reference library that deliberately dodged the reachability ratchet. Recheck current imports, bundle entrypoints, and promotion ownership before acting. |
| `assets/incubator/everyday_space_kit/**` | 46 GLBs, 6 families | No literal `src/` reference | Source-only donors. Independent review is controlling and rejects promotion: 19 assets REVISE-first, flat/double-sided materials, no authored LODs. |
| `assets/incubator/npc_activity_pack/**` | 15 GLBs, 12 families | No literal `src/` reference | Source-only donors. Review verdict: primitive blockout forms, flat materials, 8 scale deltas, no LODs. |
| `assets/incubator/wreck_aftermath_pack/**` | 3 of 6 hero hulls + kits | No literal `src/` reference | Tracked source-only evidence landed in `7039ea1c`; publication did not promote it to runtime. |
| `assets/ships/foundry/spacepunk_markings_v1/**` | 32-cell paint/emissive atlas, 13 emissive | No literal `src/` reference | Focused-green, mip gutters and 64px survival verified. No runtime wiring was demonstrated by this screen. **Not a standalone item** — it is a candidate input to ROI item 3 (Kestrel hull surfacing); check current manifests and selectors before authoring new texture content. |
| `design/incubator/microevent_library/**` | 58 validated ambient events | No literal `src/` reference | Data-only at capture. `INTEGRATION.md` names the one runner the wiring needs. |
| `.devshots/**` ORM-breakup candidates | 20 assets | Gitignored | **Withdrawn, not merely unpromoted** — see §4. |

**Pattern worth naming:** each captured lane produced source or evidence without demonstrating a live
selector through this census. That suggests a promotion bottleneck, but current reachability must be
decided by the owning manifest, bundle, catalog, and route validators—not this literal grep.

---

## 4. Stale claims still carried in live code and docs

These are worse than orphans: they are assertions a reader will act on that the repository has
already contradicted.

### 4a. The "twenty assets at stdev exactly zero" headline is withdrawn but still in the source

`src/render/authoredMaterialProfiles.js:27-33` states that a Blender audit found twenty shipped
assets whose ORM green channel has "a standard deviation of EXACTLY ZERO."

`NOW.md` row 69 and `EXPANSION_PROGRAM.md` §5 both record that this headline was **withdrawn**: the
audit identified ORM maps by *filename*, which counted normal maps as ORMs (`n-ORM-al` contains
"orm") and missed real ones (`engine_ion_small`'s ORM is `engine_ion_small_wear_mask_1k`, true stdev
**0.2011**, reported as 0). Both `gfx_asset_audit.py` and `gfx_orm_breakup.py` were repaired to read
the Principled BSDF material graph.

**The re-audit was never run.** The corrected tools exist at `tools/blender/gfx_asset_audit.py`; no
output supersedes the withdrawn numbers.

*Consequence:* the near-constant-roughness diagnosis is probably still directionally right — the
independent reviewer's "reads mostly as one matte gray material" is independent evidence — but the
specific figure is not usable and the *set* of twenty assets is not trustworthy for targeting. Re-run
before prioritising on it. This is a sub-hour task and it gates honest ROI ranking.

### 4b. Two nebula layers are still baked, sampled, and multiplied by zero

`EXPANSION_PROGRAM.md` §6 cites this as the model example of finding waste instead of cutting
quality. **It is still live at `f66f6768`:**

```
src/data/sectorVisualProfiles.js:61,112,140,173,216   nebulaOpacity: 0.0   (all five profiles)
```

Every per-sector `l1Alpha` is authored and inert — `core` 0.28, `belt` 0.48, `anomaly` 0.55 — because
`nebulaOpacity: 0.0` drives the composite alphas to exactly zero. Recorded cost: **32.2 MB of baked
texture and a 14.6 ms bake**, contributing no pixels.

**Do not "fix" this by raising the dial.** The prior lane measured that and it was disconfirmed: L1
is authored as dark dust and `mix()` *replaces* L0 with it, so the frame gets darker (73.4% → 76.8%
dead). The two honest options are (a) delete the dead bake and reclaim the memory, or (b) re-author
L1/L2 as content worth showing. They need different decisions and (b) collides with the owner
decision in §6.

### 4c. `src/render/lod.js` claims the Kestrel is LOD0-only — RESOLVED, the comment is stale

`lod.js:10` states: "The Kestrel ships LOD0-only for now… the §20 roadmap defers LOD1/LOD2 geometry
until camera evidence shows population pressure."

**That is no longer true.** Verified at `f66f6768`:

- `src/render/partsLibrary.js:874-877` maps `ship_kestrel` to `lod0`/`lod1`/`lod2` GLBs, and
  `881-882` does the same for the production Wasp.
- `wholeship_kestrel_lod1` / `lod2` and both release paths are present in
  `assets/ships/release/release_manifest.json`.
- A shared hysteresis resolver runs at `partsLibrary.js:3592`, and `hlod.js:59` drives `lod2`.
- `partsLibrary.js:504` records that the seven class-authored hull GLBs each carry LOD0/LOD1/LOD2.

So whole-ship LOD coverage is **materially better than the `lod.js` header claims**. Fix the comment;
do not plan LOD authoring for the Kestrel on the basis of it. The genuine remaining LOD gaps are
`place_asteroid_rock_b`/`rock_c` (§4d), which have no chain at all.

### 4d. `place_asteroid_rock_b` / `rock_c` are unaccepted WIP overwrites, still live

Recorded in `NOW.md` row 30 and re-confirmed by the 2026-08-05 headless audit:

| | `rock_a` (repaired) | `rock_b` / `rock_c` (live, defective) |
|---|---:|---:|
| Triangles | 1,977 | **83,200** |
| LOD chain | 3 levels | **none** |
| Texture | 1024² | 256² |
| Mesh | authored | single `Icosphere` |

Their material is literally named `LOD0_RockA_Mat`, corroborating the recorded live-source-overwrite.
`rock_a` was proven and restored; `rock_b`/`rock_c` still carry the defect. **42x the triangles at a
quarter of the texture resolution with no LOD** — simultaneously the worst-performing and
worst-looking rocks in the game, and `NOW.md` records the same one-line restore is available with WIP
recoverable at `ede16953`.

### 4e. One refuted claim that must not be reintroduced

`NOW.md` row 69 asserts the IBL is inert because "the PMREM bake is of an ~84%-black scene so there
is no energy to reflect." `EXPANSION_PROGRAM.md` §5 **refutes this by reading the function**:
`createSpaceReflectionEnvironment` builds a studio rig with emissive cards at radiance 4.2 / 2.4 /
1.15. The environment is not black. Do not rebuild a causal chain on the retracted version.

Note also that `SECTOR_POST_TOE = 0.020` is live (`renderer.js:188`), so the 84%-dead-black frame
those rows describe is **already fixed**. Any plan still treating dead-black as the headline defect
is working from a superseded frame.

---

## 5. The requested workflow has a recorded-broken first step

The intended loop — generate reference/concept images with the codex CLI, review and reject until the
target is right, then model against it — is `EXPANSION_PROGRAM.md` §2 steps 3 and 5, and
`docs/visual-assets/AGENT_PROMPTS.md` § E defines the bounded terminal handoff.

At the captured baseline, `NOW.md` row 72 recorded that it **did not run** in that environment:

- the installed codex CLI answers "requires a newer version of Codex";
- its model refresh fails on an unknown reasoning-effort variant;
- `~/.codex/config.toml` carries an invalid `service_tier = "default"` that aborts config load
  **before any CLI override applies**, so `-c` flags cannot work around it.

The prior lane confirmed this from an isolated `CODEX_HOME`, did **not** edit the user's global
config, and substituted grok as reviewer.

**Any plan that depends on this loop must open by re-verifying the current CLI.** If it cannot be
repaired, `docs/visual-assets/README.md` already defines the disposition: use the bounded Codex
terminal handoff in `AGENT_PROMPTS.md` § E, or record `blocked:image-generation-capability` — and
explicitly **do not silently lower the brief**. Substituting a weaker reviewer without recording the
substitution is how a review step becomes a rubber stamp.

---

## 6. One decision that belongs to the project owner, not an agent

`NOW.md` row 69 records that the prior lane deliberately did not resolve this, and it is still open.

**The conflict:** `src/data/sectorVisualProfiles.js` encodes a "true blacks / no full-screen wash"
art doctrine, pinned by `test/sector-visual-profiles.test.mjs`. The modern-reference bar measured
against it: our benchmark frame was 83.7% dead black at 1920x1080 where valid deep-space references
sit at 0.7–12.7%, median pixel luma 0.004 vs 0.207–0.251.

**What has changed since:** the `uToe = 0.020` post-stack lift is live and took dead-black 84.6% →
0.2% at unchanged p95 16.80 ms, without touching `nebulaOpacity`, `l1Alpha`, `l2Alpha`, or
`lighting.ambient`. The acute symptom is gone.

**What remains for the owner:** whether the deep field should carry *authored content* (structure,
dust, distant light) or stay a true-black void. That is an art-direction call with real consequences
— it decides whether §4b's dead bake is deleted or revived, and it is the difference between a frame
that is technically not-black and one that is *full*.

Note the measurement caveat from `EXPANSION_PROGRAM.md` §5: "dead black %" is gameable by a global
offset — a flat +0.02 luma lift moves it 84% → 0.2% while adding nothing. Any future argument here
must quote `structFrac` (fraction of 16x16 tiles with luma stdev > 0.01) from
`scripts/gfx-frame-stats.mjs`, not dead-black percentage.

---

## 7. What this census does not cover

Stated so the next reader knows the edges:

- **No GLB-internal census.** Per-mesh materials, UVs, embedded channels, LOD chains, and editable
  source replay are still the deeper VA-001 inspector task. `VISUAL_ASSET_CATALOG.md` says so too.
- **No runtime telemetry.** The catalog's "high-exposure places" counts are *authored static
  references*, not measured screen time. Given the measured 93–165 WU depth bands, reference count is a weak
  proxy for pixel coverage. Nothing here has measured actual on-screen area.
- **No visual acceptance.** Every disposition above is reachability and provenance. `G0-G7` in
  `docs/visual-assets/VISUAL_ASSET_PRODUCTION_STANDARD.md` remains the only acceptance authority.
- **Historical worktree census only.** The capture observed 25 registered worktrees and two protected
  dirty candidates. Re-run `git worktree list` and exact status checks before using that fact.
