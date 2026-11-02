# Charon: the garden answers, then Rook names the next move

## Player experience

Cinder work leads to feeding the existing Rookside garden. First player-fed visible
growth and the optional 240t paid run are different outcomes. Previously the campaign
could accept that first growth and silently change its navigation while the garden
played a generic stage bark. A player could keep hauling toward the much larger paid
threshold without understanding why the campaign had moved on.

This increment connects the existing accepted Compost step to one persistent story
comms popup from Rook. It acknowledges recorded garden growth, explicitly separates
the optional paid run, and points to the existing Nest in the south radiation lane,
approached from the east. It preserves the authored choice to fight or withdraw
alive. It promises neither safety, victory, new equipment nor payment. It does not
imply that the player must remain at the garden to hear an already-earned result.

Rook already owns the Charon story contact for Compost, the Nest and the register.
The Nest waypoint already supplies the east approach and combat/withdrawal options.
The change uses those existing relationships instead of adding another character,
mission, scene flag or production asset. The garden's visible growth and the encounter
remain with their existing systems; the new contact explains the causal handoff.

## Source and lifetime

`src/systems/missionStoryOps.js::_recordCampaignBookSignal` emits only after
`recordBeatStep` accepts the ordered Book 2 `compost` step. The canonical campaign
receipt handles one-time behavior. Duplicate raw growth events, later feed and
restoration of completed progress do not create another popup. An unverified event
cannot manufacture a message; real stored growth can be reconciled later, even in
another sector. The wording says the growth is on the books rather than claiming a
fresh local delivery. Existing board/navigation refresh remains unchanged.

The popup follows the existing `comms:popup` contract (`sender: ROOK`, story category,
`persist: true`) so the existing comms owner controls presentation and retention.
Persistence here keeps the live feed entry until dismissal or its normal cap; the
requested TTL does not auto-expire it. The bounded backlog is session history, not a
new saved transcript. The campaign receipt, rather than the UI log, prevents replay
after Continue. There is no new credit grant, health change, growth write, encounter
admission, save schema or navigation owner. First visible growth does not imply that
the optional paid run completed. No model or asset production is included.

## Verification and publication scope

This is a standalone three-file candidate on exact master
`67c9e951081ff05117e7aabd37f706f60c500733`, separate from conflicted PR724. The target
missionStoryOps file matched that upstream source before the small hook was added.
Tests exercise actual garden spawning/digestion, ordered campaign acceptance and
existing Nest navigation. They verify partial feed, first visible growth without
240t payout, duplicates, restored progress, deferred reconciliation and false-event
refusal. A separate local loader substitution also runs the tests with exact current
upstream missions and garden owners, without replacing the shared checkout.

These are native/component checks, not a complete browser Save/Continue or rendered
comms capture. The other test dependencies remain those of the assistant's materialized
checkout. Full latest-master launch, popup legibility/timing over combat, normal-input
return and target-device performance remain acceptance work. Current-head CI must be
reported separately. No merge, deployment or workflow change is authorized by this
candidate.

## Open outcomes

- **SF-WORLD-DIRECTION / SF-SECTOR-COHERENCE:** continue the authored Cinder → garden
  → Nest → registry sequence. Character contact now explains one real transition;
  this does not close the larger twenty-concept scope or whole-sector experience.
- **SF-LIVING-WORLD:** verify growth, contact, departure/return and retained history
  together on the normal route. No persistent world change beyond existing owners
  is invented.
- **SF-GAME:** implementation and focused evidence are reviewable, but rendered and
  complete Continue acceptance remain open. Next executable action is the real first
  feed → contact → east-approach journey.
- **SF-ASSETBANK / SF-ASSET-QUALITY:** reuse and review existing garden/carrier/props;
  local model-making agents retain production ownership.

Earlier Orchard/chime/recovery and PR724 conflicts remain distinct bounded handoff
work. This small clean branch neither discards nor silently accepts those candidates.
