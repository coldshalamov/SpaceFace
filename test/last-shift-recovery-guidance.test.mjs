import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { lastShift } from '../src/systems/lastShift.js';
import { LAST_SHIFT as C, LAST_SHIFT_POS, LAST_SHIFT_CLUES } from '../src/data/lastShift.js';
import { getCombatKernel } from '../src/combat/kernel.js';
import { lastShiftPrompt } from '../src/ui/lastShiftPrompt.js';
import { setPromptDeck } from '../src/ui/promptDeck.js';
function fixture(native = null) {
  const sim = createSimulation({ seed: 18, systems: [lastShift], helpers: {
    combatPhysics: native || { createAttachment: row => ({ id: row.attachmentId }), cutAttachment: () => true },
  } });
  const { state } = sim; state.mode = 'flight'; state.world.currentSectorId = C.sectorId;
  if (!native) state.settings.gameplay.physicsBackend = 'legacy';
  const player = sim.spawn({ type: 'ship', isPlayer: true, team: 0, pos: { ...LAST_SHIFT_POS },
    radius: 9, mass: 28, hull: 100, hullMax: 100, data: {} });
  state.playerId = player.id;
  const system = sim.registry.get('lastShift'); system.update(1 / 60, state);
  const sources = Object.fromEntries(LAST_SHIFT_CLUES.map(c => [c.id, system._find(c.id)]));
  function scan(id) {
    state.player.targetId = sources[id].id;
    player.pos.set(sources[id].pos.x, 0, sources[id].pos.z);
    sim.bus.emit('scan:pulse', { pos: { x: player.pos.x, z: player.pos.z } });
  }
  function dock(recorder = sources.recorder) {
    player.pos.set(LAST_SHIFT_POS.x, 0, LAST_SHIFT_POS.z);
    recorder.pos.set(player.pos.x + 20, 0, player.pos.z); recorder.vel.set(0, 0, 0);
    return sim.spawn({ type: 'station', team: 2, pos: { x: player.pos.x + 70, z: player.pos.z },
      radius: 80, hull: 1000, hullMax: 1000, mass: 1000, data: { stationId: 'station_test_archive', dockRadius: 80 } });
  }
  function tow(recorder = sources.recorder) {
    if (native) native.syncFromEntities(state.entityList);
    const attachment = getCombatKernel(system.ctx).attachments.create({ defId: 'tether_standard',
      ownerId: player.id, targetId: recorder.id, sourceWorld: player.pos, targetWorld: recorder.pos });
    assert.equal(attachment.ok, true, attachment.reason); return attachment.attachment;
  }
  return { sim, state, system, player, sources, scan, dock, tow };
}

