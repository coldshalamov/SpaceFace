# DEMO-WORDS-1 — no banned words in player-facing text outside the UI lanes

**For:** a careful text worker (no vision needed). **Kind:** sweep and fix. Commit your own files.

## Why

The game is being readied for a demo to strangers. A player must never read developer or retired
words (ruling R18, `design/overhaul/08_INTERFACE.md` §5). The list, as code, is
`scripts/lib/playerWords.mjs` (`BANNED_PLAYER_WORDS`, `findBannedPlayerWords`). Read it first.

## Do

1. Find every **player-facing string** containing a banned word in the files you may edit (below).
   Player-facing means text that ends up on screen or in a Steam achievement: labels, titles,
   descriptions, toasts, voice lines, achievement names and descriptions, window titles. It does
   NOT mean ids, keys, file names, CSS classes, event names, comments or log lines — never rename
   those (saves and code depend on them).
   - "Crucible" is Swarm's old name: the player-facing word is **Swarm** (the mode) or **the Pit**
     or the arena's own name (e.g. Ricochet Foundry), whichever reads naturally.
   - "TOO HEAVY": the rope never refuses; say what happens instead (e.g. "Heavy: it swings you").
   - "Research points", "cr/min", "headroom", "cap load", "STALE", coordinates: replace with plain
     words a stranger understands, or remove the line if it says nothing a player needs.
2. Fix them in place. Keep each string's length close to the original so layouts hold.
3. Steam achievements: `electron/steamAchievements.json` and `src/data/achievements.js` must agree.
   Change display names/descriptions only, never the API ids.
4. Tests that pin the old wording: rewrite them to the new wording, with the reason
   "plain words, design/overhaul/08_INTERFACE.md §5" in a comment or message.
5. Run the focused tests for every file you touched (`node --test test/<name>.test.mjs`; find
   them with `grep -rln "<file stem>" test`). Never run the whole suite.
6. Commit by exact path in small batches (one per area), message in plain English describing what
   the player now reads.

## You may edit

`src/data/**` EXCEPT `src/data/swarm*.js` and `src/data/survival*.js` (the Swarm lane owns those)
and except any Helios-opening / starter-mission data (the Adventure lane owns those: files whose
name contains `starter`, `helios`, `tutorial` or `onboarding`); `src/localization/**` except the
`*.generated.*` catalogues; `electron/steamAchievements.json`; `src/narrative/**`, `src/story/**`,
`src/onboarding/**` if they exist; and the tests for those files.

## Do NOT edit

Anything under `src/ui/**`, `styles/**`, `src/core/**`, `src/systems/**`, `src/missions/**`,
`src/render/**`, `src/sim/**`, `src/ai/**`, `src/combat/**` — six other agents own them right now.
Instead, LIST every banned player-facing string you find there in your receipt
(file:line, the string, your suggested replacement), so the director can route it.

## Receipt

The protocol headings, plus a table "Found in files I may not edit" (file:line | string | suggestion).
