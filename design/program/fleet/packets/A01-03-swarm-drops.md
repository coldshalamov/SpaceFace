# A01-03 — Eight drops fall out of enemies

**Lane 3.** **Design:** `design/game/12_SWARM_THE_PIT.md` "Drops — things that fall out of enemies".
**Size:** medium. Swarm only.

## Copy this seam exactly
`src/systems/swarmSupply.js` already drops a **repair cell**: an ordinary `type:'pickup'` entity, spawned
where an enemy died, with a TTL, claimed on `pickup:collected` by its id from the system's own ledger.
Read its header comment and code. Build the eight drops the same way, in a new
`src/systems/swarmDrops.js` registered beside `swarmSupply`, with data in new `src/data/swarmDrops.js`.

## The eight drops (names, effects and lines exactly)
| id | Name on the pickup | Effect | Line (short toast, max 2.5 s) |
|---|---|---|---|
| `full_rack` | Full Rack | every gun's ammo/heat and every power's cooldown refilled at once | *Reload, darling.* |
| `heavy_hands` | Heavy Hands | 20 s: every weapon's knockback impulse doubled | *Oh, now you've done it.* |
| `dead_weight` | Dead Weight | 20 s: any body the player throws kills the ship it touches (light and medium; heavies take 60 %) | *Throw something. Anything.* |
| `magnet` | Magnet | every scrap/credit pickup on the floor flies to the player (reuse mining's magnet pull) | *Tidy.* |
| `big_bang` | Big Bang | one Shove centred on the player with radius = the arena radius (the Shove field with a one-off radius) | *Everybody out.* |
| `double_scrap` | Double Scrap | 30 s: run scrap/purse earnings doubled | *The sponsors are generous.* |
| `loose_cannon` | Loose Cannon | a small auto-turret body that fires at the nearest enemy; tetherable, so the player can tow it; 60 s life. If no turret entity exists, use the closest existing drone/turret spec and say which | *It's not house-trained.* |
| `free_forge` | Free Forge | sets `run.freeForge = true` (the Forge packet will read it) | *On the house. Once.* |

**Rules:** drops are rare — at most **one drop per 12 kills**, never more than **2 alive at once**, TTL
**12 s**, chosen with `state.rng` (equal weights, `free_forge` at 1/4 weight). They drift and can be
latched with the Line (ordinary dynamic pickups). Timed effects show a small countdown chip using an
existing HUD status/buff chip if one exists (search `buff\|statusChip` in `src/ui`); if none exists, the
toast is enough — say so.

## Files you may edit
New `src/systems/swarmDrops.js`, new `src/data/swarmDrops.js`, the one site where `swarmSupply` is
registered, new `test/swarm-drops.test.mjs`. Weapon/power/field files only to read a multiplier hook that
already exists (report if you had to add one). `git diff` first.

## Checks
`node --test test/swarm-drops.test.mjs` (each effect applies and expires; caps respected; deterministic
for a seed) and `node --test test/swarm-supply*.test.mjs test/swarm*.test.mjs` — only the 30 known reds
may fail. Commit: `fleet(A01-03): eight drops fall out of enemies in the Pit`.
