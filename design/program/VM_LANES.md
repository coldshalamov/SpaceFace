<!-- LIFETIME: VOLATILE -->
# VM_LANES — the other machine's outbox

```yaml
refreshed: 2026-09-21
purpose: isolated jobs for the remote machine — clean-machine perf measurements and performance patches the owner imports later
use: pull, take the first job below that has no DONE.md, write only inside that job's folder, push the vm-drop branch
expiresAfterDays: 14
```

The other machine does not share the game with local agents. It fills an outbox. Someone on the
owner's machine imports a finished folder later, on purpose. Nobody coordinates in between.

Performance is now the primary lane. The owner's machine is noisy with other agents, so it cannot
produce trustworthy measurements; this machine can. It can also do the heavy development work —
editing `src/`, running the full test suite — without colliding with local agents, because the work
arrives as patch files inside a job folder, not as shared-branch commits.

## Fence

If you are the remote machine:

1. `git pull` on `master`, then work on branch `vm-drop` (create it from current master if it is missing).
2. Write **only** under `design/program/vm-drop/<job-id>/`. Creating that folder is the claim.
3. Two job kinds:
   - **Report jobs** change no code. Run the probe, write `report.md`, done.
   - **Patch jobs** deliver code as patches. Cut a scratch branch from current master (never
     `vm-drop`), edit `src/`/`test/`/`scripts/` there freely, test it, then export the finished
     work with `git format-patch` into `<job-folder>/patches/`. Push only the job folder. The
     owner's machine applies the patches; you never merge them yourself.
4. Do not commit `src/`, `styles/`, `test/`, `design/program/NOW.md`,
   `design/program/roadmap/program-queue.json`, or this file to `vm-drop`. If a builder must
   change, copy it into your job folder and change the copy.
5. Do not run `node scripts/program-dispatch.mjs`. Do not take a gameplay prompt. An empty
   `NOW.md` is not a free checkout.
6. Commit and push **only** files inside your job folder, on branch `vm-drop`. Do not merge to
   master. Do not push any other branch.
7. When the folder can be imported without you in the room, add `DONE.md` and start the next job
   that has no folder yet. Do not edit this board to record it.
8. Before any patch job: run `npm run check:baseline` on **untouched master** and record the
   result in the folder. Your job is to leave baseline no worse, not to fix failures that were
   already there.

If you are on the owner's machine: do not write under `design/program/vm-drop/`. Read it when you
want to import something. Do not start a second copy of a job that already has a folder.

Starter tools stay on. Do not add overheat locks, ammo starvation, or limits that make a tool quit.
Ship and picture jobs do not need those, and they are not a reason to edit gameplay.

## What a finished folder contains

Report jobs:

- `report.md` — the numbers the job asked for, plus the GPU tier the probe detected
  (`detectGpu` in `src/render/adaptiveQuality.js`). Label every fps/GPU number with that tier;
  a software or VM GPU is not the owner's Intel iGPU, so frame-rate claims are "owner-verify".
  CPU-side numbers (sim ms, event μs, allocations, shader-compile counts, long tasks) are
  portable evidence — report them plainly.
- `DONE.md` — one paragraph a person can read.

Patch jobs:

- `patches/` — a `git format-patch` series rebased onto current master at export time (pull,
  rebase your scratch branch, re-run the tests, then export). One patch per logical change so
  the importer can cherry-pick; number them in apply order.
- `IMPORT.md` — three short parts: what it is, how to apply (`git am patches/*.patch` or
  `git apply`), and what you did **not** do. Name the perf-backlog items it claims
  (`design/perf/PERF_TOP10_AND_BACKLOG_2026-09-13.md` numbers) and what still needs verification
  on the owner's GPU.
- `DONE.md` — the evidence: which focused tests pass, the before/after `check:baseline` result,
  the runtime-witness numbers (labeled with GPU tier), and the risks an importer should read
  first. If the patch touches simulation files, include sim-compare/hash evidence or say plainly
  why determinism is unaffected. Never edit `test/*.expected.json` to force a pass.

Blender jobs follow `.grok/skills/spaceface-blender-material-truth/SKILL.md` and shoot stills only
with `tools/blender/spaceface_chase_camera.py` (`play_chase`, `play_chase_abeam`,
`play_chase_close`).

## The backlog doc is stale — verify before you build

`design/perf/PERF_TOP10_AND_BACKLOG_2026-09-13.md` predates work already on master. Before starting
any numbered item, read the current code and `git log --oneline master -- <path>`; if the item is
already done, say so in `DONE.md` and take the next row. Confirmed done as of 2026-09-21: #23
(freeze submit under UI), #33 (world-records renormalize), #34 (per-emit copy), #36 (radar blip
batching), #55 (hash32 join), #67 (reduced-motion query cache), #78 (effect light pool is 2+6).

## Jobs, in order

Take the first row whose folder does not exist. Finish it. Take the next. When the list is done,
stop. Do not invent a twenty-first job.

