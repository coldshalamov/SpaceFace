import { makeShipEntitySpec } from '../../systems/ships.js';
import { getCombatKernel } from '../../combat/kernel.js';
import { attachmentBindsOccupant } from '../../combat/attachments.js';
import { physicsBodyNativeReady, writePhysicsControl, syncDerivedPhysicsMass } from '../../core/physicsAuthority.js';
import { addCargo } from '../../systems/cargo.js';
import { stationServices } from '../../systems/stationServices.js';

// This module owns only these finite bodies and their berth controls. Flight, Rapier,
// the combat attachment service, the cargo writer and the save envelope remain authoritative.
export const TENDER_BODY_ID = 'pro:salvageTender:morrowlight';
export const TENDER_PHYSICAL = Object.freeze({
  owner: 'salvageTender', sectorId: 'sector_helios_prime', radius: 24, mass: 90,
  hullMax: 160, initialHull: 68, disabledHull: 24, serviceRange: 110,
  towRange: 150, secureSpeed: 8, rescueDistance: 60, rescueRadius: 55,
  awayShelterRange: 900, rackRange: 95,
});

const CRATES = Object.freeze([
  Object.freeze({ key: 'initial', name: 'Morrowlight emergency locker', offset: [170, 80], scrap: 6, electronics: 3, fuel: 2 }),
  Object.freeze({ key: 'outer', name: 'Broken shift repair crate', offset: [650, -230], scrap: 10, electronics: 5, fuel: 3 }),
  Object.freeze({ key: 'deep', name: 'Old survey expedition chest', offset: [-1000, 480], scrap: 14, electronics: 7, fuel: 3 }),
]);
const COMMODITIES = ['cmdty_scrap_metal', 'cmdty_salvage_electronics', 'cmdty_fuel_cells'];
const validSector = v => typeof v === 'string' && /^sector_[a-z0-9_]+$/.test(v);
const finite = (n, fallback = 0) => Number.isFinite(n) ? n : fallback;
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const point = (p, fallback = { x: 0, z: 0 }) => ({ x: clamp(finite(p?.x, fallback.x), -1e8, 1e8), z: clamp(finite(p?.z, fallback.z), -1e8, 1e8) });
const distance = (a, b) => a && b ? Math.hypot(a.x - b.x, a.z - b.z) : Infinity;
const speed = e => Math.hypot(finite(e?.vel?.x), finite(e?.vel?.z));
const relativeSpeed = (a, b) => Math.hypot(finite(a?.vel?.x) - finite(b?.vel?.x), finite(a?.vel?.z) - finite(b?.vel?.z));
const clone = v => JSON.parse(JSON.stringify(v));
const refusal = reason => ({ ok: false, reason });
const pose = (e, fallback) => ({ ...point(e?.pos || e, fallback), vx: clamp(finite(e?.vel?.x, finite(e?.vx)), -1e5, 1e5),
  vz: clamp(finite(e?.vel?.z, finite(e?.vz)), -1e5, 1e5), rot: finite(e?.rot), spin: clamp(finite(e?.angVel, finite(e?.spin)), -100, 100) });
const crateId = key => `pro:salvageTender:crate:${key}`;
const manifest = (id, quantities) => ({ manifestId: `${id}:manifest`, ownerId: TENDER_BODY_ID,
  ownerName: 'Morrowlight', totalQty: quantities.reduce((a, b) => a + b, 0),
  lines: COMMODITIES.map((commodityId, i) => ({ commodityId, qty: quantities[i] })).filter(l => l.qty > 0) });
const crateMass = cargo => 12 + (cargo?.lines || []).reduce((sum, line) => sum + line.qty
  * (line.commodityId === 'cmdty_scrap_metal' ? 0.9 : line.commodityId === 'cmdty_salvage_electronics' ? 0.4 : 0.6), 0);

export function freshTenderPhysical({ sectorId = TENDER_PHYSICAL.sectorId, anchor = { x: 1090, z: 120 } } = {}) {
  const origin = point(anchor);
  return {
    schema: 1, sectorId: validSector(sectorId) ? sectorId : TENDER_PHYSICAL.sectorId,
    mode: 'secured', disabled: false, anchor: origin, rescueOrigin: { ...origin },
    rescueBerth: { x: origin.x + 110, z: origin.z }, rackId: null,
    tender: { id: TENDER_BODY_ID, spawned: false, status: 'present', hull: TENDER_PHYSICAL.initialHull,
      pose: { ...origin, vx: 0, vz: 0, rot: 0, spin: 0 } },
    recovery: CRATES.map(c => ({ id: crateId(c.key), key: c.key, name: c.name,
      spawned: false, status: 'loose', hull: 80,
      pose: { x: origin.x + c.offset[0], z: origin.z + c.offset[1], vx: 0, vz: 0, rot: 0, spin: 0 },
      manifest: manifest(crateId(c.key), [c.scrap, c.electronics, c.fuel]), rackAttachmentId: null,
    })),
  };
}

