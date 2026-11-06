// Mechanical arm hardware reconstructed from the owner's octopus reference.
// All pieces are reusable geometry batches. The caller owns instancing, materials and pose.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const Y = new THREE.Vector3(0,1,0), Z = new THREE.Vector3(0,0,1);

function move(geometry,x=0,y=0,z=0,rx=0,ry=0,rz=0) {
  geometry.rotateX(rx); geometry.rotateY(ry); geometry.rotateZ(rz);
  geometry.translate(x,y,z); return geometry;
}

function lathe(profile,segments=20) {
  return new THREE.LatheGeometry(profile.map(([radius,y])=>new THREE.Vector2(radius,y)),segments);
}

function cylinder(radius,length,segments=8,open=true) {
  return new THREE.CylinderGeometry(radius,radius,length,segments,1,open);
}

function radial(geometry,angle,radius,y,axis=Y) {
  const direction=new THREE.Vector3(Math.sin(angle),0,Math.cos(angle));
  geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(axis,direction));
  geometry.translate(direction.x*radius,y,direction.z*radius);
  return geometry;
}

// A curved patch seated on the opaque barrel. Its back and edge faces would be buried in that
// barrel, so they are not generated. The actual shield supplies its volume at every angle.
function barrelPatch(radius,angle,width,from,to,steps=4) {
  const positions=[];
  const p=(a,y,r)=>[Math.sin(a)*r,y,Math.cos(a)*r];
  const quad=(a,b,c,d)=>positions.push(...a,...b,...c,...a,...c,...d);
  const start=angle-width/2;
  for(let i=0;i<steps;i++) {
    const a=start+width*i/steps,b=start+width*(i+1)/steps;
    quad(p(a,from,radius),p(b,from,radius),p(b,to,radius),p(a,to,radius));
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.computeVertexNormals();
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(positions.length/3*2),2));
  return geometry;
}

function band(radius,y,width=.018,segments=16) {
  return lathe([[radius,y-width/2],[radius,y+width/2]],segments);
}

function washer(inner,outer,y,face=1,segments=16) {
  return lathe(face>0?[[outer,y],[inner,y]]:[[inner,y],[outer,y]],segments);
}

function fastener(black,metal,angle,y,radius=1.008,size=.026) {
  // At the reference scale these are tiny seated washer/hex surfaces, not hidden screw bodies.
  const seat=new THREE.CircleGeometry(size*1.55,8);seat.scale(1,.55,1);
  black.push(radial(seat,angle,radius,y,Z));
  const head=new THREE.CircleGeometry(size,6);head.scale(1,.55,1);
  metal.push(radial(head,angle,radius+.013,y,Z));
}

/**
 * Geometry contract:
 * - armor / hardware / stripe / sleeveDetail: +Y axial, length 1, radius approximately 1.
 *   Place at the link midpoint with scale(radius, sleeveLength, radius). At a root the reference
 *   sleeveLength is approximately its diameter; squashing Y makes these broad shields beads.
 * - joint / jointMetal / jointRed: around the link boundary, X/Z scale(radius*.73); the rig
 *   lengthens the first four hydraulic bays in Y to expose the large shoulder mechanisms.
 * - sucker / suckerCore: a 2-by-2 cluster, +Z outward, X lateral, Y axial. Uniform scale(radius*.8)
 *   at the four large shoulders, radius*.55 along the fine tail so cups clear adjacent sleeves.
 *   Its four circular cups form two rows without allocating four scene nodes or stretching discs.
 * All outputs are single-material merged buffers; shared() stamps the caller's cache ownership.
 * `detail:'distant'` retains the same transforms and nine keys. The stripe and sleeveDetail
 * buffers are empty: their two meshes must be hidden by the caller at distant size. All other
 * families retain the barrel profile, four rods, four cup mounts and exterior axle silhouette.
 */