test('guidance unlocks only from read recorder evidence and never files or returns hardware', () => {
  const h = fixture();
  try {
    assert.equal(h.system.readout().recorderRecovery, null);
    h.scan('cargo'); assert.equal(h.system.readout().recorderRecovery, null);
    h.scan('recorder'); assert.equal(h.system.readout().recorderRecovery, 'available');
    assert.equal(h.system.readout().canReturnRecorder, false);
    const before = h.system.serialize();
    h.sim.bus.emit('lastShift:readRecovery');
    assert.deepEqual(h.system.serialize(), before);
    h.system.archive(); assert.equal(h.system.readout().recorderRecovery, 'available');
    assert.equal(h.sources.recorder.alive, true);
  } finally { h.sim.dispose(); }
});
test('readout derives towing, berth, returned and terminal loss without changing custody', () => {
  const h = fixture();
  try {
    h.scan('recorder'); const line = h.tow();
    assert.equal(h.system.readout().recorderRecovery, 'towing');
    const life = h.sources.recorder.occupantGeneration;
    h.sources.recorder.occupantGeneration++;
    assert.equal(h.system.readout().recorderRecovery, 'available');
    h.sources.recorder.occupantGeneration = life;
    h.dock(); assert.equal(h.system.readout().recorderRecovery, 'berth-ready');
    assert.equal(h.system.returnRecorder().ok, true);
    assert.equal(line.state, 'broken');
    assert.equal(h.system.readout().recorderRecovery, 'returned');
    const saved = h.system.serialize(); h.system.deserialize(saved);
    assert.equal(h.system.readout().recorderRecovery, 'returned');
    h.system.newGame(); assert.equal(h.system.readout().recorderRecovery, null);
  } finally { h.sim.dispose(); }
  for (const outcome of ['destroyed', 'salvaged']) {
    const x = fixture();
    try {
      x.scan('recorder'); x.sources.recorder.alive = false;
      x.sim.bus.emit(outcome === 'destroyed' ? 'entity:killed' : 'salvage:completed',
        { id: x.sources.recorder.id, wreckId: x.sources.recorder.id });
      assert.equal(x.system.readout().recorderRecovery, 'lost');
      const saved = x.system.serialize(); x.system.deserialize(saved);
      assert.equal(x.system.readout().recorderRecovery, 'lost');
      assert.equal(x.system.archive().ok, true);
    } finally { x.sim.dispose(); }
  }
});
test('restoring and unloaded bodies are unavailable, not lost, and native pending is not towing', () => {
  const h = fixture();
  try {
    h.scan('recorder'); const saved = h.system.serialize();
    h.sim.bus.emit('save:restoring'); assert.equal(h.system.readout().recorderRecovery, 'unavailable');
    h.system.deserialize(saved); h.sim.bus.emit('save:loaded');
    assert.equal(h.system.readout().recorderRecovery, 'available');
    h.tow(); h.state.settings.gameplay.physicsBackend = 'rapier-dynamic';
    assert.equal(h.system.readout().recorderRecovery, 'custody-pending');
    h.system.ctx.helpers.combatPhysics.getAttachmentTelemetry = () => ({});
    assert.equal(h.system.readout().recorderRecovery, 'towing');
    const e = h.sources.recorder; h.state.entities.delete(e.id);
    assert.equal(h.system.readout().recorderRecovery, 'unavailable');
    assert.equal(h.system.serialize().bodies.recorder.status, 'live');
  } finally { h.sim.dispose(); }
});
function presenter(h, overrides = {}) {
  const cards = new Map();
  setPromptDeck({ offerDecision: spec => { cards.set(spec.id, spec); return true; },
    resolveDecision: id => cards.delete(id), ...overrides });
  const adapter = Object.create(lastShiftPrompt); adapter.init(h.system.ctx);
  return { cards, adapter, card: () => cards.get('last-shift:evidence'),
    close() { adapter.destroy(); h.sim.dispose(); setPromptDeck(null); } };
}
test('filed revisions show completion without repeating FILE, while new evidence reopens filing and recovery stays available', () => {
  const h = fixture(), p = presenter(h);
  try {
    const credits = h.state.player.credits;
    h.scan('cargo');
    assert.ok(p.card().choices.some(choice => choice.id === 'archive'));
    p.card().onChoose('archive');
    h.system._offer();
    assert.equal(h.system.readout().archiveFiled, true);
    assert.match(p.card().statusFlag, /FILED/);
    assert.ok(!p.card().choices.some(choice => choice.id === 'archive'));
    assert.equal(p.card().detail, h.system.readout().text, 'the filed account remains readable');
    h.scan('recorder');
    assert.equal(h.system.readout().archiveFiled, false);
    assert.ok(p.card().choices.some(choice => choice.id === 'archive'));
    assert.ok(p.card().choices.some(choice => choice.id === 'recovery'));
    p.card().onChoose('archive');
    const saved = JSON.parse(JSON.stringify(h.system.serialize()));
    assert.equal(saved.archiveFiled, undefined, 'completion derives from existing receipts, not a new save field');
    h.system.deserialize(saved); h.system.afterContinue(); h.system._offer();
    assert.equal(h.system.readout().archiveFiled, true);
    assert.equal(h.system.serialize().receipts.length, 2);
    assert.ok(p.card().choices.some(choice => choice.id === 'recovery'));
    p.card().onChoose('recovery');
    assert.match(p.card().detail, /Filing sources does not return hardware/);
    assert.equal(h.state.player.credits, credits);
  } finally { p.close(); }
});

