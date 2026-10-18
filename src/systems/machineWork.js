// Finite procedures for the existing maintenance pylon, foundry and reclamation frame.
// The durable job lives on its machine-site row; the physics owner moves workpieces.
import { ensureAlienEcologyState } from '../data/alienEcologyState.js';
import { MACHINE_SITES, machineKindById } from '../data/precursorMachines.js';
import { queuePhysicsImpulse } from '../core/physicsAuthority.js';
import { markDressingRowPoseDirty } from '../world/dressingTable.js';

function siteRecord(state, siteId) {
  const ae = ensureAlienEcologyState(state);
  ae.machineSites ||= {};
  return ae.machineSites[siteId] ||= { seen: false, beats: {}, directiveIssued: false };
}

function log(world, from, text) { world.bus.emit('comms:log', { from, text, kind: 'machine' }); }
function distance(a, b) { return Math.hypot(a.x - b.x, a.z - b.z); }
const workpieceBodies = new WeakMap();
const protocolOffers = new WeakMap();

// Live frames file their job on `kind`. Callers pass that job as `role`; a frame
// that also carries `role` matches the same way. The flag is what the weld/repair
// cadence reads, so idle frames stay dark.
function syncSiteRoleFlag(state, siteId, role, field, value) {
  const entities = state?.entities;
  if (!entities) return;
  const list = typeof entities.values === 'function' ? entities.values() : entities;
  const on = Boolean(value);
  for (const e of list) {
    const machine = e?.data?.machine;
    if (!machine || machine.siteId !== siteId) continue;
    if (machine.kind !== role && machine.role !== role) continue;
    machine[field] = on;
  }
}

// Completion files what the site granted. The two-order filing already owns
// rec.protocol as a record (step, sequences); replacing that object would drop
// the saved order. A string standing still advances, unless the site withdrew.
function noteWorksiteSatisfied(state, rec, site, status) {
  const ae = ensureAlienEcologyState(state);
  if (!ae.machineAccess || typeof ae.machineAccess !== 'object') ae.machineAccess = {};
  ae.machineAccess[site.siteId] = status;
  const protocol = rec.protocol;
  if (protocol && typeof protocol === 'object') {
    if (protocol.standing !== 'withdrawn') protocol.standing = 'satisfied';
    return;
  }
  if (protocol !== 'withdrawn') rec.protocol = 'satisfied';
}

// The two machines have different, equally valid filing procedures. These are runtime
// records, not global protocol standing or mutable catalog definitions.
function foundryProtocol(rec) {
  return rec.protocol ||= {
    sequences: {
      preservation: ['observe', 'position', 'present', 'choose'],
      construction: ['observe', 'present', 'position', 'choose'],
    },
    approach: null, step: 0, evidence: null, presented: false,
  };
}

function foundryChoice(body, center, site) {
  if (!body?.pos || body.alive === false || body.hull <= 0
      || Math.hypot(body.vel?.x || 0, body.vel?.z || 0) >= 5) return null;
  for (const [choice, dx] of [['preservation', site.workCycle.preserveDx], ['construction', site.workCycle.cradleDx]]) {
    if (distance(body.pos, { x: center.x + dx, z: center.z }) < site.workCycle.intakeRadius) return choice;
  }
  return null;
}

