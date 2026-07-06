# E — Salvage Depth, Causal Economy Missions & Contracts (GOLD PACKETS)

> **Lane:** clusters **K** (salvage & wrecks), **L** (causal world & economy-driven missions),
> **S** (contracts engine). **Destinations:** salvage-depth + wreck-provenance → **BP-01 addendum
> (BP-01.1)**; causal economy + contracts + customs surfacing → **BP-12 (Causal Economy Missions
> & Contracts)**.
>
> **THE ONE FILTER:** *a detail earns its place only if the player can **see** it, **predict** it,
> or **change** it. If none of the three, it is not detail — it is cost.*
>
> **The gold ore.** `dangerModel.js` is a deterministic reaction-diffusion field over the sector
> graph; `sectorSim.js` projects it into spawns, prices (`economy:applyTradePressure`), influence
> (`factions.addOffscreenTension`), transit incidents, **strategic intel** (`sectorsim:intel`),
> and **offscreen asset losses** (`automation.offscreenRiskPass`). Every driver already carries a
> named causal tag (`sectorSignalFor().driver.{danger,pricePressure,influence}`) and a trend. This
> lane's entire job is to make that causal chain **perceptible** and **actionable** — a wreck you can
> attribute, a price you can explain, a contract born from a shortage the field actually produced.
> Almost nothing here is new machinery; it is a read layer plus one loss-ledger seam.

---

## Ranking — top 3 highest-impact packets (distance-from-shipped × first-15/47-A visibility)

1. **CAUSE_LEDGER_TOOLTIP** (BP-12) — the doctrine's own GATE rule ("no economy change without
   cause"). `driver` + `trend` already exist on every sector signal; surfacing them as a "why did
   this price move" line is near-zero distance and shows the first time the player reads a market.
2. **WRECK_PROVENANCE** (BP-01.1) — turns the already-rolled `sectorSim` offscreen losses into
   "who died here" wreck seeds + a station-news loss ledger. High visibility in the 47-A slice (a
   wreck with a real manifest is the mass-discrepancy stage) and directly answers the "no random
   spawn without provenance" gate.
3. **ECONOMY_BORN_MISSIONS** (BP-12) — "that's gold ore, mine it": missions that appear on boards
   *because* the field produced a surplus/scarcity/danger spike, tagged with the same `driver`. The
   contracts engine (`missions.js`) already exists; this is a new offer source that reads the field.

---

# BP-12 — Causal Economy Missions & Contracts

## CAUSE_LEDGER_TOOLTIP
- **name:** Cause Ledger ("why prices changed")
- **fantasy:** I hover a moving price and the world tells me *who* moved it — "Fuel up: two MTS convoys interdicted near Tethys."
- **pillar:** glance · world-was-here
- **wave/BP:** W3 / BP-12
- **reuses:** `sectorSim.sectorSignalFor` (`driver.{danger,pricePressure,influence}` + `trend`), `dangerModel.classifyDrivers` tags, `marketNews` (headline already surfaces the event), `newsTemplates` prose bank
- **newFiles:** `src/ui/causeLedger.js` (pure `driverPhrase(signal, sectorName)` mapper: tag → one-line prose; a `causeFor(state, sectorId)` read that pulls the live signal), `src/data/causePhrases.js` (the tag→template bank, one source of truth)
- **noTouch:** `dangerModel.js`, `sectorSim.js`, `economy.js`, `marketNews.js`, `uiRoot.js`
- **budget:** spawn:none · voice:none (tooltip/dock-card text; never speaks over voiceArbiter) · draw:none
- **rng:** none / pure UI (reads the already-computed deterministic `driver` string)
- **acceptance:** for a sector whose `driver.pricePressure === 'meridian_transmission'` and `trend.pricePressure > 0`, `driverPhrase` returns a sentence naming Meridian and the direction; a dock price row shows it on hover. Headless: `causeFor` is deterministic given a fixed field digest.
- **failureModes:** inventing causes the field didn't produce (must map ONLY the enumerated `driver` tags — no free text); reading a stale legacy `drift` when the field node exists (always route through `sectorSignalFor`, which prefers the field).
- **size:** S

