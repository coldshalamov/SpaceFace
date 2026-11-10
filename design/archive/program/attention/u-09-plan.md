# U-09 plan — tribunal
Scores: 4/4/4/5/4.
Landed: scanReveal.js WRECK_LOSS_NOUN +6 coverage rows on the survey/scan surface.
Rejected: the rest of U-09's surfaces (crew, nemesis, mail, docket) show no clean copy bank
in this pass — they stay in the row's scope for a later pass.

## Remainder pass — landed ff8ea0c5b2 (devin-attu, 2026-10-25)

Re-audit found one clean append-shaped bank the first pass missed: `src/data/mail.js`
`MAIL_LETTERS` (128 triggered letters; test pins are floors, not counts). +10 letters
appended across the existing kinds — cast second letters (slate_02, senna_02,
question_02), one job (union salvage adjuster), spam ×2 (rest registry, pod insurance),
fan (relief watch), hate (toll keeper's sister), bill (notary witnessing fee), crew
(Vols margin notes) — every trigger inside the pinned vocabulary
(`pulse-435-mail` 7/7, `w2a-mail-calendar-save` 15/15).

Still closed, re-verified: `NEMESIS_LINES`/`DOCKET_LINES` fixed-key maps (all keys
consumed — appends would be dead data), `CREW_CANDIDATES`/`banter` keyed per event kind
(new candidates change the hireable roster = mechanics, not micro-copy).
