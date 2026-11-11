# Fleet worker protocol — read all of this before you touch anything

You are one worker in a fleet building the game SpaceFace. A lead (Claude) or the owner gave you
**one packet**: a file in `design/program/fleet/packets/`. The packet is your whole job. It says
what to build, which files you may edit, how to check your work, and what "done" looks like.

The game's design is already decided and written. **Do not invent design.** If the packet quotes
a name, a number, a line of dialogue or a colour, use it exactly. If something you need is not
written, pick the plainest option that fits, and list it under "Guesses I made" in your receipt.

## The repository is shared. These rules protect other people's work.

Other agents are editing this same folder right now. Their unfinished changes are in the working
tree. You must not damage them.

1. **Edit only the files your packet allows** (its "Files you may edit" list). You may create
   new files only where the packet says. If you truly need another file, do not edit it: write
   the change you wanted into your receipt under "Blocked".
2. **Before editing a file, run `git diff -- <file>`.** If it already has changes you did not
   make, stop work on that file and report it under "Blocked". Never edit a file with foreign
   changes in it.
3. **Forbidden git commands, no exceptions:** `reset`, `restore`, `checkout`, `switch`,
   `stash`, `clean`, `rebase`, `merge`, `pull`, `push`, `add -A`, `add .`, `commit -a`,
   `worktree`, `branch -D`. Never delete files you did not create.
4. **Commit only your own files, by exact path, in one command:**
   `git commit -m "fleet(<PACKET-ID>): <what the player now sees>" -- <file1> <file2> ...`
   (new files: `git add -- <newfile>` first, then the same commit command). Do not push.
   If the commit fails because of a lock (`index.lock`), wait 20 seconds and try again, up to
   five times.
5. **Never run the full test suite or long jobs.** Run only the checks your packet names. A
   command that runs over 5 minutes: stop it and report it.
6. **Machine safety (the owner's laptop crashed twice under load).** Start the game, a browser or
   Electron only when the packet says to, and **always through the lock**:
   `node scripts/fleet/game-lock.mjs run -- <command>` (e.g. `... run -- npm run check:playable`). It waits
   if another game is running. Never start two at once; never run the whole test suite; close what you
   started.
7. Do not edit `test/references/**`, golden files, or expected outputs to make a check pass.

## How to work

1. Read the packet fully. Open every file it names under "Read first".
2. Read the code you will change before changing it. Match the style around it: ES modules,
   no new dependencies, no `Math.random()` or `Date.now()` in simulation code (use `state.rng`
   and `state.simTime`), no Three.js imports outside `src/render/`.
3. Make the smallest change that fully does the job. Finish it — no TODOs, no stubs, no
   "a later pass will".
4. Run the packet's checks. If one fails, fix the cause and run it again. Do not weaken the check.
5. Commit (rule 4).
6. Write your receipt (below). The receipt is required even if you failed.

## The receipt

Write it to the path given in your prompt (or `design/program/fleet/receipts/<PACKET-ID>.md` if
none was given — do not commit receipts). Use exactly these headings:

```
# Receipt <PACKET-ID>
Result: DONE | PARTIAL | BLOCKED
Commit: <hash or "none">
## What the player now sees or feels
<one to three plain sentences>
## Files changed
<list>
## Checks run and their output
<command, then the last lines of output, for each>
## Guesses I made
<anything the packet did not decide; "none" if none>
## What I could not look at or verify
<be honest: e.g. "I did not see it on screen", "I could not run the game">
## Blocked
<files with foreign changes, files outside my list I needed, errors I could not fix; "none">
```

A short honest receipt beats a long confident one. Saying "I could not check X" is good; claiming
something works when you did not see it is the worst thing a worker can do here.
