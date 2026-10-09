import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { core } from '../src/core/coreSystem.js';
import { barkDirector, AMBIENT_BASE_GAP_S, richSeamHelpHailText } from '../src/systems/barkDirector.js';
import '../src/core/renderUpdatePhase.js';
import { vfx } from '../src/render/vfx.js';
import {
  NPC_JOB_SIGNATURE_PROFILES,
  resolveNpcJobReaction,
  NPC_JOB_REACTION,
} from '../src/render/npcJobSignatureVfx.js';
import { tableVfxDrawWuFromState } from '../src/render/tabletopPolicy.js';
import { BARKS, TOURIST_HAIL_REGISTER, HAULER_REGISTER, trafficRoleHail } from '../src/data/barks.js';

const SEED = 4242;

function patrolGreetings() {
  const lines = new Set();
  for (const faction of Object.values(BARKS)) {
    const pool = faction && faction['patrol-greeting'];
    if (!Array.isArray(pool)) continue;
    for (const line of pool) lines.add(line);
  }
  return lines;
}

function boot(seed = SEED) {
  const state = createGameState(seed);
  state.mode = 'flight';
  state.tick = 0;
  state.simTime = 0;
  const bus = createBus();
  const said = [];
  const helpers = {
    voice: {
      say(payload) {
        said.push(payload);
        return true;
      },
    },
  };
  core.init({ state, bus, helpers, registry: null });
  const player = helpers.spawnEntity({
    type: 'ship', pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    radius: 8, mass: 12, hull: 100, hullMax: 100, collides: true, team: 0, data: {},
  });
  state.playerId = player.id;
  const system = Object.assign({}, barkDirector);
  system.init({ state, bus, helpers, registry: null });
  const voices = [];
  bus.on('barkDirector:voice', (payload) => voices.push(payload));
  return { state, helpers, bus, player, system, said, voices };
}

function spawnShip(h, spec) {
  return h.helpers.spawnEntity({
    type: 'ship',
    pos: { x: 40, z: 0 },
    vel: { x: 0, z: 0 },
    radius: 10, mass: 20, hull: 80, hullMax: 80, collides: true,
    team: 2,
    factionId: 'faction_free',
    ...spec,
    data: { ai: { passive: true }, intent: {}, ...(spec && spec.data) },
  });
}

function glassSpan(state) {
  const draw = tableVfxDrawWuFromState(state);
  return { near: Math.min(40, draw * 0.05), far: draw * 4 + 2000, draw };
}

function bootDraw(t) {
  const state = createGameState(SEED);
  state.mode = 'flight';
  const bus = createBus();
  const span = glassSpan(state);
  const player = { id: 1, alive: true, type: 'ship', pos: { x: 0, z: 0 }, team: 0, radius: 8 };
  state.playerId = player.id;
  state.entities.set(player.id, player);
  vfx.init({ state, bus, helpers: { player: () => player } });
  const signatures = [];
  const reactions = [];
  const origSig = vfx._emitNpcJobSignature;
  const origReact = vfx._emitNpcJobReaction;
  vfx._emitNpcJobSignature = function emitSignature(slot, profile, ent, job, reduced) {
    signatures.push(profile);
    return origSig.apply(this, arguments);
  };
  vfx._emitNpcJobReaction = function emitReaction(slot, ent, reduced) {
    reactions.push({ id: slot.reaction, intensity: slot.reactionT, entId: ent && ent.id });
    return origReact.apply(this, arguments);
  };
  t.after(() => {
    vfx._emitNpcJobSignature = origSig;
    vfx._emitNpcJobReaction = origReact;
    try { vfx.destroy(); } catch { /* draw host already down */ }
  });
  return { state, bus, player, signatures, reactions, ...span };
}

