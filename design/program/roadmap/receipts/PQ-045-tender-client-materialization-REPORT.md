# PQ-045.tender-client-materialization — receipt

```yaml
unit: PQ-045.tender-client-materialization
parent: PQ-045
state: done
entryBaseline: check:baseline 11/11 green (measured before any edit)
exitBaseline: check:baseline 11/11 green
```

## What was wrong

The Pitborn yard tender flew a two-mark service call-out whose second mark named
`activity:disabled-hull`. Nothing in the world was that hull. It was the one route reference in the
Ceres cast that claimed a *physical service client* while resolving to nothing, so the tender flew to
a bare coordinate and "serviced" empty space.

There were three independent reasons it could not have worked, and fixing only one would have looked
like progress without producing any:

1. **No object.** No entity anywhere carried the disabled-hull identity.
2. **The route reference was destroyed in transit.** `factionPresence.ceresTenderContext` projected
   the authored marks into a job route as `{id, label, pos}` — it dropped `targetRef` entirely, and
   omitted the canonical `speed`. `npcJobsRuntime` validates a route field-for-field against the
   authored mark, so the tender's route could never have matched a real-target relationship even if
   an object had existed.
3. **The tender was excluded from the movement selector.** `_ceresRealTargetWaypoint` toggles
   endpoints for miner and salvor two-point shuttles and returns `null` for everything else. The
   tender is a two-point shuttle (the job kernel's own `targetIndex()` groups miner/salvor/tender
   together), so during transit it selected no waypoint at all.

## What changed

**One object authority, one writer.** `src/data/sectorActivityPockets.js` gains a sixth logical
object slot, `ceres_refinery_disabled_hull`, in the refinery pocket, owned by `world` like the other
five. The tender's client mark now names it as `object:ceres_refinery_disabled_hull`.

**`src/systems/world.js`** materializes and binds it the same way the existing five are bound: by
*re-pointing* an ambient dressing prop the belt loop was already going to spawn (the `i = 0`
prospecting drone becomes a `place_dead_hulk` named "Disabled Refinery Client"). It does not add an
entity. The per-slot presentation choices were pulled out of a nested ternary into a small lookup
table so a third dead-hulk slot did not make that expression unreadable.

**`src/systems/factionPresence.js`** now projects the authored marks with `targetRef` intact and
supplies the canonical `speed` (`distance / route.durationS`), computed with the identical expression
`traffic.js` uses for the other Ceres cast routes so the float comparison is exact rather than close.
Both `assignJob` call sites go through one `ceresTenderJobSpec()` helper.

**`src/systems/npcJobsRuntime.js`** gains the sixth relationship tuple, plus two discriminators the
spec table needed in order to describe an actor that traffic does not own:

- `recordKind` — the tender is a `RECORD_KIND.NPC` durable world record, not a `CONVOY`. Previously
  the record kind was hard-coded in two places.
- `ownership` — `traffic_cast` hulls prove themselves with traffic's `ceresActivityCast` /
  `ceresActivityJobOwned` stamps; the tender proves itself with `durable` +
  `factionPresence.yardTender` and must *not* carry the traffic stamps. An unknown tag fails closed.

`_ceresRealTargetWaypoint` now includes `TENDER` in the two-point-shuttle toggle, mirroring the job
kernel.

**`scripts/lib/ceresFiveMinuteAcceptance.mjs`** adds the slot to the fixed object census (in pocket
order — the gate compares a human-review document against this exact ordering) and to the observer's
`slotToPocket` attribution map.

### The one deliberate judgment call

I renamed the authored reference from `activity:disabled-hull` to
`object:ceres_refinery_disabled_hull` rather than keeping the literal string.

The brief says to preserve the tender's *exact targetRef* through the job projection and through
save/Continue. I read that as a claim about the runtime path — which is exactly where it was being
lost — and not about the source constant, because keeping a constant unchanged preserves nothing
through a projection. The deciding evidence is
`test/ceres-activity-runtime-lifecycle.test.mjs:2332`, which pins the invariant *"`activity:*` remains
outside the admitted real-target language."* Admitting `activity:disabled-hull` as a real target would
have falsified a live invariant; renaming leaves it true for the seven remaining `activity:` marks,
which the brief explicitly protects. The `object:` prefix is also the existing convention for every
materialized object slot.

If that reading is wrong, the correction is a one-line change to the mark plus the matching spec
constant — the projection and lifecycle work is independent of which string is used.

## Verification

| Check | Result |
|---|---|
| `node --test` the four named suites | **72/72 pass** |
| `npm run check:pq020:ceres-topology` | **PASS** |
| `npm run check:baseline` | **11/11 green** (identical to the entry measurement) |
| adjacent suites: traffic-cast, visible-job-actions, npc-jobs-runtime-wiring, escort-formation, pq020 topology + proofs | **121/121 pass**, untouched |

Four tests were added to `test/ceres-activity-faction-tender.test.mjs`, covering the live object and
its binding, the steering, the save/Continue restore, and a hard sector round trip. Each was
**mutation-checked** rather than trusted:

- Removing `targetRef` from the projection turns 9 tests red.
- Removing `TENDER` from the waypoint selector turns 4 tests red.
- Desyncing the spec's `targetRef` from the authored mark turns 10 tests red.

That matters because the obvious version of this test — asserting the restored waypoint's `targetRef`
*string* — passes without any binding existing at all. The tests instead assert that
`_currentCeresRealTargetBinding` returns a binding whose `targetRef` **is the live entity object**.

