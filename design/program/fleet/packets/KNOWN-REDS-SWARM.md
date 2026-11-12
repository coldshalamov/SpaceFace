# KNOWN-REDS-SWARM — Make the Swarm/survival tests honest

**Lane 2.** `node --test test/swarm*.test.mjs test/survival*.test.mjs` reports ~29 failures on master (FIX-R5b receipt:
1063 pass / 29 fail; none touch the new round mechanics). A suite that is always partly red hides real breaks — every Swarm
change this week had to argue "these reds predate me". Same method as `KNOWN-REDS.md` (read it): for each failing test, run
it alone, read the assertion and the code, and decide with evidence —
- the code regressed → fix the code (smallest change; determinism and single writers);
- the test pins something deliberately changed (the 30-round course, one-feel physics, new drops/twists) → update the
  expectation with a one-line comment naming the commit (`git log -S`);
- the claim is obsolete → delete only that case with a one-line reason in the commit message.
Never edit `*.expected.json` / reference data to pass.

Node tests only — no browser needed. One commit per test file: `fix(KNOWN-REDS-SWARM): <test> — <verdict>`.
Finish with the whole Swarm/survival suite green (or a short list of genuine bugs you could not fix, each with file:line).
