# Rookside: the meal is a doorway, not a hauling quota

Parent: `fef20eec99389315a8b90d1af49f23c1e9264fd7`, PR #982. Source-reviewed and native owner-fixture tested; not rendered, earned-campaign or browser Continue acceptance.

## Player experience

Cinder's violence leaves finite original wrecks. Rook can receive one; Rookside shows another use for dead matter. The receiving garden starts at 52 biomass, and its next visible stage is 60. With the actual 0.6 yield, 13.4t of feed suffices; 17 ordinary iron units supply 13.6t. The 240t Compost Run is a separate optional paid undertaking. Presenting that quota alone at the garden reads like compulsory grinding before the Nest.

The authored receiver's scan readout now leads with remaining feed to visible growth and the outside-cockpit/west Line approach. After genuine player-caused first growth it remembers that achievement and identifies continued feeding as optional. The existing growth comms slot now explains that the pilot can leave and that the garden retains their actual feed. No extra toast queue, invented reward, auto-feed, mission completion, new model, or lowered threshold. The original random bark draw is preserved so a presentation change does not perturb simulation RNG.

## Source-linked toolbox

- `src/data/understoryReceiver.js`: authored receiver position/52 biomass, persistent authentic first-growth receipt reader. Receipt remains the authority, not new text.
- `src/systems/faction_understory.js`: garden stage/scan presentation; native digestion creates first-growth receipt and emits the existing event; optional 240t credit remains its own once-only owner.
- `src/missions/compostRoute.js`: held load → free cargo → loose feed → real iron face priority; now explicitly calls paid run optional.
- `src/systems/missions.js` (read only): authentic growth changes Book 2 navigation to `nestWaypoint`; unchanged.
- `src/data/nestVisit.js`: east outside approach, six manageable compact Wasps, guns/throw/withdraw valid; no upgrade gate added.

## Open goals and acceptance

- SF-WORLD-DIRECTION / SF-SECTOR-COHERENCE: partial. Cinder violence → Rookside renewal → Nest choice has a clearer handoff. Next: earned post-Cinder route, ordinary camera, confirm the growth readout is legible and Nest directions are understandable.
- SF-LIVING-WORLD: partial. Existing original garden and feed persist; no new memory ledger. Next: full browser Continue and return to the actual garden after Nest.
- SF-GAME: partial. Native owners exercised, not a full piloted campaign. Next: original load transport without test pose placement and rendered HUD/comms pacing review.
- SF-ASSETBANK / SF-ASSET-QUALITY: no model work or missing-asset request justified. Existing garden, cargo and encounter assets reused; visual fit unverified this increment.

The original twenty-concept scope is not narrowed. This is a bounded journey-readability increment, not completion of Book 2 or the broader game. No merge/deploy or publication is performed by this author.
