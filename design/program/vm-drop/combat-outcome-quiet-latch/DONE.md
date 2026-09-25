# DONE — combat-outcome-quiet-latch (#163)

## Summary

Quiet open flight still paid `combatOutcome.update`'s full `shipLike` walk
every 4 ticks, looking for `ai.forceFlee` / `ai.fsm === 'flee'` stamps that had
not been recorded yet. It did this even when no such candidates existed. The
common flee path already records through the `ai:flee` event. Production now
**quiet-latches** the scan after a scan that records nothing.

The latch stays armed while three things hold: entity-index membership version
is unchanged, the wake seq is unchanged, and less than 0.5 s of simTime has
passed since the latch armed. It wakes on:

- outcome seams (`entity:killed` / `ai:flee` / `combat:subsystemDisabled` /
  `combat:surrendered`)
- `entity:spawned` / `entity:destroyed`
- `combat:damage`
- `ai:stateChange`
- `surrender:escaped`
- `difficulty:pinReleased`
- `pirateParley:started|resolved`
- `pirateDisengage:triggered`
- `save:loaded` / `sector:enter` / `game:new`

After a wake the original 4-tick cadence resumes unchanged. Soft-GPU fps not
claimed. Picture contract ON.

This is a fresh registry.step residual named by the #162 digest ("combatOutcome
4-tick shipLike flee-scan"). It is not a rediscovery of packCombat / stampNear /
lifetime / classify / trust-sleep / bandRadio / traffic / law / combat pre+post
/ factionPresence / aiEncounter / difficultyDirector.

## Before / after

### Offline microbench (primary — portable CPU)

The bench runs quiet `combatOutcome.update` with 40 idle ships, 1/7 of them
hostile, no flee stamps and no outcome records. Latch OFF vs ON, one isolated
Node child process (`--expose-gc`) per pair. Measured on clean master tip
`97c88f92b` plus this patch (am-verify `8a6d29ada`).

| capture | median of run medians | run medians | floor minSpeedup |
|---|---:|---|---:|
| 5×11 pairs @ ITERS 30k / WARM 600 (same protocol as #161/#162) | **2.047×** | 2.038 / 2.039 / 2.047 / 2.077 / 2.143 | **1.81×** |
| 5×11 pairs @ ITERS 100k / WARM 5000 (warmed JIT) | **2.382×** | 2.256 / 2.345 / 2.382 / 2.400 / 2.459 | **1.80×** |

- Abs before: ~0.40–0.66 µs/tick, depending on JIT warmth.
- Abs after: ~0.10–0.30 µs/tick. Most of the remainder is the 0.5 s rescan
  (one full scan every ~30 ticks).
- At 2M iterations the latched path is ~0.075 µs/tick.
- Probe (`probe-163a`): a forced full scan costs ~1.24 µs, and the latch check
  alone costs ~0.05 µs.

### Dirty-wake

Proved in `test/combat-outcome-quiet-latch.test.mjs`:

- Each wake event clears the latch, and a fresh `fsm:flee` stamp is recorded
  within the next 4-tick cadence.
- A membership version bump records a newly indexed forceFlee ship.
- A silent forceFlee stamp with no event (the pirateParley `suppressRobbery`
  shape) is still recorded after the 0.5 s rescan.
- The `ai:flee` event path records immediately while latched.
- Bench OFF never arms, and `destroy()` unsubscribes the wake listeners.

### Focused tests (am-verify tree)

```
node --test test/combat-outcome-quiet-latch.test.mjs test/intentional-combat-outcomes.test.mjs \
  test/hunter-ladder.test.mjs test/perf-packet-live-wiring.test.mjs \
  test/physical-kill-causality.test.mjs test/sim-clock-catchup.test.mjs
```
→ **70/70** pass (the latch suite alone is 19/19).

Broader flee suites: 29 files that touch forceFlee / ai:flee / pirateParley /
pirateDisengage / surrenderRecovery / wingMorale → **294/303**. The 9 failures
all predate this patch and reproduce with identical counts on bare `97c88f92b`:

- `civilian-freighter-recovery` — 8 failures
- `pq-141-03-ambush-flee-spill` — 1 failure

## Scratch

- Branch: `vm-work/hillclimb-20260924t`
- Tip: `f3008ec525ac0fa54ddbf2403b53a71f02b2a1e9`
- Worktree: `/workspace/spaceface-scratch/hillclimb-20260924p`

## Apply order

Independent of the other packages. It stacks under registry.step after #160–#162.

## Risks

- Silent flee stamps with no bus event can be recorded up to ~0.5 s later than
  before (26 ticks at most) while latched. Only one such writer is known:
  pirateParley `suppressRobbery` (jurisdiction avoidance). The record's
  `tick`/`t` can shift within that bound. The receipt is observer-only, so
  combat, AI, economy and rep are unaffected.
- Every other known flee writer wakes the latch through its event:
  - ai fsm → `ai:stateChange` / `ai:flee`
  - wingMorale → `ai:flee`
  - surrenderRecovery → `surrender:escaped`
  - difficultyDirector → `difficulty:pinReleased`
  - pirateDisengage → `triggered`
  - pirateParley `breakOff` → `resolved`
  - aceMemory → the stamp lands at spawn (`entity:spawned` + membership)
- Setting the bench toggle OFF restores the always-4-tick scan for A/B.
