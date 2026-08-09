<!-- LIFETIME: HISTORICAL -->
# ROI plan claim audit — what holds, what is stale, what is wrong

```yaml
captured: 2026-08-09
baseCommit: de65b344
method: primary-source verification against the working tree; grep, sha256sum, release_manifest.json
scope: historical review evidence only — no dispatch, lease, current ownership, or acceptance authority
```

Audits [`TOP10_ROI_ASSET_PLAN.md`](./TOP10_ROI_ASSET_PLAN.md) and
[`GRAPHICS_ORPHAN_CENSUS.md`](./GRAPHICS_ORPHAN_CENSUS.md) against the repository. This file
declares nothing accepted and grants no lease. Where a verdict is given, the command or `file:line`
that produced it is named so the next reader can re-run it instead of trusting this page.

**Headline:** the plan's substantive technical content is sound. Every one of the ten ranked items
rests on a premise that verifies. Two citation defects and one arithmetic error are recorded below,
and **none of them reorders the ranking.**

---

## 1. Verdict summary

| # | Claim | Verdict | Evidence |
|---|---|---|---|
| 1 | `rock_b`/`rock_c` are unaccepted overwrites | **HOLDS — stronger than stated** | manifest/disk sha mismatch, §2 |
| 2 | `reaver_pirate` + `corsair_raider` are the same ship | **HOLDS** | `partsLibrary.js:891-892` |
| 3 | `spacepunk_markings_v1` exists without a literal source reference | **HOLDS AT CAPTURE** | 4 files on disk, 0 literal `src/` refs; manifests/bundles/dynamic routes require their own validators |
| 4 | `nebulaOpacity: 0.0` on all five profiles | **HOLDS** | `sectorVisualProfiles.js:61,112,140,173,216` |
| 5 | Ten modular hulls form the NPC kit | **HOLDS** | `partsLibrary.js:509-518` |
| 6 | `src/vfxnext` is 12 families, unreached | **HOLDS** | 12 ids in 6 files; 0 external imports |
| 7 | `EVENT_LIGHT_POOL_SIZE = 6` | **HOLDS** | `vfx.js:148` |
| 8 | Withdrawn ORM figure still live in source | **HOLDS** | `authoredMaterialProfiles.js:27-33` |
| 9 | `lod.js` Kestrel LOD0-only comment is stale | **HOLDS** | `lod.js:10-14` |
| 10 | `SECTOR_POST_TOE = 0.020` is live | **HOLDS** | `renderer.js:188` |
| 11 | All 29 `graphics-sprints/` docs carry a `LIFETIME:` marker | **HOLDS AFTER RECONCILIATION** | generator and deterministic test own the catalog's `GENERATED` marker |
| 12 | Gate tooling exists | **HOLDS** | all three scripts present |
| 13 | **Visible bubble is 45–50 WU** | **STALE — retracted at source** | §3 |
| 14 | **Visible strip is ~120 WU across** | **STALE — source says do not use** | §3 |
| 15 | **107 source-only incubator GLBs** | **WRONG — actual 98** | §4 |
| 16 | Geometry/perf figures (83,200 tris; 32.2 MB; 14.6 ms; p95 16.80) | **UNVERIFIED — measurements** | §5 |
| 17 | `place_debris_chunk` 18 refs / `place_dead_hulk` 15 | **METHOD-DEPENDENT** | §5 |

---

## 2. Item 1 verifies by a better method than the plan uses

The plan argues item 1 from triangle counts. Those are unverified here (§5). But the underlying
claim — *"four art-lane commits overwrote three live sources with unaccepted WIP while touching no
manifest"* — verifies decisively by hash, and this is the stronger proof because it needs no GLB
parser and it demonstrates the exact mechanism.

`assets/ships/release/release_manifest.json` records a `sourceSha256` and `sourceBytes` for each
rock. Compared against the committed working tree:

| asset | manifest bytes | on-disk bytes | sha256 |
|---|---:|---:|---|
| `place_asteroid_rock_a` | 1,970,132 | 1,970,132 | **MATCH** |
| `place_asteroid_rock_b` | 1,867,224 | **5,127,596** | **MISMATCH** |
| `place_asteroid_rock_c` | 2,814,260 | **5,126,004** | **MISMATCH** |

