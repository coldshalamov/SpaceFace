# X-03 draft — Drifter: the first purchase is a rent decision

Persona: The Drifter. Row §1P 561. Audit: `X-03-audit.md`.

## Ground

A working pilot never hears "your credits cover it". They hear the price and what's left after.
`mod_thruster_stripped_s` is out: it removes verbs and isn't racked. The honest stock is the live
Helios rack: **Veil Step 4,200**, **Swing Drive S 5,100**.

## What the player gets

1. The earned pointer (`_maybeSpeakFitOffer`) says price and remainder:
   - *"Yard's got a Veil Step. 4,200. Leaves you 800."*
   - Remainder under the Ceres toll (194): *"Swing Drive S, 5,100. Leaves 120 — short the toll."*
2. In Shipworks, that row is **pre-selected** and carries one ORRERY tag, **`YARD PICK · 4,200`**.
   No new panel, no new colour.
3. Fit it, and the existing fit-felt line is the receipt: *"Veil Step fitted — BOOST now blinks you…"*
4. Walk out unbought and nothing nags. The tag stays until the module is owned or unstocked.

## Lands in

- `onboarding.js:1279-1285`: the line template, using `offer.price`, `player.credits`, and
  `gateTollFor`. Set `player.hints['fitOffer:'+def.id] = true` beside `hints.fitOffer`, the same prefix
  pattern as `fitFelt:` (`fitFeel.js`). No new state field.
- `src/ui/station/screens/shipworks.js` (minimal): if a `fitOffer:<id>` hint names an unowned,
  stocked def, preselect it and append the tag. The spoken pick is the authority, so screen and voice
  can't disagree, and `recommendOutfittingPurchase` stays unwired. Verify with
  `node scripts/ui-bench.mjs --shot=station-shipworks --walk`.
- Pin: `test/starter-progression-fit-offer.test.mjs:119-138` (line text moves with the template).

## Working life

The game shows you the price and the remainder, and you decide whether the tool is worth the rent.
