<!-- LIFETIME: ACTIVE_RECEIPT -->
# Handoff — "Orchestrate next build tasks" session (2026-09-04)

**Status: the in-flight work described by the original handoff is finished, committed and pushed.**
This document has been rewritten by the finishing agent. The original forensic reconstruction is in
git history at `b8648310`.

## What the original handoff asked for, and what happened

The prior session left three uncommitted blocks in the working tree, one recovered lane sitting in a
worktree, and a six-item next-queue. All of it is now landed except two roadmap packets that were
never in-flight work — see "Not attempted" at the bottom.

| Queue item | Outcome |
|---|---|
| 1. Triage + commit the three in-flight blocks | **Done** — landed as four commits, not three |
| 2. PQ-180 runtime capture + package scripts | **Partly done** — scripts added; matrix measured; see PQ-180 below |
| 3. Full 9-case swarm AFTER + receipt | **Done** — `cf836f2c` |
| 4. Integrate CONTACT, fix `causalActorId`, re-measure B13 | **Done** — `a3bd740d`, `e5602348`, `2b41fb96` |
| 5. PQ-173 / PQ-186 leaves | **Not attempted** — multi-day packets, see below |
| 6. Finish the feel-regression harness | **Done** — it was already complete; see below |

## Commits added by the finishing agent

| Commit | What |
|---|---|
| `b59cd04a` | PQ-180 frontend grammar matrix harness (10-file write set) |
| `90b60fbb` | PQ-174.00/.01 swarm metrics + wave-1 opening quota 22 → 15 |
| `ed99d6eb` | VFX: point-sprite cloud retired for instanced shard streaks; HDR sprite headroom; authored comet |
| `d81179d0` | FEEL B1 kernel guard with a negative control |
| `2f5f1985` | NOW.md: adopted three stale rows |
| `a3bd740d` | CONTACT PQ-137.11 cherry-picked from `8198c0ed` |
| `223608aa` | PQ-180 package scripts |
| `e5602348` | Knock-attribution split + PQ-137.11 receipt |
| `cf836f2c` | Nine-cell swarm pacing receipt + in-repo evidence bundle |
| `2b41fb96` | Ten-minute knock run made visible to the rollup; receipt corrected |

## Findings a future agent must not lose

**1. The 47-A sim golden is now red for TWO stacked reasons.** The inherited sim-v3 drift was
`0f701fcb…`. Integrating CONTACT `a3bd740d` moved it to `77bbd9cd…`, attributed by elimination
(`src/core/physics.js` and `src/core/sg02DynamicBodyOwner.js` were the only sim code to change).
A contact change altering a scenario containing collisions is expected. **The golden was not
repinned.** Whoever re-records it must account for both causes, not one.

**2. A CRLF trap was in the tree.** Three files had been rewritten with CRLF by a worktree agent —
`capture-combat-vfx-acceptance.mjs` looked like a 2,756-line rewrite and contained 4 real changed
lines. Normalised before committing. `test/dynamic-buffer-ranges.test.mjs` is CRLF *at HEAD* and was
deliberately left alone; check `git show HEAD:<file> | file -` before normalising anything.

**3. Four `dynamic-buffer-ranges` tests fail on clean HEAD.** Verified by restoring HEAD versions and
re-running: the same four packed-instance-prefix cases fail without any of this session's changes.
Inherited, in no gate, left alone.

**4. The swarm commit message overstates one cell.** `90b60fbb` says all three physics seeds clear
wave 1. That held at `1ed1cb2f` where seed 8008 cleared at **89.8 s against a 90 s cap**; at HEAD it
misses, because the CONTACT change shifted that knife-edge cell. The real result is **2 of 9 cells
before, 6 of 9 after** — see `PQ-174-00-01-REPORT.md`.

**5. `barMet` in the knock-budget scenario is not B13.** It is `rate ≤ 2 && magnitude ≤ 0.10 &&
headingChanges === 0` — the countable clauses only. Jitter is measured beside it and deliberately not
folded in. The rollup withholding `met: true` for want of `jitterMeasured` is correct; do not "fix"
it by pointing it at the sign-flip proxy.

