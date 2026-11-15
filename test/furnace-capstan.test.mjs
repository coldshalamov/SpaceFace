import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { createFurnaceIntake } from '../src/systems/furnaceIntake.js';
import { getCombatKernel } from '../src/combat/kernel.js';
import { furnaceLots, furnaceLotSpec, furnaceMouthGlobal, FURNACE_MITE_KEYS } from '../src/missions/furnaceWorksite.js';
import { FURNACE_CAPSTAN, initFurnaceCapstan, removeFurnaceCapstan, stepFurnaceCapstan,
  syncFurnaceCapstan, furnaceCapstanRead, furnaceCapstanAvailability, furnaceCapstanOffer,
  furnaceCapstanResponse } from '../src/missions/furnaceCapstan.js';
import { npcCableAdmits } from '../src/render/combat/npcCableFx.js';

function fixture({ initController = true } = {}) {
  const s = createGameState(23), bus = createBus(), calls = [];
  let id = 1;
  s.mode = 'flight';
  s.run = { kind: 'adventure' };
  s.story = { flags: {} };
  s.world.currentSectorId = 'sector_ceres_belt';
  s.world.alienEcology = { sites: { closed_refinery: { deadFauna: Object.fromEntries(FURNACE_MITE_KEYS.map(k => [k, true])) } } };
  const m = { id: 'furnace-test', status: 'active', storyTag: 'campaign47a:b1:infested',
    destSectorId: 'sector_ceres_belt',
    params: { furnaceWorksiteVersion: 1, furnaceFeedsNeeded: 3 },
    objectiveProgress: 4, objectiveTarget: 4 };
  s.missions = { active: [m], receipts: [] };
  const helpers = {
    spawnEntity(spec) {
      const e = { ...spec, id: id++, alive: true, occupantGeneration: id };
      s.entities.set(e.id, e);
      s.entityList.push(e);
      return e;
    },
    removeEntity(n) {
      const e = s.entities.get(n);
      if (e) { e.alive = false; bus.queue('entity:destroyed', { id: e.id, type: e.type, entity: e }); }
      s.entities.delete(n);
      const index = s.entityList.findIndex(row => row.id === n);
      if (index >= 0) s.entityList.splice(index, 1);
    },
    combatPhysics: {
      createAttachment(p) { calls.push({ kind: 'attach', ...p }); return { id: p.attachmentId }; },
      setAttachmentReel(p) { calls.push({ kind: 'reel', ...p }); return { restLength: p.restLength }; },
      cutAttachment(p) { calls.push({ kind: 'cut', ...p }); return true; },
      getAttachmentTelemetry() { return {}; },
    },
  };
  const player = helpers.spawnEntity({ type: 'player', pos: { x: furnaceMouthGlobal().x, z: furnaceMouthGlobal().z - 150 },
    vel: { x: 0, z: 0 }, radius: 10, mass: 20, hull: 100, hullMax: 100 });
  s.playerId = player.id;
  s.player.flags = {};
  s.player.credits = 743;
  for (const lot of furnaceLots(m)) {
    const e = helpers.spawnEntity(furnaceLotSpec(m, lot));
    lot.entityId = e.id;
  }
  const ctx = { state: s, bus, helpers, registry: { get: n => (n === 'combat' ? { kernel } : null) } };
  const kernel = getCombatKernel(ctx);
  const owner = { ctx, state: s, bus, helpers, registry: ctx.registry,
    _restoring: false, _adventure: () => s.world.currentSectorId === 'sector_ceres_belt' };
  const offs = [];
  if (initController) {
    initFurnaceCapstan(owner, (name, fn) => offs.push(bus.on(name, fn)));
    syncFurnaceCapstan(owner, m);
  }
  const a = s.entityList.find(e => e.alive && e.data?.furnaceCapstanId);
  s.player.targetId = a?.id ?? null;
  const offer = (choice) => {
    const o = furnaceCapstanOffer(s, furnaceCapstanAvailability(s, a), `req-${calls.length}-${s.tick}`, s.simTime + 10);
    assert.ok(o);
    if (choice) assert.ok(o.actions.some(row => row.id === choice));
    return o;
  };
  const choose = (o, choice) => {
    bus.emit('contactHail:offer', o);
    const res = furnaceCapstanResponse(s, o, choice);
    assert.ok(res);
    bus.emit('contactHail:response', res);
    return res;
  };
  return { s, bus, owner, kernel, m, a, calls, offer, choose,
    record: () => s.story.flags.furnace_capstan,
    cable: () => Object.values(s.combat.attachments.byId).find(line => line.defId === FURNACE_CAPSTAN.attachmentDefId) };
}

