import { queryPhysicalBodies } from './physicalEffects.js';
import { queryNearbyEntities } from '../core/spatialQuery.js';
import { queuePhysicsImpulse } from '../core/physicsAuthority.js';
import { ensureCombatant } from './runtime.js';
import { CRYO_LOCK_DURATION_TICKS, CRYO_LOCK_STATUS_ID } from './cryoLock.js';
import { BURNING_STATUS_ID, resolveThermalShock } from './thermalShock.js';
// Snarl projectiles stitch enemy hulls into short physical chains. The attachment service owns
// sockets, spring forces, breakage and rendering receipts; this owner only chooses endpoints.
export const WEB_WEAPON_ID = 'wpn_snarl_s';
export const WEB_DEF_ID = 'attachment_snarl';
export const WEB_LIMITS = Object.freeze({ reach: 120, linksPerHit: 3, activeLinks: 12, lifetimeS: 9 });
// Arc-wire. A Snarl chord pins its two endpoints ("pin two bodies with a web"). An energy
// shot into one of those nodes loads the chord. The numbers are the trap: how long the
// charge lives, how many crossings it can pay, and how much shield one crossing takes.
export const ARC_WIRE = Object.freeze({
  durationS: 4.5,
  crossings: 1,
  shieldStrip: 22,
  // Keep the pinned endpoints in their own bodies. A crossing is the open span between them.
  endMargin: 0.08,
  width: 1.7,
  widthPeak: 0.5,
});
const WEB_REACH2 = WEB_LIMITS.reach * WEB_LIMITS.reach;
const EMPTY_CHORDS = Object.freeze([]);

