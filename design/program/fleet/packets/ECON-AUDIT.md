# ECON-AUDIT — what the economy costs while flying, and how prices work today

**For:** a careful engineer. **Kind:** audit with one measurement. **No source edits. No commit.**
Write one report file and stop.

## Why

The owner (2026-11-20): "some stuff about the economy seemed like it was weirdly messing with
performance… there has to be a way to do that in the backend of the station with stored values or
something, not in gameplay." He wants prices that follow recognisable trends for a while and flip
on events (ruling R20 in `design/overhaul/00_RULINGS.md`; read R20 and R21 first). Before anyone
rebuilds it we need to know exactly what runs today and what it costs.

## Find

1. **What runs every simulation step.** List every system the fixed step calls in flight that
   belongs to the economy or the living world's bookkeeping: markets, price updates, production and
   consumption, contracts, cargo custody and reservations, NPC jobs, traffic and convoys, station
   stock, news. Start from the step's system order (grep the scheduler in `src/core/` for the list
   of systems and their cadence) and `src/systems/economy.js`, `economyCycles.js`,
   `economyContracts.js`, `cargo*.js`, `npcJobs*.js`, `traffic*.js`, and the data in
   `src/data/economy*.js`, `commodities.js`, `regionalEconomyProfiles.js`,
   `stationMarketBroadcast.js`. For each: how often it runs, what it loops over (all stations? all
   goods? all ships?), what it allocates, and what would break if it ran only when a market screen
   or the map was opened.
2. **What it costs.** The headless profiler exists: `node scripts/sim-crowd-stress.mjs` (read its
   flags; it has per-system buckets). Find or add a flag that runs an **Adventure** flight (not a
   Swarm round) for 3,600 ticks and prints milliseconds per system, then report the economy,
   traffic and NPC-job rows: mean, 95th percentile, worst tick, and what happens on the worst tick.
   If the script cannot run Adventure, say so and measure with the smallest harness you can write
   under `.devshots/director/fable/econ/` (not committed). Do not boot a browser.
3. **How a price is decided today.** From the code, the exact formula for the price a player sees
   at a station: base price, stock, demand profiles, cycles, half-lives, events, the player's own
   trades, faction and law modifiers. Where it is stored in the save. Whether an unvisited station's
   prices advance while the player is elsewhere, and how.
4. **What already exists that R20 can reuse.** Price history, charts, news or broadcast lines,
   events that touch prices, trade-route hints on the map (`src/ui/galaxyMap.js` has an Economy
   tab), a trade computer, any "regime" or "cycle" idea. Also read
   `economy-model-report/MODEL-AUDIT.md` at the repo root (an earlier model audit) and say whether
   its numbers match the live data.
5. **Trading as a player activity today.** Walk the path: where a player sees prices, how they find
   a route, what skill or equipment improves trading, what the best credits-per-hour route is from
   the data, and what makes it boring or opaque.

## Report

Write `.devshots/director/fable/econ/AUDIT.md` (create the folder):

- **A. Per-step work table** (system, file:line, cadence, loop size, cost, can it be lazy?).
- **B. The measurement** (the command, the table, the worst tick explained).
- **C. Today's price formula**, written as one expression with each term explained in a sentence.
- **D. Reuse list** with file and line.
- **E. A concrete proposal for R20** sized for this code: the state per (good, station), the
  closed-form regime curves (name five; give each formula and typical duration), how an event is
  scheduled deterministically from the save seed and clock, how the player's trades dent a price
  and how it recovers, how a market that was never visited is evaluated on demand, the save
  migration, and which per-step systems get deleted or made lazy. State what the player would see
  on a price chart for each regime so they can learn to recognise it.
- **F. Risks**: which missions, contracts or tests depend on today's behaviour.

Facts with file and line. Your receipt is a pointer to the report plus the three most important
findings in plain words.
