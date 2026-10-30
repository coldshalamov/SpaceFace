import { VERSION } from './definition.mjs';
import { solveSignal, finitePose, distance } from './signal.mjs';

const clone = x => JSON.parse(JSON.stringify(x));
const STAGES = ['unread', 'tuning', 'fixed', 'record', 'complete', 'retired'];
export function createPuzzle(def, simTime) {
  if (!Number.isFinite(simTime)) throw new TypeError('simTime');
  return { version: VERSION, definition: clone(def), stage: 'unread', active: true, epoch: 1,
    lastTime: simTime, lastPulse: null, lastReadAt: null, readSlots: [false, false, false],
    polarities: [1, 1, 1], serials: [1, 1, 1, 1], missing: [false, false, false, false],
    replacements: [0, 0, 0], poses: [...def.buoys.map(b => ({ ...b.pos, rot: b.rot, vx: 0, vz: 0, angVel: 0 })),
      { ...def.emitter, rot: 0, vx: def.emitterVelocity.x, vz: def.emitterVelocity.z, angVel: 0 }],
    fix: null, receipt: null, consequence: null, settlement: null };
}

export function observe(puzzle, poses, simTime) {
  if (!Number.isFinite(simTime) || simTime < puzzle.lastTime || puzzle.stage === 'retired') return null;
  puzzle.lastTime = simTime;
  if (!puzzle.active) return null;
  for (let i = 0; i < 4; i++) {
    puzzle.missing[i] = !finitePose(poses[i]);
    if (finitePose(poses[i])) puzzle.poses[i] = { x: poses[i].x, z: poses[i].z, rot: poses[i].rot,
      vx: Number.isFinite(poses[i].vx) ? poses[i].vx : 0, vz: Number.isFinite(poses[i].vz) ? poses[i].vz : 0,
      angVel: Number.isFinite(poses[i].angVel) ? poses[i].angVel : 0 };
  }
  return solveSignal(puzzle.definition, poses.slice(0, 3), poses[3], simTime, puzzle.polarities);
}

/** Pulse identity is scanner life + sequence + time, not a UI action id. */
export function readPulse(p, pulse, origin, poses, now, scannerLife) {
  if (!p.active || ['complete', 'retired'].includes(p.stage) || pulse?.source !== 'player-scanner'
    || !Number.isSafeInteger(pulse.seq) || pulse.seq < 1 || pulse.simTime !== now
    || !Number.isFinite(pulse.radius) || pulse.radius <= 0 || !finitePose({ ...origin, rot: 0 })
    || !Number.isSafeInteger(scannerLife) || scannerLife < 1 || now < p.lastTime) return false;
  const previous = p.lastPulse;
  if (previous && (now < previous.time || (scannerLife === previous.life && pulse.seq <= previous.seq)
    || now === previous.time)) return false;
  p.lastPulse = { life: scannerLife, seq: pulse.seq, time: now };
  const reach = Math.min(p.definition.scanRange, pulse.radius);
  let read = false;
  for (let i = 0; i < 3; i++) if (finitePose(poses[i]) && distance(origin, poses[i]) <= reach) {
    p.readSlots[i] = true; read = true;
  }
  if (read && p.stage === 'unread') p.stage = 'tuning';
  const signal = observe(p, poses, now);
  if (read) p.lastReadAt = now;
  if (signal?.valid && p.readSlots.every(Boolean) && p.stage === 'tuning' && distance(origin, poses[3]) <= p.definition.maxReach) {
    p.fix = { ...signal.estimate, at: now, uncertainty: Math.max(8, signal.uncertainty) };
    p.stage = 'fixed';
  }
  // A fix does not recover a record remotely. Approach the live emitter, not the stale fix.
  if (p.stage === 'fixed' && finitePose(poses[3]) && distance(origin, poses[3]) <= Math.min(reach, p.definition.recoveryRange)) {
    p.stage = 'record';
  }
  return read || p.stage === 'record';
}

export function reverseJumper(p, slot, playerPos, poses) {
  if (!p.active || p.stage !== 'tuning' || !Number.isInteger(slot) || slot < 0 || slot > 2
    || !p.readSlots[slot] || !finitePose({ ...playerPos, rot: 0 }) || !finitePose(poses[slot]) || distance(playerPos, poses[slot]) > 65) return false;
  p.polarities[slot] *= -1;
  return true;
}

/** Preview is immutable data shared by reward, traffic and receipt; no reward inferred from UI. */
export function choicePlan(p, choice, now) {
  if (!p.active || p.stage !== 'record' || p.receipt || !['sell', 'publish'].includes(choice)) return null;
  return { id: `${p.definition.id}:completion:v1`, version: VERSION, encounterId: p.definition.id,
    sectorId: p.definition.sectorId, choice, credits: choice === 'sell' ? 1200 : 450, at: now,
    recordFix: { x: p.poses[3].x, z: p.poses[3].z }, corridor: { from: { ...p.definition.anchor },
      to: { x: p.poses[3].x, z: p.poses[3].z }, halfWidth: 80, speedLimit: 35,
      validationPasses: choice === 'publish' ? 2 : 1, public: choice === 'publish' },
    traffic: choice === 'publish' ? 'civilian_survey' : 'private_survey', followupAfter: now + 30 };
}