| Job id | Kind | What you produce | Why |
|---|---|---|---|
| `quiet-witness-baseline` | report | `npm run probe:runtime-witness` and `npm run check:baseline` on the idle machine. `report.md` with the full phase table (sim/simFrame/vfx/ui/render/presentation, avg + p95), long-task count, detected GPU tier, and the cold first-draw / GPU-resource timings. | Clean numbers this machine alone can produce. The reference for every patch job below. |
| `guard-the-wins` | patch | Backlog #70: a check that fails if any shader links after the first presented frame, a single scoreboard command wrapping the witness phases, and a 20-minute soak whose resource counts must plateau. Scripts under `scripts/`, check wiring, focused tests. | Guardrails make every later optimization provable instead of vibes. |
| `dynres-target-pool` | patch | Backlog #89 + the payoff behind it: pre-allocate the bloom/post render targets once at max size and render scaled frames into viewport sub-rects (no `setSize` realloc on scale change — reallocations stall 0.5–1.3 s on the owner GPU), then enable `dynamicResolution` for the `integrated` tier (`_dynResAllowed` in `src/render/renderer.js`, floor 0.5 already plumbed). Keep composite texel uniforms and bright-pass sampling correct under the sub-rect. | The biggest steady-state lever: fill-bound frames scale with pixels. Functional proof possible on your tier (dynRes is enabled for `software`); fps proof is owner-verify. |
| `shader-admission-slice` | patch | Backlog #24, #27, #29 and the first-draw gap: time-slice in-flight admission (new ships, promoted rocks) the way loading now is; schedule background admission with `scheduler.yield()` after present; `renderer.debug.checkShaderErrors` off for the player route; close the uncaptured-first-draw-resource path that forces the failsafe-open submission gate. | Loading took ~29 s in GPU resources and one first-draw brick ran 243 ms on the owner machine. |
| `residency-budget` | patch | Backlog #30 + #31: enforce a texture/mesh residency budget during long visits, sized from detected hardware, and free transcoded texture bytes from JS memory after upload. | Integrated GPUs share system RAM; residency pressure degrades long sessions. |
| `jump-arrival-spread` | patch | Backlog #22 + #25: spread `world.enterSector`'s remaining synchronous work (~57 ms measured) and a newly composed ship's texture uploads across frames. | Kills the sector-arrival hitch spike. |
| `steady-state-cpu-render` | patch | Render/UI-side items from the stale list, one patch each: #18 (one scene-graph walk per frame), #19 (verify — shared uniform writes may already be cheap), #37 (tumble gating), #38 (unchanged instance matrices), #39 (idle trail/plume buffer uploads), #41 (opaque sort by material), #43 (HUD projection reuse + command-bar signature), #44/#45/#46 (HUD/map build-on-first-use and caches). Skip items already done on master; note each in DONE.md. | A bundle of small safe wins; separate patches keep import selective. |
| `steady-state-cpu-sim` | patch | Sim-side items, one patch each: #35 (subsystem ordering cache — confirm call frequency first), #50–#54 (physics command / hazard-record / mining-descriptor reuse, traffic pass merge), #56–#59, #61. Skip done items. | Same, on the tick path. Determinism evidence required per patch. |
| `long-soak-witness` | report | One 60-minute headless witness session on the idle machine: heap size, resource counts, and phase timings at 5/15/30/60 min. `report.md` with growth curves and whether they plateau. | Feeds `residency-budget` and proves (or disproves) long-session degradation. |
| `save-size-quiet` | report | One two-hour headless session on an idle machine. Record save bytes at start, 30 min, 60 min, 120 min. | The owner's machine is full of agents. You do not change the save code. |
| `everyday-kit-stills` | stills | Chase or berth stills of the everyday space kit pieces that already exist under `assets/incubator/everyday_space_kit/`, so a person can see which ones read as objects. | Render only. Do not edit the kit. Tail work — only after every perf row above. |
| `npc-kit-stills` | stills | The same for `assets/incubator/npc_activity_pack/`. | Render only. Do not edit the pack. |

## Already claimed on `vm-drop` — do not redo

These folders exist on the remote branch; the row above them is retired regardless of local state:
all `*-chase` ship jobs, `quiet-crucible`, `quiet-open-flight`, `quiet-solid-world`,
`boot-times`, `sector-skies`, `wreck-piece-textures`, `mining-barge-wreck`,
`live-ship-contact-sheet`.

## Already closed — do not redo

| Leaf | Ship | Note |
|---|---|---|
| `PQ-050.01` | Hornet | Chase pass done. Not a drop job. |
| `PQ-050.02` | Drifter | Chase pass done. Not a drop job. |

Hitch and Kestrel stay frozen.

## If you were mid-Ranger on the live files

Cycles C2, C3, and C4 are already on master. Stop writing the live Ranger package and stop opening
Ranger pull requests. Ranger has a claimed folder on `vm-drop`; do not start another.

## Pointers

- Outbox: `design/program/vm-drop/README.md`
- Perf backlog (stale — verify against master): [`../perf/PERF_TOP10_AND_BACKLOG_2026-09-13.md`](../perf/PERF_TOP10_AND_BACKLOG_2026-09-13.md)
- Local checkout board: [`NOW.md`](./NOW.md) — read it, do not edit it
- Chase camera: [`../../tools/blender/spaceface_chase_camera.py`](../../tools/blender/spaceface_chase_camera.py)
