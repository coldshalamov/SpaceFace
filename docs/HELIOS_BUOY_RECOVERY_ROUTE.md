# Helios buoy recovery: find, hold, return

## Player route

The Pelican's three existing tickets send the player to progressively heavier
working hardware: 44-C beside the first lane pin (40 mass), the drifting claim-rim
buoy (65), and the outer-yard approach light (90). The bodies, positions, drift,
models and settlement rules already exist in `starterWorkday.js` and the canonical
mission owners. This increment connects their physical phases to navigation.

Before pickup, the mission arrow names and follows the exact admitted original
buoy. While the player's live winch line holds that body, the arrow changes to the
Helios receiving berth and says to keep the line attached. Dropping or losing the
line returns the arrow to the moving buoy on the existing navigation refresh
cadence (0.75 seconds; latch events also request refresh). The player can see what
to approach now rather than being directed home before recovering anything.

The correction is needed because ordinary physical mission navigation kept the
destination's `stationId` alongside the target position. The HUD resolves a station
before a target position, so the original authored buoy's position lost to Helios.
The generic instruction also called this visible lane light a slag core. This
scoped reader removes that contradiction without changing ordinary physical jobs.

## Ownership and truthful failure states

- `src/missions/starterWorkday.js`: presentation-only `starterBuoyRouteFocus` reads
  existing admitted body leases and the live tether/attachment owners.
- `src/systems/missions.js`: a small early waypoint hook composes that readout.
- No new entity, mission, reward, saved flag, model, line constraint or custody
  writer. The existing `isOriginalStarterBuoyTow` eligibility function is unchanged.
- A copied marker, recycled ID/generation, conflicting sector or wrong durable
  identity cannot inherit the buoy label. Restored bodies must be admitted through
  the existing mission owner before receiving a target marker.
- The receiving leg requires the current tether mirror and an active attachment
  with matching owner, target and occupant generations. An old mission
  `latchedTargetId` is not custody. A broken or foreign line is not custody.
- Hull changes do not hide the job's real body or grant eligibility: the route
  explicitly asks for a Pelican with Heavy-Duty Winch. The existing completion
  owner still decides whether any recovery qualifies.
- Missing bodies produce a search explanation, not a false delivery. Leaving
  Helios produces sector guidance without a stale position. Terminal missions
  retain the waypoint owner's normal null result.

## Verification and limits

The 15-case `test/starter-buoy-route.test.mjs` executes the actual mission waypoint
method and actual HUD station-priority consumer for all three tickets. It covers
motion, latch/drop/reacquire, restored admission, missing/foreign/recycled bodies,
wrong attachment endpoints, broken lines, hull/fit changes, sector departure,
terminal missions, malformed contracts and ordinary-contract exclusion.

98/98 combined Helios tests pass: the new route plus iron routes, Kessler and board
composition, all Wasp writs, receiving aftermath and production worker-wire readers.
An additional producer-to-reader case imports the actual `createAttachmentService`
from `src/combat/attachments.js` and actual `tetherGameplay._mirror` from
`src/systems/tetherGameplay.js`. The service creates the standard line with its
active state and endpoint generation stamps; the mirror publishes that attachment
ID, and the route changes to receiving. A real service cut breaks the record and
returns the route to recovery even before the mirror clears. Only the physics
joint port is stubbed, so this is not a native physics solve or control-input proof.
Both changed source files pass syntax checks. Pre-edit source blobs exactly matched
PR724 head `bfbbf3c51e73434804bf9badacd4e58432631659`; inspected upstream
`d95d9187848f58f82c4b0f89d8493ab632ebeb59` retains the same physical mission owner.

These are executable component-route checks. A rendered normal-input approach,
winch, return, Save/Continue and settlement trip is not established by them. No
visual quality, performance, release acceptance or whole-game completion claim is
made. The earlier receiving scene and the canonical payout remain separate outcomes.
