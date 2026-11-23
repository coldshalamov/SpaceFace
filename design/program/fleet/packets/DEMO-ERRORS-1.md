# DEMO-ERRORS-1 — every screen mounts with zero errors

**For:** a careful engineer (no vision needed). **Kind:** measure, fix, list. Commit your own files.

## Why

The game is being readied for a demo. "Zero errors behind the scenes in a normal run." The UI bench
(`scripts/ui-bench.mjs`) mounts each real screen module over a still in a headless browser, without
booting the game, and prints page errors, console errors and failed requests at the end of a batch
(for example `station-market: pageerror: r is not defined`). It does not need the game lock.

## Do

1. `node scripts/ui-bench.mjs --list` gives every screen id. Shoot them ALL at one size, in batches
   of about ten ids, into your own folder so you do not overwrite other agents' shots:
   `node scripts/ui-bench.mjs --shot=<id,id,...> --viewports=1280x720 --out=.devshots/fleet/demo-errors/<batch>`
   (the machine is busy: allow several minutes per batch; run batches one after another, never in
   parallel).
2. Collect, per screen id: page errors, console errors, failed requests (ignore `net::ERR_ABORTED`
   on media that a screen cancels on purpose only if you confirm that in the code), lines starting
   `NOT MOUNTABLE`, and `BANNED WORD` lines.
3. For each error, find the cause in the code (file:line) and classify it:
   - **bench-only**: the bench's own harness or fixtures are wrong (`tools/ui-bench.html`,
     `scripts/lib/uiBench*.mjs` except `uiBenchCatalog.mjs`, bench fixture data). Fix it.
   - **real**: the screen code would throw in the game too. Fix it ONLY if the file is one you may
     edit (below); otherwise list it.
4. Re-shoot the screens you fixed and confirm the error is gone.
5. Commit by exact path, plain-English messages.

## You may edit

`tools/ui-bench.html`, `scripts/lib/uiBenchBatch.mjs`, `scripts/lib/uiBenchArrival.mjs`,
`scripts/lib/benchServer.mjs`, bench fixture/still files under `tools/` and `scripts/lib/` that only
the bench uses, and their tests.

## Do NOT edit

`src/**`, `styles/**`, `scripts/ui-bench.mjs`, `scripts/lib/uiBenchCatalog.mjs` — other agents own
them right now. List every real error there in your receipt instead.

## Receipt

The protocol headings, plus a table: screen id | error text | cause file:line | bench-only or real |
fixed (commit) or listed | suggested fix in one line.
