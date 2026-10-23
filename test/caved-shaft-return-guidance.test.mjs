import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuthoritativeRuntime } from '../src/runtime/createAuthoritativeRuntime.js';
import { snapshotFeatureMaps, applyFeatureConfigToMaps, restoreFeatureMaps } from '../src/data/featureFlags.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { CAVED_SHAFT_PROBE as C } from '../src/data/landmarkMissions.js';
import { explorationDiscoveryPlates } from '../src/world/explorationJournal.js';
const external = (r, fn) => { const old = snapshotFeatureMaps(); applyFeatureConfigToMaps(r.config.features); try { return fn(); } finally { restoreFeatureMaps(old); } };
const plate = s => explorationDiscoveryPlates(s).find(p => p.sectorId === C.sectorId && p.poiId === C.poiId);
function boot() {
  const r = createAuthoritativeRuntime({ profileId: 'production', nodeSafeOnly: true, seed: 6607 });
  const s = r.state; s.mode = 'flight'; s.player.credits = 5000; s.factions.faction_dmc = { rep: 500 };
  const p = r.spawn(makeShipEntitySpec('ship_hawser', { isPlayer: true, player: s.player, pos: { x: 0, z: 0 }, fittings: [] })); s.playerId = p.id;
  const w = r.getSystem('world');
  external(r, () => w.enterSector(C.sectorId, { continuous: false, noTeleport: true, placePlayer: false }));
  const target = s.world.activeSector.pois.find(p => p.poiId === C.poiId); assert(target);
  external(r, () => w.relocatePlayerInSector({ ...target.pos, heading: 0 }, { reason: 'c6-guidance-test' }));
  return { r, s, p, w, target };
}
test('production discovery and ordinary board acceptance change the C6 plate without adapter fiction', () => {
  const h = boot(); try {
    assert.equal(plate(h.s), undefined);
    external(h.r, () => h.w._tickPOIScan(h.s));
    assert.equal(h.s.world.discovery[C.sectorId].pois[C.poiId].identified, true);
    const offer = h.s.missions.boards[C.stationId]?.slots.find(o => o.id === C.id); assert(offer);
    assert.match(plate(h.s).body, /Cut Refinery.*Jobs board/);
    assert.match(plate(h.s).body, /drill-steel\.\nFor hardened-probe work/, 'lore and the board lead use separate existing Codex paragraphs');
    assert.equal(external(h.r, () => h.r.getSystem('missions').acceptMission(offer.id)), true);
    assert.match(plate(h.s).body, /Return to the Caved Shaft.*close scanner pulse/);
    assert.equal(h.s.world.activeSector.id, undefined, 'never add the obsolete live-POI adapter id');
  } finally { h.r.dispose(); }
});

import { createGameState } from '../src/core/gameState.js';
import { buildLandmarkQuestOffers, cavedShaftReturnGuidance } from '../src/data/landmarkMissions.js';
function identified() {
  const s = createGameState(6606);
  s.world.discovery[C.sectorId] = { pois: { [C.poiId]: { discovered: true, identified: true, identifiedAt: 12 } } };
  return s;
}
function accepted(s) {
  const offer = buildLandmarkQuestOffers(s, { poiId: C.poiId })[0];
  const mission = { ...offer, id: 'm_1', sourceOfferId: offer.id, status: 'active' };
  s.missions.active.push(mission); return mission;
}

test('guidance is pure, C6-specific, and fails closed for unrelated, terminal and forged mission state', () => {
  assert.equal(cavedShaftReturnGuidance(createGameState(1)), null);
  const s = identified(); const before = JSON.stringify(s);
  assert.equal(cavedShaftReturnGuidance(s).phase, 'lead');
  assert.equal(JSON.stringify(s), before);
  assert.match(plate(s).note, /0\/2 authored sites found/, 'runtime-owned census semantics are unchanged');
  for (const alter of [m => { m.sourceOfferId = 'unrelated'; }, m => { m.source = 'random'; },
    m => { m.params.landmarkProbe.poiId = 'foreign'; }, m => { m.params.landmarkProbe.artifact.id = 'forged'; },
    m => { m.params.landmarkProbe.targetLocalPos.x++; }, m => { m.stationId = 'foreign'; },
    m => { m.params.landmarkProbe.artifact.body = 'invented answer'; }, m => { m.params.landmarkProbe.questId = 'foreign'; }]) {
    const x = identified(); alter(accepted(x)); assert.equal(cavedShaftReturnGuidance(x).phase, 'lead');
  }
  for (const status of ['failed', 'canceled', 'abandoned', 'completed']) {
    const x = identified(); accepted(x).status = status;
    assert.equal(cavedShaftReturnGuidance(x).phase, 'closed');
    assert.doesNotMatch(plate(x).body, /C6-1|Return to the Caved Shaft/);
  }
  for (const outcome of ['failed', 'abandoned', 'completed']) {
    const x = identified(); accepted(x); x.missions.receipts = [{ sourceOfferId: C.id, outcome }];
    assert.equal(cavedShaftReturnGuidance(x).phase, 'closed', 'settlement without a canonical artifact never invents a frame');
  }
  const x = identified(); x.missions.receipts = [{ sourceOfferId: 'unrelated', outcome: 'completed' }];
  x.world.discovery[C.sectorId].pois[C.poiId].landmarkArtifact = { id: 'forged', title: 'Fake', body: 'Repeat reward!' };
  assert.equal(cavedShaftReturnGuidance(x).phase, 'lead'); assert.doesNotMatch(plate(x).body + plate(x).note, /Fake|Repeat reward|Recovered forged/);
  x.world.discovery[C.sectorId].pois[C.poiId].landmarkArtifact.id = C.artifact.id;
  const complete = plate(x); assert.equal(complete.body, `${C.artifact.title} — ${C.artifact.body}`);
  assert.doesNotMatch(complete.body, /Jobs board|Return to the Caved Shaft|Repeat reward/);
  assert.deepEqual(buildLandmarkQuestOffers(x, { poiId: C.poiId }), []);
});

