# H-01 plan — synthesized (tribunal)

Scored drafts on the ATTENTION rubric; splice of Drifter + Archivist with Set Dresser's
palette discipline.

| Axis | Drifter | Archivist | Set Dresser |
|------|---------|-----------|-------------|
| Critical-path weight | 5 (starters seen every hour) | 4 | 4 |
| Authenticity | 5 | 5 | 4 |
| Specificity | 4 | 5 (named dead) | 3 |
| Cost | 5 (three array appends) | 5 | 4 |
| Non-redundancy | 4 | 5 | 4 |

## Landed plan
1. `src/data/hullIdentity.js` — append 12 authored names to `HULL_NAME_BANK` (bank is
   explicitly authored; deterministic pick by seed+berth, so appends are save-safe).
2. `src/data/shipPaints.js` — append 4 hull paints + 3 accents, each hex + one-line `sentence`
   in the yard voice. Colors: used-work coats that also read as professions
   (liner white, toll grey, ore ochre, impound red; accents: claim-gold, loom blue, dead-light
   amber).
3. `src/data/codexPages.js` — `casualty` lines on the three starter hull overlays
   (`ship_kestrel`, `ship_pelican`, `ship_wasp`), canon-consistent
   (Vols for the Tessera pattern; yard dead, not new figures, for the other two).

## Not landing (rejected at tribunal)
- New decal ids — `SHIP_DECALS` vocabulary is consumed by `illustratedStencils.js`; a new id
  needs renderer work = new machinery.
- Trinkets for uncovered deed kinds — the file states uncovered kinds are deliberate.
- Rewrites of `newGameDefaults` blurbs — pinned copy; enrichment risks check failures.

## Approvals
- Author: implementer (this unit). Tribunal synthesis recorded above; per the row's
  single-agent instruction, three-persona drafts are in h-01-drafts.md.