export function offerFoundryProtocol(world, force = false) {
  const site = MACHINE_SITES.pallas_empty_foundry, state = world?.state;
  if (!state || state.world?.currentSectorId !== site.sectorId) return false;
  const rec = siteRecord(state, site.siteId), protocol = foundryProtocol(rec);
  const player = state.entities.get(state.playerId), center = world._toGlobal(site.center, site.sectorId);
  const body = state.entityList.find(e => e.alive !== false && e.hull > 0 && e.data?.machineWorkpiece === site.siteId);
  if (!player?.pos || player.alive === false || distance(player.pos, center) > site.radius + 400
      || !body || rec.jurisdiction?.status === 'resolved') {
    if (protocolOffers.has(rec)) { world.bus.emit('siteEvidence:closed', { siteId: site.siteId }); protocolOffers.delete(rec); }
    return false;
  }
  const expected = protocol.sequences[protocol.approach]?.[protocol.step] || 'observe';
  const stamp = `${protocol.approach}:${expected}:${protocol.declined === true}`;
  if (!force && (protocol.declined || protocolOffers.get(rec) === stamp)) return false;
  protocol.declined = false;
  protocolOffers.set(rec, `${protocol.approach}:${expected}:false`);
  const approach = protocol.approach;
  world.bus.emit('siteEvidence:offer', {
    siteId: site.siteId, headline: 'Two correct orders',
    detail: approach
      ? `${approach.toUpperCase()}: ${protocol.sequences[approach].join(' → ')}. Next: ${expected}. Move this ballast into the ${approach === 'preservation' ? 'west' : 'east'} cradle, radius ${site.workCycle.intakeRadius}; hold below 5 WU/s for ${site.workCycle.settleS}s. Three spent gantry charges stay spent. No cargo or payment is required; ordinary Massline can move the ballast.`
      : 'Read either machine. Preservation files position before presentation; construction files presentation before position. Both accept the same ballast. Leaving keeps a safe stalemate.',
    choices: approach ? [
      { id: 'present', label: 'Present the current finding' },
      { id: 'choose', label: `Confirm ${approach}` },
      { id: 'observe', label: 'Read the procedure again', approach },
      { id: 'abort', label: 'Leave the machines waiting' },
    ] : [
      { id: 'observe', label: 'Read preservation procedure', approach: 'preservation' },
      { id: 'observe', label: 'Read construction procedure', approach: 'construction' },
      { id: 'abort', label: 'Leave the machines waiting' },
    ],
  });
  return true;
}

export function handleFoundryProtocolAction(world, request = {}) {
  const site = MACHINE_SITES.pallas_empty_foundry;
  if (request.siteId !== site.siteId) return null;
  const state = world.state, rec = siteRecord(state, site.siteId), protocol = foundryProtocol(rec);
  const refuse = reason => {
    log(world, site.name, `PRESENTATION REFUSED. ${reason}`);
    offerFoundryProtocol(world, true);
    return { ok: false, reason };
  };
  if (state.world?.currentSectorId !== site.sectorId) return refuse('Return to the Empty Foundry.');
  const player = state.entities.get(state.playerId), center = world._toGlobal(site.center, site.sectorId);
  if (!player?.pos || player.alive === false || distance(player.pos, center) > site.radius + 400) return refuse('Outside the machine work volume.');
  if (rec.jurisdiction?.status === 'resolved') return { ok: true, settled: true, choice: rec.jurisdiction.choice };
  if (protocol.confirmed) return { ok: true, pending: true, choice: protocol.approach };
  if (request.verb === 'abort') {
    protocol.declined = true;
    world.bus.emit('siteEvidence:closed', { siteId: site.siteId });
    return { ok: true, waiting: true };
  }
  const body = state.entityList.find(e => e.alive !== false && e.data?.machineWorkpiece === site.siteId);
  if (!body || body.hull <= 0 || rec.masonry?.status === 'lost') return refuse('The named workpiece is unavailable or destroyed.');
  if (request.verb === 'observe') {
    const approach = request.approach || protocol.approach;
    if (!Object.hasOwn(protocol.sequences, approach)) return refuse('Read preservation or construction first.');
    if (!state.entityList.some(e => e.alive !== false && e.data?.machine?.siteId === site.siteId && e.data.machine.kind === 'conservator')
        || !state.entityList.some(e => e.alive !== false && e.data?.machine?.siteId === site.siteId && e.data.machine.kind === 'mason')) return refuse('Both procedures must be available to observe.');
    if (protocol.approach !== approach || !protocol.evidence) {
      protocol.approach = approach; protocol.step = 1; protocol.presented = false;
      protocol.evidence = { workpiece: site.siteId, hull: body.hull, observedAt: Number(state.simTime) || 0 };
      (rec.jurisdiction ||= { status: 'waiting', choice: null }).settled = 0;
    }
  } else {
    const expected = protocol.sequences[protocol.approach]?.[protocol.step] || 'observe';
    if (request.verb !== expected) return refuse(`Wrong order: ${expected.toUpperCase()} must precede ${String(request.verb).toUpperCase()}.`);
    if (protocol.evidence?.workpiece !== body.data.machineWorkpiece) return refuse('The evidence names another workpiece.');
    if (request.verb === 'present') {
      if (protocol.approach === 'preservation' && foundryChoice(body, center, site) !== 'preservation') return refuse('Return the workpiece to the preservation volume below speed 5.');
      protocol.presented = true; protocol.presentedAt = Number(state.simTime) || 0; protocol.step++;
    } else if (request.verb === 'choose') {
      if (!protocol.presented || foundryChoice(body, center, site) !== protocol.approach
          || rec.jurisdiction.settled < site.workCycle.settleS) return refuse('The same workpiece must still be settled in the chosen volume.');
      protocol.confirmed = true; protocol.step++;
      world.bus.emit('siteEvidence:closed', { siteId: site.siteId });
      return { ok: true, next: null };
    } else return refuse('Unrecognized procedure action.');
  }
  offerFoundryProtocol(world, true);
  return { ok: true, next: protocol.sequences[protocol.approach]?.[protocol.step] || null };
}

