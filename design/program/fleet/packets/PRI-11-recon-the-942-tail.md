# PRI-11-recon — What PR #942 really contains, measured against today's Swarm (read-only)

**Lane 3. Read-only: you change no file under `src/`, `test/`, `scripts/` or `design/`.** Your only
output is one report file: `.devshots/pr-intake/reviews/recon-942.md` (and your receipt).

PR #942 began as "isolate a paced opening volley" and grew to 138 files (+13k lines) of Foundry staging:
opening flanks, Spitter/crossfire, Maw wreck and ballast, Cyst, Leecher, Glassback, Bellows, Fortify
readiness, turret presentation, Mill salvage, Cryo guidance. Since then master built the thirty named
rounds (`design/game/12_SWARM_THE_PIT.md`; `src/data/swarmCourse.js`, `swarmCourseCast.js`, `swarmTwists.js`;
queue rows C01-01…05, G08-02, A01-02…05). A senior review
(`.devshots/pr-intake/reviews/codex-dot-big.md`, section "#942" — read it first, including its commit → file
table and its rebuild plan for the opening) says much of the branch is superseded but did not check
each feature.

## Do
A. **The opening, today.** On master, through the ordinary Swarm launch (training option off), what
arrives in round 1 and when? Trace `survivalWavePlanner.planWave` / `applyOpeningLesson`,
`survivalWave._maybeReleaseOpeningLesson` / `_spaceOpeningArrivals` / `_reinforceSwarm`, `swarmArena._onWaveStarted`
and the Brood plan (`src/data/swarmBrood.js`), the ship quota (`src/data/swarmMode.js`) and the round-1 cast
(`src/data/swarmCourseCast.js`). Write the timeline (what, how many, from which gate, at what second) with
file:line for each fact, and state plainly whether master already delivers the design's opening:
`design/game/20_THE_FIRST_HOUR.md` (the first three Wasps enter before the pack) and
`12_SWARM_THE_PIT.md` round 1 (*ten Wasps, one gate*). List every gap.

B. **Each feature commit** in the review's table (about 25), using only git plumbing
(`git show <commit> --stat`, `git diff f95de0eb1ba7 refs/remotes/pull/942 -- <path>`,
`git show refs/remotes/pull/942:<path>`, `grep` on the working tree):
1. **Feature** — one sentence: what the player would see.
2. **Which round(s)** it belongs to in the branch, and what `design/game/12_SWARM_THE_PIT.md` says that
   round is today. `FITS` (same round identity), `MOVED` (the idea belongs to a different round now — which),
   `CONTRADICTS` (the design gives that round to something else and has no home for this).
3. **On master already?** `YES-SAME` / `YES-DIFFERENT` / `PARTLY` / `NO`, with master file:line.
4. **Size**, **depends on**, **collides with** (files master changed more than five times since
   `f95de0eb1ba7`, and the conflict list in the review).
5. **Hot path** — per-tick scans or allocations it adds; cite lines.
6. **Recommendation** — `PORT`, `REBUILD` (say what is wrong), `SALVAGE-IDEA` (worth a line in a future
   packet; name the round it would serve), `SKIP` — one line of reason.

End with: the table (feature · round · fits? · on master? · recommendation), a suggested build order in
packets of at most ~10 source files with no file shared between two packets in flight, and what you could
not determine.

## Rules
Work only with `git` read commands and `grep`/file reads. No tests, no game, no edits. Every claim about
master carries a file:line you opened. "I could not determine" is a good answer; a guess is not.
