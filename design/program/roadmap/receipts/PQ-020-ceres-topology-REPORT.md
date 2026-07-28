<!-- PROGRAM_EVIDENCE_RECEIPT
packetId: PQ-020
leafId: PQ-020.ceres-topology
acceptance: focused_green
disposition: PASS
candidateCommit: 6c08de8b85eb4d767c47880777852b9453d1e87a
-->

# PQ-020 — Ceres activity-pocket topology: continuation evidence

Branch `claude/pq020-proofs-20260728`, based on the pinned `c6d83fe4`.

**`candidateCommit` convention:** the tip of the code+test work (`6c08de8b`). This receipt is
committed separately, *after* that sha, so the receipt commit is deliberately not the candidate — the
candidate is the last commit whose content the gates below were run against.

## What this adds, and what it deliberately does not

This continues the landed PQ-020 data slice (`9b0c1c28`). It does **not** rebuild it. The entire
change is evidence: **six files, 1838 insertions, 0 deletions, and zero `src/` files touched.**

```
package.json                           (one check:pq020:proofs alias)
scripts/check-pq020-ceres-topology.mjs (evidence surfaced in the check output)
scripts/lib/pq020CeresProofs.mjs       (new — the proof builders)
scripts/lib/pq020CeresTopology.mjs     (matched-baseline sibling + continuation gates)
test/pq020-ceres-proofs.test.mjs       (new)
test/pq020-ceres-topology.test.mjs     (matched-baseline invariant + drift cases)
```

Because no `src/` file is touched, golden risk is structurally zero rather than argued — and
`check:sim:compare` is `hashEqual: true` accordingly. No job was injected, no station/gate/field/POI
was moved, no new condition system was authored, and the Cathedral reservation at local `(300, 2700)`
/ global `(-11988, 10892)` is consumed exactly as PQ-018 owns it.

| Commit | Subject |
|---|---|
| `ece08405` | feat(pq020): prove Ceres pocket topology through live headless owners |
| `bf4fb267` | test(pq020): gate the Ceres continuation proofs |
| `6c08de8b` | fix(pq020): replace two unfalsifiable rows with real observations |

`6c08de8b` is the result of an adversarial review of this receipt's own evidence. It removed two
gates that could not fail and one claim the evidence did not carry; the details are recorded inline
below rather than quietly corrected.

**Note on write surface.** The brief named `scripts/lib/pq020CeresTopology.mjs`; the proofs live in a
new sibling, `scripts/lib/pq020CeresProofs.mjs`, in the same pq020 harness lane. This was a
readability call (the alternative was a ~1500-line single file), not a scope claim — flagging it
explicitly so the integrator can rule on it.

## 1 — Natural jobs across held-out seeds (no injection)

**Seeds `90731 / 90737 / 90743`.** Fixed *before* any run; `grep -rn "\b<seed>\b" test/ scripts/ src/`
returned zero hits for each. Disjoint from every seed the repo already burns: `47` (sf-sim golden and
the PQ-020 structural harness), `1–123` (npc-jobs kernel), `31` (encounter-director soak),
`90218/90219/90223` (PQ-014 census). **No seed was swapped after seeing a result.**

The fixture spawns exactly one inert player hull (`collides:false`) and then hands off to the real
`world.enterSector`, which builds the actual Ceres stations/gates/fields/POIs/zones and the Cathedral
World Site. `traffic` reacts to the resulting `sector:enter`; `npcJobsRuntime` adopts hulls through
the producer seam traffic already calls. **The fixture contains no `createJob` and no
`npcJobs.assign` call site at all.**

The A/B counterfactual removes only `industries`, installed on the live `state.world.sectors`
overlay that `world.enterSector` prefers over the module record (the same per-state overlay
`factions.js` already writes). Geometry is identical between arms; `SECTORS` is never mutated.

**That the A/B actually reached the producer is observed, not assumed.** The fixture subscribes to
`sector:enter` and records the payload `traffic.js` itself consumes. Across the three seeds:
`observedIndustriesMining`/`Refinery` are **`true` in all three metadata arms and `false` in all
three counterfactual arms**, with exactly one `sector:enter` per run. This is the gated row.

