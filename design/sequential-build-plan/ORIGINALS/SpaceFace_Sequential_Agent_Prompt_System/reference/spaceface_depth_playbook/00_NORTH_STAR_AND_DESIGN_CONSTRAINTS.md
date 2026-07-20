# 00 — Product North Star and Design Constraints

## 1. Product thesis

SpaceFace should become a **top-down, physics-forward space sandbox about turning motion, matter, and infrastructure into control**.

The player begins as one small ship with a few direct verbs:

- thrust and steer;
- aim and fire;
- attach and release a massline;
- scan;
- extract;
- carry.

The player does not merely improve the numerical efficiency of those verbs. Progress gradually lets the player:

- manipulate the motion of other bodies;
- exploit terrain, gravity, and hazards;
- build machinery inside asteroids;
- automate extraction and fabrication;
- create routes and moving traffic;
- assemble stations and orbital infrastructure;
- alter how sectors function;
- turn a sparse hostile frontier into a network that visibly exists because the player built it.

The arc is not “weak gun → stronger gun.” It is:

> **pilot → operator → engineer → network builder → regional power**

This is both the progression system and the story.

## 2. What the game should not become

The following systems are not forbidden forever, but they are poor default investments for the current game.

### 2.1 No general crew-management layer

Crew salaries, morale meters, food, shift schedules, and staff buffs would add accounting without adding a new embodied verb. Named people can matter as contacts, pilots, rivals, witnesses, or specialists without becoming a payroll simulator.

A crew feature should only be admitted if it creates a visible world action that cannot be achieved more cleanly another way—for example, a named salvager physically joining an operation—not because “space games have crew.”

### 2.2 No broad ammunition chore

Standard weapons should use heat, energy, cooldowns, positioning, or state. Consumable munitions are appropriate only where scarcity creates a deliberate strategic choice:

- torpedoes;
- impulse charges;
- rare physics ordnance;
- deployable gravity devices;
- siege weapons.

They should be manufactured or replenished in useful batches. The player should not have to visit a shop because ordinary bullets ran out after two encounters.

### 2.3 No maintenance whack-a-mole

A refinery without input may idle. A route without cargo may remain dormant. A damaged site may produce less until repaired. The default penalty for looking away should not be constant decay.

Use **events**, not hygiene:

- a convoy is attacked;
- a storm disrupts a relay;
- a high-signature site attracts a raid;
- an experimental machine faults;
- a route becomes politically contested.

Events create stories and decisions. Per-minute drains create chores.

### 2.4 No full-scale cutscene pipeline

Blender cinematics, character animation, lip sync, and orchestral scoring are production disciplines of their own. Static illustrated evidence, animated UI composition, camera moves over live scenes, and short in-engine tableaus offer far better return for autonomous agents.

### 2.5 No dialogue-choice maze

The player should not be forced to read paragraphs and select from three responses, nor should one click permanently delete half the content.

Story threads should be additive and discoverable. Player actions may alter context, order, rewards, and world state without locking the player out of whole arcs.

### 2.6 No fleets before the world earns them

Fleet command is not a substitute for a living world or competent navigation. A fleet multiplies AI defects and screen clutter. Build purposeful NPC jobs, stable movement controllers, and interesting physical battle spaces first.

### 2.7 No realistic N-body simulation as a prerequisite

A stylized gravity well that creates readable slingshots can be excellent. Full orbital mechanics, arbitrary moving frames, and physically scaled solar systems are unnecessary for the first useful version. Use one dominant gravity source, softened/capped acceleration, analytic satellite orbits, and trajectory previews.

## 3. The actual deficit: interaction bandwidth

The player’s present experience is dominated by a small set of low-information actions:

- `LMB`: repeated damage;
- `RMB`: repeated extraction;
- `F`: attach or detach;
- `E`: open a screen;
- movement: go closer or farther.

