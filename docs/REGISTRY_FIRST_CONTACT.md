# Registry Writ: identify, then choose a response

## The player-facing contradiction

The authored Book 2 Registry Writ supports identification followed by either force
or custody. Before this change, its Mission Log next-action line used the generic
bounty instruction to take down the target; the shared objective also said to
eliminate it. That wording made the available non-destructive resolution difficult
to discover, and contradicted the mission owner's identification response.

The readout now follows this specific authored contract's current state. Before
identification it directs the player to the marked vessel off Ashfall in Charon,
select it, approach within the actual 1,200 WU identification radius and pulse scan.
After identification it names the civilian maintenance vessel and exposes the real
choice: tether/reel to 60 WU or less for custody, or resolve by force. Scan is the
recommended next action, not a newly enforced rule; destroying an unscanned target
still follows the existing wreck-registry path. Completed custody/force records
show their actual resolution, with no invented station-delivery phase.

The card's objective, location, method and purpose now agree. The generic bounty
purpose of removing a threat is not reused for this registry decision. Ordinary
bounties, unrelated story contracts and malformed/legacy records keep their existing
behavior. The identity gate includes the exact story tag, bounty type, authored
Elroy id/role and Charon destination, not a loose title match. Unknown progression
values do not become fabricated identification or completion.

## Existing authority and implementation

The read-only helper lives with the existing shared mission recap and is consumed
by the Mission Log through its existing recap import. This introduces no eager
module or preload entry. `missionObjectiveOps` continues to own scanner recognition,
custody threshold, force resolution and settlement. Presentation does not select a
target, attach a Line, reel it, debit or grant credits, accept a contract, move a
waypoint or change story state. It makes those existing choices readable.

The canonical custody event resolves the writ immediately after qualification;
there is no custody-cargo hauling stage to describe. The writer's retained terminal
register still reveals the medicine cargo and records the outcome. The readout
does not move that reveal earlier or manufacture an encounter consequence.

## Reconciliation and evidence limits

Publication artifacts for the existing Mission Log and recap start from exact
master `d6ba5fbe79f7f86eb264cd66499ba161e17b3d6e` and add only this readout change.
The shared assistant checkout separately retains earlier PR724 route changes; those
conflicted files are not copied wholesale into this branch. The original and patched
master artifacts and focused test logs remain in the recovery package.

Tests exercise the contract author's actual identity, mission owner's scan/force/
custody transitions and the real recap/card readers. Current-owner substitution
runs distinguish those exact modules from the remaining local dependency tree.
A complete clean current-master game, physical Line handling, screen legibility,
input device behavior and full Save/Continue are not established by these component
checks. Current-head CI is tracked independently; no merge, deployment, workflow,
asset or modeling change accompanies this work.

## Continuing experience goals

SF-WORLD-DIRECTION and SF-SECTOR-COHERENCE remain open: the garden → Nest → Tethys
board → Elroy sequence now has a more legible decision, not a completed campaign.
SF-LIVING-WORLD remains open: the actual encounter and retained consequences must
be judged in play. SF-GAME remains open until normal-input acceptance and runtime
quality are demonstrated. Next executable action: accept the Registry Writ, reach
the marked vessel, scan, and separately verify custody and force routes without
an erroneous delivery instruction. Asset review stays with SF-ASSET-QUALITY;
local agents retain model production. Prior PR724/Ceres and legacy handoffs remain
separate, with their acceptance gaps intact.
