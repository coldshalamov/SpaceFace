<!-- LIFETIME: DURABLE — dated product diagnosis; observations must be refreshed when the build changes. -->
# SpaceFace: recovering the arcade game inside the space game

**Cumulative review: 10 September 2026.** Based on the owner's gameplay description, the current working build at `e255443a4` plus existing uncommitted work, the preceding implementation/play passes, and a fresh default Crucible run. This is a product diagnosis and proposed direction, not a completion ledger or a replacement for [VISION](../VISION.md). No gameplay was changed for this report.

## The judgment

SpaceFace has many of the right ingredients, but it does not yet reliably compose them into the game the owner describes. Its distinctive promise is **controlling a dangerous physical situation and making it collapse spectacularly in your favour**. Flying and shooting should already be pleasurable; manipulating pursuit, terrain and momentum should make them extraordinary.

The current build too often presents separate activities: fly a ship, shoot a target, activate a power, read a message. The desired game connects them: **draw the pack into a line, carve an escape, leave something terrible behind, and see exactly how your decision ruined them.** The difference is encounter composition, control and presentation, not just a larger weapon catalog.

My preceding implementation pass repaired substantial problems and connected useful mechanics. Calling that sufficient evidence of an arcade resurrection would be too generous. A functioning web constraint does not establish that Web Weaver feels like a web build. A working cash shop does not establish an addictive round economy. Scripted thirty-wave victory establishes route continuity, not thirty waves worth playing.

The strongest next investment is a complete, compelling combat encounter with its reward and retry loop. Then carry that standard through the full mode and into Adventure. Keep the ambition; change what counts as progress.

## The game I would direct

Imagine a developed run. A flock of light ships pours around the outside of a broken refinery. You arc around its heavy machinery while firing backward. Your bright rounds visibly bank off an angled plate into the pursuit. A heavier interceptor comes across the escape route; you brake, change direction and slip through a gap beside it. A dropped charge seats itself in your wake and gives a short, unmistakable arming cue.

The first pursuers bunch at the gap. You bind several together. Their engines keep pulling, but their conflicting thrust folds the group into a struggling knot. You trigger the charge. The nearest hull is thrown into the plate, another swings around its attached partner, and their explosions catch the next arrivals. You can follow the whole chain with your eyes. The gunfire never stopped being satisfying, and the flying never stopped belonging to you.

The destruction opens a route across the room. You cut through it, collecting a stream of rewards. A new flank begins to form. You can greed for a pickup, attack the specialist, or preserve your escape line. When the round ends, the quiet feels earned. You buy an upgrade because you already know the ridiculous thing you want to try next.

That is a composite advanced build, not a requirement to put every mechanic in the first kit. A starter needs one immediately expressive identity, dependable shooting, and a useful escape/setup tool. The depth comes from combining understandable actions, not remembering an entire keyboard.

Swarm compresses this into **attempt → earn → buy or save → discover a stronger combination → risk it → die → retry**. Adventure spreads the same physical pleasures across journeys, contracts, discoveries and consequences. Its quiet stretches should make the violent stretches more exciting.

## What is off, and what should replace it

### 1. A hostile count is being mistaken for pressure

**Observed:** In the fresh Ricochet Runner / Ricochet Foundry run, seed 4242, ten enemies were alive at launch. After twenty simulation seconds without player input, the player still had 260 hull and 240 shield, with all ten enemies alive. After roughly another twenty-five seconds of automated aiming, firing and repeated boost/trap inputs, the round had four of its fifteen enemies remaining; hull and shield were again full. These are checkpoint values, not proof that no damage occurred between them, and this single run is not a universal balance verdict. They do show how little urgency the opening can communicate.

Earlier passes exposed several separate pursuit failures: retreat orders, Adventure jurisdiction, ineffective obstacle avoidance, attack permission shorter than gun range, and squad allocation reserving most of the pack. Those were addressed. The remaining product question is whether the assembled pack actually creates the chase.

**Direction:** Author the relationship between player speed, pursuing speed, turn commitment, approach distance, firing opportunities and cover. Common swarmers should form an intelligible pursuing mass. A smaller number of flankers should change its shape. Specialists should create decisions. Ordinary enemies should navigate usable lanes; a player's shove, web or bait should be what defeats that navigation.