The answer is not necessarily twenty new buttons. The answer is to make the existing input vocabulary operate over richer states and physical targets.

A compact interaction grammar can support a large game:

| Primitive | Meaning |
|---|---|
| **Aim** | Select an entity or one of its components |
| **Tap** | Immediate action or mode change |
| **Hold** | Continuous work, charge, tracking, or stabilization |
| **Release** | Commit a stored trajectory, charge, or constraint |
| **Constraint** | Massline relationship between bodies |
| **Impulse** | Instant change in momentum |
| **Field** | Continuous force or condition within space |
| **Component state** | Intact, damaged, disabled, severed, repaired, active |
| **Placement** | Put a device, structure, anchor, or route node into the world |
| **Persistence** | The object or region remembers what happened |

The same right mouse button can perform distinct but coherent industrial-beam actions if the target is explicit and the presentation is honest:

- geological face → extract;
- brace → cut;
- damaged relay → weld;
- salvage joint → dismantle;
- sealed panel → heat and breach.

The input remains simple. The world acquires more verbs.

## 4. Design law: unlock verbs, not percentages

Every major progression tier should unlock at least one of these:

- a new way to move;
- a new way to alter another body’s motion;
- a new kind of target component;
- a new deployable;
- a new infrastructure operation;
- a new way to automate a previous manual task;
- a new way to alter a sector;
- a new way to discover hidden information.

Numerical upgrades can support these verbs, but they cannot be the payoff by themselves.

Bad progression:

- +12% laser damage;
- +15% mining speed;
- +10 cargo;
- +8% drone income.

Better progression:

- an impulse cannon that moves ships and debris;
- a survey suite that reveals component topology;
- a massline head that can attach to detachable modules;
- a gravity puck that bends projectiles;
- a shuttle dock that turns abstract exports into visible traffic;
- an acceleration ring that changes regional travel;
- a station assembly frame that makes an asteroid cluster become a new destination.

## 5. The combinatorial target

A useful mechanic should ideally interact with at least three existing systems.

Example: **detachable wreck reactor**

- scanner locates it;
- industrial beam cuts its braces;
- massline pulls it free;
- physics lets it collide or be thrown;
- cargo/site systems accept it as an input;
- ledger reveals its history;
- fabrication turns it into a unique machine.

That is one asset and one state machine producing many consequences.

A poor mechanic has one input and one output:

- hold button;
- wait;
- receive credits.

## 6. The “toy” test

A core mechanic deserves to be central only if a player can enjoy it without a mission reward.

Ask:

- Would the player experiment with this in an empty arena?
- Does it produce surprising but understandable outcomes?
- Can mastery improve the result?
- Does the environment change what is possible?
- Can two mechanics combine into a third behavior?
- Is failure interesting rather than merely slower?

The massline is currently the closest thing SpaceFace has to a toy. The next work should strengthen it and add neighboring toys—impulses, fields, component detachment, collision geometry, gravity—not bury it under more menus.

## 7. The “world exists without me” test

Every populated sector should display at least one causal loop that would continue if the player did nothing:

- miners extract;
- cargo moves to a refinery;
- couriers leave a station;
- patrols inspect a lane;
- pirates stalk high-value traffic;
- scavengers strip battle debris;
- construction drones assemble a frame;
- survey craft orbit an anomaly;
- satellites relay data;
- orbital launchers fire cargo capsules.

The player may observe, assist, protect, rob, redirect, or destroy these loops. The world is not decoration around the protagonist; the protagonist is an opportunist inside a running machine.

## 8. Sector identity law

A sector is not a list of object categories. It is a spatial proposition.

Every sector must have:

1. **one sentence of identity** that no other sector can claim;
2. **one dominant silhouette** visible before arrival;
3. **two to four separated activity pockets** rather than one central pile;
4. **at least one route** visibly connecting pockets;
5. **one local mechanical condition** that changes play;
6. **one persistent consequence** the player can cause.

