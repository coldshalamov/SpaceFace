import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { sampleIronKrakenArm, ironKrakenBodyPose, ironKrakenArmRadius } from '../src/render/ironKrakenMotion.js';
import { createIronKrakenVisual } from '../src/render/ironKrakenVisuals.js';
import { IRON_KRAKEN_PROFILES } from '../src/data/ironKraken.js';
import { createCapitalBossFight, stepCapitalBossFight } from '../src/combat/capitalBossScore.js';

const links = 22;
const pointCount = (links + 1) * 3;
const frameCount = links * 9;
const distance = (p, index) => Math.hypot(p[index + 3] - p[index],
  p[index + 4] - p[index + 1], p[index + 5] - p[index + 2]);
const close = (a, b, message, tolerance = 1e-10) => assert.ok(Math.abs(a - b) < tolerance,
  `${message}: ${a} versus ${b}`);

function segmentDistance(points, a, b) {
  const ux=points[a+3]-points[a], uy=points[a+4]-points[a+1], uz=points[a+5]-points[a+2];
  const vx=points[b+3]-points[b], vy=points[b+4]-points[b+1], vz=points[b+5]-points[b+2];
  const rx=points[a]-points[b], ry=points[a+1]-points[b+1], rz=points[a+2]-points[b+2];
  const aa=ux*ux+uy*uy+uz*uz, ee=vx*vx+vy*vy+vz*vz, bb=ux*vx+uy*vy+uz*vz;
  const cc=ux*rx+uy*ry+uz*rz, ff=vx*rx+vy*ry+vz*rz, denominator=aa*ee-bb*bb;
  const clamp=value=>Math.max(0,Math.min(1,value));
  let s=denominator>1e-14?clamp((bb*ff-cc*ee)/denominator):0, t=(bb*s+ff)/ee;
  if(t<0){t=0;s=clamp(-cc/aa);}else if(t>1){t=1;s=clamp((bb-cc)/aa);}
  return Math.hypot(rx+s*ux-t*vx,ry+s*uy-t*vy,rz+s*uz-t*vz);
}

test('foreground sleeve envelopes clear each other through the real rake and recovery driver', () => {
  const p=IRON_KRAKEN_PROFILES.heavy;
  for(const cadence of [{start:0,step:1},{start:205,step:2}]) {
    const id=`rake-sleeve-${cadence.step}`,fightId=`test:${id}`;
    const entity={id,type:'ship',alive:true,rot:0,pos:{x:0,z:0},vel:{x:0,z:0},
      radius:p.coreRadius,visualRadius:p.armReach,hull:p.hull,hullMax:p.hull,
      data:{shipId:'ship_bastion',lootTableId:p.enemyId,enemyTypeId:p.enemyId,
        ironKraken:{variant:p.variant,scale:p.scale,fightId}}};
    const target={id:`${id}:target`,alive:true,hull:100,hullMax:100,radius:14,pos:{x:p.armReach*1.2,z:0}};
    const fight=createCapitalBossFight({encounterId:p.scoreId,fightId,bossId:id,targetId:target.id});
    const state={simTime:0,entities:new Map([[id,entity],[target.id,target]]),
      capitalBossEncounters:{version:1,fights:{[fightId]:fight},orders:{}}};
    let tick=-1;
    const advance=()=>{tick++;state.simTime=tick/60;stepCapitalBossFight(fight,
      {tick,simTime:state.simTime,boss:entity,target,active:true});};
    while(tick<cadence.start)advance();
    const root=createIronKrakenVisual(entity);
    try {
      for(;;) {
        root.userData.updateAuthoredMotion(entity,state.simTime,{},state);
        if(tick>=180) {
          const points=root.userData.ironKrakenRig.points;
          for(let a=0;a<links;a++)for(let b=0;b<links;b++) {
            // Whole-segment capsules deliberately include the empty axial joint gaps. The
            // extra2% covers sleeve paint/trim, so positive separation also clears actual armor.
            const gap=segmentDistance(points,pointCount+a*3,pointCount*2+b*3)
              -1.02*(ironKrakenArmRadius(a)+ironKrakenArmRadius(b));
            assert.ok(gap>0,`tick${tick}, cadence${cadence.step}, sleeves${a}/${b} overlap by${-gap}R`);
          }
        }
        if(tick>=473)break;
        for(let step=0;step<cadence.step;step++)advance();
      }
    } finally { root.userData.disposeIronKraken(); }
  }
});

