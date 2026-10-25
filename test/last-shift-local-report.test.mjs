import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { lastShift } from '../src/systems/lastShift.js';
import { LAST_SHIFT as C, LAST_SHIFT_POS, lastShiftLocalReport } from '../src/data/lastShift.js';
import { getCombatKernel } from '../src/combat/kernel.js';
import { generateContacts, getChoices, buildReply } from '../src/ui/station/barContacts.js';

function fixture() {
  const sim = createSimulation({ seed: 18, systems: [lastShift], helpers: { combatPhysics: {
    createAttachment: row => ({ id: row.attachmentId }), cutAttachment: () => true,
  } } });
  const { state } = sim;
  state.mode = 'flight'; state.world.currentSectorId = C.sectorId;
  state.settings.gameplay.physicsBackend = 'legacy';
  const player = sim.spawn({ type: 'ship', isPlayer: true, team: 0, pos: { ...LAST_SHIFT_POS },
    radius: 9, mass: 28, hull: 100, hullMax: 100, data: {} });
  state.playerId = player.id;
  const system = sim.registry.get('lastShift'); system.update(0, state);
  const ctx = { state, bus: sim.bus };
  function host(station = 'station_ceres') {
    return generateContacts(station, state).find(contact => contact.id === 'contact_' + station + '_0');
  }
  function reply(contact = host(), station = 'station_ceres') {
    return buildReply('barkeep', 'last_shift_report', ctx, station, contact);
  }
  function file(ids) {
    for (const id of ids) assert.equal(system.inspect(system._find(id).id).ok, true);
    assert.equal(system.archive().ok, true);
  }
  function returnOriginal(stationId = 'station_ceres') {
    const recorder = system._find('recorder');
    player.pos.set(LAST_SHIFT_POS.x, 0, LAST_SHIFT_POS.z); player.vel.set(0, 0, 0);
    recorder.pos.set(player.pos.x + 20, 0, player.pos.z); recorder.vel.set(0, 0, 0);
    sim.spawn({ type: 'station', team: 2, pos: { x: player.pos.x + 70, z: player.pos.z },
      radius: 80, mass: 1000, hull: 1000, hullMax: 1000, data: { stationId, dockRadius: 80 } });
    const line = getCombatKernel(system.ctx).attachments.create({ defId: 'tether_standard',
      ownerId: player.id, targetId: recorder.id, sourceWorld: player.pos, targetWorld: recorder.pos });
    assert.equal(line.ok, true); assert.equal(system.returnRecorder().ok, true);
  }
  return { sim, state, system, ctx, host, reply, file, returnOriginal };
}
function choices(host) { return getChoices(host.role, host).map(choice => choice.id); }

test('ordinary Ceres host has no public report before explicit filing, even after discovery', () => {
  const h = fixture();
  try {
    assert.equal(lastShiftLocalReport(h.state), null);
    assert.ok(!choices(h.host()).includes('last_shift_report'));
    h.system.inspect(h.system._find('recorder').id);
    assert.equal(lastShiftLocalReport(h.state), null);
    assert.ok(!choices(h.host()).includes('last_shift_report'));
  } finally { h.sim.dispose(); }
});

test('filed one-, two-, and three-source accounts retain exactly the authored certainty', () => {
  for (const ids of [['fairlead'], ['fairlead', 'cargo'], ['fairlead', 'cargo', 'recorder']]) {
    const h = fixture();
    try {
      h.file(ids);
      const text = h.reply().text;
      assert.ok(choices(h.host()).includes('last_shift_report'));
      assert.ok(text.includes(h.system.serialize().receipts.at(-1).text));
      assert.match(text, ids.length === 3 ? /pirate strike is not supported/ : /pirate strike remains an unverified report/);
      assert.equal(lastShiftLocalReport(h.state).recorderReturned, false);
      assert.match(text, /does not confirm a physical recorder handoff/);
    } finally { h.sim.dispose(); }
  }
});

test('newly read clues do not silently revise the filed local report', () => {
  const h = fixture();
  try {
    h.file(['fairlead']); const before = h.reply().text;
    h.system.inspect(h.system._find('cargo').id); h.system.inspect(h.system._find('recorder').id);
    assert.equal(h.reply().text, before);
    h.system.archive();
    assert.match(h.reply().text, /pirate strike is not supported/);
  } finally { h.sim.dispose(); }
});

