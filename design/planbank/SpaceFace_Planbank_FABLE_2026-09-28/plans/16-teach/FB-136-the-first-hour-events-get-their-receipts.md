# FB-136 — The Range prompt, the first-hour sentence and the rescue beats reach a consumer

**Kind:** wire · **Lane:** THE HAND · **Routing:** open
**Seam tags:** seam: onboarding.js, seam: promptDeck.js, seam: storeSentence.js
**Write-set:** `src/systems/onboarding.js`, `src/ui/promptDeck.js`, `src/onboarding/storeSentence.js`, `test/fb-first-hour-receipts.test.mjs`
**Neighbours (extend, never restate):** SFQ-B063, NXB-046

## The gap
`onboarding:rangePrompt` is emitted (and scripted in two scenario files) with no listener, so the Range is
never offered when a verb is refused repeatedly. `firsthour:sentence` and the rescue beats emit into nothing
outside telemetry. The first hour computes its own receipts and shows none.

## Why this direction
The prompt deck is the one-voice prompt owner; the store sentence module already formats the sentence. Two
subscriptions.

## Mechanism
- Subscribe `promptDeck.js` to `onboarding:rangePrompt` (offer the Range rung for the refused verb; decline is
  remembered per profile).
- Publish `firsthour:sentence` through the store-sentence formatter to the dock arrival card once.
- Pin the offer after three refusals on seed 4242 and the single sentence card.

## Done when
`test/fb-first-hour-receipts.test.mjs`: one Range offer, one sentence card, decline remembered; onboarding
scenario tests stay green.

## Do not
Do not force the Range. Do not add a tutorial screen. Do not repeat the sentence.

## Focus test starting points
- Locate onboarding suites with `rg onboarding test/ -l` and the scenario runner for
  `missing-three.scenario.json`.
