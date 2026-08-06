// System registry: holds every system, runs init in registration order, runs the sim UPDATE_ORDER
// each step (§2.3), and the render-phase systems each frame. main.js builds it with the ctx.
import { core } from './coreSystem.js';
import { physics } from './physics.js';
import { input } from '../systems/input.js';
import { autoTargetAssist } from '../systems/autoTargetAssist.js';
import { flybyFocus } from '../systems/flybyFocus.js';
import { scanner } from '../systems/scanner.js';
import { mines } from '../systems/mines.js';
import { dockingCorridor } from '../systems/dockingCorridor.js'; // PQ-008: truthful exterior corridor/capture docking (assist via physics membrane)
import { scanReveal } from '../systems/scanReveal.js';
import { buildIdentity } from '../systems/buildIdentity.js';
import { lawSecurity } from '../systems/lawSecurity.js';
import { pirateDisguise } from '../systems/pirateDisguise.js';
import { pirateParley } from '../systems/pirateParley.js';
import { pirateDisengage } from '../systems/pirateDisengage.js';
import { surrenderRecovery } from '../systems/surrenderRecovery.js';
import { custodyConsequences } from '../systems/custodyConsequences.js';
import { aceMemory } from '../systems/aceMemory.js';
import { barkDirector } from '../systems/barkDirector.js';
import { aiPorts } from '../systems/aiPorts.js';
import { ai } from '../systems/ai.js';
import { createTacticalAISystem } from '../systems/tacticalAI.js';
import { aiEncounter } from '../systems/aiEncounter.js';
import { actions } from '../systems/actions.js';
import { flight } from '../systems/flight.js';
import { flightV3 } from '../systems/flightV3.js';
import { cruise } from '../systems/cruise.js';
import { weapons } from '../systems/weapons.js';
import { countermeasures } from '../systems/countermeasures.js';
import { combat } from '../systems/combat.js';
import { combatOutcome } from '../systems/combatOutcome.js';
import { aftermathWrecks } from '../systems/aftermathWrecks.js';
import { uniqueWrecks } from '../systems/uniqueWrecks.js';
import { uniqueLootAbilities } from '../systems/uniqueLootAbilities.js';
import { wingMorale } from '../systems/wingMorale.js';
import { tetherGameplay } from '../systems/tetherGameplay.js';
import { masslineTelemetry } from '../systems/masslineTelemetry.js';
import { masslineThreats } from '../systems/masslineThreats.js';
import { masslineImpacts } from '../systems/masslineImpacts.js';
import { impulseCharges } from '../systems/impulseCharges.js';
import { massSeed } from '../systems/massSeed.js';               // PQ-011/SF-11 deployable anchor Mass Seed
import { fields } from '../systems/fields.js';                   // PQ-012/SF-12 continuous field kernel (Well/Repulsor/Cone)
import { environmentalMachinery } from '../systems/environmentalMachinery.js'; // PQ-027/SF-22 timed Ceres current + World Site adapter
import { planetRuntime } from '../systems/planetRuntime.js';     // PQ-013/SF-14 planetary site (sling/skim/harvest/reentry)
import { massSeedHud } from '../ui/massSeedHud.js';              // PQ-011: seed status pill + lock-point marker (DOM-guarded)
import { fieldHud } from '../ui/fieldHud.js';                    // PQ-012: field state/cooldown/denial chip (DOM-guarded)
import { planetHud } from '../ui/planetHud.js';                  // PQ-013: band pill + heat readout (DOM-guarded)
// Massline Physics Identity — Wave M2 (design/revamp/MASSLINE_PHYSICS_IDENTITY.md). All eight are
// massline2Flag-gated (OFF headless) and are deliberately NOT in the sf-sim curated harness list,
// so the 47-A golden never executes them. New runtime state lives under state.massline2.
import { masslineThrow } from '../systems/masslineThrow.js';          // §3.3 throw/release assist + §4.1 self-sling
import { bulletTime } from '../systems/bulletTime.js';                // §3.6 held time dilation via core/timeEffects
import { tumbleStates } from '../systems/tumbleStates.js';            // §3.4 uncontrolled-spin states on whipped NPCs
import { collisionConsequences } from '../systems/collisionConsequences.js'; // PQ-009: bounded contact momentum -> control/combat receipts
import { masslineImpactDamage } from '../systems/masslineImpactDamage.js'; // §3.5 whip-recoil + tumble contact damage
import { cloak } from '../systems/cloak.js';                          // §4.2 cloak module runtime + detection ring
import { lootShards } from '../systems/lootShards.js';                // §4.3 kill shards over the shipped loot:drop seam
import { terrainAnchors } from '../systems/terrainAnchors.js';        // §4.4 big-and-few rocks per encounter bubble
import { jettisonImpulse } from '../systems/jettisonImpulse.js';      // §5.3 cargo dump reaction impulse
import { masslineHud } from '../ui/masslineHud.js';                   // M2 surfacing: release indicator + cloak ring + meters (DOM-guarded)
import { mining } from '../systems/mining.js';
import { fieldDepletion } from '../systems/fieldDepletion.js';
import { cargo } from '../systems/cargo.js';
import { fragileCargo } from '../systems/fragileCargo.js';
import { economy } from '../systems/economy.js';
import { automation } from '../systems/automation.js';
import { asteroidSites } from '../systems/asteroidSites.js'; // durable in-asteroid machine sites (ASTEROID_SITES_BRIEF)
import { asteroidFormations } from '../systems/asteroidFormations.js'; // discovered-formation knowledge owner (A02)
import { wingmen } from '../systems/wingmen.js';
import { world } from '../systems/world.js';
import { heistFacilities } from '../systems/heistFacilities.js';
import { routeFollower } from '../systems/routeFollower.js';         // reader for nav.autoTravel (RC-5)
import { travelLanes } from '../systems/travelLanes.js';             // D8 lane infrastructure: multiplies the pilot's own travel drive
import { factions } from '../systems/factions.js';
import { sectorSim } from '../systems/sectorSim.js';   // ADR-0002 / V2 §33 — offscreen stat sim
import { npcJobsRuntime } from '../systems/npcJobsRuntime.js'; // PQ-014/SF-15/W06 — drives the pure npcJobs kernel into live NPC miner/hauler/patrol hulls
import { missions } from '../systems/missions.js';
import { careerContracts } from '../systems/careerContracts.js';
import { postEndingReplay } from '../systems/postEndingReplay.js';
import { economyContracts } from '../systems/economyContracts.js';
import { careerOrigins } from '../careers/origins/careerOrigins.js';
import { careerLadders } from '../careers/ladders/careerLadders.js';
import { liveCareerLadderBranches } from '../careers/ladders/liveCareerLadderBranches.js';
import { story } from '../systems/story.js';
import { scenarioRuntime } from '../systems/scenarioRuntime.js';
import { presentationOrchestrator } from '../systems/presentationOrchestrator.js';
import { presentationAdapters } from '../systems/presentationAdapters.js';
import { ships } from '../systems/ships.js';
import { crafting } from '../systems/crafting.js';
import { heat } from '../systems/heat.js';
import { traffic } from '../systems/traffic.js';
import { drill } from '../systems/drill.js';
import { intervention } from '../systems/intervention.js';
import { claims } from '../systems/claims.js';
import { beacons } from '../systems/beacons.js';
import { onboarding } from '../systems/onboarding.js';
// WORLD OVERHAUL / REVAMP 2.1 — Wave 1 systems (see design/revamp/REVAMP_MASTER.md).
import { spawnBudget } from '../systems/spawnBudget.js';            // single ship-cap arbiter (ctx.helpers.spawnBudget)
import { regionalEcology } from '../systems/regionalEcology.js';     // M4 persistent regional simulation inputs
import { encounterDirector } from '../systems/encounterDirector.js'; // zone-anchored living-universe encounters
import { livingPoiBehaviors } from '../systems/livingPoiBehaviors.js'; // M4 six causal POI behavior families
import { pirateRumor } from '../systems/pirateRumor.js';             // BP-13/B12 zone pirate rumors from real events
import { ambushSignatures } from '../systems/ambushSignatures.js';   // BP-13/B14 passive pre-ambush scan tells
import { bountyHunt } from '../systems/bountyHunt.js';               // BP-13/B16 neutral bounty hunter contracts
import { salvage } from '../systems/salvage.js';                     // derelict-field discovery loop
import { voiceArbiter } from '../ui/voiceArbiter.js';                // "one voice at a time" priority queue (ctx.helpers.voice)
// BP-11 Sector Atmosphere (Wave 3, design/revamp/detail/A_sector_station.md) — SYSTEMS-only
// surfacing modules (event-driven; no update; DOM fully guarded; voice via ctx.helpers.voice).
import { sectorPostcard } from '../ui/sectorPostcard.js';             // A1: arrival identity card + one 'news' rumor line
import { dockDenyBanner } from '../ui/dockDenyBanner.js';             // A3: dockDeny.js surfaced — scan line + one 'comms' denial
import { stationBroadcast } from '../systems/stationBroadcast.js';    // A5: ambient station flavor (window-timer only; lowest voice priority)
import { hazardHints } from '../data/hazardLanguage.js';               // A7: once-per-type 'warn' counterplay hint + state.ui.hazardRead
import { bulkHaulTag } from '../ui/prompts/bulkHaulTag.js';             // T3-17: TOW-THE-CHUNK oversized mining chunk prompt
import { dangerGradient } from '../ui/dangerGradient.js';              // A9: dangerTier tint+badge overlay on existing starmap nodes (guarded applier)
// BP-12 Causal Economy (Wave 3, design/revamp/detail/E_salvage_economy_contracts.md) — SYSTEMS-only
// read layers over the shipped dangerModel/sectorSim field ("no economy change without cause").
import { causeLedger } from '../ui/causeLedger.js';                    // E: "why prices changed" tooltip over the live driver tags (voice:none)
// BP-12 remaining 7 packets — SYSTEMS-only surfacing + enrich modules (event-driven; no update;
// DOM fully guarded; voice via ctx.helpers.voice; emit-only — single-writer honored).
import { customsPrompt } from '../ui/customsPrompt.js';                // CUSTOMS_MOMENT: scan decision panel (submit/bribe/run) over the shipped runScan
import { cargoConscience } from '../ui/cargoConscience.js';            // CARGO_REPUTATION_GLYPH: hold moral-color lean glyph (read-only)
import { securityReadoutSystem } from '../ui/securityReadout.js';      // SECURITY_RESPONSE_READ: "patrols responding" map line over driver.danger
import { priceForecastSystem } from '../ui/priceForecast.js';          // PRICE_FORECAST_CONE: rising/falling map arrow over trend.pricePressure
import { contractClausesSystem } from '../systems/contractClauses.js'; // COLLATERAL_AND_CLAUSES: clause breach → contract:clauseBroken (one penalty path)
import { moralTrapSystem } from '../systems/moralTrap.js';             // MORAL_TRAP_CONTRACTS: mid-run reveal + binary choice → distinct shipped consequences
import { lossLedger } from '../systems/lossLedger.js';                 // BP-01.1 WRECK_PROVENANCE: event-sourced loss recorder (assetLost/outpostRaided → ring buffer + wreck tag)
import { factionPresence } from '../systems/factionPresence.js';       // Depth Program K1: five additive faction presences + service/boarding seams
import { bandRadio } from '../systems/bandRadio.js';                   // Depth Program A1: deterministic in-flight radio/ticker state
import { v2FlavorRuntime } from '../systems/v2FlavorRuntime.js';       // Depth Program V2 physical-carrier flavor reachability
import { lossInvestigation } from '../systems/lossInvestigation.js';   // CONVOY_LOSS_INVESTIGATION: loss-ledger provenance overlay on salvage communicator offers
import { salvageActions } from '../systems/salvageActions.js';         // SALVAGE_DISTINCT_FROM_MINING: wreck verb readouts + unstable reactor counterplay
import { survivorPod } from '../systems/survivorPod.js';               // SURVIVOR_POD_TRIAGE: wm_survivor_pod rescue/strip backend over salvage communicators
import { recoveryEncounter } from '../systems/recoveryEncounter.js';   // physical scanner-to-derelict recovery loop + durable settlement
import { stationSideEventDirector } from '../systems/stationSideEventDirector.js'; // A6: seeded station side-events director (spawnBudget client)
import { stationContacts } from '../systems/stationContacts.js';                   // contact memory + read-only freight receipts
import { stationContactLoadBoundary } from '../systems/stationContactLoadBoundary.js'; // clear/normalize continuity at restore edge
import { gateControlDirector } from '../systems/gateControlDirector.js';          // A8: seeded gate traffic-control director (toll via economy:chargeCredits)
import { render } from '../render/renderer.js';
import { vfx } from '../render/vfx.js';
import { feel } from '../render/feel.js';
import { audio } from '../audio/audioSystem.js';
import { ui } from '../ui/uiRoot.js';
import { save } from '../save/saveSystem.js';
import { ensurePerfRuntime, perfNow } from './perfRuntime.js';
import { resolveRuntimeManifest } from '../runtime/resolveRuntimeManifest.js';
import { DEFAULT_RUNTIME_PROFILE_ID } from '../runtime/runtimeProfiles.js';
import { applyFeatureConfigToMaps } from '../data/featureFlags.js';
import { bindRuntimeToState } from '../runtime/createAuthoritativeRuntime.js';

