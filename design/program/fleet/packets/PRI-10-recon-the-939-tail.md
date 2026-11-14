# PRI-10-recon — What PR #939 really contains, feature by feature (read-only)

**Lane 3. Read-only: you change no file under `src/`, `test/`, `scripts/` or `design/`.** Your only
output is one report file: `.devshots/pr-intake/reviews/recon-939.md` (and your receipt).

PR #939 began as a small Kessler-scale change and grew to 206 files (+17k lines): Helios first shifts,
Tethys assisted release, Rook/Cinder receiving, Furnace work, Registry/Nest/Maw/Slate/Foreman continuity,
Books 4–7 evidence, Shepherd's escort. A senior review (`.devshots/pr-intake/reviews/codex-dot-big.md`,
section "#939" — read it first, including its commit → file table) could not say which of those features
master already has in another form. The lead needs that answered to decide what to build.

## Do
For each commit row in that review's table (about 27 feature commits), using only git plumbing
(`git show <commit> --stat`, `git diff f95de0eb1ba7 refs/remotes/pull/939 -- <path>`,
`git show refs/remotes/pull/939:<path>`, `grep` on the working tree):
1. **Feature** — one sentence: what the player would see or do that they cannot on master.
2. **On master already?** `YES-SAME` (same behaviour exists; cite master file:line) · `YES-DIFFERENT`
   (master solves it another way; cite) · `PARTLY` (say which half) · `NO`.
   Decide by searching master for the feature's behaviour, not just its file names: grep the distinctive
   strings, event names, flags and mission ids the commit introduces.
3. **Size** — new/changed `src/` files and line counts for that feature alone; its test files.
4. **Depends on** — other #939 commits it cannot work without.
5. **Collides with** — files that PR #945 or #982 also change (lists: `git diff --name-only f95de0eb1ba7 refs/remotes/pull/945 -- src`,
   same for 982), and files master changed heavily since (`git log --oneline f95de0eb1ba7..HEAD -- <path> | wc -l` > 5).
6. **Design fit** — does `design/game/13_JOBS_AND_HEISTS.md` or `16_THE_STORY_SHOWN.md` describe this beat?
   Quote the heading if yes; say "not in the design" if no.
7. **Words** — count the feature's player-facing strings longer than eight words (the design's limit for
   spoken lines); give the worst example.
8. **Hot path** — does it add work to a per-tick `update` (entity-list scans, allocations)? cite lines.
9. **Recommendation** — `PORT` (sound, three-way merge), `REBUILD` (right idea, wrong foundation — say what
   is wrong), `SKIP` (master has it / not in the design / superseded) — one line of reason.

End with: a table of all rows (feature · on master? · size · recommendation), a suggested build order
grouped into packets of at most ~12 source files each with no file shared between two packets in flight,
and a list of anything you could not determine.

## Rules
Work only with `git` read commands and `grep`/file reads. No tests, no game, no edits. Be exact: every
"on master" claim carries a file:line you opened. "I could not determine" is a good answer; a guess is not.
