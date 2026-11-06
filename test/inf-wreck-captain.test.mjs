// inf-wreck-captain (WF-09): the wreck history's person. The hull registry gives every
// anonymous traffic hull a painted name and a captain, and a hail answers with both — but
// when one of those hulls died, the record kept only a class label. The scan told you how
// the hulk died and what it carried, yet the person who was aboard stayed anonymous. This
// pins the capture: the aftermath owner stamps the registry identity at record time (the
// same law as the killer label — entity ids recycle, mints do not), the spawned wreck's
// provenance carries it, the save round-trip keeps it, and the scanned readout names
// CAPT. <name> of the <ship> through the same gate. Authored hulls never mint.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  aftermathForSector,
  aftermathWrecks,
} from '../src/systems/aftermathWrecks.js';
import { registryIdentityFor, hailRegistrySlot } from '../src/data/shipRegistry.js';
import { GENERIC_ROLE_LABELS } from '../src/data/contactHail.js';
import * as targetPanel from '../src/ui/targetPanel.js';

const SECTOR_ID = 'sector_helios_prime';

class Bus {
  constructor() { this.handlers = new Map(); this.log = []; }
  on(name, fn) {
    const list = this.handlers.get(name) || [];
    list.push(fn);
    this.handlers.set(name, list);
  }
  off(name, fn) {
    this.handlers.set(name, (this.handlers.get(name) || []).filter((entry) => entry !== fn));
  }
  emit(name, payload) {
    this.log.push({ name, payload });
    for (const fn of [...(this.handlers.get(name) || [])]) fn(payload);
  }
}

function boot(seed = 4242) {
  const state = {
    meta: { seed },
    tick: 120,
    simTime: 30,
    playerId: 1,
    player: { cargo: { items: {}, capVolume: 40, usedVolume: 0, usedMass: 0 }, miningBeam: null },
    world: { currentSectorId: SECTOR_ID },
    entities: new Map(),
    entityList: [],
    rng() { return 0.42; },
  };
  const bus = new Bus();
  let nextEntityId = 500;
  const helpers = {
    spawnEntity(spec) {
      const entity = {
        ...spec,
        id: nextEntityId++,
        alive: true,
        pos: { ...(spec.pos || {}) },
        vel: { ...(spec.vel || { x: 0, z: 0 }) },
        data: spec.data ? { ...spec.data } : {},
      };
      state.entities.set(entity.id, entity);
      state.entityList.push(entity);
      return entity;
    },
  };
  const registry = {
    get(name) { return name === 'aftermathWrecks' ? aftermathWrecks : null; },
  };
  aftermathWrecks.init({ state, bus, helpers, registry });
  return { state, bus, helpers };
}

function killHull(ctx, pos, id, data) {
  const victim = {
    id,
    type: 'ship',
    alive: false,
    pos: { ...pos },
    vel: { x: 30, z: -12 },
    mass: 26,
    factionId: 'faction_vanguard',
    data: { defId: 'ship_mule', shipClass: 'hauler', ...data },
  };
  ctx.state.entities.set(victim.id, victim);
  ctx.state.entityList.push(victim);
  ctx.bus.emit('entity:killed', {
    id: victim.id,
    killerId: 1,
    type: 'ship',
    victimClass: 'hauler',
    factionId: victim.factionId,
    pos: { ...victim.pos },
    sectorId: SECTOR_ID,
  });
}

function openPos(nudge = 0) {
  return { x: 10000 + 180000 + nudge, z: -10000 };
}

function wreckEntities(state) {
  return state.entityList.filter((entity) => entity && entity.type === 'wreck'
    && entity.alive !== false && entity.data && entity.data.markerId != null);
}

function stateFor(e, simTime = 1800) {
  return { entities: new Map([[e.id, e]]), entityList: [e], player: {}, playerId: 'player', simTime };
}

const lineFor = (e, simTime) => targetPanel.objectInfoLine(e, stateFor(e, simTime), {}, 50);

