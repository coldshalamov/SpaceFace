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

The contract window is ten minutes, so that is the run that decides the bar.

| Run | Knocks/min (≤ 2) | Largest knock (≤ 10 % cruise) | Heading changes (0) | Jitter | Verdict |
|---|---|---|---|---|---|
| 10 min ordinary flight, real path | **1** | **6.6 %** | **0** | 0 events, measured | **bar met** |
| 120 s, seed 4242 | 2 | 5.6 % | 0 | 0 events | met |
| 120 s, seed 8008 | 1.5 | 4.5 % | 0 | 0 events | met |
| verbs `feel.knock_budget` re-measured on master after integration | 2 | 5.6 % | 0 | unmeasured (headless) | 3 clauses met, bar `null` |

Cruise 95 WU/s; knock source is `physics:impact(playerInvolved).appliedPlayerDeltaV`, receipts
coalesced into events. The receipt-vs-independently-measured velocity discontinuity agreed to
1.4e-7 of cruise, so the receipts describe what the hull actually did.

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

## Determinism: a second drift, recorded not repinned

Integrating `a3bd740d` moved the 47-A authoritative sim hash:

```
before a3bd740d:  0f701fcb69b7d7eb2b32ec7c94d55873c75f7fe7cad8183466e963f53ff671d7  (inherited drift)
after  a3bd740d:  77bbd9cd12f3145c855c6e045ea73adec2982912f0d9695c6c3cbdf757c1cc3b
expected golden:  70eda854ab76bbd0cc8d20bc8e280288138bee7fe3ad1b06aa9a169c9cb916e4
```

Attributed by elimination: the only sim code changed since the clean `0f701fcb` measurement is
`src/core/physics.js` and `src/core/sg02DynamicBodyOwner.js`, both from this cherry-pick. A contact
change altering a scenario that contains collisions is expected, not a symptom. **The golden was not
repinned.** It is now red for two stacked reasons — the inherited sim-v3 drift and this contact
change — and whoever re-records it must account for both, not one.

## What is still open

Nothing on the three measurable clauses. The remaining gap is the same one the instrument states
itself: **visible jitter is unmeasured on any headless path**, so a full B13 verdict cannot read
`true` from the bench alone. The ten-minute real-path scenario does measure jitter (0 events) and
reports `barMet: true`; the Crucible and verb paths do not, and honestly say so rather than
inferring it.

`check:player-knock` 5/5 green; `check:sg02` exit 0.
