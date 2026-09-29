# FB-107 — A machine-filled locale says so until its reviewed coverage passes a measured gate

**Kind:** build · **Lane:** THE INSTRUMENT · **Routing:** open
**Seam tags:** seam: pipeline.js, seam: gameLocalization.js
**Write-set:** `src/localization/pipeline.js`, `src/localization/gameLocalization.js`, `scripts/check-localization-readiness.mjs`, `test/fb-locale-readiness-gate.test.mjs`
**Neighbours (extend, never restate):** SFQ-B227

## The gap
All four non-English catalogs are six-line files that machine-generate themselves at import time through
`buildTranslatedCatalog` → `machineTranslate`, a word-by-word glossary substitution over 13.2k keys; only
barks and store copy are reviewed. The language picker offers them as finished languages. SFQ-B227 forbids
inventing a localization project; this packet does not translate, it makes the picker honest and gives
reviewed strings a gate to graduate through. The `PHRASES` table is already the override lane.

## Why this direction
Authoring thousands of strings was rejected (a project, not a task). Honesty is cheap: label the machine
locales as previews in the picker, count reviewed keys over the surfaces a player meets (HUD, prompts,
settings, station verbs, mission templates, death screen), and drop the label automatically when a locale
passes.

## Mechanism
- Add `scripts/check-localization-readiness.mjs`: per locale, reviewed-key coverage over a fixed surface list
  (reviewed = present in `PHRASES` or a human catalog entry, not machine fill); print the number and the fifty
  most-visible unreviewed keys.
- In `LANGUAGE_OPTIONS`, suffix a locale below 95% with "(machine preview)" read from a generated readiness map;
  the label is data, so a reviewed batch lands and the label falls off with no code change.
- Pin the gate on a fixture locale that is 100% reviewed (no label) and on today's es-ES (labelled).

## Done when
`node scripts/check-localization-readiness.mjs` prints coverage for all four locales;
`test/fb-locale-readiness-gate.test.mjs` pins the label rule both ways; `localization-runtime.test.mjs` and
`pq-166-01-pseudo-locale.test.mjs` stay green.

## Do not
Do not add a translation dependency. Do not author bulk translations here. Do not hide the machine locales (a
labelled preview beats a missing language). Do not restyle the language picker (ORRERY); the label is one
suffix string on an existing option.

## Focus test starting points
- `test/localization-runtime.test.mjs`
- `test/localization-reachability.test.mjs`
- `test/pq-166-01-pseudo-locale.test.mjs`
