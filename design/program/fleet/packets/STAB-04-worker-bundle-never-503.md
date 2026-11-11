# STAB-04 — The game loads even while source files are changing

**Owner complaint:** "it doesn't load sometimes". **Size:** small-medium. **Tier:** D.

## Cause (found 2026-11-10)
`server.js` serves the simulation worker as a bundle built on the fly by
`scripts/lib/devSimWorkerBundle.mjs` (`buildFresh`, ~line 99). If any input file or the import map
changes while it builds, it throws ("Dev sim worker input changed during build", lines ~148–159) and
the request answers **503** — the game cannot start. In this repo files change constantly (agents,
saves of an editor), so a boot can land on a mid-change moment. STAB-01's `check:playable` run saw
exactly this: one transient 503 on `/src/core/wholeSimBrowserWorker.js`.

## What must be true when you are done
1. A build whose inputs changed during the build **retries** (bounded: up to 5 attempts, 150 ms apart),
   because the change is usually a write finishing.
2. If it still cannot build a fresh bundle, the server **serves the last good bundle** it built (if one
   exists) with a console warning naming the file that kept changing — never a 503 when a good bundle
   exists.
3. A real error (a syntax error in a source file) with no last good bundle still fails, with one plain
   sentence naming the file (not a stack trace) in both the server log and the HTTP body.
4. No behaviour change when nothing is changing (same bundle, same hash).

## Files you may edit
`scripts/lib/devSimWorkerBundle.mjs`, `server.js` (only where it calls the provider), new test
`test/dev-sim-worker-bundle-resilience.test.mjs`. `git diff` first.

## Checks
- New test with a temp project root: (a) a file rewritten during the first build → second attempt
  succeeds; (b) a file that keeps changing → the last good bundle is served and a warning is logged;
  (c) a syntax error with no prior bundle → plain-sentence failure; (d) unchanged inputs → identical hash.
- `node --test test/*sim-worker*.test.mjs test/*bundle*.test.mjs` — report failures.
- `npm run check:playable` once at the end.

Commit: `fleet(STAB-04): the sim worker bundle retries and falls back instead of a 503`.
