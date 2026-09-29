# FB-064 — Recorded story choices and Verge evidence become chronicler facts with receipts

**Kind:** wire · **Lane:** THE LONG GAME · **Routing:** open
**Seam tags:** seam: story.js, seam: chronicler.js, seam: schema.js
**Write-set:** `src/systems/story.js`, `src/chronicler/schema.js`, `src/systems/chronicler.js`, `test/fb-story-choices-as-facts.test.mjs`

## The gap
`story:playerChoiceRecorded`, `story:vergeEvidenceRecorded`, `story:kurtzLedger` and
`story:vergeValeGatesRevoked` are emitted with no listener. The chronicler's `FACT_EVENTS` lists eighteen
observed events and none of these. The story's own decisions are the facts most worth remembering and they are
not in the ledger.

## Why this direction
The chronicler is the memory owner and already normalizes facts with citations. Four rows in `FACT_EVENTS`
plus normalizers is the whole seam; the codex and ticker consumers arrive with FB-036.

## Mechanism
- Add the four story events to `FACT_EVENTS` with a `story` stage and normalizers that carry the choice id and
  beat.
- Keep the story owner the only writer of story state; the chronicler stores the fact, not the truth.
- Pin that a recorded choice on seed 4242 becomes one fact with a citation and appears in `recallText`.

## Done when
`test/fb-story-choices-as-facts.test.mjs` pins the fact and its recall; chronicler suites and
`ending-choice-d-route.test.mjs` stay green.

## Do not
Do not branch the story on chronicler state. Do not duplicate facts on load.

## Focus test starting points
- `test/ending-choice-d-route.test.mjs`
- `tests/chronicler/chronicler.test.mjs`
- `tests/chronicler/hardening.test.mjs`