function cycleRecord(rec) {
  return rec.workCycle ||= { status: 'awaiting_mail', commissioned: false };
}

function foundryReceipt(rec) {
  const token = rec.courierToken;
  return token?.status === 'delivered' && token.destSiteId === 'pallas_empty_foundry'
    && rec.courierReceiver?.stored > 0 && rec.courierReceiver.acceptedReceipts?.[token.receiptId] > 0;
}

function tickFoundryRepair(world, entity, dt, site, rec) {
  const cycle = cycleRecord(rec);
  const markRepairing = (on) => syncSiteRoleFlag(world.state, site.siteId, 'custodian', 'repairing', on);
  const job = rec.maintenance ||= { integrity: 0.25, material: site.workCycle.charges, work: 0, completed: false };
  const component = world.state.world?.dressing?.rows?.find(row => row.alive !== false
    && row.data?.machineSite === site.siteId && row.data.placeId === 'machine_gantry');
  if (!component) { markRepairing(false); return true; }
  component.data.machineIntegrity = job.integrity;
  component.data.name = `Foundry gantry — ${Math.round(job.integrity * 100)}% integrity`;
  component.data.scanLabel = component.data.name;
  if (job.completed) { markRepairing(false); return true; }
  if (!foundryReceipt(rec)) {
    markRepairing(false);
    if (!job.mailHinted) { job.mailHinted = true; log(world, site.name,
      'REPAIR HELD. RETURN THE ROUTE AUTHORITY TOKEN TO THE CENTRAL INTAKE. THREE GANTRY CHARGES REMAIN RESERVED.'); }
    return true;
  }
  cycle.status = 'repairing';
  const faceDistance = distance(entity.pos, component.pos);
  entity.rot = Math.atan2(component.pos.z - entity.pos.z, component.pos.x - entity.pos.x);
  if (faceDistance > 90) {
    markRepairing(false);
    const travel = Math.min(faceDistance - 90, machineKindById('custodian').speed * dt);
    entity.pos.x += Math.cos(entity.rot) * travel;
    entity.pos.z += Math.sin(entity.rot) * travel;
    return true;
  }
  const player = world.state.entities.get(world.state.playerId);
  if (player?.alive !== false && player?.pos && distance(player.pos, component.pos) < (player.radius || 10) + 38) {
    markRepairing(false);
    if (!job.paused) log(world, site.name, 'GANTRY REPAIR PAUSED. CLEAR THE WORK FACE; USED CHARGES AND PARTIAL WORK ARE RETAINED.');
    job.paused = true;
    return true;
  }
  job.paused = false;
  // At the face with charges left: the repair is in progress. Travel, a blocked
  // face, a missing token, and a finished gantry are not.
  markRepairing(job.material > 0);
  job.work += dt;
  while (job.work >= site.workCycle.repairS && job.material > 0) {
    job.work -= site.workCycle.repairS;
    job.material--;
    job.integrity = Math.min(1, job.integrity + 0.25);
    component.data.machineIntegrity = job.integrity;
    component.data.name = `Foundry gantry — ${Math.round(job.integrity * 100)}% integrity`;
    component.data.scanLabel = component.data.name;
    markDressingRowPoseDirty(world.state, component.id);
    world.bus.emit('audio:cue', { id: 'scan_resolve', position: component.pos });
    log(world, site.name, `GANTRY REPAIRED TO ${Math.round(job.integrity * 100)}%. ${job.material} CHARGES REMAIN.`);
  }
  if (job.material === 0 && !job.completed) {
    job.completed = true;
    markRepairing(false);
    cycle.status = 'jurisdiction';
    world.bus.emit('machine:repairCompleted', { siteId: site.siteId, component: 'foundry_gantry', integrity: job.integrity });
  }
  return true;
}