/** Detached and bounded save record. Missing crates in an existing save stay lost, never refill. */
export function normalizeTenderPhysical(raw) {
  if (!raw || typeof raw !== 'object' || raw.schema !== 1) return freshTenderPhysical();
  const out = freshTenderPhysical({ sectorId: raw.sectorId, anchor: raw.rescueOrigin || raw.anchor });
  out.anchor = point(raw.anchor, out.anchor);
  out.rescueOrigin = point(raw.rescueOrigin, out.rescueOrigin);
  out.rescueBerth = point(raw.rescueBerth, out.rescueBerth);
  out.mode = raw.mode === 'released' ? 'released' : 'secured';
  out.disabled = raw.disabled === true;
  const t = raw.tender;
  const validTenderRecord = t?.id === TENDER_BODY_ID && typeof t.spawned === 'boolean';
  out.tender.spawned = !validTenderRecord || t.spawned === true;
  out.tender.status = !validTenderRecord || t.status === 'missing' ? 'missing' : 'present';
  out.tender.pose = pose(t?.pose, out.tender.pose);
  out.tender.hull = clamp(finite(t?.hull, TENDER_PHYSICAL.initialHull), 1, TENDER_PHYSICAL.hullMax);
  if (out.tender.hull <= TENDER_PHYSICAL.disabledHull) out.disabled = true;
  const entries = Array.isArray(raw.recovery) ? raw.recovery : [];
  for (const record of out.recovery) {
    const matches = entries.filter(c => c?.id === record.id && c?.key === record.key);
    if (matches.length !== 1) { record.status = 'lost'; record.manifest = manifest(record.id, [0, 0, 0]); continue; }
    const c = matches[0], source = CRATES.find(x => x.key === record.key);
    record.spawned = c.spawned === true;
    record.status = ['loose', 'racked', 'empty', 'lost'].includes(c.status) ? c.status : 'lost';
    record.pose = pose(c.pose, record.pose);
    record.hull = clamp(finite(c.hull, 80), 0, 80);
    const limits = [source.scrap, source.electronics, source.fuel];
    const lines = Array.isArray(c.manifest?.lines) ? c.manifest.lines : [];
    const quantities = COMMODITIES.map((id, i) => {
      const matching = lines.filter(l => l?.commodityId === id);
      return matching.length === 1 ? clamp(Math.floor(finite(matching[0].qty)), 0, limits[i]) : 0;
    });
    record.manifest = manifest(record.id, quantities);
    if (!record.manifest.totalQty && record.status !== 'lost') record.status = 'empty';
    record.rackAttachmentId = typeof c.rackAttachmentId === 'string' && c.rackAttachmentId.length < 96 ? c.rackAttachmentId : null;
  }
  const racked = out.recovery.filter(c => c.status === 'racked' && c.id === raw.rackId);
  out.rackId = racked.length === 1 ? racked[0].id : null;
  for (const c of out.recovery) if (c.status === 'racked' && c.id !== out.rackId) {
    c.status = 'loose'; c.rackAttachmentId = null;
  }
  return out;
}

function isOwnedBody(e, id) {
  return !!e && e.alive !== false && e.data?.persistenceOwner === TENDER_PHYSICAL.owner
    && e.data.worldRecordId === id && e.data.identityKey === id;
}

export function findTenderBody(state) {
  if (state?.salvageTender?.physical?.tender?.status === 'missing') return null;
  const matches = (state?.entityList || []).filter(e => isOwnedBody(e, TENDER_BODY_ID) && e.data.salvageTenderBody === 'tender');
  return matches.length === 1 ? matches[0] : null;
}

export function readTenderPhysicalBodies(state) {
  return { tender: findTenderBody(state), recovery: (state?.entityList || []).filter(e => e?.alive !== false
    && e.data?.persistenceOwner === TENDER_PHYSICAL.owner && e.data.salvageTenderBody === 'recovery') };
}

