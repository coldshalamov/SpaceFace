# Racing and chase flight

SpaceFace still has one flight simulation. Racing is an alternate camera and input presentation,
with authored gate contracts driven by the existing mission owner.

## Get behind the ship

Press **backslash (`\`)** during unobstructed flight to switch overhead/chase. This does not replace
V (cruise), C (scan), R (detonate), or the flight keys. Repeated keydown, text entry, modifiers and
modal screens do not toggle the camera. On touch, use the **Overhead / Chase** button in the flight
instrument. Settings → Gameplay also offers **Overhead**, **Racing**, and **Auto**; Auto follows any
active race. Distance, height and look-ahead remain adjustable there.

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
and individual lap times.

**Recover** returns behind the last cleared gate, preserves the clock and marks the attempt as a
recovery run. It cannot jump most of the next leg or set a clean best. **Leave run**, docking,
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
phase-specific story missions and ship-class competitive records.
