# S-13 drafts — Debris/wreck fields, three personas

## The Drifter (working-class regular)
The Drifter has towed bodies. What a wreck field actually says is on the plate nobody
reads twice: who was in it, what got stripped first, and how the shots went in. Draft:
beside every unplated named wreck, a small find — a memorial buoy, a salvager's tally
post, a dead lamp somebody left burning — whose plate names a crew member or two by name
(Senna's book has room), records what was already taken when the player arrives (salvage
note), and says where the scoring reads on the hull (kill-marks). The wreck itself stays
what it is; the find next to it is the eulogy.

## The Archivist (continuity and memory)
Ten named wrecks file an empty record at first discovery — the journal falls back to a
generic line for "Toll-Runner Wreck" and "Paint-Scar Debris" alike. The Archivist wants
each silent wreck to gain an honest entry — but is the first to flag the trap:
`discoveryPlate` strips bounty-mark eligibility (bountyMarks.js:133). Plating the wreck
row itself shrinks the writ pool; plating a NEW adjacent memorial POI does not. Draft:
memorial-marker POIs, plates written as loss-ledger excerpts — casualty names, filing
clerk voice, salvage disposition — consistent with `historyWear.js`'s "no real name —
a memorial of placeholders is worse than none" (every plate names a person).

## The Skeptic (cold reader / anti-bloat)
Is this detail or a graveyard of tooltips? The Skeptic counts: ten sites, ten small
finds, each inside the discovery radius of a wreck the player already investigates —
that's reach, not bloat. She vetoes: touching `uniqueWrecks` (CANON-pinned contract),
touching `wreckAftermathDressing` (seeded grammar — names in procedural dressing would
be a system change dressed as data), touching `worldOneOffs` (pinned 33), and adding
"kill-tally decal" mechanics (machinery). She approves the plate-as-memorial pattern
because it reuses the single most established authored surface in the codebase
(discoveryPlate) at the exact spots the register demands.

## Tribunal notes (pre-scoring)
- Unanimous on mechanism: new adjacent memorial POIs (beacon type) carrying plates —
  named dead + salvage note + kill-marks in each plate's prose, zero pool delta.
- Archivist's casualty rule adopted: every plate names at least one person; no
  placeholder dead.
- Coverage: all ten unplated wrecks get a neighbor; the joint board row (ATT-S13) gets
  the sites; this row keeps the prose register.
