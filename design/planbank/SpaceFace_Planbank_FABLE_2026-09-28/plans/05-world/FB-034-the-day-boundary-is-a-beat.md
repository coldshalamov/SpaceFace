# FB-034 — A day passing is a beat the player can read: what changed and why

**Kind:** wire · **Lane:** THE WORLD · **Routing:** open
**Seam tags:** seam: sectorSim.js, seam: marketNews.js
**Write-set:** `src/systems/sectorSim.js`, `src/ui/marketNews.js`, `test/fb-day-boundary-beat.test.mjs`

## The gap
`sectorSim.js` advances danger, prices, influence and transit exposure on a 600 s day and emits
`sectorsim:tick` to nobody. `sectorsim:intel` and `sectorsim:offlineSummary` already carry the deltas. The
player sees prices and danger drift with no "a day passed" moment.

## Why this direction
A calendar UI was rejected. The news surface already renders cards from `CARD_TEMPLATES`; a day card with the
three largest deltas is one subscription.

## Mechanism
- On `sectorsim:tick`, compose a day card from the intel alerts and the offline summary (top three deltas: a
  price regime change, a danger shift, an influence move), through `news:publish` with a citation key so it
  survives ticker retention.
- Speak the card once through the existing news voice channel, never mid-combat (respect the voice arbiter).
- Pin one card per day boundary and none when nothing changed.

## Done when
`test/fb-day-boundary-beat.test.mjs`: three day boundaries on seed 4242 produce three cards with real deltas
and zero when the sim is frozen; `core-day-boundary-continue.test.mjs` and
`market-news-literal-publish.test.mjs` stay green.

## Do not
Do not add a calendar screen. Do not publish without a citation. Do not interrupt combat voice.

## Focus test starting points
- `test/core-day-boundary-continue.test.mjs`
- `test/market-news-literal-publish.test.mjs`
