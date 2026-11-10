// U1 (WF-14): a locked wreck, cargo pickup, or jettisoned pod tells the pilot its class
// (even when rematerialized with only data.wreckClass or spawned on a faction berth before
// any sector loss) and its legal/papers status before they cut or scoop it.
import assert from 'node:assert/strict';
import test from 'node:test';

import { COMMODITIES } from '../src/data/commodities.js';
import { VOLATILE_BY_COMMODITY } from '../src/data/commodityVolatileClasses.js';
import { interactionClassLine } from '../src/data/entityInteractionProfiles.js';
import { FACTION_BERTHS } from '../src/data/factionBerths.js';
import { wreckClassById } from '../src/data/wreckClasses.js';
import { lossLedger } from '../src/systems/lossLedger.js';
import { objectInfoLine, targetInteractionClass } from '../src/ui/targetPanel.js';

function entity(id, type, data = {}) {
  return { id, type, alive: true, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, radius: 12, data };
}

function stateFor(e) {
  return { entities: new Map([[e.id, e]]), entityList: [e], player: {}, playerId: 'player' };
}

const infoFor = (e) => objectInfoLine(e, stateFor(e), {}, 50);

test('a wreck with only data.wreckClass resolves its class label on the lock and hover header', () => {
  const remat = entity(4242, 'wreck', {
    wreckClass: 'military',
    salvagePool: { cmdty_classified_salvage: 2 },
  });
  assert.equal(interactionClassLine(remat), 'Salvage · Military Wreck · Classified Salvage');
  assert.equal(targetInteractionClass(remat), 'Salvage · Military Wreck · Classified Salvage');

  const debris = entity(4243, 'wreck', { wreckClass: 'debris' });
  assert.equal(interactionClassLine(debris), 'Salvage', 'generic debris keeps bare Salvage');
});

test('every faction berth hulk class resolves in wreckClasses and survives the tagger with or without a sector loss', () => {
  for (const berth of FACTION_BERTHS) {
    const classId = berth.hulk.wreckClass;
    const cls = wreckClassById(classId);
    assert.ok(cls, `${berth.id} wreckClass ${classId} resolves in WRECK_CLASSES`);

    // 1. Sector with NO recorded loss yet still stamps the authored berth class labels.
    const emptyLedger = Object.create(lossLedger);
    emptyLedger._state = {
      simTime: 10,
      world: { currentSectorId: berth.sectorId },
      lossLedger: { seed: 4242, bySector: {}, entries: [] },
    };
    const coldHulk = entity(1, 'wreck', {
      sectorId: berth.sectorId,
      berthConsign: { berthId: berth.id, stationId: berth.stationId },
      wreckClass: classId,
    });
    emptyLedger._tagWreck({ id: 1, type: 'wreck', entity: coldHulk });
    assert.equal(coldHulk.data.wreckClass, classId);
    assert.equal(coldHulk.data.wreckClassLabel, cls.label);
    assert.equal(coldHulk.data.scanLabel, cls.scanLabel);
    assert.equal(coldHulk.data.provenance, undefined, 'no invented loss provenance when sector has no losses');

    // 2. Sector WITH a recorded loss preserves the authored berth class and attaches provenance.
    const hotLedger = Object.create(lossLedger);
    hotLedger._state = {
      simTime: 50,
      world: { currentSectorId: berth.sectorId },
      lossLedger: {
        seed: 4242,
        bySector: { [berth.sectorId]: [{ lossId: 'loss_4242', shipDefId: 'ship_mule', kind: 'ship', t: 20 }] },
        entries: [],
      },
    };
    const hotHulk = entity(2, 'wreck', {
      sectorId: berth.sectorId,
      berthConsign: { berthId: berth.id, stationId: berth.stationId },
      wreckClass: classId,
    });
    hotLedger._tagWreck({ id: 2, type: 'wreck', entity: hotHulk });
    assert.equal(hotHulk.data.wreckClass, classId, `${berth.id} authored class is never overwritten by a sector loss roll`);
    assert.equal(hotHulk.data.scanLabel, cls.scanLabel);
    assert.equal(hotHulk.data.provenance.lossId, 'loss_4242');
  }
});

test('a volatile loose pickup carries VOLATILE on its class line just like a jettisoned pod', () => {
  const volatileId = Object.keys(VOLATILE_BY_COMMODITY).find((id) => COMMODITIES.some((c) => c.id === id));
  const name = COMMODITIES.find((c) => c.id === volatileId).name;
  const pickup = entity(4244, 'pickup', { commodityId: volatileId, amount: 2 });
  assert.equal(interactionClassLine(pickup), `Loose Cargo · ${name} ×2 · VOLATILE`);
});

test('objectInfoLine warns on restricted salvage, contraband, restricted cargo, and washed papers', () => {
  // Military wreck (not picked clean) -> Restricted salvage
  const milWreck = entity(4245, 'wreck', {
    wreckClass: 'military',
    salvagePool: { cmdty_scrap_metal: 3 },
  });
  assert.match(infoFor(milWreck), /Restricted salvage/);

  // Picked-clean military wreck -> no restricted warning left to strip
  const cleanMilWreck = entity(4246, 'wreck', {
    wreckClass: 'military',
    salvagePool: { cmdty_scrap_metal: 0 },
  });
  assert.doesNotMatch(infoFor(cleanMilWreck), /Restricted salvage/);

  // Contraband pickup -> Contraband
  const contrabandId = COMMODITIES.find((c) => c.legality === 'contraband').id;
  const hotPod = entity(4247, 'pickup', { commodityId: contrabandId, amount: 2 });
  assert.match(infoFor(hotPod), /Contraband/);

  // Restricted cargo pod -> Restricted cargo
  const restrictedPod = entity(4248, 'payload', {
    payloadType: 'jettisoned_cargo',
    commodityId: 'cmdty_classified_salvage',
    amount: 1,
  });
  assert.match(infoFor(restrictedPod), /Restricted cargo/);

  // Washed pod at the Quiet -> Papers washed (and never Contraband/Restricted)
  const washedPod = entity(4249, 'payload', {
    payloadType: 'jettisoned_cargo',
    commodityId: contrabandId,
    amount: 2,
    legality: 'legal',
    laundered: true,
  });
  const washedLine = infoFor(washedPod);
  assert.match(washedLine, /Papers washed/);
  assert.doesNotMatch(washedLine, /Contraband|Restricted/);

  // Ordinary legal cargo -> none of those tags
  const legalPod = entity(4250, 'pickup', { commodityId: 'cmdty_alloys', amount: 4 });
  assert.doesNotMatch(infoFor(legalPod), /Contraband|Restricted|Papers washed/);
});
