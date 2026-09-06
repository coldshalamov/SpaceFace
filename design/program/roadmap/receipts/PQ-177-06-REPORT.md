<!-- LIFETIME: RECEIPT -->
# PQ-177.06 — Cargo custody and one-commit transactions

```text
DONE  PQ-177.06 — a programmed miner fills its own shipment, not your hold. Selling that shipment leaves the ore you mined by hand. Selling the same plan twice pays once and hands back the first receipt, with the station and the quote named on it.

WHAT I FOUND     Programmed drones called addCargo into the player hold, then sold whatever iron was sitting there. A retry of the same sale had no identity, so it could pay twice.

WHAT I CHANGED   Each drone group owns a shipment record (qty, owner, origin, destination, delivery). The mine→haul→sell loop fills and leaves on that shipment, not the Hitch hold, and the sell step names the depot. Depot sales quote the station at the call, commit once through the credit writer, and keep a durable receipt on the group and on the market execute path.

WHAT YOU WILL FEEL   Your hand-mined ore stays yours when the worker sells. A hitch, a retry, or a continue in the middle of a sale does not pay twice and does not dump the shipment.

THE NUMBERS      bar | before | after | target
                 2s programmed mine at 0.8 u/s with 5 iron already in the hold | hold 6 | hold 5, shipment 1 | worker never writes the hold
                 worker sells 1 iron while the hold has 7 | hold 6, paid from your ore | hold 7, shipment 0, +12 cr at Helios quote 12 | worker cannot spend your cargo
                 same sale intent after JSON round-trip | second pay | duplicate receipt, credits unchanged | retry and reload duplicate nothing
                 mine_to_depot with empty hold, shipment at cap | stays on MINE | hauls (pc=1) | worker leaves when ITS hold is full
                 mine_to_depot with full Hitch, shipment room | freeze | keeps mining | Hitch fullness is not the worker's gate

THE FRAMES       none — this leaf is a hold and a ledger, proven by the custody tests, not a camera beat.

NEXT             PQ-177.07 visible operational limits replace the passive haircut. PQ-145.01 the first durable site loop.
```

## Review

[Review](e1c64d7d-bbac-4151-b86a-067ac21fcd48) — Bugbot: mine_to_depot treated Hitch fullness as the mine-step gate, so a worker with a full shipment never hauled. Fixed: the alphabet asks `operationFull()` (shipment vs buffer cap); MINE/SELL bind field and depot beacons.

[Review](da1b8256-9ef0-459c-aab2-6d3928225e03) — Bugbot on the fix: no remaining findings.

## Checks

| Check | Result |
|---|---|
| `node --test test/pq-177-06-cargo-custody.test.mjs test/automation-program-mine-rate.test.mjs` | 8 pass |
| nearby automation/economy tests | 27 pass including offline programmed-drone catch-up and salvage intake serialize |
| `npm run check:save-schema` | green |
| `npm run check:baseline` | 13/15; 47-A sim hash still drifted (`df1619c…` / `a6e8ada…`) vs envelopes — same pre-existing golden trap as PQ-137.11 / PQ-140.02; empty intent bags are omitted from economy serialize so a new game save does not grow a new key |

Did not re-record `test/*.expected.json`. Station quote at the sale call is the live `_stationPrice` (Helios stub 12 in the fixture).
