# DEMO-RUNOVER-1-R2 — finish the Again fix GLM left uncommitted

**For:** a builder agent. **Kind:** finish, verify, test, commit. Commit your own files.

Read `design/program/fleet/packets/DEMO-RUNOVER-1.md` (the bug: on Swarm's Run Over plate the FIRST
Enter on Again is swallowed; the plate stays up 10-12 s until a second press). GLM worked on it for
115 min and ran out of quota before committing or writing a receipt. Its log is
`.devshots/fleet/runs/DEMO-RUNOVER-1.glm.2026-11-23T23-22-21/run.log` (read the end: it added an
`endRunOverFilm(rootEl, ctx)` call so one press both ends the death replay ("film") and starts the
run, in the Again launch path and the win plate's Keep-going click). Its edits are UNCOMMITTED in
`src/ui/screens/crucible.js` and possibly `src/ui/input.js` (`git diff` both; input.js may also hold
other agents' edits — only GLM's Run Over / death-guard hunks are yours).

## Do
1. Read GLM's diff and the log. Confirm the cause it found (what swallowed the first press) against
   the code, and that the fix covers Enter, Space, pad A and a click, on the defeat, retired,
   extracted and win plates.
2. Finish anything half-done (does `endRunOverFilm` exist and do what the calls expect? any guard
   that still drops a press during a short post-death lockout must remember it and act when it ends).
3. Add the focused test DEMO-RUNOVER-1 asked for (one press of Again on a plate with a running
   replay starts the next run) and run the focused tests of crucible.js and input.js.
4. Commit only these hunks by exact path with own-commit (snapshot first: `bash scripts/fleet/own-commit.sh begin <file>`
   is too late for GLM's hunks, so build the commit with a patch: `git diff -- <file> > x.patch`, edit
   the patch down to the Run Over hunks, `git apply --cached x.patch`, check `git diff --cached`,
   then `git commit -m "<msg>"` with NO pathspec only if `git diff --cached --name-only` lists just
   your files). Never git add -A, reset, stash, restore or checkout.

## Receipt
Protocol headings; the cause (file:line); the fix (commit); the test; what you could not verify.
