# DEMO-RUNOVER-2 — Again still ignores the first press in the real build

**For:** a builder agent (careful; this is the top demo bug). Commit your own files.

DEMO-RUNOVER-1-R2 (grok46, commit after 2026-11-24 01:30Z) claimed one press of Again starts the next
run. The honest measurement afterwards (`.devshots/fleet/runs/DEMO-GATE-1.devin3.2026-11-24T03-40-42/RECEIPT.md`)
found, in BOTH real-build probe runs, that the first Enter on Run Over's Again was ignored for 8.3 s /
8.8 s; a second Enter then worked. One frame shows the plate first as "Run Over — Reading the run
back…" before the full plate. Probe evidence: `.devshots/demo/swarm-minute/2026-11-24T04-41-09/` and
`2026-11-24T04-50-52/` (report.json steps `again-press`, `again-repress`).

## Do
1. Reproduce with `node scripts/fleet/game-lock.mjs run -- node scripts/probe-first-swarm-minute.mjs`
   (it records `again-repress` when the first press is swallowed). Instrument (dev-only) what the
   first Enter hits during the ~8 s: is the plate in its "Reading the run back…" phase with Again not
   yet mounted/focused/enabled? a screen lock? focus on another element? a key guard?
2. Fix so that ONE press of Enter/Space/pad A/click on Again starts the next run at any moment the
   plate is visible, including the "Reading the run back…" phase: either Again is live from the
   first frame of the plate, or a press during the reading phase is remembered and acted on the
   moment the plate is ready (no visible dead time over ~0.5 s). Never silently drop it.
3. Also: the Again button's accessible name reads "AgainEnter" — give the key chip aria-hidden and
   the button a clean label "Again".
4. Prove it with the probe: `again-repress` must NOT appear in two runs. Focused tests too.

## Rules
Before editing a file run `git diff -- <file>`; if it has changes you did not make, use
`bash scripts/fleet/own-commit.sh begin <file>` before and `... commit "<msg>" <file>` after. Never
git add -A, reset, stash, restore or checkout. Wrap game boots in the game lock; never steal focus.

## Receipt
Protocol headings; the real cause (file:line); the fix (commit); the two probe runs' again timings.
