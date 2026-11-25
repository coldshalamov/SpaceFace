# 17 — Agentic quality campaign

> [10 Engine](10_ENGINE.md) owns playable-flight priorities, architecture, and acceptance. This
> page retains the broader stage-one product bar and campaign record.

**Director, 2026-11-24.** This is the working shape for the full first-stage completion campaign: finish the game that is already promised, make it smooth and coherent enough to feel professionally built, then expand only what is stable. It does not replace `01_THE_GAME`, `11_ORDER_OF_WORK`, or the measure in `12_PIPELINE`; it is the operating plan for reaching them with multiple agents.

The owner's framing is the controlling one: the game is still in **stage one — crafting the game**. Stage one ends when a new player can play the core game for a substantial session and not notice that it is unfinished until they run out of laid-out levels, sectors, or story. **Stage two — laying out experiences with finished pieces** begins only after the core game is confidently built. This campaign does not stop at a demo impression and does not stop because a queue looks shorter; it stops at the stage-one gate below.

## The product bar

A player should be able to say:

1. The game never appears to freeze the world while the interface keeps moving.
2. The first minute is quick, legible, and controlled: title, Swarm, first fight, death, Again.
3. The first Adventure opening teaches by doing and does not dead-end at berth, mining, station, map, or pause.
4. Fights read as physical objects in motion, not particles, rings, or UI noise hiding the ships.
5. Every visible system feels finished: no dead buttons, contradictory words, placeholder explanations, or half-wired progression.
6. Only after those are true do more rounds, places, jobs, enemies, and economy depth make the game bigger rather than messier.

## Stage-one completion gate

Stage one is finished only when all of these are true together:

1. **Continuous world motion.** Ships, rocks, projectiles, machines, and camera-relevant objects keep moving smoothly; the interface never outlives a frozen world and then catches it up in jumps.
2. **The whole core loop works.** Swarm start → fight → learn → die/refit/again and Adventure launch → fly → rope/power/shoot → mine/work → dock/station/job → undock → save/continue are reliable on ordinary input.
3. **No hollow surface.** Visible buttons, cards, instruments, powers, upgrades, rewards, jobs, menus, and station actions either do truthful useful work or are gone.
4. **Combat and control are coherent.** The player can understand what their ship, guns, powers, rope, heat, enemies, and collisions are doing without reading source or internal names.
5. **The game has one voice.** Text, HUD wording, station writing, tutorial beats, death/readback, and progression language are plain, consistent, and belong to the same game.
6. **Performance is professional on the target machine.** Locked 30 fps minimum in representative fights, 60 fps as the quality target, no visible freezes, no frame over 100 ms, no multi-second loading wall, no world slowdown as the normal answer to density.
7. **Persistence is safe.** Saves load, generations do not corrupt each other, paused/saving/restoring transitions complete, and the deterministic replay remains truthful.
8. **The first several hours feel authored.** Not necessarily complete in story or sector count, but every system the player meets has enough depth and finish that its absence later — not its brokenness now — is what reveals unfinished content.
9. **The machinery is ready for stage two.** Encounter/level/sector composition data, enemy/job/world hooks, asset admission, save migration, and validation are stable enough that new experiences can be laid out without reopening every core system.
10. **The red-test and half-work piles are controlled.** Tests covering the shipping path pass, intentional behavior changes are represented honestly, and no forgotten agent worktree/pile is required to explain the current game.

## Operating rules

1. **No new worktrees.** The owner did not ask for them and the machine has already suffered from forgotten copies. Agents work in the shared checkout with exact file ownership, small packets, and frequent integration. Existing foreign worktrees or orphaned checkouts are inventory items, not a pattern to repeat.
2. **Two working lanes, not a swarm of cowboys.** Keep roughly two substantial implementation/investigation lanes active at once. Reviews may run beside them. More agents are useful only when their write sets are disjoint and the machine remains responsive.
3. **One owner per file at a time.** A packet names its files. Before editing, the worker inspects existing diffs and works beside foreign lines. No broad rewrites, no tree-wide formatting, no drive-by refactors.
4. **No unreviewed taste.** Neon can propose and build taste-sensitive work, but the director or Codex reviews it adversarially against the actual frame and player route.
5. **Codex is the senior adversarial reviewer.** GPT 6.2 Sol is especially valuable for backend architecture, 3D/asset pipeline, race conditions, and finding the flaw in another agent's claim. Review output is evidence to reproduce, not truth by assertion.
6. **The controller integrates.** Workers produce candidates and receipts. The controller verifies, repairs, splits, or rejects. A worker saying DONE is never proof.
7. **Do not make the game smaller to make it faster.** Performance work uses architecture: scheduling, batching, sleeping, streaming, caching, transport repair, and measured budgets. It must not empty the world, blur it, darken it, or dumb down enemies.
8. **INFERENCE is finishing, not feature spray.** Use it for `finish`, `remove`, `class`, and authored `plant` rows that strengthen existing play. New places/systems/content wait until the stability gates are green.

