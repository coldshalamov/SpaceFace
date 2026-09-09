# SPACEFACE-ARCHIVES-2026-08-17 report

**Outcome:** terminal disposition for the entire external folder
`C:\Users\93rob\Documents\GitHub\SpaceFace-archives`. Nothing unique was ported into
the live game. No new roadmap packet was invented. Remaining polish already has
routes. The folder is safe to delete after this receipt is on `master`.

This is a later harvest than
[`WORKTREE-RECOVERY-2026-08-08-REPORT.md`](./WORKTREE-RECOVERY-2026-08-08-REPORT.md).
It does not reopen that transaction or `REC-GROK-KES-SALVAGE` (closed 2026-08-12).

## What the folder was

A July 21, 2026 parking lot for leftover agent worktrees after those worktrees
were unregistered. It was **not** a live Git worktree. About **7 GB**, almost all
duplicate checkouts and `node_modules`.

| Item | Size (as found) | What it actually was |
|---|---:|---|
| `grok-family-depth-20260721/` | ~5.0 GB | Full scratch clone of Helios civilian + Ashline v1, plus `.git` and `node_modules` (13,509 members: 8,973 `node_modules`, 2,964 `.git`, 12 GLBs, 10 blends) |
| `graphics-overhaul-donor-20260721/` | ~1.9 GB | Dirty files from the old graphics-overhaul worktree (241 files, 121 GLBs). Committed tip already tagged `archive/graphics-overhaul-donor-20260721` |
| `stale-task-copies-20260721/` | ~37 MB | Full `sf-w2-npcjobs` checkout including vendor. PQ-014 already on master; tag `archive/pq014-npc-job-kernel-20260720` |
| `depth-player-route-actualization-bf1dfce2-20260719.tar.gz` | ~1.8 MB | 17 raw orchestration logs. Tag `archive/depth-player-route-actualization-20260719` |
| `grok-out-of-scope-worldbuilding-20260721/` | ~0.2 MB | Rejected writing-shelf dump with long copyrighted extracts |
| `primary-review-quarantine-20260719/` | ~0.07 MB | Unread July 18 foundation-sprint review notes |

## Authority used

- Current live starter is still `ship_kestrel` / Hitch. Hitch stays frozen.
- Helios civilian on master was already promoted and is byte-identical to the
  family-depth scratch.
- Ashline runtime promotion from that scratch was already rejected: it polishes
  the older v1 silhouette while `m4_ashline_v2` and the PQ-050 factory bodies are
  the stronger foundation.
- `design/program/09_DONOR_VALUE_LEDGER.md` already named these archives as
  recovery authority, not product authority.

## Disposition

Every source is `DROP`.

| Source | Why DROP | History still recoverable? |
|---|---|---|
| Family-depth scratch | 5 GB of clone junk. Helios civilian GLBs/blends are **byte-identical** to current master. Hull-starter and rock-A blends are **older and smaller** than current authored files. Ashline v1 files are a **rejected** later polish of the old silhouette (see hashes below). | No git tag (scratch-only). Unique rejected Ashline bytes are **not** copied; they must not replace live, V2, or PQ-050 factory bodies. |
| Graphics-overhaul dirty harvest | Overlapping GLBs are older or already recorded on master (isolated v4 package, later Hitch, remastered parts/places). Only unique paths are superseded Kestrel surface_v3/v4 previews (current tree already has surface_v5), leaked Claude user-guide docs, session locks, and four unreviewed test stubs. | Tag `archive/graphics-overhaul-donor-20260721` keeps the committed tip. |
| NPC-jobs tarball | Stale full checkout. PQ-014 kernel and later live wiring are already on master. | Tag `archive/pq014-npc-job-kernel-20260720` |
| Depth logs | Logs only. | Tag `archive/depth-player-route-actualization-20260719` |
| Out-of-scope worldbuilding | Never accepted. Contains copyrighted extracts. Current `docs/worldbuilding/` plus the 23 non-canon drafts at `7fa373c8` already cover the useful shelf. | No. Do not import. |
| Quarantined July 18 reviews | Historical CI/foundation process notes for a program the current map replaced. No missing player-facing work. | Reviewed commits are ordinary git history. |

