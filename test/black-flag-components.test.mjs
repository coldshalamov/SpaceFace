import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { ships, makeShipEntitySpec, fittingsFromDefaultModules } from '../src/systems/ships.js';
import { economy } from '../src/systems/economy.js';
import { cargo } from '../src/systems/cargo.js';
import { save } from '../src/save/saveSystem.js';
import { shipjack } from '../src/systems/shipjack.js';
import { ensureShipjack } from '../src/shipjack/model.js';
import { inspectComponentProvenance, inspectFittedComponents, quoteModuleSale } from '../src/shipjack/componentProvenance.js';

function boot(t, title = 'disputed') {
  const sim = createSimulation({ seed: 4242, systems: [ships, cargo, economy, save], updateOrder: [] });
  t.after(() => sim.dispose());
  const { state, bus } = sim, owner = sim.registry.get('ships');
  state.mode = 'flight'; state.meta.createdAt = 'black-flag-components-4242';
  state.world.currentSectorId = 'sector_helios_prime';
  state.player.credits = 1000;
  state.player.ownedShips = [{ defId: 'ship_wasp', fittings: [], fittedInstances: {} }];
  state.player.activeShipIndex = 0;
  const active = sim.spawn(makeShipEntitySpec('ship_wasp', { isPlayer: true, player: state.player, fittings: [] }));
  state.playerId = active.id;
  const fittings = fittingsFromDefaultModules('ship_wasp', ['mod_engine_ion_m']);
  const slotIndex = fittings.indexOf('mod_engine_ion_m');
  assert.ok(slotIndex >= 0);
  const target = sim.spawn(makeShipEntitySpec('ship_wasp', { fittings, pos: { x: 60, z: 0 } }));
  target.data.vesselId = 'vessel:component:test'; target.data.shipjackGeneration = 'component:1';
  target.data.fittedInstances = { [slotIndex]: { instanceId: 'mi_component_original', defId: 'mod_engine_ion_m',
    condition: 0.6, provenance: { label: 'Mara’s repaired drive', source: 'traffic' } } };
  const vessel = ensureShipjack(state).vesselsById[target.data.vesselId] = {
    version: 1, vesselId: target.data.vesselId, defId: 'ship_wasp', generation: 'component:1',
    title, recognizedOwner: title === 'clean' ? 'player' : 'captain_mara_venn', originalOwner: 'captain_mara_venn',
    custodian: 'player', location: { kind: 'berth', stationId: 'station_helios', sectorId: 'sector_helios_prime' },
    condition: { hull: 0.7 }, history: [], signature: {},
  };
  assert.equal(owner.admitCapturedVessel({ targetId: target.id, targetGeneration: 'component:1',
    vesselId: vessel.vesselId, operationId: 'component:admit' }).ok, true);
  state.ui.docked = true; state.ui.dockedStationId = 'station_helios';
  const unfit = () => {
    assert.equal(owner.unfitModule({ shipIndex: 1, slotIndex }), true);
    return state.player.moduleInventory.find(item => item.instanceId === 'mi_component_original');
  };
  const sell = (item, operationId = 'component:sale:1') => {
    const result = quoteModuleSale(state, { instanceId: item.instanceId });
    return result.ok ? owner.sellModule({ instanceId: item.instanceId, quote: result.quote, operationId }) : result;
  };
  return { sim, state, bus, owner, vessel, slotIndex, unfit, sell };
}

test('captured exact instance retains its source through ordinary unfit, clean-hull fit and real save/load', t => {
  const h = boot(t), item = h.unfit();
  assert.equal(item.instanceId, 'mi_component_original');
  assert.equal(item.condition, 0.6);
  assert.equal(item.provenance.label, 'Mara’s repaired drive');
  assert.equal(item.provenance.titleAtExtraction, 'disputed');
  assert.equal(h.owner.fitModule({ shipIndex: 0, slotIndex: h.slotIndex, instanceId: item.instanceId }), true);
  let report = inspectFittedComponents(h.state, h.state.player.ownedShips[0].fittedInstances, { grade: 2 });
  assert.equal(report.accepted, false);
  assert.deepEqual(report.instanceIds, [item.instanceId]);
  assert.equal(inspectFittedComponents(h.state, h.state.player.ownedShips[0].fittedInstances, { grade: 1 }).accepted, true);
  const envelope = JSON.parse(JSON.stringify(h.sim.registry.get('save').serialize('component-fitted')));
  assert.equal(h.sim.registry.get('save').loadEnvelope(envelope, 'component-fitted'), true);
  const restored = h.state.player.ownedShips[0].fittedInstances[h.slotIndex];
  assert.deepEqual(restored, item);
  assert.equal(inspectComponentProvenance(h.state, restored).unresolved, true);
  assert.equal(h.owner.unfitModule({ shipIndex: 0, slotIndex: h.slotIndex }), true);
  assert.equal(h.owner.quoteModuleSale({ instanceId: item.instanceId }).ok, false);
  assert.equal(h.state.player.credits, 1000);
});

