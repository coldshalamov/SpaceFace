# Living places: systems and contracts

**Scope:** implementation design for the living-world commission of 2026-10-27. Source inspection
base: `42d57a248209c9f5a7354e65817c0f7b8f5dbcec`. The district and story outcomes below are planned
unless the package README and validation receipt explicitly identify implemented work. Existing
modules establish reusable mechanisms; their existence does not establish the proposed player
experience or imply that every older feature is accepted.

Read [the world and story](02-WORLD-AND-STORY.md) for the actual places, people, and missions;
[space and assets](04-SPACE-AND-ASSETS.md) for their physical construction. This document specifies
how those things share one game, how they fail, and what a local implementing agent must prove.

## 1. The architectural decision

**Compose existing authorities around places. Do not install another simulation above them.**
An area is a spatial and social contract: a recognizable route, a resource dependency, a group of
people using it, a rule the player can exploit, and a consequence that survives leaving. A district
document is an authoring view over those relationships. It is not a second entity store, second
faction model, second inventory, second map registry, or omniscient encounter director.

At the inspected base the canonical catalogs contain **25 sectors, 118 zones, and 58 activity
pockets**. This is already enough geographical breadth for the proposed eight districts. The
deficiency identified by the commission is the experienced connection between pieces. Expand a
district's existing place and activity owners before introducing another named object.

The minimum recurring loop is:

1. A worker obtains a real input from a known source.
2. Its ship and visible tools perform a legible operation along a route.
3. A real destination receives the output or remains deprived if the operation fails.
4. The player can help, obstruct, redirect, steal, negotiate, or ignore that operation.
5. Later traffic, local services, physical damage, or a person's behavior exposes the result.

A radio sentence alone satisfies none of steps 1–3 or 5. A moving vehicle with no destination or
effect is animation. Animation is valuable, but it must not be advertised as an economy.

## 2. Source map: reuse, extend, do not duplicate

Paths are relative to repository root. Re-check the live versions when implementing; this is a
source crosswalk, not a reservation on those files.

