<!-- LIFETIME: RECEIPT -->
# PQ-177.07 — Visible operational limits replace the passive haircut

```text
DONE  PQ-177.07 — a programmed miner now shows why it is or is not paying: output, stored ore, the stage that is stopping it, last sale, and operating cost on one board. If it runs out of fuel it waits in place. The machine is still there after Continue. A second machine on a full depot does not double the take.

WHAT I FOUND     Fuel empty deleted the drone. Extra machines looked like they paid until a hidden bucket shaved the money. The board never named the real stopper.

WHAT I CHANGED   Fuel empty now strands the drone: parked, waiting, still owned. Refuel starts it again, including after Continue. Programmed depot sales pay the quoted sale, bounded by cut, hold, and whether the depot will still buy. The operations board names gross cut, stored load, the limiting stage, last sale, and operating cost beside net.

WHAT YOU WILL FEEL   Open Operations. A working miner says it is running. A dry one says it is out of fuel and still yours. A second miner pointed at a depot that is already full of that ore tells you another machine would not sell more here.

THE NUMBERS      bar | before | after | target
                 fuel runs out on a bought miner | machine gone | machine waiting, fuel 0 | never delete purchased equipment
                 Continue with a dry miner holding 3u | gone / empty | still there, 3u kept, refuel resumes | old save keeps every machine
                 5u sale with the income bucket already empty | 0 cr (haircut) | 60 cr at 12/u | physical sale is the bound
                 two miners, 8u each, depot will take 8u | 192 cr | 96 cr, second waits (depot full) | extra machine does not help
                 operating cost while dry vs running | still billed as if working | 0 cr/min dry, 6 cr/min running | cost follows operating state

THE FRAMES       the Operations drone card: gross cut, stored load, limit line, last sale, operating cost beside net. Not a flight-camera beat — the claim is the board.

NEXT             PQ-177.00 the ticker and event cards. PQ-177.01 charts with a forecast cone.
```

## Checks

| Check | Result |
|---|---|
| `node --test` operational-limits + cargo-custody + outpost chain/production | 46 pass on the owned suites (9 new limits tests; fuel-bounded offline/off-screen keep the machine) |
| `npm run check:save-schema` | green (version 14, 282 paths) |
| `npm run check:baseline` | 15/15 |
| Boot-the-game playable check | Did not reach the menu in 30s (shader compile stall on bloom). This unit did not touch boot or shaders; CLEAN / SHADER / ASSETS still passed. |

Did not re-record goldens. Did not add raids or maintenance as a new tax. Token-bucket haircut remains for recall/trader/outpost income; it is no longer the primary bound on programmed depot sales.