Boost must earn separation. Separation should buy time to set up the next move; it should not routinely leave the rest of the round somewhere off-screen. Avoid both a harmless procession and instant surrounding fire from every bearing. Increase density only where it becomes visible, useful pressure. Thirty well-composed enemies can feel larger than a hundred unrelated dots.

Relevant seams: [wave materialization](../../src/systems/waveMaterialization.js), [Swarm curve](../../src/data/swarmMode.js), [tactical AI](../../src/systems/tacticalAI.js), [squad behavior](../../src/ai/), [weapon firing](../../src/systems/weapons.js).

### 2. The environment is populated, but its tricks are insufficiently advertised

**Observed:** The sampled opening was dominated by dark open space, large rocks near the frame edges, bright galaxy imagery and a ringed planet. I could identify scenery more quickly than a promising bank surface, chase corridor or trap pocket. Earlier passes also found physical rocks whose render meshes had not been admitted; that particular visibility failure received a fix.

**Code:** The Swarm field maintains rocks around the moving fight. That supplies material, but a rock-count target and minimum separation do not guarantee a memorable route. Spawn bearings and the surrounding terrain must work together.

**Direction:** Design small sequences of opportunities: a broad gathering lane leading to a risky gap, a bank wall overlooking that gap, a pocket where a blast can hit several surfaces, and a second route that lets the player recover or reverse the chase. Give arenas landmarks a player can name and revisit. Procedural variation should rearrange useful relationships, not merely scatter objects.

Use form and material to communicate function: angled hard plates for banks, heavy anchor structures for swings, loose lighter debris for throwing, machinery whose motion predicts an opening. A familiar local circuit makes repeated rounds more strategic as wreckage, traps and enemy types change it. Preserve enough open water to accelerate and enough structure to make direction matter.

Relevant seams: [Swarm arena](../../src/systems/swarmArena.js), [arena installation](../../src/systems/survivalArena.js), [arena toys](../../src/data/arenaModuleLibrary.js), [arena catalog](../../src/data/survivalArenas.js).

### 3. The weapon trigger undermines deliberate combinations

**Code:** `_serviceShip` services every mounted gun from the same firing input. Web Weaver mounts Pulse, Snarl and Concussion together. Holding the main trigger therefore fires the setup, damage and displacement tools according to their cooldowns. The player has less control over whether a target is bound before it is shoved or killed. This is a design conflict even when every weapon functions correctly.

**Direction:** Keep a wonderful sustained primary battery. Give the chosen setup or displacement weapon a deliberate secondary action. Keep dropping and triggering a trap quick and reachable. Keep the Massline as a coherent signature instrument. Allow players who enjoy a linked battery to group guns together, but do not make automatic simultaneous fire the only way to use a mixed physical build.

A Web Weaver should be able to bind without immediately destroying its own material. A gunner should be able to hold down a glorious stream without manually cycling three similar guns. A trap specialist should time the payoff while continuing to fly and shoot. Build identity should change what the hands do and what opportunities the eyes seek.

Relevant seams: [weapon service](../../src/systems/weapons.js), [starter packages](../../src/data/combatLabSetups.js), [input](../../src/systems/input.js).

### 4. Flight has depth, but the immediate control vocabulary is crowded

**Code:** Default Pilot preserves independent mouse aim, which is right for this game. Its A/D behavior changes from yaw while coasting to strafe with partial yaw while thrusting. Q/E also strafe. S reverses/brakes; a separate zero-thrust brake is on 0. Shift combines held boost with a release-triggered tap dash. The visible power rail then adds Y, R, Space and 4–8.

These choices are not individually indefensible. Together they ask a newcomer to learn several overlapping movement and power conventions while interpreting a busy field. Space parkour requires trust in the next input more than it requires another maneuver.

**Direction:** Decide the simplest complete arcade control set as one design. Keep independent aim and responsive movement. Make brake-turn-reaccelerate and boost-through-gap understandable without consulting a control chart. Preserve existing schemes and rebindings for established players; any revised default needs an explicit, compatible migration. Teach the few active tools of the selected build in context. Put optional advanced manipulation behind the same instrument's coherent hold/release behavior or player-chosen bindings, rather than exposing every subsystem as a permanent key.

