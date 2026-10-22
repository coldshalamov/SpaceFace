import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { lastShift } from '../src/systems/lastShift.js';
import { LAST_SHIFT as C, LAST_SHIFT_POS, LAST_SHIFT_CLUES, lastShiftReport } from '../src/data/lastShift.js';
import { dossArchiveEvidence, dossArchiveComplete } from '../src/data/dossArchive.js';
import { getCombatKernel } from '../src/combat/kernel.js';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import { lastShiftPrompt } from '../src/ui/lastShiftPrompt.js';
import { setPromptDeck } from '../src/ui/promptDeck.js';
import { createChronicler } from '../src/systems/chronicler.js';
import { save } from '../src/save/saveSystem.js';
import { world } from '../src/systems/world.js';
import { resolveCollisionProxyManifest, resolveDockAnchor } from '../src/data/collisionProxyManifests.js';
import { resetFreshRunSystems } from '../src/core/runReset.js';

function fixture(native = null, cuePresenter = true) {
  const sim = createSimulation({ seed: 18, systems: [lastShift], helpers: {
    combatPhysics: native || { createAttachment: row => ({ id: row.attachmentId }), cutAttachment: () => true },
  } });
  const { state } = sim; state.mode = 'flight'; state.world.currentSectorId = C.sectorId;
  if (!native) state.settings.gameplay.physicsBackend = 'legacy';
  const player = sim.spawn({ type: 'ship', isPlayer: true, team: 0, pos: { ...LAST_SHIFT_POS },
    radius: 9, mass: 28, hull: 100, hullMax: 100, data: {} });
  state.playerId = player.id;
  // Headless presentation seam: production admission is tested separately below.
  if (cuePresenter) sim.bus.on('lastShift:cue', row => {
    sim.bus.emit('toast', { text: row.text }); sim.bus.emit('lastShift:cueSurfaced', { id: row.id });
  });
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
const orders = [ ['fairlead', 'cargo', 'recorder'], ['fairlead', 'recorder', 'cargo'],
  ['cargo', 'fairlead', 'recorder'], ['cargo', 'recorder', 'fairlead'],
  ['recorder', 'fairlead', 'cargo'], ['recorder', 'cargo', 'fairlead'] ];
for (const order of orders) test(`independent physical sources recover in order ${order.join('/')}`, () => {
  const h = fixture();
  try {
    assert.equal(h.state.entities.size, 4);
    assert.equal(h.system.archive().reason, 'no_evidence');
    for (let i = 0; i < order.length; i++) {
      h.scan(order[i]); assert.equal(h.system.readout().clueIds.length, i + 1);
      if (i < 2) assert.match(h.system.readout().text, /final sequence remains incomplete/);
    }
    assert.deepEqual(h.system.readout().clueIds, ['fairlead', 'cargo', 'recorder']);
    assert.match(h.system.readout().text, /deliberate cargo release to save/);
    const result = h.system.archive(); assert.equal(result.ok, true);
    assert.equal(result.receipt.text, lastShiftReport(['fairlead', 'cargo', 'recorder']));
  } finally { h.sim.dispose(); }
});
for (const lost of ['fairlead', 'cargo', 'recorder']) test(`unread ${lost} loss stays unknown while a partial archive remains accessible`, () => {
  const h = fixture();
  try {
    const e = h.sources[lost]; e.alive = false;
    h.sim.bus.emit('entity:killed', { id: e.id });
    for (const c of LAST_SHIFT_CLUES) if (c.id !== lost) h.scan(c.id);
    const archive = h.system.archive();
    assert.equal(archive.ok, true); assert.equal(archive.receipt.clueIds.includes(lost), false);
    assert.match(archive.receipt.text, /final sequence remains incomplete/);
    assert.match(archive.receipt.text, /Unread sources lost/);
    h.state.simTime = 2; h.system.update(1 / 60, h.state);
    assert.equal(h.system._find(lost), null, 'terminal source never refills');
  } finally { h.sim.dispose(); }
});
test('read facts survive stripping; commodity salvage and publication never add a story payout', () => {
  const h = fixture(); const pays = [];
  try {
    for (const event of ['economy:grant', 'cargo:add', 'cargo:persistentAdded', 'mission:completed']) h.sim.bus.on(event, p => pays.push(p));
    h.scan('cargo'); const cargo = h.sources.cargo;
    h.sim.bus.emit('salvage:completed', { wreckId: cargo.id }); cargo.data._salvaged = true; cargo.alive = false;
    const first = h.system.archive(), second = h.system.archive();
    assert.equal(first.ok, true); assert.equal(second.duplicate, true);
    assert.equal(h.system.serialize().receipts.length, 1); assert.deepEqual(pays, []);
    assert.deepEqual(h.system.readout().clueIds, ['cargo']);
    assert.equal(dossArchiveEvidence(h.state).at(-1).id, 'ceres_last_shift');
    assert.equal(dossArchiveComplete(h.state), false, 'optional microstory cannot replace the existing three-source unlock');
  } finally { h.sim.dispose(); }
});
test('a held recorder scans without identity change and returns through the canonical rope only once', async () => {
  const native = await createSg02DynamicBodyOwner({ ready: true }); const h = fixture(native);
  try {
    const recorder = h.sources.recorder; h.dock(); const line = h.tow();
    const id = recorder.id, life = recorder.occupantGeneration;
    h.scan('recorder'); assert.equal(recorder.id, id); assert.equal(recorder.occupantGeneration, life);
    assert.equal(line.state, 'active'); assert.ok(native.exportWorldSnapshot().attachmentOrder.length >= 1);
    const accepted = h.system.returnRecorder(); assert.equal(accepted.ok, true, accepted.reason);
    assert.equal(line.state, 'broken'); assert.equal(recorder.alive, false);
    assert.equal(h.system.returnRecorder().ok, false);
    assert.equal(h.system.serialize().bodies.recorder.status, 'returned');
    assert.equal(h.system.serialize().recorderReturn.stationId, 'station_test_archive');
  } finally { h.sim.dispose(); native.dispose(); }
});
test('receiver range, current custody and release all revalidate before recorder acceptance', () => {
  const h = fixture();
  try {
    assert.equal(h.system.returnRecorder().reason, 'receiver_range');
    h.dock(); assert.equal(h.system.returnRecorder().reason, 'tow_required');
    const line = h.tow(); h.sources.recorder.data.persistenceOwner = 'another_owner';
    assert.equal(h.system.returnRecorder().ok, false); assert.equal(line.state, 'active');
    h.sources.recorder.data.persistenceOwner = C.persistenceOwner;
    getCombatKernel(h.system.ctx).attachments.cut(line.id, h.player.id);
    assert.equal(h.system.returnRecorder().reason, 'tow_required');
  } finally { h.sim.dispose(); }
});
test('Continue cannot return a semantic line before its real native attachment exists', async () => {
  const native = await createSg02DynamicBodyOwner({ ready: true }); const h = fixture(native);
  try {
    h.dock(); const line = h.tow();
    assert.equal(native.cutAttachment({ attachmentId: line.id, reason: 'restore_pending' }), true);
    assert.equal(line.state, 'active');
    const pending = h.system.returnRecorder();
    assert.equal(pending.reason, 'native_custody_pending');
    assert.equal(h.sources.recorder.alive, true); assert.equal(h.system.serialize().recorderReturn, undefined);
    const attachments = getCombatKernel(h.system.ctx).attachments;
    attachments.reconcilePhysics();
    assert.ok(native.getAttachmentTelemetry({ attachmentId: line.id }));
    assert.equal(h.system.returnRecorder().ok, true);
  } finally { h.sim.dispose(); native.dispose(); }
});
test('a presentation callback cannot recursively accept or move a stale recorder into custody', () => {
  const h = fixture();
  try {
    h.dock(); h.tow(); let recursive = null;
    h.sim.bus.on('lastShift:offer', () => {
      recursive = h.system.returnRecorder(); h.sources.recorder.pos.x += 1000;
    });
    assert.equal(h.system.returnRecorder().ok, false);
    assert.equal(recursive.reason, 'return_pending');
    assert.equal(h.system.serialize().recorderReturn, undefined);
    assert.equal(h.sources.recorder.alive, true);
  } finally { h.sim.dispose(); }
});
test('Continue rebinds semantic bodies once; stale destroyed receipts cannot erase a new occupant', () => {
  const h = fixture();
  try {
    h.scan('fairlead'); const first = h.system.archive();
    const saved = h.system.serialize(), old = h.sources.recorder;
    h.sim.bus.emit('save:restoring');
    h.sim.helpers.removeEntity(old.id, { immediate: true });
    const restored = h.sim.spawn({ ...old, id: undefined, alive: true, flags: { persistent: true },
      data: { ...old.data }, pos: { ...old.pos } });
    h.system.deserialize(saved); h.sim.bus.emit('save:loaded'); h.sim.bus.flush();
    h.state.simTime = 2; h.system.update(1 / 60, h.state);
    assert.equal(h.system._find('recorder'), restored);
    assert.equal([...h.state.entities.values()].filter(e => e.alive && e.data?.lastShiftClueId === 'recorder').length, 1);
    assert.equal(h.system.serialize().bodies.recorder.status, 'live');
    assert.equal(h.system.archive().receipt.id, first.receipt.id);
    assert.equal(h.system.archive().duplicate, true);
  } finally { h.sim.dispose(); }
});
test('actual cold and repeated Continue preserve the original recorder, finite salvage and filed evidence', async () => {
  const sourceNative = await createSg02DynamicBodyOwner({ ready: true }), source = fixture(sourceNative);
  const native = await createSg02DynamicBodyOwner({ ready: true });
  const destination = createSimulation({ seed: 18, systems: [world, lastShift, save], helpers: { combatPhysics: native } });
  try {
    source.scan('cargo'); source.sources.cargo.data.salvagePool.cmdty_ore_bronzium = 2;
    source.scan('recorder'); const filed = source.system.archive(); source.system.beginRecovery(); source.dock(); const line = source.tow();
    const sourceSaver = Object.assign(Object.create(save), { state: source.state, bus: source.sim.bus,
      helpers: source.sim.helpers, registry: source.sim.registry });
    let data = sourceSaver.serializeData();
    assert.equal(data.lastShift.receipts[0].id, filed.receipt.id);
    assert.equal(data.entities.persistent.filter(e => e.data?.lastShiftSiteId === C.siteId).length, 3);
    const saver = destination.registry.get('save'), system = destination.registry.get('lastShift');
    let previous = source.sources.recorder;
    for (let pass = 0; pass < 2; pass++) {
      assert.equal(saver._restore(JSON.parse(JSON.stringify(data)), 'quick').restored, true);
      const recorder = system._find('recorder'), player = destination.state.entities.get(destination.state.playerId);
      assert.ok(recorder); assert.notEqual(recorder, previous);
      assert.equal(system.readout().recoveryActive, true, 'explicit recovery intent survives actual cold Continue');
      if (pass > 0) assert.notEqual(recorder.occupantGeneration, previous.occupantGeneration);
      assert.equal([...destination.state.entities.values()].filter(e => e.alive && e.data?.lastShiftSiteId === C.siteId).length, 3);
      assert.equal(system._find('cargo').data.salvagePool.cmdty_ore_bronzium, 2);
      assert.equal(system.archive().receipt.id, filed.receipt.id); assert.equal(system.serialize().receipts.length, 1);
      const resumed = destination.state.combat.attachments.byId[line.id];
      assert.equal(resumed.targetId, recorder.id); assert.equal(resumed.ownerId, player.id);
      player.pos.set(LAST_SHIFT_POS.x, 0, LAST_SHIFT_POS.z); player.vel.set(0, 0, 0);
      recorder.pos.set(player.pos.x + 20, 0, player.pos.z); recorder.vel.set(0, 0, 0);
      destination.spawn({ type: 'station', team: 2, pos: { x: player.pos.x + 70, z: player.pos.z },
        radius: 80, hull: 1000, hullMax: 1000, mass: 1000, data: { stationId: 'station_test_archive', dockRadius: 80 } });
      const attachments = getCombatKernel(system.ctx).attachments;
      recorder.physicsBody = false; native.syncFromEntities(destination.state.entityList);
      assert.ok(attachments.reconcilePhysics().pending > 0);
      assert.equal(system.returnRecorder().reason, 'native_custody_pending'); assert.equal(recorder.alive, true);
      recorder.physicsBody = data.entities.persistent.find(e => e.data?.lastShiftClueId === 'recorder').physicsBody;
      native.syncFromEntities(destination.state.entityList);
      assert.equal(attachments.reconcilePhysics().recreated, 1);
      assert.equal(system.readout().canReturnRecorder, true);
      previous = recorder; data = saver.serializeData(); native.syncFromEntities([]);
    }
    native.syncFromEntities(destination.state.entityList); getCombatKernel(system.ctx).attachments.reconcilePhysics();
    assert.equal(system.returnRecorder().ok, true);
    const accepted = saver.serializeData();
    assert.equal(accepted.lastShift.recoveryActive, false);
    assert.equal(saver._restore(JSON.parse(JSON.stringify(accepted)), 'quick').restored, true);
    destination.state.mode = 'flight'; system.update(1 / 60, destination.state);
    assert.equal(system._find('recorder'), null); assert.equal(system.serialize().bodies.recorder.status, 'returned');
    resetFreshRunSystems(destination.registry);
    assert.equal(system.serialize().receipts.length, 0); assert.equal(system.serialize().recorderReturn, undefined);
    destination.state.mode = 'flight'; destination.state.world.currentSectorId = C.sectorId;
    system.update(1 / 60, destination.state);
    assert.equal([...destination.state.entities.values()].filter(e => e.alive && e.data?.lastShiftSiteId === C.siteId).length, 3);
  } finally { destination.dispose(); native.dispose(); source.sim.dispose(); sourceNative.dispose(); }
});
test('death is captured before rematerialization even when core removal has not flushed', () => {
  const h = fixture();
  try {
    h.sources.recorder.alive = false; h.state.simTime = 1;
    h.system.update(1 / 60, h.state);
    assert.equal(h.system.serialize().bodies.recorder.status, 'destroyed');
    assert.equal([...h.state.entities.values()].filter(e => e.alive && e.data?.lastShiftClueId === 'recorder').length, 0);
  } finally { h.sim.dispose(); }
});
test('the reachable decision offers only current evidence; stale filing refreshes and repeat filing has visible feedback', () => {
  const cards = new Map(), toasts = [];
  setPromptDeck({ offerDecision: spec => { cards.set(spec.id, spec); return true; }, resolveDecision: id => cards.delete(id) });
  const h = fixture(), adapter = Object.create(lastShiftPrompt); adapter.init(h.system.ctx);
  try {
    h.sim.bus.on('toast', p => toasts.push(p.text));
    h.scan('fairlead'); const first = cards.get('last-shift:evidence');
    assert.deepEqual(first.choices.map(c => c.id), ['archive', 'leave']);
    assert.match(first.detail, /Unknown: released ore rack, tug recorder/);
    h.scan('cargo'); first.onChoose('archive');
    assert.equal(h.system.serialize().receipts.length, 0);
    assert.ok(cards.has('last-shift:evidence'), 'refused stale click refreshes rather than closes the current register');
    cards.get('last-shift:evidence').onChoose('archive');
    assert.equal(h.system.serialize().receipts.length, 1); assert.equal(cards.size, 0);
    h.scan('fairlead'); cards.get('last-shift:evidence').onChoose('archive');
    assert.equal(h.system.serialize().receipts.length, 1); assert.match(toasts.at(-1), /already filed/);
    h.dock(); h.tow(); h.scan('recorder');
    assert.ok(cards.get('last-shift:evidence').choices.some(c => c.id === 'return'));
    cards.get('last-shift:evidence').onChoose('return');
    assert.equal(h.system.serialize().bodies.recorder.status, 'returned');
  } finally { adapter.destroy(); h.sim.dispose(); setPromptDeck(null); }
});
test('Chronicler receives an explicit filed report once and preserves its exact receipt citation', () => {
  const h = fixture(), chronicler = createChronicler({ publishNews: false, offerRadio: false });
  chronicler.init(h.system.ctx);
  try {
    h.scan('fairlead'); assert.equal(h.state.chronicler.pending.length, 0);
    const report = h.system.archive(); h.system.archive();
    assert.equal(h.state.chronicler.pending.length, 1);
    const fact = h.state.chronicler.pending[0];
    assert.equal(fact.externalId, report.receipt.id);
    assert.match(fact.details.note, /1\/3 sources filed; final sequence remains incomplete/);
    assert.ok(fact.provides.some(ref => ref.kind === 'receipt' && ref.id === report.receipt.id));
  } finally { chronicler.destroy(); h.sim.dispose(); }
});

test('ordinary approach surfaces an optional site once without inventing evidence or an objective', () => {
  const h = fixture(), toasts = [], courses = [], offers = [];
  try {
    h.system.newGame(); h.sim.bus.on('toast', p => toasts.push(p.text));
    h.sim.bus.on('ui:setCourse', p => courses.push(p)); h.sim.bus.on('lastShift:offer', p => offers.push(p));
    h.player.pos.x = LAST_SHIFT_POS.x + C.discoveryRangeWu + 1;
    h.state.simTime = 1; h.system.update(0.25, h.state);
    assert.equal(toasts.length, 0);
    h.player.pos.x = LAST_SHIFT_POS.x + C.discoveryRangeWu - 1;
    h.state.simTime = 2; h.system.update(0.25, h.state);
    assert.equal(toasts.length, 1); assert.match(toasts[0], /optional/i);
    assert.doesNotMatch(toasts[0], /pirate|deliberate|save the tug|lateral load/i);
    assert.equal(h.system.serialize().surfaced, true);
    assert.equal(h.system.serialize().discovered, false);
    assert.deepEqual(h.system.readout().clueIds, []); assert.equal(h.system.archive().ok, false);
    const snapshot = h.system.serialize(); h.system.deserialize(snapshot); h.system.afterContinue();
    h.state.simTime = 3; h.system.update(0.25, h.state);
    assert.equal(toasts.length, 1); assert.deepEqual(courses, []); assert.deepEqual(offers, []);
  } finally { h.sim.dispose(); }
});

test('revisit speaks only the actual filed revision, once, not later unread or unfiled facts', () => {
  const h = fixture(), toasts = [];
  try {
    h.scan('fairlead'); const receipt = h.system.archive().receipt; h.scan('recorder');
    h.sim.bus.on('toast', p => toasts.push(p.text));
    h.sim.bus.emit('sector:exit', { sectorId: C.sectorId }); h.sim.bus.emit('sector:enter', { sectorId: C.sectorId });
    h.state.simTime = 2; h.system.update(0.25, h.state);
    assert.equal(toasts.length, 1); assert.match(toasts[0], /1\/3 sources filed/);
    assert.match(toasts[0], /filed sequence remains incomplete/); assert.doesNotMatch(toasts[0], /Tug log|cargo release to save/);
    const snapshot = h.system.serialize(); h.system.deserialize(snapshot); h.system.afterContinue();
    h.state.simTime = 3; h.system.update(0.25, h.state); assert.equal(toasts.length, 1);
  } finally { h.sim.dispose(); }
});

test('optional recovery guidance is physical, persisted and cleared on cancellation or recorder loss', () => {
  const h = fixture();
  try {
    assert.equal(h.system.beginRecovery().ok, false, 'no recovery spoiler before evidence');
    h.scan('recorder'); assert.equal(h.system.readout().canRecoverRecorder, true);
    assert.equal(h.system.beginRecovery().ok, true);
    assert.match(h.system.readout().recoveryGuidance, /no live archive berth/i);
    const station = h.dock(); station.data.name = 'Test Archive';
    assert.match(h.system.readout().recoveryGuidance, /Test Archive/);
    assert.match(h.system.readout().recoveryGuidance, /original recorder.*line/i);
    const snapshot = h.system.serialize(); h.system.deserialize(snapshot); h.system.afterContinue();
    assert.equal(h.system.readout().recoveryActive, true);
    h.system.cancelRecovery(); assert.equal(h.system.readout().recoveryGuidance, null);
    h.system.beginRecovery(); h.sources.recorder.alive = false;
    h.sim.bus.emit('entity:killed', { id: h.sources.recorder.id });
    assert.equal(h.system.readout().recoveryActive, false);
    assert.equal(h.system.readout().recoveryGuidance, null);
    assert.equal(h.system.readout().canRecoverRecorder, false);
  } finally { h.sim.dispose(); }
});

test('recovery prompt makes a choice without starting autopilot and retires guidance after original return', () => {
  const cards = new Map(), courses = [];
  setPromptDeck({ offerDecision: spec => { cards.set(spec.id, spec); return true; }, resolveDecision: id => cards.delete(id) });
  const h = fixture(), adapter = Object.create(lastShiftPrompt); adapter.init(h.system.ctx);
  try {
    h.sim.bus.on('ui:setCourse', p => courses.push(p)); h.scan('recorder');
    assert.ok(cards.get('last-shift:evidence').choices.some(c => c.id === 'recover'));
    cards.get('last-shift:evidence').onChoose('recover');
    assert.equal(h.system.readout().recoveryActive, true); assert.deepEqual(courses, []);
    assert.match(cards.get('last-shift:evidence').detail, /no live archive berth/i);
    cards.get('last-shift:evidence').onChoose('sources');
    assert.match(cards.get('last-shift:evidence').detail, /Tug log/);
    assert.doesNotMatch(cards.get('last-shift:evidence').detail, /no live archive berth/i);
    cards.get('last-shift:evidence').onChoose('guidance');
    assert.match(cards.get('last-shift:evidence').detail, /no live archive berth/i);
    assert.doesNotMatch(cards.get('last-shift:evidence').detail, /Tug log/);
    cards.get('last-shift:evidence').onChoose('leave');
    h.state.simTime = 1; h.system.update(0.25, h.state);
    assert.equal(cards.size, 0, 'ignoring guidance does not reopen the decision every tick');
    h.dock(); h.tow(); h.scan('recorder'); cards.get('last-shift:evidence').onChoose('return');
    assert.equal(h.system.readout().recoveryGuidance, null);
    assert.equal(h.system.readout().recoveryActive, false);
    assert.doesNotMatch(cards.get('last-shift:evidence').detail, /reel|no live archive berth/i);
  } finally { adapter.destroy(); h.sim.dispose(); setPromptDeck(null); }
});


test('approach remains pending without a receipt surface and retries after combat quiet', () => {
  const h = fixture(null, false), adapter = Object.create(lastShiftPrompt); adapter.init(h.system.ctx);
  const priorDocument = globalThis.document; const toasts = [];
  try {
    h.sim.bus.on('toast', p => toasts.push(p));
    assert.equal(h.system.serialize().surfaced, false);
    const nodes = [];
    globalThis.document = { getElementById: () => ({ querySelectorAll: () => nodes }), body: { dataset: { sfHudJob: 'fight' } } };
    h.state.simTime = 6; h.system.update(0.25, h.state);
    assert.equal(h.system.serialize().surfaced, false); assert.equal(toasts.length, 0);
    document.body.dataset.sfHudJob = 'mine';
    h.state.simTime = 12; h.system.update(0.25, h.state);
    assert.equal(h.system.serialize().surfaced, false, 'an existing root without a real receipt consumer is not admission');
    h.sim.bus.on('toast', row => nodes.push({ isConnected: true, textContent: row.text }));
    h.state.simTime = 18; h.system.update(0.25, h.state);
    assert.equal(h.system.serialize().surfaced, true); assert.equal(toasts.length, 2);
    h.state.simTime = 24; h.system.update(0.25, h.state); assert.equal(toasts.length, 2);
  } finally { globalThis.document = priorDocument; adapter.destroy(); h.sim.dispose(); }
});

test('older records keep read evidence without fabricating recovery intent or a revisit receipt', () => {
  const h = fixture();
  try {
    h.scan('fairlead'); const saved = h.system.serialize();
    delete saved.surfaced; delete saved.recoveryActive; delete saved.lastRevisitReceiptId;
    h.system.deserialize(saved);
    assert.equal(h.system.serialize().surfaced, true);
    assert.equal(h.system.readout().recoveryActive, false);
    assert.equal(h.system.serialize().lastRevisitReceiptId, null);
    assert.deepEqual(h.system.readout().clueIds, ['fairlead']);
  } finally { h.sim.dispose(); }
});


test('guidance resolves the real authored slow berth and refreshes a vanished destination without stealing a course', () => {
  const h = fixture(), offers = [], courses = [];
  try {
    h.scan('recorder');
    const station = h.dock(); station.data.stationId = 'station_ceres'; station.data.name = 'Ceres';
    const anchor = resolveDockAnchor(station, resolveCollisionProxyManifest(station), h.player);
    assert.ok(anchor); assert.notDeepEqual({ x: anchor.x, z: anchor.z }, { x: station.pos.x, z: station.pos.z });
    h.sim.bus.on('lastShift:offer', p => offers.push(p)); h.sim.bus.on('ui:setCourse', p => courses.push(p));
    h.system.beginRecovery();
    assert.ok(h.system.readout().recoveryGuidance.includes(`${Math.round(Math.hypot(anchor.x - h.player.pos.x, anchor.z - h.player.pos.z))} WU`));
    assert.match(h.system.readout().recoveryGuidance, /bearing [0-9]+°/);
    assert.ok(h.system.readout().recoveryGuidance.includes(`${anchor.speedGate} WU/s`));
    h.state.simTime = 1; h.system.update(0.25, h.state);
    const before = offers.length; station.alive = false;
    h.state.simTime = 2; h.system.update(0.25, h.state);
    assert.equal(offers.length, before + 1); assert.match(offers.at(-1).recoveryGuidance, /No live archive berth/);
    assert.doesNotMatch(offers.at(-1).recoveryGuidance, /Ceres:/);
    h.state.simTime = 3; h.system.update(0.25, h.state); assert.equal(offers.length, before + 1);
    assert.deepEqual(courses, []);
  } finally { h.sim.dispose(); }
});


test('a revisited exhausted site never directs the pilot to scan a nonexistent source', () => {
  const h = fixture(), toasts = [];
  try {
    for (const clue of LAST_SHIFT_CLUES) h.scan(clue.id);
    for (const source of Object.values(h.sources)) {
      source.alive = false; h.sim.bus.emit('entity:killed', { id: source.id });
    }
    h.system.archive(); h.sim.bus.on('toast', row => toasts.push(row.text));
    h.sim.bus.emit('sector:enter', { sectorId: C.sectorId });
    h.state.simTime = 1; h.system.update(0.25, h.state);
    assert.equal(toasts.length, 1); assert.match(toasts[0], /3\/3 sources filed/);
    assert.doesNotMatch(toasts[0], /select|scan/i); assert.match(toasts[0], /filed evidence is unchanged/);
  } finally { h.sim.dispose(); }
});

test('approach cue gives the real site bearing and range from opposite approaches without a course', () => {
  for (const [dx, dz, bearing, rot] of [[-900, 0, 90, 0.7], [900, 0, 270, -2.4], [0, -900, 180, 1.2], [0, 900, 0, -0.8]]) {
    const h = fixture(), toasts = [], courses = [];
    try {
      h.system.newGame();
      h.sim.bus.on('toast', row => toasts.push(row.text)); h.sim.bus.on('ui:setCourse', row => courses.push(row));
      h.player.pos.set(LAST_SHIFT_POS.x + dx, 0, LAST_SHIFT_POS.z + dz); h.player.rot = rot;
      h.state.simTime = 1; h.system.update(0.25, h.state);
      assert.equal(toasts.length, 1);
      assert.ok(toasts[0].includes(`bearing ${bearing}°, 900 WU`), toasts[0]);
      assert.ok(toasts[0].split(/\s+/).length <= 35, 'arrival cue stays a short receipt');
      assert.doesNotMatch(toasts[0], /pirate|deliberate|cargo release|lateral load/i);
      assert.deepEqual(h.system.readout().clueIds, []); assert.deepEqual(courses, []);
      assert.equal(h.system.serialize().surfaced, true);
    } finally { h.sim.dispose(); }
  }
});
