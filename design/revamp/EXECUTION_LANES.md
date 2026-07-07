# EXECUTION LANES — backend / frontend / both routing + the real dependency DAG

> **Purpose.** This is the routing layer over `PROGRESS.md`. The ledger's numeric `T1→…→T9` order is
> *multi-agent insurance* (WAVE4_PROMPT §0.0); for a single session it serializes work that has no
> real dependency. This doc tells you (a) the **real** dependency DAG, (b) which lane each row belongs
> to, and (c) which rows are **unblocked right now** for your tool's strengths.
>
> **Authority:** supplements `WAVE4_PROMPT.md §0.0` and `PROGRESS.md` "HOW TO USE." When this doc and
> the numeric order disagree on *sequencing*, this doc wins (it reflects the real code deps, verified
> 2026-07-07). When they disagree on *task state*, `PROGRESS.md` wins (re-verify against the tree).
>
> **Snapshot basis:** working tree 2026-07-07, after BP-12's 7 SURFACE/ENRICH packets landed
> (T4b-3..T4b-9 DONE). Re-verify `DONE` claims before building on them (AGENTS.md §3).

---

## 1. The real dependency DAG (3 serialization points, verified 2026-07-07)

```
                    ┌─────────────────────────────────────────────────────┐
   BACKEND CORE ───▶│ lossLedger.js (T4c / WRECK_PROVENANCE)              │
   (unblocked now)  │  ├──▶ WRECK_PROVENANCE wreck-class assignment       │
                    │  ├──▶ GHOST_CONVOY_RUMOR (≥3-loss threshold read)   │
                    │  └──▶ CONVOY_LOSS_INVESTIGATION (the BP-12 hole)    │
                    └─────────────────────────────────────────────────────┘
T9 (release bar) is LAST by definition — it gates everything below.
T6 (assets) is a SEPARATE frontend/vision lane; only T6f blocks BP-01.1's VISUAL half.
```

