# DEMO-ADV-WORDS-1 — every word in the first ten minutes of Adventure, plain and in voice

**For:** muse (a strong writer-engineer; no 3D). **Kind:** writing + display-string edits. Commit your own files.

Adventure opens at Helios harbour: you are hired labour with a light ship and a rope (the Line). Rope
a loose rock, throw it, dock at Helios Station, take a first job; the world is a working harbour of
miners, haulers and traffic. Read `design/overhaul/01_THE_GAME.md`, `design/overhaul/08_INTERFACE.md`
§1 and §5 (banned words, `scripts/lib/playerWords.mjs`).

A probe recorded every line of text a player sees in the first minutes:
`.devshots/first-ten/me-1/facts.json` (facts.words, each with its first time) and the frames beside
it. Go through that list and rewrite, IN PLACE in the source strings, every line that is:
- jargon or an internal id ('helios_seam_ore_face', '??? UNSCANNED', 'ready · Select CARGO BRACE
  first', '+44 · 9 WRECKS · 35 OTHERS'),
- robotic narration ('Swing threat detected.', 'Target destroyed.', 'Line strain.'),
- longer than eight words for a voice line, or
- flat where a character speaks (miners, the harbour, the dock master: give them a voice that fits
  hired labour in a working harbour — dry, practical, a bit tired, never cute).
Find each line with `grep -rn "<text>" src`. Change only display strings; never ids, keys, numbers or
logic. Keep a line within ~10% of its old length where a layout depends on it.

Run the focused tests of each touched file (`grep -rln "<file stem>" test`); rewrite tests that pin
old wording with the reason "Adventure words demo pass".

## Do NOT edit
src/ui/hud.js, src/ui/threatHalo.js, src/systems/onboarding.js logic (strings in it are fine),
anything under src/render/ or src/core/.

## Commit
Before editing a file run `git diff -- <file>`; if it shows changes you did not make, run
`bash scripts/fleet/own-commit.sh begin <file>` BEFORE you edit and
`bash scripts/fleet/own-commit.sh commit "<message>" <file>` after. Never git add -A, reset, stash or
checkout. Small batches by exact path, plain-English messages. End with a report: what changed and
ten before/after lines.
