import test from 'node:test';
import assert from 'node:assert/strict';
import { ILEX_ARK as C, ILEX_VAULT_IDS, freshIlexArk, normalizeIlexArk } from '../src/data/ilexArk.js';
import { projectIlexGreenhouse, ilexGreenhouseReply } from '../src/data/ilexGreenhouse.js';
import { generateContacts, getChoices, buildReply } from '../src/ui/station/barContacts.js';
import { createDomainDiffer, applyDomainPathUpdate, configureDomainMirroring, createDomainMirroringProfile } from '../scripts/lib/simReadModel.mjs';
import { createSimulation } from '../src/core/sim.js';
import { economy } from '../src/systems/economy.js';

function settled(ids) {
  const ilexArk = freshIlexArk();
  ilexArk.phase = 'settled'; ilexArk.acceptedAt = 0; ilexArk.deadline = C.deadlineS;
  for (const id of ILEX_VAULT_IDS) ilexArk.vaults[id].status = ids.includes(id) ? 'delivered' : 'lost';
  ilexArk.settlement = { id: `${C.id}:outcome`, stationId: C.stationId, deliveredVaultIds: [...ids],
    at: 30, harvestAt: 30 + C.harvestDelayS, rewardCr: ids.length ? C.baseRewardCr + C.vaultRewardCr * ids.length : 0, carrierAlive: true };
  return { ilexArk, economy: { committedIntents: {} }, simTime: 30, meta: { seed: 804 } };
}
function commitHarvest(state) {
  const r = state.ilexArk.settlement, key = `${r.id}:first-harvest`;
  state.economy.committedIntents[key] = { receipt: structuredClone(r), result: {
    receiptId: key, stationId: C.stationId, commodityId: 'cmdty_food', qty: r.deliveredVaultIds.length * C.provisionsPerVault,
    deliveredVaultIds: [...r.deliveredVaultIds], at: r.harvestAt } };
  state.simTime = r.harvestAt;
}
function barkeep(state, stationId = C.stationId) {
  return generateContacts(stationId, state).find(c => c.role === 'barkeep');
}
function reply(state, contact = barkeep(state)) {
  return buildReply('barkeep', 'ilex_greenhouse', { state, bus: { emit() { assert.fail('conversation must not emit gameplay actions'); } } }, C.stationId, contact).text;
}
function transport(config = createDomainMirroringProfile('station')) {
  configureDomainMirroring(config);
  const differ = createDomainDiffer(), domains = new Map(), facade = {};
  let tick = 0;
  return { facade, land(state) {
    for (let i = 0; i < 61; i++, tick++) {
      const updates = structuredClone(differ.diff(state, tick).updates);
      for (const update of updates) {
        applyDomainPathUpdate(domains, update, new Set());
        // Same top-level domain facade used by the station UI. Keep presentation independent
        // of authoritative objects; no Ilex voyage is added by the transport.
        const root = update.segs[0];
        if (!root.includes('.')) facade[root] = domains.get(root);
      }
    }
    return facade;
  } };
}

test('returning Ceres player can ask the existing barkeep about all, some or no arrived seed lines', () => {
  for (const ids of [ILEX_VAULT_IDS, ['vault_2', 'vault_5'], []]) {
    const state = settled(ids), before = JSON.stringify(state), contact = barkeep(state);
    assert.ok(getChoices('barkeep', contact).some(c => c.id === 'ilex_greenhouse'));
    assert.ok(getChoices('barkeep', contact).some(c => c.id === 'rumors'));
    assert.ok(getChoices('barkeep', contact).some(c => c.id === 'drink'));
    const line = reply(state, contact);
    assert.equal(line, ilexGreenhouseReply(state));
    if (ids.length === 6) assert.match(line, /All six.*accepted/);
    else if (ids.length) assert.match(line, /2\/6 Ilex seed lines.*4 missing lines/);
    else assert.match(line, /No Ilex vault arrived.*no planting or first harvest/);
    if (ids.length) assert.match(line, /No first harvest from these lines is recorded yet/);
    assert.equal(JSON.stringify(state), before, 'talking does not mutate cargo, stock, rewards or history');
    assert.equal(getChoices('barkeep', barkeep(state, 'station_helios')).some(c => c.id === 'ilex_greenhouse'), false);
  }
});

