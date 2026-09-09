<!-- LIFETIME: DURABLE -->
# SpaceFace Jules directed task bank

This directory turns surplus cloud inference into bounded, reviewable work. It contains **1,000 exact tasks** for Jules, a deterministic selector/claim tool, human-readable catalogs, and a local-integration contract.

It is deliberately **not** a second SpaceFace roadmap or acceptance authority. The live program queue still owns admitted product work. A bank task is a candidate cloud job. A smarter local integrator decides whether its PR is correct, current, valuable, collision-free, and mergeable.

## What the bank optimizes for

Jules is most valuable when each job has a narrow truth condition and a cheap failure mode. The bank therefore favors:

- deterministic regression tests and missing edge coverage;
- bounded bug hunts that may terminate honestly as `NO_CHANGE`;
- save/reload, repeated-init, stale-reference, disposal, and shell-parity work;
- data and manifest integrity;
- measured structural performance work with no quality cuts;
- small UX, AI, mission, world, rendering, VFX, audio, and content slices through existing owners.

It avoids open-ended “improve the game” prompts, broad subsystem rewrites, speculative frameworks, queue mutation, golden pinning, and visual work judged from source alone.

## Inventory

| Lane | Tasks | Primary model |
|---|---:|---|
| Deterministic test hardening | 170 | Flash |
| Bounded bug hunts and surgical fixes | 150 | Flash; Pro for live integration |
| Determinism, replay, save, and lifecycle | 90 | Flash; Pro for serialization review |
| Performance, allocation, residency, and disposal | 90 | Mixed |
| UI, UX, input reachability, and accessibility | 100 | Flash; Pro for hierarchy |
| Flight, combat, AI, and game feel | 100 | Mixed |
| World, economy, missions, mining, and progression | 100 | Mixed |
| Rendering, assets, VFX, camera, and audio | 80 | Mixed |
| Tooling, data integrity, diagnostics, and documentation drift | 70 | Flash; Pro for operator integration |
| Small creative production slices | 50 | Pro |
| **Total** | **1,000** | **700 Flash / 300 Pro** |

The canonical data is [`task-bank.json`](./task-bank.json). The schema is
[`task-bank.schema.json`](./task-bank.schema.json). The generated catalogs start at
[`catalog/INDEX.md`](./catalog/INDEX.md).

## Authority boundary

A task may inspect the paths listed in `inspectPaths`; those paths are a routing hint, not permission to ignore the current working tree or nearest `AGENTS.md`.

Every cloud job must:

1. start from current `master` and record its actual base SHA;
2. read `CANONICAL_BUILD_MAP.md`, root `AGENTS.md`, the task’s `readFirst`, and nearest scoped instructions;
3. confirm the selected live owner before mutation;
4. finish exactly one task on one branch;
5. open at most one coherent PR;
6. return `NO_CHANGE` without an empty commit or PR when the scoped defect/gap is absent;
7. leave merge and acceptance to a local integrator.

Bank tasks may not edit the canonical map, root authority, live queue, `NOW.md`, the task bank, or telemetry golden envelopes. They may not lower default visual/gameplay quality.

## Validate

```bash
node scripts/jules-dispatch.mjs --validate
node --test test/jules-task-bank.test.mjs
```

After this PR is integrated, the package aliases are:

```bash
npm run jules:validate
npm run check:jules-task-bank
```

## Render one exact prompt

```bash
node scripts/jules-dispatch.mjs --id JULES-0001 --format prompt
```

The rendered prompt includes repository law, exact scope, work steps, acceptance criteria, suggested checks, an honest negative result, and the local merge gate.

## Select tasks

```bash
# Safest next unclaimed task, one active task per collision domain.
node scripts/jules-dispatch.mjs --next

# Twenty Flash tasks from test and bug lanes.
node scripts/jules-dispatch.mjs \
  --next --count 20 --model flash \
  --lane test-hardening,bug-hunt \
  --risk low,medium --max-per-collision 1 \
  --seed 2026-08-27-am --format prompt

# Ten Pro tasks for AI/world/content judgment.
node scripts/jules-dispatch.mjs \
  --next --count 10 --model pro \
  --lane ai-combat-flight,world-economy-missions-mining,creative-expansion \
  --max-per-collision 1 --seed 2026-08-27-pro --format prompt
```

Selection is deterministic for a given bank, state, filters, and seed. It round-robins collision domains instead of spraying many agents at the same owner.

Useful filters:

```text
--model flash,pro
--lane <comma-separated lanes>
--risk low,medium,high
--size xs,s,m
--priority 1,2
--max-priority 2
--tag <required tags>
--exclude-tag <forbidden tags>
--search <text>
--max-per-collision <N>
--max-per-lane <N>
```

## A 300-request daily schedule

Claim the Flash batch first. The Pro selector then sees those active collision domains and routes around them.