**Truly serial (real code deps — do not reorder):**
1. **`lossLedger.js` first**, then its 3 consumers (above). This is the only backend chokepoint.
2. **T9 last** (it's the release gate; needs everything green + screenshots).
3. **T6 (assets) → its BP visual halves only.** T6f salvage parts block BP-01.1's *visual* half;
   logic lands fine (same pattern BP-11 shipped).

**Everything else is parallel-unblocked** (disjoint files, no real dep) — see the table in §3.

---

## 2. Lane definitions

| Lane | What it is | Tool match |
|---|---|---|
| **🔧 BACKEND** | Logic, data, systems, check-scripts, AI, economy, events. Mechanical UI panels where the *design is specified* (a div with CSS, like the BP-12 panels) are backend — bad taste doesn't bite when the look is prescribed. | Codex / backend agent (no frontend taste needed). **Great fit.** |
| **🎨 FRONTEND/VISION** | `src/render/**`, `assets/**`, screenshot rituals, *open-ended* visual design (map-glyph *rendering*, intent-banner *rendering*, HUD polish, VFX look). Eyes needed: broken models silently fall back to procedural geometry (AGENTS §7). | A vision-capable agent / human review. **Do NOT hand blind to a backend agent.** |
| **🟦 BOTH** | Rows that have both a logic half and a visual half. Split: backend agent does the logic + hands off the visual via a seam; frontend agent finishes the render half. (This is how BP-11 and BP-12 shipped.) | Two-pass: backend first, then frontend. |

---

## 3. Remaining-work routing table (every NEXT row, classified)

> **Unblocked** = real deps met AND files disjoint from any IN-FLIGHT row. "verify" = dep looks met
> but re-check before claiming (some ledger `depends-on` columns are stale — see notes).

### 🔧 BACKEND — unblocked NOW (Codex can take these in any order)

| Row | Task | Lane | Real dep | Notes |
|---|---|---|---|---|
| **T4c (start)** | BP-01.1 — build `lossLedger.js` + `wreckClasses.js` (WRECK_PROVENANCE) | 🔧 | none (unblocks 3 consumers) | **THE chokepoint — do this first in T4c.** Spec: `detail/E_salvage_economy_contracts.md` §BP-01.1. |
| T4c (rest) | SALVAGE_DISTINCT_FROM_MINING, SURVIVOR_POD_TRIAGE, SALVAGE_PERMIT_AND_FINES | 🔧 | none (independent of lossLedger) | Spec: same doc. SALVAGE_PERMIT reuses shipped `runScan`/`FINE_MULT` (no new fine path). |
| **T4d** | BP-13 Pirate Ecology (12 packets) — doctrines, named aces, rumor heat, bounty hunters | 🔧 | mostly none (sits on shipped `encounterDirector`/`scanner`/`spawnBudget`) | Spec: `detail/B_traffic_pirates.md`. The "feeds from loss ledger" line is ONE packet (ghost convoy, T4c). Largely parallel-safe with T4c. |
| T8d | `check:smuggling-card` (BP-12 customs/contraband) | 🔧 | T4b (DONE — CUSTOMS_MOMENT + CARGO_REPUTATION shipped) | Surfaces the panels just built. |
| T8e | `check:station-mood` (BP-11 station life) | 🔧 | T4a (DONE) | Verification scaffolding over shipped BP-11. |
| T8h | `check:market-chart` (BP-12 market viz) | 🔧 | T4b (DONE — CAUSE_LEDGER + PRICE_FORECAST) | Surfaces cause + forecast. |
| T8f | `check:claim-ledger` (BP-06 bases) | 🔧 | claims shipped | Verification scaffolding. |
| T8g | `check:war-overlay` (faction war map) | 🔧 | factions shipped | Verification scaffolding. |
| T8b | `check:fact-ledger` (state.world.facts) | 🔧 | facts shipped (ledger `T1a` dep is stale — facts exist) | Verification scaffolding. |
| T8a | `check:career-profile` (BP-12 careers) | 🔧 verify | "careers surface" — verify a careers packet exists/which BP-12 packet provides it before picking | May depend on CONVOY_LOSS; re-check. |
| T1a | `check-encounter-director.mjs` (verify/augment — file EXISTS per T2f note) | 🔧 | none | Scope is verify/augment, NOT create (T2f found it exists). |
| T1b | `check-one-voice.mjs` (voiceArbiter, migrate legacy toasts) | 🔧 | none | |
| T1c | `check-release-soak.mjs` (30-min soak) | 🔧 | none | **Genuinely missing** (AGENTS §11). |
| T3-17 | mining bulk-haul guidance | 🔧 | T3-16 (DONE) | Disjoint files. |
| T3-24 | consolidated `check:massline` + `docs/MASSLINE_MECHANICS.md` | 🔧 | T3-23 (DONE) | Aggregate check + doc. |
| T7a | Fold perf checks into default `check`/`check:ci` | 🔧 | none (CI scripting) | |
| T7b | Headed deep-perf CI runs (quality-preserving) | 🟦 verify | T7a — but "headed" may need a browser/display | Backend if headless; BOTH if it needs visual perf capture. |

### 🔧 BACKEND — needs `lossLedger.js` first (serial after the chokepoint)

| Row | Task | Lane | Real dep |
|---|---|---|---|
| T4c/GHOST_CONVOY_RUMOR | ≥3-loss threshold → patrol_clear/bounty offer | 🔧 | lossLedger |
| **CONVOY_LOSS_INVESTIGATION** (BP-12 hole) | Promote a salvage point with provenance-stamped communicator | 🔧 | lossLedger — **build this to close BP-12** |
| T8c | `check:salvage-anatomy` (BP-01.1 wreck-module anatomy) | 🔧 | T4c |

### 🔧 BACKEND addenda (T5) — verify per-packet; many unblocked independent of T4c/T4d

> DETAIL_DOCTRINE §7 says addenda apply "after the owning wave merges." But most T5 packets don't
> depend on T4c/T4d specifically — they depend on the *owning* shipped system. Verify each packet's
> real `reuses` before picking. Detail docs: `C_combat_encounters.md` (T5a), `F_comms_audio_onboarding.md` (T5b/d), `D_flight_ships_mining.md` (T5c), `G_story_evidence_map.md` (T5e/f).

| Row | Packets | Lane | Likely unblocked? |
|---|---|---|---|
| T5a | BP-02.1 combat readability (9) + BP-02 mining fold (7) | 🔧 mostly (intent-banner *logic*, subsystem targeting) — 🟦 for the banner *rendering* | Mostly yes (combat shipped). |
| T5b | BP-05.1 story/comms (7) | 🔧 (comms routing through voiceArbiter) | Yes (voiceArbiter shipped). |
| T5c | BP-07.1 flight/ship-mass (5) | 🔧 (tuning constants, mass personality data) | Yes (flight V3 shipped). |
| T5d | BP-10.1 audio (7) | 🔧 (audio data, signatures) | Yes (audio shipped). |
| T5e | BP-09.1 builds/synergies (4) | 🔧 (build identity data, module synergies) | Yes (modules shipped). |
| T5f | BP-03.1 map (3) | 🟦 (map-glyph *rendering* is frontend; route-risk *logic* is backend) | Split per packet. |

### 🎨 FRONTEND / VISION — do NOT hand to a backend agent

| Row | Task | Lane | Why vision |
|---|---|---|---|
| **T6 (all)** | 8 asset tasks — 3D model authoring + "is this model a turd?" verification | 🎨 | Broken models *silently* fall back to procedural geometry (AGENTS §7). This is the graphics lane. |
| **T9a** | First-15 proof ritual (screenshot pair) | 🎨 | Explicit screenshot proof. No screenshot = no stamp. |
| **T9b** | 47-A slice green (screenshot pair) | 🎨 | Explicit screenshot proof. |
| BP-11 render handoffs | `stationBubbleRings.js` VFX, `hazardGlyphs.js`, broadcast tic | 🎨 | Logic DONE; the *look* needs verification. |
| T5a (render half) | Intent-banner *rendering*, subsystem-target UI | 🎨 | Logic is backend; aesthetics are frontend. |
| T5f (render half) | Map-glyph *rendering* | 🎨 | Route-risk logic is backend; glyph look is frontend. |
| T9f, HUD/panel polish | Open-ended visual design | 🎨 | Exactly where backend bad taste bites. |

### T9 (LAST — release bar; needs everything + screenshots)

| Row | Task | Depends on |
|---|---|---|
| T9a–T9h | The §15 8-point release gate | All of T4/T7/T8 + screenshots (vision-gated). |

---

## 4. Recommended sequences

### 🔧 Backend agent (Codex) — the long knockout session
```
1. T4c/WRECK_PROVENANCE (build lossLedger.js — the chokepoint)
2. CONVOY_LOSS_INVESTIGATION (closes BP-12's hole; stamps T4b genuinely DONE)
3. T4c remaining (SALVAGE_DISTINCT, SURVIVOR_POD_TRIAGE, SALVAGE_PERMIT, GHOST_CONVOY_RUMOR)
4. T4d / BP-13 bulk (12 packets — largely parallel-safe)
5. T8 unblocked checks (T8d/e/f/g/h/b — verification scaffolding over shipped systems)
6. T1a/T1b/T1c (verification scaffolding)
7. T3-17, T3-24 (loose ends)
8. T7a (CI scripting)
9. T5 backend halves (per-packet verify; the combat/story/flight/audio/builds logic)
STOP before: T9 (needs screenshots), T6 (assets), any 🎨 render half.
```
Stamp the ledger row-by-row as you go. `status` is truth; row number is not.

### 🎨 Frontend/vision agent (separate session)
```
1. T6 asset lane (coordinate via assets/ships/release.__lock/ ownership signals)
2. BP-11 render handoffs (stationBubbleRings, hazardGlyphs, broadcast tic)
3. T5a/T5f render halves (intent-banner, map-glyph rendering)
4. T9a/T9b screenshot rituals (after backend lands the surfaces)
5. T9f, HUD polish
```

### 🟦 Both (two-pass: backend logic → frontend visual)
Any T5 row with a render half, T7b (if it needs visual perf capture). Backend ships logic + a seam;
frontend finishes the render against the seam.

---

## 5. Verification protocol (iterate-to-green — for every row)

1. **Claim** the row (status → IN-FLIGHT).
2. `git add -N` every new file IMMEDIATELY (AGENTS §3.3 — untracked files are deleted between turns).
3. **Implement per the spec** named in the row's detail doc. Reuse shipped systems; emit intents, never
   write single-writer state directly (AGENTS §6: economy→credits, cargo→hold, factions→rep via emit).
4. **Write the check** (the row's `check` column names it). A check that just greps a keyword is
   dishonest — write REAL assertions, run the thing.
5. **Check GREEN** → then **NON-VACUOUS control**: break the implementation (flip a guard, zero a
   constant), confirm the check FAILs, restore, confirm GREEN. This proves the check has teeth.
6. **No-regression floor:** `npm run check:balance` MUST stay green (economy surface). For sim-touching
   work, `npm run check:sim:compare` must fail ONLY on the documented 47-A projectile precondition
   (A/B-prove it: identical failure with your changes stashed). `npm run check:launch-policy` where
   relevant. Run the nearest existing related check.
7. **Stamp DONE** (status → DONE, fill `check` with the passing command).
8. If a check doesn't exist for a row you want to verify, **make one** — the repo's discipline is
   check-driven (every shipped system has a `check-*` script). Iterate the implementation against the
   check until green.

### Known pre-existing failures (NOT your fault — don't try to fix unless the row is yours)
- **`check:sim` / `check:sim:compare`**: fail on the 47-A projectile-collision precondition
  (`sf-sim.mjs:1161`) BEFORE computing a hash. Pass bar = "fails only on this," A/B-proven identical
  with/without your changes. The golden re-record is a separate pending batch.
- **`check:launch-policy`**: pre-existing `finalizeLoadedGame` 3-arg-vs-4-arg mismatch in the
  uncommitted `src/main.js` (AGENTS §3 trap). Only yours to fix if your row touches main.js.
- **`src/render/bloom.js:344` syntax error**: pre-existing, render-lane file. Blocks full registry
  boot in Node; doesn't affect `check:*` scripts (they import modules in isolation).

---

## 6. Honest open questions (verify before building, don't improvise — WAVE4 §7)

- **T8a "careers surface"**: which BP-12 packet provides it? May need CONVOY_LOSS or a careers packet
  not yet identified. Re-check the spec before picking.
- **T5 addenda "after owning wave merges"**: DETAIL_DOCTRINE §7's hard-freeze. Verify each packet's
  real `reuses` — most don't depend on T4c/T4d, but some may depend on a not-yet-merged owning BP.
- **T6f → BP-01.1**: the spec says T6f "blocks BP-01.1." It blocks only the *visual* half (wreck
  anatomy GLBs). BP-01.1 *logic* (lossLedger, salvage verbs) lands fine — flag this so a backend
  agent doesn't stall waiting on assets it can't author.

*This doc is the routing layer. The specs (`detail/*.md`) are the contracts. The ledger
(`PROGRESS.md`) is the task-state truth. The tree is the code truth. When in doubt, re-verify.*
