# DEMO-TESTPINS-1 — tests that pin rules this demo pass deliberately changed

**For:** zcode GLM (text only; your turn ends at 30 minutes, so do at most TEN test files, commit
each as you go, then write the receipt). **Kind:** test maintenance. Commit your own files.

Since 2026-11-23 03:40 many commits deliberately changed player-facing rules and words for the
demo (two-door title, one-press Swarm door, four-door station, one Run Over plate, no rings around
ships, plain words, approved Swarm round budgets...). Tests that still assert the OLD rule now fail
for a good reason. AGENTS.md: "A test that pins an old rule you were asked to change gets rewritten
with the new rule in its message."

## Do
1. `git log --since="2026-11-23 03:40" --name-only --format="%h %s"` lists the changed source files.
   For each changed source file, find its tests (`grep -rln "<file stem>" test`) and run them
   (`node --test <file>`), ten test files at most per run, starting with Swarm (crucible*, survival*,
   swarm*, pilot*) then station, title, HUD.
2. For each failure decide: (a) the test pins a rule/wording a commit deliberately changed (the
   commit message says so) -> rewrite the assert to the new rule, with a comment naming the commit;
   (b) anything else (a real regression, or a failure unrelated to these commits) -> do NOT change
   the test; list it in the receipt with the failing assert and the suspected commit.
3. Never delete a test to make it pass; never edit golden/expected files.
4. Commit each rewritten test file by exact path ("Tests follow <commit>: <new rule in plain words>").

## You may edit
`test/**` only.

## Receipt
Protocol headings + table: test file | failure | (a) rewritten (commit) or (b) listed + suspected cause.
