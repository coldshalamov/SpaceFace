import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { scanner } from '../src/systems/scanner.js';
import { lanternWardActorSpec } from '../src/world/lanternWardActors.js';
import { lanternWardCanonicalAnchor } from '../src/data/lanternWardHardware.js';
import { LANTERN_WARD_REPAIR_ACTION } from '../src/data/lanternWardHail.js';
import { normalizeLanternWardConversation, stepLanternWardConversation } from '../src/missions/lanternWardConversation.js';

function fixture() {
  const state = createGameState(7402), bus = createBus(), events = [], repairCalls = [];
  state.mode = 'flight'; state.simTime = 100; state.tick = 6000;
  state.world.currentSectorId = 'sector_helios_prime';
  const nessa = { ...lanternWardActorSpec('tug', lanternWardCanonicalAnchor()), id: 2, alive: true, occupantGeneration: 1 };
  nessa.data.jobId = 'job:lantern-ward:tug';
  const player = { id: 1, type: 'ship', alive: true, occupantGeneration: 1,
    pos: { x: 1700, z: -630 }, vel: { x: 0, z: 0 }, data: {} };
  state.playerId = player.id; state.player.targetId = nessa.id;
  state.entities = new Map([[1, player], [2, nessa]]); state.entityList = [player, nessa];
  state.npcJobs = { byId: {}, lanternWard: { version: 1, initialized: true, phase: 'damaged',
    blocked: true, observedS: 0, objects: {}, history: {} } };
  const jobs = { lanternWardRepair(target) { repairCalls.push(target); return { ok: true }; } };
  const system = Object.create(scanner);
  system.init({ state, bus, registry: { get: id => id === 'npcJobsRuntime' ? jobs : null } });
  for (const name of ['contactHail:offer', 'contactHail:response', 'comms:popup']) {
    bus.on(name, payload => events.push({ name, payload: structuredClone(payload) }));
  }
  return { state, bus, system, nessa, repairCalls, events,
    offer() { bus.emit('contactHail:request', { targetId: 2 }); return events.find(e => e.name === 'contactHail:offer')?.payload; } };
}

test('ordinary Nessa hail describes a physical repair and dispatches its offered action once', () => {
  const f = fixture(), before = structuredClone({ player: f.state.player, pose: f.nessa.pos, hull: f.nessa.hull });
  const offer = f.offer(); assert.ok(offer?.lanternWardHail);
  assert.equal(offer.actions.length, 3); assert.match(offer.lines.join(' '), /contacts|electronics/i);
  assert.deepEqual({ player: f.state.player, pose: f.nessa.pos, hull: f.nessa.hull }, before);
  const choice = { requestId: offer.requestId, targetId: 2, choice: LANTERN_WARD_REPAIR_ACTION };
  f.bus.emit('contactHail:choice', choice); f.bus.emit('contactHail:choice', choice);
  assert.equal(f.repairCalls.length, 1); assert.equal(f.repairCalls[0], f.nessa);
  assert.match(f.events.find(e => e.name === 'contactHail:response').payload.lines[0], /original lamp/);
  f.system.destroy();
});

test('expired, unoffered and recycled-occupant hail actions cannot dispatch a repair', () => {
  for (const kind of ['expired', 'recycled', 'unoffered', 'wrong-request']) {
    const f = fixture();
    if (kind === 'unoffered') f.state.npcJobs.lanternWard.phase = 'blocked';
    const offer = f.offer(); assert.ok(offer);
    if (kind === 'expired') f.state.simTime = offer.expiresAt + 1;
    if (kind === 'recycled') {
      const other = { ...f.nessa, occupantGeneration: 2, data: { ...f.nessa.data } };
      f.state.entities.set(2, other); f.state.entityList[1] = other;
    }
    f.bus.emit('contactHail:choice', { requestId: kind === 'wrong-request' ? 'old' : offer.requestId,
      targetId: 2, choice: LANTERN_WARD_REPAIR_ACTION });
    assert.equal(f.repairCalls.length, 0, kind); f.system.destroy();
  }
});

test('the first forty observed seconds stay wordless; saved return dialogue follows actual work history', () => {
  const f = fixture(), owner = { state: f.state, bus: f.bus };
  const w = f.state.npcJobs.lanternWard;
  w.phase = 'blocked'; w.observedS = 39;
  stepLanternWardConversation(owner);
  assert.equal(f.events.filter(e => e.name === 'comms:popup').length, 0);
  w.observedS = 40; stepLanternWardConversation(owner);
  assert.equal(f.events.filter(e => e.name === 'comms:popup').length, 1);
  assert.equal(f.state.missions.lanternWardConversation.visits, 1);
  f.state.world.currentSectorId = 'sector_ceres_belt'; stepLanternWardConversation(owner);
  f.state.missions.lanternWardConversation = normalizeLanternWardConversation(
    JSON.parse(JSON.stringify(f.state.missions.lanternWardConversation)));
  f.state.world.currentSectorId = 'sector_helios_prime'; f.state.simTime += 30;
  w.phase = 'installed'; w.blocked = false; w.history.playerCleared = true;
  stepLanternWardConversation(owner);
  assert.equal(f.state.missions.lanternWardConversation.visits, 2);
  const spoken = f.events.filter(e => e.name === 'comms:popup');
  assert.match(spoken.at(-1).payload.text, /last time|remember/i);
  f.state.simTime += 15; stepLanternWardConversation(owner);
  assert.equal(f.events.at(-1).payload.sender, 'VENN HOUSEHOLD');
  assert.match(f.events.at(-1).payload.text, /help|room by the rail/i);
  const count = f.events.length;
  f.state.simTime += 40; stepLanternWardConversation(owner);
  assert.equal(f.events.length, count, 'completed work leaves the channel quiet');
  f.system.destroy();
});
