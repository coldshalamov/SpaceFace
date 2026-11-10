// Machine-readable route manifest: stranger journeys plus the lab scenarios already on disk.

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { listJourneys } from './journeys.mjs';
import { listPersonas } from './personas.mjs';
import { DEFAULTS } from '../../../../src/systems/input.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '../../../..');

export const SWEEP_SEEDS = Object.freeze([7, 11, 19, 47, 101, 202, 404, 808, 1601, 2718, 3141, 9001]);

const CONTROL_ACTIONS = Object.freeze(['forward', 'reverse', 'boost', 'brake', 'reelIn', 'reelOut']);

export function buildRouteManifest() {
  const controls = {};
  const missingControls = [];
  for (const name of CONTROL_ACTIONS) {
    const bindings = DEFAULTS.BINDINGS[name];
    controls[name] = Array.isArray(bindings) ? bindings.slice() : [];
    if (!controls[name].length) missingControls.push(name);
  }
  const scenarioDir = join(ROOT, 'src/testing/scenarios');
  const labScenarios = readdirSync(scenarioDir)
    .filter((name) => name.endsWith('.scenario.json'))
    .sort()
    .map((name) => {
      const doc = JSON.parse(readFileSync(join(scenarioDir, name), 'utf8'));
      return {
        file: `src/testing/scenarios/${name}`,
        id: doc.id || null,
        evidenceClass: doc.evidenceClass || null,
        ticks: doc.ticks || null,
      };
    });
  return {
    schema: 'spaceface.strangerRouteManifest.v1',
    evidenceClass: 'focused-fixture',
    host: 'node-headless',
    journeys: listJourneys(),
    personas: listPersonas(),
    seeds: SWEEP_SEEDS.slice(),
    labScenarios,
    controlSchema: {
      source: 'src/systems/input.js',
      scheme: 'DEFAULT_BINDINGS classic',
      present: missingControls.length === 0,
      missingControls,
      driven: {
        forward: 'moveZ > 0',
        reverse: 'moveZ < 0',
        strafe: 'moveX',
        turn: 'turnIntent',
        boost: 'boost',
        brake: 'brake',
        fire: 'state.input.fire',
        mine: 'state.input.fireGroup === 2',
        tether: 'KeyF / massline grammar held',
        reel: 'reelDelta via KeyQ / KeyE line length',
        scan: 'state.input.actions.scanPulse',
      },
    },
    surfaces: [
      { id: 'keyboard', deviceTested: false, note: 'Headless sim input contract.' },
      {
        id: 'simulated-touch',
        deviceTested: false,
        viewport: { width: 390, height: 844 },
        note: 'Quantized stick. Not a physical phone.',
      },
    ],
    blindSpots: [
      'Headed browser and machine FPS are unverified in this host. Do not read wall time as a frame rate.',
      'Real iPhone hardware is not tested. simulated-touch is a separate surface.',
      'Chromium lab parity remains focused flight only (src/testing/lab/KNOWN_GAPS.md G3).',
      'Renderer, audio, and VFX stay detached. A missing GPU capture is not a missing-model defect.',
      'Open PRs own hot gameplay files. This manifest does not patch them.',
    ],
  };
}
