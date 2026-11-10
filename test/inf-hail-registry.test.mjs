// inf-hail-registry — WF-09: contacts stop being anonymous.
//
// Before this unit, hailing ordinary traffic answered with the hull's job description:
// "CARGO HAULER · CIVILIAN FREIGHT". Every hauler, miner and courier on the lane was
// anonymous machinery. This pins the hull registry (src/data/shipRegistry.js):
//   * an anonymous hull's hail header carries a painted ship name and its captain,
//     deterministically minted from (save seed, entity identity);
//   * the same hull keeps the same name across ticks and across a world-record reload
//     (worldRecordId is the mint key, so a durable hull survives a save/load with its name);
//   * authored identity always wins — a writer's callsign/scanLabel/name and a specific
//     route-hook traffic label never mint;
//   * the deck label (commsRadial resolveHailVisual) reads the same registry, so the contact
//     is named before the channel even opens;
//   * the role suffix (CIVILIAN FREIGHT / LAWFUL PATROL) still reads as the class word — the
//     deck's class parsing takes the segment after the last separator.

import test from 'node:test';
import assert from 'node:assert/strict';

const CONTACT_HAIL_URL = new URL('../src/data/contactHail.js', import.meta.url);
const SHIP_REGISTRY_URL = new URL('../src/data/shipRegistry.js', import.meta.url);
const COMMS_RADIAL_URL = new URL('../src/ui/commsRadial.js', import.meta.url);

const {
  contactHailAvailability,
  createContactHailOffer,
  createContactHailResponse,
  GENERIC_ROLE_LABELS,
} = await import(CONTACT_HAIL_URL);
const { hailRegistrySlot, registryIdentityFor, SHIP_NAME_STOCK, CAPTAIN_NAME_STOCK } = await import(SHIP_REGISTRY_URL);
const { resolveHailVisual } = await import(COMMS_RADIAL_URL);

function entity(id, overrides = {}) {
  const base = {
    id,
    type: 'ship',
    alive: true,
    team: 2,
    pos: { x: 400, z: 0 },
    vel: { x: 0, z: 0 },
    data: {},
  };
  return {
    ...base,
    ...overrides,
    pos: { ...base.pos, ...(overrides.pos || {}) },
    data: { ...base.data, ...(overrides.data || {}) },
  };
}

function anonymousHauler(id = 'wr_hauler_01', worldRecordId = id) {
  return entity(id, {
    data: {
      trafficRole: 'hauler',
      trafficLabel: 'Cargo Hauler',
      worldRecordId,
      ai: { passive: true, archetype: 'fleeing_trader', spawnContext: 'lane_traffic' },
    },
  });
}

function baseState(target, seed = 4242) {
  const player = entity('player', { team: 1, pos: { x: 0, z: 0 }, data: {} });
  const entities = new Map([[player.id, player]]);
  if (target) entities.set(target.id, target);
  return {
    mode: 'flight',
    simTime: 10,
    tick: 600,
    meta: { seed },
    playerId: player.id,
    player: {
      team: 1,
      targetId: target && target.id,
      credits: 4321,
      heat: 0,
      activeShipIndex: 0,
      ownedShips: [{ defId: 'ship_kestrel', fittings: [null, null, null, null, null, null] }],
      moduleInventory: [],
      cargo: { items: {} },
    },
    entities,
    entityList: [...entities.values()],
    input: { actions: {} },
    ui: { docked: false },
    world: { currentSectorId: 'sector_test', scanPings: {} },
    factions: { faction_scn: { rep: 7 } },
    traffic: { freighters: [] },
    pirateParley: { squads: {} },
  };
}

test('registry mint is deterministic per (seed, entity) and draws from the authored stocks', () => {
  const a = registryIdentityFor(4242, 'wr_hauler_01');
  const b = registryIdentityFor(4242, 'wr_hauler_01');
  const other = registryIdentityFor(4242, 'wr_hauler_02');
  const otherSeed = registryIdentityFor(777, 'wr_hauler_01');
  assert.equal(a.shipName, b.shipName);
  assert.equal(a.captain, b.captain);
  assert.ok(SHIP_NAME_STOCK.some((row) => row.name === a.shipName), 'ship name comes from the authored stock');
  assert.ok(CAPTAIN_NAME_STOCK.some((row) => row.name === a.captain), 'captain comes from the authored stock');
  assert.ok(a.shipName !== other.shipName || a.captain !== other.captain, 'two hulls do not read as the same vessel');
  assert.ok(a.captain !== otherSeed.captain || a.shipName !== otherSeed.shipName, 'a different save seeds a different world of names');
});

test('the registry slot names an anonymous hull and never overwrites an authored line', () => {
  const generic = { id: 7, data: { trafficRole: 'hauler', trafficLabel: 'Cargo Hauler' } };
  const slot = hailRegistrySlot(generic, 4242, GENERIC_ROLE_LABELS);
  assert.ok(slot, 'a generic role label is anonymity, so it mints');
  assert.ok(slot.includes('·'), 'slot reads SHIP · CAPT. NAME');
  assert.match(slot, /CAPT\./, 'the captain carries the honorific');

  assert.equal(hailRegistrySlot({ id: 8, data: { trafficLabel: 'Cargo Hauler', name: 'Stormshift' } }, 4242, GENERIC_ROLE_LABELS), null,
    'an authored data.name is a writer identity');
  assert.equal(hailRegistrySlot({ id: 9, data: { trafficLabel: 'Cargo Hauler', callsign: 'SUNWARD' } }, 4242, GENERIC_ROLE_LABELS), null,
    'an authored callsign is a writer identity');
  assert.equal(hailRegistrySlot({ id: 10, data: { trafficLabel: 'Cargo Hauler', scanLabel: 'COURIER FRAME — ITS LETTER IS IN YOUR CUSTODY' } }, 4242, GENERIC_ROLE_LABELS), null,
    'a scan reveal line is a writer identity');
  assert.equal(hailRegistrySlot({ id: 11, data: { trafficLabel: 'EXPRESS LINER · HELIOS ORBITAL RUN' } }, 4242, GENERIC_ROLE_LABELS), null,
    'a specific route-hook label is authored, not anonymous');
  assert.equal(hailRegistrySlot({ id: 12, data: { trafficLabel: 'Cargo Hauler', aceMemory: { role: 'boss', aceName: 'Venn' } } }, 4242, GENERIC_ROLE_LABELS), null,
    'an ace boss hull answers with its ace name, not the registry');
  assert.ok(hailRegistrySlot({ id: 13, data: { trafficLabel: 'Raider' } }, 4242, GENERIC_ROLE_LABELS),
    'a generic raider label is anonymity too — it mints');
});

