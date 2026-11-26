# DEMO-PAD-1 — a gamepad must fly the ship on the shipped (worker-clock) path

**For:** a builder agent. **Kind:** verify, fix, test. URGENT: a demo may use a controller.

Twin-stick became the shipped pad scheme tonight (commit 94f53c7cc1). Another agent then found, in
`test/r2-d214-gamepad-lane.test.mjs`'s "separate realm" test (the worker-clock path the real game
uses), that pad frames arrive (`aimIntentActive` true, the move vector flows, ticks advance) but the
ship never displaces or turns — frozen at spawn. It left a corrected test predicate UNCOMMITTED
(`git diff -- test/r2-d214-gamepad-lane.test.mjs`); `src/systems/input.js` and
`src/systems/gamepad.js` may also hold uncommitted twin-stick edits (`git diff` them).

## Do
1. Run `node --test test/r2-d214-gamepad-lane.test.mjs` and the other pad tests
   (`grep -rln "gamepadFrame\|twinStick\|twin-stick" test | head -20`). Find out whether a twin-stick
   pad really cannot move the ship on the worker path, or the test is wrong. Trace the pad frame from
   simLaneMain.js appendGamepadFrame -> the worker -> src/systems/input.js (gamepadFrame) -> the
   flight intent the ship reads (thrust/turn) for the twin-stick scheme.
2. If real: fix it so the left stick drives and the right stick aims on the worker path, exactly as
   94f53c7cc1 describes, with a focused test that steps the worker host with a pad frame and asserts
   the ship moves and turns. If the test was wrong: fix the test, say why.
3. If the probe tools can drive a virtual pad, confirm in the real build through the game lock;
   otherwise say it is unverified in the window.

## Rules
Before editing a file run `git diff -- <file>`; if it has changes you did not make, use
`bash scripts/fleet/own-commit.sh begin <file>` before and `... commit "<msg>" <file>` after (for the
uncommitted test predicate left by the other agent: finish it if it is right, it is yours to land).
Never git add -A, reset, stash, restore or checkout. Write RECEIPT.md early.

## Receipt
Protocol headings; real bug or test bug (evidence); the fix (commit); tests.
