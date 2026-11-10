# SpaceFace — Worlds With Work To Do

20 concepts • 1e0cf9499613b7c3acad10f34739278136d3d469 • DESIGN PACKAGE

# Repository audit: strengthen the encounters, not the inventory

## Conclusion

SpaceFace's source already contains much of what a generic expansion pitch would call missing: named characters, a witnessed-memory rival, physical enemy roles, civilian jobs, salvage consequences, alien fauna, precursor institutions, authored places, and a real planetary interaction. The strongest opportunity is to make this breadth easier to perceive, learn, care about, and revisit. That conclusion is an interpretation of the inspected source plus the user's reported experience, not a measured player-study result. [R02,R03,R05–R13]

The governing design question is: **What new decision, relationship, or discoverable consequence does this object create?** A new mesh with an old health bar does not qualify on its own.

## Existing strengths that must survive

The owner's vision explicitly couples physical agency with a working local world and asks for complex-looking outcomes from simple, dependable actions. The current engineering notes preserve XZ-plane simulation, fixed-timestep state, existing single writers, the selected tactical AI / flight path, Forge assets, and the ORRERY interface direction. The report therefore proposes additions to existing owners rather than a replacement engine, control scheme, UI shell or economy. [R02,R03,R04,R07,R14]

`enemies.js` already differentiates light throw-weight craft, ranged disengagers, escorts, raiders, a field anchor and tether specialist. Mirrorjaw and Forge Regent already use physical geometry/counterplay. New enemies here must add a distinct action problem, not relabel those rows. In particular, Scissorwake is an explicit engineered line-cut attack; it may not weaken ordinary Massline strength. [R05,R06,R14]

`alienFauna.js` already contains a noncombat drive grammar and a scan-sensitive Veil-Ray. `precursorMachines.js` already defines auditors, couriers and conservators under protocol state rather than normal faction reputation. The Anvil and Cinder Nursery already have map-visible identities. This plan expands encounters around these, rather than pretending they are new discoveries in the codebase. [R08,R12,R13]

## Gap diagnosis and response

| Experience question | Observed foundation | Proposed response | Confidence boundary |
|---|---|---|---|
| Can I tell what my chosen run item does? | Registered draft/supply/run systems and ORRERY direction | Pip & Spanner; later Sable's demonstrations | UI weakness is user-reported, not reproduced here |
| Can I read an approach before the dock refuses it? | Docking corridor and station broadcasts | Latch Nine | Specific new character is proposed; docking is not absent |
| Can I predict the consequence of taking this crate? | Claims, cargo, contact hails and provenance | Tally-3 and Pallet Jack | Full ownership flows require runtime tests |
| Does an enemy demand a different physical answer? | Existing specialists and attack doctrines | Scissorwake, Kilnback, Mothlight | New compositions/counters require playtesting |
| Does an escort have recoverable partial outcomes? | Traffic, missions and fragile cargo | Ilex Seed Ark | Existing mission inventory was not exhaustively searched |
| Will a familiar person recognize meaningful help? | BRACKET, rival memory, registered MORROW/VESPER | Towline Table; Red Kite's noncombat rivalry | Do not overwrite or duplicate existing personalities |
| Is working infrastructure physically understandable? | NPC jobs, actual transfers, machinery | Tethys Switchyard and Borrowed Sun | Reachability and frame time are unmeasured |
| Does a location invite a question? | Salvage and authored places | Last Shift, Thimble Door | These are proposed authored sequences, not missing engines |
| Can alien encounters reward observation rather than killing? | Fauna stimuli and machine protocols | Nursery, Borrowed Voice, Open-Hand Lock | Preserve revelation and canon gates |
| Can I point at a lasting consequence I helped cause? | Story, provenance and chronicler systems | Hundred-Hand Mile | Compose existing memory; do not build a second chronicle |

## What not to add

Do not add another generic drone companion, mystical precursor oracle, passive-money faction, reflective boss, parasite civilization, full-screen HUD redesign, or second planet with the Anvil's existing verb. Do not treat code absence as established merely because one search found nothing. Each packet contains an explicit overlap check. [R03,R06,R08,R10–R14]

Do not spend all twenty additions at once. No amount of content makes a frozen loading screen feel authored. Start with safe, high-frequency interface/service improvements while preserving a separate stability gate for camera, collision and streaming work. Performance failure is not permission to silently remove the art direction; reduce duplication, allocations and residency first. [R03]

## Comparative lessons, not reskins

Outer Wilds: connect an observable anomaly to a question the player can investigate. Applied to Last Shift and Borrowed Voice. [E01]

Into the Breach: visible intent can coexist with hard decisions when displacement, civilian stakes and interactions compound. Applied to the cutter and cargo thief; real-time warning windows must be tested rather than copied from turn-based play. [E02]

Hardspace: Shipbreaker: physical objects become engaging when inspection, handling and hazards form one chain. Applied to Tally, Ilex and the switchyard. [E03]

Hades: recurring characters can make repeated attempts meaningful through concise state-aware responses. Applied to Pip & Spanner and Red Kite, without copying their narrative or presenting every repeat as fresh content. [E04]

Endless Sky: several livelihoods can coexist without forcing one activity. Applied to alternative jobs, bypass routes, cargo rescue and optional story participation. [E05]

All adaptation choices above are design hypotheses. The acceptance tests specify how to try to falsify them. Sources and pinned links: `SOURCES.md`.




---

# 01 — Latch Nine

SF20-01 | Harbor character / navigation | Build wave 1 | DESIGN PROPOSAL

![Original procedural concept render](art/01_latch_nine.png)

## Player-experience purpose

An orbital signal gantry whose three semaphore arms teach docking by physically showing where it is safe to go. Its affection is expressed as extremely precise traffic control.

**Gap / hypothesis:** Docking has a corridor system, but a repeatable, recognizable harbor relationship can turn a permission prompt into a place you understand.

**Existing overlap to preserve:** Extend dockingCorridor and stationBroadcast; do not replace their authority. BRACKET already occupies the funny yard-robot role, so Latch is a working harbor instrument, never a ball-game host. The earlier exploratory gantry image is not a shipping model.