// Two finite procedures claim one ballast, rather than two fields fighting forever.
// The pilot resolves the disagreement by moving that body into one named volume.
// Preservation retains it but spends the repaired gantry without commissioning the
// foundry; east-cradle placement commits that same ballast to construction.
function tickFoundryJurisdiction(world, body, dt, center, site, rec) {
  const cycle = cycleRecord(rec);
  const jurisdiction = rec.jurisdiction ||= { status: 'waiting', settled: 0, choice: null };
  if (jurisdiction.status === 'resolved') return jurisdiction.choice === 'construction';
  const protocol = foundryProtocol(rec);
  if (!jurisdiction.announced) {
    jurisdiction.announced = true;
    log(world, 'Conservator', `PRESERVE THIS BALLAST. WEST CRADLE ${Math.round(center.x + site.workCycle.preserveDx)}, ${Math.round(center.z)}; RADIUS ${site.workCycle.intakeRadius}. THE THREE REPAIR CHARGES CANNOT BE REFUNDED; THE FOUNDRY WILL STAY UNCOMMISSIONED.`);
    log(world, 'Mason', `RETURN THIS SAME BALLAST TO EAST CRADLE ${Math.round(center.x + site.workCycle.cradleDx)}, ${Math.round(center.z)}; RADIUS ${site.workCycle.intakeRadius}. HOLD BELOW SPEED 5 FOR ${site.workCycle.settleS} SECONDS TO COMMIT CONSTRUCTION. BOTH FIELDS WAIT FOR YOUR CHOICE.`);
  }
  body.data.scanLabel = 'FOUNDRY BALLAST — WEST PRESERVATION / EAST CONSTRUCTION';
  const choice = foundryChoice(body, center, site);
  jurisdiction.settled = choice && choice === jurisdiction.choice ? jurisdiction.settled + dt : 0;
  jurisdiction.choice = choice;
  if (choice === protocol.approach && jurisdiction.settled >= site.workCycle.settleS
      && protocol.sequences[protocol.approach]?.[protocol.step] === 'position') protocol.step++;
  offerFoundryProtocol(world);
  if (!protocol.confirmed || choice !== protocol.approach || jurisdiction.settled < site.workCycle.settleS) return false;
  jurisdiction.status = 'resolved';
  jurisdiction.resolvedAt = Number(world.state.simTime) || 0;
  jurisdiction.workpiece = site.siteId;
  if (choice === 'preservation') {
    rec.masonry.status = 'preserved';
    body.data.scanLabel = 'PRESERVED FOUNDRY BALLAST — GANTRY CHARGES SPENT';
    cycle.status = 'preserved';
    cycle.commissioned = false;
    noteWorksiteSatisfied(world.state, rec, site, cycle.status);
    log(world, 'Conservator', 'PRESERVATION CUSTODY ACCEPTED. BALLAST RETAINED; FOUNDRY UNCOMMISSIONED. THREE GANTRY CHARGES SPENT.');
  } else {
    cycle.status = 'placing';
    log(world, 'Mason', 'CONSTRUCTION CUSTODY ACCEPTED. PRESERVATION CLAIM RELEASED. EAST CRADLE TRANSFER RESUMES.');
  }
  world.bus.emit('machine:jurisdictionResolved', { siteId: site.siteId, choice, entityId: body.id, chargesSpent: site.workCycle.charges });
  world.bus.emit('siteEvidence:closed', { siteId: site.siteId });
  world.bus.emit('audio:cue', { id: 'presentation.dock.capture', position: body.pos });
  return choice === 'construction';
}

