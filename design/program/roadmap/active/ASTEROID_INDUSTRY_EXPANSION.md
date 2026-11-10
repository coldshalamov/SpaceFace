<!-- LIFETIME: ACTIVE_PACKET -->
# Asteroid Industry — from one bore to an authored industrial region

Owner-directed expansion, 2026-10-08. Entry: `build_map.md` → `PQ-145` → this document.
This extends the existing industry area; it is not a replacement queue, save system, economy,
frontend direction, or independent simulator. Existing packet/leaf statuses remain unchanged.
The stages below are named work breakdowns, not newly registered queue IDs.

## Product contract

The player first pilots a rover into a rock for a desirable material. They learn that excavation
is also irreversible factory design: cutting a valuable face buys an immediate ore payout, while
preserving it can feed a machine. Later, they return with the right imported components, turn a
bore into a useful outpost, manufacture equipment, delegate excavation and freight, and connect
specialized asteroids into a network whose traffic, vulnerabilities and income exist in the world.

The reward is freedom and leverage, not mandatory factory homework. A player may remain a pilot,
operate one boutique refinery, or become an industrial power. The late-game advantage must come
from productive infrastructure, supply reliability and meaningful demand—not an unexplained
credit multiplier. The factory should free the player to fly, fight and explore.

## What this delivery actually implements

`src/data/sites.js` adds four modes to the existing refinery/fabricator: structural alloys,
hull plates, circuitry, and machine controllers. These use existing commodity and machine IDs;
no new entity or commodity registry is introduced. The controller chain closes a missing path to
manufacturing construction electronics without making the first factory able to bootstrap itself.
Alloys and circuitry default to HOLD for newly created sites; existing saved export policies are
not overwritten. Older operators must explicitly hold these intermediates when commissioning.

`src/systems/siteProduction.js` repairs the existing execution helpers. A completed fabricator
batch waits for output space, keeps its paid job through save/resume, and discharges once. A
continuous machine accounts for already-paid fractional carry before admitting another output.
Invalid time, power, room or carry inputs fail closed rather than creating progress or output.
The existing deliberate mode-change cost remains: abandoning a committed batch does not refund it.
No new save fields, tick, cargo writer, passive-income writer or wall-clock accrual is added.

`src/systems/siteIndustryPlanner.js` provides deterministic, read-only construction manifests and
recipe dependency expansion. One shared inventory ledger prevents two branches spending the same
stock. Whole batches produce explicit surplus; final requested stock is reserved before expanding
prerequisites. Cycles and ambiguous recipe choices fail explicitly; graph expansion is bounded.
Caller-selected stock is never a magical sum of disconnected networks. Gross bootstrap kits keep
controllers imported. Recipe work is powered machine-time, not a completion forecast.

`src/ui/asteroid/industryPlanner.js` is reached through **Build → Plan**, including before the
first Core. It shows three construction kits, material quantities, canonical mass/volume and
catalog estimates, gas-contact power deficits, and all manufacturing paths. It is read-only:
no stock reservation, live cargo subtraction, placement validation or automatic recipe scheduling
is claimed. Closing Build/session removes the launcher; a modal key guard stops document-capture
build commands without swallowing key releases. The existing earned machine palette and numbered
selection stay intact. UI uses the existing ORRERY token family, not another design system.

### Evidence and limits

At the pinned implementation base `782e7ec754346680fb875188454edda251bea4d9`, selected source files
were retrieved through GitHub. Original `sites.js`, `siteProduction.js` and `buildPalette.js`
bytes were checked against their Git blob hashes before editing.

34 deterministic tests passed locally using a pinned subset of the canonical commodity metadata
and ore tiers as import fixtures. The production subset has 16 cases; 9 fail with the original
production helpers and pass with this change. The real controller recipe chain is exercised
through the existing production functions, including JSON save/resume of their owned records.
The shipped Node tests import the real repository catalogs, not those local fixtures.

