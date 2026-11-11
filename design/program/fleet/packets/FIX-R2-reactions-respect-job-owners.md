# FIX-R2 — World reactions must not steal movement from ships doing a job

**Lane 2.** Source: senior review `design/program/fleet/reviews/2026-11-11-aac2108d.md`, finding
"Traffic reactions overwrite movement owned by active NPC jobs" (verified by the lead).

## The defect
`src/systems/traffic.js:~4074` runs the new reactions (road rage `src/systems/roadRage.js:64`, tailgater
`src/systems/tailgater.js:143`, rubberneckers) right after `_assignCeresActivityJob` and before the job-yield
branch. They write `data.intent` directly. But `src/core/registry.js:~754` documents **npcJobsRuntime as
the sole movement writer** for a hull with a job (`npcJobsRuntime.js:~4790`). So a job-owned hauler that
gets cut off is steered by two owners at once.

## The fix
- For hulls **without** `data.jobId`: keep today's direct intent writes.
- For hulls **with** a job: request the reaction through the job owner's existing control path —
  `helpers.npcJobs.interrupt(...)` / `resume(...)` (and the existing swerve/lease helpers the review
  names; read how `trafficNearMiss.js` leases a jink to the job runtime, and copy that pattern). The
  reaction ends by resuming the job.
- One shared helper for all three reactions, so the next plant gets it right automatically
  (e.g. `requestTrafficReaction(host, entity, intent, durationS)` in a small module), and use it in all three.

## Files you may edit
`src/systems/traffic.js` (the hook site only), `src/systems/roadRage.js`, `src/systems/tailgater.js`,
`src/systems/rubberneckers.js`, a new small helper module, tests. `git diff` first.

## Checks
Tests with a job-owned hull: the reaction goes through interrupt/resume and the job resumes afterwards;
a job-less hull keeps the direct path. Existing tests: `node --test test/road-rage.test.mjs
test/tailgater.test.mjs test/inf-lane-horn.test.mjs test/*npc-job*.test.mjs`.
Commit: `fix: traffic reactions lease job-owned hulls instead of overwriting their movement`.