test('a minted hauler dies with its captain, under the hail path\u2019s own mint rule', () => {
  const h = boot(4242);
  try {
    const liveIdentity = { data: { trafficLabel: 'Cargo Hauler', worldRecordId: 'wr_hauler_9' } };
    const expected = hailRegistrySlot(liveIdentity, 4242, GENERIC_ROLE_LABELS);
    assert.ok(expected, 'the hull would have minted on hail — the record must agree');

    killHull(h, openPos(), 77, { trafficLabel: 'Cargo Hauler', worldRecordId: 'wr_hauler_9' });
    const markers = aftermathForSector(h.state, SECTOR_ID);
    assert.equal(markers.length, 1);
    const mint = registryIdentityFor(4242, 'wr_hauler_9');
    assert.equal(markers[0].victimRegistry && markers[0].victimRegistry.shipName, mint.shipName);
    assert.equal(markers[0].victimRegistry && markers[0].victimRegistry.captain, mint.captain);
    assert.ok(expected.includes(mint.shipName) && expected.includes(mint.captain),
      'the hail header and the death record name the same ship and captain');
  } finally { aftermathWrecks.destroy(); }
});

test('an authored hull never mints — a named ship keeps exactly its own name', () => {
  const h = boot(4242);
  try {
    killHull(h, openPos(1000), 81, { name: 'Gray Havoc' });
    const markers = aftermathForSector(h.state, SECTOR_ID);
    assert.equal(markers.length, 1);
    assert.equal(markers[0].victimRegistry, null,
      'an authored name is identity; the registry stays out of its record');
  } finally { aftermathWrecks.destroy(); }
});

test('an authored route label never mints either', () => {
  const h = boot(4242);
  try {
    killHull(h, openPos(2000), 83, { trafficLabel: 'EXPRESS LINER · RUN 7' });
    const markers = aftermathForSector(h.state, SECTOR_ID);
    assert.equal(markers.length, 1);
    assert.equal(markers[0].victimRegistry, null);
  } finally { aftermathWrecks.destroy(); }
});

test('the spawned wreck carries the captain in provenance, and the scan names them', () => {
  const h = boot(4242);
  try {
    killHull(h, openPos(3000), 85, { trafficLabel: 'Cargo Hauler', worldRecordId: 'wr_hauler_11' });
    const live = wreckEntities(h.state);
    assert.equal(live.length, 1);
    const registry = live[0].data.provenance.victimRegistry;
    assert.ok(registry, 'provenance carries the registry identity');
    const mint = registryIdentityFor(4242, 'wr_hauler_11');
    assert.equal(registry.captain, mint.captain);
    assert.equal(registry.shipName, mint.shipName);

    const scanned = lineFor({ ...live[0], data: { ...live[0].data, scanned: true } });
    assert.match(scanned, new RegExp(`CAPT\\. ${mint.captain}`),
      `the scanned readout names the captain: ${scanned}`);
    assert.match(scanned, new RegExp(`of the ${mint.shipName}`),
      'the painted hull name rides the same line');
  } finally { aftermathWrecks.destroy(); }
});

test('the captain survives a save round-trip; a legacy record honestly restores to nobody', () => {
  const h = boot(4242);
  try {
    killHull(h, openPos(4000), 87, { trafficLabel: 'Cargo Hauler', worldRecordId: 'wr_hauler_13' });
    const mint = registryIdentityFor(4242, 'wr_hauler_13');

    const bag = JSON.parse(JSON.stringify(aftermathWrecks.serialize()));
    aftermathWrecks.deserialize(bag);
    let markers = aftermathForSector(h.state, SECTOR_ID);
    assert.equal(markers.length, 1);
    assert.equal(markers[0].victimRegistry && markers[0].victimRegistry.captain, mint.captain,
      'the captain rides the save round-trip');

    // A marker written before the capture restores without one: strip the field the way an
    // older save legitimately lacks it, and the scan honestly stays silent rather than
    // re-minting against an id that may have recycled.
    const legacy = JSON.parse(JSON.stringify(aftermathWrecks.serialize()));
    for (const row of legacy.bySector[SECTOR_ID] || []) delete row.victimRegistry;
    aftermathWrecks.deserialize(legacy);
    markers = aftermathForSector(h.state, SECTOR_ID);
    assert.equal(markers[0].victimRegistry, null, 'legacy records restore to nobody');

    const line = lineFor({
      id: 1, type: 'wreck', alive: true, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, radius: 12,
      data: { scanned: true, provenance: { victimRegistry: null, freightIdentity: { manifestId: 'X' } } },
    });
    assert.doesNotMatch(line, /CAPT\. /, 'no minted captain, no line');
    assert.match(line, /Manifest X/, 'the rest of the history still reads');
  } finally { aftermathWrecks.destroy(); }
});