function parkMiner(state, id, x, phase) {
  const miner = {
    id, alive: true, type: 'ship', pos: { x, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, radius: 8, team: 2,
  };
  state.entities.set(id, miner);
  const jobId = `miner-job-${id}`;
  const bag = state.npcJobs || (state.npcJobs = { byId: {} });
  bag.byId = bag.byId || {};
  bag.byId[jobId] = {
    kind: 'miner',
    entityId: id,
    job: { kind: 'miner', phase, corrupt: false, route: [] },
  };
  return { miner, jobId };
}

function mouthOpenSparks(signatures) {
  return signatures.filter((profile) => profile && profile.id === 'mouth_open');
}

test('PIC-25: ore collection sparks the intake profile once, and stays quiet off glass', (t) => {
  const h = bootDraw(t);
  assert.equal(h.state.meta.seed, SEED);
  const { miner } = parkMiner(h.state, 2, h.near, 'work');
  h.bus.emit('traffic:oreCollected', { carrierId: 99, pickupId: 1, manifestId: 'missing', commodityId: 'ore', qty: 1 });
  vfx._updateNpcJobSignatures(1 / 12);
  assert.equal(mouthOpenSparks(h.signatures).length, 0);

  const payload = { carrierId: miner.id, pickupId: 9, manifestId: 'ore-1', commodityId: 'ore', qty: 1 };
  h.bus.emit('traffic:oreCollected', payload);
  h.bus.emit('traffic:oreCollected', payload);
  h.signatures.length = 0;
  vfx._updateNpcJobSignatures(1 / 12);
  const sparks = mouthOpenSparks(h.signatures);
  assert.equal(sparks.length, 1);
  assert.equal(sparks[0], NPC_JOB_SIGNATURE_PROFILES.mouth_open);
  assert.equal(sparks[0].contact, 'hatch-spill');
  assert.equal(vfx._lastNpcJobSignatureId, 'mouth_open');

  h.signatures.length = 0;
  vfx._updateNpcJobSignatures(1 / 12);
  assert.equal(mouthOpenSparks(h.signatures).length, 0);

  miner.pos.x = h.far;
  h.bus.emit('traffic:oreCollected', { carrierId: miner.id, pickupId: 10, manifestId: 'ore-far', commodityId: 'ore', qty: 1 });
  h.signatures.length = 0;
  vfx._updateNpcJobSignatures(1 / 12);
  assert.equal(mouthOpenSparks(h.signatures).length, 0);
});

test('WORLD-30: a threatened miner takes the close-player reaction once', (t) => {
  const h = bootDraw(t);
  assert.equal(h.state.meta.seed, SEED);
  const close = resolveNpcJobReaction('miner', 0, 'work');
  assert.equal(close.id, NPC_JOB_REACTION.GO_DARK);
  assert.equal(resolveNpcJobReaction('miner', 0, 'flee').id, NPC_JOB_REACTION.NONE);
  const { jobId } = parkMiner(h.state, 2, h.near, 'flee');
  const payload = { jobId, kind: 'miner', attackerId: h.player.id, simTime: 0 };
  const goDark = () => h.reactions.filter((row) => row.id === close.id);
  h.bus.emit('npcjobs:threatened', payload);
  h.bus.emit('npcjobs:threatened', { ...payload, hits: 2 });
  vfx._updateNpcJobSignatures(1 / 12);
  const shown = goDark();
  assert.equal(shown.length, 1);
  assert.equal(shown[0].id, close.id);
  assert.equal(shown[0].intensity, close.intensity);
  assert.equal(shown[0].entId, 2);
  assert.equal(vfx._lastNpcJobReaction, close.id);

  h.reactions.length = 0;
  vfx._updateNpcJobSignatures(1 / 12);
  h.bus.emit('npcjobs:threatened', payload);
  vfx._updateNpcJobSignatures(1 / 12);
  assert.equal(goDark().length, 0);

  const far = parkMiner(h.state, 3, h.far, 'flee');
  h.bus.emit('npcjobs:threatened', { jobId: far.jobId, kind: 'miner', attackerId: h.player.id, simTime: 1 });
  h.bus.emit('npcjobs:threatened', { jobId: 'hauler-job', kind: 'hauler', attackerId: h.player.id });
  h.reactions.length = 0;
  vfx._updateNpcJobSignatures(1 / 12);
  assert.equal(goDark().length, 0);
});

test('WORLD-21: the hull that watched the spill remarks once, inside the ambient gap', (t) => {
  const h = boot();
  t.after(() => h.system.destroy());
  assert.equal(h.state.meta.seed, SEED);
  const pod = h.helpers.spawnEntity({
    type: 'pickup', pos: { x: 20, z: 0 }, vel: { x: 0, z: 0 },
    radius: 2, alive: true, data: {},
  });
  const watcher = spawnShip(h, { pos: { x: 60, z: 0 }, data: { trafficRole: 'miner' } });
  const far = spawnShip(h, { pos: { x: 5000, z: 0 }, data: { trafficRole: 'hauler' } });
  const payload = {
    encounterId: 'enc-1', custodyId: 'cus-1', podIds: [pod.id], sectorId: 'sec_test', t: h.state.simTime,
  };
  h.bus.emit('traffic:spillNoticed', payload);
  h.bus.emit('traffic:spillNoticed', payload);
  const barks = h.said.filter((line) => line.register === 'spill-notice');
  assert.equal(barks.length, 1);
  assert.equal(barks[0].id, `barkDirector:${watcher.id}:spill-notice`);
  assert.notEqual(barks[0].id, `barkDirector:${far.id}:spill-notice`);
  assert.equal(h.voices.length, 1);
  assert.equal(h.voices[0].gap, AMBIENT_BASE_GAP_S);
  assert.ok(Math.abs(h.voices[0].t - payload.t) <= h.voices[0].gap);

  h.bus.emit('traffic:spillNoticed', { ...payload, encounterId: 'enc-2' });
  assert.equal(h.said.filter((line) => line.register === 'spill-notice').length, 2);

  h.state.simTime = 100;
  h.bus.emit('traffic:spillNoticed', { ...payload, encounterId: 'enc-stale', t: 0 });
  assert.equal(h.said.filter((line) => line.register === 'spill-notice').length, 2);
});

test('WORLD-21: a hull outside the watch does not remark', (t) => {
  const h = boot();
  t.after(() => h.system.destroy());
  const pod = h.helpers.spawnEntity({
    type: 'pickup', pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, radius: 2, data: {},
  });
  spawnShip(h, { pos: { x: 5000, z: 0 } });
  h.bus.emit('traffic:spillNoticed', {
    encounterId: 'enc-far', custodyId: 'cus-far', podIds: [pod.id], sectorId: 'sec_test', t: 0,
  });
  assert.equal(h.said.length, 0);
});

test('WORLD-42: an on-glass hauler grumbles once in the hauler register', (t) => {
  const h = boot();
  t.after(() => h.system.destroy());
  assert.equal(h.state.meta.seed, SEED);
  const { near } = glassSpan(h.state);
  const hauler = spawnShip(h, {
    pos: { x: near, z: 0 },
    data: { trafficRole: 'hauler', ai: { passive: true }, intent: {} },
  });
  h.state.npcJobs = { byId: { 'job-empty': { kind: 'hauler', entityId: hauler.id, job: { kind: 'hauler' } } } };
  const greetings = patrolGreetings();
  const payload = { haulerJobId: 'job-empty', sectorId: 'sec_test', simTime: h.state.simTime };
  h.bus.emit('npcjobs:loadEmpty', payload);
  h.bus.emit('npcjobs:loadEmpty', payload);
  const barks = h.said.filter((line) => line.register === 'hauler');
  assert.equal(barks.length, 1);
  assert.equal(barks[0].id, `barkDirector:${hauler.id}:hauler-empty`);
  assert.ok(HAULER_REGISTER.includes(barks[0].text));
  assert.equal(greetings.has(barks[0].text), false);
  assert.equal(TOURIST_HAIL_REGISTER.includes(barks[0].text), false);
  assert.equal(h.voices[0].register, 'hauler');
  assert.equal(h.voices[0].gap, AMBIENT_BASE_GAP_S);
});

test('WORLD-42: an off-glass arrival stays quiet and does not spend the grumble', (t) => {
  const h = boot();
  t.after(() => h.system.destroy());
  const { near, far } = glassSpan(h.state);
  const hauler = spawnShip(h, {
    pos: { x: far, z: 0 },
    data: { trafficRole: 'hauler' },
  });
  h.state.npcJobs = { byId: { 'job-far': { kind: 'hauler', entityId: hauler.id } } };
  const payload = { haulerJobId: 'job-far', sectorId: 'sec_test', simTime: 0 };
  h.bus.emit('npcjobs:loadEmpty', payload);
  assert.equal(h.said.length, 0);
  hauler.pos.x = near;
  h.bus.emit('npcjobs:loadEmpty', payload);
  assert.equal(h.said.length, 1);
  assert.ok(HAULER_REGISTER.includes(h.said[0].text));
});

test('WORLD-42: an ore carrier is not the hauler register', (t) => {
  const h = boot();
  t.after(() => h.system.destroy());
  const carrier = spawnShip(h, {
    pos: { x: 20, z: 0 },
    data: { trafficRole: 'ore_carrier' },
  });
  h.state.npcJobs = { byId: { 'job-ore': { kind: 'hauler', entityId: carrier.id } } };
  h.bus.emit('npcjobs:loadEmpty', { haulerJobId: 'job-ore', sectorId: 'sec_test', simTime: 0 });
  assert.equal(h.said.length, 0);
});

test('WORLD-32: the reserved miner hails the player once when the player is the help', (t) => {
  const h = boot();
  t.after(() => h.system.destroy());
  assert.equal(h.state.meta.seed, SEED);
  const miner = spawnShip(h, { pos: { x: 30, z: 0 }, data: { trafficRole: 'miner' } });
  spawnShip(h, { pos: { x: 80, z: 0 }, data: { trafficRole: 'hauler' } });
  const payload = {
    source: 'contact_hail',
    targetId: miner.id,
    reservationId: 'res-4242',
    requestId: 'req-4242',
    reservedByKind: 'npc',
    reservedById: miner.id,
  };
  h.bus.emit('traffic:richSeamHelpReserved', payload);
  h.bus.emit('traffic:richSeamHelpReserved', payload);
  assert.equal(h.said.length, 1);
  assert.equal(h.said[0].text, richSeamHelpHailText());
  assert.equal(h.said[0].to, h.player.id);
  assert.equal(h.said[0].register, 'miner');
  assert.equal(h.said[0].id, `barkDirector:${miner.id}:rich-seam-help`);
});

test('WORLD-32: a helper who is not the player, or an unnamed hail, stays silent', (t) => {
  const h = boot();
  t.after(() => h.system.destroy());
  const miner = spawnShip(h, { pos: { x: 30, z: 0 }, data: { trafficRole: 'miner' } });
  h.bus.emit('traffic:richSeamHelpReserved', {
    source: 'contact_hail', targetId: miner.id, helperId: 99999, reservationId: 'res-other',
  });
  h.bus.emit('traffic:richSeamHelpReserved', {
    targetId: miner.id, reservationId: 'res-plain', reservedByKind: 'npc', reservedById: miner.id,
  });
  assert.equal(h.said.length, 0);
});

test('WORLD-35: a tourist liner hails in the tourist register, not the freighter hail', (t) => {
  const h = boot();
  t.after(() => h.system.destroy());
  assert.equal(h.state.meta.seed, SEED);
  const greetings = patrolGreetings();
  for (const line of TOURIST_HAIL_REGISTER) assert.equal(greetings.has(line), false);
  assert.equal(trafficRoleHail('freighter', 0), null);
  assert.equal(trafficRoleHail('hauler', 0).register, 'hauler');

  const tourist = spawnShip(h, {
    pos: { x: 40, z: 0 },
    ship: 'ship_drifter',
    data: { trafficRole: 'tourist', ship: 'ship_drifter', ai: { passive: true }, intent: {} },
  });
  const cues = [];
  const hailed = [];
  h.bus.on('audio:cue', (payload) => cues.push(payload));
  h.bus.on('npc:hailed', (payload) => hailed.push(payload));
  h.system.update(1 / 60, h.state);

  const barks = h.said.filter((line) => String(line.id || '').endsWith(':tourist-hail'));
  assert.equal(barks.length, 1);
  assert.equal(barks[0].id, `barkDirector:${tourist.id}:tourist-hail`);
  assert.equal(barks[0].register, 'tourist');
  assert.ok(TOURIST_HAIL_REGISTER.includes(barks[0].text));
  assert.equal(greetings.has(barks[0].text), false);
  assert.equal(cues.some((cue) => cue.id === 'world.foghorn'), false);
  assert.equal(hailed.length, 1);
  assert.equal(hailed[0].register, 'tourist');
  assert.equal(hailed[0].entityId, tourist.id);
});

test('WORLD-35: a passing hauler still uses the freighter patrol-greeting', (t) => {
  const h = boot();
  t.after(() => h.system.destroy());
  const heavy = spawnShip(h, {
    pos: { x: 40, z: 0 },
    data: { trafficRole: 'hauler', occupationalRole: 'heavy', ai: { passive: true }, intent: {} },
  });
  const cues = [];
  h.bus.on('audio:cue', (payload) => cues.push(payload));
  h.system.update(1 / 60, h.state);
  const barks = h.said.filter((line) => String(line.id || '').endsWith(':patrol-greeting'));
  assert.equal(barks.length, 1);
  assert.equal(barks[0].id, `barkDirector:${heavy.id}:patrol-greeting`);
  assert.equal(TOURIST_HAIL_REGISTER.includes(barks[0].text), false);
  assert.equal(HAULER_REGISTER.includes(barks[0].text), false);
  assert.ok(patrolGreetings().has(barks[0].text));
  assert.equal(cues.some((cue) => cue.id === 'world.foghorn'), true);
});
