// INFERENCE unit — every named zone carries an authored one-line reason ("Sensors ghost,
// autopilot drifts; the Vael guard whatever waits inside.") that `world:zoneEntered` emits and
// nobody displays: the crossing toast dropped everything but the name. The reason now rides a
// once-per-zone-per-session info toast beside the name toast — the place tells you what it is
// the first time you enter it, the name still announces every crossing.
import test from 'node:test';
import assert from 'node:assert/strict';

import { world } from '../src/systems/world.js';
import { createBus } from '../src/core/eventBus.js';
import { zoneAt, zonesForSector } from '../src/data/sectorZones.js';

const SECTOR = 'sector_helios_prime';

// A zone that zoneAt resolves to ITSELF at its own center (the innermost at that point), so
// the probe is deterministic: overlapping zones nest, and the smallest container wins.
function selfResolvingZone() {
  for (const z of zonesForSector(SECTOR)) {
    if (!z || !z.reason || !z.center) continue;
    if (zoneAt(SECTOR, z.center.x, z.center.z) === z) return z;
  }
  return null;
}

const zone = selfResolvingZone();
assert.ok(zone, 'helios authors a reasoned zone that wins its own center');

function makeHarness() {
  const bus = createBus();
  const toasts = [];
  const zoneEntered = [];
  bus.on('toast', (p) => toasts.push(p || {}));
  bus.on('world:zoneEntered', (p) => zoneEntered.push(p || {}));
  const state = {
    simTime: 100,
    playerId: 'player',
    entities: new Map([
      ['player', { id: 'player', pos: { x: 0, z: 0 } }],
    ]),
    world: { currentSectorId: SECTOR, currentZoneId: null, currentZone: null },
  };
  const w = Object.create(world);
  w.bus = bus;
  w.state = state;
  w._sectorOrigin = () => ({ x: 0, z: 0 });
  const enterAt = (x, z) => {
    state.entities.get('player').pos.x = x;
    state.entities.get('player').pos.z = z;
    w._tickZoneLabel(state);
  };
  return { bus, toasts, zoneEntered, enterAt, state };
}

const cx = zone.center.x;
const cz = zone.center.z;
const span = (zone.radius || 100) * 40 + 5000;
const far = { x: cx + span, z: cz + span };

test('first crossing into a named zone speaks its authored reason line', () => {
  const { toasts, zoneEntered, enterAt } = makeHarness();
  enterAt(cx, cz);
  const reasonCard = toasts.find((t) => t.text === zone.reason);
  assert.ok(reasonCard, 'the authored sentence reaches the receipt lane');
  assert.equal(reasonCard.kind, 'info');
  assert.equal(reasonCard.ttl, 6);
  assert.equal(zoneEntered[0].reason, zone.reason, 'the event payload is unchanged');
  assert.ok(toasts.some((t) => t.text === zone.name), 'the name toast still announces');
});

test('re-crossing the same zone re-announces the name but not the sentence', () => {
  const { toasts, enterAt } = makeHarness();
  enterAt(cx, cz);
  enterAt(far.x, far.z);
  enterAt(cx, cz);
  assert.equal(toasts.filter((t) => t.text === zone.name).length, 2,
    'every crossing announces the name');
  assert.equal(toasts.filter((t) => t.text === zone.reason).length, 1,
    'the sentence is a first-visit line');
});

test('a different zone speaks its own sentence, keyed by its own id', () => {
  const zones = zonesForSector(SECTOR).filter((z) => z && z.reason && z.center
    && zoneAt(SECTOR, z.center.x, z.center.z) === z);
  assert.ok(zones.length >= 2, 'helios authors several reasoned zones');
  const other = zones.find((z) => z.id !== zone.id && z.reason !== zone.reason);
  if (!other) return; // no independent sibling — the keyed-set case is pinned above
  const { toasts, enterAt } = makeHarness();
  enterAt(cx, cz);
  enterAt(other.center.x, other.center.z);
  assert.equal(toasts.filter((t) => t.text === other.reason).length, 1,
    'each zone gets its own first-visit sentence');
});