## ECONOMY_BORN_MISSIONS
- **name:** Missions Born From The Field
- **fantasy:** The board isn't random — a fuel-run appears *because* fuel actually got scarce out here, and the offer says so.
- **pillar:** world-was-here · glance
- **wave/BP:** W3 / BP-12
- **reuses:** `sectorSim.sectorSignalFor` (`pricePressure`, `danger`, `driver`, `dominantFactionId`), `missions.js` board generation (offer instances, accept/track/payout lifecycle), `missions._rollOffer` param/reward pipeline, `voiceArbiter` (offer surfaced via existing `mission:offered`)
- **newFiles:** `src/systems/economyContracts.js` (a board-augment *source*: on `dock:docked`, reads the local + neighbor sector signals and emits at most 1 `mission:offered` per dock keyed by the dominant driver — surplus→`cargo_delivery`, scarcity→high-pay `cargo_delivery`/fuel run, rising danger→`escort`/`patrol_clear`, Reach pressure→`bounty_hunt`, station loss→`salvage_retrieval`), `src/data/economyContractTemplates.js` (driver→offer-shape + prose)
- **noTouch:** `missions.js`, `sectorSim.js`, `economy.js`, `dangerModel.js`
- **budget:** spawn:none at offer time (targets spawn through `missions._ensureMissionTargets` → `spawnBudget` on accept, unchanged) · voice:news channel (one offer line) · draw:none
- **rng:** seeded — `mulberry32(hash32(seed, stationId, epoch, 'econContract'))`; selection keyed to the field driver, not a free roll
- **acceptance:** enter a sector the field has driven to `pricePressure > 0.25` with `driver.pricePressure === 'route_scarcity'`; docking offers exactly one scarcity contract whose summary names the commodity and the cause; the offer routes through the existing accept path and pays via `economy:grantCredits`. Determinism: same seed+epoch+field ⇒ same offer.
- **failureModes:** double-spawning with the normal board (must emit *offers only*, never write `missions.boards` directly — missions.js owns that); spamming an offer every dock (dedupe per station-epoch); coupling reward to `factionId` for hostility (rewards are cosmetic-faction rep only).
- **size:** M

## CONVOY_LOSS_INVESTIGATION
- **name:** Convoy-Loss Salvage & Investigation POI
- **fantasy:** A trade lane went quiet; I fly out to the wreck the sim actually lost there and read what killed it.
- **pillar:** world-was-here
- **wave/BP:** W3 / BP-12 (uses the BP-01.1 loss ledger)
- **reuses:** `automation:outpostRaided` / trader-loss events, `sectorSim` loss ledger (see WRECK_PROVENANCE), `salvage.js` communicator→`mission:offered` loop, `wreckMissions` templates (`wm_manifest_run`, `wm_blackbox_attacker`), `sectorZones` `derelict_field`
- **newFiles:** `src/systems/lossInvestigation.js` (on a recorded loss in a sector the player then enters, promotes ONE derelict-field salvage point to carry a provenance-stamped communicator whose offer summary references the recorded loss — "the MTS hauler that went dark here")
- **noTouch:** `salvage.js`, `sectorSim.js`, `automation.js`, `missions.js`
- **budget:** spawn:none beyond the ≤2/zone salvage cap salvage.js already enforces · voice:comms/salvage channel (existing) · draw:none
- **rng:** seeded — reuses salvage's per-zone `hash32(seed, sectorId, zoneId, 'salvage')` stream; provenance pick keyed off the recorded loss id
- **acceptance:** after the field rolls a trader loss in sector S (loss ledger has an entry), entering S and reaching the promoted communicator surfaces a mission whose log line names the lost asset and faction; with no recorded loss it is a strict no-op (golden-sim safe).
- **failureModes:** provenance drift if the ledger and salvage roll use different streams (bind both to sectorId); manufacturing a loss the field never produced (only promote when a real ledger entry exists).
- **size:** M

