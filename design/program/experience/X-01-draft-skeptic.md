# X-01 draft — The Skeptic

**Audit correction (checked).** On the production profile the kill already reaches the dock.
`salvageBay` and `lootShards` are on (`runtimeProfiles.js:25,36`). The stolen-goods `d.loot` roll runs only
when lootShards is off (`combat.js:1098,1137`). A raider's burst lands in the salvage bay, and docking at
Helios cashes it at 0.6× base (`cargo.js:1219-1248`). Three promises are still broken:

1. The loop never makes a **sale**. Cash-in is a `grantCredits`, so nobody learns that recovered goods sell
   at the board.
2. The reaver (`gunship`) gets the heavy recipe, which drops restricted munitions. The first lawful dock
   after a defense toasts "Find a black market" (`cargo.js:1226`).
3. 367's defended line promises "The lot is yours to skim". No skim exists.

**Proposal — existing pod schema only (`d.spawnCargoPod`, `encounterDirector.js:2028`).**
- **344 defended** (`344-opening-hauler-raid.js:335-344`): after `d.grant(250)`, spawn one pod 30 wu off the
  hauler: `{commodityId:'cmdty_fuel_cells', amount:3, ownerId: state.playerId, ownerName:'MTS hazard share'}`,
  `scanLabel` 'MTS HAZARD SHARE — YOURS'. The line becomes "All raiders down! Hazard pay sent — three cells
  off my stores are yours. Helios buys them."
- **367 defended:** the same pod with 4 cells, so "yours to skim" is literally true.
- Fuel cells are legal and marketTier 0, so the Helios mint seeds them (`economy.js:2335`). At about 97 cr
  base, that is roughly 290 / 390 cr at the board. The sale emits `economy:tradeCompleted`, the event B4
  already hears (`onboarding.js:362`).
- **Copy only, `cargo.js:1226`:** "Restricted salvage stays in your bay: N units — lawful docks won't buy
  it." No black market is in reach in hour one, so the line should not point at one.

**Poke → reward.** Defend, scoop the share, sell at Market: a real trade receipt before the rail ends.

**Hard edge.** The share is player-owned, so it must never open theft. This is the gift/crime line X-05
depends on.

**Regression risk.** Seed-4242 first-dock credits rise by about 290, and `_fitOfferCandidate` may pick a
different module. No killRewards retune. Keep green:
- `opening-hauler-raid-*`, `m01-opening-raid-aftermath`, `starter-world-opening-raid-*`
- `convoy-hauler-death-spill`, `first-hour-economy-floor`, `starter-progression-fit-offer`
- `rc-458-first-half-hour`, `check-encounter-director.mjs`

New test: defended 344 spawns one player-owned 3-cell pod; collecting it files no incident.
