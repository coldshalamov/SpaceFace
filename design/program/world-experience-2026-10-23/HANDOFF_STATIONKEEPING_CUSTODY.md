# THE HANDOFF: deliberate stationkeeping custody

## Behavior

A 60 WU/s fly-through of the seller's 210 WU offer ring no longer bonds illegal freight to the player or pays the 60-credit / Quiet +2 contact reward. Acceptance requires a continuously observed six-second hold alongside the seller, at relative speed no greater than 6.4 WU/s, with quiet guns and a live, active, undocked player in flight.

Acceleration, leaving the ring, missing or invalid velocity observations, player absence/death/disable/docking, leaving flight mode, firing, or hitting a counterpart resets the hold. Observation gaps over two simulation seconds restart it; paused time cannot advance it. Approach and withdrawal comms explain that passing through signs nothing.

The existing four physical pods and their finite cargo remain authoritative. Deliberate acceptance cuts exactly one original undelivered pod from the conveyor, stamps custody once, and retains the original reward. No replacement freight, ledger, UI, actor, or encounter is added. Real buyer completion takes priority. Expired incomplete deals resolve as `deal_lapsed`, not false delivery; remaining original pod ownership is preserved.

## Verification

- Frozen source and regression test reviewed independently and inspected before publication.
- Focused consumer overlay: 31/31 tests passed (19 new stationkeeping cases, 7 original THE HANDOFF cases, 5 NXB-040 commitment cases).
- Independent reviewer: the same 31/31 passed, plus five additional boundary probes passed without modifying the candidate.
- The focused overlay was checked against public master `3095a835eb3dbda178d359bbb0541e3ee6124f4c`, including its exact doctrine source (blob `d4333d2b8065b0a23ed664eee3508efe50c6a312`) and relevant contracts. Current public director cadence, event dispatch, and receipt contracts were inspected.
- Negative control: the new fly-through regression fails against original public encounter blob `a8e6ebd04606ca26c314bb8b013e575c44040587`, demonstrating the prior accidental acceptance.
- Package wiring adds `check:handoff-stationkeeping-custody` and invokes it once at the end of existing `check`, retaining all prior ordering and CRLF bytes. Removing the two additions exactly recovers the original package file.

Focused commands:

```sh
node --test test/handoff-stationkeeping-custody.test.mjs test/cr-hollow-1-the-handoff.test.mjs test/next-wave-nxb-040.test.mjs
npm run check:handoff-stationkeeping-custody
```

The 31-test result is a focused, qualified consumer-overlay result, not a full clean current-tree run. The new npm alias is wiring for the same focused test; a separate alias execution was NOT RUN for this publication.

## Limits and remaining acceptance

- Full current-tree native physics: NOT RUN.
- Save/Continue integration: NOT RUN.
- Live visual playthrough and performance acceptance: NOT RUN.
- Broad local `check` / `check:ci`: NOT RUN.

These results do not establish release readiness, live visual quality, or whole-game acceptance. Remote CI is tracked for the exact published head separately in the pull request. This is a narrow draft increment, with no merge or deployment.
