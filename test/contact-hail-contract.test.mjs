import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import {
  PRIORITY_COURIER_ITINERARY_KIND,
  PRIORITY_COURIER_SERVICE,
  PRIORITY_COURIER_SERVICE_SCHEMA,
} from '../src/data/laneContacts.js';

const DATA_URL = new URL('../src/data/contactHail.js', import.meta.url);
const PROMPT_URL = new URL('../src/ui/contactHailPrompt.js', import.meta.url);

assert.ok(existsSync(DATA_URL), 'contact hail data module must exist before the contract can run');
assert.ok(existsSync(PROMPT_URL), 'contact hail prompt module must exist before the contract can run');

const {
  CONTACT_HAIL_RANGE,
  contactHailAvailability,
  createContactHailResponse,
} = await import(DATA_URL);
const { scanner } = await import('../src/systems/scanner.js');

function entity(id, overrides = {}) {
  const base = {
    id,
    type: 'ship',
    alive: true,
    team: 2,
    pos: { x: 120, z: 0 },
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

function patrol(id = 'patrol-1', ai = {}) {
  return entity(id, {
    data: {
      trafficRole: 'patrol',
      callsign: 'CONCORD SEVEN',
      ai: { passive: true, lawful: true, spawnContext: 'patrol', ...ai },
    },
  });
}

function trader(id = 'trader-1') {
  return entity(id, {
    data: {
      trafficRole: 'hauler',
      callsign: 'SUNWARD',
      cargoManifest: {
        totalQty: 18,
        lines: [
          { commodityId: 'cmdty_ore_common', qty: 12 },
          { commodityId: 'cmdty_food', qty: 6 },
        ],
      },
      ai: { passive: true, archetype: 'fleeing_trader', spawnContext: 'convoy_civilian' },
    },
  });
}

function baseState(target) {
  const player = entity('player', { team: 1, pos: { x: 0, z: 0 }, data: {} });
  const entities = new Map([[player.id, player]]);
  if (target) entities.set(target.id, target);
  return {
    mode: 'flight',
    simTime: 10,
    tick: 600,
    playerId: player.id,
    player: {
      team: 1,
      targetId: target && target.id,
      credits: 4321,
      heat: 0,
      cargo: { items: { cmdty_ore_common: 3 } },
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

function busHarness() {
  const listeners = new Map();
  const events = [];
  return {
    events,
    on(name, fn) {
      if (!listeners.has(name)) listeners.set(name, []);
      listeners.get(name).push(fn);
    },
    off(name, fn) {
      const rows = listeners.get(name) || [];
      const i = rows.indexOf(fn);
      if (i >= 0) rows.splice(i, 1);
    },
    emit(name, payload) {
      events.push({ name, payload: structuredClone(payload) });
      for (const fn of [...(listeners.get(name) || [])]) fn(payload);
    },
  };
}

function mount(state) {
  const bus = busHarness();
  const system = Object.create(scanner);
  system.init({ state, bus });
  return { state, bus, system };
}

function emitted(bus, name) {
  return bus.events.filter((row) => row.name === name).map((row) => row.payload);
}

function authoritySnapshot(state) {
  return structuredClone({
    credits: state.player.credits,
    heat: state.player.heat,
    cargo: state.player.cargo,
    factions: state.factions,
    targetId: state.player.targetId,
    entityData: [...state.entities.values()].map((e) => [e.id, e.data]),
  });
}

test('availability fails closed for unresolved, dead, distant, and unsupported targets', () => {
  const unresolved = baseState(null);
  unresolved.player.targetId = 'missing';
  assert.equal(contactHailAvailability(unresolved).enabled, false);

  const dead = patrol();
  dead.alive = false;
  assert.equal(contactHailAvailability(baseState(dead)).enabled, false);

  const distant = patrol();
  distant.pos.x = CONTACT_HAIL_RANGE + 1;
  assert.equal(contactHailAvailability(baseState(distant)).enabled, false);

  const asteroid = entity('rock', { type: 'asteroid', data: { ai: { passive: true } } });
  assert.equal(contactHailAvailability(baseState(asteroid)).enabled, false);
});

test('clean lawful patrol reports hold-fire without writing gameplay authority', () => {
  const state = baseState(patrol());
  const before = authoritySnapshot(state);
  const { bus } = mount(state);
  bus.emit('contactHail:request', { targetId: 'patrol-1', source: 'test' });
  const [offer] = emitted(bus, 'contactHail:offer');
  assert.equal(offer.kind, 'patrol');
  assert.deepEqual(offer.actions.map((row) => row.id), ['status', 'identify', 'heave_to']);
  assert.ok(offer.lines.length <= 2 && offer.actions.length <= 3);
  bus.emit('contactHail:choice', { requestId: offer.requestId, targetId: offer.targetId, choice: 'status' });
  const [response] = emitted(bus, 'contactHail:response');
  assert.match(response.lines.join(' '), /HOLD FIRE/i);
  assert.deepEqual(authoritySnapshot(state), before);
});

test('wanted heat or a specific lawful incident reports weapons authorized', () => {
  const wantedState = baseState(patrol());
  wantedState.player.heat = 0.5;
  const wanted = mount(wantedState);
  wanted.bus.emit('contactHail:request', { targetId: 'patrol-1' });
  let offer = emitted(wanted.bus, 'contactHail:offer').at(-1);
  wanted.bus.emit('contactHail:choice', { requestId: offer.requestId, targetId: offer.targetId, choice: 'status' });
  assert.match(emitted(wanted.bus, 'contactHail:response').at(-1).lines.join(' '), /WEAPONS AUTHORIZED/i);

  const incidentState = baseState(patrol('patrol-1', { securityTargetId: 'player' }));
  const incident = mount(incidentState);
  incident.bus.emit('contactHail:request', { targetId: 'patrol-1' });
  offer = emitted(incident.bus, 'contactHail:offer').at(-1);
  incident.bus.emit('contactHail:choice', { requestId: offer.requestId, targetId: offer.targetId, choice: 'status' });
  assert.match(emitted(incident.bus, 'contactHail:response').at(-1).lines.join(' '), /WEAPONS AUTHORIZED/i);
});

test('patrol copy consumes scanner-supplied canonical authority instead of duplicating heat math', () => {
  const state = baseState(patrol());
  const offer = { requestId: 'authority', targetId: 'patrol-1', kind: 'patrol' };
  state.player.heat = 99;
  const held = createContactHailResponse(state, offer, 'status', {
    wanted: false,
    weaponsAuthorized: false,
    roe: 'hold_fire',
  });
  assert.match(held.lines.join(' '), /HOLD FIRE/i,
    'data copy must not infer wanted state from a duplicate numeric threshold');
  state.player.heat = 0;
  const armed = createContactHailResponse(state, offer, 'status', {
    wanted: true,
    weaponsAuthorized: true,
    roe: 'weapons_free',
  });
  assert.match(armed.lines.join(' '), /WEAPONS AUTHORIZED/i);

  const dataSource = readFileSync(DATA_URL, 'utf8');
  const scannerSource = readFileSync(new URL('../src/systems/scanner.js', import.meta.url), 'utf8');
  assert.doesNotMatch(dataSource, /(?:heat|wanted)[\s\S]{0,80}(?:0\.15|WANTED_THRESHOLD)/i);
  assert.match(scannerSource, /isPlayerWanted\(state\)/);
  assert.match(scannerSource, /weaponsAuthorized/);
});

test('a passive neutral trader answers from its real route and durable manifest', () => {
  const target = trader();
  const state = baseState(target);
  state.traffic.freighters.push({
    id: target.id,
    role: 'hauler',
    targetId: 'station_ceres',
    manifest: target.data.cargoManifest,
  });
  state.entities.set('station_ceres', entity('station_ceres', {
    type: 'station',
    data: { stationId: 'station_ceres', name: 'Ceres Exchange' },
  }));
  state.entityList = [...state.entities.values()];
  const { bus } = mount(state);
  bus.emit('contactHail:request', { targetId: target.id });
  const offer = emitted(bus, 'contactHail:offer').at(-1);
  assert.deepEqual(offer.actions.map((row) => row.id), ['route', 'manifest', 'heave_to']);

  bus.emit('contactHail:choice', { requestId: offer.requestId, targetId: target.id, choice: 'route' });
  assert.match(emitted(bus, 'contactHail:response').at(-1).lines.join(' '), /CERES EXCHANGE/i);

  state.simTime += 0.1;
  bus.emit('contactHail:request', { targetId: target.id });
  const offer2 = emitted(bus, 'contactHail:offer').at(-1);
  bus.emit('contactHail:choice', { requestId: offer2.requestId, targetId: target.id, choice: 'manifest' });
  const text = emitted(bus, 'contactHail:response').at(-1).lines.join(' ');
  assert.match(text, /12 .*ORE COMMON/i);
  assert.match(text, /6 .*PROVISIONS/i);
});

test('the late Kess priority run exposes a saved status and one escort request without mutating authority', () => {
  const target = trader('kess-span');
  Object.assign(target.data, {
    trafficRole: 'courier',
    callsign: 'SPAN-HOLD',
    namedLaneContactId: 'lane_kess_span',
    priorityCourierState: 'LATE',
    itinerary: {
      kind: PRIORITY_COURIER_ITINERARY_KIND,
      schema: PRIORITY_COURIER_SERVICE_SCHEMA,
      serviceId: PRIORITY_COURIER_SERVICE.id,
      contactId: PRIORITY_COURIER_SERVICE.contactId,
      sectorId: PRIORITY_COURIER_SERVICE.sectorId,
      originStationId: 'station_tethys',
      destinationStationId: 'station_customs',
      legSeq: 3,
      departureAt: 20,
      dueAt: 80,
      escort: { legSeq: 3, active: false, heldS: 0, usedLegSeq: null, creditS: 0 },
    },
  });
  const state = baseState(target);
  state.world.currentSectorId = PRIORITY_COURIER_SERVICE.sectorId;
  state.traffic.freighters.push({ id: target.id, role: 'courier', targetId: 'station_customs' });
  state.entities.set('station_customs', entity('station_customs', {
    type: 'station', data: { stationId: 'station_customs', name: 'Customs Gate' },
  }));
  state.entityList = [...state.entities.values()];
  const before = authoritySnapshot(state);
  const { bus } = mount(state);

  bus.emit('contactHail:request', { targetId: target.id });
  let offer = emitted(bus, 'contactHail:offer').at(-1);
  assert.deepEqual(offer.actions.map((row) => row.id), ['status', 'route', 'escort']);
  bus.emit('contactHail:choice', { requestId: offer.requestId, targetId: offer.targetId, choice: 'status' });
  assert.match(emitted(bus, 'contactHail:response').at(-1).lines.join(' '), /PRIORITY COURIER LATE/i);

  state.simTime += 0.1;
  bus.emit('contactHail:request', { targetId: target.id });
  offer = emitted(bus, 'contactHail:offer').at(-1);
  bus.emit('contactHail:choice', { requestId: offer.requestId, targetId: offer.targetId, choice: 'escort' });
  assert.match(emitted(bus, 'contactHail:response').at(-1).lines.join(' '), /FORM UP/i);
  assert.deepEqual(authoritySnapshot(state), before, 'hail remains presentation/request-only; traffic owns recovery state');
});

test('a disabled Ceres hauler hails its exact recovery need without mutating gameplay', () => {
  const target = trader('disabled-hauler');
  Object.assign(target.data, {
    ceresCausalEventId: 'ev_disabled_hauler_recovery',
    ceresCausalPhase: 'distress',
    ceresCausalCue: 'breaking_the_pattern',
    ceresCausalDisabled: true,
  });
  const state = baseState(target);
  const before = authoritySnapshot(state);
  const { bus } = mount(state);
  bus.emit('contactHail:request', { targetId: target.id });
  const offer = emitted(bus, 'contactHail:offer').at(-1);
  assert.equal(offer.kind, 'worker');
  bus.emit('contactHail:choice', {
    requestId: offer.requestId,
    targetId: offer.targetId,
    choice: 'status',
  });
  assert.match(emitted(bus, 'contactHail:response').at(-1).lines.join(' '),
    /DRIVE DISABLED · RECOVERY REQUIRED/i);
  assert.deepEqual(authoritySnapshot(state), before);
});

test('a serviced Ceres miner reports only the persisted incident plus actual disabled drive', () => {
  const target = entity('serviced-miner', {
    data: {
      trafficRole: 'ore_carrier',
      callsign: 'SLUICE THREE',
      worldRecordId: 'wr_convoy_service_miner',
      jobId: 'job:wr_convoy_service_miner',
      activityActorSlotId: 'ceres_seam_miner',
      ceresActivityCast: true,
      ceresActivityJobOwned: true,
      ceresCausalEventId: 'ev_tender_services_miner',
      ceresCausalPhase: 'work',
      ceresCausalCue: 'hull_open',
      ai: { passive: true },
    },
  });
  const state = baseState(target);
  state.world.currentSectorId = 'sector_ceres_belt';
  state.traffic.ceresTenderServiceIncident = {
    schema: 'spaceface.ceresTenderServiceIncident.v1',
    incidentId: 'ceres-tender-service:wr_npc_service_tender:wr_convoy_service_miner:1',
    sequence: 1,
    tenderWorldRecordId: 'wr_npc_service_tender',
    minerWorldRecordId: target.data.worldRecordId,
    state: 'approach',
    startedAtSimT: 8,
    holdStartedAtSimT: null,
    terminalAtSimT: null,
    failureReason: null,
  };
  state.combat = {
    entities: {
      [target.id]: {
        subsystems: { subsystem_drive: { destroyed: true, effectiveDisabled: true } },
      },
    },
  };
  const before = authoritySnapshot(state);
  const { bus } = mount(state);
  bus.emit('contactHail:request', { targetId: target.id });
  const offer = emitted(bus, 'contactHail:offer').at(-1);
  assert.equal(offer.kind, 'worker');
  bus.emit('contactHail:choice', {
    requestId: offer.requestId,
    targetId: offer.targetId,
    choice: 'status',
  });
  assert.match(emitted(bus, 'contactHail:response').at(-1).lines.join(' '),
    /DRIVE DISABLED · TENDER INBOUND/i);
  assert.deepEqual(authoritySnapshot(state), before);
});

test('an active toll pirate hands off the exact existing parley demand surface', () => {
  const pirate = entity('pirate-1', { team: 3, data: { ai: { squadId: 'sq-9' } } });
  const state = baseState(pirate);
  state.pirateParley.squads['sq-9'] = {
    squadId: 'sq-9',
    hailerId: pirate.id,
    memberIds: [pirate.id],
    doctrineId: 'toll',
    factionId: 'faction_reach',
    phase: 'demand',
    startedAt: 4,
    demandAt: 6,
    deadlineAt: 18,
    demand: { kind: 'credits', amount: 900, commodityId: null, qty: 0, percent: 0 },
    tithe: { commodityId: 'cmdty_ore_common', qty: 3, percent: 20 },
    choice: null,
    resolved: false,
  };
  const { bus } = mount(state);
  bus.emit('contactHail:request', { targetId: pirate.id });
  assert.equal(emitted(bus, 'contactHail:offer').length, 0, 'toll does not duplicate the parley UI');
  const [demand] = emitted(bus, 'pirateParley:demand');
  assert.deepEqual(demand.demand, state.pirateParley.squads['sq-9'].demand);
  assert.deepEqual(demand.tithe, state.pirateParley.squads['sq-9'].tithe);
  assert.equal(demand.squadId, 'sq-9');
  assert.equal(demand.hailerId, pirate.id);
});

test('choices revalidate request identity, target, reveal range, expiry, and active classification', () => {
  const target = patrol();
  const state = baseState(target);
  const { bus, system } = mount(state);

  bus.emit('contactHail:request', { targetId: target.id });
  let offer = emitted(bus, 'contactHail:offer').at(-1);
  bus.emit('contactHail:choice', { requestId: 'stale', targetId: target.id, choice: 'status' });
  assert.equal(emitted(bus, 'contactHail:response').length, 0);

  state.player.targetId = 'other';
  bus.emit('contactHail:choice', { requestId: offer.requestId, targetId: target.id, choice: 'status' });
  assert.equal(emitted(bus, 'contactHail:response').length, 0);
  assert.ok(emitted(bus, 'contactHail:clear').length > 0);

  state.player.targetId = target.id;
  target.pos.x = 100;
  bus.emit('contactHail:request', { targetId: target.id });
  offer = emitted(bus, 'contactHail:offer').at(-1);
  target.pos.x = CONTACT_HAIL_RANGE + 1;
  bus.emit('contactHail:choice', { requestId: offer.requestId, targetId: target.id, choice: 'status' });
  assert.equal(emitted(bus, 'contactHail:response').length, 0);

  target.pos.x = 100;
  state.simTime += 0.1;
  bus.emit('contactHail:request', { targetId: target.id });
  offer = emitted(bus, 'contactHail:offer').at(-1);
  state.simTime = offer.expiresAt + 0.001;
  bus.emit('contactHail:choice', { requestId: offer.requestId, targetId: target.id, choice: 'status' });
  assert.equal(emitted(bus, 'contactHail:response').length, 0);

  state.simTime += 0.1;
  bus.emit('contactHail:request', { targetId: target.id });
  offer = emitted(bus, 'contactHail:offer').at(-1);
  target.data.ai.lawful = false;
  system.update(1 / 60, state);
  bus.emit('contactHail:choice', { requestId: offer.requestId, targetId: target.id, choice: 'status' });
  assert.equal(emitted(bus, 'contactHail:response').length, 0);
});

test('offer and response payloads are deterministic for the same sim state', () => {
  function run() {
    const state = baseState(patrol());
    const { bus } = mount(state);
    bus.emit('contactHail:request', { targetId: 'patrol-1' });
    const offer = emitted(bus, 'contactHail:offer').at(-1);
    bus.emit('contactHail:choice', { requestId: offer.requestId, targetId: offer.targetId, choice: 'identify' });
    return {
      offer,
      response: emitted(bus, 'contactHail:response').at(-1),
    };
  }
  assert.deepEqual(run(), run());
});

test('prompt is a compact native-button surface wired beside the comms log', () => {
  const prompt = readFileSync(PROMPT_URL, 'utf8');
  const comms = readFileSync(new URL('../src/ui/comms.js', import.meta.url), 'utf8');
  assert.match(prompt, /<button[^>]+data-k="hail"/i);
  assert.match(prompt, /contactHail:request/);
  assert.match(prompt, /contactHail:choice/);
  assert.match(prompt, /aria-live/);
  assert.match(prompt, /actions\.slice\(0,\s*3\)/);
  assert.match(prompt, /lines\.slice\(0,\s*2\)/);
  assert.match(comms, /createContactHailPrompt/);
  assert.match(comms, /contactHailPrompt\.tick/);
});

test('prompt teardown stores exact bus callbacks and removes every subscription', () => {
  const prompt = readFileSync(PROMPT_URL, 'utf8');
  for (const event of [
    'contactHail:offer', 'contactHail:response', 'contactHail:clear', 'contactHail:handoff',
    'game:new', 'game:load', 'dock:docked', 'mode:changed',
  ]) {
    assert.match(prompt, new RegExp(`['"]${event.replace(':', '\\:')}['"]`), event);
  }
  assert.match(prompt, /const\s+busBindings\s*=/);
  assert.match(prompt, /for\s*\(const\s+\[event,\s*handler\]\s+of\s+busBindings\)\s+bus\.on\(event,\s*handler\)/);
  assert.match(prompt, /bus\.off\(event,\s*handler\)/);
  assert.match(prompt, /document\.removeEventListener\('keydown',\s*onKeyDown,\s*true\)/);
});

test('availability traversal is scanner-cadenced, target-dirty, and absent from render ticks', () => {
  const data = readFileSync(DATA_URL, 'utf8');
  const prompt = readFileSync(PROMPT_URL, 'utf8');
  const scannerSource = readFileSync(new URL('../src/systems/scanner.js', import.meta.url), 'utf8');
  assert.doesNotMatch(data, /Object\.keys\(squads\)\.sort\(/,
    'active toll lookup must not allocate and sort on availability checks');
  assert.doesNotMatch(prompt, /import\s*\{[^}]*contactHailAvailability/,
    'render presenter consumes scanner availability events instead of traversing sim state');
  assert.doesNotMatch(prompt.match(/function tick\(\)[\s\S]*?\n  \}/)?.[0] || '', /contactHailAvailability\(/);
  assert.match(scannerSource, /CONTACT_HAIL_POLL_TICKS/);
  assert.match(scannerSource, /contactHail:availability/);
  assert.match(scannerSource, /targetDirty/);
  assert.match(scannerSource, /now\s*>=\s*Number\(active\.expiresAt\)/,
    'active offer expiry remains checked every simulation update');
});