## CUSTOMS_MOMENT (SURFACE)
- **name:** The Customs Scan Moment
- **fantasy:** A patrol pings my hold — the HUD gives me the sweat-inducing choice: submit, bribe, or run.
- **pillar:** one-voice · glance
- **wave/BP:** W3 / BP-12
- **reuses:** **fully shipped** `economy.runScan` / `payBribe` (submit/scan/fine/confiscate), `economy` `player:scannedByPatrol` + `contraband:scanned` events, `economy.scanningFaction` + `FINE_MULT`, `voiceArbiter`, `interdiction:triggered`
- **newFiles:** `src/ui/customsPrompt.js` (a decision panel bound to `player:scannedByPatrol`: shows hold risk, fine estimate from `FINE_MULT`, and the 3 already-supported actions — Submit → let `runScan` resolve, Bribe → `contraband:bribe`, Run → break the scan by leaving range; wires the existing bribe cost from the `contraband:scanned` payload)
- **noTouch:** `economy.js`, `cargo.js`, `factions.js`
- **budget:** spawn:none · voice:comms channel (one customs hail line) · draw:none
- **rng:** none in UI; the scan roll stays in `economy.runScan` (its seeded `_rng`)
- **acceptance:** carrying contraband into a customs scan raises the prompt; choosing Bribe charges the `bribeCost` the payload already computed; choosing Submit runs the shipped confiscation; the faction rep hit is the one `economy` already emits — UI adds a decision, not a second penalty.
- **failureModes:** re-implementing the fine math (must read `contraband:scanned`/`FINE_MULT`, not recompute); letting the panel speak while combat comms play (route through voiceArbiter priority); a "Run" that dodges the shipped rep consequence (Run only avoids the *scan*, not an already-resolved bust).
- **size:** S

## CARGO_REPUTATION_GLYPH (SURFACE)
- **name:** Cargo Conscience
- **fantasy:** My hold has a moral color — medicine reads as goodwill to the Frontier, weapons as a Concord frown.
- **pillar:** glance
- **wave/BP:** W3 / BP-12
- **reuses:** `commodities` legality + `data.moralTag` (add via data addendum, one source of truth), `economy.illicitCargo`, `factions` rep read (display only)
- **newFiles:** `src/ui/cargoConscience.js` (pure `holdSentiment(cargo)` → per-faction lean glyph for the cargo panel; read-only)
- **noTouch:** `economy.js`, `cargo.js`, `factions.js`
- **budget:** spawn:none · voice:none · draw:none
- **rng:** none / pure UI
- **acceptance:** a hold with a contraband stack shows a "Quiet favor / Concord risk" glyph; an empty/legal hold shows neutral. No state mutation.
- **failureModes:** implying a rep change the sim won't apply (glyph is a *lean*, actual deltas still come only from `contraband:scanned`/mission payloads); coupling to `factionId` hostility (cosmetic only).
- **size:** S

## SECURITY_RESPONSE_READ (SURFACE)
- **name:** Security Follows Danger
- **fantasy:** As a sector heats up, patrol presence visibly tightens — and I can predict the next checkpoint.
- **pillar:** glance · world-was-here
- **wave/BP:** W3 / BP-12
- **reuses:** `sectorSim.effectiveSector` (drifted security/enemyDensity), `sectorSignalFor.driver.danger` (`concord_patrols` / `interdiction_wave` tags), `galaxyMap` overlay hooks
- **newFiles:** `src/ui/securityReadout.js` (map/overview line: "Concord patrols responding — security rising" when `driver.danger === 'concord_patrols'` and `trend.danger < 0`; "Interdiction wave" when `interdiction_wave`)
- **noTouch:** `sectorSim.js`, `galaxyMap.js`, `world.js`
- **budget:** spawn:none · voice:none · draw:none (map glyph within BP-11 glyph budget)
- **rng:** none / pure UI
- **acceptance:** a sector where the field tag is `concord_patrols` shows the responding-patrols readout; a Reach-pressured sector (`reach_pressure`) shows a rising-danger readout. Deterministic per field digest.
- **failureModes:** a glyph that informs no decision (must map to route/avoid choice — pair with route-risk); over-budget map glyphs (one per sector max).
- **size:** S

