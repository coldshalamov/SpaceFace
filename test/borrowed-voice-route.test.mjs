import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuthoritativeRuntime } from '../src/runtime/createAuthoritativeRuntime.js';
import { snapshotFeatureMaps, applyFeatureConfigToMaps, restoreFeatureMaps } from '../src/data/featureFlags.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { ensureAlienEcologyState } from '../src/data/alienEcologyState.js';
import { BORROWED_VOICE as C, BORROWED_VOICE_RECORDERS as RECORDERS } from '../src/data/borrowedVoice.js';
import { borrowedVoicePresentation } from '../src/systems/borrowedVoice.js';
import { explorationDiscoveryPlates } from '../src/world/explorationJournal.js';
import { getCombatKernel } from '../src/combat/kernel.js';
import { scalarHitToDamagePacket } from '../src/combat/damage.js';

const external=(runtime,fn)=>{const old=snapshotFeatureMaps();applyFeatureConfigToMaps(runtime.config.features);
  try{return fn();}finally{restoreFeatureMaps(old);}};
test('normal R2 Charon source, native towing and a cold Continue retain evidence and permanent quarantine',async()=>{
  const source=createAuthoritativeRuntime({profileId:'production',nodeSafeOnly:true,seed:816});let target;
  try{const s=source.state;s.mode='flight';ensureAlienEcologyState(s).revelation=2;
    const player=source.spawn(makeShipEntitySpec('ship_hawser',{isPlayer:true,player:s.player,pos:{x:0,z:0},fittings:[]}));s.playerId=player.id;
    external(source,()=>source.getSystem('world').enterSector(C.sectorId,{continuous:false,noTeleport:true,placePlayer:false}));
    external(source,()=>source.getSystem('world').relocatePlayerInSector({x:C.center.x+70,z:C.center.z+40,heading:0},{reason:'borrowed-voice-route'}));
    const ph=source.getSystem('physics');assert.equal(await ph.prepareBackend(s,{reset:true}),true);
    source.step(1/60);source.step(1/60);
    const owner=source.getSystem('borrowedVoice'),a=owner._find('a'),b=owner._find('b'),ring=owner._find('ring');
    assert.ok(a&&b&&ring);assert.equal(ph._sg02.records.get(ring.id).colliders.length,5);
    assert.equal(ph._sg02.records.get(a.id).body.mass(),8);assert(borrowedVoicePresentation(s,ring).nativeBodyReady);
    // A native fixture places an original housing inside the genuinely open bore. All
    // subsequent quality, attachment, loss, save and reload use the ordinary production owners.
    const body=ph._sg02.records.get(a.id).body;body.setTranslation({x:C.center.x+7,y:0,z:C.center.z},true);
    body.setRotation({x:0,y:-1,z:0,w:0},true);body.setLinvel({x:0,y:0,z:0},true);body.setAngvel({x:0,y:0,z:0},true);
    for(let i=0;i<110;i++)source.step(1/60);
    assert(owner._signals.get('a')?.quality>.8);s.player.targetId=a.id;
    let scanResults;source.bus.on('signal:scanResults',r=>{scanResults=r;});
    // Headless input has no keyboard edge; feed the locked action to the actual scanner
    // owner rather than fabricating a pulse or bypassing source recovery.
    s.input.actions.scanPulse=true;external(source,()=>source.getSystem('scanner').update(1/60,s));
    assert(source.getSystem('scanner')._pulseSeq>0);
    assert.equal(scanResults?.signals.find(r=>r.entityId===a.id)?.classification,RECORDERS[0].name.toUpperCase());
    assert(owner._row.recoveredFragmentIds.includes(RECORDERS[0].evidenceId));
    assert(explorationDiscoveryPlates(s).some(p=>p.id===C.id&&p.body.includes(RECORDERS[0].text)));
    const rope=external(source,()=>getCombatKernel(owner.ctx).attachments.create({defId:'tether_standard',ownerId:player.id,
      targetId:a.id,sourceWorld:player.pos,targetWorld:a.pos}));assert.equal(rope.ok,true,rope.reason);
    assert.equal(ph._sg02.attachments.get(rope.attachment.id)?.targetEntity,a);
    external(source,()=>getCombatKernel(owner.ctx).routeDamage({attackerId:player.id,targetId:b.id,
      packet:scalarHitToDamagePacket({damage:1000,damageType:'kinetic',pos:{...b.pos}})}));
    assert.equal(owner._row.recorderOutcomeIds.b.status,'destroyed');
    assert(owner.choose('quarantine',owner._row.evidenceRevision).ok);const envelope=source.getSystem('save').serialize('borrowed-voice-route');
    source.dispose();target=createAuthoritativeRuntime({profileId:'production',nodeSafeOnly:true,seed:817});
    assert.equal(await target.getSystem('save').loadEnvelope(envelope,'borrowed-voice-route'),true);
    const t=target.state;t.mode='flight';const restored=target.getSystem('borrowedVoice');
    assert.equal(await target.getSystem('physics').prepareBackend(t),true);for(let i=0;i<60;i++)target.step(1/60);
    const next=restored._find('a');assert.ok(next);assert.equal(restored._find('b'),null);
    assert.equal(restored._row.disposition,'quarantine');assert.equal(restored._signals.size,0);
    assert.equal(next.data.worldRecordId,a.data.worldRecordId);assert.equal(borrowedVoicePresentation(t,next).quality,0);
    assert.equal([...target.getSystem('physics')._sg02.attachments.values()].filter(j=>j.targetEntity===next).length,1);
    const plate=explorationDiscoveryPlates(t).find(p=>p.id===C.id);assert(plate.body.includes(RECORDERS[0].text));
    assert(plate.body.includes('UNKNOWN — original source lost'));assert.equal(ensureAlienEcologyState(t).revelation,2);
  }finally{target?.dispose();source.dispose();}
});
