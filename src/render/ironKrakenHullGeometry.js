// Reference reconstruction: a pressure sphere, eight glazed service petals, machined optical
// barrels and a reveal-only pump. All dimensions are in head-radius units; +X is the nose.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const IRON_KRAKEN_MANTLE_HINGE = Object.freeze({ radius: .972, height: .22 });
const TAU = Math.PI * 2;
const UP = new THREE.Vector3(0, 1, 0);

function moved(g, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  g.rotateX(rx); g.rotateY(ry); g.rotateZ(rz); g.translate(x, y, z); return g;
}
function lathe(points, steps = 32, start = 0, sweep = TAU) {
  return new THREE.LatheGeometry(points.map(p => new THREE.Vector2(p[0], p[1])), steps, start, sweep);
}
function ring(r, tube, y, segments = 48) {
  return moved(new THREE.TorusGeometry(r, tube, 4, segments), 0, y, 0, Math.PI / 2);
}
function merge(parts, name, shared) {
  const flat = parts.map(g => {
    const n = g.index ? g.toNonIndexed() : g;
    if (n !== g) g.dispose();
    n.clearGroups();
    if (!n.attributes.uv) n.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n.attributes.position.count * 2), 2));
    return n;
  });
  const result = mergeGeometries(flat, false);
  for (const g of flat) g.dispose();
  if (!result) throw new Error('Kraken hull geometry mismatch: ' + name);
  return shared(result, name);
}
function axis(g, direction, center) {
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, direction.clone().normalize()));
  g.translate(center.x, center.y, center.z); return g;
}
function rod(a, b, radius = .012, sides = 6) {
  const d = new THREE.Vector3().subVectors(b, a);
  return axis(new THREE.CylinderGeometry(radius, radius, d.length(), sides), d, a.clone().add(b).multiplyScalar(.5));
}
function screw(center, normal, radius = .012) {
  return axis(new THREE.CylinderGeometry(radius, radius * .96, radius * .43, 8), normal, center);
}
function dome(y, a, inset = 0) {
  const t = Math.min(.999, Math.max(0, (y - .22) / .99));
  const arc = Math.sqrt(1 - t * t), r = .986 * arc + inset;
  const normal = new THREE.Vector3(Math.cos(a), .986 * t / (.99 * arc), Math.sin(a)).normalize();
  return { p: new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r), n: normal };
}
function patch(y0, y1, a0, a1, inset = 0, reverse = false, rows = 3, columns = 3) {
  const p = [], n = [], uv = [];
  const emit = (y, a, u, v) => {
    const point = dome(y, a, inset);
    p.push(point.p.x, point.p.y, point.p.z);
    const sign = reverse ? -1 : 1;
    n.push(point.n.x * sign, point.n.y * sign, point.n.z * sign); uv.push(u, v);
  };
  for (let row = 0; row < rows; row++) for (let col = 0; col < columns; col++) {
    const yA = y0 + (y1 - y0) * row / rows, yB = y0 + (y1 - y0) * (row + 1) / rows;
    const aA = a0 + (a1 - a0) * col / columns, aB = a0 + (a1 - a0) * (col + 1) / columns;
    // Outward normal for the +X-facing petal. The inner skin reverses the same winding.
    const points = reverse ? [[yA,aA],[yA,aB],[yB,aB],[yA,aA],[yB,aB],[yB,aA]]
      : [[yA,aA],[yB,aA],[yB,aB],[yA,aA],[yB,aB],[yA,aB]];
    for (const [y,a] of points) emit(y, a, (a-a0)/(a1-a0 || 1), (y-y0)/(y1-y0 || 1));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p,3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(n,3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv,2)); return g;
}
function rimWall(y0,y1,a0,a1,atAngle,reverse=false) {
  const p=[];
  const quad=(a,b,c,d)=>{const vertices=reverse?[a,c,b,a,d,c]:[a,b,c,a,c,d];for(const v of vertices)p.push(v.x,v.y,v.z);};
  const steps=12;
  for(let i=0;i<steps;i++) {
    const a=atAngle?a0:a0+(a1-a0)*i/steps,b=atAngle?a0:a0+(a1-a0)*(i+1)/steps;
    const y=atAngle?y0+(y1-y0)*i/steps:y0,z=atAngle?y0+(y1-y0)*(i+1)/steps:y0;
    quad(dome(y,a).p,dome(z,b).p,dome(z,b,-.032).p,dome(y,a,-.032).p);
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));
  g.computeVertexNormals(); return g;
}

