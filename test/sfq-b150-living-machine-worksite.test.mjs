import test from 'node:test';
import assert from 'node:assert/strict';
import { MACHINE_SITES } from '../src/data/precursorMachines.js';
import { ensureAlienEcologyState } from '../src/data/alienEcologyState.js';
import { materializeMachineLayer, tickMachineLayer } from '../src/systems/precursorMachines.js';
import { handleFoundryProtocolAction } from '../src/systems/machineWork.js';
import { serializeAlienEcologyState, deserializeAlienEcologyState } from '../src/systems/alienEcology.js';
import { mulberry32, hash32 } from '../src/core/rng.js';

const site = MACHINE_SITES.pallas_empty_foundry;

function fixture() {
  const state = {
    meta: { seed: 4242 }, simTime: 0, tick: 0, playerId: 1,
    entities: new Map(), entityList: [],
    player: {
      credits: 500, activeShipIndex: 0, ownedShips: [{ defId: 'ship_kestrel' }],
      cargo: { items: {}, capVolume: 500, capMass: 500, usedVolume: 0, usedMass: 0 },
    },
    world: { currentSectorId: site.sectorId, sectors: {} },
  };
  const events = [];
  let id = 100;
  const world = {
    state, active: { dressing: [] }, registry: { get: () => null },
    _toGlobal: (p) => ({ ...p }),
    bus: { emit: (name, payload) => events.push({ name, payload }) },
    helpers: {
      mulberry32, hash32,
      spawnEntity(spec) {
        const entity = {
          ...spec, id: id++, alive: true, occupantGeneration: 1,
          pos: { ...spec.pos }, vel: spec.vel || { x: 0, z: 0 },
        };
        state.entities.set(entity.id, entity);
        state.entityList.push(entity);
        return entity;
      },
    },
  };
  materializeMachineLayer(world, { id: site.sectorId }, world.active);
  return {
    state, world, events,
    machine: (kind) => state.entityList.find((e) => e.alive !== false && e.data?.machine?.kind === kind),
    step(dt = 0.1) { state.simTime += dt; state.tick += 1; tickMachineLayer(world, dt); },
    seconds(n) { for (let i = 0; i < n * 10; i++) this.step(); },
    playerAt(pos) {
      const entity = { id: 1, alive: true, occupantGeneration: 1, pos: { ...pos }, vel: { x: 0, z: 0 }, radius: 10 };
      state.entities.set(1, entity);
      return entity;
    },
  };
}

function foundryRec(state) {
  return ensureAlienEcologyState(state).machineSites[site.siteId];
}

function returnLines(events) {
  return events.filter((e) => e.name === 'comms:message'
    && e.payload?.sender === site.name
    && typeof e.payload.text === 'string');
}

function satisfyProtocol(rec) {
  return rec.protocol === 'satisfied' || rec.protocol?.standing === 'satisfied';
}

// Mail, finite gantry repair, then the ballast. Repairing is sampled on the way through.
function openFoundry(f) {
  const custodian = f.machine('custodian');
  let sawRepairing = false;
  for (let i = 0; i < 4000 && !foundryRec(f.state).maintenance?.completed; i++) {
    f.step();
    if (custodian.data.machine.repairing === true) sawRepairing = true;
  }
  const rec = foundryRec(f.state);
  assert.equal(rec.maintenance?.completed, true, 'foundry chain finishes gantry repair');
  assert.equal(sawRepairing, true, 'custodian is repairing while a charge is being worked');
  assert.equal(custodian.data.machine.repairing, false, 'custodian stops repairing once the gantry is finished');
  let body = null;
  for (let i = 0; i < 20 && !body; i++) {
    f.step();
    body = f.state.entityList.find((e) => e.alive !== false && e.data?.machineWorkpiece === site.siteId);
  }
  assert.ok(body, 'the foundry chain puts a real ballast on the floor');
  assert.equal(f.machine('mason').data.machine.working, false);
  return { rec, body, custodian };
}