Do not solve this by globally increasing speed. A faster ship crossing an unreadable screen is less controllable, not more exciting. Handling, camera composition, trail continuity and useful terrain distances need to be tuned together.

### 5. The physics needs to be a visible sequence, not an invisible calculation

**Established:** Real enemy-to-enemy Snarl attachments now exist; prior input passes created links and the renderer instantiated cable segments. Repulsion traps use actual forces and contacts. Collateral chains preserve causality. This is valuable groundwork.

**Still missing from demonstrated quality:** A reliably readable moment of several enemies fighting their shared web, followed by a player-timed launch and an unmistakable chain reaction. The current Snarl implementation connects up to three links per hit, with a twelve-link active bound, a 120-unit candidate radius and nine-second lifetime. That is a short chain implementation. It should not be described as completion of every Snarl/Capstan hub, winding, defensive-web and bomb-web idea in the physical-play plans.

**Direction:** Make the sequence legible: catch, slack taking up, opposing thrust, tension, displacement, collision, breakage. After a committed hit, light enemies need enough loss of steering authority for momentum to remain consequential; they should not instantly pilot out of the effect. Heavy hulls should visibly resist through mass and become useful anchors. Avoid unbounded stun locks on the player.

Expansion worth keeping: a winding web hub, a web-triggered bomb, captured hulls used as temporary moving cover, and a recoil/repulsion escape build. Build these as different uses of the shared physical rules. Do not manufacture identical explosions with different names or call a slow debuff a web.

Relevant seams: [Snarl](../../src/combat/tetherWebs.js), [attachments](../../src/combat/attachments.js), [impulse kernel](../../src/combat/impulseKernel.js), [charges](../../src/systems/impulseCharges.js), [physical-play grammar](../PHYSICAL_PLAY_GRAMMAR.md).

### 6. The visual hierarchy gives too much authority to scenery and labels

**Observed:** In the fresh desktop-size frames, galaxy imagery and a ringed planet were more conspicuous than many enemies. The player could cross that imagery and lose silhouette contrast. Fine enemy shapes, large textured rocks, broad luminous background forms and compact UI instruments did not read as one deliberately composed combat scene. The final sampled frame had four hostiles left, but no obvious pursuing pack in the main field; edge markers and radar carried much of that information.

The issue is not that space must be visually empty or that bright effects are wrong. The owner explicitly wants beauty and luminous excess. It is a question of where that richness belongs during a fight.

**Direction:** Give the combat plane a clear priority: player and immediate danger; useful terrain and trapped bodies; reward motion; distant spectacle. Author enemy silhouettes and their motion at the actual gameplay camera. Common swarmers should read as a moving flock; specialists should remain recognizable inside it. Keep large-scale beauty, but establish its depth and keep its strongest contrast away from the player's decision area.

Spend visual energy on the causal event: a narrow bright projectile history, a sharp directional hull contact, a visible ricochet angle, a tether pulling taut, a body tumbling along its trajectory, a fracture and recoil at the impact surface. Damage numbers should confirm the impact and distinguish a big slam from ordinary chip damage. They should not be asked to supply all the excitement. Preserve reduced-flash and reduced-motion equivalents.

Camera movement should help a player see the escape route and the pursuit they are arranging. Do not zoom so far out that hull identity disappears, or swing focus so enthusiastically that the player loses a planned gap. Test the complete composition while firing and turning, not just a centered beauty shot.

Relevant seams: [camera](../../src/render/camera.js), [VFX](../../src/render/vfx.js), [web rendering](../../src/render/combat/tetherWebFx.js), [combat HUD](../../src/ui/survivalHud.js).

### 7. The HUD still speaks for several different games at once

**Observed in the fresh run:**

- The opening announced **“Survive the minute”**, although the current Swarm rule is to defeat the finite cohort.
- A wreck rumor instructed the player to search an amber bearing ring and pulse scan.
- Flyby labels said “Break the beam”; a separate Massline label reported `Anchor · PICK/INTERCEPT · … · READY`.
- The power rail displayed Seed, Well, Repel, Cone and Skim alongside the selected kit's trap and Massline controls.
- The radar still contained a large amount of sector information.

