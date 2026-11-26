# DEMO-SWARM-WORDS-1 — every word a player reads inside a Swarm run, in Madame Kiln's house

**For:** muse (a strong writer-engineer; no 3D). **Kind:** writing + data edits. Commit your own files.

## Why
Swarm is the demo: a top-down physics brawler in Madame Kiln's lit industrial Foundry. Rope a rock
and throw it through a pack; a light ship orbits like a hummingbird, a heavy one drags enemies like
a wrecking ball; a cannon turns a fighter into a projectile; the furnace, crusher and freight lane
kill for you and pay more. Read `design/overhaul/04_SWARM.md` (all of it, it is short) and
`design/overhaul/08_INTERFACE.md` section 5 (banned words). The words a stranger reads in rounds 1-10
must make them grin, and must tell them what to do in one glance.

## Do
Rewrite, in place, the player-facing text in these data files:
1. `src/data/swarmCourse.js` — each round's name and its one-line brief. The name must match what
   the round IS (doc 04 §10 name test); the brief is one line (eight words or fewer) that tells the
   pilot the trick of the round, in Kiln's voice: dry, theatrical, a ringmaster who loves damage.
2. `src/data/pilotTree.js` — every level-up card's name and line. 04_SWARM §3: "A card is one line
   that changes your hands. An icon, a name, one sentence: 'Thrown bodies keep going through the
   first thing they kill.' No percentage unless it is a threshold the player can see." Keep each
   card's mechanics exactly as the code implements them: read the effect code before rewording so
   the words never lie.
3. `src/data/swarmDrops.js`, `src/data/swarmEvents.js` — drop names and event announcements: short,
   vivid, plain.
Rules: change only display strings (names, lines, descriptions); never ids, keys, numbers, effect
fields. No banned words (`scripts/lib/playerWords.mjs`). Keep a line within ~10% of its old length
where a layout depends on it (cards: the name fits one line at 1280x720).
Check the cards on screen: `node scripts/ui-bench.mjs --shot=pilot-cards,pilot-cards-capstone,pilot-cards-two --viewports=1280x720,390x844 --out=.devshots/fleet/swarm-words`
(look at the PNGs if you can; the report prints any CLIPPED or BANNED WORD lines: there must be none).
Run the focused tests (`grep -rln "swarmCourse\|pilotTree\|swarmDrops\|swarmEvents" test`); rewrite
tests that pin old wording with the reason "Swarm words demo pass".

## Do NOT edit
`src/data/swarmMode.js`, `src/data/swarmCourseCast.js` (another worker is changing round budgets),
any `src/ui/**`, `src/systems/**`, `src/core/**`.

## Commit
`src/data/pilotTree.js` (and possibly others) already carries another agent's uncommitted edits:
before editing ANY file run `git diff -- <file>`; if it shows changes you did not make, run
`bash scripts/fleet/own-commit.sh begin <file>` BEFORE you edit and
`bash scripts/fleet/own-commit.sh commit "<message>" <file>` after, so only your lines are committed.
Never revert others' edits; never `git add -A`, reset, stash or checkout.
By exact path, small batches, plain-English messages. End with a short report of what changed and
five example before/after lines.