/**
 * Build the browser/registry system lookup table. Presentation platform systems live here;
 * the authoritative init/update *order* comes from the runtime manifest (Phase 2).
 *
 * Manifest IDs match the historical SYSTEMS source identifiers. A few systems use a different
 * runtime `.name` (e.g. v2FlavorRuntime → "v2Flavor"); both keys are registered.
 */
function buildRegistrySystemLookup(aiSlot, flightSlot) {
  /** @type {Array<[string, object]>} */
  const entries = [
    ['core', core],
    ['voiceArbiter', voiceArbiter],
    ['input', input],
    ['autoTargetAssist', autoTargetAssist],
    ['flybyFocus', flybyFocus],
    ['bulletTime', bulletTime],
    ['cloak', cloak],
    ['scanner', scanner],
    ['scanReveal', scanReveal],
    ['buildIdentity', buildIdentity],
    ['lawSecurity', lawSecurity],
    ['pirateDisguise', pirateDisguise],
    ['pirateParley', pirateParley],
    ['pirateDisengage', pirateDisengage],
    ['aceMemory', aceMemory],
    ['barkDirector', barkDirector],
    ['dockingCorridor', dockingCorridor],
    ['physics', physics],
    ['aiPorts', aiPorts],
    ['tumbleStates', tumbleStates],
    ['collisionConsequences', collisionConsequences],
    ['aiEncounter', aiEncounter],
    ['actions', actions],
    ['cruise', cruise],
    ['weapons', weapons],
    ['countermeasures', countermeasures],
    ['impulseCharges', impulseCharges],
    ['mines', mines],
    ['massSeed', massSeed],
    ['uniqueLootAbilities', uniqueLootAbilities],
    ['fields', fields],
    ['environmentalMachinery', environmentalMachinery],
    ['planetRuntime', planetRuntime],
    ['combat', combat],
    ['combatOutcome', combatOutcome],
    ['aftermathWrecks', aftermathWrecks],
    ['uniqueWrecks', uniqueWrecks],
    ['wingMorale', wingMorale],
    ['tetherGameplay', tetherGameplay],
    ['surrenderRecovery', surrenderRecovery],
    ['custodyConsequences', custodyConsequences],
    ['masslineTelemetry', masslineTelemetry],
    ['masslineThreats', masslineThreats],
    ['masslineImpacts', masslineImpacts],
    ['masslineThrow', masslineThrow],
    ['masslineImpactDamage', masslineImpactDamage],
    ['lootShards', lootShards],
    ['terrainAnchors', terrainAnchors],
    ['jettisonImpulse', jettisonImpulse],
    ['mining', mining],
    ['fieldDepletion', fieldDepletion],
    ['cargo', cargo],
    ['fragileCargo', fragileCargo],
    ['economy', economy],
    ['automation', automation],
    ['asteroidSites', asteroidSites],
    ['asteroidFormations', asteroidFormations],
    ['wingmen', wingmen],
    ['intervention', intervention],
    ['lossLedger', lossLedger],
    ['factionPresence', factionPresence],
    ['spawnBudget', spawnBudget],
    ['world', world],
    ['heistFacilities', heistFacilities],
    ['regionalEcology', regionalEcology],
    ['encounterDirector', encounterDirector],
    ['routeFollower', routeFollower],
    ['travelLanes', travelLanes],
    ['livingPoiBehaviors', livingPoiBehaviors],
    ['pirateRumor', pirateRumor],
    ['ambushSignatures', ambushSignatures],
    ['bountyHunt', bountyHunt],
    ['stationSideEventDirector', stationSideEventDirector],
    ['stationContacts', stationContacts],
    ['stationContactLoadBoundary', stationContactLoadBoundary],
    ['gateControlDirector', gateControlDirector],
    ['salvage', salvage],
    ['lossInvestigation', lossInvestigation],
    ['salvageActions', salvageActions],
    ['survivorPod', survivorPod],
    ['recoveryEncounter', recoveryEncounter],
    ['factions', factions],
    ['sectorSim', sectorSim],
    ['npcJobsRuntime', npcJobsRuntime],
    ['careerOrigins', careerOrigins],
    ['careerLadders', careerLadders],
    ['liveCareerLadderBranches', liveCareerLadderBranches],
    ['missions', missions],
    ['careerContracts', careerContracts],
    ['economyContracts', economyContracts],
    ['postEndingReplay', postEndingReplay],
    ['story', story],
    ['scenarioRuntime', scenarioRuntime],
    ['presentationOrchestrator', presentationOrchestrator],
    ['presentationAdapters', presentationAdapters],
    ['ships', ships],
    ['crafting', crafting],
    ['heat', heat],
    ['traffic', traffic],
    ['drill', drill],
    ['claims', claims],
    ['beacons', beacons],
    ['bandRadio', bandRadio],
    ['v2FlavorRuntime', v2FlavorRuntime],
    ['onboarding', onboarding],
    ['masslineHud', masslineHud],
    ['massSeedHud', massSeedHud],
    ['fieldHud', fieldHud],
    ['planetHud', planetHud],
    ['sectorPostcard', sectorPostcard],
    ['dockDenyBanner', dockDenyBanner],
    ['stationBroadcast', stationBroadcast],
    ['hazardHints', hazardHints],
    ['bulkHaulTag', bulkHaulTag],
    ['dangerGradient', dangerGradient],
    ['causeLedger', causeLedger],
    ['customsPrompt', customsPrompt],
    ['cargoConscience', cargoConscience],
    ['securityReadoutSystem', securityReadoutSystem],
    ['priceForecastSystem', priceForecastSystem],
    ['contractClausesSystem', contractClausesSystem],
    ['moralTrapSystem', moralTrapSystem],
    ['render', render],
    ['vfx', vfx],
    ['feel', feel],
    ['audio', audio],
    ['ui', ui],
    ['save', save],
  ];
  const lookup = new Map();
  for (const [id, system] of entries) {
    if (!system) continue;
    lookup.set(id, system);
    if (typeof system.name === 'string' && system.name) lookup.set(system.name, system);
  }
  // Slot aliases: manifest IDs aiSlot/flightSlot materialize to the selected backends.
  lookup.set('aiSlot', aiSlot);
  lookup.set('flightSlot', flightSlot);
  lookup.set('ai', aiSlot);
  lookup.set('flight', flightSlot);
  if (aiSlot && aiSlot.name) lookup.set(aiSlot.name, aiSlot);
  if (flightSlot && flightSlot.name) lookup.set(flightSlot.name, flightSlot);
  return lookup;
}

