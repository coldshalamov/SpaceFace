# M-04 drafts — mission board offers

## Drifter

The board already names people — "Nim Gatecut", "Joss Wire" — and the mark roster is a
wall of wanted posters. Four more names that sound like they got priced by a tired clerk:
a toll-jumper with a callsign for a surname, a ledger clerk gone off-book, a cousin of
someone already posted. Names are how a bureaucratic surface gets colorful for free.

## Archivist

Marks should echo the world's cast — surnames that rhyme with existing families of work
(Tosi, Revik, Voss-Bara are already there). New names in the same rhythm keep the roster
believable as one posting desk's output rather than a name generator's.

## Accountant

`rollBountyMark` is `hash32 % length`; appending changes which name a given seed deals but
breaks no determinism contract — the test pins A-vs-B equality and structural fields, not
literal strings. Cost: four strings, one array, zero machinery. Verdict: append names.

Review: drafts ✓3 — recorded.
