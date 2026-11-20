# SCREENS-1 — a station is a place with five doors, not a dashboard

**For:** a designer-builder with eyes. **Kind:** the docked station screens. **One commit per
part.** The director judges your frames.

## Why

Docking is where an Adventure player spends their money and picks their next hour. Today the
station opens straight onto a dense dashboard. Open
`.devshots/director/fable/screens1/station-market.png` (and shoot fresh ones): a header, two hint
cards, a status block with five meters and four small buttons (Repair, Insure, Draw, Rearm), two
ticker lines ("BAY SCREEN · Shift Office…", "STATION WIRE · Local Wire…"), eight filter chips, a
table, a detail pane, and a bottom bar where tabs 6 and 7 are **printed on top of** Comms, Help and
Undock at 1366×768 (the bench reports it: "Bar is printed on top of Comms", "Station tab Ledger…
UNREACHABLE"). A stranger cannot tell what to do first. The owner (2026-11-20): "there's probably a
lot about the UI and the menus that maybe we could upgrade."

Rulings that apply (`design/overhaul/00_RULINGS.md`): R3 gear on the floor, R4 the yard is a place,
R18 plain words, R20 prices move in readable trends and flip on news, R21 each trade is its own
game, R22 the hold is a bag of slots.

## Look first

`node scripts/ui-bench.mjs --shot=station,station-dock,station-market,station-shipworks,station-industry,station-contracts,station-factions,station-bar,station-ledger,station-law-desk --viewports=1280x720,1366x768,1920x1080 --out=.devshots/screens1/before`
and open every PNG. Find the station shell and each tab (`ls src/ui/station`, grep the tab ids).

## Build

**Part A — Arrival: the concourse.** Docking lands on one calm page, not a tab:
- The station's name, who runs it and one line of character, over its art.
- **One service button**: "Service ship · N cr" that repairs, refuels and rearms in one press, with
  the three prices itemised beneath and each still pressable alone. If nothing is needed it says
  "Ship is ready".
- **Five doors**, large, each with a live one-line summary so the player can choose without
  opening it: **Market** ("Iron ore up 11% · 4 goods you carry sell here"), **Jobs** ("3 open ·
  best pays 2,400 cr"), **Shipyard** ("Hull 86% · 2 new guns in stock"), **People** ("Maera Vols
  wants a word · Concord trust: neutral"), **Works** (only where the player has industry here:
  "Refinery idle · 40 ore waiting"). Number keys 1–5 open them. Controller and touch reach all.
- **One news line** in place of the two tickers: the newest thing that matters here (a price
  moving, a convoy lost, a bounty posted). Flavour chatter may rotate through it when nothing
  matters, at low emphasis.
- **Undock** is always bottom-right, always visible, never covered.
- First-visit teaching is one card at a time and it never covers a door.

**Part B — Seven tabs become the five doors.** Market keeps trade and gains the hold and station
storage. Jobs holds missions, contracts and bounties. Shipyard holds ships, fitting, repair and
insurance. People holds the bar, factions, the law desk and comms history. Works holds industry
and base. The ledger becomes a "Records" link inside People. Nothing is deleted; it is regrouped so
the bar fits at 1280×720 with room to spare and nothing overlaps at any of the three sizes.

**Part C — Market reads like a trading desk.** The chart is the hero: bigger, with the last move in
words ("Rising for 6 days", using whatever the price data provides today; a new price model is
coming and will feed the same chart), the station's average, and the best place the player knows
to sell this good ("Sells for 41 at Vesta Forge · 2 jumps · +9 a unit"). Buy and Sell are two
equal, clear buttons with quantity steppers that work by keyboard, wheel, controller and touch.
The eight filter chips collapse to four (All, In my hold, Raw, Goods) plus search. Rows show a
trend arrow and never truncate numbers ("32 un…" is cut off today).

**Part D — Each remaining door gets one pass** for the same faults: one primary action per view,
no cut-off or overlapping text, no row of tiny equal buttons, plain words, no disabled control
without a line saying why.

## Prove

Before and after frames of the concourse and each door at 1280×720, 1366×768 and 1920×1080.
`node scripts/ui-bench.mjs --shot=<station shots> --walk` reports no findings at all three sizes.
Station tests (`ls test | grep -i station`) pass, with the ones that pin the seven tabs rewritten.
One run in the real game through the lock (`node scripts/fleet/game-lock.mjs run -- <probe>`):
dock at Helios, take a frame of the concourse, press the service button, buy and sell one good,
open each door, undock. In the receipt: frame paths, files changed, anything you regrouped that a
player might look for in the old place.

## Files

`src/ui/station/**`, the station shell and its CSS sources (regenerate sidecars with
`node scripts/lib/buildUiCssSidecars.mjs`), `tools/ui-bench.js`, tests. Do not change what buying,
selling, repairing or accepting a job does in the simulation; this is the screen. Another agent
edits player-facing strings across `src/ui/`: for a shared file use
`bash scripts/fleet/own-commit.sh begin <file>` before editing and
`bash scripts/fleet/own-commit.sh commit "<message>" <files>`.
