// Veil Step law. A shadow held on Shift, a step on release, a wall that stops it.
import assert from 'node:assert/strict';
import {
  cancelPhaseBlink,
  phaseBlinkClearDistance,
  stepPhaseBlink,
} from '../src/systems/phaseBlink.js';

function hull(x = 0, z = 0) {
  return {
    id: 1,
    rot: 0,
    radius: 14,
    pos: { x, y: 0, z },
    prevPos: { x, y: 0, z },
    flags: {},
    boost: { max: 200, energy: 200, drainRate: 38, regenRate: 22 },
  };
}

const events = [];
const bus = { emit(name, payload) { events.push({ name, payload }); } };

const open = { entities: new Map(), entityList: [] };
const ship = hull();
let phase = stepPhaseBlink({ entity: ship, held: true, dt: 1 / 60, state: open, bus, now: 1 });
assert.equal(phase.busy, true);
assert.equal(ship._phaseBlink.active, true);
assert.ok(ship._phaseBlink.x > 30, 'the shadow leaves the hull on the press');
assert.equal(ship.pos.x, 0, 'holding does not move the hull');

for (let i = 0; i < 40; i += 1) {
  phase = stepPhaseBlink({ entity: ship, held: true, dt: 1 / 60, state: open, bus, now: 1 + i / 60 });
}
assert.ok(ship._phaseBlink.dist > 200, `a full hold reaches, got ${ship._phaseBlink.dist}`);
const aimed = ship._phaseBlink.x;
phase = stepPhaseBlink({ entity: ship, held: false, dt: 1 / 60, state: open, bus, now: 2 });
assert.equal(phase.committed, true);
assert.equal(ship.pos.x, aimed);
assert.equal(ship.flags.noInterp, true);
assert.ok(events.some((e) => e.name === 'ship:phaseBlink'));
assert.ok(events.some((e) => e.name === 'audio:cue' && e.payload.id === 'sfx_phase_rift'));
assert.ok(ship.boost.energy < 200);

const walled = hull();
const rock = { id: 9, type: 'asteroid', alive: true, radius: 18, pos: { x: 40, y: 0, z: 0 } };
const blocked = { entities: new Map([[9, rock]]), entityList: [rock] };
const stopped = phaseBlinkClearDistance(blocked, walled, 0, 240);
assert.ok(stopped < 40, `the rock stops the shadow, got ${stopped}`);
stepPhaseBlink({ entity: walled, held: true, dt: 0.2, state: blocked, bus, now: 3 });
assert.ok(walled._phaseBlink.dist < 36);
const before = walled.pos.x;
stepPhaseBlink({ entity: walled, held: false, dt: 1 / 60, state: blocked, bus, now: 3.2 });
assert.equal(walled.pos.x, before, 'a wall in the face is not a step');

const dry = hull();
dry.boost.energy = 10;
stepPhaseBlink({ entity: dry, held: true, dt: 0.1, state: open, bus, now: 4 });
assert.notEqual(dry._phaseBlink.active, true);
assert.equal(dry.pos.x, 0);

const aiming = hull();
stepPhaseBlink({ entity: aiming, held: true, dt: 0.2, state: open, bus, now: 5 });
assert.equal(aiming._phaseBlink.active, true);
cancelPhaseBlink(aiming);
assert.equal(aiming._phaseBlink.active, false);
stepPhaseBlink({ entity: aiming, held: true, dt: 0.1, state: open, bus, now: 5.1 });
assert.equal(aiming.pos.x, 0, 'a cancelled hold does not step and does not re-arm until release');
assert.notEqual(aiming._phaseBlink.active, true);

console.log('phase blink ok');
