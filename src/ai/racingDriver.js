// A race pilot publishes ordinary flight inputs. Flight V3 and the physics owner
// remain the only propulsion and motion writers; no catch-up speed or pose edits.
import { resolvePropulsionProfile } from '../core/flight/propulsionCatalog.js';
import { gateApproach } from '../systems/racingGeometry.js';

export const RACING_PERSONALITIES = Object.freeze([
  Object.freeze({ id: 'mira', name: 'Mira Vale', hullId: 'ship_kestrel', style: 'Clean lines', pace: 0.94, corner: 0.82, lane: -1 }),
  Object.freeze({ id: 'rook', name: 'Rook Six', hullId: 'ship_wasp', style: 'Late apexes', pace: 1, corner: 1, lane: 1 }),
  Object.freeze({ id: 'sable', name: 'Sable Reed', hullId: 'ship_drifter', style: 'Patient overtakes', pace: 0.9, corner: 0.74, lane: -1 }),
]);
export const RACING_DIFFICULTIES = Object.freeze({ rookie: 0.68, club: 0.86, expert: 1 });
const QUARRY_HOOK_LATCH_WU = 160;
const QUARRY_HOOK_SEEK_WU = 340;
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
function quarryHookBody(nearby) {
  for (const body of nearby) {
    if (!body || body.alive === false || !body.pos) continue;
    const piece = body.data?.raceSetPiece?.id;
    const name = body.data?.name || body.name;
    if (piece === 'quarry_hook' || name === 'Quarry Hook') return body;
  }
  return null;
}
const angle = x => Math.atan2(Math.sin(x), Math.cos(x));
const idle = () => ({ moveX: 0, moveZ: 0, turnIntent: 0, brake: true, boost: false, fire: false, assistMode: 'newtonian' });

export function createRacingDriver(personality, difficulty = 'club') {
  return { personality, difficulty: RACING_DIFFICULTIES[difficulty] ? difficulty : 'club',
    recovering: false, recoveries: 0, laneWU: 0, lastGate: -1, lastLap: -1, anchorLaps: [],
    // AL-RACE-1: real rope swings and physical contact recovery. `anchor` is the live
    // heat-owned latch (attachment id included); `anchorUses` is the per-race log;
    // `contactRecovery` is an ordinary rejoin-in-progress, never a pose edit.
    anchor: null, anchorUses: [], contactRecovery: null, lastContactRecovery: null };
}

/** Curvature sets the crossing speed; finite reverse thrust sets the braking distance. */
export function racingCornerSpeed(gates, index, aperture, profile, personality) {
  const from = gateApproach(gates, index), gate = gates[index];
  const next = gates[index + 1] || gates[1];
  if (!from || !next) return 30;
  const dx = next.x - gate.x, dz = next.z - gate.z, length = Math.hypot(dx, dz) || 1;
  const turn = Math.acos(clamp((dx * from.nx + dz * from.nz) / length, -1, 1));
  if (turn < 0.1) return Number(profile.combatSpeed || profile.maxSpeed) || 180;
  const lateral = Number(profile.strafeAccel || profile.maxAccel) || 60;
  const radius = Math.max(18, aperture * 0.65) / Math.max(0.2, Math.tan(Math.min(2.8, turn) / 2));
  return Math.max(26, Math.sqrt(lateral * radius) * personality.corner);
}

// ---- Rival physical anchors (AL-RACE-1) ----------------------------------------------
// The steering math only ever publishes ordinary flight inputs; racingOpponents owns the
// canonical attachment record (create/cut/telemetry) and passes the live anchor context in
// explicitly — racingDriverIntent is shared with crossing cargo drivers, which get none.

/**
 * Pick the next anchor a rival may commit to. `candidates` are already ordered by that
 * rival's stable preference list; a candidate holds {anchorId,targetId,gateIndex,pos,line,
 * reservedBy}. Enter only on the served checkpoint's legal approach side, within the
 * authored entry window; `inReach` reports whether the standard tether can reach now.
 */