An isolated Chromium component run exercised the actual new planner, planning kernel and modified
palette at 1280×900, 390×844 and 844×390: 102 assertions passed. Checks include every goal, batch
surplus, pre-Core access, repeated empty-palette sync, key capture isolation, released controls,
focus containment, both close controls, session unmount, destroy, and horizontal containment.
Screenshots were inspected; misleading retained kit quantity was corrected and a top close
button was added. This run used small inspector/token dependency fixtures and system fonts.
It is **not** a full-game render, iPhone/Safari acceptance, shipping-camera acceptance, full save
migration test, production build, quiet-host performance result, or A-list completion claim.
No new 3D asset or autonomous robot/hauler runtime is delivered by this slice.

## Preserve and connect these existing owners

| Concern | Existing seam | Boundary |
|---|---|---|
| Manual bore, tiles, rover and ore accounting | `src/systems/drill.js` | Bots must eventually request the same paid excavation operation. Never award ore from a second tile generator. |
| Durable claims, machine records and site execution | `src/systems/asteroidSites.js` | First meaningful installation stakes the rock. The Core is power/command hardware, not the only persistence gate. |
| Material and power topology | `src/systems/siteLogistics.js` | Two independent overlays, connected components, aggregate stores/throughput. Preserve topology-removal previews and explicit custody. |
| Recipe work | `src/systems/siteProduction.js`, `src/data/sites.js` | One recipe catalog and execution path. UI/forecasts do not simulate a competing economy. |
| Player and shipment ownership | `src/systems/cargo.js`, `src/systems/cargoCustody.js` | Authoritative transfers, identity-bearing receipts, no direct player inventory writes. |
| Passive income and prices | `src/systems/automation.js`, `src/systems/economy.js`, `src/data/commodities.js` | Existing admission/cap and market writers stay until replaced deliberately under PQ-177.07. |
| Existing freight/world presence | `src/systems/travelLanes.js`, `src/systems/claims.js`, `worldSiteKernel.js` / `worldSiteRuntime.js` | Extend actual jobs/traffic rather than spawning unrelated decorative ships. |
| Asteroid presentation | `src/ui/asteroid/asteroidScreen.js`, renderer adapters; `src/render/asteroidInteriorPreview.js` | Render state, never own resource quantities, timers or bot completion. Preserve ORRERY. |

Before each stage, re-read the current implementations, nested agent notes and exact live claims.
Do not infer that a helper is integrated merely because its filename exists. In particular,
`siteThermalModel.js` and `siteSignatureModel.js` are candidate math to evaluate, not permission
to activate hidden heat penalties or raids. Inspect current consumers before using them.

## Sequence of player-complete deliveries

### 1. Commission one honest operation

Build on PQ-145.01, PQ-024 and the live Asteroid Works route. Verify the added modes in the real
Site drawer, not only the catalog. Make the decision chain visible: preserved face → extractor
→ connected store → refinery → retained intermediate → cargo port → one paid delivery.

Connect planning to authoritative, selected-source inventory with an explicit toggle between
**bring this kit** and **produce with this installed network**. A selected build cell may spend
only reachable local stock plus legal ship cargo. Return per-source allocations and missing
materials from the same owner preflight used by placement. Do not let a preview authorize an old
quote after the network, cargo, rover position or geology changes. Revalidate on execution.

Surface rated versus actual production, input shortage, power debt, full output, blocked lane,
missing route and stopped fleet—with one corrective action per cause. Preserve cut-preview loss
of neighboring contacts. The rover needs immediate turn/move/drill feedback, readable fuel/heat/
cargo budgets, a reliable return path and an early rare-but-reachable reward. Improve existing
hazards and equipment before adding new meters. Do not gate essential explanations behind hover.

**Acceptance:** from an ordinary new/continued game, obtain materials, establish one claim, make
and recover refined output, leave the sector and return to the same excavation. Save and Continue
before/after one courier delivery yields exactly one payment. Try disconnected construction,
insufficient materials, obstructed rover, missing gas, full stores and a lost courier. Each failure
has a truthful next action. Keyboard, touch and controller entry/exit are exercised by an agent.

