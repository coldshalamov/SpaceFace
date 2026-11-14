// The yard's own winch: one finite gantry at the closed-refinery mouth that, on a live
// contact hail, draws ONE marked quarantine pod in on its own cable. A hail command and a
// released pod never consume or settle a lot — only the mouth does. The cable is the
// shared attachments kernel, never a second winch implementation.
import { FURNACE_INTAKE } from '../data/furnace.js';
import { furnaceReceivingJob, furnaceMiteClearance, furnaceMouthGlobal,
  isFurnaceOwnedLot } from './furnaceWorksite.js';
import { occupantGenerationOf } from '../core/entity.js';

const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

export const FURNACE_CAPSTAN = Object.freeze({
  id: 'furnace_gantry_0',
  attachmentDefId: 'attachment_furnace_capstan',
  reach: 900,       // the yard cable's whole world — never farther
  reelRate: 55,     // WU/s — a haul, not a tow
  minLength: 55,    // keeps the pod's own 24 WU body clear of the drum
  hailRange: 650,   // hail the gantry, not the pod
});

function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

/** The yard's finite record. `flags.furnace_capstan` is the one durable slot; a malformed
 *  same-mission row blocks re-minting (corrupt custody fails closed), while a row left
 *  over from another job is dead state the next job replaces. */
export function normalizeFurnaceCapstan(raw, missionId) {
  if (raw?.version !== 1 || raw.missionId !== missionId) return null;
  const record = { version: 1, missionId };
  if (raw.disabled === true) record.disabled = true;
  record.hull = Number.isFinite(raw.hull) ? clamp(raw.hull, 0, 600) : 600;
  const c = raw.cable;
  if (c != null) {
    // A present cable row is the yard's live custody — malformed means corrupt, and
    // corrupt custody fails closed rather than normalizing into fresh work.
    if (!Number.isInteger(c.slot) || c.slot < 0 || c.slot >= 3
      || (c.mode !== 'winding' && c.mode !== 'held')) return null;
    record.cable = { slot: c.slot, mode: c.mode };
    if (typeof c.linkId === 'string' && c.linkId) record.cable.linkId = c.linkId;
    if (Number.isFinite(c.length) && c.length >= FURNACE_CAPSTAN.minLength
      && c.length <= FURNACE_CAPSTAN.reach) record.cable.length = c.length;
  }
  return record;
}

function capstanRecord(state, m) {
  const raw = state?.story?.flags?.furnace_capstan;
  return normalizeFurnaceCapstan(raw, m?.id) ? raw : null;
}

function capstanBlocked(state, m) {
  const raw = state?.story?.flags?.furnace_capstan;
  return raw != null && raw.missionId === m?.id && !normalizeFurnaceCapstan(raw, m.id);
}

function mintCapstanRecord(state, m) {
  const flags = state?.story?.flags;
  if (!flags || capstanBlocked(state, m)) return null;
  flags.furnace_capstan = { version: 1, missionId: m.id, hull: 600, cable: null };
  return flags.furnace_capstan;
}

export function furnaceCapstanSpec(m, hull = 600) {
  return {
    type: 'fx', ttl: Infinity, team: 2,
    pos: furnaceMouthGlobal(), vel: { x: 0, z: 0 }, rot: 0,
    radius: 24, mass: 10000, hull: clamp(hull, 1, 600), hullMax: 600,
    collides: true,
    physicsBody: { radius: 24, mass: 10000, dynamic: false },
    homeSectorId: FURNACE_INTAKE.sectorId,
    flags: { missionPinned: true },
    data: {
      furnaceCapstanId: FURNACE_CAPSTAN.id, furnaceMissionId: m.id,
      placeId: 'place_maintenance_gantry', placeTargetRadius: 32,
      combatProfileId: 'combat_profile_tether_anchor',
      scanLabel: 'CR-FEED — quarantine gantry · hail to winch a marked pod',
      scannerSignalKind: 'salvage',
      masslineTetherable: false, tetherable: false,
      missionPinned: true, persistenceOwner: 'furnaceIntake',
      name: 'CR-FEED quarantine gantry',
    },
  };
}