## BLOCKADE_RELIEF_CONTRACTS
- **name:** Blockade & Relief Runs
- **fantasy:** A besieged station is starving; a war-profiteer contract pays triple to run its air past the blockade.
- **pillar:** world-was-here · glance
- **wave/BP:** W3 / BP-12
- **reuses:** `sectorSim` `pricePressure` + `driver` (`infrastructure_disruption`, `route_scarcity`), `economyContracts.js` (from ECONOMY_BORN_MISSIONS), `missions.js` reward/collateral pipeline, `marketNews` headline
- **newFiles:** *(none — a template family inside `economyContractTemplates.js`)*
- **noTouch:** `missions.js`, `sectorSim.js`, `economy.js`
- **budget:** spawn:none at offer; escort hostiles via `spawnBudget` on accept · voice:news channel · draw:none
- **rng:** seeded (shares economyContracts stream)
- **acceptance:** a sector driven to `infrastructure_disruption` + high scarcity offers a relief run whose pay scales with the modeled scarcity and whose card names the blockade cause; the headline and the offer agree (same driver).
- **failureModes:** payout untethered from the field (reward must read the live `pricePressure`, not a constant); relief that never has counterplay (the escort leg spawns budgeted hostiles so the "danger" tag is real).
- **size:** M

## COLLATERAL_AND_CLAUSES (ENRICH)
- **name:** Contract Fine Print
- **fantasy:** This contract has teeth — a deposit I lose if I fail, and a clause that forbids a single kill.
- **pillar:** glance
- **wave/BP:** W3 / BP-12 (enriches `missions.js` offers — addendum, applied after Wave 2)
- **reuses:** **shipped** `missions` collateral (`collateral_cr`, charged on accept, forfeit on fail) and `def.collateral`; adds optional *clause* metadata read at completion
- **newFiles:** `src/data/contractClauses.js` (pure clause catalog: `no_kills`, `cargo_intact`, `no_scan`, `time_limit`, `rescue_priority` — each a predicate name + prose + reward modifier), `src/systems/contractClauses.js` (evaluates a clause against the events the mission already tracks; on breach emits a `contract:clauseBroken` intent the missions layer can consume as a fail/penalty)
- **noTouch:** `missions.js`, `economy.js`, `factions.js`
- **budget:** spawn:none · voice:one line on breach (comms) · draw:none
- **rng:** seeded — clause attachment via the offer's existing seed stream
- **acceptance:** a `cargo_delivery` with a `no_scan` clause that gets scanned emits `contract:clauseBroken`; the shipped collateral-forfeit path handles the penalty. Clause-free offers behave exactly as today.
- **failureModes:** clause a system can't observe (only attach clauses whose predicate maps to an event missions already listens to: kill, scan, cargo integrity, deadline); double-penalizing (breach routes through the one collateral path).
- **size:** M

## MORAL_TRAP_CONTRACTS (ENRICH)
- **name:** The Job That Isn't What It Says
- **fantasy:** The "medicine" I'm hauling is counterfeit; the passenger is a fugitive. I learn the truth mid-run and choose.
- **pillar:** one-voice · world-was-here
- **wave/BP:** W3 / BP-12 (enriches `missions` + reuses `wreckMissions.choice` shape)
- **reuses:** `wreckMissions` `choice` descriptor (already `{prompt, options}`), `missions` accept/complete lifecycle, `voiceArbiter`, `contraband` legal consequence (a "medicine" that scans as contraband uses the shipped `runScan`)
- **newFiles:** `src/data/moralTraps.js` (pure: a small set of trap overlays — cargo-is-weapons, passenger-is-fugitive, medicine-is-counterfeit — each with a reveal trigger event and a two-option `choice`), `src/systems/moralTrap.js` (attaches a trap to a qualifying offer, fires the reveal + `choice` via the existing offer/choice channel)
- **noTouch:** `missions.js`, `economy.js`, `factions.js`
- **budget:** spawn:none · voice:comms channel (reveal + choice) · draw:none
- **rng:** seeded — trap attach via `hash32(seed, offerId, 'trap')`, low probability
- **acceptance:** an eligible smuggling/passenger offer occasionally carries a trap; the reveal fires once, presents a binary choice, and the branch resolves through the shipped payout/rep channels (no new writers). Golden sim unaffected (traps only attach in the drifted content path, never in the 47-A deterministic slice).
- **failureModes:** a "choice" with no mechanical difference (each option must route to a distinct shipped consequence — rep, credits, or contraband bust); breaking determinism by re-rolling the reveal (fire once, flag on the instance).
- **size:** M

