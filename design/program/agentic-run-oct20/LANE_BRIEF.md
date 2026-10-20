# Lane owner brief — fleet run oct20

You own ONE build-map row in a multi-agent fleet run on the SpaceFace repo
(C:\Users\93rob\Documents\GitHub\SpaceFace, Windows, Git Bash). Run plan: `PLAN.md` beside this file.
Drive the row to a reviewed, tested, **uncommitted** diff with the pipeline driver, then report.
The controller commits; you never do.

## Pipeline

`node design/program/agentic-run-oct20/lane.mjs <ROW>` runs a planner (Claude Opus 5.5; falls back
to Codex automatically while Claude is session-limited) → OpenCode DeepSeek v4.1 Flash (implements
and writes tests) → Codex gpt-6.1-sol (reviews) → fix loop (≤3 review rounds). Artifacts:
`design/program/agentic-run-oct20/out/R<ROW>/` (plan.md, report.md, files.txt, diff.patch,
review-N.md, status.json, lane.log, *.log). Expect 30–150 minutes.

## Steps

1. Launch it as a background command from the repo root (exec with timeout 0). Poll with get_output
   using long timeouts (~240000 ms) until a terminal STATUS appears: REVIEW-PASS, NEEDS-CONTROLLER,
   PLAN-FAILED, IMPL-NO-FILES, or CRASH. Never poll in a tight loop.
2. Recovery (at most 2 extra cycles total):
   - PLAN-FAILED: read plan.log / plan.codex.log; rerun once.
   - IMPL-NO-FILES: read impl.log. Provider rate-limit/quota → wait ~2 min, rerun `--from=impl`.
     If the model edited files but forgot files.txt, write it yourself (repo-relative, forward
     slashes, one per line) from impl.log and `git status`, then rerun `--from=review --rounds=2`.
   - NEEDS-CONTROLLER: read the last review-N.md. Concrete, small BLOCKING/MAJOR findings → fix
     them yourself with minimal edits inside the row's files, then `--from=review --rounds=1`.
     Large ones → stop and report them.
3. Your own final verification (required even on REVIEW-PASS): read diff.patch fully; every path in
   files.txt must be inside the seam's write boundary (build_map.md §1C seam table) or the row's
   named catalog lines, or be a new test file; run the new focused test and the existing focused
   tests named in plan.md with `node --test <file>` and record pass/fail counts; sim edits use no
   Math.random/Date.now and import no Three.js; new state serializes/deserializes with defaults so
   old saves load. Fix small defects (minimal edits) and re-run tests. Keep files.txt exact.

## Hard rules

- NEVER run mutating git (add, commit, stash, checkout, restore, reset, switch, branch, worktree,
  apply, rm, mv, clean). Read-only git only. Never run `npm ci` / `npm install`.
- Never edit another agent's dirty files: anything `git status --short` shows that is not in your
  files.txt. Other fleet lanes run concurrently. Known foreign sets:
  `src/systems/{mining,npcJobsRuntime,wingmen}.js`, `src/ui/screens/{flightFootage,footageVideoCodec}.js`,
  `assets/ships/release/render-packages/**`, `tools/forge-*.cjs`, `package-lock.json`.
- Never edit build_map.md, design/program/NOW.md, design/program/LANDED_REVIEW.md,
  design/program/DEMO_READINESS_2026-09-20.md, *.expected.json, package.json, package-lock.json,
  lane.mjs, land.mjs.
- No browser/Electron/GPU probes. Never edit an existing test to make it pass.

## Report (final message, concise)

Terminal status and review round; the exact files list; test commands with pass/fail counts; 3–6
lines on what changed in player terms and which done-when items it covers vs defers — say plainly
whether the row can be CLOSED or stays OPEN and with what remainder; one sentence a second reviewer
should re-check (no `|` characters); any concerns or law issues.