/** The shared attachment authority — same lookup the foundry winch uses. */
function attachmentAuthority(owner) {
  const registry = owner.registry || owner.ctx?.registry;
  return registry?.get?.('actions')?.kernel?.attachments
    || registry?.get?.('combat')?.kernel?.attachments || null;
}

function liveCable(state, cable, anchor, pod) {
  const line = state?.combat?.attachments?.byId?.[cable?.linkId];
  return line?.state === 'active' && line.defId === FURNACE_CAPSTAN.attachmentDefId
    && line.ownerId === anchor?.id && line.targetId === pod?.id ? line : null;
}

/** Any live line the player owns or controls on this pod takes the load first — the yard
 *  cable never fights a manual line. */
function manualPlayerLine(state, pod) {
  const player = state.entities?.get(state.playerId);
  const byId = state.combat?.attachments?.byId || {};
  return Object.values(byId).some(a => a?.state === 'active' && a.targetId === pod?.id
    && a.defId !== FURNACE_CAPSTAN.attachmentDefId
    && (a.targetGeneration == null || pod == null
      || a.targetGeneration === occupantGenerationOf(pod))
    && ((a.ownerId === state.playerId && a.ownerGeneration === occupantGenerationOf(player))
      || (a.controllerId === state.playerId && a.controllerGeneration === occupantGenerationOf(player))));
}

/** Hail-side read of the real winch: what it would show, with nothing minted. */
export function furnaceCapstanRead(state, entity) {
  const job = furnaceReceivingJob(state);
  const record = job ? capstanRecord(state, job) : null;
  if (!job || !record || record.disabled) return null;
  if (!entity?.alive || entity.data?.furnaceCapstanId !== FURNACE_CAPSTAN.id
    || entity.data.furnaceMissionId !== job.id
    || state.entities?.get(entity.id) !== entity) return null;
  const lots = job.params.furnaceLots || [];
  const pending = lots.filter(l => !l.received && !l.lost);
  const cable = record.cable;
  const cabledLot = cable && lots[cable.slot];
  const cabledPod = cabledLot ? state.entities?.get(cabledLot.entityId) : null;
  const held = !!(cable && cabledPod?.alive && isFurnaceOwnedLot(cabledPod, state)
    && liveCable(state, cable, entity, cabledPod));
  const next = held ? null : pending.find(l => {
    const e = state.entities?.get(l.entityId);
    return e?.alive && isFurnaceOwnedLot(e, state);
  });
  const pod = held ? cabledPod : (next ? state.entities.get(next.entityId) : null);
  const gap = pod ? distance(entity.pos, pod.pos) : Infinity;
  return {
    missionId: job.id, anchorId: entity.id, generation: occupantGenerationOf(entity),
    slot: held ? cable.slot : next?.slot ?? null,
    pending: pending.length, cleared: furnaceMiteClearance(state).length,
    mode: held ? cable.mode : null, winding: held && cable.mode === 'winding', held,
    podId: pod?.id ?? null, podGeneration: pod ? occupantGenerationOf(pod) : null,
    inReach: !!pod && gap <= FURNACE_CAPSTAN.reach,
    playerHeld: !!pod && manualPlayerLine(state, pod),
    lineId: held ? cable.linkId : null,
  };
}

/** A stamped quarantine-gantry body near the player answers the channel. */
export function furnaceCapstanAvailability(state, target) {
  const read = furnaceCapstanRead(state, target);
  const player = state?.entities?.get(state.playerId);
  const gap = player && target ? distance(player.pos, target.pos) : Infinity;
  if (!read || state.mode !== 'flight' || state.ui?.docked || state.player?.flags?.docked
    || !player?.alive
    || state.world?.currentSectorId !== FURNACE_INTAKE.sectorId
    || state.player?.targetId !== target.id
    || !Number.isSafeInteger(read.generation) || read.generation < 1
    || gap > FURNACE_CAPSTAN.hailRange) return null;
  return {
    enabled: true, reason: null, targetId: target.id, entity: target,
    kind: 'furnace_capstan', label: 'HAIL CR-FEED', distance: gap,
  };
}

