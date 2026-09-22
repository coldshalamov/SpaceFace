<!-- LIFETIME: VOLATILE -->
# VM_LANES — the other machine's outbox

```yaml
refreshed: 2026-09-21
purpose: a long list of isolated jobs for the Grok Bot / remote Blender computer
use: pull, take the first job below that has no DONE.md, write only inside that job's folder, push the vm-drop branch
expiresAfterDays: 14
```

The other machine does not share the game with local agents. It fills an outbox. Someone on the
owner's machine imports a finished folder later, on purpose. Nobody coordinates in between.

## Fence

If you are the remaster machine:

1. `git pull` on `master`, then work on branch `vm-drop` (create it from current master if it is missing).
2. Write **only** under `design/program/vm-drop/<job-id>/`. Creating that folder is the claim.
3. Do not edit `src/`, `styles/`, `test/`, `design/program/NOW.md`, `design/program/roadmap/program-queue.json`, this file, live GLBs, `assets/ships/parts/`, `assets/ships/release/`, `assets/incubator/`, or the shared builders `tools/blender/fleet_construction.py` and `tools/blender/build_fleet_player_body.py`. If a builder must change, copy it into your job folder and change the copy.
4. Do not run `node scripts/program-dispatch.mjs`. Do not take a gameplay prompt. An empty `NOW.md` is not a free checkout.
5. Commit and push **only** files inside your job folder, on branch `vm-drop`. Do not merge to master. Do not push any other branch.
6. When the folder can be imported without you in the room, add `DONE.md` and start the next job that has no folder yet. Do not edit this board to record it.

If you are on the owner's machine: do not write under `design/program/vm-drop/`. Read it when you want to import something. Do not start a second copy of a job that already has a folder.

Starter tools stay on. Do not add overheat locks, ammo starvation, or limits that make a tool quit. Ship and picture jobs do not need those, and they are not a reason to edit gameplay.

## What a finished folder contains

- The artifact itself (a GLB, a set of PNGs, or a measured report).
- `IMPORT.md` — three short parts: what it is, which live path would receive it later, and what you did **not** wire. You do not perform the wiring.
- `DONE.md` — one paragraph a person can read, plus the numbers or the still names.

Blender jobs follow `.grok/skills/spaceface-blender-material-truth/SKILL.md` and shoot stills only with `tools/blender/spaceface_chase_camera.py` (`play_chase`, `play_chase_abeam`, `play_chase_close`). Hitch and Kestrel are not jobs. Hornet and Drifter are already closed; do not rebuild them.

## Jobs, in order

Take the first row whose folder does not exist. Finish it. Take the next. When the list is done, stop. Do not invent a twenty-first job.

| Job id | What you produce | Leave the live game alone because |
|---|---|---|
| `quiet-crucible` | Run `npm run probe:smooth-flight:crucible` on an otherwise idle machine. Write `report.md` with fps, frames over 33 / 50 / 100 ms, worst frame, and whether a wave was in the window. Seed 4242. | A busy owner machine cannot measure this. You change no code. |
| `quiet-open-flight` | Run `npm run probe:smooth-flight` the same way. Separate the first 20 seconds from settled flight in `report.md`. | Same. Report only. |
| `quiet-solid-world` | Run `npm run probe:solid-world`. Write whether anything on screen was discarded, and the worst wait before an on-screen mesh appeared. | Same. Report only. |
| `ranger-chase` | A chase-camera Ranger candidate: GLB, three stills, a one-paragraph note of what still looks like a kit. Copy any builder you need into this folder. | Do not replace `assets/ships/parts/wholeships/ranger_production_v1.glb` or the release copy. The live hull stays until a person imports yours. |
| `ironback-chase` | Same delivery for the player barge. | Same rule. Your folder only. |
| `bastion-chase` | Same delivery for the player corvette. | Same rule. |
| `atlas-chase` | Same delivery for the player bulk hauler. | Same rule. |
| `warden-chase` | Same delivery for the player gunship. | Same rule. |
| `colossus-chase` | Same delivery for the player capital. Read it at chase distance, not as a diagram. | Same rule. |
| `leviathan-chase` | Same delivery for the player flagship. | Same rule. |
| `pelican-chase` | Same delivery for the player miner. | Same rule. Do not wire `pelican.glb`. |
| `mule-chase` | Same delivery for the player hauler. | Same rule. |
| `mining-barge-wreck` | The mining-barge wreck the aftermath pack names and does not contain. One GLB, three chase stills, sizes in meters in `IMPORT.md`. | Do not edit `assets/incubator/wreck_aftermath_pack/`. Read it. Build in your folder. |
| `wreck-piece-textures` | Seven aftermath pieces that already exist as untextured source, rebuilt with real materials into your folder. Name the seven in `IMPORT.md`. | Do not modify the incubator pack or any manifest. |
| `sector-skies` | Six dark sky images, one per sector mood, plus a note of which single image is allowed to show a galaxy. Action has to read brighter than the sky. PNGs only. | Do not edit `src/data/sectorVisualProfiles.js`. |
| `live-ship-contact-sheet` | Chase stills of the hulls already shipping (Hitch, Hornet, Drifter, and whatever else the live wholeship map names). Read and render. Do not remodel. | Pictures for a later comparison. No GLB writes outside your folder. |
| `boot-times` | Cold boot to first control, three runs, idle machine. `report.md` with the three times and which stage took the longest. | Report only. Do not "fix" the loader. |
| `save-size-quiet` | One two-hour headless session on an idle machine. Record save bytes at start, 30 min, 60 min, 120 min. | The owner's machine is full of agents. You do not change the save code. |
| `everyday-kit-stills` | Chase or berth stills of the everyday space kit pieces that already exist under `assets/incubator/everyday_space_kit/`, so a person can see which ones read as objects. | Render only. Do not edit the kit. |
| `npc-kit-stills` | The same for `assets/incubator/npc_activity_pack/`. | Render only. Do not edit the pack. |

## Already closed — do not redo

| Leaf | Ship | Note |
|---|---|---|
| `PQ-050.01` | Hornet | Chase pass done. Not a drop job. |
| `PQ-050.02` | Drifter | Chase pass done. Not a drop job. |

Hitch and Kestrel stay frozen.

## If you were mid-Ranger on the live files

Stop writing the live Ranger package. Put whatever you have into `design/program/vm-drop/ranger-chase/` and continue that job under the fence. Do not resume by editing `assets/ships/**/ranger*`.

## Pointers

- Outbox: `design/program/vm-drop/README.md`
- Ship order and chase rules, if a job's `IMPORT.md` needs them: [`roadmap/active/PQ-050.md`](./roadmap/active/PQ-050.md)
- Local checkout board: [`NOW.md`](./NOW.md) — read it, do not edit it
- Chase camera: [`../../tools/blender/spaceface_chase_camera.py`](../../tools/blender/spaceface_chase_camera.py)
