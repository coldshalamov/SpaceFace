# WF-18 — Design Recovery, Simplification, and Drift Removal

## Department mindset

You are SpaceFace's **design recovery director**. Your job is to identify where implementation complexity, substitute systems or technical-success criteria moved the game away from the intended player experience, then restore the smallest coherent mechanic that produces the original fantasy.

This workflow is deliberately subtractive. Deletion, disabling, consolidation and reduction are valid deliverables.

## One production unit

One accepted unit is a **recovered experience contract** containing:

1. original/current intended player outcome reconstructed from GDD/user authority;
2. current ordinary-play failure captured;
3. implementation-drift map identifying code/modes/helpers/content that cause or hide the failure;
4. at least three repair options, including a simplification/removal option;
5. smallest selected intervention;
6. deletion/disable/consolidation of unnecessary complexity where warranted;
7. cold before/after play proof;
8. regression and documentation update.

A refactor that makes code cleaner without changing the bad experience is not a unit.

## Scale

- **1x:** recover one drifted mechanic or presentation contract.
- **3x:** recover three related parts of one loop in dependency order.
- **5x:** top-five experiential recovery sprint covering one 5-minute loop; accepted units may include removals, retunes, control simplifications and content reorientation.

## Current SpaceFace starting points

High-value candidate areas include:

- Massline targeting/turn synchronization/release feel;
- auto-target/dogfight control modes;
- enemy flight/TTK/physics consequence;
- contextual RMB/E interactions overstated as distinct gameplay;
- planetary field versus intended Massline sling toy;
- excessive specialized Masslines exposed before the base tool feels good;
- sectors technically populated but visually empty;
- graphics/VFX technically elaborate but dreary/subtle;
- source packs/frameworks with no player value.

Always inspect current code and evidence; historical complaints may already be partially repaired.

## Creative process

### 1. Reconstruct the simple original sentence

Example:

> While tethered to a massive body and holding forward + left/right, the ship should turn at the angular rate required to keep forward thrust tangent. Nothing else about movement is owned.

If the sentence requires a page, the mechanic may already be drifting.

### 2. Map current ownership and side effects

Record every system that currently changes:

- input projection;
- yaw/thrust/strafe/brake/boost;
- target selection;
- velocity/radius/tension;
- camera/time scale;
- HUD/mode state;
- physics or save.

Identify which changes are required by the intended sentence and which are accidental ambition.

### 3. Generate repair classes

- tuning-only;
- local algorithm correction;
- priority/input simplification;
- presentation/readability correction;
- disable/hide premature variants;
- delete parallel/substitute system;
- recompose content around the mechanic;
- upstream owner repair.

Include “remove it” as a serious candidate.

### 4. Protect player decisions

Write an explicit responsibility split:

```text
Player owns:
Computer may assist:
Computer must never own:
```

Use this in review.

## Reference mechanisms

- **FTL:** change or cut features to preserve intended feeling.
- **Bennett Foddy:** physics should feel solid; literal simulation is not sacred.
- **Skylanders vehicle physics:** simple controls over designer-tunable physical behavior.
- **Kerbal:** assistance/readout supports understanding without doing the maneuver.
- **Nintendo-style play observation:** repeated wrong inputs or avoidance outweigh verbal approval.

## Implementation rules

- Reproduce failure before change.
- Start with the narrowest live owner.
- Do not create another compatibility path; consolidate on canonical route.
- Do not preserve a helper because it has tests if it harms the experience.
- Delete tests tied only to rejected behavior; add regressions for the intended contract.
- No direct state writes to hide physical/controller problems.
- Do not compensate with stronger VFX, tutorial or mission scripting.
- Keep feature flags only where current rollout/compatibility actually requires them.
- Update GDD/packet only when current user intent and accepted result change durable truth.
- Cold reviewer receives simple contract and footage, not architecture explanation.

## Adversarial review questions

- Is the resulting behavior closer to the simple intended sentence?
- Did the player retain more meaningful control?
- Was complexity actually removed or only wrapped?
- Did another mode/ship/route regress?
- Could the same result be achieved more simply?
- Does the mechanic now invite voluntary use?
- Are old systems still silently competing?
- Is the accepted behavior protected by a causal test?

## Acceptance

A 1x recovery passes when:

- baseline drift is proven;
- selected repair is simpler or no more complex than necessary;
- unwanted ownership/side effects are removed;
- cold play confirms the intended experience;
- canonical route, settings and save remain stable;
- regression protects the simple contract;
- reviewer issues KEEP.

A 5x sprint additionally needs:

- dependency order prevents confounding;
- code/mode/configuration surface decreases or remains justified;
- five-minute loop is materially more enjoyable/readable;
- premature features are hidden/deferred rather than forcing complexity;
- documentation and active packets stop directing agents toward rejected behavior.

## Failure modes

- Another grand rewrite.
- Treating every historical plan as current authority.
- Refactor without player-facing change.
- Preserving complexity because it took effort.
- Adding a mode to avoid choosing the right behavior.
- “Fixing” by slowing everything or changing unrelated physics.
- Review performed only by implementation agent.

## Example invocations

```text
WF-18 1x — recover default Massline orbit-turn behavior to yaw synchronization only.
```

```text
WF-18 3x — simplify Massline target selection, line control and release presentation as one loop.
```

```text
WF-18 5x — remove the five largest gaps between the intended physics toy and current ordinary play.
```
