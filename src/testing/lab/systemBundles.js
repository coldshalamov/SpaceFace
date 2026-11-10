// Focused system bundles for lab evidence classes.
// Prefer production factories; keep lists explicit so focused-fixture evidence is honest.

import { actions } from '../../systems/actions.js';
import { flightV3 } from '../../systems/flightV3.js';
import { weapons } from '../../systems/weapons.js';
import { physics } from '../../core/physics.js';
import { combat } from '../../systems/combat.js';
import { tetherGameplay } from '../../systems/tetherGameplay.js';
import { masslineTelemetry } from '../../systems/masslineTelemetry.js';
import { save } from '../../save/saveSystem.js';
import { createLabControllerSystem } from '../../../scripts/lib/masslineControlLab.mjs';

export const FOCUSED_FLIGHT_SYSTEMS = Object.freeze([
  actions,
  flightV3,
  weapons,
  physics,
]);

export const FOCUSED_MASSLINE_SYSTEMS = Object.freeze([
  actions,
  flightV3,
  createLabControllerSystem(),
  weapons,
  physics,
  combat,
  tetherGameplay,
  masslineTelemetry,
]);

export const FOCUSED_MASSLINE_WITH_SAVE = Object.freeze([
  ...FOCUSED_MASSLINE_SYSTEMS,
  save,
]);

export const FOCUSED_FLIGHT_WITH_SAVE = Object.freeze([
  ...FOCUSED_FLIGHT_SYSTEMS,
  save,
]);

/**
 * Resolve a systems list from a compiled scenario.
 * @param {object} canonical
 */
export function resolveSystemsForScenario(canonical) {
  if (Array.isArray(canonical.systems) && canonical.systems.length) {
    return resolveNamedSystems(canonical.systems);
  }
  const hasAttachment = Array.isArray(canonical.attachments) && canonical.attachments.length > 0;
  const wantsSave = (canonical.assertions || []).some(
    (a) => a.kind === 'equivalence' && (a.equivalence === 'uninterrupted-eq-save-load'
      || a.equivalence === 'save-load'
      || a.expected === 'uninterrupted-eq-save-load'),
  ) || (canonical.checkpoints || []).some((c) => c.kind === 'save-load');
  const fixture = canonical.world && canonical.world.fixtureProfile;

  if (fixture === 'flight' || fixture === 'empty-flight') {
    return wantsSave ? [...FOCUSED_FLIGHT_WITH_SAVE] : [...FOCUSED_FLIGHT_SYSTEMS];
  }
  if (hasAttachment || fixture === 'massline' || fixture === 'massline-orbit') {
    return wantsSave ? [...FOCUSED_MASSLINE_WITH_SAVE] : [...FOCUSED_MASSLINE_SYSTEMS];
  }
  // Default: massline-capable focused set (superset of flight)
  return wantsSave ? [...FOCUSED_MASSLINE_WITH_SAVE] : [...FOCUSED_MASSLINE_SYSTEMS];
}

function resolveNamedSystems(names) {
  const map = {
    actions,
    flightV3,
    flight: flightV3,
    weapons,
    physics,
    combat,
    tetherGameplay,
    masslineTelemetry,
    save,
    masslineLabController: createLabControllerSystem(),
  };
  const out = [];
  for (const name of names) {
    if (name === 'core') continue; // always prepended
    const sys = map[name];
    if (!sys) throw new Error(`unknown lab system id: ${name}`);
    // Controller system is a factory product — create fresh each resolve
    if (name === 'masslineLabController') {
      out.push(createLabControllerSystem());
    } else {
      out.push(sys);
    }
  }
  return out;
}