export function createTetherWebs({ state, bus, registry }) {
  const pending = [];
  const links = new Map();
  const liveChords = [];
  const crosserScratch = [];
  const queryScratch = [];
  const authority = () => registry?.get('actions')?.kernel?.attachments
    || registry?.get('combat')?.kernel?.attachments;
  const clear = (keepRestoredLinks) => {
    const service = authority();
    // Restored attachment records must not become permanent webs after their transient timer
    // ledger is gone — this temporary weapon effect releases through its real owner. Only the
    // save:loaded sweep keeps links the loaded save's own ledger just rebound; every other
    // boundary cuts every web eagerly like before.
    for (const attachment of Object.values(state.combat?.attachments?.byId || {})) {
      if (attachment.defId === WEB_DEF_ID && attachment.state === 'active'
          && !(keepRestoredLinks && links.has(attachment.id))) {
        service?.cut(attachment.id, attachment.controllerId ?? attachment.ownerId, 'web_released');
      }
    }
    // Timer entries whose attachment is gone die with the boundary (new run, sector exit);
    // entries just rebound by a loaded save's own web ledger keep their remaining lifetime.
    if (service) {
      for (const id of links.keys()) {
        const attachment = service.get(id);
        if (!attachment || attachment.state !== 'active') links.delete(id);
      }
    } else {
      links.clear();
    }
    pending.length = 0;
  };
  const unsubs = [];
  if (bus?.on) {
    unsubs.push(bus.on('projectile:hit', hit => {
      if (hit?.weaponId !== WEB_WEAPON_ID || pending.length >= WEB_LIMITS.linksPerHit) return;
      const target = state.entities.get(hit.targetId);
      const owner = state.entities.get(hit.ownerId);
      if (target && owner && !pending.some(p => p.target === target)) pending.push({ target, owner });
    }));
    for (const event of ['game:new', 'sector:exit', 'run:ended']) {
      unsubs.push(bus.on(event, () => clear(false)));
    }
    unsubs.push(bus.on('save:loaded', () => clear(true)));
  }
  return {
    clear,
    // FB-015 — a web is a player investment: the timer ledger persists beside the attachment
    // records combat already saves, so a mid-flight snarl keeps its remaining lifetime on load.
    serializeLinks() {
      const service = authority();
      const now = state.simTime || 0;
      const out = [];
      for (const [id, record] of links) {
        const attachment = service && service.get(id);
        if (!attachment || attachment.state !== 'active') continue;
        out.push({
          id,
          controllerId: record.controllerId,
          remaining: Math.max(0, record.until - now),
        });
      }
      return out;
    },
    restoreLinks(records) {
      links.clear();
      pending.length = 0;
      const service = authority();
      const now = state.simTime || 0;
      for (const rec of records || []) {
        if (!rec || typeof rec.id !== 'string') continue;
        const attachment = service && service.get(rec.id);
        if (!attachment || attachment.state !== 'active') continue;
        // The restored attachment record already carries the resolved endpoint ids; the saved
        // ledger's controllerId is a prior-session id and is never installed — the expiry cut
        // must name a controller the live attachment record actually honors.
        links.set(rec.id, {
          controllerId: attachment.controllerId ?? attachment.ownerId,
          until: now + Math.max(0, Number(rec.remaining) || 0),
        });
      }
    },
    destroy() { clear(); for (const off of unsubs) off(); },
    update(dt) {
      const service = authority();
      if (!service) { pending.length = 0; tickArcWires(dt); return; }
      const now = state.simTime || 0;
      for (const [id, record] of links) {
        const attachment = service.get(id);
        if (!attachment || attachment.state !== 'active') { links.delete(id); continue; }
        if (now >= record.until) {
          service.cut(id, record.controllerId, 'web_expired');
          links.delete(id);
        }
      }
      for (const { target, owner } of pending) {
        if (!owner.alive || !target.alive || state.entities.get(target.id) !== target) continue;
        if (target.id === state.playerId || (['ship', 'drone'].includes(target.type) && target.team === owner.team)) continue;
        // Score each candidate's distance once: the old filter+sort chain paid a hypot per
        // entity plus two more per sort comparison. Order stays nearest-first, id tiebreak.
        const scored = [];
        const candidates = queryPhysicalBodies(state, target.pos, WEB_LIMITS.reach, registry?.get('weapons')?.helpers);
        for (const e of candidates) {
          if (!e || !e.alive || e === target || e === owner) continue;
          if (e.id === state.playerId) continue;
          if (['ship', 'drone'].includes(e.type) && e.team === owner.team) continue;
          const dx = e.pos.x - target.pos.x;
          const dz = e.pos.z - target.pos.z;
          const d2 = dx * dx + dz * dz;
          if (d2 > WEB_REACH2) continue;
          scored.push({ e, d2 });
        }
        scored.sort((a, b) => (a.d2 - b.d2) || (a.e.id - b.e.id));
        let source = target;
        let created = 0;
        for (const { e: next } of scored) {
          if (created >= WEB_LIMITS.linksPerHit || links.size >= WEB_LIMITS.activeLinks) break;
          const pairExists = [...links.keys()].some(id => {
            const a = service.get(id);
            return a && ((a.ownerId === source.id && a.targetId === next.id)
              || (a.ownerId === next.id && a.targetId === source.id));
          });
          if (pairExists) { source = next; continue; }
          const result = service.create({ defId: WEB_DEF_ID, ownerId: source.id, targetId: next.id,
            controllerId: owner.id, controlMode: 'snarl', sourceWorld: source.pos, targetWorld: next.pos });
          if (!result?.ok) continue;
          links.set(result.attachment.id, { controllerId: owner.id, until: now + WEB_LIMITS.lifetimeS });
          // A slight take-up makes the catch visible. This changes real spring rest length;
          // thrust, momentum, collisions and mass still determine where the linked hulls go.
          service.reel(result.attachment.id, -result.attachment.restLength * 0.16,
            (source.radius || 0) + (next.radius || 0) + 5);
          source = next;
          created++;
        }
        if (created) bus.emit('web:linked', { ownerId: owner.id, targetId: target.id, links: created });
      }
      pending.length = 0;
      tickArcWires(dt);
    },
  };

  function tickArcWires(dt) {
    const byId = state.combat && state.combat.attachments && state.combat.attachments.byId;
    if (!byId) return;
    const now = Number.isFinite(state.simTime) ? state.simTime : 0;
    liveChords.length = 0;
    for (const id in byId) {
      const chord = byId[id];
      const row = chord && chord.arcWire;
      if (!row) continue;
      // A backwards clock or a cut chord drops the charge. A spent chord keeps its row until
      // sim time reaches `until`, so a beam still sitting on the node cannot refund the crossing.
      if (chord.defId !== WEB_DEF_ID || chord.state !== 'active'
        || !(now >= row.energizedAt) || !(now < row.until)) {
        delete chord.arcWire;
        continue;
      }
      if (row.left > 0) liveChords.push(chord);
    }
    if (!liveChords.length) return;
    fillCrossers();
    for (let c = 0; c < liveChords.length; c++) {
      const chord = liveChords[c];
      const row = chord.arcWire;
      if (!row || !(row.left > 0)) continue;
      const a = state.entities.get(chord.ownerId);
      const b = state.entities.get(chord.targetId);
      if (!a || !b || a.alive === false || b.alive === false) continue;
      for (let i = 0; i < crosserScratch.length; i++) {
        if (!(row.left > 0)) break;
        const hull = crosserScratch[i];
        if (!sweptChord(a, b, hull, dt)) continue;
        if (applyArcCrossing(state, registry, chord, hull, a, b)) row.left -= 1;
      }
    }
  }

  function fillCrossers() {
    crosserScratch.length = 0;
    let list = state.entityList;
    if (liveChords.length === 1) {
      const chord = liveChords[0];
      const a = state.entities.get(chord.ownerId);
      const b = state.entities.get(chord.targetId);
      if (a && a.pos && b && b.pos) {
        const reach = Math.hypot(b.pos.x - a.pos.x, b.pos.z - a.pos.z) * 0.5 + 64;
        const found = queryNearbyEntities(state, {
          x: (a.pos.x + b.pos.x) * 0.5,
          z: (a.pos.z + b.pos.z) * 0.5,
        }, reach, queryScratch, null);
        // No hash: the helper hands back entityList itself. Never sort that array.
        if (found && found !== state.entityList) list = found;
      }
    }
    const source = list || [];
    for (let i = 0; i < source.length; i++) {
      const hull = source[i];
      if (!hull || hull.alive === false) continue;
      if (hull.type !== 'ship' && hull.type !== 'drone') continue;
      crosserScratch.push(hull);
    }
    crosserScratch.sort((p, q) => compareArcIds(p.id, q.id));
  }
}

