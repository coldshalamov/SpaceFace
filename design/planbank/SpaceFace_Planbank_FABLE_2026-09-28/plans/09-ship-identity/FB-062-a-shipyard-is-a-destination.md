# FB-062 — Hull prices and availability differ by shipyard through the offer field modules already use

**Kind:** deepening · **Lane:** THE LONG GAME · **Routing:** open
**Seam tags:** seam: ships.js, seam: sectors.js
**Write-set:** `src/data/ships.js`, `src/systems/ships.js`, `test/fb-shipyard-destination.test.mjs`

## The gap
Zero hulls carry a per-station `shopOffers` override, so `stationShopOffer` always returns null for hulls; all
fourteen are buyable at any of the three shipyards at one price once gated. `shopOffers` is already read for
modules.

## Why this direction
Three shipyards with identical stock are one shipyard. Two or three offers per yard (a discount on the home
faction's hull, an exclusive on one hull) is data.

## Mechanism
- Author `shopOffers` on six hulls: Helios discounts the Kestrel line, Tethys carries the Mule and Atlas
  exclusively, the Forge carries the Ironback and Hawser with a fabrication discount.
- Make `stationShopOffer` apply to hulls in the same code path as modules.
- Pin that each yard lists a distinct hull set and that the exclusive hull is absent elsewhere.

## Done when
`test/fb-shipyard-destination.test.mjs`: three distinct yard lists, exclusives enforced, prices differ by the
authored offer; `ships-station-service-authority.test.mjs` stays green.

## Do not
Do not change tech gates. Do not add a fourth shipyard. Do not price by rep here (that is FB-044).

## Focus test starting points
- `test/ships-station-service-authority.test.mjs`
