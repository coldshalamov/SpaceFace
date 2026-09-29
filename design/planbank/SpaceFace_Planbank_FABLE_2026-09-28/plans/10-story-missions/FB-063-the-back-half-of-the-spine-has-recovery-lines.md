# FB-063 — Beats 4–7 use the authored step machine, so a stuck player hears the recovery line

**Kind:** wire · **Lane:** THE LONG GAME · **Routing:** open
**Seam tags:** seam: story.js, seam: campaignData.js, seam: missions.js
**Write-set:** `src/systems/story.js`, `src/story/campaign47a/campaignData.js`, `src/systems/missions.js`, `test/fb-spine-back-half.test.mjs`
**Neighbours (extend, never restate):** SFQ-B061, NXB-046

## The gap
`CAMPAIGN_BEATS` in `src/story/campaign47a/campaignData.js` authors eight beats with per-step accept events,
`requiresPrior`, and `recovery.rearmOn` lines; `campaignTransitions.js` is an 828-line step machine. Both are
imported only inside `campaign47a/`. Beats 0–3 have live tagged generators; beats 4–7 run on bare
`story.beatIndex` comparisons scattered across `missions.js` with no recovery lines.

## Why this direction
A second story system is forbidden (one linear story). The step machine is that story's own authored data;
extending the import `story.js` already makes is wiring what computes.

## Mechanism
- Import `CAMPAIGN_BEATS` and the beat lookup into `story.js`; drive beats 4–7 gating from `requiresPrior` and
  their `accept` events instead of index comparisons.
- Fire the `recovery` line when a beat's rearm condition is met after a failure, through the existing comms
  popup path.
- Pin the eight-beat walk on seed 4242 and one recovery line after a scripted beat-5 failure.

## Done when
`test/fb-spine-back-half.test.mjs`: all eight beats advance in order and the beat-5 recovery line fires once;
`story-campaign47a-embodied-missions.test.mjs` stays green.

## Do not
Do not add branches. Do not add dialogue choices. Do not change ending eligibility.

## Focus test starting points
- `test/story-campaign47a-embodied-missions.test.mjs`
- `test/story-campaign47a-embodied-save.test.mjs`
