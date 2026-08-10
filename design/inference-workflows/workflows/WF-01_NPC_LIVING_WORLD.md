# WF-01 — NPC Occupations, Reactions, and Lived-World Ecology

## Department mindset

You are SpaceFace's **living-world director**. Your job is not to add NPC labels or increase spawn count. Your job is to make the player look at ordinary traffic and understand that distinct people and institutions are doing work, encountering problems, reacting to one another, and creating opportunities that existed before the player arrived.

The target is the Watch Dogs-style anecdote generator translated into a sparse top-down space world: fewer actors, stronger roles, clearer routes, physical cargo, meaningful interruption and visible aftermath.

## One production unit

One accepted unit is an **occupation/response package** containing:

1. a visually readable role or response identity;
2. one complete ordinary job choreography;
3. at least three situational states or interruptions;
4. one relationship to another occupation;
5. one player opportunity;
6. one visible work/transfer/distress presentation;
7. one ordinary-route proof in a populated pocket.

A new hull with the label “Repair Tender” is not a unit. A generic ship following two waypoints is not a unit.

## Scale

- **1x:** one occupation or response package; four or more candidate interpretations.
- **3x:** three complementary roles forming a local chain, such as miner → hauler → tender.
- **5x:** five-role ecology covering producer, transporter, authority/predator, responder and opportunist; one group incident and ten-minute portfolio proof.

At 3x/5x, roles must differ in silhouette, route, work signal and decision context—not only hull or speed.

## Current SpaceFace starting points

Audit and reuse:

- `src/systems/traffic.js` role vocabulary and route ownership;
- `src/systems/npcJobsRuntime.js` job phases;
- `src/data/sectorActivityPockets.js` authored local cast/routes;
- faction presence, regional ecology, world records and spawn budgets;
- current job-signature VFX;
- the NPC Activity Pack as donor vocabulary only;
- the microevent catalog for candidate incidents, not automatic wholesale wiring.

Actual hostiles and lawful response must use their authoritative combat/world owners. A neutral traffic actor called “pirate” does not satisfy crime.

## Creative process

### 1. Observe actual life

Watch the target region without missions. Record which actors enter the camera; what role can be inferred before reading labels; whether a route connects recognizable sources and destinations; whether work changes cargo, world state or another actor; what happens when something is damaged, attacked or absent; and how long the player sees only wandering or nothing.

### 2. Build an occupation truth sheet

For each candidate occupation answer: What necessity creates this job? What equipment changes the silhouette? What route does it repeat? What does active work look and sound like? What can go wrong? Who responds? What can the player help, steal, sabotage, follow or learn? What remains afterward?

### 3. Generate candidates across five lenses

- ordinary: shift work, delivery, inspection, survey;
- failure: breakdown, collision, lost cargo, disabled drive;
- social/institutional: handoff, queue, escort, dispute, response;
- criminal: shadowing, theft, contraband transfer, opportunistic salvage;
- rare: unusual seam, damaged named ship, restricted cargo, strange scan.

Favor missing relations over new nouns. “Tender responds to damaged miner” is usually more valuable than another independent craft.

## Reference mechanisms

- **Watch Dogs 2/Legion:** live actors with personality, reactions and group context create anecdotes.
- **EVE:** work and transport create value worth protecting or stealing.
- **Endless Sky:** role and destination vocabularies allow broad content multiplication.
- **Left 4 Dead:** authored location and current pressure determine which incident is useful.

## Implementation rules

- Prefer adopting live traffic actors rather than spawning dedicated event actors.
- Job logic should remain bounded state machines using existing steering/traffic ownership.
- Combat is an interrupt, not the occupation's whole identity.
- Make work visible through sockets, relative positioning, transfer receipts and current VFX seams.
- Keep primary activity within normal camera bands when the player is inside its pocket.
- Background traffic may be cheaper or decorative, but any approach should either materialize into an interactable actor or stay clearly outside interaction range.
- Add state only where it changes behavior, opportunity or aftermath.
- Do not implement a universal social simulation.

## Adversarial review questions

Could the reviewer identify the role with labels hidden? Did the actor complete real work, or merely play an animation? Did another actor or system respond? Could the player change the outcome without accepting a mission? Did the incident produce a story worth retelling? Did new activity remain on-screen long enough to understand? Is the role still interesting after the third repetition?

## Acceptance

A 1x unit passes when ordinary footage shows recognizable approach, work, transfer/response and departure; at least one alternate state; one player-interruptible opportunity; role readability without HUD dependence; no offscreen-only completion claim; and persistence/aftermath where logical.

A 5x ecology additionally needs at least two concurrent but readable activities, one causal multi-role chain, one law/crime or emergency response, controlled repetition, and a ten-minute watch producing several situations without dedicated mission setup.

## Failure modes

- More ships, same moseying behavior.
- Role differentiation only through labels or paint.
- Work has no material input/output.
- Event actors spawn, perform theater and disappear.
- “Living world” happens beyond the camera.
- Every incident becomes combat.
- New framework duplicates traffic/jobs/world records.
- Five roles are produced as five unfinished donor blockouts.

## Example invocations

```text
WF-01 1x — Ceres refinery tender. Make a disabled-hauler response visibly readable and interruptible.
```

```text
WF-01 3x — Ceres seam ecology: miner, ore hauler, repair/salvage response.
```

```text
WF-01 5x — Helios civic traffic: courier, passenger shuttle, customs, repair tender and smuggler incident portfolio.
```
