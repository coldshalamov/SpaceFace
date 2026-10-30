import test from 'node:test';
import assert from 'node:assert/strict';
import { SITE, PARTS, LINKS, ZONES, GROWTH_ATTACHMENT_DEF } from '../src/features/glassreef-garden/data.mjs';
import { createGarden, restoreGarden, saveGarden, updateGarden, act, destroy,
  deliver, objectives, prepareSettlement, consumeSettlement, markPaid } from '../src/features/glassreef-garden/runtime.mjs';
import { createGlassreefGarden } from '../src/features/glassreef-garden/adapter.mjs';
import { gardenReadout } from '../src/features/glassreef-garden/presentation.mjs';

function seeded(seed = 17) {
  let n = seed >>> 0;
  return () => { n = (Math.imul(n, 1664525) + 1013904223) >>> 0; return n / 4294967296; };
}
function core(seed = 17) { return createGarden({ rng: seeded(seed), simTime: 0 }); }
function okay(g, action, id) { assert.equal(act(g, action, id).ok, true, `${action} ${id}`); }
function freeRigger(g) {
  okay(g, 'inspect', 'collar'); okay(g, 'vent', 'machine'); okay(g, 'detach', 'collar'); okay(g, 'rescue', 'worker');
}
function isolate(g) {
  for (const id of ['waste_a', 'waste_b']) {
    okay(g, 'inspect', id); if (g.nodes[id].status === 'attached') okay(g, 'detach', id);
    assert.equal(deliver(g, id, 'waste', true), true);
  }
}
function pods(g, choice, count = 3) {
  okay(g, choice, 'worker');
  for (const id of ['pod_a', 'pod_b', 'pod_c'].slice(0, count)) {
    okay(g, 'inspect', id); okay(g, 'detach', id);
    assert.equal(deliver(g, id, choice === 'harvest' ? 'harvest' : 'nursery', true), true);
  }
}

