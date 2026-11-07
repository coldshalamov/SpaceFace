# Q3 review — primary screens, 2026-11-07

Scope: six headed `ui-bench` captures at 1280×800 over the current tree —
`station-shipworks`, `flight`, `station-market`, `ship`, `help`, `pause`. The bench mounts the real
screen modules over a frozen still; this is composition/legibility evidence, not a live-route claim.

Rubric: `design/program/finish/campaigns/Q3/RUBRIC.md` (hierarchy, legibility, affordance, system
fidelity, restraint).

## Findings

| Surface | Verdict | Notes |
|---|---|---|
| Shipworks | **fixed in this pass** | Socket 03 printed the raw boolean **“true”** as the stock drive's name (`name = stockDrive || slotName`). A driver now reads “Drive / STOCK · M”. Fixed in `src/ui/station/screens/shipworks.js`; the re-shot PNG reads correctly. |
| Flight | pass | Objective, radio, threat banner, power rail, speed/energy, drive cooldown and radar all read at `TOP 180 / 49 U/S`; no raw ids or booleans. |
| Station market | pass | Buy/sell/stock columns, sparkline (38 / avg 14 / spread 3), quantity and total agree; repair and “fly damaged” consequences are explicit. |
| THE SHIP | pass | Seven socket callouts name the mount and state (`Drive OPEN / M`, `Drive stock`); the six-stat sheet and build word are one source; no duplicate role. |
| Help | pass | Context card and every-key reference; the only keyboard-only time-trial restart is absent from the pad table; the long list scrolls at the fold. |
| Pause | pass | Resume hierarchy, flight brief, tracked contract, quick-save line and footer keys are readable; no competing voice. |

## Limitations

- The bench is a synthetic still: it proves composition, type, spacing and control reachability, not
  the live player route. The live route evidence remains `check:playable` and the route tier.
- No independent second reviewer has signed this file yet; Q3's two-reader rule stays open.
