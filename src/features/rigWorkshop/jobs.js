// Physical work orders. Cargo is a body with custody, never a counter in a second inventory.
import { physicsBodyNativeReady } from '../../core/physicsAuthority.js';
import { markDirty, DIRTY } from '../../core/dirtyJournal.js';

export const RIG_JOB_DEFS = Object.freeze([
  Object.freeze({ id: 'needle', title: 'The Needle Orchard', rig: 'cradle',
    description: 'Three survey cores are wedged among dead freight frames. Take a cradle through the narrow throat, catch the original pods, and bring them to the receiving gantry.',
    lesson: 'A wide cradle catches more. It also catches the gate. Try a collector on the nose or a bumper on the exposed side.',
    count: 3, mass: 36, radius: 7, hull: 180, pay: 180, asset: 'place_cargo_pod_standard',
    pickup: { x: 670, z: -240 }, destination: { x: 300, z: 480 } }),
  Object.freeze({ id: 'kiln', title: 'A Very Bad Centre of Gravity', rig: 'sled',
    description: 'Two dense thermal stores need moving from the abandoned kiln to a coolant tender. Their mass pulls the tow off line. Take the powered sled, balance the load, and brake before delivery.',
    lesson: 'Put the mover behind the load. An off-centre load twists the hitch. Brake early with mover assist enabled, then let the heavy load settle.',
    count: 2, mass: 190, radius: 5.5, hull: 320, pay: 300, asset: 'place_cargo_pod_hazmat',
    pickup: { x: -760, z: 250 }, destination: { x: -350, z: -480 } }),
]);
export const RIG_JOB_LIMITS = Object.freeze({ receiverRadius: 75, speed: 6, spin: 0.4, minimumTravel: 180, maxBodies: 21 });
const copy = v => JSON.parse(JSON.stringify(v));
const distance = (a, b) => Math.hypot((a?.x || 0) - (b?.x || 0), (a?.z || 0) - (b?.z || 0));
const speed = e => Math.hypot(e?.vel?.x || 0, e?.vel?.z || 0);
const definition = id => RIG_JOB_DEFS.find(d => d.id === id);
const worldPoint = (w, offset) => ({ x: w.bench.pos.x + offset.x, z: w.bench.pos.z + offset.z });
const entity = (state, id) => state.entities?.get(id);

