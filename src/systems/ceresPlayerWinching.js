// The original receiver can finish a pilot's lift. The pilot supplies the approach
// and releases a real Line in its open mouth; the existing clamp does the winching.
// No actor pose, mass, class, payment or site receipt is written here.
import { CERES_WORKFLEET_CONTRACT as C } from '../data/ceresWorkfleet.js';
import { hasPendingCeresWorkfleetAttachments } from '../combat/persistence.js';

const offers = new WeakMap();
const steps = new WeakMap();
const creating = new WeakMap();
const wrap = n => Math.atan2(Math.sin(n), Math.cos(n));
const live = (s, e) => e?.alive !== false && e?.hull > 0 && s.entities.get(e.id) === e
  && Number.isSafeInteger(e.occupantGeneration) && e.occupantGeneration > 0;
// Iterate the owner's live rows without materializing a filtered array on the
// per-tick path. `fn` returning false stops the walk early.
function eachActive(service, e, fn) {
  const list = e && service?.listForEntity?.(e.id);
  if (list) for (const a of list) if (a?.state === 'active' && fn(a) === false) return false;
  return true;
}
const someActive = (service, e, fn) => !eachActive(service, e, a => fn(a) ? false : true);
const findActive = (service, e, fn) => { let hit = null; eachActive(service, e, a => fn(a) ? (hit = a, false) : true); return hit; };
const noneActive = (service, e) => eachActive(service, e, () => false);

/** An aligned, slow load on the open apron; neither the back nor a rail is an entrance. */
export function ceresPlayerWinchApproach(cradle, section) {
  if (!cradle?.pos || !section?.pos || !section.vel) return false;
  const c = Math.cos(cradle.rot || 0), sn = Math.sin(cradle.rot || 0);
  const dx = section.pos.x - cradle.pos.x, dz = section.pos.z - cradle.pos.z;
  const x = dx * c + dz * sn, z = -dx * sn + dz * c;
  return Math.abs(x) <= 4 && z >= -170 && z <= 0
    && Math.abs(wrap(section.rot - (cradle.rot || 0))) <= .025
    && Math.hypot(section.vel.x, section.vel.z) <= .35
    && Math.abs(section.vel.x * c + section.vel.z * sn) <= .03 && Math.abs(section.angVel || 0) <= .002;
}

function lineLives(line, source, target) {
  return line?.state === 'active' && line.ownerId === source?.id && line.targetId === target?.id
    && line.ownerGeneration === source.occupantGeneration && line.targetGeneration === target.occupantGeneration;
}

function readyGeometry(s, player, cradle, section, breaker, cutterHead) {
  const distance = Math.hypot(player.pos.x - cradle.pos.x, player.pos.z - cradle.pos.z);
  return live(s, player) && !s.ui?.docked && !player.flags?.docked && distance >= 200 && distance < 380
    && ceresPlayerWinchApproach(cradle, section) && cradle.data.ceresWorkfleetSlide === 0
    && [breaker, cutterHead].every(e => !e || Math.hypot(e.pos.x - cradle.pos.x, e.pos.z - cradle.pos.z) >= 200);
}

function receiverAvailable(s, { cradle, section }, ports) {
  const record = s.world?.records?.byId?.[C.identities.cradle];
  return live(s, cradle) && live(s, section) && ports.exactSection(section)
    && ports.healthy(cradle) && ports.admitted(section) && cradle.physicsBody?.dynamic === false
    && section.physicsBody?.dynamic === true && cradle.data?.ceresWorkfleetCradleLayout !== 'open-v1'
    && record?.alive !== false && !['destroyed', 'defeated'].includes(record?.outcome) && !record?.playerOwned
    && !s.sites?.worldById?.[C.siteId]?.payloads?.long_plate?.destroyed
    && !ports.controlled(cradle) && !ports.controlled(section);
}

/** Local ready call reads the same geometry as the actual handover. */
export function ceresPlayerWinchReady(state) {
  const row = offers.get(state);
  return !!row && state.npcJobs?.ceresWorkfleet === row.job && row.job.phase === 'player-retained'
    && live(state, row.player) && live(state, row.cradle) && live(state, row.section)
    && row.player.occupantGeneration === row.playerLife && row.cradle.occupantGeneration === row.cradleLife
    && row.section.occupantGeneration === row.life && lineLives(row.line, row.player, row.section)
    && receiverAvailable(state, row, row.ports)
    && noneActive(row.ports.service, row.cradle)
    && eachActive(row.ports.service, row.section, a => a === row.line)
    && readyGeometry(state, row.player, row.cradle, row.section, row.breaker, row.cutterHead);
}

export function ceresPlayerWinchReadyLineId(state) {
  return ceresPlayerWinchReady(state) ? offers.get(state).line.id : null;
}

