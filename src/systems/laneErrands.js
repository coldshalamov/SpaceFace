// Lane errands — visible chores on hulls the traffic spool already spawned.
//
// Presentation only. The npcJobs kernel keeps advancing, so an offscreen catch-up
// still matches a watched hull's phase graph. This module never calls advance(),
// interrupt(), or spawn, and it never writes credits, rep, cargo, or heat.
// npcJobsRuntime remains the single intent writer: it calls applyLaneErrandIntent
// after its own _drive and overwrites that frame's intent.

import { hash32 } from '../core/rng.js';

const PLAYER_RANGE = 2200;
const PARTNER_RANGE = 480;
const WINDOW_S = 42;

export const LANE_ERRANDS = Object.freeze([
  { id: 'gel_swap', kinds: ['miner', 'tender'], motion: 'brake', seconds: 8, line: 'Miner: Gel\'s brown. Swapping the puck. Don\'t cut my hand.' },
  { id: 'tally_creep', kinds: ['hauler'], motion: 'half', seconds: 11, line: 'Hauler: Post\'s gold is awake. I creep now or I pay twice.' },
  { id: 'chevron_check', kinds: ['patrol'], motion: 'flash', seconds: 5, line: 'Patrol: Green side. I flash it so the mule doesn\'t invent one.' },
  { id: 'neighbor_tick', kinds: ['hauler', 'tender', 'miner'], motion: 'flash', seconds: 4, line: 'Neighbor: Cyan twice. You\'re seen. That\'s the courtesy.' },
  { id: 'cradle_gap', kinds: ['hauler'], motion: 'brake', seconds: 14, line: 'Hauler: Cradle\'s full. I hold until the dent leaves.' },
  { id: 'rock_square', kinds: ['surveyor'], motion: 'orbit', seconds: 16, line: 'Survey: Four sides. The rock doesn\'t get a fifth.' },
  { id: 'slack_look', kinds: ['salvor', 'tender'], motion: 'face', seconds: 7, partner: true, line: 'Salvor: Line\'s slack on your side. Mine is not.' },
  { id: 'cone_room', kinds: ['miner', 'hauler'], motion: 'half', seconds: 9, line: 'Miner: Red cone. I give it the wide number.' },
  { id: 'manifest_aloud', kinds: ['hauler'], motion: 'brake', seconds: 12, line: 'Hauler: Reading the mass aloud. The hold lies less if it hears.' },
  { id: 'puck_borrow', kinds: ['miner', 'tender'], motion: 'face', seconds: 6, partner: true, line: 'Tender: Spare\'s taped on. Asking before I take it.' },
  { id: 'dust_cheek', kinds: ['miner'], motion: 'orbit', seconds: 10, line: 'Miner: Turning the scoop. Your dust, not my face.' },
  { id: 'plate_wipe', kinds: ['surveyor', 'salvor'], motion: 'brake', seconds: 8, line: 'Survey: Numerals full of grit. Wiping. Claim stays filed.' },
  { id: 'hull_count', kinds: ['patrol'], motion: 'flash', seconds: 6, line: 'Patrol: Three hulls, one pin. I count them so the log can\'t.' },
  { id: 'ribbon_pin', kinds: ['tender'], motion: 'orbit', seconds: 13, line: 'Tender: Ribbon on the whistle. I do not wake it.' },
  { id: 'invoice_match', kinds: ['hauler'], motion: 'half', seconds: 15, line: 'Hauler: Matching the gold heartbeat. A late blink means the post is sick.' },
  { id: 'tag_return', kinds: ['miner'], motion: 'face', seconds: 5, partner: true, line: 'Miner: Your tag snagged my vane. Returning it facing you.' },
  { id: 'can_for_filter', kinds: ['hauler', 'tender'], motion: 'brake', seconds: 9, line: 'Hauler: Air can for a filter. Count both. Don\'t round.' },
  { id: 'wrong_star', kinds: ['surveyor', 'patrol'], motion: 'face', seconds: 7, partner: true, line: 'Survey: That bearing is a lamp, not a star. We look anyway.' },
  { id: 'slag_warn', kinds: ['miner'], motion: 'flash', seconds: 4, line: 'Miner: Dump in three. Flash is the manners I have left.' },
  { id: 'soft_pay', kinds: ['salvor'], motion: 'half', seconds: 18, line: 'Salvor: Paying line. The mass is heavier than the chit.' },
  { id: 'stamp_wait', kinds: ['patrol'], motion: 'brake', seconds: 12, line: 'Patrol: Window\'s open. The stamp is not. Ref stays Ref.' },
  { id: 'scoop_kiss', kinds: ['miner', 'hauler'], motion: 'brake', seconds: 8, line: 'Hauler: Scoop kissed a pin. I stop. The pin can file itself.' },
  { id: 'shade_hold', kinds: ['surveyor'], motion: 'orbit', seconds: 14, line: 'Survey: Parking in the barge\'s shade. Glare lies.' },
  { id: 'half_slot', kinds: ['hauler', 'patrol'], motion: 'half', seconds: 10, line: 'Hauler: Slot says crawl. The band has one lamp and it lies.' },
  { id: 'kettle_pause', kinds: ['hauler', 'miner', 'tender', 'patrol', 'surveyor', 'salvor'], motion: 'brake', seconds: 6, line: 'Crew: Kettle\'s on. The slot can wait one breath.' },
  { id: 'funeral_creep', kinds: ['hauler', 'salvor'], motion: 'half', seconds: 16, line: 'Hauler: Ash ahead. Half burn. Don\'t pass inside it.' },
  { id: 'strike_idle', kinds: ['miner', 'hauler'], motion: 'brake', seconds: 11, line: 'Foreman: Cones stay dark. I am not cutting this face.' },
  { id: 'busker_loop', kinds: ['patrol', 'tender', 'hauler'], motion: 'orbit', seconds: 12, line: 'Lane: I\'ll play the pin once. Filters or silence.' },
  { id: 'false_chirp', kinds: ['hauler', 'miner', 'surveyor'], motion: 'flash', seconds: 5, line: 'Hauler: That was the boot, not a mayday. Ignore the red.' },
  { id: 'shift_wave', kinds: ['miner', 'patrol', 'tender'], motion: 'face', seconds: 6, partner: true, line: 'Relief: Lamp\'s yours. I flash twice and I\'m gone.' },
  { id: 'customs_stare', kinds: ['patrol', 'hauler'], motion: 'face', seconds: 9, partner: true, line: 'Patrol: This look is the drill. Your hold stays shut.' },
  { id: 'wedding_hold', kinds: ['hauler', 'tender'], motion: 'face', seconds: 8, partner: true, line: 'Crew: Two hulls, one berth. Hold the outside.' },
  { id: 'skiff_dare', kinds: ['patrol', 'hauler'], motion: 'orbit', seconds: 9, line: 'Skiff: One lap of the can. No adults in the loop.' },
  { id: 'lost_glint', kinds: ['surveyor', 'salvor', 'tender'], motion: 'weave', seconds: 12, line: 'Survey: Orange flash on the spar. Not a jump. Looking.' },
]);

