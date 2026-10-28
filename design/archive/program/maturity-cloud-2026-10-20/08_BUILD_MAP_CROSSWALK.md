<!-- LIFETIME: DURABLE -->
# 08 · Build-map integration without duplicate work

## Where this belongs

The existing `build_map.md` §1C board remains the dispatch authority. This pack expands the detail
behind existing rows. Its task labels are local document anchors, not a new priority overlay.
Keep parent rows open until their full acceptance bar is met. A packet may finish while the parent
still has substantial work remaining.

| Supporting document / packet | Existing parents | What it adds, not replaces |
|---|---|---|
| First hour and trust | 454, 457–459, 465, 473, 479; defect ledger | Explicit route transitions and recovery matrix |
| Physics and Swarm | PQ-141, 390, 392–393, 448, 475; 456, 270, 453, 481 | One causal encounter and complete run workflow |
| Living world and missions | 398, 424–426, 441, 460, 467, 477–478 | Person/knowledge contract and fail-forward outcomes |
| Economy and identity | 401–403, 465–466, 469, 480 | Finite custody, truthful rates, preview and commitment contracts |
| Regions and investigation | 419, 423, 444, 450, 452, 464, 468, 476 | Region card and one evidence-driven vertical slice |
| CLOUD-01 | 466; integrated in 454 | Mining result/capacity explanation, not D227 repair |
| CLOUD-02 | 464; integrated in 454 | Local arrival information, not more sectors |
| CLOUD-03 | 477 | Job/interruption readout, not NPC routing |
| CLOUD-04 | 468 | Revelation-gated anatomy, not fauna simulation |
| CLOUD-05 | 471 | Trustworthy records, not new counters |
| CLOUD-06 | 451 | Return recap, not a new journal database |
| CLOUD-07 | 476 | Compare existing routes, not new navigation |
| CLOUD-08 | 469; reuses PQ-142 | Physical tradeoffs, not new derived-stat formulas |
| CLOUD-09 | 467 | One escort successor, not all mission types |
| CLOUD-10 | 463 | One boss's readable counter, not detachable plates |

## Exact integration actions

1. Place this directory under `design/program/maturity-cloud-2026-10-20/`.
2. Add one navigation row to `design/program/README.md`; the documentation PR supplies it.
3. Apply the supplied root build-map link patch after checking the current board. The patch only
   inserts a supporting-plan link near the existing front door. It does not change a row number,
   status, claim, dependency, completion count or acceptance threshold.
4. When a packet is explicitly dispatched, link it from the existing parent detail/assignment.
   Do not mint another 482+ row for a slice already owned by 466/467/etc. If current tooling requires
   a leaf, the controller creates it inside the existing parent, with the actual current write set.
5. Run the repository's current documentation/plan checks and inspect the diff. Do not silently fix
   unrelated stale counts or rewrite old evidence during this planning change.

## Safe root link

The supplied `integration/BUILD_MAP_LINK.patch` is a small additive patch against the exact fetched
opening. A companion `integration/apply_build_map_link.py` offers a dry-run and idempotent `--apply`.
Run it from a checkout containing the pack, naming the repo root. It refuses an unrecognized anchor,
a missing pack or a dirty build map, and rechecks file identity before applying. Coordinate with
the current board writer first: its advisory lock cannot exclude an unrelated writer that ignores it. It never commits or pushes.

```sh
python design/program/maturity-cloud-2026-10-20/integration/apply_build_map_link.py --repo /path/to/SpaceFace
python design/program/maturity-cloud-2026-10-20/integration/apply_build_map_link.py --repo /path/to/SpaceFace --apply
node scripts/check-program-docs.mjs
node scripts/board-chunks.mjs --check
node scripts/check-plan-integrity.mjs
```

The helper and patch travel inside this pack; the ZIP preserves repository-relative paths. The node commands are current documented repo checks, not claims of runs in
this planning session. Reconcile a changed checker interface rather than disabling its contract.

## Ownership and duplicate exclusions

PR464 already carries the metallic-material mining correction: CLOUD-01 must not reimplement it.
PRs461/462/466/470/474/476–478/480 own living-worker/custody work. CLOUD-03 only projects accepted
current state. PR459 owns local-course restoration. PR458 owns cartography payment persistence;
CLOUD-04 grants no scan reward. PRs471–473/475/479 own mobile/startup/quality fixes and do not become
an invitation to redesign the HUD here. Refresh these references at dispatch; they are a dated map.

The broader A-list direction is retained. New home/crew/card-game content, physics weather,
full boss dismantling and global replay export remain their existing staged rows. This pack does
not lift release-preparation scope limits or silently change the owner-approved art direction.