test('short recovery pages are reachable before the berth, with truthful advice and separate filing', () => {
  const h = fixture(), p = presenter(h);
  try {
    h.scan('cargo'); assert.ok(!p.card().choices.some(c => c.id === 'recovery'));
    h.scan('recorder'); const source = p.card();
    assert.ok(source.choices.some(c => c.id === 'recovery'));
    source.onChoose('recovery'); const recovery = p.card();
    assert.match(recovery.detail, /Optional.*Filing sources does not return hardware/);
    assert.ok(recovery.detail.length < 200);
    assert.equal(recovery.choices.length, 3);
    recovery.onChoose('advice');
    assert.match(p.card().detail, /Keep separation.*Slow both bodies gradually.*settle before reeling/);
    assert.match(p.card().detail, /destroy.*No extra payment/);
    assert.ok(p.card().detail.length < 200);
    assert.deepEqual(p.card().choices.map(c => c.id), ['back', 'leave']);
    p.card().onChoose('back'); p.card().onChoose('back');
    assert.equal(p.card().detail, h.system.readout().text);
    assert.equal(h.system.serialize().receipts.length, 0);
    p.card().onChoose('recovery'); p.card().onChoose('leave');
    assert.equal(p.cards.size, 0);
  } finally { p.close(); }
});
test('recovery reads fresh state and newer offers invalidate all old page callbacks', () => {
  const h = fixture(), p = presenter(h);
  try {
    h.scan('recorder'); const old = p.card(); h.tow();
    old.onChoose('recovery'); assert.match(p.card().detail, /on your line/);
    const staleRecovery = p.card(); staleRecovery.onChoose('advice');
    const staleAdvice = p.card(); h.scan('cargo');
    assert.equal(staleRecovery.onChoose('advice'), false);
    assert.equal(staleAdvice.onChoose('back'), false);
    assert.equal(p.card().detail, h.system.readout().text);
    h.dock(); h.scan('recorder');
    assert.equal(p.card().choices.length, 4);
    p.card().onChoose('recovery'); assert.equal(p.card().choices.length, 4);
    assert.match(p.card().detail, /meet the return gate/);
    p.card().onChoose('return'); assert.equal(h.system.readout().recorderRecovery, 'returned');
    p.card().onChoose('recovery');
    assert.ok(!p.card().choices.some(c => ['return', 'advice'].includes(c.id)));
  } finally { p.close(); }
});
test('delayed recovery replies cannot reopen after lifecycle clear or a newer offer', () => {
  const h = fixture(), p = presenter(h);
  try {
    h.scan('recorder');
    const stale = { ...h.system.readout(), view: 'recovery', requestId: p.adapter._epoch };
    p.adapter.clear();
    h.sim.bus.emit('lastShift:offer', stale); assert.equal(p.cards.size, 0);
    h.scan('cargo'); const current = p.card();
    h.sim.bus.emit('lastShift:offer', stale); assert.equal(p.card(), current);
  } finally { p.close(); }
});
test('all lifecycle clears, rejected admission and resolve reentrancy retain action fences', () => {
  const h = fixture(), p = presenter(h);
  try {
    for (const event of ['sector:exit', 'dock:docked', 'save:restoring', 'save:loaded', 'game:load', 'game:new', 'game:newGame']) {
      h.system._restoring = false; h.scan('recorder'); p.card().onChoose('recovery');
      const old = p.card(); h.sim.bus.emit(event);
      assert.equal(p.cards.size, 0); assert.equal(old.onChoose('advice'), false);
    }
    h.system._restoring = false;
    let rejected;
    setPromptDeck({ offerDecision: spec => { rejected = spec; return false; }, resolveDecision() {} });
    h.scan('recorder'); assert.equal(rejected.onChoose('recovery'), false);
    let current, reenter = false;
    setPromptDeck({ offerDecision: spec => { current = spec; return true; },
      resolveDecision() { if (reenter) { reenter = false; h.system._offer(); } } });
    h.scan('recorder'); const stale = current; reenter = true;
    assert.equal(stale.onChoose('recovery'), false);
    assert.equal(current.detail, h.system.readout().text);
    p.adapter.destroy(); assert.equal(current.onChoose('archive'), false);
  } finally { p.close(); }
});

