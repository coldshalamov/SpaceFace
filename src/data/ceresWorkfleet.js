// P03's one Long Plate handling cycle. Pure authoring/runtime contract, not a
// second traffic/mining owner. Dimensions below are WU in asset-local X/Y-up/Z.
import { CERES_SHIPBREAK_MANIFEST as SITE } from './ceresShipbreak.js';
import { worldSiteAssetBinding } from './worldSiteAssetBindings.js';

const freeze = value => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze); Object.freeze(value);
  }
  return value;
};
const box = (id, x0, x1, z0, z1, y0 = -8, y1 = 8) => ({
  id, center: { x:(x0+x1)/2, y:(y0+y1)/2, z:(z0+z1)/2 },
  size: { x:x1-x0, y:y1-y0, z:z1-z0 },
});
const point = (x, y, z) => ({ x, y, z });
const pose = (x, z, rot = 0) => ({ x, z, rot });
const payload = SITE.payloads.find(p => p.id === 'long_plate');
const siteScale = SITE.visualRoot.initialScale;
const rootBinding = worldSiteAssetBinding(SITE.visualRoot.placeId);
const sectionBinding = worldSiteAssetBinding(payload.structural.placeId);
const socketWU = (binding, id, scale) => {
  const v = binding.sockets[id].transform.translation;
  return point(v[0]*scale, v[1]*scale, v[2]*scale);
};
const mounted = socketWU(rootBinding,
  SITE.components.find(c => c.id === payload.componentId).anchorId, siteScale);
const shellBoxes = SITE.collisionProxies.map(p => {
  const anchor = socketWU(rootBinding, p.anchorId, siteScale);
  const x = anchor.x + p.offset.x*siteScale, z = anchor.z + p.offset.z*siteScale;
  return box(p.id, x-p.halfExtents.x*siteScale, x+p.halfExtents.x*siteScale,
    z-p.halfExtents.z*siteScale, z+p.halfExtents.z*siteScale);
});
const edge = (b, axis, sign) => b.center[axis] + sign*b.size[axis]/2;
const fixed = id => shellBoxes.find(b => b.id === id);
// Exact collider edges: 68-WU windows, not the narrower visual-review rays.
const corridors = [
  { id:'aft', x:[edge(fixed('aft_island'),'x',1),edge(fixed('center_island'),'x',-1)] },
  { id:'fore', x:[edge(fixed('center_island'),'x',1),edge(fixed('fore_island'),'x',-1)] },
].map(p => ({...p, z:[Math.min(...shellBoxes.map(b=>edge(b,'z',-1))),
  Math.max(...shellBoxes.map(b=>edge(b,'z',1)))], protectedExitZ:[-200,200]}));

const breakerFixed = [
  box('drive_port',-90,-48,-62,-35,-12,12),
  box('drive_starboard',-90,-48,35,62,-12,12),
  box('aft_service_spine',-90,-76,-35,35,-12,12),
  box('cab_crossmember',-76,-46,-35,35,-12,22),
  // Passive contact stop arrests the finite section when the tension-only line goes slack.
  box('load_stop',-48,-28,-10,10,-5,5),
  box('bridle_port',-48,90,-62,-48,-8,8),
  box('bridle_starboard',-48,90,48,62,-8,8),
];
function breakerBoxes(shoeCenter) {
  return [...breakerFixed, ...[-1,1].flatMap(side => {
    const z = side*shoeCenter, rodEnd = side*(shoeCenter+5), rodRoot = side*54;
    return [box(`shoe_${side}`, -28,84,z-5,z+5,-5,5),
      ...[-20,74].map(x => box(`shoe_ram_${side}_${x}`,x-2,x+2,
        Math.min(rodEnd,rodRoot),Math.max(rodEnd,rodRoot),-2,2))];
  })];
}
const cradleFixed = [box('rear_spine',-85,85,65,75,-10,14),
  // Candidate physical depth keepers preserve the central cable channel.
  box('depth_keeper_port',-10,-4,56.5,65,-5,5),
  box('depth_keeper_starboard',4,10,56.5,65,-5,5),
  box('port_rail',-85,-70,-75,65,-10,20),box('starboard_rail',70,85,-75,65,-10,20)];