test('live and wreck sleeves share four large barrels followed by a steadily tapered fine chain', () => {
  for (const count of [22, 18]) {
    assert.deepEqual([0, 1, 2, 3].map(link => ironKrakenArmRadius(link, count)), [0.20, 0.19, 0.18, 0.16]);
    assert.equal(ironKrakenArmRadius(4, count), 0.15);
    assert.equal(ironKrakenArmRadius(count - 1, count), 0.018);
    for (let link = 1; link < count; link++) assert.ok(ironKrakenArmRadius(link, count)
      < ironKrakenArmRadius(link - 1, count), 'sleeve width must taper toward the fine tip');
  }
  assert.throws(() => ironKrakenArmRadius(22), RangeError);
});

test('fine suction cups clear the neighboring manufactured sleeve through the tight lateral contraction', () => {
  const p = IRON_KRAKEN_PROFILES.heavy;
  const entity = { id: 'cup-clearance', type: 'ship', alive: true, rot: 0, pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 }, hull: p.hull, hullMax: p.hull,
    data: { enemyTypeId: p.enemyId, ironKraken: { variant: p.variant, scale: p.scale } } };
  const root = createIronKrakenVisual(entity), rig = root.userData.ironKrakenRig;
  // These are the actual production buffers and instance dimensions. A radius-only capsule
  // misses cups; an unchamfered cylinder falsely rejects the manufactured end clearance.
  const armor = rig.armor.geometry.clone();
  const cups = root.getObjectByName('dark_suction_cups').geometry.clone();
  const armorTree = new MeshBVH(armor, { indirect: true });
  cups.boundsTree = new MeshBVH(cups, { indirect: true });
  const aMatrix = new THREE.Matrix4(), cMatrix = new THREE.Matrix4();
  const side = new THREE.Vector3(), axis = new THREE.Vector3(), normal = new THREE.Vector3();
  const center = new THREE.Vector3(), restNormal = new THREE.Vector3(), offset = new THREE.Vector3();
  const dimensions = [];
  for (let link = 0; link < links; link++) {
    const index = links + link, point = pointCount + link * 3;
    rig.armor.getMatrixAt(index, aMatrix); rig.suckers.getMatrixAt(index, cMatrix);
    restNormal.fromArray(rig.frames, frameCount + link * 9 + 6);
    center.set((rig.points[point] + rig.points[point + 3]) / 2,
      (rig.points[point + 1] + rig.points[point + 4]) / 2,
      (rig.points[point + 2] + rig.points[point + 5]) / 2);
    offset.setFromMatrixPosition(cMatrix).sub(center);
    dimensions.push({ armor: new THREE.Vector3().setFromMatrixScale(aMatrix),
      cup: new THREE.Vector3().setFromMatrixScale(cMatrix), offset: offset.dot(restNormal) });
  }
  const points = new Float64Array(pointCount), frames = new Float64Array(frameCount);
  const armorPoses = Array.from({ length: links }, () => new THREE.Matrix4());
  const cupPoses = Array.from({ length: links }, () => new THREE.Matrix4());
  const relative = new THREE.Matrix4();
  try {
    for (const time of [0, 15.7, 44.1]) for (const ink of [.25, .5, .75, 1]) {
      sampleIronKrakenArm(1, { time, ink, inkActive: ink > .5 }, points, 0, frames);
      for (let link = 0; link < links; link++) {
        const point = link * 3, frame = link * 9, size = dimensions[link];
        side.fromArray(frames, frame); axis.fromArray(frames, frame + 3); normal.fromArray(frames, frame + 6);
        center.set((points[point] + points[point + 3]) / 2,
          (points[point + 1] + points[point + 4]) / 2, (points[point + 2] + points[point + 5]) / 2);
        armorPoses[link].makeBasis(side, axis, normal).scale(size.armor).setPosition(center);
        center.addScaledVector(normal, size.offset);
        side.negate(); normal.negate();
        cupPoses[link].makeBasis(side, axis, normal).scale(size.cup).setPosition(center);
      }
      for (let cup = 4; cup < 11; cup++) for (let neighbor = cup - 2; neighbor <= cup + 2; neighbor++) {
        if (neighbor === cup) continue; // Cup backs are deliberately seated in their own barrel.
        relative.copy(armorPoses[neighbor]).invert().multiply(cupPoses[cup]);
        assert.equal(armorTree.intersectsGeometry(cups, relative), false,
          `cup ${cup} cuts neighboring sleeve ${neighbor} at t=${time}, ink=${ink}`);
      }
    }
  } finally { armor.dispose(); cups.dispose(); root.userData.disposeIronKraken(); }
});

