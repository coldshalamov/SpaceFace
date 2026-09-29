# FB-019 — A hit confirms in three states at the reticle: shield, armor, hull

**Kind:** build · **Lane:** THE FIGHT · **Routing:** open
**Seam tags:** seam: floatingText.js, seam: hitVoice.js
**Write-set:** `src/ui/floatingText.js`, `src/audio/hitVoice.js`, `test/fb-hit-confirmation-pip.test.mjs`
**Neighbours (extend, never restate):** SFQ-B202, SF-017

## The gap
No hit-marker path exists (the terms hitConfirm, hitmarker and hitMarker have zero hits in `src/`). Only the
ear confirms, through `hitVoice.js`'s `LAYER_RECIPE` (shield/armor/hull, one voice per target per 40 ms). A
player in a loud fight cannot tell which layer they are chewing without reading the target panel.

## Why this direction
Damage numbers already exist and are optional; a pip is the mature-parity minimum and is not a redesign.
`floatingText.js` is a live DOM overlay with its own quiet path; crossfeeding the layer the audio already
computes keeps eye and ear in agreement.

## Mechanism
- Export `damageLayer` from `hitVoice.js` (pure) and call it from `floatingText.js` on player-caused
  `combat:damage` to paint a three-state pip (ring, chevron, cross) at the impact's screen position for 120 ms,
  reusing the overlay's allocation-free path.
- Respect `showDamageNumbers` off: pips stay on (they are a control receipt); add an independent toggle key
  under gameplay for pips.
- Reduced flash: hold the pip 180 ms at lower brightness instead of removing it.

## Done when
Seed 4242 script hitting a shielded target through to hull: the overlay log shows shield→armor→hull pips in
order with no more than one per 40 ms per target; `test/fb-hit-confirmation-pip.test.mjs` pins it;
`hit-voice.test.mjs` stays green.

## Do not
Do not add a hit sound (the layer voice exists). Do not show pips for NPC-on-NPC hits. Do not redesign the
reticle (ORRERY).

## Focus test starting points
- `test/hit-voice.test.mjs`
- Locate floating-text suites with `rg floatingText test/`.
