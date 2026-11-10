import test from 'node:test';
import assert from 'node:assert/strict';
import { ANVIL_ORCHARD, createOrchardRecord } from '../src/data/anvilOrchard.js';
import { ORCHARD_GEOMETRY as G, orchardFrameBodySpec, orchardPodBodySpec } from '../src/data/anvilOrchardBody.js';
import { isOrchardFrame, isOrchardPod } from '../src/data/anvilOrchardIdentity.js';
import { targetDisplayName, targetInteractionClass, objectInfoLine } from '../src/ui/targetPanel.js';

test('canonical empty Anvil socket names its real facility and never offers a nonexistent pod', () => {
  const frame = { id: 42, type: 'wreck', alive: true, radius: G.radius, pos: {x:0,z:0}, physicsBody: orchardFrameBodySpec(), data: {
    orchardId: ANVIL_ORCHARD.id, orchardKind: 'frame', worldRecordId: G.worldRecordId,
    placeId: 'place_anvil_storm_orchard', authoredAssetId: G.assetId, authoredPayloadAssetId: G.assetId,
    masslineTetherable: false, worldSiteTargetable: true, name: 'Anvil Storm Orchard', salvagePool: {cmdty_scrap_metal:4} } };
  const state = { tick: 610, world: {currentSectorId:ANVIL_ORCHARD.sectorId}, sites: {anvilOrchard:createOrchardRecord(0)},
    entities: new Map([[frame.id,frame]]), ui: {componentSelection:{targetId:frame.id,componentId:'orchard_socket_0'}} };
  assert.equal(isOrchardFrame(frame), true);
  assert.equal(targetDisplayName(frame), 'Anvil Storm Orchard');
  assert.equal(targetInteractionClass(frame), 'Harvest facility');
  const line=objectInfoLine(frame,state,{data:{}},20);
  assert.match(line,/Empty socket · wait for calm · 48 units in reserve/i);
  assert.doesNotMatch(line,/scrap|hold .*release/i);
  const pod = {id:43,type:'payload',alive:true,radius:G.pod.radius,physicsBody:orchardPodBodySpec(),data:{
    orchardId:ANVIL_ORCHARD.id,orchardKind:'pod',worldRecordId:'anvil_storm_orchard:0:1',identityKey:'anvil_storm_orchard:0:1',
    authoredAssetId:G.pod.assetId,authoredPayloadAssetId:G.pod.assetId,commodityId:ANVIL_ORCHARD.commodityId}};
  assert.equal(isOrchardPod(pod),true);
  assert.equal(targetDisplayName(pod),'Hydrogen Gas pod');
  assert.equal(targetInteractionClass(pod),'Orchard pod');
});