test('a full curled arm keeps its mechanical link lengths through the attack cycle', () => {
  const points = new Float64Array(pointCount), rest = new Float64Array(pointCount);
  for (let arm = 0; arm < 8; arm++) {
    sampleIronKrakenArm(arm, { time: 0 }, rest);
    let length = 0;
    for (let link = 0; link < links; link++) length += distance(rest, link * 3);
    assert.ok(length > 4.5 && length < 4.9, 'long folded chain must not regress to short radial beads');
    assert.ok(distance(rest, 0) > 0.61 && distance(rest, 0) < 0.66,
      'first proximal barrel must retain the reference’s substantial axial length');
    const fourBarrels = distance(rest, 0) + distance(rest, 3) + distance(rest, 6) + distance(rest, 9);
    assert.ok(fourBarrels > 2.20 && fourBarrels < 2.36,
      'four broad barrels must carry the reference’s longer proximal machinery');
    assert.ok(distance(rest, 12) < distance(rest, 9) * 0.65,
      'the fifth link must begin the distinctly finer distal chain');
    assert.ok(distance(rest, (links - 1) * 3) < 0.07, 'fine terminal cells must complete the coil');
    for (let step = 0; step <= 100; step++) {
      const pose = { time: step / 10, jet: step / 100, rake: 1 - step / 100,
        inkCurl: Math.sin(step / 10) * 0.6, inkLift: Math.cos(step / 10) * 0.5 };
      sampleIronKrakenArm(arm, pose, points);
      for (let link = 0; link < links; link++) close(distance(points, link * 3),
        distance(rest, link * 3), 'articulation must rotate rigid links without stretching');
    }
  }
});

test('link frames stay right-handed and aligned to the actual chain through partial jet folds', () => {
  const points = new Float64Array(pointCount), frames = new Float64Array(frameCount);
  for (let arm = 0; arm < 8; arm++) for (let step = 0; step <= 40; step++) {
    sampleIronKrakenArm(arm, { time: step * 0.29, jet: step / 40,
      rake: step % 3 / 2, inkCurl: -0.6, inkLift: 0.3 }, points, 0, frames);
    assert.ok(points.every(Number.isFinite) && frames.every(Number.isFinite));
    for (let link = 0; link < links; link++) {
      const f = link * 9, p = link * 3, length = distance(points, p);
      for (let axis = 0; axis < 3; axis++) close(Math.hypot(frames[f + axis * 3],
        frames[f + axis * 3 + 1], frames[f + axis * 3 + 2]), 1, 'frame axis length');
      for (let axis = 0; axis < 3; axis++) close(frames[f + 3 + axis],
        (points[p + 3 + axis] - points[p + axis]) / length, 'Y axis follows the mechanical link');
      close(frames[f] * frames[f + 3] + frames[f + 1] * frames[f + 4]
        + frames[f + 2] * frames[f + 5], 0, 'lateral and axial directions must be perpendicular');
      close(frames[f + 1] * frames[f + 5] - frames[f + 2] * frames[f + 4],
        frames[f + 6], 'dorsal X component');
      close(frames[f + 2] * frames[f + 3] - frames[f] * frames[f + 5],
        frames[f + 7], 'dorsal Y component');
      close(frames[f] * frames[f + 4] - frames[f + 1] * frames[f + 3],
        frames[f + 8], 'dorsal Z component');
    }
  }
});