test('shell return cannot clean retained stolen parts; lawful salvage adjudication can', t => {
  const h = boot(t), item = h.unfit();
  h.vessel.title = 'returned'; h.vessel.claimResolved = true;
  h.vessel.recognizedOwner = 'captain_mara_venn';
  assert.equal(inspectComponentProvenance(h.state, item).unresolved, true);
  assert.match(h.sell(item).reason, /returning the shell/);
  h.vessel.title = 'clean'; h.vessel.recognizedOwner = 'player';
  assert.equal(inspectComponentProvenance(h.state, item).unresolved, false);
  assert.equal(h.sell(item).ok, true);
  assert.ok(h.state.player.credits > 1000);
});

test('yard extraction from a clean hull cannot overwrite an older stolen component source', t => {
  const h = boot(t), item = h.unfit();
  assert.equal(h.owner.fitModule({ shipIndex: 0, slotIndex: h.slotIndex, instanceId: item.instanceId }), true);
  const cleanVesselId = 'vessel:component:clean';
  h.state.player.ownedShips[0].vesselId = cleanVesselId;
  h.state.player.shipjack.vesselsById[cleanVesselId] = { vesselId: cleanVesselId, title: 'clean',
    recognizedOwner: 'player', custodian: 'player', location: { kind: 'berth', stationId: 'station_helios' } };
  const result = h.owner.settleVesselYardOperation({ vesselId: cleanVesselId,
    action: 'extract', slotIndex: h.slotIndex, operationId: 'component:clean:extract' });
  assert.equal(result.ok, true);
  const extracted = h.state.player.moduleInventory.find(row => row.instanceId === item.instanceId);
  assert.equal(extracted.provenance.sourceVesselId, h.vessel.vesselId);
  assert.equal(extracted.provenance.titleAtExtraction, 'disputed');
  assert.equal(inspectComponentProvenance(h.state, extracted).unresolved, true);
  assert.equal(h.sell(extracted).ok, false);
  assert.equal(h.state.player.credits, 1000);
});

test('named fence pays a finite condition-based cut once; real saved receipt survives repeated sale intent', t => {
  const h = boot(t), item = h.unfit();
  h.state.ui.dockedStationId = 'station_smuggler';
  const quoted = quoteModuleSale(h.state, { instanceId: item.instanceId });
  assert.equal(quoted.ok, true); assert.equal(quoted.quote.factor, 0.25);
  const request = { instanceId: item.instanceId, quote: quoted.quote, operationId: 'component:sale:fence' };
  const before = h.state.player.credits;
  const result = h.owner.sellModule(request);
  assert.equal(result.ok, true);
  assert.equal(h.state.player.credits, before + quoted.quote.amount);
  assert.equal(h.state.player.moduleInventory.length, 0);
  const envelope = JSON.parse(JSON.stringify(h.sim.registry.get('save').serialize('component-sold')));
  assert.equal(h.sim.registry.get('save').loadEnvelope(envelope, 'component-sold'), true);
  assert.equal(h.owner.sellModule(request).replayed, true);
  assert.equal(h.state.player.credits, before + quoted.quote.amount);
  assert.equal(h.state.player.moduleSales.receipts.length, 1);
  assert.equal(h.owner.sellModule({ ...request, operationId: 'component:sale:double' }).ok, false);
  assert.equal(h.state.player.credits, before + quoted.quote.amount);
});

test('stale condition, title, berth, expiration and altered quote cannot consume or pay for a spare', t => {
  for (const change of ['condition', 'title', 'berth', 'expiration', 'amount']) {
    const h = boot(t, 'clean'), item = h.unfit();
    const quoted = quoteModuleSale(h.state, { instanceId: item.instanceId });
    assert.equal(quoted.ok, true);
    const quote = { ...quoted.quote };
    if (change === 'condition') item.condition = 0.2;
    if (change === 'title') { h.vessel.title = 'disputed'; delete item.provenance.titleAtExtraction; delete item.provenance.titleAtCapture; }
    if (change === 'berth') h.state.ui.dockedStationId = 'station_smuggler';
    if (change === 'expiration') h.state.simTime += 31;
    if (change === 'amount') quote.amount += 100000;
    assert.equal(h.owner.sellModule({ instanceId: item.instanceId, quote, operationId: `component:stale:${change}` }).ok, false, change);
    assert.equal(h.state.player.moduleInventory[0], item);
    assert.equal(h.state.player.credits, 1000);
  }
});