export function createRegistry(ctx) {
  const aiSlot = selectAISystem(ctx);
  // Normal play is SG-06 tactical AI + Flight V3 on rapier-dynamic. Legacy/custom branches stay
  // available for explicit tool/test fixtures, not player-facing settings or save restore.
  const flightSlot = selectFlightSystem(ctx);

  const gameplay = ctx && ctx.state && ctx.state.settings && ctx.state.settings.gameplay || {};
  const profileId = gameplay.runtimeProfile || DEFAULT_RUNTIME_PROFILE_ID;
  const systemLookup = buildRegistrySystemLookup(aiSlot, flightSlot);
  // Backend labels from the SELECTED implementation (post-fallback), not the requested setting.
  // Selectors fall back to legacy when physics is non-Rapier; recording gameplay.flightBackend='v3'
  // would give the same slot identity/hash as a true V3 runtime (both systems name 'flight').
  const slots = {
    aiSlot,
    flightSlot,
    aiBackend: (aiSlot && aiSlot.name === 'tacticalAI') ? 'sg06-tactical' : 'legacy',
    flightBackend: flightSlot === flightV3 ? 'v3' : 'legacy',
  };

  // Authoritative init + update order from the single manifest (eliminates hard-coded duplication).
  const resolved = resolveRuntimeManifest({
    profileId,
    systemLookup,
    slots,
    // Browser registry path includes presentation platform systems (render/vfx/feel/audio/ui).
    nodeSafeOnly: false,
  });

  // Seed process flag MAPS from the resolved profile so combatFlag/massline2Flag/travelFlag
  // match production browser defaults without typeof window. Instance binding is also stored.
  if (ctx && ctx.applyRuntimeFeatures !== false) {
    applyFeatureConfigToMaps(resolved.features);
  }
  if (ctx && ctx.state) {
    bindRuntimeToState(ctx.state, {
      profileId: resolved.profileId,
      features: resolved.features,
      evidenceClass: resolved.evidenceClass,
      exclusions: resolved.exclusions,
    }, resolved);
  }

  // init / registration order — materialised from PRODUCTION_INIT_ORDER (or profile set)
  const SYSTEMS = resolved.authoritativeSystems.slice();
  // sim step order (AI submits commands, actions resolve before flight, weapons before physics) — render-phase systems excluded.
  // scanReveal, buildIdentity, and pirateDisguise subscribe to scanner's scan:pulse seam. scanReveal
  // writes ship contact metadata for UI readers; buildIdentity adds the BP-09.1 archetype badge to
  // that scan payload; pirateDisguise can then mutate disguised pirates into ordinary scanner-readable
  // hostiles without scanner/HUD special cases.
  // pirateDisguise runs before AI so revealed pirates
  // become ordinary scanner-readable hostiles without scanner/HUD special cases.
  // pirateParley runs after scanner and before AI so toll-doctrine squads can hold fire before
  // tactical AI/weapons observe them; it never spawns and only uses cargo's jettison seam.
  // pirateDisengage also runs before AI; lawful patrol pressure converts pirate squads to flee
  // intent before tactical AI/weapons keep pursuing the player.
  // aceMemory runs at a throttled cadence: B10 listens for named-ace/encounter receipts, and B11
  // consumes due ace-return schedules into spawnBudget-backed promoted crews before AI ticks.
  // barkDirector runs after the tactical AI slot so state/intent transitions can enqueue one
  // faction-specific bark through voiceArbiter; it writes only state.barkDirector receipts.
  // combatOutcome runs after combat: it is observer-only receipt state over kill/flee/disable/surrender
  // events and live forceFlee flags; it never mutates combat, AI, economy, cargo, or reputation.
  // aftermathWrecks runs after combatOutcome: it observes the same live kill seam, records only
  // named-zone wreck markers, and materializes them as salvageable wreck entities on sector entry.
  // wingMorale is the squad-cohesion observer: leader loss marks surviving squadmates to flee,
  // escort loss enrages a ward, and comms/sensor disable blocks that squad's reinforcement hook.
  // surrenderRecovery runs after tetherGameplay mirrors the authoritative player attachment. It
  // turns a yielded ship into a physical reel-and-tow custody option through canonical reward seams.
  // custodyConsequences stores the captured-ship record under the saved player blob and projects
  // the result into sectorSim through its canonical bounded impulse event.
  // fieldDepletion runs immediately after mining: asteroid:destroyed still points at an entity with
  // data.fieldId, so it can emit the existing world field:depletedChanged seam without mining/world edits.
  // onboarding runs last: it only reads state (proximity checks) and drives tutorial UI.
  // heat runs late so piracy events from combat/factions this tick have landed before decay.
  // traffic runs after world (sector:enter has spawned stations) and after heat (so piracy on a
  // freighter this frame is accounted) — it only writes its own entities' intent, never player state.
  // crafting now has a real update (build-queue progress) so it's in the sim order; it only mutates
  // its own queues + grants products, never movement/combat state.
  // intervention runs after automation (so automation:assetLost this tick has fired) and prunes
  // closed salvage wrecks.
  // pirateRumor runs after encounterDirector so spawned ambush events are recorded and decayed; it
  // only writes state.pirateRumor + news/card events, never encounter/economy state.
  // ambushSignatures runs after pirateRumor/encounterDirector; it reads pending encounter plans and
  // writes only passive state.ambushSignatures tells plus scan warning events.
  // bountyHunt normalizes hunter contract target context before later readers observe hostility:
  // neutral quarry contracts avoid the force-hostile bounty_hunter context until the player is target.
  // asteroidSites runs immediately after automation: courier sale gross funnels through
  // automation.creditPassive(), whose per-minute token bucket is refilled by automation.update
  // earlier in the same tick. It owns only state.sites and emits intents/events otherwise.
  // claims runs late (after cargo/economy) so its refinery conversion uses fresh cargo state.
  // story runs after missions (so story:beatAdvanced from missions this tick has a listener ready)
  // and before ships — it only emits UI/comms/graffiti/hud events and reads state; never movement.
  // sectorSim runs after world + factions so its day-tick drift reads settled sector owners + the
  // freshly-recomputed faction power table; it owns ONLY state.sectorSim and affects the world by
  // emitting sanctioned intents (economy:applyTradePressure, factions.addOffscreenTension,
  // automation.offscreenRiskPass). It does NO per-frame work — all simulation is on day:tick /
  // sector transitions / save:loaded. A bug here can never freeze the loop (try/catch in init subs).
  // npcJobsRuntime (PQ-014) sits immediately after sectorSim (both in the world-adjacent block, after
  // world/factions have settled the current sector + entities). It is the SOLE writer of state.npcJobs
  // and drives the pure npcJobs kernel: it advances materialized miner/hauler/patrol jobs and writes
  // the SAME civilian data.intent traffic writes. traffic runs later and yields (continue) for any hull
  // with data.jobId, so there is exactly one intent writer per job hull per tick; passive team-2 hulls
  // are already off the tactical roster (aiPorts.js:303), so tactical AI never co-writes them. Like
  // sectorSim it is deliberately NOT in the sf-sim curated harness list, so the 47-A golden never runs
  // it; with no jobs assigned it is a strict no-op.
  // factionPresence runs immediately before the selected tactical AI slot: fixed-route anchors,
  // provoked convoy state, and boarding phase transitions must settle before SG-06 samples its
  // sensor/roster frame, while physics remains later in the same fixed tick to consume commands.
  // routeFollower closes the world-adjacent block (after world/regionalEcology/encounterDirector),
  // and that placement is a deliberate trade the ordering deserves stated plainly. The follower is a
  // sequencer (ADR D6): it reads the sector the ship is actually in and writes only nav intent
  // (state.nav.autopilot / nav.waypoint / its own nav.executor subtree). Its two candidate slots
  // conflict, because world sits LATE in this order while flightSlot sits early:
  //   • before flightSlot — the follower would arm this tick's autopilot, but it would decide which
  //     leg it is on from LAST tick's sector id. Gate handoff IS a sector transition, so it would
  //     mis-attribute exactly the frame that matters most and could advance a leg the ship has not
  //     crossed yet.
  //   • after world (chosen) — sector entry has settled, so `sector:enter` and world.currentSectorId
  //     are current when the leg advances. flightSlot then consumes the armed autopilot at the top of
  //     the NEXT tick, a one-tick (16.7 ms) arming latency.
  // That latency is free: nav.autopilot is LEVEL state that flightSlot re-reads every tick, not an
  // edge the follower must hit inside a window, and the follower only ever re-targets on leg
  // boundaries — never per-frame. Correct sector attribution is worth one tick of arming delay;
  // stale sector attribution is not recoverable. The follower is also a strict no-op unless
  // nav.autoTravel is true AND an engaged executor exists, so it costs four field reads otherwise.
  // It sits at the END of that block rather than spliced directly behind world: regionalEcology and
  // encounterDirector touch no nav state, so running behind them is free, and the world/ecology/
  // director run is a contiguous sequence other contracts read as a unit — a new system belongs on
  // the end of it, not through the middle. (An earlier draft did splice it and broke the adjacency
  // assertion at scripts/check-m4-regional-ecology.mjs:211.)
  // travelLanes sits between beacons and flightSlot, and that slot is forced from BOTH sides — it is
  // the only window in this order where the system can do its job at all (ADR D8, packet W3-C).
  //   • It must run AFTER input. `input` is index 0 (pinned by check-input-modalities.mjs:46) and it
  //     is what publishes `state.input.travelDrive`. There is no block to modify before it runs, and
  //     fabricating one would make travelLanes a second owner of an axis the latch owns.
  //   • It must run BEFORE flightSlot, because flightSlot forwards that same block into
  //     stepPropulsion. One slot later and the lane multiplier would always be a tick stale — the
  //     boost would apply to where the ship WAS, which on a lane is the one place it never is.
  // Within that window the position is otherwise free, so it goes last, immediately ahead of its
  // consumer: this is the same "final writer on the flight-command membrane" idiom beacons already
  // uses two slots earlier (its lure overrides intent for this tick), and tumbleStates states
  // explicitly further down. Being the last writer before the kernel reads is the property that
  // makes the modifier deterministic rather than order-sensitive.
  // It writes ONLY `state.input.travelDrive.{ceiling,rampMult}` (never `cap` — that is the carried
  // ramp state of the input↔kernel round trip), one boolean at `state.player.travelDrive.disrupted`
  // which input.js already reads, and its own `state.travelLanes` readout. It is a strict no-op
  // unless `travelFlag('laneBoost')` is on AND a player exists, so it costs two reads otherwise.
  // UPDATE_ORDER is materialised from PRODUCTION_UPDATE_ORDER via the runtime manifest.
  const UPDATE_ORDER = resolved.authoritativeUpdateOrder.slice();
  if (UPDATE_ORDER[0] !== input) {
    throw new Error('Runtime manifest must publish input from the first fixed-tick update slot');
  }
  const POST_INPUT_UPDATE_ORDER = UPDATE_ORDER.slice(1);
  // masslineTelemetry runs immediately after tetherGameplay, which mirrors state.player.tether
  // after combat/physics have settled. It is read-only telemetry — it writes only its own
  // state.player.masslineTelemetry subtree, never entities or SG-02 attachments, and emits only the
  // documented trick-read events (tether:snapCatch rung 05, tether:reelPump rung 06).
  // masslineThreats runs immediately after masslineTelemetry (rung 09): it reads the mirrored
  // tether + telemetry subtrees after they've settled this tick, writes only its own
  // state.player.masslineThreats subtree, and emits exactly one documented event (massline:threat).
  // masslineImpacts runs immediately after masslineThreats (rung 13): it reads the settled tether
  // mirror + entities to detect the whipped mass (latched or just-slung) hitting a solid body,
  // writes only its own state.player.masslineImpacts subtree, and emits exactly one documented
  // event (tether:whipImpact).
  // Massline Wave M2 ordering rationale:
  // • bulletTime + cloak run right after flybyFocus: bulletTime shares the time-effects authority
  //   with Focus (min-wins), and cloak must settle its detection radius BEFORE the AI slot builds
  //   sensor frames (aiPorts.entityContacts reads it).
  // • tumbleStates runs after aiPorts and before weapons: its zero-control overwrite belongs in
  //   the final-writer layer, and its cleared fire intent must land before weapons reads intents.
  // • collisionConsequences shares that final-writer window: SG-02 contacts arrive after physics,
  //   then its transient stagger/tumble command overwrites next tick's AI command before weapons.
  // • uniqueLootAbilities runs after impulseCharges and before physics: Choir-Bell and Tideline
  //   cross the physics-command membrane in time for this tick's solve, while its unique-only
  //   capacitor premium settles before combat's later regeneration pass.
  // • masslineThrow runs after masslineImpacts: it consumes the settled tether mirror + telemetry
  //   and may cut the attachment; tetherGameplay reconciles the cut next tick through the same
  //   path as any external cut. masslineImpactDamage / lootShards / terrainAnchors /
  //   jettisonImpulse are event-driven (no per-tick work) and sit with the family for readability.
  // beacons runs after AI/actions and before flight so its lure can override a hostile's intent for
  // this tick (drift toward the beacon) without touching AI internals; it is a no-op when none exist.
  // dockingCorridor (PQ-008) runs immediately before physics: it reads the settled input/flight
  // commands, then queues its bounded capture-assist impulse on the physics-command membrane so the
  // same tick's solve applies it — one slot later and the assist would always be a tick stale. The
  // impulse is additive (never overwrites the pilot's control command), it is computed from pure
  // manifest math (no rng, no wall time), and the system is deliberately NOT in the sf-sim curated
  // harness list, so the 47-A golden never executes it. Stations without a collisionProxy manifest
  // are skipped, leaving legacy radius docking untouched.
  // massSeed (PQ-011) sits with the impulseCharges/mines deployable family before physics: its
  // deterministic kinematic travel and authored fixed-body material flips land in the same tick's
  // SG-02 sync, and its expiry/destruction tether cuts (through the attachment authority, exact
  // reason) settle BEFORE physics' reconcile pass, so a collapsed seed can never leave a ghost
  // constraint. It is deliberately NOT in the sf-sim curated harness list — the 47-A golden never
  // presses deploy, so the system is a strict no-op there.
  // fields (PQ-012) sits immediately before physics, after the massSeed/uniqueLootAbilities/
  // dockingCorridor deployable family: the continuous-field kernel reads the settled flight/input
  // commands, then queues its bounded, coupling-selective accelerations on the physics-command
  // membrane (queuePhysicsImpulse, additive — never overwriting the pilot's control) so the same
  // tick's SG-02 solve applies them; one slot later and every field force would be a tick stale.
  // Its math is pure (positions/authored strengths/state.simTime; no rng, no wall clock), it is
  // NOT in the sf-sim curated list, and it is gated OFF under node (FIELD_FLAGS Tier-B) — three
  // independent layers keep the 47-A golden byte-identical, and nothing auto-spawns a field.
  // planetRuntime (PQ-013) sits between fields and physics: it re-binds the planet's annular
  // attraction into the SAME field kernel (registered through fields.registerExternal, so fields'
  // force pass applies it this tick), then queues its own bounded drag/recovery impulses on the
  // physics-command membrane — one slot later and both would be a tick stale. Its writes are its
  // own state.planet subtree, membrane impulses, and routed damage; golden safety is the fields
  // recipe (PLANET_FLAGS Tier-B OFF under node + authored only in sector_tethys_junction which 47a
  // never enters + absent from the sf-sim curated list).
  const byName = new Map(SYSTEMS.map((s) => [s.name, s]));
  byName.set('ai', aiSlot);
  byName.set('flight', flightSlot);
  byName.set('aiSlot', aiSlot);
  byName.set('flightSlot', flightSlot);

  return {
    systems: SYSTEMS,
    /** Sim step order (same object refs as SYSTEMS slots). Exposed for contract tests. */
    updateOrder: UPDATE_ORDER,
    /** Structured Phase-2 runtime manifest resolve result (profile, hashes, orders, features). */
    runtimeManifest: resolved,
    ctx,
    get(name) { return byName.get(name); },
    init() { for (const s of SYSTEMS) { if (s.init) s.init(ctx); } },
    destroy() {
      const seen = new Set();
      for (const s of [...UPDATE_ORDER, ...SYSTEMS]) {
        if (!s || seen.has(s) || !s.destroy) continue;
        seen.add(s);
        s.destroy();
      }
    },
    step(dt, tickBoundary = null) {
      const state = ctx.state;
      const perf = ensurePerfRuntime(state);
      const stepStart = perfNow();
      const measureSystems = perf.shouldMeasureSystemsThisStep(state.tick);
      if (!measureSystems) {
        try {
          core.preStep(dt, state);
          if (input.update) input.update(dt, state);
          if (tickBoundary && typeof tickBoundary.publishInputCommand === 'function') {
            tickBoundary.publishInputCommand(state.input, state.tick);
          }
          for (const s of POST_INPUT_UPDATE_ORDER) {
            if (s.update) s.update(dt, state);
          }
          core.lifetimeSweep(dt, state);
        } finally {
          perf.recordStepTotal(perfNow() - stepStart);
        }
        return;
      }

      let t = perfNow();
      try { core.preStep(dt, state); }
      finally { perf.recordSystem('core.preStep', perfNow() - t); }
      if (input.update) {
        t = perfNow();
        try { input.update(dt, state); }
        finally { perf.recordSystem(input.name, perfNow() - t); }
      }
      if (tickBoundary && typeof tickBoundary.publishInputCommand === 'function') {
        tickBoundary.publishInputCommand(state.input, state.tick);
      }
      for (const s of POST_INPUT_UPDATE_ORDER) {
        if (!s.update) continue;
        t = perfNow();
        try { s.update(dt, state); }
        finally { perf.recordSystem(s.name, perfNow() - t); }
      }
      t = perfNow();
      try { core.lifetimeSweep(dt, state); }
      finally {
        perf.recordSystem('core.lifetimeSweep', perfNow() - t);
        perf.recordStepTotal(perfNow() - stepStart);
      }
    },
    renderUpdate(alpha, frameDt, presentationFrame = null) {
      const state = ctx.state;
      const perf = ensurePerfRuntime(state);
      try {
        if (state.ui && state.ui.docked === true) {
          perf.recordPhase('render', 0);
          perf.recordPhase('vfx', 0);
          perf.recordPhase('feel', 0);
          if (ui.frame) {
            const t = perfNow();
            try { ui.frame(frameDt, state); }
            finally { perf.recordPhase('ui', perfNow() - t); }
          }
          return false;
        }
        let t = perfNow();
        let renderMs = 0;
        let renderedPreparedScene = false;
        const splitRender = typeof render.prepareFrame === 'function' && typeof render.drawPreparedFrame === 'function';
        let renderError = null;
        try {
          if (splitRender) renderedPreparedScene = render.prepareFrame(alpha, frameDt, presentationFrame) !== false;
          else render.renderFrame(alpha, frameDt, presentationFrame);
        }
        catch (err) { renderError = err; }
        finally { renderMs += perfNow() - t; }
        if (renderError) {
          perf.recordPhase('render', renderMs);
          throw renderError;
        }

        let vfxError = null;
        if (vfx.update) {
          t = perfNow();
          try { vfx.update(frameDt, state); }
          catch (err) { vfxError = err; }
          finally { perf.recordPhase('vfx', perfNow() - t); }
        }

        if (splitRender) {
          t = perfNow();
          try { if (renderedPreparedScene) render.drawPreparedFrame(); }
          finally {
            renderMs += perfNow() - t;
            perf.recordPhase('render', renderMs);
          }
        } else {
          perf.recordPhase('render', renderMs);
        }
        if (vfxError) throw vfxError;

        if (feel.frame) {
          t = perfNow();
          try { feel.frame(frameDt, state); }
          finally { perf.recordPhase('feel', perfNow() - t); }
        }
        if (ui.frame) {
          t = perfNow();
          try { ui.frame(frameDt, state); }
          finally { perf.recordPhase('ui', perfNow() - t); }
        }
        return true;
      } finally {
        const diag = state.render && state.render.diagnostics;
        if (diag && typeof diag.update === 'function') diag.update(frameDt);
      }
    },
  };
}

function selectAISystem(ctx) {
  const gameplay = ctx && ctx.state && ctx.state.settings && ctx.state.settings.gameplay || {};
  if (gameplay.aiBackend === 'sg06-tactical' && gameplay.physicsBackend === 'rapier-dynamic') {
    return createTacticalAISystem();
  }
  return ai;
}

// Flight controller selection. V3 only functions under rapier-dynamic, so direct tool/test fixtures
// that request another backend resolve to the legacy controller.
function selectFlightSystem(ctx) {
  const gameplay = ctx && ctx.state && ctx.state.settings && ctx.state.settings.gameplay || {};
  if (gameplay.flightBackend === 'v3' && gameplay.physicsBackend === 'rapier-dynamic') {
    return flightV3;
  }
  return flight;
}
