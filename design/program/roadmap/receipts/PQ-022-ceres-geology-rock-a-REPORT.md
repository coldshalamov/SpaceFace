<!-- PROGRAM_EVIDENCE_RECEIPT
packetId: PQ-022
leafId: PQ-022.ceres-geology-rock-a
acceptance: focused_green
disposition: PASS
candidateCommit: 2035bfc454653e414c61a93e23cb3dbd4490e752
-->

# PQ-022 leaf — `place_asteroid_rock_a` source provenance repair

```yaml
parent: PQ-022
leafId: PQ-022.ceres-geology-rock-a
documentKind: leaf_receipt
baseCommit: 6b56f05ec1d24ea2d8f1d861fac079a1a1b17e33
branch: claude/pq022-rock-a-provenance-20260728
gate: npm run check:graphics:asset-receipts
gateResult: RED -> GREEN
assetMutations: 1 (live source GLB restored to its recorded bytes)
manifestMutations: 0
gameplaySourceMutations: 0
blenderUsed: false
visualReAuthoring: none
```

**This leaf makes the record true, not the rock prettier.** It repairs a broken
source→release provenance chain. It performs no re-authoring, opens no Blender, and
changes no geometry or texture. The separate question of whether `place_asteroid_rock_a`
*looks* good enough is untouched and remains owned by the art census lane — see §7.

---

## 1. Verdict

**The recorded 1,970,132-byte source is TRUE.** The 9,118,128-byte artifact that had
overwritten the live source path was an unaccepted work-in-progress remaster iteration
that was never released, never recorded in any catalogue, and is structurally
non-promotable.

The repair was therefore a restore, and — the finding with the longest half-life —
**it required zero manifest writes**. Both `parts_manifest.json` and
`release_manifest.json` already described the true artifact correctly. Only the working
tree lied. The asset-manifest mutex was never taken.

---

## 2. Forensic evidence

### 2.1 The four artifacts on disk at `6b56f05e`

| Role | Path | Bytes | sha256 (16) | Matches record |
|---|---|---:|---|---|
| live source | `assets/ships/parts/places/place_asteroid_rock_a.glb` | 9,118,128 | `FD08251EC0CAD733` | **NO** |
| family source | `assets/ships/m4_helios_hub/source/places/helios_rock_a.glb` | 1,970,132 | `E99971402AB9A4A7` | yes |
| release candidate | `assets/ships/m4_helios_hub/release_candidates/places/helios_rock_a.glb` | 2,842,200 | `05D8ED9C2770DF65` | yes |
| release (live) | `assets/ships/release/parts/places/place_asteroid_rock_a.glb` | 2,842,200 | `05D8ED9C2770DF65` | yes |

**Only one of the four had drifted.** The scoping report described the defect as "the
on-disk source is a different artifact"; the sharper truth is that there are *two*
on-disk copies of the source and **only the live one drifted**. The recorded source was
never lost — it sat intact at the family-source path the entire time.

### 2.2 Which source produced the bound release — proven by lineage, not by re-running

Three independent proofs, all pointing the same way:

1. **Byte-identical promotion candidate.** The live release artifact
   (2,842,200 / `05D8ED9C…`) is byte-for-byte identical to the m4_helios_hub *promotion
   candidate* `assets/ships/m4_helios_hub/release_candidates/places/helios_rock_a.glb`.
   The release therefore provably descends from the m4_helios_hub chain, whose source is
   the 1,970,132-byte file.
2. **The closure receipt's metrics block matches one file field-for-field.**
   `helios_rock_a_build_summary.json → receiptClosure.metrics` records
   `{triangles: 1977, lod0: 1238, lod1: 518, lod2: 221, materials: 2, textures: 6}`.
   Measured from the two candidates:

   | Metric | recorded | 1.97 MB candidate | 9.1 MB candidate |
   |---|---:|---:|---:|
   | triangles | 1977 | **1977** | 83,200 |
   | LOD0 / LOD1 / LOD2 | 1238 / 518 / 221 | **1238 / 518 / 221** | 83,200 / 0 / 0 |
   | materials | 2 | **2** | 1 |
   | textures | 6 | **6** | 3 |
   | `COLLISION_HULL` node | required | **present** | absent |
   | `SOCKET_Structure_Core` | required | **present** | absent |
   | `spacefaceAsset` extras | required | **present** | absent |

   The recorded metrics match the 1.97 MB file on every field and the 9.1 MB file on none.