test('holding presents raised dorsal arches, lateral reaches, and low forward manipulators', () => {
  const points = new Float64Array(pointCount);
  const extents = [];
  for (let arm = 0; arm < 8; arm++) {
    sampleIronKrakenArm(arm, { time: 59 / 60 }, points);
    let minY = Infinity, maxY = -Infinity;
    for (let p = 1; p < pointCount; p += 3) {
      minY = Math.min(minY, points[p]); maxY = Math.max(maxY, points[p]);
    }
    extents.push({ minY, maxY });
    assert.ok(points[4] > points[1], 'each first actuator emerges upward from its fixed socket');
  }
  for (const arm of [2, 3, 4]) assert.ok(extents[arm].maxY > 1.2,
    'dorsal arms must visibly arch above the mantle instead of sharing a hanging bouquet');
  for (const arm of [0, 7]) assert.ok(extents[arm].minY < -1.3 && extents[arm].minY > -2,
    'the paired forearms must descend into distinct low manipulator coils');
  for (const arm of [1, 6]) assert.ok(extents[arm].maxY > -.1 && extents[arm].maxY < .9,
    'the lateral pair must reach beside the optical body');
});

test('idle and rake centerlines remain within the authored reach through a minute of posture drift', () => {
  const points = new Float64Array(pointCount);
  for (let time = 0; time <= 60; time += 0.5) for (let arm = 0; arm < 8; arm++) {
    for (let step = 0; step <= 5; step++) {
      sampleIronKrakenArm(arm, { time, rake: step / 5 }, points);
      for (let p = 0; p < pointCount; p += 3) assert.ok(Math.hypot(points[p], points[p + 2]) <= 3.5,
        'coarse-link redistribution must not extend a rake beyond the authored arm reach');
    }
  }
});

test('one compact lateral arm folds beside the collar while its combat transitions clear the head', () => {
  const points = new Float64Array(pointCount);
  sampleIronKrakenArm(1, { time: 59 / 60 }, points);
  let reach = 0, low = Infinity;
  for (let p = 0; p < pointCount; p += 3) {
    reach = Math.max(reach, Math.hypot(points[p], points[p + 2])); low = Math.min(low, points[p + 1]);
  }
  assert.ok(reach < 3.2 && low > -1.25, 'the lateral arm must present a compact rolled loop');
  assert.ok(Math.hypot(points[pointCount - 3], points[pointCount - 1]) < reach - .25,
    'the terminal coil must return inward from the broad elbow');
  for (let time = 0; time <= 60; time += 0.5) for (let step = 0; step <= 10; step++) {
    const progress = step / 10;
    for (const pose of [{ time, rake: progress }, { time, jet: progress },
      { time, ink: progress, inkActive: step > 5 }, { time, mantle: progress }]) {
      sampleIronKrakenArm(1, pose, points);
      // The root is deliberately seated in its socket. All following chain points must clear
      // the pressure head, including partial uncoils where a folded arm could cut through it.
      for (let p = 3; p < pointCount; p += 3) assert.ok(points[p + 1] <= -0.5
        || Math.hypot(points[p], points[p + 2]) >= 1,
      'a non-root link point must not enter the pressure-head exclusion volume');
    }
  }
});

test('coiled tips unwind continuously rather than snapping across opposed tangents', () => {
  const points = new Float64Array(pointCount), frames = new Float64Array(frameCount);
  const previous = new Float64Array(frameCount);
  for (let arm = 0; arm < 8; arm++) for (let step = 0; step <= 1000; step++) {
    sampleIronKrakenArm(arm, { time: 0, jet: step / 1000 }, points, 0, frames);
    if (step) for (let link = 0; link < links; link++) {
      const f = link * 9 + 3;
      const cosine = frames[f] * previous[f] + frames[f + 1] * previous[f + 1]
        + frames[f + 2] * previous[f + 2];
      assert.ok(cosine > Math.cos(0.016), 'small score changes must not flip a distal sleeve');
    }
    previous.set(frames);
  }
});

test('the committed jet retains varied distal hooks behind the head instead of parallel rods', () => {
  const points = new Float64Array(pointCount), frames = new Float64Array(frameCount);
  let leastBend = Infinity, mostBend = -Infinity;
  for (let arm = 0; arm < 8; arm++) {
    sampleIronKrakenArm(arm, { jet: 1, reducedMotion: true }, points, 0, frames);
    // The fifth mechanism begins the fine chain; the terminal tangent must retain a substantial
    // bend from it while the entire chain remains aft of its socket in local -Y.
    const mid = 4 * 9 + 3, tip = (links - 1) * 9 + 3;
    const cosine = frames[mid] * frames[tip] + frames[mid + 1] * frames[tip + 1]
      + frames[mid + 2] * frames[tip + 2];
    const bend = Math.acos(Math.max(-1, Math.min(1, cosine)));
    assert.ok(bend > 1.1 && bend < 2.1, 'jet must preserve a restrained fine-chain hook');
    leastBend = Math.min(leastBend, bend); mostBend = Math.max(mostBend, bend);
    for (let p = 3; p < pointCount; p += 3) assert.ok(points[p + 1] < points[1],
      'even a curled tip must trail behind the head');
    assert.ok(points[pointCount - 2] < -4.1, 'the large mechanisms must still stream aft');
  }
  assert.ok(mostBend - leastBend > 0.3, 'the eight hooks must not converge to an identical shape');
});

