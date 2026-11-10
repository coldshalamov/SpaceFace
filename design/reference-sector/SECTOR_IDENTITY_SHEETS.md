<!-- LIFETIME: DURABLE -->
# Sector identity sheets — the gated propagation deliverable

```yaml
preparedAt: 2026-08-09
auditBase: e776bf11
status: DESIGN ONLY — GATED. No implementation is authorized by this document.
gate: evaluateCeresHumanReview(...).closesAcceptanceRow === true on the browser runtime
gateStatus: PENDING (both machine-evidence blobs missing; zero human reviews exist)
```

---

## 0. Why this is design and not implementation

The propagation prompt opens: *"Do not begin this task until one reference sector has passed human
gameplay review."*

That precondition is not a figure of speech in this repository — it is a function.
`evaluateCeresHumanReview()` (`scripts/lib/ceresFiveMinuteAcceptance.mjs:697`) requires a
candidate-bound review carrying a named human reviewer, a timestamp, a `KEEP` verdict, and an explicit
boolean judgment on whether the longest zero-visible-activity gap "reads as a brief intentional void."
`npm run check:ceres:five-minute` returns **PENDING**; no such review has ever existed.

**So the two prompts are in reverse dependency order.** The Ceres execution runs first; propagation
becomes gated design output. This document is that output. It is deliberately built so that the day
the gate closes, the work is a matter of executing sheets that already exist — and so that if Ceres
review returns `REVISE`, these sheets are revised rather than four sectors being unbuilt.

---

## 1. Three constraints that shape every sheet

Discovered during the audit; each one kills an obvious approach.

### 1.1 Background art cannot differentiate sectors

24 sectors resolve onto **5 visual profiles** by palette `nebulaTint`. Worse:
`nebulaOpacity` is **0.0 on all five**, and the deep-field composite multiplies both L1 and L2 alpha
by it — so **no sector renders a nebula layer**, while `core`/`belt`/`anomaly` still *bake* L1/L2
textures at `l1Alpha` 0.28/0.48/0.55 that are then multiplied by zero. GPU work whose result can never
be seen.

Ceres is the worst case: the `belt` recipe carries `ribbons: []` and `signatureHero: null`, and is
**test-pinned that way**. Its sky is L0 base plus stars and comets, nothing else.

> **Consequence:** propagating "Ceres identity" cannot go through sky, nebula or palette. It must go
> through **zones, anchors, POI plates, activity pockets and traffic topology.** Any propagation plan
> that treats background as a differentiation lever is planning against a test-pinned wall.

### 1.2 Two of the four candidates share a byte-identical palette

`sector_tethys_junction` and `sector_dione_lane` carry the same `key`/`rim`/`fill`/`ambient`/`fog`/
`nebulaTint`/`dust` values. They are both `faction_mts` core-class. **Color cannot tell them apart** —
their differentiation must be structural, and §3 makes it so.

### 1.3 Ceres does not yet satisfy the variation rule against *itself*

The propagation prompt requires that no two sectors share a traffic topology. Ceres's four pockets
currently share **one**: every actor uses 102 and 116 WU on cardinal axes, six of eight routes are
218.000 WU colinear shuttles ([`WAVE0_CERES_BASELINE.md`](./WAVE0_CERES_BASELINE.md) D3).

> **Consequence:** route topology must be proven to vary *within* Ceres before it is used as a
> differentiator *between* sectors. This is `PQ-045.route-topology`, and it is a hard prerequisite for
> everything below.

---

## 2. What may be generalized from Ceres, and what may not

The prompt warns against generalizing the incidental. Splitting the list honestly:

**Generalize — earned, structural**

| Pattern | Value |
|---|---|
| Camera-local band authoring | primary structure + ≥3 actors inside 0–125 WU of a named anchor |
| Pocket separation | 2074–4540 WU apart reads as distinct places; do not tighten |
| Anchor-relative coordinates | offsets from a named anchor, never sector origin — kills a whole class of drift bug |
| Import-time band assertions | `sectorActivityPockets.js` throws on out-of-band authoring |
| Single-writer yield | `traffic.js:1475` yields to `npcJobsRuntime` for any hull with a `jobId` |
| Census ≠ visibility | authored identity count and camera-visible count are separately named |

**Do not generalize — incidental to Ceres**

| Pattern | Why not |
|---|---|
| 102 / 116 WU marks on cardinal axes | an artifact, not a finding (§1.3) |
| 9 authored identities | sized to Ceres's four pockets; not a target |
| 4 pockets per sector | Dione warrants 2; Veil warrants 3 |
| `hauler`/`miner`/`salvor` mix | Ceres's economy, not the galaxy's |
| The nine-slot cast shape | Pallas needs predators, Veil needs almost no one |

**Do not generalize until measured** — event cadence, prop density, and concurrency. Ceres's numbers
are authored guesses, not observations, because the gate has never run. Recording them now as
"successful" would fossilize an unmeasured guess. Wave 7 fills this in *after* acceptance.

