<!-- LIFETIME: DURABLE -->
# SpaceFace Game Direction Expansion

> Durable cross-system product direction. This document is **not** program status, a queue, a lease,
> an implementation packet, or evidence that any outcome has shipped.

## 1. Authority and use

SpaceFace's product and technical authority remains, in order, the user's current direction,
[`ARCHITECTURE.md`](../../ARCHITECTURE.md), and [`design/GDD_2_0.md`](../GDD_2_0.md). The sole source of
admitted work, current status, and acceptance is [`design/program/`](../program/README.md).

This document gives long-range expansion work a coherent product shape. It owns:

- thirty durable design axes (`GDX-A01` through `GDX-A30`);
- five cross-axis launch-coherence stories (`GDX-S01` through `GDX-S05`);
- the dependency, split, evidence, and refusal rules used when shaping future slices; and
- comparative research that explains what SpaceFace should borrow, adapt, and deliberately refuse.

It does **not** own priority, dates, owners, exact files, readiness, leases, queue state, acceptance,
or completion. An axis is a portfolio dimension, never a task. A story is a proposed coherence and
proof frame that an admitted packet may adopt, never a queue row or gate.
To build anything here, deduplicate it against live code and existing plans, admit one bounded packet
through the normal program workflow, and prove that packet on its declared player route.

Some interview-selected directions below intentionally go beyond the current GDD. They are decision
proposals until the corresponding GDD section is explicitly reconciled; they must never silently
override higher product authority from a supporting document.

## 2. Product thesis

SpaceFace should be a **physics-first space life inside a working industrial frontier**.

The universe mines, hauls, patrols, repairs, trades, migrates, fights, and fails without waiting for
the player. The player changes it primarily by personally flying a long-lived ship and applying
physical verbs—thrust, Massline tension, fields, impact, recoil, towing, cargo mass, geometry, and
weapons—to real actors with real work and real consequences.

The target is neither an empire manager with an optional cockpit nor an abstract action arena with a
decorative economy. It is a dense systemic world in which a clear majority—directionally 70–80%—of
consequential resolution is personally piloted, while automation handles routine work, observation,
and continuity. Extreme earned physical power is welcome. Fairness means predictable causality and
readable counterplay, not equal damage numbers.

The 70–80% figure is a candidate-route planning diagnostic, not universal session telemetry or an
acceptance threshold. For a packet that adopts it, declare the route's consequential resolution beats:
decisions that can materially change danger, cargo, damage, custody, ownership, contract outcome,
recovery, or progression. The numerator is beats whose decisive input is direct piloting or another
personally controlled physical action; the denominator is all such beats on the route. Exclude menu
setup, passive observation, and travel waiting, and bind the count to the candidate being reviewed.

Industrial abundance may be visually exuberant. Information may not be. At any decision point the
player should understand what is working, what is changing, what caused it, who owns it, and what can
be done next.

## 3. Direction decisions

These decisions shape the portfolio. Where they conflict with the current GDD, §12 identifies the
required reconciliation rather than pretending the conflict is already resolved.

| Decision | Direction contract |
|---|---|
| Personal agency | The player personally pilots most consequential work, combat, rescue, and recovery. Automation does not resolve exceptional moments for them. |
| Physical power | Progress can unlock extreme asymmetric physical capability, provided cause, cost, limits, and collateral remain legible. |
| Real collateral | Friendly bodies, cargo, infrastructure, contracts, and faction interests receive no hidden immunity. Important actors survive only through visible, diegetic protection. |
| Working world | Important offscreen events may resolve and be missed, but they leave inspectable evidence, aftermath, or history. |
| Ship identity | Progress centers on a long-lived signature ship and a small garage. Switching ships is an occasional strategic choice, not a job tax or collection treadmill. |
| Progression | Capability accumulates new physical possibilities and tradeoffs rather than mostly increasing numerical superiority. |
| Authorship | Authored motives and characters collide with systemic physics. Broad campaign volume is cut before systemic depth or physical consequence. |
| Factions | Factions may be transformed, displaced, or destroyed locally. Complete erasure is rare so the world does not hollow itself out. |
| Regional focus | Concentrate launch-quality differentiation in six to eight dense hero clusters inside the locked 24-region galaxy. This direction does not reduce or replace the technical region graph. |
| Failure | Ordinary failure preserves pilot and signature-ship identity through damage, debt, rescue, custody, impound, recovery, and history. Permanent loss is an explicit high-risk choice. |
| Presentation | Industrial density is subordinate to premium arcade precision in cause, threat, ownership, action, and consequence. |
| Scope cuts | Cut breadth, management, variants, and authored campaign volume before cutting personal physical play, persistence, accessibility, or performance truth. |