**Current known boundary to characterize:** continuous recipes still use conservative room-before-
input semantics. A full input-heavy network may need draining before a volume-reducing recipe
advances. Characterize `roomFor`'s actual ownership before adding net-capacity accounting; never
assume freed input room belongs to the output when stores are different. Test two producers
competing for the final slot and across topology changes. Do not discard stock to clear a jam.

### 2. Make production a spatial strategy

Extend the current component solver with inspectable commissioning and bounded production goals,
not a second conveyor-item simulator. Add per-good minimum reserves and export-surplus policies
through `asteroidSites`, with an explicit migration that preserves saved export choices. A courier
must not starve its own replacement fabricator. Show a small dependency view for the chosen goal;
keep the ordinary drive view quiet.

Introduce an owner-controlled recipe queue only after committed-batch semantics are explicit.
Queue cancellation, manual mode changes, output blocking and dismantle all return a receipt.
A production order reserves inputs only when its batch is actually admitted; stale UI selections
cannot reserve stock. Distinguish retained stock, paid work in progress and free inventory.

Different rocks should favor different designs: silicate/iron construction, metallic alloy work,
crystal electronics, gas-supported energy, and dangerous rare-resource sites. Avoid a universal
best layout. Do not add structural-collapse simulation; contact loss and access geometry already
make excavation consequential. Reuse installed housing models for recipe changes and animate
only the machine that is actually working.

**Acceptance:** two competing lines sharing one store cannot double-spend or overfill it; a
minimum reserve survives repeated exports; changing a recipe mid-batch has one explicit result;
a blueprint cannot buy from a disconnected network; a useful tradeoff exists between immediate
ore extraction and preserving a face. Goal completion stops overproduction without losing a
paid in-progress batch. Test 1-hour seeded operation against conservation and economic ledgers.

### 3. Manufacture and operate excavation robots

First audit the existing finite NPC handling adapter in `src/systems/ceresWorkfleet.js` and its
recovery/admission helpers. It already separates requested thrust from native-physics authority.
Reuse suitable contracts, not its fixed P03 job ID, request stream or NPC-only site authority;
player orders must not inherit privileged NPC resource grants. Do not fork a second physics owner.

Then extract a small, shared excavation-command seam from the existing rover implementation.
It must validate tool tier, range/reachability, target tile version, hazards, remaining yield and
recipient capacity before mutation. The player and robots call it; `drill.js` remains the
terrain/ore authority. No bot-side `generateOre()` shortcut.

Add one workbot type, fabricated as an identity-bearing owned unit rather than disguising it as
an ordinary courier pod or selling commodity. Use the existing catalog/registration conventions
for any new IDs. Its persistent record needs a stable ID, site/home ownership, loadout, status,
paid cargo custody, assigned order and simulation-time work progress. A spawned visual is only
a projection of that record. No body duplication when switching sectors or opening the bore.

Orders designate cells/regions plus a preservation policy. Jobs progress through pending,
reserved, traveling, working, unloading and completed/blocked/cancelled states. Unique job and
cell reservations prevent two miners claiming the same final ore; committed tile versions make
old paths fail safely. Marked protected geology, installed machines and sealed hazards are vetoes
unless the player explicitly authorizes the destructive operation. Path search is bounded and
invalidated only when relevant topology changes, not every render frame.

A full hold means return/unload/wait, not deleted cargo. An unreachable designation stays visibly
blocked rather than teleporting the bot. Disable/cancel/recall must release reservations exactly
once. Saving at any phase resumes the same paid work. Tool wear or charging is optional only if
it creates a useful siting decision; do not build a babysitting tax before the first robot is fun.

**Acceptance:** two bots and the player contest one remaining tile yield with no duplication;
a protected face survives; a severed tunnel blocks then replans after reopening; a full receiver
halts unloading safely; cancel/recall/save/sector change leave neither phantom reservations nor
phantom bodies. One short continuous ordinary-route run shows fabrication → launch → visible
excavation → cargo recovery while the player does something else.

