# Racing and chase flight

SpaceFace still has one flight simulation. Racing is an alternate camera and input presentation,
with authored gate contracts driven by the existing mission owner.

## Get behind the ship

Press **backslash (`\`)** during unobstructed flight to switch overhead/chase. This does not replace
V (cruise), C (scan), R (detonate), or the flight keys. Repeated keydown, text entry, modifiers and
modal screens do not toggle the camera. On touch, use the **Overhead / Chase** button in the flight
instrument. Settings → Gameplay also offers **Overhead**, **Racing**, and **Auto**; Auto follows any
active race's driving section (not its approach or station handoff). Distance, height and look-ahead
remain adjustable there.

The camera eases around the hull into a close stern view, follows the presented ship rather than
the overhead camera's threat/velocity-biased focus, and retains the existing solid-clearance solver.
It does not add FOV breathing. Reduced motion removes speed-dependent look-ahead and bank lean.
Photo mode and the death camera retain their own authority.

Keyboard flight remains the existing flight model. In chase view the mobile stick becomes a
vehicle control: up accelerates, horizontal movement steers, down brakes. Boost remains available
on the forward stick; braking cannot engage boost. Changing views clears the previous touch
steering ownership rather than reusing a stale world-space heading.

A mission can temporarily require chase view without changing the saved preference. Optional
`params.steerLockPhases` scopes that requirement to named `mission.phase` / `params.phase` values;
without that list, `steerLock: 'racing'` lasts for the active contract. Leaving the section or ending
the mission returns the preferred view. All five existing authored contracts require chase view;
practice follows the player's setting and remains freely switchable.

## Three courses, five contracts

Open **Circuits** from the main menu or the flight instrument. The board shows actual route maps,
lengths, lap counts, summaries and clean local best times.

| Course | Existing terrain | Contracts |
|---|---|---|
| Textile Belt | Helios starter field and outer metallic field | Textile qualifying; Vesper's mark |
| Tally Circuit | Tethys queue, scan gates and return toward the split station | Burned canopy; Pace light |
| Veil Wash | Radiation pocket and surrounding named landmarks | Veil ribbon, three laps |

Each course also has practice. The finish is the start aperture approached on an aligned return
straight, not an arbitrary last buoy. The route's closing leg contributes to its length and clock.
The yellow pace beacon in Pace light is a scripted guide, **not a simulated AI opponent**. Its
visible motion and drafting impulse use the same loop sampler.

### Missions that borrow the camera

**Burned canopy** and **Pace light** now have three playable sections, rather than paying at the
finish line:

1. **Approach:** fly to the marked grid in your preferred view. Stop within 70 wu, at 8 wu/s or
   slower, facing the first gate (within about 37 degrees). Release the Massline. An in-sector
   campaign launch does not relocate your ship; a temporary launch starts behind the grid.
2. **Course:** the grid countdown borrows chase view, then starts the clock at green. Burned canopy
   requires the ordered lap. Pace light additionally requires **2 seconds total in the beacon's
   wake** before the finish. The HUD shows collected wake time; separate valid intervals add up.
3. **Handoff:** the finish freezes the course time and returns your preferred view. Follow mission
   navigation and dock at the marked Tethys station to receive payment. The mission remains active
   until then; docking elsewhere or abandoning/jumping forfeits payment.

Pace light is explicitly a coaching beacon, not convoy AI. It travels at 260 wu/s. Drafting requires
being 18–150 wu behind it, within 45 wu laterally, facing and moving along its heading, with at least
35% of its speed. A stationary ship, an oncoming ship or merely pointing at the beacon cannot earn
wake credit. Its push is fixed-step, capped at 40 wu/s², and uses the beacon's direction. Recovery
clears collected wake time. Finish without the required wake and the contract fails without a record
or payout. These two contracts use a new timing revision so old stopwatch times do not compete.

The camera and encounter lease apply only to countdown/course. The phase persists in campaign saves;
loading resumes the saved section, not a second countdown or payout. Existing non-section saves keep
their original behavior. Photo and death camera authority remain unchanged.

## Starting, scoring, recovering

The grid holds movement and boost until the countdown expires, including draw-flight and
assistance paths. Fly through each vertical aperture in order and in its forward direction.
Scoring uses the trajectory's intersection with the gate plane, not whether the next simulation
sample happens to lie inside a sphere. Several correctly ordered gates may be crossed during one
tick; fractional crossing times are retained. Crossing before green or through a later gate cannot
advance the required checkpoint.

The flight instrument shows lap, next gate, speed, distance, course shape and elapsed time. Its
reference delta is distance-weighted against the posted reference pace, not a replay ghost or an
empirically calibrated opponent. Off-course is distance from the current segment, not distance
from a far-away next gate. Burn-ring assistance requires an ordered crossing and can fire once
per lap. The shared mission receipt announces the finish; reopening Circuits shows the last result
and individual lap times. Its **Retry in this flight** action reuses the current ship after completion;
undock in the same sector first. Other contracts remain selectable after a failed/abandoned run.

**Recover** returns behind the last cleared gate, preserves the clock and marks the attempt as a
recovery run. It is unavailable during approach/handoff and cannot jump most of the next leg or set a
clean best. **Leave run**, docking (except the correct section handoff),
jumping, death, a missing player or entering the wrong sector releases the authored race through
the existing mission failure path. Procedural board races keep their previous scoring behavior.

Clean local records are keyed by course revision, contract and lap count in
`spaceface.raceRecords.v2`. Old mixed-course v1 times are not treated as comparable. Records are
local, not verified leaderboards, and currently are not separated by ship/loadout. Storage failure
does not prevent playing; it means the best may not persist.

## Campaign-save safety

Launching a fresh circuit starts a **temporary in-memory flight**. It does not open a campaign slot,
and manual, direct, interval, mission-triggered and exit autosaves are suppressed for its entire
lifetime, including after the race ends. Local racing records remain separate. Loading a campaign
or starting a normal new game removes the temporary-flight guard.

Starting a fresh circuit while already flying replaces unsaved in-memory progress; the launch
confirmation says to save that flight first. Starting a contract while already in its sector
instead uses the live campaign and normal save semantics, without secretly charting/teleporting to
another sector. Another active race, docking or a pending jump prevents arming a second contract.

## Continuing development

The complementary build packets, implementation owners and acceptance checks are in
[`RACING_FLIGHT_PROGRAM.md`](../design/program/RACING_FLIGHT_PROGRAM.md). They separate the
shipped mechanics from larger work such as authored safe corridors, actual rival ships, ghosts,
the broader five-story mission program and ship-class competitive records.