| Responsibility | Existing owner or seam | Required use for this program |
|---|---|---|
| Sector identity and station services | `src/data/sectors.js` | Retain stable sector/station IDs. Display-name and geography changes require save compatibility and navigation checks. |
| Sector-local geometry and conversion | `src/data/sectorAnchors.js`, `src/data/sectorCoordinates.js` | Author coordinates locally; convert once at the world/Atlas boundary. Include a nonzero-origin test. |
| Named zones and chart identity | `src/data/sectorZones.js`, `src/data/authoredPlaces.js`, `src/data/PLACE_REGISTRATION.md` | Append ordinary zone records; never replace a sector's list or add a competing district map. |
| Existing working pockets | `src/data/sectorActivityPockets.js` | Reuse actor slots, anchor offsets, route identities, and occupation bindings. Expand specific pockets into districts. |
| Entities and body identity | `src/core/entity.js`, `src/core/coreSystem.js` | One store; stable record identity plus live occupant generation for delayed operations. |
| World materialization and retirement | `src/systems/world.js` | Own promotion, demotion, sector entry, and world records. A content adapter requests these operations. |
| Durable records and bounded far state | `src/world/worldRecords.js`, `farActorTable.js`, `activityRuntime.js`, `worldCatchup.js` | Keep interacted-with bodies and tombstones. Distance is not permission to reset an outcome. |
| Six working trades | `src/systems/npcJobs.js`, `npcJobsRuntime.js` | Reuse miner, hauler, patrol, surveyor, salvor, and tender phase graphs. Jobs emit intents; real movement and transactions retain their owners. |
| Civilian movement and embodied freight | `src/systems/traffic.js` | Use actual route destinations and finite manifested goods. Do not mint another visual freighter over a real job. |
| Calendar and station shifts | `src/data/worldCalendar.js` | One simulation calendar: 600-second days, three station watches, staggered by station. No new wall-clock town scheduler. |
| Faction presence and local conduct | `src/data/factionPresence.js`, `src/systems/factionPresence.js`, `src/data/factionConduct.js` | Reuse recognizable keepers, conflict garrisons, service access, and local grudges; preserve stance and title distinctions. |
| Hostile steering and firing permission | `src/systems/tacticalAI.js`, `src/ai/engagementAuthority.js`, `src/systems/aiPorts.js` | Extend live SG-06 motives/doctrines through final authorization. The legacy `ai.js` is not the normal game. |
| Shared population ceiling | `src/systems/spawnBudget.js` | Request, bind, and release existing slots. Default 24, hard ceiling 40 at this base. No district may create a private cap. |
| Witnesses, jurisdiction, search, response | `src/systems/lawSecurity.js`, `src/law/authorityResponse.js`, `src/systems/heat.js` | Route crimes to law and wanted heat. A district may supply a finite response roster and spatial authority; it cannot mint guilt or clear heat. |
| Physical ship theft and recovery | `src/systems/shipjack.js`, `src/shipjack/model.js`, `src/systems/shipControlTransfer.js` | Reuse BLACK FLAG custody and exact-body transfer. Possession, legal title, signature, loadout, and crew are separate facts. |
| Money, markets, cargo, standing | `src/systems/economy.js`, `cargo.js`, `factions.js`, `ships.js` | Only their canonical writers settle outcomes. District scripts emit requests and consume confirmed results. |
| Story scenes and encounters | `src/systems/encounterDirector.js`, `src/data/encounters/`, `src/story/campaign47a/` | Use authored admission and physical branch predicates. Keep one-shot story scenes separate from recurring neighborhood life. |
| Bounded remembered outcomes | `src/story/storyLedger.js`, `src/systems/captainMemory.js`, existing encounter/story receipts | Read real receipts for dialogue, law, and return visits. Do not write a second rumor truth ledger. |
| Organism and alien ecology | `src/data/alienEcology.js`, `alienEcologyState.js`, `src/systems/alienEcology.js` | Extend the one fungus, its strain/site model, fauna relations, and contamination/knowledge distinction. Do not add an unrelated green enemy faction. |
| Working hazards and machinery | `src/data/environmentalMachinery.js`, `src/systems/environmentalMachinery.js` | Connect shutters, winches, pressure, heat, and salvage interventions to existing physical owners. |
| Station atmosphere | `src/data/stationLife.js`, `src/ui/station/stationLife.js` | Existing apron/PA presentation is atmosphere; do not treat its cosmetic ships as cargo authorities. Add lived interior detail without duplicating external bodies. |
| Map and exploration read models | `src/core/atlasIndex.js`, `src/world/explorationJournal.js` | A discoverable landmark must chart, inspect, route, and survive Continue. The Atlas derives from canonical source. |

The inspection also found a `src/contracts/contentFactory.js` authoring contract. It covers Swarm
modifiers, wave recipes, and arena descriptors. It is **not** a generic Adventure district schema;
do not force the living-world campaign into it or weaken its power/spawn rules.

### Existing source does not equal delivered experience

`docs/BLACK_FLAG.md` explicitly describes an integrated work in progress with unresolved complete
route/acceptance gaps. The presence of `shipjack` is a reason to reuse it, not a reason to announce
that the COUNTERSIGN robbery is already playable. Likewise, a zone in `authoredPlaces.js` may have
no presence or physical prop. Its successful map registration proves navigation, not city life.

At inspection, PR #637 (opening experiences) and PR #638 (Strategic Chaos foundations) were open,
unmerged work. They are coordination context only. After either merges, compare its actual owners
with this package and keep one implementation of shared concepts. Do not silently absorb either
branch or assume its APIs exist on master.

## 3. District composition contract

Every district in `districts.json` is a **planned composition**, explicitly distinct from canonical
runtime geography. The executable authoring command validates the plan and prints bounded work
briefs; it does not register, spawn, or accept a district. Runtime content remains in the owners
above. The actual machine-readable schema is the checked-in manifest and validator, not the
illustrative field names below.

An implementation brief must answer these questions before creating bodies:

| Contract | Necessary information |
|---|---|
| Identity | Stable district ID, existing sector/zone anchors, fiction, silhouette, recognizable approach. |
| Geometry | Navigable spine, branch/escape routes, solid obstacles, protected spawn space, entry threshold, interior volumes, coordinate frame. |
| Useful population | Resident slots with names or durable roles, occupation, source, destination, service tool, response to threat, recovery policy. |
| Resource graph | Input lot, custody owner, operation, output receiver, finite quantity, and depletion/restock rule. |
| Local authority | Jurisdiction boundaries, challenge, legal entry, observed crime, response roster, retreat/stand-down, repair/restitution. |
| Player freedom | At least one helpful, opportunistic, aggressive, and withdrawal route where fiction supports them; no universal menu of identical four choices. |
| Disturbance | A causal change that can propagate into another owner's observable state. |
| Memory | Saved facts, their owner, repeat-command protection, return-view consequences, and restoration limits. |
| Authoring truth | Which existing IDs are reused; which models or mechanics are planned; which route was actually verified. |

A district may span several existing zones. Do not stretch one circular zone until every local
label loses meaning. Cities need fronts and backs: a public freight road, a civic or domestic
interior, an industrial edge, and a service route. A military district needs a public boundary and
a restricted interior with physical reasons for both. The route graph, not a radius label, is what
makes that distinction playable.

## 4. Three layers of life, one causal world

### A. Background presentation

Distant window motion, inaccessible city transit, antenna sweeps, laundry, festivals, and crowd
sound can be pooled or instanced presentation. They provide scale without consuming a physics body
per citizen. They do not hold collectible cargo, fire damaging weapons, witness a crime, grant a
reward, or block flight. If the player can reach or affect one, promote it through a canonical
owner before the interaction. Do not let a visible solid-looking gantry be noncolliding scenery
unless the art clearly communicates its depth relative to the flight plane.

### B. Recurring local work

Resident working ships use existing job graphs and finite supplies. Their purposes must differ in
motion, not just names. A surveyor stops to read; a salvor cuts and then handles what it cut; a
tender approaches a casualty and repairs or removes it; a patrol observes a perimeter rather than
shuttling between two arbitrary points. A market courier stops at a receiver that has room for
its lot. Existing authored slot IDs retain continuity across visibility changes.

The useful work is not suspended simply because the player did not accept a quest. The district
can continue on a bounded simulation schedule. However, **offscreen catch-up cannot declare a
player-specific fight won, consume a unique mission target, finish a delicate physical delivery,
or fabricate a confirmed theft**. Use current catch-up/embodiment semantics and physical owner
receipts. A delayed return may find a convoy waiting, a route degraded, or a replenishment in
transit; the work order must state which outcome is possible.

### C. Authored disruptions and story

One-shot scenes use the encounter/story owners. They introduce a dilemma or unusual event into a
working place; they do not manufacture the place only while a mission is active. At this base
`livedWorldDirector.js` permanently rotates curated scenes out once they start, including an
immediate abort. Its separate `ambientScene: true` branch can repeat an eligible scene after a
1,200-second per-scene cooldown; that branch does not replace durable occupations and their
custody. Therefore the director cannot be the only provider of ordinary city life. A player who
finishes every story must still see work, travel, repair, worship, conflict, and play.

Recurring variation comes from actual conditions: a blocked receiver changes a route; a lost
garrison ship creates a training vacancy; a repaired water/heat connection reopens gardens; a
market day changes where people gather. It must not come from repeatedly resetting the same
named accident and pretending nobody remembers.

## 5. Physical work, interruption, and custody

Use a job's phase clock to schedule intent, never as sole proof that work succeeded. Completion
needs the current living actor, current target, admitted role, correct physical relationship, and
the actual owner-side transaction. On a failed precondition, show a useful reason in-world and
wait, reroute, ask for help, or terminate. Do not pay on the timer anyway.

For a delivery, the essential invariant is:

`source stock + in-transit custody + received stock + destroyed/spent quantity = conserved total`

The source may regenerate according to a declared existing production process. A timer that
manufactures a fresh identical unique salvage lot after every reload is not regeneration.

### Required interruption semantics