## 4. Readability and world-space budget

The current production camera already supports approximately 93–125 WU of ordinary forward
visibility and approximately 145–164 WU of speed-earned reveal. Expansion work must choreograph the
world inside that bubble; it must not reopen camera scale as a substitute for composition.

| Band | Contract |
|---|---|
| `0–95 WU` | Inner work and collision lane. The active body, force endpoint, contact, and immediate consequence read here. |
| `95–125 WU` | Ordinary decision horizon. Roles, formations, route geometry, warnings, and braking choices become legible here. |
| `125–165 WU` | Physics-earned continuation. Real speed may reveal the next consequence, but never grant free omniscience or unavoidable contact. |
| Beyond `165 WU` | Radar, map, approach, and strategic information. Direct physical resolution cannot require visual precision here. |

At one instant, budget for one primary causal event, one secondary imminent branch or warning, and
ambient activity that remains subordinate. The HUD follows the same hierarchy: one primary action,
one secondary warning, then persistent context or player-requested detail.

## 5. Thirty direction axes

Each axis defines a promise, a planning decision, and a proposed route-level proof question. An
admitted packet may adopt or revise these questions; GDX does not turn them into gates or claims about
the current build.

### 5.1 Physical play and encounter craft

| Axis | Player promise | Planning decision | Suggested proof question |
|---|---|---|---|
| `GDX-A01` Flight and control | The ship feels like a controllable mass, not a cursor or animation. | Preserve shipped Pilot controls, optional schemes, inertia, braking horizon, facing, and trajectory truth. | An uncoached player can predict, correct, and explain motion without hidden autopilot. |
| `GDX-A02` Massline relationships | One signature verb creates traversal, work, rescue, theft, and combat relationships. | Tension, constraint, reel, payout, orbit, release, rebound, and break are authoritative physical state. | The observer can trace endpoint, tension, player input, motion, and consequence as one event. |
| `GDX-A03` Impulse and fields | Force tools alter real trajectories and relationships. | Charges, recoil, push, pull, drag, shielding, and area fields obey shared mass/collision rules and real collateral. | The same deterministic setup produces the same bounded physical result and readable counterplay. |
| `GDX-A04` Combat causality | Hits answer who acted, what contacted, and what changed. | Weapons remain subordinate to flight, geometry, damage ownership, recoil, defense, and salvageable aftermath. | Cause, approach, contact, damage layer, impulse, owner, and surviving state remain legible at the normal camera. |
| `GDX-A05` Enemy roles | Small groups pose distinct physical problems. | Compose roles such as intercept, pin, screen, displace, protect, disable, salvage-deny, and flee instead of adding health. | A blind observer identifies each role and at least one physical counter without a tooltip. |
| `GDX-A06` Encounter geometry | Space itself creates decisions. | Use compact lanes, mass, occlusion, machinery, hazards, exits, anchors, and moving work—not empty arenas or decorative clutter. | Geometry changes a route, risk, or tactic while all necessary decisions remain readable in the production bubble. |

### 5.2 Consequence and working-world loops