test('sampling is order-independent and reduced motion suppresses idle drift while retaining jet posture', () => {
  const points = new Float64Array(pointCount), frames = new Float64Array(frameCount);
  const expectedPoints = new Float64Array(pointCount), expectedFrames = new Float64Array(frameCount);
  const pose = Object.freeze({ time: 4.25, jet: 0.37, rake: 0.12, ink: 0.5, inkActive: true });
  sampleIronKrakenArm(3, pose, expectedPoints, 0, expectedFrames);
  sampleIronKrakenArm(0, { time: 200, jet: 1 }, points, 0, frames);
  sampleIronKrakenArm(3, pose, points, 0, frames);
  assert.deepEqual(points, expectedPoints); assert.deepEqual(frames, expectedFrames);
  for (const arm of [1, 5]) for (const jet of [0, 0.5, 1]) {
    sampleIronKrakenArm(arm, { time: 0, jet, reducedMotion: true }, expectedPoints, 0, expectedFrames);
    sampleIronKrakenArm(arm, { time: 400, jet, reducedMotion: true }, points, 0, frames);
    assert.deepEqual(points, expectedPoints); assert.deepEqual(frames, expectedFrames);
    assert.deepEqual(ironKrakenBodyPose({ time: 0, jet, reducedMotion: true }, {}),
      ironKrakenBodyPose({ time: 400, jet, reducedMotion: true }, {}));
  }
  const jetBody = {};
  assert.equal(ironKrakenBodyPose({ jet: 1, reducedMotion: true }, jetBody), jetBody);
  close(jetBody.pitchZ, -1.30, 'head-first jet pitch');
  assert.equal(jetBody.rollX, 0); assert.equal(jetBody.liftY, 0);
  sampleIronKrakenArm(5, { jet: 1, reducedMotion: true }, points);
  for (let p = 3; p < pointCount; p += 3) assert.ok(points[p + 1] < points[p - 2],
    'every jet segment trails behind the head along local -Y');
});

test('packed multi-arm outputs preserve adjacent buffers and independent anatomical shapes', () => {
  const points = new Float64Array(pointCount * 2 + 8).fill(999);
  const frames = new Float64Array(frameCount * 2 + 8).fill(999);
  assert.equal(sampleIronKrakenArm(0, {}, points, 4, frames, 4), points);
  sampleIronKrakenArm(1, {}, points, 4 + pointCount, frames, 4 + frameCount);
  assert.ok(points.subarray(0, 4).every(x => x === 999));
  assert.ok(points.subarray(4 + pointCount * 2).every(x => x === 999));
  assert.ok(frames.subarray(0, 4).every(x => x === 999));
  assert.ok(frames.subarray(4 + frameCount * 2).every(x => x === 999));
  const aLength = distance(points, 4), bLength = distance(points, 4 + pointCount);
  assert.ok(Math.abs(aLength - bLength) > 0.005, 'neighboring arms must retain anatomical differences');
  assert.throws(() => sampleIronKrakenArm(0, {}, new Float32Array(pointCount - 1)), RangeError);
});

