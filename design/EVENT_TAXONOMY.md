# Telemetry Event Taxonomy

Documents every bus event the telemetry sink (`src/systems/telemetry.js`) subscribes to: the **real,
verified** event name, the **design question** it answers, the **payload fields** it reads, and which
**aggregate / funnel** it feeds. Every event name and field below was verified against an actual
`bus.emit(...)` site in `src/` (file:line cited) and cross-checked against the master event table in
`ARCHITECTURE.md` §"Event table".

Privacy: the sink is **local-only** — no network, no consent, no PII. It records gameplay shape
(counts, rates, positions, causes), never identity.

---

## Subscribed events

| Event | Design question it answers | Payload fields used | Feeds | Verified emit site |
|---|---|---|---|---|
| `game:started` | When does a fresh run begin? (lifespan anchor) | — | resets lifespan anchor `lastSpawnMark` | `src/main.js:98` |
| `save:loaded` | When does a loaded run resume? (lifespan anchor) | — | resets lifespan anchor | `src/save/saveSystem.js:430`, `src/main.js:30` |
| `player:respawn` | When did the player re-enter play after dying? (lifespan anchor) | — | resets lifespan anchor (so next death's `lifespanMs` is measured from respawn) | `src/systems/combat.js:206` |
| `economy:tradeCompleted` | What does the player trade, and how much volume? Is the trade funnel step reached? | `side`, `commodityId`, `qty`, `total` | `trades.{buy,sell}`, `trades.byCommodity[id].{buy,sell,qty}`; funnel `firstTradeAt`; ring buffer | `src/systems/economy.js:504` |
| `credits:changed` | How much money does the player earn vs spend, and from what? | `delta`, `reason` | `credits.{earned,spent}`, `credits.byReason[reason].{earned,spent}` — **sole money channel** | `src/systems/economy.js:548` (grant), `:559` (charge) |
| `entity:killed` | How many kills does the **player** score, and against whom? Is the first-kill funnel step reached? | `killerId`, `victimClass`, `type`, `factionId`, `bountyCr` | `kills.total`, `kills.byVictimClass`, `kills.byFaction`; funnel `firstKillAt`; ring buffer. **Filtered to `killerId === state.playerId`** | `src/systems/combat.js:156` |
| `player:death` | How and where does the player die, and how long did they survive? | `pos{x,z}`, `killerId` | `deaths.total`, `deaths.byCause`, `deathLog[]` (cause, killer, pos, `lifespanMs`); ring buffer; immediate persist | `src/systems/combat.js:194` |
| `mining:yield` | What ore does the player actually extract? Is the **first-mine** funnel step reached? | `commodityId`, `qty` | `ore.unitsTotal`, `ore.byType[id]`; funnel `firstMineAt`; ring buffer | `src/systems/mining.js:213` (asteroid), `:335` (wreck salvage) |
| `mission:accepted` | What mission types does the player take on? | `missionId`, `type` | `missions.accepted`, `missions.byType[type].accepted`; funnel `firstMissionAcceptAt`; ring buffer | `src/systems/missions.js:413` |
| `mission:completed` | What mission types does the player finish, and for which faction? | `missionId`, `type`, `factionId` | `missions.completed`, `missions.byType[type].completed`; funnel `firstMissionCompleteAt`; ring buffer | `src/systems/missions.js:662` |
| `mission:failed` | Which missions are failed (abandoned/lost)? | `missionId`, `reason`, (`type` often absent) | `missions.failed`, `missions.byType[type].failed`; ring buffer | `src/systems/missions.js:679` |
| `mission:expired` | Which missions lapse on their deadline? | `missionId`, `reason`, (`type` often absent) | `missions.expired`, `missions.byType[type].expired`; ring buffer | `src/systems/missions.js:696` |
| `tech:researched` | How far does the player progress the tech tree? | `nodeId` | `progression.techResearched`, `progression.techNodes[]`; funnel `firstTierUpAt`; ring buffer | `src/systems/ships.js:431` |
| `faction:repChanged` | When does the player cross a faction **reputation tier**? | `factionId`, `newTier`, `tierChanged` | `progression.factionTierUps`, `progression.tierUps[]`; funnel `firstTierUpAt`; ring buffer. **Filtered to `tierChanged === true`** | `src/systems/factions.js:232` |
| `dock:docked` | How often does the player dock? Is the first-dock funnel step reached? | `stationId` | `navigation.docks`; funnel `firstDockAt`; ring buffer | `src/ui/input.js:29` |
| `jump:arrive` | How much does the player travel, and which sectors do they visit? | `sectorId`, `interdicted`, `ambushCount` | `navigation.jumps`, `navigation.sectorsVisited[]`; funnel `firstJumpAt`; ring buffer | `src/systems/world.js:500` |

---

## Aggregate → events map (reverse view)

- **Trades by side/commodity** ← `economy:tradeCompleted` (volume/count only — **not** money).
- **Credits earned/spent + by reason** ← `credits:changed` **only**. Trade settlements, bounties,
  loot, mission rewards, refunds, charges all already flow through `credits:changed`, so the money
  buckets must not also add `economy:tradeCompleted.total` or mission reward amounts (double-count).
- **Kills (player)** ← `entity:killed` filtered to `killerId === playerId`.
- **Deaths-by-cause + death/lifespan log** ← `player:death` (cause derived; see below).
- **Ore mined by type** ← `mining:yield` (player, qty-bearing).
- **Missions by type + outcome** ← `mission:accepted|completed|failed|expired`.
- **Milestone timestamps (funnel)** ← first occurrence of dock / trade / mine / kill / mission-accept
  / mission-complete / jump / tier-up.
- **Progression / tier-ups** ← `tech:researched` + `faction:repChanged{tierChanged}`.
- **Navigation** ← `dock:docked`, `jump:arrive`.

---

## Onboarding-funnel correctness notes

- **`firstMineAt` keys off `mining:yield`, NOT `economy:tradeCompleted`.** A player who buys ore at one
  station and resells it elsewhere must **not** be counted as having "mined" — only a real ore release
  from an asteroid/wreck (`mining:yield`) advances the mining funnel step. Verified at
  `src/systems/mining.js:213` (asteroid) and `:335` (wreck). The onboarding system
  (`src/systems/onboarding.js:47`) uses `mining:tick`/`mining:start` for the same step; telemetry uses
  `mining:yield` because it is the qty-bearing, player-attributable signal.
- **`mining:tick` is intentionally NOT subscribed.** It fires every frame (player **and** automation
  drones — `src/systems/automation.js:303`) and carries no `qty`, so it would both double-count
  ore-by-time and let drone mining false-trigger the player's first-mine step.

---

## Death-cause derivation

`player:death` carries only `{pos, killerId}` — there is **no native cause field**. The sink derives a
coarse cause at handler time by reading the killer entity from `state.entities.get(killerId)` (the
killer outlives the victim within the same kill resolution):

- `killerId == null` → `environmental` (hazard / out-of-bounds / collision with no attacker credited).
- `killerId === playerId` → `self`.
- killer `type === 'ship'` → `ship:<shipClass>` (from `killer.data.shipClass`).
- killer `type === 'asteroid' | 'station'` → `collision:<type>`.
- killer not found in `state.entities` → `unknown`.

---

## Telemetry gaps (events that SHOULD fire for good telemetry but currently do NOT)

These are documented as **gaps**, not invented as if they exist:

1. **No player-progression / player-level tier event.** `ARCHITECTURE.md` references a "player tier"
   that derives `fleetCap` (line ~488), but nothing emits a `player:tierUp` / `progression:tier`
   event. The closest signals are `tech:researched` (tech progression) and
   `faction:repChanged{tierChanged}` (per-faction rep tier). Telemetry uses those as a proxy and the
   `firstTierUpAt` funnel step fires on either. A dedicated player-progression-tier event would make
   the progression funnel exact.
2. **`player:death` has no cause field.** Cause is reconstructed heuristically from the killer entity
   (above). A native `cause`/`damageType` on the payload (e.g. `'combat' | 'hazard' | 'collision' |
   'self'`) would remove the heuristic and the `unknown` bucket.
3. **No session-end / app-quit event.** Nothing on the bus marks "this play session ended", so the
   final aggregate flush relies on browser page-lifecycle listeners (`visibilitychange`, `pagehide`,
   `beforeunload`) plus a debounced periodic write. A `game:sessionEnd` (or a `game:quit`) event would
   let the sink flush deterministically and stamp an accurate `durationMs`.
4. **Drone-mined ore is not attributable via `mining:yield`.** Automation drones emit `mining:tick`
   (`src/systems/automation.js:303`) but **not** `mining:yield`, so passive/drone ore is excluded from
   "ore mined". This is correct for a *player-activity* funnel, but a separate
   `automation:oreMined{commodityId,qty}` event would let career stats account for passive yield.
5. **`mining:yield` does not distinguish mining from salvage.** It fires for both asteroid extraction
   (`src/systems/mining.js:213`) and wreck salvage (`:335`) with the same shape. The two are only
   separable by classifying `commodityId` against the ores/salvage category table
   (`src/data/mining.js` — `category: 'salvage'`). A `source:'asteroid'|'wreck'` field, or using the
   existing `salvage:completed` event (`src/systems/mining.js:341`) for a dedicated salvage aggregate,
   would make the split explicit. (Telemetry currently lumps both into ore-by-type.)
6. **`mission:failed` / `mission:expired` omit `type`.** Their payloads are `{missionId, reason}`
   (`src/systems/missions.js:679`, `:696`) with no `type`, so the per-type outcome breakdown folds
   failed/expired missions into the `unknown` type bucket. `mission:accepted` and `mission:completed`
   do carry `type`; adding it to failed/expired would close the loop.
7. **No explicit `player:tradeProfit` granularity per commodity.** `economy:tradeCompleted` carries an
   optional `profit`, but it is the *trade's* profit, not per-unit, and is `undefined` for buys. Profit
   attribution per commodity is therefore only approximate from the volume aggregate.