| Axis | Player promise | Planning decision | Suggested proof question |
|---|---|---|---|
| `GDX-A07` Collateral and law | Physical freedom has coherent social stakes. | No hidden immunity; law responds to witnessed ownership, intent, protected zones, damage, recovery, and restitution through one consequence path. | Clean and collateral controls diverge exactly once, persist through Continue, and never double-penalize. |
| `GDX-A08` Damage, wreck, and recovery | Defeat produces a situation, not immediate erasure. | Disabled craft become rescue, tow, custody, repair, salvage, or wreck states before cleanup. | The same actor and ship identity survive ordinary failure through a bounded route back to agency. |
| `GDX-A09` Working-world choreography | A place was doing something before the player arrived. | Give actors visible needs, jobs, handoffs, pauses, failures, reactions, and owner-safe punctuation inside the camera bubble. | The player can name the work, actor, route, interruption, and aftermath without relying on labels alone. |
| `GDX-A10` Routes and travel | Travel exposes the frontier's relationships rather than padding distance. | Route traffic through readable lanes, gates, risk windows, stops, transfers, and speed-earned reveal. | One trip communicates where goods, danger, authority, and opportunity are moving and why. |
| `GDX-A11` Exploration and knowledge | Discovery explains causes and relationships, not merely coordinates. | Chart ordinary space; use rumors, evidence, signals, changing windows, and frontier anomalies for uncertainty. | Evidence leads to a physical opportunity without an omniscient marker or blank-map chore. |
| `GDX-A12` Mining | Extraction is skilled flight and material handling. | Seams, heat, mass, fragmentation, capture, quality, hazards, and local demand form the loop. | Better physical handling produces a better material outcome and a recoverable failure path. |

### 5.3 Careers, economy, and capability

| Axis | Player promise | Planning decision | Suggested proof question |
|---|---|---|---|
| `GDX-A13` Salvage, repair, and rescue | Aftermath is playable work. | Share wreck identity, custody, towing, disassembly, repair demand, survivor handling, and claim law across one causal chain. | A damaged or disabled actor generates real work whose result changes both material and world state. |
| `GDX-A14` Hauling and trade | Cargo is mass, route risk, custody, timing, and promise. | Make loading, protection, delivery, diversion, loss, and market knowledge visible rather than inventory-only. | The player can trace one cargo lot from need to handoff and see the consequence of handling it well or badly. |
| `GDX-A15` Economy | Local needs are understandable and reactive. | Use bounded regional supply chains, sourced market knowledge, disruptions, repair demand, and truthful offers. | Player action changes a visible stock, price condition, route, traffic pattern, or offer—not only a hidden number. |
| `GDX-A16` Ship identity and fitting | The signature ship gains a history and a changing physical vocabulary. | Use a small garage, persistent wear/history, reversible preview, meaningful fitting tradeoffs, and rare strategic hull switches. | A fitting changes how the same recognizable ship solves work or danger, with costs visible before commitment. |
| `GDX-A17` Progression | Advancement unlocks possibility, not just superiority. | Reward new verbs, force envelopes, information, access, relationships, recovery options, and combinations before raw stat tiers. | A new capability opens a different solution while leaving older skills and equipment meaningful. |
| `GDX-A18` Automation and infrastructure | Routine systems extend the player's reach without replacing hero play. | Automate monitoring, scheduling, replenishment, and known routes; interrupt and return exceptional decisions to the pilot. | The player can state what automation did, why it stopped, and what now requires personal action. |

### 5.4 Missions, society, and content grammar

| Axis | Player promise | Planning decision | Suggested proof question |
|---|---|---|---|
| `GDX-A19` Missions and heists | Contracts invite the player into real existing problems. | Compose issuer, motive, physical verb, stable target, complication, stake, failure, and aftermath; never teleport a disposable mission world. | Target and terms are truthful before the player accepts the contract, and success or failure leaves evidence after it closes. |
| `GDX-A20` Factions and territory | Institutions act, remember, and change locally. | Bind ownership, security, economy, routes, construction, recurring actors, and recovery; allow transformation without routine extinction. | One event is readable at personal, local, and faction scales and the region remains functional afterward. |
| `GDX-A21` Narrative and characters | Authored motives create pressure inside systemic play. | Use recurring people, obligations, conflicting motives, and diegetic communication; cut linear campaign volume before systemic consequence. | A character's motive changes a real route or choice, while physics may produce an unscripted but coherent outcome. |
| `GDX-A22` Persistent change and failure | The region remembers what happened. | Preserve actors, ship history, wrecks, debts, custody, repairs, routes, ownership, and evidence across leave/return and Continue. | Runtime IDs may change, but the same world identities and consequences reconcile exactly once. |
| `GDX-A23` Content grammar and repetition | More content creates more decisions, not palette swaps. | Compose regional purpose, actor role, spatial setup, pressure, optional branch, and aftermath from bounded authored primitives. | Two variants differ in player decision or consequence while retaining recognizable regional identity. |
| `GDX-A24` Visual and material identity | Form and material communicate role, manufacture, ownership, scale, and damage. | Author whole-asset macro/meso construction, causal materials, faction grammar, wear, sockets, and silhouette under the visual production standard. | Role and construction remain legible in original-resolution normal-camera views without label, bloom, or default-material dependence. |