const CONTRACT_SLOTS = new Set([
  'ceres_ambush_escort',
  'ceres_ambush_loaded_hauler',
  'helios_starter_cutter',
  'choir_relief_attendant',
  'choir_relief_patient',
  'ceres_refinery_hauler',
  'ceres_seam_miner',
  'ceres_cathedral_salvor',
  'ceres_refinery_tender',
]);

function roleOf(entry, entity) {
  const data = entity && entity.data;
  const payload = entry && entry.job && entry.job.payload;
  if (data && typeof data.trafficRole === 'string' && data.trafficRole) return data.trafficRole;
  if (data && typeof data.role === 'string' && data.role) return data.role;
  if (payload && typeof payload.role === 'string' && payload.role) return payload.role;
  return '';
}

/**
 * True when a higher-precedence writer already owns this hull's intent:
 * flee, a Ceres formation/berth, a living-adventure worker, a tug on a
 * booked load, an attached tow, a berth queue, or a close-call brace.
 * Errands must not overwrite those contracts.
 */
export function laneContractOwns(entry, entity, simT) {
  if (!entry || !entry.job || !entity) return true;
  if (entry.job.corrupt) return true;
  if (entry.control) return true;
  const phase = entry.job.phase;
  if (phase === 'flee' || phase === 'complete') return true;
  const data = entity.data || null;
  if (data && data.ceresCausalDisabled === true) return true;
  if (entry.towAttachmentId != null) return true;
  if (data && data.towAttachmentId != null && data.towAttachmentId !== '') return true;
  const slot = data && data.activityActorSlotId;
  if (typeof slot === 'string' && CONTRACT_SLOTS.has(slot)) return true;
  if (entry.job.kind === 'hauler' && roleOf(entry, entity) === 'tug') {
    const booked = (data && data.towTargetId != null && data.towTargetId !== '')
      ? data.towTargetId
      : (entry.job.payload && entry.job.payload.towTargetId != null
        && entry.job.payload.towTargetId !== ''
        ? entry.job.payload.towTargetId
        : null);
    if (booked != null) return true;
  }
  if (entry.berthHold === true) return true;
  if (entry.closeCallUntil != null && simT < entry.closeCallUntil) return true;
  return false;
}