export function suspend(p) { if (p.active) { p.active = false; p.epoch = Math.min(1e9, p.epoch + 1); } }
export function resume(p) { if (p.stage !== 'retired' && !p.active) { p.active = true; p.epoch = Math.min(1e9, p.epoch + 1); } }
export function retire(p) { suspend(p); p.stage = 'retired'; }
export const serialize = p => clone(p);

/** Bounded, strict versioned restore. Reject malformed/unknown saves rather than paying a guessed receipt. */
export function restore(value) {
  if (JSON.stringify(value)?.length > 32768) throw new TypeError('oversized tuning fork save');
  const p = clone(value);
  if (!p || p.version !== VERSION || p.definition?.version !== VERSION || !STAGES.includes(p.stage)
    || typeof p.active !== 'boolean' || !Number.isSafeInteger(p.epoch) || p.epoch < 1
    || !Number.isFinite(p.lastTime) || !/^[a-z0-9_]{1,80}$/.test(p.definition.id)
    || typeof p.definition.sectorId !== 'string' || p.definition.sectorId.length > 100) throw new TypeError('unsupported tuning fork save');
  for (const [key, length] of [['readSlots', 3], ['polarities', 3], ['serials', 4], ['missing', 4], ['poses', 4], ['replacements', 3]]) {
    if (!Array.isArray(p[key]) || p[key].length !== length) throw new TypeError(`invalid ${key}`);
  }
  if (!p.poses.every(finitePose) || !p.serials.every(n => Number.isSafeInteger(n) && n >= 1)
    || !p.polarities.every(n => n === 1 || n === -1) || !p.readSlots.every(n => typeof n === 'boolean')
    || !p.missing.every(n => typeof n === 'boolean') || !p.replacements.every(n => Number.isInteger(n) && n >= 0 && n <= 1)) throw new TypeError('invalid bounded state');
  if (p.serials[3] !== 1 || p.replacements.some((n, i) => p.serials[i] !== n + 1)) throw new TypeError('invalid replacement serial');
  if (!p.poses.every(pose => ['x', 'z', 'rot', 'vx', 'vz', 'angVel'].every(k => Number.isFinite(pose[k]) && Math.abs(pose[k]) <= 1e12))) throw new TypeError('invalid body snapshot');
  const d = p.definition;
  if (!Array.isArray(d.buoys) || d.buoys.length !== 3 || !d.buoys.every(b => Number.isFinite(b.radius) && b.radius >= 50 && b.radius <= 300)
    || !Number.isFinite(d.anchor?.x) || !Number.isFinite(d.anchor?.z)
    || !['wavelength', 'bandWidth', 'maxReach', 'recoveryRange', 'scanRange', 'squallPeriod', 'squallDuration'].every(k => Number.isFinite(d[k]) && d[k] > 0 && d[k] <= 2000)
    || !(d.fixThreshold >= .5 && d.fixThreshold <= 1)) throw new TypeError('invalid definition');
  if (p.lastPulse && (!Number.isSafeInteger(p.lastPulse.life) || p.lastPulse.life < 1
    || !Number.isSafeInteger(p.lastPulse.seq) || p.lastPulse.seq < 1 || !Number.isFinite(p.lastPulse.time)
    || p.lastPulse.time > p.lastTime)) throw new TypeError('invalid pulse');
  if (p.settlement && (!['uncertain', 'paid'].includes(p.settlement.status)
    || ![450, 1200].includes(p.settlement.amount) || p.settlement.reason !== `${d.id}:completion:v1`)) throw new TypeError('invalid settlement');
  if (p.stage === 'complete' && (!p.receipt || !p.settlement)) throw new TypeError('missing receipt');
  if (p.receipt) {
    const r = p.receipt;
    if (!['complete', 'retired'].includes(p.stage) || r.id !== `${d.id}:completion:v1` || r.encounterId !== d.id || r.sectorId !== d.sectorId
      || !['sell', 'publish'].includes(r.choice) || r.credits !== (r.choice === 'sell' ? 1200 : 450)
      || r.corridor?.public !== (r.choice === 'publish') || r.traffic !== (r.choice === 'publish' ? 'civilian_survey' : 'private_survey')
      || p.settlement?.status !== 'paid' || p.settlement?.amount !== r.credits
      || r.version !== VERSION || !Number.isFinite(r.at) || r.followupAfter !== r.at + 30
      || !Number.isFinite(r.recordFix?.x) || !Number.isFinite(r.recordFix?.z)
      || r.corridor?.from?.x !== d.anchor.x || r.corridor?.from?.z !== d.anchor.z
      || r.corridor?.to?.x !== r.recordFix.x || r.corridor?.to?.z !== r.recordFix.z
      || r.corridor?.halfWidth !== 80 || r.corridor?.speedLimit !== 35
      || r.corridor?.validationPasses !== (r.choice === 'publish' ? 2 : 1)) throw new TypeError('inconsistent receipt');
    const c = p.consequence;
    if (!c || !['awaiting_actor', 'surveying', 'survey_lost', 'validated', 'retired'].includes(c.status)
      || !Number.isInteger(c.passes) || c.passes < 0 || c.passes > r.corridor.validationPasses
      || typeof c.publicOpen !== 'boolean' || (c.publicOpen && (c.status !== 'validated' || !r.corridor.public || c.passes !== r.corridor.validationPasses))
      || (c.jobId !== null && (typeof c.jobId !== 'string' || c.jobId.length > 256))
      || (c.actorRecordId !== null && (typeof c.actorRecordId !== 'string' || c.actorRecordId.length > 256))) throw new TypeError('invalid consequence');
  }
  return p;
}