test('recovery page request crosses the actual main lane and returns through the worker offer bridge', async () => {
  const { readFileSync } = await import('node:fs');
  const { createGameState } = await import('../src/core/gameState.js');
  const { createBus } = await import('../src/core/eventBus.js');
  const { createSimLaneRuntime } = await import('../src/core/simLaneMain.js');
  const { createSimHost } = await import('../scripts/lib/simWorkerHost.mjs');
  const worker = createSimHost(), mainState = createGameState(18), bus = createBus();
  const scenarioContract = JSON.parse(readFileSync(new URL('../src/data/scenarios/47a.scenario.json', import.meta.url), 'utf8'));
  let deliver, finish, received = null, ownerReads = 0;
  const lane = createSimLaneRuntime({
    state: mainState, registry: {}, bus, helpers: { scenarioContract },
    flags: { lane: 'worker', warnings: [], sab: false },
    channelFactory: () => ({
      onMessage(fn) { deliver = fn; }, terminate() { worker.shutdown(); },
      post(input) {
        if (input.kind === 'shutdown') return;
        const msg = structuredClone(input);
        Promise.resolve(msg.kind === 'init' ? worker.init(msg) : worker.tick(msg)).then(reply => {
          deliver({ kind: msg.kind === 'init' ? 'ready' : 'tickDone', seq: msg.seq, ...structuredClone(reply) });
          if (msg.kind === 'tick') { const p = finish; finish = null; p?.resolve(); }
        }, error => { deliver({ kind: 'error', seq: msg.seq, message: String(error) }); finish?.reject(error); finish = null; });
      },
    }),
  });
  const tick = () => new Promise((resolve, reject) => { finish = { resolve, reject }; lane.runner.stepOnce(); });
  const adapter = Object.create(lastShiftPrompt), cards = new Map();
  setPromptDeck({ offerDecision: spec => { cards.set(spec.id, spec); return true; }, resolveDecision: id => cards.delete(id) });
  adapter.init({ bus });
  try {
    await lane.readyPromise;
    const owner = worker.host.registry.get('lastShift');
    assert.ok(owner, 'production worker owns lastShift');
    const state = worker.host.state;
    state.mode = 'flight'; state.world.currentSectorId = C.sectorId;
    state.settings.gameplay.physicsBackend = 'legacy';
    const player = worker.host.runtime.spawn({ type: 'ship', isPlayer: true, team: 0, pos: { ...LAST_SHIFT_POS },
      radius: 9, mass: 28, hull: 100, hullMax: 100, data: {} });
    state.playerId = player.id; owner.update(0, state);
    const recorder = owner._find('recorder');
    player.pos.set(recorder.pos.x, 0, recorder.pos.z); owner.inspect(recorder.id);
    const before = owner.serialize();
    worker.host.bus.on('lastShift:readRecovery', () => ownerReads++);
    bus.on('lastShift:offer', row => { received = row; });
    await tick();
    const card = cards.get('last-shift:evidence'); assert.ok(card);
    assert.equal(card.onChoose('recovery'), true);
    await tick();
    assert.equal(ownerReads, 1);
    assert.equal(received.view, 'recovery'); assert.equal(received.recorderRecovery, 'available');
    assert.match(cards.get('last-shift:evidence').headline, /Optional original recovery/);
    assert.deepEqual(owner.serialize().knownClueIds, before.knownClueIds);
    assert.deepEqual(owner.serialize().receipts, before.receipts);
    assert.equal(owner.serialize().recorderReturn, undefined);
    assert.equal(lane.getDiagnostics().unforwardedEmitTypes?.['lastShift:readRecovery'] || 0, 0);
  } finally { adapter.destroy(); setPromptDeck(null); lane.close(); worker.shutdown(); }
});

test('open recovery directions follow tow and berth loss; closed cards stay closed', () => {
  const h = fixture(), p = presenter(h);
  const tick = () => { h.state.simTime += 1; h.system.update(0, h.state); };
  try {
    h.scan('recorder'); p.card().onChoose('recovery'); tick();
    const line = h.tow(); tick(); assert.match(p.card().detail, /on your line/);
    const station = h.dock(); tick();
    // The existing berth offer may switch back to sources; reopen directions.
    p.card().onChoose('recovery'); assert.match(p.card().detail, /meet the return gate/);
    station.pos.x += 1000; tick(); assert.match(p.card().detail, /on your line/);
    assert.ok(!p.card().choices.some(c => c.id === 'return'));
    getCombatKernel(h.system.ctx).attachments.cut(line.id, h.player.id); tick();
    assert.match(p.card().detail, /Optional: tow/);
    p.card().onChoose('leave'); h.tow(); tick(); assert.equal(p.cards.size, 0);
  } finally { p.close(); }
});

test('malformed recovery states never unlock a direction page', () => {
  const h = fixture(), p = presenter(h);
  try {
    h.scan('recorder');
    for (const value of ['toString', '__proto__', 'constructor', {}, ['available'], null]) {
      p.adapter.offer({ ...h.system.readout(), recorderRecovery: value });
      assert.ok(!p.card().choices.some(c => c.id === 'recovery'));
      assert.equal(p.card().detail, h.system.readout().text);
    }
  } finally { p.close(); }
});
test('Back to sources requests fresh state even before an owner update tick', () => {
  const h = fixture(), p = presenter(h);
  try {
    h.scan('recorder'); h.dock(); const line = h.tow(); h.scan('recorder');
    p.card().onChoose('recovery');
    getCombatKernel(h.system.ctx).attachments.cut(line.id, h.player.id);
    p.card().onChoose('back');
    assert.ok(!p.card().choices.some(c => c.id === 'return'));
    assert.equal(p.card().detail, h.system.readout().text);
  } finally { p.close(); }
});
