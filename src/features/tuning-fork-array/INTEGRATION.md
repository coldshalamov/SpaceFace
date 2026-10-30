# Tuning Fork Array — candidate integration contract

Base: `871c27854bb2acff09a80595844d9731d33b037a`, tree
`a3bb1bb7b8cccca0ab280f53bd6035f5f92124b4`. Model capability unknown.
This is a new isolated source candidate. It is not registered, shipped, playtested or accepted.
All writes belong to this directory and `test/pro-tuning-fork-array.test.mjs`.

## Entry and lifecycle

Import `createTuningForkArray` from `adapter.mjs`. On Adventure placement, after core has published
its helpers, construct once with `(ctx, {id:'tuning_fork_array', sectorId, anchor:{x,z}})`.
`anchor` is a **galactic-global XZ** position inside the ordinary reachable playfield. Root chooses
the actual sector/route and checks the encounter envelope (850 wu), clear flight/tow approach,
scanner equipment, no field hazards, and the eventual corridor. Never place via a debug-only flag.
Creation consumes eight `state.rng()` draws exactly once (two carrier parameters, six offsets).
Retain this instance; repeated sector events do not construct a second encounter.

Register `update()` after physics/scanner in the authoritative simulation manifest. Call it only
from the existing fixed-step loop; it reads `state.simTime`, not passed wall time. Four direct Map
lookups plus a constant three-receiver solve per tick. No entity-list walks, timers or dependencies.
It reads canonical bodies and writes only its closure-owned puzzle state. Core owns insertion,
removal, identity tokens, lifetime and physics. Flight and input remain with their owners.

`sector:exit` snapshots and suspends; `sector:enter` resumes only in the authored sector. Existing
live towed bodies retain their positions across a continuous boundary. No teleport or automatic
replenishment occurs. If root dematerializes a sector it must preserve the canonical bodies via its
normal save/residency owner or supply the authoritative restored body list described below.
`retire()` removes only currently bound serials through `helpers.removeEntity`, releases an active
survey job through its owner, and rejects later interaction. A completion receipt remains historical.
`destroy()` only unsubscribes; it is for runtime teardown, not gameplay retirement.

## Exact seams consumed at the pinned base

| Owner | Existing interface consumed | Use |
| --- | --- | --- |
| Core (`src/core/coreSystem.js`) | `helpers.spawnEntity(spec) -> entity`, `helpers.removeEntity(id)` | Four physical wreck bodies, finite replacements; no direct foreign writes |
| Core (`src/core/entity.js`) | `entity.occupantGeneration` | Runtime ID-recycling guard; paired with feature serial + encounter + slot |
| Scanner (`src/systems/scanner.js`) | `scan:pulse {pos,radius,source:'player-scanner',scannerId,seq,simTime}` | Reject wrong scanner, stale time/sequence, displaced origin; inspect only real positions |
| Massline (`src/systems/tetherGameplay.js`) | ordinary acquisition: `physicsBody !== false`, `data.masslineTetherable:true` | Three six-tonne wreck bodies; ordinary player input and canonical attachment forces |
| World (`src/systems/world.js`) | `ui:setCourse {pos,targetEntityId,sectorId,label}` | Track the actual moving wreck, not a fabricated mission-complete event |
| Economy (`src/systems/economy.js`) | `registry.get('economy').grantCredits(amount,reason) -> total` | Synchronous canonical reward writer; no direct credits mutation or cargo proxy |
| NPC jobs (`src/systems/npcJobsRuntime.js`) | `helpers.npcJobs.assign(entity,spec)`, `get(jobId)`, `release(jobId)` | Real surveyor job with two actual route waypoints, no private traffic/AI writes |
| Spatial query (`src/core/coreSystem.js`) | `helpers.queryRadius(pos,r,out?)` | Corridor-clearance query only when commissioning, finishing or queried for traffic |

