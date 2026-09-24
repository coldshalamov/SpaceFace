<!-- LIFETIME: VOLATILE -->
# VM_LANES — the other machine's outbox

```yaml
refreshed: 2026-09-21
purpose: a complete performance program for the remote machine — clean-machine measurement, diagnostics, and patch-series development the owner imports later
use: pull, take the first job below that has no DONE.md, write only inside that job's folder, push the vm-drop branch
expiresAfterDays: 14
```

The other machine does not share the game with local agents. It fills an outbox. Someone on the
owner's machine imports a finished folder later, on purpose. Nobody coordinates in between.

**Why performance lives here.** The owner's machine is noisy with other agents — its frame timings
are contaminated and unreliable. This machine is quiet, which makes it the only place that can
produce trustworthy CPU profiles, allocation traces, boot breakdowns, and soak curves. It can also
do heavy development work (edit `src/`, run the whole suite) with zero collision risk, because the
result arrives as patch files inside a job folder — never as shared-branch commits.

**What this machine cannot prove.** It almost certainly does not have the owner's Intel iGPU.
Anything that is GPU-absolute — fps numbers, backend timings, what transcode target real hardware
picks — is **owner-verify**. CPU-side numbers (sim ms, allocation sites, long-task counts, shader
compile counts, heap growth) are portable evidence and are the point of the exercise.

## Fence

If you are the remote machine:

1. `git pull` on `master` before every job, then work on branch `vm-drop` (create it from current
   master if it is missing).
2. Write **only** under `design/program/vm-drop/<job-id>/`. Creating that folder is the claim.
3. Three job kinds:
   - **Report jobs** change no code. Run the probe/instrument, write `report.md`, done.
   - **Patch jobs** deliver code as patches. Cut a scratch branch `vm-work/<job-id>` from current
     master (never `vm-drop`), edit `src/`/`test/`/`scripts/` there freely, test it, then export
     the finished work with `git format-patch` into `<job-folder>/patches/`. Push only the job
     folder. The owner's machine applies the patches; you never merge them yourself.
   - **Stills jobs** render images into the folder; they change no code.
4. Do not commit `src/`, `styles/`, `test/`, `design/program/NOW.md`,
   `design/program/roadmap/program-queue.json`, or this file to `vm-drop`. If a shared tool must
   change, copy it into your job folder and change the copy.
5. Do not run `node scripts/program-dispatch.mjs`. Do not take a gameplay prompt. An empty
   `NOW.md` is not a free checkout.
6. Commit and push **only** files inside your job folder, on branch `vm-drop`. Do not merge to
   master. Do not push any other branch.
7. When the folder can be imported without you in the room, add `DONE.md` and start the next job
   that has no folder yet. Do not edit this board to record it.
8. Before every patch job: run `npm run check:baseline` on **untouched master** and record the
   result in the folder. Your job is to leave baseline no worse, not to fix failures that were
   already there.
9. Keep the machine otherwise idle during any measurement job — the cleanliness is the product.
10. If a job blocks partway, ship the finished slice as a partial folder (patch what works, say
    what is missing in `DONE.md`), then continue. A large job may split into `<id>-b`.

If you are on the owner's machine: do not write under `design/program/vm-drop/`. Read it when you
want to import something. Do not start a second copy of a job that already has a folder.

Starter tools stay on. Do not add overheat locks, ammo starvation, or limits that make a tool quit.
Ship and picture jobs do not need those, and they are not a reason to edit gameplay.

## What a finished folder contains

Report jobs:

- `report.md` — the numbers the job asked for, plus the GPU tier detected (`detectGpu` in
  `src/render/adaptiveQuality.js`). Label every fps/GPU number with that tier. Include raw
  artifacts (`*.cpuprofile`, witness JSON, screenshots) where the job produces them.
- `DONE.md` — one paragraph a person can read, plus the headline numbers.

Patch jobs:

- `patches/` — a `git format-patch` series rebased onto current master at export time (pull,
  rebase the scratch branch, re-run the tests, then export). One patch per logical change so the
  importer can cherry-pick; number them in apply order.
- `IMPORT.md` — what it is, how to apply (`git am patches/*.patch`), which perf-backlog items it
  claims (`design/perf/PERF_TOP10_AND_BACKLOG_2026-09-13.md` numbers), and what still needs
  owner-GPU verification.
- `DONE.md` — the evidence: focused tests added and passing, before/after `check:baseline`,
  witness numbers (GPU tier labeled), and the risks an importer should read first.
- New behavior gets focused tests. Never edit `test/*.expected.json` to force a pass. If a patch
  touches simulation files, include sim-compare/hash evidence or say plainly why determinism is
  unaffected. "No visual cost" items must not change pixels; anything that changes the picture
  belongs only inside the opt-in preset job.

