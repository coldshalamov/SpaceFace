# PQ-137.11 — The player is never knocked around (bar B13)

<!-- LIFETIME: ACTIVE_RECEIPT -->

The owner's words, 2026-09-03: *"buggy as shit and it made it impossible to fly."* Bar B13 says that
in ten minutes of ordinary flight — no rope, no fields, no deliberate ram — contact changes the
player's velocity at most twice a minute, never by more than 10 % of cruise in one event, never
changes the player's heading, and never produces visible jitter.

## What landed

Candidate `8198c0ed` was recovered from the `wt-flight-v2` delegation worktree and integrated to
master as `a3bd740d`. The player hull keeps its course through contact: heading is preserved, the
knock budget is enforced, yaw is not stolen, and impulses queue through the physics owner rather
than being written onto the body.

`package.json` conflicted and was resolved as a **union**, not a takeover — master's
`check:vision:assertions` (from the PQ-186.02 guard) and the branch's new `check:player-knock` are
both present in the `check` chain. Losing either would have silently dropped a gate.

## The numbers

The contract window is ten minutes, so that is the run that decides the bar. It was **re-run on
master after integration**, not carried over from the worktree:

| Run | Knocks/min (≤ 2) | Largest knock (≤ 10 % cruise) | Heading changes (0) | Sign-flip jitter events |
|---|---|---|---|---|
| **10 min, real path, re-measured on master** | **1** | **6.61 %** | **0** | **0** |
| 10 min, measured pre-integration at `8198c0ed` | 1 | 6.61 % | 0 | 0 |
| 120 s, seed 4242 | 2 | 5.6 % | 0 | 0 |
| 120 s, seed 8008 | 1.5 | 4.5 % | 0 | 0 |

The master re-run reproduces the pre-integration numbers **bit for bit**
(`0.06607713790601516` in both), which is the useful result: the contact change altered sim
trajectories elsewhere — it moved the 47-A hash — without changing what ambient contact does to the
player hull. 600 s, 36 000 ticks, cruise 95 WU/s, 139 receipts coalescing into 10 knock events.
Knock source is `physics:impact(playerInvolved).appliedPlayerDeltaV`. The receipt-vs-independently-
measured velocity discontinuity agreed to 1.4e-7 of cruise, so the receipts describe what the hull
actually did.

**What `barMet: true` does and does not say.** The scenario computes it as
`knocks/min ≤ 2 && maxFraction ≤ 0.10 && headingChanges === 0` — the three countable clauses only.
Jitter is measured separately (lateral-velocity sign flips inside 0.25 s of each bump: 0 events,
max flips 0) and deliberately **not** folded in. So the honest reading is: the three counting
clauses pass on the contract window, and the rollup still reports B13 as `met: null` because it
requires `jitterMeasured`. That withholding is correct and was left alone — a bar that reads met
because a field was renamed is exactly the pinned-green failure this program is trying to end.

One instrument repair: the rollup matched only the 120-second `feel.knock_budget` id, so
`feel.knock_budget_10min` — the single run long enough to answer B13 — was reported as a scenario
that "does not measure the knock budget" while it was measuring precisely that. It is now accepted;
the `jitterMeasured` requirement below it is untouched, so the verdict is still `null`.

## The `causalActorId` finding — not a defect

The handoff carried this open: *"6 player-knock receipts name no `causalActorId`."* Run down:

The same Crucible run recorded `playerKnockEventsPerMin: 0`, `ambientKnockEvents: 0` and
`hostileKnockEvents: 0` alongside those six receipts. `knocksMissingActor` counts raw
`collision:playerKnock` receipts; `playerKnockEvents` counts coalesced events that clear the knock
floor (0.5 % of cruise). Six receipts producing zero events means **every one of them was below the
floor** — solver settle, not a knock a player could feel.

`directContactCausalActorId` returns null when the two bodies' normal contributions are symmetric or
non-closing, which is exactly what settle looks like. Naming an actor there would be guessing, and
the scenario's own law is that nothing unattributed may be guessed — precisely so the bar can never
be flattered. So the null is correct and no code needed fixing.

What was wrong was the **report**: one gap string put those six settle receipts beside the real
blocker (unmeasured jitter), so a reader could not tell a harmless settle from a compromised bar.
The bench now splits them — `knocksMissingActorSubFloor` is reported and never a gap, while only an
unattributed receipt *at or above* the knock floor raises one, because only that could be a ram the
bar should exclude or ambient contact it should count.

## Determinism: BOTH 47-A goldens moved. Recorded, not repinned.

`check:baseline` went from **13/14 to 12/14** at this cherry-pick. Both 47-A hashes drifted:

```
sim-v3 (flight v3)
  before a3bd740d:  0f701fcb69b7d7eb2b32ec7c94d55873c75f7fe7cad8183466e963f53ff671d7  (inherited drift)
  after  a3bd740d:  77bbd9cd12f3145c855c6e045ea73adec2982912f0d9695c6c3cbdf757c1cc3b
  expected golden:  70eda854ab76bbd0cc8d20bc8e280288138bee7fe3ad1b06aa9a169c9cb916e4

sim (legacy flight)  — was GREEN before this commit
  after  a3bd740d:  76116bb577b52a939eadd8ed6ae7266c7bebe112d8a7a326ebff24cacaf34edd
  expected golden:  21ef7a0f4ec2580cc64d58345bb606b3b242bfe854f20bf450095a2ca985044c
```

Attributed by elimination: the only sim code changed since the last 13/14 run is
`src/core/physics.js` and `src/core/sg02DynamicBodyOwner.js`, both from this cherry-pick. Everything
else this session touched is bench scripts, receipts or frontend tooling.

A contact-physics change altering a 720-tick scenario that contains collisions is expected, and it
moves *both* flight paths because the change is in the physics owner, below the flight-system
choice. It was found late: a direct `sim-v3` hash re-run after the pick showed the v3 drift, but
only the full gate revealed that `sim` had gone red too. **Re-run the whole gate after touching sim
code; a single targeted hash check is not the gate.**

**Neither golden was repinned.** `sim-v3` is now red for two stacked reasons (inherited drift plus
this change) and `sim` for one. Whoever re-records them must account for both causes on v3, not one.

## What is still open

Nothing on the three measurable clauses; they pass on the contract's own ten-minute window.

The remaining gap is the one the instrument states itself: **visible jitter is unproven**. The
scenario measures a physical proxy — lateral-velocity sign flips after each bump, 0 events — but
"never produces visible jitter" is a claim about what the player sees, and no headless path can
close it. A headed capture at the shipping camera is what would set `jitterMeasured` and let B13
read `true`. Until then the bar stays `null`, which is the honest verdict, not a failure.

`check:player-knock` 5/5 green; `check:sg02` exit 0.
