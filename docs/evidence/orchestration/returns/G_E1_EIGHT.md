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
| H1–H6 eligibility-inject reduction | Global `supporting:false` flip |

## 2) Files

| Path | Role |
|---|---|
| `scripts/check-depth-program-e1-natural.mjs` | Multi-shape / multi-seed natural gate (8 shapes) |
| `.devshots/depth-program/e1-natural-multi.json` | Aggregate evidence (machine) |
| `docs/evidence/orchestration/returns/G_E1_EIGHT.md` | This return |

## 3) F1 encounter marks (unchanged contract)

Required in order (F1 §6 **encounter**):

1. `sector-entered`
2. `encounter-spawned` — director telegraph receipt (native), never harness spawn
3. `encounter-reached` — player within zone (≤1200 wu of planned center; H8 after mirror drive still requires native telegraph)
4. `outcome-observed` — durable `story.depthProgramEncounters.completed[shapeId]` via **timeout** or H8 mirror-course stand-in (**no** `encounter:choose` inject)

## 4) CI job matrix (17 runs)

| Slot | Shape | Sector | CI seeds | Outcome (timeout / drive) | Eligibility injects | Membership scaffold |
|---|---|---|---|---|---|---|
| E1/H1 | `depth_h1_distress_from_inside` | Helios | 48200, 91071, **100** | `left` | beat≥3 + discovery map + **production** `poi:discovered` | yes |
| E1/H2 | `depth_h2_drifting_bloom` | Veil | 3, 7 | `scanned` | `tech_long_range_survey` (no Tier-A research earn) | yes |
| E1/H3 | `depth_h3_wreck_that_knows_you` | Helios | 256, 35 | `ignored` | beat≥6 only | yes |
| E1/H4 | `depth_h4_love_letter_buoy` | Io Reach | 15, 22 | `heard` | **none** (eligibility-free) | yes |
| E1/H5 | `depth_h5_corridor_massacre` | Io Reach | 1, 4 | `fled` | beat≥5 | yes |
| E1/H6 | `depth_h6_patrol_ambush` | Helios | 10, 4 | `vultured` | **none** (eligibility-free) | yes |
| E1/H7 | `depth_h7_spared_return` | Helios | 11, 12 | `allied` | `moralMemory:remember` stand-in | yes |
| E1/H8 | `depth_h8_echo_of_player` | Helios | 2, 6 | `synced` | beat≥7 + post-telegraph mirror course | yes |

Follow-ons **not** in matrix (stubs):

- `depth_h6_vael_enforcement_follow_on` (weight 0)
- `depth_h8_mass_migration_follow_on` (weight 0)

## 5) Bootstrap reduction (H1–H6 eligibility pass)

| Shape | Eligibility injects | Notes |
|---|---|---|
| H1 | beat 3 + discovery map + `poi:discovered` | **Reduced:** visit memory no longer writes `depthProgramPoiVisits` directly; production `poi:discovered` → director `_rememberPoiVisit`. Discovery map still seeded (world system not in Tier A). |
| H2 | tech only | **Kept:** `requiredTech` cannot be earned without research systems in Tier A. REAL residual. |
| H3 | beat 6 | Minimal; missions progression absent in Tier A |
| H4 | **none** | Zone membership only; day-0 CI seeds dodge multi-day rare lag |
| H5 | beat 5 | Io Reach major; beat inject only |
| H6 | **none** | Empty gates; longest pure-timeout combat path |
| H7 | moral memory stand-in | **REAL** without it (see residual) |
| H8 | mirror-course placement | **REAL** for pure timeout (see residual) |

### Eligibility-free counts (H1–H6)

| Metric | Value |
|---|---|
| Eligibility-free shapes | **H4, H6** (2/6) |
| Eligibility-free CI seed runs | **4** (H4×2 + H6×2) |
| Full-mark pass without eligibility injects | **4/4** |
| Still need eligibility injects | H1×3 + H2×2 + H3×2 + H5×2 = **9** runs |

### Why not `supporting:false` globally

Membership scaffold remains on **every** shape: `mode=flight`, `currentSectorId`, `sector:enter`, zone placement. F1 naturalness validator forbids those harness patterns. Prefer documenting shapes that still need eligibility injects over a dishonest global primary claim.

`supporting:false` **partial** (honest): H4/H6 complete the full encounter mark spine under membership scaffold alone, but that is **not** primary acceptance.

## 6) REAL residuals (product, not green-washed)

| Residual | Class | Detail |
|---|---|---|
| Membership scaffold (all) | residual | mode/sector/`sector:enter`/zone place keeps `supporting:true` |
| H1 discovery map | residual | world system not in Tier A; visit now production `poi:discovered` |
| H2 tech unearned | **REAL** | `tech_long_range_survey` inject required without research systems |
| H3/H5 beatIndex | residual | missions progression not in Tier A session |
| H7 unassisted | **REAL** | `moralDebtOnly` needs prior spared contact. CI injects `moralMemory:remember` |
| H8 pure timeout | **REAL** | `timeoutChoice: null`; mirror-course is the mechanic |
| H4 density lag | residual | Without day-0 seeds, rare ambient often sector-day ≥7–20 |
| Follow-ons | stub | Weight 0; never pass-count |

## 7) Gate proof

```text
npm run check:depth-program:e1:natural
→ E1 natural multi-seed OK: 17 runs (mode=ci) shapes=[E1/H1×3, E1/H2×2, E1/H3×2, E1/H4×2, E1/H5×2, E1/H6×2, E1/H7×2, E1/H8×2]
→ supporting:true (membership scaffold residual); eligibility-free H1–H6: [E1/H4, E1/H6] pass 4/4
→ Aggregate: .devshots/depth-program/e1-natural-multi.json
→ pass: true
```

## 8) Residual / next

1. **Do not flip `supporting:false` globally** until uninjected flight membership + naturalness validator pass on harness sources.
2. Replace membership scaffold (mode/sector/`sector:enter`/placement) with production world enter.
3. Earn H2 tech via research systems (or keep inject + REAL residual).
4. Earn H3/H5 beat via missions progression in a fuller Tier-A stack.
5. H1: include world system so discovery map is player-earned, not seeded.
6. Tier-B ≥1 browser observation per F1 §6.
7. Author banked follow-ons only when product weight > 0.
8. Optional: held-out seed mode for full eight-shape set.

## Charter return block

```
LIVE AUDIT: F1 encounter marks; check-depth-program-e1-natural.mjs; H1–H6 eligibility inject reduction; H4/H6 eligibility-free probe; H1 poi:discovered production visit; H2 tech REAL residual.
DIFF SUMMARY: per-shape eligibilitySupporting classification; H1 visit via poi:discovered (no depthProgramPoiVisits write); beat write only when beatIndex>0; aggregate eligibilityReduction counts (H4+H6 4/4 eligibility-free full marks); residual docs updated. No global supporting:false. No assets, no commit.
GATES: npm run check:depth-program:e1:natural → green (17 runs; eligibility-free H4/H6 pass 4/4).
FAILURE CLASS: N/A (green). REAL residuals: H2 tech unearned, H7 moralDebtOnly, H8 timeoutChoice null. Membership scaffold residual on all shapes.
PLAN DRIFT: none — preferred documenting shapes needing supporting over global flip.
RESIDUAL: uninjected flight membership; H2 research earn; H1 world discovery; Tier-B; follow-on authoring.
```