Repository evidence: [R02](https://github.com/coldshalamov/SpaceFace/blob/1e0cf9499613b7c3acad10f34739278136d3d469/design/VISION.md), [R03](https://github.com/coldshalamov/SpaceFace/blob/1e0cf9499613b7c3acad10f34739278136d3d469/AGENTS.md), [R07](https://github.com/coldshalamov/SpaceFace/blob/1e0cf9499613b7c3acad10f34739278136d3d469/src/core/registry.js#L1-L170), [R10](https://github.com/coldshalamov/SpaceFace/blob/1e0cf9499613b7c3acad10f34739278136d3d469/src/data/bracket.js). See the inspection limits in `production/SOURCES.md`.

## First encounter

On the first voluntary approach to a staffed Tethys dock, a squat signal tender translates into a holding position beside—not inside—the corridor. One arm points toward the open throat. A second closes across a conflicting lane. The third rotates to acknowledge your alignment. The player still flies every metre.

## Where and when

Attach to one existing staffed station in sector_tethys_junction. Resolve its anchor from sectorAnchors; place the tender outside the swept volume of the shipped docking corridor. No new station or sector. Hail becomes available inside 360 WU; guidance presentation inside 600 WU. Only one Latch instance per station.

## Repeat loop

Approach → see clearance → align under your own thrust → dock or leave. Later approaches acknowledge a clean arrival, an earlier collision, or an unpaid tow, using verified local records. No repetitive first-arrival tutorial. Optional assistance can be dismissed for the session.

## Visual and model recipe

Low offset goalpost in plan view; one thick crossbar, three paddles projecting from its starboard side, a single rectangular optical shutter. No face or humanoid legs. Amber bands, dark machinery and restrained ivory armor.

Author envelope: 18 × 12 × 5 m, +X nose / +Y port / +Z up. Proposed gameplay semantic radius: 14 WU (0 means not an independently targeted world body); proposed mass: 140 internal units (0 means static/preview, not a massless dynamic body). These are design targets, not final measured asset bounds. Runtime scale must follow the actual Forge/entity contract.

LOD triangle targets: 14,000 / 5,600 / 2,500; proposed near draw budget 10; nearby concept cap 1. Numbers are budgets to verify, never permission to bypass spawnBudget.

### ROOT_LATCH

Build: Forge loft: sections at X=-8,-3,6,9; half-widths 3,4,3,1.5; top heights 1.2,2,1.5,0.5. Keep its center mass below the crossbar.

Pivot / parent: Origin at center of hull.

Collision: One convex hull; no collision on lamps.

### CROSSBAR

Build: Chamfered plate from (-5,-6) to (5,6), thickness 0.8; recess a dark central channel.

Pivot / parent: Fixed to ROOT at Z=2.

Collision: One box only if materially outside hull proxy.

### PADDLE_A/B/C

Build: Three rectangular plates, each 4.0 by 1.2 by 0.22 m; each has one amber inset at its tip. Offset pivots along X=-4,0,4.

Pivot / parent: Hinge axes +Z at Y=-4.5; travel -60 to +75 degrees.

Collision: Render-only; clearance never depends on a cosmetic paddle.

### SENSOR_SHUTTER

Build: One dark 1.5 m rectangular aperture with sliding ceramic shutter, no eye dots.

Pivot / parent: X=6,Y=0,Z=1.8; slide 0.5 m along Y.

Collision: None.

### DRIVES

Build: Two supported nozzles at X=-7,Y=±2.8; broad dark throats and small luminous cores.

Pivot / parent: Fixed sockets HOOK_DRIVE_PORT/STBD.

Collision: Included in hull proxy.

## Animation recipe

| Clip / phase | Initial duration | Action |
|---|---:|---|
| Idle duty | 6 s | Sensor sweeps ±12 degrees; paddles remain in the exact clearance state. Cosmetic beacon breathes, never strobes. |
| Clearance | 0.65 s | Open paddle turns from transverse to longitudinal using smoothstep. Start from last pose when interrupted. |
| Hold | 0.35 s | Close the relevant paddle; establish HOLD text immediately, before visual interpolation. |
| Acknowledgment | 0.8 s | One spare paddle dips once after confirmed docking. Never repeat while the event receipt is duplicated. |

Critical read: At the 60-degree gameplay camera, the three paddles must be distinguishable at 100 px body width. Put no meaningful cue solely beneath the hull.

## AI / behavior

Deterministic service state machine: OFF_DUTY → HOLD → GUIDE → ACKNOWLEDGE. Read the existing corridor owner’s clearance and target identity. A request is not a clearance. HOLD wins whenever the actual service refuses. Reevaluate at 10 Hz; urgent corridor revocation is event-driven on the next sim tick. A kinematic tender follows a bounded service path with a swept clearance test; it never steers the player, teleports a vessel, or invents traffic permissions.

## Physical truth

The body is a slow service vehicle, not an immovable barrier. Do not use a giant invisible collider around the crossbar. If pushed outside its service box, enter RECOVER and let the existing traffic/physics owners return it by forces; guidance can continue through the ordinary HUD. A destroyed tender removes its model and personal barks, but never disables ordinary docking.

## Choices and counterplay

Follow the visual lane, request ordinary text guidance, or ignore the character and dock normally. Clean approaches earn recognition only; no precision penalty, unavoidable tutorial, or new currency.

## Failure and alternative outcomes

Collision produces a factual harbor warning through the normal law/incident owner. If the player causes damage, a repair/restitution job can appear; an unrelated NPC collision must not be attributed to the player. Save during GUIDE restores the authoritative clearance rather than replaying the acknowledgment.

## Personality and sound

Dry, unhurried, lightly resonant machine speech with a soft electromechanical click before sentences. Keep consonants clear; no vocoder on critical instructions. This character is courteous, not another wisecracking mascot.

**first_clearance:** “Latch Nine. Follow the open arm. The closed one is not a suggestion.”

**hold:** “Hold outside the throat. Something larger has right of way.”

**clean_repeat:** “Same ship. Better angle. Welcome back.”

**player_collision:** “That was the station. It has filed no intention to move.”

**repair_paid:** “Repairs recorded. Your next approach begins without a grudge.”

Dialogue defaults: once-only first reveal; persistent dedupe for milestone lines; repeat flavor no more than once per 90 sim seconds per character, and only when the shared voice arbiter grants the slot. Threat cues are governed by attack state, not that flavor cooldown. Stop stale lines when their target/phase disappears. Captions retain speaker and factual meaning.

## Rewards / economy boundary

No credits for routine docking. Any restitution payment uses the existing economy/law path and an incident idempotency key.

## Save-state contract

met:boolean, cleanArrivals:uint<=100000, incidentIds:last 16, destroyed:boolean. Do not persist transient clearance, Three objects, or animation handles.

## Existing integration seams

- `src/systems/dockingCorridor.js`
- `src/systems/stationBroadcast.js`
- `src/ui/voiceArbiter.js`
- `src/data/sectorAnchors.js`

These paths are starting points, not invented callable APIs. Read the live owners and current schemas before implementation. New concept helpers should emit to the owner rather than write its resource directly.

## Dependencies and packet sequence

No other new concept required.

Audit → behavior proof and model in parallel → presentation → normal-route integration → acceptance. Packet ids `SF20-01-A` through `-F` are in the task graph.

## Specific acceptance cases

1. Deny docking while an animation is opening: the UI and corridor still deny it.
2. Disable the character: every original docking route remains usable.
3. Ram from three bearings: the visible body and collision proxy agree.
4. Load after a completed arrival: no duplicate bark or reward.
5. Recognize HOLD and CLEAR with grayscale, sound muted, and reduced motion enabled.

## Player test

In a five-person formative test, ask players to locate the valid approach within five seconds without reading a help page; target four of five. Compare wrong-throat approaches against a baseline. This is a proposed acceptance threshold, not measured evidence.

## Completion boundary

Require all shared gates in `production/TEST_PLAN.md`, the specific cases above, a normal-route encounter capture, top/chase/close model review, save/load evidence and matched performance measurements. This packet is not implemented or playtested merely because its plan and art exist. The art GLB is a non-shipping blockout; build the real asset through `production/ASSET_PIPELINE.md`.


---

# 02 — Sable Venn & the Patchwork

SF20-02 | Shipwright / mobile workshop | Build wave 2 | DESIGN PROPOSAL

![Original procedural concept render](art/02_sable_venn.png)

## Player-experience purpose

A human shipwright flying a three-hulled workshop. She demonstrates the behavior of a proposed module on a captive test sled, then lets the player fit the real item through the existing service.

**Gap / hypothesis:** Ship fitting can have meaningful numbers without making the new capability perceptually obvious. A visible demonstration bridges loadout selection and field behavior.

**Existing overlap to preserve:** Reuse ships, buildIdentity, crafting and ORRERY. Sable offers diagnoses and demonstrations, not another fitting database or independent stat writer. Her workshop is not MORROW’s rescue automaton.

Repository evidence: [R02](https://github.com/coldshalamov/SpaceFace/blob/1e0cf9499613b7c3acad10f34739278136d3d469/design/VISION.md), [R03](https://github.com/coldshalamov/SpaceFace/blob/1e0cf9499613b7c3acad10f34739278136d3d469/AGENTS.md), [R04](https://github.com/coldshalamov/SpaceFace/blob/1e0cf9499613b7c3acad10f34739278136d3d469/tools/blender/forge/FORGE.md), [R07](https://github.com/coldshalamov/SpaceFace/blob/1e0cf9499613b7c3acad10f34739278136d3d469/src/core/registry.js#L1-L170). See the inspection limits in `production/SOURCES.md`.

## First encounter

After the first purchased module, a contract introduces Sable in a Ceres service pocket. The Patchwork unfolds one work arm and pushes a low-mass test sled against a visible damper. Selecting an impulse module changes the next demonstration; selecting a shield module exposes a supported shield projector. The receipt names exactly what changed.

## Where and when

One workshop traffic slot in sector_ceres_belt, near a service anchor but outside mining paths. Station service opens the familiar existing fit screen; a small adjacent preview pane is optional and pausable. Do not require in-flight UI manipulation.

## Repeat loop

Inspect an actual installed item → see one specific effect → compare a compatible alternative → confirm through the shipped transaction → test in flight. The demo is a truthful read-only forecast, never an extra source of stats.

## Visual and model recipe

Three parallel hulls joined by two visible crossbeams. Central office has warm windows, port pontoon stores dark tool wells, starboard pontoon carries a folded orange arm. One cobalt identity stripe; workshop orange appears only as standardized hazard paint.

Author envelope: 34 × 25 × 9 m, +X nose / +Y port / +Z up. Proposed gameplay semantic radius: 27 WU (0 means not an independently targeted world body); proposed mass: 260 internal units (0 means static/preview, not a massless dynamic body). These are design targets, not final measured asset bounds. Runtime scale must follow the actual Forge/entity contract.

LOD triangle targets: 32,000 / 12,800 / 5,800; proposed near draw budget 12; nearby concept cap 1. Numbers are budgets to verify, never permission to bypass spawnBudget.

### ROOT_PATCHWORK

Build: Three lofts along X, center length 32 m and outboard lengths 23 m at Y=±9.5. Cut obvious 3 m negative spaces between bodies.

Pivot / parent: Center of central hull; +X nose.

Collision: Three convex lobes, not one box spanning all gaps.

### BRIDGES

Build: Two 2.2 m wide plate crossbeams at X=-7,+6 with dark undersides and supported cable trunks.

Pivot / parent: Fixed.

Collision: Two simple beams only where collidable.

### ARM_BASE/ELBOW/CLAMP

Build: Upper link 5 m, forearm 4 m, jaws 1.3 m. Build pivots before connecting panels; all links remain visibly attached.

Pivot / parent: Base at (-2,-11,2), elbow local (5,0,0), Z-axis hinges.

Collision: Preview arm non-colliding; field-service arm only via existing interaction owner.

### TEST_SLED

Build: A 4×3×1 m replaceable test plate with two orange end caps and a recessed socket.

Pivot / parent: Independent root for lab scene.

Collision: One box, mass 12 in isolated demo only.

### WINDOWS/TOOLS

Build: Instance window boxes; 6 unique large tool shapes, not hundreds of micro-greebles.

Pivot / parent: All fixed outside the arm articulation.

Collision: None.

## Animation recipe

| Clip / phase | Initial duration | Action |
|---|---:|---|
| Unfold | 1.8 s | Upper arm swings 60 degrees and forearm opens 85 degrees in sequence; arm final location clears the selected item. |
| Demo impulse | 2.4 s | Use the actual preview simulation’s force result; do not animate an invented trajectory. |
| Fit receipt | 0.6 s | Clamp closes around the display item after the real transaction succeeds; on denial remain open. |
| Park | 1.6 s | Return from current pose, not from a presumed fully extended state. |

Critical read: A single item model receives focus. Background workshop motion stops during reading under reduced motion. Do not duplicate the full shipworks frontend.

## AI / behavior

Service FSM: TRANSIT, AVAILABLE, PREVIEW, AWAIT_COMMIT, DEMONSTRATE, DEPART. The human personality is expressed through authored conditional lines, not online model inference. Itinerary belongs to traffic; quotes are immutable snapshots of the current catalog revision and inventory. Recheck price, compatibility and stock on commit. Preview data is derived from a temporary isolated fit copy, never the live player state.

## Physical truth

The workshop moves only while no service is active. The demonstration should use a separate small scene or existing lab state with its own entity namespace, never live world entities hidden off camera. Close/reopen must destroy that state. A replay should not advance campaign RNG. In the world the hull is heavy but pushable; docking assistance is owned by dockingCorridor.

## Choices and counterplay

Buy, retain current equipment, request a demo, or leave. Show one benefit and one cost, such as impulse versus cargo mass. Never imply every purchase is an upgrade.

## Failure and alternative outcomes

No funds or incompatible slots leave the current fit unchanged and explain the exact denial at the action. Workshop destruction cannot delete player-owned gear or a pending paid purchase. A service interrupted before commit costs nothing.

## Personality and sound

Warm contralto or low mezzo, close-mic conversational delivery; practical and exact, with amusement reserved for preventable mistakes. No celebrity imitation. Human portrait may be a later separately scoped asset; the shipped character can live through her ship, comms and hands-on demonstrations.

**intro:** “Sable Venn. I fix the part between what a ship promises and what it does.”

**impulse_demo:** “More shove. More mass. Nothing in that sentence was free.”

**incompatible:** “That mount cannot carry it. The catalog does not get a vote.”

**keep_old:** “Then keep the old one. Knowing your tools is also an upgrade.”

**return_after_test:** “Tell me what it did. Not what the label said.”

Dialogue defaults: once-only first reveal; persistent dedupe for milestone lines; repeat flavor no more than once per 90 sim seconds per character, and only when the shared voice arbiter grants the slot. Threat cues are governed by attack state, not that flavor cooldown. Stop stale lines when their target/phase disappears. Captions retain speaker and factual meaning.

## Rewards / economy boundary

Normal catalog prices; no free upgrades from repeat demonstrations. The first tutorial can use an already-budgeted mission coupon, never a new unconditional grant.

## Save-state contract

met:boolean, demonstratedItemIds:bounded set of catalog ids, lastReceiptId:string|null. Actual inventory, fit and money remain under their existing owners.

## Existing integration seams

- `src/systems/ships.js`
- `src/systems/buildIdentity.js`
- `src/systems/crafting.js`
- `src/ui/orrery/`

These paths are starting points, not invented callable APIs. Read the live owners and current schemas before implementation. New concept helpers should emit to the owner rather than write its resource directly.

## Dependencies and packet sequence

SF20-19

Audit → behavior proof and model in parallel → presentation → normal-route integration → acceptance. Packet ids `SF20-02-A` through `-F` are in the task graph.

## Specific acceptance cases

1. Preview ten modules and cancel: live fit, credits and RNG state remain byte-equivalent.
2. Commit after inventory changes: revalidation refuses the stale quote.
3. Compare displayed impulse and heat with measured values in the same preview configuration.
4. Open/close preview fifty times: no retained meshes, listeners or physics worlds.
5. Keyboard and controller can select, compare, confirm and return without a hover-only action.

## Player test

Ask players to explain one tradeoff of the chosen module and then demonstrate it in flight. Target correct explanation by four of five first-time testers; record rather than infer improvement.

## Completion boundary

Require all shared gates in `production/TEST_PLAN.md`, the specific cases above, a normal-route encounter capture, top/chase/close model review, save/load evidence and matched performance measurements. This packet is not implemented or playtested merely because its plan and art exist. The art GLB is a non-shipping blockout; build the real asset through `production/ASSET_PIPELINE.md`.


---

# 03 — Tally-3, Claim Assessor

SF20-03 | Salvage character / ownership | Build wave 1 | DESIGN PROPOSAL

![Original procedural concept render](art/03_tally_3.png)

## Player-experience purpose

A narrow tug with two folding balance arms and a large circular stamp mechanism. It is obsessed with evidence, but willing to correct the ledger—including in the player’s favor.

**Gap / hypothesis:** Physical salvage needs legible ownership and provenance at the instant a player is deciding to tow it. Existing consequence systems should be understandable before a theft, not only afterward.

**Existing overlap to preserve:** Extend salvage, claims and provenanceLedger. BRACKET sorts scrap into a sport; Tally examines legal claim evidence. Its weighing gesture is presentation, not a second economy algorithm.

Repository evidence: [R03](https://github.com/coldshalamov/SpaceFace/blob/1e0cf9499613b7c3acad10f34739278136d3d469/AGENTS.md), [R07](https://github.com/coldshalamov/SpaceFace/blob/1e0cf9499613b7c3acad10f34739278136d3d469/src/core/registry.js#L1-L170), [R10](https://github.com/coldshalamov/SpaceFace/blob/1e0cf9499613b7c3acad10f34739278136d3d469/src/data/bracket.js). See the inspection limits in `production/SOURCES.md`.

## First encounter

At the first qualifying wreck in Ceres, Tally extends a scanner arm toward a crate. Its projector displays three plain states: owned, disputed, unclaimed. A selected object reveals the cited incident that produced the status. A player can recover the owner’s crate, dispute a stale claim with real evidence, or openly steal.

## Where and when

Use an existing derelict-field or salvage-yard anchor in sector_ceres_belt. One assessor may be assigned to a site, not one per wreck. Approach disclosure inside 420 WU; no ambient UI for every shard.

## Repeat loop

Select wreck → inspect claim and value basis → tow to matching receiver → obtain a causal receipt. Subsequent visits acknowledge recoveries or unresolved incidents. No requirement to sit through paperwork for ordinary unclaimed scrap.

## Visual and model recipe

Long dark spine and two unequal perpendicular balance beams; amber circular stamp at the stern. Distinct T shape seen overhead. Pale slate panels with a single ochre band, unlike Latch’s three-paddle signal gantry.

Author envelope: 22 × 18 × 6 m, +X nose / +Y port / +Z up. Proposed gameplay semantic radius: 20 WU (0 means not an independently targeted world body); proposed mass: 180 internal units (0 means static/preview, not a massless dynamic body). These are design targets, not final measured asset bounds. Runtime scale must follow the actual Forge/entity contract.

LOD triangle targets: 18,000 / 7,200 / 3,200; proposed near draw budget 10; nearby concept cap 1. Numbers are budgets to verify, never permission to bypass spawnBudget.

### ROOT_TALLY

Build: Loft 22 m long, half-width 2.6 m; taper nose to 1.1 m and thicken rear to carry stamp.

Pivot / parent: Center.

Collision: One convex spine.

### ARM_LEFT/RIGHT

Build: Two 7 m trusses, right 1.5 m shorter; attached scan heads 1.3 m diameter.

Pivot / parent: Z hinges at X=0,Y=±2.5.

Collision: Non-colliding peripheral instruments.

### STAMP

Build: Annulus outer radius 2.6 m, inner 1.6 m, carried on solid U bracket; face has three large raised bars, no tiny text.

Pivot / parent: Rear at X=-7,Z=2.5; spindle +Z.

Collision: No extra collider.

### CLAIM_CRADLE

Build: Two gold triangular pads in a V, 3.5 m apart, with clearly open middle.

Pivot / parent: X=5; fixed.

Collision: Sensor volume only; no invisible suction.

### SCAN_SOCKET

Build: Dark aperture inset beneath forward plate.

Pivot / parent: HOOK_SCAN at X=8,Z=1.5.

Collision: None.

## Animation recipe

| Clip / phase | Initial duration | Action |
|---|---:|---|
| Assess | 1.4 s | Arms unfold from 20 to 75 degrees; one slow scan passes over selected object. |
| Disputed | 2 s | Stamp remains suspended; arms hold asymmetrically. Pair the pose with a textual status. |
| Receipt | 0.45 s | Stamp travels 0.35 m once, after the owner emits the accepted transaction receipt. |
| Withdraw | 1.1 s | Fold arms before itinerary resumes; incomplete claims remain incomplete. |

Critical read: The three claim states need distinct icons and words; never rely on green/yellow/red alone. Do not place a giant status banner over the wreck.

## AI / behavior

PATROL_SITE → INSPECT_SELECTED → OFFER → WAIT_DELIVERY → RECEIPT. Selection and hail are player intents. The assessor reads the existing owner/provenance records and returns reason codes, not a generated legal opinion. Recalculate on relevant ledger revision, not every frame. Do not classify every object by scanning the whole entity map; use the site/selection indices. No automatic confiscation from proximity.

## Physical truth

A claim cradle requires the real cargo body to enter the receiver with relative speed below a proposed 8 WU/s and an explicit delivery intent. This does not transfer ownership until cargo/economy validates it. Keep tether joints intact until that accepted transfer. Duplicate collision events never pay twice.

## Choices and counterplay

Deliver honestly, contest a claim using already-discovered evidence, or steal with the consequence visible beforehand. A disputed object stays physically manipulable; the UI must not confuse disputed with untouchable.

## Failure and alternative outcomes

If Tally is damaged, use the ordinary station receiver for delivery. Missing evidence can be found later; no fabricated witness appears to force the preferred ending. Save a receipt-id set bounded to the active site plus the existing durable ownership ledger.

## Personality and sound

An almost musical monotone that pauses before important nouns. Its humor comes from literal classification. Warmth appears when somebody returns an object that nobody expected to see again.

**unclaimed:** “No living claim. That is a status, not a blessing.”

**owned:** “Owner identified. You may still move it. Moving is not owning.”

**evidence:** “The record is wrong. How inconvenient for the record.”

**return:** “Returned intact. I will round nothing down.”

**theft:** “Transfer observed. Consent remains conspicuously absent.”

Dialogue defaults: once-only first reveal; persistent dedupe for milestone lines; repeat flavor no more than once per 90 sim seconds per character, and only when the shared voice arbiter grants the slot. Threat cues are governed by attack state, not that flavor cooldown. Stop stale lines when their target/phase disappears. Captions retain speaker and factual meaning.

## Rewards / economy boundary

Standard salvage value, with any contract premium applied once through the normal owner; no passive income or repeated appraisal reward.

## Save-state contract

met:boolean, activeWreckId:string|null, lastEvidenceRevision:uint, localReceiptIds:last 32. Ownership and claims are references, not duplicated snapshots.

## Existing integration seams

- `src/systems/salvage.js`
- `src/systems/claims.js`
- `src/systems/provenanceLedger.js`
- `src/data/contactHail.js`

These paths are starting points, not invented callable APIs. Read the live owners and current schemas before implementation. New concept helpers should emit to the owner rather than write its resource directly.

## Dependencies and packet sequence

No other new concept required.

Audit → behavior proof and model in parallel → presentation → normal-route integration → acceptance. Packet ids `SF20-03-A` through `-F` are in the task graph.

## Specific acceptance cases

1. Tow an owned crate without confirming: no sale occurs.
2. Replay the delivery collision ten times: one transfer and one payment.
3. Change claimant before confirming: the old offer invalidates.
4. Load with a tethered crate: body, owner and receiver still agree.
5. Destroy assessor: station fallback still resolves the contract.

## Player test

Before confirming a haul, testers correctly predict whether the action is recovery, salvage or theft. Log prediction versus actual consequence.

## Completion boundary

Require all shared gates in `production/TEST_PLAN.md`, the specific cases above, a normal-route encounter capture, top/chase/close model review, save/load evidence and matched performance measurements. This packet is not implemented or playtested merely because its plan and art exist. The art GLB is a non-shipping blockout; build the real asset through `production/ASSET_PIPELINE.md`.


---

# 04 — Ilex Seed Ark

SF20-04 | Civilian convoy / fragile cargo story | Build wave 2 | DESIGN PROPOSAL

![Original procedural concept render](art/04_ilex_seed_ark.png)

## Player-experience purpose

A slow seed-bank ship carrying six detachable botanical vaults. Each vault is physically recoverable, so losing the hull does not erase every meaningful objective.

**Gap / hypothesis:** An escort target can feel like a health bar on rails. Visible, separable cargo gives protecting a ship several recoverable outcomes instead of one binary failure.

**Existing overlap to preserve:** Reuse escort missions, fragileCargo, traffic and cargo ownership. This is cultivated human seed stock, not a second alien infection, and not an extension of the Vethari mythology.

Repository evidence: [R01](https://github.com/coldshalamov/SpaceFace/blob/1e0cf9499613b7c3acad10f34739278136d3d469/README.md), [R03](https://github.com/coldshalamov/SpaceFace/blob/1e0cf9499613b7c3acad10f34739278136d3d469/AGENTS.md), [R07](https://github.com/coldshalamov/SpaceFace/blob/1e0cf9499613b7c3acad10f34739278136d3d469/src/core/registry.js#L1-L170). See the inspection limits in `production/SOURCES.md`.

## First encounter

A convoy crosses Tethys with six green glasshouse lobes supported around a blunt central hull. A pirate attack damages the rear coupling. The captain asks the player to choose: cover the remaining convoy, tow the drifting vault, or call a responder while following the main ship.

## Where and when

Add one authored mission convoy to an existing Tethys-to-Ceres route after one successful delivery. Use actual route nodes; no invented adjacent sector. The first incident happens in a broad pocket with at least two escape lines, never while docking.

## Repeat loop

Accept a contract with explicit cargo stakes → read attack or coupling damage → choose which objects to protect → deliver remaining vaults → see a local greenhouse react later. Repeat variants change which vault fails and where pirates approach, not the rules.

## Visual and model recipe

Six oval conservatory pods around a blunt seed-shaped central hull, in two rows of three. Broad dark connecting struts and lime identity bands. Warm speckled windows suggest cultivation without rendering thousands of plants.

Author envelope: 46 × 30 × 12 m, +X nose / +Y port / +Z up. Proposed gameplay semantic radius: 34 WU (0 means not an independently targeted world body); proposed mass: 420 internal units (0 means static/preview, not a massless dynamic body). These are design targets, not final measured asset bounds. Runtime scale must follow the actual Forge/entity contract.

LOD triangle targets: 36,000 / 14,400 / 6,500; proposed near draw budget 12; nearby concept cap 1. Numbers are budgets to verify, never permission to bypass spawnBudget.

### ROOT_ILEX

Build: Central loft 42 m long, width 8 m, stepped dorsal greenhouse spine.

Pivot / parent: Center.

Collision: One central convex proxy.

### VAULT_01..06

Build: Six identical 9×5×4 m rounded capsules; green glazing is opaque tinted geometry with plant silhouettes inside a shallow recess.

Pivot / parent: At X=-12,0,12; Y=±10; independent release roots.

Collision: One convex per pod while attached; independent dynamic body only on actual severance.

### COUPLINGS

Build: Two supported beams per pod with large break collars; each collar is targetable as an authored subsystem.

Pivot / parent: Root-local socket at each pod center.

Collision: At most one enabled damage trigger per coupling.

### CANOPY_PANELS

Build: Baked dark foliage shapes beneath 12 broad roof ribs. No real transparent inner jungle.

Pivot / parent: Fixed to pod.

Collision: None.

### DRIVE_BANK

Build: Four recessed rear engines on the central hull; pod utility thrusters remain small.

Pivot / parent: Named nozzle sockets.

Collision: Central proxy only.

## Animation recipe

| Clip / phase | Initial duration | Action |
|---|---:|---|
| Cruise | 5 s | Very slow ventilation louver movement; pods are rigidly attached, not jelly. |
| Coupling fail | 0.7 s | Crack collar, vent two short puffs, then release only after authoritative subsystem loss. |
| Vault safe | 1.1 s | Warm window band returns steadily when a delivered vault has power. |
| Damaged | 2 s | One louver jams, window segment dims; no full-body strobe. |

Critical read: Six pods read as six large shapes at gameplay zoom. A selected pod has one integrity readout; avoid six competing bars over the ship.

## AI / behavior

Convoy phases: ASSEMBLE, DEPART, TRANSIT, INCIDENT, SPLIT_RESPONSE, ARRIVE. Traffic owns navigation. Mission owner tracks six stable vault ids and distinguishes attached, drifting, delivered, destroyed and lost. A captain chooses the safe gate based on observed threats; it never waits forever for one remote pod. Reinforcements, responders and pirates all request spawn budget. Narrative lines use actual vault status.

## Physical truth

Start each pod as part of the parent compound body; on severance calculate its initial linear velocity as parent linear velocity plus angular velocity cross socket offset. Remove the matching parent collider before enabling the pod body, preserving total mass and avoiding double collisions. A pod supports Massline towing and fragileCargo shock/heat receipts. Never fake breakage by hiding a mesh while keeping its collision.

## Choices and counterplay

Protect the ship, recover a pod, or delegate a rescue when a legitimate responder is present. No secret best route: the consequences and timing are visible. The captain can refuse a dangerous shortcut without blocking all alternatives.

## Failure and alternative outcomes

Losing some pods reduces deliveries, not the whole campaign. If all are destroyed, retain an investigation and restitution branch. Offscreen simulation resolves the same ownership outcomes conservatively; it does not quietly regenerate missing pods.

## Personality and sound

Captain Ilex speaks gently and clinically under pressure. The cargo is precious, but she never berates the player for choosing a rescue over a bonus. Use short counting phrases during the incident.

**depart:** “Six vaults. Most of what they carry has never seen a sky.”

**severed:** “Vault four is free. The ship can continue. The choice is yours.”

**tow:** “Slowly. The roots will forgive distance before they forgive shock.”

**partial:** “Four arrived. Four is a future.”

**total_loss:** “Bring back the recorder. We still owe them an explanation.”

Dialogue defaults: once-only first reveal; persistent dedupe for milestone lines; repeat flavor no more than once per 90 sim seconds per character, and only when the shared voice arbiter grants the slot. Threat cues are governed by attack state, not that flavor cooldown. Stop stale lines when their target/phase disappears. Captions retain speaker and factual meaning.

## Rewards / economy boundary

Base escort pay plus per-vault accepted delivery value. Total offered compensation stays within the comparable existing escort budget; no reward for repeatedly detaching and reattaching pods.

## Save-state contract

missionId, vaultIds[6], per-vault outcome enum, captainAlive, deliveryReceiptIds. Use mission and cargo owners for persistence; no parallel inventory.

## Existing integration seams

- `src/systems/missions.js`
- `src/systems/traffic.js`
- `src/systems/fragileCargo.js`
- `src/systems/cargo.js`

These paths are starting points, not invented callable APIs. Read the live owners and current schemas before implementation. New concept helpers should emit to the owner rather than write its resource directly.

## Dependencies and packet sequence

SF20-03

Audit → behavior proof and model in parallel → presentation → normal-route integration → acceptance. Packet ids `SF20-04-A` through `-F` are in the task graph.

## Specific acceptance cases

1. Sever a rotating pod: velocity matches the rigid-body point velocity.
2. Save during severance and reload: no duplicate capsule or lost mass.
3. Deliver 0,1,5,6 pods: all outcomes lead somewhere coherent.
4. Escort exits sector while player tows: route and destination remain resolvable.
5. One NPC damages a pod: provenance does not blame the player.

## Player test

Measure how often partial loss leads to continued play rather than reload. Interview players about the choice they believed they made; do not equate any particular choice with success.

## Completion boundary

Require all shared gates in `production/TEST_PLAN.md`, the specific cases above, a normal-route encounter capture, top/chase/close model review, save/load evidence and matched performance measurements. This packet is not implemented or playtested merely because its plan and art exist. The art GLB is a non-shipping blockout; build the real asset through `production/ASSET_PIPELINE.md`.


---

# 05 — Red Kite

SF20-05 | Courier / noncombat rival | Build wave 1 | DESIGN PROPOSAL

![Original procedural concept render](art/05_red_kite.png)

## Player-experience purpose

A red asymmetrical courier whose deliveries become optional head-to-head relay challenges. It will race your ship, not your statistics, and will never cheat by teleporting ahead.

**Gap / hypothesis:** Physics mastery deserves a recurring social witness outside combat. A courier who respects a clean run creates motivation without becoming another adaptive boss.

**Existing overlap to preserve:** The repo already has nemesis, aceMemory and Orra. Red Kite does not learn a counter-build or occupy that arc. Reuse route following and stunt evidence; no new racing control scheme.

Repository evidence: [R02](https://github.com/coldshalamov/SpaceFace/blob/1e0cf9499613b7c3acad10f34739278136d3d469/design/VISION.md), [R03](https://github.com/coldshalamov/SpaceFace/blob/1e0cf9499613b7c3acad10f34739278136d3d469/AGENTS.md), [R07](https://github.com/coldshalamov/SpaceFace/blob/1e0cf9499613b7c3acad10f34739278136d3d469/src/core/registry.js#L1-L170), [R11](https://github.com/coldshalamov/SpaceFace/blob/1e0cf9499613b7c3acad10f34739278136d3d469/src/systems/nemesis.js#L1-L100). See the inspection limits in `production/SOURCES.md`.

## First encounter

A narrow red courier makes a clean slingshot around a Ceres work anchor, then offers a short delivery relay. Three buoys mark the ordered handoff points. The player can win by choosing a better physical route, not by entering a menu minigame.

## Where and when

One optional contact on a surveyed Ceres route outside dense traffic. Challenges unlock after the player has voluntarily used the Massline. Course gates are ordinary map-visible anchors and never obstruct essential transport.

## Repeat loop

Hail → inspect the 60–90 second course and collision policy → accept → cross ordered gates with the real ship → receive a grounded reaction. Alternate cargo-mass classes use the same course. Ghost records are optional presentation, never targetable enemies.

## Visual and model recipe

Thin red dart with one large triangular sail-fin to port and a short counterbalancing engine pod to starboard. A sharply visible dark fork at the stern distinguishes it from ordinary wasps. No feather motif.

Author envelope: 23 × 17 × 5 m, +X nose / +Y port / +Z up. Proposed gameplay semantic radius: 17 WU (0 means not an independently targeted world body); proposed mass: 32 internal units (0 means static/preview, not a massless dynamic body). These are design targets, not final measured asset bounds. Runtime scale must follow the actual Forge/entity contract.

LOD triangle targets: 18,000 / 7,200 / 3,200; proposed near draw budget 9; nearby concept cap 1. Numbers are budgets to verify, never permission to bypass spawnBudget.

### ROOT_KITE

Build: Loft from X=-10 to +12, width 2.4 m at cockpit, 1 m at nose; split the stern into two prongs.

Pivot / parent: Center; +X forward.

Collision: One narrow convex hull.

### SAIL

Build: CCW plate with points (-7,3),(0,10),(8,3),(3,2), thickness 0.28 m and dark raised leading edge.

Pivot / parent: Supported at port spar.

Collision: One slim convex prism only where reachable.

### OUTRIGGER

Build: 5 m engine pod at Y=-5, carried by a 1.2 m thick spar.

Pivot / parent: Root socket X=-4.

Collision: One small hull proxy merged where possible.

### CONTROL_FLAP

Build: Separate 4×1.2 m panel cut from trailing sail edge.

Pivot / parent: Hinge parallel X.

Collision: Render-only.

### COURIER_CANISTER

Build: One 2×1 m canister under a visible dorsal clamp.

Pivot / parent: X=2,Z=1.6.

Collision: No separate body except authored handoff.

## Animation recipe

| Clip / phase | Initial duration | Action |
|---|---:|---|
| Coast | 3 s | Flap settles to 4 degrees; engine intensity follows true throttle. |
| Hard turn | 0.3 s | Flap deflects up to 18 degrees proportional to actual angular acceleration, clamped. |
| Challenge | 0.8 s | Two alternated navigation-light pulses with modest contrast; text carries the offer. |
| Handoff | 0.7 s | Clamp opens after gate/receiver confirmation, never at a guessed distance. |

Critical read: Ghosts must be thin, labeled and non-colliding, and can be disabled. Use real gate order on the map; do not draw an autopilot ribbon that claims to know the optimal physics path.

## AI / behavior

AWAIT, COUNTDOWN, RACE, ABORT, FINISH. Courier uses the shipped force/steering stack with a preauthored route corridor and known thrust limits. Do not directly set position or introduce rubber-banding. Start consumes a mission-local deterministic seed for optional course variants only. Gate crossing uses swept segment tests, ordered indices and a minimum forward crossing; circles around the same gate do not score. Abort on combat escalation or course obstruction that invalidates safe play.

## Physical truth

Use the same mass, thrust and collision rules as other ships. A demonstration may be a recorded verified trajectory, clearly labeled replay, but a live opponent must physically fly it. Challenge gates are sensors, not solid hoops placed as accidental traps. Gate radius is set from a safe multiple of the selected hull radius, then locked for that challenge class.

## Choices and counterplay

Take the direct turn, use an anchor to conserve momentum, accept a heavier cargo class, or decline. A novice can lose without losing inventory; expert prestige comes from a clean, faster route.

## Failure and alternative outcomes

Collision remains ordinary physics; no artificial crash penalty layered over damage. A third-party attack cancels the clock and returns any escrow through the owner. A courier destroyed in the campaign stays gone; a public timing buoy can keep courses accessible without pretending the person survived.

## Personality and sound

Fast but intelligible, playful rather than taunting; a pilot who loves the shape of a good trajectory. Avoid constant chatter during turns.

**offer:** “Three handoffs. One clean run. I will try not to look impressed.”

**sling:** “That was not the short route. It was the clever one.”

**loss:** “I got there first. You got there interestingly.”

**win:** “Fine. I am stealing that corner.”

**attack_abort:** “Clock is dead. People first. Get clear.”

Dialogue defaults: once-only first reveal; persistent dedupe for milestone lines; repeat flavor no more than once per 90 sim seconds per character, and only when the shared voice arbiter grants the slot. Threat cues are governed by attack state, not that flavor cooldown. Stop stale lines when their target/phase disappears. Captions retain speaker and factual meaning.

## Rewards / economy boundary

One first-completion mission reward, then best-time recognition and cosmetic courier decals only. No repeatable high-yield cash race that replaces the economy.

## Save-state contract

met, courierDestroyed, bestTimesByCourseAndHullClass:bounded 12, cleanCompletions, courseVersion. Store times in sim ticks; reject replay records with a different course version.

## Existing integration seams

- `src/systems/routeFollower.js`
- `src/systems/stuntGrammar.js`
- `src/systems/missions.js`
- `src/systems/traffic.js`

These paths are starting points, not invented callable APIs. Read the live owners and current schemas before implementation. New concept helpers should emit to the owner rather than write its resource directly.

## Dependencies and packet sequence

No other new concept required.

Audit → behavior proof and model in parallel → presentation → normal-route integration → acceptance. Packet ids `SF20-05-A` through `-F` are in the task graph.

## Specific acceptance cases

1. Run identical inputs at 30/60/144 render FPS: finish tick is equal.
2. Cross gate backward or twice: no illegitimate advancement.
3. Block a course with a heavy wreck: race aborts cleanly rather than teleporting.
4. Trigger combat on the last gate: no simultaneous win and refund.
5. Inspect a losing opponent: its thrust and speed stay within the same authored definition.

## Player test

Players can describe how their chosen route affected the time. Repeat participation without cash grinding is the retention signal; target one voluntary retry in a formative session.

## Completion boundary

Require all shared gates in `production/TEST_PLAN.md`, the specific cases above, a normal-route encounter capture, top/chase/close model review, save/load evidence and matched performance measurements. This packet is not implemented or playtested merely because its plan and art exist. The art GLB is a non-shipping blockout; build the real asset through `production/ASSET_PIPELINE.md`.


---

# 06 — The Towline Table

SF20-06 | Mutual-aid crew / social faction identity | Build wave 2 | DESIGN PROPOSAL

![Original procedural concept render](art/06_towline_table.png)

## Player-experience purpose

Three mismatched civilian tugs share a common white diagonal stripe and a habit: nobody finishes a shift with a colleague still drifting. Membership is enacted through work, not purchased through a menu.

**Gap / hypothesis:** Faction numbers and rescue traffic do not by themselves create a community that feels accountable to individual people. A small recurring work crew can connect help, collateral and repayment.

**Existing overlap to preserve:** A named occupational circle inside faction_free, not a new ninth political faction or separate reputation scale. Existing Morrow handles a singular rescue encounter; this crew coordinates several ordinary working ships and records reciprocal obligations.

Repository evidence: [R02](https://github.com/coldshalamov/SpaceFace/blob/1e0cf9499613b7c3acad10f34739278136d3d469/design/VISION.md), [R03](https://github.com/coldshalamov/SpaceFace/blob/1e0cf9499613b7c3acad10f34739278136d3d469/AGENTS.md), [R07](https://github.com/coldshalamov/SpaceFace/blob/1e0cf9499613b7c3acad10f34739278136d3d469/src/core/registry.js#L1-L170), [R09](https://github.com/coldshalamov/SpaceFace/blob/1e0cf9499613b7c3acad10f34739278136d3d469/src/data/contactHail.js#L1-L110). See the inspection limits in `production/SOURCES.md`.

## First encounter

After the player resolves a real stuck-tow or salvage recovery, one tug returns to thank them while the others complete the route. At the next shared service stop, the crew offers a bounded cleanup job: help clear a lane that the player or another witnessed incident obstructed.

## Where and when

Use existing rescue/tug traffic roles at Ceres and Tethys. At most three named hull identities in persistent records, with only nearby authorized work slots instantiated. Their rendezvous is an existing yard, not a new station.

## Repeat loop

Observe actual trouble → help or decline → retain a named receipt → see a later tangible return such as an available escort or waived service labor. Favor can be exhausted; it is not a magical rescue button or currency farm.

## Visual and model recipe

Three compact work-hull variations: a broad clamp tug, a narrow winch tug, and a flat rescue skiff. Shared white slash cut into orange/teal working paint; otherwise deliberately different silhouettes. The crew’s emblem is a three-ended knot, not a human organization’s logo.

Author envelope: 25 × 19 × 7 m, +X nose / +Y port / +Z up. Proposed gameplay semantic radius: 21 WU (0 means not an independently targeted world body); proposed mass: 180 internal units (0 means static/preview, not a massless dynamic body). These are design targets, not final measured asset bounds. Runtime scale must follow the actual Forge/entity contract.

LOD triangle targets: 22,000 / 8,800 / 4,000; proposed near draw budget 10; nearby concept cap 3. Numbers are budgets to verify, never permission to bypass spawnBudget.

### TUG_BASE

Build: Use Forge work-fleet finishes; center loft length 24 m, width 8 m, blunt nose. Build one source kit with three distinct outlines, not three recolors.

Pivot / parent: Hull center.

Collision: Two to three convex hulls per variant.

### CLAMP_VARIANT

Build: Two 8 m forward jaws at Y=±5 with open throat 8 m wide.

Pivot / parent: Z hinges at X=4,Y=±5.

Collision: Jaws cosmetic when not in a sanctioned tow interaction.

### WINCH_VARIANT

Build: Vertical cable drum diameter 5 m on stern; two supported fairlead rollers at nose.

Pivot / parent: Drum axis +Y.

Collision: Hull proxy only; actual cable is Massline.

### SKIFF_VARIANT

Build: Broad stern deck 10×8 m with two patient-pod mounts, no visible humans required.

Pivot / parent: Fixed.

Collision: One deck box.

### COMMON_MARK

Build: One diagonal stripe geometry per upper hull; three small lit windows and a beacon.

Pivot / parent: Conformal to skin using the shared finish.

Collision: None.

## Animation recipe

| Clip / phase | Initial duration | Action |
|---|---:|---|
| Working | 4 s | Drum rotation is proportional to actual line payout. Idle rotation is forbidden. |
| Acknowledge | 0.6 s | Each vessel dips an existing crane or lamp once; avoid synchronized robot dancing. |
| Tow prepared | 1.2 s | Clamp opens before a real attach; receiver waits for actual proximity and consent. |
| Memorial | 8 s | If a member died, an empty berth stays empty and a single beacon holds steady. |

Critical read: Never instantiate all three merely for scenic busyness. A visible ship must have a real job, route or berth.

## AI / behavior

Dispatch is event-driven: IDLE, CLAIM_JOB, APPROACH, ASSIST, DELIVER, RETURN. Claim a job with a stable id so two tugs do not both decide they own the same casualty. Use traffic/navigation owners for movement and the existing helper for tether intent. The named-person layer stores obligations and known incidents; it does not scan unseen sectors for convenient suffering or spawn a friend inside a dangerous collision.

## Physical truth

Assistance uses an actual tow joint or existing recovery path with validated range and relative speed. The player can help by moving the obstruction first, changing the job state. When out of sector, reconcile job completion from the existing offscreen model; never simulate three full physics ships across the galaxy.

## Choices and counterplay

Join a cleanup, ask for bounded help, repay a recorded favor, or decline without losing the campaign. The crew can remember deliberate harm, but a failed rescue is not automatically betrayal.

## Failure and alternative outcomes

If a tug dies, remaining crew adapt their available roles and dialogue. A missing member is not silently respawned with a different name. A corrupted favor record falls back to no extra benefit, not a negative credit balance.

## Personality and sound

Three identifiable voices: Mara is concise and matter-of-fact; Odo narrates the practical next step; Kit uses humor after danger has passed. One speaker at a time, routed through the same arbiter. No overlapping radio sitcom during combat.

**help_offered:** “Mara: We have a line free. Tell us what you need moved.”

**help_declined:** “Odo: Understood. We will keep the approach clear.”

**favor_return:** “Kit: Your terrible afternoon has qualified for our terrible-afternoon program.”

**cleanup:** “Mara: The lane is blocked. The cause can wait until the ships are safe.”

**member_lost:** “Odo: That berth stays empty tonight.”

Dialogue defaults: once-only first reveal; persistent dedupe for milestone lines; repeat flavor no more than once per 90 sim seconds per character, and only when the shared voice arbiter grants the slot. Threat cues are governed by attack state, not that flavor cooldown. Stop stale lines when their target/phase disappears. Captions retain speaker and factual meaning.

## Rewards / economy boundary

One bounded service waiver or mission escort supported by current resource availability. Expenses still flow through existing economy and service owners.

## Save-state contract

memberIds[3], memberOutcomes, activeJobIds<=3, favorReceipts<=16. Persist durable incidents through the current ledger rather than an independent crew economy.

## Existing integration seams

- `src/systems/traffic.js`
- `src/systems/npcJobsRuntime.js`
- `src/systems/provenanceLedger.js`
- `src/ui/stuckTowPrompt.js`

These paths are starting points, not invented callable APIs. Read the live owners and current schemas before implementation. New concept helpers should emit to the owner rather than write its resource directly.

## Dependencies and packet sequence

SF20-01, SF20-03

Audit → behavior proof and model in parallel → presentation → normal-route integration → acceptance. Packet ids `SF20-06-A` through `-F` are in the task graph.

## Specific acceptance cases

1. Two helpers claim one job in the same tick: exactly one tow owner.
2. A job resolves before approach: tug releases the reservation and returns.
3. Kill a crew member and reload: identity remains absent and dialogue changes.
4. Request help without a free slot: explanation is truthful, with no phantom ship.
5. Repeat the same favor receipt: no accumulating free service.

## Player test

On a later visit, players identify at least one member by role or silhouette and can explain a concrete consequence of their earlier action. This measures recognition, not sentiment mining.

## Completion boundary

Require all shared gates in `production/TEST_PLAN.md`, the specific cases above, a normal-route encounter capture, top/chase/close model review, save/load evidence and matched performance measurements. This packet is not implemented or playtested merely because its plan and art exist. The art GLB is a non-shipping blockout; build the real asset through `production/ASSET_PIPELINE.md`.


---

# 07 — Scissorwake

SF20-07 | Enemy / deliberate Massline counterplay | Build wave 1 | DESIGN PROPOSAL

![Original procedural concept render](art/07_scissorwake.png)

## Player-experience purpose

A lean raider with two long forward ceramic blades. It turns toward the visible cable, spreads its jaws, paints a short crossing corridor, then commits to a cut that the player can dodge, interrupt or exploit.

**Gap / hypothesis:** Existing tether specialists contest attachment and field control. A visibly committed, interruptible line-cutter can make cable awareness tactical without restoring frustrating ambient breakage.

**Existing overlap to preserve:** Not a replacement for tether_control_raider. The GDD explicitly protects ordinary Massline strength: a cut is a named engineered attack, never a silent tension nerf. First reuse any shipped cutter attack discovered during rebase; add its distinctive model and encounter before inventing a second kernel.

Repository evidence: [R02](https://github.com/coldshalamov/SpaceFace/blob/1e0cf9499613b7c3acad10f34739278136d3d469/design/VISION.md), [R03](https://github.com/coldshalamov/SpaceFace/blob/1e0cf9499613b7c3acad10f34739278136d3d469/AGENTS.md), [R05](https://github.com/coldshalamov/SpaceFace/blob/1e0cf9499613b7c3acad10f34739278136d3d469/src/data/enemies.js), [R06](https://github.com/coldshalamov/SpaceFace/blob/1e0cf9499613b7c3acad10f34739278136d3d469/src/data/enemies.js#L405-L560), [R07](https://github.com/coldshalamov/SpaceFace/blob/1e0cf9499613b7c3acad10f34739278136d3d469/src/core/registry.js#L1-L170). See the inspection limits in `production/SOURCES.md`.

## First encounter

Introduce a single cutter with two familiar light enemies in a spacious early Crucible room. It waits until the player is attached, exposes the blades for 54 ticks, then takes a fixed-bearing pass through the cable. A missed pass leaves its side open. The first cut is instructional pressure, not a lethal combo.

## Where and when

Crucible after a Massline tutorial or equivalent observed use. Campaign deployment only on a later pirate encounter through spawnBudget. Maximum one cutter per introductory encounter and two in advanced mixes; never spawn a fresh cutter already in attack range.

## Repeat loop

See the jaw opening → decide to cut/reposition/throw the cutter → survive the committed pass → punish the recovery. Mastery can turn the specialist into ammunition before its own attack resolves.

## Visual and model recipe

Long open V from two cream ceramic cutting spars, small dark fuselage behind them, a single sodium-orange dorsal spool. The V must remain identifiable when the unit is 40–60 px wide.

Author envelope: 24 × 19 × 5 m, +X nose / +Y port / +Z up. Proposed gameplay semantic radius: 17 WU (0 means not an independently targeted world body); proposed mass: 28 internal units (0 means static/preview, not a massless dynamic body). These are design targets, not final measured asset bounds. Runtime scale must follow the actual Forge/entity contract.

LOD triangle targets: 20,000 / 8,000 / 3,600; proposed near draw budget 10; nearby concept cap 2. Numbers are budgets to verify, never permission to bypass spawnBudget.

### ROOT_SCISSOR

Build: Compact aft loft from X=-10 to +2, width 5 m; leave the forward 12 m mostly negative space.

Pivot / parent: Center aft of the blade pivots.

Collision: One main convex hull.

### BLADE_L/R

Build: Two tapered 13×2×0.8 m chamfered plates with visible dark hinges and no unsupported floating edge.

Pivot / parent: Z hinges at X=0,Y=±2.5; ±8 degrees idle to ±32 degrees armed.

Collision: Damage hit proxies on blades; cutting sweep computed from attack phase, never render mesh raycast.

### SPOOL

Build: A 2 m diameter copper drum at X=-3,Z=2.5; supported on two ribs.

Pivot / parent: Axis +Y.

Collision: None.

### DRIVES

Build: Two recessed engines at X=-9,Y=±2.

Pivot / parent: Named drive hooks.

Collision: Included in hull.

### CUT_APERTURE

Build: Thin solid emissive strips on inner blade edges; bloom limited to the blade area.

Pivot / parent: Child of each blade.

Collision: None.

## Animation recipe

| Clip / phase | Initial duration | Action |
|---|---:|---|
| Acquire | 0.3 s | Sensor points toward an observed cable; no damage. |
| Windup | 0.9 s | Jaws open over 54 sim ticks. Cutting corridor is visible from the first tick. |
| Commit | 0.45 s | Blade pose locks; unit attempts a fixed-bearing force-driven pass. No mid-pass homing. |
| Recover | 1.5 s | Jaws fold slowly; attack unavailable for 90 ticks. |

Critical read: Do not weaken global breakTension. The blades communicate attack intent; they do not need complex skinned animation.

## AI / behavior

States: PATROL, ACQUIRE_LINE, WINDUP, COMMIT, RECOVER, FLEE. Sensors must have current visibility of both relevant cable segment and target neighborhood. Choose the closest reachable segment within 300 WU and a feasible approach cone. Lock the attack bearing on entry to COMMIT. At most one cut receipt per attackId. Losing the line during WINDUP cancels without damage and still consumes a short cooldown. A stunned or displaced cutter cannot complete the cut merely because the animation timer expired.

## Physical truth

The cutter is mass 28, intentionally throwable compared with heavier specialists. Attack resolution uses a swept segment/capsule against the actual attachment segment in the sim plane; separate visual height has no effect. Only the attachment owner can remove a joint. Emit a documented proposed cut intent with source id, target attachment id, attack id and observed tick, then accept or reject in that owner. Cutting deals no extra automatic hull damage.

## Choices and counterplay

Release your line before the pass, change its geometry, displace the attacker, use another object as cover, or kill it. These are independent answers; do not require a particular purchased module.

## Failure and alternative outcomes

A cut releases momentum exactly as a manual cut does. No reset-to-zero velocity, punitive explosion, or temporary inability to reattach. A simultaneous player manual release and enemy cut produces one removal with deterministic ordering.

## Personality and sound

Enemy has no conversational personality. A sharp ratcheting spool announces arming; one rising ceramic scrape ends when the attack commits. Optional hostile barks are short and subordinate to warning audio.

**first_scan:** “Scissorwake — cuts exposed lines on a committed pass.”

**windup:** “Cutter opening. Move the line or move the ship.”

**miss:** “Cut missed. Jaws resetting.”

**disable:** “Blade drive disabled.”

**salvage:** “A cutter without a cutting edge. Finally, an honest ship.”

Dialogue defaults: once-only first reveal; persistent dedupe for milestone lines; repeat flavor no more than once per 90 sim seconds per character, and only when the shared voice arbiter grants the slot. Threat cues are governed by attack state, not that flavor cooldown. Stop stale lines when their target/phase disappears. Captions retain speaker and factual meaning.

## Rewards / economy boundary

Use the existing specialist payout band after campaign tuning. Crucible copy has zero campaign bounty and no campaign loot.

## Save-state contract

attackPhase, phaseStartTick, lockedBearing, targetAttachmentId, attackId, lastResolvedAttackId. Store through existing entity AI state; no render-owned attack clock.

## Existing integration seams

- `src/data/enemies.js`
- `src/systems/tacticalAI.js`
- `src/systems/masslineThreats.js`
- `src/combat/attachments.js`

These paths are starting points, not invented callable APIs. Read the live owners and current schemas before implementation. New concept helpers should emit to the owner rather than write its resource directly.

## Dependencies and packet sequence

No other new concept required.

Audit → behavior proof and model in parallel → presentation → normal-route integration → acceptance. Packet ids `SF20-07-A` through `-F` are in the task graph.

## Specific acceptance cases

1. Move the line outside the swept corridor during windup: no cut.
2. Render at 15 FPS: damage/cut still occurs on the identical fixed tick.
3. Throw the cutter backward: it cannot cut a line it never intersects.
4. Release manually on the impact tick: exactly one detach, no exception.
5. Turn off effects/audio: shape and textual threat still expose the counterplay.

## Player test

After one demonstration, four of five testers can name an available counter and detect the next windup before contact. Track cheap-feeling unavoidable cut complaints as a failure, not a difficulty achievement.

## Completion boundary

Require all shared gates in `production/TEST_PLAN.md`, the specific cases above, a normal-route encounter capture, top/chase/close model review, save/load evidence and matched performance measurements. This packet is not implemented or playtested merely because its plan and art exist. The art GLB is a non-shipping blockout; build the real asset through `production/ASSET_PIPELINE.md`.


---

# 08 — Kilnback

SF20-08 | Enemy / mobile environmental hazard | Build wave 2 | DESIGN PROPOSAL

![Original procedural concept render](art/08_kilnback.png)

## Player-experience purpose

A stolen furnace tug carries two vulnerable coolant casks and a broad dorsal radiator. Its powerful burn commits it to a hot interval; the casks can be shot or displaced to change where the danger occurs.

**Gap / hypothesis:** The arsenal can feel abstract when heat and area damage are only meters. A venting industrial hull turns a readable thermal state into a manipulable physical opportunity.

**Existing overlap to preserve:** Not the Mirrorjaw Foreman or Forge Regent: no reflective prow, no enlarged boss health bar. Reuse volatileExposure, fields and damage owners for a coolant/heat interaction, with a data-defined new recipe only where existing primitives cannot express it.

Repository evidence: [R03](https://github.com/coldshalamov/SpaceFace/blob/1e0cf9499613b7c3acad10f34739278136d3d469/AGENTS.md), [R05](https://github.com/coldshalamov/SpaceFace/blob/1e0cf9499613b7c3acad10f34739278136d3d469/src/data/enemies.js), [R06](https://github.com/coldshalamov/SpaceFace/blob/1e0cf9499613b7c3acad10f34739278136d3d469/src/data/enemies.js#L405-L560), [R07](https://github.com/coldshalamov/SpaceFace/blob/1e0cf9499613b7c3acad10f34739278136d3d469/src/core/registry.js#L1-L170). See the inspection limits in `production/SOURCES.md`.

## First encounter

A Kilnback warms up behind ordinary cover. Its radiator shutters open, the casks visibly frost, and a short forward thermal jet paints a narrow lane. A broken cask leaves a cooling patch that suppresses the next jet locally, letting the player reposition rather than simply out-DPS the ship.

## Where and when

First in a small Ceres industrial encounter or middle Crucible room after basic area hazards are understood. Cap one near the player until the counter is learned; avoid pairing with Scissorwake during its first introduction.

## Repeat loop

Read shutters and frost → bait a burn → displace a cask or move around the jet → use the brief cool interval. Environmental placement is more important than total health.

## Visual and model recipe

Short, wide furnace body with a rectangular dorsal radiator comb and two pale cylindrical casks on external brackets. Dark red lacquer identity stripe; hot machinery remains localized amber-white.

Author envelope: 29 × 24 × 9 m, +X nose / +Y port / +Z up. Proposed gameplay semantic radius: 23 WU (0 means not an independently targeted world body); proposed mass: 180 internal units (0 means static/preview, not a massless dynamic body). These are design targets, not final measured asset bounds. Runtime scale must follow the actual Forge/entity contract.

LOD triangle targets: 26,000 / 10,400 / 4,700; proposed near draw budget 11; nearby concept cap 2. Numbers are budgets to verify, never permission to bypass spawnBudget.

### ROOT_KILN

Build: Chunky loft 28×14×7 m with blunt insulated front and a deep rear engine well.

Pivot / parent: Central root.

Collision: One compound hull, mass 150 plus two 15-unit casks.

### RADIATOR_SLATS

Build: Six large parallel plates, 8×0.8×0.25 m, spaced 0.8 m apart; slats form a comb overhead.

Pivot / parent: Each local X hinge, travel 0–55 degrees.

Collision: Render-only.

### CASK_L/R

Build: Two 7×3 m cylinders with protective end rings and break collars.

Pivot / parent: X=-1,Y=±10; child roots until severed.

Collision: One capsule each; dynamic mass 15 after release.

### JET_MOUTH

Build: Deep rectangular 5×1.8 m opening in prow with thick ceramic lip.

Pivot / parent: HOOK_JET at X=14.

Collision: Damage originates in sim field, not glowing plane.

### COOLANT_LINES

Build: Four thick supported pipes modeled as low-segment sweeps.

Pivot / parent: Between casks and radiator.

Collision: None.

## Animation recipe

| Clip / phase | Initial duration | Action |
|---|---:|---|
| Preheat | 1.2 s | Slats rise, jet aperture brightens with no damage until 72 ticks complete. |
| Burn | 1.8 s | Forward jet follows a bounded cone fixed to current hull heading, with deliberately slow turning. |
| Vent | 2.5 s | Shutters stay open; brightness falls; casks visibly shed condensation. |
| Cask rupture | 0.45 s | Detach ring and emit a brief radial puff; no full-screen white flash. |

Critical read: Cooling vapor is an authored thin ribbon cluster near the ground plane, not a camera-facing opaque square or a screen-filling fog wall.

## AI / behavior

APPROACH_COVER, PREHEAT, BURN, VENT, RETREAT. Choose a lane only from observed target motion and line of sight. At PREHEAT entry record an aim heading; turning authority during BURN is capped so strafing is real counterplay. Coolant cancellation is a fact from the field/volatile owner, not a cosmetic particle overlap. The unit will prefer safety when both casks are gone rather than becoming mysteriously stronger.

## Physical truth

A released cask inherits the parent point velocity and can be towed. Cooling patch is a bounded field with radius 90 WU and proposed lifetime 4 s; it reduces this attack’s thermal output, not arbitrary global weapon heat. The jet uses a 160 WU range, 25-degree half-angle proposal, with occlusion through the existing damage-query owner. Do not perform per-particle collision or create infinite coolant from fragments.

## Choices and counterplay

Break a cask early for a safe but less dramatic window; tow it to shape the upcoming fight; bait the jet into cover; or circle to the exposed rear. Hull destruction is valid but not the only satisfying answer.

## Failure and alternative outcomes

Destroying a cask while next to civilians can create an ordinary hazard incident only if the implemented effect actually harms them. Avoid showing harmless vapor as a damaging cloud. Save during BURN resumes the remaining phase once, not a fresh full-duration jet.

## Personality and sound

Mostly industrial sound: a compressor inhalation, radiator clacks and a pressured roar. Pilot is impatient, self-preserving and more interested in keeping the stolen machine intact than dying theatrically.

**preheat:** “Stand clear. This rig does not turn cold quickly.”

**cask_lost:** “Coolant gone. Pulling back.”

**scan:** “Kilnback — external coolant casks; slow turn during a burn.”

**vent:** “Burn exhausted. Radiator exposed.”

**flee:** “Keep the scrap. I am keeping the engine.”

Dialogue defaults: once-only first reveal; persistent dedupe for milestone lines; repeat flavor no more than once per 90 sim seconds per character, and only when the shared voice arbiter grants the slot. Threat cues are governed by attack state, not that flavor cooldown. Stop stale lines when their target/phase disappears. Captions retain speaker and factual meaning.

## Rewards / economy boundary

Normal medium-specialist budget; one salvageable coolant component at most, attributed to the actual cask. No stacked drop from parent plus detached item.

## Save-state contract

phase, phaseStartTick, caskIds[2], caskReleased[2], currentAttackId. Cooling fields persist only through their existing field owner.

## Existing integration seams

- `src/data/enemies.js`
- `src/systems/tacticalAI.js`
- `src/systems/volatileExposure.js`
- `src/systems/fields.js`

These paths are starting points, not invented callable APIs. Read the live owners and current schemas before implementation. New concept helpers should emit to the owner rather than write its resource directly.

## Dependencies and packet sequence

SF20-07

Audit → behavior proof and model in parallel → presentation → normal-route integration → acceptance. Packet ids `SF20-08-A` through `-F` are in the task graph.

## Specific acceptance cases

1. Disable VFX: the same field tests produce the same damage and cancellation.
2. Break cask during save/load boundary: only one field appears.
3. Hide behind authored cover: the jet respects the chosen occlusion contract.
4. Move cask after detachment: no remaining parent collider blocks it.
5. Provoke the first burn from every approach: warning always precedes damage.

## Player test

Players discover at least two counters in open testing. Record whether casks are perceived as interactive before explaining them.

## Completion boundary

Require all shared gates in `production/TEST_PLAN.md`, the specific cases above, a normal-route encounter capture, top/chase/close model review, save/load evidence and matched performance measurements. This packet is not implemented or playtested merely because its plan and art exist. The art GLB is a non-shipping blockout; build the real asset through `production/ASSET_PIPELINE.md`.


---

# 09 — Pallet Jack

SF20-09 | Enemy / cargo-first thief | Build wave 2 | DESIGN PROPOSAL

![Original procedural concept render](art/09_pallet_jack.png)

## Player-experience purpose

A pirate forklift in space: two broad tines, a crosswise cargo clamp and an exposed reverse-thrust bank. It grabs a valuable loose pallet and flees awkwardly with the mass visible on its nose.

**Gap / hypothesis:** A hostile encounter can threaten something other than the player’s life. A visibly cargo-motivated thief lets a player win by recovering a thing, not exterminating every enemy.

**Existing overlap to preserve:** Mine-Layer Jackal already prefers cargo/wreck claims. Pallet Jack must add the actual staged lift-and-escape interaction and broad physical fork silhouette; do not merely duplicate that preference in a new stats row.

Repository evidence: [R03](https://github.com/coldshalamov/SpaceFace/blob/1e0cf9499613b7c3acad10f34739278136d3d469/AGENTS.md), [R05](https://github.com/coldshalamov/SpaceFace/blob/1e0cf9499613b7c3acad10f34739278136d3d469/src/data/enemies.js), [R06](https://github.com/coldshalamov/SpaceFace/blob/1e0cf9499613b7c3acad10f34739278136d3d469/src/data/enemies.js#L405-L560), [R07](https://github.com/coldshalamov/SpaceFace/blob/1e0cf9499613b7c3acad10f34739278136d3d469/src/core/registry.js#L1-L170), [R09](https://github.com/coldshalamov/SpaceFace/blob/1e0cf9499613b7c3acad10f34739278136d3d469/src/data/contactHail.js#L1-L110). See the inspection limits in `production/SOURCES.md`.

## First encounter

After a fight near a real cargo transfer, the thief approaches a loose valuable pallet with its clamp open. The victim hails. The player can interrupt before clamping, pull the pallet away, disable the clamp, or let the theft happen and follow the marked load to a fence.

## Where and when

Ceres or Tethys cargo activity pocket. Only spawn when an eligible real cargo body exists and spawnBudget permits. One active thief per incident. Never create free cargo simply to give the thief something to do.

## Repeat loop

See the target pallet → contest the physical approach → recover or pursue → deliver or steal for yourself. A lost immediate fight can become an investigation using the cargo provenance trail.

## Visual and model recipe

Squat forklift H-shape with two thick forward tines separated by a large rectangular gap; cargo clamp bridges them. The silhouette visibly changes when loaded. Mustard stripe with dark steel and a small asymmetric cockpit.

Author envelope: 25 × 22 × 6 m, +X nose / +Y port / +Z up. Proposed gameplay semantic radius: 20 WU (0 means not an independently targeted world body); proposed mass: 100 internal units (0 means static/preview, not a massless dynamic body). These are design targets, not final measured asset bounds. Runtime scale must follow the actual Forge/entity contract.

LOD triangle targets: 22,000 / 8,800 / 4,000; proposed near draw budget 10; nearby concept cap 1. Numbers are budgets to verify, never permission to bypass spawnBudget.

### ROOT_JACK

Build: Rear block loft 14×10×5 m; two 12×2 m forward plate tines starting at X=0,Y=±7.

Pivot / parent: Center at X=-3.

Collision: Three convex pieces preserving the open fork gap.

### CLAMP

Build: Crossbeam 14×1.4×1.2 m with two downward padded jaw shapes.

Pivot / parent: Slides along +X from 2 to 10 m.

Collision: Sensor trigger during grab; physical load constraint owned by sim.

### LIFT_CARRIAGE

Build: Two visible telescoping rails connecting clamp to body.

Pivot / parent: Fixed to hull and clamp.

Collision: No moving concave collision.

### REVERSE_BANK

Build: Four supported side nozzles pointing forward, visibly larger than aft thrusters.

Pivot / parent: HOOK_REVERSE_1..4.

Collision: Hull proxy only.

### CARGO_SOCKET

Build: Open receiving center between tines, visibly sized for one pallet class.

Pivot / parent: X=7,Y=0,Z=0.

Collision: No invented item mesh: draw the actual captured object.

## Animation recipe

| Clip / phase | Initial duration | Action |
|---|---:|---|
| Target | 0.6 s | Clamp lifts slightly and points to the selected pallet, accompanied by a target bracket only on inspection. |
| Grab | 0.8 s | Clamp closes over 48 ticks; acquisition can fail until the owner accepts actual proximity. |
| Loaded | 1 s | Nose pitches cosmetically up to 3 degrees while real acceleration changes from actual mass. |
| Drop | 0.35 s | Open clamp only after joint release; emit one mechanical clunk. |

Critical read: Actual cargo must remain visible between the forks. This loaded-versus-empty silhouette is the design’s central communication channel.

## AI / behavior

SEARCH_CARGO, CLAIM_APPROACH, GRAB, ESCAPE, NEGOTIATE, DISABLED. Search uses nearby cargo index and visible value classes, not the player’s hidden inventory. Reserve the target locally; if another actor moves it, recompute the approach. Escape direction is a real exit route. On low hull, offer to release the item through a simple existing parley choice, never force a cinematic. The clamp cannot steal an item from an open UI inventory slot.

## Physical truth

Capture only a body within 12 WU of the cradle and below 15 WU/s relative speed after the windup. Cargo mass adds through the actual attachment/compound mechanism; never lower the cargo’s mass invisibly. A player Massline can contest the object under the existing attachment rules; do not silently delete the player’s line. Release transfers neither legal ownership nor credits.

## Choices and counterplay

Save the cargo, save the trader, chase the thief, negotiate a drop, or exploit the situation. The fence trail is optional; it must not let theft create an unlimited sequence of loot and new enemies.

## Failure and alternative outcomes

If the thief crosses the sector boundary with the object, persist its cargo id and route endpoint. A later recovery returns that same provenance, not a cloned replacement. When no safe escape path exists, choose DROP_AND_FLEE rather than clipping through a station.

## Personality and sound

A hustler who believes every crime is a logistics problem. Short, evasive, amusing without glamorizing a random massacre. Cargo loss—not damage—is the primary trigger for panic.

**approach:** “Unsecured freight. Tragic oversight.”

**grab:** “I have a delivery to make. It has recently changed owners.”

**contested:** “That is not a handle for two ships.”

**surrender:** “Clamp is open. We can all become less involved.”

**escape:** “Follow the paperwork. I will follow the exit.”

Dialogue defaults: once-only first reveal; persistent dedupe for milestone lines; repeat flavor no more than once per 90 sim seconds per character, and only when the shared voice arbiter grants the slot. Threat cues are governed by attack state, not that flavor cooldown. Stop stale lines when their target/phase disappears. Captions retain speaker and factual meaning.

## Rewards / economy boundary

Recovery contract reward keyed to the victim’s cargo id; thief bounty follows normal law only. Do not award both a salvage sale and a recovery payment for the same transfer.

## Save-state contract

targetCargoId, grabbedCargoId, grabAttackId, routeEndpointId, incidentId. Cargo owner persists ownership and the body; do not copy cargo data into enemy loot.

## Existing integration seams

- `src/data/enemies.js`
- `src/systems/tacticalAI.js`
- `src/systems/cargo.js`
- `src/systems/pirateParley.js`

These paths are starting points, not invented callable APIs. Read the live owners and current schemas before implementation. New concept helpers should emit to the owner rather than write its resource directly.

## Dependencies and packet sequence

SF20-03

Audit → behavior proof and model in parallel → presentation → normal-route integration → acceptance. Packet ids `SF20-09-A` through `-F` are in the task graph.

## Specific acceptance cases

1. Move the pallet during grab: clamp misses honestly.
2. Destroy thief carrying cargo: one surviving pallet, no duplicate loot item.
3. Contest with Massline: established attachment arbitration stays deterministic.
4. Cross-sector escape and reload: exactly the same cargo provenance returns.
5. No eligible cargo: no useless thief spawn.

## Player test

At least one test encounter ends with recovered cargo and a living thief. Verify players understand that this counts as an effective intervention.

## Completion boundary

Require all shared gates in `production/TEST_PLAN.md`, the specific cases above, a normal-route encounter capture, top/chase/close model review, save/load evidence and matched performance measurements. This packet is not implemented or playtested merely because its plan and art exist. The art GLB is a non-shipping blockout; build the real asset through `production/ASSET_PIPELINE.md`.


---

# 10 — Mothlight

SF20-10 | Enemy / bounded deception | Build wave 3 | DESIGN PROPOSAL

![Original procedural concept render](art/10_mothlight.png)

## Player-experience purpose

A triangular tender releases two small lamp drones that imitate a firing charge. The real weapon has a unique physical shutter opening, while decoys lack engines and drift. Reading motion defeats the illusion.

**Gap / hypothesis:** A target-priority puzzle can create combat variety without more damage types. It must reward observation rather than hide the true enemy behind arbitrary invisibility.

**Existing overlap to preserve:** Quiet Ghost already supplies stealthy ranged repositioning. Mothlight is a visible decoy-deploying tender, never cloaked and never an omniscient sniper. Its decoys are real destructible entities with cheap behavior.

Repository evidence: [R03](https://github.com/coldshalamov/SpaceFace/blob/1e0cf9499613b7c3acad10f34739278136d3d469/AGENTS.md), [R05](https://github.com/coldshalamov/SpaceFace/blob/1e0cf9499613b7c3acad10f34739278136d3d469/src/data/enemies.js), [R07](https://github.com/coldshalamov/SpaceFace/blob/1e0cf9499613b7c3acad10f34739278136d3d469/src/core/registry.js#L1-L170). See the inspection limits in `production/SOURCES.md`.

## First encounter

Introduce one tender at medium distance with only one decoy on its first encounter. A lamp imitates the weapon glow but not the real shutter silhouette. A scan labels verified decoys, and a single hit extinguishes one. The tender’s eventual shot is always separately telegraphed.

## Where and when

Later Crucible mixed-role rooms or a surveyed hostile frontier pocket after ranged enemies are familiar. Maximum one tender and two decoys nearby. No decoy may occlude objective markers or imitate accessibility-critical UI.

## Repeat loop

Compare shutter/motion → identify or scan → disable a decoy or close on the tender → use its resupply interval. Novices can brute-force two cheap decoys; experts read the real threat immediately.

## Visual and model recipe

A shallow triangular black-copper hull with two large dish-wing recesses and a clearly visible central iris. Lamp drones are small four-fin needles without engine bells. The real hull is always physically larger.

Author envelope: 24 × 26 × 5 m, +X nose / +Y port / +Z up. Proposed gameplay semantic radius: 21 WU (0 means not an independently targeted world body); proposed mass: 60 internal units (0 means static/preview, not a massless dynamic body). These are design targets, not final measured asset bounds. Runtime scale must follow the actual Forge/entity contract.

LOD triangle targets: 24,000 / 9,600 / 4,300; proposed near draw budget 11; nearby concept cap 1. Numbers are budgets to verify, never permission to bypass spawnBudget.

### ROOT_MOTH

Build: Triangular plate outline (-10,-12),(-10,12),(13,0), thickness 2.2 m, with raised center ridge.

Pivot / parent: Center.

Collision: One convex triangular hull.

### DISH_L/R

Build: Two shallow concave visual bowls radius 4.5 m inset into supported wings, with dark rims.

Pivot / parent: X=-2,Y=±7,Z=1.2.

Collision: No concave physics; hull is enough.

### REAL_IRIS

Build: Six wedge plates forming a 3 m aperture at the nose; open by rotating each petal 24 degrees.

Pivot / parent: Pivots around X=8,Y=0,Z=1.5.

Collision: Targetable subsystem proxy if existing system supports it.

### LAMP_A/B

Build: 2.8 m needles with four 0.6 m fins and a luminous cap; no thruster geometry.

Pivot / parent: Independent roots on release sockets.

Collision: One small spherical collider each, one hit to extinguish.

### SUPPLY_HATCHES

Build: Two dorsal sliding doors exposing drone sockets.

Pivot / parent: Slide along Y.

Collision: None.

## Animation recipe

| Clip / phase | Initial duration | Action |
|---|---:|---|
| Release | 0.8 s | One hatch opens and one lamp physically leaves its socket. No sudden duplicate glows. |
| False charge | 1.1 s | Lamp cap brightens with the same envelope but has no shutter motion or recoil. |
| True charge | 1.1 s | Central iris visibly opens; small recoil linkage braces. Damage follows a fixed tick gate. |
| Reload | 3 s | Iris closes and hatches remain dark; resupply cannot create more than the cap. |

Critical read: No full-screen postprocessing, fake damage indicators, copied player reticles, or misleading screen-reader labels. Deception happens in the fiction, not in the interface contract.

## AI / behavior

DEPLOY, OBSERVE, TRUE_CHARGE, FIRE, REPOSITION, RELOAD. Decoys follow ballistic drift plus tiny bounded damping, not the tactical AI stack. Real shots use normal visibility and aim constraints. Choose which lamp flashes using a local seeded sequence; never key deception to the player’s unobserved cursor. Destroyed decoys consume stock for that encounter: maximum four launches total, two concurrent.

## Physical truth

Decoys have real positions, mass 2 and hull 1. A pulse hit produces an ordinary collision and extinguishes the source. They can be shoved, revealing passive drift; they must not teleport to remain in formation. Cap the false glow’s screen coverage. No fake projectile ever deals damage; real weapon shots come only from the tender’s weapon owner.

## Choices and counterplay

Scan, inspect physical shutter motion, shove a suspected lamp, clear the decoys cheaply, or close under cover. Provide an accessibility option to add a learned decoy badge after the first confirmed identification without removing normal challenge for everyone.

## Failure and alternative outcomes

An occluded real shutter must not permit an unseen unavoidable shot; retain directional warning when a live attack can reach the player. Saving after a lamp is destroyed cannot restore its stock. If scan tools are unavailable, silhouettes and motion are sufficient.

## Personality and sound

Sparse synthetic radio mimicry restricted to authored combat tones, never copies named allies or critical navigation messages. The pilot is a cautious showman who retreats when its apparatus is stripped.

**scan:** “Mothlight — two lamps, one weapon. Watch the shutter.”

**identified:** “Decoy confirmed. No drive signature.”

**true_charge:** “Central shutter opening.”

**stripped:** “The performance appears to be over.”

**retreat:** “No audience worth dying for.”

Dialogue defaults: once-only first reveal; persistent dedupe for milestone lines; repeat flavor no more than once per 90 sim seconds per character, and only when the shared voice arbiter grants the slot. Threat cues are governed by attack state, not that flavor cooldown. Stop stale lines when their target/phase disappears. Captions retain speaker and factual meaning.

## Rewards / economy boundary

Tender pays one normal specialist bounty. Lamps pay nothing and drop nothing; otherwise deception becomes a farming exploit.

## Save-state contract

phase, stockRemaining<=4, activeDecoyIds<=2, localRngState, nextAttackTick. Decoy entities persist through the normal entity owner.

## Existing integration seams

- `src/data/enemies.js`
- `src/systems/tacticalAI.js`
- `src/systems/scanner.js`
- `src/systems/weapons.js`

These paths are starting points, not invented callable APIs. Read the live owners and current schemas before implementation. New concept helpers should emit to the owner rather than write its resource directly.

## Dependencies and packet sequence

SF20-07

Audit → behavior proof and model in parallel → presentation → normal-route integration → acceptance. Packet ids `SF20-10-A` through `-F` are in the task graph.

## Specific acceptance cases

1. No scanner or audio: player can still distinguish real shutter geometry.
2. Kill all lamps and reload: stock does not replenish.
3. Change render FPS: local sequence and attack tick stay equal.
4. Push a lamp: it drifts physically rather than snapping back.
5. Hide the actual weapon behind cover: its shot respects occlusion.

## Player test

Measure identification accuracy after one successful observation; do not demand first-sighting clairvoyance. Reject a design where players call it random even after the rule is explained.

## Completion boundary

Require all shared gates in `production/TEST_PLAN.md`, the specific cases above, a normal-route encounter capture, top/chase/close model review, save/load evidence and matched performance measurements. This packet is not implemented or playtested merely because its plan and art exist. The art GLB is a non-shipping blockout; build the real asset through `production/ASSET_PIPELINE.md`.


---

# 11 — Tethys Switchyard

SF20-11 | Industrial place / causal traffic puzzle | Build wave 2 | DESIGN PROPOSAL

![Original procedural concept render](art/11_tethys_switchyard.png)

## Player-experience purpose

Three freight lanes meet at a rotating service fork. The player can clear a jam, redirect a floating pallet into the correct receiving berth, or deliberately cause a diversion—and see the downstream shipment change.

**Gap / hypothesis:** The living economy is richest when its cargo chain is visible and physically interruptible. A small authored transfer junction makes causality readable without adding a whole new economy.

**Existing overlap to preserve:** Reuse npcJobsRuntime, environmentalMachinery and actual cargo transfers. No decorative orbiting traffic, no substitute route engine, and no new magnetic force law when the existing field machinery suffices.

Repository evidence: [R02](https://github.com/coldshalamov/SpaceFace/blob/1e0cf9499613b7c3acad10f34739278136d3d469/design/VISION.md), [R03](https://github.com/coldshalamov/SpaceFace/blob/1e0cf9499613b7c3acad10f34739278136d3d469/AGENTS.md), [R07](https://github.com/coldshalamov/SpaceFace/blob/1e0cf9499613b7c3acad10f34739278136d3d469/src/core/registry.js#L1-L170), [R08](https://github.com/coldshalamov/SpaceFace/blob/1e0cf9499613b7c3acad10f34739278136d3d469/src/data/authoredPlaces.js#L1-L155), [R09](https://github.com/coldshalamov/SpaceFace/blob/1e0cf9499613b7c3acad10f34739278136d3d469/src/data/contactHail.js#L1-L110). See the inspection limits in `production/SOURCES.md`.

## First encounter

On an existing Tethys freight route, one pallet is wedged between a stopped transfer sled and a bent guide. A hauler waits outside the throat rather than phasing through it. The player can tow the pallet clear, push the sled back, or accept a job to route the displaced cargo to the right berth.

## Where and when

Author a candidate zone in sector_tethys_junction, then choose coordinates only after checking existing zones, anchors and worldRadius. Use a nonzero sector origin for all atlas tests. Keep the yard optional and preserve an open bypass route.

## Repeat loop

Observe the jam → identify whose load is waiting → manipulate real bodies → allow the shipment to continue → inspect one factual price/supply consequence later. Repeat incidents draw from actual traffic tasks, not arbitrary continuous chaos.

## Visual and model recipe

A Y-shaped lattice yard with three blunt receiving mouths, a central triangular transfer platform and a single off-axis rotating gantry. Clear negative space between arms; amber lane lights mark direction.

Author envelope: 120 × 110 × 18 m, +X nose / +Y port / +Z up. Proposed gameplay semantic radius: 90 WU (0 means not an independently targeted world body); proposed mass: 0 internal units (0 means static/preview, not a massless dynamic body). These are design targets, not final measured asset bounds. Runtime scale must follow the actual Forge/entity contract.

LOD triangle targets: 38,000 / 15,000 / 6,800; proposed near draw budget 14; nearby concept cap 1. Numbers are budgets to verify, never permission to bypass spawnBudget.

### YARD_ROOT

Build: Three Forge truss arms at 0,120,240 degrees, length 45 m from a central 18 m annulus. Use repeated beam geometry.

Pivot / parent: Sector-local anchor.

Collision: Fixed compound boxes per arm; never one encompassing convex collider.

### TRANSFER_FORK

Build: Two 12 m tines on a 9 m rotating base plate, with all gears under a dark cover.

Pivot / parent: Z pivot at yard center.

Collision: Kinematic proxy only if motion is physically enabled.

### RECEIVERS_A/B/C

Build: Three 14×10 m open berths with contrasting solid floor ribs.

Pivot / parent: At each arm end.

Collision: Separate sensor volumes with stable receiver ids.

### SLED

Build: One 7×5×2 m cartlike cargo base; oversized guide bumpers.

Pivot / parent: Independent dynamic root.

Collision: One box, proposed mass 40.

### GUIDE_BENT

Build: A visibly deformed 9 m guide rail and a large handgrip/tow lug.

Pivot / parent: Bolted at incident berth.

Collision: Two convex segments that match the bend.

## Animation recipe

| Clip / phase | Initial duration | Action |
|---|---:|---|
| Normal cycle | 8 s | Gantry rotates only after the task owner reserves a receiver and clearance is valid. |
| Jam | 0.4 s | Drive stops; one work lamp holds amber. No seizure-like pulsing. |
| Freed | 1 s | Actual clearance receipt starts a slow restart before normal speed. |
| Transfer | 2 s | Cradle lowers the real cargo object into a receiving volume; visual pose follows owner progress. |

Critical read: The transfer mouths need to read at the default camera. Limit moving geometry to one mechanism and reuse meshes across all three arms.

## AI / behavior

The place has a job FSM, not an enemy brain: WAIT_TASK, RESERVE_BERTH, VERIFY_CLEAR, TRANSFER, RELEASE, JAM. Each job references a real cargo id, hauler id and destination. Scan or broadphase the small work volume at 5 Hz, with immediate invalidation on object changes. A traffic ship with a reserved berth holds outside until clearance. A watchdog changes deadlocked jobs into a visible repair request, never deletes the obstruction silently.

## Physical truth

Use static collision for the structure and only one active kinematic gantry. For moving solid parts, advance through the authoritative physics owner with swept clearance; a cosmetic rotation must never shove ships. Pallets retain their real masses. Clamp impulses and transfer speeds to existing industrial handling limits; do not weld the player to machinery because a sensor overlapped.

## Choices and counterplay

Clear the cargo, move the sled, tow the bent guide if the authored joint allows it, take an alternate delivery, or leave. Smuggling can use an actual vacant berth, but cannot become a UI exploit that teleports inventory.

## Failure and alternative outcomes

Wrong receiver refuses before destroying cargo and names the mismatch. Player-caused obstruction can create a restitution job. If the entire mechanism is destroyed, routes use the visible bypass and the yard becomes salvage, not a global economic deadlock.

## Personality and sound

Human dispatcher with clipped logistics phrases, noticeably relieved when a jam clears. Machinery itself communicates through clutches and relay clicks, not a sentient station personality.

**jam:** “Berth two is waiting on that pallet. The rest of the shift is waiting on berth two.”

**wrong_berth:** “Wrong receiver. Keep the load; take the outside lane.”

**restart:** “Clearance confirmed. Gantry moving in three.”

**diversion:** “That shipment is no longer on its original route.”

**complete:** “Line moving. Everyone downstream just got their afternoon back.”

Dialogue defaults: once-only first reveal; persistent dedupe for milestone lines; repeat flavor no more than once per 90 sim seconds per character, and only when the shared voice arbiter grants the slot. Threat cues are governed by attack state, not that flavor cooldown. Stop stale lines when their target/phase disappears. Captions retain speaker and factual meaning.

## Rewards / economy boundary

Repair or delivery contract pay only. World stock changes solely from a validated delivered shipment; no price buff attached to a decorative completion animation.

## Save-state contract

yardId, mechanismHealth, activeJobId, jamCauseIds<=4, receiverReservations[3]. Actual goods, prices and routes remain in existing owners.

## Existing integration seams

- `src/data/authoredPlaces.js`
- `src/systems/environmentalMachinery.js`
- `src/systems/npcJobsRuntime.js`
- `src/systems/cargo.js`

These paths are starting points, not invented callable APIs. Read the live owners and current schemas before implementation. New concept helpers should emit to the owner rather than write its resource directly.

## Dependencies and packet sequence

SF20-03, SF20-09

Audit → behavior proof and model in parallel → presentation → normal-route integration → acceptance. Packet ids `SF20-11-A` through `-F` are in the task graph.

## Specific acceptance cases

1. Add zone in nonzero-origin sector: atlas position round-trips exactly.
2. Jam gantry with a player ship: machinery stops, never tunnels.
3. Resolve cargo by another route: waiting job updates instead of hanging.
4. Save a reserved berth: one reservation and one cargo survive.
5. Destroy yard: bypass is usable and no credits/stock are fabricated.

## Player test

A tester can trace one pallet from origin to receiver and explain why a hauler is waiting. Reward visible causal comprehension, not a high decorative ship count.

## Completion boundary

Require all shared gates in `production/TEST_PLAN.md`, the specific cases above, a normal-route encounter capture, top/chase/close model review, save/load evidence and matched performance measurements. This packet is not implemented or playtested merely because its plan and art exist. The art GLB is a non-shipping blockout; build the real asset through `production/ASSET_PIPELINE.md`.


---

# 12 — The Borrowed Sun

SF20-12 | Traveling market / memorable hub | Build wave 3 | DESIGN PROPOSAL

![Original procedural concept render](art/12_borrowed_sun.png)

## Player-experience purpose

A dark merchant carrier unfolds six gold reflector petals around a warm central service spine. From a distance it looks like a small borrowed sunrise; up close it is a fleet of people trading in its reflected light.

**Gap / hypothesis:** A market screen can be useful yet placeless. A periodically visiting physical market creates anticipation and a recognizable social destination without requiring another permanent star system.

**Existing overlap to preserve:** Use existing market, traffic, station services and ORRERY. Not a replacement station shell or a new pricing algorithm. Visit schedule is simulated and inspectable, never real-world FOMO or a daily-login timer.

Repository evidence: [R01](https://github.com/coldshalamov/SpaceFace/blob/1e0cf9499613b7c3acad10f34739278136d3d469/README.md), [R02](https://github.com/coldshalamov/SpaceFace/blob/1e0cf9499613b7c3acad10f34739278136d3d469/design/VISION.md), [R03](https://github.com/coldshalamov/SpaceFace/blob/1e0cf9499613b7c3acad10f34739278136d3d469/AGENTS.md), [R04](https://github.com/coldshalamov/SpaceFace/blob/1e0cf9499613b7c3acad10f34739278136d3d469/tools/blender/forge/FORGE.md), [R07](https://github.com/coldshalamov/SpaceFace/blob/1e0cf9499613b7c3acad10f34739278136d3d469/src/core/registry.js#L1-L170), [R08](https://github.com/coldshalamov/SpaceFace/blob/1e0cf9499613b7c3acad10f34739278136d3d469/src/data/authoredPlaces.js#L1-L155). See the inspection limits in `production/SOURCES.md`.

## First encounter

A chart notice announces the carrier’s next visit in sim-time terms and allows routing to its current berth. On arrival, it unfolds away from traffic and offers existing services with a small curated inventory tied to real stock. Leaving it does not punish the player or force a countdown purchase.

## Where and when

Alternate between existing safe Tethys and Ceres berths. First deploy only one fixed visit while proving services and geometry; add travel after that slice passes. Never jump the entire moving market while the player is docked.

## Repeat loop

Notice arrival → visit → inspect distinctive stock and a short local story → trade normally → see the carrier later with believable inventory changes. An expired visit leaves a next-destination record, not a vanished quest giver.

## Visual and model recipe

Six broad gold reflector petals attached around a dark hexagonal hub, one long warm-lit service spine crossing the center. Asymmetric cargo pods beneath one quadrant keep it from resembling a magic flower.

Author envelope: 160 × 150 × 30 m, +X nose / +Y port / +Z up. Proposed gameplay semantic radius: 110 WU (0 means not an independently targeted world body); proposed mass: 0 internal units (0 means static/preview, not a massless dynamic body). These are design targets, not final measured asset bounds. Runtime scale must follow the actual Forge/entity contract.

LOD triangle targets: 40,000 / 16,000 / 7,200; proposed near draw budget 14; nearby concept cap 1. Numbers are budgets to verify, never permission to bypass spawnBudget.

### HUB

Build: Forge annulus outer radius 24 m and inner radius 14 m; six structural spokes.

Pivot / parent: Center at berth anchor.

Collision: Six convex wedges preserve central void.

### PETAL_01..06

Build: Each petal a chamfered quadrilateral 45 m long, broadening to 22 m. Gold stripe/bare-metal material with structural ribs beneath.

Pivot / parent: Z hinges at radius 22; hinges visibly supported.

Collision: Non-colliding while decorative; docking approach avoids their swept bounds.

### SPINE

Build: 90×12×12 m central loft with warm windows and two distinct service mouths.

Pivot / parent: Fixed along X.

Collision: Two to four convex proxies; explicit docking corridor openings.

### CARGO_BANK

Build: Eight repeated 12 m containers on supported brackets in one quadrant.

Pivot / parent: Fixed roots, shared geometry.

Collision: Combine into two conservative proxies.

### BEACON

Build: A broad amber lens at the hub, not a point light illuminating the entire sector.

Pivot / parent: Central light socket.

Collision: None.

## Animation recipe

| Clip / phase | Initial duration | Action |
|---|---:|---|
| Unfold | 12 s | Petals open one opposing pair at a time; block dock clearance until the physical access path is safe. |
| Market open | 8 s | Very slow reflected-light travel; windows stay stable and readable. |
| Departure prepare | 10 s | Close service only after all legitimate transfers finish; route docked players to an ordinary undock choice. |
| Transit | 0 s | Folded pose, same carrier identity; do not stream full distant detail. |

Critical read: A warm visual landmark must not saturate bloom or wash out combat threats. Petal glints are material response, not six huge dynamic spotlights.

## AI / behavior

Itinerary FSM: ARRIVE, DEPLOY, OPEN, CLOSE_PENDING, FOLD, DEPART. Service availability is a truth from this state and the existing station-service owner. All transactions revalidate stock and credits. Arrival notices are deduped by visit id. Do not advance the schedule off wall clock or penalize an inactive save. A visit can extend safely when the player is docked.

## Physical truth

Initial production version is a fixed-berth carrier with noninteractive reflectors outside the corridor. Its collision model is only the solid hub/spine. A later mobile version must demonstrate swept docking clearance and transfer authority before enabling movement. No per-petal rigid bodies are necessary; do not spend physics budget to animate a lamp shade.

## Choices and counterplay

Trade, browse, listen to a local rumor grounded in actual events, or leave. Curated stock highlights tradeoffs rather than presenting “buy now or miss forever.” All necessary progression items remain obtainable elsewhere.

## Failure and alternative outcomes

Departure cannot strand an active purchase. Interrupted deployment leaves the ordinary market screen unavailable with a clear reason. A missing asset presents a chart glyph and service fallback; it must not freeze boot at 90 percent.

## Personality and sound

Market operator Nemi speaks like a host who remembers the work of feeding a crowd. Background chatter is abstract and low-volume; only the selected speaker has semantic lines.

**arrival:** “Borrowed Sun taking berth. Bring something worth a conversation.”

**open:** “The light is free. The spare parts are regrettably not.”

**repeat:** “Same ship, different cargo. That is usually a good story.”

**closing:** “We are packing slowly. Finish your business; no one is racing the door.”

**next_stop:** “Next berth is on the chart. We prefer being found.”

Dialogue defaults: once-only first reveal; persistent dedupe for milestone lines; repeat flavor no more than once per 90 sim seconds per character, and only when the shared voice arbiter grants the slot. Threat cues are governed by attack state, not that flavor cooldown. Stop stale lines when their target/phase disappears. Captions retain speaker and factual meaning.

## Rewards / economy boundary

Existing trade margins and authored mission offers. No artificial sale timer, premium currency, or new passive income source.

## Save-state contract

carrierId, visitId, itineraryLeg, phase, phaseStartTick, serviceAnchorId. Store market stock only under the existing economy owner.

## Existing integration seams

- `src/data/sectorAnchors.js`
- `src/systems/traffic.js`
- `src/systems/economy.js`
- `src/ui/orrery/`

These paths are starting points, not invented callable APIs. Read the live owners and current schemas before implementation. New concept helpers should emit to the owner rather than write its resource directly.

## Dependencies and packet sequence

SF20-01, SF20-02

Audit → behavior proof and model in parallel → presentation → normal-route integration → acceptance. Packet ids `SF20-12-A` through `-F` are in the task graph.

## Specific acceptance cases

1. Buy on closing tick: exactly one accepted transaction or one clear denial.
2. Remain docked past planned departure: no forced teleport or lost ship.
3. Restart app after a long wall-clock gap: visit changes only under intended sim/offline rules.
4. Remove GLB from test server: chart and fallback service remain usable.
5. Inspect folded and open colliders: no invisible petal walls.

## Player test

Players recognize the hub from a 2-second silhouette exposure and can find one service without searching all tabs. Confirm anticipation comes from content, not countdown pressure.

## Completion boundary

Require all shared gates in `production/TEST_PLAN.md`, the specific cases above, a normal-route encounter capture, top/chase/close model review, save/load evidence and matched performance measurements. This packet is not implemented or playtested merely because its plan and art exist. The art GLB is a non-shipping blockout; build the real asset through `production/ASSET_PIPELINE.md`.


---

# 13 — The Thimble Door

SF20-13 | Derelict shortcut / spatial reasoning | Build wave 3 | DESIGN PROPOSAL

![Original procedural concept render](art/13_thimble_door.png)

## Player-experience purpose

A broken freighter forms a giant sewing-eye silhouette. Small ships can thread a broad side opening; a towed load may need to be reoriented or taken around the outside. Nothing important is locked behind a ship-size purchase.

**Gap / hypothesis:** Ship size and attached cargo should sometimes matter spatially, not just numerically. A readable optional passage makes clearance, towing and momentum meaningful while exposing camera quality as a shipping gate.

**Existing overlap to preserve:** Existing places and physics already support obstacles. This is a deliberately authored alternate route, not a new traversal system. Do not release it until camera clipping and corridor collision tests pass.

Repository evidence: [R02](https://github.com/coldshalamov/SpaceFace/blob/1e0cf9499613b7c3acad10f34739278136d3d469/design/VISION.md), [R03](https://github.com/coldshalamov/SpaceFace/blob/1e0cf9499613b7c3acad10f34739278136d3d469/AGENTS.md), [R04](https://github.com/coldshalamov/SpaceFace/blob/1e0cf9499613b7c3acad10f34739278136d3d469/tools/blender/forge/FORGE.md), [R08](https://github.com/coldshalamov/SpaceFace/blob/1e0cf9499613b7c3acad10f34739278136d3d469/src/data/authoredPlaces.js#L1-L155). See the inspection limits in `production/SOURCES.md`.

## First encounter

A survey contract points out a lost recorder beyond a wreck. The long route is plainly visible. The short route passes through a tapered, lit opening with a charted clearance envelope. A cargo pallet behind the player changes the answer to “will this fit?”

## Where and when

A new optional derelict-field subsite in sector_ceres_belt, outside existing critical lanes. Candidate position must be chosen after map collision/zone checks. An outside bypass must remain valid for the largest supported player hull and tow.

## Repeat loop

Inspect opening → compare body/load → align and coast through, reposition the load, or take the bypass → collect a record or complete a delivery. Repeat value comes from movement experimentation, not a hidden precision requirement.

## Visual and model recipe

An enormous oblong broken hull around a clear oval hole. Two missing panels expose ribs; a single cyan survey lamp illuminates the opening rim. The void is the central shape, not a dark tunnel with invisible hazards.

Author envelope: 120 × 80 × 28 m, +X nose / +Y port / +Z up. Proposed gameplay semantic radius: 85 WU (0 means not an independently targeted world body); proposed mass: 0 internal units (0 means static/preview, not a massless dynamic body). These are design targets, not final measured asset bounds. Runtime scale must follow the actual Forge/entity contract.

LOD triangle targets: 34,000 / 13,600 / 6,100; proposed near draw budget 11; nearby concept cap 1. Numbers are budgets to verify, never permission to bypass spawnBudget.

### RIM_SEGMENTS

Build: Build twelve separate chamfered rib wedges around an ellipse 60×34 m; exterior expands to 115×76 m.

Pivot / parent: Shared root.

Collision: Compound convex wedges preserving the open hole exactly.

### HULL_SKIN

Build: Raised plates span only adjacent ribs; omit two large damaged panels. Deep darkmetal recesses.

Pivot / parent: Fixed to ribs.

Collision: Reuse rib proxies; no giant convex hull.

### SHEARED_EDGE

Build: Three visibly bent plate strips at one end, with a generous safe interior margin.

Pivot / parent: Fixed.

Collision: Only large protrusions get proxies.

### SURVEY_LIGHTS

Build: Six short solid cyan edge markers, with a directional arrow shape modeled near the broad entrance.

Pivot / parent: Rim surface.

Collision: None.

### RECORDER

Build: 2 m dark box with a visible tow eye on a small platform beyond the opening.

Pivot / parent: Independent stable site object.

Collision: One small dynamic box if recovery uses towing.

## Animation recipe

| Clip / phase | Initial duration | Action |
|---|---:|---|
| Derelict idle | 18 s | One loose outer cable sways minimally; passage geometry never changes cosmetically. |
| Survey | 1 s | A rim light sweep confirms observed clearance once; text gives units or “too wide” based on actual bounds. |
| Contact | 0.25 s | Local spark at contact point, not whole-wreck flash. |
| Recovered | 0.7 s | Recorder status light dims on accepted pickup; no duplicate prop remains. |

Critical read: Camera and collision reliability are dependencies, not aesthetic polish to do afterward. This concept stays unshipped until both pass.

## AI / behavior

No creature AI. An encounter state machine tracks DISCOVERED, SURVEYED, ENTERED, RECOVERED and ABANDONED. Clearance guidance is a conservative geometric query against current player and attached-body swept bounds; present UNKNOWN when a reliable answer is unavailable. Never advertise a guaranteed trajectory through dynamic collisions. Existing pathfinding chooses the bypass unless a route is valid for the current convoy envelope.

## Physical truth

Use a genuine compound collider, not a concave moving mesh. Static wreck collision must agree with the hole. Tow length and object orientation are real constraints. Do not auto-shrink the player or disable collision to help the shortcut. At design time give the intended small-hull route at least 1.5 times that hull’s measured envelope; the final number follows actual asset bounds.

## Choices and counterplay

Thread the opening, shorten/reorient a load under existing Massline controls, detach and retrieve separately, or go around. Each option remains reversible; the recorder cannot be permanently wedged behind an unreachable collider.

## Failure and alternative outcomes

If a player gets stuck, a visible reverse path and ordinary recovery service remain possible. No lethal crush trap on the only objective path. A camera behind geometry must use the established occlusion response; adding bespoke transparent skins per object is not a substitute for fixing the owner.

## Personality and sound

Mostly quiet. A recorded surveyor voice is concise and slightly amused, never a mystical whisper. The structure itself has no personhood.

**discover:** “The Thimble Door. An optimistic name for a hole in a ship.”

**clearance:** “Hull clear. Attached load still needs room.”

**uncertain:** “Clearance uncertain. The outside route is open.”

**recorder:** “Recorder recovered. Survey complete.”

**bypass:** “Long way around. Still a perfectly good way around.”

Dialogue defaults: once-only first reveal; persistent dedupe for milestone lines; repeat flavor no more than once per 90 sim seconds per character, and only when the shared voice arbiter grants the slot. Threat cues are governed by attack state, not that flavor cooldown. Stop stale lines when their target/phase disappears. Captions retain speaker and factual meaning.

## Rewards / economy boundary

Ordinary survey/recovery pay, regardless of shortcut or bypass. Faster traversal is its own benefit; no punishment for accessibility-minded route choice.

## Save-state contract

siteDiscovered, surveyed, recorderOutcome, collisionRevision. Keep current clearance transient; recompute after ship or tow changes.

## Existing integration seams

- `src/data/authoredPlaces.js`
- `src/data/collisionProxyManifests.js`
- `src/render/camera.js`
- `src/systems/salvage.js`

These paths are starting points, not invented callable APIs. Read the live owners and current schemas before implementation. New concept helpers should emit to the owner rather than write its resource directly.

## Dependencies and packet sequence

SF20-01, SF20-03

Audit → behavior proof and model in parallel → presentation → normal-route integration → acceptance. Packet ids `SF20-13-A` through `-F` are in the task graph.

## Specific acceptance cases

1. Sweep smallest and largest hulls across all rim directions: contacts match visible ribs.
2. Tow a wide crate through and around: no false CLEAR result.
3. Place camera inside every rim quadrant: player and exit remain legible.
4. Save while partly inside: reload never ejects or duplicates bodies.
5. Recover recorder after an interrupted attempt: objective remains reachable.

## Player test

Ask players to predict fit before entry; compare with actual outcome. Any confident false-clearance prediction caused by the UI blocks release.

## Completion boundary

Require all shared gates in `production/TEST_PLAN.md`, the specific cases above, a normal-route encounter capture, top/chase/close model review, save/load evidence and matched performance measurements. This packet is not implemented or playtested merely because its plan and art exist. The art GLB is a non-shipping blockout; build the real asset through `production/ASSET_PIPELINE.md`.


---

# 14 — Anvil Storm Orchard

SF20-14 | Planetary site / harvest under changing conditions | Build wave 3 | DESIGN PROPOSAL

![Original procedural concept render](art/14_anvil_storm_orchard.png)

## Player-experience purpose

A crescent chain of atmospheric harvest kites hangs above Anvil’s storm band. Each kite collects a volatile condensate pod that can be retrieved between visibly forecast gust intervals.

**Gap / hypothesis:** The Anvil already exists as a physical planet. It needs a memorable, repeatable local livelihood that teaches its hazards and makes returning worthwhile, rather than another decorative planet.

**Existing overlap to preserve:** Extend zone_tethys_anvil, planets and planetRuntime. Do not add a second planet with identical sling/skim behavior, and never change the canonical planet field just to fit this content.

Repository evidence: [R02](https://github.com/coldshalamov/SpaceFace/blob/1e0cf9499613b7c3acad10f34739278136d3d469/design/VISION.md), [R03](https://github.com/coldshalamov/SpaceFace/blob/1e0cf9499613b7c3acad10f34739278136d3d469/AGENTS.md), [R07](https://github.com/coldshalamov/SpaceFace/blob/1e0cf9499613b7c3acad10f34739278136d3d469/src/core/registry.js#L1-L170), [R08](https://github.com/coldshalamov/SpaceFace/blob/1e0cf9499613b7c3acad10f34739278136d3d469/src/data/authoredPlaces.js#L1-L155). See the inspection limits in `production/SOURCES.md`.

## First encounter

A skimmer foreman calls from a safe service platform outside the hot band. Three huge fins lean with the current; one harvest pod is ready. The player can wait for a calm interval or attempt a skilled timed tow while watching both cargo shock and planetary heat.

## Where and when

Within the existing Anvil site in sector_tethys_junction, at a validated band-relative offset derived from planetRuntime. Do not hardcode a second global center. Keep a safe holding pocket beyond the dangerous band and an unconditional escape direction.

## Repeat loop

Observe forecast → choose one harvest pod → skim/tow under real forces → exit before accumulated heat becomes critical → deliver to an existing receiver. Later storms vary timing and available harvest, not hidden force magnitude.

## Visual and model recipe

Three enormous crescent fins on sparse dark trusses, each with a bright amber condensate pod at its base. The planet fills part of the background but never becomes a second solid shell clipping through the camera.

Author envelope: 150 × 100 × 35 m, +X nose / +Y port / +Z up. Proposed gameplay semantic radius: 100 WU (0 means not an independently targeted world body); proposed mass: 0 internal units (0 means static/preview, not a massless dynamic body). These are design targets, not final measured asset bounds. Runtime scale must follow the actual Forge/entity contract.

LOD triangle targets: 36,000 / 14,400 / 6,500; proposed near draw budget 13; nearby concept cap 1. Numbers are budgets to verify, never permission to bypass spawnBudget.

### ANCHOR_TRUSS

Build: Three fixed service posts on a shallow arc, 40 m apart; built from shared truss sections.

Pivot / parent: Local relative to planet site anchor.

Collision: Three small static proxy clusters, not one solid arc.

### HARVEST_FIN_1..3

Build: Each 30×14 m curved plate approximated by five low-curvature segments, with a thick leading rib.

Pivot / parent: Pitch hinge along Y; ±18 degrees cosmetic flex within fixed safe envelope.

Collision: No collider on cosmetic flex; solid frame uses simple segments.

### POD_1..3

Build: 4 m capsule with dark collar and amber core indicator.

Pivot / parent: Independent release roots at each service post.

Collision: Mass 10, dynamic capsule after accepted release.

### SAFE_PLATFORM

Build: 20×14 m service slab with unmistakable open holding mouth.

Pivot / parent: Outside heat band.

Collision: Simple convex deck boundaries.

### WINDSOCK_MARKERS

Build: Three articulated solid fins, not cloth simulation.

Pivot / parent: Frame-mounted Z hinges.

Collision: None.

## Animation recipe

| Clip / phase | Initial duration | Action |
|---|---:|---|
| Calm | 10 s | Fins align toward the current; pod readiness indicator steady. |
| Forecast gust | 2 s | Windsock vanes deflect before actual gust onset; warning is shared with text. |
| Gust | 5 s | Fin lean follows actual field strength and direction, clamped to designed range. |
| Harvest release | 0.5 s | Collar opens after accepted interaction, leaving the pod’s real body available to tow. |

Critical read: Use existing planetary rendering. No new full-screen storm shader, extra atmosphere sphere, or heavy transparent layers in the first version.

## AI / behavior

Site scheduler uses sim ticks and the existing environmental machinery owner: CALM, FORECAST, GUST, RECOVERY. Planet forces remain authoritative. Harvest readiness accumulates only at the intended cadence and consumes a finite local resource budget. NPC skimmers read the same forecast and wait or retreat accordingly. New weather data may modulate an authored local effect only through the current field owner; no competing gravitational acceleration.

## Physical truth

A harvested pod is fragileCargo with explicit shock/heat rules. Wind direction and strength must be disclosed by the same state that applies forces. Set proposed gust lead time to 120 ticks; after tests, tune with real stopping distances. A long tether does not extend heat immunity. Coupling release inherits point velocity and does not spawn a new copy on every hail.

## Choices and counterplay

Wait, make a single conservative harvest, combine a skilled slingshot with collection, or accept an NPC-assisted retrieval at a lower net return. Time pressure is voluntary; no main story item requires dangerous skimming.

## Failure and alternative outcomes

Overheated or shattered pods reduce that run’s yield. Losing a ship follows normal recovery; do not permanently lock the planet. A forecast after reload must preserve its remaining lead time, not jump directly to a damaging gust.

## Personality and sound

Foreman Alin sounds relaxed because they have learned not to argue with weather. Critical lines are clear, short and directional; ambient poetry waits until the player is safe.

**intro:** “The orchard is ready. The weather has not agreed to help.”

**forecast:** “Gust in two. Hold outside the band.”

**safe:** “You are clear. Let the pod settle before the next burn.”

**loss:** “Lost the harvest, not the lesson. Come back cold.”

**repeat:** “Same sky. Different bad idea. Show me.”

Dialogue defaults: once-only first reveal; persistent dedupe for milestone lines; repeat flavor no more than once per 90 sim seconds per character, and only when the shared voice arbiter grants the slot. Threat cues are governed by attack state, not that flavor cooldown. Stop stale lines when their target/phase disappears. Captions retain speaker and factual meaning.

## Rewards / economy boundary

Finite harvested commodity through current cargo/economy; tune expected earnings near comparable active mining, not an infinite premium loop.

## Save-state contract

sitePhase, phaseStartTick, podCycleIds[3], harvestOutcomes, localYieldBudget. Planet state and fields remain with existing owners.

## Existing integration seams

- `src/data/authoredPlaces.js`
- `src/systems/planetRuntime.js`
- `src/systems/environmentalMachinery.js`
- `src/systems/fragileCargo.js`

These paths are starting points, not invented callable APIs. Read the live owners and current schemas before implementation. New concept helpers should emit to the owner rather than write its resource directly.

## Dependencies and packet sequence

SF20-04, SF20-11

Audit → behavior proof and model in parallel → presentation → normal-route integration → acceptance. Packet ids `SF20-14-A` through `-F` are in the task graph.

## Specific acceptance cases

1. Compare forecast direction with applied force at multiple points.
2. Load one tick before gust: full remaining warning is truthful.
3. Harvest the same pod twice: second request refuses.
4. Leave and return midcycle: resource and phase do not reset for profit.
5. Maximal tow length and large hull: safe pocket actually remains safe.

## Player test

Players can predict a gust and choose to wait without feeling punished. Measure failed exits against visible warnings and real stopping distance.

## Completion boundary

Require all shared gates in `production/TEST_PLAN.md`, the specific cases above, a normal-route encounter capture, top/chase/close model review, save/load evidence and matched performance measurements. This packet is not implemented or playtested merely because its plan and art exist. The art GLB is a non-shipping blockout; build the real asset through `production/ASSET_PIPELINE.md`.


---

# 15 — Veil-Ray Nursery

SF20-15 | Ecological place / quiet observation | Build wave 2 | DESIGN PROPOSAL

![Original procedural concept render](art/15_veil_ray_nursery.png)

## Player-experience purpose

A sheltered arc of mineral ribs contains a few adult veil-rays and tiny juvenile silhouettes. Their motion opens a passage only when the player stops disturbing the waterless dark.

**Gap / hypothesis:** An ecology catalog can be extensive yet emotionally flat. An authored nursery lets a known nonhostile species demonstrate behavior that rewards restraint and observation.

**Existing overlap to preserve:** Use existing veil_ray species and its sensitivity to scans/weapons. Do not invent another parasite, retcon Vethari canon, or turn these fauna into tactical enemies. Cinder Nursery already exists; this is a small satellite encounter, not a replacement biome.

Repository evidence: [R03](https://github.com/coldshalamov/SpaceFace/blob/1e0cf9499613b7c3acad10f34739278136d3d469/AGENTS.md), [R08](https://github.com/coldshalamov/SpaceFace/blob/1e0cf9499613b7c3acad10f34739278136d3d469/src/data/authoredPlaces.js#L1-L155), [R12](https://github.com/coldshalamov/SpaceFace/blob/1e0cf9499613b7c3acad10f34739278136d3d469/src/data/alienFauna.js#L1-L145). See the inspection limits in `production/SOURCES.md`.

## First encounter

Near an existing ecology site in Charon, a scan briefly scatters the rays. Passive observation reveals their preferred quiet corridor; cutting thrust and waiting allows them to re-form around a mineral arch. A survey can complete from a respectful distance without touching or capturing anything.

## Where and when

An additive, optional subsite near an existing Charon ecology anchor, after the scanner has identified veil_ray. Maintain the established revelation gates and at least-half-nonhostile sighting rule. Do not add a dense new spawn table.

## Repeat loop

Notice motion → observe how thrust/scan changes behavior → choose a quieter approach → document a route or return later. The reward is knowledge and a changed relationship to space, not biological loot grinding.

## Visual and model recipe

A pale mineral crescent cradling three translucent-looking but mostly opaque kite-shaped rays. Broad membrane wings, dark center keels and small warm filaments. Juveniles read as sparse smaller silhouettes rather than particle fog.

Author envelope: 80 × 60 × 14 m, +X nose / +Y port / +Z up. Proposed gameplay semantic radius: 60 WU (0 means not an independently targeted world body); proposed mass: 0 internal units (0 means static/preview, not a massless dynamic body). These are design targets, not final measured asset bounds. Runtime scale must follow the actual Forge/entity contract.

LOD triangle targets: 20,000 / 8,000 / 3,600; proposed near draw budget 10; nearby concept cap 1. Numbers are budgets to verify, never permission to bypass spawnBudget.

### NURSERY_RIBS

Build: Seven static irregular rock ribs on a 60 m crescent; use deterministic rock seeds and broad fractured facets.

Pivot / parent: Site root.

Collision: At most seven simple convex proxies; preserve the passage.

### RAY_ADULT

Build: Reuse/remaster existing veil-ray asset: central keel plus two broad membrane surfaces, no humanoid face.

Pivot / parent: Root along +X.

Collision: Keep existing fauna collision contract; do not add lethal solid wings.

### MEMBRANE_L/R

Build: Each wing uses three broad strips with a small rig or vertex deformation; total adult mesh target 1800 triangles.

Pivot / parent: Root/wingtip controls, no more than 8 bones if skinned.

Collision: Render-only deformation.

### JUVENILES

Build: 6–9 small instanced copies represented by one aggregate visual group.

Pivot / parent: Seeded offsets from site root.

Collision: No individual physics bodies.

### FILAMENTS

Build: Two short curved solid ribbons per adult, tapering to a point.

Pivot / parent: Keel sockets.

Collision: None.

## Animation recipe

| Clip / phase | Initial duration | Action |
|---|---:|---|
| Forage | 4.5 s | Wing tips travel a slow phase-shifted wave; forward speed comes from fauna simulation, not root motion. |
| Notice | 0.8 s | Wings narrow and keel turns toward stimulus without charging. |
| Scatter | 1.2 s | Fold silhouette and accelerate using existing flee drive; animation follows actual drive. |
| Settle | 6 s | Adults return to formation gradually after stimulus decay, with no instant synchronized reset. |

Critical read: Alien softness must be carried by broad membranes and motion, not multiple transparent shell layers or dense CPU particles.

## AI / behavior

Read FAUNA_SPECIES.veil_ray and extend site-specific goals rather than adding a second drive engine. Nursery state: QUIET, DISTURBED, RECOVERING. Weapon and scan stimuli use existing weights; sustained close thrust may map to the existing heat/vibration stimulus only if its semantics match. At most three adult simulation entities; juveniles are an aggregate. No omniscient detection of the player opening a menu.

## Physical truth

The observed species uses collision-free semantic radius in current data. Preserve that. Rocks are the actual collision geometry; rays do not suddenly become high-mass blockers. A nursery route is behavioral guidance, not a locked physical gate. The player can always leave through the open outer arc.

## Choices and counterplay

Passively observe, take a quick disruptive scan, return after settling, or leave. A short scientific survey does not require perfect behavior or an unadvertised sequence. Violence remains possible under existing fauna rules but is not an efficient farming path.

## Failure and alternative outcomes

Disturbance changes the encounter without permanent softlock. Settle timer freezes or advances according to the existing offscreen ecology model, not local render time. A killed adult stays represented in the site’s persistent population outcome; juveniles are not endlessly reissued as loot.

## Personality and sound

No speaking animals and no sentimental child voices. Use gentle resonant membrane tones and distant radio from a surveyor, only after the observation window. Captions identify the stimulus/response for players unable to hear it.

**survey:** “Veil-rays. They noticed the scanner before we noticed them.”

**disturbance:** “The formation broke when the drive flared.”

**settle:** “Engines quiet. Give them room.”

**observed:** “The route is there. They are using it, not guarding it.”

**return:** “Same shelter. Fewer disturbances in the log.”

Dialogue defaults: once-only first reveal; persistent dedupe for milestone lines; repeat flavor no more than once per 90 sim seconds per character, and only when the shared voice arbiter grants the slot. Threat cues are governed by attack state, not that flavor cooldown. Stop stale lines when their target/phase disappears. Captions retain speaker and factual meaning.

## Rewards / economy boundary

One survey reward and a codex observation. No loot from juvenile visuals and no repeatable money for disturbing then calming the group.

## Save-state contract

siteId, nurseryObservationFlags, populationOutcome, disturbanceTimestamp or tick through existing ecology owner. Do not create an independent fauna population registry.

## Existing integration seams

- `src/data/alienFauna.js`
- `src/data/alienEcology.js`
- `src/data/authoredPlaces.js`
- `src/systems/scanner.js`

These paths are starting points, not invented callable APIs. Read the live owners and current schemas before implementation. New concept helpers should emit to the owner rather than write its resource directly.

## Dependencies and packet sequence

No other new concept required.

Audit → behavior proof and model in parallel → presentation → normal-route integration → acceptance. Packet ids `SF20-15-A` through `-F` are in the task graph.

## Specific acceptance cases

1. Active scan disperses formation through existing stimulus rules.
2. Passive observation succeeds without hidden input sequence.
3. Mute sound and reduce motion: behavior and survey cues still understandable.
4. Exit/reenter repeatedly: no population or survey-reward duplication.
5. Use maximum graphics quality: juvenile aggregation does not create dozens of AI updates.

## Player test

Observe whether players voluntarily reduce thrust after seeing a response. Ask what caused the change; a correct causal explanation matters more than whether they chose to comply.

## Completion boundary

Require all shared gates in `production/TEST_PLAN.md`, the specific cases above, a normal-route encounter capture, top/chase/close model review, save/load evidence and matched performance measurements. This packet is not implemented or playtested merely because its plan and art exist. The art GLB is a non-shipping blockout; build the real asset through `production/ASSET_PIPELINE.md`.


---

# 16 — Borrowed Voice

SF20-16 | Fungal memory artifact / investigation | Build wave 3 | DESIGN PROPOSAL

![Original procedural concept render](art/16_borrowed_voice.png)

## Player-experience purpose

Three colonized recorder housings repeat fragments of a lost work shift. Moving the housings into a clean relay geometry improves intelligibility, but never turns inference into certainty.

**Gap / hypothesis:** Alien lore becomes stronger when evidence can be manipulated and its uncertainty stays visible. A physical signal-recovery encounter can reveal memory without replacing mystery with a talking exposition machine.

**Existing overlap to preserve:** Keep the Vethari → fungus → host/ecology → shared-memory chain. Understory remains the technical namespace. This is damaged retained signal, not proof the hive has a human personality, not a new species and not the off-frame creators appearing as an NPC.

Repository evidence: [R03](https://github.com/coldshalamov/SpaceFace/blob/1e0cf9499613b7c3acad10f34739278136d3d469/AGENTS.md), [R08](https://github.com/coldshalamov/SpaceFace/blob/1e0cf9499613b7c3acad10f34739278136d3d469/src/data/authoredPlaces.js#L1-L155), [R12](https://github.com/coldshalamov/SpaceFace/blob/1e0cf9499613b7c3acad10f34739278136d3d469/src/data/alienFauna.js#L1-L145), [R13](https://github.com/coldshalamov/SpaceFace/blob/1e0cf9499613b7c3acad10f34739278136d3d469/src/data/precursorMachines.js#L1-L125). See the inspection limits in `production/SOURCES.md`.

## First encounter

After the existing second-stage ecology revelation, the player discovers a derelict with a corrupted maintenance phrase. A scanner shows three signal sources. Towing one clear of shielding debris exposes a date fragment; orienting another reveals a warning. The reconstructed record still has a missing segment clearly marked unknown.

## Where and when

At a verified existing Vethari-linked Charon site, not a new parasitic biome. Use the current revelation level as the gate; no readable story subtitles leak the secret before that gate.

## Repeat loop

Locate physical sources → reduce interference through towing/positioning → inspect recovered fragments → choose whether to quarantine, archive or leave the artifact. The interpretation remains a journal hypothesis tied to evidence ids.

## Visual and model recipe

A broken industrial recorder ring stitched by pale fungal fans. Three hard-edged memory boxes sit at unequal points around it, each with a distinct damaged antenna shape. Cyan device traces contrast with muted ivory growth; no giant glowing face.

Author envelope: 46 × 38 × 10 m, +X nose / +Y port / +Z up. Proposed gameplay semantic radius: 34 WU (0 means not an independently targeted world body); proposed mass: 0 internal units (0 means static/preview, not a massless dynamic body). These are design targets, not final measured asset bounds. Runtime scale must follow the actual Forge/entity contract.

LOD triangle targets: 24,000 / 9,600 / 4,300; proposed near draw budget 11; nearby concept cap 1. Numbers are budgets to verify, never permission to bypass spawnBudget.

### BROKEN_RING

Build: Five of eight ring segments, 18 m outer radius and 13 m inner radius, with exposed dark cable raceway.

Pivot / parent: Site root.

Collision: Five convex static segments.

### RECORDER_A/B/C

Build: Three distinct 4×3×2 m boxes: one dish antenna, one fork antenna, one missing mast. Large physical handles.

Pivot / parent: Independent roots at unequal ring positions.

Collision: Mass 8 each; box colliders.

### FUNGAL_FANS

Build: Six broad scalloped plates anchored to damaged metal, 2–5 m wide, with modeled connection necks.

Pivot / parent: Child of host segment; never float.

Collision: Use existing ecology collision policy; usually none.

### RELAY_ORGAN

Build: One folded fan surrounding a recorder socket, with a dark central seam.

Pivot / parent: No humanoid facial arrangement.

Collision: Existing scan anatomy only.

### SIGNAL_POINTS

Build: One small stable emissive notch per recorder; intensity shows real signal quality.

Pivot / parent: Fixed to each recorder.

Collision: None.

## Animation recipe

| Clip / phase | Initial duration | Action |
|---|---:|---|
| Dormant | 9 s | Very slight fan flex; signal notch holds low brightness. |
| Signal improves | 1.2 s | Physical indicator brightens proportionally to the real quality score; do not pulse words into existence randomly. |
| Memory fragment | 3 s | No speaker-mouth motion. A faint sequential illumination traverses the host wiring once. |
| Quarantine | 1.5 s | Existing containment state suppresses growth motion and signal presentation only after its confirmed transition. |

Critical read: Maintain the off-frame catastrophe. This is a small piece of a broken civilization’s residue, not the moment the game explains the entire universe.

## AI / behavior

No tactical AI. A deterministic evidence FSM tracks UNREADABLE, SOURCE_LOCATED, FRAGMENT_RECOVERED, INTERPRETED, DISPOSITION. Signal quality is an explicit function of receiver distance, observed occlusion and recorder orientation, sampled at 5 Hz. Each recovered fragment has a fixed evidence id and canonical text. Do not use runtime LLM generation or invent facts from a variable seed. Offer competing interpretations as authored hypotheses where evidence is incomplete.

## Physical truth

Three recorder bodies are genuine low-mass objects. Their signal orientation derives from sim rotation, not decorative fan pose. Occlusion checks operate against the existing spatial query representation, with a bounded ray count. Solving does not require matching a sub-degree angle: use broad acceptance bands with hysteresis, so a jittering physics object does not chatter between clear and unclear.

## Choices and counterplay

Recover enough to understand the immediate incident, pursue optional details, archive the artifact, quarantine it, or leave it in place. Disposition affects an actual later record or ecology state; it never awards omniscient truth.

## Failure and alternative outcomes

Destroying a source permanently marks that fragment missing, but alternative earlier logs can support a partial conclusion. The main story never requires a fragile object that can be lost forever without a fallback. Recovered text remains in the journal after the physical source is gone.

## Personality and sound

Fragmented maintenance radio from the fictional lost crew: dry, intimate, imperfectly stitched. No imitation of the player or a real person. Distortion sits around intelligible words, not on top of captions; unrecovered text remains literally unknown.

**fragment_a:** “—third shift. Receiver two is answering before we call—”

**fragment_b:** “—not a second crew. Same words. Wrong order—”

**fragment_c:** “—leave the recorder attached. We need to know what it remembers—”

**interpretation:** “Recovered record. Source continuity remains unconfirmed.”

**quarantine:** “Signal isolated. The missing segment is still missing.”

Dialogue defaults: once-only first reveal; persistent dedupe for milestone lines; repeat flavor no more than once per 90 sim seconds per character, and only when the shared voice arbiter grants the slot. Threat cues are governed by attack state, not that flavor cooldown. Stop stale lines when their target/phase disappears. Captions retain speaker and factual meaning.

## Rewards / economy boundary

One archive/recovery contract payout and evidence-based codex content. Do not price harvesting signal fragments as a renewable commodity.

## Save-state contract

recoveredFragmentIds<=3, disposition enum, recorderOutcomeIds[3], evidenceRevision. Hypothesis references evidence; never duplicate global revelation progress.

## Existing integration seams

- `src/data/alienEcology.js`
- `src/data/alienEcologyState.js`
- `src/systems/scanner.js`
- `src/systems/story.js`

These paths are starting points, not invented callable APIs. Read the live owners and current schemas before implementation. New concept helpers should emit to the owner rather than write its resource directly.

## Dependencies and packet sequence

SF20-15, SF20-18

Audit → behavior proof and model in parallel → presentation → normal-route integration → acceptance. Packet ids `SF20-16-A` through `-F` are in the task graph.

## Specific acceptance cases

1. Before revelation gate: no captions or journal titles spoil readable content.
2. Move recorder through the threshold repeatedly: one fragment and one reward.
3. Destroy one source: partial conclusion and journal remain valid.
4. Render-only animation changes: signal score is unchanged.
5. Reload after quarantine: no restored emission or new biology spawn.

## Player test

Players distinguish what the record demonstrates from what it merely suggests. Interview for causal clarity and sustained curiosity, not perfect lore recall.

## Completion boundary

Require all shared gates in `production/TEST_PLAN.md`, the specific cases above, a normal-route encounter capture, top/chase/close model review, save/load evidence and matched performance measurements. This packet is not implemented or playtested merely because its plan and art exist. The art GLB is a non-shipping blockout; build the real asset through `production/ASSET_PIPELINE.md`.


---

# 17 — The Open-Hand Lock

SF20-17 | Precursor site / noncombat protocol puzzle | Build wave 3 | DESIGN PROPOSAL

![Original procedural concept render](art/17_open_hand_lock.png)

## Player-experience purpose

Three enormous dark stone fingers surround an open aperture. A retained courier token must be physically returned to a matching cradle before the lock grants a temporary transit interval. The machine is exact, not malevolent.

**Gap / hypothesis:** Precursor machines already have strong protocol identity. A physical negotiation with one local institution can let players learn those rules through action instead of reading an exposition panel.

**Existing overlap to preserve:** Use existing auditor, courier and conservator roles, and protocol states—not faction reputation. No mystical riddle machine, no new precursor race, no revelation of the creators.

Repository evidence: [R03](https://github.com/coldshalamov/SpaceFace/blob/1e0cf9499613b7c3acad10f34739278136d3d469/AGENTS.md), [R08](https://github.com/coldshalamov/SpaceFace/blob/1e0cf9499613b7c3acad10f34739278136d3d469/src/data/authoredPlaces.js#L1-L155), [R13](https://github.com/coldshalamov/SpaceFace/blob/1e0cf9499613b7c3acad10f34739278136d3d469/src/data/precursorMachines.js#L1-L125). See the inspection limits in `production/SOURCES.md`.

## First encounter

A player encounters an existing courier frame carrying a damaged token. At the nearby lock, the auditor issues a plain instruction: present the token in the visible cradle. The token can be returned, inspected at the cost of delaying transit, or left alone while the player takes the outside route.

## Where and when

Attach to a surveyed Verge machine site that already supports auditor/courier presence. Final sector/anchor id must be resolved from precursorMachines at implementation; this packet intentionally does not invent a canonical site id. An outer bypass must exist.

## Repeat loop

Read directive → inspect physical affordance → move the token into the correct receiver → see protocol state change → use or ignore the opened route. Later visits can reflect the token’s disposition without a new reputation meter.

## Visual and model recipe

Three tall but broad radial fingers, each built from dark stacked prismatic slabs, with a central empty passage. One clean cyan seam per finger. A small asymmetrical receiving cradle makes the action legible from above.

Author envelope: 100 × 100 × 45 m, +X nose / +Y port / +Z up. Proposed gameplay semantic radius: 80 WU (0 means not an independently targeted world body); proposed mass: 0 internal units (0 means static/preview, not a massless dynamic body). These are design targets, not final measured asset bounds. Runtime scale must follow the actual Forge/entity contract.

LOD triangle targets: 36,000 / 14,400 / 6,500; proposed near draw budget 10; nearby concept cap 1. Numbers are budgets to verify, never permission to bypass spawnBudget.

### FINGER_A/B/C

Build: Three 35 m stacked prisms around a radius-28 m circle, each leaning outward by 12 degrees; large bevels, no runic wallpaper.

Pivot / parent: Fixed root; +Z author-up.

Collision: Three compound static proxies with a true open middle.

### CRADLE

Build: A 10×8 m wedge platform outside the aperture with one unmistakable shaped recess.

Pivot / parent: Site-local asymmetric X/Y offset.

Collision: Sensor volume plus simple solid lip.

### TOKEN

Build: 4×3×1 m hexagonal prism with one clipped corner matching the cradle.

Pivot / parent: Independent courier cargo root.

Collision: Mass 6, one convex prism.

### IRIS_LEAVES

Build: Three broad plates retract radially 12 m.

Pivot / parent: One linear pivot per finger.

Collision: Kinematic colliders only during a tested physical gate operation.

### PROTOCOL_SEAMS

Build: Three short cyan inset bands that change state together without flashing.

Pivot / parent: Finger surfaces.

Collision: None.

## Animation recipe

| Clip / phase | Initial duration | Action |
|---|---:|---|
| Interrogate | 1.5 s | A narrow light line traverses each finger toward the cradle; pair with exact directive text. |
| Accept | 2 s | Token seats only after validated position/orientation, then iris retracts. |
| Transit open | 8 s | Steady seam light, no rotation that hides the aperture. |
| Close pending | 2 s | Mechanism signals closure but waits until swept passage is clear; no crush trap. |

Critical read: One institution, one procedure. The monumental silhouette carries age; arbitrary glowing runes do not.

## AI / behavior

Existing machine protocol adapters own standing and directives. Site states: IDLE, REQUEST_TOKEN, VERIFY, OPEN, CLOSE_PENDING, REJECT. Verify token identity, actual cradle occupancy, and permitted protocol state; do not accept an arbitrary item with similar geometry. The auditor does not chase or retaliate merely because the player declines. If revocation triggers existing enforcement, show the documented consequence before a player choice that can cause it.

## Physical truth

The token must be moved with current cargo/tether verbs. Broad angular tolerance, proposed ±25 degrees, and relative speed under 6 WU/s make the cradle deliberate but not finicky. Gate motion is a kinematic physics action with swept clearance and a fail-open state while occupied. The gate cannot set a moving ship’s position or crush an entity because a UI timer expired.

## Choices and counterplay

Return the token, inspect it first, retain it and forgo the shortcut, or take the outside route. The interesting choice is between access and custody, not a disguised binary good/evil score.

## Failure and alternative outcomes

Damaged or missing token produces an explicit denial and preserves the bypass. A gate interrupted during closing remains physically safe and visibly unavailable until reconciled. Protocol state survives save/load independently of whether the giant model is streamed in.

## Personality and sound

Procedural, exact, almost ordinary. Short phrases with no theatrical omniscience or mystical riddles. Mechanical audio is sparse sub-bass with a dry upper click; captions repeat the exact directive.

**request:** “RETURN TRANSIT TOKEN TO EXTERNAL CRADLE.”

**wrong_object:** “OBJECT IDENTITY DOES NOT SATISFY REQUEST.”

**accept:** “CUSTODY ACCEPTED. TRANSIT INTERVAL OPEN.”

**occupied:** “CLOSURE DEFERRED. PASSAGE OCCUPIED.”

**retain:** “CUSTODY UNRESOLVED. OUTER ROUTE AVAILABLE.”

Dialogue defaults: once-only first reveal; persistent dedupe for milestone lines; repeat flavor no more than once per 90 sim seconds per character, and only when the shared voice arbiter grants the slot. Threat cues are governed by attack state, not that flavor cooldown. Stop stale lines when their target/phase disappears. Captions retain speaker and factual meaning.

## Rewards / economy boundary

Access and optional evidence, with only an existing survey contract payout. Do not make returned tokens a renewable cash faucet.

## Save-state contract

siteProtocolReference, tokenId, tokenCustodyOutcome, gatePhase, remainingOpenTicks. Never store machine standing in ordinary faction reputation.

## Existing integration seams

- `src/data/precursorMachines.js`
- `src/data/authoredPlaces.js`
- `src/data/contactHail.js`
- `src/systems/scanner.js`

These paths are starting points, not invented callable APIs. Read the live owners and current schemas before implementation. New concept helpers should emit to the owner rather than write its resource directly.

## Dependencies and packet sequence

SF20-13, SF20-16

Audit → behavior proof and model in parallel → presentation → normal-route integration → acceptance. Packet ids `SF20-17-A` through `-F` are in the task graph.

## Specific acceptance cases

1. Present wrong token-shaped object: no access.
2. Occupy gate at closure: collider waits safely.
3. Retain token: outside route and main story remain valid.
4. Load mid-open: same protocol and safe gate state return.
5. Before the applicable revelation: machine behavior stays within current canon gates.

## Player test

A player can state the rule, carry it out, and explain the consequence without interpreting lore metaphors. The machine should feel strange because it is consistent.

## Completion boundary

Require all shared gates in `production/TEST_PLAN.md`, the specific cases above, a normal-route encounter capture, top/chase/close model review, save/load evidence and matched performance measurements. This packet is not implemented or playtested merely because its plan and art exist. The art GLB is a non-shipping blockout; build the real asset through `production/ASSET_PIPELINE.md`.


---

# 18 — The Last Shift

SF20-18 | Wreck microstory / causal investigation | Build wave 1 | DESIGN PROPOSAL

![Original procedural concept render](art/18_last_shift.png)

## Player-experience purpose

A damaged ore carrier contains a dead transmitter, a detached load and a surviving tug log. Their positions tell a story: the crew cut cargo loose to keep a towline from dragging two ships into a collision.

**Gap / hypothesis:** A wreck should be more than a loot piñata. A small recoverable chain of physical evidence can teach provenance, restraint and partial success while making the world feel inhabited.

**Existing overlap to preserve:** Reuse aftermathWrecks, uniqueWrecks, salvage and the chronicler/provenance ledger. This is authored evidence for those owners, not a new universal story engine or omniscient replay system.

Repository evidence: [R02](https://github.com/coldshalamov/SpaceFace/blob/1e0cf9499613b7c3acad10f34739278136d3d469/design/VISION.md), [R03](https://github.com/coldshalamov/SpaceFace/blob/1e0cf9499613b7c3acad10f34739278136d3d469/AGENTS.md), [R07](https://github.com/coldshalamov/SpaceFace/blob/1e0cf9499613b7c3acad10f34739278136d3d469/src/core/registry.js#L1-L170), [R09](https://github.com/coldshalamov/SpaceFace/blob/1e0cf9499613b7c3acad10f34739278136d3d469/src/data/contactHail.js#L1-L110). See the inspection limits in `production/SOURCES.md`.

## First encounter

The player enters a small wreck field where a long towline fairlead is visibly torn sideways. A cargo pallet sits beyond the impact scar, not conveniently inside the wreck. Recovering three objects in any order reveals a risky rescue attempt rather than the pirate attack assumed by the first rumor.

## Where and when

One authored Ceres wreck pocket along a normal mining route. First clue is visible on ordinary approach; no pixel hunting. Use an existing survey/salvage contract to introduce it, with a large marked search volume and broad scanner detection.

## Repeat loop

Observe damage → select and recover evidence → revise an initial hypothesis → decide what to salvage and what to return → see a later local report cite only recovered facts. The order of discovery changes the reveal, not the underlying truth.

## Visual and model recipe

A split industrial carrier with a missing stern drive and a dramatically bent lateral tow fairlead. A detached orange cargo rack and a small black recorder form two distinct nearby points. Composition is readable as a three-object problem.

Author envelope: 66 × 42 × 17 m, +X nose / +Y port / +Z up. Proposed gameplay semantic radius: 50 WU (0 means not an independently targeted world body); proposed mass: 0 internal units (0 means static/preview, not a massless dynamic body). These are design targets, not final measured asset bounds. Runtime scale must follow the actual Forge/entity contract.

LOD triangle targets: 30,000 / 12,000 / 5,400; proposed near draw budget 11; nearby concept cap 1. Numbers are budgets to verify, never permission to bypass spawnBudget.

### WRECK_FORE

Build: Half of a 58 m work-carrier loft; jagged break modeled as 6 broad layered plates, not noise.

Pivot / parent: Site-root forward half.

Collision: Three static convex pieces.

### WRECK_AFT

Build: Separate 15 m stern section offset and rotated 23 degrees; engine bells clearly torn away.

Pivot / parent: Own stable site transform.

Collision: Two static convex pieces.

### FAIRLEAD

Build: 9 m truss bent 35 degrees toward the impact side, with a large empty roller throat.

Pivot / parent: Attached to forebody.

Collision: Two simple beam proxies.

### CARGO_RACK

Build: 12×8 m orange frame holding two legitimate commodity pallets.

Pivot / parent: Dynamic root outside wreck bounds.

Collision: Compound frame plus cargo bodies only if the existing cargo owner supports them.

### RECORDER

Build: 3 m rectangular box with severed antenna and one low-power lamp.

Pivot / parent: Independent root 30–50 WU from wreck.

Collision: Mass 5, one box.

## Animation recipe

| Clip / phase | Initial duration | Action |
|---|---:|---|
| Quiet wreck | 14 s | One intermittent non-flashing vent and slow cosmetic cable relaxation. No unnecessary rotation of a static collider. |
| Clue scan | 1.2 s | Local highlight follows the selected object boundary and points to a specific damage feature. |
| Recovered | 0.5 s | Accepted object transfer removes that body/mesh once. |
| Evidence reconstruction | 4 s | Optional abstract path overlay made only from recovered timestamps, clearly labeled reconstruction; never a photoreal omniscient cutscene. |

Critical read: No long cutscene. Three physical objects, one wrong first impression, one meaningful correction.

## AI / behavior

Evidence controller has three independent clue flags and an interpretation state. Each clue unlocks a fixed fact and one explicitly provisional hypothesis. Journal summaries are deterministic templates. The initial rumor is attributed and corrected when contradictory evidence arrives. Chronicle publication is triggered only by an explicit archive/report action and references the delivered evidence ids.

## Physical truth

The large wreck is static; small recoverable objects are dynamic. Clue locations are authored to support the story but not require precision jumping. A held/towed recorder can still be scanned. Do not rerun the historical accident with unstable physics and pretend the result is evidence; a reconstruction visualizes recorded positions only.

## Choices and counterplay

Return personal/log records, salvage unclaimed hardware, publish a partial report, investigate all clues, or leave. Recovering valuable cargo and preserving evidence can conflict locally, but one mistake never destroys every path to understanding.

## Failure and alternative outcomes

A destroyed clue remains destroyed and its journal fact remains unknown. A previously read clue remains known. The report can truthfully say insufficient evidence; no hidden marker supplies the missing answer. No penalty simply for failing to solve the mystery.

## Personality and sound

Recorded crew dialogue, short and practical, with life implied by work rather than a long final speech. The survivor is not present to explain the whole plot. Keep silence around important discoveries.

**rumor:** “Yard report: probable pirate strike. No witnesses interviewed.”

**record_a:** “We have the tug on the line. Do not burn yet.”

**record_b:** “Cut the load. Keep the ship. I said keep the ship.”

**evidence:** “The damage pattern supports a lateral tow failure, not incoming fire.”

**partial_report:** “Two records recovered. Final sequence remains incomplete.”

Dialogue defaults: once-only first reveal; persistent dedupe for milestone lines; repeat flavor no more than once per 90 sim seconds per character, and only when the shared voice arbiter grants the slot. Threat cues are governed by attack state, not that flavor cooldown. Stop stale lines when their target/phase disappears. Captions retain speaker and factual meaning.

## Rewards / economy boundary

One salvage/survey budget split between actual cargo and returned evidence. Do not triple-pay the same object as salvage, recovery and story completion.

## Save-state contract

siteId, recoveredClueIds<=3, destroyedClueIds<=3, publishedEvidenceRevision, cargoOutcomeIds. Chronicle output cites this state rather than minting new facts.

## Existing integration seams

- `src/systems/aftermathWrecks.js`
- `src/systems/uniqueWrecks.js`
- `src/systems/salvage.js`
- `src/systems/provenanceLedger.js`

These paths are starting points, not invented callable APIs. Read the live owners and current schemas before implementation. New concept helpers should emit to the owner rather than write its resource directly.

## Dependencies and packet sequence

SF20-03

Audit → behavior proof and model in parallel → presentation → normal-route integration → acceptance. Packet ids `SF20-18-A` through `-F` are in the task graph.

## Specific acceptance cases

1. Recover clues in all six orders: final evidence set agrees.
2. Destroy each clue separately: partial report remains truthful and accessible.
3. Publish twice: only one archive receipt per evidence revision.
4. Scan a towed recorder: no identity loss or duplicate object.
5. Turn off reconstruction: all essential information remains in accessible journal text.

## Player test

Before and after the second clue, ask players what they think happened and why. A changed, evidence-grounded interpretation is the success signal.

## Completion boundary

Require all shared gates in `production/TEST_PLAN.md`, the specific cases above, a normal-route encounter capture, top/chase/close model review, save/load evidence and matched performance measurements. This packet is not implemented or playtested merely because its plan and art exist. The art GLB is a non-shipping blockout; build the real asset through `production/ASSET_PIPELINE.md`.


---

# 19 — Pip & Spanner

SF20-19 | Crucible pit crew / upgrade legibility | Build wave 1 | DESIGN PROPOSAL

![Original procedural concept render](art/19_pip_and_spanner.png)

## Player-experience purpose

A tiny precision drone and a broad clamp robot run the Crucible pit. Pip presents the selected module; Spanner holds its actual mounting location. Selecting a different item changes the object, not just a line of text.

**Gap / hypothesis:** The user reports that pre-run purchases and milestone upgrades are difficult to read. Two object-handling crew machines can make the chosen item and its consequence visible without replacing the existing run economy.

**Existing overlap to preserve:** Compose the existing ORRERY UI, survivalDraft, swarmSupply and runSession. No second inventory, no campaign leakage, no independent frontend redesign. Crew choreography decorates a truthful transaction; it never decides the result.

Repository evidence: [R02](https://github.com/coldshalamov/SpaceFace/blob/1e0cf9499613b7c3acad10f34739278136d3d469/design/VISION.md), [R03](https://github.com/coldshalamov/SpaceFace/blob/1e0cf9499613b7c3acad10f34739278136d3d469/AGENTS.md), [R07](https://github.com/coldshalamov/SpaceFace/blob/1e0cf9499613b7c3acad10f34739278136d3d469/src/core/registry.js#L1-L170). See the inspection limits in `production/SOURCES.md`.

## First encounter

Before the first run, the player sees their actual ship silhouette and three distinct equipment objects. Focusing an option brings its model or authored SVG into one readable inspection position. Pip traces the benefit; Spanner points to the cost or replacement. Confirming makes the real run loadout change first, then the crew installs it.

## Where and when

Pre-run loadout and safe milestone intermission only. No new gameplay planet or station. Keep campaign and Crucible assets/state separate; use a small isolated preview scene or the established shipworks presentation seam.

## Repeat loop

Focus one option → see item and affected mount → read benefit/cost and current resources → confirm/cancel → see truthful receipt → launch. Between waves, the same grammar applies to repairs and upgrades. No mandatory animation before each run.

## Visual and model recipe

Pip is a small tetrahedral optic with one tiny stabilizer fan. Spanner is a wide two-claw service sled with a rectangular central worklight. Cream/dark machinery with one shared teal band; not humanoid mechanics or cartoon faces.

Author envelope: 16 × 18 × 6 m, +X nose / +Y port / +Z up. Proposed gameplay semantic radius: 0 WU (0 means not an independently targeted world body); proposed mass: 0 internal units (0 means static/preview, not a massless dynamic body). These are design targets, not final measured asset bounds. Runtime scale must follow the actual Forge/entity contract.

LOD triangle targets: 18,000 / 7,200 / 3,200; proposed near draw budget 10; nearby concept cap 1. Numbers are budgets to verify, never permission to bypass spawnBudget.

### SPANNER_ROOT

Build: Low 14×8×3 m loft with two 6 m forward jaws and an open center.

Pivot / parent: Preview scene root.

Collision: None: preview-only asset.

### CLAW_L/R

Build: Thick 6×1.5 m articulated plates on visibly supported Z hinges.

Pivot / parent: Root-local X=2,Y=±4.

Collision: None.

### PIP_ROOT

Build: A 3 m beveled tetrahedral body with one square optic and short supported fan.

Pivot / parent: Independent preview root.

Collision: None.

### PIP_POINTER

Build: A thin solid articulated pointer arm, 2 m long; no long screen-space laser crossing text.

Pivot / parent: Local Z hinge.

Collision: None.

### ITEM_CRADLE

Build: Two small padded brackets framing the actual selected module or an explicitly labeled schematic.

Pivot / parent: Preview focus anchor.

Collision: None.

## Animation recipe

| Clip / phase | Initial duration | Action |
|---|---:|---|
| Focus | 0.22 s | Pip glides at most 30 screen pixels and item settles; selection state updates immediately. |
| Compare | 0.3 s | Spanner indicates the affected socket; old/new item are clearly labeled, never indistinguishable overlapping ghosts. |
| Confirm | 0.65 s | After accepted purchase receipt, jaws close and the item seats. Skip/reduced-motion resolves instantly. |
| Denied | 0.15 s | Keep item uninstalled; show exact missing funds, incompatibility or run-state reason at the action. |
| Repair | 0.6 s | A localized worklight traces the repaired hull section only after health change is accepted. |

Critical read: This is the first recommended concept to build. It attacks a reported high-frequency UX weakness while adding a memorable pair at modest world-simulation cost.

## AI / behavior

UI service controller: BROWSE, FOCUSED, QUOTED, PENDING, COMMITTED, DENIED. Read run-owned inventory/resources. Each purchase intent includes runId, offerId and expected offer revision; the existing owner validates and returns a receipt. While PENDING, disable repeat submission without blocking Back. Characters react to receipts, not button clicks. Do not call tacticalAI or create 60-Hz world entities for interface props.

## Physical truth

No physics is needed for the crew. The ship and module preview are read-only. If an effect demo is shown, it uses an isolated deterministic preview state and a clear “demonstration” label, with no route into campaign credits, kills or damage. Do not mount new high-resolution textures on every option card.

## Choices and counterplay

Repair, buy a module, retain the current build, compare, or launch. Every option states the actual cost and affected capability. Choosing nothing must look intentional, not like a missing selection.

## Failure and alternative outcomes

Double click, controller repeat, networkless asset loading failure and closing the screen during pending work must not double-charge or leave half-installed UI. Missing 3D model falls back to an authored SVG silhouette with the same label and stats; not an empty square or an endless spinner.

## Personality and sound

Pip: short bright mechanical chirps with text labels. Spanner: one lower mechanical reply. They do not speak over the run announcer. Optional two-line radio banter appears only while idle, never on every focus change.

**first_visit:** “Pip: Pick the part. Spanner: We will show you what it changes.”

**tradeoff:** “More impulse. Less room for supplies.”

**repair:** “Hull restored. Resources deducted. Both are on the receipt.”

**no_purchase:** “Keeping the build. Ready when you are.”

**denied:** “Not enough run supplies. Nothing has been charged.”

Dialogue defaults: once-only first reveal; persistent dedupe for milestone lines; repeat flavor no more than once per 90 sim seconds per character, and only when the shared voice arbiter grants the slot. Threat cues are governed by attack state, not that flavor cooldown. Stop stale lines when their target/phase disappears. Captions retain speaker and factual meaning.

## Rewards / economy boundary

Only existing run supplies and offer costs. These machines never create campaign rewards, even when a visual repair animation resembles a station service.

## Save-state contract

Transient focusedOfferId and pendingIntentId only. Purchases, health, selected modes and supplies remain in existing run state. Persist no preview scene objects.

## Existing integration seams

- `src/systems/survivalDraft.js`
- `src/systems/swarmSupply.js`
- `src/systems/runSession.js`
- `src/ui/orrery/`

These paths are starting points, not invented callable APIs. Read the live owners and current schemas before implementation. New concept helpers should emit to the owner rather than write its resource directly.

## Dependencies and packet sequence

No other new concept required.

Audit → behavior proof and model in parallel → presentation → normal-route integration → acceptance. Packet ids `SF20-19-A` through `-F` are in the task graph.

## Specific acceptance cases

1. Double-confirm one offer: one debit and one item.
2. Close/reopen at every transaction state: displayed build equals authoritative run build.
3. Fail the GLB load: SVG and text allow full selection and launch.
4. Keyboard/gamepad-only walk reaches every option, compare, back and launch.
5. Finish or abort run: zero unintended change to campaign credits, inventory or kills.

## Player test

Give a player five seconds to identify the selected object, cost and changed ship capability. Then ask them to reverse the choice. Track errors and hesitation versus the original screen; no claimed UX improvement until compared.

## Completion boundary

Require all shared gates in `production/TEST_PLAN.md`, the specific cases above, a normal-route encounter capture, top/chase/close model review, save/load evidence and matched performance measurements. This packet is not implemented or playtested merely because its plan and art exist. The art GLB is a non-shipping blockout; build the real asset through `production/ASSET_PIPELINE.md`.


---

# 20 — The Hundred-Hand Mile

SF20-20 | Linked story / persistent world consequence | Build wave 4 | DESIGN PROPOSAL

![Original procedural concept render](art/20_hundred_hand_mile.png)

## Player-experience purpose

A damaged freight mile is rebuilt from things the player actually helped recover. Over five optional chapters, its silhouette grows from two dead pylons into a modest working chain of lights. Every installed piece has a history.

**Gap / hypothesis:** Persistent numbers need visible consequences worth remembering. A small route-restoration story can connect earlier characters and physical actions into a place that genuinely changes.

**Existing overlap to preserve:** Compose existing mission/story/provenance/chronicler systems and concepts 3,4,6,11,18. This is not a second campaign spine or a universal procedural story generator. Keep the main story intact.

Repository evidence: [R02](https://github.com/coldshalamov/SpaceFace/blob/1e0cf9499613b7c3acad10f34739278136d3d469/design/VISION.md), [R03](https://github.com/coldshalamov/SpaceFace/blob/1e0cf9499613b7c3acad10f34739278136d3d469/AGENTS.md), [R07](https://github.com/coldshalamov/SpaceFace/blob/1e0cf9499613b7c3acad10f34739278136d3d469/src/core/registry.js#L1-L170), [R08](https://github.com/coldshalamov/SpaceFace/blob/1e0cf9499613b7c3acad10f34739278136d3d469/src/data/authoredPlaces.js#L1-L155), [R09](https://github.com/coldshalamov/SpaceFace/blob/1e0cf9499613b7c3acad10f34739278136d3d469/src/data/contactHail.js#L1-L110). See the inspection limits in `production/SOURCES.md`.

## First encounter

After any two qualifying local interventions, the Towline Table asks for help restoring a bypass freight route. The first milestone needs one recovered power unit; the next needs an actual displaced guide; a later branch depends on whether Ilex’s seed vaults survived. A final convoy uses the route the player made possible.

## Where and when

An optional Tethys route segment with a preserved original bypass. Choose one canonical zone and stable route id after the atlas survey. Do not create a new global navigation layer or silently reroute every faction.

## Repeat loop

Chapter 1: survey the break. Chapter 2: recover one power unit. Chapter 3: clear or replace a guide. Chapter 4: deliver a real cargo contribution. Chapter 5: witness one working convoy. Each can end partially, leading to a smaller but functional result. The player’s role is one contributor, not the only person capable of acting.

## Visual and model recipe

Two dark freight pylons and a staggered chain of modular amber lamps. New sections use recognizable salvaged parts from earlier objects; a central small bridge has conspicuously mismatched but well-fitted panels. Not a triumphal statue of the player.

Author envelope: 180 × 90 × 25 m, +X nose / +Y port / +Z up. Proposed gameplay semantic radius: 125 WU (0 means not an independently targeted world body); proposed mass: 0 internal units (0 means static/preview, not a massless dynamic body). These are design targets, not final measured asset bounds. Runtime scale must follow the actual Forge/entity contract.

LOD triangle targets: 38,000 / 15,200 / 6,800; proposed near draw budget 14; nearby concept cap 1. Numbers are budgets to verify, never permission to bypass spawnBudget.

### PYLON_A/B

Build: Two 30 m work-tower trusses with broad feet and broken upper lamp mounts.

Pivot / parent: Fixed at route ends.

Collision: Compound static boxes with generous lane clearance.

### MODULE_SOCKET_01..05

Build: Five clearly supported receiver brackets along an offset service spine.

Pivot / parent: Fixed transforms and stable ids.

Collision: Sensors while empty; conservative installed proxies only after accepted construction.

### POWER_MODULE

Build: Reuse the actual recovered industrial generator shape, remastered through Forge if needed.

Pivot / parent: Socket 1.

Collision: One static proxy after cargo owner transfers it.

### GUIDE_MODULE

Build: Reused bent/straight freight guide from the switchyard family.

Pivot / parent: Socket 2; construction state determines variant.

Collision: One to two simple proxies.

### LAMP_CHAIN

Build: Up to 12 instanced solid lamps, each with visible support.

Pivot / parent: Deterministic route positions.

Collision: No collider on lamps.

### RECORD_PLAQUE

Build: Three large abstract tally marks and a service terminal. Names/history are accessible text in inspector, not tiny 3D lettering.

Pivot / parent: Near safe service platform.

Collision: None.

## Animation recipe

| Clip / phase | Initial duration | Action |
|---|---:|---|
| Unpowered | 0 s | No fake decorative motion; two lamps are visibly dead. |
| Install | 2 s | Module seats only after construction transfer, with a clear before/after state. |
| First current | 3 s | Lamps illuminate in actual connection order once; reduced-flash uses a steady fade. |
| Working mile | 10 s | Sparse service activity follows real jobs; no continuous celebration or confetti. |

Critical read: Build last. Its emotional value depends on the earlier encounters being enjoyable and its causal receipts being trustworthy, not on writing a longer finale.

## AI / behavior

Story graph consumes verified receipt ids and produces milestone intents through existing owners. It never checks “player has visited concept X” as a substitute for doing the work. Branches: FULL, PARTIAL, ABANDONED and RESTITUTION. A crew can complete a basic safe repair offscreen after an explicitly authored delay, but the ledger credits them, not the player. The final convoy is a real budgeted traffic job with a valid route.

## Physical truth

Contributions are real cargo transfers to construction sockets. During installation, remove the cargo body only after accepted ownership transfer, then enable the installed static proxy on a safe physics tick. Reject construction while a ship occupies the new geometry’s envelope. No spawning a solid wall through the player. Traffic may use the route only after its navigability proof succeeds.

## Choices and counterplay

Help with one chapter, pursue the full restoration, donate recovered goods, investigate why it failed, or leave. Partial contributions remain visible. Deliberate sabotage creates a repairable consequence, not an irreversible global softlock.

## Failure and alternative outcomes

Lost seed vaults change chapter 4 to a smaller dry-goods delivery; missing forensic evidence changes the public account to uncertain. Destroyed modules can be repaired via real resources, but no destroy/rebuild credit loop. One milestone receipt cannot unlock multiple free payments.

## Personality and sound

The final scene uses the established crew voices, not a new narrator. Gratitude is small and specific: a working route, a clear arrival, a lamp someone fixed. Keep the big emotional beat in the physical change.

**offer:** “Mara: We do not need a hero. We need a working power unit.”

**partial:** “Odo: Half a route is not a route. But it is a start we can use.”

**ilex_branch:** “Ilex: There is room for four vaults. Four will do.”

**first_convoy:** “Kit: Look at that. Ordinary traffic. Practically a miracle.”

**final:** “Mara: Your part is on the record. So is everyone else’s.”

Dialogue defaults: once-only first reveal; persistent dedupe for milestone lines; repeat flavor no more than once per 90 sim seconds per character, and only when the shared voice arbiter grants the slot. Threat cues are governed by attack state, not that flavor cooldown. Stop stale lines when their target/phase disappears. Captions retain speaker and factual meaning.

## Rewards / economy boundary

Five bounded contract slices within an explicitly reviewed total budget, plus a functioning optional route. Construction stock is deducted once; no passive royalty stream without an existing designed economy mechanism.

## Save-state contract

storyVersion, completedMilestoneIds<=5, contributionReceiptIds<=16, installedModuleIds, branch, finalConvoyOutcome. Existing cargo/economy/law owners keep material consequences.

## Existing integration seams

- `src/systems/missions.js`
- `src/systems/story.js`
- `src/systems/provenanceLedger.js`
- `src/data/authoredPlaces.js`

These paths are starting points, not invented callable APIs. Read the live owners and current schemas before implementation. New concept helpers should emit to the owner rather than write its resource directly.

## Dependencies and packet sequence

SF20-03, SF20-04, SF20-06, SF20-11, SF20-18

Audit → behavior proof and model in parallel → presentation → normal-route integration → acceptance. Packet ids `SF20-20-A` through `-F` are in the task graph.

## Specific acceptance cases

1. Complete milestones in permitted alternate orders: graph reaches coherent branch.
2. Lose Ilex cargo or a Last Shift clue: partial branch still completes.
3. Install while another ship occupies the volume: action waits or denies safely.
4. Replay all receipts after save/load: no duplicate modules or payments.
5. Destroy and rebuild: costs/rewards conserve the intended resource budget.

## Player test

At the final visit, players can point to at least one physical change and connect it to an actual prior action. The story fails if it is remembered only as a completed checklist.

## Completion boundary

Require all shared gates in `production/TEST_PLAN.md`, the specific cases above, a normal-route encounter capture, top/chase/close model review, save/load evidence and matched performance measurements. This packet is not implemented or playtested merely because its plan and art exist. The art GLB is a non-shipping blockout; build the real asset through `production/ASSET_PIPELINE.md`.


---

# Model, animation and delivery recipe

## Status and authority

The PNG plates, SVG plan studies and GLB blockouts in this package are original procedural concept references. They are not production meshes, authored Forge releases, approved rigs, or game screenshots. The image-generation tool also produced unrelated posters; those were rejected and are not packaged as art for these concepts. No unrelated poster names are canon.

The included GLBs preserve raw author-space blockout geometry and simple colors. They do not have production UVs, verified normals, collision proxies, animation clips, shared materials, compressed textures, or guaranteed runtime axes. Rebuild through Forge; do not drag them into release assets. They exist so another agent can inspect proportions in 3D instead of reverse-engineering a painting. Model target dimensions in the dossier outrank the approximate blockout.

## Authoring sequence

1. Read `tools/blender/forge/FORGE.md`, `docs/visual-assets/LOOK.md`, the nearest nested AGENTS file, and current release tooling. Follow any newer canonical contract discovered on rebase. [R03,R04]
2. Confirm each stable concept id is unused. Inspect active and recently merged character work, especially MORROW, VESPER, BRACKET and possible RAVEL/KNELL branches. Search by behavior as well as names; naming is not novelty.
3. In Blender, build at the dossier's author-metre envelope using +X nose, +Y port, +Z up. Put the main origin at the proposed hull center; put each mechanical origin at its actual hinge. Parent visible parts to one root, with named child pivots for moving pieces. Mark simulation sockets distinctly from render-only landmarks. [R04]
4. Build silhouette first with Forge `loft`, `plate`, `annulus`, `truss`, `beams` and supported nozzles. Preserve the specified negative spaces. Review at top view and the game's 60-degree chase tilt before adding detail. Large jaws, pods and ribs need attached supports, not floating greebles. [R04]
5. Use the existing shared finish vocabulary: paint, paint2, stripe, dark, gunmetal, bare, ceramic, stone and appropriate glow finishes. The concept chooses identity color and geometry, not an independent material-physics pipeline. Inset bands and raised panels do the visual work; avoid random grime/noise that breaks top-down readability. [R04]
6. Separate only genuinely moving/damageable parts. Every separate material on every separate mesh can cost a draw; a ten-finish palette does not guarantee ten draws if twenty articulated objects each use it. Merge static geometry by material and isolate minimal moving parts. Use the packet draw count as a proposed target to measure, not a claim that the blockout meets it.
7. For hard-surface articulation, use node transforms rather than a skeleton where practical. Keep baked glTF node clips for predefined gestures; draw actual physics joints from simulation state. For fauna, use a small rig or one documented vertex-deformation path, not both competing for the same vertices. Root motion must never move an authoritative world body.
8. Generate three LODs. Dossier counts are target triangle ceilings, not measurements. Preserve attack silhouette and interactive socket locations at LOD1/2. Drop cosmetic greebles first. Physics proxies are independent and must not change with visual LOD. [R04]
9. Derive collision separately: convex hulls/boxes/capsules for dynamic bodies; simple compound shapes for fixed infrastructure with holes. Never convex-hull an entire ring/door and accidentally fill the opening. List every child that becomes a new body on release, its mass allocation and initial velocity rule.
10. Export through the repository's selected glTF convention exactly once. A normal Blender Y-up glTF conversion maps author `(x,y,z)` to `(x,z,-y)`; confirm the actual Forge release transform with a three-axis marker, and do not add a second compensating rotation. The game's model factory/pose adapter remains authoritative for heading sign. [R03,R04]
11. Publish through the existing release process. Do not hardcode raw authoring paths in production or create a competing loader. glTF compression and KTX2 transcode need compatible decoders; current upstream documentation does not prove the repository's vendored version supports every extension. Reuse its pinned tooling. [R01,R04,T01,T02]
12. Open actual renderer captures and inspect them. A receipt saying “export succeeded” cannot show clipped geometry, wrong materials, or a hidden weakpoint. Record top/chase/close images, attack phase images, and a default-route screenshot before declaring the asset complete. [R03,R04]

## Mechanical animation contract

State transitions happen on simulation ticks. For a 60-Hz timer, use integer durations (for example, 0.9 s = 54 ticks). A visual pose can interpolate `u=clamp((t-t0)/duration,0,1)` and use `smoothstep(u)=3u²-2u³`. It may not move the damage tick or infer a successful transaction. Interruption begins from the current pose rather than snapping to a clip's assumed start. [R03]

A released part inherits `v_part = v_parent + omega × r_socket` and the parent's angular velocity as appropriate. Remove its compound collider before enabling its separate body and update mass exactly once. Never keep both colliders enabled. Visual mesh, collision body and gameplay id must refer to the same released object.

World body transforms come only from the physics owner. Cosmetic bob, roll and shader phases are children under a render-only root; collision shapes and scan/attack geometry never read them. Gameplay timers and random choices cannot depend on wall time, the render rate, asset completion timing, or cosmetic RNG.

## VFX and sound contract

Every attack has anticipation, commitment, action and recovery. The packet timings are initial balance proposals; tune them against actual stopping distance and visibility. Geometry, motion and audio reinforce a single meaning. Reduced flash suppresses bursts, not essential knowledge. Every critical audio fact also has a caption, physical pose or inspectable label.

Create short authored beam volumes, ribbons, mesh bursts and localized shield/heat effects using existing pools. No blanket fog shell, opaque camera-facing square or new full-screen filter for one character. Keep bright effects smaller than the target they explain except when a deliberate major event earns the frame. Reuse existing audio buses, voice arbitration, cooldowns and stale-drop rules. [R03,R14]

## Residency and proposed performance budgets

Only the nearby encounter is fully resident. Chart representations use existing derived proxies, capped by the repository's map contract rather than loading full hero GLBs. Proposed local content caps are in each packet. They do not authorize bypassing spawnBudget. [R07,R15]

Start a feature review with measured baseline p50/p95/p99 frame times, long tasks, physics time, draw calls, triangles, active entities and GPU/CPU memory on a declared device. A 60 FPS target gives 16.67 ms per frame; this is arithmetic, not evidence that the game achieves it. Set a provisional incremental budget of 0.2 ms p95 simulation for one small encounter coordinator and 1.0 ms p95 render work for one hero addition on the reference device; revise openly using actual measurements, not promises. Do not add the per-feature budgets for all twenty because all twenty must not be simultaneously active.

Load on the established nearby/arrival path, stage expensive work, and retain a honest fallback if a asset is missing. A progress bar must not claim “ready” before the required render/interaction state exists. Do not invent a second asynchronous boot framework for content.

## Production commands already described in the inspected repo

```
blender -b --python tools/blender/forge/ships/<ship>.py
node scripts/fleet-look.mjs --file=assets/ships/forge/preview/<file>.glb --views=inspect,close,top
node tools/blender/forge/publish.mjs <ship>
node scripts/flight-look.mjs --ship=ship_<id>
npm run check:atlas-integrity
npm run check:map-frames
npm run check:atlas-place-path
```

These are reference commands from R04/R15 with placeholders; resolve the actual registered asset ids. New places may use different registration/publish steps than ships. Confirm current package scripts before execution. No game commands were run in this design review.


---

# Integration seams and ownership

## Read before writing

The report pins one snapshot. It does not authorize replacing newer work with that snapshot. On the implementation branch, inspect git status, changed paths and current nested instructions; rebase the plan onto current owners. Commit only owned pathspecs. Never overwrite a live character, rewrite the global UI, or reset a whole tree to simplify this task. [R03]

Each dossier lists existing integration paths verified through content or registry references. Listing a path is not proof of every function signature inside it. Before implementation, read those files fully and record the real event names, payload types, save fields and lifecycle hooks. New proposed concept modules may be placed under an appropriate existing subsystem; `SF20-*` names in this package are planning identifiers, not installed registry ids.

## Existing owner map

| Concern | Read / extend | Prohibited shortcut |
|---|---|---|
| Simulation lifetime / ordering | `src/core/registry.js`, current GameState and selected systems | A second game loop or updating the dormant compatibility AI |
| Combat decision | `src/systems/tacticalAI.js`, `src/ai/`, `aiPorts.js` | Render-owned attacks, omniscient targeting, direct position teleport |
| Physics / tether | Current physics authority; `src/combat/attachments.js` | Removing a joint from a visual callback or lowering global break strength |
| Credits | `src/systems/economy.js` | A character directly increments player credits |
| Cargo / transfers | `src/systems/cargo.js` and current transaction events | Cloning an item into enemy loot and paying both copies |
| Reputation / law | Current factions and heat/law owners | Inventing a parallel faction score for a small crew |
| Derived ship stats | `src/systems/ships.js` | Preview code mutates live ship fit |
| Crucible resources | `runSession`, `survivalDraft`, `swarmSupply` | Campaign payout from a run enemy or crew animation |
| Places | Existing anchors / `authoredPlaces.js` with `appendAuthoredZones` | A second atlas registry or replacing a sector's full zone array |
| UI / voice | `src/ui/orrery/`, `voiceArbiter` and current screen owner | A duplicate menu shell, hover-only affordance, overlapping transient speakers |
| Memory | Mission/story/provenance/chronicler owners | New global “story AI” guessing incidents or attributing unseen actions |

Sources: R03,R07,R09,R11,R15.

## Proposed transaction envelope, not an existing API

For a new interaction whose current owner lacks a suitable intent, document an envelope such as:

```
{
  intentId: "stable-session-id:monotonic-counter",
  actorId: "existing-entity-id",
  targetId: "existing-target-id",
  conceptId: "SF20-03",
  action: "deliver",
  expectedRevision: 12,
  requestedAtTick: 90210
}
```

This is a proposed shape, not a callable function found in the repository. The existing single writer validates mode, range, identity, stock, ownership, revision and current availability. It returns one accepted/denied receipt with a stable receipt id and factual consequences. Presentation subscribes to that receipt. Double clicks, multiple contact events and save/load replay must not duplicate consequences.

Do not make up existing helper names in implementation. Use actual discovered events when they can carry the request. Introduce a new event only with a documented payload, owner, lifecycle and test. If a receipt only proves one fact, do not extrapolate unseen blame, intent or extra rewards.

## Coordinate and atlas wiring

All authored positions are sector-local. Convert to galactic coordinates only at the current atlas boundary. Test outside Helios so a zero origin cannot mask a wrong transform. New ordinary zones do not need bespoke art; the current atlas already supports procedural/glyph fallbacks. Add `presence` only when intentionally adding a budgeted spawn. [R08,R15]

This package deliberately provides locations and placement constraints rather than pretending uninspected free coordinates are safe. A production agent must choose final coordinates after checking current anchors, overlap, radius, traffic corridors, worldRadius and camera clearance. Finalizing placement is a concrete task, not permission to strand a concept behind a debug flag.

## Save / lifecycle

Use stable ids and schema versions. Persist outcomes, evidence, actual inventory ownership and the simulation phase needed to resume. Do not serialize Three.js meshes, physics handles, DOM elements, closures or clip instances. Reconstruct presentation after load from authoritative state. Normalize absent/old fields conservatively; reject unknown enum values without manufacturing progress.

Every packet must handle New Game, save/load at each phase, sector exit/entry, death, despawn, run abort and asset failure. Event subscriptions need teardown. A destroyed named character cannot be respawned accidentally because the visual asset reloaded. Preserve existing game functionality when a new optional character is absent.


---

# Build order: six proofs before twenty promises

The dependency graph in `data/agent_tasks.json` is the machine-readable planning source. All tasks are NEW_PROPOSAL, not imported build-map work or completed implementation. Integrate into the existing dispatch surface after reviewing current work; do not create another forever-growing parallel queue.

## Foundation before content

Rebase and deduplicate; establish a normal-route/performance baseline; resolve owner/event/save contracts; verify Forge/release and fallback conventions; define evidence capture. Stability work remains in its existing lane. The first additions should not assume a fixed camera or smooth streaming when those have not been demonstrated.

## First six proofs

1. Pip & Spanner (19): make one pre-run purchase and one milestone repair visually and transactionally clear. Lowest world-simulation burden; directly attacks reported high-frequency friction.
2. Latch Nine (01): one dock, one honest clearance gesture, one repeat acknowledgment. Preserve the old route without the character.
3. Tally-3 (03): one actual crate, ownership disclosure and exactly-once recovery. This proves the common physical transaction grammar.
4. Scissorwake (07): one specialist in one room with a fair warning and two counters. Reuse an existing cutter kernel if rebase discovers one.
5. The Last Shift (18): three evidence objects with all recovery orders and partial loss handled. Depends on the recovery grammar, not on a new narrative framework.
6. Red Kite (05): one short optional course; no rubber-banding, new input scheme or repeat cash farm.

Ship each as a separate narrow vertical slice. If these do not improve the first hour's comprehension and desire to continue, do not treat more content as the cure.

## Wave 2 — connect the working world

Sable Venn (02), Ilex (04), Towline Table (06), Kilnback (08), Pallet Jack (09), Switchyard (11) and Veil-Ray Nursery (15). Reuse the proven contracts and art families. Keep only one new role in its first encounter before mixing roles. The workshop depends on the object-preview grammar; the seed arc and mutual aid depend on recoverable cargo; the switchyard depends on truthful transfer ownership.

## Wave 3 — earned complexity

Mothlight (10), Borrowed Sun (12), Thimble Door (13), Storm Orchard (14), Borrowed Voice (16) and Open-Hand Lock (17). These add deception, moving-service state, camera-sensitive holes, planetary hazard timing and lore gates. Each has a specific blocker test; none is a reason to rewrite the engine. The door cannot ship before camera/collision truth is demonstrated. The lock cannot ship before token ownership and safe closing are demonstrated.

## Wave 4 — consequence

Hundred-Hand Mile (20) composes earlier encounters. Build only when real evidence, cargo and job receipts can support the five chapters. A cosmetic story about a world remembering is weaker than one repaired guide that a real hauler can use.

## Work packets and estimation

Every concept has six packets: audit, behavior proof, Forge model, presentation, integration, acceptance. Art and behavior can proceed in parallel only after their joint/socket contract is written. Integration waits for prerequisite concepts' acceptance. Do not estimate twenty production-ready assets by multiplying an optimistic single-asset time. Estimate the first two slices from actual elapsed effort, then separate art, interaction, integration and verification costs. A large static station may be cheaper in simulation but more expensive in camera/asset review than a small enemy.

## Stop / cut criteria

Cut or merge a concept if current source already provides the same player decision, if a tester cannot distinguish it from its neighbor, if it needs a second owner for an existing resource, or if a small encounter cannot meet measured local cost. Cut optional ornament before cutting the defining behavior. Keep the original twenty packets as design history and record any merged ids so agents do not resurrect a rejected duplicate.


---

# Acceptance and falsification plan

## Status

All gameplay tests below are required future checks. They were not executed in this design-only task. The package validator only tests the delivered documents, references, generated image files, GLB structure and task graph. Passing that validator proves package completeness, not game correctness.

## Shared gates

**G0 — baseline and de-duplication.** Pin the implementation commit, inspect active work and all relevant current owners. Capture the existing normal-route state, input semantics, key UI screens and performance on a declared device. Search concept names and behavioral analogues; extend an existing matching mechanic instead of forking it.

**G1 — an honest encounter.** The content appears through normal play and has at least two meaningful choices where promised. It is distinguishable from its nearest existing analogue. It does not require a debug flag, hidden key, unavailable upgrade or a console command. Show a complete first encounter and a repeat visit.

**G2 — deterministic state.** Replay the same fixed-tick inputs under 30/60/144 Hz rendering, with assets loading in different orders. Compare authoritative outcomes, phase ticks, receipts and RNG state. Bitwise cross-platform physics determinism is not assumed; test the repository's supported equivalence contract on the target platform. Cosmetic changes must not consume gameplay RNG or alter an attack.

**G3 — lifecycle and persistence.** Save/reload at every state boundary, including the tick of a transfer or detach. Test New Game, sector leave/return, character death, player death, aborted run and missing asset. Exactly one physical item and one owner survive each legal transition. Every subscription, mesh, texture ownership claim and physics body is released according to its owner.

**G4 — physical truth.** Overlay colliders, sockets and threat shapes. Sweep representative hulls through every opening. Confirm a released body inherits point velocity and removes the former parent collider. A cancelled or missed attack cannot still produce damage because a visual timer finished. No safety advice can claim a passage is clear when it is not.

**G5 — resource conservation.** Double-submit each transaction, replay receipts, change stock/price while a quote is open and destroy actors during transfer. Validate exactly-once outcomes. Check that run-only content causes no unintended campaign credit, inventory or kill change. Test destroy/rebuild and repeated enter/exit for farming exploits.

**G6 — accessibility and perception.** Test muted audio, grayscale, reduced motion/flash, keyboard-only, controller-only, 1280×720 and 1920×1080. Critical facts remain available without color, hover or a transient voice line. Content-specific UI stays within ORRERY and preserves focus when an item disappears.

**G7 — performance and default route.** Record p50/p95/p99 CPU/GPU frame time where available, simulation cost, active bodies, draw calls, triangles and memory. Compare matched seed/location/device scenarios, not a quiet baseline against a busy scene. Include cold arrival, warm arrival, repeated load/unload and a maximum designed local encounter. Do not call a frame smoother because its progress indicator lies.

## Formative player protocol

Use five independent testers for early fault-finding, not population estimates. Give a neutral task and record what they do before offering hints. Ask what they think will happen before an action, and why afterward. Track misunderstanding, hesitation, unintended input and voluntary retries. Four-of-five targets in dossiers are provisional go/no-go heuristics, not statistical proof or predicted retention gains.

For run UI, measure selection/cost/tradeoff comprehension and reversing a choice. For enemies, measure recognition of windup and at least two independent counters. For places, measure route/clearance prediction. For narrative, distinguish observed facts from hypotheses and ask whether players remember a physical consequence rather than only text.

Reject features that require explaining away repeated unfairness. Slow or lengthen anticipation when necessary; do not silently add aim correction or remove the underlying physics. Re-test after each meaningful change.

## Evidence to attach to every finished implementation

One ordinary-route entry capture; one complete interaction recording; top/chase/close asset views; telegraph/action/recovery stills where applicable; save/load and transaction test output; frame-time comparison with hardware and settings; controller/keyboard walk; list of changed paths; remaining limitations with explicit severity. A passing unit test without a reachable player outcome is not completion.

The final per-concept page adds five specific cases that must accompany these shared gates.


---

# Sources and inspection record

Repository: coldshalamov/SpaceFace. Pinned snapshot: `1e0cf9499613b7c3acad10f34739278136d3d469`. Inspection date: 2026-10-03.

This was a targeted source/design review through the connected GitHub tool. It was not an exhaustive repository census, a local clone, a gameplay playtest, an asset-load test, or a frame-time benchmark. Files mentioned as adjacent integration seams may be confirmed by registry imports rather than fully read. Proposed function signatures and new content ids must be revalidated before implementation.

The user's earlier reports about weak loading, enemy readability, camera clipping and loadout UI are treated as reported problems—not reproduced defects. Prior knowledge of MORROW and VESPER is reinforced by their registration; their complete current implementations were not audited. RAVEL and KNELL were flagged from recent project context as potential overlap; their current branch/merge state remains unverified and must be checked during rebase.

## Repository evidence

### R01 — README / project scope

Inspected project description. Its inventory counts are not treated as current authoritative census.

https://github.com/coldshalamov/SpaceFace/blob/1e0cf9499613b7c3acad10f34739278136d3d469/README.md

### R02 — Owner vision

Read lines 1–165. Physical agency, working traffic chains, simple inputs and failure that creates new situations.

https://github.com/coldshalamov/SpaceFace/blob/1e0cf9499613b7c3acad10f34739278136d3d469/design/VISION.md

### R03 — Engineering / creative contracts

Inspected architecture, current owners, runtime selection, deterministic simulation, Forge and ORRERY rules.

https://github.com/coldshalamov/SpaceFace/blob/1e0cf9499613b7c3acad10f34739278136d3d469/AGENTS.md

### R04 — Forge asset pipeline

Inspected complete returned document. Author axes, finishes, silhouette-first review, release commands and LOD guidance.

https://github.com/coldshalamov/SpaceFace/blob/1e0cf9499613b7c3acad10f34739278136d3d469/tools/blender/forge/FORGE.md

### R05 — Enemy roster

Inspected opening roles plus lines 230–410: real silhouettes, physical classes, mining/escort/patrol specializations.

https://github.com/coldshalamov/SpaceFace/blob/1e0cf9499613b7c3acad10f34739278136d3d469/src/data/enemies.js

### R06 — Specialists / Crucible bosses

Read lines 405–560: tether controller, field anchor, Mirrorjaw and Forge Regent; run payout warning.

https://github.com/coldshalamov/SpaceFace/blob/1e0cf9499613b7c3acad10f34739278136d3d469/src/data/enemies.js#L405-L560

### R07 — Live system registration

Read lines 1–170. Confirms registered integration families, not that every gameplay path passes tests.

https://github.com/coldshalamov/SpaceFace/blob/1e0cf9499613b7c3acad10f34739278136d3d469/src/core/registry.js#L1-L170

### R08 — Existing authored places

Read lines 1–155: Driftmark, Anvil, Prism Gallery, Throughline and Cinder Nursery.

https://github.com/coldshalamov/SpaceFace/blob/1e0cf9499613b7c3acad10f34739278136d3d469/src/data/authoredPlaces.js#L1-L155

### R09 — Contact / work-role affordances

Read lines 1–110: existing service incidents, work roles, heave-to and cargo-related hails.

https://github.com/coldshalamov/SpaceFace/blob/1e0cf9499613b7c3acad10f34739278136d3d469/src/data/contactHail.js#L1-L110

### R10 — Existing BRACKET character

Read returned file: five-shot physical game, distinctive dialogue and persistent memory.

https://github.com/coldshalamov/SpaceFace/blob/1e0cf9499613b7c3acad10f34739278136d3d469/src/data/bracket.js

### R11 — Existing nemesis owner

Read lines 1–100: evidence-gated named rival, memory, witnessed events, save/load and single-writer behavior.

https://github.com/coldshalamov/SpaceFace/blob/1e0cf9499613b7c3acad10f34739278136d3d469/src/systems/nemesis.js#L1-L100

### R12 — Existing fauna grammar

Read lines 1–145: noncombat ecological drives, nonhostile sighting rule, veil_ray sensitivity and collision-free semantic radius.

https://github.com/coldshalamov/SpaceFace/blob/1e0cf9499613b7c3acad10f34739278136d3d469/src/data/alienFauna.js#L1-L145

### R13 — Existing machine ontology

Read lines 1–125: rule-bound machines, off-frame creators, protocol states, auditor/courier/conservator families.

https://github.com/coldshalamov/SpaceFace/blob/1e0cf9499613b7c3acad10f34739278136d3d469/src/data/precursorMachines.js#L1-L125

### R14 — Current design authority

Inspected returned opening sections: Massline near-unbreakability, engineered cuts, physical counters, UI clarity, no engine rewrite.

https://github.com/coldshalamov/SpaceFace/blob/1e0cf9499613b7c3acad10f34739278136d3d469/design/GDD_2_0.md

### R15 — Place registration contract

Read lines 1–180: local coordinates, additive zones, atlas gates, proxy cap and no required bespoke art.

https://github.com/coldshalamov/SpaceFace/blob/1e0cf9499613b7c3acad10f34739278136d3d469/src/data/PLACE_REGISTRATION.md#L1-L180

## Comparative and technical primary sources

Accessed 2026-10-03. These support the stated design affordances; they are not controlled evidence that copying a mechanic will improve retention. No popularity or sales ranking was performed.

### E01 — Outer Wilds — Mobius Digital

Handcrafted, changing places invite questions answered by exploration. Transfer the question-to-observation structure, not its time-loop or visual identity.

https://www.mobiusdigitalgames.com/outer-wilds.html

### E02 — Into the Breach — Subset Games

The official design description foregrounds visible enemy attacks and defending civilian structures. Transfer readable intent and displacement consequences into real time; do not copy a turn-based UI literally.

https://subsetgames.com/itb.html

### E03 — Hardspace: Shipbreaker — Blackbird Interactive

Salvage uses physical tools on layered ships with hazards. Transfer inspect–manipulate–recover causality, not first-person cutting technology or the setting.

https://www.blackbirdinteractive.com/shipbreaker

### E04 — Hades — developer-authored Steam page

The description emphasizes a voiced cast, growing relationships and story across repeated attempts. Transfer short state-aware returns to familiar people; do not imitate its characters or promise comparable writing volume.

https://store.steampowered.com/app/1145360/Hades/

### E05 — Endless Sky — official project site

Trading, passenger transport, missions and ship improvement coexist in an explorable galaxy. Transfer overlapping livelihoods and optional routes, not galaxy size as an end in itself.

https://endless-sky.github.io/

### T01 — Three.js GLTFLoader

Current upstream loading/decoder documentation; verify against the repository’s vendored version before use.

https://threejs.org/docs/pages/GLTFLoader.html

### T02 — Three.js KTX2Loader

Current upstream texture-transcoding documentation; preserve the project’s configured loader and device support path.

https://threejs.org/docs/pages/KTX2Loader.html
