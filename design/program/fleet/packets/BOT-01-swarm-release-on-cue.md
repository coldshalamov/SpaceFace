# BOT-01 — The Swarm demo bot releases when the throw cue shows (harness only)

`scripts/fleet/looks/demo-route.mjs` runs both doors. The OPENING-1b agent changed the **Adventure** path to tap the
release when the aim tag shows the throw verb (`RMB · THROW`, lit while the release window is open) — first throw
went to 18 s. The **Swarm** path still uses the older swing/release code (from `scripts/fleet/looks/throw.mjs`) and
logs "release did not register a throw" every cycle (`.devshots/fleet/inv12/run1/report.md`, `run2/report.md`), even
though a real-input fixture (`scripts/fleet/looks/throw-fixture.mjs`) throws 13/13 on the same build.

## Do this
1. Read how the Adventure path decides when to tap (grep `cueLit` / `RMB · THROW` in `demo-route.mjs`) and how
   `throw-fixture.mjs` presses (real mouse events, tap length).
2. Make the Swarm throw cycle use the same rule: after a latch, swing, and tap RMB when the throw cue is shown/lit;
   log the cue state, the tap, and the resulting `massline:throw` / line-end reason per cycle.
3. Run it once through the lock (never kill a holder you did not start):
   `node scripts/fleet/game-lock.mjs run -- node scripts/fleet/looks/demo-route.mjs --route=swarm --headed --out=.devshots/fleet/demo/bot01 --max-min=6`
   and report: throws per cycle, seconds from first flight to first throw, and the end reason of every failed cycle.
Change only `scripts/fleet/looks/demo-route.mjs` (and `throw.mjs` if the Swarm path imports from it). Commit by exact path.