## Lane shape

| Lane | Primary use | Cadence |
|---|---|---|
| Controller + up to two internal subagents | architecture, integration, measurement, difficult root causes, final judgment | continuous |
| Neon 1 (`agy1`) | frontend/product polish, fresh-eyes experience, taste-sensitive implementation | one bounded lane |
| Neon 2 (`agy2`) | visual/interface critique, creative finishing, independent implementation or review | one bounded lane |
| Codex GPT 6.2 Sol | adversarial review, backend/3D architecture, hard bug isolation | review/investigation lane as needed |
| Other terminal agents | overflow only when a packet is narrow and capacity is free | opportunistic |

`scripts/fleet/run.mjs` remains the launch surface because it already records prompts, logs, receipts, changed files, and exits. It has been corrected to use GPT 6.2 Sol and a read-only Codex review mode. The active worker cap should stay near **five total lanes** unless the machine is idle: two builders/investigators, two reviewers, and one measurement/evidence lane. Browser or game evidence remains serialized through the game lock.

## Phase plan

### Phase 0 — control the evidence and the mess (now)

Goal: no more unknown half-work underneath new work.

1. Inventory the current dirty tree into logical piles and land, split, repair, or discard each pile.
2. Diagnose the world-update hitch as a transport/scheduling architecture problem, not as a vague "performance" issue.
3. Take one quiet-machine baseline for boot, first control, Swarm rounds 2/6, Adventure opening, freezes, and worst frames.
4. Clean orphan checkouts/worktrees safely: inventory first, harvest or preserve unfinished work, then remove only what is proven redundant. Never mass-delete.
5. Remove temporary diagnostic clutter only after its evidence is copied into receipts.

Exit: the tree is explainable, the scoreboard is real, and every next packet has a clean seam.

### Phase 1 — make the world move continuously

Goal: eliminate the feeling that ships/objects freeze while the UI and FPS counter remain alive.

Priority order:

1. Trace worker clock, command handling, journal generation, reply coalescing, ACK/backpressure, pose-table publication, main-thread application, and render consumption.
2. Prove whether positions are missing, late, coalesced, dropped, or applied in bursts.
3. Repair the transport/render contract so transforms are continuous and latest-wins where appropriate, without losing correctness-critical events.
4. Cut main-thread frame cost: DOM/HUD work, scene preparation, per-frame allocation, repeated event fan-out.
5. Cut sim-step spikes: bullets/physics ownership, sleeping, phased AI, field/contact coalescing.
6. Re-measure every layer on the same machine with worst-frame and world-speed evidence.

Exit: Swarm rounds 2 and 6 hold at least locked 30 fps on the demo machine, no frame over 100 ms, no visible freeze, world speed stays near real time.

### Phase 2 — make the first ten minutes sleek

Swarm golden path:

1. Title in under 10 seconds; Swarm press to control under 20 seconds, target 10.
2. First hostile visible quickly; the arena/floor/lighting are present every time.
3. One teaching card at a time, only when useful, never hidden or repeated pointlessly.
4. Death and Again are instant and reliable.
5. HUD communicates round, boss, chain, Scrap, heat, powers, and the Line without overlapping or jargon.

Adventure opening:

1. Rope instruction and payoff happen in the right order.
2. Berth autopilot brakes, parks, docks, enters station, and undocks reliably.
3. Mining yields useful cargo; the first job is obvious.
4. Map and pause open every time.
5. Text sounds like one game and one voice.

Exit: the opening captures pass repeatedly, and a stranger can play without a dead end or unexplained wait.

