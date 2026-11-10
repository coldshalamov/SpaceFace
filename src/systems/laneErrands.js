// Lane errands — visible chores on hulls the traffic spool already spawned.
//
// Chatter and bounded idle motion. The npcJobs kernel keeps advancing, so an offscreen catch-up
// still matches a watched hull's phase graph. This module never calls advance(),
// interrupt(), or spawn, and it never writes credits, rep, cargo, or heat.
// npcJobsRuntime remains the single intent writer: it calls applyLaneErrandIntent
// after its own _drive. Working routes and physical holds retain that intent.

import { hash32 } from '../core/rng.js';
import { ZONE_TETHYS_TALLY } from '../data/authoredPlaces.js';
import { sectorLocalToGlobalForSector } from '../data/sectorCoordinates.js';
import { ACTIVITY_POCKETS } from '../data/sectorActivityPockets.js';

const PLAYER_RANGE = 2200;
const PARTNER_RANGE = 480;
const WINDOW_S = 42;
const TALLY_SECTOR = 'sector_tethys_junction';
const TALLY_POST = 'poi_tethys_tally_post';
const TALLY_CENTER = sectorLocalToGlobalForSector(ZONE_TETHYS_TALLY.center, TALLY_SECTOR);
const POST_ERRANDS = new Set(['tally_creep', 'invoice_match']);
const IDLE_PHASES = new Set(['commission', 'hold']);
const AUTHORED_WORK_SLOTS = new Map(ACTIVITY_POCKETS.flatMap(pocket => pocket.actorSlots
  .filter(slot => slot.route?.owner === 'npcJobsRuntime')
  .map(slot => [slot.id, slot.jobKind])));
export const LANE_IDLE_MOTION = Object.freeze({ maxSpeed: 18, radius: 24, positionGain: 0.65 });

function authoredWorkOwns(entry, entity) {
  const data = entity.data;
  return !!(data && data.jobId === entry.job.id && entry.entityId === entity.id
    && data.worldRecordId && data.worldRecordId === entry.worldRecordId
    && AUTHORED_WORK_SLOTS.get(data.activityActorSlotId) === entry.job.kind);
}

function insideTally(pos) {
  return !!pos && Number.isFinite(pos.x) && Number.isFinite(pos.z)
    && Math.hypot(pos.x - TALLY_CENTER.x, pos.z - TALLY_CENTER.z) <= ZONE_TETHYS_TALLY.radius;
}

// The gold count post is the authored Tethys POI, not any reused tally-post prop
// (Charon has a hunter's Tag Post). Its discovery plate keeps it a live world actor.
// Public world data exposes presence, not a separate gold-blink lifecycle.
function atLiveTally(state, entity) {
  if (state.world?.currentSectorId !== TALLY_SECTOR || !insideTally(entity?.pos)) return false;
  const rows = state.world.activeSector?.pois;
  if (!Array.isArray(rows)) return false;
  let carrier = null;
  for (const row of rows) {
    if (row?.poiId !== TALLY_POST) continue;
    if (carrier) return false;
    carrier = row;
  }
  const post = carrier && state.entities?.get(carrier.id);
  return !!post && post.alive === true && post.data?.poi === true
    && post.data.poiId === TALLY_POST && post.data.sectorId === TALLY_SECTOR
    && insideTally(post.pos);
}

