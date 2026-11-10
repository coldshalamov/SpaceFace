// Immutable model catalog. Instances copy scalars; nothing in the sim writes
// these objects. Derived models are the only ones whose save mass is trusted,
// and only inside a hard range (see loadReactiveWorld).

import { lawsFor } from './families.js';

function model(row) {
  const laws = Object.freeze(lawsFor(row.family || null, row.also || []));
  return Object.freeze({
    id: row.id,
    family: row.family || null,
    also: Object.freeze([...(row.also || [])]),
    laws,
    role: row.role,
    mass: row.mass,
    radius: row.radius,
    marker: row.marker,
    susceptibility: row.susceptibility || 0,
    hitchable: row.hitchable !== false,
    anchored: row.anchored === true,
    solid: row.solid !== false,
    collides: row.collides !== false,
    derived: row.derived === true,
    shardSpread: row.shardSpread || 0,
  });
}

export const REACTIVE_MODELS = Object.freeze({
  ferro_crate: model({
    id: 'ferro_crate',
    family: 'ferromagnetic',
    role: 'cargo',
    mass: 8,
    radius: 2.6,
    marker: 'ferro',
    susceptibility: 1,
  }),
  volatile_canister: model({
    id: 'volatile_canister',
    family: 'volatile',
    role: 'cargo',
    mass: 6,
    radius: 2.2,
    marker: 'volatile',
  }),
  ferro_volatile_can: model({
    id: 'ferro_volatile_can',
    family: 'volatile',
    also: ['ferromagnetic'],
    role: 'cargo',
    mass: 7,
    radius: 2.3,
    marker: 'volatileFerro',
    susceptibility: 1.15,
  }),
  cryo_spar: model({
    id: 'cryo_spar',
    family: 'brittle',
    role: 'structure',
    mass: 14,
    radius: 6,
    marker: 'brittle',
  }),
  cryo_gate: model({
    id: 'cryo_gate',
    family: 'brittle',
    role: 'structure',
    mass: 40,
    radius: 14,
    marker: 'brittle',
    hitchable: false,
    shardSpread: 1.35,
  }),
  elastic_pod: model({
    id: 'elastic_pod',
    family: 'elastic',
    role: 'cargo',
    mass: 5,
    radius: 2.4,
    marker: 'elastic',
  }),
  inert_puck: model({
    id: 'inert_puck',
    role: 'cargo',
    mass: 3,
    radius: 2,
    marker: 'debris',
    hitchable: false,
  }),
  anchor_bumper: model({
    id: 'anchor_bumper',
    role: 'structure',
    mass: 80,
    radius: 3,
    marker: 'machine',
    anchored: true,
    hitchable: false,
  }),
  hauler: model({
    id: 'hauler',
    role: 'ship',
    mass: 16,
    radius: 3.2,
    marker: 'ship',
  }),
  reactive_debris: model({
    id: 'reactive_debris',
    role: 'debris',
    mass: 1.3,
    radius: 1.1,
    marker: 'debris',
    hitchable: false,
    derived: true,
  }),
  reactive_shard: model({
    id: 'reactive_shard',
    role: 'shard',
    mass: 7,
    radius: 2.5,
    marker: 'brittle',
    derived: true,
  }),
});

export function modelById(id) {
  return REACTIVE_MODELS[id] || null;
}
