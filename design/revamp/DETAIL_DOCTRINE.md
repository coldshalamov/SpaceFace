# DETAIL DOCTRINE — the anti-flatness constitution

> **THE ONE FILTER (print this at the top of every detail brief):**
> ## *A detail earns its place only if the player can **see** it, **predict** it, or **change** it. If none of the three, it's not detail — it's cost.*
>
> This single sentence turns the 500-item quarry (`DETAIL_BRAINSTORM_R2.md`) into the ~150 that actually kill
> the flat, empty, cheap feeling — and it's what keeps Wave 3+ from becoming the same flat game with more nouns.

**Thesis.** *Flatness is not missing features — it's features the player can't see, predict, or affect. Every
system must be visible, legible, causal, and emotionally charged. Detail is not decoration; it is the causal
chain made perceptible.* SpaceFace already has deep systems (economy, factions, danger field, AI stack, mining);
the revamp's job is to make them **perceptible**. Almost every high-value "detail" here is *surfacing a system
that already exists*, not building a new one.

---

## 1. Load-bearing rules (GATE-BLOCKING — a packet that violates one is rejected at review)

| Rule | How it's enforced in this codebase |
|---|---|
| **No random spawn without provenance** | `encounterDirector` plans deterministically; wreck fields seed from `sectorSim` offscreen losses — "who died here?" must be answerable. |
| **No enemy without readable intent** | An **intent banner** over the SG-06 state the ship is already in (Intercepting / Fleeing / Scanning / Tethering / Overheating / Calling-Reinforcements). |
| **No economy change without cause** | A **"why prices changed" tooltip → cause ledger**, sourced from the `dangerModel`/`sectorSim` driver; `marketNews` already surfaces the headline. |
| **No UI without decision** | Every glyph / marker / panel maps to a player action. If it informs nothing actionable, cut it. |
| **Delete old path when new path ships** | The one-`galaxyMap` cutover; every future replacement removes its predecessor (no "two-and-a-half maps"). |
| **One source of truth for tuning** | Constants live in `src/data/*`, never duplicated across systems. |
| **Budgets are hard caps** | comms/min (**`voiceArbiter` already enforces**), map-glyph, ship/station-silhouette, VFX-per-significance, entity-per-role. |
| **Gold-packet format is mandatory** | No packet enters a wave without the full §4 schema. |

## 2. Corollary rules (hygiene — one line each, not gate-blocking but expected)

No faction without behavior · no station without purpose · no POI without payoff · no mission without consequence
· no lore without embodiment · no feature without counterplay · no procedural generator without validation · no
heroic object as primitive geometry in release.

## 3. The pillar filter (every packet names the pillar it serves — a packet serving none is CUT)

1. **Momentum is the toy** — express it through physics (mass, tether, slingshot, impulse), not a menu.
2. **Read the battlefield at a glance** — silhouette, colour, motion, glyph all carry meaning.
3. **One voice at a time** — all player-facing text through `voiceArbiter`; never two at once.
4. **The universe was here before you** — traffic, prices, factions, wrecks exist and change without the player.

**Two proof surfaces.** Every packet is ranked by its visibility on the **first-15-minutes** ritual (§6 of
`REVAMP_MASTER`) and the **47-A "Mass Discrepancy" slice**. Ranking rule: **(distance from an already-shipped
system) × (visibility in first-15 / 47-A).** A packet that *transforms a shipped system and shows in the first
15 minutes or 47-A* ranks highest; new machinery the player won't see for hours ranks low.

---

## 4. The gold-packet schema (the mandatory deliverable format)

Every curated detail is authored as a **gold packet** with these fields — no exceptions:

```
- name:            <short, verb-forward>
- fantasy:         <one line: what the player feels>
- pillar:          <momentum-toy | glance | one-voice | world-was-here>  (one or more)
- wave/BP:         <e.g. W3 / BP-11>
- reuses:          [<named existing systems/files this SURFACES — not reinvents>]
- newFiles:        [<new files only; obey the merge protocol>]
- noTouch:         [<hot files a lane must NOT edit; orchestrator integrates>]
- budget:          spawn:<n via spawnBudget|none>  voice:<channel|none>  draw:<+n|none>
- rng:             <seeded domain, or "none / pure UI">
- acceptance:      <the check / observable proof it works>
- failureModes:    <how it could read flat, break determinism, or blow a budget>
- size:            <S | M | L>
```