function cradleBoxes(padCenter) {
  return [...cradleFixed,...[-1,1].flatMap(side => {
    const x=side*padCenter, end=side*(padCenter+5), root=side*84;
    return [box(`retention_${side}`,x-5,x+5,-54,54,-5,5),
      ...[-48,48].map(z => box(`retention_ram_${side}_${z}`,
        Math.min(end,root),Math.max(end,root),z-2,z+2,-2,2))];
  })];
}

// A channel is one physical exhaust mouth and one independently driven core.
// Positions/directions stay in the canonical runtime frame; source export applies
// (X/2,-Z/2,Y/2), including to each actual nozzle mesh, rather than an axis hint.
const thrusterChannel = (id, category, mouth, exhaustDirection, supportingSolid,
  depthWU, lipRadiusWU, coreDepthWU = depthWU*.45, coreRadiusWU = lipRadiusWU*.62/1.12) => ({
  id, category, socket:`SOCKET_CERES_THRUSTER_${id}`, coreHook:`HOOK_CERES_THRUSTER_${id}`,
  coreMeshes:[0,1,2].map(lod=>`LOD${lod}_HOOK_CERES_THRUSTER_${id}_glow_drive`),
  mouth, exhaustDirection,
  forceDirection:point(-exhaustDirection.x||0,-exhaustDirection.y||0,-exhaustDirection.z||0),
  supportingSolid, depthWU, lipRadiusWU, coreDepthWU, coreRadiusWU,
});
const breakerChannels = [
  ...[[-53.5,'PORT_OUTER'],[-43.5,'PORT_INNER'],[43.5,'STARBOARD_INNER'],[53.5,'STARBOARD_OUTER']]
    .map(([z,name])=>thrusterChannel(`MAIN_${name}`,'main',point(-89.9,0,z),point(-1,0,0),
      z<0?'drive_port':'drive_starboard',7,3.6*1.12)),
  ...[[-1,'PORT'],[1,'STARBOARD']].map(([side,name])=>thrusterChannel(`RETRO_${name}`,
    'retro',point(89.9,0,side*55),point(1,0,0),`bridle_${name.toLowerCase()}`,3.2,2.3)),
  ...[[64,'BOW'],[-64,'STERN']].flatMap(([x,end])=>[[-1,'PORT'],[1,'STARBOARD']]
    .map(([side,name])=>thrusterChannel(`RCS_${end}_${name}`,'lateral',point(x,0,side*61.9),
      point(0,0,side),`${x>0?'bridle':'drive'}_${name.toLowerCase()}`,2.8,1.45))),
];
const cutterChannels = [
  ...[[-1,'AFT'],[1,'FORE']].flatMap(([direction,end])=>[[-1,'PORT'],[1,'STARBOARD']]
    .map(([side,name])=>thrusterChannel(`AXIAL_${end}_${name}`,`axial-${end.toLowerCase()}`,
      point(-4+direction*1.3,0,side*4.6),point(direction,0,0),'motor',.95,1.05,.04,.62))),
  ...[[-1,'PORT'],[1,'STARBOARD']].map(([side,name])=>thrusterChannel(`LATERAL_${name}`,
    'lateral',point(0,0,side*5.85),point(0,0,side),'motor',1.5,.68)),
];
const channelSockets = channels => Object.fromEntries(channels.map(c=>[c.socket,c.mouth]));
const channelDirections = channels => Object.fromEntries(channels.map(c=>[c.socket,c.exhaustDirection]));

