# FB-037 — The codex shows the world you changed: unique wrecks, aces, provenance chains, chronicler stories

**Kind:** build · **Lane:** THE INSTRUMENT · **Routing:** ORRERY lane
**Seam tags:** seam: codex.js
**Write-set:** `src/ui/screens/codex.js`, `test/fb-codex-world-tab.test.mjs`
**Neighbours (extend, never restate):** SFQ-B118, SF-131

## The gap
The codex has eight tabs and none is the world. It reads the exploration journal and frontier rumours only;
`state.player.uniqueWrecks` (per-wreck read/fixed/recovered flags), `state.aceMemory` (`rememberedBarkFor`),
provenance chains and `state.chronicler` (`recallText`) are all saved and shaped for display and shown nowhere
together. Pure UI, so the ORRERY lane; the sim contracts are named here.

## Why this direction
The receipts exist. A tab that reads four saved bags is the mature-parity minimum for "ship recognition and
lore receipts".

## Mechanism
- Add a World tab case at the codex's tab dispatch reusing `makeEntry`: wrecks (state and last decision), aces
  (memory line), chains (what is held against you and the closing verb), stories (recall text with citation).
- Read only; no new state.
- Walk the screen with `node scripts/ui-bench.mjs --walk` before calling it done.

## Done when
`test/fb-codex-world-tab.test.mjs`: a seed-4242 save with one resolved wreck, one grudge ace and one chain
renders four entries; `pq048-discovery-to-codex-return.test.mjs` stays green.

## Do not
Do not compute in the UI. Do not add a ninth bag. Do not reveal unread wreck locations.

## Focus test starting points
- `test/pq048-discovery-to-codex-return.test.mjs`
- `test/depth-program-unique-wreck-map.test.mjs`
