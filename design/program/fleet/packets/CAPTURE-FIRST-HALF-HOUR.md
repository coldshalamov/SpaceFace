# CAPTURE — one command that plays the opening of each mode and shows what a stranger gets

**For:** a careful engineer. **Kind:** a measuring tool. **Commit when it runs clean twice.**

## Why

The owner's finish line (ruling R24 in `design/overhaul/00_RULINGS.md`): the game should feel worth
$40 to a stranger. We judge that with one repeatable capture of each mode's opening, rerun after
every wave of changes, so "better" is something we can look at instead of argue about. Today there
are many one-off probes and no single capture.

## Build `scripts/capture-opening.mjs`

One script, run through the lock:
`node scripts/fleet/game-lock.mjs run -- node scripts/capture-opening.mjs --mode=adventure|swarm --minutes=N --out=<dir> [--seed=<n>]`

It boots the real game the way a player does (reuse `scripts/player-truth/routes.mjs`:
`bootToMenu`, `adventureToFlight`, and whatever reaches a Swarm round; reuse the isolation the
existing probes use so the owner's real saves are never touched: see
`.devshots/director/travel-probe.mjs` for the server env and the sampling it already does), then
plays a scripted but ordinary session with real key and mouse input, never by poking state:

- **Adventure (default 12 minutes):** new game with defaults → look around for 20 s without input →
  fly to the first objective → use each power once on a rock → latch and throw a rock with the Line
  → mine until the hold has something → fly to the station and dock → open each station door, sell
  the ore, buy one thing, take one job → undock → fly toward the job → fight the first hostile met
  (aim, fire guns, use two powers) → open the map → open the pause menu → save.
- **Swarm (default 8 minutes):** from the title to round 1 by the shortest path the UI offers
  (count the presses) → fight three rounds using guns, every power and the Line → take whatever
  upgrade choices appear (first option) → visit the between-round shop if one appears → keep
  playing until death or the time limit → the results screen.

If a step cannot be done by input (a control is missing, a prompt never appears, a door will not
open), record that as a **finding** with a frame and continue; do not work around it by setting
state.

**It records, into `<dir>`:**
- `frames/` a frame every 10 s and at every step boundary, named `mm-ss-step.png`, plus a frame at
  each of the ten worst frame-time moments.
- `trace.json` per second: frames per second, the worst frame time, simulation speed against the
  clock, worker step time, entity counts by kind, ships within 1,000 m, authored-model stand-ins on
  screen (the renderer publishes `state.render.streamingCensus`).
- `words.json` every distinct piece of text that was visible, with the step and a frame where it
  first appeared (walk the DOM's visible text nodes once a second; include toasts and prompts).
- `findings.json` things a stranger would trip on, detected mechanically: a step that failed; any
  text matching the banned-words list in `scripts/check-plain-words.mjs`; text containing
  `undefined`, `NaN`, `unbound`, `${`; any freeze (no new positions for over 0.35 s while frames
  run); any second under 30 fps; any stand-in visible longer than 3 s; any console error.
- `summary.md` one page: time to first control, presses from title to play, a table of the steps
  with pass/fail and time taken, the frame-rate and freeze totals, the count of words and findings,
  and a contact sheet `sheet.png` (a grid of about 24 frames, labelled) so one image shows the
  whole session.

Keep the script's own cost out of the numbers (sample with the cheapest calls that work; take
frames with the same method the travel probe uses). It must leave no server or browser running if
it fails. It writes only under `<dir>` (default `.devshots/capture/<mode>-<stamp>`).

## Prove

Run it once per mode through the lock. In the receipt: the two `summary.md` files pasted, the paths
of the two contact sheets, and the findings counts. Then run Adventure a second time with the same
seed and report whether the step table matches. `npm run check:playable` still passes. Add
`"capture:opening"` to `package.json` scripts.

## Files

`scripts/capture-opening.mjs` (new), helpers under `scripts/lib/` if needed, `package.json`. No
game source changes; if a hook is missing, report it instead of adding it.
