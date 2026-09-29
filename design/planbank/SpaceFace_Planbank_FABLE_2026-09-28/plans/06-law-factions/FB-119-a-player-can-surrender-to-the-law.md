# FB-119 — A player can surrender to the law: cut engines, hold, and be taken into custody instead of dying

**Kind:** build · **Lane:** THE WORLD · **Routing:** open
**Seam tags:** seam: lawSecurity.js, seam: surrenderRecovery.js, seam: playerDefeat.js
**Write-set:** `src/systems/lawSecurity.js`, `src/systems/surrenderRecovery.js`, `src/combat/playerDefeat.js`, `test/fb-player-surrender.test.mjs`
**Neighbours (extend, never restate):** NXB-014, SF-161, SFQ-B112

## The gap
`combat:surrendered` is emitted only for NPCs (`pirateDisengage.js`); the surrender-and-tow recovery loop
(`surrenderRecovery.js`) is rich and one-directional. A player at NETS or IMPOUND tier has three exits (break
the net, fly out of the yard, die) and no way to stop fighting. NXB-014 covers lawful units standing down when
an NPC surrender is accepted; this is the player's own surrender, which NXB-014 assumes cannot happen.

## Why this direction
Failure creates content: custody is a situation (a bill, a work-off, a stolen-back hull) and death is a
reload. The custody and impound paths already exist for a towed ship; a surrendered player enters them without
the tow.

## Mechanism
- Add a surrender verb (hold still with engines cut for 4 s inside a lawful responder's scan cone while wanted);
  the law owner emits the player variant of `combat:surrendered`, lawful fire stands down through the same
  authority recheck NXB-014 specifies, and the player is escorted into the impound path with the existing bill.
- Refuse the surrender when no lawful responder is within range or the player fires during the hold; say why
  through the refusal voice.
- Pin on seed 4242: wanted at NETS tier, surrender accepted within 6 s, no damage taken after acceptance,
  impound bill opened once; firing during the hold cancels it.

## Done when
`test/fb-player-surrender.test.mjs`: acceptance, stand-down, one bill, and the cancel case;
`pq-151-00-wanted-tiers.test.mjs` and the impound suites stay green.

## Do not
Do not let surrender clear heat for free. Do not accept surrender to pirates in this packet. Do not teleport
the ship to the yard.

## Focus test starting points
- `test/pq-151-00-wanted-tiers.test.mjs`
- Locate impound and surrender suites with `rg surrenderRecovery test/`.
