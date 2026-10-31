# Opening experience integration — 2026-10-31

Base: `31a011002036e625c971d315f8da08a7a32687ee`. This candidate reconciles the
previously preserved Helios and Training increments onto current source. It is
not a replacement tree and does not include the separate older campaign overlay.

## Player outcomes

- At Helios, Kessler offers the actual next starter ticket and acknowledges only
  settled work. Active jobs, hull changes and missing equipment remain truthful.
- Hitch work follows available Helios iron, including dormant field records.
- Wasp work follows Nim Gatecut, Joss Wire and Vex Tollcut rather than the station anchor,
  including its durable restored target identity. Existing ram/payout rules stay.
- Each genuine authored buoy delivery can trigger existing receiving machinery within
  the receipt's original time window. A queued but unseen scene can now retry
  after sector exit; a scene that fired is not duplicated. This was a reproduced
  integration defect, fixed by recording presentation only when the seam fires.
- Explicit Swarm Training offers actual fitted primary fire or physical debris,
  respects live bindings and optional release, and announces the held pack only
  on real admission, using its actual position. Ordinary Swarm remains immediate
  horde. Fortify's rerouted source-gate identity is preserved.
- Authored opening banks use current rating eligibility and stable slot identity;
  current collider-based admission remains authoritative.

## Preservation

Current mission/bar changes, native radii, optic spacing, brood/combat, worker
registries, save/quit, station loading and renderer code are retained. `index.html`
retains all current hints and adds only the newly required eager `verbSpeech.js` hint; obsolete preload hints are not restored.
All 779 existing npm scripts and non-script package fields remain unchanged;
eight focused test entry points are added. No models, assets, save schema,
credentials, CI workflows, deployment or new reward owner are changed.

## Initial verification (historical checkpoint)

154 focused tests pass together: 76 Helios, 69 Swarm/arena and 9 mode-boundary.
The new queued-scene regression failed before its fix. Native production domain
differ → structured clone → facade tests retain receipt provenance and next-ticket
inputs, and actual bridge tests retain receiving/admission/voice payloads.
Six real Node imports pass without global shims: missions, survivalWave,
stationSideEventDirector, barContacts, simReadModel and simEventBridge.

A historical arena test assumed its first seed filled every target slot. The
untouched current baseline also admits 17 then refills to 18 under native collision
admission. Its replacement checks retained survivor identity/position and the
actual tier cap instead of pinning obsolete admission count. Runtime was not
changed to satisfy that test.

These are source/behavior and worker-wire checks. This sparse source materialization
is not a full application build. Rendered Adventure/Training play, full input-driven
work/settlement/Continue, performance, complete baseline suite and CI were unrun at this initial checkpoint. Later CI results are recorded below.
Do not infer opening or whole-game acceptance from the focused test count.

## Next validation

Use the normal menu → Adventure → Helios → Bar → Kessler → Accept + Track route,
complete each starter job with ordinary controls, inspect earned receiving activity
and Continue, then compare ordinary immediate-horde Swarm with explicit Training.
Preserve all upstream open acceptance gates and existing lane owners.

## CI follow-up

The first PR run caught one introduced eager-source preload omission:
`./src/onboarding/verbSpeech.js`. The follow-up adds that single sorted entry,
preserving all 1,508 existing generated hints and hand-maintained hints.
Retail boot smoke passed on the first commit. Mobile browser jobs stopped in
packaging because their sparse checkout omits the existing Ruckus asset directory;
the same failure was reproduced in earlier PR runs with identical relevant
workflow/packaging/assets. The minimal workflow correction is pending and is not
part of this source fix. Other repository-wide check failures remain separately
under investigation; no all-CI-green claim is made.

## Retained Io transmitter lifecycle repair

Broad CI exposed an existing H4 cleanup/reuse conflict: terminal encounter cleanup
put a TTL on its original buoy, while readmission correctly refused expiring
objects. The original fully materialized suite failed four reuse cases on the
unchanged base (21/25), including native physics.

