<!-- LIFETIME: STABLE -->
# Orphan harvest and live-wiring playbook

Use this only when the user launched the orphan-harvest campaign
(`ORPHAN_HARVEST_GOAL.txt`). It turns leftover agent copies and unused
in-repo models into live game work. It does not replace
`WORKTREE_RECOVERY.md` dispositions, visual-asset acceptance, or
`ARCHITECTURE.md`.

Keep the running board in [`ORPHAN_HARVEST_LEDGER.md`](./ORPHAN_HARVEST_LEDGER.md).
That file is the checkpoint. A branch, worktree, or candidate with no
ledger row is still lost.

## 1. What this campaign is

Two tracks, one checkout, one unit at a time:

| Track | Job |
|---|---|
| A. Orphan copies | Mine `C:\sf-agents` and leftover branches. Merge finished work. Finish near-done work. Checkpoint the rest so it cannot rot. |
| B. Unused models | Review models that exist in the main project but are not what the player sees. Polish if they are still wonky. Wire only what beats live and is not broken. |

This is not INFERENCE and not a default PQ-050 overnight. Hitch is in
scope here because the later polish was left off the compressed file
the game loads.

Work in the main checkout. Do not create new worktrees. Do not delete
a copy until its ledger row is `DROP` or `PRESERVE` with hashes, and
every `PORT` from it is committed and pushed.

## 2. Authority

User direction (this campaign) → `ARCHITECTURE.md` → `design/VISION.md`
→ `design/GDD_2_0.md` → this playbook → `WORKTREE_RECOVERY.md` → live
code, manifests, and `src/render/partsLibrary.js`.

Player-facing models also obey `docs/visual-assets/README.md` and
`.grok/skills/spaceface-blender-material-truth/SKILL.md`. Wiring a
valid GLB is not acceptance.

A `NOW.md` row or another agent is not a stop. Split at the exact dirty
path and continue.

## 3. One unit, then decide

A unit is one orphan copy *or* one model/family *or* one arcade-core
packet. Never “merge the folder.”

```
classify → finish missing seam if near-done → ONE review panel
        → ONE focused proof → MERGE | CHECKPOINT | DROP | ADAPT
        → update ledger + owning plan row → commit/push → next unit
```

### Classify (required, written in the ledger before you edit)

Compare the source to current master with `git cherry -v master <ref>`,
tip-to-tip path/blob compare, and player-route owners. An ahead commit
is not an unintegrated feature.

| Class | Meaning |
|---|---|
| `done` | Complete player-facing outcome, current owners, no known break |
| `near-done` | One missing seam (release rebuild, map row, test, identity) |
| `partial` | Real work, more than one seam or unreviewed quality |
| `superseded` | Master already has it, or a later rejected it |
| `junk` | Empty husk, duplicate checkout, `node_modules` only |

### Terminal dispositions

| Disposition | When | Durable result |
|---|---|---|
| `MERGE` | `done` after review+proof | Focused commit on current owners |
| `CHECKPOINT` | `partial` or failed one repair | Ledger row, next action, hashes, owning plan/queue row |
| `DROP` | `superseded` or `junk` | Ledger proof it is safe to delete the named path/ref |
| `ADAPT` | Valuable model/idea, wrong identity | Named donor, new future role; never silent replace |

`near-done` becomes `MERGE` only after you finish the missing seam in
this same unit. If the seam is bigger than that, it is `partial` →
`CHECKPOINT`.

### Anti-loop review (mandatory, once)

Do not camp in review. The panel happens **once per candidate hash**.

1. Spawn two or three **read-only** subagents. Gameplay units: risk,
   owner collision, “will this break play?” Model units: one still each
   of three-quarter / starboard / rear, original resolution, list every
   **obvious** defect.
2. They must recommend `merge`, `finish-then-merge`, `checkpoint`, or
   `drop`, with the blocking reason.
3. Apply only blocking revises.
4. Run **one** focused proof that matches the claim (see §5).
5. If it is still not merge-safe, `CHECKPOINT` and take the next unit.

Forbidden:

- reviewing the same hash again
- rerunning the same failing command with no relevant change
- “one more cycle” after the repair pass
- merging to make a check green
- self-review in place of subagents
- headed soak loops

A green check is not visual quality. A large diff is not value.

## 4. Track A — orphan copies

Current pile (refresh `git worktree list` before acting): `C:\sf-agents`.
Most folders are mid-August Arcade Core / wave-2 copies. Some are
detached husks with no `.git`. Older August-9 copies named in
`04_WORKTREE_AND_INTEGRATION.md` are already gone.

