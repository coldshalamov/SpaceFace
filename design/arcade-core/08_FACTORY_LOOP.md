<!-- LIFETIME: DURABLE -->
# 08 — FACTORY LOOP: mining → claims → factories → convoys → ships

The strategic half of the fantasy: build out asteroid fields into little money-making
operations that fund better ships. Existing machinery: `claims.js` (75 KB), `asteroidSites.js`,
`siteProduction.js`, `siteLogistics.js`, `automation.js` (123 KB, drones/traders/outposts with
capped passive income). Audit first (I-9); this doc is the *shape* the existing systems must
converge to.

## The loop

1. **Mine** an asteroid (existing beam/seam mining; per GDD 2.0 §5).
2. **Claim** the body and bolt on modules: extractor → depot → refinery → fab. Each stage is a
   visible little structure *on the rock* — watching your field grow is the fantasy.
3. **Factories produce traffic**: your haulers ferry ore/goods to stations on real routes as
   real physical ships (07_LIVING_WORLD job chain — now the player owns links in it).
4. **Traffic attracts predators**: pirates raid your convoys and sites. Defense = you flying
   interception (arcade combat with a strategic reason) plus hired/drone escorts. This is the
   answer to "what is all the killing *for*" beyond bounties.
5. **Income funds the ship ladder**: site profit → weapons/fields/modules → next hull class.
   Progression buys *agency* (magnet radius, field strength, tether load, ram plating), per
   VISION — not percentage padding.

## Rules

- **Passive < active, always** (existing automation cap philosophy): sites pay well but less
  than active play, carry upkeep, and carry *loss risk* (raids can damage structures; convoys
  can actually be robbed — cargo custody is physical).
- **Everything is a physical object.** Structures sit on rocks, convoys are ships, stolen
  goods are pods. No abstract income timers without a world presence.
- **Failure mutates, never hard-stops** (VISION): a raided site becomes a repair problem and a
  grudge, not a game-over screen.
- Scale cap: this is a handful of personal operations, not an empire manager (VISION ban:
  "X4-style empire manager").

## Bans

- No menu-only automation: if the player never sees a ship move the goods, the system failed.
- No uncapped exponential passive income.
- No raid events that teleport attackers in on top of the player with no approach.

## Acceptance

- Bot route: claim → build two-stage site → observe own convoy spawn, fly a route, sell,
  revenue lands → scripted raid spawns with approach telegraphy → defend or take the loss;
  both outcomes persist correctly through save/load.
- Economy check: passive income/hour < active play income/hour at equivalent progression,
  across the priced tiers.
- Human gate: owner watches their own convoy undock and fly off and reports whether it felt
  like *theirs*.
