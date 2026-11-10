import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { ships, makeShipEntitySpec } from '../src/systems/ships.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { economy } from '../src/systems/economy.js';
import { missions } from '../src/systems/missions.js';
import { ilexArk } from '../src/systems/ilexArk.js';
import { ilexArkPrompt } from '../src/ui/ilexArkPrompt.js';
import { setPromptDeck } from '../src/ui/promptDeck.js';
import { ILEX_ARK as C, ILEX_START, ILEX_RECEIVER, ilexOutcomeText } from '../src/data/ilexArk.js';
import { resolveCollisionProxyManifest, resolveDockAnchor } from '../src/data/collisionProxyManifests.js';
import { PRODUCTION_FEATURES } from '../src/runtime/runtimeProfiles.js';
import { snapshotFeatureMaps, applyFeatureConfigToMaps, restoreFeatureMaps } from '../src/data/featureFlags.js';

let flags;
test.before(() => { flags = snapshotFeatureMaps(); applyFeatureConfigToMaps(PRODUCTION_FEATURES); });
test.after(() => restoreFeatureMaps(flags));
function fixture() {
  let decision, offer;
  setPromptDeck({ offerDecision: row => { decision = row; return true; }, resolveDecision() {} });
  const sim = createSimulation({ seed: 804, systems: [ships, spawnBudget, economy, missions, ilexArk, ilexArkPrompt],
    helpers: { combatPhysics: { createAttachment: s => ({ id: s.attachmentId }), cutAttachment: () => true } } });
  const s = sim.state; s.mode = 'flight'; s.world.currentSectorId = C.originSectorId;
  s.settings.gameplay.physicsBackend = 'legacy'; sim.registry.get('ships').newGame();
  s.missions.completedLog = [{ type: 'cargo_delivery', success: 1, count: 1, totalCr: 0 }];
  const player = sim.spawn(makeShipEntitySpec('ship_kestrel', { isPlayer: true, player: s.player,
    pos: { x: ILEX_START.x + 100, z: ILEX_START.z + 60 }, fittings: [] })); s.playerId = player.id;
  const station = sim.spawn({ type: 'station', team: 2, pos: { ...ILEX_RECEIVER }, radius: 40, mass: 1e9,
    hull: 1e9, hullMax: 1e9, physicsBody: { schemaVersion: 1, dynamic: false, shape: 'ball', radius: 40, mass: 1e9 },
    data: { stationId: C.stationId, dockRadius: 110 } });
  const owner = sim.registry.get('ilexArk'); owner.update(1/60,s);
  sim.bus.on('ilexArk:offer', row => { offer = row; });
  const receiver = (e = player) => {
    const p = resolveDockAnchor(station, resolveCollisionProxyManifest(station), e) || { x: ILEX_RECEIVER.x+90, z: ILEX_RECEIVER.z };
    e.pos.set(p.x,0,p.z); e.vel.set(0,0,0);
  };
  return { sim, s, owner, player, receiver,
    accept() { assert.equal(owner.accept(owner._row.revision).ok,true); },
    read() { assert.equal(owner.offer(),true); assert.equal(decision.detail,offer.text); return { offer, decision, text: decision.detail }; },
    close() { sim.dispose(); setPromptDeck(null); } };
}

test('actual prompt distinguishes initial offer from active zero-arrival escort and preserves actions', () => {
  const h=fixture(); try {
    assert.match(h.read().text,/Escort is optional/); h.accept();
    const before=JSON.stringify(h.owner.serialize()), r=h.read();
    assert.match(r.text,/Voyage open: 0\/6 at Ceres\. 6 attached/);
    assert.match(r.text,/Protect the carrier/);
    assert.doesNotMatch(r.text,/planting cannot begin|incident record|seed lines are missing/);
    assert.deepEqual(r.decision.choices.map(c=>c.id),['course','leave']);
    assert.equal(JSON.stringify(h.owner.serialize()),before);
  } finally { h.close(); }
});

test('releasing and drifting originals are distinguished, with a slow Massline receiver objective', () => {
  const h=fixture(); try {
    h.accept(); assert.equal(h.owner.sever('vault_4').ok,true);
    assert.match(h.read().text,/5 attached, 1 releasing/);
    h.owner._materialize(); const r=h.read();
    assert.match(r.text,/5 attached, 1 loose/);
    assert.match(r.text,/Massline.*slowly.*Ceres/i);
    assert.match(r.text,/Filing records remaining recoverable originals as lost/);
  } finally { h.close(); }
});

test('partial and full physical carrier acceptance remain open until explicit filing', () => {
  for (const arrived of [4,6]) {
    const h=fixture(); try {
      h.accept(); for (const id of ['vault_5','vault_6'].slice(0,6-arrived)) h.owner.sever(id);
      h.owner._materialize(); h.receiver(h.owner._find('carrier'));
      assert.equal(h.owner._acceptCarrier(),true); h.receiver(); const r=h.read();
      assert.match(r.text,new RegExp(`Voyage open: ${arrived}/6 at Ceres`));
      assert.equal(r.offer.canFinish,true); assert.equal(h.owner._row.phase,'active');
      if(arrived===4) { assert.match(r.text,/2 loose/); assert.doesNotMatch(r.text,/plants only the surviving/); }
      else { assert.match(r.text,/All six originals have arrived/); assert.doesNotMatch(r.text,/Protect the carrier|Tow loose/); }
      assert.match(r.text,/Return to the Ceres receiver and slow down to file/);
      assert.equal(h.owner.finish(h.owner._row.revision).ok,true);
      assert.equal(h.read().text,ilexOutcomeText(h.owner._delivered(),true));
    } finally { h.close(); }
  }
});