export function createWorkshopJobs({ state, bus, physics, feedback = () => {} }) {
  const bodies = w => (state.entityList || []).filter(e => e.data?.rigWorkshopOwner === w.ownerId && e.data?.rigWorkshopJob);

  function bodySpec(w, job, role, at, { radius = 10, mass = 50, hull = 300, placeId, dynamic = true, token } = {}) {
    return {
      type: 'payload', pos: { ...at }, vel: { x: 0, z: 0 }, rot: 0, angVel: 0,
      radius, mass, hull, hullMax: hull, collides: true, team: 0, ownerId: state.playerId,
      flags: { persistent: true, invuln: !dynamic },
      physicsBody: { schemaVersion: 1, dynamic, shape: 'ball', radius, mass,
        inertiaY: mass * radius * radius * 0.5, material: dynamic ? 'cargo' : 'wreck', ccd: true, revision: 0 },
      data: { rigWorkshopOwner: w.ownerId, rigWorkshopJob: job.id, rigWorkshopRole: role,
        persistenceOwner: 'rigWorkshop', transientSector: false, sectorId: w.bench.sectorId,
        homeSectorId: w.bench.sectorId, name: role === 'cargo' ? `${job.title} · ${token}` : `${job.title} · ${role}`,
        placeId, placeTargetRadius: radius, poi: true, playerOwned: dynamic,
        salvagePool: {}, payloadType: 'rig_workshop',
        ...(role === 'cargo' ? { rigWorkshopCargo: { jobId: job.id, token, ownerId: w.ownerId, delivered: false } } : {}),
      },
    };
  }

  function accept(w, id) {
    const def = definition(id);
    if (!def) return { ok: false, reason: 'Unknown work order.' };
    const existing = w.jobs?.[id];
    if (existing) return { ok: false, reason: existing.settled ? 'This contract has already been settled.' : 'This work order is already aboard. Follow its cargo marker.' };
    if (w.activeJobId && !w.jobs[w.activeJobId]?.settled) return { ok: false, reason: 'Finish or settle the current work order first.' };
    if (!w.rigs?.length) return { ok: false, reason: 'Inspect a rig at the bench first.' };
    if (bodies(w).length > RIG_JOB_LIMITS.maxBodies - 9) return { ok: false, reason: 'Workshop body limit reached. Finish the first job before accepting another.' };
    if (!w.bench?.pos || state.world?.currentSectorId !== w.bench.sectorId) return { ok: false, reason: 'Accept this order at the workshop in its home sector.' };
    const pickup = clearPatch(w, worldPoint(w, def.pickup), id === 'needle' ? 145 : 165);
    const destination = pickup && clearPatch(w, worldPoint(w, def.destination), 110, pickup);
    if (!pickup || !destination) return { ok: false, reason: 'The nearby work site is obstructed. Clear the local traffic and try the order again; nothing was spent.' };
    const job = { id, title: def.title, stage: 'pickup', acceptedAt: state.simTime || 0,
      sectorId: w.bench.sectorId, pickup, destination,
      cargoIds: [], cargo: [], obstacleIds: [], receiverId: null, deliveryRadius: RIG_JOB_LIMITS.receiverRadius, delivered: [], paid: 0, settled: false,
      signatureAwarded: false, lastReject: null };
    const spawned = [];
    const spawn = spec => { const e = physics.spawnBody(spec); if (e) spawned.push(e); return e; };
    try {
      const receiver = spawn(bodySpec(w, job, 'receiver', { x: job.destination.x + 65, z: job.destination.z },
        { radius: 19, mass: 100000, dynamic: false, placeId: 'place_maintenance_gantry' }));
      if (!receiver) throw new Error('Receiver could not enter the world.');
      job.receiverId = receiver.id;
      for (let i = 0; i < def.count; i += 1) {
        const token = `${w.ownerId}:${id}:${i + 1}`;
        const at = { x: job.pickup.x + (i - (def.count - 1) / 2) * 39, z: job.pickup.z + 55 + (i % 2) * 28 };
        const e = spawn(bodySpec(w, job, 'cargo', at, { radius: def.radius, mass: def.mass * (id === 'kiln' && i === 1 ? 1.4 : 1), hull: def.hull, placeId: def.asset, token }));
        if (!e) throw new Error('A cargo body could not enter the world.');
        job.cargoIds.push(e.id);
        job.cargo.push({ id: e.id, token, origin: { ...at }, collectedByRig: null, travelled: 0, paid: false, lost: false });
      }
      // Two rows make a physical throat. The alternate wide route stays open around them.
      for (const side of [-1, 1]) for (let row = 0; row < 2; row += 1) {
        const e = spawn(bodySpec(w, job, 'freight frame', { x: job.pickup.x + side * (id === 'needle' ? 48 : 92), z: job.pickup.z - 65 + row * 52 },
          { radius: id === 'needle' ? 24 : 30, mass: 100000, dynamic: false, placeId: 'place_construction_frame' }));
        if (!e) throw new Error('The route could not enter the world.');
        job.obstacleIds.push(e.id);
      }
    } catch (error) {
      for (const e of spawned) physics.removeBody?.(e);
      return { ok: false, reason: error.message };
    }
    w.jobs ||= {};
    w.jobs[id] = job;
    w.activeJobId = id;
    feedback('edit', `${def.title} accepted. ${def.lesson}`, job.pickup);
    guide(w);
    return { ok: true, job };
  }

  function clearPatch(w, desired, radius, other = null) {
    // Find room once, before spawning any job body. Existing world obstacles
    // remain real: a contract may not bury its originals inside a station or
    // asteroid. The authored narrow throat is then built inside this pocket.
    const candidates = [{ ...desired }];
    for (const ring of [180, 360]) for (let step = 0; step < 12; step += 1) {
      const angle = step * Math.PI / 6;
      candidates.push({ x: desired.x + Math.cos(angle) * ring, z: desired.z + Math.sin(angle) * ring });
    }
    const colliders = (state.entityList || []).filter(e => e.alive !== false && e.collides !== false
      && e.type !== 'projectile' && e.type !== 'pickup' && e.pos && Number.isFinite(e.radius));
    return candidates.find(p => distance(p, w.bench.pos) >= 350 && (!other || distance(p, other) >= 400)
      && colliders.every(e => distance(p, e.pos) > radius + e.radius + 10)) || null;
  }

  function original(w, job, record) {
    const e = entity(state, record.id), tag = e?.data?.rigWorkshopCargo;
    return e && tag?.jobId === job.id && tag.token === record.token && tag.ownerId === w.ownerId
      && e.data.rigWorkshopOwner === w.ownerId ? e : null;
  }

  function update(w) {
    for (const job of Object.values(w.jobs || {})) {
      if (job.settled) continue;
      for (const record of job.cargo) {
        if (record.paid) continue;
        const e = original(w, job, record);
        // Do not declare a missing off-sector body destroyed. The same saved IDs return.
        if (e && (e.alive === false || e.hull <= 0)) record.lost = true;
        if (!e || e.alive === false) { record.lastSecuredPos = null; continue; }
        const rig = w.rigs.find(r => r.cargoIds?.includes(e.id));
        if (rig && physics.isCargoSecured?.(w, rig.id, e.id) === true && physicsBodyNativeReady(e)) {
          const now = state.simTime || 0;
          const prior = record.lastSecuredPos;
          // Count continuous transport while held, not distance moved before capture.
          if (prior && prior.rigId === rig.id && now >= prior.time && now - prior.time <= 0.2) {
            const step = distance(prior, e.pos);
            const plausibleStep = Math.max(6, (speed(e) + (prior.speed || 0)) * Math.max(1 / 60, now - prior.time) * 1.5);
            if (step <= plausibleStep) {
              record.travelled = (record.travelled || 0) + step;
              if (rig.modified) record.modifiedTravel = (record.modifiedTravel || 0) + step;
            }
          }
          record.lastSecuredPos = { x: e.pos.x, z: e.pos.z, rigId: rig.id, time: now, speed: speed(e) };
          record.collectedByRig = rig.id;
          record.modified = (record.modifiedTravel || 0) >= RIG_JOB_LIMITS.minimumTravel;
          if (job.stage === 'pickup') { job.stage = 'delivery'; guide(w); }
        } else record.lastSecuredPos = null;
      }
    }
  }

  function recordLoss(w, receipt) {
    const id = receipt?.id;
    for (const job of Object.values(w.jobs || {})) {
      const record = job.cargo.find(c => c.id === id && !c.paid && !c.lost);
      if (!record || job.settled) continue;
      // The combat kill receipt arrives before the canonical entity sweep. A
      // residency removal does not emit this death and must never count as loss.
      const body = original(w, job, record);
      if (body && (body.alive === false || body.hull <= 0)) {
        record.lost = true; record.lastSecuredPos = null;
        feedback('warning', 'An original cargo body was lost. Recover the survivors for partial payment, then settle the order at the gantry or bench.');
      }
    }
  }

  function deliveryQuote(w, id = w.activeJobId) {
    const job = w.jobs?.[id], def = definition(id);
    if (!job || !def) return { ok: false, reason: 'No work order is active.', accepted: [], rejected: [] };
    if (job.settled) return { ok: false, reason: 'The receipt is closed. This cargo cannot pay twice.', accepted: [], rejected: [] };
    if (state.world?.currentSectorId !== job.sectorId) return { ok: false, reason: 'Return to the receiver in the workshop sector.', accepted: [], rejected: [] };
    const player = entity(state, state.playerId), receiver = entity(state, job.receiverId);
    if (!receiver || receiver.alive === false || receiver.hull <= 0) return { ok: false, reason: 'The receiver is unavailable. Cargo and earned receipts are preserved.', accepted: [], rejected: [] };
    if (!player || distance(player.pos, job.destination) > 170) return { ok: false, reason: 'Travel to the receiving gantry before requesting delivery.', accepted: [], rejected: [] };
    const accepted = [], rejected = [];
    for (const record of job.cargo) {
      if (record.paid) continue;
      const e = original(w, job, record);
      let reason = null;
      if (!e) reason = 'Original cargo is missing; a replacement body does not satisfy the manifest.';
      else if (e.alive === false || e.hull <= 0) reason = 'Cargo destroyed. Bring the surviving pieces for a partial payment.';
      else if (!physicsBodyNativeReady(e)) reason = 'Cargo is waiting for physical admission. Hold position.';
      else if (!record.collectedByRig || (record.travelled || 0) < RIG_JOB_LIMITS.minimumTravel) reason = 'Use an assembled rig to carry this cargo out of the pickup field.';
      else if (distance(e.pos, job.destination) > RIG_JOB_LIMITS.receiverRadius) reason = 'Cargo is outside the receiving circle. Bring the body itself inside.';
      else if (speed(e) > RIG_JOB_LIMITS.speed || Math.abs(e.angVel || 0) > RIG_JOB_LIMITS.spin) reason = 'Cargo is moving too fast. Brake and let it settle.';
      else if (e.data.rigWorkshopCargo.delivered) reason = 'This body already has a delivery receipt.';
      if (reason) rejected.push({ id: record.id, reason });
      else accepted.push({ id: record.id, token: record.token, integrity: Math.max(0, Math.min(1, e.hull / e.hullMax)),
        amount: Math.round(def.pay * (0.3 + 0.7 * Math.max(0, Math.min(1, e.hull / e.hullMax)))) });
    }
    return { ok: accepted.length > 0, reason: accepted.length ? null : rejected[0]?.reason || 'No unpaid cargo remains.', accepted, rejected };
  }

  function deliver(w, id = w.activeJobId) {
    update(w);
    const quote = deliveryQuote(w, id), job = w.jobs?.[id];
    if (!quote.ok) { if (job) job.lastReject = quote.reason; return quote; }
    // Commit custody and payout receipt before publishing to economy. Its writer remains sole owner of credits.
    let amount = 0;
    for (const line of quote.accepted) {
      const record = job.cargo.find(c => c.id === line.id), e = original(w, job, record);
      if (record.paid || !e) continue;
      for (const rig of w.rigs) if (rig.cargoIds?.includes(e.id)) physics.releaseCargo(w, rig.id, e.id);
      record.paid = true;
      e.data.rigWorkshopCargo.delivered = true;
      e.data.rigWorkshopCargo.receiverId = job.receiverId;
      e.data.playerOwned = false;
      e.ownerId = job.receiverId;
      markDirty(state, e.id, DIRTY.CARGO | DIRTY.COMBAT);
      physics.markBodyChanged?.(e);
      job.delivered.push(e.id);
      amount += line.amount;
    }
    const firstModified = !w.signatureDone && job.cargo.some(c => c.paid && c.modified);
    if (firstModified) { w.signatureDone = true; job.signatureAwarded = true; amount += 100; }
    job.paid += amount;
    // Useful work supplies repair material as well as money. The same paid flags
    // guard both grants, so damaged rigs can return to service without a grind.
    w.stock = Math.min(32, w.stock + quote.accepted.length);
    job.lastReject = null;
    job.stage = job.cargo.every(c => c.paid || c.lost) ? 'settled' : 'partial';
    job.settled = job.stage === 'settled';
    const receipt = { id: `${w.ownerId}:${id}:receipt:${job.delivered.length}`, jobId: id, amount,
      cargoIds: quote.accepted.map(c => c.id), time: state.simTime || 0 };
    w.receipts ||= [];
    w.receipts.push(receipt);
    bus.emit('economy:grantCredits', { amount, reason: `rigWorkshop:${receipt.id}` });
    bus.emit('rigWorkshop:delivered', copy(receipt));
    feedback(firstModified ? 'signature' : job.settled ? 'delivery' : 'partial',
      firstModified ? `That is your machine doing real work. ${amount} cr paid, including 100 cr for the first job with your own modification.`
        : `${job.delivered.length}/${job.cargo.length} originals delivered · ${amount} cr paid. ${job.settled ? 'Work order settled.' : 'The remaining cargo is still yours to recover.'}`, job.destination);
    if (job.settled) { w.activeJobId = null; guide(w, 'bench'); }
    return { ...quote, amount, receipt, settled: job.settled };
  }

  function settlePartial(w) {
    const job = w.jobs?.[w.activeJobId];
    if (!job || job.settled) return { ok: false, reason: 'No open work order.' };
    if (state.world?.currentSectorId !== job.sectorId) return { ok: false, reason: 'Return to the workshop sector to settle this order.' };
    const player = entity(state, state.playerId);
    if (distance(player?.pos, job.destination) > 170 && distance(player?.pos, w.bench.pos) > 170)
      return { ok: false, reason: 'Report back to the bench or receiving gantry to close the order.' };
    job.settled = true; job.stage = 'settled'; job.closedPartial = true;
    w.activeJobId = null;
    feedback('partial', `Order closed with ${job.delivered.length}/${job.cargo.length} delivered. ${job.paid} cr kept. Your rig and the surviving original cargo remain in the world.`);
    guide(w, 'bench');
    return { ok: true, paid: job.paid };
  }

  function guide(w, target) {
    if (!w.bench) return { ok: false, reason: 'The workshop has not been charted yet.' };
    const job = w.jobs?.[w.activeJobId];
    const useBench = target === 'bench' || !job;
    const usePickup = target === 'pickup' || (!target && job && job.stage === 'pickup');
    const remaining = usePickup ? (job?.cargo || []).filter(c => !c.paid && !c.lost
      && !w.rigs.some(r => physics.isCargoSecured?.(w, r.id, c.id))) : [];
    const player = entity(state, state.playerId);
    remaining.sort((a, b) => distance(original(w, job, a)?.pos || a.origin, player?.pos)
      - distance(original(w, job, b)?.pos || b.origin, player?.pos));
    const cargo = remaining[0] && original(w, job, remaining[0]);
    if (!useBench && usePickup && !remaining.length) return { ok: false,
      reason: 'There are no loose unpaid originals left. Mark the receiver for the load aboard, or settle the completed work.' };
    const pos = useBench ? w.bench.pos : usePickup ? cargo?.pos || remaining[0]?.origin || job.pickup : job.destination;
    bus.emit('ui:setCourse', { pos: { ...pos }, sectorId: w.bench.sectorId, autopilot: false,
      ...(cargo ? { targetEntityId: cargo.id } : {}),
      waypointKind: 'local', arrivalRadius: useBench ? 90 : 65,
      label: useBench ? 'RATCHET · RIG WORKSHOP' : usePickup ? `${job.title} · ORIGINAL CARGO` : `${job.title} · RECEIVING GANTRY`,
      reason: useBench ? 'Inspect, change, repair, or recover your machine.' : usePickup ? 'Fly the rig to the cargo. Slow down, then secure the nearest original.' : 'Deliver the physical cargo inside the gantry circle at low speed.' });
    return { ok: true };
  }
  return { accept, update, recordLoss, deliveryQuote, deliver, settlePartial, guide };
}
