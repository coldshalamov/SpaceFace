# src/onboarding/

Pure first-hour predicates. `systems/onboarding.js` writes `state.onboarding` and speaks lines.

- No DOM and no `Math.random`. Placement uses the caller's rng.
- Rescue, missing-three, and the drill are optional. They must not freeze the sim or block story after the rail is torn down.
- Completion reads live positions and velocities. Do not set a beat done from a toast.
- Verb shelf copy is keyed. One line per verb per save.