test('carrier loss preserves surviving recovery and excludes destroyed originals', () => {
  const h=fixture(); try {
    h.accept(); h.owner.sever('vault_2'); h.owner._materialize();
    const dead=h.owner._find('vault_2'); dead.alive=false; h.sim.bus.emit('entity:killed',{targetId:dead.id});
    const carrier=h.owner._find('carrier'); carrier.alive=false; h.sim.bus.emit('entity:killed',{targetId:carrier.id});
    h.owner._materialize(); const r=h.read();
    assert.match(r.text,/Carrier lost/); assert.match(r.text,/5 loose, 1 lost or destroyed/);
    assert.match(r.text,/Recover released originals/); assert.doesNotMatch(r.text,/Protect the carrier|planting cannot begin/);
  } finally { h.close(); }
});

test('no surviving original is not described as recoverable; deadline retains terminal outcome', () => {
  const h=fixture(); try {
    h.accept(); const carrier=h.owner._find('carrier'); carrier.alive=false;
    h.sim.bus.emit('entity:killed',{targetId:carrier.id}); h.owner._materialize();
    for(const id of Object.keys(h.owner._row.vaults)) {
      const e=h.owner._find(id); e.alive=false; h.sim.bus.emit('entity:killed',{targetId:e.id});
    }
    h.receiver(); const r=h.read();
    assert.match(r.text,/No unreceived originals remain recoverable/);
    assert.doesNotMatch(r.text,/Recover released originals|Protect the carrier/);
    assert.equal(h.owner._row.phase,'active');
    h.s.simTime=h.owner._row.deadline; h.s.tick++; h.owner.update(1/60,h.s);
    assert.equal(h.owner._row.phase,'settled');
    assert.equal(h.read().text,ilexOutcomeText([],false));
  } finally { h.close(); }
});

test('owner Save/Continue and sector-return events preserve active readout, deadline and six originals', () => {
  const h=fixture(); try {
    h.accept(); h.owner.sever('vault_4'); h.owner._materialize(); const before=h.read().text;
    const saved=JSON.parse(JSON.stringify(h.owner.serialize()));
    h.sim.bus.emit('save:restoring'); h.owner.deserialize(saved); h.sim.bus.emit('save:loaded');
    h.sim.bus.emit('sector:exit',{sectorId:C.originSectorId}); h.sim.bus.emit('sector:enter',{sectorId:C.originSectorId});
    assert.equal(h.read().text,before); assert.equal(h.owner._row.deadline,saved.deadline);
    assert.deepEqual(h.owner._row.vaults,saved.vaults);
    assert.equal(h.owner._row.phase,'active'); assert.equal(h.owner._row.settlement,null);
  } finally { h.close(); }
});

test('production save envelope preserves the active objective and actual original vault identities', async () => {
  const { createAuthoritativeRuntime } = await import('../src/runtime/createAuthoritativeRuntime.js');
  const runtime=createAuthoritativeRuntime({profileId:'production',nodeSafeOnly:true,seed:804});
  try {
    const s=runtime.state, world=runtime.getSystem('world'), owner=runtime.getSystem('ilexArk');
    s.mode='flight'; s.ui.screenStack=[]; s.settings.gameplay.physicsBackend='legacy';
    runtime.getSystem('ships').newGame();
    s.missions.completedLog=[{type:'cargo_delivery',success:1,count:1,totalCr:1200}];
    const p=runtime.spawn(makeShipEntitySpec('ship_kestrel',{isPlayer:true,player:s.player,fittings:s.player.ownedShips[0].fittings}));
    s.playerId=p.id; world.enterSector(C.originSectorId);
    world.relocatePlayerInSector({x:ILEX_START.x+100,z:ILEX_START.z+60},{reason:'ilex-readout-save-fixture'});
    owner.update(1/60,s); assert.equal(owner.accept(owner._row.revision).ok,true);
    assert.equal(owner.sever('vault_4').ok,true); owner._materialize();
    const carrier=owner._find('carrier'), loose=owner._find('vault_4'); assert.ok(carrier); assert.ok(loose);
    let menu; runtime.bus.on('ilexArk:offer',row=>{menu=row;}); owner.offer();
    const before=menu.text, deadline=owner._row.deadline, original=JSON.stringify(owner._row.vaults);
    assert.match(before,/5 attached, 1 loose/);
    const save=runtime.getSystem('save'); assert.equal(save.loadEnvelope(save.serialize('ilex-readout')),true);
    s.mode='flight'; s.ui.screenStack=[]; s.ui.docked=false;
    assert.equal(owner.offer(),true); assert.equal(menu.text,before);
    assert.equal(owner._row.deadline,deadline); assert.equal(JSON.stringify(owner._row.vaults),original);
    assert.notEqual(owner._find('carrier'),carrier); assert.notEqual(owner._find('vault_4'),loose);
    assert.equal(owner._row.phase,'active'); assert.equal(owner._row.settlement,null);
  } finally { runtime.dispose(); }
});
