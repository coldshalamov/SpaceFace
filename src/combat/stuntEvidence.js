// PQ-146: bounded observations of applied physics. This module never changes motion or damage.
// The journal belongs to the registered grammar; physics supplies observations, not awards.
import { resolveGovernedCombatSpeed, getPropulsionProfile } from '../core/flight/propulsionCatalog.js';
import { SHIPS } from '../data/ships.js';
import { fieldAffectsBody, fieldContainsPoint } from '../core/fields/fieldKernel.js';
import { resolveCollisionConsequence } from './impulseKernel.js';
import { isHostileForAI } from '../ai/engagementAuthority.js';
import { witnessLineOfSight } from './lineOfSight.js';
export const EVIDENCE_REVISION = 2;
export const EVIDENCE_LIMITS = Object.freeze({ episodes: 32, nodes: 32, terminals: 8, edges: 4, horizon: 480, gap: 180 });
const JOURNALS = new WeakMap();
const IMPULSE_OBSERVERS=new WeakMap();
export function registerStuntImpulseObserver(state,fn) {
  let listeners=IMPULSE_OBSERVERS.get(state);if(!listeners){listeners=new Set();IMPULSE_OBSERVERS.set(state,listeners);}
  listeners.add(fn);return ()=>listeners.delete(fn);
}
let activeState = null;
const finite = (n) => Number.isFinite(n) ? n : 0;
const point = (v) => ({ x: finite(v?.x), z: finite(v?.z) });
const idKey = (id) => `${typeof id}:${String(id)}`;
const REFERENCE_HULL = SHIPS.find(s=>s.id==='ship_kestrel');
export const angleBetween = (a, b) => {
  const m = Math.hypot(a.x, a.z) * Math.hypot(b.x, b.z);
  return m > 1e-9 ? Math.acos(Math.max(-1, Math.min(1, (a.x * b.x + a.z * b.z) / m))) * 180 / Math.PI : 0;
};