| Interruption | Required result |
|---|---|
| Player blocks the lane | Brake/hold/reroute using existing movement intent; no position teleport, remote unloading, or instantaneous punishment. |
| Worker or receiver is damaged | Change work eligibility and visible operation; emit genuine repair or distress demand. |
| Load is stolen | Remove it from the original custodian before assigning it; remaining job goes short or requests recovery. |
| Receiver is destroyed | Preserve the surviving load and offer another real receiver where fiction allows. Do not credit delivery to an absent target. |
| Actor is destroyed | Retain its identity/tombstone and finite spill. A later replacement is a new admitted worker, not the dead actor reborn. |
| Sector unload/Continue | Restore the same durable facts and normalized job; revalidate transient dwell and live body bindings. |
| Player ignores the scene | Residents continue or reach an authored no-player outcome. No notification claims the player caused it. |
| Player returns after repair | Show repaired geometry/tool operation and the changed route/service, with dialogue reading the receipt. |

Animation is driven by the committed phase or operation, not a second clock. For example, the
winch pulls while the real tether carries load; its cable loosens on release; a crane holds when
its receiver refuses the lot. A believable routine can have an authored animation embellishment,
but the embellishment must not assert a false cargo, damage, or completion state.

## 6. Niner Bastion: a garrison that can be understood and robbed

The full narrative and layout are in the district bible. The implementation problem is more
specific than “spawn dozens of enemies.” A base is a finite institution with an observable
readiness cycle, inventory, maintenance, patrol doctrine, restricted spaces, and a reason to
stop pursuing.

### Garrison source of truth

Extend existing faction-presence/materialization owners with a durable roster for the authored
base. Each slot records role, home berth, present disposition, exact body identity when live, and
replacement eligibility. The district manifest supplies the initial proposed live-demand and
finite-reserve envelopes, distributed among patrol, ready berths, repair, training, and external
duty. Those figures are **not guaranteed simultaneous attackers** or a mandate to raise the cap.

The current shared budget is 24 by default, 40 at the hard ceiling. The new base must coexist with
civilians, missions, and the player’s entourage. Reserve/materialize a bounded active subset;
ordinary distant ships remain owned far records. A reserve does not become a live attacker until
a slot is granted and its launch route clears. No teleport spawns behind the camera, no invisible
damage from unmaterialized guards, no private “military” pool that bypasses `spawnBudget`.

Current `authorityResponsePolicy()` admits 1–3 responders depending on security. That policy is
the normal jurisdiction response. The base's standing garrison is a separate **existing-body
source of military participation**, still routed through law/engagement authority. Do not inflate
ordinary city-police responses to get the base fantasy. A finite reinforcement transport can
bring more bodies later; it must arrive on a chartable approach and debit a known reserve.

### Escalation with physical causes

| Situation | Readable response | Player counterplay |
|---|---|---|
| Outside the restricted perimeter | Watch rotation, drills, repair launches; no aggression. | Observe timings; trade or recover sanctioned cargo. |
| Crossing a marked threshold without clearance | Visible challenge with origin, boundary, and exit direction. | Turn out, hail, show current authorization, or continue deliberately. |
| Ignoring challenge or witnessed sabotage | The nearest eligible patrol intercepts; traffic evacuates the crossing. | Break observation, retreat, disable a sensor/power source, negotiate where lawful rules allow. |
| Confirmed attack or custody breach | Ready wings launch from actual berths, screens defend the asset, pursuit has named authority. | Use terrain, sever support, steal the tender, abandon the prize, surrender, or escape. |
| Player escapes observation | Search uses last confirmed evidence; repair teams begin work. | Conceal/swap signature through existing mechanics; wait in a defensible hideout; return under different terms. |
| Reserve depleted or target beyond remit | Garrison protects the base and ends the chase under explicit rules. | Keep a hard-won victory; face later recorded legal/economic consequences. |

Early-game `engagementAuthority.js` also has a ten-minute ownership rule allowing at most two
first-session attackers. An optional military incursion must have a clear, narrow opt-in at the
challenged boundary if its authored danger is to exceed that protection. Do not globally disable
starter safeguards or use a UI hint as fabricated legal consent. Keep a safe approach and exit
before the player commits.

### COUNTERSIGN: the special thing worth taking

Use the Warden-based military tender described in the story/asset briefs. Its military utility
must be a real tool with constraints and observable counterplay, rather than a stat increase or
one-cutscene unlock. The exact-body custody route should use existing BLACK FLAG infrastructure:

1. Identify the actual hull and observe its operating schedule.
2. Gain access by valid clearance, rescue/debt, stealth opportunity, or deliberate breach.
3. Meet the target's crew/systems/custody prerequisites; ordinary aggressive combat and peaceful
   handover have different evidence.
4. Secure the vessel through a generation-valid link/boarding or authorized handoff.
5. Transfer helm through `shipControlTransfer`; preserve damage, cargo, fittings, pose, velocity,
   and the outgoing player's hull. Show where that hull remains.
6. Escape, return, register, conceal, sell, or employ the prize using the canonical existing owners.

“Press use near ship” cannot manufacture a clean player-owned copy. A reload cannot refill its
magazine, erase title, recover a missing component, or duplicate the abandoned hull. Enemies may
contest the theft through actual agents; arbitrary offscreen confiscation is not counterplay.

## 7. Place memory without a combinatorial swamp

The world does not need to remember every particle. It must remember changes the player reasonably
expects to matter. Persist durable facts with their existing domain owner and derive local
presentation from them.

| Fact | Owner | Derived local evidence |
|---|---|---|
| A named ship was lost, captured, repaired, or returned | World records / shipjack / ship owner | Vacant berth, new crew, repaired hull, different route, claimant response. |
| A finite cargo lot changed hands | Cargo/physical freight owner | Short shelf, fulfilled receiver, spilled goods, delayed service. |
| A civilian reported harm | Law witness/incident owner | Checkpoint behavior and search brief grounded in the report. |
| A worker's body/tool was damaged | Combat/world record | Interrupted motion, repair intervention, lasting scar where art supports it. |
| A major district decision was settled | Story/encounter receipts | Branch-specific public installation, local service, relationship, or closure. |
| Organism topology or known evidence changed | Alien ecology / discovery | Growth state, fauna route, scanner language, recoverable access. |

Do not create Boolean flags for every line of dialogue. For a named district quest, save a small
typed outcome plus stable affected IDs; derive the public reaction from those facts. If a later
event supersedes a fact, retain enough provenance to explain the change without duplicating the
entire simulation history.

### Transaction and identity rules

Every irreversible settlement needs a stable operation identity and an idempotent owner path.
Two identical callbacks, a save between request and response, a recycled numeric entity ID, or a
sector transition must not pay twice or transfer the wrong object. Numeric `entityId` alone is
not identity; require the recorded generation/current entity and a durable record or vessel ID.

A short transaction follows: **intent → validate live owners → debit/transfer once → confirmed
receipt → presentation**. If the owner rejects it, presentation describes refusal. Text must never
promise “delivered,” “rescued,” “repaired,” or “stolen” because a menu choice was clicked.

Destroying a mission's unique prop must lead to an authored consequence and a recovery path to the
campaign, not a hidden respawn while the player turns away. Recovery can be a different source of
evidence, an alternative alliance, a costly physical restoration, or a changed ending. Restoring
every harmed person and structure for free would erase the meaning of the chaos.

## 8. Systemic mission design and anti-shortcuts

The eight main district stories are concrete authored situations. Their objectives must refer to
physical or institutional state, not a required sequence of button presses. A good objective says
“get the coolant lot to the clinic with its containment intact.” It allows a careful tow, legal
escort, stolen tender, alternate passage, or negotiated receiver when those owners can execute
them. It does not grant completion for choosing a line labeled “deliver.”

Each mission implementation records:

- **Admission:** where an ordinary pilot encounters it, why it is available, and which participant
  is already present before acceptance.
- **Observation:** what the player can see or hear that reveals the problem without a codex.
- **State predicates:** the actual success, partial success, abandonment, destruction, and failure
  conditions, with a named authoritative source for each.
- **Interventions:** physical and social options, including combinations the author did not script
  as a bespoke cutscene. Use existing verbs; add a new verb only when the situation requires it.
- **Custody:** every cargo/body/evidence input, recipient, unique quantity, and settlement owner.
- **Aftermath:** a real changed route, service, body, institution, or ecology, plus authored reaction.
- **Continuation:** how the campaign proceeds if a named NPC or the obvious approach is lost.

