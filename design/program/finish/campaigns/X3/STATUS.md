<!-- LIFETIME: CAMPAIGN -->
# X3 — Adventure glass: status

**State: policy + presenters landed and tested; a current working-tree capture is in `.devshots/x3-after-review`.**

## Done

- `src/ui/attentionGlass.js` — the Adventure flight policy: mode resolution, an actionable
  **allowlist** (`combat`, `objective`, `system`, `error`, `danger`, `warning`, plus capital-boss
  fight receipts) with unknown sources refused, plain ≤3-word callouts, a multi-sentence prose gate,
  and map-open/screen-stack flight classified as a map surface rather than the flight glass.
  `receiptSource` maps a channel-less mechanical kind to `system`, so ordinary transaction/mechanical
  receipts keep drawing while untagged prose does not.
- Wired into `hudAttention.admitReceipt` (stunt/massline jargon and prose refused in flight; a
  validated Charon approach cue survives), `stuntCallout.js` (all Adventure callout lines pass
  `plainCallout`), `masslineHud.js` (the Line’s telemetry words do not draw; the bracket says
  `GRAB` / `TOO HEAVY`, and the release verdict is one word — `CLEAN`, never `CLEAN · KEPT 84%`),
  and `orrery/hudAdapter.js` + `orrery/flightCluster.js` (the rail is icons + key caps in every
  flight context; the tether beam and strain dial stay, the payload’s `Body · on the line`,
  tonnage and `STRAIN` words are gated on Adventure flight).
- `gyreHud.js` replaces its hidden telemetry pill in Adventure with a plain instrument: `HOLD`
  or `LAUNCH` plus the fuse and ball-TTL countdowns, and no mass/count/tonnage/strain/DMG words.
  The strain and mass bars stay off; the fuse bar stays. A live Swarm run keeps the full telemetry
  pill (pinned by `test/x3-adventure-presenters.test.mjs`).
- `attentionGlass.js` now uses `inputContexts.isMapContext` for the map-screen exclusion instead of
  its own duplicate predicate, so `ui.mapOpen`, `mode: 'map'`, `ui.screen` and the screen stack
  resolve the same surface for the glass and the input context.
- `comms.js` gates the left-edge prose feed; `discoveryPlate.js` tags its receipt
  `source/channel: 'discovery'` so the Adventure receipt lane refuses it.
- `bandHud.js`: `BAND  OFF` → `RADIO  OFF`; `CENSUS n/m` → `FOUND n/m`.
- Removed the unused `ADVENTURE_CALLOUT_WORDS` / `ADVENTURE_TRANSIENT_MAX` constants; the receipt
  lane’s `RECEIPT_MAX = 2` already sits inside S2’s three-line budget.
- Focused checks at HEAD (second review): `test/adventure-glass.test.mjs` 7/7,
  `test/swarm-glass.test.mjs` 9/9, `test/fb-stunts-named-in-adventure.test.mjs` 3/3,
  `test/glass-474-494.test.mjs` 4/4, `test/x3-adventure-presenters.test.mjs` **9/9** (drives the
  real Gyre HOLD/LAUNCH instrument, Cluster, massline verdict, acquisition bracket, discovery and
  comms presenters), plus `charon-supply-approach` 14/14, `discovery-plate` 3/3 and
  `cv-throw-1-release-verdict` 5/5.
- Live capture from the current working tree: `.devshots/x3-after-review/flight_z144.png` and
  `flight_z58.png`
  (1600×1000, `node scripts/flight-look.mjs --hud --out=.devshots/x3-after-review`). The frame
  shows `RADIO  OFF`, the plain `TOO HEAVY` bracket, icon-only rail sockets with key caps, and no
  `GYRE`/`STRAIN`/payload-tonnage, left-edge comms feed or `CLEAN · KEPT` sentence. The onboarding
  store sentence still draws once (W5-owned; see below). The previous `.devshots/x3-after` predates
  the presenter fixes and is not evidence for them. **This is a real frame, not a matched
  before/after; the before is still missing, so the capture is explicitly unproven as a pair.**

## Not done

- A matched **before** capture of the same Adventure frame. The baseline `swarm/baseline/03` is a
  Swarm frame with the same jargon, not the Adventure frame.
- One independent image review of the Adventure glass before/after.
- The onboarding prose finding is **fixed**: the store page keeps its three-sentence tagline, but the
  rescue-start lesson now speaks `Light ships are ammunition.` through `_sayTutorial`, the voice
  arbiter and the fallback toast (`src/onboarding/storeSentence.js` `STORE_FLIGHT_SENTENCE`). It is
  one sentence, so the Adventure glass rule admits it; the drill still teaches swing and speed by
  doing. `node --test test/pq-163-03-sentence.test.mjs` 7/7 green. X3 still needs the matched before
  capture and one independent review above.
- Unrelated suites currently red in this shared checkout and not caused by this pass:
  `test/pq-146-03-stunt-callout.test.mjs` (physics-log lines are multi-word and the Adventure gate
  drops them; the S2 gate already did), `test/swarm-feedback-priority.test.mjs`,
  `test/hud-flight-attention.test.mjs` (foreign W1 `actLine`/`mtTitle` edits in the tree), and one
  `test/gyreSnare.test.mjs` strain-track case. Re-check after the foreign changes settle.

## Next

1. Review the HEAD capture against the X3 diagnosis and SWARM README §4.
2. Re-run the four named checks plus the presenter suite after any concurrent merge.
