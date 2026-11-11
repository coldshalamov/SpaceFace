# G11-02 — One clock, the rest: nothing animates while the world stands still

**Lane 3.** Owner: "the 3D models are revolving in place … but they're not physically changing location,
then it blips." Step 1 landed: the speed gauge (3167d8f6) and the backdrop/parallax/post time (9349afb6) now
advance with the drawn world through `presentedAdvanceRatio()` in `src/render/presentedClock.js` (read it —
it returns drawn-world seconds per wall second, 0..1.5, and is safe to call many times per frame).

## Job
Find every other place in `src/render` that animates on the **wall clock** or a raw frame delta and is
**decoration** (idle spins of stations/rings/radar dishes, blinking lamps, shader `uTime`/`time` uniforms for
water/energy/holo materials, rotating pickups, pulsing beacons):
`grep -rn "performance.now\|Date.now\|clock.getElapsedTime\|getDelta()\|uTime\|\.time\.value" src/render | grep -v test`.
For each decoration, multiply its time step by `presentedAdvanceRatio(<frame wall time ms>)`, the way
`src/render/renderer.js` does for `_bgTime` (search `worldDt`). Keep a per-system accumulated time
(`t += dt * ratio`) rather than reading absolute wall time, so a stall freezes it smoothly.

**Do not touch:** HUD/UI animations in `src/ui` (they are interface, not world), anything that paces work
(texture uploads, budgets, timeouts — the plate-upload case in `renderer.js` must keep wall dt), audio, and
the simulation. List every site you changed and every site you deliberately left, with one reason each.

## Checks
- A focused test for one representative decoration: with a fake fence whose presented time holds still,
  its accumulated time stops advancing; with real-time play it advances at 1×.
- `node --test test/presented-clock.test.mjs` and the tests of each render file you touch.
- `node --check` on every touched file. Run `npm run gate -- --quick` through the lock at the end.

Commit: `fleet(G11-02): world decoration follows the drawn-world clock`.
