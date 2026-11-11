import test from 'node:test';
import assert from 'node:assert/strict';
import { masslineFlightRead, ninthMouthTowRead } from '../src/ui/masslineCadenceReadout.js';
function fixture(role = 'lamp:0') {
  const player = { id: 1, occupantGeneration: 7, hull: 100, alive: true };
  const body = { id: 2, occupantGeneration: 8, hull: 80, alive: true, type: 'payload',
    data: { name: 'Worklight', ninthMouthRole: role, ninthMouthIdentity: `lw_ceres_ninth_mouth:${role}` } };
  const guidance = { role, entityId: 2, entityLife: 8, stage: 'tow', instruction: 'Tow the light to its service mark.',
    target: { x: 10, z: 20 }, remaining: 30, speed: 2, maxSpeed: 1, radius: 8, attached: true };
  const attachment = { state: 'active', ownerId: 1, ownerGeneration: 7, targetId: 2, targetGeneration: 8 };
  const state = { mode: 'flight', playerId: 1, entities: new Map([[1, player], [2, body]]),
    player: { tether: { active: true, targetId: 2, attachmentId: 'a' } },
    combat: { attachments: { byId: { a: attachment } } }, ceresNinthMouthOffer: { playerLife: 7, guidance },
    massline2: { throw: { solution: { valid: true, onSolution: true } } } };
  return { state, body, player, guidance, attachment };
}
test('bound original tow guidance overrides generic throw cue for all rescue loads', () => {
  for (const role of ['barge', 'lamp:0', 'lamp:1', 'lamp:2']) {
    const { state, guidance } = fixture(role);
    assert.equal(masslineFlightRead(state).cue, guidance.instruction);
    assert.equal(masslineFlightRead(state).tow, guidance);
  }
});
test('malformed, inactive, foreign and stale tow guidance never overrides the generic context', () => {
  const changes = [
    f => { f.state.mode = 'menu'; }, f => { f.state.ui = { docked: true }; },
    f => { f.state.save = { restoring: true }; }, f => { f.player.hull = 0; },
    f => { f.body.alive = false; }, f => { f.body.occupantGeneration++; },
    f => { f.state.ceresNinthMouthOffer.playerLife++; }, f => { f.guidance.entityId++; },
    f => { f.guidance.entityLife++; }, f => { f.guidance.role = 'fallen_rock'; },
    f => { f.body.data.ninthMouthIdentity += ':copy'; }, f => { f.body.data.ninthMouthRole = 'barge'; },
    f => { f.attachment.state = 'broken'; }, f => { f.attachment.targetGeneration++; },
    f => { f.attachment.ownerGeneration++; }, f => { f.attachment.ownerId++; },
    f => { f.state.player.tether.attachmentId = 'missing'; }, f => { f.guidance.attached = false; },
    f => { f.guidance.instruction = ''; }, f => { f.guidance.stage = null; },
    f => { f.guidance.speed = NaN; }, f => { f.guidance.remaining = -1; },
    f => { f.guidance.target.x = Infinity; }, f => { f.guidance.radius = 0; },
    f => { f.guidance.maxSpeed = -1; }, f => { f.state.ceresNinthMouthOffer = null; },
  ];
  for (const change of changes) {
    const f = fixture(); change(f);
    assert.equal(ninthMouthTowRead(f.state, f.body), null, String(change));
    assert.equal(masslineFlightRead(f.state).cue, 'Release path aligned', String(change));
  }
});
test('no active line remains hidden and unrelated attachments keep existing guidance', () => {
  const f = fixture(); f.state.player.tether.active = false;
  assert.equal(masslineFlightRead(f.state), null);
  f.state.player.tether.active = true; f.body.data = { name: 'Ordinary rock' };
  assert.equal(masslineFlightRead(f.state).cue, 'Release path aligned');
  delete f.state.massline2.throw.solution;
  assert.equal(masslineFlightRead(f.state).cue, 'Choose an exit target');
});