Examples:

- “The customs gauntlet where every cargo route narrows through a scanning ring.”
- “The carrier graveyard whose drifting hull slabs form the battle terrain.”
- “The broken moon refinery that the player can restart and eventually own.”
- “The storm system where wrecks surface only during quiet windows.”
- “The construction frontier where a station visibly grows over the campaign.”

Not every sector needs every system. Deliberate absence is identity.

## 9. Story law

Story should be delivered in layers that do not block movement.

### Layer 1: flight fragments

Eight to twenty words, shown briefly when an event occurs.

> POWER RELAY 3 ANSWERS. THE OTHER TWO WERE CUT FROM INSIDE.

### Layer 2: physical evidence

A changed object, component, route, wreck, cargo manifest, black box, or NPC behavior.

### Layer 3: optional illustrated ledger

A page the player may open later: image, map, recovered record, and concise prose.

No response menu is required. No story thread must be deleted because the player clicked the “wrong” line.

## 10. Industry law

Asteroid Ops is not merely a source of passive credits. Its output should feed the exterior world.

The existing contact-ring and site-production thesis is strong:

- consuming geology now versus preserving it for long-term production;
- building machines into the shape the player excavated;
- aggregate logistics rather than item spam;
- production moving from manual to automated;
- station assembly as the visible exterior payoff.

Preserve that spine.

The industrial chain should create:

- construction modules;
- courier pods and shuttle drones;
- deployable physics tools;
- sensor and navigation infrastructure;
- defense devices;
- station components;
- orbital machines;
- specialized massline heads;
- rare ordnance;
- eventually ships and autonomous construction systems.

Credits remain useful, but matter should become capability.

## 11. Assists versus automation

Physics assists are acceptable when they translate an unambiguous human intention into actuator commands the player could theoretically perform.

Good assist:

- while tethered to a massive anchor, holding forward plus left clearly means “orbit left”; the controller manages yaw and a small radial correction while respecting thrust, line tension, and acceleration limits.

Bad assist:

- pressing left teleports the ship to the ideal orbital path or injects unexplained velocity.

The rule:

> **Shape input; do not script outcomes.**

A useful assist computes desired heading, thrust mix, or timing, then acts through the same force/torque pipeline as manual flight.

## 12. Scope discipline

The project should grow through vertical slices.

A vertical slice is not “the data definitions exist.” It includes:

- a player-visible object at correct scale;
- aligned collision or interaction geometry;
- normal-route reachability;
- at least one meaningful input;
- a persistent state change;
- save/load;
- presentation;
- telemetry;
- a current browser capture.

Build one excellent wreck before twelve wreck definitions. Build one sector that feels alive before expanding all twenty-four. Build one controllable convoy robbery before a faction-wide crime system.

## 13. Priority filter

Score each proposed feature on five axes from 0–3:

1. **New verb:** does it create a genuinely new action?
2. **Composability:** how many existing systems can use it?
3. **Visibility:** is it obvious in normal play?
4. **Agent feasibility:** can coding/image agents implement it with current tools?
5. **Foundation value:** does it unlock several future features?

Subtract:

6. **AI dependence:** does it rely on sophisticated autonomous behavior?
7. **UI burden:** does it require a new complex screen?
8. **content burden:** does it need large bespoke art/audio/cinematic production?
9. **systemic risk:** does it touch core physics, saves, and many owners at once?

The highest-value work tends to be:

- compound collision proxies;
- component targeting;
- force/impulse kernels;
- simple NPC job routes;
- one top-down wreck field;
- orbit assistance;
- an impulse weapon;
- separated sector pockets;
- visible exterior consequences of Asteroid Ops.

## 14. Compact product north star

When uncertain, choose the change that makes this sentence more true:

> **I move through a galaxy that is already working, use momentum and machinery to intervene in it, and gradually build a physical network that changes what the galaxy can do.**