// This is velocity-matched work, not a second pose writer. Player pulls and collisions
// can overcome it; a job completes only after the real body reaches the work envelope.
function drawWorkpiece(world, body, destination, dt, speed = 18) {
  const dx = destination.x - body.pos.x, dz = destination.z - body.pos.z;
  const d = Math.hypot(dx, dz);
  const v = Math.min(speed, d * 0.6);
  const mass = Number(body.physicsBody?.mass) || Number(body.mass) || 1;
  const gain = Math.min(1, dt * 1.5);
  queuePhysicsImpulse(body, {
    x: ((d ? dx / d * v : 0) - (body.vel?.x || 0)) * mass * gain,
    z: ((d ? dz / d * v : 0) - (body.vel?.z || 0)) * mass * gain,
  }, { source: 'machine_work', tick: world.state.tick });
}

export function tickCustodianWork(world, entity, dt) {
  const m = entity.data.machine;
  if (MACHINE_SITES[m.siteId]?.workCycle) {
    const site = MACHINE_SITES[m.siteId];
    return tickFoundryRepair(world, entity, dt, site, siteRecord(world.state, m.siteId));
  }
  if (m.siteId !== 'ashfall_maintenance_scene') return false;
  const state = world.state, site = MACHINE_SITES[m.siteId];
  const rec = siteRecord(state, m.siteId);
  const job = rec.maintenance ||= { integrity: 0.25, material: 3, work: 0, completed: false };
  const component = state.world?.dressing?.rows?.find(row => row.alive !== false
    && row.data?.machineSite === m.siteId && row.data.placeId === 'machine_pylon');
  const markRepairing = (on) => syncSiteRoleFlag(state, site.siteId, 'custodian', 'repairing', on);
  if (!component) { markRepairing(false); return true; }
  component.data.name = `Maintenance pylon — ${Math.round(job.integrity * 100)}% integrity`;
  component.data.scanLabel = component.data.name;
  component.data.machineIntegrity = job.integrity;
  if (job.completed) { markRepairing(false); return true; }
  if (!job.started) { job.started = true; log(world, site.name, 'PYLON FRACTURE. THREE REPAIR CHARGES RESERVED. KEEP THE WORK FACE CLEAR.'); }
  const player = state.entities.get(state.playerId);
  const obstructed = player?.alive !== false && player?.pos
    && distance(player.pos, component.pos) < (player.radius || 10) + 38;
  if (obstructed || distance(entity.pos, component.pos) > 100) {
    markRepairing(false);
    if (!job.paused) log(world, site.name, 'REPAIR PAUSED. CLEAR THE PYLON FACE; COMPLETED WORK IS RETAINED.');
    job.paused = true;
    return true;
  }
  job.paused = false;
  const desired = Math.atan2(component.pos.z - entity.pos.z, component.pos.x - entity.pos.x);
  entity.rot = desired;
  markRepairing(job.material > 0);
  job.work += dt;
  if (job.work >= 9 && job.material > 0) {
    job.work -= 9;
    job.material--;
    job.integrity = Math.min(1, job.integrity + 0.25);
    component.data.machineIntegrity = job.integrity;
    component.data.name = `Maintenance pylon — ${Math.round(job.integrity * 100)}% integrity`;
    component.data.scanLabel = component.data.name;
    markDressingRowPoseDirty(state, component.id);
    world.bus.emit('audio:cue', { id: 'scan_resolve', position: component.pos });
    log(world, site.name, `PYLON REPAIRED TO ${Math.round(job.integrity * 100)}%. ${job.material} REPAIR CHARGES REMAIN.`);
    if (job.material === 0) {
      job.completed = true;
      markRepairing(false);
      world.bus.emit('machine:repairCompleted', { siteId: m.siteId, component: 'maintenance_pylon', integrity: job.integrity });
    }
  }
  return true;
}

