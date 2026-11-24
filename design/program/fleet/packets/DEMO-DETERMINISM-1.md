# DEMO-DETERMINISM-1 — the replay check is red, and the bench is not deterministic

**For:** an investigator-fixer (careful). **Kind:** find the cause, fix it. Commit your own files.

1. **`npm run check:sim` fails on the shared tree** (since about 2026-11-23 19:30 EST): actual hash
   `4dac41d0fdfa01057c5226c239f0e7b268065daaa05a3fe259431ab9333838cc`, golden `29e58fa3…`. It passed
   earlier in the evening. Find the commit that moved it. You may NOT check out old commits in this
   shared folder and may NOT make a worktree. Instead: list commits since 2026-11-23 18:30 that touch
   deterministic code (`git log --since="2026-11-23 18:30" --name-only -- src/core src/systems src/sim src/ai src/combat src/data`),
   and for each suspect commit C run
   `git diff C~1 C -- <files> > c.patch`, `git apply -R c.patch` (only if those files have no other
   uncommitted edits — check `git diff -- <files>` first; if they do, skip and reason from the code),
   run `npm run check:sim`, then `git apply c.patch` to restore, and confirm `git diff -- <files>` is
   back to what it was. Find which commit changes the hash.
   Then decide: if that commit deliberately changed simulation behaviour (its message or packet says
   so — e.g. the Adventure opening, the berth autopilot, the Swarm chain economy, Swarm rescue pods),
   re-record the golden with the project's own re-record command (find it in package.json /
   scripts/check-sim*) and say in the commit message which commit changed behaviour and why it is
   intended. If it did NOT mean to change behaviour, fix the bug instead.
2. **The headless bench is not deterministic:** in one process, `scripts/bench-sim-fight.mjs` arms can
   flip between two different fights (481 vs 903 deaths with a no-op flag). Suspect: a wall-clock-timed
   physics startup in `src/core/physics.js`. Simulation code must use state.simTime and state.rng only.
   Find the wall-clock dependency and remove it so two arms of the same flags always give the same hash.

## Rules
Before editing a file run `git diff -- <file>`; if it has changes you did not make, use
`bash scripts/fleet/own-commit.sh begin <file>` before and `... commit "<msg>" <file>` after. Never
git add -A, reset, stash, restore, checkout or worktree. Write RECEIPT.md early and update it.

## Receipt
Protocol headings; the commit that moved check:sim and the decision (re-record or fix, with reason);
the wall-clock cause (file:line) and fix; hashes before/after.
