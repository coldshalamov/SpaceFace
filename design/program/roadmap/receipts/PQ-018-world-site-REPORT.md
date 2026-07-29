<!-- PROGRAM_EVIDENCE_RECEIPT
packetId: PQ-018
leafId: PQ-018.world-site
acceptance: focused_green
disposition: PASS
candidateCommit: 09417e98feaa95cd17437374f1935cc5d8aea6c5
-->

# PQ-018 leaf — Wreck Cathedral World Site, placement, and five evidence pages

```yaml
packet: PQ-018
leaf: PQ-018.world-site
scope: packet Phase 2 (World Site manifest and story receipts) + Phase 3 placement/identity
baseCommit: aca82bb0
candidateCommit: 09417e98feaa95cd17437374f1935cc5d8aea6c5
integrationCommit: aef540d3
lifecycleClaim: integrated
acceptanceClaim: focused_green
disposition: PASS
review:
  discovery: independent candidate review (fresh context) + controller diff review
  causalRereview: APPROVE
```

## What this leaf claims

The Wreck Cathedral is now a placed, persistent World Site in `sector_ceres_belt` with seven named
components, seven operations, a physical black-box payload settled at the Marker, and five story
evidence pages that are earned causally and survive save/Continue.

**Not claimed:** Browser/Electron route acceptance, visual review at the game camera, and matched
performance. Those remain Phase 4 and are listed as residuals below.

## Provenance — this was a port, not a fresh build

The World Site implementation was taken from `codex/pq018-integration-review-20260725` (`136cba98`).
That branch is **22 commits stale**; merging it wholesale would have reverted six place source GLBs,
deleted the twelve `holistic-fix*` regression tests, and undone the `assetLoader` shear-tolerance fix
from `8e257745`. So the World Site slice was extracted selectively — 16 paths — and repaired.

Independent review of the candidate concluded reimplementation would be strictly worse: the slice has
**zero coupling to the stale lab/broker**, and its 743-line test constructs the adversarial cases
rather than asserting the rules by name.

### Deliberately excluded from the port

| Path | Why |
|---|---|
| `src/render/assetLoader.js` | The branch predates `8e257745`. Taking it deletes `authoredTransformIssue` / `AUTHORED_TRANSFORM_SKEW_EPSILON`, which `test/pq018-wreck-cathedral-admission.test.mjs` imports. |
| `src/render/partsLibrary.js` | Not needed — master already admits the Cathedral. Proven by `world-site-render-admission` passing without it. |
| `src/data/flavor/080-landmark-lore.js` | The branch relocates the Cathedral out of `zone_io_derelict` (a real "Cruiser Graveyard" zone) to a *site* id that breaks the `zone_*` convention. That is a canon decision with no code consumer; left to the user. |
| lab, validation-broker, runtime manifest, input/course, thruster, build script, public-route probes | Staleness reverts or other lanes' surfaces. |

### Repairs applied on top of the candidate

1. **Release binding constants corrected.** The branch pinned its own rebuild
   (`ca01a624…` / 6,160,076). Master's actual artifact is `dc5510f8…` / 6,160,084. Both
   `worldSiteAssetBindings.js` and `world-site-assets.test.mjs` now match master. (Independent review
   confirmed the two GLBs are functionally equivalent: byte-identical BIN chunk, differences confined
   to 21 LOD draw-group nodes at ≤1.6e-7, and all twelve semantic sockets byte-identical.)
2. **`test/m2-world-records.test.mjs` generalized, not weakened.** It hardcoded
   `worldOrder === ['world_site_helios_relay']` and `Object.keys(worldById).length === 1`. Both now
   derive from `WORLD_SITE_MANIFESTS`, so a new authored site still cannot silently pass, and an
   explicit `includes('world_site_helios_relay')` assertion was added.
3. **Five evidence PNGs published** to `assets/ships/release/media/wreck-cathedral/` so the catalog's
   pinned hashes resolve against a bundled root. Byte-identical copies of existing committed blobs;
   `check:asset-reachability` stays green.

## The evidence contract — why a save cannot fabricate a page

Verified directly in `src/systems/worldSiteKernel.js` at the integration revision:

- `:414` `normalizeWorldSiteRecord` **hard-resets** `evidenceReceiptsByPageId = {}`.
- `:415-424` it then rebuilds **only** from `manifest.operations` × `next.completedOperations`.
- `:425` `evidenceRevision` is recomputed as the resulting key count.
- `:532` forward play writes only when the page is absent — first write wins, idempotent.