/** Shared rigid outer components. Window pockets are shallow visible mechanisms, not an engine. */
export function buildIronKrakenHullGeometry({ shared }) {
  const g={}, ivory=[], dark=[], metal=[], orange=[];
  const lower=[];
  for(let i=0;i<=22;i++) {
    const y=-.57+i/22*.79, t=(y-.17)/1.07;
    lower.push([.991*Math.sqrt(1-t*t),y]);
  }
  ivory.push(lathe(lower,64));
  dark.push(lathe([[0,-.79],[.33,-.79],[.52,-.73],[.64,-.62],[.72,-.48],[.72,-.42],[0,-.42]],48));
  dark.push(ring(.986,.012,.22,80),ring(.724,.018,-.47,64));
  metal.push(ring(.697,.009,-.55,48),ring(.586,.012,-.67,48));
  // Lower pressure panels have short meridian joints, not another band around the sphere.
  // The main bolted equator above remains the single broad horizontal shell break.
  const lowerSeam=[];
  for(let i=0;i<=12;i++) {
    const y=-.39+i/12*.54,t=(y-.17)/1.07;
    lowerSeam.push([.993*Math.sqrt(1-t*t),y]);
  }
  for(let i=0;i<8;i++)dark.push(lathe(lowerSeam,1,i*TAU/8-.004,.008));
  for(let i=0;i<24;i++) {
    const a=i*TAU/24,r=.991*Math.sqrt(1-Math.pow((-.26-.17)/1.07,2));
    const normal=new THREE.Vector3(Math.cos(a),-.35,Math.sin(a)).normalize();
    dark.push(screw(new THREE.Vector3(Math.cos(a)*(r+.003),-.26,Math.sin(a)*(r+.003)),normal,.014));
  }
  // Root actuator sockets are mechanical flange assemblies, seated below the pressure sphere.
  for(let arm=0;arm<8;arm++) {
    const a=arm*TAU/8+Math.PI/8, d=new THREE.Vector3(Math.cos(a),0,Math.sin(a));
    const center=d.clone().multiplyScalar(.83);center.y=-.40;
    ivory.push(axis(lathe([[.14,-.10],[.19,-.10],[.222,-.065],[.226,.06],[.205,.10],[.16,.10]],24),d,center));
    dark.push(axis(lathe([[.17,-.11],[.185,-.11],[.19,-.07],[.18,.10],[.15,.14],[.13,.14]],24),d,center));
    orange.push(axis(ring(.212,.008,.072,24),d,center));
    const lateral=new THREE.Vector3(-Math.sin(a),0,Math.cos(a));
    for(let k=0;k<8;k++) {
      const t=k*TAU/8;
      const p=center.clone().addScaledVector(d,.095).addScaledVector(lateral,Math.sin(t)*.193);p.y+=Math.cos(t)*.193;
      dark.push(screw(p,d,.010));
    }
    // The black collar is ribbed and has small accessible silver clamps between arm sockets.
    const b=a+Math.PI/8;
    dark.push(moved(new THREE.BoxGeometry(.075,.18,.032),Math.cos(b)*.66,-.59,Math.sin(b)*.66,0,-b+Math.PI/2));
    metal.push(moved(new THREE.BoxGeometry(.024,.16,.037),Math.cos(b)*.68,-.59,Math.sin(b)*.68,0,-b+Math.PI/2));
  }

  // Fixed white eye socket. The black focusing assembly is a separate shared instance, animated
  // axially by the driver rather than stretching an eyeball or adding a glowing cartoon pupil.
  const eyeAngles=[-.59,.59];
  const eyeWhite=lathe([[.18,-.16],[.27,-.16],[.325,-.09],[.346,-.025],[.346,.055],[.322,.105],[.281,.105],[.267,.04],[.18,.04]],48);
  const eyeParts=[];
  for(const a of eyeAngles) {
    const d=new THREE.Vector3(Math.cos(a),.075,Math.sin(a)).normalize();
    const c=new THREE.Vector3(Math.cos(a)*.88,.04,Math.sin(a)*.88);
    ivory.push(axis(eyeWhite.clone(),d,c));
    dark.push(axis(lathe([[.20,-.03],[.237,-.03],[.241,.02],[.237,.20],[.20,.20]],32),d,c));
    const q=new THREE.Quaternion().setFromUnitVectors(UP,d);
    const flange=ring(.319,.007,.089,48);flange.applyQuaternion(q);flange.translate(c.x,c.y,c.z);dark.push(flange);
    for(let k=0;k<10;k++) {
      const t=k*TAU/10;
      const p=new THREE.Vector3(Math.cos(t)*.309,.093,Math.sin(t)*.309).applyQuaternion(q).add(c);
      dark.push(screw(p,d,.0085));
    }
  }
  eyeWhite.dispose();
  eyeParts.push(lathe([[0,-.06],[.22,-.06],[.269,-.025],[.28,.025],[.28,.09],[.266,.14],[.266,.21],
    [.286,.21],[.286,.246],[.268,.27],[.224,.27],[.217,.23],[0,.23]],48));
  // Focus helical ribs, iris seat and service notches all remain modeled at close range.
  for(const y of [.025,.063,.103,.144]) eyeParts.push(ring(.275-y*.025,.005,y,48));
  const eyeMetal=[ring(.237,.006,.264,48),ring(.198,.004,.25,40),ring(.105,.007,.253,32)];
  for(let k=0;k<12;k++) {
    const a=k*TAU/12;
    eyeParts.push(moved(new THREE.BoxGeometry(.016,.047,.014),Math.cos(a)*.282,.112,Math.sin(a)*.282,0,-a));
  }
  for(let k=0;k<7;k++) {
    const a=k*TAU/7;
    const blade=new THREE.BoxGeometry(.065,.003,.029);blade.rotateY(-a-.45);
    blade.translate(Math.cos(a)*.122,.254,Math.sin(a)*.122);eyeMetal.push(blade);
  }
  const lens=lathe([[.222,.241],[.18,.251],[.12,.257],[.055,.260],[0,.261]],48);
  const lensDetail=[moved(new THREE.SphereGeometry(.036,12,6),.044,.266,.035),
    moved(new THREE.SphereGeometry(.019,8,4),-.055,.263,-.045)];
  lensDetail[0].scale(1,.17,1);lensDetail[0].translate(0,.221,0);
  lensDetail[1].scale(1,.20,1);lensDetail[1].translate(0,.211,0);
  g.eyeDark=merge(eyeParts,'optical_focus_barrel',shared);
  g.eyeMetal=merge(eyeMetal,'optical_iris_and_bezel',shared);
  g.eyeOrange=shared(ring(.274,.010,.259,48),'optical_orange_seal');
  g.eyeLens=shared(lens,'convex_camera_glass');
  g.eyeGlints=merge(lensDetail,'optical_inner_elements',shared);
  g.eyeSignals=shared(moved(new THREE.CylinderGeometry(.008,.008,.006,8),.293,.10,-.08),'optical_status_lamp');

  // Eight panels meet around a genuinely round dome; the rectangular tapered viewports are
  // holes through the enamel, with their own inner skins, jambs and dark glass pockets.
  const white=[], black=[], steel=[], red=[], glass=[];
  const half=Math.PI/8-.0085;
  const rows=[.22,.30,.40,.50,.62,.76,.90,1.04,1.12,1.19];
  const cols=[-half,-.25,-.21,.21,.25,half];
  for(let iy=0;iy<rows.length-1;iy++)for(let ia=0;ia<cols.length-1;ia++) {
    const window=rows[iy]>=.50 && rows[iy+1]<=1.04 && cols[ia]>=-.21 && cols[ia+1]<=.21;
    if(window)continue;
    white.push(patch(rows[iy],rows[iy+1],cols[ia],cols[ia+1]));
    black.push(patch(rows[iy],rows[iy+1],cols[ia],cols[ia+1],-.032,true));
  }
  for(const a of [-half,half])white.push(rimWall(.22,1.19,a,a,true,a<0));
  for(const y of [.22,1.19])white.push(rimWall(y,y,-half,half,false,y>.22));
  for(const a of [-.21,.21])steel.push(rimWall(.50,1.04,a,a,true,a>0));
  for(const y of [.50,1.04])steel.push(rimWall(y,y,-.21,.21,false,y<1.04));
  for(const a of [-.224,.224]) black.push(patch(.488,1.051,a-.009,a+.009,.002, false,14,1));
  black.push(patch(.488,.502,-.228,.228,.002),patch(1.035,1.052,-.228,.228,.002));
  glass.push(patch(.502,1.035,-.208,.208,-.023,false,18,5));
  // Opaque backing inside each shallow service pocket prevents seeing empty daylight through
  // the dome. Only these visible pockets exist while the full pump remains unallocated.
  black.push(patch(.50,1.04,-.21,.21,-.095,false,12,4),
    patch(.50,1.04,-.21,.21,-.098,true,12,4));
  // Small machinery pockets behind each viewport: a ribbed actuator, angled tubes and clamps.
  for(let i=0;i<6;i++) {
    const y=.57+i*.067, c=dome(y,0,-.066).p;
    const p0=dome(y,-.15,-.066).p,p1=dome(y,.15,-.066).p;
    steel.push(rod(p0,p1,.010));
    const body=new THREE.BoxGeometry(.022,.045,.022);body.translate(c.x-.014,c.y,c.z);black.push(body);
  }
  for(const sign of [-1,1]) {
    const a=dome(.53,sign*.12,-.06).p,b=dome(.96,-sign*.11,-.06).p;
    steel.push(rod(a,b,.009,6));
    const c=dome(.71,sign*.05,-.045).p;
    red.push(screw(c,dome(.71,sign*.05).n,.013));
  }
  // Flush black screw heads along both meridians and the horizontal panel break.
  for(const sign of [-1,1]) for(const y of [.29,.39,.49,.59,.69,.79,.89,.99,1.09,1.16]) {
    const on=dome(y,sign*(half-.035),.003);black.push(screw(on.p,on.n,y>1.09?.007:.0095));
  }
  for(const y of [.43,1.10]) {
    black.push(patch(y,y+.006,-half,half,.003,false,1,12));
    for(const a of [-.25,-.10,.10,.25]) {
      const on=dome(y+.029,a,.003);black.push(screw(on.p,on.n,.009));
    }
  }
  red.push(patch(.400,.497,-.19,.19,.004,false,2,6));
  for(const a of [-.10,0,.10]) {
    const on=dome(.448,a,.007);black.push(screw(on.p,on.n,.008));
  }
  // Service slots and a short stencil cluster sit deliberately on the lower solid panel.
  for(let i=0;i<5;i++) black.push(patch(.331+i*.013,.337+i*.013,.195,.275,.004,false,1,3));
  for(let i=0;i<3;i++) {
    const on=dome(.36,-.24+i*.044,.004);black.push(screw(on.p,on.n,.014));
    const dot=dome(.36,-.24+i*.044,.012);steel.push(screw(dot.p,dot.n,.005));
  }
  const hinge=IRON_KRAKEN_MANTLE_HINGE;
  const finishPetal=(parts,name)=>{const geo=merge(parts,name,x=>x);geo.translate(-hinge.radius,-hinge.height,0);return shared(geo,name);};
  g.shell=finishPetal(white,'beveled_pressure_mantle');
  g.shellDetail=finishPetal(black,'mantle_inner_skin_seams_and_fasteners');
  g.shellMetal=finishPetal(steel,'viewport_actuators_and_window_jambs');
  g.shellAccent=finishPetal(red,'mantle_warning_markings');
  g.shellGlass=finishPetal(glass,'recessed_inspection_glazing');
  g.crown=shared(lathe([[0,-.015],[.18,-.015],[.205,0],[.20,.026],[.16,.043],[0,.043]],40),'central_service_cap');
  const crownHardware=[ring(.165,.004,.044,32)];
  for(let k=0;k<8;k++)crownHardware.push(moved(new THREE.CylinderGeometry(.007,.007,.004,6),Math.cos(k*TAU/8)*.145,.044,Math.sin(k*TAU/8)*.145));
  g.crownMetal=merge(crownHardware,'service_cap_fasteners',shared);

  // Split siphon valve with ribs and a small safety-orange lip.
  const jaw=[new THREE.SphereGeometry(1,24,12,0,Math.PI).scale(.30,.20,.30)];
  for(let k=0;k<4;k++)jaw.push(moved(new THREE.BoxGeometry(.016,.13,.17),-.21+k*.14,.02,.18));
  g.beak=merge(jaw,'split_siphon_valve',shared);
  g.beakRed=shared(moved(new THREE.BoxGeometry(.26,.045,.025),0,-.04,.284),'siphon_caution_plate');
  g.beakMetal=shared(moved(new THREE.BoxGeometry(.29,.009,.027),0,-.012,.284),'siphon_split_edge');
  // Static compatibility shapes for the corpse builder are the same mechanisms in their neutral
  // pose, never a second alternative model. The live rig uses the focus instances above.
  const staticLens=[],staticIris=[];
  for(const a of eyeAngles) {
    const d=new THREE.Vector3(Math.cos(a),.075,Math.sin(a)).normalize();
    const c=new THREE.Vector3(Math.cos(a)*.88,.04,Math.sin(a)*.88);
    dark.push(axis(g.eyeDark.clone(),d,c));metal.push(axis(g.eyeMetal.clone(),d,c));
    orange.push(axis(g.eyeOrange.clone(),d,c));
    staticLens.push(axis(g.eyeLens.clone(),d,c));staticIris.push(axis(g.eyeSignals.clone(),d,c));
  }
  // Live geometry excludes the movable dark barrel; expose fixed and neutral assembled variants.
  g.hull=merge(ivory,'pressure_sphere_and_root_flanges',shared);
  const assembledDark=dark.slice(-2), assembledMetal=metal.slice(-2),assembledOrange=orange.slice(-2);
  g.hullDark=merge(dark.slice(0,-2),'lower_machinery_and_seams',shared);
  g.hullMetal=merge(metal.slice(0,-2),'lower_socket_fasteners',shared);
  g.hullRed=merge(orange.slice(0,-2),'root_actuator_warning_seals',shared);
  g.wreckEyeDark=merge(assembledDark,'neutral_optical_barrels',shared);
  g.wreckEyeMetal=merge(assembledMetal,'neutral_optical_hardware',shared);
  g.wreckEyeOrange=merge(assembledOrange,'neutral_optical_seals',shared);
  g.lens=merge(staticLens,'neutral_black_camera_lenses',shared);g.iris=merge(staticIris,'neutral_camera_status_lamps',shared);
  return g;
}

