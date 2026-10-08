// HOOK-LEFT owns the fin, the suit, the lane buoy, and (after a cut) the backup bladder.
// state.ruud only. Movement is an impulse the physics authority consumes. The filing
// does not fine, bounty, board, follow, or touch the player's stick.
import { RUUD as C, RUUD_LINES, freshRuudMemory, normalizeRuudMemory, ruudGlobal } from '../data/ruud.js';
import { globalToSectorLocalForSector } from '../data/sectorCoordinates.js';
import { queuePhysicsImpulse } from '../core/physicsAuthority.js';
import { deferSectorEnterMaterialization } from '../core/sectorEnterDefer.js';

const PARTS = ['fin', 'suit', 'buoy', 'bladder'];
const HUNG = ['fin', 'suit', 'buoy'];
const finiteXZ = p => p && Number.isFinite(p.x) && Number.isFinite(p.z);
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const belongs = e => e?.data?.ruud === true;
const partOf = e => belongs(e) && PARTS.includes(e.data.ruudPart) ? e.data.ruudPart : '';

const LABELS = {
  fin: {
    unchosen: 'Fin-3 · cold face · ROTATION COMPLETE 04:10',
    spared: 'Fin-3 · cold face · ROTATION COMPLETE 04:10',
    cut: '14-K · Fin-3 · scrap serial',
  },
  suit: {
    unchosen: 'HOOK-LEFT · plate Ruud · plumbed to Fin-3',
    spared: 'HOOK-LEFT · plate Ruud · plumbed to Fin-3',
    cut: 'HOOK-LEFT · backup bladder · no charge filed',
  },
  buoy: {
    unchosen: 'Lane buoy · berth plate · two bars',
    spared: 'Lane buoy · berth plate · complete',
    cut: 'Lane buoy · berth plate · two bars',
  },
  bladder: {
    unchosen: 'Backup bladder',
    spared: 'Backup bladder',
    cut: 'Backup bladder · no charge filed',
  },
};

const NAMES = { fin: 'Fin-3', suit: 'HOOK-LEFT', buoy: 'Lane buoy', bladder: 'Backup bladder' };

function specFor(part) {
  if (part === 'fin') return { radius: C.finRadius, mass: C.finMass, damping: 0.2, tether: false, invuln: false };
  if (part === 'suit') return { radius: C.suitRadius, mass: C.suitMass, damping: 0.08, tether: true, invuln: false };
  if (part === 'buoy') return { radius: C.buoyRadius, mass: C.buoyMass, damping: 3.2, tether: false, invuln: true };
  return { radius: C.bladderRadius, mass: C.bladderMass, damping: 1.4, tether: false, invuln: true };
}

export const RUUD_GLOBAL_ANCHOR = Object.freeze(ruudGlobal(C.fin));

export function ruudEntitySpec(memory = freshRuudMemory(), part = 'fin') {
  if (!PARTS.includes(part)) throw new RangeError('Ruud part');
  const m = memory || freshRuudMemory();
  const record = part === 'bladder' ? m.bladder : m.bodies[part];
  const spec = specFor(part);
  const tether = part === 'fin' ? m.disposition === 'cut' : spec.tether;
  const global = ruudGlobal(record);
  const disposition = m.disposition;
  return {
    type: 'drone', team: 2, factionId: null, name: NAMES[part],
    pos: { x: global.x, z: global.z }, vel: { x: record.vx, z: record.vz }, rot: record.rot, angVel: record.angVel,
    mass: spec.mass, radius: spec.radius, hull: record.hull, hullMax: C.hull, collides: true,
    flags: { invuln: spec.invuln },
    physicsBody: {
      dynamic: true, shape: 'ball', radius: spec.radius, mass: spec.mass, useMeasuredSkin: false,
      material: 'debris', ccd: true,
      contact: { friction: 0.4, restitution: 0.04, linearDamping: spec.damping, angularDamping: Math.min(2.4, spec.damping + 0.4) },
    },
    data: {
      ruud: true, ruudPart: part, authoredCharacter: C.id, persistenceOwner: 'ruud',
      identityKey: `${C.id}:${part}`, callsign: C.callsign, homeSectorId: C.sectorId,
      ai: { passive: true }, masslineTetherable: tether, scannerSignalKind: 'anomaly',
      scanLabel: LABELS[part][disposition] || LABELS[part].unchosen,
      visualRadius: part === 'fin' ? 34 : part === 'buoy' ? 22 : part === 'suit' ? 16 : 9,
      ruudPose: initialPose(m, part),
    },
  };
}