| Seed | Traffic roles (with metadata) | Natural jobs | Industrial share | Counterfactual roles | Counterfactual jobs | Counterfactual share |
|---|---|---|---:|---|---|---:|
| 90731 | escort 1, hauler 1, miner 1 | hauler 1, miner 1 | 0.667 | escort 1, hauler 1, miner 1, patrol 1 | hauler 1, patrol 1 | 0.500 |
| 90737 | miner 2, patrol 1 | miner 2, patrol 1 | 0.667 | miner 1, patrol 2 | miner 1, patrol 2 | 0.333 |
| 90743 | hauler 2, miner 1, patrol 1 | hauler 2, patrol 1 | 0.750 | escort 1, hauler 2, miner 1 | hauler 2 | 0.750 |

Aggregate natural jobs across the held-out set: **hauler 3, miner 3, patrol 2**; **3/3 seeds produced
an industrial job** with zero injection.

The shipped weighting rule, using the *live stateful* mix (`trafficRoleMixForSector(sector, state)`,
which includes `regionalTrafficRoleWeights`, not the stateless convenience value):

- miner `74.0` with metadata vs `29.6` without → **+44.4 every seed**
- hauler `74.25` with metadata vs `49.5` without → **+24.75 every seed**

**These two numbers are a characterization, not independent evidence, and are deliberately not
gated.** The harness derives both arms' weights itself from the same records it supplied, so
asserting the delta would only assert that a pure function is pure. They document what the shipped
rule does; the *causal* gate is the observed `sector:enter` payload above, and the corroborating
observation is that the two arms produce different live populations (seed 90731: 3 hulls vs 4; seed
90743: `hauler 2/miner 1/patrol 1` vs `escort 1/hauler 2/miner 1`). That population difference is
reported, not gated — two arms could coincidentally coincide on some seed, and gating "must differ"
would manufacture a flake.

**Honest limit on the realized population.** Ceres runs `trafficPerMin: 10`, so each seed embodies
only 3–4 ambient hulls. The realized industrial share rises in 2 of 3 seeds and is unchanged in the
third (90743). The owner-level weight delta is deterministic and identical in all three; the
population sample is too small to resolve a per-seed share shift, and this receipt does not claim
otherwise.

**Lifecycle advancement is NOT claimed here.** Ceres carries `enemyDensity 0.18` and an authored
ambush zone, so ambient hostiles spawn within the `npcJobsRuntime` `FLEE_RADIUS` (520 WU) of freshly
commissioned civilian hulls — measured nearest-hostile distances were `304.8`, `159.8` and `108.2` WU
— and the kernel threat interrupt holds them in `flee`. That is a real live-sector characteristic,
recorded rather than engineered around. The advancement claim stays with its owner,
`npm run check:npc-jobs` (`test/npc-jobs-natural-census.test.mjs`). The validator fails closed if this
harness ever starts claiming advancement (`naturalJobs:advancement-overclaim`).

### Offscreen projection determinism (reported separately)

| Seed | Intents | Digest | Counterfactual digest | Stable on repeat |
|---|---:|---|---|---|
| 90731 | 3 | `4282242184` | `4103333171` | yes |
| 90737 | 3 | `958826143` | `589252044` | yes |
| 90743 | 3 | `2811138051` | `1473558216` | yes |

`roleMixBias` with metadata is `miner 2.2 / hauler 1.4`; without it, both fall to `1`. This is
projected **intent**, not a claim of visible traffic, and the report says so in-band.

## 2 — One bounded mechanical condition through an existing owner

**Outcome: BOUND and PROVEN. No blocker.** The live schema already supported it, so nothing new was
authored.

The condition is the authored `dense_asteroid` hazard at local `(600, -400)`, radius `700`, intensity
`0.5`, whose centre already lies inside the production pocket `zone_ceres_belt` at `(500, -700)`
radius `850`. **It was not moved, re-authored, or replaced** — the binding already existed; what was
missing was proof.

Proven consequence chain, all existing owners:

```
src/data/sectors.js hazards[]
  → src/systems/world.js _spawnHazards (local→global once) / _tickHazards (player-in-disc)
  → bus hazard:enter / hazard:exit
  → src/data/hazardLanguage.js hazardHints (registry.js:271, nodeSystemFactoryTable.js:259)
  → state.ui.hazardRead + one voice warn
```