export function selectRacingAnchor(driver, { entity, params, gates, candidates = [], rivalId = null, reachWU = 330 } = {}) {
  if (!driver || driver.anchor || driver.contactRecovery || !entity?.pos || !Array.isArray(gates) || !gates.length) return null;
  const next = Math.max(0, params?.nextGate | 0);
  for (const anchor of candidates) {
    if (!anchor || anchor.gateIndex !== next) continue;
    if (anchor.reservedBy != null && anchor.reservedBy !== rivalId) continue;
    if (!anchor.pos || !Number.isFinite(anchor.pos.x) || !Number.isFinite(anchor.pos.z)) continue;
    const gate = gates[anchor.gateIndex], from = gateApproach(gates, anchor.gateIndex);
    if (!gate || !from) continue;
    const plane = (entity.pos.x - gate.x) * from.nx + (entity.pos.z - gate.z) * from.nz;
    const entryBack = Math.max(40, Number(anchor.line && anchor.line.entryBackWU) || 180);
    if (plane > 0 || plane < -entryBack) continue;
    const distance = Math.hypot(anchor.pos.x - entity.pos.x, anchor.pos.z - entity.pos.z);
    return Object.assign({}, anchor, { plane, distance, inReach: distance <= reachWU });
  }
  return null;
}

/**
 * Where a roped rival steers: while the served checkpoint is still outstanding, through the
 * aperture onto its outgoing leg (anchor-side bias bounded by the aperture) so the tether's
 * redirect converts carried momentum instead of the hull parking at a braking point; once
 * the checkpoint has crossed legally, the ordinary next-gate approach point so the rope
 * exit merges onto the racing line. Returns null when no live swing should steer.
 */
export function racingAnchorIntent(driver, { params, gates, aperture = 80, laneWU = 0 } = {}) {
  const anchor = driver && driver.anchor;
  if (!anchor || !anchor.pos || !Array.isArray(gates) || !gates.length) return null;
  const next = Math.max(0, params?.nextGate | 0);
  if (next === anchor.gateIndex && (params?.lap | 0) <= (anchor.lapAtAttach | 0)) {
    const gate = gates[anchor.gateIndex], from = gateApproach(gates, anchor.gateIndex);
    const outGate = gates[(anchor.gateIndex + 1) % gates.length] || gate;
    if (!gate || !from || !outGate) return null;
    const anchorLateral = (anchor.pos.x - gate.x) * -from.nz + (anchor.pos.z - gate.z) * from.nx;
    const lat = clamp(anchorLateral, -aperture * 0.55, aperture * 0.55);
    // The tether owns the redirect: aim THROUGH the served checkpoint onto its outgoing leg —
    // the hull carries momentum through the apex and the rope converts it, instead of
    // decelerating into a braking point parked in front of the gate.
    const outLength = Math.hypot(outGate.x - gate.x, outGate.z - gate.z) || 1;
    const ahead = Math.max(40, Number(anchor.line && anchor.line.releaseAheadWU) || 60);
    return { phase: 'approach',
      x: gate.x + ((outGate.x - gate.x) / outLength) * ahead - from.nz * lat,
      z: gate.z + ((outGate.z - gate.z) / outLength) * ahead + from.nx * lat };
  }
  const gate = gates[next], from = gateApproach(gates, next);
  if (!gate || !from) return null;
  return { phase: 'exit',
    x: gate.x + from.nx * 30 - from.nz * laneWU, z: gate.z + from.nz * 30 + from.nx * laneWU };
}

/**
 * Should the live latch be cut? 'complete' once the served checkpoint has crossed and the
 * craft is releaseAheadWU down the outgoing leg; 'recovery' when a miss or a contact
 * recovery takes priority; 'timeout' past the authored hold ceiling; 'attachment_lost'
 * when the canonical record is gone or no longer active. Null means keep holding.
 */