Blender jobs follow `.grok/skills/spaceface-blender-material-truth/SKILL.md` and shoot stills only
with `tools/blender/spaceface_chase_camera.py` (`play_chase`, `play_chase_abeam`,
`play_chase_close`).

## The backlog doc is stale — verify before you build

`design/perf/PERF_TOP10_AND_BACKLOG_2026-09-13.md` predates work already on master. Before starting
any numbered item, read the current code and `git log --oneline master -- <path>`; if the item is
already done, say so in `DONE.md` and take the next row. Confirmed done as of 2026-09-21: #23
(freeze submit under UI), #33 (world-records renormalize), #34 (per-emit copy), #36 (radar blip
batching), #55 (hash32 join), #67 (reduced-motion query cache), #78 (effect light pool is 2+6).

## Explicitly owner-hardware — do not attempt

These need the owner's actual GPU/driver environment; a clean machine cannot answer them:

- #68 ANGLE backend A/B ("on this GPU"), #32 KTX2→BC7 confirmation on the real device, #69
  Electron-vs-browser frame pacing (the VM's vsync environment is not the owner's).
- Any claim of the form "fps improved on the target machine." Produce the patch and the
  mechanism; leave the verdict to the owner's witness run after import.

## Jobs, in order

Take the first row whose folder does not exist. Finish it. Take the next. When the list is done,
stop. Do not invent a job beyond this table.

### Phase A — baselines and instrumentation (cheap, everything below cites these)

| Job id | Kind | What you produce | Why |
|---|---|---|---|
| `quiet-witness-baseline` | report | `npm run probe:runtime-witness` and `npm run check:baseline` on the idle machine. `report.md`: full phase table (sim/simFrame/vfx/ui/render/presentation, avg + p95), long-task count, draw calls, detected GPU tier, cold first-draw and GPU-resource timings, three runs. Copy `.devshots/runtime-witness/report.md` into the folder. | The reference numbers every later job compares against. |
| `cpu-profile-flight` | report | A V8 CPU profile (`--cpu-prof`, or Electron `--js-flags=--cpu-prof`) covering ~60 s of settled flight plus the busiest scene reachable. `report.md`: top 40 functions by self and total time, named hot loops, and which subsystems own them. | The map for every CPU patch job. |
| `alloc-profile-flight` | report | A heap/allocation profile of the same window: top allocation sites per frame and per sim tick, sizes, and which are per-frame churn vs one-time. | Allocation churn is the GC/long-task driver; this ranks what to kill. |
| `boot-stage-profile` | report | Cold boot to first control, three runs. `report.md`: per-stage wall-clock breakdown (fetch, decode, physics init, shader compile, first present), the shader-compile census (how many programs, when, serial or parallel), and where the GPU-resource wall sits. | The loading path is the worst felt problem; this decomposes it before `shader-admission-slice` lands. |

### Phase B — guardrails

| Job id | Kind | What you produce | Why |
|---|---|---|---|
| `guard-the-wins` | patch | Backlog #70: a check that fails if any shader links after the first presented frame, a single scoreboard command wrapping the witness phases, and a 20-minute soak whose resource counts must plateau. Wire them into `scripts/` + the check runner with focused tests. | Guardrails make every optimization below provable and stop regressions from shipping silently. |

### Phase C — the big levers