## 5. The four-way triage (how all 500 map to work — every item goes to exactly one)

| Bucket | Meaning | Destination |
|---|---|---|
| **(a) Surface** | An already-shipped system the player can't *see* yet | Detail pass on the owning lane; often trivial (a glyph, a tooltip, a bark). |
| **(b) Enrich** | A detail-pass on an already-planned BP | **Addendum doc `BP-0X.1_*`**, applied *after* the owning wave (hard-freeze rule §7). |
| **(c) New packet** | Genuinely new machinery | **BP-11 / BP-12 / BP-13** (capped at three — see `DETAIL_PACKETS.md`). |
| **(d) Cut / Defer** | See §8 | Cut (violates a decision) or deferred to backlog (gold-plating). |

**Convergent validation (NOT new work).** The brainstorm independently re-derived shipped systems:
global-comms-cap ≡ `voiceArbiter` · station-news-ticker ≡ `marketNews` · sector-identity ≡ `sectorZones` ·
ambush-from-cover ≡ `encounterDirector` shapes · one-line-ownership ≡ `voiceArbiter` priority queue. When you
meet these, mark them **validated**, don't rebuild them.

## 6. The three new BPs (cap: three — everything else folds)

| BP | Owns | Depends on |
|---|---|---|
| **BP-11 Sector Atmosphere & Station Life** | postcards on arrival, station orbit bubbles (dock/patrol/no-fire rings), broadcast behavior, station side-events, type silhouettes, hazard language | `sectorZones`, `world.js`, `marketNews`, `dockDeny`, BP-08 assets |
| **BP-12 Causal Economy Missions & Contracts** | economy-born missions, cause ledger, customs/contraband gameplay, the contracts engine | `dangerModel`+`sectorSim` ("gold ore"), `economy`, `marketNews`, `missions` |
| **BP-13 Pirate Ecology & Named Characters** | pirate doctrines, aces (flee-and-remember + faction news), rumor heat, bounty hunters — **all `spawnBudget` clients** | `encounterDirector`, `enemies`, `barks`, `scanner` hostility, `marketNews` |

**Folds (no new BP):** salvage-depth + wreck-provenance-from-`sectorSim`-losses → **BP-01**; combat readability /
intent banner / subsystem targeting / encounter-verbs → **BP-02 addendum**; comms cadence + audio signatures →
**BP-05 / BP-10 addendum** (through `voiceArbiter`); ship-mass personality / build identities / module synergies →
**BP-07 / BP-09 addendum**; first-15 proof ritual → **`REVAMP_MASTER` named proof surface**.

## 7. Concurrency — HARD FREEZE while a wave runs (not merely additive)

Additive edits still shift interpretation between agents who read a doc at different times. Therefore:
- **Zero edits to a lane doc (BP-02/05/07/10) while its wave runs.** Doctrine + new packets are **new files only**
  (`DETAIL_DOCTRINE.md`, `BP-11/12/13`, `BP-0X.1` addenda), pointed to from `REVAMP_MASTER`.
- Detail passes land as **separate addendum docs applied in a later pass**, never inline.
- **One exception:** if curation reveals a live wave is building the *wrong thing* (a conflict, not an enrichment),
  that is a **stop-the-line message to the live session**, not a doc edit. (Reviewed: intent banners, comms
  cadence, ship-mass personality all layer *on top of* Wave 2 — expect zero interrupts.)

## 8. Cut / Defer

| Criterion | Action | Named examples |
|---|---|---|
| **Violates a settled decision** | **Hard cut, no appeal** | #257 keep-two-maps (we unified to `galaxyMap`); any spawn not arbitrated by `spawnBudget`; any comms not through `voiceArbiter`. |
| **Already shipped (reframed)** | **Mark validated** | global-comms-cap, station-news-ticker, sector-identity substrate, ambush-from-cover. |
| **Gold-plating** | **Defer to backlog** | used-ship market w/ history, Newtonian trick medals, training rings, adaptive music state, boarding/slaver branches, gate sabotage. Real ideas, wrong decade. |
| **Fights determinism/perf** | **Cut or reshape** | per-frame flavor rolls without a seeded domain; unbounded ambient VFX. (VFX-*as-budget* is fine; unbounded is not.) |

---

*This doctrine governs Wave 3 onward and every future revamp wave. `DETAIL_PACKETS.md` is the wave-mapped,
ranked list of packets built under it; `BP-11/12/13` and the `BP-0X.1` addenda are where they live.*
