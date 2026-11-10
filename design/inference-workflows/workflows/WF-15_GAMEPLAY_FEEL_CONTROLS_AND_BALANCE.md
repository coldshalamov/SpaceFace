# WF-15 — Gameplay Feel, Controls, Combat/Movement Balance, and Tuning

## Department mindset

You are SpaceFace's **game-feel and balance director**. Your job is to resolve one player-facing feel problem through characterization, competing hypotheses, controlled implementation, cold play and revision. Do not hide a bad toy under content, VFX, tutorials or architecture.

This workflow is where “it exists but it isn't fun” is converted into a bounded experimental loop.

## One production unit

One accepted unit is a **resolved feel defect** containing:

1. a specific observable problem;
2. input/state/physics telemetry and baseline footage;
3. at least three plausible causal hypotheses or solution variants;
4. one isolated lab/fixture where appropriate;
5. one or more candidate implementations using existing owners;
6. blind/cold play comparison;
7. ordinary-route proof;
8. accepted tuning record and regression protection.

A changed constant without comparative evidence is not a unit.

## Scale

- **1x:** one resolved defect.
- **3x:** three defects in one loop, prioritized so changes do not confound one another.
- **5x:** five-unit 5-minute-loop tuning tranche covering input, movement, targeting, combat consequence and camera/feedback, with before/after route review.

At 3x/5x, tune sequentially from foundational control to presentation; do not change five interacting variables simultaneously.

## Current SpaceFace starting points

Audit the live owner only:

- Pilot/classic/helm-assist input projection;
- V3 propulsion and camera;
- Massline input grammar, targeting, controller and telemetry;
- weapon impulse, AI maneuver, TTK and collision consequences;
- current Sandbox/scenario labs and replay traces;
- settings/accessibility;
- accepted constants marked protected in GDD or receipts.

## Creative process

### 1. Write the complaint in behavioral language

Good:

> When tether length changes, holding forward + orbit direction rotates the nose at the wrong angular rate, so thrust points inward/outward and the player fights the line.

> Light enemies require long sustained fire, so physical displacement never becomes the preferred tactic.

Bad:

> Massline needs better physics.

### 2. Separate intended difficulty from input friction

Ask:

- What decision should remain with the player?
- What motor precision is meaningless on keyboard/trackpad?
- What variable currently acts unexpectedly?
- What outcome should still be fail-able?
- Is the issue simulation, control projection, camera, targeting, feedback or encounter composition?

### 3. Build competing hypotheses

At least three where practical:

- simplest local correction;
- tuning-only alternative;
- control/UX alternative;
- content/encounter alternative;
- removal of interfering system.

Do not assume the most complex fix is strongest.

### 4. Define metrics plus feeling questions

Examples:

- heading/tangent error;
- unintended speed/radius change;
- target-selection mismatch;
- time on-screen;
- TTK and decision count;
- collision/environmental-kill rate;
- input errors;
- “would you do this voluntarily without a reward?”

## Reference mechanisms

- **Bennett Foddy physics design:** bend simulation toward solid feel.
- **Kerbal:** expose useful physical information without automating decisions.
- **DOOM:** fast resolution and forward movement.
- **FTL:** alter/cut systems to preserve feeling.
- **Skylanders vehicle physics:** simple designer controls over emergent physical behavior.
- **Nintendo-style observation:** hands and hesitation outrank polite feedback.

## Implementation rules

- Characterize current behavior before editing.
- Use a lab/replay for causality; use ordinary route for acceptance.
- Change one causal family at a time.
- Never direct-write position/velocity to conceal controller instability.
- Assistance owns only the precision explicitly delegated by the player.
- Do not add a new mode when a turn rate, threshold, priority or input mapping can solve the problem.
- Keep manual override immediate.
- Balance enemy durability, role composition, terrain and weapon response together—but sequentially.
- VFX/audio cannot promote a mechanic that cold players still avoid.
- Preserve protected GDD/accepted constants unless evidence and current user direction authorize a change.

## Adversarial review questions

- Did the player retain control?
- Is the mechanic easier to express without becoming automatic?
- Did the change solve the actual complaint or a neighboring metric?
- Would the player use it when no mission requires it?
- Does failure now feel earned rather than arbitrary?
- Did another control/ship/class regress?
- Is the accepted result simpler than the rejected alternatives?
- Is the improvement visible in ordinary footage?

## Acceptance

A 1x defect passes when:

- baseline failure is reproducible;
- chosen hypothesis materially outperforms alternatives;
- no hidden ownership of unrelated controls is introduced;
- cold play confirms improved feel;
- normal route and relevant ships/classes pass;
- seconds-scale regression protects the causal behavior;
- reviewer issues KEEP.

A 5x tranche additionally needs:

- a coherent five-minute loop improvement;
- no confounded multi-variable mystery;
- distinct player styles remain viable;
- accessibility/settings support;
- before/after capture showing more decisions and less friction;
- no content or VFX used to distract from an unresolved core defect.

## Failure modes

- Overengineered controller taking over thrust/speed/brake.
- Tuning by self-play only.
- A/B comparison without blind review.
- Metrics green while player behavior remains bad.
- Solving a control problem through tutorial text.
- Increasing enemy HP to create challenge.
- Adding complexity because the existing architecture allows it.

## Example invocations

```text
WF-15 1x — default Massline turn-rate synchronization; yaw only, no movement ownership.
```

```text
WF-15 3x — Massline candidate selection, orbit turning and release timing.
```

```text
WF-15 5x — physics-combat five-minute loop: camera scale, light-enemy TTK, impulse consequence, enemy recovery and encounter terrain.
```
