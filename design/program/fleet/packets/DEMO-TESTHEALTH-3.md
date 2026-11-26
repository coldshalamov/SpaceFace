# DEMO-TESTHEALTH-3 — which red tests in the interface groups are real bugs

**For:** a reviewer/fixer agent (text only). **Kind:** triage first, then only the safe fixes.
The repo has about 6000 test files and many are red in the working tree. Before a demo we need to
know which red tests are real bugs on the demo route and which pin rules the demo pass deliberately
changed.

## Do
1. Run these groups (node --test <files>, at most 40 files per command, never the whole suite at
   once; machine is shared): `test/ui*`, `test/render*`, `test/vfx*`, `test/look*`, `test/map*`,
   `test/chart*`, `test/galaxy*`, `test/pause*`, `test/settings*`, `test/help*`, `test/new-game*`,
   `test/save-load*`, `test/radar*`, `test/minimap*`, `test/toast*`, `test/alert*`.
   (Other workers triaged crucible/survival/swarm/pilot/hud/station/title/onboarding and
   massline/power/arsenal/flight/input/save/sim/worker/world/mission/market/economy: skip those.)
2. For every failing test, classify it:
   - **(a) pins a rule a recent commit deliberately changed**: name the commit
     (`git log -S'<old string>' --oneline` or `git log --since="2026-11-20" -- <source file>`) and
     its message saying so;
   - **(b) real regression**: the code is wrong; name the suspected commit and the player-visible
     effect;
   - **(c) broken test or harness** (import of a removed export, a DOM stub missing a method,
     timing-flaky): say which;
   - **(d) unknown**.
3. Fix ONLY class (a) tests: rewrite the assert to the new rule with the commit named in the message
   ("Tests follow <commit>: <new rule>"), one commit per test file, exact paths. Never delete a test
   to make it pass; never edit golden/expected files; never touch source code.

## You may edit
`test/**` only (class (a) rewrites). Before editing a test run `git diff -- <file>`; if it has
changes you did not make, leave that file and list it.

## Receipt
Protocol headings + a table: test file | failing assert (short) | class | commit / evidence |
action (rewritten <hash> / listed). Then the class (b) list on its own, most player-visible first.