---

## 3. The four sheets

Selected for maximum contrast against Ceres (industrial DMC mining belt) while staying inside the same
civilization. The four **belt siblings** — Vesta Forge, Charon Expanse, Hyperion Cut, Rhea Cinder —
are deliberately **excluded**: same visual profile, same economic identity, near-duplicates of Ceres.
Deepening them first would produce the "twenty-four equally mediocre regions" outcome the prompt warns
against.

---

### Sheet 1 — Tethys Junction (`sector_tethys_junction`) · **first after Ceres**

*6 zones, 2 stations, 6 POIs, 6 neighbors — the galaxy's highest-connectivity sector.*

| Axis | Identity |
|---|---|
| **Economic** | Everything Ceres digs passes through here to be **weighed, taxed and cleared**. Value is created by *paperwork*, not extraction. |
| **Civilian** | Customs officers, brokers, inspectors, queue-waiting haulers, shuttle crews. The first sector where people are *waiting* rather than working. |
| **Criminal** | The black market sits inside the lawful hub's shadow — `zone_tethys_blackmkt` beside `zone_tethys_hub`. The crime is **evasion and forgery**, not violence: mislabelled manifests, a hauler that takes the long way around the weigh point. The existing `heist_launcher` / `lawful_catcher` / `fence_receiver` triangle already encodes this. |
| **Physical** | `zone_tethys_anvil` (`planetary_mass`) gives real gravity — the one candidate where orbital geometry is a tactic. A checkpoint is a **chokepoint**: queues, holding patterns, a lane you must enter slowly. |
| **Visual** | Lit signage, lane markers, queue lighting, transponder gates. **Bright, orderly, crowded.** Against Ceres's dust and work lamps: hard edges and legible authority. |
| **Landmark** | The **weigh point** — a structure every hauler must physically pass through, with a visible queue. Players remember a place they had to wait in. |
| **Absence** | **No extraction. No asteroids being worked. Nothing is made here.** |

**Traffic topology: convergent-and-queued.** Six inbound lanes funnel to one checkpoint and fan out
again. Structurally the opposite of Ceres's point-to-point shuttles — the first genuine topology
contrast, and it needs no new system.

**Reuses:** customs/interdiction props (`transponder_gate`, `interdiction_buoy`); law and patrol job
kinds; `ev_patrol_scans_suspect`. **Needs:** a queue/hold behaviour — likely the largest new
mechanic in the whole plan, and the reason Tethys goes first (it proves the method against something
Ceres did not).

---

### Sheet 2 — Pallas Drift (`sector_pallas_drift`) · **the dark mirror**

*3 zones (`outlaw_zone`, `mining_belt`, `ambush_lane`), `station_drift` + `station_smuggler`, POIs: pirate wreck, hidden cache, quiessence.*

| Axis | Identity |
|---|---|
| **Economic** | The **same work as Ceres with the law removed.** Ore still moves; nobody logs it. Cargo has no manifest, so it has no owner. |
| **Civilian** | There is no civilian class. Everyone is a participant — miners who are also smugglers, a station that does not ask. |
| **Criminal** | Not an activity here, it is the **default**. The interesting inversion: *the player is the anomaly.* A lawful actor in Pallas is the suspicious one. |
| **Physical** | `zone_pallas_ambush` is an authored ambush lane, plus 3 asteroid fields. Denser and more occluded than Ceres — cover is the point. |
| **Visual** | Ceres's industrial vocabulary with the maintenance removed: unlit, unmarked, patched. **Same parts, no upkeep.** |
| **Landmark** | The **hidden cache** (`poi_hcache`) — a thing you can only find by watching who goes there. |
| **Absence** | **No patrol. No law response. No rescue.** Nothing comes when you call. |

**Traffic topology: furtive and intermittent.** No scheduled routes. Actors appear, transact, and
leave; long deliberate silences. Directly exercises the "intentional void" judgment the Ceres human
review gate turns on.

**Reuses:** the largest reuse of all four — same props, same job kinds, same hulls, **materially
differentiated**. This is the sheet that proves *reuse creates coherence, composition creates
identity*. **Needs:** almost no new asset. Its cost is behavioural, not artistic.

---

### Sheet 3 — Veil Nebula (`sector_veil_nebula`) · **the environmental antagonist**

*4 zones (`civilian_core`, `nebula_fog`, 2× `anomaly_deep` including a wormhole), 1 station, `faction_free`. `fogDensity` 0.00012 — **6× Ceres**.*