`rock_a` matches its manifest exactly — consistent with the recorded "proven and restored". The
other two do not, and are **2.75x and 1.82x larger on disk than the manifest believes.** The files
are not dirty in the working tree, so the overwrite is *committed* and the manifest was never
updated to match it.

`git log` on `rock_b` returns `ede16953`, `d17cc678`, `af287fc6` — three of the four art-lane
commits the plan names by hash.

Two corroborating records, both independent of the above:

- `design/production/asset-classifications/place_asteroid_rock_b.json` classifies the asset
  `"rejected"` / `"critical_or_major_defect"` / `openCriticalMajorCount: 1`, dated 2026-07-10.
  There is no equivalent file for `rock_a`.
- `VISUAL_ASSET_CATALOG.md` lists only `place_asteroid_rock_a` (line 110). `rock_b` and `rock_c`
  are absent from the 83-row release census entirely.

**Testable prediction this created at capture:** `check:graphics:asset-receipts` — the plan's own
named proof for item 1 — should have been **red** for `rock_b`/`rock_c` on a source-hash comparison.
It was not run in this historical pass; current workers must rerun the owning validator rather than
reuse this prediction as live status.

**One caveat on the plan's own numbers:** no separate `_lod1`/`_lod2` GLBs exist on disk for *any*
of the three rocks, including `rock_a`. So `rock_a`'s claimed "3 levels" must be in-GLB LOD nodes
(its `contractNodeCount` is 7), not sibling files. This does not refute the claim; it means the
restore cannot be validated by looking for missing files.

---

## 3. The camera bubble citation is retracted at its own source

This is the one defect with real operational consequence, and it is a *citation* defect, not a
reasoning defect.

`TOP10_ROI_ASSET_PLAN.md:17-18` states:

> `CAMERA_VISIBLE_BUBBLE.md` measures the camera's visible ground-plane depth at **45–50 world
> units** at rest *and* at cruise, with the strip ~120 WU across.

`CAMERA_VISIBLE_BUBBLE.md` is titled **"R1 visible gameplay bubble: ~93–125 WU normally, ~145–164 WU
when physics-earned"**. Its line 108 states, in bold, that the 45–50 WU figures are

> **no longer current**

The 45–50 WU numbers are from the superseded pre-R1 block (lines 96–108), captured 2026-08-05
against a 72-WU camera base. The R1 reset moved the base to **144 WU** and was measured 2026-08-08.
The deterministic projection recorded by the corrected camera contract:

| state | fwdEdge |
|---|---:|
| idle | 93.25 WU |
| ordinary max thrust | 125.00 WU |
| earned sling (2x) | 144.75 WU |
| exceptional earned sling (3x+) | 164.25 WU |

**The "~120 WU across" figure is worse than stale.** It comes from the same retracted block (line
105), and lines 110–112 state the lateral scan values *"remain invalid"* because points near the
ground-plane horizon produced near-degenerate screen X — the source does not merely supersede that
number, it says it must not be used.

The irony worth recording: `GRAPHICS_ORPHAN_CENSUS.md:89` carries the correct warning about this
exact file — *"Two overclaims inside were retracted after re-measurement; read it rather than
quoting it secondhand"* — and then the census quotes it secondhand anyway at its own line 308.

### What this does and does not change

**Does not reorder the ranking.** Checked per downstream use:

- Plan §1's *"objects at 200–1000 WU are map and radar content"* — **survives.** The new maximum is
  ~165 WU; 200 WU and beyond is still out of frame.
- Tier D's framing — the correction makes Tier D **stronger**, not weaker. More places enter a
  93–165 WU bubble than a 45–50 WU one.
- Tier B (player ship, in frame whenever flying) — unaffected.
- Tier A/C reasoning — does not depend on the figure.

**Does change G0-1 materially.** Anyone building per-asset screen-coverage instrumentation around a
45–50 WU strip will sample and cull wrong. The camera document supplies the authoring contract that
G0-1's representative route must actually cover (lines 74–84):

- **0–95 WU:** always visible, even at rest.
- **95–125 WU:** normal moving-play space.
- **125–165 WU:** speed-revealed, only while `governor.physicsEarned`.
- **beyond ~165 WU:** radar/map content.

