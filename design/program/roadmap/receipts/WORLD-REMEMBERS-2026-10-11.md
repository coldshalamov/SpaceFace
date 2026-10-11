# WORLD-REMEMBERS - the world talks back about what you did (2026-10-11)

Owner-shaped batch (Q&A, 2026-10-11): directions **gossip / outlaw career / stations with memory /
rivalry arcs**; feel **depth in one loop**; memory **loud**; scope **big**; cast **authored** (six
fences, six hunters, names and quirks); permanence **return** (a stable cast, no permadeath); hunter
pressure **waves** at jumps and docks gated by WANTED tier; surface **journal** (a minimal entry in
the existing Codex). The rule from WORLD-ANSWERS held: each unit is a listener and a rule on an
existing single writer; the one new system is the spine, and it only listens.

## The spine

`src/systems/deedRecord.js` + `src/data/deedPhrases.js` (`c3521e379`, `4c2f3538d`, `2d81178a6`,
`afd2da3c8`). One durable ledger of player deeds under `state.story.record` - lazy (a quiet game
carries no key; the 47a hash is identical with and without the system), capped at 64 with told-first
compaction, tallies that outlive compaction, no RNG. Fed by receipts other owners already sign:
`station:slammed`, `economy:oreFlood` (byPlayer), `well:haulerDragged`, `survivorPod:rescued /
abandoned (playerLeftIt) / captured / ransomed`, `entity:killed`, `combat:baseDestroyed`,
`deniable:fence*`, `bounty:cleared`, `heat:changed` tier crossings, `combat:tumbleRake`,
`stunt:salvageRights`, `warrant:hunterDisabled / hunterEscaped`, `station:strike / grudge`,
`aceMemory:transition` (defeated / fled), `fence:routeCompleted / scrubbed`. 25 deed kinds, each
with a law axis and a street axis. Readers: `deedsFor`, `notorietyIn` (decayed crimes in a sector),
`standingWith` (one faction's view, law or street axis, half-life 30 min), `pickDeedToTell`
(loud x untold x local x about-the-speaker, hash32 tiebreak), `markTold`, `markNoted` (saved stamp
for non-speaking surfaces), `deedToneFor`. Prose: `deedLine(deed, {voice})` in neutral / grievance /
praise. `test/world-remembers-record.test.mjs` 8/8.

## Landed (all on `origin/master`, pathspec commits)

| Unit | What the world now does | Receipts | Commits | Tests |
|---|---|---|---|---|
| U-A warrant hunters | Six authored hunters (Writ, Gatepost, Slackline, Furrow, Pairing, Lantern) in `src/data/warrantHunters.js`; `warrantHunterWaves.js` (hosted by lawSecurity) arms a wave on WANTED arrivals by tier rhythm (NETS every 2nd-3rd, IMPOUND most, cooldowns 180/75 s), lands it 60 s after a jump or 10 s after undock; a disabled hunter recovers 600 s +300/disable and comes back bolder; Writ hails first and offers to take the bounty - now a real in-flight prompt (Digit 1 pays via `economy:payBounty`, short purse gets her refusal); licensed hulls are priced by lawSecurity's signed `lawful_kill` receipt; **a fence's tip (`law:fenceTip`) arms a wave at once and the hail names the fence** | `warrant:waveSpawned / hail / hunterOffer / hunterDisabled / hunterEscaped / hunterPaid` | `47831841e` `8af643561` `5eaa5b18a` `249e755a6` `fd5ae03ed` | `world-remembers-hunters` 19/19, `world-remembers-hunter-offer` 11/11 |
| U-B fences with faces | Six authored fences (`src/data/fences.js`: Pask, Ruan, Greve, Quill, Lisk, Rivet) with faction registers and five lines each; `fenceDesk.js` keeps trust -3..+3 moved by the deniable receipts (thanked +1, lost -1, burned -3, forgiveness +1/24 epochs); trust >=1 posts a bigger haul, >=2 a 3-leg route with a one-time reward; ambush odds fall 0.08/trust; a fixer sells a heat scrub (`heat.js` cools one level, never below NETS floor, refuses IMPOUND); a sour fence sells a hot pilot (`law:fenceTip`); **Ilsa buys pods** - a ransom at her berth pays 1,092 cr (lawful rescue fee x 2.6) and earns trust | `fence:met / trustChanged / routeOpened / routeCompleted / scrubbed / ransomed`, `law:fenceTip` | `4cbd60b32` `7fc523881` `245a76265` `e0253676d` | `world-remembers-fences` 31/31 |
| U-C stations with memory | `state.economy.stationConditions` (read side `src/economy/stationConditions.js`): outage (slam), strike (2 crew kills in 600 s -> sell x0.85, services x1.25, yard x0.6), boom (ore flood past the surplus band -> services x0.8 sector-wide), grudge (3 slams -> berth refused until the note is paid), blockade (derived from a war front -> buy x1.2, fuel rationed 60 %); quote chips and reasons; intel snapshots carry the multipliers; grudge toast names the note | `station:strike / boom / grudge / grudgeCleared / blockade` | `967f66d6f` `114815f4b` `f3d287963` | `world-remembers-stations` |
| U-D rivalry arcs | Audit: spawn, flee, return and return-taunt were real; gaps closed - a returned ace killed in its fight now settles `defeated`, a second flee re-arms a tier heavier, aces are hailable; last-fight memory (`lastSectorId / lastOutcome / lastStyle / lastWeaponId`) spoken in five registers; a slain ace's wingman inherits as "<Name> the Second" with grudge `lost_captain` | `aceMemory:transition`, `aceMemory:heirNamed` | `7505b407d` `c0801bd30` | `world-remembers-rivalry` 16/16 |
| U-E gossip | Four mouths read the Record: a bar contact (whoever's faction has an opinion, the fence included) opens with the deed, told once when drawn; dock control greets cold at standing <= -4 / warm at >= +4 naming the deed; a lawful patrol's hail opens with the loudest local grievance at notoriety >= 3; the news wire airs a loud untold deed once (saved `noted` stamp survives a load) | - | `9f023b5bb` `2f0096dd6` `08613e618` `31c88fcf6` | `world-remembers-gossip` 20/20 |
| U-F the Record in the Codex | "The Record" entry in the Figures tab: standing strip (up to four factions, words by threshold) and the newest 12 deeds with a told mark; `src/ui/screens/codexRecord.js` pure model; shot and walked on the bench (`codex-record`) | - | `2a898e824` | `world-remembers-codex` 7/7 |
| Barks (WORLD-ANSWERS tail) | Ore flood and tumble rake each speak once through `barkDirector` with a named speaker | - | `c982e4940` | `world-answers-barks-ore-flood-rake` 11/11 |

What a player hears, concretely: slam Ceres' ring, and the next bar has a Drift contact saying
"Ceres Refinery dock control has your hull on the wall. Slow down this time."; tow two Concord pods
home and Helios dock control answers "priority approach for you at Helios Station. You brought a
Concord crew home from Helios Prime. People here don't forget that."; sell a hot pilot's trust to
Cutter Ruan and the next undock meets Slackline: "Cutter Ruan said you would come out this gate.
They were right. Cut your drive."

## Not done / known edges

- Writ's short-purse refusal leaves the channel open for the rest of her 25 s window (a second press pays). A decline still emits nothing and the window runs out on its own.
- Hunter portraits share the `bounty_hunter_NN` pool with station locals.
- U-D: `lastWeaponId` is only recorded when the kill payload names a weapon (escape receipts do not).
- U-B: Ruan's route ends where it began; legs 2-3 retry on later docks through `encounterAftermath`.
- The localization catalog (`en-US.generated.js`) needs one regeneration once the tree is quiet;
  other lanes' dirty files would be baked in by a regen now.