Observed in live headless sim: outside the disc `hazardRead` is `null`; inside, exactly one
`hazard:enter{zoneType:'dense_asteroid', intensity:0.5}` fires and `hazardRead` becomes
`{ glyph '◆', damages ['hull on collision'], counterplay ['avoid','time','tether'] }`; on leaving,
exactly one `hazard:exit` fires and the readout clears to `null`.

- **Observable player decision** — the counterplay contract names real verbs: route around, slow the
  crossing, or tether through.
- **Bounded** — a finite disc, radius 700 WU.
- **Owner-controlled** — ordinary authored hazard data; no new system.
- **Accessible** — a glyph plus literal verbs and a damage tag; colour is never the only channel.

Measured structural backing for the decision (existing colliders only, no simulated flight, no
frame-time claim): collidable rock density **inside** the disc is `16.89` per million WU² against
`1.188` outside within the sector — a **14.217× ratio**. The pocket is genuinely a denser crossing.

**Reported against interest:** a one-waypoint perpendicular bypass does *not* reduce rock exposure
here. Direct chord: `4417.148` WU, 22 collidable rocks in a 220 WU corridor. Left bypass: `4952.656`
WU, 30 rocks. Right bypass: `4952.656` WU, 36 rocks. Both sides are reported so the comparison cannot
be cherry-picked; `bypassReducesRockExposure` is `false`.

**Honest negative row.** The other live consumer of `activeSector.hazards` —
`playerIsInLaneDanger` in both `src/systems/ai.js` and `src/systems/scanner.js` — is gated behind
`security <= 0.45 || tier >= 2`. Ceres is security `0.72`, tier `1`, so **it does not fire here**.
Raising tier or lowering security to make it fire would be changing the world to make a proof pass;
that was refused.

## 3 — Save / materialization / re-entry idempotence

Three consecutive `world.enterSector` calls plus two `save.loadEnvelope` Continues, all compared
field-for-field:

| Row | After enter ×1 / ×2 / ×3 | After Continue | After Continue ×2 |
|---|---|---|---|
| Beacon entities (`poi_ceres_throughline`) | 1 / 1 / 1 (same entity id 100) | 1 | 1 |
| Cathedral World Site entities | 15 / 15 / 15 | 15 | 15 |
| Zones | 5 / 5 / 5 | 5 | 5 |
| Map point ids / map zone ids | identical | identical | identical |
| Offscreen projection (recomputed) | `2416862514` | `2416862514` | `2416862514` |

Save envelope version **12**; both Continues accepted. Static content materializes **exactly once**;
topology, zone set and map identity are byte-identical across every re-entry and Continue.

**Correction — the projection row is invariance by construction, not a survived-save result.**
An earlier draft of this receipt claimed "the offscreen projection audit survives save". It does not
carry that weight and the claim has been withdrawn. `projectSectorEmbodiment` is a pure function of
authored sector data plus a fixed seed/epoch; the snapshot passes it no state, so the digest would be
identical even with `save` removed from the harness entirely. Further, this harness's system subset
is `world`, `asteroidSites`, `save` — `sectorSim` is absent, so **no projection state is serialized
here for save to round-trip**. The field is now named `offscreenProjectionRecomputedDigest` and the
report carries `offscreenProjectionPersistence { claimed: false, invariance: 'by-construction' }`,
naming `npm run check:m2:sector-embodiment` as the owner of any persisted-projection claim. The
validator fails closed (`reentryIdempotence:projection-persistence-overclaim`) if that row is ever
re-dressed as a persistence result. What the recomputed digest still buys is a drift canary on the
authored record.

**Open row created by this correction:** a *persisted* offscreen-projection audit surviving save is
unproven by this packet and belongs to the sectorSim/embodiment owner.

## 4 — Exact agreement (dual-frame)

The map contract is dual-frame and this harness never conflates the two: **system-map point `x/z` are
GLOBAL; `drawPos` and zone `x/z` are SECTOR-LOCAL.** All 5 rows agree exactly, with zero mismatches.

