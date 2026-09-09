<!-- LIFETIME: RECEIPT -->
# PQ-145.01 — The first durable site loop

```text
DONE  PQ-145.01 — the first machine you seat is the claim. The rock is still there when you come back. Hovering a face next to the mill names what you give up. A blocked mill tells you what to paint. One courier sale pays once, even after Continue, even after you cut the face.

WHAT I FOUND     A site without a Core died with the rock. The first extractor was an ephemeral record a sector reroll could erase. Export paid through an abstract pod with no sale identity, so a reload could pay twice. A dark mill named a state, not a verb.

WHAT I CHANGED   Installing any machine stakes the claim: freeze the bore, record the anchor, commit the survey. The Massline Core stays unique power and command, not the persistence gate. A cargo port berths one starter courier. Each launch is a shipment sale with an intent id; the job bag names the flight and never pays. Cut-preview clones the field and names contacts lost. Status rows name the next paint.

WHAT YOU WILL FEEL   Seat one mill and the banner says the rock is yours. Leave and return: same pocket, same machines. Hover a still-solid face beside the mill and the lens says how many contacts and how much per minute you would cut. No power says paint a cable. A courier that already paid does not pay again after Continue.

THE NUMBERS      bar | before | after | target
                 first extractor, then kill the rock | site gone | site kept, bore seed 42, rock rematerialized | claim on first install, never an ephemeral record
                 cargo port on a staked mill | podsReady 0 until a fabricator | podsReady 1 | one local buffer, one export
                 12u silicate pod, Helios base 8, salvage 0.92 | abstract creditPassive, no intent | one receipt (qty 12, destination, price, operating cost, loss), duplicate intent credits unchanged | output reaches the flight economy exactly once
                 extractor with no cable after Continue | silent / site lost | status no-power, "paint a cable", 0 credits | blocked op shows cause + corrective action
                 hollow the face after the sale, then Continue | replay risk | creditedCr unchanged, cut face gone | geometry change does not replay rewards
                 30s idle on a staked claim | unanchored loss | machines and claim intact | leave inactive destroys nothing
                 tap/hold/bore cadence | 0.18 / 0.24 / 0.18 s | unchanged | exact cadence kept

THE FRAMES       lens + banner, proven in the site tests. No shipping-camera strip this leaf — the claim is the stake line, the cut-preview body, and the one-pay receipt.

NEXT             PQ-145.00 a player-built depot creates persistent traffic. PQ-177.07 visible operational limits replace the passive haircut.
```

## Review

[Review](2c721cd3-7e5e-44fe-98be-1dc3e09b36ba) — Bugbot: a stale assay only refused the Core, so a first extractor could stake the claim and silently derive a new formation. Fixed: any first-machine commit refuses `survey-stale`, and `_commitClaimSurvey` never derives on a stale record.

[Review](7e268db2-57db-469c-808a-68ca5193925b) — Bugbot on the fix: no remaining findings.

## Checks

| Check | Result |
|---|---|
| `node --test` site / survey / cadence / contact-ring / lane-network / claim-manifest | 95 pass; 44 pass after the stale-survey fix |
| cadence constants | `MOVE_HOLD_DELAY_S` 0.18, `MOVE_CRUISE_INTERVAL_S` 0.24, `BORE_BITE_S` 0.18 |
| `npm run check:save-schema` | green (version 14, 282 paths) |

Did not re-record `test/*.expected.json`. Did not retune drill cadence. Site courier credits stay on asteroidSites via cargoCustody; `noteSiteCourier` never grants credits.
