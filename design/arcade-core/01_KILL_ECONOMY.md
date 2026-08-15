<!-- LIFETIME: DURABLE -->
# 01 — KILL ECONOMY: burst, vacuum, and the unified earn model

**Owner priority: this is the single most necessary missing piece.** The skeleton exists and
was simply never finished into the loop the owner described.

## Current state (verified by reading code)

- `src/systems/lootShards.js` already listens to `entity:killed` and, for player-killed hostile
  ships, emits `loot:drop` with a **flat** bundle: 4 scrap pickups (12–18 each), 5 electronics,
  3 alloys. Same bundle for a Wasp and a gunship. No credits. Mission-owned and civilian hulls
  fail closed (correct — keep).
- The magnet vacuum **already ships** inside mining (`mining._updatePickups` — homing vacuum
  with inherited player velocity + relative approach). It services ore pickups. It is not a
  general combat-loot system with its own tuning identity.
- Tech tree (`src/data/tech.js`) and ship/module purchases consume credits. There is no
  combat-XP currency; progression is purely monetary.

## The unified earn model (owner decision, encoded)

Three reward channels, each with a **physically sensible source**. This answers "why would a
creatively killed enemy drop more stuff?" — it wouldn't:

| Channel | Source fiction | Scales with victim | Scales with kill style |
|---|---|---|---|
| **Materials** | The victim's hull and cargo, physically blown out | YES (hull class, cargo manifest) | **NO — never** |
| **Credits** | Bounty/salvage-rights payout for the kill (faction-of-victim hostile standing, contract multipliers) | YES | YES (02_STYLE_KILLS multiplier applies here) |
| **Skill/XP** | Feeds tech-tree unlocks (audit `tech.js`; if the tree is credits-only, add a slim `xp` wallet on `state.player` rather than a parallel economy) | YES | YES (same multiplier) |

Materials stay honest: a Wasp carries Wasp scrap whether you shot it or slammed it into a rock.
Creativity pays through **credits and XP** (the world values skill), which is also what the
player actually needs for the upgrade treadmill.

## Spec

### 1. Kill burst (extend, don't replace, `lootShards`)

- Victim-scaled bundles: material count and commodity mix derive from the victim's hull class
  and any cargo manifest. Data-driven table in `src/data/` (new `killRewards.js`): per enemy
  archetype → burst recipe (commodity ids, qty ranges, pickup count). Light swarmer: small
  scrap spray. Brawler/gunship: alloys, electronics, munitions, more pickups. Named aces: rare
  commodities + a credit bounty.
- Credits drop as their own pickup type (`credit_chip`) — physical chips that vacuum like
  everything else. Keeps "everything valuable is a thing in the world that flies into you."
- Burst presentation: pickups eject radially with randomized impulse from the death point
  (they *erupt*), inherit a fraction of victim velocity, then vacuum handles collection.

### 2. Universal vacuum (promote from mining to a pickup-owned system)

- Extract the homing logic into a shared pickup-attraction module owned by pickups, consumed by
  mining and combat loot alike. One behavior, two callers — do not fork it.
- Combat-loot tuning targets (starting values, tune in the combat lab):
  - magnet radius: **420 wu** (mining 2.0 target — "if you can see it, you're collecting it")
  - approach speed 100–280 wu/s relative, convergence authority ~900 wu/s²
  - pickups sweep *toward the player's current motion* so collecting while flying through a
    fight feels like breathing in, not stopping to vacuum
- Magnet radius and pull strength become **module/ship upgrade stats** (progression = agency).

### 3. Flow feel (the 30-second loop)

- Zero interruption: collection requires no aim, no prompt, no beam. Fly-through = collect.
- Pickup stream reads as motion + audio, not UI: streaking trails toward the hull and a
  rising pitch ladder on chained pickups (audio discipline per 10_JUICE_DISCIPLINE).
- Despawn: uncollected pickups persist long enough to finish the fight (~90 s), then fade.
  No FOMO ball-chase mid-combat.

## Bans

- No materials multiplier from kill style (see table).
- No new currencies beyond the three channels.
- No inventory popups, "LOOT" banners, or pickup toasts (I-4).
- No per-kill economy transactions — credits settle on pickup collection, not on death.
- Do not touch the civilian-manifest payload path in `lootShards.js` (freight custody owns it).

## Acceptance (per 09_VALIDATION)

- Bot route: spawn mixed hostile wing (2 swarmers, 1 brawler), kill all with the starter fit.
  Metrics: ≥ 95% of dropped pickups collected within 8 s of fight end **without the bot
  steering toward any pickup** (pure fly-over); total credit+material value within the data
  table's expected band; vacuum onset ≤ 0.5 s after entering radius.
- Determinism: reward rolls stay seeded per victim identity (existing pattern — keep).
- Human gate: 60-second capture of a real fight showing burst → eruption → stream-in reads
  without the player thinking about it.
