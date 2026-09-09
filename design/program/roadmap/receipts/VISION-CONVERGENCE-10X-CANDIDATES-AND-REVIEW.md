<!-- LIFETIME: VOLATILE -->
# Vision-convergence 10x — candidate pool + cold review

```yaml
refreshed: 2026-08-10
commit: 152194eb+
tranche: INFERENCE 10x vision-convergence
```

Scoring 0–5 on: North Star, player-visible delta, systemic multiplication, distinctness,
craft/spectacle, feasibility, reusability. Cost/risk noted separately. Disposition is cold review
after implementation evidence (tests driving shipped seams).

## Candidate pool (≥30)

| # | Candidate | Scores (NS/vis/sys/dist/craft/feas/reuse) | Sum | Disposition |
|---|---|---|---:|---|
| 1 | Craft-on-craft baseline damage (>0) | 5/5/5/4/4/5/5 | 33 | **KEEP → U1** |
| 2 | Ram Plate as multiplier on baseline | 4/4/4/3/3/5/5 | 28 | **KEEP → U1** |
| 3 | Massline whip suppress craft double-count | 4/3/5/4/3/5/4 | 28 | **KEEP → U1** |
| 4 | Raise spawn DEFAULT_MAX to swarm scale | 5/5/4/3/3/5/4 | 29 | **KEEP → U2** |
| 5 | Bias encounter squads to [4,6]+ lights | 5/5/4/3/3/4/4 | 28 | **KEEP → U2** (prior swarm commit) |
| 6 | Massline close-orbit angular-rate assist | 5/5/4/4/5/4/4 | 31 | **KEEP → U3** |
| 7 | Concussion NPC counterthrust delay | 4/4/3/4/4/4/3 | 26 | KEEP (supporting feel; covered by prior commit) |
| 8 | Tumble recovery shortening | 3/3/2/2/3/3/2 | 18 | **CUT** — risk of soft combat; orbit assist higher leverage |
| 9 | Raider autonomous predation carve-out | 5/5/5/5/4/4/5 | 33 | **KEEP → U4** |
| 10 | Empty firstFireAgainst pirate doctrine fill | 4/4/4/3/2/3/3 | 23 | REVISE into U4 predation path (not global doctrine spray) |
| 11 | Hauler kill heat mult for class `ship` | 5/5/4/3/2/5/5 | 29 | **KEEP → U5** |
| 12 | Cargo interference heat bump | 4/4/3/3/2/4/3 | 23 | KEEP partial (incident heat path already ships) |
| 13 | Miner occupation work cycle (npcJobs) | 5/4/4/4/3/5/5 | 30 | **KEEP → U6** |
| 14 | Tender repair response package | 4/4/4/4/3/3/4 | 26 | REVISE later — avoid freight dirty paths this tranche |
| 15 | Scavenger aftermath occupation | 4/4/4/4/3/3/4 | 26 | DEFER (U7 aftermath optional) |
| 16 | Curtain-convoy freeflight incident | 5/5/5/5/4/5/5 | 34 | **KEEP → U7** |
| 17 | Inspection escalation incident | 3/3/3/3/2/3/3 | 20 | **CUT** this tranche — convoy pressure covers interruptibility |
| 18 | Bloom default raise + sector post ≥1 | 5/5/3/3/4/5/4 | 29 | **KEEP → U8** (prior visual energy commit) |
| 19 | Saturated Kestrel hero shell | 4/5/2/3/4/5/3 | 26 | **KEEP → U8** |
| 20 | Unfactioned team fallback de-greying | 4/5/3/3/3/5/4 | 27 | **KEEP → U8** (this tranche) |
| 21 | Long luminous velocity wakes (D7 overturn) | 5/5/3/4/5/4/4 | 30 | **KEEP → U9** |
| 22 | Ribbon trail head continuity (no lag/skip) | 4/5/2/3/4/4/4 | 26 | **KEEP → U9** |
| 23 | Kill shard EV raise to agency scale | 5/5/4/3/3/5/5 | 30 | **KEEP → U10** |
| 24 | Alloys in shard burst | 4/4/3/3/2/5/4 | 25 | **KEEP → U10** |
| 25 | Wire scanRpBonus → researchPoints | 4/4/4/4/2/5/5 | 28 | **KEEP → U10** |
| 26 | Instant wreck-burst salvage (beam only) | 4/4/3/3/3/3/3 | 23 | **CUT** this tranche — magnetized shard burst already immediate |
| 27 | Port remaining vfxnext families | 3/4/2/3/5/2/3 | 22 | **CUT** — non-goal scope / larger program |
| 28 | Player craft collision damage | 2/2/2/2/2/5/2 | 17 | **CUT** — owner KEEP player impact immunity |
| 29 | Universal enemy Massline | 2/3/3/3/4/2/2 | 19 | **CUT** — specialists only |
| 30 | Hull scar recognition system | 2/3/2/3/4/1/2 | 17 | **CUT** — owner rejected |
| 31 | New sector densification | 3/3/3/3/3/2/2 | 19 | **CUT** — densify default play first |
| 32 | Mission menu activity pack | 2/2/2/2/2/3/2 | 15 | **CUT** — freeflight interruptibility preferred |
| 33 | Faction hull paint saturation pass | 4/4/2/3/4/3/4 | 24 | KEEP partial via U8 fallbacks; full faction kit later |
| 34 | Pirate traffic role archetype fix | 4/4/4/3/2/3/3 | 23 | REVISE into U4 (predation roles not traffic flee label) |
| 35 | Light-enemy “almost ammunition” TTK polish | 4/4/3/3/3/3/3 | 23 | DEFER — swarm volume lands first |

## Selected build list (10)

| Unit | From candidates | Cold disposition after proof |
|---|---|---|
| U1 | #1–3 | **KEEP** — craft damage >0, plate mult, whip suppress |
| U2 | #4–5 | **KEEP** — budget max ≥18, 12-slot grant |
| U3 | #6 | **KEEP** — finite non-zero `input.turn` + orbitalYawRate |
| U4 | #9 | **KEEP** — isAuthorizedPredationRelation true on live cast |
| U5 | #11 | **KEEP** — clean ship kill heat ≥0.15 |
| U6 | #13 | **KEEP** — advance + interrupt→FLEE + resume phase continuity |
| U7 | #16 | **KEEP** — requestAuthoredEncounter curtain_convoy + telegraph |
| U8 | #18–20 | **KEEP** — bloom/sector/Kestrel/team fallbacks saturated |
| U9 | #21–22 | **KEEP** — VL wakes + ribbon position version advances |
| U10 | #23–25 | **KEEP** — EV≥800, alloys, scanRpBonus via missions |

## Portfolio composition review

Cold disposition: **KEEP** — one continuous freeflight sim admits curtain convoy, opens predation,
applies craft collision damage, orbit-assists about the hauler, interrupts a miner job, raises
WANTED on a clean kill, sprays hostile shards, grants scan RP, and samples a luminous wake.
Observed unit co-occurrence ≥5 with ≥3 subtype families (`test/vision-convergence-10x.test.mjs`
composition test).

## Learning

Highest leverage remaining after this tranche is still presentation craft (hull ORM roughness) and
occupation breadth away from concurrent freight dirt — not new architecture.
