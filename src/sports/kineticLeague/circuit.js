// Twelve-event solo circuit. Each solution is a ship-thrust trace on the XZ stepper.
// The numbers are the deliveries that the fixed-seed tests reproduce.

import { ARENAS } from './arenas.js';

export const WIN_KINDS = Object.freeze({
  keeper: 'swept-goal',
  bank: 'banked-sweep',
  curl: 'bounded-park',
  relay: 'legal-transfer',
  magnet: 'field-bend',
  contain: 'timed-containment',
});

function phases(list) {
  return Object.freeze(list.map((row) => Object.freeze({ ...row })));
}

function thrust(forSeconds, thrustX, thrustZ, extra = {}) {
  return Object.freeze({ for: forSeconds, thrustX, thrustZ, ...extra });
}

/** @type {readonly object[]} */
export const EVENTS = Object.freeze([
  Object.freeze({
    id: 'kl-01', sport: 'keeper', arena: 'yard', tier: 'qualification', rival: 'wall',
    shots: 3, need: 2, shotSeconds: 6.5, purse: 0, maxTicks: 1400, exhibitSeed: 1001,
    banksRequired: 0, speedMax: 0, transfers: 0, minBend: 0, holdSeconds: 0,
    title: 'Open Side',
    solution: Object.freeze({
      shipAt: Object.freeze({ x: 0, z: 48 }),
      phases: phases([thrust(0.75, 0, -1)]),
    }),
    alternate: Object.freeze({
      shipAt: Object.freeze({ x: -1, z: 48 }),
      phases: phases([thrust(0.75, 0, -1)]),
    }),
  }),
  Object.freeze({
    id: 'kl-02', sport: 'keeper', arena: 'yard', tier: 'bronze', rival: 'shade',
    shots: 3, need: 2, shotSeconds: 7, purse: 8, maxTicks: 1600, exhibitSeed: 1001,
    banksRequired: 0, speedMax: 0, transfers: 0, minBend: 0, holdSeconds: 0,
    title: 'False Read',
    solution: Object.freeze({
      shipAt: Object.freeze({ x: -1, z: 48 }),
      phases: phases([thrust(0.8, 0, -1)]),
    }),
    alternate: null,
  }),
  Object.freeze({
    id: 'kl-03', sport: 'keeper', arena: 'yard', tier: 'silver', rival: 'watch',
    shots: 3, need: 2, shotSeconds: 6.5, purse: 12, maxTicks: 1500, exhibitSeed: 1001,
    banksRequired: 0, speedMax: 0, transfers: 0, minBend: 0, holdSeconds: 0,
    title: 'During the Tell',
    solution: Object.freeze({
      shipAt: Object.freeze({ x: -1, z: 48 }),
      phases: phases([thrust(0.8, 0, -1)]),
    }),
    alternate: null,
  }),
  Object.freeze({
    id: 'kl-04', sport: 'bank', arena: 'house', tier: 'qualification', rival: null,
    shots: 1, need: 1, shotSeconds: 8, purse: 0, maxTicks: 600, exhibitSeed: 1001,
    banksRequired: 1, speedMax: 0, transfers: 0, minBend: 0, holdSeconds: 0,
    narrow: false,
    title: 'One Cushion',
    solution: Object.freeze({ phases: phases([thrust(0.75, -0.3, -1)]) }),
    alternate: Object.freeze({ phases: phases([thrust(0.75, 0.25, -1)]) }),
  }),
  Object.freeze({
    id: 'kl-05', sport: 'bank', arena: 'house', tier: 'bronze', rival: null,
    shots: 1, need: 1, shotSeconds: 8, purse: 8, maxTicks: 600, exhibitSeed: 1001,
    banksRequired: 1, speedMax: 0, transfers: 0, minBend: 0, holdSeconds: 0,
    narrow: true,
    title: 'Narrow Gate',
    solution: Object.freeze({ phases: phases([thrust(0.75, -0.3, -1)]) }),
    alternate: null,
  }),
  Object.freeze({
    id: 'kl-06', sport: 'bank', arena: 'house', tier: 'silver', rival: null,
    shots: 1, need: 1, shotSeconds: 9, purse: 12, maxTicks: 700, exhibitSeed: 1001,
    banksRequired: 2, speedMax: 0, transfers: 0, minBend: 0, holdSeconds: 0,
    title: 'Two Cushions',
    solution: Object.freeze({ phases: phases([thrust(0.75, -0.3, -1)]) }),
    alternate: null,
  }),
  Object.freeze({
    id: 'kl-07', sport: 'curl', arena: 'slip', tier: 'qualification', rival: null,
    shots: 1, need: 1, shotSeconds: 12, purse: 0, maxTicks: 800, exhibitSeed: 1001,
    banksRequired: 0, speedMax: 5.5, transfers: 0, minBend: 0, holdSeconds: 0,
    pad: 'near', guard: false,
    title: 'Dead Stone',
    solution: Object.freeze({ phases: phases([thrust(0.55, 0, -1)]) }),
    alternate: Object.freeze({
      shipAt: Object.freeze({ x: 1, z: 36 }),
      phases: phases([thrust(0.55, 0, -1)]),
    }),
  }),
  Object.freeze({
    id: 'kl-08', sport: 'curl', arena: 'slip', tier: 'bronze', rival: null,
    shots: 1, need: 1, shotSeconds: 12, purse: 8, maxTicks: 800, exhibitSeed: 1001,
    banksRequired: 0, speedMax: 4, transfers: 0, minBend: 0, holdSeconds: 0,
    pad: 'cheek', guard: true,
    title: 'Kiss the Guard',
    solution: Object.freeze({
      shipAt: Object.freeze({ x: -6, z: 36 }),
      phases: phases([thrust(0.55, 0, -1)]),
    }),
    alternate: null,
  }),
  Object.freeze({
    id: 'kl-09', sport: 'relay', arena: 'dock', tier: 'qualification', rival: null,
    shots: 1, need: 1, shotSeconds: 10, purse: 0, maxTicks: 800, exhibitSeed: 1001,
    banksRequired: 0, speedMax: 0, transfers: 1, minBend: 0, holdSeconds: 0,
    title: 'One Handoff',
    solution: Object.freeze({
      phases: phases([
        thrust(0.7, 0, -1, { tether: true }),
        thrust(0.1, 0, -0.2, { cut: true }),
      ]),
    }),
    alternate: Object.freeze({
      phases: phases([
        thrust(0.85, 0, -1, { tether: true }),
        thrust(0.1, 0, 0, { cut: true }),
      ]),
    }),
  }),
  Object.freeze({
    id: 'kl-10', sport: 'relay', arena: 'dock', tier: 'silver', rival: 'charge',
    shots: 1, need: 1, shotSeconds: 14, purse: 14, maxTicks: 1100, exhibitSeed: 1001,
    banksRequired: 0, speedMax: 0, transfers: 2, minBend: 0, holdSeconds: 0,
    title: 'Second Hand',
    solution: Object.freeze({
      phases: phases([
        thrust(0.75, 0, -1, { tether: true }),
        thrust(0.06, 0, -1, { cut: true }),
        thrust(0.45, 0, -1, { tether: true }),
        thrust(0.08, 0, -1, { cut: true }),
      ]),
    }),
    alternate: null,
  }),
  Object.freeze({
    id: 'kl-11', sport: 'magnet', arena: 'dock', tier: 'bronze', rival: null,
    shots: 1, need: 1, shotSeconds: 9, purse: 8, maxTicks: 700, exhibitSeed: 1001,
    banksRequired: 0, speedMax: 0, transfers: 0, minBend: 0.28, holdSeconds: 0,
    polarity: 'well',
    title: 'Bent Pocket',
    solution: Object.freeze({
      shipAt: Object.freeze({ x: 14, z: 22 }),
      phases: phases([thrust(0.5, 1, -1)]),
    }),
    alternate: Object.freeze({
      shipAt: Object.freeze({ x: 16, z: 20 }),
      phases: phases([thrust(0.7, 1, -0.5)]),
    }),
  }),
  Object.freeze({
    id: 'kl-12', sport: 'contain', arena: 'slip', tier: 'champion', rival: null,
    shots: 1, need: 1, shotSeconds: 14, purse: 20, maxTicks: 1000, exhibitSeed: 8,
    banksRequired: 0, speedMax: 0, transfers: 0, minBend: 0, holdSeconds: 2.4,
    puckCount: 3, puckSpeed: 6.5,
    title: 'Holding Pattern',
    solution: Object.freeze({ kind: 'shepherd', shipAt: Object.freeze({ x: 0, z: -16 }) }),
    alternate: null,
  }),
]);

export function eventById(id) {
  return EVENTS.find((event) => event.id === id) || null;
}

export function eventsInArena(arenaId) {
  return EVENTS.filter((event) => event.arena === arenaId);
}

export function arenaList() {
  return Object.values(ARENAS);
}