function poseOf(memory, now) {
  const d = memory?.disposition || 'unchosen';
  return {
    simTime: now,
    hatch: d === 'spared' ? 1 : 0,
    chain: d === 'unchosen' ? 1 : 0,
    clipped: d === 'unchosen' ? 1 : 0,
    plateOpen: d === 'spared' ? 1 : 0,
    sheared: d === 'cut' ? 1 : 0,
    moored: d === 'spared' ? 1 : 0,
    seated: d === 'cut' ? 1 : 0,
    hours: C.hours,
    linkX: 0,
    linkZ: 0,
    linkLen: 0,
  };
}

/** Center-to-center lead. `span` hides once the cooled tether has paid out; `lead` keeps a short clip. */
export function ruudLink(from, to, inset = 0, limit = Infinity, mode = 'span') {
  if (!finiteXZ(from) || !finiteXZ(to) || !Number.isFinite(inset) || inset < 0) return { linkX: 0, linkZ: 0, linkLen: 0 };
  const x = to.x - from.x;
  const z = to.z - from.z;
  const len = Math.hypot(x, z);
  let reach = len - inset;
  if (reach <= 0.15) return { linkX: 0, linkZ: 0, linkLen: 0 };
  if (mode === 'span' && reach > limit) return { linkX: 0, linkZ: 0, linkLen: 0 };
  if (mode === 'lead') reach = Math.min(reach, limit);
  return { linkX: x / len, linkZ: z / len, linkLen: reach };
}

function initialPose(memory, part) {
  const pose = poseOf(memory, 0);
  if (part !== 'suit') return pose;
  const suit = ruudGlobal(memory.bodies.suit);
  if (memory.disposition === 'unchosen') {
    return { ...pose, ...ruudLink(suit, ruudGlobal(memory.bodies.fin), C.coldInset, C.towSlack, 'span') };
  }
  if (memory.disposition === 'spared') {
    return { ...pose, ...ruudLink(suit, ruudGlobal(memory.bodies.buoy), 1.2, 3.8, 'lead') };
  }
  return { ...pose, ...ruudLink(suit, ruudGlobal(memory.bladder), 1.1, 3.6, 'lead') };
}

/** Bounded acceleration toward a point. The solver is the only writer of motion. */
export function ruudSteering(pos, vel, target, limit = C.returnAcceleration) {
  if (!finiteXZ(pos) || !finiteXZ(vel) || !finiteXZ(target) || !Number.isFinite(limit) || limit <= 0) return null;
  let x = (target.x - pos.x) * 0.12 - vel.x * 0.82;
  let z = (target.z - pos.z) * 0.12 - vel.z * 0.82;
  const length = Math.hypot(x, z);
  if (length > limit) { x *= limit / length; z *= limit / length; }
  return { x, z };
}