The independent aim and smaller combat HUD were useful improvements. These surviving messages show that a compact layout alone cannot solve conflicting jobs. The old timed-wave instruction is an actual current copy defect in [survivalAnnounce](../../src/systems/survivalAnnounce.js), not a speculative taste objection. The rumor also has a concrete source in [uniqueWrecks](../../src/systems/uniqueWrecks.js).

**Direction:** Give Crucible a coherent presentation context across all message producers. During combat, show what can kill me, where my route is, what my fitted tools can do now, and how close the round is to ending. During shopping, explain what changes and what it costs. During results, explain the death and make retry obvious. Keep detailed help and build information available on request.

The [power rail model](../../src/ui/powerRail.js) derives several ready states from cooldowns rather than fitting ownership. Decide which tools are truly universal and which are earned/fitted instruments, then have the UI and input use that same answer. Do not present an undifferentiated shelf of every existing subsystem. Replace generic superlative combat commentary with concise, causal feedback; the physical aftermath should earn the player's excitement.

### 8. Cash rounds are right; the buying experience needs stronger build authorship

**Established:** Swarm now has finite rounds, a cash armory after each clear, saving, multi-buy, compatible fitting and explicit next-round launch. The preceding route pass exercised purchase, refit, wallet isolation and retry. This is the right structural move toward the owner's Zombies-like loop.

**Code:** The full armory is primarily a compatible catalog, categorized and sorted by price/name. Starter names also mix strong fantasies such as Ricochet Runner with test-like labels such as Baseline Energy. Access to equipment is not yet the same thing as an enticing series of decisions.

**Direction:** Keep the full catalog and stable prices. Add fast orientation: the player's current build, a few useful next transformations, and a visible saving target, with the full armory one action away. No forced random three-card lottery in place of the requested shopping freedom. Show the mount or tool being replaced and the resulting action before purchase. Make compatible favourites easy to find again.

Examples of desirable purchases: the bank shot returns through the pack; the web forks or winds; a rear charge gets a delayed second burst; a destroyed trapped hull ignites its neighbours; recoil becomes an escape tool. Straightforward damage, cooling and survival purchases still belong. Do not disguise every percentage adjustment as a new playstyle.

The first purchase should arrive while the opening experience is still fresh. Subsequent rounds should make saving for an outrageous toy tempting without making several intervening rounds feel unpaid. Reward collection should accompany the escape route: a legible burst and satisfying convergence toward the ship, not a cleanup chore that drains the momentum from a successful fight.

Relevant seams: [draft/shop UI](../../src/ui/screens/crucibleDraft.js), [draft owner](../../src/systems/survivalDraft.js), [rewards](../../src/systems/survivalRewards.js), [loot](../../src/systems/lootShards.js), [starter packages](../../src/data/combatLabSetups.js).

### 9. Round rhythm needs tension and relief, including a good ending

The finite round fix matters because clearing a board should mean something. But the last few enemies can still turn the end of a round into an off-screen hunt. A streaming population curve also risks treating a successful large clear as a vacancy to refill immediately. The current pressure reservoir gives breathing room for some clears, while an empty board has an immediate-refill exception if more quota remains.

**Direction:** Shape a round as gathering pressure, a problem to solve, a payoff, and renewed pressure or completion. Let a spectacular clear actually clear space. Telegraph the next arrival through motion and a visible approach. Keep the remaining cohort committed and locate stragglers clearly. Do not silently delete them or award a round before they are resolved.

Later difficulty should combine recognizable roles and force more dangerous routing, rather than just increasing health. Let a good build feel unfair for a while. Introduce counters that create new opportunities: a web cutter worth prioritizing, a heavy anchor you can displace, a flanker that makes you reverse the train. Avoid hard immunity that switches off the player's chosen toy.

Death should be frequent enough to make the distance record meaningful, with a cause the player can act on next time. Do not impose a universal death minute. Good players should survive by learning and inventing. Score can celebrate ingenuity; it must not manufacture the value of physics by declaring successful ordinary shooting inferior.

### 10. Startup cost fights the entire premise of a quick attempt

