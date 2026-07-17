# G — E1 natural expand (beyond H1-only CI pair)

**Date:** 2026-07-17 · **Owner:** Grok (SPINE `SpaceFace-depth-actualization` / `grok/depth-player-route-actualization`) · **Spec:** F1 §6 encounter marks · **Harness:** `scripts/check-depth-program-e1-natural.mjs` · **Gate:** `npm run check:depth-program:e1:natural`

## 1) Scope

Expand the E1 natural Tier-A check past the prior H1-only CI pair **without force-spawn**, using production `planEncounters` + pacing only.

| In | Out |
|---|---|
| H1 CI triple (≥3 seeds) | Force / `requestAuthoredEncounter` |
| Second native shape H3 | Full 8-row E1 primary acceptance |
| Reduced supporting bootstrap | Tier-B browser observation |
| Honest density notes for residual shapes | Assets / design/program edits / commits |

## 2) Files

| Path | Role |
|---|---|
| `scripts/check-depth-program-e1-natural.mjs` | Multi-shape / multi-seed natural gate |
| `scripts/lib/naturalRoute.mjs` | `runMultiSeed` now passes `(seed, index)` for multi-shape job lists |
| `.devshots/depth-program/e1-natural-multi.json` | Aggregate evidence (machine) |
| `docs/evidence/orchestration/returns/G_E1_NATURAL_EXPAND.md` | This return |

## 3) F1 encounter marks (unchanged contract)

Required in order (F1 §6 **encounter**):

1. `sector-entered`
2. `encounter-spawned` — director telegraph receipt (native), never harness spawn
3. `encounter-reached` — player within zone (≤1200 wu of planned center)
4. `outcome-observed` — durable `story.depthProgramEncounters.completed[shapeId]` via **timeout** (no `encounter:choose` inject)

## 4) What expanded

### H1 — `depth_h1_distress_from_inside` (CI triple)

| Seed | Planned day | Outcome (timeout) |
|---|---|---|
| 48200 | 1 | `left` |
| 91071 | 1 | `left` |
| **100** (new) | 1 | `left` |

Prior CI pair was `[48200, 91071]`. Third seed `100` also plans H1 on Helios sector-day 1 (bounded soak).

### H3 — `depth_h3_wreck_that_knows_you` (second shape)

| Seed | Planned day | Outcome (timeout) |
|---|---|---|
| 256 | 0 | `ignored` |
| 35 | 0 | `ignored` |

H3 is a unique minor with broad `zoneTypes` and only `storyBeatMin: 6` — no POI visit, no tech. Fires natively from the planner/pacing gate when the player is already in the planned zone.

### CI job matrix (5 runs)

`E1/H1×3 + E1/H3×2` — all green under default `NATURAL_ROUTE_SEED_MODE=ci`.

## 5) Bootstrap reduction (still supporting)

| Prior H1-only bootstrap | Now |
|---|---|
| `mode=flight`, `currentSectorId`, `sector:enter` | Kept (membership stand-in) |
| `beatIndex = 7` blanket | Per-shape min: H1→**3**, H3→**6** |
| `tech_long_range_survey` research inject | **Removed** (H1/H3 do not require it) |
| H1 POI discovery + `depthProgramPoiVisits` | Kept for H1 only (production gates) |
| Hardcoded yard place only | Prefer **planner `zoneCenter`**; H1 yard local is fallback |
| H3 | mode/sector/beat + zone place + `sector:enter` only |

Still `supporting: true` — harness assigns mode/sector and emits `sector:enter`; not uninjected flight. Force seam remains present but unused (`requestAuthoredEncounter` asserted as function, never called).

## 6) Density probe (honest residual)

Pure planner + runtime probes (no force) across seeds/sectors:

| Shape | Native plan? | Native complete (timeout)? | Residual reason |
|---|---|---|---|
| H1 | Yes (Helios, often day 1) | Yes | — covered |
| H3 | Yes (many zones) | Yes | — covered |
| H2 | Yes (tier≥3 + tech) | Yes (timeout→`scanned`) | tech bootstrap + non-Helios sector |
| H4 | Rare ambient Io | Possible, late (day ≥7) | density lag / rare gate |
| H5 | Yes Io major | Yes (timeout→`fled`) | second-sector + beat≥5 |
| H6 | Yes (empty gates) | Yes (timeout→`vultured`) | residual combat shape (density OK) |
| H7 | Plans | Needs `moralDebtOnly` | **REAL progression gap** without prior mercy memory |
| H8 | Plans + telegraphs | No pure timeout | **`timeoutChoice: null`** (mirror-course needs player drive) |
| H6/H8 follow-ons | weight 0 stubs | N/A | F1: never count toward pass |

No harness waiver was used for red density; residual shapes are documented, not green-washed.

## 7) Gate proof

```text
npm run check:depth-program:e1:natural
→ E1 natural multi-seed OK: 5 runs (mode=ci) shapes=[E1/H1×3, E1/H3×2]
→ Aggregate: .devshots/depth-program/e1-natural-multi.json
→ pass: true
```

## 8) Residual / next

1. Add H5/H6 (or H2) as further shapes when multi-sector supporting bootstrap is accepted.
2. H7/H8 need progression or player-drive — do not force; treat gaps as REAL when unassisted soak cannot complete.
3. Replace supporting mode/sector/`sector:enter`/placement with uninjected flight membership.
4. Tier-B ≥1 browser observation per F1 §6.
5. Promote off `supporting` when static naturalness validator passes on harness sources.

## Charter return block

```
LIVE AUDIT: F1 encounter marks; check-depth-program-e1-natural.mjs; encounter shape gates (H1–H8); planEncounters density probe; naturalRoute runMultiSeed.
DIFF SUMMARY: expanded e1-natural to H1 CI triple + H3 second shape; reduced bootstrap (no tech, per-shape beatIndex); runMultiSeed(seed, index); return note G_E1_NATURAL_EXPAND.md. No assets, no commit.
GATES: npm run check:depth-program:e1:natural → green (5 runs, H1×3 + H3×2).
FAILURE CLASS: N/A (green). Residual density for H4/H7/H8 documented as REAL where product cannot complete by timeout alone.
PLAN DRIFT: none — stayed within expand-beyond-H1-only without force-spawn.
RESIDUAL: remaining shapes H2/H4/H5/H6/H7/H8; uninjected flight; Tier-B; promote off supporting.
```