export function racingAnchorReleaseReason(driver, { entity, params, gates, now = 0, attachmentAlive = true } = {}) {
  const anchor = driver && driver.anchor;
  if (!anchor || !entity?.pos) return null;
  if (!attachmentAlive) return 'attachment_lost';
  if (driver.contactRecovery || driver.recovering) return 'recovery';
  const line = anchor.line || {};
  const maxHold = Number(line.maxHoldS) > 0 ? Number(line.maxHoldS) : 4;
  if (Number.isFinite(now) && now - (Number(anchor.attachedAtS) || 0) > maxHold) return 'timeout';
  const next = Math.max(0, params?.nextGate | 0);
  if (next !== anchor.gateIndex || (params?.lap | 0) > (anchor.lapAtAttach | 0)) {
    const gate = gates[anchor.gateIndex];
    const outGate = gates[(anchor.gateIndex + 1) % gates.length] || gate;
    if (!gate || !outGate) return 'timeout';
    const dx = outGate.x - gate.x, dz = outGate.z - gate.z;
    const length = Math.hypot(dx, dz) || 1;
    const ahead = ((entity.pos.x - gate.x) * dx + (entity.pos.z - gate.z) * dz) / length;
    if (ahead >= (Number(line.releaseAheadWU) || 60)) return 'complete';
  }
  return null;
}

/**
 * Open an ordinary rejoin run after a real set-piece hit: the craft flies back inside the
 * corridor under its own power and the run closes only after twelve straight ticks inside
 * the usable width with velocity aligned to the leg. No pose edits, no pace changes.
 */
export function beginRacingContactRecovery(driver, { gateIndex = 0, now = 0, tick = 0, cause = 'contact' } = {}) {
  if (!driver) return null;
  const recovery = { gateIndex: gateIndex | 0, enteredAtS: Number(now) || 0, enteredTick: tick | 0,
    alignedTicks: 0, recoveredAtS: null, cause: String(cause || 'contact') };
  driver.contactRecovery = recovery;
  return recovery;
}

