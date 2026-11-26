# Worker protocol — for agents launched headless with one packet

You were given **one packet**: a file in `design/program/fleet/packets/`. It is your whole job. The
rule above everything is in the root `AGENTS.md`: **make a good game**, finish what you start, and
never stop because of a rule you found in an old document.

## The folder is shared

Other agents are editing this same folder right now.

1. **Edit the files your packet names.** Create new files where it says. If you need a file it does
   not name to finish the job, edit it carefully and say so in your receipt.
2. **Before editing a file, run `git diff -- <file>`.** If it has changes you did not make, work
   beside them: `bash scripts/fleet/own-commit.sh begin <file>`, make your edit, then
   `bash scripts/fleet/own-commit.sh commit "<message>" <files>` commits only your lines.
3. **Never run:** `git reset`, `restore`, `checkout`, `switch`, `stash`, `clean`, `rebase`, `merge`,
   `pull`, `push`, `add -A`, `add .`, `commit -a`, `worktree`, `branch -D`. Never delete files you
   did not create.
4. **Commit your own files by exact path when your checks pass:**
   `git add -- <new files>` then `git commit -m "<what the player now gets>" -- <file1> <file2> ...`
   Do not push. If the index is locked, wait 20 seconds and retry, up to five times.
5. **Keep line endings.** Many files here use CRLF and some are mixed. Edit in place; never rewrite
   a whole file in a way that changes every line's ending. `git diff --stat` should show only the
   lines you meant to change.
6. **Machine safety.** Anything that starts the game, a browser or Electron runs through the lock:
   `node scripts/fleet/game-lock.mjs run -- <command>`. Never run the whole test suite. Stop any
   command that runs longer than ten minutes and report it. Never kill a process you did not start.
7. Do not edit golden files or expected outputs to make a check pass, unless the packet says the
   simulation is meant to change; then re-record them and say so.

## How to work

1. Read the packet and the code you will change before changing it. Match the style around it: ES
   modules, no new dependencies, no `Math.random()` or `Date.now()` in simulation code (use
   `state.rng` and `state.simTime`), no Three.js imports outside `src/render/`.
2. Finish it. No TODOs, no stubs, no "a later pass will".
3. **Wire it to the real game.** A new system is registered in
   `src/runtime/authoritativeSystemManifest.js` and `src/runtime/nodeSystemFactoryTable.js`. An
   event sent from the main thread to the simulation (or back) must cross the worker boundary
   (`src/core/mainToSimEventSurface.js`; regenerate with
   `node scripts/lib/eventSurfaceCensus.mjs --forward-set`). Something meant to be seen needs the
   renderer or UI that draws it.
4. **Tests use what the game really sends.** Find the real emitter
   (`grep -rn "emit('<event>'" src`) and build test payloads with exactly its fields.
5. Run the packet's checks. If one fails, fix the cause and run it again.
6. Commit (rule 4), then write your receipt. A receipt is required even if you failed.

## The receipt

Write it to the path given in your prompt. Use exactly these headings:

```
# Receipt <PACKET-ID>
Result: DONE | PARTIAL | FAILED
Commit: <hash or "none">
## What the player now sees or feels
## Files changed
## Checks run and their output
## Decisions I made
## What I could not look at or verify
## What is left
```