export function createRuud() {
  return {
    name: 'ruud',
    init(ctx) {
      this.destroy();
      this.state = ctx.state;
      this.bus = ctx.bus;
      this.helpers = ctx.helpers || {};
      this.state.ruud = normalizeRuudMemory(this.state.ruud);
      this._reset();
      this._unsubs = [];
      const on = (name, fn) => { const off = this.bus?.on(name, fn); if (typeof off === 'function') this._unsubs.push(off); };
      on('scan:pulse', p => this._scan(p));
      on('tether:latched', p => this._latch(p));
      on('tether:released', p => this._endLine(p));
      on('tether:cut', p => this._endLine(p));
      on('tether:broken', () => { this._held = null; });
      on('physics:impact', p => this._impact(p));
      on('combat:damage', p => this._damage(p));
      on('entity:killed', p => this._killed(p));
      on('sector:exit', () => { this._capture(); this._clear(); this._reset(); });
      on('sector:enter', (p) => {
        this._capture(); this._reset();
        if (deferSectorEnterMaterialization(this.state, p, this._cookProvider)) return;
        this._sync();
      });
      const providers = this.helpers.sectorCookProviders || (this.helpers.sectorCookProviders = []);
      this._cookProvider = () => this._syncSteps();
      providers.push(this._cookProvider);
      on('save:restoring', () => { this._clear(); this._reset(); });
      on('save:loaded', () => { this._reset(); this._sync(); });
      on('game:newGame', () => this.newGame());
    },
    _reset() {
      this._id = { fin: null, suit: null, buoy: null, bladder: null };
      this._nextSync = 0; this._scanSeq = 0; this._scanSource = null; this._held = null;
      this._lastVoice = -100; this._inside = false; this._discovered = false; this._hoursSaid = false;
      this._hatchSaid = false; this._buoySaid = false; this._memorialSaid = false; this._separated = false;
      this._nextTick = 0; this._nextHiss = 1.1;
    },
    _get(id) { const e = this.state?.entities?.get(id); return e?.alive && belongs(e) ? e : null; },
    _player() { return this.state?.entities?.get(this.state.playerId); },
    _home() {
      const kind = this.state?.run?.kind;
      return (!kind || kind === 'adventure' || kind === 'campaign')
        && this.state?.world?.currentSectorId === C.sectorId;
    },
    _live() {
      const p = this._player();
      return this._home() && this.state.mode === 'flight' && this.state.timeScale > 0
        && p?.alive && !p.flags?.docked && finiteXZ(p.pos);
    },
    _clear() {
      for (const e of this.state?.entityList || []) if (e?.alive && belongs(e)) this.helpers?.removeEntity?.(e.id);
      this._id = { fin: null, suit: null, buoy: null, bladder: null };
    },
    _record(part) {
      const m = this.state.ruud;
      return part === 'bladder' ? m.bladder : m.bodies[part];
    },
    _capture() {
      if (!this.state?.ruud) return;
      const m = this.state.ruud;
      if (m.disposition === 'unchosen') {
        for (const part of HUNG) {
          const b = m.bodies[part];
          const live = this._get(this._id[part]);
          b.x = C[part].x; b.z = C[part].z; b.vx = 0; b.vz = 0; b.angVel = 0;
          b.rot = live && Number.isFinite(live.rot) ? live.rot : 0;
          b.hull = live && Number.isFinite(live.hull) ? Math.max(1, Math.min(C.hull, live.hull)) : C.hull;
        }
        m.bladder.present = false;
        m.plateId = '';
        m.hours = C.hours;
        return;
      }
      const write = (part) => {
        const e = this._get(this._id[part]);
        const b = this._record(part);
        if (!e || !finiteXZ(e.pos) || !finiteXZ(e.vel)) return;
        const local = globalToSectorLocalForSector(e.pos, C.sectorId);
        b.x = local.x; b.z = local.z; b.vx = e.vel.x; b.vz = e.vel.z;
        b.rot = Number.isFinite(e.rot) ? e.rot : 0;
        b.angVel = Number.isFinite(e.angVel) ? e.angVel : 0;
        b.hull = Math.max(1, Math.min(C.hull, Number.isFinite(e.hull) ? e.hull : b.hull));
      };
      for (const part of HUNG) write(part);
      if (m.bladder.present) write('bladder');
      m.hours = C.hours;
    },
    _sync() { for (const _ of this._syncSteps()) { /* inline drain */ } },
    *_syncSteps() {
      if (!this._home()) { this._capture(); this._clear(); return; }
      const m = this.state.ruud;
      const found = { fin: null, suit: null, buoy: null, bladder: null };
      for (const e of (this.state.entityList || []).slice()) {
        yield;
        if (!e?.alive || !belongs(e)) continue;
        const part = partOf(e);
        if (!part || found[part] || (part === 'bladder' && !m.bladder.present)) {
          this.helpers.removeEntity?.(e.id); continue;
        }
        found[part] = e;
      }
      for (const part of PARTS) {
        yield;
        if (part === 'bladder' && !m.bladder.present) continue;
        if (!found[part]) {
          for (const e of this.state.entityList || []) {
            if (e?.alive && belongs(e) && e.data.ruudPart === part) { found[part] = e; break; }
          }
        }
        if (!found[part] && this.helpers.spawnEntity) found[part] = this.helpers.spawnEntity(ruudEntitySpec(m, part));
        const e = found[part];
        if (e) this._dress(e, m);
      }
      for (const part of PARTS) this._id[part] = found[part]?.id ?? null;
    },
    _dress(e, m = this.state.ruud) {
      const part = e.data.ruudPart;
      const d = m.disposition;
      e.data.scanLabel = LABELS[part][d] || LABELS[part].unchosen;
      e.data.scannerSignalKind = 'anomaly';
      e.data.masslineTetherable = part === 'suit' || (part === 'fin' && d === 'cut');
      e.data.ai = e.data.ai || {};
      e.data.ai.passive = true;
      if (e.data.ai.retaliationTargetId != null) delete e.data.ai.retaliationTargetId;
      if (e.data.combat) e.data.combat.targetId = null;
      e.team = 2;
      e.factionId = null;
      if (part === 'buoy' || part === 'bladder') e.flags.invuln = true;
      if (Number.isFinite(e.hull) && e.hull < 1) e.hull = 1;
    },
    newGame() { this._clear(); this.state.ruud = freshRuudMemory(); this._reset(); },
    serialize() { this._capture(); return normalizeRuudMemory(this.state.ruud); },
    deserialize(raw) { this._clear(); this.state.ruud = normalizeRuudMemory(raw); this._reset(); },
    destroy() {
      for (const off of this._unsubs || []) off();
      this._unsubs = [];
      const providers = this.helpers && this.helpers.sectorCookProviders;
      if (Array.isArray(providers) && this._cookProvider) {
        const index = providers.indexOf(this._cookProvider);
        if (index >= 0) providers.splice(index, 1);
      }
      this._cookProvider = null;
      this._clear();
    },
    _say(key, force = false) {
      const now = this.state?.simTime || 0;
      if (!force && now - this._lastVoice < C.voiceCooldown) return;
      const text = RUUD_LINES[key];
      if (!text) return;
      this._lastVoice = now;
      if (this.helpers.voice?.say) this.helpers.voice.say({ id: `ruud:${key}`, priority: force ? 58 : 24, channel: 'comms', text, ttl: 9 });
      else this.bus?.emit('toast', { text, kind: 'info', ttl: 9 });
      this.bus?.emit('ruud:voice', { from: C.callsign, key, text });
    },
    _scan(p) {
      if (!this._live()) return;
      const player = this._player();
      const suit = this._get(this._id.suit);
      if (!suit || !p || p.source !== 'player-scanner' || p.scannerId !== player.id
        || !Number.isSafeInteger(p.seq) || p.seq < 1 || !finiteXZ(p.pos) || dist(p.pos, player.pos) > 2
        || !Number.isFinite(p.radius) || p.radius <= 0) return;
      if (this._scanSource === player && p.seq <= this._scanSeq) return;
      this._scanSource = player;
      this._scanSeq = p.seq;
      if (dist(player.pos, suit.pos) > Math.min(C.scanRadius, p.radius)) return;
      const m = this.state.ruud;
      if (!m.met) { m.met = true; this._say('hello', true); return; }
      if (!this._hoursSaid) { this._hoursSaid = true; this._say('hours', true); return; }
      if (m.disposition === 'spared' && !this._hatchSaid) { this._hatchSaid = true; this._say('hatch', true); return; }
      if (m.disposition === 'spared' && !this._buoySaid) { this._buoySaid = true; this._say('buoy', true); return; }
      if (m.disposition === 'cut') this._say('memorial');
    },
    _latch(p) {
      if (!this._live()) return;
      const e = this._get(p?.targetId);
      if (!e || e.data.ruudPart !== 'suit') { this._held = null; return; }
      this._held = e.id;
      this._say('towing');
    },
    _endLine(p) {
      if (!this._live()) return;
      const suit = this._get(this._id.suit);
      if (!suit || p?.targetId !== suit.id) return;
      this._held = null;
      const m = this.state.ruud;
      if (m.disposition !== 'unchosen') return;
      if (this._inSpareZone(suit)) this._spare();
      else this._say('ignore');
    },
    _inSpareZone(suit) {
      const buoy = this._get(this._id.buoy);
      if (!buoy || !finiteXZ(suit?.pos)) return false;
      return dist(suit.pos, buoy.pos) <= C.spareBuoy + 1e-6
        && dist(suit.pos, RUUD_GLOBAL_ANCHOR) >= C.spareFin - 1e-6;
    },
    _applyPose() {
      const m = this.state.ruud;
      const now = this.state?.simTime || 0;
      const base = poseOf(m, now);
      const suit = this._get(this._id.suit);
      const fin = this._get(this._id.fin);
      const buoy = this._get(this._id.buoy);
      const bladder = this._get(this._id.bladder);
      const suitPose = { ...base };
      if (suit && finiteXZ(suit.pos)) {
        if (m.disposition === 'unchosen' && fin && finiteXZ(fin.pos)) {
          Object.assign(suitPose, ruudLink(suit.pos, fin.pos, C.coldInset, C.towSlack, 'span'));
        } else if (m.disposition === 'spared' && buoy && finiteXZ(buoy.pos)) {
          Object.assign(suitPose, ruudLink(suit.pos, buoy.pos, 1.2, 3.8, 'lead'));
        } else if (m.disposition === 'cut' && bladder && finiteXZ(bladder.pos)) {
          Object.assign(suitPose, ruudLink(suit.pos, bladder.pos, 1.1, 3.6, 'lead'));
        }
      }
      if (suit) suit.data.ruudPose = suitPose;
      if (fin) fin.data.ruudPose = { ...base };
      if (buoy) buoy.data.ruudPose = { ...base };
      if (bladder) bladder.data.ruudPose = { ...base };
    },
    _plate() {
      const player = this._player();
      const raw = player?.data?.identityKey || player?.data?.callsign || player?.name || this.state.playerId;
      if (raw == null) return '';
      const text = String(raw);
      return text.length > 64 ? text.slice(0, 64) : text;
    },
    _spare() {
      const m = this.state.ruud;
      if (m.disposition !== 'unchosen') return;
      m.disposition = 'spared';
      m.plateId = this._plate();
      m.hours = C.hours;
      const suit = this._get(this._id.suit);
      if (suit) this._dress(suit, m);
      for (const part of HUNG) { const e = this._get(this._id[part]); if (e) this._dress(e, m); }
      this._applyPose();
      this._say('spared', true);
      this.bus?.emit('ruud:spared', { plateId: m.plateId });
    },
    _cut() {
      const m = this.state.ruud;
      if (m.disposition !== 'unchosen') return;
      m.disposition = 'cut';
      m.plateId = '';
      m.hours = C.hours;
      const suit = this._get(this._id.suit);
      const fin = this._get(this._id.fin);
      if (!m.bladder.present) {
        const origin = suit && finiteXZ(suit.pos) ? suit.pos : ruudGlobal(C.suit);
        const local = globalToSectorLocalForSector({ x: origin.x + C.bladderOffset.x, z: origin.z + C.bladderOffset.z }, C.sectorId);
        m.bladder.present = true;
        m.bladder.x = local.x; m.bladder.z = local.z; m.bladder.vx = 0; m.bladder.vz = 0; m.bladder.angVel = 0; m.bladder.hull = C.hull;
      }
      if (fin && suit && !this._separated) {
        let x = fin.pos.x - suit.pos.x, z = fin.pos.z - suit.pos.z;
        const length = Math.hypot(x, z) || 1;
        x /= length; z /= length;
        queuePhysicsImpulse(fin, { x: x * fin.mass * 6, y: 0, z: z * fin.mass * 6 });
        this._separated = true;
      }
      this._sync();
      for (const part of PARTS) { const e = this._get(this._id[part]); if (e) this._dress(e, m); }
      this._applyPose();
      this._say('cut', true);
      this.bus?.emit('ruud:cut', { serial: '14-K' });
    },
    _floor(e) {
      if (!e) return;
      e.hull = Math.max(1, Number.isFinite(e.hull) ? e.hull : 1);
      e.alive = true;
      this._dress(e);
    },
    _damage(p) {
      if (!p) return;
      const e = this._get(p.targetId);
      if (!e) return;
      this._floor(e);
      const part = e.data.ruudPart;
      if (part !== 'suit' && part !== 'fin') return;
      const playerHit = p.attackerId === this.state.playerId && (p.applied ?? 0) > 0;
      if (!playerHit) return;
      if (this.state.ruud.disposition === 'unchosen') this._cut();
      else this._say('weapon');
    },
    _impact(p) {
      if (!this._live() || !p) return;
      const playerId = this.state.playerId;
      const playerIn = p.aId === playerId || p.bId === playerId;
      if (!playerIn) return;
      if (!Number.isFinite(p.preSolveClosingSpeed) || p.preSolveClosingSpeed < C.cutSpeed) return;
      const otherId = p.aId === playerId ? p.bId : p.aId;
      const e = this._get(otherId);
      if (!e || (e.data.ruudPart !== 'suit' && e.data.ruudPart !== 'fin')) return;
      this._floor(e);
      if (this.state.ruud.disposition === 'unchosen') this._cut();
    },
    _killed(p) {
      const id = p?.id;
      if (id == null) return;
      let part = '';
      for (const name of PARTS) if (this._id[name] === id) part = name;
      const e = this.state?.entities?.get(id);
      if (!part && belongs(e)) part = partOf(e);
      if (!part) return;
      if (e) e.alive = false;
      this._id[part] = null;
      const rec = this._record(part);
      if (rec) rec.hull = Math.max(1, rec.hull || 1);
      if ((part === 'suit' || part === 'fin') && this.state.ruud.disposition === 'unchosen') this._cut();
      else this._sync();
    },
    _tethered(id) {
      return this._held === id || (this.state.player?.tether?.active && this.state.player.tether.targetId === id);
    },
    _steer(e, target, dt, limit) {
      if (!e || this._tethered(e.id)) return;
      const force = ruudSteering(e.pos, e.vel, target, limit);
      if (force && force.x * force.x + force.z * force.z > 0.0004) {
        queuePhysicsImpulse(e, { x: force.x * e.mass * dt, y: 0, z: force.z * e.mass * dt });
      }
    },
    _rest(part) { return ruudGlobal(C[part]); },
    update(dt, state = this.state) {
      if (!Number.isFinite(dt) || dt <= 0 || dt > 0.1 || state !== this.state || !this.state?.ruud) return;
      if (!this._home()) { this._capture(); this._clear(); this._reset(); return; }
      if (!this._live()) { this._held = null; return; }
      const now = state.simTime || 0;
      if (now >= this._nextSync) { this._sync(); this._nextSync = now + 1; }
      const player = this._player();
      const m = state.ruud;
      const suit = this._get(this._id.suit);
      const fin = this._get(this._id.fin);
      const buoy = this._get(this._id.buoy);
      const bladder = this._get(this._id.bladder);
      if (suit && finiteXZ(player.pos)) {
        const distance = dist(player.pos, suit.pos);
        if (distance < C.discoverRadius && !this._discovered) {
          this._discovered = true;
          if (!m.met) this._say('discover');
        }
        if (distance < C.scanRadius && !this._inside) {
          this._inside = true;
          m.visits = Math.min(1e6, m.visits + 1);
          if (m.disposition === 'cut' && !this._memorialSaid) { this._memorialSaid = true; this._say('memorial'); }
        } else if (distance > C.discoverRadius + 80) {
          if (this._inside && m.disposition === 'unchosen' && m.met) this._say('ignore');
          this._inside = false;
        }
        if (distance <= C.hearRadius) {
          if (m.disposition === 'unchosen' && now >= this._nextTick) {
            this._nextTick = now + C.tickEvery;
            this.bus?.emit('audio:cue', { id: 'sfx_ruud_tick', position: { x: suit.pos.x, z: suit.pos.z }, gain: 0.22, rate: 1 });
          }
          if (now >= this._nextHiss) {
            this._nextHiss = now + C.hissEvery;
            this.bus?.emit('audio:cue', { id: 'sfx_ruud_hiss', position: { x: suit.pos.x, z: suit.pos.z }, gain: 0.18, rate: 1 });
          }
        }
      }
      if (this._held && !this._get(this._held)) this._held = null;
      if (m.disposition === 'unchosen') {
        if (fin) this._steer(fin, this._rest('fin'), dt, 4);
        if (suit) this._steer(suit, this._rest('suit'), dt, C.returnAcceleration);
        if (buoy) this._steer(buoy, this._rest('buoy'), dt, 1.2);
      } else if (m.disposition === 'spared') {
        if (fin) this._steer(fin, this._rest('fin'), dt, 4);
        if (buoy) this._steer(buoy, this._rest('buoy'), dt, 1.2);
        if (suit && buoy) {
          const awayX = buoy.pos.x - RUUD_GLOBAL_ANCHOR.x;
          const awayZ = buoy.pos.z - RUUD_GLOBAL_ANCHOR.z;
          const length = Math.hypot(awayX, awayZ) || 1;
          this._steer(suit, { x: buoy.pos.x + (awayX / length) * 11, z: buoy.pos.z + (awayZ / length) * 11 }, dt, 5);
        }
      } else {
        if (buoy) this._steer(buoy, this._rest('buoy'), dt, 1.2);
        if (suit && bladder && finiteXZ(bladder.pos)) {
          let x = bladder.pos.x - RUUD_GLOBAL_ANCHOR.x;
          let z = bladder.pos.z - RUUD_GLOBAL_ANCHOR.z;
          const span = Math.hypot(x, z) || 1;
          x /= span; z /= span;
          this._steer(suit, { x: bladder.pos.x + x * 4.8, z: bladder.pos.z + z * 4.8 }, dt, 5);
        }
      }
      this._applyPose();
      this._capture();
    },
  };
}

export const ruud = createRuud();
