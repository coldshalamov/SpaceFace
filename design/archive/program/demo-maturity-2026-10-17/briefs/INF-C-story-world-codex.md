# Task INF-C — four INFERENCE catalog units: STORY-09, STORY-10, STORY-11, WORLD-44 (one bounded batch)

Read first: `_constraints-codex.md`, and the four catalog lines STORY-09, STORY-10, STORY-11,
WORLD-44 in `design/program/INFERENCE_IDEAS.md`. Law: `design/program/INFERENCE_LANES.md` §0.1 —
do the line, do not expand it; share setup across the batch; each line keeps its own done
sentence and test. This batch launches only after the LAW batch has landed (one shared file).

## The four lines (owner family: memory writers + the news/bar readers)

- **STORY-09** — a moral trap you declined is remembered by the party that offered it
  (`src/systems/moralMemory.js`, `src/data/moralTraps.js`). Pin: declining writes one memory
  line; the party's next offer references the refusal; pin both.
- **STORY-10** — defeating a named ace is news that names the ace (`src/systems/aceMemory.js`,
  `src/ui/marketNews.js`). Pin: `ace:defeated` publishes one cited headline naming the ace and
  the venue; once per defeat.
- **STORY-11** — a barkeep can name your ship's most-cited deed from its ledger
  (`src/systems/shipLedger.js`, `src/ui/station/barContacts.js`). Pin: two different ledger
  histories produce two different barkeep lines at the same station.
- **WORLD-44** — a witnessed pirate kill becomes a cited headline naming the hull you saved
  (`src/systems/aftermathWrecks.js`, `src/ui/marketNews.js`, `src/systems/lawSecurity.js`).
  Pin both branches: a lawful witnessed raider kill publishes one cited headline naming the saved
  hull; an unwitnessed kill publishes none (LAW-08 boundary).

Memory law: memories are bounded (respect any existing caps/pruning in the memory owners you
touch); news is cited (a source line), never floating text.

## Done when

- Four focused tests: `test/inf-story-09-declined-trap-remembered.test.mjs`,
  `test/inf-story-10-ace-defeat-news.test.mjs`,
  `test/inf-story-11-barkeep-cites-deed.test.mjs`,
  `test/inf-world-44-witnessed-kill-headline.test.mjs`.
- Report all player-visible strings verbatim in your final message (a taste pass follows).
