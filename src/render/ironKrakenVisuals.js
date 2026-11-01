// Production mechanical octopus reconstructed from the owner's motion/anatomy reference.
// Shared machined geometry; private instance poses; simulation retains all combat authority.
import * as THREE from 'three';
import { ironKrakenProfileFor } from '../data/ironKraken.js';
import { IRON_KRAKEN_HEAVY, IRON_KRAKEN_COLOSSUS } from '../data/encounters/capital-boss/iron-kraken.js';
import { installIllustratedSurface } from './illustratedSurface.js';
import { buildIronKrakenHullGeometry, buildIronKrakenPumpGeometry, IRON_KRAKEN_MANTLE_HINGE, IRON_KRAKEN_OPTIC_RECESS, IRON_KRAKEN_OPTIC_SCALE } from './ironKrakenHullGeometry.js';
import { buildIronKrakenArmGeometry } from './ironKrakenArmGeometry.js';
import { sampleIronKrakenArm, ironKrakenArmRadius, ironKrakenBodyPose } from './ironKrakenMotion.js';
import { createIronKrakenAttackVfx } from './ironKrakenAttackVfx.js';

export const IRON_KRAKEN_ARM_COUNT = 8;
export const IRON_KRAKEN_LINKS_PER_ARM = 22;
const ARMS = IRON_KRAKEN_ARM_COUNT, LINKS = IRON_KRAKEN_LINKS_PER_ARM;
const TAU = Math.PI * 2;
const clamp = x => Math.max(0, Math.min(1, Number.isFinite(x) ? x : 0));
const smooth = x => { x = clamp(x); return x * x * (3 - 2 * x); };
const heavyBeats = new Map(IRON_KRAKEN_HEAVY.score.beats.map(b => [b.id, b]));
const colossalBeats = new Map(IRON_KRAKEN_COLOSSUS.score.beats.map(b => [b.id, b]));
let resources = null, interiorResources = null, distantArmResources = null;

function shared(value, name) {
  value.name = 'IronKraken_' + name;
  value.userData.spacefaceSharedAsset = true;
  if (value.isBufferGeometry) {
    value.computeBoundingSphere();
    value.setAttribute('sfHullPosition', value.attributes.position.clone());
  }
  return value;
}
function material(name, options, physical = false) {
  const m = physical ? new THREE.MeshPhysicalMaterial(options) : new THREE.MeshStandardMaterial(options);
  m.userData.spacefaceFinish = 'forge-v1';
  installIllustratedSurface(m);
  return shared(m, name);
}

/** Shared across both variants. Fine hardware is merged into its finish, never individual nodes. */
export function getIronKrakenVisualResources() {
  if (resources) return resources;
  const materials = {
    shell: material('ivory_enamel', { color: 0xd6d4ca, metalness: .08, roughness: .31,
      clearcoat: .32, clearcoatRoughness: .22 }, true),
    dark: material('carbon_machinery', { color: 0x171b1e, metalness: .22, roughness: .40 }),
    red: material('safety_vermilion', { color: 0xf25022, metalness: .08, roughness: .36 }),
    metal: material('machined_titanium', { color: 0xaab2b3, metalness: .58, roughness: .28 }),
    lens: material('coated_optical_glass', { color: 0x071015, metalness: .16, roughness: .085,
      clearcoat: 1, clearcoatRoughness: .07 }, true),
    window: material('inspection_glass', { color: 0x384549, metalness: .25, roughness: .17,
      transparent: true, opacity: .34, depthWrite: false, clearcoat: .65, clearcoatRoughness: .16 }, true),
  };
  const geometries = { ...buildIronKrakenHullGeometry({shared}), ...buildIronKrakenArmGeometry({shared}) };
  resources = { geometries, materials };
  return resources;
}

function getInteriorResources() {
  if (!interiorResources) interiorResources = buildIronKrakenPumpGeometry({shared});
  return interiorResources;
}

export function getIronKrakenDistantArmResources() {
  if (!distantArmResources) distantArmResources = buildIronKrakenArmGeometry({shared,detail:'distant'});
  return distantArmResources;
}