### Disallowed substitutions in agent work

| Tempting shortcut | Why it fails | Required substitute |
|---|---|---|
| Add ambient ships with different labels | Different nouns still produce the same empty-space motion. | Give each role a place, task, distinctive physical operation, and outcome. |
| Add many new sector names | Breadth obscures repeated content. | Finish a district spine and several meaningfully different sites before expanding. |
| Trigger dialogue as proof of work | Describes change without causing it. | Consume a confirmed owner receipt and show the changed world. |
| Award mission progress by distance alone | Flying near a hospital is not delivering medicine. | Confirm the exact load, recipient, docking/handoff conditions, and owner transfer. |
| Rebuild actors on every approach | Erases ownership and damage; risks duplicate cargo. | Resolve durable identity, rematerialize once, retain tombstones. |
| Turn every guard hostile by faction color | Removes evidence, uncertainty, and legal distinctions. | Use current jurisdiction, motive, observed act, and final engagement authorization. |
| Respawn unlimited reserve waves | Removes the meaning of attacking a standing force. | Finite base reserve plus explicit replenishment transports and readable time. |
| Put fake cargo on a scenery convoy | Lets the eye promise a toy the player cannot use. | Real manifested goods, or clearly distant/noninteractive presentation. |
| Solve blockage by teleportation | Breaks the physical game's central promise. | Real thrust/braking, waiting, reroute, tow request, or honest failure. |
| Treat model completion as area completion | A beautiful empty station is still an empty station. | Verify approach, population, interaction, consequence, return, and escape. |
| Introduce a universal “area director” | Duplicates law, jobs, memory, and encounter ownership. | Small content adapters calling existing owners with explicit receipts. |

## 9. Performance and lifetime contracts

The program's fidelity target is recognizable causal density. Increasing the number of fully
simulated bodies is only one means, and often the least effective. Spatially cluster meaningful
work where the default camera can read it; place lower-cost life outside reachable space; preserve
quiet travel and visual contrast between districts.

Use the existing near/active/far machinery, compact indexed entity views, activity scheduling, and
bounded record retention. A district materializer runs on a meaningful lifecycle boundary, not by
scanning every sector and spawning missing objects every frame. Routine per-tick decisions inspect
the current nearby actors and their existing owner state. They never enumerate all saved history.

**Do not invent new permanent performance budgets in this document.** Population ceilings stated
above are inspected current code. Additional CPU/GPU/texture/streaming targets in an implementation
packet are hypotheses until measured on a named route, hardware/profile, settings, and candidate.
Model/streaming strategy lives in the companion environment brief. A bounded actor count alone
does not prove frame time: shaders, draw calls, asset preparation, collision shape counts, and
scripts can dominate.

One district's cleanup must release only its leases and temporary presentation. It may not delete
another mission's actors, settle a legal case, or mark a persistent named NPC dead. Promotion,
demotion, visibility loss, saved restoration, and a genuine destroy are separate events.

## 10. Acceptance matrix for an implemented district

These are route obligations, not quotas of screenshots or ceremony. Use focused state/integration
checks to establish invariants, then the existing player-truth workflow for the ordinary player
route; do not create a second acceptance framework. No external human verdict is a build step.

| Route or adversarial case | Required evidence |
|---|---|
| Arrive without a quest | A unique approach/landmark, observable recurring work, useful navigation, no debug spawn needed. |
| Watch one complete useful routine | The actual actor acts on the actual source and receiver; phase, tool motion, and goods agree. |
| Interfere midway | The routine responds physically and economically without a fake completion. |
| Follow a harmless visitor route | Civilians and guards remain distinguishable; permissions and warnings are explicit. |
| Attempt the signature toy | The real toy works through its canonical owner, with a useful failure reason and an escape route. |
| Choose an unexpected valid physical solution | Completion evaluates outcomes, not only the expected scripted approach. |
| Ignore, abandon, or destroy the obvious solution | A truthful consequence and continuation remain; no soft lock or invisible actor replacement. |
| Leave, Continue, and return | Damage, death, custody, branch, and finite lots survive without duplication; presentation reads restored facts. |
| Cause a crowded local crisis | Shared spawn budget and render/physics limits remain honored; no unmaterialized attackers or silent missing objectives. |
| Replay a settlement command or stale event | No duplicate payout/title/cargo; wrong-generation targets are refused. |
| Cross a nonzero-origin sector | Routes, colliders, labels, map markers, and body locations share the same frame. |
| Use alternate camera/input/motion options | The path remains navigable and readable; transitions do not remap intent unexpectedly. |

