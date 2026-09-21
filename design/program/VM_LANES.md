<!-- LIFETIME: VOLATILE -->
# VM_LANES — long-horizon VM / Blender threads

```yaml
refreshed: 2026-09-21
purpose: live board for Cursor cloud VMs and remote Blender work that do not mutate the shared local checkout
use: claim a row before VM work; push after each meaningful update; pull before starting and when returning; release the row when done
baseCommit: 21cb9a5f0ce416bed85e4afa0a1fbbd410bcdace
expiresAfterCommits: 10
expiresAfterDays: 2
```

This is a short collaboration board, not a roadmap, backlog, or completion ledger. Shared-checkout
mutations still go in [`NOW.md`](./NOW.md). Product status lives in the queue and packets.

## How to use it

1. **Pull** `origin/master` (and this file) before starting and whenever you return.
2. **Claim** one row immediately before the first VM / Blender mutation. Reading and research need no
   row.
3. Name the exact task, thread label, host (cloud-agent id or machine), branch, state, exact focus,
   last push, and next terminal action. Do not claim a subsystem, fleet, GPU, or future phase.
4. A row protects that VM's named focus and branch from a parallel agent starting the same leaf. It
   does not block disjoint ships, packets, or local `NOW.md` work.
5. **Stale = adoptable.** A row with no push / no progress for 90 minutes is dead or done. Adopt it
   (read the branch, keep existing hunks, finish or land, receipt, delete or rewrite the row). Do not
   wait, route around it, or ask.
6. **Push** after each meaningful update so other VMs can pull the board. Use pathspec commits.
7. **Release** the row as soon as that VM's mutation stops. End the task with `RESULT: DONE` or
   `RESULT: NOT DONE`. Git and receipts own history; do not grow this board into a ledger.

## Active VM lanes

| Task | Thread | Host (cloud-agent id or machine) | Branch | State | Exact focus | Last push | Next terminal action |
|---|---|---|---|---|---|---|---|
| PQ-050.01 Hornet chase C5 | code-work-coordinator | `bc-8188ad27-0dbf-5951-be0b-f48141e18378` | `cursor/pq050-01-hornet-chase-c5-8378` | RESULT: DONE — v17 live, chase Hitch-plus PASS | Close four C4 chase fails with geometry+Principled; Hitch/Kestrel frozen | 2026-09-21 v17 | close-range Hitch still richer on painted rivets / English word |

## Pointers

- Local shared-checkout mutations: [`NOW.md`](./NOW.md)
- Packet: [`roadmap/active/PQ-050.md`](./roadmap/active/PQ-050.md)
- Program map: [`../../build_map.md`](../../build_map.md)
- Chase camera (required for flyable cycle stills): [`../../tools/blender/spaceface_chase_camera.py`](../../tools/blender/spaceface_chase_camera.py)
