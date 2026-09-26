<!-- LIFETIME: RECEIPT -->
# PQ-143.00 — Sector identity table, made true on the route

```text
IMPLEMENTED (not done) — gaps named below belong to PQ-143.01 and a later crime pass.
```

## The report

```text
IMPLEMENTED  PQ-143.00 — Helios and Ceres now read as two different working places on six of
                 the eight identity columns, and Ceres's yard works again because civilians no
                 longer flee the policeman who was standing over it.

WHAT I FOUND     Ceres was not thin — it was frightened. A single police hull sits off the Ceres
                 refinery, and because the game files police on the "hostile" team so they can
                 arrest you, every working ship at that refinery treated the policeman as a pirate
                 and spent the entire time cowering instead of working. Arriving at Ceres you saw
                 one drifting ship and a lot of nothing.

WHAT I CHANGED   Working ships now decide who to run from by what a ship is allowed to shoot at,
                 not by which team it is filed under — so police standing over a yard no longer
                 empty it. Nothing was added to either sector: everything you now see at Ceres was
                 already authored and was being scared off.

WHAT YOU WILL FEEL   Ceres's front door is a working yard again: a hauler running cargo to the
                 refinery, a tender servicing a broken-down hull, loose cargo and a wreck lying
                 about, with a police ship watching. Helios's front door is a different job — a
                 salvager picking over dead ships beside a trade hub on a marked freight lane.
                 What you will NOT feel yet is a difference in pace, and neither place produces any
                 crime at all in thirty seconds; both are named below and neither is faked. From a
                 HUD-off chase-camera strip Helios is still thin at camera range — do not expect
                 the done-when (name the sector from 30 s with labels hidden) to be closed.

THE NUMBERS      bar | before | after | target
                 Ceres workers doing the authored job while a lawful hull stands off | fleeing | working | working
                 share of the Ceres day with hands on cargo | none (100% fleeing) | 48.3% | > 0
                 working ships doing their job at the Ceres refinery | 1 (cowering) | 2 (working) | > 1
                 identity columns that read differently across a 30 s watch (after the bench could see) | (not the before; first runs were blind) | 6 of 8 | >= 4
                 counted ships the physics actually simulated, Ceres | 100% | 100% | > 0
                 counted ships the physics actually simulated, Helios | 73.5% | 73.5% | > 0

THE FRAMES       No committed strip. `scripts/capture-sector-identity.mjs` writes gitignored
                 `.devshots/sector-identity/`. This tree has no capture and no blind review. The
                 packet's done-when is therefore still open. Helios is thin at camera range; a
                 reviewer can tell the places apart but may do so from the planet and the rock
                 colour, which the packet forbids as identity.

NEXT             PQ-143.01 — ordinary-life rhythm (the pace row this unit could not close), and
                 camera-legible ordinary life at Helios's door.
```

## Why this is not `done`

Two of the eight rows are honestly false, and the packet's own done-when is still open:

1. **The blind review did not happen.** The capture script exists; no strip is in git; no verbatim
   naming is recorded. Do not treat "the places measure differently in a 750 WU pocket" as that
   review. `PQ-143.01` owns making ordinary life readable at the shipping camera.
2. **`rhythm` reads the same in both places.** 22 phase changes/min at Helios against 16 at Ceres,
   work share 37.3% against 48.3%. The direction is right and the margin is not one a person feels.
   `PQ-143.01` owns the rhythm and this unit did not steal its work.
3. **`crime` reads the same in both places: zero.** Nothing criminal happens at either station's door
   in thirty seconds. This was NOT closed by spawning a pirate — §1.6 rejects "filling quiet with
   events", and `design/VISION.md` Part II is explicit that ordinary life is the point of the quiet
   phase. Recorded as false, not decorated.

---

# Engineering appendix

## The bar, and the seed

`scripts/lib/bench/scenarios/world.sector_identity.mjs`, scenario id `world.sector_identity`, seed
**4242**, on the real path: `createAuthoritativeRuntime({ profileId: 'production', nodeSafeOnly: true })`
with the live `rapier-dynamic` authority and the shipping `world` / `traffic` / `npcJobsRuntime` /
`lawSecurity` / `regionalEcology` / `sectorSim` systems. The bench causes nothing: it enters a sector,
parks at that sector's own pocket station, waits 24 s, and watches 30 s. Verified deterministic — two
runs of seed 4242 produce byte-identical signatures (`test/sector-identity.test.mjs`).