**Observed:** The fresh isolated browser pass took about 49 seconds from navigation to the menu, and about 105 seconds to enter active flight, including menu interaction and capture work. This is one local run, not a controlled hardware benchmark or a pure launch-duration measurement. It agrees with the preceding runs' substantial startup friction. The earlier Adventure playable check also timed out during preparation; the renderer still had an unresolved opening-submission validation error on the Crucible route.

**Direction:** Treat time to control and time to retry as gameplay. Reuse prepared assets and the shared renderer safely; reset run state without needlessly reconstructing already prepared resources. Keep the ordinary game path and actual physics. Prioritize first-use work, admission and frame pacing so the first shot and first explosion do not spoil the encounter. Do not satisfy a performance target by removing the authored visual identity.

The precise renderer cause remains unresolved. This report does not relabel it a harmless false positive. A screen that eventually becomes playable is not enough for a mode built around repeated short attempts.

Relevant seams: [launch](../../src/ui/crucibleLaunch.js), [main entry](../../src/main.js), [renderer](../../src/render/renderer.js), [pipeline readiness](../../src/render/pipelineReadiness.js).

### 11. The five arenas and bosses must change the player's ideas

The catalog and law systems exist. The prior route checks reached Gauntlet victory and Swarm extraction using scripted kills. Neither fact establishes the quality of every arena, build or boss. The fresh visual sample covered the Foundry opening only.

**Direction for the full retained scope:**

| Arena | The distinct pleasure to develop |
|---|---|
| Ricochet Foundry | Bank walls, closing machinery and scrap lanes turn a chase into a pinball collision. |
| Lagrange Crucible | Heavy anchors and gravity routes let the player build and spend orbital momentum, then release a pack across the room. |
| Cinder Sluice | Currents carry ships and debris; heat makes a delayed hazard the player can deliberately route enemies through. |
| Cryo Drift | Long slides and breakable cold structures reward anticipation, with thermal shock as a changed physical situation. |
| Storm Lattice | Conductive paths make positioning a way to route an attack through linked bodies and machinery. |

These are playfield and enemy-composition differences, not five filters over the same rock cloud. Each arena needs usable tricks for several builds, not one compulsory answer. Give bosses bodies and actions that change the room: an anchor to sling around, a sweep that rearranges cover, thrown debris, exposed equipment, a dangerous opening. Guns remain valid; physical tricks create additional routes to victory. Carry this through the authored thirty-wave arc, endless escalation, mutators, daily/weekly options and records without mistaking their menu reachability for their completion.

### 12. Adventure should make you earn reach and possibility

Yes: earning advanced toys in Adventure is the right relationship. The shared definitions already attach research and price requirements to Snarl and Repulsion Trap. That establishes an acquisition mechanism, not a proven satisfying acquisition journey.

**Direction:** Swarm teaches the player to want a toy. Adventure gives them a reason to seek it and a world in which to keep it. A contract, discovery, salvage opportunity, specialist seller or research goal should lead toward the desired instrument. Make the destination understandable: “I know what I want, and I have an interesting way to work toward it.” Do not require a fresh explanation of the same weapon or silently change its physical behavior between modes.

Basic competence must be present at the start: responsive flight, a satisfying gun, and an accessible way to interfere physically. Earn the winding web, extraordinary blast, specialized hull or elaborate rig; do not make the player earn the point at which the game first becomes enjoyable.

Adventure then supplies situations Swarm cannot: save a freighter by slinging its attacker away; use a cargo hauler as an unintended obstruction; escape a pursuit through working machinery; deal with the damaged shipment afterward. Patrols, trade and industry become meaningful because the player can disturb them. Keep beautiful travel and working quiet places. Do not make the whole universe permanently spawn a combat train, and do not turn every accident into an arbitrary prohibition on using the fun tools.

Relevant seams: [weapons](../../src/data/weapons.js), [modules](../../src/data/modules.js), [progression vision](../VISION.md), [physical-play acquisition](../PHYSICAL_PLAY_GRAMMAR.md), and the Adventure encounter/acquisition packets named in the master plan.

## Why the development drifted

This is a diagnosis of the artifacts and behavior, not a claim about the motives or ability of individual agents.