### 5.5 Presentation, access, and integrity

| Axis | Player promise | Planning decision | Suggested proof question |
|---|---|---|---|
| `GDX-A25` VFX | Effects reveal authoritative physical state. | Bind force, warning, contact, damage, work, and aftermath cues to causal events; keep ambient motion lower priority. | Cause, direction, owner, contact, and outcome survive bloom-off and reduced-flash review without effects inventing state. |
| `GDX-A26` Audio | Sound reveals force, machinery, threat, place, and offscreen change. | Use layered, owner-bound cues with dynamic range, spatial meaning, accessibility equivalents, and strict attention priority. | A listener identifies the primary event and one imminent branch without visual dependence or alarm soup. |
| `GDX-A27` UI and information | Decisions are precise without the interface playing for the player. | Show sourced knowledge, confidence, ownership, motion, risk, consequence, and one primary action through consistent surfaces. | An uncoached player chooses and explains the next action without marker soup or external spreadsheets. |
| `GDX-A28` Onboarding and input truth | The first session teaches the game players actually ship. | Teach optional physical practice using the selected control scheme and real work; never hard-code stale bindings in prose. | A new player reaches meaningful work and one capability with shipped controls, while experts can bypass instruction. |
| `GDX-A29` Accessibility | More players can perceive and control the same causal game. | Preserve rebinds, raw input reachability, contrast, hierarchy, scalable text, reduced motion/flash, audio alternatives, and assist choices. | Accessibility variants retain simulation truth and the primary cause/decision/consequence chain. |
| `GDX-A30` Performance, host, save, and determinism | Dense persistent play is one coherent game on every shipping route. | Pay for density through structure, batching, cadence, pooling, LOD, bounded queries, prewarm, and frame pacing—not quality cuts. | Candidate-bound Browser/Electron, p95/p99/hitch, deterministic, save/Continue, and cleanup evidence all agree. |

## 6. Five launch-coherence stories

These are the only GDX launch-coherence stories. Each is a proposed cross-axis player outcome and
proof frame. A future admitted program packet may adopt, split, revise, or decline the frame; GDX
itself neither adds a gate nor decides whether any packet or story is accepted.

### `GDX-S01` Core physical encounter

**Outcome:** one ordinary encounter proves manual flight, Massline or field force, role-based
opposition, meaningful geometry, real collateral, layered damage, and a recoverable surviving state.

- **Primary axes:** `GDX-A01–GDX-A08`, `GDX-A24–GDX-A30`.
- **Route:** enter a working movement near industrial geometry; protect, redirect, steal, or stop it;
  meet small role-based opposition; produce either clean resolution or physical collateral.
- **Suggested coherence proof:** a blind observer identifies the force cause, roles, contact,
  collateral, and what survives. Fixed-seed results reconcile through Continue and the target host
  routes.
- **Cut first:** enemy count, weapon breadth, arena variants, spectacle layers, reward breadth.
- **Never cut:** personal control, causal physics, consequence ownership, readable state, recovery.
- **Non-goals:** boss fight, cinematic set piece, fleet command, or debug-only spectacle.

### `GDX-S02` Living pocket

**Outcome:** one dense pocket visibly mines, hauls, processes, patrols, repairs, and reacts before the
player intervenes.

- **Primary axes:** `GDX-A09–GDX-A15`, `GDX-A20`, `GDX-A23–GDX-A30`.
- **Suggested prerequisite:** the admitted packet includes the `GDX-S01` physical/consequence
  promises or cites program-owned evidence that already proves the required seams.