test('the gantry is moored without cable, mass change, or receipt until commanded', () => {
  const f = fixture();
  const before = f.m.params.furnaceLots.map(l => structuredClone(f.s.entities.get(l.entityId)));
  assert.ok(f.a);
  assert.equal(f.a.physicsBody.dynamic, false);
  assert.equal(f.record().cable, null);
  stepFurnaceCapstan(f.owner, 1 / 60);
  assert.equal(f.calls.filter(c => c.kind === 'attach').length, 0);
  before.forEach((old, i) => {
    const e = f.s.entities.get(f.m.params.furnaceLots[i].entityId);
    assert.deepEqual(e.pos, old.pos);
    assert.deepEqual(e.vel, old.vel);
    assert.equal(e.mass, 40);
  });
  assert.equal(f.s.player.credits, 743);
  assert.equal(f.m.params.furnaceFeeds, undefined);
});

test('a live hail command winds one marked pod; hold and resume keep the same cable', () => {
  const f = fixture();
  const o = f.offer('furnace_haul');
  f.choose(o, 'furnace_haul');
  const cable = f.record().cable;
  assert.equal(cable.mode, 'winding');
  assert.equal(cable.slot, 0);
  assert.equal(f.calls.filter(c => c.kind === 'attach').length, 1);
  assert.equal(f.calls.find(c => c.kind === 'attach').targetId, f.m.params.furnaceLots[0].entityId);
  stepFurnaceCapstan(f.owner, 0.5);
  const reel = f.calls.find(c => c.kind === 'reel');
  assert.ok(reel.restLength < reel.previousRestLength);
  const held = f.offer('furnace_hold');
  f.choose(held, 'furnace_hold');
  assert.equal(f.record().cable.mode, 'held');
  const resume = f.offer('furnace_haul');
  f.choose(resume, 'furnace_haul');
  assert.equal(f.record().cable.mode, 'winding');
  assert.equal(f.calls.filter(c => c.kind === 'attach').length, 1); // still one cable
});

test('release cuts the yard line and frees the pod for the next hail', () => {
  const f = fixture();
  f.choose(f.offer('furnace_haul'), 'furnace_haul');
  const line = f.cable();
  f.choose(f.offer('furnace_release'), 'furnace_release');
  assert.equal(f.record().cable, null);
  assert.equal(line.state, 'broken');
  assert.equal(f.calls.filter(c => c.kind === 'cut').length, 1);
  // The released pod can be wound again — the yard serves it until the mouth settles it.
  f.choose(f.offer('furnace_haul'), 'furnace_haul');
  assert.equal(f.calls.filter(c => c.kind === 'attach').length, 2);
});

test('expiry, retarget, pod occupant replacement and cable replacement reject stale offers', () => {
  for (const change of ['expiry', 'target', 'pod', 'cable']) {
    const f = fixture();
    const o = f.offer('furnace_haul');
    if (change === 'expiry') f.s.simTime = o.expiresAt;
    if (change === 'target') f.s.player.targetId = null;
    if (change === 'pod') {
      const old = f.s.entities.get(o.furnaceCapstan.podId);
      f.s.entities.set(old.id, { ...old, occupantGeneration: old.occupantGeneration + 1 });
    }
    if (change === 'cable') {
      // Mint the offer against a live cable, then break and replace it: a successor
      // line can never validate the superseded consent.
      f.choose(f.offer('furnace_haul'), 'furnace_haul');
      const o2 = f.offer('furnace_hold');
      const line = f.s.combat.attachments.byId[o2.furnaceCapstan.lineId];
      line.state = 'broken';
      f.s.combat.attachments.byId.replaced = { ...line, id: 'replaced', state: 'active' };
      assert.equal(furnaceCapstanResponse(f.s, o2, 'furnace_hold'), null, change);
      continue;
    }
    assert.equal(furnaceCapstanResponse(f.s, o, 'furnace_haul'), null, change);
  }
});

