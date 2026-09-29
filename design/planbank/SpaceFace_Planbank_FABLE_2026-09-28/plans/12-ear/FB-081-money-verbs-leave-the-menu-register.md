# FB-081 — Buying, selling, payouts and mission beats stop sharing one menu blip

**Kind:** deepening · **Lane:** THE EAR · **Routing:** open
**Seam tags:** seam: audioSystem.js, seam: audioRecipes.js
**Write-set:** `src/audio/audioSystem.js`, `src/data/audioRecipes.js`, `test/fb-money-verbs-register.test.mjs`

## The gap
Nine economic verbs (`buy`, `sell`, `cash`, `confirm`, `ui_accept`, `credits:changed`, `payout`,
`mining:bulkHaulDelivered`, `salvage:completed`) collapse onto `sfx_ui_confirm`, while `sfx_cash_register`
exists and fires only on the trade receipt. `sfx_mission_accept` and `sfx_mission_complete` share one sample
with only a rate change. Wanted tier changes differ only in gain and duck though the `WANTED_MOTIF` "A Bb A E"
exists in `themeMatrix.js`.

## Why this direction
New samples were rejected. Routing world-money verbs to the register that exists, differentiating
accept/complete by interval direction (rising vs. resolving) with the existing synth, and transposing the
wanted motif per tier are all recipe-level work.

## Mechanism
- Route `payout`, `mining:bulkHaulDelivered`, `salvage:completed` and `credits:changed` (world money) to
  `sfx_cash_register` with profit-keyed gain as the trade receipt already does; leave menu confirms on
  `sfx_ui_confirm`.
- Rewrite `sfx_mission_accept` as a rising two-note interval and `sfx_mission_complete` as a resolving one on
  the same synth voice.
- Give `wanted_escalate` a per-tier transposition of `WANTED_MOTIF` (tier index → semitone step).

## Done when
Seed 4242: a sale, a payout, a mission accept, a mission complete and two wanted tiers produce five distinct
recipe ids with pitched intervals in the audio record; `test/fb-money-verbs-register.test.mjs` pins the
routing; `audio-wanted-heat.test.mjs` stays green.

## Do not
Do not add samples. Do not play the register for a menu click. Do not change tier thresholds.

## Focus test starting points
- `test/audio-wanted-heat.test.mjs`
- `test/pq-151-00-wanted-tiers.test.mjs`
- `test/pq-158-03-themes.test.mjs`
