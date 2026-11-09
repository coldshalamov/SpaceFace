# RATCHET: choose which original to load

The normal field deck now opens **Choose cargo to secure** rather than silently
clamping the nearest original. The pilot can choose a lighter load over a nearby
heavy load, controlling which originals consume the rig's finite restraint slots.
The menu names each original and its physical mass. It lists only current owned
or active-job cargo inside a collector/cradle's reach. Five loads per page leave
room for Previous, More, Back and Keep flying within nine choices. Empty pages
still permit Back/Leave. Opening or dismissing the menu changes no restraint.

Owned files:
- `src/features/rigWorkshop/runtime.js` (preserves the prior selected-release change)
- `test/rig-cargo-capture-choice.test.mjs`
- narrow flow update in `test/pro-experiences-rigWorkshop.test.mjs`
- this evidence note

The existing `dispatch('capture', {cargoId})` and physics capture owner remain the
only clamp path. Legacy programmatic capture without an ID retains its nearest
candidate behavior. The candidate predicate was extracted without changing its
ownership semantics. The menu rechecks the exact original object, positive
occupant generation, current active rig and current eligibility before dispatch.
The physical owner still rechecks ownership, reach, relative speed, capacity and
native attachment admission. A selected body drifting out of range is rejected,
not moved into the collector. No reward, delivery, stock, cargo contents, save
schema, asset, rendering, or capture-law changes.

## Verification

Independent focused review: **6/6**. Final combined: **46/46**:

```
node --test test/rig-cargo-capture-choice.test.mjs test/rig-cargo-release-choice.test.mjs test/pro-experiences-rigWorkshop.test.mjs
```

Log `/tmp/rig-capture-final.log`. New tests cover:
- ordinary field menu chooses the 12t original rather than the nearby 40t load;
- foreign/changed ownership, stale generation, same-ID replacement and rig switch;
- out-of-reach/moving selected loads remain unrestrained;
- 12 nearby originals across bounded pages with explicit Back/Leave;
- actual prompt adapter selection, native clamp transmission of a real applied
  rig impulse, and fresh native owner save restoration of only the chosen load;
- backing out without capturing anything.

The original broader native field test expected one Secure click to clamp. It now
asserts that opening the menu clamps nothing, then selects the exact original;
its existing failed-restraint recapture and away-from-rig recovery checks remain.
Initial new test fixtures accidentally read `prompt.choices` instead of the
owner's `prompt.options`; only the test accessor was corrected.

## Limits

Bodies and rig begin in a prepared native local fixture. Native motion uses a real
applied impulse, not a newly demonstrated pilot-thrust collection journey. The
actual prompt adapter is exercised with a headless deck host, not visual browser,
pointer/gamepad or rendered readability acceptance. The fresh restore uses the
real rig owner capture/restore and native restraints, not full disk/UI Continue.
No collision-free, full contract-haul or construction journey claim.

Before snapshots: `/tmp/rig-runtime.before-capture-choice.js` and
`/tmp/rig-pro-test.before-capture-choice.mjs`. Master checked before work:
`f95de0eb1ba7560839209936afba48c7b96fe41a`. No publication performed.