function clamp1(v) { return v < -1 ? -1 : v > 1 ? 1 : v; }

function eligible(entry, entity, simT) {
  if (!entry || !entry.job || entry.job.corrupt) return false;
  if (entry.entityId == null || !entity || entity.alive === false || !entity.pos) return false;
  if (laneContractOwns(entry, entity, simT)) return false;
  return true;
}

function nearPlayer(state, entity) {
  const player = state.playerId != null && state.entities ? state.entities.get(state.playerId) : null;
  if (!player || player.alive === false || !player.pos) return false;
  const dx = entity.pos.x - player.pos.x;
  const dz = entity.pos.z - player.pos.z;
  return dx * dx + dz * dz <= PLAYER_RANGE * PLAYER_RANGE;
}

function partnerOf(runtime, entry, entity, needKind) {
  const byId = runtime._byId();
  let best = null;
  let bestD = PARTNER_RANGE * PARTNER_RANGE;
  for (const otherId of Object.keys(byId)) {
    const other = byId[otherId];
    if (!other || other === entry || !other.job) continue;
    if (needKind && other.job.kind !== needKind && entry.job.kind === other.job.kind) {
      // any other working hull is enough when kinds match the errand's own list
    }
    if (other.entityId == null) continue;
    const hull = runtime.state.entities && runtime.state.entities.get(other.entityId);
    if (!hull || hull.alive === false || !hull.pos) continue;
    const dx = hull.pos.x - entity.pos.x;
    const dz = hull.pos.z - entity.pos.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < bestD) {
      bestD = d2;
      best = { entry: other, entity: hull };
    }
  }
  return best;
}

export function errandsForKind(kind) {
  return LANE_ERRANDS.filter((row) => row.kinds.includes(kind));
}

/** Pure pick. Same seed, record, and window → same errand id. */
export function pickLaneErrand(seed, recordId, window, kind, hasPartner) {
  const rows = errandsForKind(kind).filter((row) => !row.partner || hasPartner);
  if (!rows.length) return null;
  const index = hash32(seed, recordId || 'job', window, kind, 'lane-errand') % rows.length;
  return rows[index];
}

/**
 * Arm presentation errands for materialized hulls near the player.
 * Does not touch job.phase, job.progress, or job.simTime.
 */
