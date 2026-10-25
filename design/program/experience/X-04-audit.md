# X-04 audit — guided first gate jump + return

Row: build_map §1P 562. Authored by read-only catalog agent (bfca75eb), recorded by devin-lanea 2026-10-24.

## What exists

- The rail ends at B5 `choice`; no beat touches gates (`onboarding.js:293-376`). `gate:range` → `_showHint('firstGate')`
  ("Plot a jump.", `onboarding.js:741-745`, `hudAttention.js:392`) plus the alert "JUMP GATE · OPEN STARMAP"
  (`ui/alerts.js:472-475`).
- Toll: `gateTollFor(sector) = round(50 + 200·security)` for security > 0.6 (`data/travelChoices.js:15-17`), charged
  in `world.js:5813-5830` (`economy:chargeCredits {reason:'gate_toll'}`). Helios→Ceres = 194 cr. The galaxy map
  prints "N cr toll" under the jump verb (`galaxyMap.js:1064-1102`).
- First-trade contract (`economyContractTemplates.js:312-365`, posted once on first Helios dock) routes to Ceres;
  brief names the tolls. Pays 760 vs ~440 round-trip tolls (`test/first-session-places.test.mjs:101-109`).
- Insufficient credits → `reject('credits', …)` → "Gate toll N cr — purse holds M cr" (`ui/jumpNotice.js:46-52`).
  No broke-at-gate credit rescue (FIRST_SESSION_MAP §5 gap 3).

## Missing

- A guided moment at the first gate that connects the toll to the run's pay, and a return-leg line on arrival.
- The rejection line never says how to earn the toll.

## Approvals

- audit-gate reviewer 27464a4d — APPROVE (2026-10-24)
- audit-gate reviewer 98e62e20 — APPROVE (2026-10-24)
- audit-gate reviewer 03b56769 — APPROVE (2026-10-24) — audit✓3
