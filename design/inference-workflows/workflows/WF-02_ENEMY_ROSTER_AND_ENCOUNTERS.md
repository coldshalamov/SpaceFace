# WF-02 — Enemy Roster, Combat Roles, and Encounter Ecology

## Department mindset

You are SpaceFace's **combat and enemy director**. Your job is to create enemies that change the player's decisions, exploit the physical world, combine into readable groups, and die or disengage with satisfying consequences. Do not confuse more HP, faster fire or a different hull with a new enemy.

SpaceFace's combat identity should emerge from momentum, force, position, Massline, fields, collision, cargo/objectives and terrain. Ordinary enemies should generally resolve quickly enough that physical manipulation matters.

Per [`design/VISION.md`](../../VISION.md): combat should feel **delightfully abusive**, not symmetrical or honorable. Light enemies are almost ammunition — shoved, spun, chained, slammed into terrain, thrown into each other. Challenge comes from positioning, numbers, collateral, geometry, and law, never from HP sponges. Kills pay out visibly in-world (spilled cargo, salvage, glowing reward pickups), and a botched fight should mutate into a new situation rather than a reload.

## One production unit

One accepted unit is an **enemy combat-role package** containing:

1. a readable role and silhouette/motion language;
2. one approach/telegraph/attack/recovery loop;
3. one physical relationship to force, mass, terrain or tether;
4. one weakness or counterplay;
5. one combination with at least one existing enemy role;
6. three encounter placements or conditions;
7. tuned TTK and reaction feedback;
8. normal-route combat proof.

A data row with damage, HP and speed differences is not a unit.

## Scale

- **1x:** one enemy role with at least four candidates and three encounter proofs.
- **3x:** three-role mini-ecology: pressure, control/support and payoff/heavy.
- **5x:** five-role combat portfolio across at least three mass/behavior classes, with swarm, elite and environmental encounter compositions.

A 5x portfolio should contain contrast such as expendable swarmer, ranged lane-controller, displacement/tether threat, heavy anchor/brawler, and elite/commander.

## Current SpaceFace starting points

Audit live SG-06 tactical AI and maneuver owners, encounter director and reinforcement packages, enemy archetypes/combat definitions, weapon impulse/tumble/status/subsystem behavior, engagement authority, collision consequences, Massline counterplay and Physics-as-Spectacle presentation. Do not rewrite the tactical stack to produce one role.

## Creative process

### 1. Diagnose current combat

Measure ordinary/elite TTK, time spent holding fire without a decision, enemy time on-screen, how often terrain/force matters, role recognition, group formation/priority decisions, leader/support consequences, and how quickly displaced enemies return.

### 2. Design from the decision backward

Start with the decision the role should force: break formation or remove controller; push into terrain or spend damage; cut tether/destroy anchor/ride constraint; protect cargo while displaced; scatter swarm or cluster for payoff.

Then design movement, weapon, mass and visual telegraph to serve that decision.

### 3. Candidate lenses

- pressure: close pursuit, swarm, ramming;
- space control: mines, drag, repulsion, lanes, suppressive fire;
- force interaction: light throwable target, anchor-heavy target, tether cutter;
- support: shield/repair/mark/command, visible and killable;
- objective threat: cargo thief, miner hunter, structure saboteur;
- escape/morale: breaks, dumps cargo, calls reinforcements, scatters after leader loss;
- environment specialist: atmosphere, asteroid cover, gravity or wreck corridors.

## Reference mechanisms

- **DOOM:** fast resolution, strong role clarity and forward movement.
- **Left 4 Dead:** small role set combining into variable pressure.
- **Into the Breach:** displacement and future consequence as tactics.
- **Dishonored:** encounter geometry and systemic verbs create multiple approaches.
- **Vessel:** AI acting through the same physics as the player.

## Implementation rules

- Use existing maneuver kinds before inventing new steering architecture.
- Turn before burn, respect speed envelopes and keep actors in readable space.
- Enemy attacks need anticipation, action and recovery.
- Physical response must be visually significant and mechanically consequential.
- Light enemies should tumble, collide and die readily; heavy enemies need setup rather than enormous HP alone.
- Use encounter geometry: solid asteroids, wreck ribs, cargo, atmosphere, fields, routes and civilians.
- A support role must change group behavior and expose a priority target.
- A role needs at least one situation where it is weak or suboptimal.
- Difficulty should scale composition, timing, tactics and role combinations before HP inflation.

## Adversarial review questions

Could the reviewer identify role and threat within three seconds? Did it force a different decision? Did force/terrain/tether matter? Did it remain in playable space? Was counterplay discoverable? Did it become annoying through control denial or durability? Did the group produce an anecdote rather than a hairball?

## Acceptance

A 1x unit passes only when role telegraph and attack loop are clear at normal zoom; TTK/reaction fit its class; at least one physical tactic is viable; three encounter contexts reveal its role; counterplay is readable; and it works through normal play.

A 5x portfolio additionally requires no universal dominant kill strategy; ordinary enemies resolve quickly; at least three successful play styles; environmental kills/group manipulation; role combinations changing rhythm; and director composition without bespoke scripts for every fight.

## Failure modes

- Five variants of the same chase-and-shoot behavior.
- HP as the main difficulty lever.
- Enemy powers ignoring physical rules.
- Constant boost and offscreen drive-bys.
- Crowd control that removes agency rather than creating decisions.
- “Physics enemy” that only has a knockback status icon.
- Boss built before ordinary combat is fun.

## Example invocations

```text
WF-02 1x — expendable Ceres raider skiff that can be concussed into terrain and panics after leader loss.
```

```text
WF-02 3x — swarmer, drag-field controller and heavy anchor brawler for the Throughline.
```

```text
WF-02 5x — Tethys gravity-combat ecology with atmospheric and convoy encounter proofs.
```