No new bus event names are emitted. Essential simulation never imports Three.js. The public
feature methods are calls, not invented events with nonexistent listeners.

## Physical encounter and interaction surfaces

Core bodies: slots A/B/C (0–2), carrier wreck (3). Each has a serial tag in
`data.tuningForkArray:{encounterId,slot,serial}`. The forks have finite mass/radius/hull and are
ordinary movable/towable wrecks. They are deliberately **not** world-site machinery (that role
would make Massline refuse them). The carrier drifts at 0.45 wu/s on a seed-derived direction;
actual physics position is authoritative, including any subsequent collision or external movement.

Root supplies authored fork/wreck visuals using that data tag, retaining existing visual identity.
The receiving mouth points along `(+cos(rot),0,+sin(rot))`. Make this unambiguous in the mesh.
The compact optional overlay draws receiving axes and distance rings but does not replace art.
Qualify off-center towing/collision yaw control through the ordinary Massline heads. This candidate
never forces yaw or sets player input. If the selected head cannot apply torque, ordinary collision
nudges are the supported fallback; headed acceptance must verify this is enjoyable and forgiving.

Mount `mountReadout(container, controller)` **inside the existing scanner/interaction panel**.
Call its `update` at existing UI cadence. Essential readout is plain text with labelled bearings,
ranges and jumper state; no color-only clues, animation, flashes, new keybinds or overlay prompt
deck. Mount only while the host scanner panel is visible. Remove using `destroy()`.
For read-only prompt/objective integration use `objective()`; it returns an authored action/position,
not a mutation to canonical mission records. Let the existing mission/UI owner choose how to show
this discovery objective beside an already tracked mission. Do not force any mission completion.

Only scanner pulses read/resolve the signal. `reverse(slot)` is a local, reversible service-jumper
operation available after scanning that fork, within 65 wu. It changes phase by pi; doing it again
undoes the mistake without consuming anything. Physical backward orientation is independently
detectable and must be corrected physically. `replace(slot)` works at the cradle after a fork is
missing or >850 wu away; it spends **one** spare per slot, retires the old serial/body and deploys
the spare at the cradle. A second loss is honest failure to complete with that fork, not an infinite
spawn source. A destroyed carrier prevents completion; do not award a synthetic replacement fix.

## Signal model

Each receiver has an authored range band (110/150/190 wu). Reception is
`max(0,cos(bearing-heading))² × exp(-0.5×(range-error/65)²)`.
Its phase is `2π×range-error/160 + jumperPhase`. Sum the three complex amplitudes and divide
by three. The worst receiver also bounds quality, so two perfect forks cannot conceal a missing
third. Weighted least-squares intersection of the three physical receiving axes gives the fix.
Conditioning >0.025 and triangle area >900 wu² prevent a degenerate array from claiming certainty.
Valid: quality >=0.68 and geometric error <=35 wu with all forks scanned/present. This is an
authored **game signal law**, not a claim that ordinary RF can infer range from a single tone.
The known coded carrier/range gates represent the navigation record's calibration sequence.

Charged-dust squalls occupy 12 of every 60 simulation seconds and subtract at most 0.12 quality.
They never damage hull, spawn enemies, erase tuning or add a hidden deadline. An ideal array works
even during the squall; a marginal array can wait. Coherence/angles update continuously, but a
valid **scanner pulse** is needed to fix the beacon. Fly within 65 wu of the current wreck and scan
again to recover. Moving the emitter invalidates old geometry, not history; an acquired fix remains
a clue, and tracking points at the live emitter. No UI button can set progress to complete.

## Save / restore and exactly-once closeout