| Row | Authored local | Global | Map point (global) | drawPos (local) | Course (global) | Physical (global) |
|---|---|---|---|---|---|---|
| beacon `poi_ceres_throughline` | (3040, −920) | (−9248, 7272) | (−9248, 7272) | (3040, −920) | (−9248, 7272) | (−9248, 7272) |
| pocket:civic `station_ceres` | (−1100, 620) | (−13388, 8812) | (−13388, 8812) | (−1100, 620) | (−13388, 8812) | (−13388, 8812) |
| pocket:production `zone_ceres_belt` | (500, −700) r850 | (−11788, 7492) | — (zone) | — | — | zone local (500, −700) r850 |
| pocket:transit `zone_ceres_throughline` | (3155, −955) r500 | (−9133, 7237) | — (zone) | — | — | zone local (3155, −955) r500 |
| cathedral `world_site_wreck_cathedral` | (300, 2700) | (−11988, 10892) | (−11988, 10892) | (300, 2700) | (−11988, 10892) | (−11988, 10892) manifest + materialized |

The Atlas leg is proven too: atlas `globalPos` matches for beacon, civic and cathedral.

The two zone rows have no system-map point and no course target — zones are drawn as discs, not
selectable points, and a zone is not a course target (the beacon inside it is). That absence is
**recorded with its reason**, not faked. Every row declares its `required` consumers and a missing
consumer is a hard failure, so **no row can pass vacuously** — the specific guard shape that lets a
broken map contract look green.

## 5 — Routing honesty

Asked of the real owner, `computePreviewRoute` in `src/ui/galaxyMap.js`:

- `computePreviewRoute(state, 'sector_helios_prime', 'sector_tethys_junction')`
  → `['sector_helios_prime', 'sector_tethys_junction']`
- **`traversesCeres: false`** — generic Helios↔Tethys routing **BYPASSES Ceres** via the direct
  authored edge. PQ-020 does not and must not claim otherwise.
- Ceres is reachable in one hop from both endpoints (`helios→ceres` and `ceres→tethys` are each
  direct), so the bypass is a router preference, not an isolation defect.

The deliberately-selected through-Ceres itinerary (pilot-selected, explicitly **not** router output),
with every waypoint pinned to the live authored record so it cannot silently drift:

| Leg | From → To | WU |
|---|---|---:|
| 1 | Ceres Refinery (−1100, 620) → Belt Outpost (780, −940) | 2442.949 |
| 2 | Belt Outpost → Throughline Weigh Beacon (3040, −920) | 2260.088 |
| 3 | Throughline Weigh Beacon → Wreck Cathedral (300, 2700) | 4540.044 |
| | **Total** | **9243.081** |

This is distinct from the pre-existing pocket-centre route (`9379.334` WU), which measures zone
centres rather than the objects a pilot actually visits. Both are emitted.

## 6 — Matched baseline

`matchedBaseline` is a **sibling** of `structuralCost`, never a mutation of it. The pinned digest
`b2232d1d891f6d65b2e4420387a23223e0325a0e14971d046bd86ef61ddafc2d` is **unchanged and re-verified**;
folding new fields into `structuralCost` would have forced a re-pin, and a re-pinned golden is not
evidence. A dedicated test asserts this invariant.

- matched-baseline digest `98780b8b063e01f54530c2b410f303dbba9da41c3b713adc9cb08db1bac8e398`
- map-layout digest `ba799f7ab9c743f41942567171c9fb4eb2d2b18496ed32f8f3cb2d56d462974f` (5 zones,
  11 points, both frames retained)
- receipt digest `bf83c506ac39b9361d24f57b7d571e65f78119043994aa8740546774568a9f83`

Headless rows populated: map layout, route legs (pocket route + through-Ceres itinerary + generic
verdict), natural-job census per seed, offscreen role mix/digest per seed, and structural counts
(`124` entities — 90 asteroid, 12 fx, 2 ship, 6 station, 14 wreck; `105` collidable; `105` colliders;
`0` focused-scope spatial queries/candidates; `15` Cathedral World Site entities; residency `FULL`;
admission `headless`).

Headed rows are **all `null` with `requiresHeaded: true`** and `blockedBy: PQ-034`:
`frame.p95Ms/p99Ms/hitchCount`, `admission.admissionMs/residencyBytes`,
`renderer.drawCalls/shaderPrograms`, `visualStates.close/default/far/motion/appliedLod`. The
validator treats any non-null headed value as **fabricated evidence** and fails.

## Gates