Note the document's own caution (lines 91–92): *"Draw ranges and activity counters remain
insufficient evidence"* — which is the same trap as the plan's "a counter must never fail toward
good news", arriving from a different direction.

### Exact lines to correct (not edited in this pass)

| File | Line | Current | Should cite |
|---|---:|---|---|
| `TOP10_ROI_ASSET_PLAN.md` | 18 | "45–50 world units… strip ~120 WU across" | 93–125 WU normal / 145–164 earned; drop the lateral figure |
| `TOP10_ROI_ASSET_PLAN.md` | 203 | Tier D heading "45–50 WU bubble" | 93–165 WU bubble |
| `GRAPHICS_ORPHAN_CENSUS.md` | 308 | "Given the 45–50 WU visible bubble" | same correction |
| `GRAPHICS_ORPHAN_CENSUS.md` | 89 | "Visible ground-plane depth 45–50 WU, strip ~120 WU" | same correction |
| `GOAL_PROMPT_TOP10_OPTIMIZATION.md` | 30 | "visible depth is **45–50 world units**" | same correction |

---

## 4. One arithmetic error

`TOP10_ROI_ASSET_PLAN.md:231` states **"107 source-only GLBs"** across three incubator packs.
Measured:

```
find assets/incubator design/incubator -name '*.glb' | wc -l   ->  98
```

| pack | plan | actual |
|---|---:|---:|
| `everyday_space_kit` | 46 | 46 |
| `npc_activity_pack` | 15 | 15 |
| `wreck_aftermath_pack` | unquantified | **37** |
| **total** | **107** | **98** |

The two quantified packs are exact; the total is over by 9. The wreck pack later landed as tracked
source-only evidence in `7039ea1c`; that publication does not change the 37-GLB count or grant runtime
reachability. Correct the total; the item's argument — that these are source-only, reviewed, and
rejected for wholesale promotion — is unaffected by the difference.

---

## 5. Claims that cannot be settled by a review pass

The plan sets strict measurement doctrine in §4: matched resolution, same-session baseline, quiet
host, *"a counter must never fail toward good news."* By its own rules, the following are
**measurements taken in other sessions under unrecorded conditions**, not static facts, and cannot
be re-verified by reading the repository:

- `rock_b`/`rock_c` at 83,200 triangles, 256² textures, no LOD; `rock_a` at 1,977 / 1024² / 3 LODs.
  *(The manifest drift in §2 corroborates the mechanism but not these specific figures — confirming
  them needs a GLB parse.)*
- 32.2 MB of baked nebula texture and a 14.6 ms bake.
- p95 16.80 ms on the Intel iGPU target.
- The 73.4% → 76.8% dead-black regression from raising `nebulaOpacity`.
- `engine_ion_small` true roughness stdev 0.2011.
- Twelve controlled experiments, nine returning byte-identical scores.
- `place_asteroid_rock` triangle deltas and the Ashline Rig 3,610,796-byte mirror.

Marking these UNVERIFIED is not a challenge to them. It records that they carry a different
epistemic status from the `file:line` facts above, which is exactly the distinction the plan's own
§4 insists on.

**Method-dependent, not wrong:** the plan cites `place_debris_chunk` at 18 references and
`place_dead_hulk` at 15. A raw `grep -rn` across `src/` returns **25** and **21**. These are not the
same measurement — the plan's numbers come from `VISUAL_ASSET_CATALOG.md`'s *authored static
reference* count, mine counts matching source lines. Neither refutes the other, and the plan
already flags reference count as a weak proxy for coverage. Recorded so a later reader does not
"discover" the discrepancy and mistake it for an error.

---

## 6. Incidental findings

- **`hull_*` count.** The plan says ten modular hulls; `authoredMaterialProfiles.js:29` says
  *"all eleven modular hulls"*. The plan is right: `partsLibrary.js:509-518` enumerates exactly ten
  kit hulls (`starter, fighter, miner, freighter, interceptor, corvette, frigate, capital,
  multirole, gunship`). `hull_rack.glb` exists on disk but is not a kit member. A raw glob over
  `assets/**/hull_*.glb` returns 16 and is the wrong method — it is the kit manifest that defines
  membership. The `authoredMaterialProfiles.js` comment is part of the same withdrawn ORM block
  G0-2 already has to correct.
