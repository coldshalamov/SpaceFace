# Pilgrim Lamp Walk: earn the last-lamp escort

## Player-facing change
The existing three Choir pilgrims wait for the player's answer. Accepting launches the original column. The original 30-credit reward is earned only after the last pilgrim advances at least 100 WU and the player follows 60–180 WU astern at relative speed at most 8 WU/s for eight seconds under the existing trail predicate. Success records a last-pilgrim receipt and emits the original +2 Choir reputation event. Dismissal is explicitly social, with its existing -1 Choir consequence; neutral decline pays nothing. Timeout, lost subject and sector departure cannot pay.

Initial cast offsets rotate into the existing scene axis. No post-spawn actor pose, velocity, residency or controller correction is introduced. No new ship assets, actors, reward amounts, persistence ledger, or shared helm behavior are added.

## Necessary clock correction
Actual-director qualification exposed an existing floating-point boundary: nominal one-second accumulated elapsed time could be 0.9999999999999432. The strict comparison deferred work until the next approximately half-second calendar call, producing 1.5-second intervals and disrupting the escort's existing sampled hold.

The director's threshold alone now admits a 1e-9 tolerance. Elapsed accrual, reset-to-zero, first rhythm publication, catch-up/remainder behavior and all other dispatch logic remain unchanged. This is a numerical dependency of the escort, not an AI or interpreter redesign.

## Verification
- Focused Pilgrim predicate/settlement coverage and native journeys exercise original cast/rewards, declines, timeout/loss/sector exit, initial orientation, and late acceptance.
- Updated real-archetype fixture uses force:true authored admission on one favorable +X approach through actual director request/dispatch, actual Choir factory actors, tacticalAI, flightV3, aiPorts and Rapier. At 20-second late acceptance it finishes at approximately 33.0833 simulated seconds, with 643.852 WU subject advance, actual 30 credits, +2 reputation event, one receipt, no duplicate payment, all three actors alive/native, and zero captured contacts. Only the player receives ordinary movement inputs.
- Clock boundary regression fails before the correction and passes after it; it also preserves immediate initial rhythm publication, rejects genuinely early/paused calls, and verifies elapsed-time accrual and unchanged long-delta behavior. Three new cases plus eight existing calendar and six session-rhythm cases pass (17/17).
- The final shipping actual-director native test plus three clock regressions pass 4/4. The original focused/neighbor evidence was 31/31 before the clock correction, including the now-superseded manual actual-archetype fixture; this is not a single combined final-tree suite run.
- The neighboring lived-world suite passes 16/16 with only narrow Pilgrim-specific expected behavior changes; non-Pilgrim assertions remain intact.
- Pure-emitter capture compares 219 generated outputs: only the Pilgrim 913 leaf changes. The other 218 captured emitters remain byte-identical. The full generation pipeline was NOT run.
- Package registration appends three focused commands to the full existing check chain without changing its prior ordering, aliases, or CRLF formatting.

## Evidence boundaries
Local runs use qualification-only source overlays and selected exact-public inputs over a historical dependency graph. The neighboring suite remaps public ambient identities because the local registry uses historical numbering; the complete public registry could not be loaded locally because 31 modules were absent. These are not complete-public-tree runs. Ordinary-node execution on the exact published tree requires hosted CI; no such result is claimed here.

Earlier manual 1 Hz/disabled-director native evidence is historical and does not itself establish integration. The final actual-director fixture closes that specific dispatch/cadence gap, but remains a bounded authored-request fixture, not natural ambient scheduling, a full campaign profile, all approaches, obstacle-rich gameplay, or rendered acceptance.

Save evidence establishes only that unfinished transient scenes are abandoned by the actual director projection/load hook, while completed receipt and credit projection persist. Full save-slot/entity cleanup and reputation round-trip are not established. The observed +2 is an emitted reputation event, not a fully qualified standing persistence claim.

No broad local check/check:ci, whole generation pipeline, browser/live visual acceptance, performance/hitch acceptance, merge or deployment is claimed. This remains a coherent draft increment, not whole-game acceptance.
