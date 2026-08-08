// Node-safe production system factory table (H4).
// Materializes the authoritative production manifest without presentation platform systems
// (render/vfx/feel/audio/ui). Avoids the browser registry path (Three.js).

import { isNodeSafeSystemId } from './authoritativeSystemManifest.js';
import { core } from '../core/coreSystem.js';
import { physics } from '../core/physics.js';
import { input } from '../systems/input.js';
import { autoTargetAssist } from '../systems/autoTargetAssist.js';
import { flybyFocus } from '../systems/flybyFocus.js';
import { scanner } from '../systems/scanner.js';
import { mines } from '../systems/mines.js';
import { dockingCorridor } from '../systems/dockingCorridor.js';
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
import { titlesSystem } from '../systems/titles.js';
import { wingMorale } from '../systems/wingMorale.js';
import { tetherGameplay } from '../systems/tetherGameplay.js';
import { masslineTelemetry } from '../systems/masslineTelemetry.js';
import { masslineThreats } from '../systems/masslineThreats.js';
import { masslineImpacts } from '../systems/masslineImpacts.js';
import { masslineSnares } from '../systems/masslineSnares.js';
import { impulseCharges } from '../systems/impulseCharges.js';
import { massSeed } from '../systems/massSeed.js';
import { fields } from '../systems/fields.js';
import { environmentalMachinery } from '../systems/environmentalMachinery.js';
import { planetRuntime } from '../systems/planetRuntime.js';
import { massSeedHud } from '../ui/massSeedHud.js';
import { fieldHud } from '../ui/fieldHud.js';
import { planetHud } from '../ui/planetHud.js';
import { masslineThrow } from '../systems/masslineThrow.js';
import { bulletTime } from '../systems/bulletTime.js';
import { tumbleStates } from '../systems/tumbleStates.js';
import { collisionConsequences } from '../systems/collisionConsequences.js';
import { masslineImpactDamage } from '../systems/masslineImpactDamage.js';
import { cloak } from '../systems/cloak.js';
import { lootShards } from '../systems/lootShards.js';
import { terrainAnchors } from '../systems/terrainAnchors.js';
import { jettisonImpulse } from '../systems/jettisonImpulse.js';
import { masslineHud } from '../ui/masslineHud.js';
import { mining } from '../systems/mining.js';
import { fieldDepletion } from '../systems/fieldDepletion.js';
import { cargo } from '../systems/cargo.js';
import { fragileCargo } from '../systems/fragileCargo.js';
import { economy } from '../systems/economy.js';
import { automation } from '../systems/automation.js';
import { asteroidSites } from '../systems/asteroidSites.js';
import { asteroidFormations } from '../systems/asteroidFormations.js';
import { wingmen } from '../systems/wingmen.js';
import { world } from '../systems/world.js';
import { heistFacilities } from '../systems/heistFacilities.js';
import { routeFollower } from '../systems/routeFollower.js';
import { travelLanes } from '../systems/travelLanes.js';
import { factions } from '../systems/factions.js';
import { sectorSim } from '../systems/sectorSim.js';
import { npcJobsRuntime } from '../systems/npcJobsRuntime.js';
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
import { spawnBudget } from '../systems/spawnBudget.js';
import { regionalEcology } from '../systems/regionalEcology.js';
import { encounterDirector } from '../systems/encounterDirector.js';
import { livingPoiBehaviors } from '../systems/livingPoiBehaviors.js';
import { pirateRumor } from '../systems/pirateRumor.js';
import { ambushSignatures } from '../systems/ambushSignatures.js';
import { bountyHunt } from '../systems/bountyHunt.js';
import { salvage } from '../systems/salvage.js';
import { voiceArbiter } from '../ui/voiceArbiter.js';
import { sectorPostcard } from '../ui/sectorPostcard.js';
import { dockDenyBanner } from '../ui/dockDenyBanner.js';
import { stationBroadcast } from '../systems/stationBroadcast.js';
import { hazardHints } from '../data/hazardLanguage.js';
import { bulkHaulTag } from '../ui/prompts/bulkHaulTag.js';
import { dangerGradient } from '../ui/dangerGradient.js';
import { causeLedger } from '../ui/causeLedger.js';
import { customsPrompt } from '../ui/customsPrompt.js';
import { cargoConscience } from '../ui/cargoConscience.js';
import { securityReadoutSystem } from '../ui/securityReadout.js';
import { priceForecastSystem } from '../ui/priceForecast.js';
import { contractClausesSystem } from '../systems/contractClauses.js';
import { moralTrapSystem } from '../systems/moralTrap.js';
import { lossLedger } from '../systems/lossLedger.js';
import { factionPresence } from '../systems/factionPresence.js';
import { bandRadio } from '../systems/bandRadio.js';
import { v2FlavorRuntime } from '../systems/v2FlavorRuntime.js';
import { lossInvestigation } from '../systems/lossInvestigation.js';
import { salvageActions } from '../systems/salvageActions.js';
import { survivorPod } from '../systems/survivorPod.js';
import { recoveryEncounter } from '../systems/recoveryEncounter.js';
import { stationSideEventDirector } from '../systems/stationSideEventDirector.js';
import { stationContacts } from '../systems/stationContacts.js';
import { stationContactLoadBoundary } from '../systems/stationContactLoadBoundary.js';
import { gateControlDirector } from '../systems/gateControlDirector.js';
import { save } from '../save/saveSystem.js';

/**
 * Build a Map of system id → factory object for Node production-fidelity runs.
 * @param {{ aiSlot?: object, flightSlot?: object, tacticalAI?: boolean, flightBackend?: string }} [options]
 */
export function getNodeSystemFactoryTable(options = {}) {
  const tacticalAI = options.tacticalAI !== false;
  const aiSlot = options.aiSlot
    || (tacticalAI ? createTacticalAISystem() : ai);
  // I5: honor flightBackend — legacy47a must materialize legacy flight, not flightV3.
  const flightBackend = typeof options.flightBackend === 'string' ? options.flightBackend : 'v3';
  const flightSlot = options.flightSlot
    || (flightBackend === 'legacy' ? flight : flightV3);

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
    ['titles', titlesSystem],
    ['wingMorale', wingMorale],
    ['tetherGameplay', tetherGameplay],
    ['surrenderRecovery', surrenderRecovery],
    ['custodyConsequences', custodyConsequences],
    ['masslineTelemetry', masslineTelemetry],
    ['masslineThreats', masslineThreats],
    ['masslineImpacts', masslineImpacts],
    ['masslineSnares', masslineSnares],
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
    ['save', save],
  ];

  const lookup = new Map();
  for (const [id, system] of entries) {
    if (!system) continue;
    if (!isNodeSafeSystemId(id) && id !== 'core') continue;
    lookup.set(id, system);
    if (typeof system.name === 'string' && system.name) lookup.set(system.name, system);
  }
  lookup.set('aiSlot', aiSlot);
  lookup.set('flightSlot', flightSlot);
  lookup.set('ai', aiSlot);
  lookup.set('flight', flightSlot);
  if (aiSlot && aiSlot.name) lookup.set(aiSlot.name, aiSlot);
  if (flightSlot && flightSlot.name) lookup.set(flightSlot.name, flightSlot);
  return lookup;
}

export function createNodeProductionSystemLookup(options = {}) {
  return getNodeSystemFactoryTable(options);
}