/** `nearby` contains actual bodies, never a scripted leader or a pace beacon. */
export function racingDriverIntent(driver, { entity, params, gates, nearby = [], dt = 1 / 60, held = false, anchorContext = null }) {
  if (!entity?.pos || held || !gates?.length || params.nextGate >= gates.length) return idle();
  const next = Math.max(0, params.nextGate | 0), lap = params.lap | 0;
  const gate = gates[next], from = gateApproach(gates, next);
  if (!from) return idle();
  const profile = resolvePropulsionProfile(entity);
  const personality = driver.personality || RACING_PERSONALITIES[0];
  const aperture = Number(params.gateRadiusWU) || 80;
  const radius = Number(entity.radius) || 18;
  const plane = (entity.pos.x - gate.x) * from.nx + (entity.pos.z - gate.z) * from.nz;
  if (driver.lastGate !== next || driver.lastLap !== lap) {
    driver.lastGate = next; driver.lastLap = lap; driver.recovering = false;
  }
  // A missed aperture is approached again from its legal side. The craft must fly
  // the recovery under its own power and still cross the same ordered gate.
  if (plane > 24 && !driver.recovering) { driver.recovering = true; driver.recoveries++; }
  if (driver.recovering && plane < -Math.max(80, radius * 4)) driver.recovering = false;
  let targetLane = personality.lane * Math.min(14, aperture * 0.15);
  let trafficSpeed = Infinity;
  let escapeX = 0, escapeZ = 0;
  const velocity = entity.vel || { x: 0, z: 0 };
  const speed = Math.hypot(velocity.x, velocity.z);
  for (const other of nearby) {
    if (!other || other === entity || other.id === entity.id || other.alive === false || other.collides === false || !other.pos) continue;
    const dx = other.pos.x - entity.pos.x, dz = other.pos.z - entity.pos.z;
    const ahead = dx * from.nx + dz * from.nz;
    const lateral = dx * -from.nz + dz * from.nx;
    const clearance = radius + (Number(other.radius) || 18) + 14;
    if (ahead < -clearance || ahead > Math.max(130, speed * 1.5) || Math.abs(lateral) > clearance + 35) continue;
    const side = lateral === 0 ? personality.lane : -Math.sign(lateral);
    const laneLimit = Math.max(0, aperture - radius - 18);
    targetLane = side * Math.min(laneLimit, clearance + 8);
    const gap = Math.hypot(dx, dz);
    if (gap < clearance + 20 && gap > 0.01) {
      // A stopped leader must not also cancel the sideways room needed to pass.
      // Opposing hulls separate under finite strafe/reverse thrust, then rejoin.
      const escape = Math.min(42, (clearance + 20 - gap) * 1.5);
      escapeX -= dx / gap * escape; escapeZ -= dz / gap * escape;
    }
    if (Math.abs(lateral) < clearance && ahead > 0) {
      // Slow for the actual closing gap, then pass on a bounded aperture lane.
      const leaderSpeed = Math.max(0, (other.vel?.x || 0) * from.nx + (other.vel?.z || 0) * from.nz);
      trafficSpeed = Math.min(trafficSpeed, Math.max(12, leaderSpeed + Math.max(0, ahead - clearance) * 0.7));
    }
  }
  const laneStep = 42 * Math.max(0, dt);
  driver.laneWU += clamp(targetLane - driver.laneWU, -laneStep, laneStep);
  const top = (Number(profile.combatSpeed || profile.maxSpeed) || 180)
    * RACING_DIFFICULTIES[driver.difficulty] * personality.pace;
  const approachOffset = driver.recovering ? -Math.max(125, radius * 5) : 30;
  const target = { x: gate.x + from.nx * approachOffset - from.nz * driver.laneWU,
    z: gate.z + from.nz * approachOffset + from.nx * driver.laneWU };
  // Rope-owning swing: the tether turns the craft, so the throttle stays open and the
  // steering point comes from the anchor record — still ordinary flight input either way.
  let freeRun = false;
  let recoveryCap = Infinity;
  const anchorCandidate = !driver.anchor && anchorContext && anchorContext.candidate
    && anchorContext.candidate.pos ? anchorContext.candidate : null;
  // "Back on its line" bookkeeping ticks under whichever intent is steering — a lawful
  // gate-miss rejoin after the hit is still the hull's own path back. On the line means
  // inside the corridor and moving mostly down-leg for a short settle.
  let recovery = driver.contactRecovery;
  let contactLeg = null;
  if (recovery) {
    const a = next > 0 ? gates[next - 1] : { x: from.x, z: from.z };
    const b = gates[next];
    const legX = b.x - a.x, legZ = b.z - a.z, legLength = Math.hypot(legX, legZ) || 1;
    const ux = legX / legLength, uz = legZ / legLength;
    const along = clamp(((entity.pos.x - a.x) * ux + (entity.pos.z - a.z) * uz) / legLength, 0, 1);
    const offLine = Math.hypot(entity.pos.x - (a.x + legX * along), entity.pos.z - (a.z + legZ * along));
    const corridorWU = Math.max(30, aperture - 14);
    const legAligned = speed > 8 ? (velocity.x * ux + velocity.z * uz) / speed : 0;
    recovery.alignedTicks = (offLine <= corridorWU && legAligned >= 0.6) ? (recovery.alignedTicks | 0) + 1 : 0;
    if (recovery.alignedTicks >= 12) {
      driver.lastContactRecovery = recovery;
      driver.contactRecovery = null;
      recovery = null;
    } else {
      contactLeg = { a, b, ux, uz, legLength, along };
    }
  }
  if (recovery && !driver.recovering) {
    // Physical rejoin after a set-piece hit: steer onto the current leg's usable centerline
    // at a modest speed until hull and velocity line up for a short settle.
    const { a, b, legLength, along } = contactLeg;
    const aheadWU = Math.min(160, Math.max(70, speed * 0.9));
    const t2 = clamp(along + aheadWU / legLength, 0, 1);
    if (t2 < 1) {
      const legX = b.x - a.x, legZ = b.z - a.z;
      target.x = a.x + legX * t2; target.z = a.z + legZ * t2;
    } else {
      target.x = gate.x + from.nx * 25 - from.nz * driver.laneWU;
      target.z = gate.z + from.nz * 25 + from.nx * driver.laneWU;
    }
    // Row 394 done-when: back on the line within 6 s of the hit — a crash rejoin runs at
    // most of race pace (the hull's own engine, not a scripted pull).
    recoveryCap = Math.max(64, top * 0.75);
  } else if (driver.anchor && driver.anchor.pos) {
    const aim = racingAnchorIntent(driver, { params, gates, aperture, laneWU: driver.laneWU });
    if (aim) { target.x = aim.x; target.z = aim.z; freeRun = true; }
  } else if (anchorCandidate) {
    // Pre-latch approach: bias the line toward the anchor's side, bounded by the aperture,
    // so the tether can reach before the checkpoint — still a legal crossing line.
    const from2 = gateApproach(gates, anchorCandidate.gateIndex), gate2 = gates[anchorCandidate.gateIndex];
    if (from2 && gate2 && anchorCandidate.gateIndex === next) {
      const anchorLateral = (anchorCandidate.pos.x - gate2.x) * -from2.nz + (anchorCandidate.pos.z - gate2.z) * from2.nx;
      const lat = clamp(anchorLateral, -aperture * 0.55, aperture * 0.55);
      target.x = gate2.x + from2.nx * approachOffset - from2.nz * lat;
      target.z = gate2.z + from2.nz * approachOffset + from2.nx * lat;
    }
  }
  // Mira alone takes the Quarry Hook — legacy decorative latch, kept only for the
  // pure-driver path where no physical anchor context is supplied. A real anchor rock
  // carries physicsBody: the anchor pipeline owns it, and steering into a fixed body
  // that way parks the hull on the rock instead of crossing the gate.
  let anchor = null;
  if (anchorContext == null && personality.id === 'mira' && !driver.recovering) {
    const hook = quarryHookBody(nearby);
    if (hook && hook.physicsBody == null) {
      const hx = hook.pos.x - entity.pos.x, hz = hook.pos.z - entity.pos.z;
      const hd = Math.hypot(hx, hz);
      if (hd <= QUARRY_HOOK_SEEK_WU && hd > 0.01) {
        const blend = hd <= QUARRY_HOOK_LATCH_WU ? 0.82 : 0.4;
        target.x = target.x * (1 - blend) + hook.pos.x * blend;
        target.z = target.z * (1 - blend) + hook.pos.z * blend;
      }
      if (hd <= QUARRY_HOOK_LATCH_WU) {
        if (!Array.isArray(driver.anchorLaps)) driver.anchorLaps = [];
        if (!driver.anchorLaps.includes(lap)) driver.anchorLaps.push(lap);
        anchor = { id: 'quarry_hook', targetId: hook.id, lap, name: 'Quarry Hook' };
      }
    }
  }
  const dx = target.x - entity.pos.x, dz = target.z - entity.pos.z;
  const distance = Math.hypot(dx, dz) || 1;
  const brake = Math.min(Number(profile.reverseAccel || profile.maxBrakeAccel) || 60,
    Number(profile.strafeAccel || profile.maxAccel) || 60) * 0.58;
  const corner = racingCornerSpeed(gates, next, aperture, profile, personality);
  const approachSpeed = Math.sqrt(corner * corner + 2 * brake * Math.max(0, -plane - 35));
  const targetSpeed = Math.min(top, freeRun ? top : approachSpeed, driver.recovering ? 70 : Infinity,
    trafficSpeed, Math.max(30, distance * 1.6), recoveryCap);
  let vx = dx / distance * targetSpeed + escapeX, vz = dz / distance * targetSpeed + escapeZ;
  const requestedSpeed = Math.hypot(vx, vz);
  if (requestedSpeed > top) { vx *= top / requestedSpeed; vz *= top / requestedSpeed; }
  const responseS = 0.65;
  const ax = (vx - velocity.x) / responseS, az = (vz - velocity.z) / responseS;
  const rot = Number(entity.rot) || 0, fx = Math.cos(rot), fz = Math.sin(rot);
  const forward = ax * fx + az * fz, lateral = ax * -fz + az * fx;
  const main = Number(profile.mainAccel || profile.maxAccel) || 100;
  const reverse = Number(profile.reverseAccel || profile.maxBrakeAccel) || 78;
  const strafe = Number(profile.strafeAccel || profile.maxAccel) || 68;
  const heading = Math.atan2(dz, dx);
  const intent = { moveZ: clamp(forward / (forward >= 0 ? main : reverse), -1, 1),
    moveX: clamp(lateral / strafe, -1, 1),
    turnIntent: clamp(angle(heading - rot) * 1.8 - (Number(entity.angVel) || 0) * 0.35, -1, 1),
    brake: false, boost: false, fire: false, assistMode: 'newtonian' };
  if (anchor) intent.anchor = anchor;
  return intent;
}
