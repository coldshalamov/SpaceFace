# G — E1 natural eight (H1–H8 canonical shapes)

**Date:** 2026-07-17 · **Owner:** Grok (SPINE `SpaceFace-depth-actualization` / `grok/depth-player-route-actualization`) · **Spec:** F1 §6 encounter marks · **Harness:** `scripts/check-depth-program-e1-natural.mjs` · **Gate:** `npm run check:depth-program:e1:natural`

## 1) Scope

Expand the E1 natural Tier-A check from H1+H3 only to **all 8 canonical E1 shapes** without force-spawn. Two banked follow-ons remain weight-0 stubs and never count toward pass (F1 §6).

| In | Out |
|---|---|
| H1–H8 native telegraph + durable outcome | Force / `requestAuthoredEncounter` |
| Multi-seed CI where density allows | Follow-on stubs as pass rows |
| Supporting bootstrap minimized per shape | Uninjected flight primary acceptance |
| Honest REAL residuals for unassisted H7/H8 | Assets / design/program edits / commits |

## 2) Files

| Path | Role |
|---|---|
| `scripts/check-depth-program-e1-natural.mjs` | Multi-shape / multi-seed natural gate (8 shapes) |
| `.devshots/depth-program/e1-natural-multi.json` | Aggregate evidence (machine) |
| `docs/evidence/orchestration/returns/G_E1_EIGHT.md` | This return |

**Implementer log path:** `C:\Users\93rob\AppData\Local\Temp\grok-goal-696b88462e5d\implementer\e1-natural.log`

## 3) F1 encounter marks (unchanged contract)

Required in order (F1 §6 **encounter**):

1. `sector-entered`
2. `encounter-spawned` — director telegraph receipt (native), never harness spawn
3. `encounter-reached` — player within zone (≤1200 wu of planned center; H8 after mirror drive still requires native telegraph)
4. `outcome-observed` — durable `story.depthProgramEncounters.completed[shapeId]` via **timeout** or H8 mirror-course stand-in (**no** `encounter:choose` inject)

## 4) CI job matrix (17 runs)

| Slot | Shape | Sector | CI seeds | Outcome (timeout / drive) | Bootstrap (supporting) |
|---|---|---|---|---|---|
| E1/H1 | `depth_h1_distress_from_inside` | Helios | 48200, 91071, **100** | `left` | beat≥3 + prior yard POI visit |
| E1/H2 | `depth_h2_drifting_bloom` | Veil | 3, 7 | `scanned` | `tech_long_range_survey` + tier≥3 |
| E1/H3 | `depth_h3_wreck_that_knows_you` | Helios | 256, 35 | `ignored` | beat≥6 only |
| E1/H4 | `depth_h4_love_letter_buoy` | Io Reach | 15, 22 | `heard` | zone place (day-0 rare hits) |
| E1/H5 | `depth_h5_corridor_massacre` | Io Reach | 1, 4 | `fled` | beat≥5 |
| E1/H6 | `depth_h6_patrol_ambush` | Helios | 10, 4 | `vultured` | zone place (+ wait soak) |
| E1/H7 | `depth_h7_spared_return` | Helios | 11, 12 | `allied` | `moralMemory:remember` stand-in |
| E1/H8 | `depth_h8_echo_of_player` | Helios | 2, 6 | `synced` | beat≥7 + post-telegraph mirror course |

Follow-ons **not** in matrix (stubs):

- `depth_h6_vael_enforcement_follow_on` (weight 0)
- `depth_h8_mass_migration_follow_on` (weight 0)

## 5) Bootstrap reduction vs prior expand

| Shape | Bootstrap | Notes |
|---|---|---|
| H1 | POI + beat 3 | Unchanged production gates |
| H2 | tech only | No POI; sector Veil for `minSectorTier: 3` |
| H3 | beat 6 | Minimal (prior expand) |
| H4 | zone only | Day-0 CI seeds dodge multi-day rare lag |
| H5 | beat 5 | Io Reach major |
| H6 | zone only | Empty gates; longest pure-timeout combat path |
| H7 | moral memory stand-in | **REAL** without it (see residual) |
| H8 | mirror-course placement | **REAL** for pure timeout (see residual) |

Still overall `supporting: true` — harness assigns mode/sector, emits `sector:enter`, places zone/mirror. Force seam remains present but unused (`requestAuthoredEncounter` asserted as function, never called).

## 6) REAL residuals (product, not green-washed)

| Residual | Class | Detail |
|---|---|---|
| H7 unassisted | **REAL** | `moralDebtOnly` needs prior spared contact. CI injects `moralMemory:remember` as eligibility stand-in (same class as H1 POI visit). Pure soak without prior mercy does not complete. |
| H8 pure timeout | **REAL** | `timeoutChoice: null` by design; mirror-course is the mechanic. CI places player on mirror after **native** telegraph — no `encounter:choose`, no force. Unassisted timeout soak cannot finish `outcome-observed`. |
| H4 density lag | residual | Without day-0 seeds, rare ambient often sector-day ≥7–20. Documented; CI seeds prove native fire when planned early. |
| Follow-ons | stub | Weight 0; never pass-count. |

## 7) Gate proof

```text
npm run check:depth-program:e1:natural
→ E1 natural multi-seed OK: 17 runs (mode=ci) shapes=[E1/H1×3, E1/H2×2, E1/H3×2, E1/H4×2, E1/H5×2, E1/H6×2, E1/H7×2, E1/H8×2]
→ Aggregate: .devshots/depth-program/e1-natural-multi.json
→ pass: true
```

Implementer log: `C:\Users\93rob\AppData\Local\Temp\grok-goal-696b88462e5d\implementer\e1-natural.log`

## 8) Residual / next

1. Replace supporting mode/sector/`sector:enter`/placement/tech/moral/mirror with uninjected flight membership + earned progression.
2. Tier-B ≥1 browser observation per F1 §6.
3. Promote off `supporting` when static naturalness validator passes on harness sources.
4. Author banked follow-ons only when product weight > 0.
5. Optional: held-out seed mode for full eight-shape set.

## Charter return block

```
LIVE AUDIT: F1 encounter marks; check-depth-program-e1-natural.mjs; encounter H1–H8 gates; planEncounters + runtime pacing seed probe; moralMemory / mirror-course stand-ins.
DIFF SUMMARY: expanded e1-natural to all 8 canonical shapes (17 CI runs); H2/H4/H5/H6 multi-seed native timeout; H7 moralMemory stand-in; H8 mirror-course stand-in; follow-ons remain stubs; G_E1_EIGHT.md + implementer e1-natural.log. No assets, no commit.
GATES: npm run check:depth-program:e1:natural → green (17 runs, H1×3 + H2–H8×2).
FAILURE CLASS: N/A (green). REAL residuals documented for unassisted H7 (moralDebtOnly) and H8 pure timeout (timeoutChoice null).
PLAN DRIFT: none — no force-spawn; 2 banked follow-ons stay stubs.
RESIDUAL: uninjected flight; promote off supporting; Tier-B; follow-on authoring.
```
