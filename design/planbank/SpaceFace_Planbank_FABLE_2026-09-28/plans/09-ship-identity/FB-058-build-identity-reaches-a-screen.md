# FB-058 — The archetype badge and the synergy tell your fit earns are printed where you fit

**Kind:** wire · **Lane:** THE LONG GAME · **Routing:** open
**Seam tags:** seam: buildIdentity.js, seam: synergies.js, seam: shipworks.js, seam: targetPanel.js
**Write-set:** `src/systems/buildIdentity.js`, `src/ui/station/screens/shipworks.js`, `src/ui/targetPanel.js`, `test/fb-build-identity-shown.test.mjs`
**Neighbours (extend, never restate):** NXB-031, SF-133

## The gap
`classifyBuildIdentity` runs every scan and writes `entity.data.buildIdentity`; zero readers in `src/ui`.
`SYNERGY_TELLS` authors five build fantasies with named drawbacks, consumed only by the dead-ended classifier.
The `variantBonuses` on fourteen unique modules are printed nowhere. Only `shipCapabilityVerbs` reaches a
screen. Adjacent to SF-133 (the NPC badge must not overclaim hidden fittings); this is the player's own badge.

## Why this direction
Progression is "what can I do now": the payoff is computed and invisible. Two readers of an existing field.

## Mechanism
- Render the player's archetype and synergy tell (with its drawback) as the fifth hero band in `shipworks.js`,
  and print `variantBonuses` as the unique's "what is different" row (functional edits).
- Show the scanned NPC's badge in `targetPanel.js` only at the reveal stage SF-133 requires.
- Pin that a synergy-qualifying fit on seed 4242 shows its tell and the drawback text.

## Done when
`test/fb-build-identity-shown.test.mjs`: the fit model exposes badge, tell, drawback and the unique row;
`build-identity-pilots.test.mjs` stays green.

## Do not
Do not add a loot-rarity ladder. Do not overclaim for NPCs. Do not recompute identity in the UI.

## Focus test starting points
- `test/build-identity-pilots.test.mjs`