| Gate | Result |
|---|---|
| `npm run check:pq020:ceres-topology` | **PASS** — `structuralCostDigest` still `b2232d1d…` |
| `node --test test/pq020-ceres-topology.test.mjs` | **PASS** 6/6 |
| `node --test test/pq020-ceres-proofs.test.mjs` | **PASS** 8/8 |
| `npm run check:pq020:proofs` (new alias) | **PASS** 14/14 (re-run after `6c08de8b`) |
| `npm run check:sector-geography` | **PASS** |
| `npm run check:atlas-integrity` | **PASS** |
| `npm run check:atlas-spatial-truth` | **PASS** |
| `npm run check:atlas-place-path` | **PASS** |
| `npm run check:map-frames` | **PASS** |
| `npm run check:m2b:sector-graph` | **PASS** |
| `npm run check:m2:sector-embodiment` | **PASS** |
| `npm run check:npc-jobs` | **PASS** |
| `npm run check:sim:compare` | **PASS — `hashEqual: true`**, `firstDivergentTick: null`, no diffs |
| `npm run check:baseline` | **PASS** — 10/10 green, 62795 ms wall against a 90000 ms budget |
| `git diff --check` | clean |

`check:pq020:ceres-topology` and `check:pq020:proofs` were re-run against `6c08de8b`
(`structuralCostDigest` confirmed still `b2232d1d…`). The atlas / geography / npc-jobs / sim-compare /
baseline set was **not** re-run after `6c08de8b`: that commit touches only the two pq020 harness files
and the two pq020 test files, no `src/`, so nothing those gates cover can move. Stated explicitly so
the integrator can re-run them if that reasoning is not accepted.

**One flake, recorded for honesty.** The first `check:baseline` run failed with 3 red 47a children
(`debris-sling`, `recovery-contested`, `civilian-priority`), each a native crash
`status 3221226505` (`0xC0000409`, STACK_BUFFER_OVERRUN) in the Rapier backend. Attribution: the 47a
chain contains zero references to any pq020 file, and my diff touches no `src/`. The exact failing
command was then run standalone on both `rapier-dynamic` and the default backend — **both exit 0** —
and a clean `check:baseline` with nothing else running was **10/10 green**. Cause: resource pressure
from my own concurrently-running gate batches. Classified as an environment flake, not a red, and not
attributable to this change.

Inherited reds named in the brief (`check:economy:anti-exploit`, `check:mission-cargo-loading`) were
not run and not chased.

## Open rows — all blocked on the PQ-034 lease

PQ-034 holds performance-evidence / validation-broker / browser-gpu. No validation-broker run, no
Electron, no performance or L4 capture was attempted.

- **Headed route receipt (relocated PQ-018 Phase 4).** Matched before/after route through
  refinery → Belt Outpost → beacon → Cathedral on target and floor profiles, with real p95/p99/hitch
  counts, map-open and sector-entry cost, render admission, GPU residency, draw/program counts, and
  close/default/far/motion/applied-LOD states. This is relocated PQ-018 verification, not optional.
- **Browser/Electron acceptance** — `npm run check:assets:live`, `npm run check:visual-stability`.
- **Accessibility route review** — keyboard, pointer and controller map selection of the beacon and
  Cathedral; label/inspector non-color semantics at real render scale. The hazard readout's
  non-colour semantics are proven structurally here, but *perceptual* legibility is a headed claim.
- **Perceptual pocket distinctness** — whether civic / production / transit / graveyard read as
  distinct at map and flight scale, as opposed to the mathematical separation proven here.
- **Independent human-eye art verdict** on the Cathedral and the beacon.
- **Persisted offscreen-projection audit across save** — see the §3 correction. Not blocked on
  PQ-034; blocked on scope. Owner: the sectorSim/embodiment lane
  (`npm run check:m2:sector-embodiment`). This packet proves invariance-by-construction only.
- **Final receipt / global promotion** — integrator-owned.

## Blockers

None for the deliverables in scope. The mechanical-condition deliverable resolved to *bound and
proven* rather than a missing-owner-seam blocker, so no owner packet is requested. No shared-owner
edit was needed: galaxy-map, Atlas-index, traffic, embodiment, renderer, save-schema and registry
code are all untouched.

## References

- [`../active/PQ-020.md`](../active/PQ-020.md) — packet (not edited; it is outside this lane's write surface)
- `scripts/lib/pq020CeresProofs.mjs`, `scripts/lib/pq020CeresTopology.mjs`
- `test/pq020-ceres-proofs.test.mjs`, `test/pq020-ceres-topology.test.mjs`
