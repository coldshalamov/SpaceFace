# DEMO-RUNOVER-1 — the first press of Again on Run Over must start the next run

**For:** a builder agent (code). **Kind:** investigate, fix, test. Commit your own files.

Swarm is the demo. A probe of the real desktop build (`scripts/probe-first-swarm-minute.mjs`,
receipt `.devshots/fleet/runs/DEMO-SWARM-PROBE-1.devin3.*/RECEIPT.md`) found, in two runs out of
two: after the ship dies and the Run Over plate shows ('Again [Enter]' focused), the FIRST Enter is
swallowed. The plate stays up 10-12 s until Enter is pressed a second time. A stranger at a demo
presses Again once and thinks the game hung.

## Do
1. Find the Run Over plate (src/ui/screens/crucible.js `_mountRunOver` and its key handling; the
   killcam / replay stage request `killcamStageRequestFor`; screenManager focus and locks; any input
   guard after death, e.g. a dead-time lockout so a held fire key does not skip the screen).
2. Work out what the first Enter does (skips a replay? hits a locked screen? lands before the
   button is focused or enabled? consumed by a death-recovery handler?). Prove it with a focused
   node test or by reading the code path end to end.
3. Fix it so that ONE press of Enter/Space/pad A (or one click) on Again starts the next run. If a
   short guard after death is intended (to stop a held key from skipping the plate), keep it at
   most ~0.6 s and make it visible (the Again button shows as not-yet-ready, then lights), and a
   press during the guard is remembered and acted on when it ends — never silently dropped.
   If a killcam replay is running, the first Again press ends it AND starts the run.
4. Add a focused test of the rule. Run the focused tests of every file you touch.

## You may edit
src/ui/screens/crucible.js, src/ui/screenManager.js (only if the cause is there), src/ui/input.js
(only the Run Over / death guard path), and tests. Before editing a file run `git diff -- <file>`;
if it has changes you did not make, use `bash scripts/fleet/own-commit.sh begin <file>` before and
`... commit "<msg>" <file>` after. Never git add -A, reset, stash, restore or checkout. Do not boot
the game unless you wrap it in `node scripts/fleet/game-lock.mjs run -- <cmd>`.

## Receipt
Protocol headings; the cause with file:line evidence; the fix (commit); tests.