export function armLaneErrands(runtime, simT) {
  if (!runtime || runtime.state?.mode !== 'flight') return;
  const seed = (runtime.state.meta && runtime.state.meta.seed) || 1;
  const window = Math.floor(simT / WINDOW_S);
  const byId = runtime._byId();
  for (const jobId of Object.keys(byId)) {
    const entry = byId[jobId];
    const entity = entry.entityId != null && runtime.state.entities
      ? runtime.state.entities.get(entry.entityId) : null;
    if (entry.errand && (simT >= entry.errand.until || laneContractOwns(entry, entity, simT))) {
      entry.errand = null;
    }
    if (entry.errand) continue;
    if (!eligible(entry, entity, simT) || !nearPlayer(runtime.state, entity)) continue;
    if (entry.errandWindow === window) continue;
    const recordId = entry.worldRecordId || entry.job.id || jobId;
    const gate = hash32(seed, recordId, window, 'lane-errand-gate');
    if (gate % 2 !== 0) {
      entry.errandWindow = window;
      continue;
    }
    const partner = partnerOf(runtime, entry, entity);
    const picked = pickLaneErrand(seed, recordId, window, entry.job.kind, !!partner);
    entry.errandWindow = window;
    if (!picked) continue;
    entry.errand = {
      id: picked.id,
      motion: picked.motion,
      until: simT + picked.seconds,
      line: picked.line,
      said: false,
      origin: { x: entity.pos.x, z: entity.pos.z },
      started: simT,
      partnerId: partner ? partner.entry.entityId : null,
    };
  }
}

function writeIntent(runtime, entity, moveX, moveZ, aim, brake) {
  runtime._writeIntent(entity, moveX, moveZ, false, aim, brake);
}

export function applyLaneErrandIntent(runtime, entry, entity, simT) {
  const errand = entry && entry.errand;
  if (!errand || !entity || !entity.pos) return false;
  if (simT >= errand.until || laneContractOwns(entry, entity, simT)) {
    entry.errand = null;
    return false;
  }
  if (!errand.said && runtime.bus && typeof runtime.bus.emit === 'function') {
    errand.said = true;
    try {
      runtime.bus.emit('toast', { text: errand.line, kind: 'info', ttl: 3.5 });
      runtime.bus.emit('npcjobs:errand', {
        jobId: entry.job && entry.job.id,
        errandId: errand.id,
        kind: entry.job && entry.job.kind,
        simTime: simT,
      });
    } catch { /* advisory */ }
  }
  const origin = errand.origin || entity.pos;
  const t = Math.max(0, (errand.until - simT));
  const elapsed = Math.max(0, simT - (errand.started || simT));
  if (errand.motion === 'brake') {
    writeIntent(runtime, entity, 0, 0, entity.rot || 0, true);
    return true;
  }
  if (errand.motion === 'half') {
    const aim = entity.rot || 0;
    writeIntent(runtime, entity, 0, 0.28, aim, false);
    return true;
  }
  if (errand.motion === 'flash') {
    const wobble = Math.sin(simT * 6) * 0.6;
    writeIntent(runtime, entity, clamp1(wobble), 0, (entity.rot || 0) + wobble, true);
    return true;
  }
  if (errand.motion === 'face' && errand.partnerId != null) {
    const partner = runtime.state.entities && runtime.state.entities.get(errand.partnerId);
    if (partner && partner.pos) {
      const dx = partner.pos.x - entity.pos.x;
      const dz = partner.pos.z - entity.pos.z;
      const aim = Math.atan2(dz, dx);
      const dist = Math.hypot(dx, dz);
      writeIntent(runtime, entity, 0, dist > 160 ? 0.35 : 0, aim, dist <= 160);
      return true;
    }
  }
  const ang = elapsed * (errand.motion === 'weave' ? 1.1 : 0.7);
  const radius = errand.motion === 'weave' ? 90 : 140;
  const tx = origin.x + Math.cos(ang) * radius;
  const tz = origin.z + Math.sin(ang) * (errand.motion === 'weave' ? 50 : radius);
  const dx = tx - entity.pos.x;
  const dz = tz - entity.pos.z;
  const aim = Math.atan2(dz, dx);
  const cf = Math.cos(entity.rot || 0);
  const sf = Math.sin(entity.rot || 0);
  const len = Math.hypot(dx, dz) || 1;
  writeIntent(
    runtime,
    entity,
    clamp1((-sf * dx + cf * dz) / len),
    clamp1((cf * dx + sf * dz) / len) * (errand.motion === 'half' ? 0.4 : 0.7),
    aim,
    false,
  );
  return t >= 0;
}