test('all eight manufactured sleeve envelopes stay separated through holding and attack blends', () => {
  const points = new Float64Array(pointCount * 8);
  const radii = Array.from({ length: links }, (_, link) => ironKrakenArmRadius(link));
  for (const time of [0, .7, 2.3, 4.9, 9.1, 15.7, 31.4, 44.1, 59.2]) {
    for (const progress of [0, .1, .25, .5, .75, 1]) {
      for (const pose of [
        { time, jet: progress },
        { time, rake: progress, rakeProgress: progress },
        { time, ink: progress, inkActive: progress > .5 },
        { time, mantle: progress },
        { time, jet: progress * .5, rake: progress * .3, rakeProgress: progress,
          mantle: (1 - progress) * .6, inkCurl: -.6 * progress, inkLift: .4, locomotion: progress },
      ]) {
        for (let arm = 0; arm < 8; arm++) sampleIronKrakenArm(arm, pose, points, arm * pointCount);
        for (let arm = 0; arm < 8; arm++) for (let a = 0; a < links; a++) {
          const ai = arm * pointCount + a * 3;
          for (let other = arm; other < 8; other++) {
            // Immediate neighbors share their manufactured hinge. Non-adjacent sleeves must
            // remain separate, including the small terminal cells inside their own curl.
            for (let b = other === arm ? a + 3 : 0; b < links; b++) {
              const gap = segmentDistance(points, ai, other * pointCount + b * 3)
                - 1.02 * (radii[a] + radii[b]);
              assert.ok(gap > 0, `arm ${arm}/${other}, links ${a}/${b}, t=${time}: intersecting sleeve envelopes`);
            }
          }
          if (a === 0) continue; // The first actuator seats inside the authored shoulder socket.
          for (const u of [0, .5, 1]) {
            const x = points[ai] + (points[ai + 3] - points[ai]) * u;
            const y = points[ai + 1] + (points[ai + 4] - points[ai + 1]) * u;
            const z = points[ai + 2] + (points[ai + 5] - points[ai + 2]) * u;
            if (y > -.55 && y < .9) assert.ok(Math.hypot(x, z) - radii[a] > .97,
              `arm ${arm}, link ${a}: sleeve entered the pressure-housing exclusion volume`);
          }
        }
      }
    }
  }
});

test('independent idle movement is visible and continuous while every shoulder stays seated', () => {
  const points = new Float64Array(pointCount), first = new Float64Array(pointCount);
  const previous = new Float64Array(pointCount), ranges = [];
  for (let arm = 0; arm < 8; arm++) {
    sampleIronKrakenArm(arm, { time: 0 }, first);
    let range = 0;
    for (let tick = 0; tick < 360; tick++) {
      sampleIronKrakenArm(arm, { time: tick / 60 }, points);
      for (let axis = 0; axis < 3; axis++) close(points[axis], first[axis], 'fixed shoulder socket');
      const tip = pointCount - 3;
      range = Math.max(range, Math.hypot(points[tip] - first[tip],
        points[tip + 1] - first[tip + 1], points[tip + 2] - first[tip + 2]));
      if (tick) for (let p = 3; p < pointCount; p += 3) assert.ok(Math.hypot(
        points[p] - previous[p], points[p + 1] - previous[p + 1], points[p + 2] - previous[p + 2]) < .025,
      'the reach/coil cycle must not jump a link between fixed ticks');
      previous.set(points);
    }
    assert.ok(range > .24, 'each holding arm must visibly recruit and release its fine curl');
    ranges.push(range);
  }
  assert.ok(Math.max(...ranges) - Math.min(...ranges) > .25,
    'the independent manipulators must not repeat a synchronized shared trajectory');
});

test('locomotion, turn, and committed rake progress move the character without writing world state', () => {
  const holding = ironKrakenBodyPose({ reducedMotion: true }, {});
  const travelling = ironKrakenBodyPose({ reducedMotion: true, locomotion: 1, turn: .8 }, {});
  assert.ok(travelling.pitchZ < holding.pitchZ - .3, 'sustained travel banks the mantle head-first');
  assert.ok(travelling.rollX < -.15, 'turning banks the body into the motion');
  const points = new Float64Array(pointCount), start = new Float64Array(pointCount);
  const locked = Object.freeze({ time: 1, rake: 1, rakeProgress: 0, reducedMotion: true });
  sampleIronKrakenArm(1, locked, start);
  sampleIronKrakenArm(1, { ...locked, rakeProgress: 1 }, points);
  close(points[0], start[0], 'rake does not detach the shoulder');
  close(points[1], start[1], 'rake does not detach the shoulder');
  close(points[2], start[2], 'rake does not detach the shoulder');
  const elbow = 4 * 3;
  assert.ok(Math.hypot(points[elbow] - start[elbow], points[elbow + 2] - start[elbow + 2]) > .5,
    'an active rake sweeps a real forearm rather than freezing at maximum charge');
});