export function tickMasonWork(world, entity, dt) {
  const m = entity.data.machine;
  if (m.siteId !== 'pallas_empty_foundry') return false;
  const state = world.state, rec = siteRecord(state, m.siteId);
  const site = MACHINE_SITES[m.siteId];
  const markWorking = (on) => syncSiteRoleFlag(state, site.siteId, 'mason', 'working', on);
  const center = world._toGlobal(site.center, site.sectorId);
  // Retirement must also run when a lost workpiece makes the procedure return early.
  offerFoundryProtocol(world);
  if (site.workCycle && (!foundryReceipt(rec) || rec.maintenance?.completed !== true)) {
    cycleRecord(rec);
    markWorking(false);
    return true;
  }
  const job = rec.masonry ||= { status: 'moving', pos: { x: center.x - 260, z: center.z }, settled: 0 };
  if (job.status === 'lost') { markWorking(false); return true; }
  let body = state.entityList.find(e => e.alive !== false && e.data?.machineWorkpiece === m.siteId);
  if (!body) {
    const previous = workpieceBodies.get(job) || (m.workpieceId != null && state.entities.get(m.workpieceId));
    if (previous?.data?.machineWorkpiece === m.siteId && previous.hull <= 0) {
      job.status = 'lost'; log(world, site.name, 'WORKPIECE DESTROYED. RELOCATION CANCELLED.');
      markWorking(false); return true;
    }
    body = world.helpers.spawnEntity({
      type: 'asteroid', pos: { ...job.pos }, vel: { x: 0, z: 0 }, rot: 0,
      radius: 34, hull: 1800, hullMax: 1800, mass: 180,
      collides: true, homeSectorId: site.sectorId,
      flags: { persistent: true },
      physicsBody: { dynamic: true, radius: 34, mass: 180, material: 'asteroid' },
      data: { typeId: 'ast_metallic', tier: 0, tierCap: 0, yieldU: 0, oreHP: 1800, oreHPMax: 1800,
        name: 'Foundry ballast workpiece', machineWorkpiece: m.siteId,
        scanLabel: 'FOUNDRY BALLAST — MOVING TO EAST CRADLE', orePool: {}, transientSector: false },
    });
    if (!body) { markWorking(false); return true; }
    m.workpieceId = body.id;
  }
  workpieceBodies.set(job, body);
  job.pos = { x: body.pos.x, z: body.pos.z };
  if (site.workCycle && !tickFoundryJurisdiction(world, body, dt, center, site, rec)) {
    markWorking(false);
    return true;
  }
  if (job.status === 'placed') { markWorking(false); return true; }
  if (job.status === 'moving') job.status = 'placing';
  markWorking(job.status === 'placing');
  const destination = { x: center.x + 180, z: center.z };
  drawWorkpiece(world, body, destination, dt, 14);
  if (!job.announced) {
    job.announced = true;
    log(world, site.name, 'BALLAST TRANSFER TO EAST CRADLE. FIELD CAN BE OVERRIDDEN; CLEAR THE WORKPIECE TO RESUME.');
  }
  const aligned = distance(body.pos, destination) < 25 && Math.hypot(body.vel?.x || 0, body.vel?.z || 0) < 5;
  job.settled = aligned ? job.settled + dt : 0;
  if (job.settled >= 3) {
    job.status = 'placed';
    markWorking(false);
    if (site.workCycle) {
      const cycle = cycleRecord(rec);
      cycle.status = 'complete';
      cycle.commissioned = true;
      noteWorksiteSatisfied(state, rec, site, cycle.status);
    }
    body.data.scanLabel = 'FOUNDRY BALLAST — EAST CRADLE COMPLETE';
    log(world, site.name, 'BALLAST SEATED. TRANSFER FIELD RELEASED.');
    world.bus.emit('machine:workpiecePlaced', { siteId: m.siteId, entityId: body.id });
    world.bus.emit('audio:cue', { id: 'presentation.dock.capture', position: body.pos });
  }
  return true;
}

function protectedMaterial(state, target) {
  const d = target.data || {};
  const tethered = Object.values(state.combat?.attachments?.byId || {}).some(a =>
    a?.state === 'active' && (a.targetId === target.id || a.ownerId === target.id));
  return d.machineProcessed || d.machineToken || d.machineWorkpiece
    || d.missionId || d.missionTarget || d.missionTag || d.missionPinned || d.questId
    || d.storyId || d.storyProtected || d.storyItem || d.persistent
    || d.worldSiteId || d.worldRecordId || d.salvageSourceKey || d.markerId || d.provenance?.lossId || d.salvorClaimedBy
    || d.ownerId != null || d.cargoIdentity?.ownerId != null
    || tethered || state.player?.targetId === target.id
    || state.player?.tether?.targetId === target.id;
}

