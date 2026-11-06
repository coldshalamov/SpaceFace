<!-- LIFETIME: CAMPAIGN -->
# W1 — Inventory: the one table

**The Journey doc's raw material, consolidated.** Detail files:
[inventory/SECTORS.md](inventory/SECTORS.md) (graph, per-sector sheets, identity plumbing,
travel/interdiction) · [inventory/ENCOUNTERS.md](inventory/ENCOUNTERS.md) (all 367 rows) ·
[inventory/CONTACTS_SYSTEMS.md](inventory/CONTACTS_SYSTEMS.md) (contacts, voice, heists, mission
plumbing, finale presentation). Built 2026-11-06.

## The table

| Journey ingredient | Exists? | Where (verified) | State for the journey | Consumed by |
|---|---|---|---|---|
| Campaign spine (8 beats, verbs, rewards) | YES | `story/campaign47a/campaignData.js` CAMPAIGN_BEATS; live table `data/missions.js` STORY_BEATS | Complete; needs act framing, not content | W1 pacing director |
| Playable book contracts B1–B4 (authored briefs, 2 physical methods each) | YES | `campaign47a/embodiedMissions.js` bookContracts | Complete: alloy run→Scale 4→furnace; cinder board→Elroy; tow→maw→Foreman; 3 door ops | W1 (walk), W2 (set-piece quality) |
| Branch doors + chains (traders/patrol/free) | YES | `embodiedMissions.js` B4 intros + B5 chains; `data/missions.js` BRANCH_CHAIN | Complete | W1 |
| Elroy moral hinge re-pricing later beats | YES | `embodiedMissions.js` getBiggerBoatRoute/getPickSideStakes/getEmpireSeedProgram/getDeepReachOperation | Complete — custody/force branches B3, B4, B6, B7 | W1 framing |
| Deep Reach climax per branch | YES | `embodiedMissions.js` DEEP_REACH_CLIMAX (blockade/siege/evidence tow) | Complete | W2 (climax captures) |
| Failure→scar→heavier re-offer | YES | `storySpine.js` SCAR/OPEN_BRIEF/adjustBoardOffer | Complete — VISION's failure rule, already built | W1 (surface it) |
| Endings A–E + sandbox + post-ending loops | YES | `story/endings/*`; desk at station_ashcache (Kurtz) | Complete; eligibility explainable (lifeLedger); finale closes with `castLastCall` per contact | W1 Act IV framing, W4 |
| Act-break interludes ×6 | YES | `campaign47a/interludes.js` + encounter files 926–931 | Complete + unreachable-proofed (stale-follow); fire-rate on the ordinary route unverified | W1 verify |
| Beat comms (per-beat contact lines ≤12 words) | YES | `campaign47a/embodiedDialogue.js` BEAT_COMMS | Complete | W1 |
| Contacts: 10 story + 16 depth (G1–G16) | YES | `embodiedDialogue.js` CONTACT_CARDS + DEPTH_PROGRAM_CONTACTS; portraits on disk | Gates implemented (minBeat/minRep/minUniqueWrecks); G16 lacks a portrait | W4 |
| Contact memory counters | 15/16 MOVE | sole writer `systems/stationContacts.js` (listeners `:240-293` + witness seam `missions.js:5566`) | `march.reconciliation` frozen (no writer); arcs mostly ambient — few react to spine branches | W4 |
| Sectors (10 core + 11 frontier) | YES | `data/sectors.js` + sector* tables (see SECTORS.md) | 4 core sectors have staged causal chains; Helios/Tethys/Vesta journey-ready; Io/Charon/Sker/Veil/Ashfall thin; 6/10 core lack bespoke visual rigs; core sectors lack composed music beds (frontier has them) | W1 (arrange), W3 (identity) |
| Road structure to the finale | YES | sector graph: honest road via Charon; secret road via tech-gated Veil wormhole (`sectors.js:1235`) | Built; uncharted rim (Sker/Veil/Ashfall) + survey-data loop live | W1 Act IV framing |
| Encounters — opener grammar (17 shapes) | YES | `data/encounters/` 138 files | Procedural filler by design; rolls via seeded day plan | W2 (rate/upgrade) |
| Encounters — one-template lived vignettes | 176 | `data/encounters/393-4xx-lived-*.js` via `livedWorldDirector` | Frozen per lane rule (no more); W2 decides generator vs cut | W2 |
| Encounters — authored scenes | 25 | `data/encounters/1200-1310-*` (named/logic twists) | Hand-crafted candidates to place along acts | W1 (place), W2 (upgrade) |
| Encounters — unique wrecks ×7, depth ×10, k1 ×5 | YES | uniqueWrecks.js rumor program; shipLedger/e1EncounterRuntime (depth); factionPresence/dustLane (k1) | Alive; depth is the player-echo thread | W1 (place), W2 |
| Voice | SYNTH | 1,399 line WAVs = QA corpus, excluded from bundle; runtime synthesized | Report card's "439 unused" does not reproduce | Lane 6 (X4) owns sound gaps |
| Heists | 3 policies / 1 door | `heistMission.js` + `heistFacilities.js`; all posted at Tethys; +2 post-ending mega-heists | Settlement policies variant-ready; door spread is a data change | W1 (arrange) |
| Memory & citation layer | YES | `storyLedger.js` (Mechanic "I was X, so Y"), `storyFacts.js` (cap 64), `contactDeedMemory.js`, `lifeLedger.js`, ace/moral memory | Deep and single-writer | W4 |
| Mission plumbing (board→run→payout, gates) | YES | `missions.js` (cursor/gates), `missionBoardOps.js` (recommendation), `encounterDirector.js` (day plan), `onboarding.js` P2-14 objective tracker | P2-14 already persists the current beat objective | W1 hooks |
| Interdiction/travel texture | YES | cruise snare, gate scenes, lane ambushes, mining-noise draw (SECTORS.md §4) | Complete | W3 texture |

## Verified corrections to the report card (2026-11-06)

| Report-card claim | Today |
|---|---|
| "12 of 15 contact counters never move" | **15 of 16 move**; only `march.reconciliation` (G16) has no writer |
| "439 per-line voice WAVs go unused" | **Does not reproduce** — the line corpus is QA-only by design; runtime voice is synthesized |
| "211 lived vignettes from one template" | Now **176 files** in the `lived-*` family (225 total `compileVignette` users incl. openers) |
| "three heists, one door" | Confirmed: 3 settlement policies, 1 facility set, 1 posting station |
