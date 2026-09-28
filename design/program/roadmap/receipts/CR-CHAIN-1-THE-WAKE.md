# CR-CHAIN-1 — braid 4/5: hitch on a working miner

**Built:** encounter 353, THE WAKE (`src/data/encounters/353-the-wake.js`).

## The braid

A loaded ore mule runs a real ~2200 WU haul leg to a marked drop pocket — slow (38 WU/s),
heavy, honest work. Two Reach shadows pace it off the line, passive and uncommitted. The
braid is the player's hitch: latch a line onto the working hull (ordinary tow contract —
dynamic target, COM attachment, the rope drags you down its real route) and the moment
you're on the wake the shadows spring: "That is not ballast on the line."

Never hitch and the leg runs quiet — the tail peels off unfought and nobody knows it was
there (`quiet_leg`). Hitch or open fire and the tail commits onto you and the mule.

## How it composes existing systems

- **Hitch detection**: the runtime polls the ordinary attachment table
  (`state.combat.attachments.byId`, `ownerId=player`, `targetId=mule`, `state=active`) —
  no new verb, no synthetic event.
- **The shadows**: held `passive`/`holdPosition` until the spring; on commit they drop
  cover, take targets (the hitcher if you're on the line), and launch an intercept.
- **The drop pocket**: a real `spawnProp` beacon at the leg's end — the route is a place;
  the mule reaching it resolves `made_leg`.
- **Resolutions**: `wake_cleared` (rep + grant), `wake_down`, `made_leg`, `quiet_leg`,
  `press_over` — all release the cast unstamped.

## Validation

`test/cr-chain-1-the-wake.test.mjs` — 5/5 green:

- Shape registered (`minor`/`combat`, convoy × lane zones × mule_trader).
- Materialization: mule loaded and moving down its leg, shadows passive off the line,
  drop marker at the far end.
- The hitch spring: an active player→mule attachment flips the shadows hostile with
  intercept velocities; without it they hold through the deadline.
- `wake_cleared` pays rep + grant; `quiet_leg` resolves without a shot.