export function furnaceCapstanOffer(state, availability, requestId, expiresAt) {
  const anchor = availability?.entity;
  const read = furnaceCapstanRead(state, anchor);
  if (!read || !furnaceCapstanAvailability(state, anchor)) return null;
  const actions = [];
  if (read.winding) actions.push({ id: 'furnace_hold', label: 'HOLD WINCH' });
  else if (read.held || (read.pending > 0 && read.inReach && !read.playerHeld)) {
    actions.push({ id: 'furnace_haul', label: `WINCH POD ${read.slot + 1}` });
  }
  if (read.held) actions.push({ id: 'furnace_release', label: 'RELEASE TO MANUAL' });
  actions.push({ id: 'status', label: 'STATUS' });
  const status = !read.pending ? 'All original pods accounted for.'
    : read.winding ? `Winding original pod ${read.slot + 1}. HOLD stops the drum.`
    : read.held ? `Pod ${read.slot + 1} on the yard cable, drum held.`
    : !read.inReach ? 'Original pod is outside the 900 WU cable reach.'
    : read.playerHeld ? 'Cut your own line before the gantry takes the load.'
    : `Original pod ${read.slot + 1} ready. WINCH draws it to the mouth.`;
  return {
    requestId, targetId: anchor.id, kind: 'furnace_capstan', expiresAt,
    furnaceCapstan: { ...read },
    lines: ['CR-FEED · yard winch · one cable, one original pod', status],
    actions,
  };
}

export function furnaceCapstanResponse(state, offer, choice) {
  const anchor = state.entities?.get(offer?.targetId);
  const read = furnaceCapstanRead(state, anchor);
  const id = String(choice || '').toLowerCase();
  if (!read || !furnaceCapstanAvailability(state, anchor)
    || !(offer.expiresAt > state.simTime)
    || offer.furnaceCapstan?.missionId !== read.missionId
    || offer.furnaceCapstan.generation !== read.generation
    || offer.furnaceCapstan.slot !== read.slot
    || offer.furnaceCapstan.podId !== read.podId
    || offer.furnaceCapstan.podGeneration !== read.podGeneration
    || offer.furnaceCapstan.lineId !== read.lineId
    || offer.furnaceCapstan.mode !== read.mode
    || !offer.actions?.some(row => row.id === id)) return null;
  return {
    requestId: offer.requestId, targetId: anchor.id, kind: 'furnace_capstan', choice: id,
    expiresAt: (Number(state.simTime) || 0) + 8,
    lines: [id === 'status'
      ? `CR-FEED · ${read.pending} PODS OUTSTANDING · ${read.cleared}/4 SITES CLEAR`
      : 'CR-FEED · command received — the drum reports at the mouth.'],
  };
}

/** The finite gantry follows the receiving leg exactly: materialized when a live
 *  worksite has surviving lots to work, removed the moment it does not. */
export function syncFurnaceCapstan(owner, job) {
  const state = owner.state;
  if (!state) return;
  let anchor = owner._capstanId != null ? state.entities?.get(owner._capstanId) : null;
  if (anchor && (!anchor.alive || anchor.data?.furnaceCapstanId !== FURNACE_CAPSTAN.id)) {
    anchor = null; owner._capstanId = null;
  }
  const record = job ? (capstanRecord(state, job) || mintCapstanRecord(state, job)) : null;
  if (!job || !record || record.disabled) {
    for (const e of state.entityList || []) {
      if (e?.alive && e.data?.furnaceCapstanId === FURNACE_CAPSTAN.id) {
        owner._capstanRetired?.add(e);
        owner.helpers?.removeEntity?.(e.id);
      }
    }
    owner._capstanId = null; owner._capstanJobId = null;
    return;
  }
  if (!anchor) {
    // A restored or reparented yard body keeps its mark — adopt the live one belonging
    // to this job and retire anything stamped for a dead mission before minting anew.
    for (const e of state.entityList || []) {
      if (!e?.alive || e.data?.furnaceCapstanId !== FURNACE_CAPSTAN.id) continue;
      if (!anchor && e.data.furnaceMissionId === job.id) { anchor = e; continue; }
      owner._capstanRetired?.add(e);
      owner.helpers?.removeEntity?.(e.id);
    }
    if (!anchor) anchor = owner.helpers?.spawnEntity?.(furnaceCapstanSpec(job, record.hull)) || null;
    owner._capstanId = anchor?.id ?? null;
  }
  owner._capstanJobId = anchor ? job.id : null;
  if (anchor && Number.isFinite(anchor.hull)) record.hull = anchor.hull;
}

