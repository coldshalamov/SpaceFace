<!-- LIFETIME: DURABLE -->
# Make the game fast — fix brief

**This is a FIX brief, not a measurement brief.** The instrumentation phase is over. Do not build
more of it. If you find yourself writing a counter, a harness, a manifest, a budget, or a gate,
stop — that is the failure mode this document exists to end.

Branch: `claude/perf00-20260727` in `C:\Users\93rob\sf-perf-admission-20260726` (worktree of
SpaceFace). Merge to master when a fix is proven.

---

## The rule

**Ship fixes. Measure only to confirm a fix worked.**

Days went into instrumentation and the game got ~3% faster. Instrumentation does not make anything
faster — it tells you where to cut. The cutting has not happened yet. That is the entire job now.

You do **not** need a quiet machine. You do **not** need a deterministic harness. Those are needed to
publish formal acceptance evidence, which is a program artifact and not a speed improvement. Every
lead below is diagnosable and fixable from what is already known.

---

## Step 0 — before touching game code, confirm the GPU is real (5 minutes)

Open the game the way a player would and check what renderer the browser actually gave it.

This has bitten this project before: a measured 2-3 fps was **browser SwiftShader software
rendering**, not game code. If the player's session is software-rendering, no amount of game
optimisation matters and every other lead here is a waste of a day.

`state.render` exposes the GPU tier; the probe prints it as
`gpu: ANGLE (...) tier=software software=true`. In headless tests that is **expected and normal**.
What matters is whether it says `software` in a **real headed browser on the user's machine**.

- If a real session reports software → that is the whole performance problem. Fix GPU acquisition
  (driver, browser flags, hardware acceleration setting, blocklist) and stop.
- If it reports a real GPU → continue to Lead 1.

---

## Lead 1 — sprite shader program thrash (HIGHEST VALUE, root cause narrowed)

**The symptom, measured and reproduced across four probe runs:** a sprite shader program is linked
*inside* `WebGLRenderer.render → renderBufferDirect → setProgram`. That is a **draw-time link**: the
main thread blocks compiling a shader in the middle of a frame it is trying to draw. A GL program
link is **50-300 ms**. That is a visible freeze, and it is the most likely cause of the choppiness.

**Why it is a bug and not just work:** the linked program's cacheKey is **byte-identical** to one
already compiled during boot. THREE only recompiles an identical cacheKey when the earlier program
was *released* — `usedTimes` dropped to 0 because every material using it was disposed. So something
disposes a sprite material and then a new sprite immediately needs the same program back.

**Where to look, in order:**

1. `src/render/spaceBackground.js` — **the strongest candidate.** It creates `SpriteMaterial`s at
   lines ~1862 and ~2178 (planet impostors / stars) and disposes them at ~1793
   (`p.sprite.material.dispose()`) and ~1799. Fresh materials + real disposal + the same GL program =
   exactly the observed pattern. If impostors are recycled during flight, this is it.
2. `src/render/renderer.js:2770` — `disposeObject()` disposes every material it walks, exempting only
   `userData.sharedContactShadow`. Any *shared* material reachable from a disposed object gets killed
   for every other user of it.
3. `src/ui/asteroid/asteroidRenderer3d.js:576` — a fresh `SpriteMaterial` per badge.

**Not the cause:** `visualFactory.getMaterial()` is safe. It wraps cached materials in
`noDispose()` (`obj.dispose = () => {}`), so the cached halo material cannot be released. Rule it
out and move on.

**The fix shape:** share one `SpriteMaterial` per distinct configuration instead of creating and
disposing per instance, or protect the recycled ones with the same `noDispose` treatment. Sprites
differing only by texture and colour can share a program.

**How to confirm you fixed it — no quiet machine needed:** run `npm run probe:shader-timeline` and
read one line: `POST-BOOT SHADER COMPILES`. It must be **0**, and the `class=DRAW-TIME-MISS` stacks
must be gone. That is a count, so it is valid no matter what else runs on the machine. Before the
fix, idle flight shows 1 and scripted stimulus shows 3-5.

