# H-01 catalog — Player starter hulls (kestrel "Hitch" / pelican / wasp)

## What the player literally perceives
- Three starter picks on `newGame.js` fed by `src/data/newGameDefaults.js:71-115`: each hull
  carries `blurb` (one clause) + `line` (one sentence). No named quirk, no yard history.
- `src/data/ships.js` 15 hulls: pure stat blocks + `visuals` + `shopOffers` flavor comments.
  Zero player-facing prose fields.
- `src/data/shipPaints.js`: 11 hull paints, 8 accents, 3 finishes, 4 wear tiers, 5 decals —
  every swatch already carries a `sentence` (the wear/finish voice exists and is good).
- `src/data/hullIdentity.js` `HULL_NAME_BANK`: 16 authored names for berths after the first
  (the starter is canon "Tessera" via `narrative.js`).
- `src/data/historyWear.js`: deed trinkets/decals/graffiti — deliberately partial coverage
  ("deeds with no keepsake are noise on the shelf" — authored intent, do not fill).
- `src/data/codexPages.js` `HULL_OVERLAYS`: every hull has a `maker`; only `ship_saucer` has a
  `casualty`. The three starters have no dead named over them.

## What is thin
- The starter hulls are the most-seen hulls in the game and carry the least authored history:
  no casualty lines, no named quirks anywhere.
- The paint rack is good but small; a used-machine lot wants a few more work coats.
- The hull name bank (16) repeats on long saves; more authored names cost nothing.

## Tone register
Used-machine pride. The yard sells you a hull with a past it half-admits. Dry, blue-collar,
never winking. "The factory coat the hull was delivered in." (shipPaints `bare`).

## Additive seams (clean files)
- `HULL_NAME_BANK` — append authored names (bank is explicitly "authored, not generated").
- `SHIP_HULL_PAINTS` / `SHIP_ACCENT_PAINTS` — append swatches with hex + sentence.
- `HULL_OVERLAYS` — add `casualty` lines to the three starter hulls (canon-safe: Maera Vols
  is the Tessera's previous captain; Pelican/Wasp get yard-dead lines, not story figures).