3. **The historical blob still exists and is byte-identical to the family source.**
   `850c80f3:assets/ships/parts/places/place_asteroid_rock_a.glb` is blob `83cb5958`,
   1,970,132 bytes, sha256 `e9997140…` — identical to the on-disk family source and to
   what both manifests record.

**The rebuild-tool comparison the packet asked for was deliberately not run.** Both
`scripts/build-place-release-assets.mjs` and `scripts/patch-single-release-place.mjs`
publish to live paths, and the latter rewrites `release_manifest.json` in place. Their
KTX2/meshopt encoders are not bit-reproducible across versions, so a hash mismatch from a
re-run would have proven nothing, while a run could have mutated the one artifact that
currently binds correctly. The byte-identical promotion candidate is a *stronger* lineage
proof than a re-run, obtained at zero risk.

### 2.3 How the live source came to be wrong

Not an uncommitted or orphaned iteration — four **committed** art-lane commits:

| Commit | Date | Live source bytes | Subject / self-declared state |
|---|---|---:|---|
| `850c80f3` | 07-14 | 1,970,132 | last good state; matches both manifests |
| `d2df9994` | 07-24 | → 474,932 | "remaster weak place GLBs" — *"Production state remains surfaced_candidate pending bakes, LODs, runtime promote, and independent G7 review"* |
| `af287fc6` | 07-24 | → 3,058,940 | "replace kitbash remasters with real form and map proof" |
| `d17cc678` | 07-24 | → 3,216,828 | "dense wreckage and geology remasters" — *"leave production state at surfaced_candidate (G5-G7 open)"* |
| `ede16953` | 07-25 | → 9,118,128 | "checkpoint completed place remasters" |

**None of the four touched any manifest.** `ede16953` rebuilt the *release* artifacts for
`place_debris_chunk` and `place_dock_interior` but not for the three rocks.

### 2.4 The control group — what a finished remaster looks like

Commit `0f1e6001` ("finish opening place remaster") completed the same work for the
sibling assets: rebuilt sources, rebuilt releases, updated **both** manifests, and
re-pointed `authoring.json` to the new authoring lineage. Current binding state:

| Asset | source hash binds | release hash binds | `parts_manifest.bytes` |
|---|---|---|---|
| `place_debris_chunk` | OK | OK | OK |
| `place_dead_hulk` | OK | OK | OK |
| `place_dock_interior` | OK | OK | OK |
| `place_asteroid_seamed` | OK | OK | OK |
| `place_asteroid_rock_a` | **NO** | OK | **NO** |
| `place_asteroid_rock_b` | **NO** | OK | **NO** |
| `place_asteroid_rock_c` | **NO** | OK | **NO** |

The rocks are the only members of the batch left mid-flight. That asymmetry is the
strongest circumstantial evidence that the 9.1 MB artifact was an unfinished iteration
rather than an accepted deliverable — and the structural facts in §2.2 (single LOD, no
collision hull, no socket, 83,200 triangles against a recorded `triBudget` of 3,500)
confirm it independently. `test/visual-asset-remaster-sources.test.mjs` reinforces the
same reading: it *forbids* the rock remaster's `gate_summary.production_state` from being
`accepted` and requires a non-empty `p1_remaining` while G5–G7 stay open.

---

## 3. The repair

One file changed, restored from the recorded historical blob:

```
git cat-file blob 850c80f3:assets/ships/parts/places/place_asteroid_rock_a.glb \
  > assets/ships/parts/places/place_asteroid_rock_a.glb
```

Verified three ways after writing (the hash check is mandatory, not ceremonial — a binary
restored through a filtering path would still look plausible, and this worktree is subject
to the known CRLF trap):

- sha256 = `e99971402ab9a4a7335dbbfa44c582a9596357225bd3336a2914b192677defda` — matches both manifest rows
- byte length 1,970,132 — matches both manifest rows
- `cmp` against `assets/ships/m4_helios_hub/source/places/helios_rock_a.glb` — **identical**