| Column | Helios | Ceres | Differs |
|---|---|---|---|
| verb | `salvor` 1.67, `patrol` 1.00, `miner` 0.10 | `hauler` 1.00, `tender` 1.00 | **yes** — zero overlap |
| rhythm | 22 changes/min, work share 37.3% | 16 changes/min, work share 48.3% | no |
| law | `patrol/faction_scn/job:patrol` (a beat route) | `ship/faction_scn/doctrine:official` (standing off) | **yes** — different enforcers |
| crime | 0 hostiles, 0 events | 0 hostiles, 0 events | no |
| ships | `ship_pelican` 2.67, `ship_bastion` 1.00, `ship_ironback` 0.10 | `ship_mule` 1.00, `ship_ironback` 1.00, `ship_hornet` 1.00 | **yes** — overlap 0.2 |
| structures | trade hub, lane beacons, derelicts, hulks, rock | refinery, cargo pod, disabled hull, rock | **yes** — overlap 0.125 |
| affordance | `dock_and_trade`, `strip_hulk`, `cut_rock` | `sell_ore`, `tow_or_service`, `cut_rock` | **yes** — overlap 0.2 |
| aftermath | `hulk` 6, `derelict` 2 | `hulk` 1, `spilled_cargo` 1 | **yes** — overlap 0.333 |

**6 of 8, target ≥ 4.**

## Surface-before-invent audit (§1.3 law 9)

Everything the table now reports at both sectors was **already authored and already running**. Not one
entity, job, station, prop or event was added by this unit. What existed and was connected:

| What already computed it | What it was already producing | What this unit did |
|---|---|---|
| `npcJobsRuntime` (wired job loop) | `salvor`/`patrol`/`miner` at Helios; `hauler`/`tender` at Ceres, with real `load`/`unload`/`work` phases | fixed the threat classifier that was suppressing the Ceres jobs |
| `traffic` | the ambient hull mix and the pocket-station cluster rule | read its own `_pocketStation` rule instead of inventing an anchor |
| Ceres activity authoring | `ceres_refinery_cargo_pod`, `ceres_refinery_disabled_hull`, the tender berth, the seam ore face | nothing — it was already there and being scared off |
| Helios lane authoring | `lane_helios_tethys` beacons + lane freighters | nothing — the bench simply could not see them |
| `world` | galactic-global placement, residency, `relocatePlayerInSector` | used the shipping relocation seam instead of writing `pos` |
| `src/ai/doctrine.js` | "a `lawful_wanted_only` hull does not engage an unwanted target" | consulted it from the job threat classifier, where it was missing |

## THE defect this unit fixed

`src/systems/npcJobsRuntime.js` — `eligibleActiveHostile()`.

The threat query that decides what a working civilian runs from asks the world for `team: 1`. Team 1
means "may engage the player". A law patrol is on team 1 **precisely so it can arrest you** — it
carries `doctrine: 'official'` and `roe: 'lawful_wanted_only'`, and `src/ai/doctrine.js:301` already
encodes what that means: such a hull does not engage an unwanted target. A hauler is never wanted, so
the police were never going to touch it. Before this change they scattered it anyway.

Measured on the default route, seed 4242, at the Ceres refinery: one SCN patrol (entity 119,
`faction_scn`, `lawful_wanted_only`) parked 240 WU off `station_ceres` and held the refinery's entire
authored workforce in `flee` for the whole observation window while firing **not one shot in
fifty-four seconds**. The tender that services the disabled hull and the hauler that runs the cargo
pod both cowered. Ceres's front door read as empty space with one drifting ship.

What the fix does **not** change: a civilian still flees real violence, because that runs on the
separate traffic-facing violence stamp (`interruptJob` → `_stampViolence` → `violenceUntilSimT`), not on this proximity
reflex. Only "a policeman is nearby" stops being a reason to abandon the job.

**Known limit, recorded not guessed:** a civilian that is itself wanted (a smuggler running
contraband) genuinely should fear a lawful patrol — but NPC traffic carries no heat today
(`isPlayerWanted` is player-only), so there is no wanted-NPC state to consult. When one exists the
lawful case becomes conditional on the fleeing hull's own standing rather than unconditional.

## Bench defects found and fixed (these are NOT the before)

The scenario module was inherited half-built from an interrupted run. It printed **a clean table of
zeros for both sectors on its first three runs** — which would have been reported as "the two sectors
are identical" when the world was rich the whole time. Five separate defects, each recorded because
each is a trap the next agent will hit:

