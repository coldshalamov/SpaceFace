# Q3 review — primary screens, 2026-11-07

Scope: six headed `ui-bench` captures at 1280×800 over the current tree —
`station-shipworks`, `flight`, `station-market`, `ship`, `help`, `pause`. The bench mounts the real
screen modules over a frozen still; this is composition/legibility evidence, not a live-route claim.

Rubric: `design/program/finish/campaigns/Q3/RUBRIC.md` (hierarchy, legibility, affordance, system
fidelity, restraint).

## Findings

| Surface | Verdict | Notes |
|---|---|---|
| Shipworks | **fixed in this pass** | Socket 03 printed the raw boolean **“true”** as the stock drive's name (`name = stockDrive || slotName`). It now reads “Drive / STOCK · M”; the re-shot PNG is correct. |
| Flight | pass | Objective, radio, threat banner, power rail, speed/energy, drive cooldown and radar all read at `TOP 180 / 49 U/S`; no raw ids or booleans. |
| Station market | pass | Buy/sell/stock columns, sparkline (38 / avg 14 / spread 3), quantity and total agree; repair and “fly damaged” consequences are explicit. |
| THE SHIP | **fixed in this pass** | The second reader found the flight-host callout still said **“Drive / OPEN / M”** while the table said “Drive stock” and the count said 1/7. The callout now reads **“Drive / STOCK / M”**, is not styled as an empty bay, and its aria name says the stock drive is installed. Re-shot `ship.png` confirms it. |
| Help | pass | Context card and every-key reference; the keyboard-only time-trial restart is absent from the pad table; the long list scrolls at the fold. |
| Pause | pass | Resume hierarchy, flight brief, tracked contract, quick-save line and footer keys are readable; no competing voice. |

## Second review

An independent second reader inspected the six captures and the two source regions. It accepted
Shipworks, flight, market, Help and Pause with non-blocking notes: the market “Hold” header is the
current hold while the arc is the post-trade hold; the flight `TOP 180` vs `TOP SPEED 320` needs a
word; the Shipworks stat sheet scrolls at 1280×800; the Help list is cut at the fold. It rejected the
first review's THE SHIP pass because the stock drive was rendered as an open slot; that is fixed
above and re-shot. Remaining nits are copy/fold issues, not blocking contradictions.

## Limitations

- The bench is a synthetic still: it proves composition, type, spacing and control reachability, not
  the live player route. The live route evidence remains `check:playable` and the route tier.
- The second reader's per-surface notes are recorded; no third reader has signed.
