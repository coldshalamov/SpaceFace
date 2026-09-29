# FB-114 — The first-hour rail and the pad tuning survive a save and a load

**Kind:** build · **Lane:** THE MACHINE · **Routing:** open
**Seam tags:** seam: saveSystem.js, seam: onboarding.js
**Write-set:** `src/save/saveSystem.js`, `src/systems/onboarding.js`, `test/fb-onboarding-pad-save.test.mjs`
**Neighbours (extend, never restate):** SFQ-B221

## The gap
`state.onboarding.missingThree` (the boost/stroke/well/repulsor/cone rail) is not in the capture plan and
every `save:loaded` routes to the returning-pilot path, so a player who saves before the rail fires is never
taught five bound verbs. Restore honours `controls.bindings` but not `controls.gamepad` (override map,
deadzone, invert), which resets to defaults on load.

## Why this direction
Two `_callSerialize`-style rows and one mirrored restore branch; the pattern is established.

## Mechanism
- Add an `onboarding` capture row with a serialize/deserialize pair on the onboarding system; on load, resume
  the rail from its saved step instead of the returning-pilot path when the rail is incomplete.
- Mirror the `controls.bindings` restore branch for `controls.gamepad`.
- Pin both round-trips.

## Done when
`test/fb-onboarding-pad-save.test.mjs`: a save at rail step 2 resumes at step 2; pad overrides and deadzone
survive load; `save-envelope-fidelity.test.mjs` stays green.

## Do not
Do not re-fire completed beats. Do not persist the pad bag inside the profile twice.

## Focus test starting points
- `test/save-envelope-fidelity.test.mjs`
- Locate onboarding suites with `rg onboarding test/ -l`.