1. **The census ring was in deep space.** The bench moved the player by writing `player.pos.x`.
   Entity positions are galactic-global and `world` keeps the playable-bounds fence, the residency
   focus and the membership test against them; a raw write leaves all of that pointing at the old
   place. Measured: a raw write to Helios Station put the player at **x = −2 499 679** on tick one, in
   a residency set that had loaded `station_orcus_shadow`. Fixed by using the shipping seam,
   `world.relocatePlayerInSector`.
2. **And then it stood ON the rock.** A station's position is the *centre of its collider*. Relocating
   there buried the hull inside the station and the solver resolved the zero-normal overlap the only
   way it could — the same −2 499 679, deterministically, then frozen. Fixed by parking at the
   station's own declared dock radius + the ~90 WU margin traffic itself uses.
3. **Foreign stations.** `live(state).filter(isStation)` is not the sector's stations: entering Helios
   leaves nineteen resident, six of them Ceres's and three of them `sector_nyx_march` **gates**. The
   anchor picked the right rock in both sectors only by accident of spawn order. Fixed by filtering on
   `data.sectorId` and excluding gates.
4. **Half of Helios was invisible.** Lane freighters spawn as `type: 'freighter'` with no
   `trafficRole` and no `jobId`; lane beacons as `type: 'beacon'`. Both matched neither the ship test
   nor the structure test, so five of twelve hulls and the entire marked freight lane counted as
   *nothing* — in the one sector that has a freight lane.
5. **Three ways the comparison could lie about identity**, all fixed and all pinned by
   `test/sector-identity.test.mjs`:
   - law/crime were read from `team` alone, filing the Ceres police hull under CRIME and leaving the
     law column empty — the bench would have reported "Ceres has a predator, Helios has a policeman"
     about two hulls doing the same lawful job;
   - the rhythm column compared a **sector-wide** bus tally against a **ring-scoped** occupancy — one
     column, two places, which is why it read SAME;
   - `dominant()` broke ties by name, so Ceres's dead three-way hull tie (one hornet, one ironback,
     one mule) would have let the bench announce "Helios is pelicans, Ceres is hornets" out of
     alphabetical order. A tie now means nothing dominates;
   - an **empty** column scored as "differs", turning a hole the bench could not see into identity.
     An empty side now only counts against a genuinely furnished one.

## Files changed / added

| File | Change |
|---|---|
| `src/systems/npcJobsRuntime.js` | **the owner fix** — `eligibleActiveHostile()` no longer treats a lawful-ROE hull as a predator |
| `scripts/lib/bench/scenarios/world.sector_identity.mjs` | inherited half-built; five measurement defects fixed (above), on-camera sub-census added |
| `design/SECTOR_IDENTITY.md` | **new** — the table, with a measured "today" column and a "true when" observable per row |
| `test/sector-identity.test.mjs` | **new** — pins the rule and the ≥ 4 of 8 bar; assertions quote the vision sentence |
| `scripts/capture-sector-identity.mjs` | **new** — two 30 s captures at the shipping camera, HUD hidden, paced on the sim clock |

## Checks

| Check | Result |
|---|---|
| `npm run check:baseline` (after) | **25/26 green.** The one miss is `check:47a:physical-branches` **timing out on wall budget** (152 292 ms vs 150 000 ms) while the determinism run competed for CPU — a contention signal, not an assertion. Re-run alone: **PASS**. |
| `npm run check:atlas-integrity` | **PASS** — atlas integrity accepted |
| `node --test test/sector-identity.test.mjs` | **PASS** — 11/11, including both real-runtime cases (bar 406 s, determinism 187 s) |
| `npm run check:sim` | **RED, and pre-existing.** 47-A authoritative hash reads `ecd131b4…`, expected `76116bb5…`. |

### The 47-A hash: causal record (`docs/COMMON_BUGS.md` §8)

**No golden was re-recorded and none should be on this unit's account.** The drift was proven not to
be mine: `src/systems/npcJobsRuntime.js` was temporarily restored to its `HEAD` content, `check:sim`
re-run, and the file restored. The base produces the **identical** actual hash `ecd131b4…`. The 47-A
envelope was therefore already red at `HEAD` before this unit's first edit, and this unit's change
does not perturb that tape at all — the hash is byte-identical with and without it. Flagged for
whoever owns the pre-existing red; it is not a PQ-143 finding.

## Shared-change requests

**None.** No seam in another lane's protected files was needed. `src/ui/**` and `styles/**` were
verified clean (`git status --short src/ui styles`) immediately before the capture ran, so the other
session's uncommitted frontend work was not photographed.

