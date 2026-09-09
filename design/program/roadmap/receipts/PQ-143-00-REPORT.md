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