The save/Continue test alone was also not sufficient: it restores the job envelope but leaves the
same tender and the same client alive in memory, so it proves the job-side restore rather than "a
restored ship is still servicing the same client." The added hard round trip
(`Ceres → sector_helios_prime → Ceres`) destroys and rebuilds **both** bodies — the tender comes back
as a generic shell re-stamped by factionPresence adoption, and the client is dressed fresh with a new
entity id — and then asserts exactly one live client and that the relationship rebinds to it,
unambiguous. That is the path where a dropped identity marker or a lingering previous prop would have
silently degraded the tender back to authored-coordinate motion.

### The work berth, and a correction

The first version of this authored a flat 56 WU standoff and claimed it cleared the casualty. That was
wrong on the arithmetic: the client hull is 42 WU and the **tender itself is 24**, not the ~10 I had
assumed, so at 56 the tender's own hull sat 10 WU inside the wreck. The claim was checked with
`standoff > client.radius`, which is exactly the assertion that lets that error through.

The berth is now `standoffKind: 'collision'`, which takes `max(standoffWU, actorR + targetR + 12)` from
the live radii — 78 WU here, a real 12 WU gap between hull surfaces. The other fixed standoffs are
hand-tuned against props where that would be wrong (the Cathedral root radius is 360 WU; the hauler
deliberately noses inside the cargo barge). Here both bodies are real hulls of similar size, and the
number now tracks the geometry instead of rotting silently if either is re-authored.

Correcting it surfaced a second defect the flat number had hidden: at 78 WU the tender's **spawn point
was inside its own berth**, so on every entry to Ceres its first action would have been reversing away
from the wreck — the controller behaving correctly in response to bad authoring. The client offset
moved from `(-58, -46)` to `(-65, -65)`, solved against three constraints at once: inside the immediate
band, more than a berth clear of the tender spawn, and off the spawn→authored-mark bearing by 0.54 rad
so that servicing the real casualty is a visibly different heading rather than an invisible refinement.
Verified end to end: the tender turns, closes, and holds at the berth.

### Cost declaration (required by the packet's performance budget)

**Zero.** No added entity, collider, draw call, material, save byte, RNG draw, or steady-tick scan.
Ceres stays at 129 entities / 107 colliders at seed 47, and the content-stream draw count stays at
495. This is why the pinned PQ-020 `structuralCostDigest` still holds and no PQ-020 file needed
touching — that digest counts every live Ceres entity, so an added prop would have forced a re-pin in
files outside this unit's write set. Re-pointing an existing prop, which is the pattern the other five
objects already use, avoided that entirely.

## What I did NOT prove

- **No human five-minute verdict, and no headed capture.** That evidence is reserved to
  `PQ-045.five-minute-h1`, which alone holds the `browser-gpu` and `validation-broker` leases. What is
  proven here is the *census contract* and the runtime relationship, not the felt experience.
- **The longest-zero-visible-activity metric has shifted and is unmeasured.** Adding the slot to the
  census makes `countsTowardCeresPocketVisibility` return true for it, so the refinery pocket now has
  one more visible object. That moves the number the human verdict reads. I did not re-measure it.
- **No live Browser/Electron run.** Everything above is headless. The rebuild-and-rebind path is
  proven through the real `world.enterSector` seam, but still in a headless simulation.
- **Long-horizon phase behavior is not proven.** The new tests set the job phase directly to reach the
  client leg. I did not run 18,000 ticks and observe the tender complete natural WORK cycles at its
  client.
- **The berth is geometrically correct but not artistically judged.** 12 WU of clearance between two
  hulls is derived and verified, not composed: nobody has looked at whether a tender parked there
  *reads* as welding a casualty rather than as loitering near one. That is a call for the human
  five-minute review, and it is cheap to retune — the clearance margin is one constant in the spec.

## Deliberately left out

- **The seven other `activity:*` marks are untouched.** They are abstract scan, throughline and
  perimeter choreography. Manufacturing objects for them was explicitly out of scope and would have
  been wrong. `test/ceres-active-pockets.test.mjs` now pins that rule directly — exactly seven marks
  keep the `activity:` prefix, none of them names a materialized slot, and no object slot is
  referenced through that namespace. The runtime depends on this convention but cannot check it
  itself, and it is precisely the convention whose violation created this unit's defect.
- **The tender's first mark, `station:station_ceres:service-berth`, stays authored.** It names a face
  of a station that already exists; it is not a missing entity, and admitting it would have widened
  the exact-tuple language for no product gain.
- **No generic `targetRef` interpreter.** The spec table is still an explicit list of exact
  relationships, now six instead of five.
- **No second movement writer.** Steering runs entirely through the existing `npcJobsRuntime`
  controller and its existing standoff block. The traffic ownership stamps were deliberately *not*
  applied to the tender: those markers are also read by `lawSecurity`, `aiPorts`, `traffic`'s release
  and capture scans, and the job-action VFX. Stamping them would have handed the hull to a second
  owner rather than describing a target relationship. `traffic.js` already filters the tender slot out
  of its cast, which confirms the separation is intentional.

## Stale reference outside this unit's write set

`design/reference-sector/WAVE0_CERES_BASELINE.md:136` still describes the tender's mark as targeting
`activity:disabled-hull`. That line is now out of date. It is outside this unit's declared paths, so I
did not edit it; it needs a one-line correction by whoever owns that document.
