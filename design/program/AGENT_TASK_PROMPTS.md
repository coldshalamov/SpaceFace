<!-- LIFETIME: VOLATILE -->
# Copy-ready prompts for SpaceFace agents

```yaml
refreshed: 2026-08-29
baseCommit: 10ff2f7fd97dc4f2ca671a66382b06e5b9c837ab
expiresAfterCommits: 100
expiresAfterDays: 30
```

These prompts are intentionally plain. Technical truth comes from the canonical map, current PQ packet, live owners, tests, and evidence—not from copying a large old status snapshot into the prompt.

## Which door?

- **Exact PQ / exact bug / exact file / exact outcome** → use Prompt B or C and `node scripts/program-dispatch.mjs --id PQ-XXX`.
- **NEXT / develop the game / make it professional / broad unnamed work** → start at [`CENTRAL_BRAIN.md`](./CENTRAL_BRAIN.md) and run `python tools/agentic/select_next_work.py --format prompt`.
- **Campaign / overnight / do all of it** → run `python tools/agentic/manager_cycle.py --refresh --limit 3`, execute one bounded unit, integrate it, then refresh before choosing the next.
- **Explicit INFERENCE** → use [`INFERENCE_LANES.md`](./INFERENCE_LANES.md) and `design/vision/INFERENCE_CONVERGENCE_METHOD.md`.
- **Jules/cloud agents** → use [`jules/README.md`](./jules/README.md). Jules is a candidate bank, not the PQ queue or acceptance authority.

## Starting several threads

For broad parallel work, let one manager invocation rank a slate, then dispatch disjoint exact units. `NOW.md` owns only exact paths currently being mutated. Parallelism is capped by write-surface collisions and integration bandwidth, not by how many agents are available.

Do not create permanent subsystem lanes. Do not make every worker a reviewer. One integrator owns publication of each candidate.

## Prompt A0 — broad campaign / overnight

```text
This is a Central Brain convergence campaign, not one task and not a hard-coded graphics loop.

Start at CANONICAL_BUILD_MAP.md, design/program/CENTRAL_BRAIN.md, and design/program/NOW.md. Run:

python tools/agentic/manager_cycle.py --refresh --limit 3

Take the highest-ranked dependency-front admitted unit. Open it through:

node scripts/program-dispatch.mjs --id PQ-XXX

and its exact active packet. The manager ranks the existing queue; it does not replace it.

Implement one bounded player outcome. Reuse existing owners, deterministic lab, Combat Lab, runtimeWitness, sessionObserver, validation broker, visual capture and asset tooling before inventing infrastructure.

After each integrated unit, replay the relevant scenario/evidence and refresh the manager ranking before selecting another unit. Do not let one prestige-art family consume the whole campaign while actionable integrity, flight/control, combat/AI or severe frame-liveness debt is red.

For feel/performance work: characterize first, make one causal intervention, replay the same seed/input policy, and compare. After two failed repair cycles under the same causal model, change the model instead of looping.

For visual work: review at the shipping camera, use one cold reviewer by default, and continue only for named play-size defects. Fixed pass/reviewer counts are not universal gates.

Do not count scouts, plans, checks, screenshots or reviews as production. Keep going until the user's campaign scope is exhausted, no dependency-front admitted work remains, or the next high-value item requires an explicit product decision/external dependency.
```

## Prompt A0-P — hitching / make the game smooth

```text
This is an explicit performance campaign. Start at CANONICAL_BUILD_MAP.md §8.4, design/program/PERF_HITCH_CAMPAIGN.md and the current PQ-129 packet.

Run node scripts/program-dispatch.mjs --id PQ-129. Re-measure the current route/pole before reviving an old optimization hypothesis. Preserve default picture/content quality.

Use runtimeWitness for coarse liveness/hitch ownership and the observatory/replay path where available. Measure distributions and hitch events, not average FPS. Make one causal change, run a matched A/B, KEEP/REVERT/NO_OP, then take the next current owner only if evidence justifies it.

Do not start Worker/WebGPU/native work because the local bug is hard. Do not lower population, effects, shadows, draw distance or authored detail as a performance win.
```

## Prompt A0-G — explicit fleet / 3D graphics work

```text
This is an explicit graphics campaign. Start at CANONICAL_BUILD_MAP.md §13, docs/visual-assets/README.md, design/program/GRAPHICS_ITERATION_LOOP.md, and the exact PQ packet/campaign named by the user.

Player-camera truth wins. Establish a shipping-camera baseline, make one coherent form/material intervention, recapture, and use one cold composite review by default. Continue only for a named defect still visible at play size. If two valid passes under the same causal model do not change the disposition, stop polishing and return the asset to the manager.

Prioritize silhouette, negative space, canopy/drives/wells, major material grouping and authored identity before microdetail. No cabin/seat work closes a top-down ship unless it actually reads from the shipping camera. Preserve LOD/release/material truth and performance.
```

## Prompt A0-W — Asteroid Works playfield