/** Production owner adapter; call step after flight and before physics. No pose is written after spawn. */
export function createTenderPhysical(ctx) {
  const { state, helpers, bus } = ctx;
  const bindings = new Map(), retired = new WeakSet();
  let currentRow = null, restoring = false, busy = false;
  const subscriptions = [];
  const on = (name, fn) => { if (bus?.on) subscriptions.push(bus.on(name, fn)); };
  const physical = row => row?.physical;
  const player = () => { const e = state.entities?.get(state.playerId); return e?.alive !== false ? e : null; };
  const activeSector = row => state.world?.currentSectorId === physical(row)?.sectorId;
  const recordFor = (row, id) => id === TENDER_BODY_ID ? physical(row)?.tender : physical(row)?.recovery.find(c => c.id === id);
  const byIdentity = (row, id) => {
    const record = recordFor(row, id);
    // Once the original custody is lost, copied public markers cannot reopen it on a
    // later lookup. Only a new run or the explicit save restore boundary replaces this row.
    if (!record || record.status === 'missing' || record.status === 'lost') return null;
    const count = state.entityIndex?.byWorldRecordIdCount?.get?.(id);
    if (count > 1) return null;
    const cached = bindings.get(id);
    if (cached && state.entities?.get(cached.entity.id) === cached.entity
      && cached.entity.occupantGeneration === cached.generation && isOwnedBody(cached.entity, id)) return cached.entity;
    if (cached && !restoring && !retired.has(cached.entity)) {
      // A numeric id recycled inside this live run is not the original, even if the
      // replacement copies its public identity markers. Only afterRestore clears this fence.
      record.status = id === TENDER_BODY_ID ? 'missing' : 'lost';
      bindings.delete(id);
      return null;
    }
    bindings.delete(id);
    const matches = (state.entityList || []).filter(e => e?.alive !== false && e.data?.worldRecordId === id);
    if (matches.length !== 1 || !isOwnedBody(matches[0], id)) return null;
    const entity = matches[0];
    bindings.set(id, { entity, generation: entity.occupantGeneration });
    return entity;
  };
  const kernel = () => getCombatKernel(ctx);
  const attachments = () => kernel().attachments;
  const nativeReady = entity => {
    const physics = ctx.registry?.get?.('physics'), native = physics?._sg02;
    const record = native?.records?.get?.(entity?.id);
    return !!entity && state.entities?.get(entity.id) === entity && entity.alive !== false
      && !physics?._nativeRestorePending && !physics?._nativeRestoreDeferred
      && !native?._pendingNativeRebuilds?.size && !!record?.body && record.entity === entity
      && record.revision === finite(entity.physicsBody?.revision)
      && record.body.isValid?.() !== false
      && physicsBodyNativeReady(entity);
  };
  const lineBetween = (a, b) => {
    if (!a || !b || !nativeReady(a) || !nativeReady(b)) return null;
    const line = attachments().listForEntity(a.id).find(l => l.state === 'active'
      && ['attachment_massline', 'tether_standard'].includes(l.defId)
      && ((l.ownerId === a.id && l.targetId === b.id) || (l.targetId === a.id && l.ownerId === b.id))
      && attachmentBindsOccupant(l, a.id, a.occupantGeneration)
      && attachmentBindsOccupant(l, b.id, b.occupantGeneration));
    if (!line) return null;
    const telemetry = helpers.combatPhysics?.getAttachmentTelemetry?.({ attachmentId: line.id, physicsHandle: line.physicsHandle });
    return telemetry ? line : null;
  };
  const remember = (id, entity) => { bindings.set(id, { entity, generation: entity.occupantGeneration }); return entity; };

  function clearInitialCratePose(record) {
    // Placement is chosen once, before publishing the original. A nearby obstruction
    // must not bury a finite recovery source or cause a later teleport of that source.
    const origin = point(record.pose);
    const offsets = [[0, 0]];
    for (const radius of [36, 72, 120, 180]) {
      for (let i = 0; i < 8; i++) {
        const angle = i * Math.PI / 4;
        offsets.push([Math.cos(angle) * radius, Math.sin(angle) * radius]);
      }
    }
    for (const [x, z] of offsets) {
      const candidate = { x: origin.x + x, z: origin.z + z };
      const blocked = (state.entityList || []).some(e => e?.alive !== false && e.collides !== false
        && e.pos && (e.physicsBody || ['station', 'asteroid', 'ship', 'payload', 'wreck', 'prop'].includes(e.type))
        && distance(candidate, e.pos) < Math.max(0, finite(e.radius), finite(e.data?.collisionRadius)) + 17);
      if (!blocked) { record.pose.x = candidate.x; record.pose.z = candidate.z; return true; }
    }
    return false;
  }

  function bodySpec(row, record, isTender) {
    const p = physical(row), saved = record.pose;
    const spec = isTender ? makeShipEntitySpec('ship_drifter', {
      team: 2, factionId: 'faction_free', pos: point(saved), rot: saved.rot,
      ai: { passive: true, holdFire: true, archetype: 'passive' },
    }) : { type: 'payload', team: 2, factionId: 'faction_free' };
    const radius = isTender ? TENDER_PHYSICAL.radius : 5;
    const mass = isTender ? TENDER_PHYSICAL.mass : crateMass(record.manifest);
    Object.assign(spec, { pos: point(saved), vel: { x: saved.vx, z: saved.vz }, rot: saved.rot,
      angVel: saved.spin, radius, mass, hull: record.hull,
      hullMax: isTender ? TENDER_PHYSICAL.hullMax : 80, shield: 0, shieldMax: 0,
      armorHp: 0, armorMax: 0, armorFlat: 0, weapons: [], thrust: 0, drag: 0,
      homeSectorId: p.sectorId, ttl: Infinity, collides: true,
      flags: { persistent: true, missionPinned: true, invuln: isTender && p.disabled },
      physicsBody: { schemaVersion: 1, dynamic: true, mass, radius,
        inertiaY: mass * radius * radius * 0.4, shape: isTender ? 'capsule' : 'ball',
        material: isTender ? 'ship' : 'payload', ccd: true, useMeasuredSkin: false,
        contact: { friction: 0, restitution: 0.08, angularDamping: 0.12 },
        attachmentPoints: { massline: { x: 0, y: 0, z: 0 } },
      },
    });
    if (isTender) {
      // A dead drive produces no competing flight commands. The berth controller below is
      // ordered after V3; released motion remains Rapier/Massline-owned with no speed clamp.
      spec.flightModel = { flightClass: 'freighter', mass, inertia: spec.physicsBody.inertiaY,
        mainAccel: 0, reverseAccel: 0, strafeAccel: 0, angularAccel: 0, angularBrake: 0,
        maxYawRate: 0, maxSpeed: 80, boostMult: 1, boostMaxSpeedMult: 1,
        normalMaxSpeedMult: 1, linearDrag: 0, lateralDrag: 0, assistStrength: 0, reverseBrake: 0 };
    }
    spec.data = { ...spec.data, worldRecordId: record.id, identityKey: record.id,
      persistenceOwner: TENDER_PHYSICAL.owner, homeSectorId: p.sectorId, sectorId: p.sectorId,
      transientSector: false, salvageTenderBody: isTender ? 'tender' : 'recovery',
      name: isTender ? row.name || 'Morrowlight' : record.name,
      scanLabel: isTender ? 'Morrowlight · recoverable service tender' : record.name,
      scannable: true, weapons: [], fittings: [], miningBeam: null, intent: null,
      salvagePool: {}, authoredSalvagePool: {}, lifetimeS: Infinity, latchRepair: false,
    };
    if (isTender) {
      spec.data.authoredAssetId = 'SF_WHOLESHIP_REPAIR_TENDER';
      spec.data.derived = { ...spec.data.derived, flightModel: { ...spec.flightModel } };
      // Do not stamp trafficRole: traffic would adopt this private home after Continue.
    } else {
      spec.data.salvageTenderCrateId = record.id;
      spec.data.authoredPayloadAssetId = 'pod_cargo_container';
      spec.data.cargoManifest = clone(record.manifest);
      spec.data.towable = true;
    }
    return spec;
  }

  function spawn(row, record, isTender) {
    if (restoring || !activeSector(row) || record.status === 'missing' || record.status === 'lost' || record.status === 'empty') return null;
    const existing = byIdentity(row, record.id);
    if (existing) return existing;
    if (record.status === 'missing' || record.status === 'lost') return null;
    // SaveSystem owns reconstruction of every already-published persistent body. A
    // missing saved original or an immediate removal cannot be repaired by minting one.
    if (record.spawned) { record.status = isTender ? 'missing' : 'lost'; return null; }
    // A live duplicate identity is corruption, not permission to manufacture a third body.
    if ((state.entityList || []).some(e => e?.alive !== false && e.data?.worldRecordId === record.id)) return null;
    if (!isTender && !clearInitialCratePose(record)) return null;
    const entity = helpers.spawnEntity?.(bodySpec(row, record, isTender));
    if (!entity) return null;
    record.spawned = true;
    return remember(record.id, entity);
  }

  function capture(row) {
    const p = physical(row); if (!p) return;
    for (const record of [p.tender, ...p.recovery]) {
      const e = byIdentity(row, record.id); if (!e) continue;
      record.pose = pose(e); record.hull = e.hull;
      if (record !== p.tender && e.data.cargoManifest) record.manifest = clone(e.data.cargoManifest);
    }
  }

  function ensure(row) {
    currentRow = row;
    if (!physical(row)) row.physical = freshTenderPhysical();
    if (restoring) return null;
    return spawn(row, physical(row).tender, true);
  }
  function recoveryBodies(row) {
    return physical(row)?.recovery.map(r => byIdentity(row, r.id)).filter(Boolean) || [];
  }
  function spawnRecovery(row) {
    currentRow = row;
    if (!physical(row) || restoring) return [];
    return physical(row).recovery.map(r => spawn(row, r, false)).filter(Boolean);
  }
  function canSecure(row) {
    const p = physical(row), e = byIdentity(row, TENDER_BODY_ID), pilot = player();
    if (!p || !e || !pilot || restoring || !activeSector(row)) return refusal('tender_unavailable');
    if (!nativeReady(e) || !nativeReady(pilot)) return refusal('waiting_for_physics');
    if (distance(pilot.pos, e.pos) > TENDER_PHYSICAL.towRange) return refusal('close_to_tender');
    if (speed(e) > TENDER_PHYSICAL.secureSpeed || relativeSpeed(e, pilot) > TENDER_PHYSICAL.secureSpeed) return refusal('slow_the_tender');
    if (!row.owned) {
      if (!row.rescueAccepted) return refusal('accept_recovery_first');
      if (!lineBetween(pilot, e)) return refusal('original_tender_needs_your_massline');
      if (distance(e.pos, p.rescueOrigin) < TENDER_PHYSICAL.rescueDistance) return refusal('tow_clear_of_wreckage');
      if (distance(e.pos, p.rescueBerth) > TENDER_PHYSICAL.rescueRadius) return refusal('tow_to_marked_berth');
    } else if (p.mode === 'released' && !lineBetween(pilot, e)) {
      return refusal('reconnect_your_massline_to_secure');
    }
    return { ok: true, bodyId: e.id, worldRecordId: TENDER_BODY_ID };
  }
  function beginTow(row) {
    currentRow = row;
    const p = physical(row), e = byIdentity(row, TENDER_BODY_ID), pilot = player();
    if (!p || !e || !pilot || restoring || !activeSector(row)) return refusal('tender_unavailable');
    if (!row.owned && !row.rescueAccepted) return refusal('accept_recovery_first');
    if (distance(pilot.pos, e.pos) > TENDER_PHYSICAL.towRange) return refusal('close_to_tender');
    if (!nativeReady(e) || !nativeReady(pilot)) return refusal('waiting_for_physics');
    let line = lineBetween(pilot, e);
    if (!line) {
      if (attachments().listForEntity(e.id).some(l => l.state === 'active' && l.controlMode !== 'salvage_tender_rack')) return refusal('another_line_has_tender');
      const created = attachments().create({ defId: 'tether_standard', ownerId: pilot.id, targetId: e.id,
        controlMode: 'salvage_tender_tow', sourceWorld: { ...point(pilot.pos), y: 0 }, targetWorld: { ...point(e.pos), y: 0 } });
      if (!created?.ok) return refusal(created?.reason || 'massline_refused');
      line = created.attachment;
    }
    if (byIdentity(row, TENDER_BODY_ID) !== e || state.entities?.get(pilot.id) !== pilot
      || pilot.alive === false || attachments().get(line.id)?.state !== 'active') return refusal('tow_changed_during_attachment');
    p.mode = 'released'; capture(row);
    return { ok: true, bodyId: e.id, attachmentId: line.id };
  }
  function cancelTow(row) {
    // Closing a recovery may release the line this adapter installed. A manual Massline
    // or another system's attachment remains under its existing owner's controls.
    if (row?.owned) return refusal('owned_tender_not_a_recovery');
    const e = byIdentity(row, TENDER_BODY_ID), pilot = player();
    if (!e || !pilot) return { ok: true, released: false };
    const lines = attachments().listForEntity(e.id).filter(l => l.state === 'active'
      && l.controlMode === 'salvage_tender_tow' && l.ownerId === pilot.id && l.targetId === e.id
      && attachmentBindsOccupant(l, pilot.id, pilot.occupantGeneration)
      && attachmentBindsOccupant(l, e.id, e.occupantGeneration));
    if (!lines.length) return { ok: true, released: false };
    if (lines.length !== 1) return refusal('recovery_line_ambiguous');
    if (!nativeReady(e) || !nativeReady(pilot) || lineBetween(pilot, e) !== lines[0]) return refusal('waiting_for_physics');
    if (!attachments().cut(lines[0].id, pilot.id, 'salvage_tender_recovery_cancel')?.ok) return refusal('line_cut_refused');
    capture(row);
    return { ok: true, released: true, bodyId: e.id };
  }
  function secure(row) {
    const gate = canSecure(row); if (!gate.ok) return gate;
    const e = byIdentity(row, TENDER_BODY_ID), pilot = player(), line = lineBetween(pilot, e);
    if (line) {
      const cut = attachments().cut(line.id, pilot.id, 'salvage_tender_berth');
      if (!cut?.ok) return refusal(cut?.reason || 'line_cut_refused');
    }
    if (byIdentity(row, TENDER_BODY_ID) !== e) return refusal('tender_changed_during_securing');
    const p = physical(row); p.anchor = point(e.pos); p.mode = 'secured'; capture(row);
    return { ok: true, bodyId: e.id, anchor: { ...p.anchor } };
  }

  function canUnload(row, bodyId) {
    const p = physical(row), pilot = player(), e = state.entities?.get(bodyId);
    const r = p?.recovery.find(c => c.id === e?.data?.worldRecordId);
    if (!r || byIdentity(row, r.id) !== e || !pilot || !['loose', 'racked'].includes(r.status)) return refusal('original_crate_unavailable');
    if (!nativeReady(e) || !nativeReady(pilot)) return refusal('waiting_for_physics');
    if (distance(pilot.pos, e.pos) > 75 || relativeSpeed(e, pilot) > TENDER_PHYSICAL.secureSpeed) return refusal('match_crate_speed_within_75');
    if (!(e.data.cargoManifest?.totalQty > 0)) return refusal('crate_empty');
    return { ok: true, bodyId: e.id, sourceId: r.id };
  }
  function unloadRecovery(row, bodyId, cargoOwner = ctx.registry?.get?.('cargo')) {
    if (busy) return refusal('transfer_busy');
    const gate = canUnload(row, bodyId); if (!gate.ok) return gate;
    const e = state.entities.get(bodyId), r = recordFor(row, gate.sourceId), before = e.data.cargoManifest;
    const moved = {}; busy = true;
    try {
      for (const line of before.lines) {
        if (line.qty <= 0) continue;
        const requested = line.qty;
        // Reserve the source before a cargo callback can re-enter. The ordinary cargo
        // owner returns its actual accepted quantity; untouched units stay in this body.
        line.qty = 0;
        before.totalQty -= requested;
        r.manifest = clone(before);
        let accepted = 0;
        try {
          accepted = cargoOwner?.addCargo
            ? cargoOwner.addCargo(line.commodityId, requested, { kind: 'salvage', sourceId: r.id })
            : addCargo(state, line.commodityId, requested, { kind: 'salvage', sourceId: r.id });
        } finally {
          accepted = clamp(Math.floor(finite(accepted)), 0, requested);
          line.qty = requested - accepted; before.totalQty += line.qty;
          if (accepted) moved[line.commodityId] = accepted;
          r.manifest = clone(before);
        }
      }
      if (before.totalQty === 0) {
        // Keep the emptied original shell; the record is terminal and never re-filled.
        r.status = 'empty';
        if (physical(row).rackId === r.id) releaseRecovery(row, e.id);
      }
      const remainingMass = crateMass(before);
      e.mass = remainingMass;
      syncDerivedPhysicsMass(e, remainingMass, remainingMass * e.radius * e.radius * 0.4, e.radius);
      capture(row);
      const total = Object.values(moved).reduce((sum, q) => sum + q, 0);
      if (total) bus?.emit('cargo:changed', { reason: 'salvage_tender_recovery', sourceId: r.id });
      return total ? { ok: true, moved, remaining: before.totalQty, sourceId: r.id } : refusal('cargo_hold_full');
    } finally { busy = false; }
  }
  function stowRecovery(row, bodyId) {
    const p = physical(row), e = state.entities?.get(bodyId), home = byIdentity(row, TENDER_BODY_ID), pilot = player();
    const r = p?.recovery.find(c => c.id === e?.data?.worldRecordId);
    if (!row.owned || row.stage < 3) return refusal('expedition_rack_not_restored');
    if (!r || r.status !== 'loose' || byIdentity(row, r.id) !== e || !home || !pilot) return refusal('original_crate_unavailable');
    if (p.rackId) return refusal('rack_occupied');
    if (p.mode !== 'secured' || p.disabled) return refusal('secure_working_tender_first');
    if (distance(e.pos, home.pos) > TENDER_PHYSICAL.rackRange || distance(pilot.pos, home.pos) > TENDER_PHYSICAL.serviceRange
      || relativeSpeed(e, home) > 8) return refusal('bring_crate_slowly_to_rack');
    if (!nativeReady(e) || !nativeReady(home)) return refusal('waiting_for_physics');
    const existing = attachments().listForEntity(e.id).filter(l => l.state === 'active');
    const pilotLine = lineBetween(pilot, e);
    if (existing.some(l => l !== pilotLine)) return refusal('another_line_has_crate');
    if (pilotLine && !attachments().cut(pilotLine.id, pilot.id, 'salvage_tender_rack_handoff')?.ok) return refusal('line_cut_refused');
    const angle = finite(home.rot), stern = { x: home.pos.x - Math.cos(angle) * 20, z: home.pos.z - Math.sin(angle) * 20, y: 0 };
    const created = attachments().create({ defId: 'tether_standard', ownerId: home.id, targetId: e.id,
      controlMode: 'salvage_tender_rack', sourceWorld: stern, targetWorld: { ...point(e.pos), y: 0 } });
    if (!created?.ok) return refusal(created?.reason || 'rack_line_refused');
    if (byIdentity(row, TENDER_BODY_ID) !== home || byIdentity(row, r.id) !== e
      || attachments().get(created.attachment.id)?.state !== 'active') return refusal('rack_changed_during_attachment');
    r.status = 'racked'; r.rackAttachmentId = created.attachment.id; p.rackId = r.id;
    capture(row); return { ok: true, bodyId, sourceId: r.id, attachmentId: r.rackAttachmentId };
  }
  function releaseRecovery(row, bodyId) {
    const p = physical(row), e = state.entities?.get(bodyId);
    const r = p?.recovery.find(c => c.id === e?.data?.worldRecordId);
    if (!r || p.rackId !== r.id || byIdentity(row, r.id) !== e) return refusal('crate_not_in_rack');
    const home = byIdentity(row, TENDER_BODY_ID), pilot = player();
    if (!nativeReady(home) || !nativeReady(e)) return refusal('waiting_for_physics');
    if (distance(pilot?.pos, home?.pos) > TENDER_PHYSICAL.serviceRange) return refusal('return_to_tender_to_release');
    const expected = attachments().get(r.rackAttachmentId), line = lineBetween(home, e);
    if (expected?.state === 'active') {
      if (line !== expected || line.controlMode !== 'salvage_tender_rack') return refusal('rack_constraint_not_ready');
      if (!attachments().cut(line.id, home.id, 'salvage_tender_rack_release')?.ok) return refusal('rack_release_refused');
    } else if (line) return refusal('rack_constraint_changed');
    r.status = r.manifest.totalQty > 0 ? 'loose' : 'empty'; r.rackAttachmentId = null; p.rackId = null;
    capture(row); return { ok: true, bodyId: e.id, sourceId: r.id };
  }

  function step(dt, row) {
    currentRow = row;
    if (restoring || !physical(row)) return;
    const p = physical(row), e = byIdentity(row, TENDER_BODY_ID), pilot = player();
    if (!e) return;
    const sheltered = !activeSector(row) || distance(pilot?.pos, e.pos) > TENDER_PHYSICAL.awayShelterRange;
    if (p.disabled && e.hull > TENDER_PHYSICAL.disabledHull) p.disabled = false;
    e.flags.invuln = sheltered || p.disabled;
    for (const record of p.recovery) {
      const cargo = byIdentity(row, record.id);
      if (cargo) cargo.flags.invuln = row.owned === true && record.id === p.rackId && sheltered;
    }
    p.tender.hull = e.hull;
    if (nativeReady(e) && activeSector(row)) {
      // Finite thruster force holds a secured berth without making the body static.
      // Released mode clears V3's neutral controller so Massline owns earned momentum.
      let fx = 0, fz = 0, torque = 0;
      if (p.mode === 'secured' && !p.disabled) {
        fx = clamp((p.anchor.x - e.pos.x) * 5 - e.vel.x * 5, -7, 7) * TENDER_PHYSICAL.mass;
        fz = clamp((p.anchor.z - e.pos.z) * 5 - e.vel.z * 5, -7, 7) * TENDER_PHYSICAL.mass;
        torque = clamp(-finite(e.angVel) * e.physicsBody.inertiaY * 3, -4500, 4500);
      }
      writePhysicsControl(e, { source: 'salvageTender', mode: p.mode, force: { x: fx, y: 0, z: fz },
        torque: { x: 0, y: torque, z: 0 }, maxSpeed: Infinity });
    }
    const r = p.recovery.find(c => c.id === p.rackId);
    if (r) {
      const crate = byIdentity(row, r.id), line = lineBetween(e, crate);
      const expected = attachments().get(r.rackAttachmentId);
      const awaitingNativeLine = expected?.state === 'active' && expected.controlMode === 'salvage_tender_rack'
        && crate && expected.ownerId === e.id && expected.targetId === crate.id
        && attachmentBindsOccupant(expected, e.id, e.occupantGeneration)
        && attachmentBindsOccupant(expected, crate.id, crate.occupantGeneration);
      if (line?.controlMode === 'salvage_tender_rack') {
        r.rackAttachmentId = line.id;
        if (line.restLength > 14 && dt > 0) attachments().reel(line.id, -Math.min(18 * dt, line.restLength - 14), 14);
      } else if (!awaitingNativeLine && nativeReady(e) && crate && nativeReady(crate)) {
        // Broken line leaves the same crate loose; no snap-back or invisible cargo transfer.
        r.status = 'loose'; r.rackAttachmentId = null; p.rackId = null;
        bus?.emit('salvageTender:rackReleased', { sourceId: r.id, reason: 'line_broken' });
      }
    }
  }

  function shelve(row) {
    // Persistent actors survive an ordinary sector exit. They stay at their actual pose;
    // no offscreen travel or damage clock manufactures a relocation or destroys the home.
    capture(row);
    const e = byIdentity(row, TENDER_BODY_ID); if (e) e.flags.invuln = true;
  }
  function afterRestore(row) {
    restoring = false; currentRow = row; bindings.clear();
    // SaveSystem's persistent entities + combat refs own reconstruction and ID remapping.
    // A previously spawned missing original stays missing, even if its sidecar survived.
    for (const r of physical(row) ? [physical(row).tender, ...physical(row).recovery] : []) byIdentity(row, r.id);
  }
  function destroy(row) {
    capture(row);
    for (const e of readTenderPhysicalBodies(state).recovery.concat(findTenderBody(state) || [])) {
      retired.add(e); helpers.removeEntity?.(e.id, { immediate: true, reason: 'salvage_tender_reset' });
    }
    bindings.clear(); currentRow = null; restoring = false; busy = false;
  }
  on('save:restoring', () => { restoring = true; bindings.clear(); });
  function handleDamage(row, hit) {
    if (restoring || !row) return false;
    currentRow = row;
    const e = byIdentity(row, TENDER_BODY_ID);
    if (!e || hit?.targetId !== e.id) return;
    const p = physical(row);
    if (e.hull <= TENDER_PHYSICAL.disabledHull) {
      // Explicit nonlethal lifecycle: combat emits this before its kill decision. Preserve
      // the original body as disabled wreckage; this is not a respawn or a paid repair.
      // The existing service writer supplies the one-point survival floor; this adapter
      // never writes hull. A removed entity is refused by the identity gate above.
      if (e.hull < 1) stationServices._applyJobDelta({ entities: state.entities, playerId: e.id },
        { type: 'repair', meta: { shares: { hull: 1, armor: 0 } } }, 1 - e.hull);
      e.flags.invuln = true;
      const changed = !p.disabled; p.disabled = true;
      if (changed) bus.emit('salvageTender:disabled', { bodyId: e.id, worldRecordId: TENDER_BODY_ID });
    }
    p.tender.hull = e.hull;
    return true;
  }
  on('entity:destroyed', payload => {
    const e = payload?.entity;
    if (restoring || !currentRow || !e || retired.has(e) || e.data?.persistenceOwner !== TENDER_PHYSICAL.owner) return;
    const binding = bindings.get(e.data.worldRecordId);
    if (binding && (binding.entity !== e || binding.generation !== e.occupantGeneration)) return;
    const r = recordFor(currentRow, e.data.worldRecordId); if (!r) return;
    if (e.data.salvageTenderBody === 'tender') r.status = 'missing';
    else { r.status = 'lost'; r.manifest = manifest(r.id, [0, 0, 0]); }
    bindings.delete(r.id);
  });
  return {
    ensure, find: row => byIdentity(row, TENDER_BODY_ID), body: row => byIdentity(row, TENDER_BODY_ID),
    nativeReady, hasPlayerLine: row => lineBetween(player(), byIdentity(row, TENDER_BODY_ID)),
    beginTow, cancelTow, canSecure, secure, step, capture, afterRestore, shelve, destroy,
    handleDamage, isDisabled: row => physical(row)?.disabled === true,
    spawnRecovery, recoveryBodies, canUnload, unloadRecovery, stowRecovery, releaseRecovery,
    dispose(row) { destroy(row); for (const off of subscriptions) if (typeof off === 'function') off(); subscriptions.length = 0; },
  };
}
