// Ordinary module/owner integration. Run in a complete checkout; bounded extraction is separate evidence.
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateContacts, getChoices, buildReply } from '../src/ui/station/barContacts.js';
import { SORI_COMPARISON_CONTACT_ID } from '../src/data/soriComparisonReturn.js';
function fixture() {
  return { meta: { seed: 4242 }, simTime: 0, player: {}, missions: { careerContracts: {
    runs: { prospector_veil_volatiles: { contractId: 'prospector_veil_volatiles', cycle: 0,
      status: 'completed', stageIndex: 3, completedStages: ['calibrate_the_veil','draw_helium_envelope','deliver_to_triton'] } },
    settledMissionIds: ['sori-done'], receipts: [{ id: 'sori:completed:sori-done', contractId: 'prospector_veil_volatiles',
      careerId: 'prospector', stageId: 'deliver_to_triton', stageIndex: 2, outcome: 'completed',
      cycle: 0, attempt: 0, missionId: 'sori-done', sectorId: 'sector_triton_wake' }],
  } } };
}
test('ordinary contacts preserve all other patrons while adding the optional Sori return', () => {
  const absent = fixture(); absent.missions.careerContracts.receipts = [];
  const before = generateContacts('station_veil', absent);
  const present = generateContacts('station_veil', fixture());
  assert.equal(present.filter(c => c.id === SORI_COMPARISON_CONTACT_ID).length, 1);
  assert.deepEqual(present.filter(c => c.id !== SORI_COMPARISON_CONTACT_ID), before);
  for (const station of ['station_triton', 'station_reach', 'station_tethys']) {
    assert.deepEqual(generateContacts(station, fixture()), generateContacts(station, absent));
  }
});
test('ordinary choice dispatch uses Sori and revalidates a stale clicked card', () => {
  const state = fixture();const c=generateContacts('station_veil',state).find(c=>c.id===SORI_COMPARISON_CONTACT_ID);
  assert.deepEqual(getChoices(c.role,c).map(c=>c.id),['comparison','work','leave']);
  assert.match(buildReply(c.role,'comparison',{state},'station_veil',c).text,/tell me I am wrong/);
  state.missions.careerContracts.receipts=[];
  const reply=buildReply(c.role,'work',{state},'station_veil',c);
  assert.equal(reply.missionOffer,undefined);assert.match(reply.text,/check the comparison record/);
});