### 4. Replace disposable-only freight with a real logistics network

Keep existing disposable couriers useful as the cheap early option. Add a reusable hauler using
existing freight/job and world-site owners: source site, destination site/station, good filter,
source reserve, destination target, payload limits, route choice and return behavior. Ports can
import as well as export, enabling specialized asteroids rather than self-contained clones.

Use one custody state machine: available at source → reserved → loaded shipment → in transit →
accepted at destination → returned/retired/lost. Every transfer and sale has a stable operation ID.
Only cargo actually accepted changes owners; a full destination leaves the unaccepted remainder
aboard. Repeated arrival, save/reload or rematerialization must never repeat a sale or refund.
Physical haulers near the player and statistical distant haulers share this same record. Going
out of view cannot reroll an ambush, reset travel time or create another payload.

Destination destroyed, port offline, route revoked, station hostile and fleet lost all need
explicit hold/reroute/return choices. Prefer safe suspended custody to silent disposal. Quote
real destination prices at settlement; show gross, freight/operating cost, loss and net. Extend
existing persistent traffic and map routes. Do not render the whole empire's ships everywhere.

**Acceptance:** at least three sites and two station destinations, one import route and one
refined export route; repeat arrival messages, partial unloading, paused ports, save in transit,
loss before delivery and repeated sector transitions. Every cargo unit has exactly one owner
and every successful sale one receipt. Observe and intercept a real hauler, then let the same
route continue remotely without different accounting.

### 5. Make an empire legible without replacing the world

Add an on-demand operations projection to the existing map/site surfaces: site specialization,
last meaningful outcome, bounded stock/production summaries, jobs, routes and prioritized
exceptions. Each row selects a real site or route, offers a waypoint and shows the local cause.
No disconnected empire dashboard that only manufactures numbers. Promote only changed actionable
exceptions; aggregate 30 identical starved-machine notices into one network cause.

Add site names, reusable planning templates, copyable import manifests and commissioning history.
Blueprints are requests with a material bill and a geology/topology preflight, never free stamped
factories. A distant order carries a site revision and a clear refusal; it cannot excavate an
unseen preserved face by stale selection. One-click pause or orderly abandonment must be safe.

Make industrial success visible: new attachments, ports, lit working machines, freight movement,
marked tunnels, service visitors and occasional demand/defense opportunities. Add a few authored
missions that teach different verbs: a sealed-face extraction choice; a power-starved refinery;
commissioning a controller line; rescuing interrupted freight; defending a three-site supply chain.
Use existing mission/career owners and receipts, not a separate industrial campaign save.

**Acceptance:** from an operations alert, find the failing site and its specific correction in
three deliberate interactions or fewer. A clean operation sends no repetitive alarms. A saved
three-site chain resumes its names, geography, jobs and routes, not merely its account balance.
Industrial activity remains visible with the operations panel closed.

### 6. Couple prosperity to the wider game

Evaluate current market demand/stock response before changing prices. Report nominal catalog
value, quoted sale value, actual net income and capital cost separately. Preserve manual mining
as the early bootstrap and exploration as the source of new bottlenecks. Refined freight should
usually improve value per occupied hold volume without every intermediate sale being inferior.
Price robot manufacture and replacement against measured production, not a generic tier ladder.

The existing passive-income cap is not the desired final empire mechanic, but deleting it now
would be an unbounded balance change. Under PQ-177.07, replace its role with visible, measurable
limits—throughput, finite transport capacity, actual demand, power availability and route risk—
and expose remaining admission limits until removed. Do not silently haircut a supposedly huge
industrial win. Make wealth buy real ship/fleet capability through existing purchase and fit
contracts; do not fabricate a second progression currency.

Activity may attract pirates, customers or faction interest once the player has counterplay.
Integrate existing signature/thermal work only after its causes are observable and its consumers
are identified. Power routing, stealth, defense and convoy choices should answer these causes.
No off-camera random factory destruction or forced constant repair chores. A paused site stays
a durable claim; voluntary abandonment is explicit and preserves recoverable custody.

