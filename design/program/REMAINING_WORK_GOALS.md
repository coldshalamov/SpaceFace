<!-- LIFETIME: STABLE -->
# The four remaining goals

Every plan in [`CANONICAL_BUILD_MAP.md`](../../CANONICAL_BUILD_MAP.md) that produces something a
player notices, reduced to four goal prompts. Hand one to a thread. They are independent: A and D
need no GPU, C needs a healthy one.

Mechanics live in [`DELEGATED_WORK_LOOP.md`](./DELEGATED_WORK_LOOP.md) (cursor-agent worker, Fable
advisor, controller keeps the commits) and [`GRAPHICS_ITERATION_LOOP.md`](./GRAPHICS_ITERATION_LOOP.md)
(model passes). Deliberately excluded: the eight ready `acceptance_capture` units — end-of-line
verification, not building — and §8.2/§8.3's ~68 reserved perf identities, which are investigation
scaffolding that should stay unopened until a measurement points at one.

---

## A · Frontend — jobs J08 to J16

> Finish the frontend program: jobs J08 through J16 in `CANONICAL_BUILD_MAP.md` §11, plus the
> responsive/ultrawide strategy nothing covers.
>
> Read `design/frontend/INSTRUMENT_GRAMMAR.md` before designing anything — it is binding, and
> skipping it is the documented cause of "cheap and uninspired". Then `design/program/DELEGATED_WORK_LOOP.md`.
>
> One job at a time, in order. For each: read the job's section in the map and in
> `design/frontend/NEXT_JOBS.md`, hand cursor-agent a packet with an exact write set, re-run every
> check yourself, capture the screen in a REAL game boot — not a lab fixture, which hid three Power
> Rail defects — commit, then the next job. Do not stop after one.
>
> Call the Fable advisor before committing to an approach on J10, J12 and J13; those are design
> calls, not mechanism.
>
> Most of this is assembly, not invention: the game already computes ~35 ship fields and shows 6,
> runs 183 KB of NPC careers and 350 KB of trade sim that no screen reads, and tracks a bounty that
> appears in zero UI files. Open windows onto what already runs.
>
> Verify with the UI suite plus captures at 2560×1080, 1920×1080 and 1280×720, in default,
> reduced-motion, forced-colors and pseudo-localized. Run `npm run check:playable` before reporting.
>
> Report DONE or NOT DONE in plain language.

## C · Express liner, and three recorded defects

> Finish `PQ-049`, the Massline express liner, then clear three recorded defects. Follow
> `design/program/DELEGATED_WORK_LOOP.md`, and `GRAPHICS_ITERATION_LOOP.md` for the model passes.
>
> `PQ-049` runs in five ordered leaves — start at `design/program/roadmap/active/PQ-049.md` and
> `node scripts/program-dispatch.mjs --id PQ-049`. It is a SEPARATE express-only ship: never replace
> the accepted courier Lark or fold it into the Massline showcase.
>
> Then, in order:
> 1. Nine failing tests in `test/render-package-pilots.test.mjs` — pre-existing on master, all in
>    the package-pool promotion path, symptom is ships settling procedural instead of authored.
>    Diagnose before changing anything.
> 2. Texture density: the contract wants 256 px/m at LOD0 and committed source cannot carry it at
>    fleet scale — LOD0 at 2048 is a 65 MB file GitHub rejects, ~1.4 GB across 22 ships. The fix is
>    keeping high maps out of git (release-only bake, or streaming), not lowering the target. See
>    `PQ-050.md`.
> 3. Split `place_station_trade_hub` into a shell plus detail — 75 MB, 3.7× the next largest asset,
>    15% of all asset bytes in one file. Its admission bug is fixed; the size is not.
>
> Call the Fable advisor before item 2 — it is a pipeline design call.
>
> Report DONE or NOT DONE in plain language.

## D · Performance — `PQ-051` first

> Work the performance program in `CANONICAL_BUILD_MAP.md` §8.1, in the order that section gives.
> Follow `design/program/DELEGATED_WORK_LOOP.md`.
>
> Start with `PQ-051` (`PERF-11-FRAME-LIVENESS`). The map calls it the release-blocking prerequisite
> for every later performance claim: Continue and ordinary flight must never leave a frozen 3D
> picture behind a still-moving HTML HUD. Repair the real renderer/presentation latch — entity
> identity, frame/draw exceptions, WebGL context recovery, presentation scheduling, canvas present.
> NEVER clear, catch or skip work just to keep the HUD alive.
>
> Done for `PQ-051`: on a real save, in browser and desktop, leave loading, fly 30+ seconds, and
> watch simulation, movement, renderer frames and canvas pixels keep moving together with no
> repeating frame error and no unrecovered context loss.
>
> Then continue: `PQ-052` batching, `PQ-053` LOD/HLOD, `PQ-054` admission, `PQ-055` asset transport,
> and the rest in §8.1's order.
>
> These are RESERVED identities, not admitted work. Before implementing each, admit the parent and
> its smallest leaves into `program-queue.json` and create its active packet.
>
> Hard rule from `design/PERF_BUDGET.md`: never pay for performance by lowering render scale,
> effects, shadows, particles, asset detail or content density. Optimize invisible work. Every change
> needs a matched before/after on the same scene and identical visible pixels.
>
> Also fix the known ~250 ms combat spike from a `buildComposedShip` admission stall.
>
> Report DONE or NOT DONE in plain language.

## G · Graphics — the ship campaign

Its own loop file, because the shape is different: reference first, then seven full passes per
model, three angles and three subagent reviews each. Prompt and rules:
[`GRAPHICS_ITERATION_LOOP.md`](./GRAPHICS_ITERATION_LOOP.md).

> Run the graphics campaign. Follow `design/program/GRAPHICS_ITERATION_LOOP.md` exactly.
>
> Pick the work with `node scripts/program-dispatch.mjs --id PQ-050` and take the first claimable
> ship. One ship at a time, finished before the next, ship after ship — do not stop after one.
>
> Reference first: if `assets/ships/<family>/<ship>/reference/` has no image for the construction
> you are about to build, GENERATE one with your image tool before modelling — the specific part
> (wing root fairing, engine bell with vanes, canopy tub with rim), not a beauty shot. Save it there
> and record its provenance.
>
> Then SEVEN complete passes. Each: build the whole ship, export, capture three angles
> (three-quarter, starboard, rear). Every angle must show bow, stern, full span, top and keel — if
> anything is cut off or the ship fills less than a third of frame, ZOOM OUT AND RECAPTURE. Launch
> three subagents, one per angle, with the review prompt in `MODEL_ADVERSARIAL_REVIEW_WORKFLOW.md`
> §4. Implement every real revise item plus what they missed. Record the pass. Repeat.
>
> Commit each pass. Never wire a ship that still loses. Report DONE or NOT DONE in plain language.

---

## What is NOT in these four

- Eight ready `acceptance_capture` units. End-of-line proof, not building. Run them when something
  needs signing off.
- `PQ-061`–`PQ-128` and §8.3's technique inventory. Investigation scaffolding; each says measure
  first and close with no change if it is not the bottleneck. Do not open one speculatively.