export function bindStuntEvidence(state) {
  activeState = state;
  let journal = JOURNALS.get(state);
  if (!journal) {
    journal = { revision: EVIDENCE_REVISION, sequence: 0, lives: new Map(), roots: new Map(), bodies: new Map(), contacts: new Map(), constraints: new Map(), withheld: 0,
      referenceMass: REFERENCE_HULL.mass, referenceCruise: getPropulsionProfile(REFERENCE_HULL.driveId).combatSpeed };
    JOURNALS.set(state, journal);
  }
  return journal;
}
export function unbindStuntEvidence(state) { if (activeState === state) activeState = null; }
export function journalFor(state = activeState) { return state && JOURNALS.get(state); }
export function resetStuntEvidence(state) { const sequence=JOURNALS.get(state)?.sequence??0;JOURNALS.delete(state);const j=bindStuntEvidence(state);j.sequence=sequence;return j; }
export function bodyLife(entity, state = activeState) {
  const j = journalFor(state);
  if (!entity || entity.id == null || !j) return null;
  const key = idKey(entity.id);
  let life = j.lives.get(key);
  if (life && life.entity === entity) return life;
  // A restored life is rebound only through restoreStuntEvidence, never by a reused numeric ID.
  const id = `life:${key}:${++j.sequence}`;
  const cruise = ['ship','drone'].includes(entity.type) ? resolveGovernedCombatSpeed(entity, state) : j.referenceCruise;
  life = { id, entity, name: entity.name ?? entity.data?.name ?? String(entity.id), type: entity.type,
    mass: finite(entity.physicsBody?.mass ?? entity.mass), hull: finite(entity.hullMax ?? entity.hull),
    dryMass: finite(SHIPS.find(s=>s.id===(entity.data?.shipId??entity.data?.defId))?.mass ?? entity.physicsBody?.mass ?? entity.mass),
    encounterId: entity.data?.encounter?.id ?? entity.data?.encounterId ?? (entity.data?.runCohort==='survival'?`${state.run?.seed}:${entity.data.runWave}`:null),
    cruise, radius: Math.max(0.01, finite(entity.radius ?? entity.r ?? entity.size)),
    length: Math.max(0.02, finite(entity.hullLength ?? entity.length ?? (entity.radius ?? entity.r ?? entity.size) * 2)),
    deathTick: entity.alive === false || entity.type === 'wreck' ? finite(state.tick) : null };
  j.lives.set(key, life);
  return life;
}
export function noteBodyDeath(entity, state = activeState) {
  const life = bodyLife(entity, state);
  if (life && life.deathTick == null) life.deathTick = finite(state.tick);
  return life;
}
function node(j, root, value) {
  if (root.nodes.length >= EVIDENCE_LIMITS.nodes) { root.truncated = true; j.withheld++; return false; }
  root.nodes.push({ ...value, id: `edge:${++j.sequence}` });
  return true;
}
function liveRoot(j, id, tick) {
  const root = j.roots.get(id);
  return root && !root.truncated && tick >= root.tick && tick - root.tick <= EVIDENCE_LIMITS.horizon ? root : null;
}
export function observeAppliedImpulse(entity, before, after, provenance, tick, kind = 'impulse', state = activeState) {
  const j = journalFor(state);
  if (!j || !entity || state.entities?.get(entity.id)!==entity || !before || !after || !Number.isFinite(tick)) return null;
  if(tick>state.tick || tick<state.tick-480)return null;
  const life = bodyLife(entity, state);
  const dv = { x: after.x - before.x, z: after.z - before.z };
  if (!Number.isFinite(dv.x) || !Number.isFinite(dv.z) || Math.hypot(dv.x, dv.z) < 1e-8) return null;
  const delivered=root=>{
    for(const fn of IMPULSE_OBSERVERS.get(state)??[])fn({entity,before,after,provenance,tick,kind,root});
    return root;
  };
  const existing = j.bodies.get(life.id);
  if(kind==='field') {
    const root=existing&&liveRoot(j,existing.rootId,tick),f=provenance?.field;
    if(!root||existing.edges>=4)return delivered(null);
    if(!f){root.truncated=true;j.withheld++;delete root.fieldActive;return null;}
    let span=root.fieldActive;
    if(span&&span.fieldId!==f.id){root.truncated=true;j.withheld++;return null;}
    if(!span){
      const origin=existing.origin??root;
      const rx=origin.pos.x-f.x,rz=origin.pos.z-f.z,v=origin.before,s=v.x*v.x+v.z*v.z;
      const t=s>0?Math.max(0,Math.min(3,-(rx*v.x+rz*v.z)/s)):0;
      const miss=Math.hypot(rx+v.x*t,rz+v.z*t)-(f.radius+life.radius);
      span=root.fieldActive={fieldId:f.id,entityId:entity.id,lifeId:life.id,entryTick:tick,lastTick:tick,before:point(before),after:point(after),dv:{x:0,z:0},
        entryCausal:miss>=0.25*(f.radius+life.radius)};
    }
    span.dv.x+=dv.x;span.dv.z+=dv.z;span.after.x=after.x;span.after.z=after.z;span.lastTick=tick;
    existing.lastTick=tick;
    return delivered(root);
  }
  const actorId = provenance?.actorId;
  // Unknown force can remove retained useful ownership; it never creates player authorship.
  if (actorId == null || actorId !== state.playerId || kind === 'collision') {
    if (existing) { existing.other.x += dv.x; existing.other.z += dv.z; }
    return delivered(null);
  }
  const previous = existing && liveRoot(j, existing.rootId, tick);
  const continuingConstraint=kind==='constraint'&&previous?.constraint?.attached&&previous.constraint.id===provenance.attachmentId;
  const previousNode = continuingConstraint?previous.nodes.find(n=>n.kind==='constraint'):previous?.nodes.at(-1);
  const grouped = previous && previousNode?.kind === kind && tick - (previousNode.endTick ?? previousNode.tick) <= 45
    && (kind === 'constraint' || angleBetween(previousNode.dv ?? dv, dv) <= 15) && previous.sourceLife === life.id;
  if (grouped) {
    previous.dv.x += dv.x; previous.dv.z += dv.z;
    previous.after = point(after);
    previousNode.dv.x += dv.x; previousNode.dv.z += dv.z;
    previousNode.endTick = tick;
    existing.useful.x += dv.x; existing.useful.z += dv.z;
    existing.lastTick=tick;
    return delivered(previous);
  }
  pruneEvidence(state, tick);
  if (j.roots.size >= EVIDENCE_LIMITS.episodes) { j.withheld++; return null; }
  const playerBody=state.entities?.get?.(state.playerId);
  const root = { id: `root:${++j.sequence}`, actorId, sourceId: entity.id, sourceLife: life.id, tick,
    kind, weaponId: provenance.weaponId ?? null, pos: point(entity.pos), before: point(before), after: point(after), dv,
    reference: { mass: life.mass, hull: life.hull, cruise: life.cruise, radius: life.radius, length: life.length },
    playerMass: bodyLife(playerBody, state)?.dryMass ?? 0,
    playerLength: bodyLife(playerBody, state)?.length ?? 0, encounterId:life.encounterId,
    sourceName: life.name, sceneReferenceMass:j.referenceMass, referenceMomentum:0.2*j.referenceMass*j.referenceCruise,
    sourceType: entity.type, sourceDeathTick: life.deathTick,sourceHostile:isHostileForAI(state,entity,playerBody),
    // PQ-146 §6.2: the player's position and whether the direct player→source line was blocked at
    // the opening of the proved chain. Line Contracts read these; scoring does not.
    playerPos: playerBody?.pos ? point(playerBody.pos) : null,
    sourceOccludedAtRoot: playerBody?.pos && entity.id !== playerBody.id
      ? !witnessLineOfSight(state, { id: playerBody.id, pos: playerBody.pos }, entity.pos, [playerBody.id, entity.id]) : null,
    previousRoot: previous && tick - previous.tick <= 120 ? previous.id : null,
    nodes: [], terminals: [], truncated: false };
  node(j, root, { kind, tick, entityId: entity.id, lifeId: life.id, pos: point(entity.pos), before: point(before), after: point(after), dv: point(dv) });
  j.roots.set(root.id, root);
  j.bodies.set(life.id, { rootId: root.id, lastTick: tick, edges: 0, useful: point(dv), other: { x: 0, z: 0 },origin:{pos:point(entity.pos),before:point(before),tick} });
  return delivered(root);
}