**No manifest was written.** No `*_iter_orphaned.glb` sibling was created either: an
unmanifested 9.1 MB binary is exactly what `check:asset-reachability` exists to catch. The
superseded iteration remains fully recoverable at

```
ede16953:assets/ships/parts/places/place_asteroid_rock_a.glb   (9,118,128 bytes, fd08251e…)
```

`assets/ships/parts/blender/place_asteroid_rock_a_authored.blend` (the art lane's WIP
authoring blend) was left in place untouched — `authoring.json` does not reference it and
reachability is green with it present.

### 3.1 Allowlist

Both `place_asteroid_rock_a` entries were removed from
`scripts/lib/pq022CorridorExpectedGaps.json`. This was forced, not optional: the gate
fails on allowlisted gaps that no longer reproduce. They were recorded under a new
`closedGaps` block rather than deleted outright, so the allowlist retains the resolution
evidence instead of losing it silently. The 15/15 contract tests accept the added key.

---

## 4. Gates, before and after

| Gate | Before (`6b56f05e`) | After (`2035bfc4`) |
|---|---|---|
| `check:graphics:asset-receipts` | **RED** — `Rock A live source bytes: actual 9118128 / expected 1970132` | **GREEN** — "Graphics asset receipt closure: PASS" |
| `check:pq022:corridor-assets` | PASS — 67/72 binding, 11 gaps | **PASS — 68/72 binding, 9 gaps, none stale** |
| `test/pq022-corridor-asset-set-contract.test.mjs` | 15/15 | 15/15 |
| `check:asset-reachability` | PASS | PASS |
| `check:authored-place-runtime` | PASS | PASS |
| `check:asset-classifications` | PASS | PASS |
| `check:asset-pipeline-contract` | — | PASS |
| `check:opening-place-remaster` | — | PASS |
| `check:assets:live` | — | PASS |
| `check:visual-stability` | — | PASS |
| `check:sim:compare` | — | **ok, `hashEqual: true`, `firstDivergentTick: null`** |
| geology/admission/material/prospector test set (74) | 73 pass / 1 fail | 73 pass / 1 fail (**same** failure) |
| `node scripts/check-m4-helios-hub-v6.mjs` | FAIL (8 errors) | FAIL (8 errors, **unchanged**) |

**Pre-existing reds, proven not mine.**
- The single test failure is `test/prospector-ladder.test.mjs:346` — *"missing
  `.campaign/CAREER-PROSPECTOR-LADDER-GROK-001/prompt.md`"*, a sparse-worktree artifact.
  Identical before and after.
- `check-m4-helios-hub-v6.mjs` reports all **eight** of its sources missing
  (`helios_hub_station`, `helios_gate`, `helios_rock_a/b/c`, `helios_support_gantry`,
  `helios_support_dock_arm`, `helios_nav_spire`) — it points at an `m4_helios_hub_v6`
  family directory that does not exist. A whole-family staleness, not a rock_a defect,
  and unchanged by this leaf.
- Inherited reds named in the packet brief and not touched here:
  `check:economy:anti-exploit`, `check:mission-cargo-loading`, `check:one-voice`,
  `check:art` (its `check:graphics:asset-receipts` link is now green; its other links
  were not run in full), `check:runtime-assets`.

### 4.1 `check:baseline` — content green, wall budget red under contention

Run 1: **10/10 links green**, 102,564 ms wall against a 90,000 ms budget → exit red on
budget alone. Run 2, on a byte-identical tree: **9/10**, with `check:massline` reporting
`check:47a:physical-branches` **TIMED OUT** at 150,644 ms — the runner itself prints
*"A timeout is a contention/environment signal, NOT a failed assertion… killed before it
wrote anything — no assertion was reported."*