/** Pure fixed-clock choreography. Pass caller-owned output; no timer or simulation writes. */
export function ironKrakenAnimationPose(fight, simTime=0, a11y={}, out={}) {
  const live = !!fight && !fight.suspended && !fight.terminal;
  const beats = fight?.encounterId === IRON_KRAKEN_COLOSSUS.id ? colossalBeats : heavyBeats;
  const cast = live ? fight.cast : null, beat = cast ? beats.get(cast.beatId) : null;
  const age = beat ? Math.max(0,fight.clock-cast.startedAt) : 0;
  const active = !!beat && age>=beat.tellTicks && age<beat.tellTicks+beat.activeTicks;
  const charge = beat ? smooth(age/beat.tellTicks) : 0;
  const recovery=live&&fight.phase==='recovery'?fight.recovery:null;
  const remaining=recovery?Math.max(0,recovery.durationTicks-(fight.clock-recovery.startedAt)):
    live&&fight.phase==='recovery'?Math.max(0,fight.nextAt-fight.clock):0;
  const recoveryAge=recovery?Math.max(0,fight.clock-recovery.startedAt):remaining?12:0;
  const release=remaining?smooth((recoveryAge+1)/9)*smooth(remaining/18):0;
  out.time = Number.isFinite(fight?.clock) ? fight.clock/60 : (Number.isFinite(simTime)?simTime:0);
  out.attackId=beat?.id||null;
  out.active=active;
  out.activeProgress=active?clamp((age-beat.tellTicks)/beat.activeTicks):0;
  out.tellProgress=beat?clamp(age/beat.tellTicks):0;
  out.jet = beat?.id==='siphon_jet' ? (active?1:charge*.86) : 0;
  out.jetActive = beat?.id==='siphon_jet' && active;
  out.rake = beat?.id==='arm_rake' ? (active?1:charge*.7) : 0;
  out.rakeActive=beat?.id==='arm_rake'&&active;
  out.rakeProgress=out.rakeActive?out.activeProgress:recovery?.beatId==='arm_rake'?1:0;
  out.ink = beat?.id==='ink_ring' ? (active?1:charge*.6) : 0;
  out.inkActive = beat?.id==='ink_ring' && active;
  // The reference's shell opening is purposeful service travel, not a bloom after every
  // gesture. Ring discharge vents the mantle; every attack exposes the actual front throat.
  out.mantle = out.inkActive?.82:recovery?.beatId==='ink_ring'?release*.92:
    beat?.id==='ink_ring'?charge*.24:0;
  out.aperture=release;
  out.recovery=remaining>0;
  out.charge = beat ? (active?1:charge) : 0;
  out.reducedMotion = !!a11y.reducedMotion; out.reducedFlash = !!a11y.reducedFlash;
  out.missingShellMask = 0;
  if (live && Array.isArray(fight.plates)) for (const p of fight.plates) {
    if (p.attached===false && p.id==='mantle_port') out.missingShellMask |= 1<<6;
    if (p.attached===false && p.id==='mantle_starboard') out.missingShellMask |= 1<<2;
  }
  return out;
}

function mesh(parent, geometry, material, name) {
  const m = new THREE.Mesh(geometry,material); m.name=name; m.castShadow=m.receiveShadow=true;
  parent.add(m); return m;
}
function instances(parent, geometry, material, count, name) {
  const m = new THREE.InstancedMesh(geometry,material,count); m.name=name;
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.frustumCulled=false;
  m.castShadow=m.receiveShadow=true; parent.add(m); return m;
}