export function buildIronKrakenArmGeometry({shared,detail='full'}={}) {
  if(typeof shared!=='function')throw new TypeError('Iron Kraken arm geometry requires the shared asset stamp');
  if(detail!=='full'&&detail!=='distant')throw new TypeError('Iron Kraken arm detail must be full or distant');
  const distant=detail==='distant';
  const parts={armor:[],joint:[],sucker:[],suckerCore:[],hardware:[],stripe:[],jointMetal:[],jointRed:[],sleeveDetail:[]};
  // Wide, nearly straight enamel walls, soft machined shoulders, and visible open collar lips.
  // Most axial distance belongs to the white barrel, rather than to a round toroidal bulge.
  parts.armor.push(lathe([[.80,-.50],[.91,-.495],[.985,-.44],[1,-.36],[.985,.32],
    [.94,.445],[.84,.50],[.76,.485],[.75,-.465],[.80,-.50]],distant?12:16));
  // Dark end gaskets and recessed end caps read between white shields and silver mechanisms.
  parts.hardware.push(washer(.53,.812,-.481,-1,distant?8:16),washer(.53,.785,.486,1,distant?8:16));
  // Dorsal access panel, a narrow opposite seam, and transverse manufacturing joints.
  parts.hardware.push(barrelPatch(1.006,0,.35,-.325,.305,distant?2:5));
  parts.hardware.push(barrelPatch(1.006,Math.PI,.019,-.34,.33,1));
  if(!distant) {
    parts.hardware.push(band(1.004,-.145,.007));
    parts.sleeveDetail.push(barrelPatch(1.012,0,.24,-.21,-.194,3),
      barrelPatch(1.012,0,.24,.181,.197,3));
    for(const angle of [-.55,.55,Math.PI-.55,Math.PI+.55]) {
      fastener(parts.hardware,parts.sleeveDetail,angle,-.315);
      fastener(parts.hardware,parts.sleeveDetail,angle,.285);
    }
    for(const angle of [-.225,.225]) {
      fastener(parts.hardware,parts.sleeveDetail,angle,-.255,1.008,.021);
      fastener(parts.hardware,parts.sleeveDetail,angle,.247,1.008,.021);
    }
    // Thin exposed metal collar rims catch a separate highlight without turning the enamel gray.
    parts.sleeveDetail.push(washer(.81,.86,-.503,-1),washer(.79,.84,.503,1));
    // A red pinstripe and small service mark. These are paint/plates, never text or borrowed branding.
    parts.stripe.push(band(1.004,-.407,.014));
    parts.stripe.push(barrelPatch(1.019,0,.13,-.145,-.045,2));
    parts.stripe.push(barrelPatch(1.006,.72,.08,.16,.30,1));
  }

  // Articulating black gimbal between shields: round center, two end clevises, four hydraulic
  // barrels, and a transverse axle. Everything here remains exterior, exposed mechanical work.
  const ball=new THREE.SphereGeometry(.42,distant?6:8,distant?3:4);ball.scale(1,.84,1);parts.joint.push(ball);
  parts.joint.push(move(cylinder(.87,.10,distant?8:12),0,-.445,0),move(cylinder(.83,.10,distant?8:12),0,.445,0));
  parts.joint.push(move(cylinder(.21,1.79,distant?6:8),0,0,0,0,0,Math.PI/2));
  for(const angle of [Math.PI/4,Math.PI*3/4,Math.PI*5/4,Math.PI*7/4]) {
    const x=Math.sin(angle)*.66,z=Math.cos(angle)*.66;
    parts.joint.push(move(cylinder(.108,.40,6),x,-.14,z));
    parts.jointMetal.push(move(cylinder(.06,.58,6),x,.15,z));
    if(!distant)parts.jointMetal.push(move(cylinder(.125,.06,6),x,.425,z));
  }
  parts.jointMetal.push(band(.91,-.47,.055,distant?8:12),washer(.81,.91,-.4975,-1,distant?8:12),
    band(.875,.47,.055,distant?8:12),washer(.78,.875,.4975,1,distant?8:12));
  // Exposed axis caps: dull metal surround, red center, small dark center bolt.
  for(const side of [-1,1]) {
    parts.jointMetal.push(radial(new THREE.CircleGeometry(.26,distant?8:12),side*Math.PI/2,.933,0,Z));
    parts.jointRed.push(radial(new THREE.CircleGeometry(.175,distant?8:12),side*Math.PI/2,.94,0,Z));
    parts.joint.push(radial(new THREE.CircleGeometry(.075,distant?6:8),side*Math.PI/2,.961,0,Z));
  }

  // Four small cups per sleeve, two rows. Each has a dark backing, a dished throat and a thin
  // red working rim. +Z is the face; the rig rotates this cluster toward its underside (-dorsal).
  const cupProfile=distant?[[.39,-.04],[.39,.115],[0,.025]]
    :[[0,-.04],[.39,-.04],[.39,.115],[.19,.025],[0,.025]];
  for(const x of [-.49,.49])for(const y of [-.48,.48]) {
    parts.suckerCore.push(move(lathe(cupProfile,8),x,y,0,Math.PI/2));
    const rim=distant?new THREE.RingGeometry(.235,.377,8):lathe([[.235,.111],[.377,.111],[.388,.126],[.37,.143],[.235,.143]],8);
    if(!distant)rim.rotateX(Math.PI/2);
    parts.sucker.push(move(rim,x,y,distant?.126:0));
  }

  const result={};
  // A true spherical bearing at every FK endpoint keeps the joint connected when adjacent
  // sleeves bend in different directions. The hydraulic bridge is separately fitted between
  // the actual sleeve ends by the rig; stretching one joint along the outgoing link left gaps.
  const bearing=new THREE.SphereGeometry(1,distant?6:8,distant?4:6);
  bearing.computeBoundingBox();bearing.computeBoundingSphere();
  result.pivot=shared(bearing,`arm_endpoint_bearing${distant?'_distant':''}`);
  for(const [key,geometryParts] of Object.entries(parts)) {
    const name=`arm_${key}${distant?'_distant':''}`;
    if(!geometryParts.length) {
      // A complete empty buffer is safe for the same instancing/cache interface. Do not call
      // mergeGeometries([]), which cannot infer attributes and would reject the hidden family.
      const geometry=new THREE.BufferGeometry();
      geometry.setAttribute('position',new THREE.Float32BufferAttribute([],3));
      geometry.setAttribute('normal',new THREE.Float32BufferAttribute([],3));
      geometry.setAttribute('uv',new THREE.Float32BufferAttribute([],2));
      geometry.computeBoundingBox();geometry.computeBoundingSphere();
      result[key]=shared(geometry,name);continue;
    }
    const flattened=geometryParts.map(geometry=>{
      const flat=geometry.index?geometry.toNonIndexed():geometry;
      if(flat!==geometry)geometry.dispose();flat.clearGroups();return flat;
    });
    const geometry=mergeGeometries(flattened,false);
    for(const part of flattened)part.dispose();
    if(!geometry)throw new Error(`Iron Kraken arm geometry merge failed: ${key}`);
    geometry.computeBoundingBox();geometry.computeBoundingSphere();
    result[key]=shared(geometry,name);
  }
  return result;
}