export const CERES_WORKFLEET_CONTRACT = freeze({
  schema:'ceres.workfleet.geometry.v1', sourceScale:2,
  coordinates:{ units:'WU', runtime:'+X forward,+Y up,+Z starboard',
    blenderMetres:'(X/2,-Z/2,Y/2)', origin:'authored origin; never bounds-recenter' },
  siteId:SITE.id, sectorId:SITE.sectorId, sitePlacement:SITE.placement,
  identities:{ worker:'ceres:second_measure:breaker', cradle:'ceres:second_measure:section_cradle',
    cutterHead:'ceres:second_measure:cutter_head', payload:payload.worldObjectId },
  existing:{ shellBoxes, corridors,
    section:{ payloadId:payload.id, placeId:payload.structural.placeId,
      mass:payload.mass, radius:payload.radius, mountedPose:pose(mounted.x,mounted.z),
      dimensions:point(68,10,110),
      boxes:payload.structural.boxes.map((b,i) => box(`section_${i}`,
        b.x-b.halfX,b.x+b.halfX,b.z-b.halfZ,b.z+b.halfZ,-5,5)),
      sockets:Object.fromEntries(Object.keys(sectionBinding.sockets)
        .map(id => [id,socketWU(sectionBinding,id,payload.structural.placeScale)])) },
    otherSections:SITE.payloads.filter(p => p.id!=='long_plate').map(p => {
      const c=SITE.components.find(c=>c.id===p.componentId);
      const at=socketWU(rootBinding,c.anchorId,siteScale);
      return {id:p.id,pose:pose(at.x,at.z),boxes:(p.structural.boxes||[
        {x:0,z:0,halfX:p.structural.halfX,halfZ:p.structural.halfZ}])
        .map((b,i)=>box(`${p.id}_${i}`,b.x-b.halfX,b.x+b.halfX,b.z-b.halfZ,b.z+b.halfZ))};
    }),
  },
  assets:{
    breaker:{ id:'ceres_breaker',assetId:'SF_WHOLESHIP_CERES_BREAKER',partId:'wholeship_ceres_breaker',
      file:'wholeships/ceres_breaker.glb',sourceScale:2,dimensions:point(180,34,124),radius:110,
      mass:3200,massIncludes:'integral arms, shoes and rams; excludes the finite 60-mass cutter head',
      bounds:{min:point(-90,-12,-62),max:point(90,22,62)},
      well:{x:[-28,90],z:[-48,48]},
      loadPose:pose(27,0,-Math.PI/2), // section local +Z becomes breaker +X
      headMountedPose:pose(-38,30),
      sockets:{SOCKET_Load_Center:point(27,0,0),SOCKET_Tether_Massline:point(-46,0,0),
        SOCKET_Bridle_Port:point(-32,0,-55),SOCKET_Bridle_Starboard:point(-32,0,55),
        SOCKET_Shoe_Port:point(27,0,-45),SOCKET_Shoe_Starboard:point(27,0,45),
        SOCKET_Cutter_Dock:point(-46,0,30),SOCKET_Engine_Main:point(-90,0,0),
        SOCKET_Camera_Focus:point(-12,0,0),...channelSockets(breakerChannels)},
      socketDirections:{SOCKET_Load_Center:point(0,0,-1),SOCKET_Tether_Massline:point(1,0,0),
        SOCKET_Bridle_Port:point(1,0,0),SOCKET_Bridle_Starboard:point(1,0,0),
        SOCKET_Shoe_Port:point(0,0,1),SOCKET_Shoe_Starboard:point(0,0,-1),
        SOCKET_Cutter_Dock:point(1,0,0),SOCKET_Engine_Main:point(-1,0,0),
        SOCKET_Camera_Focus:point(1,0,0),...channelDirections(breakerChannels)},
      propulsion:{owner:'physicsAuthority queued force/torque commands; no transform writes',
        kind:'independent fixed main, retro and lateral exhaust channels',channels:breakerChannels},
      clearVolumes:{projection:'XZ at every Y; asset excludes separately owned cutter head',
        open:[{x:[-28,90],z:[-38,38]}],retained:[{x:[-28,82],z:[-34,34]}]},
      states:{open:{boxes:breakerBoxes(45)},retained:{boxes:breakerBoxes(39)}},
      motion:{kind:'sim-owned-linear-slides',bridleArms:'fixed open-rib load paths',
        shoes:[{id:'shoe_port',axis:'z',open:-45,retained:-39},
          {id:'shoe_starboard',axis:'z',open:45,retained:39}],
        rams:{axis:'z',roots:[-54,54],longitudinalPositions:[-20,74]},
        doNotBakeAmbientWorkingClips:true},
    },
    cradle:{id:'place_ceres_section_cradle',assetId:'SF_PLACE_CERES_SECTION_CRADLE',
      partId:'place_ceres_section_cradle',file:'places/place_ceres_section_cradle.glb',
      sourceScale:2,dimensions:point(170,30,150),radius:114,mass:6000,
      bounds:{min:point(-85,-10,-75),max:point(85,20,75)},
      well:{x:[-70,70],z:[-75,56.5]},pose:pose(-350,-280),
      sockets:{SOCKET_Structure_Core:point(0,0,0),SOCKET_Section_Receiver:point(0,0,0),
        SOCKET_Service_Head:point(0,0,63)},
      socketDirections:{SOCKET_Structure_Core:point(1,0,0),SOCKET_Section_Receiver:point(1,0,0),
        SOCKET_Service_Head:point(0,0,-1)},
      clearVolumes:{projection:'XZ at every Y',open:[{x:[-70,70],z:[-75,56.5]}],
        retained:[{x:[-34,34],z:[-55,55]}]},
      states:{open:{boxes:cradleBoxes(75)},retained:{boxes:cradleBoxes(39)}},
      motion:{kind:'sim-owned-linear-slides',pads:[{id:'retention_port',axis:'x',open:-75,retained:-39},
        {id:'retention_starboard',axis:'x',open:75,retained:39}],
        rams:{axis:'x',roots:[-84,84],longitudinalPositions:[-48,48]},
        closeOnlyAfterCarrierClear:true,doNotBakeAmbientWorkingClips:true},
    },
    cutterHead:{id:'place_ceres_breaker_cutter_head',assetId:'SF_PLACE_CERES_BREAKER_CUTTER_HEAD',
      partId:'place_ceres_breaker_cutter_head',file:'places/place_ceres_breaker_cutter_head.glb',
      sourceScale:2,dimensions:point(16,8,12),radius:10,mass:60,
      bounds:{min:point(-8,-4,-6),max:point(8,4,6)},
      boxes:[box('motor',-8,4,-6,6,-4,4),box('port_blade',4,8,-6,-2,-3,3),
        box('starboard_blade',4,8,2,6,-3,3)],
      sockets:{SOCKET_Mount:point(-8,0,0),SOCKET_Cut:point(8,0,0),...channelSockets(cutterChannels)},
      socketDirections:{SOCKET_Mount:point(-1,0,0),SOCKET_Cut:point(1,0,0),...channelDirections(cutterChannels)},
      cutFocus:{emitter:point(4,0,0),focusSocket:'SOCKET_Cut',focalDistance:4},
      propulsion:{owner:'physicsAuthority queued force/torque commands; no transform writes',
        kind:'visible reversible service microthrusters',channels:cutterChannels,
        thrustPoints:[point(-4,0,-5),point(-4,0,5)],
        headingControl:'bounded counter-thrust; transport-clamp spring alone does not hold yaw'},
      motion:{kind:'one detachable service body',mount:'SOCKET_Cutter_Dock',
        lossStopsNpcCutting:true,mountedMassOwnedBy:'cutterHead',detachedMassOwnedBy:'cutterHead',
        alwaysSeparateRenderedBody:true},
    },
  },
  route:{
    breakerWorkPose:pose(-80,-220,Math.PI/2),
    headPosesInBreaker:[pose(-38,30),pose(-16,30),pose(-16,0),pose(155,0)],
    headCutGap:2, targetCutSocket:'SOCKET_Cut_A',
    extraction:{sectionFrom:pose(-80,0),sectionTo:pose(-80,-230),
      breakerFrom:pose(-80,-220,Math.PI/2),breakerTo:pose(-80,-450,Math.PI/2),
      targetSocket:'SOCKET_Cut_A',sourceSocket:'SOCKET_Tether_Massline',restLength:211,
      yawAllowed:false,lateralTurnAllowed:false,fullyClearCenterZ:-125},
    seating:{sectionFrom:pose(-80,-230),sectionTo:pose(-80,-423),
      breakerPose:pose(-80,-450,Math.PI/2),lineLengthFrom:211,lineLengthTo:18},
    loadedLegs:[
      {kind:'translate',from:pose(-80,-450,Math.PI/2),to:pose(-80,-500,Math.PI/2)},
      {kind:'rotate',from:pose(-80,-500,Math.PI/2),to:pose(-80,-500,Math.PI)},
      {kind:'translate',from:pose(-80,-500,Math.PI),to:pose(-350,-500,Math.PI)},
      {kind:'rotate',from:pose(-350,-500,Math.PI),to:pose(-350,-500,Math.PI/2)},
      {kind:'translate',from:pose(-350,-500,Math.PI/2),to:pose(-350,-307,Math.PI/2)},
    ],
    receiverPose:pose(-350,-280),carrierWithdrawalTo:pose(-350,-500,Math.PI/2),
    coupling:{carrier:'tether_standard',receiver:'attachment_transport_clamp',
      receiverSourceSocket:'SOCKET_Service_Head',sectionTargetSocket:'SOCKET_Cut_B',
      receiverRestLength:8, sequence:['receiver-coupling','open-carrier-shoes',
        'release-carrier-line','withdraw-carrier','close-receiver-pads']},
    headMount:{defId:'attachment_transport_clamp',owner:'cutterHead',target:'breaker',
      sourceSocket:'SOCKET_Mount',targetSocket:'SOCKET_Cutter_Dock',restLength:0,
      requiredProfile:'combat_profile_ceres_cutter_head',
      profileRequirement:'head transport_clamp source plus tether target; generic wreck profile has no clamp source',
      pairCollision:'normal contacts remain enabled; use the open, non-overlapping dock',
      orientation:'spring is not a fixed joint; bounded physical heading control, never a pose lock'},
    admission:{positionTolerance:2,angleTolerance:.04,speedTolerance:.5,spinTolerance:.03,
      requiresLiveSweptContactCheck:true,
      scalarToleranceAloneDoesNotAuthorizeClosure:true},
    speeds:{loaded:10,finalApproach:3},
  },
  limits:{newPersistentIdentities:3,finiteSections:1,breakerProxyCount:13,
    cradleProxyCount:11,headProxyCount:3,criticalSocketCount:30},
  persistence:{sectionOwner:'asteroidSites',hardwareOwner:'world records',jobOwner:'npcJobsRuntime',
    retainedPayloadId:payload.id,retainedWorldObjectId:payload.worldObjectId,
    settlement:'retain original structural body at measured pose; no despawn or duplicate',
    ordinaryConsumingReceivers:'unchanged',salvagePool:{},
    activationOperation:'brace_long_plate',
    operationIds:['cut_long_plate_seam','release_long_plate_clamp'],
    terminalStates:['secured','player-retained','section-destroyed','worker-disabled','head-disabled']},
});