function num(value) {
  return Number.isFinite(value) ? value : 0;
}

function compareArcIds(a, b) {
  if (Number.isFinite(a) && Number.isFinite(b)) return a - b;
  const left = String(a);
  const right = String(b);
  return left < right ? -1 : left > right ? 1 : 0;
}

/** Active Snarl chords that pin this body. Empty array is shared and must not be mutated. */
export function activeWebChords(state, nodeId) {
  const byId = state && state.combat && state.combat.attachments && state.combat.attachments.byId;
  if (!byId || nodeId == null) return EMPTY_CHORDS;
  let out = null;
  for (const id in byId) {
    const chord = byId[id];
    if (!chord || chord.defId !== WEB_DEF_ID || chord.state !== 'active') continue;
    if (chord.ownerId !== nodeId && chord.targetId !== nodeId) continue;
    if (!out) out = [];
    out.push(chord);
  }
  return out || EMPTY_CHORDS;
}

/**
 * An energy shot into a pinned node. A chord that still has crossings left keeps its
 * clock fed. A chord already spent this cycle stays spent until sim time reaches `until`.
 */
export function noteArcWireShot(state, target, shot, chords) {
  const list = chords && chords.length ? chords : activeWebChords(state, target && target.id);
  if (!state || !list.length) return null;
  const now = Number.isFinite(state.simTime) ? state.simTime : 0;
  const sx = shot && Number.isFinite(shot.x) ? shot.x : num(target && target.pos && target.pos.x);
  const sz = shot && Number.isFinite(shot.z) ? shot.z : num(target && target.pos && target.pos.z);
  let armed = 0;
  for (let i = 0; i < list.length; i++) {
    const chord = list[i];
    if (!chord || chord.defId !== WEB_DEF_ID || chord.state !== 'active') continue;
    const row = chord.arcWire;
    if (row && now < row.until && now >= row.energizedAt && row.left > 0) {
      row.until = now + ARC_WIRE.durationS;
      row.shotX = sx;
      row.shotZ = sz;
      armed++;
      continue;
    }
    if (row && now < row.until && now >= row.energizedAt && !(row.left > 0)) continue;
    chord.arcWire = {
      until: now + ARC_WIRE.durationS,
      left: ARC_WIRE.crossings,
      energizedAt: now,
      shotX: sx,
      shotZ: sz,
    };
    armed++;
  }
  return armed ? { nodeId: target.id, chords: armed, until: now + ARC_WIRE.durationS } : null;
}

export function arcWireLive(link, simTime) {
  const row = link && link.arcWire;
  if (!row || !(row.left > 0)) return false;
  const now = Number.isFinite(simTime) ? simTime : 0;
  return now >= row.energizedAt && now < row.until;
}

/** Thickness multiplier along the chord. 1 when the chord is dark. Peak marks the shot. */
export function arcWireWidthScale(link, simTime, ax, az, bx, bz, t) {
  if (!arcWireLive(link, simTime)) return 1;
  const dx = num(bx) - num(ax);
  const dz = num(bz) - num(az);
  const lenSq = dx * dx + dz * dz;
  let peak = 0;
  if (lenSq > 1e-6 && Number.isFinite(link.arcWire.shotX) && Number.isFinite(link.arcWire.shotZ)) {
    let shotT = ((link.arcWire.shotX - num(ax)) * dx + (link.arcWire.shotZ - num(az)) * dz) / lenSq;
    if (shotT < 0) shotT = 0;
    else if (shotT > 1) shotT = 1;
    const along = Math.abs(num(t) - shotT);
    peak = along >= 0.35 ? 0 : 1 - along / 0.35;
  }
  return ARC_WIRE.width + ARC_WIRE.widthPeak * peak;
}