Two runs on an identical tree produced different results, with `check:sim` inflating
44,941 ms → 99,112 ms and `check:sim:v3` 45,366 ms → 100,602 ms between them. This is
precisely the contention mode `NOW.md` documents ("a perf sample taken while anything
else runs is not a measurement"; `check:sim` measured 8,227 ms → 14,942 ms at x4). Nine
lanes were live on this machine. **No assertion failed in either run**, and the total diff
for this leaf is one binary restore plus one JSON edit, neither in any simulation path.
The honest reading is 10/10 content-green with an environmental wall-budget red.

Note for the controller: `check:baseline` now has **ten** links, not the nine `NOW.md`
line 41 records — `pq020-ceres-topology` was added by another lane. The 90 s budget was
calibrated against the nine-link set.

---

## 5. Diff scope

```text
assets/ships/parts/places/place_asteroid_rock_a.glb   Bin 9118128 -> 1970132 bytes
scripts/lib/pq022CorridorExpectedGaps.json            23 +++++-------------
```

Two files. No manifest, no gameplay source, no release artifact, no Blender file.

| Commit | Subject |
|---|---|
| `09ac4ef48dc2ead5c7a065639926d35c94d85144` | `fix(assets): restore recorded place_asteroid_rock_a live source` |
| `2035bfc454653e414c61a93e23cb3dbd4490e752` | `chore(pq022): close the rock_a provenance gaps in the corridor allowlist` |

---

## 6. Two honest reservations

**6.1 Dev-mode visuals do change — toward the shipped artifact.**
`partsLibrary.js` resolves `PART_ROOT` (`assets/ships/parts/`) in dev asset mode and
`PART_RELEASE_ROOT` (`assets/ships/release/parts/`) in release mode. Runtime admission
(`hasExplicitAuthoredGeologyPresentation`) is an entity-data predicate, not a GLB
structural gate, so the 9.1 MB WIP blob *was* loading and rendering in dev mode. Since
`ede16953`, dev and release have been showing **two different rocks**. This restore ends
that split by returning dev to the artifact that matches the shipped release. The shipped
release artifact is byte-unchanged, so nothing a release-mode player sees moved at all.
This is a convergence, not a regression — but it should not be described as "no visual
effect whatsoever".

**6.2 This closes one of the scoping report's two HARD rows for rock_a, not both.**
`PQ-022-gold-corridor-required-assets-SCOPING.md` §3 lists two hard issues against this
asset: *source provenance broken* and *awaiting re-authoring*. **Only the first is closed
here.** The asset's `acceptanceStatus` remains `awaiting-re-authoring`, and PASS on this
leaf must not be read as "rock_a is milestone-clear".

---

## 7. What remains open, and who owns it

- **Visual re-authoring of `place_asteroid_rock_a` is a separate future decision owned by
  the art census lane.** This leaf deliberately did not judge whether the 1,977-triangle
  rock reads well at game camera. It restored provenance truth. If the lane later decides
  the rock needs re-authoring, the correct path is the one commit `0f1e6001` already
  demonstrates for the siblings: re-author, rebuild the source, rebuild the release with
  `scripts/build-place-release-assets.mjs`, update **both** manifests, re-point
  `authoring.json`, and refresh the closure receipt — all four steps, or the chain breaks
  again exactly as it did here. The 9.1 MB iteration is preserved at `ede16953` if it is
  worth resuming.
- **`place_asteroid_rock_b` and `place_asteroid_rock_c` have the identical defect and are
  unrepaired**: on-disk 5,127,596 vs recorded 1,867,224, and 5,126,004 vs recorded
  2,814,260. Both are **off-corridor** (they bind to `ast_icy` / `ast_crystalline`, which
  no corridor sector declares) and therefore out of this leaf's scope and absent from the
  PQ-022 required set. The same one-line restore is available for each whenever a lane
  owns them. They are not in the expected-gaps allowlist because they are not in the
  required set — that is correct, not an omission.
- **`NOW.md` line 24 is factually wrong and could not be corrected here** (NOW.md is
  outside this leaf's write set). It states `place_asteroid_rock_a/b/c` are *"Untouched
  since 2026-07-11"* and the owning lane is *"not yet started"*. Git contradicts both:
  `d2df9994`, `af287fc6`, `d17cc678` (2026-07-24) and `ede16953` (2026-07-25) all rewrote
  those source GLBs. That stale line is very likely why the drift went unnoticed for four
  days. The controller should correct it.
- **Not run under the PQ-034 lease:** no broker execution, no Electron, no headed capture,
  no performance measurement. `acceptance: focused_green` claims structural/headless
  proofs only; no independent visual verdict is claimed for this asset.