**Systems were completed more often than situations.** The repository can establish that a weapon emits an event, a constraint applies force, a wave advances and a reward is issued. The experience depends on those things happening at useful distances, in the right order, while remaining readable. That connecting work has repeatedly fallen between subsystem boundaries. My earlier pass was vulnerable to the same mistake.

**Adventure assumptions remained in the arena.** Sophisticated restraint, targeting and world-context systems can be reasonable elsewhere and still sabotage sustained pursuit. The fixes to law, retreat and target allocation are concrete examples. The remaining rumor, flyby, radar and timed-wave messages show that separating populations did not finish separating the player's tasks.

**Descriptions of the implementation acquired the force of design decisions.** The GDD explicitly records a control section rewritten to describe shipped behavior. The physical-play grammar calls an available number-key band the right number of rigs. Those are useful engineering facts, but neither establishes the most enjoyable control scheme. Existing bindings and saves deserve compatibility; they do not settle taste forever.

**Some diagnosis documents are stale in load-bearing ways.** The physical-play build plan still has a section titled “Swarm — blocked by fixed-size pools, not by AI or physics.” The recent AI failures directly contradict that certainty. An older `PQ-174.01` design memo prescribes timed completion and removing the kill quota; the September 10 direction and live finite-round implementation supersede it. The surviving “Survive the minute” announcement demonstrates how an old assumption can remain in the actual game.

**The process sometimes rewarded proxies for fun.** The Fun Convergence Loop prescribes a cross-product of benches and frame strips and includes “a fun run uses ≥ 4” verbs per minute. Those measurements can investigate a specific problem. As pass/fail design laws they can reward button use, continuous activity and evidence production instead of a good chase or a satisfying pause. A clean route check is valuable; a script that injects lethal hits cannot decide whether aiming, trapping or survival is enjoyable. The current route checker correctly states that limitation, and reports must respect it.

**Visual direction too often arrived after functional decisions.** HUD controls were made smaller and labels were fitted into available space, while the choice of what deserved that space remained unresolved. The frontend direction document already identifies this problem. The present setup screen is legible, but the impressive build and arena exist mostly in its explanatory sentences. It needs a compelling ship/build centerpiece and a concrete demonstration of the selected trick, with seed and advanced modes subordinate to starting a run.

## How to converge without another paperwork campaign

Work in the following order. These are playable outcomes, not new prerequisite audits. Keep existing useful checks; add a regression only for a real failure that needs one. Inspect representative play when it answers a design question. Do not capture a matrix merely because an older paragraph asks for it.

| Order | Deliver the player outcome | Existing work to reuse |
|---|---|---|
| 1. One convincing fight | A dependable primary, intentional physical secondary/trap, visible pursuing pack, a readable escape-and-payoff route, coherent HUD/messages, and usable frame pacing. Develop these together. | PQ-135/137/139/140/161/174/182; shared flight, weapons, physics, camera and arena systems. |
| 2. One compelling attempt | The fight ends cleanly, rewards feel immediate, the first purchase changes the next fight, later rounds create pressure, death explains itself, and retry returns promptly. | PQ-146/147/174/175/182; current cash-round and result/retry owners. |
| 3. Distinct ways to play | Gunner, bank-shot, web, trap, gravity and Massline builds each support a recognizable strategy and have meaningful evolutions. Preserve full shopping freedom. | PQ-028/029/030/031/133/137/147/175; physical-play grammar and shared catalog. |
| 4. The complete Crucible | Carry that standard through five physical arenas, specialist combinations, bosses, thirty-wave Gauntlet, endless Swarm, extraction, mutators and replay surfaces. | PQ-133/169/174/175 and the master plan's arena/boss/replay scope. |
| 5. Adventure inheritance | Earn the same advanced instruments through worthwhile goals and use them in living situations; preserve travel, beauty and world consequences. | PQ-141/142/152 and the relevant encounter, acquisition and economy seams. |

Stages 1 and 2 are the reference experience for the rest, not permission to declare the campaign done early. Presentation and performance belong inside those stages. They cannot wait until after all the content is built.