## PRICE_FORECAST_CONE (SURFACE)
- **name:** Where Air Is About To Be Cheap
- **fantasy:** The map shows me not just today's prices but the direction the field is pushing them — I trade ahead of it.
- **pillar:** glance · world-was-here
- **wave/BP:** W3 / BP-12
- **reuses:** `sectorSignalFor` `trend.pricePressure` + `marketFlowUnitsPerDay` (already computed), `galaxyMap`
- **newFiles:** `src/ui/priceForecast.js` (pure `forecastArrow(signal)` → rising/falling/steady from the sign of `trend.pricePressure`; a per-sector map annotation)
- **noTouch:** `sectorSim.js`, `economy.js`, `galaxyMap.js`
- **budget:** spawn:none · voice:none · draw:none
- **rng:** none / pure UI
- **acceptance:** a sector with `trend.pricePressure > 0` shows a rising arrow; acting on it (buy-low-now) pays as the field advances. Deterministic per field.
- **failureModes:** presenting the trend as certainty (label it a forecast, not a guarantee); glyph clutter (one arrow per sector, gated to sectors with |trend| above a threshold).
- **size:** S

---

# BP-01.1 — Salvage Depth & Wreck Provenance (addendum to BP-01, applied after Wave 2)

## WRECK_PROVENANCE
- **name:** Who Died Here
- **fantasy:** Every wreck field has a story I can read — this is the MTS convoy the sim lost to Reach raiders three days ago.
- **pillar:** world-was-here
- **wave/BP:** W3 / BP-01.1
- **reuses:** `sectorSim` offscreen losses (`automation.offscreenRiskPass`, `automation:outpostRaided`, trader-loss rolls), `sectorSim.meta.lossLog` (already allocated, currently only a count), `salvage.js` wreck placement, `wreckMissions` templates, `marketNews` (loss ledger as a headline)
- **newFiles:** `src/systems/lossLedger.js` (a NEW listener that records structured loss entries — `{ sectorId, factionId, kind: 'trader'|'outpost'|'convoy', simDay, cargoHint }` — from the loss events `automation`/`sectorSim` already emit, capped ring-buffer per sector; exposes `lossesFor(sectorId)` and a `latestLossLine(sectorId)` prose read), `src/data/wreckClasses.js` (wreck-class prose so a seeded wreck reads as fresh/battlefield/military/ancient)
- **noTouch:** `sectorSim.js`, `automation.js`, `salvage.js`, `marketNews.js`, `economy.js`
- **budget:** spawn:none (salvage.js keeps its ≤2/zone cap) · voice:news channel (loss headline, one line) · draw:none
- **rng:** seeded — ledger is event-sourced (no roll); wreck-class assignment reuses salvage's per-zone hash keyed by the recorded loss id
- **acceptance:** after the field rolls a loss in sector S, `lossesFor(S)` returns the structured entry and a station-news headline ("A Drift hauler went dark near {sector}") appears via marketNews's channel; when the player enters S, a salvage wreck carries a `scanLabel`/log referencing that loss. No recorded loss ⇒ generic wreck (unchanged).
- **failureModes:** the ledger and the wreck reading different provenance (both key off the recorded loss id + sectorId); unbounded growth (per-sector ring buffer, ≤ N entries); leaking into the golden sim (event-sourced only from losses the offscreen pass produces, which the 47-A slice doesn't trigger).
- **size:** M

## SALVAGE_DISTINCT_FROM_MINING (ENRICH)
- **name:** Salvage Is Not Mining
- **fantasy:** A wreck is a puzzle, not a rock — I cut panels, pull a module, decode a black box; the reactor might be unstable.
- **pillar:** momentum-toy · glance
- **wave/BP:** W3 / BP-01.1
- **reuses:** `salvage.js` wreck entities (`data.salvagePool`, `salvageTimeLeft`, `parentType`), `mining._drainWreck` beam, tether (`ATTACHABLE_TYPES` includes `wreck`), `scan:completed`
- **newFiles:** `src/data/salvageActions.js` (pure: per-`parentType` action verb set — `cut_panel`, `pull_module`, `decode_blackbox`, `vent_reactor` — each mapping to a distinct pool/label and a distinct scan glyph), `src/systems/salvageActions.js` (surfaces the verb for a targeted wreck; `vent_reactor` wrecks carry a short unstable-timer that damages on ignore, giving a real decision)
- **noTouch:** `salvage.js`, `mining.js`, `combat.js`
- **budget:** spawn:none · voice:one salvage line on decode/vent · draw:none (reuses wreck VFX budget)
- **rng:** seeded — action assignment via salvage's per-point hash
- **acceptance:** a debris wreck reads "cut panels"; a communicator reads "decode"; an unstable-reactor wreck reads "vent or tether-away" and applies a bounded consequence if ignored past its timer. Each verb yields a distinct, deterministic pool.
- **failureModes:** salvage that plays identically to mining (each verb must differ in prop/glyph/consequence); the reactor timer as unavoidable damage (it must be *counterplayable* — tether the wreck away or vent in time).
- **size:** M

## SURVIVOR_POD_TRIAGE (ENRICH)
- **name:** The Failing Pod
- **fantasy:** A cryo-pod is dying with one occupant; I tow it to safety for goodwill, or strip it for credits and no witnesses.
- **pillar:** momentum-toy · one-voice
- **wave/BP:** W3 / BP-01.1
- **reuses:** **shipped** `wreckMissions` `wm_survivor_pod` (already has the rescue/strip `choice`), `salvage.js` communicator hook, `passenger_transport` mission type in `missions.js`, tether tow, `voiceArbiter`
- **newFiles:** `src/systems/survivorPod.js` (promotes a survivor-pod salvage point to a tetherable pod with a soft oxygen timer surfaced as a glance readout; tow→`passenger_transport` completion path, strip→salvage pool + the shipped "no witnesses" rep consequence)
- **noTouch:** `salvage.js`, `missions.js`, `wreckMissions.js`, `economy.js`
- **budget:** spawn:none (within salvage cap) · voice:comms/salvage channel (distress + choice) · draw:none
- **rng:** seeded — pod placement via salvage's per-zone hash
- **acceptance:** reaching a survivor-pod communicator raises the shipped `wm_survivor_pod` choice with a visible oxygen countdown; Tow routes to the passenger delivery + Concord goodwill; Strip pays now via the salvage pool. Determinism preserved (timer is display; outcome is the player's action).
- **failureModes:** oxygen timer as a hard fail that punishes slow ships unfairly (soft — reward decays, pod doesn't instantly die); the choice not mapping to shipped consequences (rescue = passenger completion + rep; strip = pool + rep hit).
- **size:** M

## GHOST_CONVOY_RUMOR
- **name:** Ghost Convoy → Ambush Base
- **fantasy:** The same lane keeps producing wrecks; a bar rumor says it's not bad luck — it's a raider nest, and I can go end it.
- **pillar:** world-was-here
- **wave/BP:** W3 / BP-01.1 (feeds BP-13 pirate ecology; offer-only here)
- **reuses:** `lossLedger.js` (from WRECK_PROVENANCE — repeated losses in one sector), `sectorSignalFor.driver.danger === 'reach_pressure'`, `wreckMissions` `wm_reach_bounty`, `missions` bounty/patrol pipeline, `voiceArbiter` (rumor via one channel)
- **newFiles:** *(none — a read rule inside `lossLedger.js` that, on ≥3 losses of the same faction/lane, emits a `rumor:ghostConvoy` intent the contracts/BP-13 layer consumes as a patrol_clear/bounty offer)*
- **noTouch:** `sectorSim.js`, `missions.js`, `automation.js`
- **budget:** spawn:none at rumor; hostiles via `spawnBudget` on accept · voice:one rumor line · draw:none
- **rng:** none (threshold on the event-sourced ledger)
- **acceptance:** after the ledger records ≥3 losses along one lane, a ghost-convoy rumor surfaces once; accepting it yields a budgeted clear-the-nest contract in that sector. Fewer than 3 losses ⇒ no rumor.
- **failureModes:** rumor spam (fire once per lane-threshold, flagged); a nest with no counterplay (must resolve as a real budgeted encounter, not a phantom).
- **size:** S

## SALVAGE_PERMIT_AND_FINES (SURFACE)
- **name:** Licensed vs Illegal Salvage
- **fantasy:** Stripping a military wreck without a permit is a crime — Concord will fine me; the Quiet will launder it.
- **pillar:** glance · world-was-here
- **wave/BP:** W3 / BP-01.1
- **reuses:** **shipped** `economy` contraband/fine machinery (`runScan`, `FINE_MULT`, confiscation, faction rep hit), `salvage` wreck `parentType`, `scanningFaction`
- **newFiles:** `src/data/salvageLegality.js` (pure: which wreck classes are "classified"/restricted salvage → a legality tag on the resulting salvage commodity so the *existing* customs scan treats it as contraband)
- **noTouch:** `economy.js`, `salvage.js`, `cargo.js`
- **budget:** spawn:none · voice:none (customs line handled by CUSTOMS_MOMENT) · draw:none
- **rng:** none / data
- **acceptance:** salvaging a military-classified wreck yields cargo tagged restricted; carrying it through a customs scan triggers the shipped fine/confiscation path; laundering at a blackmarket station clears it (shipped tolerance rule). Common debris is unaffected.
- **failureModes:** a new fine path (must reuse `runScan`/`FINE_MULT`, add only the legality tag); punishing all salvage (only classified/military classes are restricted).
- **size:** S

---

## CUT / DEFER

| Item (cluster) | Action | Reason |
|---|---|---|
| Derelict interiors / walking-through hulks (K) | Defer | Out of scope for a top-down game; abstracted to scan/cut/tether already covered by SALVAGE_DISTINCT. |
| Salvager rivals + scavenger-truce branches (K) | Defer | Gold-plating; belongs to BP-13 pirate ecology once named characters exist, not a Wave-3 detail. |
| Wreck-beacon hacking minigame (K) | Defer | New verb with no shipped substrate; scan/decode already covers the read. |
| Mass-debt faction claim system / Meridian debt ledger (L/Q) | Defer | Ambitious new economy subsystem; reshape into the 47-A story slice, not this lane. |
| Faction logistics (bases need fuel/ammo/food/parts) as live supply chains (L) | Defer | Would duplicate/desync the abstract flow economy (RISK LEDGER §4 double-counting); the field already models scarcity. |
| Pirate route-adaptation "shift if convoys well-defended" (L) | Defer | Belongs to BP-13 pirate doctrines through `encounterDirector`, not a salvage/economy read. |
| Concealment modules / false-bottom pods / sensor-spoof commodity (M) | Defer | Gold-plating on top of the shipped contraband loop; CUSTOMS_MOMENT surfaces submit/bribe/run without new hardware. |
| Stolen-cargo serials + laundering-fee subsystem (M) | Defer | Partly covered by SALVAGE_PERMIT laundering reuse; a full serial-tracking system is a separate backlog item. |
| Route insurance / tow-service-if-stranded / emergency beacon consumables (R) | Defer | Belongs to BP-07 traversal + hazards lane, not economy/contracts. |
| Adaptive music state on investigation/reversal (O) | Cut/Defer | Doctrine §8 named defer (adaptive music); no seeded domain for a per-frame music state here. |

## VALIDATED (already shipped — reframed, do NOT rebuild)

- **Station-news ticker / "player-caused news" / strategic-intel bulletins** ≡ `marketNews` + `sectorsim:intel` (`_emitStrategicIntel` already picks the top threshold-crossings and surfaces them). The cause ledger *reads* this; it doesn't rebuild it.
- **Markets-remember-violence / economy reacts to danger** ≡ `sectorSim._emitEconomyPressure` (danger folds into `lanePressure` → `economy:applyTradePressure`) — already causal and persistent.
- **Security-response-follows-danger** ≡ `sectorSim.effectiveSectorFor` drifted security/enemyDensity + `driver.danger === 'concord_patrols'`. SECURITY_RESPONSE_READ surfaces it; the causal drift is shipped.
- **Customs scan / submit-bribe-fine-confiscate / faction legal styles** ≡ `economy.runScan` + `payBribe` + `FINE_MULT` + `scanningFaction`. CUSTOMS_MOMENT adds the decision UI over the shipped resolver — the engine is done.
- **Black-box / communicator-starts-a-mission** ≡ `salvage.js` + `wreckMissions.js` (`mission:offered` loop). Provenance packets enrich it; the loop itself is shipped.
- **Contract collateral (deposit forfeit on fail)** ≡ `missions` `collateral_cr` (charged on accept, forfeit on abandon/fail). COLLATERAL_AND_CLAUSES adds clauses on top; collateral is shipped.
- **Transit-incident forecast (route risk)** ≡ `sectorSim.forecastTransitFor` (incident chance + expected damage + survival margin, shared by UI and resolver). Route-risk previews read it directly.
- **Global comms cap / one-voice** ≡ `voiceArbiter` — every talking packet here routes through it.
