# X-03 draft — The Skeptic

**Verdict.** "Your credits cover the yard's Swing Drive S." is a promise with no follow-through. Nothing reads
`hints.fitOffer`, so the player hunts for the row alone. The audit is right to drop `mod_thruster_stripped_s`:
it removes verbs and has no offer. The live rack is the answer: Veil Step 4,200 (`modules.js:521`) and Swing
Drive S 5,100 (`:512`). Both are utility S, and both fit the Hitch.

**Proposal — carry the name into the screen, minimal and ORRERY-consistent.**
1. In `_maybeSpeakFitOffer` (`onboarding.js:1258-1286`), also write `player.hints.fitOfferDefId = def.id`.
   The spoken line stays verbatim, since it is pinned as `SWING_LINE`/`VEIL_LINE` in
   `starter-progression-fit-offer.test.mjs:17-18`.
2. In the Shipworks module row (`shipworks.js:4247-4290`), when `d.id === hints.fitOfferDefId` and the module
   is unowned, prepend one chip using the existing markup (`sx-modrow__chip is-up`, `:4105`):
   - **"Named at the dock"** while `purchase.state === 'fit'`;
   - **"Named at the dock · short N cr"** when the state is `'funding'`, so a promise the purse can no longer
     keep says so;
   - nothing once equipped.

   No new class, token or layout; one escaped string.
3. No auto-open and no preselect. A screen that moves by itself is a surprise, not a reward.

**Poke → reward.** Hear the line, open Shipworks, and the named row wears its chip. Buy and fit it, then use
the verb once: the existing `_maybeSpeakFitFelt` (`FIT_FEEL_DEFS`, `fitFeel.js:15-84`) speaks the "felt it"
line. The promise closes on a felt change. Spend elsewhere first, and the chip names the shortfall.

**Edges.**
- `hints` round-trips as a bag (`gameState.js:147`). Old saves show no chip, which is honest.
- `recommendOutfittingPurchase` (`outfittingGuidance.js:259`) stays uncalled. A second ranker could
  disagree with the spoken name.

**Regression risk.** Shipworks is ORRERY-lane ground: land by pathspec, and `ui-bench --shot` plus `--walk`
the chooser first. Keep green:
- `starter-progression-fit-offer`, all cases
- `check:player-facing-labels`, `check:ui-a11y`, `check-type-floor`
- `outfittingSpendConfirm` purchase tests
