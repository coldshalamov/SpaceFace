# SpaceFace Team Mindset and North Star

This is the minimum creative context a fresh agent must internalize before producing anything for SpaceFace.

## The game in one sentence

**A fast, colorful, physics-driven space sandbox — played top-down — where you personally manipulate ships, momentum, tethers, gravity, cargo, and terrain inside a working universe that remembers what you did.**

The full fantasy, in the owner's own words, is [`design/VISION.md`](../VISION.md) — *The Fun, the Fantasy, and the UVP*. Read it before producing anything creative; where any other document's emphasis differs, VISION.md wins.

## Where the influences stop

Endless Sky and Freelancer contribute **depth**: routes, factions, economy, progression, contracts, one persistent save, a universe that was busy before the player arrived. They contribute *nothing else*. Not their muted palettes. Not their stately trade-fire-until-an-HP-bar-empties combat. The moment-to-moment feel of SpaceFace is an arcade game's — fast, kinetic, physically slapstick, addictive in the moment — and misreading "Freelancer influence" as dreary graphics or dogfight pacing is the single most common way agents have gotten this game wrong.

## What is cool about the intended game

SpaceFace is not compelling because it has a long feature list. It is compelling because a small physical vocabulary can connect almost everything:

- thrust and inertia;
- boost and exceptional speed;
- Massline attachment, reel, pay-out, orbit, release, tow, throw, and hitchhiking;
- weapon impulse, attraction, repulsion, tumble, collision, and atmosphere;
- solid terrain and huge celestial or industrial anchors;
- cargo and ships moving through visible economic routes;
- crime emerging from those routes;
- mining and automation producing tools and infrastructure;
- a world that remembers damage, construction, salvage, ownership, and changing traffic.

The player should be able to say:

> “I was going to deliver ore, saw a hauler under inspection, hitched onto a fast liner, cut loose near a cargo launch, stole a pod, used a Mass Seed to bunch the pursuing skiffs, blasted one into an asteroid, and escaped by slinging around the refinery moon.”

That anecdote is a better product target than a checklist containing “cargo,” “crime,” “gravity,” and “NPC jobs.”

## The five experience pillars

### 1. Momentum is the toy

Movement, Massline, impulse, fields, collision, and terrain should be satisfying before reward screens matter. The computer may remove meaningless keyboard precision when intent is obvious, but must not take over the ship or replace a simple physical action with a mysterious controller.

Depth should come from combinations of understandable laws, not an accumulation of modes and keybinds.

### 2. The universe was here before the player

Traffic flies routes for reasons. Miners work seams. Haulers collect material. Tenders respond to damage. Patrols inspect and intervene. Scavengers exploit aftermath. Construction traffic changes a site. The player may help, rob, follow, ignore, or escalate these activities.

A label saying “miner” is not life. A complete visible work cycle with interruptions and consequences is life.

### 3. Readability is a top-down superpower

Silhouette, color, motion, lights, routes, effects, and spatial composition should make roles, threats, physical forces, and opportunities legible at the normal camera.

Do not hide the game in tiny text, radar-only actors, remote simulation, or identical models with different names.

### 4. Industry becomes authorship

Mining is not only a money faucet. Manual extraction should lead to machines, logistics, tools, stations, gravity infrastructure, defense, and new routes. The late game should visibly bear the player's history.

The economy exists to buy agency, scale, information, access, and transformation—not merely a gun that reduces the number of identical shots needed. Progression should make the player ask "what can I do now?", never "did my damage number grow?" — and the ship should accumulate scars, weird fittings, and recognition until it is *my fucking ship*, not an inventory item.

### 5. Combat is delightfully abusive

SpaceFace is not trying to produce symmetrical honorable dogfights. The player should become extremely physically dangerous in ways they earned. **Light enemies are almost ammunition** — shoved, spun, chained, clustered, slammed into terrain, thrown into each other, dragged into fields, scattered through cargo traffic. Medium enemies require commitment; heavies become moving terrain; specialists disrupt the player's plan. Challenge comes from positioning, numbers, collateral, geometry, law, commitment, and terrible trajectories — never from making every enemy absorb thirty seconds of damage.

Kills and interference pay out **visibly and immediately in-world** — spilled cargo, salvage, and glowing reward pickups the player flies through (XP, currency, and sellable items are one reward fountain; they differ in what they buy, not how they feel to collect). And failure mutates the situation instead of ending it: salvage, restitution, escape, recovery, WANTED. The target feelings, per VISION.md: *"Holy shit, I did that"* — and occasionally *"Oh fuck, I did that."* Both are good.

## The visual personality

The intended look is **bright, kinetic, colorful arcade-industrial science fiction**.

- Deep space remains the darkest value.
- World geometry uses believable but varied industrial materials.
- Ships retain strong paint, silhouette, faction, and occupational identity.
- Engines and working machinery are bright.
- Massline, force fields, weapons, impacts, and destruction are brightest.
- Motion, trails, debris, shock shapes, camera opening, and aftermath sell physics.
- Quiet regions may be beautiful and sparse, but active regions must not collapse into charcoal, navy, brown, and timid bloom.

Avoid:

- muted freelancer-portfolio sci-fi;
- primitive stacks with a uniform bevel;
- flat clay/plastic materials;
- cyan strips as universal identity;
- translucent spheres and tubes as universal VFX;
- tiny tasteful effects that disappear at gameplay scale;
- density represented only through icons.

## The “simple physical rule” doctrine

Before adding a new system, ask:

1. Can the intended result emerge from an existing physical rule plus better composition or feedback?
2. Is the difficulty interesting, or merely a limitation of digital controls?
3. Would a bounded assist fix the motor problem without automating strategy?
4. Does the new rule create at least two useful combinations with existing systems?
5. Can the player understand it by watching the world?

The default Massline orbit example is canonical: the rope, thrust, boost, and turning already exist. The useful assistance is to synchronize yaw with the actual angular motion when the player's intention is unambiguous—not to slow the ship, regulate every force, or establish an underwater autopilot.

## The “more, better, closer” test

### More

The player encounters additional distinct people, objects, situations, routes, states, tactics, or discoveries.

### Better

The relevant content becomes more readable, polished, responsive, beautiful, coherent, performant, and satisfying than its baseline.

### Closer

The result reinforces the game's actual identity:

- physical improvisation;
- delightfully abusive arcade combat with visible in-world payout;
- living logistics;
- opportunistic crime;
- failure that mutates situations instead of ending them;
- industrial escalation;
- bright kinetic presentation;
- one persistent open-world save.

A technically sophisticated addition can be farther from the intended game. “Closer” is not measured in code volume.

## Player-facing truth outranks implementation narrative

Agents naturally want credit for difficulty, architecture, tests, and files. The player sees none of those.

A production unit is judged from:

- ordinary controls;
- normal camera;
- current route;
- current assets;
- actual timing;
- actual performance;
- actual save/load;
- actual visual and mechanical consequence.

An isolated viewer, injected state, feature flag, screenshot, data catalog, shader demo, or narrow test may diagnose or support work. None proves that the game improved.

## The expected attitude of a SpaceFace developer

Be ambitious about the experience and conservative about architecture.

Be imaginative during divergence and ruthless during selection.

Prefer one deeply realized, reusable pattern over five technically complete placeholders.

When a unit succeeds, multiply it. When it fails twice for the same fundamental reason, cut or re-author it.

Do not protect sunk cost from the player.