// Contract harness, not a second game physics engine. It records canonical owner calls;
// tests explicitly place physical bodies to exercise acceptance/rejection at receiver boundaries.
function harness(saved = null, overrides = {}) {
  const listeners = new Map(), counts = { spawn: 0, remove: 0, grant: 0, create: 0, cut: 0 };
  const bus = {
    on(name, fn) { const list = listeners.get(name) || new Set(); list.add(fn); listeners.set(name, list); return () => list.delete(fn); },
    emit(name, p) { for (const fn of [...(listeners.get(name) || [])]) fn(p); },
  };
  const state = { rng: seeded(), simTime: saved?.garden.lastTime || 0, tick: 0,
    world: { currentSectorId: 'sector_test' }, mode: 'flight', entities: new Map(), playerId: 1,
    player: { credits: 100 } };
  let nextId = 2, generation = 100, nextJoint = 1;
  state.entities.set(1, { id: 1, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, alive: true, flags: {} });
  const jointMap = new Map();
  const attachments = {
    create(spec) {
      counts.create++;
      if (overrides.createFailure) return { ok: false, reason: 'physics_port_unavailable' };
      const owner = state.entities.get(spec.ownerId), target = state.entities.get(spec.targetId);
      // Pinned combatDefs.js: salvage clamp accepts tether→tether; the wreck profile
      // has four shared tether slots. tether_standard would require a ship-only spool.
      assert.equal(spec.defId, 'attachment_salvage_clamp');
      assert.equal(owner.data.combatProfileId, 'combat_profile_tether_anchor');
      assert.equal(target.data.combatProfileId, 'combat_profile_tether_anchor');
      for (const e of [owner, target]) {
        const used = [...jointMap.values()].filter(a => a.state === 'active' && [a.ownerId, a.targetId].includes(e.id)).length;
        if (used >= 4) return { ok: false, reason: 'source_socket_unavailable' };
      }
      const a = { id: `att_${nextJoint++}`, ownerId: owner.id, targetId: target.id,
        ownerGeneration: owner.occupantGeneration, targetGeneration: target.occupantGeneration,
        restLength: Math.hypot(owner.pos.x - target.pos.x, owner.pos.z - target.pos.z),
        lastTension: 0, state: 'active' };
      jointMap.set(a.id, a); return { ok: true, attachment: a };
    },
    get: id => jointMap.get(id),
    reel(id, delta) { const a = jointMap.get(id); a.restLength += delta; return { ok: true, attachment: a }; },
    cut(id, actorId) {
      counts.cut++; const a = jointMap.get(id);
      assert.equal(actorId, a.ownerId);
      if (overrides.cutFailure) return { ok: false, reason: 'physics_cut_rejected' };
      a.state = 'broken'; return { ok: true, attachment: a };
    },
  };
  const helpers = {
    spawnEntity(spec) {
      counts.spawn++; const e = { ...spec, id: nextId++, alive: true,
        occupantGeneration: generation++, pos: { ...spec.pos }, vel: { ...spec.vel } };
      state.entities.set(e.id, e); return e;
    },
    removeEntity(id, opts) {
      counts.remove++; const e = state.entities.get(id); if (!e) return false;
      e.alive = false; state.entities.delete(id);
      bus.emit('entity:destroyed', { id, entity: e, reason: opts?.reason }); return true;
    },
  };
  const economy = { grantCredits(amount, reason) {
    counts.grant++;
    if (overrides.grantFailure) throw new Error('owner rejected before write');
    state.player.credits += amount;
    bus.emit('credits:changed', { delta: amount, reason, total: state.player.credits });
    return state.player.credits;
  } };
  const registry = { get: name => name === 'actions' ? { kernel: { attachments } }
    : name === 'economy' ? economy : null };
  const ctx = { state, bus, helpers, registry };
  const adapter = createGlassreefGarden(ctx, { sectorId: 'sector_test', x: 0, z: 0 }, saved);
  const body = part => { const b = adapter.read().bodies.find(b => b.partId === part); return b && state.entities.get(b.entityId); };
  const near = part => { const p = body(part); assert.ok(p, part); Object.assign(state.entities.get(1).pos, p.pos); };
  const request = (action, part) => { near(part); return adapter.request(action, part); };
  const step = (dt = 1 / 60) => { state.simTime += dt; state.tick++; return adapter.update(); };
  const place = (part, zone, speed = 0) => {
    const e = body(part); e.pos.x = ZONES[zone].x; e.pos.z = ZONES[zone].z;
    e.vel.x = speed; e.vel.z = 0; step();
  };
  const enter = () => { if (!adapter.enter()) return false; step(); return adapter.read().ready; };
  return { adapter, state, bus, counts, attachments, jointMap, body, near, request, step, place, helpers, ctx, enter };
}
function adapterJourney(h, choice, manual = false) {
  assert.equal(h.enter(), true);
  assert.equal(h.request('inspect', 'collar').ok, true);
  if (manual) { h.helpers.removeEntity(h.body('machine').id); assert.equal(h.request('brace', 'collar').ok, true); }
  else assert.equal(h.request('vent', 'machine').ok, true);
  if (!manual) assert.equal(h.request('detach', 'collar').ok, true);
  assert.equal(h.request('rescue', 'worker').ok, true);
  for (const id of ['waste_a', 'waste_b']) {
    assert.equal(h.request('inspect', id).ok, true);
    if (h.adapter.read().garden.nodes[id].status === 'attached') assert.equal(h.request('detach', id).ok, true);
    h.place(id, 'waste');
  }
  assert.equal(h.request(choice, 'worker').ok, true);
  for (const id of choice === 'restore' ? ['pod_a', 'pod_b'] : ['pod_a', 'pod_b', 'pod_c']) {
    assert.equal(h.request('inspect', id).ok, true); assert.equal(h.request('detach', id).ok, true);
    h.place(id, choice === 'restore' ? 'nursery' : 'harvest');
  }
}

