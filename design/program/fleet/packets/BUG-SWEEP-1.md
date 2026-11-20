# BUG-SWEEP-1 — five small live bugs left over from old reviews

**For:** a careful engineer. **Kind:** small fixes, each with a test. **One commit per bug.**

## Why

Old review notes list bugs that were found, written down and never fixed. They are small. Fix them.
The notes are in `.dev/pr-expansion/HANDOFF.md` (search for each item below); treat the notes as
leads, and confirm each bug in today's code before changing anything. If a bug is already fixed,
say so with the line that proves it and move on.

## The bugs

1. **Swarm supply spends before it accepts.** `src/systems/swarmSupply.js` around lines 289–306: a
   purchase takes the player's money before checking that the item can be accepted, so a refused
   purchase still costs. Make the check come first, or refund on refusal, whichever matches how the
   other shop paths in that file behave. Test: a refused purchase leaves the wallet unchanged; an
   accepted one charges once.
2. **`lawForSite` has no production caller.** Find it (`grep -rn "lawForSite" src`). Either the place
   that should call it exists and is using something else (wire it), or the function is dead (delete
   it and its tests). Say which, with evidence.
3. **Two arenas missing from the law dressing list.** `LAW_ARENA_IDS` in `lawArenaDressing` (find the
   file) lacks the Asteroid Mill and the Hive, so those arenas get no dressing. Add them following the
   pattern of the arenas that are present. Test: every arena id the game can launch has an entry.
4. **A trust value keyed to the wrong place.** `yune.trust` is keyed to HELIOS when the character
   belongs elsewhere (`grep -rn "yune" src/data src/systems | head -40`). Find where Yune lives and
   key it there; add a migration if the key is saved.
5. **The store sentence does not hold attention** (handoff item for PR #978, "store-sentence
   attention-glass"). Read the note, find the code, and decide: if it is a real defect a player would
   see (a purchase confirmation that vanishes or is covered), fix it; if it is a matter of taste,
   describe it in your receipt and leave it.

Then read the rest of `.dev/pr-expansion/HANDOFF.md` for any other item marked "live bug", "real
bug", "exploit" or "top priority". Confirm each in code. Fix the ones that are small and certain;
list the rest in your receipt with file and line.

## Rules

- Follow `design/program/fleet/PROTOCOL.md`. Other agents are editing this repo: check
  `git diff -- <file>` before each edit and use `bash scripts/fleet/own-commit.sh` if a file carries
  lines that are not yours.
- Each fix has a focused test that fails before and passes after. Run the existing tests that mention
  the file you touched. Do not start the game.
- `npm run check:sim` must print the same result before and after (run it once at the start).