export function removeFurnaceCapstan(owner) {
  owner._capstanOffers?.clear();
  owner._capstanRemoving = true;
  try {
    for (const e of owner.state?.entityList || []) {
      if (e?.alive && e.data?.furnaceCapstanId === FURNACE_CAPSTAN.id) {
        owner._capstanRetired?.add(e);
        owner.helpers?.removeEntity?.(e.id);
      }
    }
  } finally { owner._capstanRemoving = false; }
  owner._capstanId = null; owner._capstanJobId = null;
}

/** Per-tick cable work only — the record's one cable, resolved through known ids. Never
 *  a scan of entityList, never more than one pod. */
export function stepFurnaceCapstan(owner, dt = 0) {
  const state = owner.state;
  if (!state || owner._restoring) return;
  if (!owner._adventure()) { removeFurnaceCapstan(owner); return; }
  const job = furnaceReceivingJob(state);
  const record = job ? capstanRecord(state, job) : null;
  const cable = record?.cable;
  if (!job || !record || record.disabled || !cable) return;
  const anchor = owner._capstanId != null ? state.entities?.get(owner._capstanId) : null;
  const lot = job.params.furnaceLots?.[cable.slot];
  const pod = lot && !lot.received && !lot.lost ? state.entities?.get(lot.entityId) : null;
  const validPod = pod?.alive !== false && isFurnaceOwnedLot(pod, state) ? pod : null;
  const line = anchor?.alive && validPod ? liveCable(state, cable, anchor, validPod) : null;
  if (!line) { record.cable = null; return; }
  const service = attachmentAuthority(owner);
  if (!service) { record.cable = null; return; }
  if (manualPlayerLine(state, validPod)) {
    service.cut(line.id, anchor.id, 'furnace_player_control');
    record.cable = null;
    return;
  }
  if (distance(anchor.pos, validPod.pos) > FURNACE_CAPSTAN.reach) {
    service.cut(line.id, anchor.id, 'furnace_cable_reach');
    record.cable = null;
    owner.bus?.emit('comms:popup', {
      id: `furnace_winch_reach_${state.tick}`, sender: 'CR-FEED', category: 'story',
      ttl: 8, persist: false,
      text: `Pod ${cable.slot + 1} overran the cable. Released; the original pod stays where it is.`,
    });
    return;
  }
  const player = state.entities?.get(state.playerId);
  const attended = state.mode === 'flight' && !state.ui?.docked && !state.player?.flags?.docked
    && player?.alive && Number.isFinite(player.pos?.x)
    && distance(player.pos, anchor.pos) <= FURNACE_CAPSTAN.hailRange;
  if (cable.mode === 'winding' && !attended) cable.mode = 'held';
  if (cable.mode === 'winding' && dt > 0) {
    service.reel(line.id, -FURNACE_CAPSTAN.reelRate * Math.min(dt, 1), FURNACE_CAPSTAN.minLength);
  }
  cable.length = line.restLength;
}

