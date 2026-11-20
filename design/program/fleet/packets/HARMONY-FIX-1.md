# HARMONY-FIX-1 — nothing but the player moves the ship or the camera without a visible reason

**For:** a careful engineer. **Kind:** flight and camera behaviour. **One commit per numbered fix.**

## Why

The owner (2026-11-20): "my ship would be swinging weird ways and the camera would move weird
sometimes… sloppy game systems." Ruling R23 in `design/overhaul/00_RULINGS.md` (read it, and R10):
the ship moves for the player's input, visible physics, or a scripted moment the player started;
the camera has one owner that other systems ask. An audit found exactly where the code breaks
this: `.devshots/director/fable/harmony/AUDIT.md`. Read all of it first; sections E and F are the
work list. The director's decisions on each item are below: where the audit offers a choice, this
page decides it.

## Fixes, in this order

1. **Plant scripts never write the player's velocity.** `src/systems/plants/borrowedLadder.js`
   (about :291) and `farePool.js` (about :332) set `player.vel` directly. Delete both shoves; keep
   their toasts and whatever else they do. Then search every file under `src/systems/plants/` and
   the rest of `src/systems/` for direct writes to the player ship's `vel`, `angVel`, `heading` or
   position outside the flight controller and the physics membrane; route each through the physics
   impulse queue with a visible source, or delete it. Add `scripts/check-player-motion-writers.mjs`
   (and an npm script `check:player-motion`) that fails when a new direct write appears, with an
   allow-list naming the legitimate owners.
2. **Delete the Bolus's legacy direct-velocity fallback** (`theBolus.js` about :329).
3. **Being hit never changes how the ship steers.** Remove the cruise-stumble yaw penalty
   (`cruise.js` about :241 into `propulsionCatalog.js`). Dropping out of cruise when hit stays, with
   its toast.
4. **No involuntary slow motion.** `flybyFocus.js` slows time when a hostile closes fast. Remove the
   time-scale lease entirely. If its camera hint is separate and gated, it may stay.
5. **Field-of-view changes go through the camera gate, and only for the player's own acts.** Add
   `fov` as a kind in the existing gate (`shakeAdmission.js`) and make `feel.js` post through it.
   Field-of-view punches from being hit, from kills, from collisions and from "moments" are removed.
   Boost keeps a gentle widening (the player pressed it), and a jump keeps its beat. One beat per
   250 ms window, the same rule the gate already has for hero beats.
6. **One assist at the berth.** The docking corridor's capture defers while the nav autopilot is
   flying the approach (`dockingCorridor.js`, `flightV3.js`).
7. **A hero maneuver leaves the nose to the player.** In `flightV3.js` (about :369) the maneuver
   keeps throttle and position but no longer overrides yaw, and its status chip stays up for the
   whole lease. Any raw input still ends it.
8. **The establishing zoom names itself and waits its turn.** `trailerStaging.js`: route the zoom
   through the gate as cause `establishing`; it never fires while a hostile is engaged; confirm its
   caption actually renders on the ordinary route and fix it if not.
9. **One arbiter for assists.** Build `src/core/flight/assistArbiter.js` as the audit's section F
   sketches: every steering assist (autopilot, orbit, corridor, pursuit slot, hero maneuver, drawn
   path) requests axes with a priority, a time-to-live and a label; one winner per axis per tick;
   losers park, they do not blend; the list of active assists feeds the flight-mode chip so an
   engaged assist is always named on screen; `settings.gameplay.assists.<source>` switches each
   off (add the toggles to the settings screen under one "Flight assists" group, default on).
   Move the existing assists in `flightV3.js` onto it without changing what each one does.
10. **The camera's request queue.** Extend the existing camera gate as section F describes so every
    zoom, focus and framing change from outside the camera owner is a request with a cause, a
    priority and a return path. Convert the writers the audit's section B lists. In a fight the
    camera only answers the player.

Leave alone: what the player's own input does, weapon recoil the player caused, rope and power
physics (they have visible sources), and the snapshot/pose code in `src/render/snapshotFence.js`.

## Prove

- Focused tests for each fix (write them where none exist): no direct player-velocity writers
  outside the allow-list; a hit does not change the yaw profile; no system changes time scale
  without player input; a kill plus a hit in one tick yields at most one camera beat and no
  field-of-view punch; corridor defers to autopilot; arbiter gives one winner per axis.
- `npm run check:sim`. Fixes 1–4 change what the simulation does, so the recorded flight may
  move: if it does, re-record the golden in the same commit and say which fix moved it; if a fix
  that should not touch the flight moves it, that is a bug in the fix.
- `node scripts/fleet/game-lock.mjs run -- npm run check:playable` at the end.
- In the receipt: per fix, what a player now gets, the test, and anything from the audit you chose
  not to do and why.

## Files

`src/systems/plants/*`, `src/systems/theBolus.js`, `src/systems/cruise.js`,
`src/data/propulsionCatalog.js`, `src/systems/flybyFocus.js`, `src/render/feel.js`,
`src/render/shakeAdmission.js`, `src/systems/dockingCorridor.js`, `src/systems/flightV3.js`,
`src/systems/heroManeuvers.js`, `src/systems/trailerStaging.js`, new
`src/core/flight/assistArbiter.js`, the settings screen and `src/save/profileSettings.js`, tests,
the new check script. (Paths are as the audit names them; find the real ones.) Other agents are
editing `src/systems/powerVerbs.js`, `src/save/profileSettings.js`, `src/ui/screens/settings.js`
and `src/render/renderer.js`: for any shared file use
`bash scripts/fleet/own-commit.sh begin <file>` before editing and
`bash scripts/fleet/own-commit.sh commit "<message>" <files>` so only your lines land.
