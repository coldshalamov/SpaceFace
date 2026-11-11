# G19-02 — An honest hold: see what your cargo is worth, in plain words

**Lane 2.** **Commission:** EC-G19 §5 "An honest hold" (`git show origin/experience-commissions/EC-G19-one-ladder:<brief path>`;
find the path with `git ls-tree -r --name-only origin/experience-commissions/EC-G19-one-ladder design/program/experience-commissions/commissions`).
**Size:** medium-large. Follow `docs/UI_VISUAL_ITERATION.md`: ui-bench shots before and after.

## What the player must see
1. **In flight, the cargo bar shows one total:** `HOLD 12/40 · ≈ 3,480 cr`. The value is the sum of each
   cargo's sell price **at the destination you have set** (nav waypoint / job destination); with no
   destination, at the **nearest station that buys it**; cargo nobody nearby buys counts as 0 and the bar
   says `· some unsellable here` instead of hiding it. Reuse the market price read the trade screen already
   uses — do not invent a price model.
2. **Loose cargo you are towing on the Line counts** and is shown as `+ 1 towed` in the same bar.
3. **The hold panel lists each row with its worth** (`Ore · 8 · ≈ 960 cr`) without clicking.
4. **SCAN RISK goes.** It is a hard-coded number (memory: `src/ui/hud.js`). Remove the readout and any
   code that only feeds it. (A real scan-risk model may come later; a fake number never.)
5. **Plain labels.** Replace these on every screen they appear (`grep -rn` across `src/ui` and the
   localization catalogs; keep catalog keys, change displayed text):

| Now | Plain |
|---|---|
| MANIFEST ACQUIRED | Cargo loaded |
| HOLD READS | In the hold |
| Avg Basis | You paid |
| u vol | space |
| R0-R1 local hauling | Short hauls |
| Payload Conduction | Cargo handling |
| Attack Topology | Attack angles |

   If a label's meaning is unclear in context, pick the plainest phrase a pilot would say and list it in
   the receipt. **Two screens are called "Ledger":** keep the name on the money/transactions screen; rename
   the other to what it shows (e.g. `Record`), and list both in the receipt.

## Files you may edit
`src/ui/hud.js` (cargo bar, scan risk), the hold panel file, the label sites and localization catalog
entries you find (text only), the market-price read helper if a small accessor is needed, new
`test/honest-hold.test.mjs`. `git diff` first. Refresh the UI budget digest after `src/ui/**` changes
(`scripts/lib/uiBudgets.mjs`). Browser/ui-bench steps through `node scripts/fleet/game-lock.mjs run -- ...`.

## Checks
- New test: the hold value sums destination prices; falls back to nearest buyer; unsellable flagged;
  a towed cargo body is counted; no `SCAN RISK` text remains (`grep` in the test).
- `node --test test/*hud*.test.mjs test/*cargo*.test.mjs test/*hold*.test.mjs` — report failures.
- ui-bench shots of the flight HUD and the hold panel, before and after; describe them.

Commit: `fleet(G19-02): the hold shows what it is worth, in plain words; the fake scan risk is gone`.
