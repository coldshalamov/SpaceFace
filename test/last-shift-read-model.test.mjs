import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { createGameState } from '../src/core/gameState.js';
import { getCombatKernel } from '../src/combat/kernel.js';
import { lastShift } from '../src/systems/lastShift.js';
import { LAST_SHIFT as C, LAST_SHIFT_POS } from '../src/data/lastShift.js';
import { generateContacts, getChoices, buildReply } from '../src/ui/station/barContacts.js';
import { createDomainDiffer, applyDomainPathUpdate } from '../scripts/lib/simReadModel.mjs';

function fixture(t) {
  const sim = createSimulation({ seed: 18, systems: [lastShift], helpers: { combatPhysics: {
    createAttachment: row => ({ id: row.attachmentId }), cutAttachment: () => true,
  } } });
  t.after(() => sim.dispose());
  const state = sim.state, main = createGameState(18), differ = createDomainDiffer();
  state.mode = 'flight'; state.world.currentSectorId = C.sectorId;
  state.settings.gameplay.physicsBackend = 'legacy';
  const player = sim.spawn({ type: 'ship', isPlayer: true, team: 0, pos: { ...LAST_SHIFT_POS },
    radius: 9, mass: 28, hull: 100, hullMax: 100, data: {} });
  state.playerId = player.id;
  const owner = sim.registry.get('lastShift'); owner.update(0, state);
  const read = () => {
    const contact = generateContacts('station_ceres', main).find(c => c.id === 'contact_station_ceres_0');
    return { contact, choices: getChoices(contact.role, contact).map(c => c.id),
      reply: buildReply('barkeep', 'last_shift_report', { state: main, bus: sim.bus }, 'station_ceres', contact).text };
  };
  let tick = 0;
  const ship = () => {
    const updates = JSON.parse(JSON.stringify(differ.diff(state, tick++).updates));
    for (const update of updates) {
      const segs = update.segs.length === 1 && update.segs[0].includes('.') ? update.segs[0].split('.') : update.segs;
      const domains = new Map([[segs[0], main[segs[0]]]]);
      applyDomainPathUpdate(domains, { ...update, segs }, new Set());
      main[segs[0]] = domains.get(segs[0]);
    }
    return updates.filter(u => u.segs.join('.') === 'world.lastShift');
  };
  const scan = id => {
    const source = owner._find(id); player.pos.set(source.pos.x, 0, source.pos.z);
    assert.equal(owner.inspect(source.id).ok, true);
  };
  const file = ids => { for (const id of ids) scan(id); const result = owner.archive(); assert.equal(result.ok, true); return result.receipt; };
  return { sim, state, main, owner, player, differ, ship, read, scan, file };
}

test('actual filed owner account crosses the production worker diff to the existing Ceres host', t => {
  const h = fixture(t); h.ship();
  assert.equal(h.read().choices.includes('last_shift_report'), false);
  const receipt = h.file(['fairlead', 'cargo', 'recorder']);
  assert.equal(h.ship().length, 1);
  assert.equal(h.read().choices.includes('last_shift_report'), true);
  assert.ok(h.read().reply.includes(receipt.text));
  assert.match(h.read().reply, /deliberate cargo release to save/);
  assert.match(h.read().reply, /does not confirm a physical recorder handoff/);
  assert.notEqual(h.main.world.lastShift, h.state.world.lastShift);
  assert.notEqual(h.main.world.lastShift.receipts[0], receipt);
});

test('a cold omitted leaf mints when evidence arrives and unchanged or moving-body state ships no delta', t => {
  const h = fixture(t), row = h.state.world.lastShift;
  delete h.state.world.lastShift; h.ship();
  assert.equal(h.read().choices.includes('last_shift_report'), false);
  h.state.world.lastShift = row; h.file(['fairlead']);
  assert.equal(h.ship().length, 1);
  assert.equal(h.read().choices.includes('last_shift_report'), true);
  assert.equal(h.ship().length, 0);
  const recorder = h.owner._find('recorder'); recorder.pos.x += 17; h.owner._capture();
  assert.equal(h.ship().length, 0, 'dynamic body poses are not part of this contact mirror');
  delete h.state.world.lastShift;
  assert.equal(h.ship().length, 1);
  assert.equal(h.read().choices.includes('last_shift_report'), false, 'an absent owner cannot retain stale filed evidence');
});

