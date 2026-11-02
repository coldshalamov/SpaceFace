# Swarm: turn the first clear into a preparation decision

## What the player sees and does

The ordinary Swarm opening remains immediate combat after its initial paid Armory.
After round 1, the existing Armory subtitle now reads the same current offer receipt
as the shop shelf. If an affordable, legal hull repair is present, it names the
cheapest available repair and its actual quoted price. Otherwise it offers the
honest buy-or-save choice, or says that no purchase is available. It then points to
the existing Rearrange loadout and Fortify routes, and names round 2 as the next
launch. An empty initial shop says "Before round 1", never "Wave 0 cleared".

The purpose is a small but concrete causal bridge: surviving creates a preparation
window; the player's present hull, wallet and stock determine the options. The copy
does not invent a clear bonus, reward, repair amount, enemy kill or guaranteed item.
Buying remains optional. This changes the ordinary screen, not a separate tutorial
or hidden test route. Circuit, checkpoint starts and later rounds retain their
existing presentation owners.

## Ownership and implementation

`src/ui/firstSwarmIntermission.js` is a pure reader. It consumes the canonical
`survivalDraft.currentOffers` rows already used by `src/ui/screens/crucibleDraft.js`,
including availability, purchased state and finite nonnegative price, together with
the current run wallet. It never invokes a purchase, quotes a parallel price,
changes health, awards currency or advances the round. Existing result-event
refresh/lifetime handling updates the subtitle alongside the shelf.

The screen keeps the actual next-wave planner forecast already added by this
candidate. Remote master `fe82f15987f049d0ca409149deb692020c7535e7` added a specialist
warning to the same screen; that newer sentence is retained. The authored preview
object is spread through the candidate forecast, so a current ladder's optional
specialist brief survives while factual quota/roster values still come from the
actual planner. The older sparse local ladder does not contain that newer field;
absence remains safe and is not presented as current specialist-content validation.

## Integration boundaries

Exact upstream screen comparison found only the specialist sentence added relative
to the common source base. No newer screen work is discarded. This increment does
not carry the separately backed-up, unpublished Ceres renderer edits. Ceres scanner
and LOD contracts were checked separately against current master; its global renderer
has substantial newer work and must be reconciled rather than replaced wholesale.

Focused behavioral checks establish the reader and ordinary Armory refresh contract,
not rendered legibility or gamepad/touch navigation. No new assets, models, schema,
economy owner, workflow or dependency is introduced. Current-master game acceptance,
full browser-worker shopping and target-device performance remain open.

## Continuing goals

| Stable marker | Outcome and state | Owner / next executable action |
| --- | --- | --- |
| SF-GAME | Open: ordinary first-clear preparation is source-integrated; whole game is not accepted. | Experience integration: verify first clear → repair/save → Fortify/refit → round 2 on the rendered route. |
| SF-WORLD-DIRECTION | Open: Adventure and Swarm remain connected by deliberate authored experience, not new model count. | Experience integration: continue along actual mission/round dependencies; preserve original larger concept scope. |
| SF-SECTOR-COHERENCE | Open: Helios/Ceres/Charon route increments retain their existing evidence and acceptance gaps. | World integration: reconcile Ceres renderer hooks with current owner source before publication. |
| SF-LIVING-WORLD | Open: existing receiving/inspection/garden consequences are bounded, not a claim of a fully living world. | World integration: verify earned scene, return and Continue behavior at the relevant route. |
| SF-ASSETBANK / SF-ASSET-QUALITY | Review/integration only; local agents own production. | Reuse current assets and assess actual placement/readability; no new model lane. |

Older Orchard/chime/recovery work remains bounded handoff work in existing records.
Neither this report, its tests, a backup nor a draft PR closes any game-level goal.
