# src/careers/

Registered owners live in the registry as `careerOrigins`, `careerLadders`, and `liveCareerLadderBranches`. The hauler, hunter, and prospector FSM objects are not registered by themselves. `careerLadders` is the ladder and save authority. Origins stay non-binding and must not lock each other out.

- Rewards are intents only: `economy:grantCredits`, `economy:chargeCredits`, `faction:repDelta`, `ships:grantModule`. Never write credits, cargo, heat, reputation, or `story.beatIndex`. Ladder validation rejects `heat:*`.
- A save normalizer must not put back a `stepId` that decline or abandon cleared. Completed hunter chains stay at `stepIndex === STEPS.length` so `stepDefAt` does not invent a step.
- Do not invent a second mission board. Step missions go through the missions authored-offer port.