### Phase 3 — professional polish and INFERENCE finishing

Only after Phases 0–2 are measurably better:

1. Combat feel: hit recognition, attack tells, enemy personality, weapon expectations, controlled effects.
2. Interface consistency: station screens, map, pause, settings, refit, run-over, controller/touch/keyboard parity.
3. Economy/progression coherence: chain rewards, first wall gun affordability, first job, trading visibility, pilot tree truth.
4. INFERENCE units: finish half-working systems, remove noise/duplicates, fix a class of defect everywhere, build selected authored plants exactly as written.
5. Audio and micro-interactions where they increase legibility rather than noise.

Exit: the game feels intentionally authored, not merely functional.

### Phase 4 — expand

Only after the core is stable:

1. Swarm rounds 11–30, composed enemy groups, boss variety, rewards and shops.
2. More places, sector identity, residents, one-offs, and world reactions.
3. Adventure labor-to-capital progression, trading as a game, industry, drones, rover, building inside rocks.
4. Asset/level expansion at the shipping visual bar.

## Exhaustive stage-one workstreams

These are the lanes the campaign rotates through until the stage-one gate is true. They are not a one-week checklist; they are the complete first-stage construction program. Each workstream is done only when its player-facing definition is true on the ordinary route, not when its first patch compiles.

### A. World-motion backend and frame consistency

The player outcome and current assignments are in [10 Engine](10_ENGINE.md).

### B. Loading, streaming, and asset admission

Player result: the game starts quickly and nothing pops in as an invisible obstacle or long lighting wall.

Exhaustive work:

1. Profile cold and warm boot by named stage.
2. Move nonessential shader, lighting, texture, geometry, and scene preparation off the first-control path.
3. Cache stable transcodes, merged geometry, generated textures, and package verification truthfully.
4. Prepare the work that protects play before control. Stage later content within the live frame,
   simulation, and input budgets in [10 Engine](10_ENGINE.md).
5. Repair authored asset admission, stand-ins, LOD, shadow warm-up, and first-flight holds.
6. Audit the Foundry and other heavy arenas for draw cost without removing their identity.

Done when: title is under 10 s, Swarm control is under 20 s with 10 s as target, Again is under 10 s, and no invisible or late object can surprise the player.

### C. Input, camera, flight, and physical feel

Player result: keyboard/mouse, controller, and touch all produce the intended physical action immediately and predictably.

Exhaustive work:

1. Finish the controller/input integration cleanly; prove movement, turning, powers, menus, and death/retry on real input paths.
2. Repair camera gates, shakes, collision clearance, cause tags, and any swinging or contradictory motion.
3. Tune braking, cruise, docking, berth autopilot, rope behavior, throwing, collision response, and mass readability.
4. Remove double-owned input and contradictory key/mouse/pad behavior.
5. Make every power discoverable, repeatable, and truthful in its cost/cooldown/result.

Done when: a player can fly, fight, rope, throw, dock, pause, and retry without fighting the controls or camera.

### D. Combat, weapons, powers, enemies, and encounter composition

Player result: fights are legible, physical, varied, and fair; every enemy feels like a character rather than a stat blob.

Exhaustive work:

1. Audit every weapon for damage, kick, heat, cadence, range, projectile behavior, and player expectation.
2. Finish hit recognition: body flash, sparks, scorch, directional feedback, impact audio/VFX without whiteout.
3. Give attacks readable tells and enemy doctrines distinct movement, timing, range, and reaction patterns.
4. Repair AI perception, steering, formation behavior, disengage/re-engage, collision avoidance, and target choice.
5. Compose enemy groups intentionally instead of scaling by raw count.
6. Finish boss mechanics, boss plates, reward logic, and round pacing.
7. Make chain kills, thrown objects, hazards, and room machines meaningful and economically balanced.

Done when: rounds feel designed, enemies are distinguishable by behavior, and a strong player can use physics creatively rather than only shoot.

### E. Swarm run loop and progression

Player result: Swarm is the fast, replayable, legible loop promised by the game concept.

Exhaustive work:

1. Golden path: enter, control, first hostile, round header, chain, Scrap, level, refit, death, Again.
2. Teaching: one card at a time, contextual retirement, no repeats that insult the player, no interference with combat information.
3. Round sizes, pacing, boss rounds, rewards, shops, wall-gun affordability, and run length.
4. Refit/run-over screens that explain death, choices, and next action cleanly.
5. Pilot-tree integration: only live effects are offered, refusals are honest, noncombat branches matter.
6. Achievements, stats, share codes, settings, and meta information stay out of the fight unless earned and relevant.

Done when: a player can understand and enjoy repeated runs immediately, and each run produces meaningful choices.

### F. Adventure core loop, work, economy, and station truth

Player result: Adventure is a playable persistent space life, not a sparse shell around Swarm.

Exhaustive work:

1. Opening rope/job/berth/mining/dock/undock path is reliable and taught by doing.
2. First job is obvious, pays truthfully, and leads naturally to the next opportunity.
3. Mining places useful material in the hold; cargo, stacking, jettison, and recovery are understandable.
4. Station services work truthfully: market, contracts, shipworks, bar, ledger, factions, repairs, refuel.
5. Prices, shortages, events, scan payouts, bounties, tolls, customs, and trading form a coherent economy.
6. Labor-to-capital progression exists: work, savings, equipment, deployment, risk, and consequence.
7. Save/reload preserves jobs, cargo, reputation, station state, traffic, claims, and long-running consequences.

Done when: the first hours of Adventure feel intentionally authored and economically coherent, not like a test bed.

### G. World, places, population, persistence, and reactivity

Player result: sectors feel like places with identity, memory, inhabitants, and consequences.

Exhaustive work:

1. Finish sector identity, arrival plates, skies, residents, one-offs, and ambient activity.
2. Repair off-screen persistence: rock regrowth, traffic, population, jobs, faction pressure, law, news, wrecks, claims.
3. Remove instant respawn/depopulation artifacts and overcrowded randomness.
4. Implement selected authored plants exactly where they strengthen existing places.
5. Make survivor pods, rescue, evidence, deeds, rumors, and witnessed actions matter where already promised.
6. Ensure every visible place/system either reacts truthfully or stops pretending.

Done when: the world persists and reacts enough that the player believes it exists when they are not looking.

### H. Interface, accessibility, words, and information hierarchy

Player result: every screen and HUD element is readable, truthful, consistent, and worth its space.

Exhaustive work:

1. HUD hierarchy: attention routing, alerts, receipts, prompt deck, instruments, objective, chain, heat, powers.
2. Station screens and menus: one navigation model, no dead controls, no contradictory tabs or buttons.
3. Map/minimap/chart upgrades and truthfulness.
4. Pause/settings/help/keybind/controller/touch/mouse consistency.
5. Typography, spacing, contrast, motion reduction, flash reduction, screen-reader/focus behavior.
6. Plain-words pass across the first hours; remove internal codenames, wrong units, jargon, and duplicated copy.
7. Death, level-up, round summary, share, achievements, and tutorial surfaces do not overlap or compete.

Done when: a stranger can understand what is happening and what to do next without visual noise or hidden controls.

### I. Visual quality, VFX, lighting, and manufactured-world identity

Player result: the game looks like one authored physical world rather than procedural effects stacked on top of it.

Exhaustive work:

1. Remove remaining rings, halos, placeholder arcs, misleading hazard colors, and whiteout clouds.
2. Make impact, explosion, weapon, tether, power, shield, engine, and debris effects physical and readable.
3. Finish arena lighting/floors/hazards while preserving frame rate.
4. Audit procedural stand-ins and replace or integrate authored assets at the shipping bar.
5. Improve station/place visual identity without breaking performance.
6. Preserve accessibility and readability under motion/flash reduction.

Done when: ships and objects read as matter, effects support rather than obscure them, and places do not share one generic sky.

### J. Save, session, determinism, and test health

Player result: progress is safe, continuing is trustworthy, and regressions are caught before players see them.

Exhaustive work:

1. Finish paused save/load worker transport correctness and restore pacing.
2. Prove raw/compressed generation selection, quota failure, rollback, migration, corrupted-save refusal, and atomic replacement.
3. Keep deterministic replay honest; any intentional sim change is re-recorded and explained.
4. Repair red tests that cover the shipping path before broad cleanup; do not update expectations to hide regressions.
5. Remove or rewrite brittle tests that pin implementation trivia rather than player-facing contracts.
6. Make boot, playable, freeze, smoothness, loading, opening, and accessibility gates repeatable on quiet hardware.

