# Bug-hunt sweep (dead lane, 2026-10-27) — a candidate list, not truth

`scripts/bughunt-sweep.mjs` ran every `test/*.test.mjs` in 8 parallel shards with a 120 s per-file timeout on a heavily
contended box; `scripts/bughunt-rerun.mjs` re-ran the failures. Results:

- `still_failing.txt` — 118 test files that still failed after the rerun.
- `todo_fails.txt` — the 111 handed to the second rerun.
- `refail.txt` — assertion excerpts from the reruns.

Treat it as candidates. Most long sim tests (Ceres, Anvil/Orchard workfleet) take 170+ s under load and die on the timeout rather than
failing an assertion (proved for `ceres-workfleet-production-cycle`, which was still progressing at 600 s). Real reds confirmed and handled
in the 2026-10-27 sitting: `hit-answer-channels`/`feel-damage-player-involvement` (stale vs 8cad9e30298), `bp011` (stale fixtures),
`floating-origin-rapier` (sign convention), `last-shift-worker-entry` (bridge list), `m3-career-cohorts` (D266), `hud-contact-roster-visibility` (D267).
To triage the rest: run a file alone with `timeout 600 node --test <file>` on a quiet box before believing it.