test('legacy/no-feature provenance stays lawful and temporary modes cannot sell or write persistent receipts', t => {
  const h = boot(t), item = h.unfit();
  delete item.provenance;
  assert.equal(inspectComponentProvenance(h.state, item).tracked, false);
  assert.equal(quoteModuleSale(h.state, { instanceId: item.instanceId }).ok, true);
  h.state.run = { kind: 'crucible' };
  assert.equal(inspectComponentProvenance(h.state, item).tracked, false);
  assert.equal(quoteModuleSale(h.state, { instanceId: item.instanceId }).ok, false);
  assert.equal(h.state.player.moduleSales, undefined);
});

test('public coordinator sale delegates to ships; untracked clean hull cannot hide hot fitted components from customs', t => {
  const h = boot(t), item = h.unfit();
  const jack = Object.create(shipjack);
  jack.init({ state: h.state, bus: h.bus, helpers: h.sim.helpers, registry: h.sim.registry });
  t.after(() => jack.destroy());
  assert.equal(h.owner.fitModule({ shipIndex: 0, slotIndex: h.slotIndex, instanceId: item.instanceId }), true);
  assert.equal(h.state.player.ownedShips[0].vesselId, undefined);
  const findings = [], reports = [];
  const reportTheft = jack.reportTheft.bind(jack);
  jack.reportTheft = (...args) => { reports.push(args); return reportTheft(...args); };
  h.bus.on('shipjack:inspection', row => findings.push(row));
  for (const stationId of ['station_smuggler', 'station_helios', 'station_customs']) {
    h.sim.spawn({ type: 'station', hull: 1000, hullMax: 1000, radius: 50, data: { stationId, name: stationId } });
    h.bus.emit('dock:docked', { stationId });
  }
  assert.equal(findings.length, 2, 'low-grade broadcast check does not discover deep equipment evidence');
  assert.deepEqual(findings.map(row => row.grade), [2, 3]);
  assert.ok(findings.every(row => row.accepted === false && row.entityId === h.state.playerId && row.vesselId === null));
  assert.equal(reports.length, 0, 'component finding does not invoke the canonical theft incident reporter');
  assert.equal(h.owner.unfitModule({ shipIndex: 0, slotIndex: h.slotIndex }), true);
  h.state.ui.dockedStationId = 'station_smuggler';
  const offer = quoteModuleSale(h.state, { instanceId: item.instanceId });
  assert.equal(offer.ok, true);
  const before = h.state.player.credits;
  const result = jack.command({ action: 'module_sell', instanceId: item.instanceId, quote: offer.quote, operationId: 'component:coordinator:sale' });
  assert.equal(result.ok, true);
  assert.equal(h.state.player.credits, before + offer.quote.amount);
  assert.equal(h.state.player.moduleInventory.length, 0);
  assert.equal(h.state.player.moduleSales.receipts.length, 1);
});

test('prior save clears a later sale journal and malformed journals fail closed without losing the hull', t => {
  const h=boot(t,'clean');
  const before=JSON.parse(JSON.stringify(h.sim.registry.get('save').serialize('before-sale')));
  const item=h.unfit();assert.equal(h.sell(item).ok,true);
  assert.equal(h.state.player.moduleSales.receipts.length,1);
  assert.equal(h.sim.registry.get('save').loadEnvelope(before,'before-sale'),true);
  assert.equal(h.state.player.moduleSales,undefined);
  h.state.player.moduleSales={version:1,receipts:[{operationId:'bad',instanceId:'x',amount:Infinity}]};
  const bad=JSON.parse(JSON.stringify(h.sim.registry.get('save').serialize('bad-sale')));
  assert.equal(h.sim.registry.get('save').loadEnvelope(bad,'bad-sale'),true);
  assert.equal(h.state.player.moduleSales.version,0);
  assert.equal(h.state.player.ownedShips.length,2);
  const restored=h.unfit();assert.equal(h.sell(restored).ok,false);
});
