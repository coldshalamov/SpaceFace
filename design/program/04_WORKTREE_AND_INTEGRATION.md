# Worktree and Integration Inventory

**Audit snapshot:** 2026-07-14 before this document set was added. Counts are volatile under
concurrent work; re-run the command below before acting.

## Repository checkpoint

- Branch: `master`.
- HEAD and upstream: `05b9cf60394df7f7c8a183fd958c30815616fc10`.
- Ahead/behind: `0 / 0`.
- `codex/depth-program`: 0 commits ahead of master; do not merge it.
- Audit snapshot: 8,052 status entries, 7,127 tracked-but-unstaged, 925 untracked, 0 staged.
- Tracked breakdown: 6,813 intent-to-add, 238 modified, 76 deleted.
- Untracked bytes: 615,449,407; no current dirty file exceeds 100 MiB; largest approximately 48.6 MB.

## Dominant clusters

| Cluster | Tracked | Untracked | Current interpretation |
|---|---:|---:|---|
| `assets/**` | 6,722 | 869 | Helios V7/V8/V9 candidates, third-party source acquisitions, release candidates, evidence, manifests. Requires licensing/provenance, quality, duplication, and runtime classification. |
| `src/**` | 152 | 1 | Depth systems/data/UI plus concurrent gameplay work. Must split by subsystem and ownership. |
| `scripts/**` | 76 | 6 | Depth checks, captures, validators, indexes, and other campaign tooling. |
| `test/**` | 71 | 1 | Depth contracts plus high-risk telemetry/input fixtures. |
| `design/**` | 50 | 23 | Depth ledger/plan, revamp/history, status and program documentation. |
| `docs/**` | 21 | ~1 | Generated/reference/handoff material; classify generated versus authored. |
| `tools/**` | 13 | 22 | Blender/art finalizers and acquisition/build tools. |
| `styles/**` | 9 | 0 | Fonts and UI changes; verify ownership and runtime reachability. |

## High-risk paths

Do not bulk-stage or automatically resolve:

- `test/47a.telemetry.expected.json`
- `test/47a.telemetry.v3.expected.json`
- `test/47a.inputs.json`
- `src/systems/input.js`
- protected station UI files
- release GLBs/manifests and active asset-source trees
- asset lock/build/previous directories

Any telemetry-golden change needs a separately named re-record decision. Station UI must retain its
restored last-known-good presentation. Assets/render paths require active-lane coordination.

## Recoverability truth

- The Depth aggregate passes only in this dirty tree.
- Most July-14 Depth package aliases, scripts, systems, data, tests, and UI files are absent from HEAD.
- All `.devshots/depth-program/**` evidence is ignored; a fresh worktree or clone receives none of it.
- Committed master therefore cannot reproduce the current Depth result yet.

## Required classification fields

Every dirty path or coherent directory group should receive:

| Field | Values/examples |
|---|---|
| Owner/lane | lead, Depth data, Depth UI, asset, render/perf, generated docs |
| Nature | implementation, test, source asset, generated output, evidence, cache/temp |
| Maturity | coherent, partial, duplicate, superseded, unknown |
| Runtime reachability | default, tool-only, unwired, source-only |
| Verification | exact command/evidence or “not yet verified” |
| Intended disposition | commit batch ID, preserve outside git, regenerate, or deliberately remove after review |

## Proposed logical integration batches

These are review units, not permission to stage everything matching a directory:

1. **PROGRAM-DOCS** — this unified document set and pointer updates.
2. **DEPTH-FOUNDATION** — F1/F2 validators, loaders, generated indexes, package aliases, tests.
3. **DEPTH-VOICE** — V1/V2 contacts, flavor corpus, Band data/runtime, checks.
4. **DEPTH-WRECKS** — R1/R2 unique wrecks, reward/rumor surfaces, GT1 loot audit.
5. **DEPTH-MISSIONS** — SP1/E1 mission/encounter runtime, choices, tests.
6. **DEPTH-FACTIONS** — K1/S3/D1 behavior/data; S4 and W1 only at their honest groundwork maturity.
7. **DEPTH-LEDGER-UI** — A2 separately, because station UI is a protected regression surface.
8. **ASSET-SOURCE** — provenance/licensing/source acquisitions, separated from runtime promotion.
9. **ASSET-CANDIDATES** — each visual family separately with manifests, GLBs, screenshots, checks,
   and classification; never one 7,000-file asset dump.
10. **FOREIGN/HIGH-RISK** — input, goldens, station, render, and unrelated concurrent changes stay
    outside every batch until explicitly owned and verified.

## Re-run inventory

Use NUL-safe status parsing; filenames may contain spaces:

```powershell
git branch --show-current
git rev-parse HEAD
git rev-parse origin/master
git rev-list --left-right --count HEAD...origin/master
git diff --cached --quiet
git status --porcelain=v1 -z --untracked-files=all
git diff --name-status
git ls-files --others --exclude-standard
```

Update this document after every integration batch. Never replace the live inventory with an old
chat count.
