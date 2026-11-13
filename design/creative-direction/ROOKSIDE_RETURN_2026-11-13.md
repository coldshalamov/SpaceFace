# Rookside return: an inhabited loop, not a second reward

Parent examined: `8e1d063d40c46b5f1f6e5f521d4d8a10a6698283` on draft PR #982.

## Creative decision

Charon's current causal route is Cinder wreck custody → player-fed Rookside growth → Nest confrontation → Elroy. Rookside should remain a place after it serves as a progression gate. A pilot who physically returns after the Nest now hears the garden acknowledge the precise recorded outcome and their prior growth contribution. The work offer remains voluntary. No additional kill, raid, trophy, credits, stock, or completion is invented.

The outcome variants distinguish a dead carrier, a coupling-return kill, an emptied carrier with torn baffles (not a cleared lane), and a living carrier left behind. Each returns attention to ordinary local work: the optional paid haul, or its already-settled receipt. This is a bounded return scene using the existing receiver and comms presentation, not a new model or mission queue.

## Runtime and reusable toolbox

- `src/data/nestVisit.js::nestOutcomeReceipt` provides the encounter owner's validated terminal result. Event claims are not authority.
- `src/data/understoryReceiver.js::normalizePlayerGardenGrowth` establishes the original real first-fed growth record.
- `src/systems/faction_understory.js::_rooksideReturn` requires Adventure flight, same physical/current sector, live pilot, live authored garden, and arrival within 800 WU. This includes the existing west 600-WU approach without demanding entry into the living mouth.
- The garden's existing update owns the scene. A bounded outcome stamp in its existing version-1 save section commits before comms callbacks. Repeated ticks and receipt-time saves cannot replay the line. Legacy saves without the field remain eligible for their first return.
- Existing stage, biomass, cargo intake, material writers, economy and Nest outcome owners are unchanged.

## Verification and honest gaps

`test/rookside-nest-return.test.mjs` uses the real simulation, cargo jettison, garden consumption and growth owners. Nest terminal receipts and pilot approach coordinates are controlled test setup. Tests verify all four outcomes, no distant/foreign/dead/docked/corrupt greeting, no new credits, reentry suppression and owner-save roundtrip during callbacks and the real save-envelope cold load. Review found that the existing save:loaded reconstruction initially dropped the new stamp; the final change preserves it through that lifecycle seam and tests repeated notifications.

This is not an earned Cinder→garden→Nest→return flight, an audiovisual review, or full browser Continue. Ordinary comms timing/length and actual traffic interference remain acceptance gaps. No new images were produced.

## Open goals

- **SF-WORLD-DIRECTION / active / creative integration**: preserve meaning of actual choices across connected visits. Evidence: four outcome-specific return lines. Next: earned Charon return with original surviving entities; user-dependent operation: none for source work.
- **SF-SECTOR-COHERENCE / active**: Rookside becomes a revisitable workplace. Next: review return at ordinary camera and flight speed, without forcing return or blocking onward route.
- **SF-LIVING-WORLD / active**: garden recognizes past work, not a generic congratulations. Existing optional economy stays authoritative. Next: determine whether more local activity is needed after visual play, not by adding speculative NPCs.
- **SF-GAME / acceptance open**: focused owner tests are not campaign acceptance. Elroy physical custody defect remains separately documented and unfixed.
- **SF-ASSETBANK / SF-ASSET-QUALITY / integration only**: reuse living receiver and comms system. No missing-asset request justified by this increment.
