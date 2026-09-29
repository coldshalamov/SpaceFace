# FB-042 — A declared war and a sector flip are published as cited news, not only felt through spawns

**Kind:** wire · **Lane:** THE WORLD · **Routing:** open
**Seam tags:** seam: factions.js, seam: conflictReactions.js, seam: marketNews.js
**Write-set:** `src/systems/factions.js`, `src/data/conflictReactions.js`, `test/fb-war-is-news.test.mjs`
**Neighbours (extend, never restate):** SFQ-B116

## The gap
`conflict:warDeclared` is emitted with no listener anywhere; `conflict:flip` is consumed by three sim systems
and the authored flip copy in `conflictReactions.js` reaches the player only through a bark or the station ad
board. The world changing hands in six contested sectors is barely legible.

## Why this direction
`selectConflictReaction` already returns formatted copy for a flip; publishing it through `news:publish` from
the faction owner's flip and declaration handlers is one call each.

## Mechanism
- On `conflict:warDeclared` and on flip, publish a headline built from `selectConflictReaction` with the fact as
  citation.
- Add a declared-war reaction row to `conflictReactions.js` (the flip row exists).
- Pin one headline per declaration and per flip on a forced-momentum seed-4242 scenario.

## Done when
`test/fb-war-is-news.test.mjs`: declaration and flip each produce one cited headline; no headline for NPC
skirmishes below the war threshold; existing faction suites stay green.

## Do not
Do not add a war screen. Do not change war or flip thresholds. Do not publish uncited.

## Focus test starting points
- `test/depth-program-faction-modules.test.mjs`
- Locate conflict suites with `rg conflictZones test/`.
