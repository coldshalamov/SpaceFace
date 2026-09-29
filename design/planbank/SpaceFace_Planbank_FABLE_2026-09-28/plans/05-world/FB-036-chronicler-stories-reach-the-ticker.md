# FB-036 — The chronicler's cited story arcs are published where the player reads news

**Kind:** wire · **Lane:** THE WORLD · **Routing:** open
**Seam tags:** seam: chronicler.js, seam: voiceBridge.js, seam: marketNews.js
**Write-set:** `src/systems/chronicler.js`, `src/chronicler/voiceBridge.js`, `src/ui/marketNews.js`, `test/fb-chronicler-stories-published.test.mjs`

## The gap
`chronicler.js` builds evidence-backed story views with up to eight citations and emits `chronicler:story` and
`chronicler:legend`; only `chronicler:radio` and `chronicler:recall` have consumers (`voiceBridge.js`). The
richest output, a completed cited arc, reaches nobody.

## Why this direction
`voiceBridge.js` shows the two-line subscription pattern and `marketNews.js` already keeps only cited lines.
One more subscription is the whole seam; the codex half is FB-037.

## Mechanism
- Subscribe `marketNews.js` to `chronicler:story` and `chronicler:legend`; render the headline with the first
  citation as its receipt.
- Rate-limit legends to one per day boundary so the ticker is not a saga.
- Pin that a seed-4242 kill→salvage→sell chain produces one story headline with a real `factId` citation.

## Done when
`test/fb-chronicler-stories-published.test.mjs`: one cited story headline for the scripted chain, no uncited
publication; `tests/chronicler/chronicler.test.mjs` and `tests/chronicler/hardening.test.mjs` stay green.

## Do not
Do not publish without evidence. Do not add a story screen. Do not narrate NPC-only chains the player never
witnessed.

## Focus test starting points
- `tests/chronicler/chronicler.test.mjs`
- `tests/chronicler/hardening.test.mjs`
- `test/market-news-literal-publish.test.mjs`