The H4 terminal hook now asks the canonical director to release only the exact
surviving original from prop cleanup custody. It does not erase authored TTLs,
resurrect bodies, move the buoy, weaken reuse eligibility or invent a replacement.
Cleanup also refuses an explicitly foreign encounter owner; untagged legacy prop
cleanup and normal matching props retain their existing behavior.

The unchanged original suite passes 25/25. Twelve additional ownership, expiry and
idempotency cases yield 37/37. Native verification retains the same physics body
handle and two entities while approaching with thrust/brake. All 191 focused
opening plus retained-buoy tests pass together after source freeze. This is a real
native component route, not a rendered whole-game or full Save/Continue claim.

Owners: `src/systems/e1EncounterRuntime.js`, `src/systems/encounterDirector.js`;
coverage: `test/io-love-letter-buoy-service.test.mjs`. No assets or workflows changed.

## Bar readiness probe route correction

The first-job UI review found the Coalition Bar probe directly pushed the station
screen before its demand-loaded registration. Its pinned base and PR versions
shared this defect; the timeout occurred before reaching Bar or Kessler. The probe
now emits the existing committed-dock notification before setting its readiness
fixture, allowing normal UI registration and dock listeners to run. All original
assertions and wait budgets remain. This is a fixture-driven UI integration check,
not evidence of physical docking through player controls.

Syntax and executable fixture-order checks pass. A local live attempt could not
create a browser page; no screenshot or local live-pass claim is made. Existing CI
must establish the corrected route. Separately, the handoff probe's timeout
snapshot contained an enabled visible Accept button, while its trace recorded
long renderer/GPU stalls. No control removal or Kessler-related cause was shown;
that route and performance remain unproven rather than being patched speculatively.

## Service readiness preserves the existing hardship contract

The zero-credit refuel failure was a stale test assertion, not a broken service:
FB-101 already permits a bounded "Refuel on the Note" reserve and files its price
as debt. UI quotes, economy execution and timed yard delivery agree. No player
behavior, price, reward, UI helper or economy source was changed to satisfy CI.

The readiness check now pins the action label, bounded amount, zero upfront cost,
disclosed debt, partial/exact/sufficient funds, full-tank no-op and quote-level
pending-job blocker. A real service-event/economy/yard seam rejects a NaN request
without mutation, then queues the quoted 8-unit reserve, files 48 credits of debt
for that single request, and leaves fuel unchanged until timed delivery. This is
not a claim of arbitrary event-message idempotency or a rendered service visit.

On the preceding ee34b064 head, the corrected Bar probe passed in CI. Retail boot
also passed; overall checks/mobile readiness failed. The authored-catalog live
check ran out of diagnostic time after partial coverage; it did not establish a
missing or incorrect model, so no replacement model work is justified by that
failure alone. Broader performance and release acceptance remain open.

## Next-radius continuation and current upstream boundary

The Wasp opening now carries through all three existing tickets. Kessler and the
board already offered Joss Wire and Vex Tollcut after Nim; their navigation fell
through to a station-anchored bounty route. The existing reader now selects the
exact authored numeric step, preserving named-target and durable-slot identity,
ram instructions, and honest missing-contact guidance. The existing HUD consumer
follows each moving runner rather than preferring Helios Station. See
`HELIOS_WASP_FIRST_WRIT.md` for executable route evidence and acceptance limits.

Remote master was checked at `9eefbdb615b898b516396b96ec0315612c792083`. Its newer
Machine faction, station UI, renderer and save work is not overwritten or folded
into this sparse candidate. The candidate remains based on `31a011002036e625c971d315f8da08a7a32687ee`;
only `index.html` overlaps those intervening changes among the original 39 paths.
Preserve newer generated hints and sidecars when integrating the isolated verbSpeech
hint. Do not copy this snapshot wholesale over master.

