// Focused authoritative system lists. The sim host forks these definitions per run.
// Evidence stays focused-fixture: rendering, audio, and the full production manifest are not claimed.

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
import { combat } from '../../../../src/systems/combat.js';
import {
  FOCUSED_FLIGHT_SYSTEMS,
  FOCUSED_FLIGHT_WITH_SAVE,
  FOCUSED_MASSLINE_SYSTEMS,
  FOCUSED_MASSLINE_WITH_SAVE,
} from '../../../../src/testing/lab/systemBundles.js';

const tacticalAI = createTacticalAISystem({ config: { enemyMind: PRODUCTION_ENEMY_MIND_CONFIG } });

export const EXTRA_SYSTEMS = Object.freeze({
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

const BASE = Object.freeze({
  flight: FOCUSED_FLIGHT_SYSTEMS,
  'flight-save': FOCUSED_FLIGHT_WITH_SAVE,
  massline: FOCUSED_MASSLINE_SYSTEMS,
  'massline-save': FOCUSED_MASSLINE_WITH_SAVE,
});

export function systemsForJourney(journey) {
  const base = BASE[journey.bundle] || FOCUSED_FLIGHT_SYSTEMS;
  const systems = base.slice();
  const extras = journey.extras || [];
  if (extras.includes('tacticalAI')) {
    const at = systems.findIndex((system) => system && system.name === 'weapons');
    const index = at < 0 ? systems.length : at;
    systems.splice(index, 0, tacticalAI);
  }
  for (const id of extras) {
    if (id === 'tacticalAI') continue;
    const system = EXTRA_SYSTEMS[id];
    if (!system) throw new Error(`unknown stranger extra system: ${id}`);
    systems.push(system);
  }
  return systems;
}