test('the greenhouse reply requires the actual first harvest, never elapsed time or ordinary Provisions stock', () => {
  const state = settled(['vault_2', 'vault_5']);
  state.simTime = 100000; state.economy.markets = { [C.stationId]: { cmdty_food: { stock: 999 } } };
  assert.match(reply(state), /No first harvest from these lines is recorded yet/);
  commitHarvest(state);
  assert.match(reply(state), /first harvest added 24u Provisions.*Check the Market for current availability/);
  state.economy.markets[C.stationId].cmdty_food.stock = 0;
  assert.match(reply(state), /first harvest added 24u/, 'past crop remains remembered after sale');
  assert.match(reply(state), /4 missing lines/, 'trade never restores lost seed lines');
  const saved = JSON.parse(JSON.stringify(state));
  saved.ilexArk = normalizeIlexArk(saved.ilexArk);
  assert.equal(reply(saved), reply(state), 'Continue preserves the exact planting and committed harvest');
  state.economy.committedIntents[`${C.id}:outcome:first-harvest`].result.deliveredVaultIds = ['vault_1', 'vault_2'];
  assert.match(reply(state), /No first harvest from these lines is recorded yet/, 'different line identities are not this harvest');
});

test('cloned production domain updates reach bar choices and reply, and reset clears stale planting', () => {
  for (const ids of [ILEX_VAULT_IDS, ['vault_3'], []]) {
    const state = settled(ids), wire = transport(), facade = wire.land(state);
    assert.equal(facade.ilexArk, undefined, 'no custody/body ledger added to presentation');
    assert.deepEqual(Object.keys(facade.ilexGreenhousePublic).sort(), ['creditedCr', 'deliveredVaultIds', 'harvestQty', 'harvested']);
    assert.equal(reply(facade), reply(state));
    const contact = barkeep(facade);
    assert.ok(getChoices('barkeep', contact).some(c => c.id === 'ilex_greenhouse'));
    assert.notEqual(facade.ilexGreenhousePublic.deliveredVaultIds, state.ilexArk.settlement.deliveredVaultIds);
    commitHarvest(state); wire.land(state);
    assert.equal(reply(facade, contact), reply(state), 'selected contact reads current harvest rather than its old greeting');
    assert.equal(facade.ilexGreenhousePublic.harvestQty, ids.length * 12);
    state.ilexArk = freshIlexArk(); wire.land(state);
    assert.equal(facade.ilexGreenhousePublic, null);
    assert.equal(getChoices('barkeep', barkeep(facade)).some(c => c.id === 'ilex_greenhouse'), false);
    assert.equal(reply(facade, contact), 'No Ilex planting is recorded here.');
  }
});

test('the greenhouse projection stays bounded under diagnostic expansion and rejects unfounded settlements', () => {
  const state = settled(['vault_4']); commitHarvest(state);
  state.ilexArk.vaults.vault_1.pose = { secretBodyHistory: [1, 2, 3] };
  const wire = transport({ expandPaths: [{ segs: [], depth: 5 }] });
  const facade = wire.land(state);
  assert.deepEqual(facade.ilexGreenhousePublic, { deliveredVaultIds: ['vault_4'], harvested: true, harvestQty: 12, creditedCr: null });
  state.ilexArk.vaults.vault_4.status = 'lost'; wire.land(state);
  assert.equal(facade.ilexGreenhousePublic, null);
  assert.equal(projectIlexGreenhouse({}), null);
  assert.equal(ilexGreenhouseReply({}), null);
  assert.equal(getChoices('barkeep', barkeep({})).some(c => c.id === 'ilex_greenhouse'), false);
});

test('real economy first-harvest consumer supplies the remembered crop without a second payment or harvest', () => {
  const sim = createSimulation({ seed: 804, systems: [economy] });
  try {
    const source = settled(['vault_2', 'vault_6']);
    sim.state.ilexArk = source.ilexArk; sim.state.simTime = source.simTime;
    const econ = sim.registry.get('economy');
    const originalGet = econ.registryGet.bind(econ);
    econ.registryGet = id => id === 'ilexArk' ? { outcomeReceipt: () => structuredClone(source.ilexArk.settlement) } : originalGet(id);
    const receiptId = source.ilexArk.settlement.id;
    assert.equal(econ.applyIlexSeedHarvest(receiptId).reason, 'planting_pending');
    assert.equal(projectIlexGreenhouse(sim.state).harvested, false);
    sim.state.simTime = source.ilexArk.settlement.harvestAt;
    assert.equal(econ.applyIlexSeedHarvest(receiptId).qty, 24);
    const stock = sim.state.economy.markets[C.stationId].cmdty_food.stock;
    const history = JSON.stringify(sim.state.economy.committedIntents);
    const wire = transport(), facade = wire.land(sim.state);
    assert.match(reply(facade), /first harvest added 24u/);
    assert.equal(econ.applyIlexSeedHarvest(receiptId).duplicate, true);
    assert.equal(sim.state.economy.markets[C.stationId].cmdty_food.stock, stock);
    assert.equal(JSON.stringify(sim.state.economy.committedIntents), history);
  } finally { sim.dispose(); }
});