export const LANE_ERRANDS = Object.freeze([
  { id: 'gel_swap', kinds: ['miner', 'tender'], motion: 'brake', seconds: 8, line: 'Miner: Gel\'s brown. Swapping the puck. Don\'t cut my hand.' },
  { id: 'tally_creep', kinds: ['hauler'], motion: 'half', seconds: 11, line: 'Hauler: Post\'s gold is awake. I creep now or I pay twice.' },
  { id: 'chevron_check', kinds: ['patrol'], motion: 'flash', seconds: 5, line: 'Patrol: Green side. I flash it so the mule doesn\'t invent one.' },
  { id: 'neighbor_tick', kinds: ['hauler', 'tender', 'miner'], motion: 'flash', seconds: 4, line: 'Neighbor: Cyan twice. You\'re seen. That\'s the courtesy.' },
  { id: 'cradle_gap', kinds: ['hauler'], motion: 'brake', seconds: 14, line: 'Hauler: Cradle\'s full. I hold until the dent leaves.' },
  { id: 'rock_square', kinds: ['surveyor'], motion: 'orbit', seconds: 16, line: 'Survey: Four sides. The rock doesn\'t get a fifth.' },
  { id: 'slack_look', kinds: ['salvor', 'tender'], motion: 'face', seconds: 7, partner: true, line: 'Salvor: Line\'s slack on your side. Mine is not.', reply: 'Tender: Slack taken in on this side.' },
  { id: 'cone_room', kinds: ['miner', 'hauler'], motion: 'half', seconds: 9, line: 'Miner: Red cone. I give it the wide number.' },
  { id: 'manifest_aloud', kinds: ['hauler'], motion: 'brake', seconds: 12, line: 'Hauler: Reading the mass aloud. The hold lies less if it hears.' },
  { id: 'puck_borrow', kinds: ['miner', 'tender'], motion: 'face', seconds: 6, partner: true, line: 'Tender: Spare\'s taped on. Asking before I take it.', reply: 'Miner: Spare is free. Tape stays.' },
  { id: 'dust_cheek', kinds: ['miner'], motion: 'orbit', seconds: 10, line: 'Miner: Turning the scoop. Your dust, not my face.' },
  { id: 'plate_wipe', kinds: ['surveyor', 'salvor'], motion: 'brake', seconds: 8, line: 'Survey: Numerals full of grit. Wiping. Claim stays filed.' },
  { id: 'hull_count', kinds: ['patrol'], motion: 'flash', seconds: 6, line: 'Patrol: Three hulls, one pin. I count them so the log can\'t.' },
  { id: 'ribbon_pin', kinds: ['tender'], motion: 'orbit', seconds: 13, line: 'Tender: Ribbon on the whistle. I do not wake it.' },
  { id: 'invoice_match', kinds: ['hauler'], motion: 'half', seconds: 15, line: 'Hauler: Matching the gold heartbeat. A late blink means the post is sick.' },
  { id: 'tag_return', kinds: ['miner'], motion: 'face', seconds: 5, partner: true, line: 'Miner: Your tag snagged my vane. Returning it facing you.', reply: 'Tender: Tag is back. Vane is clear.' },
  { id: 'can_for_filter', kinds: ['hauler', 'tender'], motion: 'brake', seconds: 9, line: 'Hauler: Air can for a filter. Count both. Don\'t round.' },
  { id: 'wrong_star', kinds: ['surveyor', 'patrol'], motion: 'face', seconds: 7, partner: true, line: 'Survey: That bearing is a lamp, not a star. We look anyway.', reply: 'Patrol: Lamp confirmed. Bearing holds.' },
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
  { id: 'shift_wave', kinds: ['miner', 'patrol', 'tender'], motion: 'face', seconds: 6, partner: true, line: 'Relief: Lamp\'s yours. I flash twice and I\'m gone.', reply: 'Miner: Lamp taken. Two flashes logged.' },
  { id: 'customs_stare', kinds: ['patrol', 'hauler'], motion: 'face', seconds: 9, partner: true, line: 'Patrol: This look is the drill. Your hold stays shut.', reply: 'Hauler: Hold stays shut. The look is logged.' },
  { id: 'wedding_hold', kinds: ['hauler', 'tender'], motion: 'face', seconds: 8, partner: true, line: 'Crew: Two hulls, one berth. Hold the outside.', reply: 'Tender: Outside is held. The berth stays.' },
  { id: 'skiff_dare', kinds: ['patrol', 'hauler'], motion: 'orbit', seconds: 9, line: 'Skiff: One lap of the can. No adults in the loop.' },
  { id: 'lost_glint', kinds: ['surveyor', 'salvor', 'tender'], motion: 'weave', seconds: 12, line: 'Survey: Orange flash on the spar. Not a jump. Looking.' },
  { id: 'gossip_loaded_lane', kinds: ['hauler'], motion: 'half', seconds: 8, gossip: true, line: 'Hauler: {callsign} is {state}. That hull gets the lane.' },
  { id: 'gossip_disabled_pin', kinds: ['patrol'], motion: 'flash', seconds: 6, gossip: true, line: 'Patrol: {callsign} is {state}. The pin stays on that hull.' },
  { id: 'gossip_fleeing_slot', kinds: ['miner'], motion: 'brake', seconds: 7, gossip: true, line: 'Miner: {callsign} is {state}. The slot can take the dust.' },
  { id: 'gossip_loaded_shade', kinds: ['surveyor'], motion: 'orbit', seconds: 9, gossip: true, line: 'Survey: {callsign} is {state}. Shade stays off that hull.' },
  { id: 'gossip_disabled_line', kinds: ['salvor'], motion: 'half', seconds: 8, gossip: true, line: 'Salvor: {callsign} is {state}. The paying line stays clear.' },
  { id: 'gossip_fleeing_ribbon', kinds: ['tender'], motion: 'orbit', seconds: 7, gossip: true, line: 'Tender: {callsign} is {state}. The ribbon stays dark.' },
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
  if (payload && typeof payload.freightRole === 'string' && payload.freightRole) return payload.freightRole;
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

function partnerOf(runtime, entry, entity) {
  const byId = runtime._byId();
  let best = null;
  let bestD = PARTNER_RANGE * PARTNER_RANGE;
  for (const otherId of Object.keys(byId)) {
    const other = byId[otherId];
    if (!other || other === entry || !other.job) continue;
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

function hullName(hull) {
  const data = hull && hull.data;
  if (!data) return '';
  const name = data.callsign || data.trafficLabel || data.scanLabel || data.name;
  if (typeof name !== 'string') return '';
  const trimmed = name.trim();
  if (!trimmed || trimmed.includes('{')) return '';
  return trimmed;
}

function hullStatus(runtime, hull) {
  if (!hull || hull.alive === false) return null;
  const data = hull.data || {};
  if (data.fleeing === true) return 'fleeing';
  const byId = runtime && typeof runtime._byId === 'function' ? runtime._byId() : null;
  if (byId) {
    for (const other of Object.values(byId)) {
      if (!other || other.entityId !== hull.id || !other.job) continue;
      if (other.job.phase === 'flee') return 'fleeing';
    }
  }
  if (hull.disabled === true || data.disabled === true) return 'disabled';
  if (data.loaded === true || data.carrying === true) return 'loaded';
  const manifest = data.cargoManifest;
  if (Array.isArray(manifest) && manifest.length > 0) return 'loaded';
  if (manifest && typeof manifest === 'object' && Object.keys(manifest).length > 0) return 'loaded';
  return null;
}

function gossipCandidates(runtime, speaker) {
  const state = runtime && runtime.state;
  const entities = state && state.entities;
  if (!entities || typeof entities.values !== 'function') return [];
  const out = [];
  for (const hull of entities.values()) {
    if (!hull || hull.alive === false) continue;
    if (speaker && hull.id === speaker.id) continue;
    if (state.playerId != null && hull.id === state.playerId) continue;
    if (hull.type && hull.type !== 'ship') continue;
    if (!hullName(hull) || !hullStatus(runtime, hull)) continue;
    out.push(hull);
  }
  out.sort((a, b) => String(a.id).localeCompare(String(b.id)));
  return out;
}

function gossipSubject(runtime, speaker, seed, recordId, window) {
  const rows = gossipCandidates(runtime, speaker);
  if (!rows.length) return null;
  return rows[hash32(seed, recordId || 'job', window, 'gossip-hull') % rows.length];
}

function errandText(runtime, errand) {
  if (!errand || !errand.line) return null;
  if (!errand.gossip) return errand.line;
  const hull = errand.subjectId != null && runtime.state && runtime.state.entities
    ? runtime.state.entities.get(errand.subjectId)
    : null;
  if (!hull || hull.alive === false) return null;
  if (runtime.state.playerId != null && hull.id === runtime.state.playerId) return null;
  const name = hullName(hull);
  const status = hullStatus(runtime, hull);
  if (!name || !status) return null;
  const text = errand.line.replaceAll('{callsign}', name).replaceAll('{state}', status);
  if (text.includes('{')) return null;
  return text;
}

function partnerReply(runtime, entity, errand) {
  if (!errand || !errand.reply || errand.partnerId == null) return null;
  if (runtime.state.playerId != null && errand.partnerId === runtime.state.playerId) return null;
  const partner = runtime.state.entities && runtime.state.entities.get(errand.partnerId);
  if (!partner || partner.alive === false || !partner.pos || !entity || !entity.pos) return null;
  const dx = partner.pos.x - entity.pos.x;
  const dz = partner.pos.z - entity.pos.z;
  if (dx * dx + dz * dz > PARTNER_RANGE * PARTNER_RANGE) return null;
  return { text: errand.reply, speakerId: errand.partnerId };
}

/** Pure pick. Same seed, record, and window → same errand id. */
export function pickLaneErrand(seed, recordId, window, kind, hasPartner, atTally = false, canGossip = false) {
  const rows = errandsForKind(kind).filter((row) => {
    if (row.partner && !hasPartner) return false;
    if (row.gossip && !canGossip) return false;
    return true;
  });
  if (!rows.length) return null;
  const index = hash32(seed, recordId || 'job', window, kind, 'lane-errand') % rows.length;
  const picked = rows[index];
  // Reject only this window's out-of-place post beat. Filtering the pool first
  // would reshuffle every generic pick and disturb unrelated workers' cadence.
  return POST_ERRANDS.has(picked.id) && !atTally ? null : picked;
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
    const subject = gossipSubject(runtime, entity, seed, recordId, window);
    const picked = pickLaneErrand(seed, recordId, window, entry.job.kind, !!partner,
      atLiveTally(runtime.state, entity), !!subject);
    entry.errandWindow = window;
    if (!picked) continue;
    entry.errand = {
      id: picked.id,
      motion: picked.motion,
      until: simT + picked.seconds,
      line: picked.line,
      reply: picked.reply || null,
      gossip: picked.gossip === true,
      said: false,
      origin: { x: entity.pos.x, z: entity.pos.z },
      started: simT,
      partnerId: partner ? partner.entry.entityId : null,
      subjectId: picked.gossip ? (subject ? subject.id : null) : null,
    };
  }
}

function writeIdleVelocity(runtime, entry, entity, vx, vz, heading, speed) {
  const length = Math.hypot(vx, vz);
  const scale = length > speed ? speed / length : 1;
  runtime._writeIntent(entity, 0, 0, false, heading, false);
  const data = entity.data || (entity.data = {});
  const intent = data.intent || (data.intent = {});
  // This scratch is derived entirely from the existing errand clock and current pose. Reusing
  // it avoids per-motor allocations; it never owns velocity or adds a second physical writer.
  const guidance = entry.errand.guidance || (entry.errand.guidance = { velocity: { x: 0, z: 0 }, heading: 0 });
  guidance.velocity.x = vx * scale;
  guidance.velocity.z = vz * scale;
  guidance.heading = heading;
  intent.rendezvous = guidance;
}

export function applyLaneErrandIntent(runtime, entry, entity, simT) {
  const errand = entry && entry.errand;
  if (!errand || !entity || !entity.pos) return false;
  if (simT >= errand.until || laneContractOwns(entry, entity, simT)
    || POST_ERRANDS.has(errand.id) && !atLiveTally(runtime.state, entity)) {
    entry.errand = null;
    return false;
  }
  if (!errand.said && runtime.bus && typeof runtime.bus.emit === 'function') {
    errand.said = true;
    try {
      const text = errandText(runtime, errand);
      if (text) {
        runtime.bus.emit('toast', {
          text, kind: 'info', ttl: 3.5, speakerId: entry.entityId,
        });
      }
      const reply = partnerReply(runtime, entity, errand);
      if (reply && reply.speakerId !== entry.entityId) {
        runtime.bus.emit('toast', {
          text: reply.text, kind: 'info', ttl: 3.5, speakerId: reply.speakerId,
        });
      }
      runtime.bus.emit('npcjobs:errand', {
        jobId: entry.job && entry.job.id,
        errandId: errand.id,
        kind: entry.job && entry.job.kind,
        simTime: simT,
      });
    } catch { /* advisory */ }
  }
  // An ambient story beat may speak during a shift, but cannot replace an authored worker's
  // motor, a moving leg, an arrival brake, or an already owned moving-frame hold. The catalog
  // covers Helios and every other authored work pocket rather than a growing Ceres-only list.
  if (authoredWorkOwns(entry, entity) || !IDLE_PHASES.has(entry.job.phase)
    || entity.data?.intent?.brake || entity.data?.intent?.rendezvous) return true;
  const origin = errand.origin || entity.pos;
  const elapsed = Math.max(0, simT - (Number.isFinite(errand.started) ? errand.started : simT));
  const speed = Math.min(LANE_IDLE_MOTION.maxSpeed,
    Math.max(3, Number.isFinite(entry.job.speed) ? entry.job.speed : 12));
  const heading = Number.isFinite(entry.job.heading) ? entry.job.heading : 0;
  if (errand.motion === 'brake') {
    writeIdleVelocity(runtime, entry, entity, 0, 0, entity.rot || 0, speed);
    return true;
  }
  if (errand.motion === 'half') {
    const aim = entity.rot || 0;
    writeIdleVelocity(runtime, entry, entity, Math.cos(aim) * speed * 0.28,
      Math.sin(aim) * speed * 0.28, aim, speed);
    return true;
  }
  if (errand.motion === 'flash') {
    const wobble = Math.sin(simT * 6) * 0.15;
    writeIdleVelocity(runtime, entry, entity, 0, 0, heading + wobble, speed);
    return true;
  }
  if (errand.motion === 'face' && errand.partnerId != null) {
    const partner = runtime.state.entities && runtime.state.entities.get(errand.partnerId);
    if (partner && partner.pos) {
      const dx = partner.pos.x - entity.pos.x;
      const dz = partner.pos.z - entity.pos.z;
      const aim = Math.atan2(dz, dx);
      const dist = Math.hypot(dx, dz);
      const closing = Math.min(speed, Math.max(0, dist - 160) * 0.5);
      writeIdleVelocity(runtime, entry, entity, (partner.vel?.x || 0) + dx / Math.max(1, dist) * closing,
        (partner.vel?.z || 0) + dz / Math.max(1, dist) * closing, aim, speed);
      return true;
    }
  }
  const weave = errand.motion === 'weave';
  const radius = LANE_IDLE_MOTION.radius;
  const rate = speed / (weave ? radius * Math.SQRT2 : radius);
  const ang = elapsed * rate;
  // Start at the held position, then follow a small continuous curve. The former radius140 ×
  // rate0.7 goal demanded 98 WU/s and open-loop engine axes launched miners through the belt.
  const tx = origin.x + radius * (weave ? Math.sin(ang) : Math.cos(ang) - 1);
  const tz = origin.z + radius * (weave ? Math.sin(2 * ang) * 0.5 : Math.sin(ang));
  const tvx = radius * rate * (weave ? Math.cos(ang) : -Math.sin(ang));
  const tvz = radius * rate * (weave ? Math.cos(2 * ang) : Math.cos(ang));
  const dx = tx - entity.pos.x;
  const dz = tz - entity.pos.z;
  const vx = tvx + dx * LANE_IDLE_MOTION.positionGain;
  const vz = tvz + dz * LANE_IDLE_MOTION.positionGain;
  writeIdleVelocity(runtime, entry, entity, vx, vz,
    Math.hypot(vx, vz) > 0.05 ? Math.atan2(vz, vx) : entity.rot || 0, speed);
  return true;
}
