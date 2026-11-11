# STAB-01 — Both launchers start the game every time

**Owner complaint (2026-11-10):** "it doesn't load sometimes and the launcher throws an error;
sometimes it works, sometimes not." **Size:** medium. **Tier:** D.

## What must be true when you are done
1. `SpaceFace.bat` (runs `node scripts/launch-browser.mjs`) reaches the game's main menu **10 times
   out of 10** from a cold start, and a second launch while one is already running either reuses it
   or says plainly what is wrong — never a stack trace.
2. `SpaceFace-Desktop.bat` / `npm run electron` (`node scripts/launch-electron.mjs`) does the same,
   **10 out of 10**.
3. Every failure the launchers can still hit prints **one plain sentence** saying what to do
   (e.g. "Port 8123 is busy — close the other SpaceFace window"), not a raw error.

## How to work
1. **Reproduce first.** Run each launcher 10 times in a row, closing the game each time. Kill only
   the processes your own launch started — never other node/electron/chrome processes on this
   machine; other agents are using them. Record every error text and the step it happened at.
   Try deliberately: launching twice at once; launching while the port is held; launching right
   after a crash.
2. For each distinct failure, find the **cause** in `scripts/launch-browser.mjs`,
   `scripts/launch-electron.mjs`, `server.js`, the Electron main process (the `main` field in
   package.json), or the boot path (`src/ui/bootEntry.js`, `src/ui/bootStartupFailure.js`). Fix the
   cause. Do not add retries that hide a cause you have not explained; a bounded retry is fine for a
   real race you have explained in a code comment.
3. Run the 10x loops again after the fixes and paste the tallies.

## Files you may edit
`scripts/launch-browser.mjs`, `scripts/launch-electron.mjs`, `server.js`, the Electron main and
preload files, `src/ui/bootEntry.js`, `src/ui/bootStartupFailure.js`, `SpaceFace.bat`,
`SpaceFace-Desktop.bat`, new tests `test/launch-*.test.mjs`. Check `git diff` first (protocol rule 2).

## Checks
- the 10x tallies, before and after, for both launchers, in the receipt
- `node --test test/launch-*.test.mjs` for any pure logic you changed (port choice, single instance)
- `npm run check:playable` once at the end (boots the game through the real route; up to 10 min)

Commit: `fleet(STAB-01): both launchers start the game every time`.