- **Route:** enter, observe a productive chain, join or disrupt one link, leave, then return to the
  resulting traffic, shortage, repair, security, wreck, or market evidence.
- **Suggested coherence proof:** the player traces one need through actor, route, handoff,
  interruption, and local aftermath. Background work continues without player prompting and remains
  inside performance bounds.
- **Cut first:** regions, commodities, chatter, actor variants, distant-simulation fidelity.
- **Never cut:** visible causality, local differentiation, offscreen evidence, bounded density.
- **Non-goals:** full-galaxy simulation, decorative traffic, infinite jobs, or showcase-only scenery.

### `GDX-S03` First 15 minutes and work-to-capability

**Outcome:** an uncoached player learns through real work and earns one capability that materially
changes what their signature ship can do.

- **Primary axes:** `GDX-A11–GDX-A18`, `GDX-A27–GDX-A30`, supported by
  `GDX-S01–GDX-S02`.
- **Route:** launch with the selected shipped controls; read the pocket; choose a short mining,
  salvage, rescue, or hauling need; handle one complication; return; preview and fit one capability.
- **Suggested coherence proof:** the player can choose, attempt, recover, complete, and explain the
  capability without a tutorial corridor, false binding copy, free replacement ship, or opaque reward.
  If an admitted packet adopts the “first 15 minutes” promise, its declared target route reaches the
  capability choice in no more than `15:00` from player control.
- **Cut first:** alternate starts, dialogue, upgrade breadth, secondary jobs, authored exposition.
- **Never cut:** truthful controls, real work, meaningful capability, ordinary recovery.
- **Non-goals:** campaign prologue, disposable starter ship, loot shower, or collection pitch.

### `GDX-S04` Consequence loop

**Outcome:** help, theft, or collateral changes law, faction behavior, economy, work, and history while
preserving a playable recovery route.

- **Primary axes:** `GDX-A07–GDX-A08`, `GDX-A13–GDX-A22`, `GDX-A25–GDX-A30`,
  supported by `GDX-S01–GDX-S03`.
- **Route:** intervene in a live situation; produce a clean or collateral outcome; face immediate
  response; later encounter restitution, investigation, repair, shortage, custody, reputation, or
  route effects.
- **Suggested coherence proof:** clean and collateral controls diverge exactly once; consequences
  remain visible after leave/return and Continue; ordinary failure still leads back to meaningful
  agency.
- **Cut first:** branch count, moral dialogue, cinematics, voice, consequence variants.
- **Never cut:** single-writer truth, persistent identity, fair causality, recovery.
- **Non-goals:** karma meter, scripted scolding, duplicated penalties, or hard-fail reload.

### `GDX-S05` Region persistence

**Outcome:** a differentiated region remembers player and faction history while continuing to work.

- **Primary axes:** `GDX-A09–GDX-A10`, `GDX-A15–GDX-A24`, `GDX-A27–GDX-A30`,
  supported by `GDX-S04`.
- **Route:** alter a route, faction condition, economy state, wreck, ship, or relationship; leave;
  allow offscreen resolution; Continue; return and inspect the same identities and aftermath.
- **Suggested coherence proof:** runtime IDs may change, but actors, ownership, ship history, wrecks,
  recovery, knowledge, and regional conditions remain coherent across supported hosts and saves.
- **Cut first:** extra regions, faction extinction, long campaign arcs, high-fidelity distant simulation.
- **Never cut:** identity, reconciliation, evidence, host parity, bounded cleanup.
- **Non-goals:** reset bubbles, scripted-return illusion, global simulation, or a region-complete screen.

## 7. Story dependency and evidence flow

```text
GDX-A direction axes
        ↓ compose
GDX-S player stories
        ↓ split and admit
PQ parent outcome
        ↓ dispatch
exact admitted implementation / evidence leaves
        ↓ prove
candidate-bound receipts and player-route evidence
```

The proposed coherence relationships are `GDX-S01 → GDX-S02 → GDX-S03 → GDX-S04 → GDX-S05`,
with `GDX-S01` also directly supporting `GDX-S03`. They expose hidden dependencies while shaping a
packet; they do not block, admit, or accept work. The admitted queue and active packet own actual
dependencies and may bind equivalent program-owned proof instead.