export function ceresPlayerWinchReceiverLine(state, job, cradle, section, service) {
  const a = job?.receiverId && service?.get(job.receiverId);
  return job?.playerWinching === true && ['pads', 'secured'].includes(job.phase)
    && live(state, cradle) && live(state, section)
    && cradle.data?.worldRecordId === C.identities.cradle && section.data?.worldRecordId === C.identities.payload
    && a?.defId === 'attachment_transport_clamp' && a.controlMode === 'ceres_workfleet'
    && a.controllerId == null && a.sourceSocketId === 'SOCKET_Service_Head' && a.targetSocketId === 'socket_tether_anchor'
    && lineLives(a, cradle, section)
    && eachActive(service, cradle, row => row === a) && eachActive(service, section, row => row === a) ? a : null;
}

/** Snapshot the attachment owner's committed row even inside tether:attached. */
export function serializeCeresPlayerWinching(state, job) {
  const copy = JSON.parse(JSON.stringify(job));
  const pending = creating.get(state);
  if (pending?.job === job && job.playerWinching === true && job.receiverId == null) {
    const line = findActive(pending.service, pending.cradle, a => a.controlMode === 'ceres_workfleet'
      && a.defId === 'attachment_transport_clamp' && lineLives(a, pending.cradle, pending.section));
    if (line) copy.receiverId = line.id;
  }
  return copy;
}

const stillCurrent = (s, job, cradle, cradleLife, section, sectionLife) =>
  s.npcJobs?.ceresWorkfleet === job && live(s, cradle) && live(s, section)
  && cradle.occupantGeneration === cradleLife && section.occupantGeneration === sectionLife;
const claimedByPlayer = (s, ports, service, player, e) => ports.playerCustody(e)
  || live(s, player) && someActive(service, e, a => a.controlMode !== 'ceres_workfleet'
    && a.controllerId == null && lineLives(a, player, e));

/** Called only by the existing job owner, using its canonical identity/admission ports. */
export function stepCeresPlayerWinching(owner, dt, job, bodies, ports) {
  const state = owner.state;
  if (job.playerWinching !== true && job.phase !== 'player-retained') { offers.delete(state); return false; }
  const old = steps.get(state);
  if (old?.job === job && (old.busy || old.tick === state.tick)) return job.playerWinching === true;
  const frame = old && old.job === job ? (old.tick = state.tick, old.busy = true, old)
    : { job, tick: state.tick, busy: true };
  steps.set(state, frame);
  try { return step(owner, dt, job, bodies, ports); } finally { frame.busy = false; }
}

