# S-11 drafts — Asteroid fields, three personas

## The Drifter (working-class regular)
The Drifter cuts these seams for a living. What he sees at a worked field is not geology —
it's the previous shift: a claim stake filed over a seam that thinned, a burned pin from a
partnership that lapsed, a tag somebody sprayed on the biggest rock because nobody watches
the outer edge, a tally post the crews kept honest by, a worklamp tower that died mid-shift
and was cheaper to leave than to tow. Draft: every core sector gets one or two finds at the
field edge — claim marks, ash pins, tag rocks, tally posts, dead lamps — each with a plate
that reads like a shift log, not a plaque. Ceres gets two (the belt is the busiest seam);
the quiet sectors get the sparsest single marks, because emptiness is also a voice.

## The Archivist (continuity and memory)
A field is a record of claims. The ledger already knows claim culture (claimable bodies,
SITE_HISTORIES, "ninth stake on the same rock") — but that culture lives only on the
fifteen sellable sites. The Archivist wants the *unclaimed* history: stakes that lapsed,
pins that cooked, tags that outlasted their sprayers. Draft: plates written as registry
fragments — filing numbers, lapse years, crew marks ("SHAFT 7", "RU-7"), matching the
claim-site house voice ("worked once, walked off"). One caveat she insists on: Helios's
`poi_helios_claim_mark`/`poi_helios_ash_pin` already prove the pattern at the starter
seam — don't crowd it; Helios's second mark goes to the outer field instead.

## The Skeptic (cold reader / anti-bloat)
Does a pilot actually fly within sight of a claim stake? Fields are hazards and ore; the
camera sees ~50 WU of ground. The Skeptic's test: would you notice? Her answer: yes —
because these are *finds*: they surface on the scanner/chart as POIs and pay their one
plate on first discovery, which is precisely where "worked here" should land. She vetoes
(b) more than two per sector (clutter), (c) `collides: true` (rocks you hit are gameplay),
(d) any new zone or hazard (machinery). She approves props that already ship
(`place_asteroid_graffiti` mounted NOWHERE is the exact kind of waste this row exists to
fix). Also vetoes touching `boulders`/field yield tables — economy delta for zero read.

## Tribunal notes (pre-scoring)
- All three converge on new POI + anchor rows carrying plates: pool-neutral, pure
  dressing, existing props.
- Drifter wants warmth (shift logs), Archivist wants registry formality (filing marks),
  Skeptic wants sparsity — splice: terse plates that open with a filing/crew mark and
  close on the human read. 1–2 per sector, 16 total, matching each field's authored
  center.
- Nobody wants new zones, boulders, colliders, or flavor-pack edits — correctly rejected.