test('a duplicate or superseded reply does not wind or release twice', () => {
  const f = fixture();
  const o = f.offer('furnace_haul');
  const res = f.choose(o, 'furnace_haul');
  assert.equal(f.calls.filter(c => c.kind === 'attach').length, 1);
  const cable = f.record().cable;
  // Replaying the same response must not cut, attach, or rewrite the live cable.
  f.bus.emit('contactHail:response', { ...res, choice: 'furnace_release' });
  assert.equal(f.record().cable, cable);
  assert.equal(f.record().cable.mode, 'winding');
  assert.equal(f.calls.filter(c => c.kind === 'cut').length, 0);
});

test('a live manual line on the pod releases the yard cable without consuming the pod', () => {
  const f = fixture();
  f.choose(f.offer('furnace_haul'), 'furnace_haul');
  const pod = f.s.entities.get(f.m.params.furnaceLots[0].entityId);
  const player = f.s.entities.get(f.s.playerId);
  f.s.combat.attachments.byId.player_line = {
    id: 'player_line', defId: 'tether_standard', state: 'active',
    ownerId: f.s.playerId, ownerGeneration: player.occupantGeneration,
    targetId: pod.id, targetGeneration: pod.occupantGeneration,
    controllerId: f.s.playerId, controllerGeneration: player.occupantGeneration,
  };
  stepFurnaceCapstan(f.owner, 1 / 60);
  assert.equal(f.record().cable, null);
  assert.equal(f.calls.filter(c => c.kind === 'cut').length, 1);
  assert.equal(pod.alive, true);
  assert.equal(f.m.params.furnaceFeeds, undefined);
});

test('overrun past the cable reach cuts and names the release honestly', () => {
  const f = fixture();
  const popups = [];
  f.bus.on('comms:popup', p => popups.push(p));
  f.choose(f.offer('furnace_haul'), 'furnace_haul');
  const pod = f.s.entities.get(f.m.params.furnaceLots[0].entityId);
  pod.pos.x += FURNACE_CAPSTAN.reach + 60;
  stepFurnaceCapstan(f.owner, 1 / 60);
  assert.equal(f.record().cable, null);
  const cut = f.calls.find(c => c.kind === 'cut');
  assert.ok(cut);
  assert.match(popups.find(p => /overran the cable/.test(p.text || ''))?.text || '', /Pod 1/);
});

test('Continue drops the yard cable; a save with no record is safe', () => {
  const f = fixture();
  f.choose(f.offer('furnace_haul'), 'furnace_haul');
  f.bus.emit('save:loaded');
  assert.equal(f.record().cable, null);
  stepFurnaceCapstan(f.owner, 1 / 60);
  // The old save carries no furnace_capstan flag at all — nothing mints or crashes.
  const g = fixture();
  delete g.s.story.flags.furnace_capstan;
  stepFurnaceCapstan(g.owner, 1 / 60);
  assert.equal(g.calls.length, 0);
});

test('the destroyed gantry is never repaired; corrupt custody fails closed', () => {
  const f = fixture();
  f.owner.helpers.removeEntity(f.a.id);
  f.bus.flush();
  assert.equal(f.record().disabled, true);
  assert.equal(f.record().cable, null);
  f.bus.emit('save:loaded');
  syncFurnaceCapstan(f.owner, f.m);
  assert.equal(f.s.entityList.filter(e => e.alive && e.data?.furnaceCapstanId).length, 0);
  // A malformed same-mission row blocks re-minting — corrupt custody never heals itself.
  const g = fixture();
  g.s.story.flags.furnace_capstan = { version: 1, missionId: g.m.id, cable: { slot: 'side', mode: 'reeling' } };
  syncFurnaceCapstan(g.owner, g.m);
  stepFurnaceCapstan(g.owner, 1 / 60);
  assert.equal(furnaceCapstanRead(g.s, g.a), null);
  assert.equal(g.calls.length, 0);
});