test('hailing an anonymous hauler answers with its painted name and captain, not its job', () => {
  const target = anonymousHauler();
  const state = baseState(target);
  const availability = contactHailAvailability(state);
  assert.ok(availability.enabled, 'the anonymous hauler is hailable');
  const seed = state.meta.seed;
  const expected = hailRegistrySlot(target, seed, GENERIC_ROLE_LABELS).toUpperCase();
  assert.ok(availability.label.includes(expected), `the hail button names the ship and captain (label: ${availability.label})`);
  assert.ok(!availability.label.includes('CARGO HAULER'), 'the job description no longer answers for the hull');
  const offer = createContactHailOffer(state, availability, 'req-1', state.simTime + 8);
  assert.ok(offer, 'an offer is built');
  assert.match(offer.lines[0], new RegExp(expected.split(' · ')[0]), 'the header opens with the ship name');
  assert.match(offer.lines[0], /CAPT\./, 'the header carries the captain');
  assert.match(offer.lines[0], /CIVILIAN FREIGHT/, 'the role suffix still reads as the class word');
});

test('a durable hull keeps its name across a world-record reload', () => {
  const before = anonymousHauler('wr_hauler_09', 'wr_hauler_09');
  const stateA = baseState(before);
  const offerA = createContactHailOffer(stateA, contactHailAvailability(stateA), 'req-a', stateA.simTime + 8);
  // The live entity is gone; the world record rehydrates a new live hull with a new entity id
  // but the same worldRecordId.
  const after = anonymousHauler('live_hull_777', 'wr_hauler_09');
  const stateB = baseState(after);
  const offerB = createContactHailOffer(stateB, contactHailAvailability(stateB), 'req-b', stateB.simTime + 8);
  assert.equal(offerA.lines[0], offerB.lines[0], 'the same world record answers with the same ship and captain');
});

test('two anonymous hulls do not share one name', () => {
  const seen = new Set();
  for (let i = 0; i < 40; i++) {
    const hull = { id: `wr_hull_${i}`, data: { trafficLabel: 'Cargo Hauler' } };
    const slot = hailRegistrySlot(hull, 4242, GENERIC_ROLE_LABELS);
    assert.ok(slot, `hull ${i} mints`);
    seen.add(slot);
  }
  assert.ok(seen.size > 20, `a lane of 40 hulls reads as many vessels (got ${seen.size} distinct identities)`);
});

test('the comms deck label reads the same registry before the channel opens', () => {
  const target = anonymousHauler();
  const state = baseState(target);
  const availability = contactHailAvailability(state);
  const offer = createContactHailOffer(state, availability, 'req-4', state.simTime + 8);
  const visual = resolveHailVisual(state, offer, availability);
  const expected = hailRegistrySlot(target, state.meta.seed, GENERIC_ROLE_LABELS).toUpperCase();
  assert.equal(visual.pilot, expected, 'the deck pilot line names the ship and captain');
  assert.equal(visual.classWord, 'CIVILIAN FREIGHT', 'the class word still parses from the role suffix');
});

test('an authored hull keeps its written name through the same path', () => {
  const named = entity('trader-1', {
    data: {
      trafficRole: 'hauler',
      callsign: 'SUNWARD',
      ai: { passive: true, archetype: 'fleeing_trader', spawnContext: 'lane_traffic' },
    },
  });
  const state = baseState(named);
  const availability = contactHailAvailability(state);
  assert.ok(availability.label.includes('SUNWARD'), 'the writer’s callsign answers unchanged');
  const offer = createContactHailOffer(state, availability, 'req-2', state.simTime + 8);
  assert.match(offer.lines[0], /SUNWARD/, 'the offer header keeps the authored name');
  assert.doesNotMatch(offer.lines[0], /CAPT\./, 'no registry mint rides on an authored hull');
});

test('identify answers carry the registry identity for anonymous workers', () => {
  const worker = anonymousHauler('wr_miner_03');
  worker.data.trafficRole = 'miner';
  worker.data.trafficLabel = 'Mining Barge';
  worker.data.jobId = 'job:wr_miner_03';
  worker.data.jobPhase = 'transit';
  const state = baseState(worker);
  const availability = contactHailAvailability(state);
  assert.ok(availability.enabled, 'a stamped worker is hailable');
  assert.equal(availability.kind, 'worker', 'a living work stamp puts the hull on the work channel');
  const offer = createContactHailOffer(state, availability, 'req-3', state.simTime + 8);
  assert.ok(offer, 'an offer is built');
  const response = createContactHailResponse(state, offer, 'identify', {});
  assert.ok(response && Array.isArray(response.lines) && response.lines[0], 'identify answers');
  assert.match(response.lines[0], /CAPT\./, 'the identify read names the captain');
  assert.match(response.lines[0], /MINER/, 'the role still reads as the class word');
});