export function observeConstraint(attachment, before, after, tick, state = activeState) {
  const j = journalFor(state);
  if (!j || attachment.ownerId !== state.playerId) return;
  tick=state.tick;
  const source = attachment.owner.entity, target = attachment.target.entity;
  const life = bodyLife(target, state);
  const tension = attachment.springState?.lastTension ?? 0;
  const dx = target.pos.x - source.pos.x, dz = target.pos.z - source.pos.z;
  const angle = Math.atan2(dz, dx);
  let c = j.constraints.get(attachment.id);
  if (!c) {
    c = { id: attachment.id, actorId: source.id, targetId: target.id, lifeId: life.id, startTick: tick,
      loadedTicks: 0, sweep: 0, angle, start: point(target.pos),sourceStart:point(source.pos),displacement: 0, attached: true, rootId: null };
    j.constraints.set(c.id, c);
  }
  c.attached = true;
  c.lastTick = tick;
  if (!(tension > 0) || !before || !after) {
    c.loadedTicks = 0; c.sweep = 0; c.angle = angle; c.start.x=target.pos.x; c.start.z=target.pos.z;c.sourceStart=point(source.pos);c.startTick=tick;c.displacement=0; return;
  }
  const root = observeAppliedImpulse(target, before, after, { actorId: source.id, weaponId: attachment.defId,attachmentId:attachment.id }, tick, 'constraint', state);
  if (root) c.rootId = root.id;
  c.loadedTicks++;
  c.sweep += Math.abs(Math.atan2(Math.sin(angle - c.angle), Math.cos(angle - c.angle))) * 180 / Math.PI;
  c.angle = angle;
  c.displacement = Math.hypot(target.pos.x - c.start.x, target.pos.z - c.start.z);
  if (root) root.constraint = c;
}
export function observeRelease(attachmentId, tick, reason, state = activeState) {
  const j = journalFor(state), c = j?.constraints.get(attachmentId);
  if (!c || !c.attached) return;
  tick=state.tick;
  c.attached = false;
  c.release = { id: `release:${++j.sequence}`, tick, reason, grade: null };
  const root = liveRoot(j, c.rootId, tick);
  if (root) { root.constraint = c; root.release = c.release;
    node(j,root,{kind:'release',tick,entityId:c.targetId,lifeId:c.lifeId,releaseId:c.release.id,reason});
    const influence=j.bodies.get(c.lifeId);if(influence)influence.lastTick=tick; }
}
export function observeReleaseGrade(targetId, grade, tick, state = activeState) {
  const j = journalFor(state);
  if (!j) return;
  for (const c of j.constraints.values()) if (c.targetId === targetId && c.release && Math.abs(c.release.tick - tick) <= 1) {
    c.release.grade = grade;
    const root = j.roots.get(c.rootId);
    if (root?.release?.id === c.release.id) root.release.grade = grade;
  }
}
export function contactKey(tick, a, b) { return `${tick}|${[idKey(a), idKey(b)].sort().join('|')}`; }
export function observeContact(a, b, contact, state = activeState) {
  const j = journalFor(state);
  if (!j || state.entities?.get(a.id)!==a || state.entities?.get(b.id)!==b || !contact.beforeA || !contact.beforeB) return;
  const tick = finite(state.tick), la = bodyLife(a, state), lb = bodyLife(b, state);
  const record = { ...contact, tick, aId: a.id, bId: b.id, aLife: la.id, bLife: lb.id,
    aPos: point(contact.positionA??a.pos), bPos: point(contact.positionB??b.pos), aRef: { ...la, entity: undefined }, bRef: { ...lb, entity: undefined }, paths: [] };
  // Both sides observe the same pre-contact ancestry. A transfer cannot bounce back in this loop.
  const ia=j.bodies.get(la.id),ib=j.bodies.get(lb.id);
  for (const [source, target, sl, tl, sv, tv,influence] of [[a,b,la,lb,contact.beforeA,contact.beforeB,ia],[b,a,lb,la,contact.beforeB,contact.beforeA,ib]]) {
    const root = influence && liveRoot(j, influence.rootId, tick);
    if (!root || tick < influence.lastTick || tick - influence.lastTick > EVIDENCE_LIMITS.gap || influence.edges >= EVIDENCE_LIMITS.edges) continue;
    const sourcePos=source===a?record.aPos:record.bPos,targetPos=target===a?record.aPos:record.bPos;
    const axis = { x: targetPos.x - sourcePos.x, z: targetPos.z - sourcePos.z };
    const mag = Math.hypot(axis.x, axis.z);
    if (!(mag > 0)) continue;
    axis.x /= mag; axis.z /= mag;
    const normalLength=Math.hypot(contact.normal?.x??0,contact.normal?.z??0);
    if(normalLength>0) {
      const sign=(axis.x*contact.normal.x+axis.z*contact.normal.z)>=0?1:-1;
      axis.x=sign*contact.normal.x/normalLength;axis.z=sign*contact.normal.z/normalLength;
    }
    const helpful = Math.max(0, influence.useful.x * axis.x + influence.useful.z * axis.z);
    const otherHelpful = Math.max(0, influence.other.x * axis.x + influence.other.z * axis.z);
    const useful = Math.hypot(influence.useful.x, influence.useful.z);
    const origin=influence.origin??root;
    const dt = (tick - origin.tick) / 60;
    const radius = sl.radius + tl.radius;
    const tx = targetPos.x - tv.x * dt, tz = targetPos.z - tv.z * dt;
    const rx = origin.pos.x - tx, rz = origin.pos.z - tz;
    const vx = origin.before.x - tv.x, vz = origin.before.z - tv.z;
    const speed2 = vx * vx + vz * vz;
    // Do not turn arriving sooner at a wall into a miss-to-hit: test the whole local flight
    // corridor, including where the unchanged trajectory would arrive after this contact.
    const t = speed2 > 0 ? Math.max(0, Math.min(3, -(rx * vx + rz * vz) / speed2)) : 0;
    const missDistance = Math.hypot(rx + vx * t, rz + vz * t) - radius;
    const changedCorridor = missDistance >= 0.25 * radius;
    const power = helpful >= 0.15 * root.reference.cruise && helpful >= 0.6 * (helpful + otherHelpful);
    const priorMagnitude=Math.hypot(origin.before.x,origin.before.z);
    const side=priorMagnitude>0?{x:-origin.before.z/priorMagnitude,z:origin.before.x/priorMagnitude}:null;
    const lateral=side?influence.useful.x*side.x+influence.useful.z*side.z:0;
    const retainedLateral=side?((influence.useful.x+influence.other.x)*side.x+(influence.useful.z+influence.other.z)*side.z)*Math.sign(lateral):0;
    const steering = useful >= 0.1 * root.reference.cruise && angleBetween(origin.before,sv) >= 15 && changedCorridor
      &&retainedLateral>=.1*root.reference.cruise;
    // A negative accumulated other component cancels attribution instead of refreshing it.
    const retained = (influence.useful.x + influence.other.x) * axis.x + (influence.useful.z + influence.other.z) * axis.z;
    const priorSpeed=Math.sqrt(speed2),reducedMass=target.physicsBody?.dynamic===false?sl.mass:sl.mass*tl.mass/(sl.mass+tl.mass);
    // A conservative upper bound on the unchanged contact uses elastic reversal (2mu*v).
    // Only a bound below both death and the quarter-hull gate proves sub-material severity;
    // shields, armor and uncertain helm loss cannot turn this into a permissive fallback.
    const priorSource=changedCorridor?null:resolveCollisionConsequence({target:source,other:target,exchangedMomentum:2*reducedMass*priorSpeed,preSolveClosingSpeed:priorSpeed,tick});
    const priorTarget=changedCorridor?null:resolveCollisionConsequence({target,other:source,exchangedMomentum:2*reducedMass*priorSpeed,preSolveClosingSpeed:priorSpeed,tick});
    const submaterialSource=!!priorSource&&priorSource.impactDamage<Math.min(source.hull,.25*sl.hull);
    const submaterialTarget=!!priorTarget&&priorTarget.impactDamage<Math.min(target.hull,.25*tl.hull);
    if ((!changedCorridor&&!submaterialSource&&!submaterialTarget) || (!(power&&retained>0) && !steering)) continue;
    // PQ-146 §6.2: was the direct player→target line occluded at the opening of the proved chain?
    // For the chain's own source the root-time measurement is exact. For another victim, only an
    // unimpelled body can be honestly back-projected to the opening tick — an impelled one reads
    // as unknown rather than guessed.
    let playerOccludedAtRoot=null;
    if(root.playerPos) {
      if(tl.id===root.sourceLife)playerOccludedAtRoot=root.sourceOccludedAtRoot===true;
      else if(!j.bodies.has(tl.id)) {
        const back=(tick-root.tick)/60;
        const thenPos={x:targetPos.x-tv.x*back,z:targetPos.z-tv.z*back};
        playerOccludedAtRoot=!witnessLineOfSight(state,{id:state.playerId,pos:root.playerPos},thenPos,[state.playerId,source.id,target.id]);
      }
    }
    const path = { rootId: root.id, sourceId: source.id, targetId: target.id, sourceLife: sl.id, targetLife: tl.id, playerOccludedAtRoot,
      sourceOccludedAtRoot:sl.id===root.sourceLife?root.sourceOccludedAtRoot:null,
      tick, edges: influence.edges + 1, usefulDeltaV: useful, closingSpeed: Math.max(0, (sv.x-tv.x)*axis.x+(sv.z-tv.z)*axis.z),
      missDistance,changedCorridor,submaterialSource,submaterialTarget,priorSpeed,normal: axis, sourceVelocity: point(sv), targetVelocity: point(tv),
      momentum: (target.physicsBody?.dynamic === false || ['asteroid','station','planet'].includes(target.type) ? sl.mass : sl.mass*tl.mass/(sl.mass+tl.mass)) * Math.max(0,(sv.x-tv.x)*axis.x+(sv.z-tv.z)*axis.z) };
    record.paths.push(path);
    const ongoing=root.nodes.find(n=>n.kind==='contact'&&n.sourceLife===sl.id&&n.targetLife===tl.id&&tick-(n.endTick??n.tick)<=1);
    let contactNode=ongoing;
    if(ongoing){ongoing.endTick=tick;ongoing.momentum=Math.max(ongoing.momentum,path.momentum);}
    else if (!node(j, root, { ...path, kind: 'contact', pos: point(contact.pos) })) continue;
    else contactNode=root.nodes.at(-1);
    const transferred = source.id === a.id ? contact.afterB : contact.afterA;
    if (transferred&&target.physicsBody?.dynamic!==false&&!['asteroid','station','planet'].includes(target.type)) {
      // The solver resolves one physical contact over consecutive ticks. The transfer to the
      // struck body is the whole episode's velocity change measured from its pre-contact motion,
      // never one tick's slice, so the origin of its new corridor stays at the first contact tick.
      const carried=ongoing&&j.bodies.get(tl.id);
      const continuing=!!(carried&&carried.rootId===root.id&&carried.contactTick===ongoing.tick);
      const before=continuing?carried.origin.before:point(tv);
      const dv = { x: transferred.x-before.x, z: transferred.z-before.z };
      const line=root.constraint,player=line&&state.entities.get(line.actorId);
      // A rendered rope is not a collider. Only an actual endpoint/body contact can supply
      // this receipt; the victim must also cross the displaced loaded segment, then have a
      // separate downstream physical consequence. Damage-only monofilament sweeps never enter.
      if(line?.attached&&line.loadedTicks>=9&&player&&source.id===line.targetId&&target.id!==line.actorId
        &&tick-line.startTick<=90&&line.displacement>0&&line.sourceStart) {
        if(!continuing) {
          const lx=sourcePos.x-player.pos.x,lz=sourcePos.z-player.pos.z,ll=lx*lx+lz*lz;
          const along=ll>0?((targetPos.x-player.pos.x)*lx+(targetPos.z-player.pos.z)*lz)/ll:-1;
          const previousTarget={x:targetPos.x-tv.x*(tick-line.startTick)/60,z:targetPos.z-tv.z*(tick-line.startTick)/60};
          contactNode.lineNear=along>0&&along<1&&Math.hypot(targetPos.x-player.pos.x-lx*along,targetPos.z-player.pos.z-lz*along)<=tl.radius;
          contactNode.lineOldMiss=segmentSeparation(line.sourceStart,line.start,previousTarget,{x:previousTarget.x+tv.x*1.5,z:previousTarget.z+tv.z*1.5})>tl.radius;
        }
        const transverse=Math.hypot(before.x,before.z)>0?Math.abs(dv.x*before.z-dv.z*before.x)/Math.hypot(before.x,before.z):0;
        const intercept=root.nodes.find(n=>n.kind==='line_intercept'&&n.lifeId===tl.id&&n.contactTick===contactNode.tick);
        if(intercept){intercept.deltaV=Math.max(intercept.deltaV,transverse);intercept.after=point(transferred);intercept.endTick=tick;}
        else if(contactNode.lineNear&&contactNode.lineOldMiss&&transverse>=.3*tl.cruise)node(j,root,{kind:'line_intercept',tick,contactTick:contactNode.tick,entityId:target.id,lifeId:tl.id,
          sourceId:source.id,targetId:target.id,loadedTicks:line.loadedTicks,endpointDisplacement:line.displacement,
          displacementTick:line.startTick,deltaV:transverse,crossedPriorCorridor:true,normal:point(axis),before:point(before),after:point(transferred)});
      }
      j.bodies.set(tl.id, { rootId: root.id, lastTick: tick, edges: path.edges, useful: dv, other: { x:0,z:0 },
        origin:continuing?carried.origin:{pos:point(target.pos),before,tick},contactTick:contactNode.tick });
    }
  }
  j.contacts.set(contactKey(tick,a.id,b.id), record);
  if(j.contacts.size>256)j.contacts.delete(j.contacts.keys().next().value);
}
function segmentSeparation(a,b,c,d) {
  const cross=(p,q,r)=>(q.x-p.x)*(r.z-p.z)-(q.z-p.z)*(r.x-p.x);
  const ab1=cross(a,b,c),ab2=cross(a,b,d),cd1=cross(c,d,a),cd2=cross(c,d,b);
  if(ab1*ab2<0&&cd1*cd2<0)return 0;
  const pointSegment=(p,q,r)=>{const x=r.x-q.x,z=r.z-q.z,len=x*x+z*z,t=len?Math.max(0,Math.min(1,((p.x-q.x)*x+(p.z-q.z)*z)/len)):0;return Math.hypot(p.x-q.x-t*x,p.z-q.z-t*z);};
  return Math.min(pointSegment(a,c,d),pointSegment(b,c,d),pointSegment(c,a,b),pointSegment(d,a,b));
}
export function evidenceForConsequence(receipt, state = activeState) {
  const j = journalFor(state);
  const contact = j?.contacts.get(contactKey(receipt.tick,receipt.targetId,receipt.otherId));
  if (!contact) return null;
  const path = contact.paths.find(p => (p.targetId === receipt.targetId&&(p.changedCorridor||p.submaterialTarget))
    || (p.sourceId === receipt.targetId&&(p.changedCorridor||p.submaterialSource)&&(['terrain','structure'].includes(receipt.surface)||receipt.otherMass>=150)));
  const root = path && liveRoot(j,path.rootId,receipt.tick);
  if (!root) return null;
  return structuredClone({ revision:EVIDENCE_REVISION, root, path, contact, previousRoot: root.previousRoot ? liveRoot(j,root.previousRoot,receipt.tick) : null });
}
export function pruneEvidence(state, tick) {
  const j = journalFor(state); if (!j) return;
  for (const [id,r] of j.roots) if (tick-r.tick > 480 || tick < r.tick) j.roots.delete(id);
  for (const [id,b] of j.bodies) if (!j.roots.has(b.rootId)) j.bodies.delete(id);
  for (const [id,c] of j.contacts) if (tick-c.tick > 180) j.contacts.delete(id);
  for (const [id,c] of j.constraints) if (!c.attached && tick-c.lastTick > 480) j.constraints.delete(id);
  for (const [id,l] of j.lives) if (state.entities?.get?.(l.entity.id)!==l.entity && !j.bodies.has(l.id)) j.lives.delete(id);
}
export function closeFieldIntervals(state,tick) {
  const j=journalFor(state);if(!j)return;
  for(const r of j.roots.values()){
    const f=r.fieldActive;if(!f||f.lastTick>=tick-1)continue;
    const influence=j.bodies.get(f.lifeId);
    if(f.entryCausal&&influence&&influence.edges<4) {
      node(j,r,{kind:'field_exit',fieldId:f.fieldId,entityId:f.entityId,lifeId:f.lifeId,entryTick:f.entryTick,tick:f.lastTick,
        entryCausal:true,bend:angleBetween(f.before,f.after),deltaV:Math.hypot(f.dv.x,f.dv.z),before:f.before,after:f.after});
      influence.edges++;
      // The proved field is a transfer, not a new player root. Retain only the old useful
      // magnitude along the measured exit trajectory; the field's energy is never player impulse.
      const speed=Math.hypot(f.after.x,f.after.z),mag=Math.hypot(influence.useful.x,influence.useful.z);
      if(speed>0){influence.useful.x=mag*f.after.x/speed;influence.useful.z=mag*f.after.z/speed;}
    }
    delete r.fieldActive;
  }
}
export function fieldEvidenceInput(entity,fields,state,profile=null) {
  const j=journalFor(state),life=j?.lives.get(idKey(entity.id));
  if(!life||(!j.bodies.has(life.id)&&entity.type!=='projectile'))return null;
  let match=null;
  for(const f of fields){
    if(!(f.radius>0)||!f.center||!fieldContainsPoint(f,entity.pos.x,entity.pos.z)||(profile&&!fieldAffectsBody(f,profile)))continue;
    if(match)return {kind:'field',tick:state.tick,provenance:null};
    match=f;
  }
  return match?{kind:'field',tick:state.tick,provenance:{actorId:match.ownerId,field:{id:match.id,ownerId:match.ownerId,x:match.center.x,z:match.center.z,radius:match.radius}}}:null;
}

