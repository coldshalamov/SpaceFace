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
| PQ-050.01 Hornet | code-work-coordinator | `bc-8188ad27-0dbf-5951-be0b-f48141e18378` | `cursor/pq050-01-hornet-leaf-close-8378` | RESULT: DONE (chase five-cycle PASS; parent unproven) | Leaf closeout: ledger filled, old cycle/iter reports deleted, v17 final chase set kept | 2026-09-21 closeout | next ordered leaf PQ-050.02 Drifter |
| PQ-050.02 Drifter chase C1 | code-work-coordinator | `bc-8188ad27-0dbf-5951-be0b-f48141e18378` | `cursor/pq050-02-drifter-chase-c1-8378` | RESULT: REVISE (C1 shipped; Hitch still wins chase; parent unproven) | chase_form_v1 workboat: twin nacelles, rimmed cargo well, greenhouse in tub, no seats/megatex | 2026-09-21 C1 | C2: close remaining Hitch-plus chase gap (panel/hardware), not garnish |
| PQ-050.02 Drifter chase C2 | code-work-coordinator | `bc-8188ad27-0dbf-5951-be0b-f48141e18378` | `cursor/pq050-02-drifter-chase-c2-8378` | RESULT: REVISE (C2 shipped; Hitch still wins chase density at D=144; parent unproven) | chase_form_v2: chase-scale plates, D2/02 stencil, hardware/hoses; well stays a hole | 2026-09-21 C2 | C3: remaining Hitch-plus panel/hardware at play_chase, not garnish |
| PQ-050.02 Drifter chase C3 | code-work-coordinator | `bc-8188ad27-0dbf-5951-be0b-f48141e18378` | `cursor/pq050-02-drifter-chase-c3-8378` | RESULT: REVISE (C3 shipped; Hitch still wins chase density at D=144; parent unproven) | chase_form_v3: larger plates/hardware, hull/armor split, split cable trays; well stays a hole | 2026-09-21 C3 | C4: remaining Hitch-plus manufactured density at play_chase D=144 |
| PQ-050.02 Drifter chase C4 | code-work-coordinator | `bc-8188ad27-0dbf-5951-be0b-f48141e18378` | `cursor/pq050-02-drifter-chase-c4-8378` | RESULT: REVISE (C4 shipped; Hitch still wins chase density at D=144; parent unproven) | chase_form_v4: extra plate course, flank D2/02, thicker hoses/trays; well stays a hole | 2026-09-21 C4 | C5: remaining Hitch-plus manufactured density at play_chase D=144 |
| PQ-050.02 Drifter chase C5 | code-work-coordinator | `bc-8188ad27-0dbf-5951-be0b-f48141e18378` | `cursor/pq050-02-drifter-chase-c5-8378` | RESULT: REVISE (C5 shipped; Hitch-plus chase NOT closed; Hitch still wins D=144 density; parent unproven) | chase_form_v5: inset seams, varied plates, paint-thin chevrons, dirt; well stays a hole | 2026-09-21 C5 | C6 if continued: remaining Hitch-plus manufactured density at play_chase D=144 |
| PQ-050.02 Drifter chase C6 | code-work-coordinator | `bc-8188ad27-0dbf-5951-be0b-f48141e18378` | `cursor/pq050-02-drifter-chase-c6-8378` | RESULT: REVISE (C6 shipped; form-first; Hitch still wins D=144; parent unproven) | chase_form_v6: formed stations, landmark wells, quiet hull + 3 clusters | 2026-09-21 C6 | C7 if continued: remaining Hitch-plus formed-shell / skin density at play_chase D=144 |
| PQ-050.02 Drifter chase C7 | code-work-coordinator | `bc-8188ad27-0dbf-5951-be0b-f48141e18378` | `cursor/pq050-02-drifter-chase-c7-8378` | RESULT: REVISE (C7 shipped; C6 shell + skin; Hitch still wins D=144; parent unproven) | chase_form_v7: girth/stringer seams, armor courses, clamps, selective dirt | 2026-09-21 C7 | C8 if continued: remaining Hitch-plus formed-shell / skin density at play_chase D=144 |
| PQ-050.02 Drifter chase C8 | code-work-coordinator | `bc-8188ad27-0dbf-5951-be0b-f48141e18378` | `cursor/pq050-02-drifter-chase-c8-8378` | RESULT: REVISE (C8 shipped; C6 shell + value/seams/hardware; Hitch still wins D=144; parent unproven) | chase_form_v8: darker hull, girth bands, well saddles, gantry/winch | 2026-09-21 C8 | C9 if continued: remaining Hitch-plus formed-shell / skin density at play_chase D=144 |
| PQ-050.02 Drifter chase C10 | code-work-coordinator | `bc-8188ad27-0dbf-5951-be0b-f48141e18378` | `cursor/pq050-02-drifter-chase-c10-8378` | RESULT: REVISE (C10 shipped; ten-cycle close attempt; Hitch still wins formed-shell D=144; parent unproven) | chase_form_v10: chine beam, panel courses, wing mass, greenhouse cage | 2026-09-21 C10 | Hitch-plus chase NOT closed after ten; remaining dorsal kitbash / gray-tube skin vs Hitch formed shell |
| PQ-050.02 Drifter chase C11 | code-work-coordinator | `bc-8188ad27-0dbf-5951-be0b-f48141e18378` | `cursor/pq050-02-drifter-chase-c11-8378` | RESULT: REVISE (C11 shipped; four leftovers attempted; Hitch still wins formed-shell D=144; parent unproven) | chase_form_v11: shell-cut lips, mid hull, sponson planform, framed greenhouse | 2026-09-21 C11 | Hitch-plus chase NOT closed; remaining gray-plate skin / kite sponsons vs Hitch formed shell |
| PQ-050.02 Drifter chase C12 | code-work-coordinator | `bc-8188ad27-0dbf-5951-be0b-f48141e18378` | `cursor/pq050-02-drifter-chase-c12-8378` | RESULT: REVISE (C12 shipped; skin/sponson leftovers attempted; Hitch still wins formed-shell D=144; parent unproven) | chase_form_v12: chase-scale dorsal courses, constant-chord sponsons | 2026-09-21 C12 | Hitch-plus chase NOT closed; remaining glued gray slabs / paddle sponsons vs Hitch formed shell |
| PQ-050.02 Drifter chase C13 | code-work-coordinator | `bc-8188ad27-0dbf-5951-be0b-f48141e18378` | `cursor/pq050-02-drifter-chase-c13-8378` | RESULT: REVISE (C13 shipped; lofted-shell rebuild attempted; tube/paddle read NOT gone; Hitch still wins formed-shell D=144; parent unproven) | chase_form_v13: one lofted shell, boolean wells, faired sideboard lobes | 2026-09-21 C13 | C14: reference-first workboat shell (not another paddle lobe) |
| PQ-050.02 Drifter chase C14 | code-work-coordinator | `bc-8188ad27-0dbf-5951-be0b-f48141e18378` | `cursor/pq050-02-drifter-chase-c14-8378` | WORKING | chase_form_v14: reference-first single hard-chine workboat shell; wells as cuts; sideboards = beam | 2026-09-21 C14 start | clay_play_chase must not read tube+paddle, then stills+reviews |
| PQ-050.02 Drifter | code-work-coordinator | `bc-8188ad27-0dbf-5951-be0b-f48141e18378` | `cursor/pq050-02-drifter-chase-c14-8378` | WORKING (C14 attempt; C1–C13 NOT DONE park cleared for this cycle) | Kill tube/capsule + saddlebag/paddle at D=144 from chase refs | 2026-09-21 C14 claim | clay then three chase reviews |

## Pointers

- Local shared-checkout mutations: [`NOW.md`](./NOW.md)
- Packet: [`roadmap/active/PQ-050.md`](./roadmap/active/PQ-050.md)
- Program map: [`../../build_map.md`](../../build_map.md)
- Chase camera (required for flyable cycle stills): [`../../tools/blender/spaceface_chase_camera.py`](../../tools/blender/spaceface_chase_camera.py)
