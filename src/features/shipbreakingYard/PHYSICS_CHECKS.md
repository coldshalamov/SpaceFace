# Shipbreaking yard: native physics checks

These checks use the existing Rapier dynamic body owner, combat attachments and damage,
flight controls, and economy. They are focused integration evidence, not a whole-game,
browser performance, rendering, or visual-quality verdict. No shared physics files were changed.

## Authored bodies and contact shape

All 16 yard modules are original, persistent dynamic payload bodies. Their stable identity is
`shipbreaking:<job id>:<module id>`; numeric entity IDs and occupant generations are runtime
bindings and are not delivery identities. Buying an offered lot retains its already visible bodies.

The seven existing GLB assets use the repository's measured model census. Their collision skin
is recentered and scaled by the same longest-axis fit as the packaged-prop renderer. The adapter
uses an existing census-approved compact hull for the engine, weapon spar and pressure tank.
The cockpit, cargo cassette, flywheel and survey gimbal retain their measured primitive compound.
No visual mesh is read by simulation, and no generic ball or capsule substitutes for these known assets.

| Asset / module family | Native colliders per body | Example fit radius | Measured outer contact bound |
| --- | ---: | ---: | ---: |
| Cockpit / command frame | 22 | 11 WU | 9.466356 WU |
| Engine section / drive | 1 | 8 WU | 8.724874 WU |
| Cargo module / cassette | 24 | 7 WU | 8.566425 WU |
| Cargo module / large cassette | 24 | 9 WU | 11.013975 WU |
| Weapon spar / saddle | 1 | 7 WU | 7.132489 WU |
| Breakaway SP07 / flywheel | 20 | 7 WU | 7.153489 WU |
| Pressure tank / bottle | 1 | 7 WU | 7.889291 WU |
| Corvette turret / survey gimbal | 17 | 7 WU | 7.378952 WU |

All three assemblies together use 183 native colliders and 15 real combat-owned clamps.
Each compound is below the existing 32-primitive bound. Delivery requires the maximum of the
ordinary hull envelope and the authored proxy's outer radius to fit inside the receiver. It also
requires speed at most 7 WU/s, spin at most 0.8 rad/s, no structural connection, a live native
MassLine belonging to the player, and the same original identity/generation.

## Quiet stability

Two native simulations ran for 180 seconds each (10,800 fixed 1/60-second steps per run),
with all three offered assemblies present. Seeds 1 and 2 cover both mirrored geometric variants
of every layout. The pilot remained clear of the assemblies; no forces or pose edits were injected.

| Seed | Lark / Bellwether / Vesper variants | Surviving originals | Admitted active clamps | Maximum displacement | Maximum speed / spin | Hull lost |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 4 / 4 / 3 | 16 | 15 | 0 WU | 0 / 0 | 0 |
| 2 | 3 / 1 / 0 | 16 | 15 | 0 WU | 0 / 0 | 0 |

The assertions allowed less than 0.01 WU drift and less than 0.01 WU/s motion; measured values
were zero. There is no artificial initial preload or release kick. A pilot's real MassLine force
loads the structure; severing a clamp preserves existing linear and angular motion.

## Contact consequences

A released Lark engine was driven into an admitted fixed asteroid using the public physics
impulse membrane in an isolated contact fixture. The native owner emitted real impact receipts
(first contact impulse 778.255273, followed by a bounded 2600 impulse). The yard's contact adapter
routed the consequence through the existing combat damage owner. The same original engine's
hull fell from 89 to 86.026842 and its condition/value updated. Contact deduplication limits repeat
scrape damage; no replacement salvage body or secondary reward was created.

## Actual pilot-to-receiver traversal

The full route fixture registers `ships`, `economy`, `flightV3`, `physics`, `combat`,
`tetherGameplay` and `shipbreakingYard`, then uses `sim.step(1 / 60)`. The only fixture pose
setup is the player's initial position and heading, before native admission. The yard itself
spawns its original assemblies at the authored offsets.

For seed 1, the Lark engine begins at `(470, 500)` and the receiver is at `(340, 600)`.
The pilot starts 48 WU ahead along that straight towing direction. A normal precise cursor
aim plus `actions.tetherFire` latches the engine through `tetherGameplay` and creates
`tether_standard`. The yard releases its real engine clamp. From that point, the fixture
changes only the existing `moveZ`, `turnIntent`, `brake` and aim inputs. `flightV3` produces
the player's ordinary propulsion commands; the native cable supplies every force on the engine.
There are no queued fixture impulses, part pose edits, velocity assignments, automatic part
movement, or teleports during the journey.

The pilot uses a modest 9 WU/s approach, then a 4 WU/s target once the engine is within 70 WU.
The receiver accepts the original as soon as its actual envelope and motion satisfy the gate.