/** Save only roots whose physical bodies will be restored, and compact facts without live pointers. */
export function serializeStuntEvidence(state,extraIds=[]) {
  const j=journalFor(state);if(!j)return null;
  pruneEvidence(state,state.tick);
  const ids=pendingStuntBodyIds(state);ids.add(state.playerId);for(const id of extraIds)ids.add(id);
  return {revision:2,sequence:j.sequence,referenceMass:j.referenceMass,referenceCruise:j.referenceCruise,
    lives:[...j.lives].filter(([,l])=>ids.has(l.entity.id)).map(([key,l])=>[key,{...l,entity:undefined,entityId:l.entity.id,
      position:point(l.entity.pos),velocity:point(l.entity.vel),entityType:l.entity.type}]),
    roots:[...j.roots],bodies:[...j.bodies],constraints:[...j.constraints],withheld:j.withheld};
}
export function restoreStuntEvidence(state,raw,remap=null) {
  const j=resetStuntEvidence(state);
  if(raw?.revision!==2 || !Number.isSafeInteger(raw.sequence))return j;
  raw=structuredClone(raw);
  const mapped=id=>remap?.get(String(id))??id;
  const remapNode=n=>{for(const key of ['entityId','actorId','sourceId','targetId','projectileOwnerId'])if(n[key]!=null)n[key]=mapped(n[key]);};
  for(const [,r] of raw.roots??[]){remapNode(r);for(const n of r.nodes??[])remapNode(n);if(r.constraint)remapNode(r.constraint);}
  for(const [,c] of raw.constraints??[])remapNode(c);
  j.sequence=raw.sequence;
  for(const [key,saved] of (raw.lives??[])) {
    const e=state.entities?.get?.(mapped(saved.entityId));
    if(!e || e.type!==(saved.entityType??saved.type) || Math.hypot(e.pos.x-saved.position.x,e.pos.z-saved.position.z)>1e-3
      || Math.hypot(e.vel.x-saved.velocity.x,e.vel.z-saved.velocity.z)>1e-3)continue;
    j.lives.set(idKey(e.id),{...saved,entity:e});
  }
  const validLives=new Set([...j.lives.values()].map(l=>l.id));
  for(const [id,r] of (raw.roots??[]).slice(0,32))if(validLives.has(r.sourceLife)&&r.nodes?.length<=32&&r.tick<=state.tick&&state.tick-r.tick<=480)j.roots.set(id,r);
  for(const [life,b] of (raw.bodies??[]))if(validLives.has(life)&&j.roots.has(b.rootId)&&b.edges<=4)j.bodies.set(life,b);
  for(const [id,c] of (raw.constraints??[]).slice(0,32))if(validLives.has(c.lifeId)&&j.roots.has(c.rootId))j.constraints.set(id,c);
  j.withheld=raw.withheld??0;
  return j;
}
export function pendingStuntBodyIds(state) {
  const out=new Set(),j=journalFor(state);
  for(const field of Object.values(state.fields?.deployed??{}))if(field.emitterId!=null)out.add(field.emitterId);
  for(const episode of Object.values(state.story?.titles?.stuntWitnessing?.episodes??{}))
    for(const observer of Object.values(episode.observers??{}))if(observer.id!=null)out.add(observer.id);
  for(const report of state.story?.titles?.stuntWitnessing?.reports??[]){out.add(report.senderId);out.add(report.receiverId);}
  for(const bark of state.barkDirector?.stuntRecognition?.pending??[])if(bark.speakerId!=null)out.add(bark.speakerId);
  for(const life of j?.lives.values()??[]) if(j.bodies.has(life.id))out.add(life.entity.id);
  for(const c of j?.constraints.values()??[])if(j.roots.has(c.rootId)){out.add(c.actorId);out.add(c.targetId);}
  return out;
}