At head `3f2124dd`, retail smoke and service-readiness passed; general and mobile
CI failed. The latest Bar probe completed assertions and reported cleanup but its
command timed out, so it is not a pass. The preceding `ee34b064` Bar command passed.
Mobile sparse checkout still omits existing Ruckus art; the exact workflow change
is awaiting approval, not applied. Rendered ordinary-control route, full
Save/Continue and performance acceptance remain open.

### Continuing goals, not completion declarations

| Marker | Outcome / state | Owner and evidence | Next executable action / dependency |
|---|---|---|---|
| SF-WORLD-DIRECTION | Opening grows through authored work; implemented candidate, not accepted game | Experience integration; Kessler/board/route readers and this report | Follow the next settled ticket's actual destination; retain original larger scope |
| SF-SECTOR-COHERENCE | Helios work has readable local routes and receiving consequences; partial | Experience integration; starterWorkday, starterWaspRoute, starterBuoyAftermath | Exercise ordinary-controls three-ticket returns and Continue when a usable runtime is available |
| SF-LIVING-WORLD | Earned buoy receiving scene reuses existing machinery; partial | World owners; stationSideEventDirector and receipt tests | Verify visible activity and revisit timing without duplicating body/reward owners |
| SF-GAME | Adventure and Swarm opening integration published for review; acceptance open | Controller and current Finish lanes; PR724, scoped tests, qualified CI | Resolve current route defects; separate workflow approval from independent source work |

This scoped register does not archive or replace the original twenty-concept scope,
asset review obligations or older bounded handoff goals. Local agents retain model
production. No goal is closed by this document or its passing tests.

### Swarm first-clear feedback

Swarm's wave receipt uses a legacy `killed` field for resolved cohort slots, including
fleeing or surrendered hulls. The announcer now says how many threats are out of the
fight, rather than claiming those hulls died. It never derives a Swarm resolution
count from admissions alone. Named boss outcomes, starved waves, non-Swarm copy,
round pacing and rewards are unchanged.

A focused test drives the production wave owner with a living fleeing hull, observes
the real resolution receipt and truthful voice message, and exercises the production
phase owners from cleanup to the draft/shop phase and wave two. This verifies the
simulation/event route; it does not claim the shop was rendered, used through normal
input, or visually accepted. Missing/invalid/zero counts, timed versus cohort clears,
duplicates, named objectives and legacy non-Swarm messages have separate coverage.

Final continuation checks: **203/203 focused tests** and six production imports
pass. The unchanged upstream Crucible announcer suite additionally passes 26/26
(blob `f688f5474f3a850d85db03b0121473464b86ca5c`, verified at master `9eefbdb6`).
Two existing VM test contexts now receive the real newly imported ruleset constant;
no gameplay behavior was changed to satisfy those fixture contexts. These counts
do not establish full-game, rendered shop or ordinary-input mission acceptance.

### Pelican recovery now has an outbound and receiving leg

All three authored buoy tickets now follow their actual admitted moving buoy before
pickup, switch to Helios receiving while the player's live attachment holds that
exact occupant, and switch back on release. The buoy is named as working lane
hardware rather than generic slag. A changed hull/fit still sees the real route
with its requirement stated; it gains no recovery eligibility. This closes the
same station-priority mismatch exposed by Wasp, using the existing waypoint reader,
mission leases, attachment authority and tether mirror. No new persistent writer,
body, mission, physics rule, model or payout is introduced.

See `HELIOS_BUOY_RECOVERY_ROUTE.md` for all three locations, expected arrival and
return experience, exact ownership and interrupted-flow evidence. The integrated
set passes **218/218 focused checks and six production imports**. The added route
suite includes actual attachment creation, generation stamps, mirror publication
and cut before mirror refresh, with only the physics-joint port stubbed. This is
component-route evidence, not a rendered normal-input trip or full Save/Continue.

### Earned receiving activity across the three returns