- **Five stray export artifacts.** `hull_{corvette,fighter,freighter,interceptor,miner}_export_tmp.glb`
  sit in `assets/`. Cruft, not a defect.
- **Census bookkeeping is corrected by the integration pass.** The `f66f6768` baseline held 25
  markdown files with 23 unmarked; four research/audit docs bring the folder to 29. Reconciled
  classification is 16 `HISTORICAL`, 7 `DURABLE`, 3 `STABLE`, 2 `VOLATILE`, and 1 `GENERATED`.
  The catalog generator and deterministic test now own its marker.
- **`NOW.md` was stale at capture.** The census records ≥305 commits past a 25-commit expiry at
  `f66f6768`, and this audit measured 310 at `de65b344`. Those values are historical evidence for
  refreshing NOW/status/diffs/live exact writers, not current ownership or worktree counts.
- **The `DURABLE` marker inconsistency is resolved.** `CANONICAL_BUILD_MAP.md` §9 and
  `docs/POLICY_MANIFEST.md` now define it consistently as informative long-lived research, evidence,
  or rationale that cannot lease, dispatch, accept, or prioritize work. This audit is `HISTORICAL`:
  its captured claims can inform a new check but cannot be treated as current repository state.

---

## 7. Convergent pattern: green checks encoding claims the data does not support

Recorded 2026-08-09 after Codex reported two unpublished defects. Not produced by this audit, but it
converges with §2 and is the reason §2's prediction matters.

Three independent findings share one failure mode — **an evidence artifact asserting something the
underlying data contradicts, in the direction that makes a gate pass**:

| Source | Artifact | Asserts | Data says |
|---|---|---|---|
| Codex, `cfc2e74d` | `test/47a.telemetry.v3.expected.json:87,105,110,113` | tick 173, zero motion, `CONTENT_ONLY` | `MOTION_CHANGED`: 14 motion-field deltas, tether break 173→190, thrust 720→648 |
| This audit §2 | `release_manifest.json` `sourceSha256` for `rock_b`/`rock_c` | matches the shipped source | 2.75x / 1.82x byte mismatch on disk |
| Plan §4 (as doctrine) | — | "a counter must never fail toward good news" | — |

The plan already names this failure mode in the abstract. `cfc2e74d` is a concrete instance of it:
a check was *returned to green* by updating expected data that misclassifies what changed. §2's
prediction is a candidate second instance — if `check:graphics:asset-receipts` is green while the
manifest hash and the on-disk file disagree, the check is not comparing what it claims to compare.

**Consequence for the ROI plan:** item 1's named proof (`check:graphics:asset-receipts` green) is
only a valid acceptance signal if that check actually compares source hashes. Verify the check
before trusting it as item 1's gate.

### Note for ROI item 9 (VFX NEXT promotion) — forward hazard, not a current bug

Codex's second finding is a light-cardinality leak in `src/vfxnext/core/stage.js`: four `PointLight`s
are added directly to `scene`, `dispose` removes only root, so dispose/recreate leaks 4 → 8.

Scoped correctly, that is contained inside the isolated library today. But item 9 is *promotion into*
`src/render/vfx.js`, where `EVENT_LIGHT_POOL_SIZE = 6` (`vfx.js:148`) is both the pool ceiling **and a
shader cache key `precompile.js` must match**. A stage that leaks 4 → 8 would cross that ceiling at
promotion time. Fix the leak before item 9 is scheduled, not during it.

Codex's related observation — *"existing baseline/capture does not import/prove vfxnext"* — is the
by-design isolation recorded in the census §3 (`src/vfxnext` deliberately dodges the reachability
ratchet). Worth naming plainly: **the isolation that makes the library safe to land is exactly what
leaves it unproven.** The requested lifecycle/accessibility test is genuinely new coverage, not a
gap someone forgot.

---

## 8. What this audit did not do

- **No source document was edited.** The corrections in §3 and §4 are listed, not applied.
- **No measurement was re-run.** No capture, no `check:baseline`, no GLB parse, no Blender audit.
- **No lease was registered and no asset was touched.**
- **No re-ranking.** The plan's order was audited, not replaced. It survives the corrections.
