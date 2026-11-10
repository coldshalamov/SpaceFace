# Task MJ7 — board row 356: M20 "A room with a different law" (Crucible ruleset variation)

Read first: `_constraints-codex.md`, brief `design/finish-expansion-2026-09/missions/M20.md`, and
the disposition row in `design/program/admit-sfq-m/DISPOSITIONS.md`.

## The residual

A ruleset variation of the Crucible (`src/data/swarmMode.js` lineage; current ruleset +
`test/crucible-arena.test.mjs` are the live owners). Read, exploit, counter, survive: one authored
arena where a different law holds (per the brief's own text), implemented as an authored Crucible
ruleset variant — no new mode, no new engine; reuse the ruleset registry the current Crucible runs
on and make the variant reachable from the ordinary Crucible surface.

## Done when

- `test/m20-room-with-a-different-law.test.mjs` pins: the variant ruleset selects and runs on the
  current Crucible path, its law actually binds (the exploited behavior is measurable), and the
  standard ruleset is untouched when the variant is off.

Note: verify the MJ6 brief file is intact before starting (a shell hiccup truncated one file in
this directory earlier). If `MJ6-M24-move-nursery.md` is truncated, ignore it — it is not your job.