Root declares the new feature save key and version in the central save/schema owners (outside this
job's allowed paths). Persist `controller.serialize()` under that key in the same save envelope as
canonical bodies, economy credits and NPC jobs. Save version is 1; unknown/malformed/oversized
payloads throw. Preserve body tags, pose/velocity and the actual canonical bodies through the normal
core save mechanism. Do **not** serialize runtime occupant tokens as permanent identities.

On load construct with `(ctx, placement, savedFeatureState)` to suppress fresh materialization.
After canonical core entities have been restored, call
`restoreState(savedFeatureState, [restoredA,restoredB,restoredC,restoredWreck])`. This supplied list
contains only actual canonical live objects with matching tags/serials. Omit genuinely lost bodies.
The constructor and `save:restoring` gate prevent duplicate spawns; omitted slots stay missing.
Use the save owner's restore mapping, not a per-tick global entity scan. Existing towed bodies are
rebound without repositioning or a second physics writer. Restored NPC job IDs remain owned by
npcJobs and resume from their own save. Do not reconstruct a survey from a completion callback.

`choose('sell'|'publish')` requires recovered record + physical proximity + economy availability.
It latches before the synchronous owner grant and verifies the exact credited delta and return
total. Duplicate/reentrant callbacks return null. Save during that owner transaction throws rather
than taking a half-paid snapshot. Exceptions/unknown deltas retain `settlement.status:'uncertain'`,
no success receipt and no automatic retry. That quarantined state needs owner inspection; a
non-idempotent economy cannot offer safe blind retries. Never clear that latch to make a test pass.

The immutable completion plan is shared by credits, choice text, corridor, survey and receipt:
sell = 1200 cr / private chart / one validation circuit / no public corridor;
publish = 450 cr / public chart / two validation circuits / eventual civilian traffic.
There is no cargo duplication, forced mission finish or second reward when survey completes.

## Follow-up traffic (root-owned hull selection and route policy)

At/after receipt.followupAfter (30 seconds), the existing traffic owner supplies one **idle durable
surveyor ship** to `commissionSurvey(entity)`. This candidate does not steal a working NPC, spawn
an unregistered ship, edit a traffic manifest or write AI/flight intents. The method calls the real
npcJobs `assign` API with `surveySpec(receipt)`. World-record identity is mandatory. The owner
should poll `trafficConsequence()` at its existing scheduling cadence while status is
`awaiting_actor`, then commission at most once. No follow-up hull is a valid pending outcome, not
a claimed survey success. A lost/mismatched job becomes `survey_lost`; no unlimited replacements.

`advanceSurvey()` observes the canonical survey job's loop count; once the required circuits are
done, it releases the job claim once. The private chart stays private. For publishing,
`publicCorridor()` returns the exact receipt route only after validation and current clearance.
Root's **existing traffic route owner** consumes that query as an optional civilian route, observes
the 35 wu/s limit, and retains its normal avoidance/hazard rules. Query null means closed or
temporarily obstructed. Collision clearance is checked with the real spatial query and fails
closed above 256 candidates; this is not proof against non-collidable fields/mines or future
traffic. Root must qualify placement/environment and enforce its ordinary navigation safety.
The survey hull is exempt from its own route obstruction; other collidable traffic can temporarily
close the route. No fictitious `traffic:corridorPublished` event is assumed.

## Checks and remaining qualification

Run `node --test test/pro-tuning-fork-array.test.mjs` (no dependencies). Tests cover 128 seeded
solutions, phase/heading/geometry failures, partial signal, moving carrier, squalls, replay gates,
mid-puzzle restore, one-spare bounds, recycled IDs, sector suspension, both settlements, reentrant
callbacks, unknown grants, corridor obstruction, retirement, text projection and corrupt saves.
Adapter tests use owner-interface test doubles; they are not a headed production playtest.
The bounded evidence file records the additional pinned NPC-kernel probe.

Root still owns central registration, save declarations, actual traffic actor selection/route
consumption, ordinary placement/reachability, authored asset mapping, physics/head feel, UI focus,
worker facade integration if enabled, render/performance qualification and headed player-truth
acceptance. Live tests have not run. Do not label this candidate shipped/integrated/accepted.