| Measurement | Native result |
| --- | --- |
| Original entity ID | `3` |
| Durable original identity | `shipbreaking:shipbreaking:1:1:engine` |
| Traversal after release | 950 ticks / 15.833333 simulated seconds |
| Original engine displacement | 134.797802 WU |
| Engine position at acceptance | `(363.209503, 582.257141)` |
| Center distance from scale | 29.214553 WU |
| Authored outer contact bound | 8.724874 WU |
| Combined receiver footprint | 37.939427 WU, inside the 38 WU scale |
| Speed / spin at acceptance | 5.246390 WU/s / −0.189316 rad/s |
| Maximum engine speed on route | 9.394123 WU/s |
| Maximum player-to-engine separation | 50.231310 WU |
| Engine hull before / after journey | 89 / 89 |
| Paid amount | 231 credits |
| Receipt | `shipbreaking:1:1:engine:delivery` |

The delivery retired that exact original, retained its durable receipt, and refused a second
handover. This proves a complete reachable native towing route with ordinary player controls;
it does not depend on placing the salvage directly at the receiver to test its gate.

## Ordinary Ceres placement and dormant rocks

The placement check materializes the actual Ceres sector through `world.enterSector`, with
`asteroidSites` and `asteroidFormations` registered. It uses the real refinery at sector-local
`(-1100, 620)` and its 72.972591 WU authored hull envelope. It does not supply a synthetic
station, override the yard anchor, or move existing rocks out of the way.

The audit exposed two real placement hazards and the feature now excludes both: an apron
could overlap the 740 WU reservation around Second Measure while clearing its smaller live
collision shards; another candidate could clear live asteroid entities while intersecting
dormant rocks. Placement reads the complete canonical `forEachFieldRock` view and the actual
asteroid collider radii, plus authored world-site reservations. These are read-only queries;
the existing world owner still controls rock promotion and site materialization.

Seeds **1–10, 47 and 999** all select the fifth deterministic candidate, angle 2.4 radians.
All three offered assemblies and their receiving scale fit safely inside Ceres' 4200 WU sector
radius. The measured clearances include each module's entire authored contact envelope.

| Measurement across the 12 actual worlds | Result |
| --- | --- |
| Chosen anchor, sector-local | `(-1610.993634, 1088.077470)` |
| Receiving scale, sector-local | `(-1770.993634, 1188.077470)` |
| Originals present in every world | 16 |
| Complete rock / station / wreck obstacle records checked per world | 556 |
| Smallest original-to-obstacle envelope gap | 183.907639 WU |
| Scale-to-obstacle envelope gap | 473.327751 WU |
| Smallest original-to-world-site reservation gap | 119.336830 WU |
| Scale-to-world-site reservation gap | 558.078212 WU |
| Farthest whole module from the sector origin | 1977.677054 WU |
| Farthest scale edge from the sector origin | 2170.591505 WU |

Two further native runs, seeds 1 and 47, place the pilot initially at local `(-1850, 1188)`
and let an ordinary simulation step discover the yard on approach. There is no direct
`discover` call or supplied anchor. Both runs admit all 16 originals and 15 real clamps.
After 120 fixed steps, maximum pose drift is 0.000047900 WU from global-coordinate native
admission, and no original loses hull. Full dormant-rock clearance remains positive after
ordinary world updates and site residency changes.

## Save boundaries and delivery identity

The focused tests cover serialization during the real structural-cut callback and during the
economy's credit callback, when a paid original may still exist in generic persistence.
Restoration retains a cut's terminal state and retires exact-provenance paid remnants. It cannot
reweld the assembly, mint a second original, charge a second claim fee, or pay a delivery twice.
Pooled numeric-ID substitutes are rejected by generation plus durable provenance checks.

A further regression calls the registered world's real `enterSector('sector_helios_prime')`
and saves inside every one of the 15 native `tether:broken` callbacks used to shelve the yard.
Those lifecycle cuts preserve all semantic connections and attached modules in every snapshot;
they do not count as player separations. Cold restoration re-admits all 16 original identities
and 15 fittings, preserves the paid claim, and does not charge or pay during departure. A second
pass releases the engine before leaving: that separation remains released and only the other
14 fittings return. The separate deliberate-cut callback test also preserves the player's
permanent separation.

The actual generic entity serializer/restorer and combat serializer/restorer also run together
in the partial-recovery test. The surviving original player tow keeps its saved attachment ID;
13 remaining structural clamps plus that player line survive 150 repeated hydration calls
without duplicate attachment records or extra bodies. All 15 remaining originals have unique
durable identities. Native endpoint admission requires the original occupant generation on
both ends of each line. An original removed synchronously inside the core spawn callback is
recorded as lost rather than treated as a retryable spawn request.

Every yard body carries the existing `physicalCustodyOnly` flag. Its generic loot, salvage
pool and authored salvage pool are empty. The ordinary mining owner refuses to collect or
magnetize these custody bodies; generic venting requires a wreck, while yard modules are
payloads. Existing cargo-haul selection also rejects mission-pinned bodies. The feature's
condition-adjusted handover receipt is therefore the economic path for these originals.

Run the focused suite from the repository root:

```sh
node --test --test-isolation=none test/pro-experiences-shipbreakingYard.test.mjs
```

The test composition explicitly registers the real owners. It does not replace native physics
with mocks, and no render adapter is allowed to mutate the simulation.
