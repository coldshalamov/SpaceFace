<!-- LIFETIME: DURABLE -->
# SpaceFace: from systems to a mature game

**Owner-requested planning expansion · 20 October 2026, America/New_York.**
Source baseline: `c25ee0770d3aafa7f172801763522525fd3a1608` (21 October in UTC).
This is an implementation companion to the existing build map, not another queue, a new engine,
or evidence that any described behavior has shipped. `CLOUD-01` through `CLOUD-10` are document
labels for bounded slices of existing rows, not new globally dispatchable task IDs.

The objective is a game where the player understands a physical opportunity, does something
interesting with it, receives an intelligible response, and meets its consequences later.
Do not confuse a large feature inventory with that experience.

## Start here

| Document | What it settles |
|---|---|
| [01 · Priorities and scope](01_PRIORITIES_AND_SCOPE.md) | Order, milestones, scope cuts and definition of maturity |
| [02 · First hour and trust](02_FIRST_HOUR_AND_TRUST.md) | Launch-to-upgrade route, interruption cases, targeted repair workflow |
| [03 · Physical play and Swarm](03_PHYSICS_AND_SWARM.md) | Signature encounter, encounter grammar, run choices and replay loop |
| [04 · Living world and missions](04_LIVING_WORLD_AND_MISSIONS.md) | Named actors, consequence chains, mission outcomes and authored example |
| [05 · Economy and ship identity](05_ECONOMY_AND_SHIP_IDENTITY.md) | Physical supply chains, fitting decisions, progression and economic integrity |
| [06 · Regions and investigation](06_REGIONS_AND_INVESTIGATION.md) | Place differentiation, discovery, physical evidence and controlled expansion |
| [07 · Cloud execution](07_CLOUD_EXECUTION.md) | Copy-ready controller prompt, exact-head delivery, tests and collision matrix |
| [08 · Build-map crosswalk](08_BUILD_MAP_CROSSWALK.md) | Existing row ownership, integration procedure and no-duplicate rules |
| [09 · Evidence](09_EVIDENCE.md) | What was actually read, what is proposed, and active PR overlap |

## Ten cloud assignments

Each packet includes its result, verified entry points, write boundary, implementation sequence,
negative cases, completion evidence and a copy-ready prompt. One shot means one coherent draft PR,
not a guarantee of duration or a promise of complete game acceptance.

| Packet | Player-visible result | Existing parent | Scope |
|---|---|---|---|
| [CLOUD-01](tasks/CLOUD-01_MINING_FEEDBACK.md) | Know whether ore was cut, collected, or left outside a full hold | 466; first-hour integration 454 | Existing mining HUD and cargo read model |
| [CLOUD-02](tasks/CLOUD-02_ARRIVAL_INTELLIGENCE.md) | Arrival information belongs to this place and suggests a legitimate next action | 464; first-hour integration 454 | Sector postcard and known-world projection |
| [CLOUD-03](tasks/CLOUD-03_NPC_WORK_READOUT.md) | Understand a worker's job, interruption and useful intervention | 477 | Existing Hail/WORK readout |
| [CLOUD-04](tasks/CLOUD-04_DISCOVERY_FIELD_NOTES.md) | Scanning reveals intelligible anatomy without leaking unearned knowledge | 468 | Target/scan presentation |
| [CLOUD-05](tasks/CLOUD-05_RECORDS_WALL.md) | Records distinguish real accomplishments, zero and missing history | 471 | Existing statistics screen/model |
| [CLOUD-06](tasks/CLOUD-06_RETURN_RECAP.md) | Remember the current goal and three real events after returning | 451 | Existing mission log and Chronicler projection |
| [CLOUD-07](tasks/CLOUD-07_ROUTE_CHOICES.md) | Compare fuel and jump-count routes without secretly spending anything | 476 | Pure route planner and existing map |
| [CLOUD-08](tasks/CLOUD-08_FIT_TRADEOFFS.md) | Understand what a proposed fit enables and what it sacrifices | 469; reuses PQ-142 | Existing capability model and fitting preview |
| [CLOUD-09](tasks/CLOUD-09_FAIL_FORWARD_ESCORT.md) | One failed escort becomes a recoverable physical job, not a dead end | 467 | One mission family and existing loss/mission owners |
| [CLOUD-10](tasks/CLOUD-10_READABLE_BOSS.md) | Read one capital boss's threat, counter and recovery window | 463 | Existing score-driven presentation |

**Recommended first dispatch:** CLOUD-02, CLOUD-05 and CLOUD-07 on disjoint verified hunks;
CLOUD-01 follows its mining/cargo event trace. CLOUD-03/04 share target presentation and must be
serialized when their hunks overlap. CLOUD-08/09/10 require a fresh check of the active fitting,
mission-craft and boss-read lanes. These are scheduling suggestions within the current board,
not permission to outrank a reproduced player-facing defect.

No cloud packet here requires buying assets, a paid model API, new Blender work, new physics,
a save-schema migration, a new screen framework, a second economic writer, or a whole-game rewrite.
Actual rendered feel and device-performance acceptance remain separate from headless correctness.

## How this reaches the build map

The pack maps to existing rows rather than minting ten duplicates. The program README gets a
navigation entry. The distribution also contains a minimal root build-map link patch and a
check-first helper inside this pack’s `integration/` directory; see [08](08_BUILD_MAP_CROSSWALK.md).
Publishing these documents does not close any row or count as ten production units.