test('mission end removes only the yard equipment; pods, credits and receipts are untouched', () => {
  const f = fixture();
  const pods = f.m.params.furnaceLots.map(l => structuredClone(f.s.entities.get(l.entityId)));
  f.m.status = 'cancelled';
  syncFurnaceCapstan(f.owner, null);
  stepFurnaceCapstan(f.owner, 1 / 60);
  f.bus.flush();
  assert.equal(f.s.entityList.filter(e => e.alive && e.data?.furnaceCapstanId).length, 0);
  assert.equal(f.record().disabled, undefined);
  pods.forEach(old => assert.deepEqual(f.s.entities.get(old.id), old));
  assert.equal(f.s.player.credits, 743);
  assert.equal(f.m.params.furnaceFeeds, undefined);
});

test('production intake owns the gantry lifecycle and one canonical body survives reinit', () => {
  const f = fixture({ initController: false });
  const intake = createFurnaceIntake();
  intake.init(f.owner.ctx);
  const first = f.s.entityList.find(e => e.alive && e.data?.furnaceCapstanId);
  assert.ok(first);
  assert.equal(f.s.entityList.filter(e => e.alive && e.data?.furnaceCapstanId).length, 1);
  intake.init(f.owner.ctx);
  const second = f.s.entityList.find(e => e.alive && e.data?.furnaceCapstanId);
  assert.ok(second);
  assert.notEqual(second, first);
  assert.equal(f.s.entityList.filter(e => e.alive && e.data?.furnaceCapstanId).length, 1);
  // A real loss still disables; reinit cannot repair it.
  f.owner.helpers.removeEntity(second.id);
  f.bus.flush();
  assert.equal(f.record().disabled, true);
  intake.init(f.owner.ctx);
  f.bus.flush();
  assert.equal(f.s.entityList.filter(e => e.alive && e.data?.furnaceCapstanId).length, 0);
  intake.destroy();
});

test('the yard cable is admitted to the NPC service-cable renderer', () => {
  const f = fixture();
  f.choose(f.offer('furnace_haul'), 'furnace_haul');
  const line = f.cable();
  assert.ok(line, 'the gantry → pod line exists');
  assert.equal(npcCableAdmits(line, f.s.playerId), true, 'the capstan cable draws');
  // The admitted service modes keep their endpoint/life exclusions.
  assert.equal(npcCableAdmits({ ...line, state: 'broken' }, f.s.playerId), false);
  assert.equal(npcCableAdmits({ ...line, ownerId: f.s.playerId }, f.s.playerId), false);
  assert.equal(npcCableAdmits({ ...line, targetId: f.s.playerId }, f.s.playerId), false);
  assert.equal(npcCableAdmits({ ...line, controllerId: f.s.playerId }, f.s.playerId), false);
  assert.equal(npcCableAdmits({ ...line, defId: 'attachment_transport_clamp' }, f.s.playerId), false,
    'a transport clamp without an admitted control mode stays out');
});

test('the eaten pod clears its own cable; the winch never mints a receipt itself', () => {
  const f = fixture();
  f.choose(f.offer('furnace_haul'), 'furnace_haul');
  const pod = f.s.entities.get(f.m.params.furnaceLots[0].entityId);
  const line = f.cable();
  pod.alive = false;
  f.bus.emit('tether:broken', { attachmentId: line.id });
  assert.equal(f.record().cable, null);
  stepFurnaceCapstan(f.owner, 1 / 60);
  assert.equal(f.m.params.furnaceFeeds, undefined);
  assert.equal(f.s.player.credits, 743);
});
