# LOAD-03 — Start Swarm's first-time cook when the Swarm screen opens, not at PLAY

Evidence: your LOAD-02 receipt (`.devshots/fleet/runs/LOAD-02-*/RECEIPT.md`, data `.devshots/fleet/load02/`): with the default gate,
the **first** Swarm door in a browser session took 37.5 s PLAY→veil, but the 2nd and 3rd doors in the same session took
13.0 s and 15.1 s. The first-door penalty (~22 s) is one-time, in-session program/pipeline work — exactly what shipped
games pre-cache at boot/menus. The `?swarmFirstPicture=1` flag stays OFF (it measured worse).

## Build
When the player opens the Swarm door's pre-match screen (title → SWARM → the arena/PLAY screen; the `crucible` screen),
start the same first-time work the survival cook does on PLAY — the opening survival scene's program/pipeline warm for the
selected arena and round-1 roster (and whatever made door 2/3 fast: find which cook rows shrank between off-1 and off-2/3
in your JSONs and warm exactly those) — in the background, with KHR_parallel_shader_compile and no synchronous waits, at a
pace that keeps the pre-match screen's frames under ~33 ms. If the player presses PLAY before it finishes, PLAY continues the
same work (no duplicate compiles). Cancel cleanly if they leave the screen. Adventure unchanged. If the arena choice changes
on that screen, re-target.

## Measure (one lock hold; calibration as before; never kill a holder you did not start)
First door in a fresh browser, three runs each: (a) today: open the Swarm screen and press PLAY immediately; (b) with the
pre-warm, PLAY after a 5 s dwell; (c) with the pre-warm, PLAY after a 15 s dwell. Report PLAY→veil, the pre-match screen's
frame p95 during the warm, and the first-30 s-after-veil links / frames > 100 ms (must stay within today's off-arm numbers).
Tests for the warm trigger/cancel; exact-path commits (own-commit.sh for renderer.js / screens); `npm run check:sim` green.
