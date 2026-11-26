# DEMO-WORDS-2 — the banned words you found in other agents' files, fixed

**For:** GLM (text only). **Kind:** sweep and fix. Commit your own files.

You did DEMO-WORDS-1 and listed 25 banned player-facing strings in files you were not allowed to
edit then. Those lanes have stopped: you may edit them now. Your own table is the job:
`.devshots/fleet/runs/DEMO-WORDS-1.glm.2026-11-23T09-14-49/RECEIPT.md`, section "Found in files I may
not edit". Some may already be fixed by the lanes since (check each with grep first).

Rules (same as before): change only player-facing text (labels, titles, voice lines, aria labels a
screen reader speaks), never ids/keys/event names/file names. Keep lengths close. Rewrite tests that
pin the old wording ("plain words, design/overhaul/08_INTERFACE.md §5"). Special cases:
- `src/ui/masslineHud.js`, `src/ui/map/flightMinimap.js` and `src/ui/radar.js`: DO NOT EDIT (another
  agent is removing the rope reticle and minimap circles there, including 'STALE'). Skip those rows.
- `src/systems/survivalResults.js` and `src/combat/playerDefeat.js` 'unidentified weapon' /
  'Unknown weapon' fallbacks: fall back to the attacking hull's own display name if the code has it;
  otherwise 'the ship that hit you'. Never leave the killer unnamed.
- `src/ui/screens/techTree.js` 'research points': leave it, list it in the receipt (needs a design call).
- Generated catalogues (`src/localization/catalogs/*.generated.*`): do not hand-edit.
- Before editing a file run `git diff -- <file>`: if it has someone else's uncommitted edits, use
  `bash scripts/fleet/own-commit.sh begin <file>` before and `... commit "<msg>" <file>` after.

Verify with the UI bench where a screen shows the text (`node scripts/ui-bench.mjs --shot=<id>
--viewports=1280x720 --out=.devshots/fleet/demo-words-2`): the report prints BANNED WORD lines; the
fixed screens must print none. Run focused tests only. Commit in small batches by exact path.

## Receipt
Protocol headings + the table with a "status" column (fixed commit / already fixed / left + why).