test('new report choice preserves the same host, greetings and preexisting choices', () => {
  const h = fixture();
  try {
    const before = h.host(), priorChoices = getChoices(before.role, before);
    h.file(['fairlead']); const after = h.host();
    assert.equal(after.id, before.id); assert.equal(after.name, before.name);
    assert.equal(after.line, before.line); assert.equal(after.approach, before.approach);
    assert.deepEqual(getChoices(after.role, after).slice(0, -1), priorChoices);
    for (const id of ['rumors', 'word', 'drink']) {
      assert.deepEqual(buildReply('barkeep', id, h.ctx, 'station_ceres', after),
        buildReply('barkeep', id, h.ctx, 'station_ceres', before));
    }
  } finally { h.sim.dispose(); }
});

test('Ceres-only report does not alter Helios, Belt Outpost or authored contacts', () => {
  const h = fixture();
  try {
    const before = ['station_helios', 'station_beltout'].map(id => generateContacts(id, h.state));
    h.file(['fairlead']);
    assert.deepEqual(['station_helios', 'station_beltout'].map(id => generateContacts(id, h.state)), before);
    assert.doesNotMatch(h.reply({ id: 'contact_halev_doss', role: 'barkeep' }).text, /filed account says/);
    assert.doesNotMatch(h.reply(h.host(), 'station_beltout').text, /filed account says/);
  } finally { h.sim.dispose(); }
});

test('a stale choice is revalidated against the current filed record', () => {
  const h = fixture();
  try {
    h.file(['fairlead']); const contact = h.host();
    h.state.world.lastShift.receipts = [];
    assert.match(h.reply(contact).text, /No verified Last Shift report/);
    assert.ok(!choices(h.host()).includes('last_shift_report'));
  } finally { h.sim.dispose(); }
});