When an admitted packet chooses to adopt a GDX slice, it should declare:

1. one player outcome and the story it advances;
2. the exact axes it must demonstrate together;
3. a default-route start, action, consequence, and terminal observation;
4. dependencies backed by program-owned evidence or explicitly included in that packet;
5. a cut rule that preserves the core promise when scope tightens;
6. non-goals and protected authority boundaries; and
7. candidate-bound functional, visual, accessibility, performance, host, and persistence evidence.

GDX does not create alternate craft or mechanics standards. Physical axes remain outcome-level unless
the program activates a specific proposal such as
[`PHYSICAL_PLAY_GRAMMAR.md`](../PHYSICAL_PLAY_GRAMMAR.md). Graphics-only research starts at
[`EXPANSION_PROGRAM.md`](../program/EXPANSION_PROGRAM.md), and authored visual work follows
[`docs/visual-assets/README.md`](../../docs/visual-assets/README.md). Performance evidence follows
[`PERF_BUDGET.md`](../PERF_BUDGET.md). These supporting documents cannot self-admit work either.

## 8. First three candidate cuts

These are directionally coherent candidates for future admission, not work authorization or queue
position.

| Candidate | Player outcome | Stories / axes | Scope cut rule |
|---|---|---|---|
| `GDX-C01` Force, collateral, and recovery incident | One working movement becomes a personally piloted force problem whose clean and collateral outcomes leave different recoverable states. | `GDX-S01`; `GDX-A01–GDX-A08`, `GDX-A24–GDX-A30`. | One pocket, one friendly movement, two enemy roles, one geometry setup, one recovery path. |
| `GDX-C02` Working-route pocket | One local production chain visibly operates, is interrupted, and leaves economic, traffic, repair, or security aftermath. | `GDX-S02`; `GDX-A09–GDX-A15`, `GDX-A20`, `GDX-A23–GDX-A30`. | One chain, one commodity/material family, one disruption, one return state. |
| `GDX-C03` Work-to-capability opening | A new player completes one physical job and adds one horizontal capability to the same ship. | `GDX-S03`; `GDX-A11–GDX-A18`, `GDX-A27–GDX-A30`. | One start, one job, one complication, one fitting choice, one recovery branch. |

Before admission, deduplicate each candidate against the active queue, accepted receipts, and current
code. Reuse proven seams; do not reopen accepted camera, control, state-owner, or save contracts merely
because a research comparator used a different technique.

## 9. Blind player-story test

Run each applicable story on the default route, production camera, selected shipping controls, and
supported host without debug overlays, coaching, or advance explanation. Ask the observer:

1. What was this place doing before the player arrived?
2. What force or action caused the important motion or damage?
3. What did the player's work protect, unlock, or change?
4. What collateral or failure happened, and what recovery remains?
5. What should still be true after leaving and using Continue?

Every question relevant to the declared slice must be answered correctly from observed play.
“Unclear” is a failure. A coached retry is evidence about onboarding, not a pass. Do not repeat the
same unchanged route after the same failure fingerprint.

## 10. Evidence standard

Use evidence proportionate to the slice, but never substitute a lower layer for a player-facing claim.

Accepted evidence can include:

- uninterrupted default-route play at the production camera;
- fixed-seed deterministic proof where update order or physics matters;
- authoritative events/receipts binding cause, owner, target, and consequence;
- leave/return and save/Continue reconciliation using stable world identities;
- Browser/Electron parity for routes shipped on both;
- matched p95, p99, hitch, memory, and cleanup evidence on the target route;
- original-resolution visual review, including relevant reduced-motion/flash and contrast states; and
- blind observations recorded before debrief.

The following never establish a player-facing outcome by themselves: status prose, queue movement,
code presence, mock-only tests, debug/lab-only behavior, an asset receipt, an isolated beauty shot,
average FPS, or a receipt that is not bound to the candidate and route.

## 11. Comparative research: transfer, adapt, refuse

This synthesis was built through a twelve-exchange product interview, adversarial plan review, and a
primary-source-informed comparison reviewed on 2026-08-09 across major space-game archetypes.
Research is a lens, not authority. Borrow a principle only when it survives SpaceFace's personal
agency, top-down camera, physical causality, collateral, persistence, accessibility, and performance
constraints.

