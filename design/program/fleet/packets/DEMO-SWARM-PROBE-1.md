# DEMO-SWARM-PROBE-1 — a probe that plays Swarm's first minute the way a stranger does

**For:** a careful engineer (no vision needed: you write and run a capture script; the director
looks at the frames). **Kind:** new script. Commit your own file.

## Why

The game is being readied for a demo. The director must SEE the first 60 seconds of a Swarm run as
a stranger plays it: from the title, one press into round 1, the first throw, the first level-up
card, a death and Run Over, then Again. `scripts/probe-first-ten-minutes.mjs` already does this for
Adventure (real keys and mouse, a window that never takes focus, frames of each beat, a text log
with times, a census). Read it first and copy its structure, launch, input and capture helpers.

## Do

Write `scripts/probe-first-swarm-minute.mjs` that, in the Electron build through the game lock
(`node scripts/fleet/game-lock.mjs run -- node scripts/probe-first-swarm-minute.mjs`), with the
window hidden/inactive and never focused:

1. Starts at the title, presses into the Swarm door, presses PLAY (Enter) — one press, as a player.
   Record the time from the press to the first hostile visible.
2. Plays like a stranger for about 60 s of world time: thrust (W) and turn (A/D) held in bursts,
   mouse aim at the nearest hostile, fire (LMB) in bursts, and **the rope**: aim at the nearest
   loose body (rock/freight/wreck) or a light enemy, hold RMB to latch, swing, release toward a
   hostile cluster (the throw). Try at least three throws. Use the game's own read model through
   `window.SF` only to choose aim points (positions of nearest bodies), never to write state.
3. When a level-up card shows, wait 1.5 s (so the frame is captured), then press 1.
4. Let the ship die (stop dodging after ~60 s, or keep flying into hostiles), capture Run Over,
   then press Enter (Again) and capture round 1 again; record the time from Enter to the first
   hostile.
5. Captures: a frame every 2 s into `.devshots/demo/swarm-minute/<stamp>/NN-<beat>.png`, plus a
   frame at each beat (door, round start, each throw release + 0.5 s, card, death, Run Over,
   Again). Then ONE contact sheet `contact.png` (a grid of every frame with its time and beat
   label, max 3000 px wide) — build it with the same image tooling the repo already uses (search
   `scripts/` for "contact sheet" or "sharp"/"pngjs"; add no new dependency).
6. `report.json`: times (press->hostile, Enter->hostile), throws attempted/latched/released,
   every on-screen text line with its time (same method as the Adventure probe), fps and world
   speed per 10 s if the game exposes them (`window.SF.simLaneDiag()`), console errors.
7. Exit cleanly; never leave Electron running.

Run it once at the end through the lock and fix it until it completes. Commit the script by exact
path with a plain-English message.

## You may edit

`scripts/probe-first-swarm-minute.mjs` (new) and, only if a shared helper must change, the helper
under `scripts/lib/` (name it in the receipt). Nothing under `src/`.

## Receipt

Protocol headings, plus the path of the contact sheet and report from your final run.