function releaseSorterClaim(target) {
  if (!target?.data) return;
  delete target.data.machineClaimedBy;
  delete target.data.machineClaimGeneration;
  delete target.data.machineClaimed;
}

function activeSorterClaim(state, target) {
  const owner = state.entities.get(target.data?.machineClaimedBy);
  const machine = owner?.data?.machine;
  return owner?.alive !== false && machine?.kind === 'debris_sorter'
    && (target.data.machineClaimGeneration == null || target.data.machineClaimGeneration === owner.occupantGeneration)
    && machine.collectId === target.id && machine.collectGeneration === target.occupantGeneration;
}

export function tickSorterWork(world, entity, dt, targets) {
  const state = world.state, m = entity.data.machine;
  const rec = siteRecord(state, m.siteId);
  const job = rec.reclamation ||= { completed: 0 };
  if (job.completed >= 3) return;
  let target = m.collectId != null ? state.entities.get(m.collectId) : null;
  if (target && (target.alive === false || target.occupantGeneration !== m.collectGeneration
    || protectedMaterial(state, target) || distance(target.pos, entity.pos) > 2800
    || (target.homeSectorId != null && target.homeSectorId !== state.world?.currentSectorId))) {
    if (target.data?.machineClaimedBy === entity.id) releaseSorterClaim(target);
    target = null; m.collectId = null; m.collectAt = 0;
  }
  if (!target) {
    let nearest = 2600;
    for (const candidate of targets) {
      if (!candidate?.pos || candidate.alive === false || protectedMaterial(state, candidate)
        || (candidate.homeSectorId != null && candidate.homeSectorId !== state.world?.currentSectorId)) continue;
      if (candidate.data?.machineClaimedBy != null || candidate.data?.machineClaimed) {
        if (activeSorterClaim(state, candidate)) continue;
        // Machine frames rematerialize on return; their transient ids must never leave a
        // retained salvage manifest permanently reserved by an absent or recycled frame.
        releaseSorterClaim(candidate);
      }
      if (candidate.physicsBody?.dynamic === false || candidate.physicsBody === false) continue;
      const d = distance(entity.pos, candidate.pos);
      if (d < nearest) { target = candidate; nearest = d; }
    }
    if (!target) return;
    target.data ||= {};
    target.data.machineClaimedBy = entity.id;
    target.data.machineClaimGeneration = entity.occupantGeneration;
    m.collectId = target.id; m.collectGeneration = target.occupantGeneration; m.collectAt = 0;
    log(world, 'Debris sorter', 'LOOSE MATERIAL MARKED. MOVING TO STAGING; RECOVER IT BEFORE RECLAMATION.');
  }
  // A physical draw carries the selected body home; no deletion at the search radius.
  drawWorkpiece(world, target, m.anchor, dt, 22);
  const staged = distance(target.pos, m.anchor) < 70 && Math.hypot(target.vel?.x || 0, target.vel?.z || 0) < 15;
  if (!staged) { m.collectAt = 0; return; }
  const now = Number(state.simTime) || 0;
  if (!m.collectAt) m.collectAt = now + 20;
  if (now < m.collectAt) return;
  // Reclamation retains the same real salvage body and its manifest in the bin.
  // The player can still retrieve it; finite capacity stops the machine after three.
  target.data.machineProcessed = true;
  releaseSorterClaim(target);
  target.data.scanLabel = 'RECLAIMED SALVAGE — MANIFEST RETAINED';
  job.completed++;
  m.collectId = null; m.collectAt = 0;
  log(world, 'Debris sorter', `MATERIAL STAGED. MANIFEST RETAINED. ${3 - job.completed} BIN POSITIONS REMAIN.`);
  world.bus.emit('audio:cue', { id: 'presentation.dock.capture', position: target.pos });
}
