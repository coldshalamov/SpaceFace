# M-01 drafts — 47-A campaign chain

## Drifter

The campaign already walks like paperwork noir — sealed manifests, a registrar who never
closes the variance file, a yard welder who remembers both cuts. What's missing is the
*sour* side of memory: cross one of the 15 cast members and the same limp line covers all
of them. A clerk who watched you bury the log shouldn't sound like a barkeep you merely
stiffed. Give each tracker a strained voice — short, hurt, specific to their job. Yune
re-seals at a markup; Vane counts the apology in freight; Senna stops writing your name.

## Archivist

The spine already remembers methods (cut_down vs wrecking_ball), doors taken and refused,
open misses, the climax. The deed-memory table is where those receipts become people.
Today `contactDeedMemory` has three prose states per tracker but only two authored: the
strained band borrows a shared shrug. Archivist wants consequence-specific recall — the
same counter the deeds feed should answer differently when it goes negative, named per
contact so "the file remembers" stays literal, not generic.

## Accountant

Constraints: ≤12-word blurb budget (`MAX_CONTACT_BLURB_WORDS` enforced by validator);
`depthContactsForStation` only substitutes the memory line when `value !== 0`; bands are
`strained|unproven|remembered|established` from bounded counters. Cheapest honest slice:
extend `CONTACT_DEED_LINES` records with an optional `strained` string and prefer it in the
negative band — a 2-line read change + 15 authored strings, no new machinery, no schema
migration. BEAT_COMMS and CONTACT_CARDS are closed seams. Verdict: do the strained lines.

Review: drafts ✓3 — recorded.
