# Swarm Program — making the Crucible's swarm mode the flagship sandbox

2026-09-29 — build document. The swarm is where new guns, tools and hulls get sandboxed and
demoed. It has to be the most polished thing in the game. This document is the gap list
between what the mode is and what it needs to be, and the build order it ships in.

**Next layer (owner, 2026-10-02): [`SWARM_ARCADE.md`](./SWARM_ARCADE.md)** — Swarm as its own
arcade game: banked currency and a permanent Hangar, Swarm-only juice, a curated ladder, and
crossover unlocks into Adventure. It reverses several laws below for Swarm (its §1.1).

## The dream, in the owner's words

- Fight waves for credits; **choose a difficulty that sets the starting purse** ("pick easy,
  get a shitload of credits and buy everything I need").
- A **custom buy screen** that shows everything purchasable and can **showcase/demo** items.
- **Choose any player ship**; **buy any attack, tool or feature** — a complete, exhaustive
  sandbox of everything in the game.
- **Several levels** with complex gameplay and intentional environment, where **semi-curated
  events are made inevitable by the structure of the room** and the placement of its objects.

## What exists today (ground truth)

- `src/data/swarmMode.js` — the endless ruleset: quota-based rounds, concurrency 10→30,
  roster clock, a boss every 10th round, a breath reservoir that telegraphs reinforcement
  surges. Pressure is concurrency, never HP (`swarmLevel` is pinned at 1).
- `src/systems/survivalRun.js` — the phase machine: `loadout → arena_intro → wave_intro →
  active → cleanup → draft/refit → wave_intro`. The armory opens through the real `draft`
  phase; swarm visits it every round (`SWARM_DRAFT_EVERY=1`) and the refit bench every 10.
- `src/systems/survivalDraft.js` + `src/ui/screens/crucibleDraft.js` — the Armory: a browse-all
  shop spending the run wallet (`run:spendRequested` → `run:spent` → `ships.fitModule`),
  with price dividers, a reading panel (verb, activation, hardpoint jig, weapon compare,
  budget gauge), category words, and named evolution syntheses.
- `src/systems/survivalArena.js` + `src/systems/swarmArena.js` — the rooms: `planArenaInstall`
  per wave (fields on two kernel slots, mines, cover, Foundry toys), six-phase Foundry cycle
  plus boss-room variants, per-arena debris bands and optic lattices, wreck culling, spawn cap
  raised to 38 through `spawnBudget.setMax`.
- Five arenas: helios_core (banks/Foundry, the polished one), lagrange_crucible (pull/sling),
  cinder_sluice (current/ride), cryo_drift (freeze/plate), storm_lattice (conduct/relay).
- `src/ui/screens/crucible.js` — the door: mode/starter-build/arena/seed/share/ghost/modifier
  pickers, record band, results.
- Run wallet: `state.run.credits` starts at 0; wave clears pay `quota*2 (+40 boss)` through
  `run:awardRequested`; credit chips drop in-world.

## The gaps

1. **No difficulty, no purse.** The wallet always opens at 0 and there is nothing to pick
   that changes it. The door has no stake row.
2. **Hull choice is ten preset packages on three hulls**, gated behind the unlock ladder.
   "Any player ship" is not offered anywhere.
3. **The armory is curated, not exhaustive.** ~42 offers (14 weapon + ~28 module rows) of the
   ~145 purchasable defs, no hulls for sale, no services (hull repair, charge restock), and
   nothing to demo an item short of buying it.
4. **The armory cannot open before round 1.** `loadout` only reaches `arena_intro`, so even
   a purse could not be spent until after the first fight.
5. **No mid-wave events.** The room's phase is chosen at plan time and holds for the whole
   wave; nothing telegraphed arrives on a clock, and outside the Foundry the law rooms are
   mostly static fields. The "semi-curated" feel — events that are inevitable because the
   room and its objects are built to produce them — does not exist yet.
6. **Records/ghosts/share codes don't carry a stake**, so an easy-mode run would be
   indistinguishable from an honest one.
7. Polish ledger: only `helios_core` is exercised end-to-end; swarm copy and HUD lines are
   thin outside it.

## The build

### S1 — Swarm stakes: difficulty → purse + pressure

- `src/data/swarmStakes.js` (pure, frozen): four stakes.
  | stake      | purse   | pressure | earn  | score | the pitch |
  |------------|---------|----------|-------|-------|-----------|
  | exhibition | 2,400   | ×0.65    | ×0.75 | ×0.5  | Walk in rich; the room is a classroom. |
  | contender  | 750     | ×1.0     | ×1.0  | ×1.0  | The run the swarm was tuned for. |
  | veteran    | 250     | ×1.15    | ×1.25 | ×1.5  | Thin purse, thick pack. |
  | ironbound  | 0       | ×1.3     | ×1.5  | ×2.0  | Nothing but the hull. |
- `run:beginRequested` accepts `swarmStake`; `runSession.begin` stores it on
  `run.telemetry.swarmStake` (telemetry is schema-free, never serialized).
- `applySandboxSetup` awards the purse via `run:awardRequested` right after begin, before
  `loadoutReady` — the wallet is loaded when the armory opens.
- `planWave` accepts `swarmStake`; the swarm block scales `concurrent` (still clamped under
  `SPAWN_BUDGET_HARD_MAX`), `killTarget` and reinforce surge; `swarmRewards` scales credits
  by `earn` and score by `score` (integer-rounded, never fractional).
- Records/share: the stake id rides `loadoutRules` (and thereby share codes + ghost parity)
  and shows on the door record band and the results surface.

### S2 — The opening armory (spend the purse before round 1)

- `RUN_PHASE_TRANSITIONS.loadout += 'draft'` — the only new edge in the phase machine.
- `survivalRun._prepareOpening`: for swarm, the loading gate fast-forwards `loadout → draft`
  and stops. The armory opens on the prepared scene with the purse in the wallet.
- The screen's "Launch round 1" resolves the draft; `draft → wave_intro → active` plans and
  fields round 1 through the identical pipeline every round uses. Wave 0 is a legal draft
  wave (`SWARM_DRAFT_EVERY=1`), so no special casing inside `_openDraft`.
- `crucibleDraft` reads `run.wave === 0` as the loadout bench ("Fit out before round 1").

### S3 — The exhaustive armory

- `src/data/swarmCatalog.js` (pure): the complete purchasable catalog — every WEAPONS and
  MODULES def that is not `unique`, `salvageOnly`, or `purchasable === false` — each priced by
  the shipped `swarmPurchasePrice` tier table. Grouped for the tabs: Weapons / Defence /
  Drives / Rigs / Yard / Hulls.
- `offerDraft` (and the owner's `currentOffers` re-eval) draws the swarm pool from the
  catalog — legality still per-hull, so the shop is exhaustive but never lies about fit.
- **Hulls on the rail**: `hull:<shipId>` offers priced by tier; purchase = spend →
  `ships.buyShip({ defId, grant: true, setActive: true })`. Owned hulls re-list free
  ("Switch"). The stock re-derives against the new hull on the same open armory.
- **Yard services**: `svc:repair` (full hull+armour weld — `service:completed` with computed
  restore figures), `svc:charges` (impulse-charge restock via `addCargo`).
- **Spec sheet**: the reading panel gains authored figures — weapons show dps / impulse /
  rate / heat; modules show their `mods` map in words; hulls show hull / shield / mass /
  slot summary. Every figure read off the def, never copy-pasted prose.
- **Demo**: a `Demo` verb on catalogue offers fits the item free, flagged as the run's
  single trial. It strips automatically at the next armory unless bought — buying the same
  def keeps the fitted instance ("buy it or lose it"). One trial at a time; a new trial
  retires the old.

### S4 — Semi-curated arena events

- `src/data/swarmEvents.js` (pure): per-arena event tables + shared events.
  `swarmEventFor({ arenaId, wave, seed })` is deterministic — an event round every
  `SWARM_EVENT_EVERY` (5) picks one of the arena's signature cards, with shared cards in the
  mix; boss rounds always carry the boss room instead.
  - helios_core: `shutter_storm` (the shutters run the surge cycle mid-wave), `furnace_flare`
    (the repulsor flares hot), `plate_drift`.
  - lagrange_crucible: `well_swing` (the well walks a chord), `sling_gust`.
  - cinder_sluice: `sluice_surge` (the lane floods hard for a window), `undertow_snap`.
  - cryo_drift: `freeze_front` (a freeze front sweeps a bearing), `plate_shatter`.
  - storm_lattice: `relay_arc` (the relay graph energizes), `grid_surge`.
  - shared: `mine_drift` (mines ride in on a bearing), `supply_drop` (a salvage pod worth
    run credits lands — staying for it is a choice).
- `src/systems/swarmEvents.js`: the director. Arms on `run:waveStarted` during `active`,
  telegraphs via the shipped `alert` seam, then spends the event through the shipped seams
  only — `fields.updateExternal` surges/calms an installed field, `mines:placeRequest` drifts
  mines in (still bounded by `ARENA_MINE_MAX`), the room's own toys run their authored cycles.
  No entity writes, no direct state mutation — the room stays the writer.
- `planArenaInstall` accepts `swarmEvent` so an event round can pre-place the objects the
  event needs (the lane the sluice floods, the mines' berth) — the inevitability comes from
  placement, exactly as asked.

### S5 — The door upgrade

- Stake row (swarm only): four tiles, each naming purse + pressure + earn so the trade is
  legible before launch.
- "Any hull": the starter row gains a hull grid — every ship in `SHIPS`, grouped by tier —
  that launches on a bare hull (or its authored defaults). With the purse + opening armory,
  bare is the point: pick the hull, walk in, buy the kit.
- Arena cards name the arena's law AND its signature events, so the pick is a decision.
- Stake rides the share-code `loadoutRules` and the results surface; ghosts stay honest.

### S6 — Polish + honesty

- HUD: stake beside the run wallet; the event telegraph reuses the one-voice `alert`
  arbiter.
- Results: stake in the run record rules and the results rows.
- Tests: stakes pure data, purse lands pre-armory, `loadout → draft` walk to round 1,
  catalog completeness vs the real def tables, hull swap re-derives legality, event table
  determinism, trial strip/buy-to-keep, stake in run records.
- The swarm roster/optics/debris paths stay as they are — the pressure machinery is good;
  the work is the sandbox around it.

## Commit order

1. This document.
2. S1 stakes (data + launch plumbing + plan scaling + records).
3. S2 opening armory (phase edge + `_prepareOpening` + screen copy).
4. S3 armory (catalog data + purchase kinds + tabs + spec sheet + trial).
5. S4 events (data + director + install hooks + telegraph).
6. S5 door (stake row + hull grid + arena copy + share/records).
7. S6 polish + tests.