test('production Save/Continue retains accepted guidance and an explicitly fixture-supplied canonical owner artifact', async () => {
  let h = boot();
  try {
    external(h.r, () => h.w._tickPOIScan(h.s));
    assert.equal(external(h.r, () => h.r.getSystem('missions').acceptMission(C.id)), true);
    const activePlate = plate(h.s);
    const envelope = h.r.getSystem('save').serialize('c6-accepted-guidance');
    h.r.dispose(); h = boot();
    assert.equal(await h.r.getSystem('save').loadEnvelope(envelope, 'c6-accepted-guidance'), true);
    h.s.mode = 'flight'; assert.equal(plate(h.s).body, activePlate.body);
    const missions = h.r.getSystem('missions');
    const mission = h.s.missions.active.find(m => m.sourceOfferId === C.id); assert(mission);

    // Explicit owner-event fixture for the independent durable presentation boundary. This is
    // not scanner completion, reward settlement or a claim that the gameplay blocker is fixed.
    h.r.bus.emit('landmark:artifactRecovered', { questId: C.id, missionId: mission.id,
      sectorId: C.sectorId, poiId: C.poiId, targetRef: C.targetRef, artifact: { ...C.artifact }, returnedAt: h.s.simTime });
    const canonical = plate(h.s); assert.equal(canonical.body, `${C.artifact.title} — ${C.artifact.body}`);
    const completedEnvelope = h.r.getSystem('save').serialize('c6-owner-artifact-fixture');
    h.r.dispose(); h = boot();
    assert.equal(await h.r.getSystem('save').loadEnvelope(completedEnvelope, 'c6-owner-artifact-fixture'), true);
    assert.equal(plate(h.s).body, canonical.body);
    assert.deepEqual(buildLandmarkQuestOffers(h.s, { poiId: C.poiId }), []);
    external(h.r, () => h.w.enterSector('sector_helios_prime', { continuous: false, noTeleport: true, placePlayer: false }));
    external(h.r, () => h.w.enterSector(C.sectorId, { continuous: false, noTeleport: true, placePlayer: false }));
    assert.equal(plate(h.s).body, canonical.body);
    assert.equal(h.s.missions.boards[C.stationId].slots.some(o => o.id === C.id), false);
  } finally { h.r.dispose(); }
});

test('real abandoned and failed contracts do not advertise another available job or a recovered frame', () => {
  for (const outcome of ['abandoned', 'failed']) {
    const h = boot(); try {
      external(h.r, () => h.w._tickPOIScan(h.s));
      const missions = h.r.getSystem('missions');
      assert.equal(external(h.r, () => missions.acceptMission(C.id)), true);
      const mission = h.s.missions.active.find(m => m.sourceOfferId === C.id);
      if (outcome === 'abandoned') external(h.r, () => missions.abandonMission(mission.id));
      else external(h.r, () => missions._failMission(mission, h.s.missions.active.indexOf(mission), 'failed'));
      assert.equal(cavedShaftReturnGuidance(h.s).phase, 'closed');
      assert.match(plate(h.s).body, /No shaft return frame is filed/);
      h.r.bus.emit('poi:identified', { sectorId: C.sectorId, poiId: C.poiId, type: 'derelict' });
      assert.equal(h.s.missions.boards[C.stationId].slots.some(o => o.id === C.id), false);
    } finally { h.r.dispose(); }
  }
});