test('returning an original is distinct from filing and identifies the actual receiving archive', () => {
  for (const stationId of ['station_ceres', 'station_helios']) {
    const h = fixture();
    try {
      h.returnOriginal(stationId);
      assert.equal(lastShiftLocalReport(h.state), null);
      assert.ok(!choices(h.host()).includes('last_shift_report'));
      h.system.archive();
      const report = lastShiftLocalReport(h.state);
      assert.equal(report.recorderReturned, true); assert.equal(report.recorderStationId, stationId);
      assert.match(h.reply().text, stationId === 'station_ceres'
        ? /accepted by this refinery's archive/ : /accepted by another archive, not this refinery/);
      assert.match(h.reply().text, /pirate strike remains an unverified report/);
    } finally { h.sim.dispose(); }
  }
});

test('physical return cannot upgrade a previously filed partial account', () => {
  const h = fixture();
  try {
    h.file(['fairlead']); const filed = h.system.serialize().receipts.at(-1).text;
    h.returnOriginal();
    assert.equal(lastShiftLocalReport(h.state).text, filed);
    assert.equal(lastShiftLocalReport(h.state).recorderReturned, true);
    assert.match(h.reply().text, /final sequence remains incomplete/);
  } finally { h.sim.dispose(); }
});

test('repeated conversations and serialized restoration preserve the report without rewards or new receipts', () => {
  const h = fixture();
  try {
    h.file(['fairlead', 'cargo', 'recorder']); h.returnOriginal();
    const saved = h.system.serialize(), before = h.reply().text, payments = [];
    for (const event of ['economy:grant', 'cargo:add', 'cargo:persistentAdded', 'mission:completed']) {
      h.sim.bus.on(event, p => payments.push({ event, p }));
    }
    for (let visit = 0; visit < 3; visit++) {
      h.state.simTime += 1800;
      h.system.deserialize(JSON.parse(JSON.stringify(saved))); h.system.afterContinue();
      h.sim.bus.emit('sector:enter');
      const restored = h.system.serialize();
      assert.deepEqual(restored.receipts, saved.receipts);
      assert.deepEqual(restored.recorderReturn, saved.recorderReturn);
      assert.deepEqual(restored.knownClueIds, saved.knownClueIds);
      assert.equal(restored.bodies.recorder.status, 'returned');
      assert.deepEqual(restored.bodies.recorder.remainingPool, { cmdty_salvage_electronics: 0 },
        'restore normalizes the empty returned pool to its explicit zero commodity, never replenishes it');
      assert.equal(h.reply().text, before);
      assert.equal(choices(h.host()).filter(id => id === 'last_shift_report').length, 1);
      assert.deepEqual(h.system.serialize(), restored, 'conversation does not mutate the normalized restored record');
    }
    assert.deepEqual(payments, []);
  } finally { h.sim.dispose(); }
});

test('unread destroyed sources stay unknown in a partial local record', () => {
  const h = fixture();
  try {
    h.system.inspect(h.system._find('fairlead').id);
    const recorder = h.system._find('recorder');
    h.sim.bus.emit('entity:killed', { id: recorder.id }); recorder.alive = false;
    h.system.archive();
    assert.match(h.reply().text, /Unread sources lost: recorder/);
    assert.match(h.reply().text, /final sequence remains incomplete/);
    assert.doesNotMatch(h.reply().text, /accepted by/);
  } finally { h.sim.dispose(); }
});

test('invalid or future archive receipts cannot become public local findings', () => {
  const h = fixture();
  try {
    h.file(['fairlead']); const valid = h.system.serialize();
    for (const corrupt of [
      row => { row.receipts.at(-1).id = 'other'; },
      row => { row.receipts.at(-1).text = 'The pirates did it.'; },
      row => { row.receipts.at(-1).clueIds = ['recorder']; },
      row => { row.receipts.at(-1).at = -1; },
      row => { row.revision = 0; },
      row => { row.receipts.at(-1).destroyedClueIds = {}; },
      row => { row.receipts.at(-1).destroyedClueIds = 'recorder'; },
      row => { row.receipts.at(-1).destroyedClueIds = ['recorder', 'recorder']; },
      row => { row.receipts.at(-1).destroyedClueIds = ['unknown']; },
    ]) {
      h.state.world.lastShift = JSON.parse(JSON.stringify(valid)); corrupt(h.state.world.lastShift);
      assert.equal(lastShiftLocalReport(h.state), null);
      assert.ok(!choices(h.host()).includes('last_shift_report'));
    }
  } finally { h.sim.dispose(); }
});

test('physical return copy requires independent matching receipt and terminal body state', () => {
  const h = fixture();
  try {
    h.file(['recorder']); h.returnOriginal(); const valid = h.system.serialize();
    for (const corrupt of [
      row => { delete row.recorderReturn; },
      row => { row.recorderReturn.id = 'wrong'; },
      row => { row.recorderReturn.bodyKey = 'wrong'; },
      row => { row.recorderReturn.at = -1; },
      row => { row.recorderReturn.stationId = ''; },
      row => { row.bodies.recorder.status = 'live'; },
    ]) {
      h.state.world.lastShift = JSON.parse(JSON.stringify(valid)); corrupt(h.state.world.lastShift);
      assert.equal(lastShiftLocalReport(h.state).recorderReturned, false);
      assert.doesNotMatch(h.reply().text, /accepted by/);
    }
  } finally { h.sim.dispose(); }
});

test('a valid filed loss list keeps its order-insensitive meaning after Continue', () => {
  const h = fixture();
  try {
    h.system.inspect(h.system._find('fairlead').id);
    for (const id of ['cargo', 'recorder']) {
      const body = h.system._find(id);
      h.sim.bus.emit('entity:killed', { id: body.id }); body.alive = false;
    }
    h.system.archive();
    const saved = h.system.serialize(), originalText = saved.receipts.at(-1).text;
    saved.receipts.at(-1).destroyedClueIds.reverse();
    h.system.deserialize(JSON.parse(JSON.stringify(saved))); h.system.afterContinue();
    assert.deepEqual(h.system.serialize().receipts.at(-1).destroyedClueIds, ['recorder', 'cargo']);
    assert.equal(lastShiftLocalReport(h.state).text, originalText);
    assert.ok(choices(h.host()).includes('last_shift_report'));
    assert.ok(h.reply().text.includes(originalText));
  } finally { h.sim.dispose(); }
});