```text
This is the explicit Asteroid Works playfield campaign. Start at design/ASTEROID_WORKS_DESIGN_LAW.md and the current PQ-130 packet. Dispatch with node scripts/program-dispatch.mjs --id PQ-130.

The board is the game. Preserve the current owner rulings in the design law rather than polishing an obsolete gray console. Execute the first dependency-front leaf, prove its player outcome in the real works route, commit it, then continue only if the user asked for the campaign.

Do not substitute the global selector mid-leaf. Do not fold this into fleet graphics or generic performance work.
```

## Prompt A0-WA — Asteroid Works authored objects

```text
This is the explicit Asteroid Works authored-asset campaign. Start at design/program/ASTEROID_WORKS_ART_CAMPAIGN.md, docs/visual-assets/README.md, design/program/GRAPHICS_ITERATION_LOOP.md, and node scripts/program-dispatch.mjs --id PQ-131.

Use the works camera beside a representative flight frame. Replace procedural stand-ins through the normal authored asset/release/loader path. One shipping-camera composite review is the default; revise only named visible defects and stop on marginal no-gain rather than a fixed review/pass quota.

Do not lower quality by shipping boxes, billboards or emissive-outline stand-ins.
```

## Prompt A0-H — orphan harvest / unused work

```text
This is an explicit recovery campaign. Start at CANONICAL_BUILD_MAP.md and design/program/WORKTREE_RECOVERY.md or the currently named orphan-harvest playbook/ledger.

Classify each candidate against current master owners. Port only complete or bounded-finishable work; never merge a stale branch wholesale. Reuse authored assets when they fit a current role, and record a real disposition for useful work that cannot be fielded now.

One focused proof and one review only when needed. Never re-review the same hash or rerun the same unchanged failure. Commit each integrated unit separately.
```

## Prompt A — find and finish one highest-leverage task

```text
Finish one SpaceFace task end to end.

Start at CANONICAL_BUILD_MAP.md, design/program/CENTRAL_BRAIN.md, and design/program/NOW.md. Run:

python tools/agentic/select_next_work.py --format prompt

Take the returned dependency-front unit, then open it through node scripts/program-dispatch.mjs --id PQ-XXX and the exact active packet.

Before mutation, characterize the player-visible claim with the packet's narrowest existing deterministic/live scenario. Name one causal hypothesis. Add a NOW row only while actually editing. Preserve foreign dirty hunks; choose a disjoint unit rather than overwriting them.

Implement the bounded outcome. Reuse current owners and instrumentation. After mutation, replay the same scenario/seed/input policy when applicable and keep the change only if the claimed player result improves without a new regression. Do not loop on an unchanged failure fingerprint.

Stop after one finished task. Final report:
RESULT: DONE or NOT DONE
PLAYER RESULT: one plain sentence
COMMIT: hash, or none
PROOF: checks/evidence actually completed
REMAINING: none, or exact missing outcome
NEXT ACTION: one executable next task
DIRTY PATHS: every uncommitted path, or none
```

## Prompt B — finish one exact queue unit

Replace `<UNIT_ID>` once before sending.

```text
Finish exactly `<UNIT_ID>` in SpaceFace and do not start another unit.

Read CANONICAL_BUILD_MAP.md and design/program/NOW.md. Locate `<UNIT_ID>` in the current queue/read view and open its parent through node scripts/program-dispatch.mjs --id PQ-XXX plus its active packet. Exact user scope outranks Central Brain ranking.

Deliver the exact player outcome through current owner seams. Record a NOW row only during mutation. Preserve foreign dirty hunks and arrange a real handoff only for an exact overlapping write.

Use the cheapest proof that can falsify the claim. For temporal behavior, replay a named scenario/seed/input policy. For appearance, inspect the shipping camera. Do not create a new framework because validation is inconvenient.

Keep working until the outcome is implemented, focused proof is green, required route/review evidence is honest, and the exact files are committed/pushed. Update the normal packet/receipt/queue truth. Then stop.
```

## Prompt C — finish or discard an existing dirty candidate

```text
Take responsibility for the named unfinished candidate. Do not create a parallel copy.

Read CANONICAL_BUILD_MAP.md, design/program/NOW.md, the candidate diff/evidence, and its current owning packet. Determine the intended player outcome. Either finish it through the real production owner and prove it, or explicitly discard/revert it while retaining valuable causal findings.

A pile of files, passing source tests or a handoff note is not DONE. Commit/push the finished result or the explicit discard/accounting result. List remaining dirty paths and stop.
```

## Prompt J — directed Jules/cloud task

```text
Use the existing Jules task bank and dispatcher. Select one candidate whose collision key/write surface does not conflict with current work. One task per cloud branch/PR.

Jules must not edit the task bank, program queue, NOW board, root authority or expected goldens. Its output is a candidate only. A local integrator rebases it onto current master, reviews the diff, runs the authoritative focused proof, and only then merges.

Prefer cloud inference for low-collision test hardening, bug hunts, determinism checks, isolated UI/data/content work and bounded implementation. Do not count requests dispatched as delivery of the current PQ player outcome.
```