function sweptChord(a, b, hull, dt) {
  if (!hull || hull.alive === false || !hull.pos || !a || !b || !a.pos || !b.pos) return false;
  if (hull.type !== 'ship' && hull.type !== 'drone') return false;
  if (hull.id === a.id || hull.id === b.id) return false;
  const ax = num(a.pos.x);
  const az = num(a.pos.z);
  const dx = num(b.pos.x) - ax;
  const dz = num(b.pos.z) - az;
  const lenSq = dx * dx + dz * dz;
  if (lenSq < 1e-6) return false;
  const len = Math.sqrt(lenSq);
  const nx = -dz / len;
  const nz = dx / len;
  const step = Number.isFinite(dt) && dt > 0 ? dt : 0;
  const cx = num(hull.pos.x);
  const cz = num(hull.pos.z);
  const px = cx - num(hull.vel && hull.vel.x) * step;
  const pz = cz - num(hull.vel && hull.vel.z) * step;
  const signedNow = (cx - ax) * nx + (cz - az) * nz;
  const signedPrev = (px - ax) * nx + (pz - az) * nz;
  if (Math.abs(signedNow - signedPrev) < 0.2) return false;
  // Same side of the filament, including a hull parked beside it: not a crossing.
  if (signedPrev * signedNow > 0) return false;
  const denom = signedPrev - signedNow;
  const u = denom === 0 ? 0 : signedPrev / denom;
  const hx = px + (cx - px) * u;
  const hz = pz + (cz - pz) * u;
  const along = ((hx - ax) * dx + (hz - az) * dz) / lenSq;
  return along > ARC_WIRE.endMargin && along < 1 - ARC_WIRE.endMargin;
}

function combatKernelOf(registry) {
  if (!registry || typeof registry.get !== 'function') return null;
  const combatSys = registry.get('combat');
  if (combatSys && combatSys.kernel && typeof combatSys.kernel.routeDamage === 'function') return combatSys.kernel;
  const actions = registry.get('actions');
  if (actions && actions.kernel && typeof actions.kernel.routeDamage === 'function') return actions.kernel;
  return null;
}

function applyArcCrossing(state, registry, chord, hull, a, b) {
  const kernel = combatKernelOf(registry);
  if (!kernel || !hull) return false;
  const runtime = ensureCombatant(state, hull, kernel.catalog);
  if (!runtime) return false;
  const burning = runtime.statuses && runtime.statuses[BURNING_STATUS_ID];
  const shield = Math.max(0, Number(hull.shield) || 0);
  const strip = Math.min(ARC_WIRE.shieldStrip, shield);
  // Keep the trap credited to its pinned node; the damage owner handles the shield-only drain.
  const attackerId = chord.ownerId != null ? chord.ownerId : chord.controllerId;
  const statuses = burning ? [] : [{
    id: CRYO_LOCK_STATUS_ID,
    stacks: 1,
    durationTicks: CRYO_LOCK_DURATION_TICKS,
  }];
  let landed = false;
  if (strip > 0 || statuses.length) {
    const ionMult = kernel.catalog.damageModel.shieldMultipliers.ion || 1;
    const ion = strip > 0 ? strip / ionMult : 0;
    const routed = kernel.routeDamage({
      attackerId,
      targetId: hull.id,
      packet: {
        channels: { kinetic: 0, thermal: 0, ion, plasma: 0, phase: 0 },
        penetration: 0,
        shieldBypass: 0,
        heat: 0,
        statuses,
        flags: { ignoreFriendlyFire: true, shieldOnly: true },
      },
      origin: { kind: 'arc_wire', id: WEB_DEF_ID },
    });
    landed = !!(routed && routed.ok);
  }
  if (burning) {
    const shock = resolveThermalShock({
      id: hull.id,
      pos: { x: num(hull.pos && hull.pos.x), z: num(hull.pos && hull.pos.z) },
      vx: num(hull.vel && hull.vel.x),
      vz: num(hull.vel && hull.vel.z),
      statuses: [CRYO_LOCK_STATUS_ID, BURNING_STATUS_ID],
    }, {
      sourcePos: {
        x: (num(a.pos.x) + num(b.pos.x)) * 0.5,
        z: (num(a.pos.z) + num(b.pos.z)) * 0.5,
      },
    });
    if (shock.ok) {
      const stacks = Number.isInteger(burning.stacks) && burning.stacks > 0 ? burning.stacks : 1;
      if (stacks <= 1) kernel.statuses.clear(hull, runtime, BURNING_STATUS_ID, 'thermal_shock');
      else burning.stacks = stacks - 1;
      if (shock.impulse) queuePhysicsImpulse(hull, { x: shock.impulse.x, y: 0, z: shock.impulse.z });
      landed = true;
    }
  }
  return landed;
}