| Axis | Identity |
|---|---|
| **Economic** | **Knowledge, not matter.** Survey data, anomaly readings, wormhole telemetry. Nothing is hauled. |
| **Civilian** | Researchers and long-duration survey crews. Very few people, staying a long time — the inverse of Ceres's many people passing through. |
| **Criminal** | **Theft of data and of position.** Claim-jumping a survey mark; selling a wormhole vector. Crime here is quiet and has no cargo. |
| **Physical** | The fog itself. The one sector where **the environment is the antagonist** — sensor range is the resource, and the wormhole is a physical feature with real geometry. |
| **Visual** | Genuinely dark and enclosed, lit locally. The one candidate whose identity survives §1.1, because fog is **not** the dead nebula layer — it is a separate live system. |
| **Landmark** | The **wormhole** (`poi_wormhole`) — already built, already unique, needs no new hero asset. |
| **Absence** | **No industry, no traffic lanes, no law, almost no other ships.** Deliberately the emptiest sector — its contribution to the galaxy's rhythm is *quiet*. |

**Traffic topology: radial from one station, sparse.** One origin, few actors, long dwell.

**Reuses:** surveyor job kind; `sensor_mast`; `ev_rich_seam_strike` retargeted to an anomaly mark.
**Needs:** fog-as-mechanic (does sensor range actually shrink?) — this is a **question to answer, not
an assumption to build on**. If the answer is no, Veil drops behind Dione.

---

### Sheet 4 — Dione Lane (`sector_dione_lane`) · **the terminus**

*3 zones (`trade_lane`, `border_checkpoint`, `patrol_corridor`), 2 stations, **exactly one neighbor**.*

| Axis | Identity |
|---|---|
| **Economic** | A **cul-de-sac**. Everything that enters must leave the same way. Goods terminate here rather than passing through. |
| **Civilian** | Settled, unhurried, residential. People who **live** somewhere rather than working or transiting. |
| **Criminal** | Almost none — and that is the point. A dead-end is a **terrible** place to commit a crime: one exit, one patrol corridor. Crime here is *pressure from outside*, not local. |
| **Physical** | One lane in, one lane out, a patrol corridor between. The most **constrained** navigation in the galaxy. |
| **Visual** | Must differ from Tethys **without** color (§1.2): softer, lower, more horizontal; residential lighting instead of signage; fewer, larger structures. |
| **Landmark** | The **relay** (`poi_dione_relay`) at the end of the line — the last thing before nothing. |
| **Absence** | **No through-traffic, no frontier, no ambush lane.** The only safe sector, and safety is its identity. |

**Traffic topology: linear, tidal.** Traffic flows in, dwells, flows out. Two pockets, not four.

**Reuses:** civic props, patrol job kind. **Needs:** the least of any sheet — which is exactly why it
is **fourth**. It is the validation case: if the method can make a *quiet, safe, small* sector feel
authored, it generalizes. It is also the honest test of §1.2, since it shares Tethys's palette exactly.

---

## 4. The variation matrix — required by the prompt, verified distinct

| Axis | Ceres | Tethys | Pallas | Veil | Dione |
|---|---|---|---|---|---|
| Pocket layout | 4 separated | 6 convergent | 3 occluded | 4 radial | 2 linear |
| Landmark class | monumental wreck | civic chokepoint | concealed cache | spatial anomaly | terminal relay |
| Occupational mix | miner/hauler/salvor | inspector/broker/patrol | smuggler/predator | surveyor/researcher | civilian/patrol |
| Event distribution | work + logistics | law + crime | crime + accident | environmental | civilian |
| Hazard | collision + ambush | interdiction | predation | environment | none |
| Traffic topology | point-to-point | convergent-queued | furtive-intermittent | radial-sparse | linear-tidal |
| **Absence** | no civilians | no extraction | no law | no industry | no danger |

No row repeats a value. The **Absence** row is the discipline that makes the others hold — deciding
what a place *lacks* is what prevents four sectors from converging into one.

---

## 5. Gate and sequencing

```
Ceres slice → five-minute gate machine evidence (browser + electron)
            → human review KEEP
            → Wave 7 recipe extracted from MEASURED values
            → Tethys (proves the method transfers)
            → Pallas (proves reuse ≠ repetition)
            → Veil   (proves a non-industrial identity)
            → Dione  (proves a quiet sector can be authored)
            → only then consider the remaining 19
```

**Do not start Tethys before the Ceres human review returns KEEP.** Not process ceremony: if the
review returns `REVISE`, the defect is in the *method*, and four sectors built on it would need
rebuilding. That is the exact failure the prompt's opening line exists to prevent.

**Prerequisite inside Ceres:** `PQ-045.route-topology` (§1.3). Ceres must satisfy the variation rule
against itself before it can be a template.

## 6. References

- [`BINDING_REVIEW_AND_SELECTION_LEDGER.md`](./BINDING_REVIEW_AND_SELECTION_LEDGER.md) · [`WAVE0_CERES_BASELINE.md`](./WAVE0_CERES_BASELINE.md) · [`ADMISSION_ROUTE.md`](./ADMISSION_ROUTE.md)
- `src/data/sectors.js` · `src/data/sectorZones.js` · `src/data/sectorAnchors.js` · `src/data/sectorVisualProfiles.js`
- [`CAMERA_VISIBLE_BUBBLE.md`](../graphics-sprints/CAMERA_VISIBLE_BUBBLE.md)