Done when: the shipping path is protected by meaningful checks and saves are boringly reliable.

### K. Audio, feedback, and moment-to-moment polish

Player result: actions feel consequential without becoming noisy.

Exhaustive work:

1. Audit audio cues for hits, warnings, UI, rope, powers, docking, death, rewards, and station actions.
2. Remove duplicate or contradictory feedback; route facts, decisions, alarms, and moments to the right surface.
3. Add micro-interactions only where they clarify state or increase physicality.
4. Respect reduced motion/flash/audio preferences.

Done when: feedback increases comprehension and weight rather than volume.

### L. Stage-two readiness: content composition machinery

Player result: not directly visible yet; this is what allows levels/sectors/stories to expand without reopening the core game.

Exhaustive work:

1. Document and stabilize the data contracts for arenas, waves, enemy groups, jobs, stations, sectors, encounters, plants, and one-offs.
2. Build or finish the smallest reliable authoring/validation tools needed to lay out content safely.
3. Ensure new content can be validated for reachability, performance, save compatibility, wording, and player-route completion.
4. Maintain a content asset inventory: what exists, what is stand-in, what is missing, what can be recombined.
5. Do not use this as an excuse to build tooling before the game core works; implement only what stage two truly needs.

Done when: laying out a new sector/level/encounter is primarily a creative composition task using finished pieces.

## Initial task bank

| ID | Lane | Player-facing outcome | Type |
|---|---|---|---|
| CAM-AUDIT-HITCH-1 | Codex review | independent causal map of world-position freezes | read-only architecture |
| CAM-AUDIT-TREE-1 | Neon 1 | make the dirty tree understandable and safe to integrate | read-only triage |
| CAM-AUDIT-EXPERIENCE-1 | Neon 2 | a ranked professional-polish map from the player's point of view | read-only creative audit |
| CAM-HITCH-TRANSPORT-1 | controller/Codex implementer | positions stay continuous under load | backend repair |
| CAM-HITCH-MAIN-1 | Neon/backend | remove main-thread causes of bursted presentation | backend/render repair |
| CAM-LOAD-1 | Neon/backend | first control arrives without the long lighting/scene wall | loading repair |
| CAM-SWARM-GOLD-1 | Neon 1 | Swarm press→fight→death→Again feels immediate and reliable | golden path |
| CAM-ADV-GOLD-1 | Neon 2 | Adventure opening never dead-ends | golden path |
| CAM-UI-TRUTH-1 | Neon/interface | every visible control either works or is gone | finishing/removal |
| CAM-COMBAT-READ-1 | Neon/combat | hits, tells, powers, and the Line read clearly in motion | combat polish |
| CAM-INF-FINISH-1 | rotating | finish one half-working system completely | INFERENCE finish |
| CAM-INF-REMOVE-1 | rotating | remove one class of clutter/noise everywhere | INFERENCE remove |
| CAM-INF-PLANT-1 | rotating | implement one authored plant exactly as written | INFERENCE plant |

## Active evidence backlog

- Hunter-career economy regression: the dirty cohort fixture snapshot showed hunter income falling from about 223 credits/minute to about 31 credits/minute, together with `authority_slice_mismatch:markets`. The fixture noise was cleaned during integration, but the underlying economy/authority question remains a Phase-3 bug until reproduced and fixed.

## Review loop

Every mutation packet follows the same loop:

1. Builder implements in exact files and writes a receipt.
2. A different model reviews adversarially, read-only.
3. Controller reproduces confirmed findings and either repairs narrowly or sends one correction packet.
4. Focused checks run first; player-route or visual evidence runs only after the deterministic checks pass.
5. Integration updates the board and the next packet is launched.

A beautiful diff that cannot survive review is not progress. A correct review that cannot be reproduced is not a blocker.

## Measurements that matter

- time to title;
- Swarm press to control;
- Again press to control;
- first hostile time;
- average fps, worst frame, p95 frame time;
- world-speed ratio;
- number of freezes over 350 ms;
- sim-step p95/worst;
- opening route steps passed;
- visible defects found by looking at frames.

Numbers taken while the machine is saturated are diagnostics, not baseline truth. Quiet-machine measurements are the scoreboard.