function applyFurnaceCapstanCommand(owner, p) {
  if (p?.kind !== 'furnace_capstan' || owner._restoring) return;
  const offer = owner._capstanOffers?.get(p.requestId);
  owner._capstanOffers?.delete(p.requestId);
  const state = owner.state, anchor = state.entities?.get(p.targetId);
  if (!offer || !anchor || anchor !== offer.body) return;
  if (!furnaceCapstanResponse(state, offer, p.choice)) return;
  const job = furnaceReceivingJob(state), record = capstanRecord(state, job);
  const read = furnaceCapstanRead(state, anchor);
  if (p.choice === 'status' || !read || !record) return;
  const service = attachmentAuthority(owner);
  if (!service) return;
  let text = null;
  if (p.choice === 'furnace_haul') {
    if (read.held) {
      record.cable.mode = 'winding';
      text = `Winding pod ${read.slot + 1} again. HOLD stops the drum.`;
    } else if (read.pending > 0 && read.inReach && !read.playerHeld) {
      const lot = job.params.furnaceLots?.[read.slot];
      const pod = lot ? state.entities?.get(lot.entityId) : null;
      if (pod?.alive && isFurnaceOwnedLot(pod, state)) {
        const created = service.create({
          defId: FURNACE_CAPSTAN.attachmentDefId,
          ownerId: anchor.id, targetId: pod.id, controllerId: anchor.id,
          controlMode: 'furnace_capstan',
          sourceWorld: { ...anchor.pos }, targetWorld: { ...pod.pos },
        });
        if (created?.ok && created.attachment) {
          record.cable = { slot: read.slot, mode: 'winding',
            linkId: created.attachment.id, length: created.attachment.restLength };
          text = `Pod ${read.slot + 1} on the cable — winding to the mouth.`;
        }
      }
    }
  } else if (p.choice === 'furnace_hold' && read.winding && record.cable) {
    record.cable.mode = 'held';
    text = 'Drum held at its present length.';
  } else if (p.choice === 'furnace_release' && read.held && record.cable) {
    const line = state.combat?.attachments?.byId?.[record.cable.linkId];
    if (line?.state === 'active') service.cut(line.id, anchor.id, 'furnace_manual_release');
    record.cable = null;
    text = 'Yard cable cut. The pod stays where it is.';
  }
  if (text) owner.bus?.emit('comms:popup', {
    id: `furnace_winch_${state.tick}_${p.choice}`, sender: 'CR-FEED', category: 'story',
    ttl: 7, persist: false, text,
  });
}

export function initFurnaceCapstan(owner, on) {
  owner._capstanOffers = new Map();
  owner._capstanRetired ||= new WeakSet();
  on('contactHail:offer', p => {
    if (p?.kind !== 'furnace_capstan') return;
    owner._capstanOffers.clear();
    owner._capstanOffers.set(p.requestId, {
      ...p,
      body: owner.state.entities?.get(p.targetId),
      pod: owner.state.entities?.get(p.furnaceCapstan?.podId),
    });
  });
  on('contactHail:response', p => applyFurnaceCapstanCommand(owner, p));
  for (const event of ['save:restoring', 'game:newGame', 'sector:exit', 'contactHail:clear']) {
    on(event, () => owner._capstanOffers?.clear());
  }
  on('save:loaded', () => {
    // The gantry respawns as a fresh body on restore, so any saved yard line names a dead
    // endpoint — the record keeps its honesty by dropping the cable outright.
    const job = furnaceReceivingJob(owner.state);
    const record = job ? capstanRecord(owner.state, job) : null;
    if (record?.cable) record.cable = null;
  });
  on('tether:broken', p => {
    if (owner._restoring) return;
    const job = furnaceReceivingJob(owner.state);
    const record = job ? capstanRecord(owner.state, job) : null;
    if (record?.cable && p?.attachmentId === record.cable.linkId) record.cable = null;
  });
  on('entity:destroyed', p => {
    if (owner._restoring || owner._capstanRemoving) return;
    const e = p?.entity ?? owner.state.entities?.get(p?.id);
    if (!e || owner._capstanRetired.has(e)) return;
    if (e.data?.furnaceCapstanId !== FURNACE_CAPSTAN.id) return;
    const job = furnaceReceivingJob(owner.state);
    const record = job ? capstanRecord(owner.state, job) : null;
    if (!record || e.data.furnaceMissionId !== job.id) return;
    record.disabled = true; record.cable = null;
    owner._capstanOffers?.clear();
    removeFurnaceCapstan(owner); // a successor briefly materialized also dies with the yard
  });
}