| Job id | Kind | What you produce | Why |
|---|---|---|---|
| `dynres-target-pool` | patch | Backlog #89 + the payoff behind it: pre-allocate the bloom/post render targets once at max size and render scaled frames into viewport sub-rects (no `setSize` realloc on scale change — reallocations stall 0.5–1.3 s on the owner GPU), then enable `dynamicResolution` for the `integrated` tier (`_dynResAllowed` in `src/render/renderer.js`; floor 0.5 already plumbed). Composite texel uniforms, bright-pass sampling, and any post pass reading `rtScene` must be correct under a sub-rect. Focused tests: scale change causes zero target reallocations. | The biggest steady-state lever: fill-bound frames scale with pixels. Functional proof is possible on your tier (dynRes already runs for `software`); the fps verdict is owner-verify. |
| `shader-admission-slice` | patch | Backlog #24 + #27 + #29 + the first-draw gap: time-slice in-flight admission (new ships, promoted rocks) the way loading now is; schedule background admission with `scheduler.yield()` after present; `renderer.debug.checkShaderErrors` off on the player route; close the uncaptured-first-draw-resource path that forces the failsafe-open submission gate. Use the `boot-stage-profile` report. | ~29 s in GPU resources plus a 243 ms first-draw brick were measured on the owner machine; mid-game hitches share the mechanism. |
| `integrated-quality-preset` | patch | The opt-in "integrated GPU" tier the backlog groups at #86–#94: one settings surface that bundles shadows off, reduced bloom levels, render scale 0.85 + sharpening, a 30/45 fps cap option, post effects off, particle density, lower NPC traffic density, and a 512² hull-texture tier — each item only where the plumbing exists or is cheap to add. Default off; the game may *suggest* it when `detectGpu` reports integrated. | This is the largest single fps gain available on the owner GPU, and it is entirely opt-in so it carries no default-visual risk. |
| `bloom-cost` | patch | Backlog #79 + a composite-pass audit: cheaper HDR bloom buffer format and/or half-resolution bloom where captures show it identical, plus any per-pixel waste in the composite block (grain/vignette/toe math that can be hoisted or skipped when the parameter is zero). | `bloomScene` was ~7–10 ms on the owner iGPU — the single largest GPU line. |
| `residency-budget` | patch | Backlog #30 + #31: enforce a texture/mesh residency budget during long visits, sized from detected hardware (integrated shares system RAM — budget tighter), and free transcoded texture bytes from JS memory after upload. | Long-session degradation and driver memory pressure. |
| `jump-arrival-spread` | patch | Backlog #22 + #25 + #26: spread `world.enterSector`'s remaining synchronous work (~57 ms measured) and newly-composed ship texture uploads across frames; warm ships about to enter view from traffic intent instead of the whole sector. | Kills the sector-arrival hitch spike. |

### Phase D — CPU sweeps (one patch per backlog item inside one folder)

| Job id | Kind | What you produce | Why |
|---|---|---|---|
| `steady-state-cpu-render` | patch | Render/UI-side items: #18 (one scene-graph walk per frame), #19 (verify first — shared uniform writes may already be cheap), #37, #38, #39, #41, #43, #44, #45, #46. Skip items already done on master; note each verdict in `DONE.md`. | Many small safe wins; separate patches keep import selective. |
| `steady-state-cpu-sim` | patch | Sim-side items: #35 (confirm call frequency first — it may be episodic, not per-tick), #50–#54, #56–#59, #61. Determinism evidence per patch. | Same, on the tick path. |
| `draw-call-batch` | patch | #62–#66 and #85 where they change no pixels: per-template path maps, pod/greeble batching, pre-merged roster hulls, LOD-aware traffic spawn, on-screen conditions for presenters, landmark-as-map-fact, earlier instancing/impostors. | Draw calls were 115 on the owner run — decent, but each point is GPU time. |

### Phase E — diagnostics and tail

| Job id | Kind | What you produce | Why |
|---|---|---|---|
| `gl-error-flood` | report | Backlog #20: capture and identify the `GL_INVALID_OPERATION` flood in flight ("texture format and sampler type"). If the fix is unambiguous, include it as a patch series in the same folder; otherwise `report.md` names the exact call path and the fix sketch. | A per-frame driver error flood has real cost and corrupts diagnostics. |
| `ktx2-path-audit` | report | The code half of #32: trace which transcode targets the loader requests and what the VM's backend actually received; list where an RGBA32 fallback would hide. The on-hardware confirmation stays owner-side. | A silent RGBA32 fallback costs 4× memory and upload on every compressed texture. |
| `long-soak-witness` | report | One 60-minute headless witness session: heap size, resource counts, and phase timings at 5/15/30/60 min. `report.md` with growth curves and whether they plateau. | Feeds `residency-budget`; proves or disproves long-session degradation. |
| `save-size-quiet` | report | One two-hour headless session. Record save bytes at start, 30/60/120 min. | Save growth is a slow leak class only an idle machine can size. |
| `moonshot-assessment` | report | A written feasibility/payoff assessment of backlog #95–#100 against the *current* code (WebGPU renderer, worker sim, NPC hull triangle diet, far-ship impostors, fixed NPC hulls, baked contact shadows). Read the code, estimate honestly, recommend at most one worth doing. No implementation. | The owner decides architecture bets with numbers, not vibes. |
| `everyday-kit-stills` | stills | Chase or berth stills of the pieces under `assets/incubator/everyday_space_kit/` so a person can see which read as objects. | Tail work — only after every perf row above. |
| `npc-kit-stills` | stills | The same for `assets/incubator/npc_activity_pack/`. | Render only. |

## Already claimed on `vm-drop` — do not redo

These folders exist on the remote branch; the corresponding work is spoken for regardless of local
state: all `*-chase` ship jobs, `quiet-crucible`, `quiet-open-flight`, `quiet-solid-world`,
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