No `PORT`. No new tracked donor pack. Checking 160 MB of rejected Ashline v1
exports into the repo would freeze the wrong silhouette as if it were still a
candidate. Independent stills of that polish show stacked boxes, floating cubes,
and plastic/clay materials — the same kitbash failure the live remaster is
leaving behind. Those bytes are not a treatment reference worth keeping.

## Rejected Ashline v1 depth polish (hashes only)

These files were larger than current `assets/ships/m4_ashline/` and **different**.
They are the rejected family-depth treatment of the old v1 bodies. Do not restore
them over live, V2, or factory files.

| Path in scratch | Bytes | SHA-256 |
|---|---:|---|
| `m4_ashline/source/wholeships/ashline_dart.glb` | 34,719,908 | `5BC6BAE110C304E867805950C7C3B72AAB293D229DF1CEF6D50646A8AE8D06FB` |
| `m4_ashline/source/wholeships/ashline_lode.glb` | 35,185,640 | `996CC9F1C69A400CB9D6381691BAFF527B2DED47A59080FD48085E37595F3608` |
| `m4_ashline/source/wholeships/ashline_rig.glb` | 34,783,080 | `FFECD2031EDB13FB4CA42FABFAC4FE9076168B137A09E20F054F44F9F49A8680` |
| `m4_ashline/release_candidates/wholeships/ashline_dart.glb` | 18,704,952 | `16661B268193D019E36F696448FC317A167F6EF9CDC11AABDC00BBBC007873CC` |
| `m4_ashline/release_candidates/wholeships/ashline_lode.glb` | 18,937,060 | `1BDEBE55404DC7C22A6116B8F88E34B6354BAD3019B444C95A5915092780625E` |
| `m4_ashline/release_candidates/wholeships/ashline_rig.glb` | 18,678,952 | `7E787892F24E7C5A50B8B9AE2738202422A25FBFD7FA01296AA02D1D951C5947` |
| `m4_ashline/blender/ashline_dart_production.blend` | 3,207,694 | `97F16C96D57ECD52A38DC8FC5C0C2F46DC664E9AACAEC42BE9A4BC2BED3CD2CC` |
| `m4_ashline/blender/ashline_family_kit.blend` | 2,431,897 | `CD16C3864654F526E54C69209E5F779DACC5A9B8CE0495A92FF96800488DFBE5` |
| `m4_ashline/blender/ashline_lode_production.blend` | 3,446,092 | `1F1F1B37352F09D7D495E72A91845ACCDAEA62F63B6668327A74847027BF9EE3` |
| `m4_ashline/blender/ashline_rig_production.blend` | 3,241,389 | `0F55D773818FAD81EF073F835CB896345709132DB1AAB812B12D725CE0EF9E4B` |

Helios civilian source, release, and production blends in the same scratch were
byte-identical to current master and need no preservation.

## Remaining polish (already routed)

The folder did **not** hide a new ship or place. Unfinished look-dev is the
work already on the map:

| Already-admitted route | What it covers from this harvest |
|---|---|
| `PQ-050.13`–`PQ-050.15` | Ashline dart / lode / rig remaster to Hitch-plus from the current factory bodies and `m4_ashline_v2`. Do not revive the rejected v1 depth polish. |
| `PQ-050.16`–`PQ-050.18` | Helios lark / cradle / span remaster. Live civilian family is already the accepted July promotion. |
| `PQ-050` other leaves | Fleet remaster already in progress. Hitch stays frozen. |
| `PQ-049` | Stopped-Lark express-liner donor (already tracked). Not in this folder. |
| Place remaster handoff | Dock / hulk / debris. Graphics-donor place GLBs were older copies of assets master already has. |
| `WB-LORE-SURFACING` | The 23 imported non-canon drafts. Not the copyrighted extracts in this folder. |

## Cleanup ledger

Delete only these exact local paths after this receipt is committed:

1. `C:\Users\93rob\Documents\GitHub\SpaceFace-archives` (entire folder)
2. `C:\Users\93rob\Documents\GitHub\_archive-triage` (temporary extract used for hashing)

Do not delete git tags. Do not run garbage collection. Do not touch the
corrupt-clone path already closed by `REC-GROK-KES-SALVAGE`.