## Not finished, and why

- **`rhythm`** — the two places keep a similar beat. Belongs to `PQ-143.01`.
- **`crime`** — genuinely zero at both doors in 30 s. Deliberately not faked.
- **Helios is thin at camera range.** In the 144 WU ring the shipping camera can actually show, Helios
  offers one working pelican and the hub; its rocks, hulks, beacons and derelicts are all further out.
  Ceres shows six distinct things in the same ring. Helios's identity is true of the *place* and
  under-served to the *camera* — the honest gap between the 750 WU number and what a reviewer sees.

---

# Acceptance review 2026-09-12 — the blind review happened

**Verdict: NOT DONE.** The blind naming succeeded 2/2, and it succeeded for a reason the packet
forbids. This review also found the mechanical cause, which had not been named before: **at Ceres
almost nothing in the pocket is ever drawn.**

## What was run

`scripts/capture-sector-identity.mjs`, seed **4242**, real GPU, shipping chase camera, default
quality, HUD not photographed, thirty frames per sector paced on the **simulation** clock (Helios
1.00 wall seconds per sim second, Ceres 0.97 — normal speed, not slow motion). Six frames per sector
(0, 6, 12, 18, 24, 29) were copied into a set named by a coin-flip letter, the letter→sector map was
written to a file that was not opened until both verdicts were written, and the frames were then
read and named. Frames deleted afterwards.

**Two defects in the capture itself were fixed before it was trusted:**

1. **It was never on seed 4242.** Writing `state.meta.seed` at the title screen pins nothing —
   `resetRunState` throws that state away and builds a fresh one from `opts.seed`, else the wall
   clock. The pre-fix run asked for 4242 and the run adopted **737605143**; the manifest said so and
   nobody had read it. The capture now types the seed into the New Game screen's own "Universe seed"
   field, which is a real player control, and the manifest reads `seedUsed: 4242`.
2. **The pocket was not in the picture.** At the 144 WU default, standing at the station's own
   `hull + 40`, the Helios station sat ON the top edge of the frame and the whole content was a
   ringed planet and a galaxy — the reviewer could only have named the place from the sky. The
   capture now scrolls out to 340 WU through `camera:zoom`, the identical event the mouse wheel
   emits, so the station and its cluster are in the same frame. Still the shipping rig.

## The blind verdicts, verbatim, written before unmasking

> **Set A** — six frames, essentially identical. Four brown/tan rocks of different sizes drifting and
> an amber dust stream through the lower left. Deep dark sky. **No station, no ships, no lights, no
> work of any kind, and nothing man-made in frame.** No motion I can detect between frame 1 and frame
> 6. If I must name it: **the mining belt — Ceres** — and the only thing saying so is rock.
>
> **Set B** — a large ring-and-spine station with lit docking arms and yellow deck strips fills the
> upper middle, a ringed gas giant and a small moon behind it, a white hauler standing off below it
> with a lane line, orange cargo containers alongside the station's flank in the later frames, and a
> small cluster of yellow sparks at the dock. That is a port doing port work. **Helios.**

**Unmasked: A = `sector_ceres_belt`, B = `sector_helios_prime`. Both correct.**

## Why that is not the done-when

The done-when is *"a blind reviewer names the sector from a 30 s capture with labels hidden"*, and the
packet's own how-agents-get-this-wrong is *"identity by palette: a sector is recognised from
**activity** with labels hidden."*

- **Helios (B) is honestly named.** The station's silhouette is structure, and the hauler standing off
  with cargo containers at the dock is a job. That is identity by what the place is doing.
- **Ceres (A) is not.** It was named by **brown rock and the absence of everything else**. Not one of
  its working hulls is in any of the thirty frames. The measurement bench and the capture's own census
  say what should have been there: within 340 WU of where the player parked at Ceres sat **a station,
  four working ships (a Mule on `hauler`, an Ironback on `ceres_refinery_tender`, a Kestrel on
  `courier`), a cargo pod, two rocks and two fx** — ten things. **Two of them were drawn: the rocks.**

## THE DEFECT, measured

Not a framing problem and not a population problem. Probed directly on the live route at seed 4242,
54 s after the player is put into Ceres (24 s settle + the 30 s the capture watches), reading
`presentationAdmission` off every entity inside 340 WU:

