# RATCHET: choose the original to hand over

## Player route
The existing field menu now opens **Inspect gantry handover**. At the actual receiver,
the pilot sees each currently eligible original and its damage-adjusted base payment.
Choosing one releases that body's restraint, transfers its custody and pays its existing
receipt, while the other originals remain available to carry or retain. An explicit
**Deliver all currently eligible originals** keeps the old bulk option. Back and close
hand over nothing. Current authored jobs have at most three originals, so this submenu
has at most six choices, including both exits.

Copy distinguishes base payment from the existing first modified-rig 100 cr bonus.
No prices, bonuses, travel thresholds, intake geometry, physical restrictions or save
schema changed. Payment is irreversible, explicitly stated before the choice.

## Scope
- `src/features/rigWorkshop/jobs.js`: optional selected receipt validation/filter.
- `src/features/rigWorkshop/runtime.js`: menu and bounded dispatch extension, preserving
  the prior selected capture/release candidates.
- `test/rig-selective-handover.test.mjs`.
- This evidence note.

Selection rechecks exact current body object and work-order identity at the UI callback,
then current generation, manifest token, player custody, quoted amount and the owner's
ordinary physical eligibility before handing over. Changed price, range or identity
refuses rather than transferring a different original. The bulk callback also rejects a
changed work order. A state-scoped transaction guard covers every delivery-owner instance and partial
settlement before restraint release. After release callbacks, exact identities, custody
and current quote are revalidated before any receipt. A changed life/custody aborts
without payment or transfer; the restraint may already be released, so the load stays
loose. Receipt commits then precede economy callbacks. No assets, renderer, economy writer or shared presenter
was edited.

## Verification
Focused five tests and combined 51 tests:

```
node --test test/rig-selective-handover.test.mjs test/rig-cargo-capture-choice.test.mjs test/rig-cargo-release-choice.test.mjs test/pro-experiences-rigWorkshop.test.mjs
```

Final log `/tmp/rig-handover-final.log`. The first 50/50 suite missed a real precommit reentry defect. Independent review
reproduced nested delivery during synchronous `tether:broken` before the paid flag.
The corrected suite exercises that exact native callback, including a newly constructed
jobs owner, partial settlement, a save during release, and changed life/custody.
The saved precommit snapshot restores as unpaid with no automatic grant; the live
transaction grants exactly once. A save here is before payment, not a completed sale.

The prompt-adapter test chooses the middle, damaged original for 117 cr, retains the
other two, and attempts a repeated handover from the economy callback without another
payment. Boundary fixtures cover altered price, occupant generation, same-ID object,
foreign custody, range and active work order. Back, bulk completion and fresh native
owner restore preserve paid state with no replay grant.

The native route starts from the existing prepared rig fixture, clamps an actual
original, moves it more than 500 WU using bounded impulses on the rig and the real
Rapier restraints, then invokes the same menu to release and transfer exactly that load.
The observer pilot is placed beside the receiver after transport. This is not a claim
of ordinary pilot-input flight, collision-free travel, browser layout/pointer/gamepad
acceptance or full disk/UI Continue. Mixed-ready-load choice tests explicitly seed prior
transport records; the separate native route does not forge cargo travel or its receipt.

Before snapshots: `/tmp/rig-{jobs,runtime}.before-selective-handover.js`.
Remote inspected: `f95de0eb1ba7560839209936afba48c7b96fe41a`.
No publication performed.