test('only a matching bounded credit journal is reported, including saturated-wallet partial credit', () => {
  const state=settled(['vault_2','vault_5']);
  assert.doesNotMatch(reply(state), /credited you/);
  state.missions={ilexArkReward:{receiptId:state.ilexArk.settlement.id,deliveredVaultIds:['vault_2','vault_5'],creditedCr:5,at:30}};
  assert.match(reply(state),/credited you 5 cr/);
  const saved=structuredClone(state.missions.ilexArkReward);
  for(const mutation of [r=>r.receiptId='foreign',r=>r.deliveredVaultIds=['vault_1','vault_2'],r=>r.creditedCr=1801,
    r=>r.creditedCr=-1,r=>r.creditedCr=1.5,r=>r.at=29,r=>r.at=31]) {
    state.missions.ilexArkReward=structuredClone(saved); mutation(state.missions.ilexArkReward);
    assert.doesNotMatch(reply(state),/credited you/);
  }
  state.missions.ilexArkReward=saved;
  const facade=transport().land(state); assert.equal(facade.ilexGreenhousePublic.creditedCr,5);
  assert.match(reply(facade),/credited you 5 cr/);
});

test('future or mismatched harvest journals never become observed greenhouse history', () => {
  const base=settled(['vault_3']); commitHarvest(base);
  for(const mutate of [s=>s.simTime--,s=>s.economy.committedIntents[`${C.id}:outcome:first-harvest`].result.at++,
    s=>s.economy.committedIntents[`${C.id}:outcome:first-harvest`].result.stationId='station_helios',
    s=>s.economy.committedIntents[`${C.id}:outcome:first-harvest`].result.qty=24,
    s=>s.economy.committedIntents[`${C.id}:outcome:first-harvest`].result.commodityId='cmdty_ore']) {
    const state=structuredClone(base); mutate(state);
    assert.match(reply(state),/No first harvest from these lines is recorded yet/);
  }
  const future=settled(['vault_3']); future.simTime=29;
  assert.equal(projectIlexGreenhouse(future),null);
  const open=settled(['vault_3']); open.ilexArk.vaults.vault_1.status='attached';
  assert.equal(projectIlexGreenhouse(open),null);
});

test('public station-news isolation and unrelated replies survive the new local question', async () => {
  const { localEconEvent }=await import('../src/ui/station/barContacts.js');
  const state=settled(['vault_1']); state.economy.econEvents=[{stationId:C.stationId,commodityId:'cmdty_food',type:'surplus'}];
  assert.equal(localEconEvent(state,'station_helios'),null);
  assert.equal(localEconEvent(state,C.stationId),state.economy.econEvents[0]);
  assert.equal(buildReply('barkeep','drink',{state},C.stationId,barkeep(state)).text,
    'Coming right up. Best synthale this side of the belt.');
  assert.equal(getChoices('barkeep',barkeep(state,'station_helios')).some(c=>c.id==='ilex_greenhouse'),false);
  assert.doesNotMatch(buildReply('barkeep','ilex_greenhouse',{state},'station_helios',barkeep(state,'station_helios')).text,/Ilex|harvest|credited you/);
});

