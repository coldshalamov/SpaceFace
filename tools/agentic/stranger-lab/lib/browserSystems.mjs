// Journey systems the Chrome tape host can load.
// scripts/lib/masslineControlLab.mjs imports node:crypto, so the no-op lab
// controller is not in this graph. Tether, mining, docking, combat, and the
// other journey systems are the ones that step.

import { actions } from '../../../../src/systems/actions.js';
import { flightV3 } from '../../../../src/systems/flightV3.js';
import { weapons } from '../../../../src/systems/weapons.js';
import { physics } from '../../../../src/core/physics.js';
import { combat } from '../../../../src/systems/combat.js';
import { tetherGameplay } from '../../../../src/systems/tetherGameplay.js';
import { masslineTelemetry } from '../../../../src/systems/masslineTelemetry.js';
import { save } from '../../../../src/save/saveSystem.js';
import { createTacticalAISystem, PRODUCTION_ENEMY_MIND_CONFIG } from '../../../../src/systems/tacticalAI.js';
import { mining } from '../../../../src/systems/mining.js';
import { scanner } from '../../../../src/systems/scanner.js';
import { economy } from '../../../../src/systems/economy.js';
import { cargo } from '../../../../src/systems/cargo.js';
import { ships } from '../../../../src/systems/ships.js';
import { missions } from '../../../../src/systems/missions.js';
import { dockingCorridor } from '../../../../src/systems/dockingCorridor.js';
import { runSession } from '../../../../src/systems/runSession.js';
import { survivalRun } from '../../../../src/systems/survivalRun.js';
import { survivalWave } from '../../../../src/systems/survivalWave.js';
import { world } from '../../../../src/systems/world.js';
import { aiPorts } from '../../../../src/systems/aiPorts.js';

const tacticalAI = createTacticalAISystem({ config: { enemyMind: PRODUCTION_ENEMY_MIND_CONFIG } });

const EXTRA = Object.freeze({
  tacticalAI,
  mining,
  scanner,
  economy,
  cargo,
  ships,
  missions,
  dockingCorridor,
  runSession,
  survivalRun,
  survivalWave,
  world,
  aiPorts,
  combat,
});

const FLIGHT = Object.freeze([actions, flightV3, weapons, physics]);
const FLIGHT_SAVE = Object.freeze([...FLIGHT, save]);
const MASSLINE = Object.freeze([
  actions,
  flightV3,
  weapons,
  physics,
  combat,
  tetherGameplay,
  masslineTelemetry,
]);

const BASE = Object.freeze({
  flight: FLIGHT,
  'flight-save': FLIGHT_SAVE,
  massline: MASSLINE,
  'massline-save': Object.freeze([...MASSLINE, save]),
});

export function systemsForBrowserJourney(journey) {
  const base = BASE[journey.bundle] || FLIGHT;
  const systems = base.slice();
  const extras = journey.extras || [];
  if (extras.includes('tacticalAI')) {
    const at = systems.findIndex((system) => system && system.name === 'weapons');
    const index = at < 0 ? systems.length : at;
    systems.splice(index, 0, tacticalAI);
  }
  for (const id of extras) {
    if (id === 'tacticalAI') continue;
    const system = EXTRA[id];
    if (!system) throw new Error(`unknown stranger extra system: ${id}`);
    systems.push(system);
  }
  return systems;
}
