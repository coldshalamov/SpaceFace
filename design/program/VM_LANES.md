<!-- LIFETIME: VOLATILE -->
# VM_LANES — long-horizon Blender / remaster threads

```yaml
refreshed: 2026-09-21
purpose: live board for Grok Bot / remote Blender remaster work that should not collide with local NOW.md checkout mutations
use: claim a row before remaster mutation; push after each meaningful update; pull before starting and when returning; release the row when done
expiresAfterDays: 2
```

## Local agents (read first)

1. `git pull`, then read **this file** and [`NOW.md`](./NOW.md) before touching assets or plans.
2. **Do not edit** a ship / live LOD path claimed in **Active** below.
3. Prefer longform / creative expansion that will not collide: design notes, concept refs, backlog packets, docs under `design/` or `docs/visual-assets/` for ships **not** claimed here.
4. Short local checkout mutations still use [`NOW.md`](./NOW.md) + checkpoints. This board is the remaster lane (Code Work / Grok Bot computer), not a second NOW.

This is a short collaboration board, not a roadmap or cycle ledger. Product status lives in the queue and packets. Git and receipts own history — do not grow this table into per-cycle rows.

## How to use it

1. **Pull** `origin/master` (and this file) before starting and whenever you return.
2. **Claim** one row immediately before the first remaster mutation. Reading and research need no row.
3. Name the exact task, thread, host (e.g. `grok-bot-box` or machine id), branch, state, exact focus, last push, and next terminal action.
4. A row protects that named ship leaf. It does not block disjoint ships, packets, or local `NOW.md` work.
5. **Stale = adoptable.** No push / no progress for 90 minutes → adopt (keep hunks, finish or land, rewrite the row). Do not wait or route around it.
6. **Push** after each meaningful update (pathspec commits).
7. **Release** when mutation stops. End with `RESULT: DONE` or `RESULT: NOT DONE`.

## Closed leaves (PQ-050)

| Leaf | Ship | RESULT | Note |
|---|---|---|---|
| `PQ-050.01` | Hornet | **DONE** | Chase Hitch-plus PASS; parent unproven / not G7 |
| `PQ-050.02` | Drifter | **DONE** | Chase Hitch-plus PASS at C22; parent unproven / not G7 |

Freeze for later leaves: Hitch/Kestrel always; Hornet + Drifter live LODs once closed.

## Active

| Task | Thread | Host | Branch / PR | State | Exact focus | Next |
|---|---|---|---|---|---|---|
| `PQ-050.03` Ranger chase C2 | code-work-coordinator | `grok-bot-box` | `leaf/pq050-03-ranger-chase-c2-box` / [PR 151](https://github.com/coldshalamov/SpaceFace/pull/151) | **RESULT: REVISE** (CAGE_READ NO; TUBE_PADDLE YES leftover; Hitch still wins D=144; parent unproven) | chase_form_v2b: formed loft, thick-root wings, shallow scores, deep wells, formed pylon; Hitch/Hornet/Drifter frozen | C3: kill remaining needle taper / Hitch massing gap — not garnish |

## Pointers

- Local shared-checkout mutations: [`NOW.md`](./NOW.md)
- Packet: [`roadmap/active/PQ-050.md`](./roadmap/active/PQ-050.md)
- Program map: [`../../build_map.md`](../../build_map.md)
- Chase camera: [`../../tools/blender/spaceface_chase_camera.py`](../../tools/blender/spaceface_chase_camera.py)
- Root start-by-task: [`../../AGENTS.md`](../../AGENTS.md) → row "Long-horizon VM / Blender / cloud agent work"