test('seeded cohort is repeatable, bounded and consumes only three RNG draws', () => {
  let count = 0; const rng = seeded(); const g = createGarden({ rng: () => { count++; return rng(); }, simTime: 0 });
  assert.equal(count, 3); assert.deepEqual(g, core());
  assert.notEqual(g.nodes.pod_a.viability, core(99).nodes.pod_a.viability);
  assert.equal(PARTS.length, SITE.maxBodies); assert.equal(LINKS.length, SITE.maxEdges);
});
test('authored graph uses an existing compatible clamp and leaves a player tether slot', () => {
  assert.equal(GROWTH_ATTACHMENT_DEF, 'attachment_salvage_clamp');
  for (const part of PARTS) {
    const degree = LINKS.filter(e => e.child === part.id || e.parent === part.id).length;
    assert.ok(degree <= 3, `${part.id} needs one free slot for the player`);
    assert.ok(LINKS.filter(e => e.child === part.id).length <= 1);
  }
  for (const edge of LINKS) {
    const a = PARTS.find(p => p.id === edge.child), b = PARTS.find(p => p.id === edge.parent);
    assert.ok(Math.hypot(a.x - b.x, a.z - b.z) < 40);
  }
});
test('careful commercial approach gives one finite complete receipt', () => {
  const g = core(); freeRigger(g); isolate(g); pods(g, 'harvest');
  assert.equal(objectives(g).ready, true);
  const receipt = prepareSettlement(g); assert.equal(receipt.amount, 630);
  assert.equal(prepareSettlement(g), null); assert.equal(consumeSettlement(g, receipt.id), true);
  assert.equal(consumeSettlement(g, receipt.id), false); assert.equal(markPaid(g, receipt.id), true);
  assert.equal(act(g, 'restore', 'worker').ok, false);
  assert.deepEqual(restoreGarden(saveGarden(g), 200), { ...g, lastTime: 200 });
});
test('restoration uses two living seeds and cannot also pay commercial harvest', () => {
  const g = core(); freeRigger(g); isolate(g); pods(g, 'restore', 2);
  assert.equal(objectives(g).ready, true); assert.equal(prepareSettlement(g).amount, 510);
  assert.equal(deliver(g, 'pod_c', 'harvest', true), false);
});
test('receiver rejects attached, unclassified, fast and wrong-material deliveries', () => {
  const g = core(); freeRigger(g); okay(g, 'harvest', 'worker');
  assert.equal(deliver(g, 'pod_a', 'harvest', true), false);
  okay(g, 'inspect', 'pod_a'); okay(g, 'detach', 'pod_a');
  assert.equal(deliver(g, 'pod_a', 'harvest', false), false);
  assert.equal(deliver(g, 'pod_a', 'waste', true), false);
  okay(g, 'inspect', 'waste_a'); okay(g, 'detach', 'waste_a');
  assert.equal(deliver(g, 'waste_a', 'harvest', true), false);
  assert.equal(deliver(g, 'waste_a', 'waste', true), true);
  assert.equal(deliver(g, 'waste_a', 'waste', true), false);
});
test('connected graph routes measured impact; disconnected neck blocks transmission', () => {
  const a = core(), b = core(); okay(b, 'inspect', 'pod_a'); okay(b, 'detach', 'pod_a');
  updateGarden(a, 0.1, { pod_a: { impact: 80 } }); updateGarden(b, 0.1, { pod_a: { impact: 80 } });
  assert.ok(a.nodes.bough_a.stress > b.nodes.bough_a.stress);
  assert.equal(a.nodes.bough_b.stress, b.nodes.bough_b.stress);
});
test('sustained physical tension warns, fractures and preserves a viable force route', () => {
  const g = core(); let warned = false;
  for (let i = 1; i <= 40; i++) {
    updateGarden(g, i / 10, { collar: { tension: 120 } });
    if (g.nodes.collar.stress > 0.45 && g.links[0]) warned = true;
  }
  assert.equal(warned, true); assert.equal(g.links[0], false);
  assert.equal(objectives(g).viable, 3); assert.ok(g.nodes.collar.stress < 0.98);
});
test('destroyed machinery leaves a manual rescue and restoration journey', () => {
  const g = core(); assert.equal(destroy(g, 'machine'), true);
  okay(g, 'inspect', 'collar'); okay(g, 'brace', 'collar'); okay(g, 'rescue', 'worker'); isolate(g); pods(g, 'restore', 2);
  assert.equal(objectives(g).ready, true); assert.equal(prepareSettlement(g).amount, 510);
  assert.equal(act(g, 'vent', 'machine').ok, false);
});
test('burst waste bruises seed once; rigger cleaning is finite', () => {
  const g = core(); freeRigger(g); const before = g.nodes.pod_a.viability;
  destroy(g, 'waste_a'); assert.ok(g.nodes.pod_a.viability < before);
  const after = g.nodes.pod_a.viability; destroy(g, 'waste_a'); assert.equal(g.nodes.pod_a.viability, after);
  okay(g, 'inspect', 'pod_a'); okay(g, 'detach', 'pod_a'); okay(g, 'clean', 'pod_a');
  assert.equal(act(g, 'clean', 'pod_a').ok, false);
});
test('failed restoration can close out after loss of the second viable seed', () => {
  const g = core(); freeRigger(g); isolate(g); pods(g, 'restore', 1);
  destroy(g, 'pod_b'); destroy(g, 'pod_c'); okay(g, 'emergency', 'worker');
  assert.equal(prepareSettlement(g).amount, 135);
  assert.doesNotThrow(() => restoreGarden(saveGarden(g), 0));
});
test('save restore rejects incompatible, forged, extra and contradictory state', () => {
  const g = core();
  for (const change of [x => x.version++, x => x.nodes.pod_a.stress = NaN,
    x => x.nodes.extra = {}, x => x.nodes.pod_a.extra = [], x => x.links.push(true),
    x => x.retired = true, x => x.nodes.pod_a.status = 'loose', x => x.lastTime = 3]) {
    const bad = saveGarden(g); change(bad); assert.throws(() => restoreGarden(bad, 0), TypeError);
  }
});
test('abandoned partly detached site restores without offsite decay or refill', () => {
  const h = harness(); h.enter(); h.request('inspect', 'pod_a'); h.request('detach', 'pod_a');
  h.body('pod_a').pos.x = 82; h.body('pod_a').vel.z = 3; h.body('pod_a').hull = 23;
  const viability = h.adapter.read().garden.nodes.pod_a.viability;
  h.adapter.leave(); assert.equal(h.state.entities.size, 1);
  h.state.simTime = 999; assert.equal(h.enter(), true);
  assert.equal(h.body('pod_a').pos.x, 82); assert.equal(h.body('pod_a').vel.z, 3); assert.equal(h.body('pod_a').hull, 23);
  assert.equal(h.adapter.read().garden.nodes.pod_a.viability, viability);
  assert.equal(h.adapter.read().garden.nodes.pod_a.status, 'loose');
  const saved = h.adapter.serialize(); h.adapter.dispose();
  const next = harness(saved); assert.equal(next.enter(), true);
  assert.equal(next.body('pod_a').pos.x, 82); assert.equal(next.adapter.read().garden.links[3], false);
});
test('adapter commercial journey pays via economy owner exactly once despite nested callbacks', () => {
  const h = harness(); adapterJourney(h, 'harvest');
  let captured;
  h.bus.on('credits:changed', () => { captured = h.adapter.serialize(); h.adapter.request('settle', 'worker'); });
  const r = h.request('settle', 'worker'); assert.equal(r.ok, true); assert.equal(h.state.player.credits, 730);
  assert.equal(captured.garden.settlement.status, 'consumed');
  assert.equal(h.counts.grant, 1); assert.equal(h.request('settle', 'worker').ok, false);
  const next = harness(h.adapter.serialize()); assert.equal(next.enter(), false); assert.equal(next.counts.grant, 0);
  assert.equal(next.adapter.missionEvidence().complete, true);
});
test('adapter restoration works when nursery machinery is destroyed', () => {
  const h = harness(); adapterJourney(h, 'restore', true);
  assert.equal(h.adapter.missionEvidence().ready, true);
  assert.equal(h.request('settle', 'worker').ok, true); assert.equal(h.state.player.credits, 610);
});
test('ambiguous economy failure persists consumed receipt and never reports payment', () => {
  const h = harness(null, { grantFailure: true }); adapterJourney(h, 'restore');
  assert.equal(h.request('settle', 'worker').ok, false); assert.equal(h.counts.grant, 1);
  const saved = h.adapter.serialize(); assert.equal(saved.garden.settlement.status, 'consumed');
  assert.equal(h.adapter.missionEvidence().complete, false);
  const next = harness(saved); assert.equal(next.enter(), false);
  assert.equal(next.counts.grant, 0); assert.equal(next.adapter.missionEvidence().complete, false);
});
test('update is bounded even with a large unrelated world and huge elapsed time', () => {
  const h = harness(); h.enter();
  for (let i = 0; i < 10000; i++) h.state.entities.set(10000 + i, { id: 10000 + i });
  h.state.entities[Symbol.iterator] = () => { throw new Error('global iteration'); };
  h.state.entities.values = () => { throw new Error('global scan'); };
  const result = h.step(1e6);
  assert.deepEqual(result, { nodes: 10, edges: 18, bodyReads: 30, jointReads: 18 });
  assert.deepEqual(h.adapter.update(), { nodes: 0, edges: 0, bodyReads: 0, jointReads: 0 });
  assert.equal(h.counts.spawn, 10); assert.equal(h.counts.create, 9);
});
test('duplicate impact receipts do not multiply stress; stale generation is refused', () => {
  const a = harness(), b = harness(); a.enter(); b.enter();
  function impact(h, generationOffset = 0) {
    const e = h.body('pod_a'); h.bus.emit('physics:impact', { tick: h.state.tick,
      aId: e.id, bId: 999, aGeneration: e.occupantGeneration + generationOffset, impulse: 30 });
  }
  impact(a); impact(a); impact(b); a.step(); b.step();
  assert.equal(a.adapter.read().garden.nodes.pod_a.stress, b.adapter.read().garden.nodes.pod_a.stress);
  const c = harness(), quiet = harness(); c.enter(); quiet.enter(); impact(c, 1); c.step(); quiet.step();
  assert.equal(c.adapter.read().garden.nodes.pod_a.stress, quiet.adapter.read().garden.nodes.pod_a.stress);
});
test('queued destruction from a previous visit cannot destroy a replacement body', () => {
  const h = harness(); h.enter(); const old = h.body('pod_a'); h.adapter.leave(); h.enter();
  const current = h.body('pod_a'); assert.notEqual(current, old);
  h.bus.emit('entity:destroyed', { id: current.id, entity: old });
  assert.equal(h.adapter.read().garden.nodes.pod_a.status, 'attached');
});
test('native preparation retains one cohort until body authority is ready', () => {
  const options = { createFailure: true }, h = harness(null, options);
  assert.equal(h.enter(), false); assert.equal(h.state.entities.size, 11);
  assert.equal(h.adapter.read().lastError, 'physics_port_unavailable');
  assert.equal(h.request('inspect', 'collar').reason, 'site_preparing');
  options.createFailure = false; h.step(0.3); assert.equal(h.adapter.read().ready, true);
  assert.equal(h.counts.spawn, 10); assert.equal(h.adapter.read().bodies.length, 10);
});
test('joint cut rejection does not falsely detach an organic neck', () => {
  const options = { cutFailure: true }, h = harness(null, options); h.enter();
  h.request('inspect', 'pod_a'); assert.equal(h.request('detach', 'pod_a').ok, false);
  assert.equal(h.adapter.read().garden.links[3], true);
  options.cutFailure = false; assert.equal(h.request('detach', 'pod_a').ok, true);
});
test('physical receiver requires the whole pod within the tray at low velocity', () => {
  const h = harness(); h.enter();
  h.request('inspect', 'collar'); h.request('detach', 'collar'); h.request('rescue', 'worker'); h.request('harvest', 'worker');
  h.request('inspect', 'pod_a'); h.request('detach', 'pod_a');
  h.place('pod_a', 'harvest', 3); assert.equal(h.adapter.read().garden.nodes.pod_a.status, 'loose');
  const e = h.body('pod_a'); e.vel.x = 0; e.pos.x += ZONES.harvest.radius - 1; h.step();
  assert.equal(h.adapter.read().garden.nodes.pod_a.status, 'loose');
  h.place('pod_a', 'harvest'); assert.equal(h.adapter.read().garden.nodes.pod_a.status, 'stored');
});
test('interaction requires proximity, flight mode, live identity and rigger for signing', () => {
  const h = harness(); h.enter();
  h.state.entities.get(1).pos.x = 1000; assert.equal(h.adapter.request('inspect', 'collar').ok, false);
  h.near('collar'); h.state.mode = 'menu'; assert.equal(h.adapter.request('inspect', 'collar').ok, false);
  h.state.mode = 'flight'; assert.equal(h.request('settle', 'collar').reason, 'ask_rigger_to_sign');
  const e = h.body('pod_a'); h.state.entities.set(e.id, { ...e, occupantGeneration: e.occupantGeneration + 1 });
  assert.equal(h.adapter.request('inspect', 'pod_a').ok, false);
});
test('presentation preserves warning, relief, classification and recovery as text', () => {
  const g = core(); let s = { garden: g };
  assert.match(gardenReadout(s).classification, /UNCLASSIFIED/);
  g.nodes.collar.stress = 0.9; assert.match(gardenReadout(s).warning, /DANGER/);
  g.nodes.collar.stress = 0; okay(g, 'inspect', 'collar'); assert.match(gardenReadout(s).warning, /RELIEF/);
  destroy(g, 'machine'); assert.match(gardenReadout(s).voice, /hand pollinator/);
});
test('dispose is idempotent and unsubscribes all site-owned listeners', () => {
  const h = harness(); h.enter(); h.adapter.dispose(); const removed = h.counts.remove;
  h.adapter.dispose(); h.bus.emit('sector:enter', {}); h.step();
  assert.equal(h.counts.remove, removed); assert.equal(h.enter(), false); assert.equal(h.state.entities.size, 1);
});
test('organic stress fracture cuts the canonical joint and opens the force approach', () => {
  const h = harness(); h.enter();
  const collar = h.body('collar');
  const a = [...h.jointMap.values()].find(a => a.ownerId === collar.id);
  a.lastTension = 120;
  let warned = false;
  for (let i = 0; i < 150; i++) {
    h.step(); const g = h.adapter.read().garden;
    if (g.nodes.collar.stress > 0.45 && g.links[0]) warned = true;
  }
  assert.equal(warned, true); assert.equal(h.adapter.read().garden.links[0], false);
  assert.equal(a.state, 'broken'); assert.ok(h.counts.cut > 0);
  assert.equal(h.adapter.missionEvidence().viable, 3);
});
test('growth matures within a fixed envelope and venting stops further loading', () => {
  const g = core(); const initial = g.nodes.pod_a.maturity;
  for (let i = 1; i <= 100; i++) updateGarden(g, i / 10);
  assert.ok(g.nodes.pod_a.maturity > initial); assert.ok(g.nodes.pod_a.maturity <= 1);
  okay(g, 'inspect', 'collar'); okay(g, 'vent', 'machine');
  const maturity = g.nodes.pod_a.maturity, stress = g.nodes.pod_a.stress;
  updateGarden(g, 10.1);
  assert.equal(g.nodes.pod_a.maturity, maturity); assert.ok(g.nodes.pod_a.stress < stress);
  assert.equal(Object.keys(g.nodes).length, 10); assert.equal(g.links.length, 9);
});
test('native rest lengths and partially strained poses survive re-entry', () => {
  const h = harness(); h.enter(); const e = h.body('collar'); e.pos.x += 4;
  const before = [...h.jointMap.values()].find(a => a.ownerId === e.id).restLength;
  h.adapter.leave(); h.enter();
  const next = h.body('collar'), joint = [...h.jointMap.values()].find(a => a.ownerId === next.id);
  assert.equal(next.pos.x, 24); assert.equal(joint.restLength, before);
});
test('duplicate initialization cannot create a second cohort for the same GameState', () => {
  const h = harness(); h.enter();
  assert.throws(() => createGlassreefGarden(h.ctx, { sectorId: 'sector_test', x: 0, z: 0 }), /already owns/);
  assert.equal(h.counts.spawn, 10); h.adapter.dispose();
  const next = createGlassreefGarden(h.ctx, { sectorId: 'sector_test', x: 0, z: 0 });
  assert.equal(next.enter(), true); next.dispose();
});
test('restore refuses oversized rest-length pools and repaired hull forgery', () => {
  const h = harness(); h.enter(); const saved = h.adapter.serialize();
  for (const mutate of [s => s.jointLengths.push(1), s => s.jointLengths[0] = Infinity,
    s => s.poses.pod_a.hull = 240, s => delete s.poses.collar]) {
    const bad = structuredClone(saved); mutate(bad); assert.throws(() => harness(bad), TypeError);
  }
});
test('permanent native preparation failure retires the cohort after eight bounded attempts', () => {
  const h = harness(null, { createFailure: true }); assert.equal(h.enter(), false);
  for (let i = 0; i < 10; i++) h.step(0.3);
  assert.equal(h.counts.create, 8); assert.equal(h.counts.spawn, 10);
  assert.equal(h.state.entities.size, 1); assert.equal(h.adapter.read().active, false);
});
test('mission proof is a paid owner query, never an intent claiming success', () => {
  const h = harness();
  const payload = { missionId: SITE.missionId, siteId: SITE.id, receiptId: `${SITE.id}:settlement:v1` };
  assert.equal(h.adapter.verifyMissionProof(payload).ok, false);
  adapterJourney(h, 'restore'); assert.equal(h.adapter.verifyMissionProof(payload).ok, false);
  h.request('settle', 'worker'); assert.equal(h.adapter.verifyMissionProof(payload).ok, true);
  assert.equal(h.adapter.verifyMissionProof({ ...payload, receiptId: 'stale' }).ok, false);
});
