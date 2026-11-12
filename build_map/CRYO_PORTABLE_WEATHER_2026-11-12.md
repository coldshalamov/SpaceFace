# Cryo Drift: moving the weather

Source parent: `b665bbb70e46fe8814a7489171aa994145103b2c` (draft PR #942).
Owner: creative-direction continuation. No model-production claim.

## Player purpose and implemented increment

The tank and manifold are not decorative salvage: moving either carries a short-lived thermal
pocket. Existing room law gives each 140t body a 70 WU pocket, eight seconds of displaced charge,
and a replenishing home berth. The center island blocks **new room exposure**, not damage from
already-applied statuses. Cold preserves momentum while reducing helm control; heat burns.

This increment reads that existing body's observed state and adds a short existing-toast sequence:
move (what follows), two-second warning (prepare a route), spent (pocket ended), berth return
(refilled), destruction (pocket lost). Each explanation is bounded to once per prop per installed
room. No manipulation of charge, movement, combat, rewards, spawn composition, or hazard areas.
The message describes the particular pocket, not a guarantee that the underlying quadrant applies:
the island, field boundary and the other portable pocket still determine the actual zone.

Sources: `src/systems/cryoDriftArena.js` (`cryoZoneAt`, `planCryoInstall`);
`src/systems/survivalArena.js` (`_syncCryoProps`, `_tickCryo`);
`src/systems/cryoWeatherRead.js` (presentation-only transition reader).

## Reusable toolkit and uncovered gap

Reuse existing horizontal coolant drum and finned heat manifold, no asset request yet.
`src/render/lawArenaDressing.js::buildCryoProp` authors these shapes, but `handleInstall` places
them at roomSpec seed positions and `updateRoom` does not visibly bind them to a room-solid entity.
The authored dressing can therefore remain at its initial position while the canonical physical
prop moves. This is a source finding, not a rendered observation; ordinary entity rendering may
also draw the body. Fix and visually examine that relationship before calling portable weather
readable. Do not compensate with new model production.

## Open goals

- **SF-GAME**: implemented candidate feedback; focused exact-parent tests only, not accepted play.
  Next: ordinary Cryo flight, move original tank with native input, follow it into heat, survive
  exhaustion, return it to berth, and exercise the gun alternative.
- **SF-SECTOR-COHERENCE / SF-WORLD-DIRECTION**: Cryo's identity is steering versus momentum,
  insulated refuge and movable temporary weather, not a generic damping field. Retain the larger
  arena scope, do not claim bible-only spires/floes/thawing capital are present.
- **SF-LIVING-WORLD**: real machinery consequence reads are now proposed; original room owner
  remains authoritative. Next: connect distinctive render dressing to those same bodies.
- **SF-ASSET-QUALITY / SF-ASSETBANK**: review/integration only. Existing shapes are available;
  no new wishlist item justified before real screenshot review.

## Evidence boundary / restoration

The candidate overlay is based on exact Git parent above, never on dirty shared checkout bytes.
New owner-seam tests stage body positions to observe existing charge/pocket behavior; canonical
Cryo kernel tests exercise freeze, burn, shock and immunity. These are not earned gameplay,
hardware input, UI Continue, screenshot review, audio review, performance or release acceptance.
Restore source files over exact parent, install normal dependencies, and run the three scoped
suites listed in the handoff. No denied paths, assets, credentials, workflows or deployment edits.