| At Ceres, 340 WU ring | Distance | `presentationAdmission` |
|---|---|---|
| station 97 | 112 WU | **pending** |
| ship 541 | 63 WU | **pending** |
| ship 537 | 135 WU | **pending** |
| ship 519 | 273 WU | **pending** |
| ship 305 | 273 WU | **pending** |
| payload 298 (cargo pod) | 60 WU | **pending** |
| fx 198 / fx 292 | 80 / 113 WU | **pending** |
| asteroid 330 / asteroid 550 | 157 / 193 WU | `null` — no admission gate, **drawn** |

Every authored body at Ceres is still `pending` almost a minute after arrival, and the only things on
screen are the two rocks, which bypass the gate entirely. Helios does not have the problem because
Helios is the sector the run **starts** in; Ceres is reached through an in-flight
`world.enterSector`, and nothing materialized by that transition ever leaves `pending`.

So the 2026-09-05 note in this receipt — *"Helios is thin at camera range… both strips came back as
fields of rock that differed only by COLOUR"* — was reading a **rendering** failure as a content
failure. Ceres's ordinary life is authored, is running, is inside camera range, and is invisible.

## What was NOT done, and why

No fix. This is a presentation-admission defect and it is outside this unit's write set
(`src/data/` sector identity data and `src/systems/sectorSim.js`). The admission path
(`src/render/presentationAdmission.js`, `liveSceneCook.js`, `authoredAdmissionPolicy.js`,
`entityMeshVisibility.js`) is all carrying another lane's uncommitted work and was not touched.

**The exact remaining defect for PQ-143.00:** bodies materialized by an in-flight sector change stay
`presentationAdmission: 'pending'` indefinitely, so Ceres cannot be photographed at the shipping
camera at all, and its identity cannot be judged on activity until it can. Fix that and re-run
`scripts/capture-sector-identity.mjs` — the capture, the seed and the blind protocol are now in place
and will answer the done-when in one pass.

## Checks

`npm run check:baseline` **15/15 green**. `npm run check:atlas-integrity` **PASS**. No game code was
edited for this unit.

---

# Acceptance review 2026-09-25 — the blind review, re-run after the arrival fix

**Verdict: DONE.** A blind reviewer named both sectors from 30 s captures with labels hidden, and
this time both names came from what the place *is and is doing*, not from palette or the sky.

## What was run

`scripts/capture-sector-identity.mjs`, seed **4242** (manifest `seedUsed: 4242`), real GPU, shipping
chase camera at the capture's 340 WU wheel-out, HUD not photographed, thirty frames per sector paced
on the sim clock, `pageErrors: []`, first attempt. Frames 00/06/12/18/24/29 per sector were copied
into letter sets chosen by `crypto.randomInt(2)` by a different agent than the reviewer; the key was
written to a file that was not opened until the verdicts below were written to
`.devshots/blind-143/VERDICT.txt`. Frames deleted afterwards.

This closes the one defect the 2026-09-12 review named: bodies materialized by an in-flight sector
change no longer stay `presentationAdmission: 'pending'` (fixed and measured in
`SECTOR-ARRIVAL-ADMISSION-2026-09-12.md`). Ceres's refinery and its hauler are in every frame.

## The blind verdicts, verbatim, written before unmasking

> **Set A** — frame 0 is still arriving: several working hulls in open flight (a long liner, a
> hauler, a boxy cargo pod, a small craft), a tan rock, ringed gas giant + galaxy in the sky. Frames
> 12–29: parked over a big port — a circular docking ring with orange-striped bollards, a berth apron
> laid out as a grid of cargo containers, cyan tow/transfer lines running from the station arm to a
> ship in the berth, a second craft working the upper deck. A trade port doing freight work.
> **Helios Prime.**
>
> **Set B** — an ore refinery filling the upper left: silo towers, a copper processing drum wrapped
> in rails, conveyor chutes, crusher housing with cyan work beams that change frame to frame, a brown
> hauler docked under the gantry, dust drifting through. Industry that eats rock. **Ceres Belt.**

**Unmasked: A = `sector_helios_prime`, B = `sector_ceres_belt`. Both correct.** Capture census at
340 WU: Helios station + 3 ships (a patrol Bastion among them) + a wreck; Ceres station + 3 ships
(a courier Kestrel and a hauler Mule on their jobs) + 2 rocks + 2 fx.

## Still true, and owned elsewhere

`rhythm` and `crime` remain the two columns that read the same (6 of 8 differ, bar ≥ 4); rhythm is
`PQ-143.01`'s and crime is deliberately not faked (see the 2026-09-05 section). Neither is this
unit's done-when.
