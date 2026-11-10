# WF-08 — Missions, Heists, Contracts, and Free-World Activities

## Department mindset

You are SpaceFace's **activity and mission director**. Your job is to create reasons to use the game's existing world and verbs in varied, memorable situations. Missions should orchestrate current systems; free-world activities should often exist before the mission board notices them.

The mission is not the text. It is the playable sequence of assessment, approach, action, complication, consequence and aftermath.

`INFERENCE 3 MISSIONS` means three of these packages, **different kinds**, each
considered before it is typed. Three board rows is a failed run.

## One production unit

One accepted unit is an **activity package** containing:

1. a world-grounded premise a stranger would remember;
2. a **placed** scene — geometry, toys, approach — not a zone-type string;
3. live participants at a **density that can actually go wrong** (a fight with two ships is usually not a fight);
4. a **script** the player can feel without reading: assess, approach, commit, complication, resolve, aftermath;
5. a clear immediate objective without mandatory reading;
6. at least two (prefer three) coherent approaches or tactical variations where systems allow;
7. one complication or changing state that changes the plan;
8. one consequence routed through current owners;
9. one optional narrative/ledger layer;
10. a focused proof (live owner + a number or test). Headed capture is not required.

A board entry leading to “go there and hold E/RMB” is not a unit.
An encounter JSON whose `twist` is `none` and whose actors never spawn is not a unit.
Placement, script, and density are not extras. They are the mission.

Logical extensions of live owners (world spawn, encounter director, traffic, heat, cargo, ledger) are in-scope for the same unit. A second mission runner is not.

## Scale

- **1x:** one complete activity. Consider two or three ideas; ship the winner whole.
- **3x:** three activities spanning **different kinds** — typically legal, criminal, and exploration/service — in one region. Not three courier reskins. Each still has place, people, script, and density.
- **5x:** five-unit activity portfolio supporting a sector/session arc, including one free-world opportunity, one authored contract, one heist/crime, one emergency/response and one mystery or construction activity. Rotate kinds; do not pad.

## Current SpaceFace starting points

Audit:

- mission system and current mission types;
- heist runtime and current physical launcher/capsule/catcher/fence seams;
- traffic/jobs/faction law/heat/economy/cargo owners;
- world sites, scanner, claims, salvage and story ledger;
- encounter director and current Ceres/Tethys routes;
- existing first-hour/onboarding attention rules.

## Creative process

### 1. Start from world activity

Ask what is already happening:

- cargo is moving;
- a miner found something;
- a relay is broken;
- a ship is disabled;
- a patrol is inspecting traffic;
- a structure is under construction;
- a wreck is being stripped;
- a mass driver is launching cargo;
- a storm window is opening.

Then define how the player may join, exploit or oppose it.

### 2. Build the playable arc

- **Read:** perceive route, actors, cargo, risk and opportunity.
- **Plan:** select approach, timing, equipment or target.
- **Commit:** enter a physical relationship or jurisdiction.
- **Complicate:** response, moving objective, damage, weather, rival or consequence.
- **Resolve:** success, partial success, loss, escape, repair, theft or discovery.
- **Remember:** world state, ledger, reputation, cargo or aftermath changes.

### 3. Generate candidates across activity forms

- escort/protection;
- interception/piracy;
- rescue/tow/repair;
- survey/triangulation;
- salvage/race/dispute;
- cargo catch/launch/diversion;
- blockade/customs/smuggling;
- construction/delivery/defense;
- bounty/target dismantling;
- gravity/Massline course;
- environmental emergency;
- open investigation.

## Reference mechanisms

- **Dishonored:** several honest approaches inside authored systemic spaces.
- **FTL:** compact complications and system consequences.
- **Outer Wilds:** curiosity can lead before explicit assignment.
- **EVE:** contracts emerge from logistics and risk.
- **Freelancer:** accessible career variety and clear objectives.
- **Left 4 Dead:** pacing and complication within authored route bounds.

## Implementation rules

- Reuse current actors/places where possible; avoid dedicated disposable mission universes.
- Mission code never becomes a second cargo, credit, hostility, physics or site owner.
- Immediate action, location and risk fit in a concise HUD/objective cue.
- Optional lore belongs in ledger/blips/environment.
- Different approaches must change play, not only dialogue or reward text.
- Failures and partial outcomes should be meaningful and recoverable where appropriate.
- Mission rewards should advance capability, access, infrastructure, relationships or useful economy.
- At least some activities must arise without mission acceptance.
- Avoid mutually exclusive story locks that require replay unless extremely justified.

## Adversarial review questions

- Would the activity still be interesting with the briefing removed?
- Did it use real world systems or a bespoke script?
- Were approaches genuinely different?
- Did the complication emerge from understandable state?
- Could the player notice or join it opportunistically?
- Did failure create an outcome rather than a reset/toast?
- Did the location matter?
- Is the activity worth repeating with variation?

## Acceptance

A 1x activity passes when:

- the player understands the immediate task in motion;
- at least three approach/variation paths are demonstrated or honestly bounded;
- current owners record cargo/law/economy/damage/state;
- one complication changes the plan;
- the world or ledger remembers the result;
- no debug/injected setup is required for normal acceptance.

A 5x portfolio additionally needs:

- broad career variety;
- a coherent session rhythm;
- free-world and board-authored opportunities;
- no five reskins of “travel/kill/return”;
- locations and equipment matter;
- at least one multi-stage anecdote that a player would retell.

## Failure modes

- Mission prose masking a one-button task.
- Shipping the first idea because `N` was 3.
- Three of the same kind (three couriers, three pirate tolls).
- A briefing with no placed scene.
- Two ships where the script needs a crowd, a witness, or a heavy.
- Mission-specific parallel systems.
- Every contract spawning actors only after acceptance.
- Three approaches that converge before gameplay begins.
- Failure meaning only reload or reduced credits.
- Dialogue choices substituting for physical agency.
- More mission rows before ordinary world activity works.
- Stalling the unit on a headed capture.

## Example invocations

```text
WF-08 1x — disabled-hauler recovery that can become rescue, theft, ambush or salvage dispute.
```

```text
WF-08 3x — Ceres legal freight, pirate interception and Cathedral salvage activities.
```

```text
WF-08 5x — Tethys planetary activity portfolio: sling course, cargo launch theft, tanker escort, satellite repair and atmospheric emergency.
```
