// One neighboring service-cut rescue pocket, not nine working mouths or a cave.
// Geometry, lights and barge remain individual native bodies. No enclosing collider.
import { sectorLocalToGlobalForSector } from './sectorCoordinates.js';
import { modelTruthRow, modelTruthProxyManifest, modelTruthSkinHull } from './modelTruth.js';
import { DEFAULT_MASK } from '../core/entity.js';

const freeze = value => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze); Object.freeze(value);
  }
  return value;
};
const id = 'lw_ceres_ninth_mouth';
const sectorId = 'sector_ceres_belt';
const center = sectorLocalToGlobalForSector({x:700,z:1600},sectorId);
export function worldPoint(local) { return {x:center.x+local.x,z:center.z+local.z}; }
export function localPoint(world) { return {x:world.x-center.x,z:world.z-center.z}; }
const rock = (role, local, radius, dynamic, asset) => ({role,local,radius,dynamic,asset,
  file:`places/${asset}.glb`,mass:dynamic?45:10000,rot:0,
  name:dynamic?'Ninth Mouth fallen rock':'Nine-Mouth service-cut shoulder'});
const definitions = [
  {role:'receiver',asset:'place_sensor_mast',file:'places/place_sensor_mast.glb',
    local:{x:-270,z:65},radius:10,mass:10000,rot:0,dynamic:false,
    name:'DESSA KROLL · RESCUE BERTH RADIO'},
  rock('shoulder_north',{x:0,z:-125},120,false,'place_asteroid_rock_a'),
  rock('shoulder_south',{x:0,z:125},120,false,'place_asteroid_rock_a'),
  rock('fallen_rock',{x:98,z:26},16,true,'place_asteroid_rock_b'),
  ...[0,1,2].map(i=>({role:`lamp:${i}`,asset:'place_worklight_tower',
    file:'places/place_worklight_tower.glb',local:{x:-220-i*30,z:-65},
    radius:12,mass:8,rot:0,dynamic:true,name:`Ninth Mouth worklight ${i+1}`})),
];
export const CERES_NINTH_MOUTH = freeze({
  id,sectorId,center,worldPoint,localPoint,definitions,
  scope:'one-barge service-cut rescue; not the full Nine-Mouth cave',
  admissionRadius:650,hearingRadius:720,alertRadius:720,
  barge:{role:'barge',defId:'ship_ironback',local:{x:79,z:0},rot:Math.PI,radius:24,
    // Census at canonical radius24. Runtime uses makeShipEntitySpec, not a prop fit.
    measuredEnvelope:{x:41.28,y:7.927002,z:14.055596}},
  lamps:[{x:-95,z:-23},{x:-5,z:-23},{x:75,z:-22}].map((local,i)=>({
    role:`lamp:${i}`,local,radius:8,seatRadius:8,maxSpeed:1,maxSpin:.2,dwellS:1.5,
  })),
  berth:{local:{x:-270,z:0},radius:46,maxSpeed:2,maxSpin:.15,dwellS:2},
  route:{extraction:[{x:79,z:0},{x:-150,z:0},{x:-270,z:0}],
    // The inner/reverse side remains open; no teleport or invisible back wall.
    reverseEscape:[{x:79,z:-15},{x:165,z:-15},{x:175,z:-250},{x:-270,z:-250},{x:-270,z:0}],
    nominalRescueDistance:349,shoulderLength:240,shoulderWidth:175.43},
});

/** Normalize the existing adopted skin to fitPackagedGroup's max-axis scale.
 * Raw census coordinates are recentered exactly as the packaged renderer does.
 * Convex hulls are appropriate only for these solid individual rocks/towers,
 * never for the empty passage between them. No geometry asset is generated here.
 */
export function ninthMouthFittedManifest(assetId) {
  const row=modelTruthRow(assetId);
  const measured=modelTruthProxyManifest({type:'payload',radius:1,data:{placeId:assetId}});
  if(!row || !measured) throw new Error(`ninth_mouth_unmeasured_asset:${assetId}`);
  const reference=row.gameplay?.entityRadius || row.shell?.silhouetteRadius;
  const scale=reference*2/Math.max(...row.worldSize);
  const center=row.bounds.center,drawScale=row.drawScale || 1;
  // Census skins already include drawOffset. Undo both that offset and the
  // source bounds center before applying the renderer's centered max-axis fit.
  const offset=row.drawOffset || [0,0,0];
  const ox=(center[0]*drawScale+offset[0])/reference;
  const oz=(center[2]*drawScale+offset[2])/reference;
  const point=p=>({x:(p.x-ox)*scale,z:(p.z-oz)*scale});
  const hull=modelTruthSkinHull(row);
  return {...measured,id:`${id}:${assetId}:packaged-fit-v1`,referenceRadius:'radius',
    primitives:measured.primitives.map(p=>p.kind==='capsule'
      ? {...p,ax:(p.ax-ox)*scale,az:(p.az-oz)*scale,bx:(p.bx-ox)*scale,bz:(p.bz-oz)*scale,r:p.r*scale}
      : {...p,...point(p),...(p.kind==='circle'?{r:p.r*scale}:{hx:p.hx*scale,hz:p.hz*scale})}),
    ...(hull?{compactHull:hull.map(point)}:{}),
  };
}

/** Seven finite originals. The runtime adds the canonical ship separately. */
export function ninthMouthSpecs() {
  return definitions.map(d=>{
    const identity=`${id}:${d.role}`;
    const hull=d.role.startsWith('shoulder_')?10000:d.role.startsWith('lamp:')?80:400;
    return {type:'payload',team:0,factionId:null,homeSectorId:sectorId,
      pos:worldPoint(d.local),vel:{x:0,z:0},rot:d.rot,angVel:0,
      radius:d.radius,mass:d.mass,hull,hullMax:hull,shield:0,shieldMax:0,
      collides:true,collisionMask:DEFAULT_MASK.payload,
      flags:{persistent:true,missionPinned:true},
      physicsBody:{schemaVersion:1,radius:d.radius,mass:d.mass,dynamic:d.dynamic,
        inertiaY:.5*d.mass*d.radius*d.radius,shape:'compound',ccd:true,material:'payload',
        revision:0,collisionProxyManifest:ninthMouthFittedManifest(d.asset)},
      data:{ninthMouthRole:d.role,ninthMouthIdentity:identity,
        ...(d.role.startsWith('lamp:')?{ninthMouthInstalled:false,ninthMouthLight:true}:{}),
        persistenceOwner:'worldRecords',worldRecordId:identity,identityKey:identity,
        homeSectorId:sectorId,sectorId,transientSector:false,
        packagedPropFile:d.file,packagedPropSlot:'place',packagedPropRadius:d.radius,
        visualRadius:d.radius,name:d.name,scanLabel:d.name,
        combatProfileId:d.dynamic?'combat_profile_tether_payload':'combat_profile_tether_anchor',
        masslineTetherable:d.dynamic,physicalCustodyOnly:true,
        loot:[],salvagePool:{},authoredSalvagePool:{},lifetimeS:Infinity},
    };
  });
}