---

## Lead 2 — weak material batching (steady tax, not a hitch)

Measured over 1218 post-boot frames: **36.7 draw calls and 22.6 program switches per frame.** Nearly
every other draw call changes shader program. Each switch is a GPU pipeline-state change.

36.7 draw calls is genuinely low, so draw-call count is *not* the problem and the older draw-call
theory stays falsified. The cost is in the switching. Look at render order / material sorting: if
objects sharing a material are not drawn consecutively, sorting them cuts switches without changing a
single pixel.

Also `58.4 texture binds per frame` against 36.7 draws — about 1.6 per draw call. Worth a look after
the switches, not before.

**Confirm with:** the same probe line — `programSwitches` per frame should fall. Counts, so
contention-proof.

---

## Lead 3 — the spike frames ARE the stutter

Smoothness is variance in work per frame, and the counters record per-frame peaks. These are the
frames that hitch:

| counter | per-frame average | worst single frame |
|---|---:|---:|
| `bufferFullUploads` | 0.1 | **135** |
| `textureBinds` | 58.4 | 172 |
| `drawCalls` | 36.7 | 79 |
| `bufferPartialUploads` | 68.9 | 123 |

**`bufferFullUploads` is the standout**: the steady state is essentially zero, and one frame did
135 full `bufferData` uploads. A full upload reallocates GPU memory; 135 in one frame is a stall. It
lands during boot (post-boot totals are far too small to contain it), so it is a **loading hitch**,
not an in-flight one — still worth killing, but fix Lead 1 first.

The tool already names the frame: `snapshot().events` plus `peakPerFrame` in
`.devshots/perf/shader-compile-timeline.json`. No new code required.

---

## Lead 4 — the sim catch-up cap (verify before believing)

The sim ran at its 4-step catch-up cap on a large share of frames, past which whole ticks are shed.

**Do not chase this yet.** Every measurement so far is headless SwiftShader at 15-20 fps, and 3-4
catch-up steps is the *arithmetic consequence* of a 50 ms frame, not an independent defect. On real
hardware at 60 fps it should sit at 1. Re-read `stepsPerFrameHistogram` once the GPU is confirmed
real; if it still pins at 4 on real hardware, then it is a defect worth chasing.

---

## What already exists — use it, do not rebuild it

- `npm run probe:shader-timeline` — boots to flight, finds the boot boundary, counts everything,
  classifies each shader link as `DRAW-TIME-MISS` vs `precompile`, and writes
  `.devshots/perf/shader-compile-timeline.json`. **This is your before/after tool.** Takes ~30 min on
  this host (software rendering is slow); it is a count, so run it whenever, with anything running.
- `src/core/perfCounters.js` — the counter core. Every GL, DOM and loop counter, with totals,
  post-boot, off-frame and per-frame peaks.
- `window.__SPACEFACE_PERF__.getCounterSnapshot()` — live in any session started with
  `?perfCounters=1`. Not debug-gated.
- `src/render/glInstrumentation.js`, `src/ui/domInstrumentation.js` — the producers.

## Already answered — do not re-investigate

- **Steady-state choppiness is not shader compilation in bulk.** 602 idle frames, 1 compile. The
  remaining compiles are the Lead 1 defect, not general compilation load.
- **Post-boot render-target allocations and resizes are both 0.** Not the problem.
- **Dynamic buffering works.** 68.9 partial vs 0.1 full uploads per frame.
- **Draw-call count is not the problem.** 36.7/frame.

## Hard rules

- **No quality reduction.** Not a lever. The user has ruled it out.
- **Do not change `PRODUCTION_UPDATE_ORDER` or the manifest hash.**
- Concurrent agents edit this worktree: use path-limited `git add -- <paths>` and
  `git commit -m "..." -- <paths>`, and never clear a "stale" `index.lock`.
- Run targeted gates (`check:perf-counters`, `check:baseline`, `check:perf-packets`), not the whole
  `npm run check` tree.
- The worktree is CRLF. `\n`-anchored multi-line find/replace silently matches nothing.