```bash
node scripts/jules-dispatch.mjs \
  --next --count 210 --model flash \
  --risk low,medium,high --max-per-collision 2 \
  --seed 2026-08-27-flash \
  --claim-selected --worker jules-flash \
  --format prompt > /tmp/spaceface-jules-flash.txt

node scripts/jules-dispatch.mjs \
  --next --count 90 --model pro \
  --max-per-collision 2 \
  --seed 2026-08-27-pro \
  --claim-selected --worker jules-pro \
  --format prompt > /tmp/spaceface-jules-pro.txt
```

That is the maximum-throughput recipe, not the recommended first day. Begin with 20–40 tasks, measure Jules’s defect fabrication rate, diff cleanliness, test quality, and merge yield by lane, then increase only the lanes producing useful PRs.

## Local dispatch state

The CLI stores claims and terminal results in the repository’s Git metadata via
`git rev-parse --git-path jules-dispatch-state.json`. It does not mutate tracked files.

```bash
node scripts/jules-dispatch.mjs --claim JULES-0001 --worker jules-01
node scripts/jules-dispatch.mjs --complete JULES-0001 --result PR_READY --pr <PR-URL>
node scripts/jules-dispatch.mjs --complete JULES-0002 --result NO_CHANGE --note "existing coverage is complete"
node scripts/jules-dispatch.mjs --complete JULES-0003 --result BLOCKED --note "headed GPU unavailable"
node scripts/jules-dispatch.mjs --release JULES-0004
node scripts/jules-dispatch.mjs --stats
```

A custom shared state path can be supplied with `--state <path>`. Do not commit that state file.

## Collision keys

Every task has a `collisionKey`. Exactly five task facets share each collision key, yielding 200 independent subject domains.

The selector’s `--max-per-collision` applies to active claims plus the new selection. This is a coarse merge-conflict brake, not path ownership. A local integrator still inspects exact diffs and current dirty hunks.

## Required Jules result

Every rendered prompt requires:

```text
TASK:
RESULT (PR_READY | NO_CHANGE | BLOCKED):
BASE_SHA:
COMMIT or none:
PR or none:
PLAYER_OR_ENGINE_RESULT:
FILES_CHANGED or none:
FOCUSED_PROOF:
UNPROVEN_OR_BLOCKED:
LOCAL_REVIEW_FOCUS:
DIRTY_PATHS or none:
```

`NO_CHANGE` is signal, not failure. It prevents a weaker model from inventing defects or ornamental edits merely to satisfy a PR-shaped expectation.

## Local PR integration

Use [`LOCAL_INTEGRATOR_PROMPT.txt`](./LOCAL_INTEGRATOR_PROMPT.txt) as the campaign prompt for the stronger local model.

For each returned PR:

1. Verify the task ID, actual base SHA, and exact requested outcome.
2. Reject task-bank, queue, canonical-map, authority, expected-golden, dependency, broad-formatting, and quality-cut edits.
3. Confirm the PR touched the selected live owner, not a legacy lookalike.
4. Reproduce the red condition or review the new test’s ability to fail meaningfully.
5. Rebase/current-master review the complete diff; deduplicate against already merged Jules work.
6. Run the narrow proof, then the smallest surrounding gate.
7. For visible changes, inspect ordinary-route evidence at normal play scale.
8. Merge only coherent independent value. Record `PR_READY`, `NO_CHANGE`, or `BLOCKED` in dispatch state.

A task-bank record does not become accepted program work because a cloud PR exists. The normal SpaceFace authority and evidence chain still decides that.

## Throughput telemetry

Track merge yield by lane and model:

```text
dispatched
PR_READY
NO_CHANGE
BLOCKED
rejected_scope
rejected_wrong_owner
rejected_bad_test
rejected_regression
merged
post_merge_revert
review_minutes
```

The useful number is not PR count. It is **merged independent value per local-review minute**. Increase quotas where that rises; cut lanes where Flash produces plausible garbage faster than the integrator can reject it.

## Catalogs

- [Deterministic test hardening (170)](./catalog/test-hardening.md)
- [Bounded bug hunts and surgical fixes (150)](./catalog/bug-hunt.md)
- [Determinism, replay, save, and lifecycle (90)](./catalog/determinism-save.md)
- [Performance, allocation, residency, and disposal (90)](./catalog/performance-lifecycle.md)
- [UI, UX, input reachability, and accessibility (100)](./catalog/ui-ux-accessibility.md)
- [Flight, combat, AI, and game feel (100)](./catalog/ai-combat-flight.md)
- [World, economy, missions, mining, and progression (100)](./catalog/world-economy-missions-mining.md)
- [Rendering, assets, VFX, camera, and audio (80)](./catalog/render-assets-vfx-audio.md)
- [Tooling, data integrity, diagnostics, and documentation drift (70)](./catalog/tooling-data-docs.md)
- [Small creative production slices (50)](./catalog/creative-expansion.md)

The catalogs are generated views for review and browsing. `task-bank.json` is canonical. Do not hand-edit catalog entries independently.