**Acceptance:** seeded economy runs compare pilot-only, one outpost, specialized three-site and
large-network strategies. Record time to first machine/refinement/robot, net income, reinvestment,
loss sensitivity and runaway growth. Launch targets—not asserted measurements—are a useful first
claim in 10–20 minutes, first delegated work in 30–60, and a coherent three-site network in 90–150.
Tune or revise those targets against actual game cadence and cargo constraints. Success must not
make all other play irrelevant, and failure must leave a viable pilot recovery route.

### 7. Ship assets, performance and recovery together

Follow `tools/blender/forge/FORGE.md` and the graphics program. Audit/reuse current authored
machine housings and their progress/status hooks before replacing anything. New models must have
functional silhouettes at the actual Asteroid Works and flight cameras, not just attractive
studio previews. Source files and export recipes travel with the assets. Register and preload
through existing asset ownership; no unreferenced GLBs counted as completed gameplay.

| Asset | Gameplay-readable features | Runtime hooks / target budget |
|---|---|---|
| Excavation bot | Low asymmetric crawler, visible drill arm, distinct loaded cargo cradle | Drill/wheel/arm pivots; idle/work/blocked/unload poses; target ≤6k triangles LOD0, ≤1k LOD1, shared atlas. |
| Reusable hauler | Cargo silhouette dominates; docking alignment obvious from above | Cargo/engine/docking anchors, loaded/empty variants; target ≤10k/2k triangles, simple collider. |
| Bot assembly retrofit | Existing fabricator housing with a recognizable deployment cradle | Paid job progress and actual release latch; no alternate decorative progress timer. |
| Bidirectional port retrofit | Distinct receive/transmit lanes and physically clear berth | Arrival/queue/blocked lamps from custody state; placement ghost and collider clearance. |
| Exterior site growth set | Modular relay, storage, gantry and utility silhouettes | Instanced repeated pieces, coarse distant representation, no persistent per-site renderer offscreen. |

Budgets above are proposed ceilings to measure, not achieved asset statistics. Reuse shared
materials/atlases, bound residency and dispose session-owned resources. Do not allocate one
full high-resolution interior, pathfinder or 60 Hz AI loop for every distant asteroid. Dirty-
topology graph rebuilds and deterministic scheduled production remain independent of rendering.
Production advances on simulation time while the game runs; this plan does not introduce
wall-clock offline accrual. Long catch-up is bounded and must preserve step/cargo ordering.

**Acceptance:** target 1/10/50 claimed sites, 0/10/100 distant workbots and repeated bore/flight
transitions. Measure simulation p95, frame p95, entities, draw calls and retained GPU/heap memory
on a named device before setting shipping numbers. A 50-site background tick must have a fixed
per-update work budget; deferred work must remain visible and deterministic, never dropped.
Save during blocked output, bot work, partial unloading and route loss; cold Continue preserves
terrain, paid progress, inventories, reservations and receipts. Exercise missing assets and
WebGL context recovery. CI/unit green is not a substitute for the ordinary player route.

## Integration checks and first next work

Run `node --test test/site-industry-planner.test.mjs test/site-industry-production.test.mjs`
against the full repository. Then run the existing asteroid-site, lane-network, drawer,
SF-273/SF-274 reconstruction and PQ-024 suites; verify current test filenames before invoking.
Use the repository save-schema, data-reference, UI label/accessibility, sim comparison and build
checks from the module owners. Do not overwrite simulation goldens to make a failure disappear.
Do not dispatch a heavy retail bundle merely to test these pure helpers.

**Next implementation:** complete stage 1's real-route commissioning and selected-network
inventory preflight, then stage 2 reserve/export policy. These provide the accounting boundary
stage 3 bots and stage 4 haulers must use. Asset work may proceed against those bounded contracts
in parallel; do not release an unintegrated robot model as the robot feature. No step waits for
the owner to playtest or for another planning document: the implementing agent runs the route,
fixes observed defects and reports exactly which acceptance remains unproven.