test('real settled voyage, capped reward and first harvest survive production Save/Continue into station conversation', async () => {
  const { createAuthoritativeRuntime }=await import('../src/runtime/createAuthoritativeRuntime.js');
  const { makeShipEntitySpec }=await import('../src/systems/ships.js');
  const { ILEX_START }=await import('../src/data/ilexArk.js');
  const { resolveCollisionProxyManifest,resolveDockAnchor }=await import('../src/data/collisionProxyManifests.js');
  const { snapshotFeatureMaps,applyFeatureConfigToMaps,restoreFeatureMaps }=await import('../src/data/featureFlags.js');
  const flags=snapshotFeatureMaps(),runtime=createAuthoritativeRuntime({profileId:'production',nodeSafeOnly:true,seed:804});
  applyFeatureConfigToMaps(runtime.config.features);
  try {
    const s=runtime.state,world=runtime.getSystem('world'),owner=runtime.getSystem('ilexArk'),econ=runtime.getSystem('economy');
    s.mode='flight';s.ui.screenStack=[];s.settings.gameplay.physicsBackend='legacy';runtime.getSystem('ships').newGame();
    s.missions.completedLog=[{type:'cargo_delivery',success:1,count:1,totalCr:1200}];
    const p=runtime.spawn(makeShipEntitySpec('ship_kestrel',{isPlayer:true,player:s.player,fittings:s.player.ownedShips[0].fittings}));s.playerId=p.id;
    world.enterSector(C.originSectorId);world.relocatePlayerInSector({x:ILEX_START.x+100,z:ILEX_START.z+60},{reason:'ilex-greenhouse-scalar-fixture'});
    owner.update(1/60,s);assert.equal(owner.accept(owner._row.revision).ok,true);
    owner.sever('vault_5');owner.sever('vault_6');owner._materialize();
    const carrier=owner._find('carrier');world.enterSector(C.destinationSectorId);
    const station=s.entityList.find(e=>e.alive&&e.type==='station'&&e.data?.stationId===C.stationId);assert.ok(station);
    for(const e of [carrier,p]){const at=resolveDockAnchor(station,resolveCollisionProxyManifest(station),e);assert.ok(at);e.pos.set(at.x,0,at.z);e.vel.set(0,0,0);}
    assert.equal(owner._acceptCarrier(),true);s.player.credits=Number.MAX_SAFE_INTEGER-5;
    assert.equal(owner.finish(owner._row.revision).ok,true);
    assert.equal(s.missions.ilexArkReward.creditedCr,5);
    assert.equal(projectIlexGreenhouse(s).harvested,false);assert.match(reply(transport().land(s)),/4\/6 Ilex.*credited you 5 cr/);
    const save=runtime.getSystem('save');assert.equal(save.loadEnvelope(save.serialize('ilex-greenhouse-before-crop')),true);
    assert.equal(projectIlexGreenhouse(s).harvested,false);assert.match(reply(transport().land(s)),/credited you 5 cr/);
    s.simTime=owner._row.settlement.harvestAt;owner._settle();
    const history=structuredClone(s.economy.committedIntents),stock=s.economy.markets[C.stationId].cmdty_food.stock;
    assert.match(reply(transport().land(s)),/first harvest added 48u Provisions/);
    owner._settle();assert.equal(s.economy.markets[C.stationId].cmdty_food.stock,stock);
    assert.deepEqual(s.economy.committedIntents,history);
    econ.applyStockPressure(C.stationId,'cmdty_food','buy',48);
    assert.equal(save.loadEnvelope(save.serialize('ilex-greenhouse-after-crop')),true);
    const returned=reply(transport().land(s));assert.match(returned,/first harvest added 48u Provisions/);
    assert.match(returned,/current availability.*already have been traded/);assert.match(returned,/credited you 5 cr/);
  } finally {runtime.dispose();restoreFeatureMaps(flags);}
});


test('foreign or future settlements and forged committed receipt identities fail closed', () => {
  const base=settled(['vault_2']);commitHarvest(base);
  for(const mutate of [r=>r.id='foreign',r=>r.stationId='station_helios',r=>r.at=base.simTime+1,
    r=>r.deliveredVaultIds=['vault_1'],r=>r.rewardCr=9999]) {
    const state=structuredClone(base);mutate(state.ilexArk.settlement);
    assert.equal(projectIlexGreenhouse(state),null);
  }
  for(const mutate of [r=>r.id='foreign',r=>r.stationId='station_helios',r=>{r.at++;r.harvestAt++;},
    r=>r.deliveredVaultIds=['vault_1']]) {
    const state=structuredClone(base);mutate(state.economy.committedIntents[`${C.id}:outcome:first-harvest`].receipt);
    assert.equal(projectIlexGreenhouse(state).harvested,false);
    assert.match(reply(state),/No first harvest from these lines is recorded yet/);
  }
});