`completedOperations` is itself rebuilt as a manifest-valid transition graph, so a page exists **iff**
its authored operation legitimately completed. A fabricated or tampered save row is discarded on load.
Pages cannot unlock from proximity, `visited`, catalog presence, asset load, or a site-complete flag —
the ported test proves this by placing the player exactly at the site's global position and asserting
`evidenceRevision === 0`.

Receipts are direct-keyed, **not** stored in `record.receipts` — that array is a 64-entry ring buffer
appended on every accepted beam application (`:647-653`, called at `:448` outside the completion
branch) and would evict story pages within about a second of held beam.

## Gates — all run by the controller at the integration revision

| Gate | Result |
|---|---|
| `node --test` world-site suite + both PQ-018 tests + `m2-world-records` (12 files) | **90 pass / 0 fail** |
| `node scripts/check-pq018-coordinate-reservation.mjs` | **PASS** — local `(300, 2700)`, global `(-11988, 10892)`, envelope 620, minimum clearance **76.632 WU** vs `gate:tethys>gate:pallas` |
| `npm run check:sim:compare` | **exit 0**, `ok: true`, `deterministic: true`, `hashEqual: true`, `firstDivergentTick: null` |
| `npm run check:atlas-integrity` | **PASS** |
| `npm run check:asset-reachability` | **PASS** — 16 runtime assets bundled |
| `node scripts/check-program-docs.mjs` | **PASS**, 0 warnings |
| `node --check` on all ten changed modules | pass |

Baseline before the change was 25/25 on the three core world-site files; the suite is now 90/90 across
twelve files including the new 743-line adversarial test.

## Pre-existing reds — proven not caused by this leaf

- **`check:pq017:world-site:fast`** is red. `test/world-site-public-route-contract.test.mjs` fails
  **1 of 67** at line 732 (a `package.json` script-string mismatch) both before and after this change.
  Neither that test nor `scripts/lib/pq017WorldSitePublicRoute.mjs` was modified.
- **`check:sim:compare` advisory `expectedTraceCount` drift** (`presentation:*` 3→4, `cueApplied`
  14→15) was independently measured on **clean master** in a separate worktree and pre-exists this
  change. The gate exits 0. No `.expected.json` was edited.

### One environment finding worth recording

Git worktrees created here check out **CRLF** while the primary checkout is **LF** (same blob id,
`core.autocrlf=true`, no `.gitattributes`). Source-string tests that regex on `\n` therefore fail
spuriously inside a worktree. This produced a false line-241 failure that was proven to be an
ENVIRONMENT artifact by re-running on master. **Verify source-string gates in the primary checkout.**

## Residuals — honestly unproven

- The relocated Phase-4 functional route was attempted once through the registered
  `pq020-ceres-topology` Browser broker cell at fixed seed `47`; it is **FAIL — HARNESS**. The public
  production jump reached Ceres and materialized all fifteen Cathedral entities, but an unsupported
  absolute endpoint-distance assertion stopped the route before Cathedral approach, save/Continue,
  the second endpoint direction, or Electron parity. See
  [`row5-pq020-ceres-route`](../evidence/h1/row5-pq020-ceres-route/EVIDENCE.md).
- Browser/Electron route acceptance and game-camera visual review therefore remain open. The successful
  jump/materialization facts do not close either claim.
- Matched Ceres/Cathedral performance remains Phase H3; H1 makes no performance claim.
- The independent **art** verdict on the exact source candidate is still outstanding.
- `visualRoot.anchorId` remains inert in the kernel (validated, never read) — pre-existing.
- `evidenceRevision` is a count, not a revision: normalize sets it to the key count while forward play
  increments. They agree on every exercised path and normalize recounts on load, so drift self-heals.
  Renaming it to `evidenceCount` is a follow-up.
- `receiptId` aliases `pageId`; the causal link lives in the extra `operationReceiptId` field.
- `completedOperations[*].earnedAtS` is trusted from save when finite, while `earnedTick` is
  re-derived. Cosmetic-timestamp asymmetry only.
- `discovery.initialDiscovered: true` means the Cathedral is map-visible from a new game. Retained as
  the candidate's considered choice and consistent with "worth flying to", but it is a product call
  the user may wish to revisit.

## Follow-ups (deliberately excluded)

1. Decide the lore canon: leave the Cathedral in `zone_io_derelict` or move it to Ceres with a real
   `zone_*` id.
2. Phase 4: complete route acceptance and visual review after the H1 HARNESS failure; run matched Ceres performance separately in H3.
3. Rename `evidenceRevision` → `evidenceCount`.
4. PQ-021 may now consume `evidenceReceiptsByPageId` and
   `src/data/wreckCathedralEvidenceCatalog.js`.