| Comparator | Transfer or adapt | Explicit refusal |
|---|---|---|
| Freelancer | Living routes, bases, truthful offers, travel grammar, and readable factions. | Static nostalgia, empty transit, or mission populations disconnected from world state. |
| Starsector | Role pressure, damage topology, logistics consequence, and faction texture. | Fleet-command displacement, campaign-map primacy, or stat escalation as the main fantasy. |
| X4 | Working economy, industrial traffic, and useful routine automation at bounded regional scale. | Empire management, remote resolution of exceptional play, or a full-universe per-tick simulation. |
| Elite Dangerous | Costly speed, sourced market knowledge, and local-state consequence. | Scale as content, opaque grind, or dependence on external spreadsheets. |
| No Man's Sky | Authored-procedural wreck grammar, approachable exploration, and readable material loops. | Quantity-first sameness, expiring progression, or broad procedural abundance as identity. |
| Outer Wilds | Evidence-led curiosity, place-as-explanation, and knowledge as progression. | A global reset loop that erases persistent collateral and history. |
| Endless Sky | Top-down readability, routes, factions, and an approachable open chart. | Collision/friendly-fire immunity or low-physicality combat as SpaceFace's endpoint. |
| Nova Drift | Strong control identity, horizontal build expression, and explicit accessibility. | Arena abstraction, loot-color progression, or detaching builds from world consequence. |
| Hardspace: Shipbreaker | Physical work, causal material handling, and failure that creates a new problem. | Unrestricted cutting, interiors-first scope, or unbounded debris. |
| Heat Signature | Systemic mission complications, recovery, and concise authored motives. | Universal pause-to-solve or arbitrary camera zoom replacing live flight skill. |
| Space Engineers | Material legibility, mechanical purpose, and construction logic. | Voxel construction or universal ship building as the core progression path. |
| Avorion | Faction visual grammar, material progression cues, and regional identity. | Radial stat walls, durability inflation, or procedural hull quantity as depth. |
| ΔV: Rings of Saturn | Mining as physical work, ship instrumentation, and mass/economy consequence. | Opaque simulation that withholds the primary action or recovery path. |
| EVERSPACE 2 | Dense encounter composition, readable roles, and horizontal specialist support. | Color-tier loot, level-gated damage, or disposable ship identity. |

Primary research starting points:

- [Freelancer manual](https://download.wcnews.com/files/manuals/Freelancer%20-%20Manual.pdf)
- [Starsector manual](https://www.fractalsoftworks.com/starfarer/docs/StarfarerManual.pdf)
- [X4: Foundations](https://www.egosoft.com/games/x4/info_en.php)
- [Elite Dangerous](https://www.elitedangerous.com/)
- [No Man's Sky](https://www.nomanssky.com/)
- [Outer Wilds](https://www.mobiusdigitalgames.com/outer-wilds.html)
- [Endless Sky player manual](https://github.com/endless-sky/endless-sky/wiki/PlayersManual)
- [Nova Drift](https://www.novadrift.io/)
- [Hardspace: Shipbreaker](https://blackbirdinteractive.com/new-shipbreaker/)
- [Heat Signature](https://store.steampowered.com/app/268130/Heat_Signature/)
- [Space Engineers features](https://www.spaceengineersgame.com/features/)
- [Avorion](https://www.avorion.net/)
- [EVERSPACE 2](https://rockfishgames.com/games/)
- [ΔV: Rings of Saturn](https://store.steampowered.com/app/846030/DV_Rings_of_Saturn/)

## 12. Product-authority reconciliations

Before admitting a slice that depends on these decisions, reconcile the relevant GDD section in the
same product-authority pass. This list is not program status.

- **First-15-minute controls:** GDD §4 correctly says keyboard flies, mouse aims weapons, `Digit0`
  brakes, and `Space` operates Massline; GDD §8.2 still teaches mouse-nose and `Space` brake. The
  onboarding story must teach the selected shipped scheme rather than preserve the stale prose.
- **First-15-minute structure:** GDD §8.2 currently owns an ordered six-beat opening, while `GDX-S03`
  proposes choosing a real job, completing work, and reaching capability within fifteen minutes.
  `GDX-S03` is non-governing until product authority reconciles that structure; no packet may use this
  supporting direction to bypass or silently replace the GDD opening.
- **Ship progression:** GDD §11 retains a thirteen-hull ladder, while the interview direction centers
  a signature ship and small garage. Decide whether the ladder becomes regional availability and rare
  strategic switching, or whether the direction changes, before building progression packets.
- **Regional focus:** [`ALPHA_PROGRAM.md`](./ALPHA_PROGRAM.md) locks a persistent 24-region galaxy.
  Decide how six to eight dense hero clusters organize that graph; do not delete authored regions or
  reinterpret this supporting direction as authority to reduce the technical region count.
- **Ordinary failure:** define the pilot/ship identity and recovery ladder in product authority before
  a packet treats custody, impound, debt, or recommission as a universal rule.
- **Automation boundary:** define routine versus exceptional resolution before adding infrastructure
  or delegation, so automation cannot quietly turn SpaceFace into an empire-management game.
- **Faction persistence:** define the limits of local transformation and rare faction erasure before
  territory systems can permanently hollow out a region.

## 13. Failure and continuation contract

The proposed ordinary-failure ladder is:

```text
operational → compromised → disabled / stranded / captured / impounded → recovery → recommissioned
```

The pilot and signature ship remain identifiable throughout. The ship may be temporarily inaccessible,
physically relocated, indebted, damaged, stripped, or dependent on rescue, but it does not silently
become a replacement entity. Major incidents append history. Permanent destruction belongs only to an
explicitly declared high-risk choice.

Offscreen resolution may be coarse, but important outcomes leave at least one inspectable artifact:
wreck, survivor, changed route, shortage, repair work, witness, news, ownership change, market
condition, custody state, or historical record. Every ordinary failure needs a bounded route back to
meaningful agency without an unrecoverable debt spiral.

## 14. Global refusals

- Empire or fleet-command play as the primary fantasy.
- Automation-first or idle progression.
- Disposable hull tiers, loot-color ladders, or a large ship-collection treadmill.
- Voxel construction, unrestricted cutting, or interiors-first scope.
- Generic procedural infinity, palette-swap density, or content count as quality.
- Harmless friendly fire, invisible actor immunity, or consequence-free collision.
- Global resets, routine hard-fail reloads, or saves that erase consequences.
- FOMO seasons, expiring core progression, or universal timers.
- Unearned camera expansion, cinematic camera takeover, or zoom as a design repair.
- Full-galaxy simulation whose local causes cannot be inspected.
- Authored campaign breadth purchased by cutting systemic depth or physical consequence.
- Performance wins obtained by reducing authored quality, population, effects, or default settings.
- Debug, receipt, status, asset, or harness artifacts presented as player-facing completion.
- Axis checklists, story status, owners, leases, exact paths, or queue fields inside GDX.

## 15. Definitions

**Success:** the five stories collectively demonstrate personally piloted physics, a working pocket,
work-to-capability, real consequence, and persistent regional history on default player routes.

**Coherence:** a proposed slice is well-formed here when its dependencies have program-owned evidence
or are explicitly included, route and evidence are concrete, its cut rule preserves the promise, and
live ownership can be bounded. This is not readiness or claimability. Exact queue dispatch units own
claimability; `program-dispatch` reports their claim-ready view but grants no lease. The active packet
owns implementation handoff and proof, and a fresh exact owner/mutex check is still required before
mutation.

**Disposition:** GDX never closes a leaf, packet, or story. The active packet, candidate-bound receipts,
and program acceptance authority own those decisions. The cross-axis route, blind-test, persistence,
host, accessibility, and performance criteria here are proposed proof questions they may adopt. GDX
itself remains direction until explicitly superseded.

The durable shorthand is:

> GDX is direction, never status. A convincing launch proof connects five cross-axis player stories,
> not thirty isolated
> feature axes. Physics and working-world causality must succeed together inside the fixed camera
> bubble. Routine failure creates recovery and history without erasing player identity. When scope
> hurts, cut breadth and management before personal physical play.