/** Asset-local socket/pose to its owning frame. Does not mutate simulation. */
export function ceresWorkfleetPoint(at, p) {
  const c=Math.cos(at.rot||0),s=Math.sin(at.rot||0);
  return {x:at.x+c*p.x-s*p.z,y:p.y||0,z:at.z+s*p.x+c*p.z};
}
export function ceresWorkfleetPose(at, local) {
  return {...ceresWorkfleetPoint(at,local),rot:(at.rot||0)+(local.rot||0)};
}
/** Existing normalized compound format consumed by physics; independent of render LOD. */
export const CERES_CRADLE_LAYOUTS = Object.freeze(['open-v1','keepers-v2']);
export function ceresWorkfleetCradleLayout(entity) {
  return entity?.data?.ceresWorkfleetCradleLayout==='open-v1'?'open-v1':'keepers-v2';
}
export function ceresWorkfleetCollision(assetId, state='open', layout='keepers-v2') {
  const asset=CERES_WORKFLEET_CONTRACT.assets[assetId];
  if (!asset) throw new RangeError(`Unknown Ceres workfleet asset: ${assetId}`);
  let boxes=asset.states ? asset.states[state]?.boxes : asset.boxes;
  if(assetId==='cradle'&&layout==='open-v1')boxes=boxes?.filter(b=>!b.id.startsWith('depth_keeper_'));
  if (!boxes) throw new RangeError(`Unknown ${assetId} state: ${state}`);
  return {schemaVersion:1,id:`ceres-workfleet:${assetId}:${state}:v${assetId==='cradle'&&layout==='keepers-v2'?2:1}`,referenceRadius:'radius',
    primitives:boxes.map(b=>({kind:'obb',id:b.id,x:b.center.x/asset.radius,z:b.center.z/asset.radius,
      hx:b.size.x/(2*asset.radius),hz:b.size.z/(2*asset.radius),angle:0}))};
}
