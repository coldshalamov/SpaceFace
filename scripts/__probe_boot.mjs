import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { voiceArbiter } from '../src/ui/voiceArbiter.js';
import { input } from '../src/systems/input.js';
import { autoTargetAssist } from '../src/systems/autoTargetAssist.js';
import { scanner } from '../src/systems/scanner.js';
import { createTacticalAISystem } from '../src/systems/tacticalAI.js';
import { aiEncounter,actions,beacons,flightV3,cruise,aiPorts,weapons,countermeasures,impulseCharges,combat,tetherGameplay,masslineTelemetry,masslineThreats,masslineImpacts,mining,cargo,economy,automation,wingmen,crafting,intervention,world,encounterDirector,salvage,factions,sectorSim,missions,story,scenarioRuntime,presentationOrchestrator,presentationAdapters,ships,heat,traffic,drill,claims,onboarding,spawnBudget } from './_sysbulk.js';