All three existing Pelican settlements now qualify the same bounded receiving
operation using their exact v1 step and physical completion method. A completed,
paid canonical receipt is required. The newest eligible receipt wins within the
original 180-second window; newer pending work supersedes older queued work.
A bounded ten-ID transient list prevents same-session replay after history
reordering or invalidation. Continue may reproject ongoing work only within its
remaining original window, without a new payout or body.

The existing budget-free repair-drone packet drives crawler-and-stitch frames and
the station gantry. It is a station response, not a simulation of unloading the
returned buoy. Internal context labels have no confirmed displayed UI reader.
Normal valid seen lists retain their array identity; normalization allocates only
for malformed state. **223 focused checks and six production imports pass.**

`HELIOS_OPENING_EXPERIENCE_DOSSIER.md` connects these local jobs to the separate
47-A storyline and actual outbound mission geography. It distinguishes candidate
work from master and does not make starter settlement an invented campaign unlock.
It preserves story-text and ordinary-control verification gaps as executable next
work rather than declaring the opening accepted.

### Kessler hands local work back to the existing story

After the current hull's final local ticket settles, Kessler identifies a single
provable active 47-A card and its receiving location. B0's shared objective now
names the marked-rock recovery before the return, then delivery once the sample
is aboard. The sentence is shared with Mission Log; it never reads a stale global
waypoint or changes the player's pin. Canonical B0 installer and B1 contract-author
records drive the tests. No local-job campaign unlock, payout or progression write
is introduced. Missing, ambiguous, legacy or between-contract states stay honest.

The current furnace patrol recap is incomplete for its two-part physical job, so
Kessler refers to its authored brief instead of quoting that counter. Reconciling
that shared reader with the existing furnace focus remains an explicit next
SF-SECTOR-COHERENCE action, not a claimed fix. **232 opening tests, six production
imports and 12 unchanged Mission Log regression cases pass.** No rendered-route,
normal-input, full Continue or performance acceptance follows from these checks.

### Ceres work-order reader follows the actual physical contract

The previously recorded furnace-recap gap is now corrected for the exact authored
version-1 work order. The shared objective and Kessler handback name the marked
repair-mite sites and the marked ore pods, showing cleared sites, CR-FEED receipts
and losses independently. They neither label mites generic hostiles nor imply that
lost cargo was received or paid. Either leg can progress first; the existing worksite
focus still owns target and phase selection. Malformed counts remain unavailable
rather than becoming fabricated progress, and the B0 recovery-before-return fix stays.

Production author, intake, loss and settlement tests demonstrate the real partial
and all-lost outcomes without adding a mission owner. **236 focused tests, six
production imports and 12 unchanged Mission Log tests pass.** This closes the scoped
reader defect at the component layer, not SF-SECTOR-COHERENCE as a whole: rendered
Ceres arrival, physical interventions, dialogue readability and full Save/Continue
remain acceptance work. No actor, asset, reward or physics writer changed.

### Tethys Scale 4 remains visible between the authored contracts

After the alloy settlement, the real single CURRENT ACTION reader now reuses the
existing Scale 4 waypoint projection instead of inviting unrelated cargo work.
It explains the fresh player-jettisoned pod, speed requirement and plate/stamp
comparison without inventing an active mission. Tracked work, trade routes and
the unfinished opening tutorial retain their existing priority.

The existing map action focuses the pad locally in Tethys or the Tethys sector on
the star map from elsewhere. It does not plot or replace the player's route. The
shared button decoder now requires two explicit nonblank finite coordinates;
missing attributes cannot become a false (0,0) target, while real zeroes remain
valid. Actual Mission Log handlers and map authority are exercised in synthetic
DOM tests, with campaign progress and pilot pins preserved.

**240 focused tests, six imports, 12 unchanged Mission Log regression tests and
55 UI import/check assertions pass.** No screenshot, rendered layout, physical
Scale 4 weighing or full Save/Continue is established. Upstream Mission Log CSS
changes were inspected and remain outside this patch; preserve them at integration.
