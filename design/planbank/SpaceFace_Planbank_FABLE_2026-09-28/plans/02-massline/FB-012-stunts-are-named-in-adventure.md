# FB-012 — A wrecking ball, a clothesline or a tow kill is named in adventure mode, not only in the Crucible

**Kind:** wire · **Lane:** THE HAND · **Routing:** open
**Seam tags:** seam: hud.js, seam: stuntCallout.js, seam: stuntGrammar.js
**Write-set:** `src/ui/hud.js`, `src/ui/stuntCallout.js`, `test/fb-stunts-named-in-adventure.test.mjs`
**Neighbours (extend, never restate):** NXB-007, SF-292

## The gap
`StuntDetector` classifies sixteen tricks, `tether:whipImpact` carries rating and momentum,
`massline:releaseValidated` carries the divergence receipt, and the combo math in `stuntCombo.js` runs in
adventure. But `ensureStuntCallout` is imported only by `crucible.js` and `styleMultiplier` only by
`survivalHud.js`, so in the sandbox the game never names the trick. "Turn enemies into ammunition" happens
silently.

## Why this direction
One mount call closes the loop; the callout is already built and rate-limited. Style multipliers stay
Crucible-only (adventure has rep and salvage rights instead).

## Mechanism
- Mount `ensureStuntCallout` from the flight HUD path in `hud.js` when not in a run; reuse its quiet path so it
  costs nothing idle.
- Feed it from the same `stunt:trickDetected` events; suppress the Crucible-only score fields.
- Pin that a scripted wrecking-ball kill in adventure produces one callout with the trick name and the momentum
  figure.

## Done when
`test/fb-stunts-named-in-adventure.test.mjs`: one callout for a seed-4242 wrecking ball outside a run, none
for an ordinary kill; `crucible-results.test.mjs` unchanged.

## Do not
Do not show Crucible score in adventure. Do not add a second callout element. Do not change trick definitions.

## Focus test starting points
- Locate stunt suites with `rg stuntRecognition test/` and `rg stuntCallout test/`.