Useful expansion material also exists in the unmerged `origin/arcade-core-plans` branch: its kill economy, physics arsenal, combat pacing, enemy families and presentation ideas. This review sampled its index and core loop/arsenal/pacing documents; it did not review all sixty-two files. Reuse the relevant ideas selectively. Its industrial, market and broader world programs should not become prerequisites for a satisfying Crucible. Nor should its old fixed numerical bands or human-gate language displace the current owner direction.

For each meaningful change, answer one concrete question with actual play: **What can I now deliberately do, what happens because I did it, and is that enjoyable enough to try again?** A brief natural encounter often answers this better than dozens of staged screenshots. Use diagnostics when the answer is unclear, then return to making the experience work.

## Protect these choices

- Keep real momentum, mass, contacts, constraints and causal damage. Exaggeration should make those relationships readable and useful.
- Keep strong ordinary guns. Physics multiplies and redirects their value; it need not invalidate a gun-focused build.
- Keep independent aim, reliable player control, existing accessibility options and input compatibility.
- Keep the short Swarm economy and separate Adventure acquisition. Neither should give free progression to the other.
- Keep light enemies throwable, heavier enemies meaningfully resistant, and the player's established collision-damage immunity. Risk can come from enemies, trapping oneself and lost opportunities without punishing the parkour itself.
- Keep the full arena/build/boss/replay scope. Avoid adding more interchangeable content before its intended interaction works.
- Keep Adventure's quiet, beauty, livelihoods and consequences. The arena proves the physical verbs; the universe gives those verbs a larger meaning.

## Evidence boundaries and future updates

The fresh pass used the ordinary main-menu → Crucible → default Ricochet Runner → Foundry route at 1280 × 720 with seed 4242. It observed twenty simulation seconds with no input, then approximately twenty-five seconds of automated cursor aiming and ordinary trigger/boost/trap inputs. It did not inject kills or alter stats. The repeated charge inputs exhausted all six charges; the resulting empty-ammo messages are not evidence of a charge bug. The run was still in round one at the end. The browser was closed afterward; the existing Adventure save was not loaded or overwritten.

Earlier observations and implementation work in this same task provide the web/force and full-route context explicitly identified above. The current snapshot contains concurrent uncommitted changes, so a later implementation must inspect current code rather than treating these observations as timeless. No full human balance pass across all arenas or long Adventure progression was performed. Audio routing exists, but I did not listen to the live mix; its quality remains unassessed. The intended mix should make gun rhythm, bank contacts, web tension, heavy collisions and the reward stream distinguishable, with danger still audible under a chain reaction.

Selected local visual records: [setup](C:/Users/93rob/.codex/visualizations/2026/09/10/01a08b17-1849-7853-a821-244cba3999d5/postmortem-door.png), [opening](C:/Users/93rob/.codex/visualizations/2026/09/10/01a08b17-1849-7853-a821-244cba3999d5/postmortem-opening.png), [stationary opening](C:/Users/93rob/.codex/visualizations/2026/09/10/01a08b17-1849-7853-a821-244cba3999d5/postmortem-stationary.png), [after inputs](C:/Users/93rob/.codex/visualizations/2026/09/10/01a08b17-1849-7853-a821-244cba3999d5/postmortem-combat.png). These are local review artifacts, not committed capture requirements.

Primary plan sources: [owner vision](../VISION.md), [GDD](../GDD_2_0.md), [Crucible master plan](CRUCIBLE_SURVIVAL_MASTER_PLAN.md), [physical-play grammar](../PHYSICAL_PLAY_GRAMMAR.md), [physical-play build plan](../PHYSICAL_PLAY_BUILD_PLAN.md), [frontend direction](../FRONTEND_DIRECTION.md), [Fun Convergence Loop](../program/FUN_CONVERGENCE_LOOP.md), [older timed-wave memo](../program/roadmap/active/PQ-174.01-DESIGN-MEMO.md), and [plan registry](../PLAN_REGISTRY.md). Older review and vision-alignment documents were treated as leads, not current defect lists.

Keep this report cumulative by updating an existing finding when its player-visible problem changes. Mark what the player can now do and what remains, rather than appending another claim that the subsystem is implemented. Reopen a resolved finding only when new evidence changes the diagnosis.
