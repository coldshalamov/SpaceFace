// Four material families. These are cargo / machinery / structure laws.
// They are not asteroid cook-off (environmentMaterials), not explosive-pod
// exposure (volatileExposure + lootShards), and not combat charge dipoles
// (emergentPrimitives). A commodity hint is a content label only.

import { volatileClassOf } from '../commodityVolatileClasses.js';
import {
  BRITTLE_HEAT_THRESHOLD,
  REACTIVE_BUDGETS,
  VOLATILE_HEAT_THRESHOLD,
} from './budgets.js';

export const FERROMAGNETIC = Object.freeze({
  id: 'ferromagnetic',
  title: 'Ferromagnetic cargo',
  couplesTo: 'authored-magnetic-machine',
  susceptibility: 1,
});

export const VOLATILE = Object.freeze({
  id: 'volatile',
  title: 'Volatile container',
  heatThreshold: VOLATILE_HEAT_THRESHOLD,
  impactSpeed: REACTIVE_BUDGETS.volatileImpactSpeed,
  chemicalEnergy: REACTIVE_BUDGETS.volatileChemicalEnergy,
  impulseCap: REACTIVE_BUDGETS.volatileImpulseCap,
});

export const BRITTLE = Object.freeze({
  id: 'brittle',
  title: 'Brittle cryo structure',
  heatThreshold: BRITTLE_HEAT_THRESHOLD,
  impactSpeed: REACTIVE_BUDGETS.brittleImpactSpeed,
  shards: REACTIVE_BUDGETS.brittleShards,
});

export const ELASTIC = Object.freeze({
  id: 'elastic',
  title: 'Elastic cargo',
  maxStored: REACTIVE_BUDGETS.elasticMaxStored,
  release: REACTIVE_BUDGETS.elasticRelease,
  stiffness: REACTIVE_BUDGETS.elasticK,
});

export const REACTIVE_FAMILIES = Object.freeze({
  ferromagnetic: FERROMAGNETIC,
  volatile: VOLATILE,
  brittle: BRITTLE,
  elastic: ELASTIC,
});

export const REACTIVE_FAMILY_IDS = Object.freeze([
  'ferromagnetic',
  'volatile',
  'brittle',
  'elastic',
]);

/**
 * @param {'ferromagnetic'|'volatile'|'brittle'|'elastic'} family
 */
export function familyRecord(family) {
  switch (family) {
    case 'ferromagnetic':
      return FERROMAGNETIC;
    case 'volatile':
      return VOLATILE;
    case 'brittle':
      return BRITTLE;
    case 'elastic':
      return ELASTIC;
    default: {
      /** @type {never} */
      const neverFamily = family;
      throw new Error(`unknown reactive family: ${String(neverFamily)}`);
    }
  }
}

/**
 * Content hint only. Live pods keep their existing owners.
 * @param {string|object} commodityId
 * @returns {'ferromagnetic'|'volatile'|'brittle'|null}
 */
export function reactiveFamilyHint(commodityId) {
  const klass = volatileClassOf(commodityId);
  if (!klass) return null;
  switch (klass.id) {
    case 'explosive':
      return 'volatile';
    case 'cryogenic':
      return 'brittle';
    case 'superdense':
      return 'ferromagnetic';
    case 'corrosive':
      return null;
    default:
      return null;
  }
}

export function emptyLaws() {
  return {
    ferromagnetic: false,
    volatile: false,
    brittle: false,
    elastic: false,
  };
}

export function lawsFor(family, also = []) {
  const laws = emptyLaws();
  if (family) {
    familyRecord(family);
    laws[family] = true;
  }
  for (let i = 0; i < also.length; i++) {
    const extra = also[i];
    familyRecord(extra);
    laws[extra] = true;
  }
  return laws;
}