/** Dense external pump silhouette, allocated only after the first opening. Four merged surfaces. */
export function buildIronKrakenPumpGeometry({ shared }) {
  const dark=[],metal=[],orange=[],steel=[];
  // A narrow rotor leaves genuine negative space between the surrounding cylinders and cage.
  // A solid outer tank here would conceal the mechanisms the opening is meant to reveal.
  dark.push(lathe([[0,.18],[.27,.18],[.29,.28],[.29,.74],[.20,1.05],[.12,1.13],[0,1.13]],32));
  for(let tier=0;tier<9;tier++) {
    const y=.27+tier*.085,r=.29-Math.max(0,y-.68)*.20;
    dark.push(ring(r,.024,y,36));
    if(tier%3===0)metal.push(ring(r+.009,.008,y+.025,36));
  }
  for(const [r,y] of [[.56,.31],[.59,.53],[.54,.78],[.39,1.03]])dark.push(ring(r,.023,y,48));
  for(let i=0;i<8;i++) {
    const a=i*TAU/8, ca=Math.cos(a),sa=Math.sin(a);
    const start=new THREE.Vector3(ca*.54,.29,sa*.54),end=new THREE.Vector3(Math.cos(a+.30)*.29,1.01,Math.sin(a+.30)*.29);
    const mid=start.clone().lerp(end,.53),d=end.clone().sub(start);
    dark.push(rod(start,mid,.085,10));metal.push(rod(mid,end,.038,8));
    steel.push(rod(start,end,.014,6));
    for(let j=0;j<5;j++) {
      const c=start.clone().lerp(mid,(j+1)/6);
      dark.push(axis(ring(.094,.010,0,14),d,c));
    }
    const gearCenter=new THREE.Vector3(ca*.55,.77,sa*.55),normal=new THREE.Vector3(ca,.3,sa).normalize();
    dark.push(axis(new THREE.CylinderGeometry(.115,.115,.05,20),normal,gearCenter));
    metal.push(screw(gearCenter.clone().addScaledVector(normal,.031),normal,.033));
    for(let tooth=0;tooth<12;tooth++) {
      const t=tooth*TAU/12;
      const gear=new THREE.BoxGeometry(.031,.049,.025);gear.rotateY(-t);
      gear.translate(Math.cos(t)*.122,0,Math.sin(t)*.122);gear.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP,normal));
      gear.translate(gearCenter.x,gearCenter.y,gearCenter.z);dark.push(gear);
    }
    // Routed hydraulic cables curve around the outside, visible only during the service opening.
    for(let k=0;k<3;k++) {
      const points=[];
      for(let j=0;j<7;j++) {
        const s=j/6,t=a+(s-.5)*.8+k*.12,r=.50+.10*Math.sin(s*Math.PI);
        points.push(new THREE.Vector3(Math.cos(t)*r,.32+s*.65,Math.sin(t)*r));
      }
      const tube=new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),12,k===0?.025:.015,5,false);
      (k===2?metal:dark).push(tube);
    }
    // Cross-braced frame, pressure manifolds and their flange screws. They are exposed exterior
    // surfaces of this reveal, merged by finish rather than hidden individual engine objects.
    for(let tier=0;tier<3;tier++) {
      const y=.32+tier*.23,r=tier===2?.53:.58;
      const a0=a+(tier%2?.12:-.12),a1=a+TAU/8+(tier%2?-.12:.12);
      const low=new THREE.Vector3(Math.cos(a0)*r,y,Math.sin(a0)*r);
      const high=new THREE.Vector3(Math.cos(a1)*(r-.04),y+.23,Math.sin(a1)*(r-.04));
      const otherLow=new THREE.Vector3(Math.cos(a1)*r,y,Math.sin(a1)*r);
      const otherHigh=new THREE.Vector3(Math.cos(a0)*(r-.04),y+.23,Math.sin(a0)*(r-.04));
      dark.push(rod(low,high,.022,6),rod(otherLow,otherHigh,.019,6));
      metal.push(screw(low,new THREE.Vector3(Math.cos(a0),0,Math.sin(a0)),.023));
    }
    const manifold=new THREE.Vector3(ca*.42,.99,sa*.42);
    dark.push(axis(new THREE.CylinderGeometry(.058,.058,.23,10),new THREE.Vector3(-sa,.35,ca),manifold));
    orange.push(axis(ring(.061,.010,0,12),new THREE.Vector3(-sa,.35,ca),manifold));
    orange.push(axis(ring(.092,.010,0,16),d,mid));
    steel.push(rod(new THREE.Vector3(ca*.57,.33,sa*.57),new THREE.Vector3(ca*.15,1.06,sa*.15),.010));
  }
  // Central spindle supports the moving cap, rather than leaving a floating lid in the opening.
  metal.push(moved(new THREE.CylinderGeometry(.055,.07,.56,12),0,1.12,0));
  orange.push(ring(.29,.020,.99,32),ring(.23,.012,1.06,28));
  return {dark:merge(dark,'reveal_pump_gears_cylinders_and_hoses',shared),
    metal:merge(metal,'reveal_pump_rods_and_clamps',shared),
    orange:merge(orange,'reveal_pump_pressure_seals',shared),
    steel:merge(steel,'reveal_pump_tension_rods',shared)};
}