Passing a catalog validator proves that the plan is internally connected to source. Passing a
native integration fixture proves that a specified owner interaction works. Only representative
player-route and presentation evidence can support the claim that the district feels alive.

## 11. Implementation order that preserves a coherent game

The dependency order in `program.json` is the concrete commissioning surface. Within it, implement
these seams as vertical outcomes:

1. **One working city street:** Lantern Ward's route, existing service/work actors, a real input
   dependency, one disruption, and an honest revisit. Reuse existing models at their intended scale.
2. **One constrained traversal district:** Cathedral or Widow's Run, with solid geography, safe
   bypass, physical cargo route, and an interruption the player can exploit.
3. **One deliberate military intrusion:** Niner's observable roster, challenge, local response,
   finite reserve, COUNTERSIGN custody, escape, and later title/restitution.
4. **One continuously inhabited surface/interior:** Iron Maw's active passage, camera transition,
   worker life, repair access, and saved state. Models can improve afterward; collision and routes
   must already work with qualified existing geometry or explicit development fixtures.
5. **One ecological district whose rules alter travel:** Memorial Gardens, with real contamination,
   heat/food/wreck dependencies, humane and exploitative interventions, and persistent aftermath.
6. **Campaign stitching:** integrate the district receipts into the chosen story spine and endings;
   preserve free play after resolution and ordinary recurring life between story missions.

Do not finish all prose, then all models, then all AI, then attempt to assemble the game at the
end. The present planning commission supplies the creative seed and executable work briefs.
Subsequent implementation agents close one end-to-end place at a time, then expand that place's
depth and connect it to its neighbors. An incomplete model is allowed in a labeled development
fixture; a placeholder cannot quietly become the delivered visual bar.

## 12. Executable authoring front door delivered with this plan

The following commands inspect the actual checked-in manifests and work packets:

```sh
node scripts/living-world.mjs --validate
node scripts/living-world.mjs --district=district_dione_niner_bastion
node scripts/living-world.mjs --task=LW-01
node scripts/living-world.mjs --next --json
node test/living-world-plan.test.mjs
```

The validator resolves declared sector/zone references against the canonical source catalogs,
checks source-reading paths, existing resource/routine owner files, reused asset source paths, and
task-packet existence, detects duplicate IDs and missing resource references, and rejects cyclic
setup/task dependencies. Opportunity IDs are unique across all districts; shared asset references
are allowed. It distinguishes a productive resource cycle from an impossible setup dependency
cycle. A planned model can be named without pretending
that its GLB exists. A reuse path may name an existing source catalog; finding that file proves
only the declared source path exists, not that a particular model is shipped, registered, rendered,
or playable. Live-demand proposals above the current 24-slot default must carry an explicit
admission explanation; the hard ceiling is not a grant.

`--district` prints the complete local brief, resource and routine owner crosswalk, asset status,
interventions, recovery, acceptance cases, and linked task packets. `--task` includes the full
packet text. `--next` lists every planned task whose declared dependencies are marked implemented,
ordered by numeric priority and then stable ID. This is a read-only view of **this package**. It
does not claim files, change task status, inspect a running game, replace the build map, or run the
shell commands in a packet. An implementing agent must still read the current repo owners and
existing INFERENCE/FINISH work context before editing.

The CLI's complete output can be consumed as JSON with `--json`. Invalid manifests return exit 1;
invalid command-line syntax returns exit 2. Source and task paths remain inside the repository.
The targeted tests exercise malformed plans, false geography, missing sources, dependency and
resource mistakes, duplicate IDs, finite budget interpretation, complete packet output, and
read-only behavior. They validate the authoring tool, **not the future districts' gameplay**.