function step(owner, dt, job, bodies, ports) {
  const s = owner.state, { cradle, section, breaker, cutterHead } = bodies;
  const service = ports.service, player = s.entities?.get(s.playerId);
  const current = job.playerWinching === true;
  if (s.save?.restoring || hasPendingCeresWorkfleetAttachments(s)) return current;
  const cradleLife = cradle?.occupantGeneration, sectionLife = section?.occupantGeneration;
  if (current && (claimedByPlayer(s, ports, service, player, cradle) || claimedByPlayer(s, ports, service, player, section))) {
    offers.delete(s);
    const line = job.receiverId && service?.get(job.receiverId);
    if (line?.controlMode === 'ceres_workfleet' && lineLives(line, cradle, section))
      service.cut(line.id, cradle.id, 'ceres_yield_player');
    if (!stillCurrent(s, job, cradle, cradleLife, section, sectionLife)) return true;
    ports.stop('player-retained', 'player-winch-custody-changed');
    if (!stillCurrent(s, job, cradle, cradleLife, section, sectionLife)) return true;
    ports.releaseRetention();
    if (!stillCurrent(s, job, cradle, cradleLife, section, sectionLife)) return true;
    // A claim on the fixed receiver itself also releases its own restraint.
    if (live(s, cradle)) { cradle.data.ceresWorkfleetSlideDisabled = false; cradle.data.ceresWorkfleetSlideTarget = 0; }
    return true;
  }
  const ready = receiverAvailable(s, bodies, ports);
  if (!ready) {
    offers.delete(s);
    if (current) ports.stop(section?.hull <= 0 ? 'section-destroyed' : 'worker-disabled', 'player-winch-unavailable');
    return current;
  }
  if (current) {
    const line = ceresPlayerWinchReceiverLine(s, job, cradle, section, service);
    if (!line || someActive(service, section, a => a !== line) || someActive(service, cradle, a => a !== line)) {
      ports.stop(someActive(service, section, a => a.ownerId === s.playerId) ? 'player-retained' : 'recovery-interrupted', 'player-winch-custody-changed');
      return true;
    }
    // A stopped job never moves the breaker/head to clear a pilot's mistake.
    // The native swept pads remain the final authority for every obstruction.
    cradle.data.ceresWorkfleetSlideDisabled = false;
    const dx = section.pos.x - cradle.pos.x, dz = section.pos.z - cradle.pos.z;
    const localZ = -dx * Math.sin(cradle.rot || 0) + dz * Math.cos(cradle.rot || 0);
    cradle.data.ceresWorkfleetSlideTarget = localZ >= -2 ? 1 : 0;
    const blocker = cradle.data.ceresWorkfleetSlideBlocked && cradle.data.ceresWorkfleetSlideBlocker;
    if (blocker && ![section.id, C.identities.payload].includes(blocker)) job.blockedReason = 'receiver-seating-obstructed';
    else {
      job.blockedReason = null;
      const beforeReel = line.restLength;
      if (line.restLength > 6.5) service.reel(line.id, -Math.min(dt, 1 / 60), 6.5);
      if (!stillCurrent(s, job, cradle, cradleLife, section, sectionLife) || service.get(line.id) !== line || line.state !== 'active') return true;
      // Native geometry may impose a longer floor than requested. Read its
      // accepted progress rather than pretending the requested length was reached.
      if (beforeReel - line.restLength <= 1e-8 && blocker && !ports.retained(cradle, section)
        && Math.hypot(section.vel.x, section.vel.z) < .03 && Math.abs(section.angVel || 0) < .002)
        job.blockedReason = 'receiver-load-misaligned';
    }
    if (job.phase === 'pads' && ports.retained(cradle, section)) {
      const result = ports.retain({ jobId: job.id, workerId: breaker?.id, headId: cutterHead?.id,
        sectionId: section.id, cradleId: cradle.id });
      if (!stillCurrent(s, job, cradle, cradleLife, section, sectionLife)) return true;
      if (result?.ok) ports.change('secured');
    }
    job.updatedTick = s.tick;
    return true;
  }

  // An offer is a same-life observation, not a saved authorization to grab a
  // body on arrival. Continue before handover asks the pilot to line it again.
  const nearby = live(s, player) && !s.ui?.docked && !player.flags?.docked
    && Math.hypot(player.pos.x - cradle.pos.x, player.pos.z - cradle.pos.z) < 380;
  const playerLine = nearby && findActive(service, section, a => a.defId === 'tether_standard'
    && a.controlMode !== 'ceres_workfleet' && a.controllerId == null && lineLives(a, player, section));
  if (playerLine) {
    offers.set(s, { job, section, life: section.occupantGeneration, player, playerLife: player.occupantGeneration,
      cradle, cradleLife: cradle.occupantGeneration, line: playerLine, breaker, cutterHead, ports });
    return false;
  }
  const offered = offers.get(s); offers.delete(s);
  if (!offered || offered.job !== job || offered.section !== section || offered.life !== section.occupantGeneration
    || offered.player !== player || offered.playerLife !== player.occupantGeneration
    || offered.cradle !== cradle || offered.cradleLife !== cradle.occupantGeneration
    || !nearby || service.get(offered.line.id) !== offered.line || offered.line.state !== 'broken'
    || offered.line.breakReason !== 'tether_cut' || !noneActive(service, section) || !noneActive(service, cradle)
    || !readyGeometry(s, player, cradle, section, breaker, cutterHead)) return false;
  const previous = { phase: job.phase, phaseTick: job.phaseTick, updatedTick: job.updatedTick,
    blockedReason: job.blockedReason, receiverId: job.receiverId };
  // Publish the job side before the attachment's synchronous callback. The save
  // projection above obtains its id from the committed row, never predicts it.
  job.playerWinching = true;
  job.receiverId = null;
  ports.change('pads');
  creating.set(s, { job, cradle, section, service });
  let result;
  try {
    result = service.create({ defId: 'attachment_transport_clamp', ownerId: cradle.id, targetId: section.id,
      sourceSocketId: 'SOCKET_Service_Head', targetSocketId: 'socket_tether_anchor',
      sourceWorld: ports.socket(cradle, 'cradle', 'SOCKET_Service_Head'),
      targetWorld: ports.socket(section, 'section', 'SOCKET_Cut_B'), controlMode: 'ceres_workfleet' });
  } finally { creating.delete(s); }
  if (!stillCurrent(s, job, cradle, cradleLife, section, sectionLife)) return true;
  if (!result?.ok) { Object.assign(job, previous); delete job.playerWinching; return false; }
  const line = result.attachment;
  if (service.get(line.id) !== line || !lineLives(line, cradle, section)) {
    ports.stop('recovery-interrupted', 'player-winch-custody-changed'); return true;
  }
  job.receiverId = line.id;
  cradle.data.ceresWorkfleetSlideDisabled = false;
  return true;
}
