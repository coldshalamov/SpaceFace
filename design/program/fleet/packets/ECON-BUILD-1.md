# ECON-BUILD-1 — prices from stored curves and events; no market work while flying

**For:** a careful engineer. **Kind:** simulation refactor with a save migration. **One commit per
part.**

## Why

The owner (2026-11-20): "some stuff about the economy seemed like it was weirdly messing with
performance… there has to be a way to do that in the backend of the station with stored values or
something, not in gameplay." And: prices should "follow recognizable mathematical equations in
their trends for a while and randomly turn on an event, so a player could sort of pattern match a
possible trade route… a gold rush for a while until an event happens."

An audit measured it and designed the replacement: **read all of
`.devshots/director/fable/econ/AUDIT.md` first.** Its finding: the market pass costs little on
average but lands a 3–11 ms bite every five seconds of flight (one slice re-projects demand for
about 400 listings), a visible hitch on a 16.6 ms step. Its section E is the build plan; the
director's design is `design/overhaul/06_PROGRESSION_AND_ECONOMY.md` §5.4 and ruling R20 in
`design/overhaul/00_RULINGS.md`. Where they differ, this page decides.

## Build

**Part A — the pure price function.** `P(good, station, t)` as the audit's section E describes:
station level from role data × a regime curve × scheduled event multipliers × the player's
decaying dents. Evaluated only when something asks (market screen, map Economy/Trade views,
`computeBestTrades`, `quote()`, a trade). Regimes: **Steady** (flat, a faint ripple), **Climb**,
**Slide** (the audit's EBB), **Swing** (the audit's SEASON), **Squeeze**, **Glut**, with the
audit's formulas and durations, each handed over with the existing short crossfade. Regime identity
and parameters come from a hash of (save seed, station, good, epoch index), never from the shared
random stream. Player-facing names for the regimes are these six plain words.

**Part B — events on a seeded schedule.** Per region, the audit's epoch grid; each event has a
place, a cause, the goods it moves, a window and the regime it leaves behind. Events the player or
the world causes (a convoy destroyed, a blockade, a strike, a new mine) append to the same list
from the owners that already emit those facts. Each event produces one plain line of news through
the existing news seam when a news surface asks.

**Part C — dents.** The player's own buying and selling moves a price in proportion to the amount
against the station's size and recovers on a half-life, capped as the audit proposes. The chart
shows the dent healing.

**Part D — delete the per-step work.** Remove the five-second market pass and its three phases,
the economy clock, `drainTick`, event ageing and spontaneous rolls, the pass cursor and the
`economy:tick` receipt (move its two piggybackers to their own cheap event, as the audit says).
The economy keeps event handlers and the on-demand API. `traffic`, `npcJobsRuntime`, automation
and asteroid sites are out of scope.

**Part E — the chart and the screens read the new function.** Price history is the function
evaluated at past times plus the event list (no logged ring). The market chart, the map's economy
views and the trade computer keep their shapes and read the closed form. Add to the market
chart's data: the regime's plain name, how long it has run, and a flag when an event is active,
so the screen can say "Climbing for 12 min" (another agent is rebuilding the station screen's
layout; provide the data, do not restyle the screen).

**Part F — what the player knows.** A price is known for a station the player has docked at or
has news from, stamped with when it was seen; views that list other stations' prices show the
age ("seen 14 min ago") and use the remembered value, not the live one. The existing market-memory
and uplink snapshot code is the place for this.

**Part G — save migration.** As the audit's section E lays out: cycles map to regimes, saved stock
becomes one decaying dent, events become scheduled rows, derived caches are dropped. Old saves
load and show sensible prices. Bump the save version; add the migration and a fixture test.

## Prove

- The audit's harness, before and after
  (`node .devshots/director/fable/econ/measure-adventure-econ.mjs`): the economy rows and the
  five-second spikes are gone; report the table.
- Unit tests: `P` is deterministic for a seed; the same market evaluated now, or after an hour
  away, agrees with itself; each regime's curve has its shape; an event flips a regime; a dent
  recovers and caps; a never-visited station prices without creating state; best-trade search uses
  remembered prices with ages.
- `npm run check:sim`: this change alters simulation state, so re-record the golden in the same
  commit and say so. The audit's section F lists the missions, contracts and tests that depend on
  today's behaviour: run each, fix what the new model breaks, and list them in the receipt.
- `node scripts/fleet/game-lock.mjs run -- npm run check:playable`.
- In the receipt: a table of ten goods at three stations showing price now, +10, +30 and +60
  minutes for one seed, so the director can see the curves; what was deleted; what a player sees
  that is new.

## Files

`src/systems/economy.js`, `src/systems/economyCycles.js`, `src/economy/*`, `src/data/economy*.js`,
`src/data/commodities.js` (read), the market-memory and news seams, `src/save/*` migration, the
manifest and step order where the economy slot is removed, tests, fixtures. Shared files
(`authoritativeSystemManifest`, `mainToSimEventSurface`, save version): use
`bash scripts/fleet/own-commit.sh begin <file>` before editing and
`bash scripts/fleet/own-commit.sh commit "<message>" <files>`.