For each folder or branch:

1. Is it a live worktree, a leftover full clone, or a gitless husk?
2. Does master or `origin/master` already contain the player outcome
   (`git cherry`, then read the actual files)?
3. If unique and `done` or `near-done`: port **onto current master
   owners**. Do not merge the branch wholesale. Do not take their
   `node_modules`, goldens, or unrelated files.
4. If unique and `partial`: copy nothing into runtime. Write the
   checkpoint (what exists, what is missing, exact next action, hashes).
   If the bytes are not already in git, preserve them under a named
   tracked donor or a named tag **before** any delete.
5. If `junk` / `superseded`: `DROP` after the ledger row exists.

Arcade Core and wave-2 branches were **not** found on `origin/master`
as of 2026-08-17. Treat them as unharvested until a cherry/path compare
says otherwise. Do not trust commit-message “campaign closed.”

Port only current-product improvements. Reject stale architecture,
telemetry-golden edits without motion-vs-bookkeeping proof, and any
patch that makes a live route worse.

## 5. Track B — unused models

The game default is **release mode**. Players see
`assets/ships/release/…` and render packages, not authoring source.
Updating source only is how Hitch polish vanished.

### Known starting units (confirm before wiring)

| Unit | Truth at 2026-08-17 | First action |
|---|---|---|
| Hitch later polish | V7 is the compressed live ship. V8/V9 source exists. V9 commit left release untouched on purpose. | Rebuild compressed release + render package from V9 source. Never copy uncompressed source over KTX2. |
| Factory remasters | Newer, heavier bodies for Hornet and most other flyables sit in `fleet_player_bodies_v1`. Live still uses older production files. | Review stills vs live and vs Hitch. Wire one ship only if it beats live and is not a clay tube/box kit. Otherwise polish under PQ-050, do not dump the factory folder. |
| Traffic remasters | Newer `*_production_v1` files exist. Live traffic still uses older bodies after an earlier wire made ships invisible. | Wire only after release identity, render package, and a load proof. Invisible traffic is a failed unit. |
| Markings atlas | Finished, `runtimeWired: false`. | Wire only with a story-grounded subset on one family, after UV/decal proof. |
| Ceres yard props | Packages exist, not placed in the world. | Place only through the normal place/render-package route. |
| Passenger liner | Brief + donor only. | `CHECKPOINT` to PQ-049. Do not invent a body to close the row. |
| Blocked `pelican.glb` / `wasp.glb` | Accessory-only, no hull. | Never wire. |

### Model merge bar

Wire only when all of these are true:

- it is the exact identity already on that live slot (or a new role with
  a new id — never a silent replace)
- three valid full-model stills exist for the exact bytes being wired
- the review panel did not leave a blocking defect
- Hitch later-polish: live New Game shows the new compressed ship
- other flyables: the candidate beats the current live body in
  three-quarter; a loft-with-boxes never ships
- sockets, collision, and role are unchanged unless the unit owns them
- release + render package + `partsLibrary.js` maps agree
- one focused load/routing proof passed

PQ-050 remains the polish route for ships that fail the wire bar.

## 6. Proof (one, focused)

| Claim | Proof |
|---|---|
| Gameplay port | `npm run check:baseline` plus the owning focused test |
| Hitch release rebuild | New Game loads the new release/package bytes; starter is still Hitch; sockets hold |
| One ship/traffic wire | That def/role routing test plus a load that is not a zero-draw body |
| Plan/ledger only | No runtime proof |

Do not run `check:all` as a ritual. Dirty-tree `check:assets:live` red
is not this campaign’s defect.

## 7. Plans and cleanup

After every unit, update:

1. `ORPHAN_HARVEST_LEDGER.md` (class, disposition, hashes, commit or
   next action)
2. The owning packet or queue row if one exists
3. `NOW.md` only while you are editing, then remove your row

When every known copy and model has a row, and every `MERGE` is pushed:

- unregister worktrees for `DROP` copies
- delete only named paths/refs in the ledger
- never `git push --all`, never broad clean

## 8. Campaign done

- No finished player outcome lives only on an orphan copy
- Every near-done item is merged or checkpointed with a next action
- Hitch later polish is on the compressed ship you fly, or the ledger
  says why not
- Unused models are wired, queued under PQ-050/PQ-049, or dropped
- `C:\sf-agents` contains only live writers or named preserved donors
