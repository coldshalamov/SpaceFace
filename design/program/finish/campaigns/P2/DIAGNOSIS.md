# P2 — parts that explain themselves — diagnosis

**2026-11-06, Lane 4 (SHIP).**

## 1. The player-visible problem

The fitter is a wall of names. The owner cannot tell what a part will do until he buys and flies it.

Measured on the bench's `station-shipworks` chooser and on the data:

- **158 modules + 48 weapons + ordnance.** 128 of the 158 modules are utilities, and a row reads
  `Vector Reaction Drive M · M · T1 · <a sentence that changes by slot type>` — a size letter, a
  bare tier digit, and no statement of what you would want it *for*.
- **The catalogue is ordered by slot letter.** `SLOT_TYPES` is the fitting constraint; the chooser
  sorts `byTierThenPrice` inside one slot type, so two parts that do the same job at different
  tiers sit apart, and two parts that do different jobs sit together.
- **Tier is a digit, not a ladder.** `d.tier` is 1–5 on weapons and 1–3 on modules, printed as
  `T2`. The owner allowed loot rarity on 2026-10-21; "Mk II" is the word a player can compare.
- **Sentences exist but only for offence.** `src/data/arsenalIdentity.js` writes a role glyph and a
  real sentence for every weapon, bomb and field power (`arsenalSentence`). Modules fall back to
  their own authored `sentence`, which some have and some do not.
- **No preview.** Nothing shows the part working; the player infers from the name.

## 2. The cause chain

1. There is no module whose job is "the player-facing facts of a part". `arsenalIdentity.js` covers
   offence; `moduleRole()` in `shipworks.js` covers a role word; tier is printed raw in three
   places in the row template. Three facts, three owners, no single answer to "what is this".
2. Ordering was chosen for the fitter's convenience (`byTierThenPrice`), not the player's question.
3. A preview needs an id nobody has assigned, so no surface can ask for one.

## 3. The architecture question

The design is the bottleneck, not the data: the data already carries `tier`, `sentence`,
`description` and `mods` for every part. What is missing is one **reader** that turns those into
role, sentence, ladder and intent — and one place that orders a catalogue by what the player came
to do.

Cost of the fix: one pure module (`partFacts.js`), one row-template change, one sort change. Cost
of not fixing it: every future part ships as another name in the wall.

## 4. The road

- `src/ui/ship/partFacts.js` — `partFacts(id)` returns `role`, `sentence`, `tier` (Mk I/II/III),
  `intent` (Fight / Survive / Move / Carry / Work / Sneak) and `previewId`, reading only existing
  data. `sortIdsByIntent` orders a catalogue by intent, then the ladder, then name.
- The Shipworks chooser prints `role · Mk · intent`, the full sentence, and the Ship Sheet deltas on
  hover (P1's model, so a part can never advertise a change the sheet would not show).
- Coverage is a test: every purchasable def has role, sentence, tier and preview id.

## 5. Honest scope note

Merging near-duplicates across 206 defs and shooting a 3–5 s photographic clip for each part is a
content campaign, not one session. This session delivers the **mechanism** (facts, ladder, intent
ordering, preview id, coverage test) and a **live schematic preview** of the selected part in the
fitter. The duplicate list and the Range capture rig are recorded in `STATUS.md` as the remaining
work, with the exact ids, rather than claimed as done.