**6. The `causalActorId` gap was an instrument-report defect, not physics.** The six unattributed
receipts were all below the knock floor — solver settle, which `directContactCausalActorId` correctly
declines to attribute. Now reported separately from real gaps.

## Baseline and evidence rules (unchanged, still true)

- `check:baseline` is **13/14**; the red is `sim-v3`, now for the two reasons above.
- Headless capture is SwiftShader software rendering and is invalid as motion/feel evidence.
- Do not re-run an unchanged capture against the same candidate; fix code first, then one retry.
- Root owns git index/commits/push, `package.json`, `program-queue.json`, NOW.md, receipts.

## PQ-180 — where it actually stands

The harness is committed and the matrix has now been **run headed against the live UI** for the first
time (previously every runtime cell was `measured:false`). Two things a follow-up must handle:

1. **The probe cannot return to idle flight after many screens.** `Escape` does not close
   `crucible-draft`, `crucible-refit`, `crucible-results`, or any `station-*` surface, and the probe
   emits *"later rows in this pass may be measured through it"*. This fires **mid-pass**, so every
   surface measured after `crucible-draft` in an affected pass may have been measured through a
   screen that never closed. **Those cells are not evidence and must not be absorbed into
   `test/ui-grammar-baseline.json`.** The first owner of these reds is the harness, not the surfaces.
2. **`comms-radial` and `wingman-radial` time out** at 20 s waiting to become visible.

Still to do: `npm run capture:ui-matrix -- --update --headed` (~6 boots per viewport × 3 viewports,
384 PNGs — must be headed), then `npm run check:visual-regression`, calibrating only *unlisted*
surface floors from that run's own repeatability numbers. The five committed floors stay exactly as
measured. `check:ui:grammar-matrix` is deliberately **not** in any gate: the static variant exits
non-zero, and a gate that is red on arrival teaches agents to ignore it.

## The feel-regression harness is finished

`scripts/lib/feelRegression.mjs` is the kernel-level guard for **B1** specifically — the governor
common to all four impulse sources, measured in milliseconds with a negative control that re-injects
the retired counter-thrust and proves the guard fails. Every other reachable bar already has a
real-path bench scenario (`feel.reversal_course` for B2, `feel.screen_crossing` for B3,
`feel.shove_magnitude`, `feel.terrain_slam`, `feel.rope_swing_release`, `feel.stroke_speed`,
`feel.impact_feedback`, `feel.hitstun_curve`, `feel.knock_budget`, `world.reaction_trio`). Adding a
kernel B2 would duplicate a fuller measurement, so it was not added. Its negative control already
satisfies the B1 half of **PQ-186.00**'s done-when.

## Not attempted, and why

- **PQ-173 `.02` (the critic)** needs a vision-capable model, run by a model that did not make the
  change, reproducing the 2026-09-03 audit findings from frames alone. **`.03`** needs one full
  measure→critic→report cycle run end to end. Both are multi-day builds, not in-flight work.
- **PQ-186 `.00`** ("one check per reachable bar, wired into `check:all:smoke`") is gated on
  PQ-137.10 and is a packet in its own right; `.01` (rulings as guards) likewise. `.02` is already
  done.
- **PQ-167.01** stays deferred: four weeks of real owner playtests are external and cannot be
  synthesised.

## Recovery worktrees

`8198c0ed` was integrated from `wt-flight-v2`; its branch `codex/contact-player-knock-20260904-v1`
is still checked out there. The other worktrees under
`C:\Users\93rob\Documents\Codex\2026-09-04\...\work\delegation\` (wt-bench, wt-contact-v4,
wt-flight-camera-v6, wt-flight-governor-v2, wt-force, wt-impact-v3, wt-world-patrol-v5, wt-world-v2)
belong to earlier fun-recovery lanes. Per `design/program/WORKTREE_RECOVERY.md`, do not delete a ref
or clone until its cleanup gate is durable.