/** The same primary character asset is used by the normal game and the inspection harness. */
export function createIronKrakenVisual(entity) {
  const profile = ironKrakenProfileFor(entity);
  if (!profile) throw new Error('Iron Kraken visual requires an Iron Kraken enemy identity');
  const {geometries:g,materials:m}=getIronKrakenVisualResources();
  const root = new THREE.Group(), body = new THREE.Group();
  root.name = `IronKraken_${profile.variant}`; body.name='eight_arm_pressure_body';
  body.scale.setScalar(profile.coreRadius); root.add(body);
  mesh(body,g.hull,m.shell,'ivory_pressure_hull');
  mesh(body,g.hullDark,m.dark,'black_lower_collar');
  mesh(body,g.hullMetal,m.metal,'root_actuator_clamps');
  mesh(body,g.hullRed,m.red,'warning_livery');
  // Per-body emission is not shared: one charging creature cannot blink every other one.
  const glow=material('live_optical_response',{color:0xff6b24,emissive:0xff4b13,emissiveIntensity:.25,
    roughness:.42,metalness:.2});
  delete glow.userData.spacefaceSharedAsset;
  const eyeDark=instances(body,g.eyeDark,m.dark,2,'telescoping_optical_barrels');
  const eyeMetal=instances(body,g.eyeMetal,m.dark,2,'camera_iris_mechanisms');
  const eyeOrange=instances(body,g.eyeOrange,m.red,2,'optical_pressure_seals');
  const eyeGlass=instances(body,g.eyeLens,m.lens,2,'convex_camera_glass');
  const eyeGlints=instances(body,g.eyeGlints,m.metal,2,'internal_optical_elements');
  const eyeSignals=instances(body,g.eyeSignals,glow,2,'optical_status_indicators');
  const eyeMeshes=[eyeDark,eyeMetal,eyeOrange,eyeGlass,eyeGlints,eyeSignals];
  const shell=instances(body,g.shell,m.shell,ARMS,'opening_mantle_petals');
  const shellDetail=instances(body,g.shellDetail,m.dark,ARMS,'mantle_ports_and_fasteners');
  const shellAccent=instances(body,g.shellAccent,m.red,ARMS,'mantle_warning_plates');
  const shellMetal=instances(body,g.shellMetal,m.metal,ARMS,'glazed_port_actuators');
  const shellGlass=instances(body,g.shellGlass,m.window,ARMS,'mantle_inspection_windows');
  const shellBlank=instances(body,g.shellBlank,m.shell,ARMS,'solid_mantle_service_panels');
  const armor=instances(body,g.armor,m.shell,ARMS*LINKS,'articulated_arm_armor');
  const joints=instances(body,g.joint,m.dark,ARMS*LINKS,'exposed_universal_joints');
  const pivots=instances(body,g.pivot,m.dark,ARMS*LINKS,'retained_spherical_arm_bearings');
  const hardware=instances(body,g.hardware,m.dark,ARMS*LINKS,'arm_service_panels');
  const stripes=instances(body,g.stripe,m.red,ARMS*LINKS,'arm_warning_strips');
  const sleeveDetail=instances(body,g.sleeveDetail,m.metal,ARMS*LINKS,'arm_fasteners_and_rims');
  const jointMetal=instances(body,g.jointMetal,m.metal,ARMS*LINKS,'exposed_piston_rods');
  const jointRed=instances(body,g.jointRed,m.red,ARMS*LINKS,'gimbal_axis_caps');
  const suckers=instances(body,g.sucker,m.red,ARMS*LINKS,'red_suction_rims');
  const suckerCores=instances(body,g.suckerCore,m.dark,ARMS*LINKS,'dark_suction_cups');
  const jaws=[mesh(body,g.beak,m.dark,'siphon_jaw_left'),mesh(body,g.beak,m.dark,'siphon_jaw_right')];
  jaws[0].position.set(0,-.79,0); jaws[1].position.set(0,-.79,0); jaws[1].rotation.y=Math.PI;
  for(const jaw of jaws) {mesh(jaw,g.beakRed,m.red,'siphon_safety_mark');mesh(jaw,g.beakMetal,m.metal,'siphon_split_seal');}
  const crown=new THREE.Group();crown.name='pressure_cap_on_telescoping_spindle';body.add(crown);
  mesh(crown,g.crown,m.dark,'crown_pressure_cap');mesh(crown,g.crownMetal,m.metal,'crown_locking_screws');
  const capSpindle=mesh(body,g.capSpindle,m.metal,'continuous_cap_support');
  const capSleeve=mesh(body,g.capSleeve,m.dark,'cap_support_gland');capSleeve.position.y=1.10;
  const hingePins=instances(body,g.hingePin,m.metal,ARMS,'retained_mantle_hinge_pins');
  const shutters=[];
  for(let i=0;i<2;i++) {
    const shutter=new THREE.Group();shutter.name='hinged_front_aperture_'+i;
    shutter.position.set(.994,-.275,i===0?.147:-.147);
    mesh(shutter,g.apertureShutter,m.shell,'recovery_throat_cover');body.add(shutter);shutters.push(shutter);
  }
  const attackVfx=createIronKrakenAttackVfx(root,profile);body.add(attackVfx.aperture);
  const presentedOwner={id:entity.id,alive:true,hull:entity.hull,pos:{x:0,z:0},rot:0};
  const pose={},motionPose={},bodyPose={},points=new Float32Array(ARMS*(LINKS+1)*3),frames=new Float32Array(ARMS*LINKS*9);
  const matrix=new THREE.Matrix4(),basis=new THREE.Matrix4(),q=new THREE.Quaternion();
  const position=new THREE.Vector3(),scale=new THREE.Vector3(),tangent=new THREE.Vector3();
  const normal=new THREE.Vector3(),binormal=new THREE.Vector3(),yAxis=new THREE.Vector3(0,1,0);
  const yawQ=new THREE.Quaternion(),hingeQ=new THREE.Quaternion(),zAxis=new THREE.Vector3(0,0,1);
  const cupFlip=new THREE.Quaternion().setFromAxisAngle(yAxis,Math.PI),cupQ=new THREE.Quaternion();
  const armMeshes=[armor,joints,hardware,stripes,suckers,suckerCores,sleeveDetail,jointMetal,jointRed,pivots];
  const armKeys=['armor','joint','hardware','stripe','sucker','suckerCore','sleeveDetail','jointMetal','jointRed','pivot'];
  const armorMeshes=[armor,hardware,stripes,sleeveDetail];
  const jointMeshes=[joints,jointMetal,jointRed];
  const cupMeshes=[suckers,suckerCores];
  const shellMeshes=[shell,shellDetail,shellAccent,shellMetal,shellGlass];
  let interior=null,disposed=false,lastTime=null,lastClock=null,lastA11y='',jetBlend=0,mantleBlend=0;
  let rakeBlend=0,rakeProgress=0,inkCurlBlend=0,inkLiftBlend=0,apertureBlend=0,locomotionBlend=0,turnBlend=0,recoilBlend=0;
  let cachedFightId=null,previousHull=entity.hull??entity.hp??0;
  let lastFightId=null,lastPhase=null,lastCastId=null,lastShellMask=-1,lastSuspended=false,lastTerminal=null;
  let detailLevel='close';
  const viewPoint=new THREE.Vector3();
  const ownerId=entity.id;
  const write=(target,index,x,y,z,sx,sy,sz)=>{
    position.set(x,y,z);scale.set(sx,sy,sz);matrix.compose(position,q,scale);target.setMatrixAt(index,matrix);
  };
  function update(liveEntity,simTime=0,a11y={},state=null) {
    if(disposed||!liveEntity||liveEntity.id!==ownerId)return;
    // Read the actual camera and head size, never the much larger attack/culling envelope.
    // This runs before the clock guard so zooming a paused game can change mesh detail without
    // moving an arm. Hysteresis prevents repeated buffer changes around the transition distance.
    const camera=state?.render?.camera,canvas=state?.render?.renderer?.domElement;
    const height=canvas?.clientHeight||canvas?.height||0;
    if(camera?.projectionMatrix&&height>0) {
      root.updateWorldMatrix(true,false);camera.updateMatrixWorld();
      viewPoint.setFromMatrixPosition(root.matrixWorld).applyMatrix4(camera.matrixWorldInverse);
      const diameter=profile.coreRadius*height*Math.abs(camera.projectionMatrix.elements[5])
        /(camera.isOrthographicCamera?1:Math.max(.001,-viewPoint.z));
      const rig=root.userData.ironKrakenRig;
      rig.headDiameterPx=diameter;
      const next=detailLevel==='close'?(diameter<128?'distant':'close'):(diameter>160?'close':'distant');
      if(next!==detailLevel) {
        const shapes=next==='distant'?getIronKrakenDistantArmResources():g;
        for(let i=0;i<armMeshes.length;i++)armMeshes[i].geometry=shapes[armKeys[i]];
        stripes.visible=sleeveDetail.visible=next==='close';
        detailLevel=next;rig.detailLevel=next;
      }
    }
    const fights=state?.capitalBossEncounters?.fights;
    let fight=fights?.[liveEntity.data?.ironKraken?.fightId||cachedFightId];
    // Fight assignment may arrive after spawn in a worker read model. Resolve it once by its
    // canonical owner id; never invent a private attack clock when the record already exists.
    if(!fight&&fights)for(const id in fights)if(fights[id]?.bossId===liveEntity.id){fight=fights[id];cachedFightId=id;break;}
    const time=Number.isFinite(state?.simTime)?state.simTime:simTime;
    const a11yKey=(a11y.reducedMotion?'m':'')+(a11y.reducedFlash?'f':'');
    ironKrakenAnimationPose(fight,time,a11y,pose);
    let fieldOwner=liveEntity;
    if(root.parent&&state?.render) {
      // The root has already received the renderer's interpolated body transform. Invert
      // that exact pose, not the newer sim pose, or a committed field swims with interpolation.
      root.updateWorldMatrix(true,false);
      const e=root.matrixWorld.elements,origin=state?.world?.frameOrigin;
      presentedOwner.id=liveEntity.id;presentedOwner.alive=liveEntity.alive;
      presentedOwner.hull=liveEntity.hull;
      presentedOwner.pos.x=e[12]+(origin?.x||0);presentedOwner.pos.z=e[14]+(origin?.z||0);
      presentedOwner.rot=Math.atan2(e[2],e[0]);fieldOwner=presentedOwner;
    }
    attackVfx.update(fieldOwner,fight,pose,time,a11y);
    const currentHull=liveEntity.hull??liveEntity.hp??previousHull;
    if(time===lastTime&&fight?.clock===lastClock&&a11yKey===lastA11y
      &&fight?.phase===lastPhase&&fight?.cast?.id===lastCastId&&pose.missingShellMask===lastShellMask
      &&!!fight?.suspended===lastSuspended&&fight?.terminal===lastTerminal&&currentHull===previousHull)return;
    const reset=lastTime===null||time<lastTime||fight?.fightId!==lastFightId
      ||(Number.isFinite(fight?.clock)&&Number.isFinite(lastClock)&&fight.clock<lastClock);
    const dt=lastTime===null?0:Math.max(0,Math.min(.25,time-lastTime));
    lastTime=time;lastClock=fight?.clock;lastA11y=a11yKey;lastFightId=fight?.fightId;
    lastPhase=fight?.phase;lastCastId=fight?.cast?.id;lastShellMask=pose.missingShellMask;
    lastSuspended=!!fight?.suspended;lastTerminal=fight?.terminal;
    // Restoring/rewinding a fight must not carry a future jet or opening into its past.
    // Same-clock discrete receipts (plate detach, cancellation, accessibility) still apply.
    const blend=reset||dt===0?1:1-Math.exp(-dt*8);
    const jetEase=reset||dt===0?1:1-Math.exp(-dt*(pose.jet<jetBlend?3.6:7));
    jetBlend+=(pose.jet-jetBlend)*jetEase;mantleBlend+=(pose.mantle-mantleBlend)*blend;
    rakeBlend+=(pose.rake-rakeBlend)*blend;
    if(reset)rakeProgress=pose.rakeProgress;
    else if(pose.rakeActive)rakeProgress=pose.rakeProgress;
    else if(pose.recovery)rakeProgress=1;
    else if(rakeBlend<.01)rakeProgress=0;
    apertureBlend+=(pose.aperture-apertureBlend)*blend;
    const speed=Math.hypot(liveEntity.vel?.x||0,liveEntity.vel?.z||0);
    locomotionBlend+=(clamp(speed/profile.maxSpeed)-locomotionBlend)*blend;
    const turn=Math.max(-1,Math.min(1,(liveEntity.angVel||0)/profile.turnRate));
    turnBlend+=(turn-turnBlend)*blend;
    const hull=currentHull;
    if(reset)recoilBlend=0;
    if(!reset&&hull<previousHull)recoilBlend=Math.min(1,recoilBlend+(previousHull-hull)/Math.max(1,profile.hull)*12);
    previousHull=hull;recoilBlend*=Math.exp(-dt*7);
    inkCurlBlend+=((pose.inkActive?-.64:.36)*pose.ink-inkCurlBlend)*blend;
    inkLiftBlend+=((pose.inkActive?-.28:.65)*pose.ink-inkLiftBlend)*blend;
    const t=pose.time,quiet=pose.reducedMotion?0:1;
    motionPose.time=t;motionPose.reducedMotion=pose.reducedMotion;
    motionPose.jet=jetBlend;motionPose.rake=rakeBlend;motionPose.mantle=mantleBlend;
    motionPose.inkCurl=inkCurlBlend;motionPose.inkLift=inkLiftBlend;
    motionPose.rakeProgress=rakeProgress;motionPose.locomotion=locomotionBlend;
    motionPose.turn=turnBlend;motionPose.recoil=pose.reducedMotion?0:recoilBlend;
    ironKrakenBodyPose(motionPose,bodyPose);
    body.position.y=bodyPose.liftY*profile.coreRadius;
    body.rotation.x=bodyPose.rollX;
    body.rotation.z=bodyPose.pitchZ;
    // The canonical helm turns the physical creature. Rotating the hull independently used
    // to conceal a torque-control bug and separated the visible face from its weak point.
    body.rotation.y=0;
    glow.emissiveIntensity=pose.reducedFlash?.28:.24+pose.charge*.65+mantleBlend*.35;
    crown.position.y=1.195+mantleBlend*.34;
    crown.rotation.y=0;
    const spindleBase=1.02,spindleEnd=crown.position.y;
    capSpindle.position.y=(spindleBase+spindleEnd)*.5;capSpindle.scale.y=spindleEnd-spindleBase;
    capSpindle.visible=capSleeve.visible=mantleBlend>.005;
    for(let i=0;i<2;i++)shutters[i].rotation.set(i===0?0:Math.PI,-apertureBlend*1.2*(i===0?1:-1),0);
    for(let i=0;i<2;i++) {
      const a=i===0?-.59:.59;
      tangent.set(Math.cos(a),.075,Math.sin(a)).normalize();q.setFromUnitVectors(yAxis,tangent);
      const focus=IRON_KRAKEN_OPTIC_RECESS+pose.charge*.036+apertureBlend*.065
        +quiet*Math.sin(t*1.2+i*.65)*.005;
      for(const part of eyeMeshes)write(part,i,Math.cos(a)*.88+tangent.x*focus,.04+tangent.y*focus,
        Math.sin(a)*.88+tangent.z*focus,IRON_KRAKEN_OPTIC_SCALE,1,IRON_KRAKEN_OPTIC_SCALE);
    }
    for(const part of eyeMeshes)part.instanceMatrix.needsUpdate=true;
    for(let i=0;i<ARMS;i++) {
      const a=i*TAU/ARMS,absent=(pose.missingShellMask&(1<<i))!==0;
      yawQ.setFromAxisAngle(yAxis,-a);hingeQ.setFromAxisAngle(zAxis,-mantleBlend*1.40);
      q.copy(yawQ).multiply(hingeQ);
      const hinge=IRON_KRAKEN_MANTLE_HINGE;
      for(const part of shellMeshes)write(part,i,Math.cos(a)*hinge.radius,hinge.height,
        Math.sin(a)*hinge.radius,absent?0:1,absent?0:1,absent?0:1);
      const covered=!absent&&i%2===0;
      write(shellBlank,i,Math.cos(a)*hinge.radius,hinge.height,Math.sin(a)*hinge.radius,
        covered?1:0,covered?1:0,covered?1:0);
      tangent.set(-Math.sin(a),0,Math.cos(a));q.setFromUnitVectors(yAxis,tangent);
      write(hingePins,i,Math.cos(a)*hinge.radius,hinge.height,Math.sin(a)*hinge.radius,absent?0:1,absent?0:1,absent?0:1);
    }
    hingePins.instanceMatrix.needsUpdate=true;
    shellBlank.instanceMatrix.needsUpdate=true;
    for(const part of shellMeshes)part.instanceMatrix.needsUpdate=true;
    if(mantleBlend>.02&&!interior) {
      const inside=getInteriorResources();interior=new THREE.Group();interior.name='reveal_only_pump';
      mesh(interior,inside.dark,m.dark,'pump_cylinders_gears_and_hoses');mesh(interior,inside.steel,m.metal,'pump_tie_rods');
      mesh(interior,inside.metal,m.metal,'pump_pistons_and_bearings');
      mesh(interior,inside.orange,m.red,'pump_pressure_seals');body.add(interior);
      root.userData.ironKrakenRig.interior=interior;
    }
    if(interior){interior.visible=mantleBlend>.015;interior.position.y=mantleBlend*.22;
      interior.scale.set(1,1,1);interior.rotation.y=0;}
    jaws[0].rotation.x=-(pose.ink*.32+pose.rake*.12);jaws[1].rotation.x=pose.ink*.32+pose.rake*.12;
    // Long manufactured sleeves flow into a hanging middle and a tightly coiled fine tip.
    // The motion sampler writes private points and orthonormal frames without scene allocation.
    for(let arm=0;arm<ARMS;arm++) {
      const start=arm*(LINKS+1)*3,frameStart=arm*LINKS*9;
      sampleIronKrakenArm(arm,motionPose,points,start,frames,frameStart,LINKS);
      for(let link=0;link<LINKS;link++) {
        const point=start+link*3,next=point+3,frame=frameStart+link*9;
        const x=points[point],y=points[point+1],z=points[point+2];
        const nx=points[next],ny=points[next+1],nz=points[next+2];
        const length=Math.hypot(nx-x,ny-y,nz-z);
        binormal.fromArray(frames,frame);tangent.fromArray(frames,frame+3);normal.fromArray(frames,frame+6);
        basis.makeBasis(binormal,tangent,normal);q.setFromRotationMatrix(basis);
        const radius=ironKrakenArmRadius(link,LINKS),index=arm*LINKS+link;
        const cx=(x+nx)*.5,cy=(y+ny)*.5,cz=(z+nz)*.5;
        const sleeveLength=length*(link<4?.72:.80);
        for(const part of armorMeshes)write(part,index,cx,cy,cz,radius,sleeveLength,radius);
        const cup=radius*(link<4?.80:.55);
        cupQ.copy(q).multiply(cupFlip);q.copy(cupQ);
        for(const part of cupMeshes)write(part,index,cx-normal.x*radius*.94,
          cy-normal.y*radius*.94,cz-normal.z*radius*.94,cup,cup,cup);
        // Fit exposed hydraulics between the actual adjacent barrel ends. A bridge oriented
        // only to the outgoing link can detach from the preceding barrel on a tight bend.
        const gap=(length-sleeveLength)*.5;
        let ax,ay,az;
        if(link===0){const a=arm*TAU/ARMS+Math.PI/8;ax=x-Math.cos(a)*.085;ay=y;az=z-Math.sin(a)*.085;}
        else {
          const prev=point-3,plen=Math.hypot(x-points[prev],y-points[prev+1],z-points[prev+2]);
          const pgap=plen*(link-1<4?.14:.10);
          ax=x-(x-points[prev])/plen*pgap;ay=y-(y-points[prev+1])/plen*pgap;az=z-(z-points[prev+2])/plen*pgap;
        }
        const bx=x+tangent.x*gap,by=y+tangent.y*gap,bz=z+tangent.z*gap;
        position.set(bx-ax,by-ay,bz-az);const jointLength=position.length();position.multiplyScalar(1/Math.max(1e-6,jointLength));
        q.setFromUnitVectors(yAxis,position);
        for(const part of jointMeshes)write(part,index,(ax+bx)*.5,(ay+by)*.5,(az+bz)*.5,radius*.73,jointLength+radius*.14,radius*.73);
        q.identity();write(pivots,index,x,y,z,radius*.32,radius*.32,radius*.32);
      }
    }
    for(const part of armMeshes)part.instanceMatrix.needsUpdate=true;
  }
  root.userData.kind='ship';root.userData.animated=true;
  root.userData.authoredAssetState='authored';root.userData.authoredVisualRoot='iron-kraken-articulated';
  root.userData.generatedVisualProducer='iron-kraken-reference-character-v3';
  root.userData.visualLanguage='ivory_pressure_shell_vermilion_optics_eight_arms';
  // A cast is world-locked while its body lunges. Include both the full pressure lane and
  // a one-second movement allowance, so its far end cannot disappear with the head off glass.
  const visualReach=Math.max(profile.armReach*1.08,profile.jetLength+profile.maxSpeed+profile.coreRadius);
  root.userData.visualBounds={center:[0,0,0],size:[visualReach*2,profile.armReach*2.16,visualReach*2]};
  root.userData.ironKrakenRig={body,armor,joints,pivots,suckers,shell,shellDetail,shellAccent,points,frames,eyeMeshes,shutters,crown,capSpindle,attackVfx,interior:null,profile,pose,
    detailLevel:'close',headDiameterPx:null};
  root.userData.updateAuthoredMotion=update;
  root.userData.detachAuthoredMotion=()=>{
    if(disposed)return;disposed=true;attackVfx.dispose();
    for(const part of [...armMeshes,...shellMeshes,...eyeMeshes,hingePins,shellBlank])part.dispose();
    delete root.userData.updateAuthoredMotion;
  };
  // Explicit tooling teardown; live teardown uses detachAuthoredMotion then the normal disposer.
  root.userData.disposeIronKraken=()=>{
    root.userData.detachAuthoredMotion();glow.dispose();root.removeFromParent();
  };
  update(entity,0,{});
  return root;
}