test('B150 foundry construction arms the mason, files access, and announces the saved cycle once on return', () => {
  const f = fixture();
  const credits = f.state.player.credits;
  const cargo = { ...f.state.player.cargo.items };
  const { body } = openFoundry(f);
  const mason = f.machine('mason');
  f.playerAt({ x: site.center.x, z: site.center.z + 400 });
  assert.equal(handleFoundryProtocolAction(f.world, { siteId: site.siteId, verb: 'observe', approach: 'construction' }).ok, true);
  assert.equal(handleFoundryProtocolAction(f.world, { siteId: site.siteId, verb: 'present' }).ok, true);
  body.pos = { x: site.center.x + site.workCycle.cradleDx, z: site.center.z };
  body.vel = { x: 0, z: 0 };
  f.seconds(4);
  assert.equal(handleFoundryProtocolAction(f.world, { siteId: site.siteId, verb: 'choose' }).ok, true);
  assert.equal(mason.data.machine.sweepT, 0, 'production materialization leaves an untouched weld clock');
  const weldCount = () => f.events.filter((e) => e.name === 'audio:cue'
    && e.payload?.id === 'scan_resolve' && e.payload.position == null).length;
  assert.equal(weldCount(), 0, 'no weld is heard before placement begins');
  let sawWorking = false;
  let welded = false;
  for (let i = 0; i < 15; i++) {
    f.step();
    if (mason.data.machine.working === true) sawWorking = true;
    if (f.events.some((e) => e.name === 'audio:cue' && e.payload?.id === 'scan_resolve' && e.payload.position == null)) welded = true;
  }
  assert.equal(sawWorking, true, 'mason works while the ballast is being placed');
  assert.equal(welded, true, 'mason weld cadence plays while placement is in progress');
  assert.equal(weldCount(), 1, 'placement starts with exactly one weld cue');
  f.seconds(6);
  assert.equal(weldCount(), 1, 'finishing and then idling do not repeat the weld cue');
  const rec = foundryRec(f.state);
  assert.equal(mason.data.machine.working, false);
  assert.equal(rec.workCycle.status, 'complete');
  assert.equal(ensureAlienEcologyState(f.state).machineAccess[site.siteId], 'complete');
  assert.equal(satisfyProtocol(rec), true);

  const player = f.state.entities.get(1);
  const x = site.center.x;
  const z = site.center.z;
  player.pos = { x, z };
  f.step();
  assert.equal(returnLines(f.events).length, 0, 'first contact inside the site does not announce a return');
  player.pos = { x: x + 900, z };
  f.step();
  assert.equal(returnLines(f.events).length, 0, 'an offset of 900 stays inside the leave skirt');
  player.pos = { x: x + site.radius + 650, z };
  f.step();
  player.pos = { x, z };
  f.step();
  const lines = returnLines(f.events);
  assert.equal(lines.length, 1);
  assert.match(lines[0].payload.text, /Empty Foundry/);
  assert.match(lines[0].payload.text, /complete/);
  assert.doesNotMatch(lines[0].payload.text, /pallas_|awaiting_mail|_/);
  f.seconds(2);
  assert.equal(returnLines(f.events).length, 1, 'staying inside does not repeat the return line');

  const saved = serializeAlienEcologyState(f.state);
  deserializeAlienEcologyState(f.state, saved);
  const restored = foundryRec(f.state);
  assert.equal(restored.workCycle.status, 'complete');
  assert.equal(restored.lastReturnAnnouncedStatus, 'complete');
  assert.equal(ensureAlienEcologyState(f.state).machineAccess[site.siteId], 'complete');
  assert.equal(satisfyProtocol(restored), true);
  player.pos = { x: x + site.radius + 650, z };
  f.step();
  player.pos = { x, z };
  f.step();
  assert.equal(returnLines(f.events).length, 1, 'the saved return latch suppresses a second announcement');
  assert.equal(f.state.player.credits, credits);
  assert.deepEqual(f.state.player.cargo.items, cargo);
});

test('B150 preservation files access without the mason welding, and an idle mason stays quiet', () => {
  const f = fixture();
  const { body } = openFoundry(f);
  const mason = f.machine('mason');
  f.playerAt({ x: site.center.x, z: site.center.z + 400 });
  assert.equal(handleFoundryProtocolAction(f.world, { siteId: site.siteId, verb: 'observe', approach: 'preservation' }).ok, true);
  body.pos = { x: site.center.x + site.workCycle.preserveDx, z: site.center.z };
  body.vel = { x: 0, z: 0 };
  f.seconds(4);
  assert.equal(handleFoundryProtocolAction(f.world, { siteId: site.siteId, verb: 'present' }).ok, true);
  assert.equal(handleFoundryProtocolAction(f.world, { siteId: site.siteId, verb: 'choose' }).ok, true);
  const sweep = mason.data.machine.sweepT || 0;
  const audio = f.events.filter((e) => e.name === 'audio:cue' && e.payload?.id === 'scan_resolve').length;
  f.seconds(2);
  const rec = foundryRec(f.state);
  assert.equal(rec.workCycle.status, 'preserved');
  assert.equal(mason.data.machine.working, false);
  assert.equal(mason.data.machine.sweepT || 0, sweep);
  assert.equal(f.events.filter((e) => e.name === 'audio:cue' && e.payload?.id === 'scan_resolve').length, audio);
  assert.equal(ensureAlienEcologyState(f.state).machineAccess[site.siteId], 'preserved');
  assert.equal(satisfyProtocol(rec), true);

  const idle = f.world.helpers.spawnEntity({
    type: 'machine', pos: { x: 10, z: 10 }, homeSectorId: site.sectorId, radius: 26,
    data: {
      machine: {
        kind: 'mason', siteId: 'bench_idle_mason', t: 0, phase: 0, working: false,
        sweepT: 39.95, anchor: { x: 10, z: 10 },
      },
    },
  });
  const before = f.events.length;
  f.step();
  assert.equal(idle.data.machine.sweepT, 39.95, 'an idle mason does not advance its weld clock');
  assert.equal(f.events.slice(before).some((e) => e.name === 'audio:cue' && e.payload?.id === 'scan_resolve'), false);

  const player = f.state.entities.get(1);
  const x = site.center.x;
  player.pos = { x: x + site.radius + 650, z: site.center.z };
  f.step();
  player.pos = { x, z: site.center.z };
  f.step();
  const announced = returnLines(f.events).length;
  assert.equal(announced, 1);
  assert.match(returnLines(f.events)[0].payload.text, /preserved/);
  player.pos = { x: x + 900, z: site.center.z };
  f.seconds(2);
  player.pos = { x, z: site.center.z };
  f.seconds(2);
  assert.equal(returnLines(f.events).length, announced, 'staying inside does not emit a second return line');
});
