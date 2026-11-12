# FIX-R5a — Fifth review: hold value and the dock sentence

**Lane 2.** Source: `design/program/fleet/reviews/2026-11-12-9615eb79.md` — read these three findings in full:
1. **[MED] Cargo valuation uses the highest remembered price instead of the nearest buyer** (`src/ui/market/tradeLogic.js:908`,
   G19-02): with no selected destination, quote the **nearest station that buys the cargo** through the existing market price
   helper, not `bestKnownSellFor`'s maximum over all market memory.
2. **[MED] Hold valuation ignores the canonical mission destination field** (`tradeLogic.js:954`): read the mission's
   top-level `destStationId` in both mission selection and destination extraction; keep the navigation-waypoint precedence.
3. **[MED] The dock sentence is marked shown while the live presenter cannot display it** (`src/systems/onboarding.js:3025`,
   PARK-01): deliver the first-dock store sentence through a presenter that runs on the admitted dock surface, and stamp
   `shown` only when it is actually presented. Keep the fixed simulation frozen while docked; do not promote unrelated
   queued flight voices to show it.

## Checks
Tests with the real producers' payloads for each (`test/honest-hold.test.mjs` and the onboarding/voice-arbiter tests that
cover the store sentence — `ls test | grep -i "store-sentence\|onboarding\|voice-arbiter\|pq-163"`). `npm run check:sim`
(v27) and `npm run gate -- --quick`. For item 3, a look through the lock: first dock on a fresh save, the sentence on screen
while berthed (describe it). Commits: one per finding, `fix(FIX-R5a): <what the player gets>`.