test('unfiled discoveries keep the original filed certainty and no extra owner/private data crosses', t => {
  const h = fixture(t), first = h.file(['fairlead']); h.ship();
  h.scan('cargo'); h.scan('recorder');
  const row = h.state.world.lastShift;
  row.privateOwner = { secret: 'not presentation' }; row.recoveryGuidance = 'not this reader';
  row.receipts[0].privateNote = 'not presentation'; row.bodies.recorder.privateBody = 'not presentation';
  h.ship();
  const shown = h.main.world.lastShift;
  assert.deepEqual(shown.knownClueIds, ['fairlead', 'cargo', 'recorder']);
  assert.equal(shown.receipts.length, 1);
  assert.equal(shown.receipts[0].text, first.text);
  assert.match(h.read().reply, /final sequence remains incomplete/);
  assert.deepEqual(shown.bodies, { recorder: { status: 'live' } });
  assert.equal(JSON.stringify(shown).includes('not presentation'), false);
  assert.equal(Object.hasOwn(shown, 'recoveryGuidance'), false);
  assert.equal(Object.hasOwn(shown.receipts[0], 'privateNote'), false);
  h.file([]); h.ship();
  assert.match(h.read().reply, /Together the three sources support/);
  assert.equal(h.state.world.lastShift.receipts.length, 2, 'projection does not truncate the durable owner history');
  assert.equal(h.state.world.lastShift.receipts[0].text, first.text);
  assert.equal(h.main.world.lastShift.receipts.length, 1, 'the contact only needs the latest filed revision');
});

test('a refused physical return stays unconfirmed, then actual canonical handoff reaches the same contact', t => {
  const h = fixture(t); h.file(['fairlead', 'cargo', 'recorder']);
  const recorder = h.owner._find('recorder'), credits = h.state.player.credits;
  h.player.pos.set(LAST_SHIFT_POS.x, 0, LAST_SHIFT_POS.z); h.player.vel.set(0, 0, 0);
  recorder.pos.set(h.player.pos.x + 20, 0, h.player.pos.z); recorder.vel.set(0, 0, 0);
  h.sim.spawn({ type: 'station', team: 2, pos: { x: h.player.pos.x + 70, z: h.player.pos.z },
    radius: 80, mass: 1000, hull: 1000, hullMax: 1000, data: { stationId: 'station_ceres', dockRadius: 80 } });
  assert.equal(h.owner.returnRecorder().reason, 'tow_required'); h.ship();
  assert.match(h.read().reply, /does not confirm a physical recorder handoff/);
  const line = getCombatKernel(h.owner.ctx).attachments.create({ defId: 'tether_standard',
    ownerId: h.player.id, targetId: recorder.id, sourceWorld: h.player.pos, targetWorld: recorder.pos });
  assert.equal(line.ok, true); assert.equal(h.owner.returnRecorder().ok, true); h.ship();
  assert.match(h.read().reply, /original tug recorder was accepted by this refinery's archive/);
  assert.equal(h.main.world.lastShift.bodies.recorder.status, 'returned');
  assert.equal(h.main.world.lastShift.recorderReturn.stationId, 'station_ceres');
  assert.equal(h.state.player.credits, credits);
  assert.equal(h.owner._find('recorder'), null);
});

test('invalid report source or receipt never manufactures a contact option or custody acceptance', t => {
  const h = fixture(t); h.file(['recorder']); h.ship();
  const row = h.state.world.lastShift, valid = structuredClone(row);
  for (const corrupt of [
    r => { r.siteId = 'another-site'; },
    r => { r.receipts[0].clueIds = ['invented-source']; },
    r => { r.receipts[0].text = 'invented conclusion'; },
    r => { r.revision = 0; },
  ]) {
    h.state.world.lastShift = structuredClone(valid); corrupt(h.state.world.lastShift); h.ship();
    assert.equal(h.read().choices.includes('last_shift_report'), false);
  }
  h.state.world.lastShift = structuredClone(valid);
  h.state.world.lastShift.recorderReturn = { id: `${C.siteId}:recorder:return`, bodyKey: `${C.siteId}:recorder`, stationId: 'station_ceres', at: 1 };
  h.ship();
  assert.equal(h.read().choices.includes('last_shift_report'), true);
  assert.match(h.read().reply, /does not confirm a physical recorder handoff/);
  assert.equal(Object.hasOwn(h.main.world.lastShift, 'recorderReturn'), false);
});
