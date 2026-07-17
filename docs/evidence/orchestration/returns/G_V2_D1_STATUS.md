# G — V2 producers + D1 natural carriers status

**Date:** 2026-07-17  
**Owner:** Grok (SPINE `SpaceFace-depth-actualization` / `grok/depth-player-route-actualization`)  
**F0 ranking:** task **7** (V2 missing producers) · task **8** (D1 living opposition)  
**Authority:** `docs/evidence/orchestration/returns/F0_FABLE_ADVISOR_RETURN.md` §3 W2

## 1) F0 intent (what “done” means)

| Task | Outcome | Acceptance |
|---|---|---|
| **V2 (#7)** | Ad-board, Quiessence, Hush producers land; wreck-rumor reachability closed | `npm run check:depth-program:v2` full gate |
| **D1 (#8)** | Original nine + Helix doctrines get natural fleet carriers via encounterDirector/spawn-budget (after Fable §5.7 policy) | Soak ≥1 Helix carrier group / N-min crowded sector; doctrine ID on contacts; existing 23/23 doctrine green |

Kimi-owned presentation (Contracts dossier summary, Bar station identity polish) is **task 10**, not this residual.

## 2) Player-visible galaxy receipts beyond D10 — green vs missing

D10 (Choir-Tender news → bearing → scan → salvage) is the teaching path and stays the anchor. Everything below is the rest of the “galaxy keeps receipts” surface.

| Surface | Pack / system | Focused gate | Player-visible natural path | Residual |
|---|---|---|---|---|
| **D10 Choir-Tender** | wreck_rumors / uniqueWrecks | r2 natural-d10 supporting green | News on New Game | Uninjected Tier-B self-test still open (driver residual) |
| **Wreck rumors D1–D12** | wreck_rumors | r1/r2 focused green | Helios **headline** live | **Bar** deliberate rumor/bearing blocked (`stationId` not passed into Bar onShow) — partial |
| **Ad board** | ad_board | **v2 green** | **Market dockside notice** (this residual) | Capture re-run for live PNG evidence still open |
| **Graffiti** | graffiti | e1 + v2 | Physical H1 mayday → Board choice → bulkhead | Compressed travel in capture |
| **Roaming convoy** | roaming_events | v2 | Living freight route → encounterDirector → Band | Density under fully unassisted soak still open |
| **Quiessence** | quiessence + A1 actors | **a1 + v2 green** | Physical memorial + 17 hulls; **scanPulse** presents census | Requires real nearby scan (not map-open autoplay) |
| **Hush** | hush + A1 actors | **a1 + v2 green** | Physical world; **scanPulse** presents absence copy | Same scan requirement |
| **Landmark lore** | landmark_lore | v2 | C6/C8/C10 physical POI path | Remaining ~16 targetRefs lack physical carriers |
| **Set-piece missions** | set_piece_missions | sp1 focused | Contracts **state** owns offers | Authored summary not rendered (Kimi task 10) |
| **Band** | band | a1 green | Tuner + proximity bleed from A1 actors | Unassisted listening route open |
| **Doctrine audit (data)** | factionDoctrines | **doctrine-distinct green** | Profiles distinct in headless matrix | **Not** natural fleet carriers |
| **D1 natural carriers** | encounterDirector / spawn budget | — | **Missing** | Blocked on Fable spawn-policy ruling (§5.7); MED-HIGH golden risk |

### Reachability snapshot (source + runtime truth)

| Pack | Prior capture claim | Live truth on spine after this residual |
|---|---|---|
| ad_board | unreachable (no importer) | **reachable** — `v2AdBoard` + Market strip |
| graffiti | reachable | reachable |
| roaming_events | reachable | reachable |
| wreck_rumors | partial | partial (headline yes / Bar no) |
| landmark_lore | partial | partial (C6/C8/C10) |
| quiessence | unreachable (no actors) | **partial** — A1 actors + scan producer |
| hush | unreachable (no actors) | **partial** — A1 actors + scan producer |
| set_piece_missions | state-only | state-only |
| *(none)* | — | **0 packs remain source-unreachable** |

## 3) What this residual implemented (high-confidence, no graphics)

### V2 ad-board producer (REAL gap closed)

Corpus already had ≥20 house-voice ads; **no production module imported them**.

| File | Change |
|---|---|
| `src/systems/v2AdBoard.js` | **New** pure deterministic selector over `FLAVOR_PACKS.ad_board` (`seed` + `stationId` + 90s sim-clock cycle) |
| `src/ui/station/screens/market.js` | Dockside notice strip on Market instrument |
| `styles/station.css` | Minimal `sx-adboard` layout (no shell redesign) |
| `test/depth-program-v2-runtime.test.mjs` | Determinism + Market import wiring tests |
| `scripts/capture-depth-program-v2.mjs` | REACHABILITY + frame status updated for ad_board |

### V2 Quiessence / Hush natural scan seam (REAL gap closed)

A1 already materializes physical carriers. Runtime already bound scan copy. **Scanner did not classify flavor-stamped `fx` markers as signal candidates**, so ordinary `scanPulse` never produced `signal:scanResults` rows for them.

| File | Change |
|---|---|
| `src/systems/scanner.js` | `signalKindForEntity` treats `flavorSourceId` / `flavorTargetRef` / `quiessenceShipIndex` as anomaly signals |
| `test/depth-program-a1-physical-actors.test.mjs` | Production scanPulse → authored pack lines for both carriers |
| `scripts/capture-depth-program-v2.mjs` | Quiessence/Hush reclassified partial; stage production scanPulse helper |

### Explicitly not done here

- **D1 natural fleet carriers** — Fable spawn-policy ruling is a hard prerequisite (F0 §5.5 / §9.6). No encounterDirector / spawn-budget edits.
- **Wreck-rumor Bar path** — presentation/integration (`stationId` plumbing); overlaps Kimi Bar work.
- **Contracts authored summary** — Kimi task 10.
- **Playwright V2 live recapture** — harness updated; full browser capture not re-run in this pass.
- Assets / thrusters / materials — untouched.

## 4) Gates run

| Gate | Result |
|---|---|
| `npm run check:depth-program:v2` | **GREEN** (10/10 runtime tests incl. ad-board) |
| `npm run check:depth-program:a1` | **GREEN** (29/29 incl. physical scan producers) |
| `npm run check:doctrine-distinct` | **GREEN** (14 kits; 91/91 pairs beyond tolerance; Helix present in **matrix only**) |

## 5) D1 status (no code change)

- **Data/consumer audit:** complete and green (`check:doctrine-distinct`).
- **K1 five factions:** default-route physical presence exists via `factionPresence` (separate from original-nine/Helix natural fleets).
- **Original nine + Helix natural carriers:** still **missing**. Ledger truth: profiles are isolated-audit inputs until spawn owners stamp them; Helix is registry/data-live with **no natural fleet carrier**.
- **Blocker class:** process/authority — Fable must rule budget class, sector-danger gating, and despawn contract before Codex touches spawn. Risk: MED-HIGH (goldens). Recipe: 47a lazy-spawn-to-protect-golden.
- **Soak acceptance** (≥1 Helix carrier group / N-min crowded sector with doctrine ID on contacts): **not started**.

## 6) Residual queue (ordered)

1. **Fable §5.7 D1 spawn-policy ruling** → then Codex task 8 carriers (not this residual).
2. **Wreck-rumor Bar `stationId`** so D11-style deliberate rumor path is player-reachable (partial → green).
3. **Kimi task 10** Contracts summary + Bar identity presentation.
4. **Re-run** V2 live capture at the spine revision that will ship (ad_board + Quiessence/Hush frames).
5. **Unassisted multi-seed** natural routes for remaining R1/R2/E1/SP1 beyond D10 teaching path.

## 7) Charter block

```
LIVE AUDIT: F0_FABLE_ADVISOR_RETURN W2 tasks 7–8; capture-depth-program-v2 REACHABILITY; PROGRESS_LEDGER V2/D1; v2FlavorRuntime; A1 physical actors; doctrine-distinct matrix.
DIFF SUMMARY: src/systems/v2AdBoard.js (new); market ad strip + CSS; scanner flavor signal kinds; v2/a1 tests; capture-depth-program-v2 reachability/frame updates; this return.
GATES: check:depth-program:v2 GREEN; check:depth-program:a1 GREEN; check:doctrine-distinct GREEN.
FAILURE CLASS: N/A for ad-board/scan (REAL gaps closed). D1 carriers remain BLOCKED (Fable policy), not RED product.
PLAN DRIFT: none — stayed inside W2 residual V2/D1 status; no assets/thrusters; no D1 spawn edits without ruling.
RESIDUAL: D1 natural carriers (policy + soak); wreck Bar stationId; Contracts presentation (Kimi); V2 Playwright recapture; unassisted multi-seed beyond D10.
```
