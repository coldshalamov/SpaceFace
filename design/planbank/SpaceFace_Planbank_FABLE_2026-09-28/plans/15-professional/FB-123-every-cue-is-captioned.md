# FB-123 — Every gameplay cue the game can play has a caption record, checked by a test that walks the recipes

**Kind:** build · **Lane:** THE EAR · **Routing:** open
**Seam tags:** seam: captions.js, seam: audioRecipes.js
**Write-set:** `src/ui/captions.js`, `test/fb-every-cue-captioned.test.mjs`
**Neighbours (extend, never restate):** SF-239, SFQ-I079

## The gap
`everyVoicedBarkCaptioned` proves every voiced bark has a caption; `ACCESSIBILITY_AUDIO_CUE_TABLE` covers the
accessibility cues. Nothing proves the 258 `RECIPES` ids that `audioSystem.js` plays as gameplay cues (kill
tiers, refusals, snare and seed voices, the new loops from this bank) each map to a caption. Adjacent to
SF-239 (captions carry semantics without becoming a log): this is coverage, not wording.

## Why this direction
Accessibility is not optional, and every ear packet in this bank adds cues. A coverage test keeps them honest
without a caption redesign.

## Mechanism
- Build a caption map keyed by recipe id for gameplay-class recipes (skip UI blips and layers), with the event
  word and the urgency band; default a missing entry to the recipe's family caption so nothing is silent to a
  deaf player.
- Add the walk test: every recipe id referenced by `audioSystem.js` resolves to a caption record.
- Keep the caption queue's existing rate limit so a dense fight does not become a log.

## Done when
`test/fb-every-cue-captioned.test.mjs`: 100% of referenced gameplay recipes captioned;
`pq-165-01-captions.test.mjs` stays green.

## Do not
Do not caption UI blips. Do not raise the caption rate limit. Do not restyle captions (ORRERY).

## Focus test starting points
- `test/pq-165-01-captions.test.mjs`
- `test/wave-g3-fight-captions.test.mjs`
