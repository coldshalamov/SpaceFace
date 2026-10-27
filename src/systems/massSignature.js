// Mass-signature stealth — the ticking half of src/data/massSignature.js (build_map §34
// row 513, expansion bible 08 §5). Sensors read mass and heat inside drawn sweep rings;
// large bodies cast mass shadows; Hush-held cargo, decoy pods and cold coasting hide mass;
// Lantern cysts and Furnace maws hunt the same heat read.
//
// EXP-25 — the pilot is on the same glass:
//   • sig.playerSignature  — the pilot's OWN live signature: what any scale would read
//     (mass incl. the hold, heat, strength, tier 'clutter'|'contact'|'hot'|'massive').
//   • quiet coast          — sit on no thrust for QUIET_SPIN_DOWN_S and the drive idles
//     cold (data.quietCoast, a stamp this system owns); any burn relights it. A light hull
//     drops under the resolve threshold; a barge never does.
//   • sig.playerContact    — the sweep that is painting the pilot: whose edge dwells, how
//     much dwell is banked, and whether a mass shadow is covering them.
//   • the pulse board      — the player's scan:pulse runs the SAME model back: it names the
//     signatures inside its radius (loudest first), marks returns lost in mass shadow,
//     counts rock clutter, and stamps each resolved hull's data.massSignature.
//   • sig.playerHunted     — the heat hunters that have the pilot's heat right now. Cysts
//     and maws hunt it by kind; no stamp is needed for the fauna to come on the glass.
//
// Owns state.massSignature (a serializable readings ledger) and the data stamps it writes:
//   scanner.data.sweepRing      — {origin, radius, edgeAngle, edgePeriodS} for the glass
//   target.data.massSignature   — {resolvedBy, massT, heat, atS} once a scanner resolves it
//   seeker.data.ai.heatTargetId — the heat hunters' shared-model pick
//   player.data.quietCoast      — the running-quiet stamp this system's verb writes
//
// Save/restore: the ledgers are runtime truth — a reseat drops dwell timers and boards
// (cloak's same ruling) rather than letting a rewound clock land a half-banked resolve
// inside its own window. Reads rows and lock rows carry the entity's occupantGeneration
// so a recycled id never inherits a dead hull's signature or lock.
//
// Determinism: reads state.simTime/state.tick/state.input only; no RNG, no wall clock.
// Registration hunks (manifest id 'massSignature', clock TABLE) live with this file's row.

import {
  scannerProfileFor, castsMassShadow, signatureRead, pickHeatSeekerTarget,
  sweepRingFor, SWEEP_SCANNER_PROFILES, signatureOf, signatureTier,
  heatSeekerProfileFor,
} from '../data/massSignature.js';
import { occupantGenerationOf } from '../core/entity.js';

// ── EXP-25 dials ───────────────────────────────────────────────────────────────────────

const QUIET_SPIN_DOWN_S = 3.0;        // no-thrust seconds before the player's drive idles cold
const QUIET_INPUT_EPS = 0.05;         // axis dead-zone for "no thrust input"
const PLAYER_PULSE_DEEP_STRENGTH = 6; // ~300 t of signature carries past the pulse's radius
const PLAYER_PULSE_DEEP_MULT = 1.6;   // a loud hull reports out to 1.6× the pulse radius
const PULSE_REPORT_MAX_CONTACTS = 16; // the board is bounded
const PULSE_REPORT_MAX_SHADOWED = 8;
const PLAYER_LIT_COMMS_GAP_S = 8;     // "edge on you" comms throttle per scanner
const HEAT_WARN_COMMS_GAP_S = 10;     // "tracking your heat" comms throttle per seeker
const MAX_READS_PER_SCANNER = 96;     // hostile-state bound on one scanner's ledger
const MAX_LIT_S = 30;                 // hostile-state bound on a banked dwell stamp
const MAX_QUIET_S = 120;              // hostile-state bound on the quiet-down accumulator

/** The player's pulse reads like a weir's sensor — instant (no dwell), honest mass+heat,
 *  plus the deep band so heavy hulls show up at range. ringRadius comes from the pulse. */
const PLAYER_PULSE_PROFILE = Object.freeze({
  id: 'player_pulse',
  readsMass: true,
  readsHeat: true,
  deepStrengthMin: PLAYER_PULSE_DEEP_STRENGTH,
  deepRangeMult: PLAYER_PULSE_DEEP_MULT,
});

function ensureSignatureState(state) {
  const s = state.massSignature || (state.massSignature = {});
  // Object.create(null): id-keyed ledgers must be prototype-free — a hostile entity id
  // of '__proto__' would otherwise poison lookups through the prototype setter.
  if (!s.scans || typeof s.scans !== 'object') s.scans = Object.create(null);
  if (!s.heatLocks || typeof s.heatLocks !== 'object') s.heatLocks = Object.create(null);
  if (!Number.isFinite(s.playerQuietS) || s.playerQuietS < 0) s.playerQuietS = 0;
  else if (s.playerQuietS > MAX_QUIET_S) s.playerQuietS = MAX_QUIET_S;
  // typeof covers undefined AND junk (a hostile save writes anything); null is the one
  // legal non-object value.
  if (typeof s.playerSignature !== 'object') s.playerSignature = null;
  if (typeof s.playerContact !== 'object') s.playerContact = null;
  if (typeof s.playerReport !== 'object') s.playerReport = null;
  if (typeof s.playerHunted !== 'object') s.playerHunted = null;
  return s;
}

function entityListOf(state) {
  if (Array.isArray(state.entityList)) return state.entityList;
  if (state.entities && typeof state.entities.values === 'function') return [...state.entities.values()];
  return [];
}

function entityById(state, id) {
  if (id == null) return null;
  if (state.entities && typeof state.entities.get === 'function') return state.entities.get(id) || null;
  if (Array.isArray(state.entityList)) return state.entityList.find((e) => e && e.id === id) || null;
  return null;
}

function scannerLabel(scanner, profile) {
  const data = scanner && scanner.data;
  if (data && data.scanLabel) return data.scanLabel;
  return (profile && profile.id) || 'SWEEP';
}

/** Bound one scanner's ledger: resolved rows outlive presence (a shadow hides, it does not
 *  un-resolve), so the cap evicts unresolved rows oldest-first, then resolved oldest-first. */
function capScanReads(scan) {
  const reads = scan && scan.reads;
  if (!reads) return;
  const keys = Object.keys(reads);
  let overflow = keys.length - MAX_READS_PER_SCANNER;
  if (overflow <= 0) return;
  keys.sort((a, b) => (Number(reads[a] && reads[a].t) || 0) - (Number(reads[b] && reads[b].t) || 0));
  for (const id of keys) {
    if (overflow <= 0) break;
    if (reads[id] && reads[id].resolved === true) continue;
    delete reads[id]; delete scan.litS[id]; overflow--;
  }
  for (const id of keys) {
    if (overflow <= 0) break;
    if (!reads[id]) continue;
    delete reads[id]; delete scan.litS[id]; overflow--;
  }
}

export const massSignature = {
  name: 'massSignature',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus || null;
    this.helpers = ctx.helpers || (ctx.helpers = {});
    ensureSignatureState(this.state);
    this.helpers.massSignature = {
      signatureRead,
      signatureOf,
      signatureTier,
      pickHeatSeekerTarget,
      sweepRingFor,
      heatSeekerProfileFor,
      profiles: SWEEP_SCANNER_PROFILES,
    };
    this._unsubs = [];
    this._litCommsAt = Object.create(null);   // scannerId -> last 'edge on you' comms simTime
    this._heatWarnAt = Object.create(null);   // seekerId -> last 'tracking your heat' comms simTime
    this._seekerLockGen = new Map();          // seekerId -> {targetId, gen} — recycled-id guard
    const on = (event, fn) => {
      const off = this.bus && typeof this.bus.on === 'function' && this.bus.on(event, fn);
      if (typeof off === 'function') this._unsubs.push(off);
    };
    // The player's pulse writes the signature board.
    on('scan:pulse', (p) => this._onScanPulse(p));
    // A reseat rewinds the sim clock and can recycle entity ids: half-banked dwell, boards
    // and hunt locks are runtime truth — they heal empty, not wrong (cloak's same ruling).
    on('save:restoring', () => this._healRuntime());
    // Fresh run — same two aliases cloak listens to (public route emits game:new;
    // the boot path re-emits the legacy game:newGame).
    on('game:new', () => this.newGame());
    on('game:newGame', () => this.newGame());
  },

  newGame() {
    this._healRuntime();
  },

  destroy() {
    for (const off of this._unsubs || []) { try { off(); } catch (err) { /* cleanup must not throw */ } }
    this._unsubs = [];
  },

  _healRuntime() {
    const sig = this.state && ensureSignatureState(this.state);
    if (!sig) return;
    for (const id of Object.keys(sig.scans)) {
      const scan = sig.scans[id];
      if (!scan || !scan.litS) continue;
      for (const key of Object.keys(scan.litS)) {
        // Resolved rows keep their earned dwell: re-arming them to a full bank means the
        // read stays resolved while the hull stays detectable — a rewind heals the clock,
        // it never un-names a hull (and it never re-fires the resolve).
        const row = scan.reads && scan.reads[key];
        scan.litS[key] = row && row.resolved === true ? MAX_LIT_S : 0;
      }
    }
    sig.heatLocks = {};
    if (this._seekerLockGen) this._seekerLockGen.clear();
    sig.playerContact = null;
    sig.playerReport = null;
    sig.playerHunted = null;
    sig.playerQuietS = 0;
    // The running-quiet stamp is a transient drive state (like a burn window) — a reseat
    // must not resurrect "engine cold" on a hull whose accumulator just reset.
    const player = entityById(this.state, this.state && this.state.playerId);
    if (player && player.data && player.data.quietCoast === true) player.data.quietCoast = false;
    this._litCommsAt = Object.create(null);
    this._heatWarnAt = Object.create(null);
  },

  update(dt, state) {
    const sig = ensureSignatureState(state);
    const now = Number(state.simTime) || 0;
    const step = Number(dt) > 0 ? Number(dt) : 1 / 60;
    const entities = entityListOf(state);
    const playerId = state.playerId;

    const casters = [];
    const scanners = [];
    const seekers = [];
    for (const e of entities) {
      if (!e || e.alive === false || !e.pos) continue;
      if (castsMassShadow(e)) casters.push(e);
      if (heatSeekerProfileFor(e)) { seekers.push(e); continue; }
      if (scannerProfileFor(e)) scanners.push(e);
    }

    const liveScannerIds = new Set();
    for (const scanner of scanners) {
      const profile = scannerProfileFor(scanner);
      if (!profile) continue;
      liveScannerIds.add(scanner.id);
      const ring = sweepRingFor(scanner, profile, now);
      // The drawn ring: render/UI reads this stamp — a soft ring with a moving edge.
      const data = scanner.data || (scanner.data = {});
      data.sweepRing = {
        origin: { x: ring.origin.x, z: ring.origin.z },
        radius: ring.radius,
        edgeAngle: ring.edgeAngle,
        edgePeriodS: ring.edgePeriodS,
        dwellS: ring.dwellS,
      };

      let scan = sig.scans[scanner.id];
      // Hostile-state guard: a malformed row (string, missing maps) must not kill the tick.
      if (!scan || typeof scan !== 'object'
          || !scan.reads || typeof scan.reads !== 'object'
          || !scan.litS || typeof scan.litS !== 'object') {
        scan = sig.scans[scanner.id] = { reads: Object.create(null), litS: Object.create(null) };
      }
      const reads = scan.reads;
      const litS = scan.litS;
      const seenTargets = new Set();

      for (const target of entities) {
        if (!target || target === scanner || target.alive === false || !target.pos) continue;
        // Only bodies a sensor could possibly resolve: mass-carrying or signature-stamped.
        const tdata = target.data || {};
        const readable = (Number(target.mass) || 0) > 0
          || Number.isFinite(tdata.massT)
          || tdata.signatureHidden === true
          || Number.isFinite(tdata.decoySpoofMassT)
          || tdata.coldCoast === true
          || tdata.quietCoast === true
          || Number.isFinite(tdata.heatSignature);
        if (!readable) continue;

        const read = signatureRead(profile, scanner.pos, target, casters);
        const id = target.id;
        seenTargets.add(id);
        const gen = occupantGenerationOf(target);
        const prev = reads[id] || null;
        // A recycled id never inherits the dead hull's row: the new occupant banks its own
        // dwell and resolves on its own name.
        const staleGen = prev && prev.gen != null && gen != null && prev.gen !== gen;
        if (staleGen) litS[id] = 0;
        const wasResolved = prev && !staleGen && prev.resolved === true;

        // A signature resolves only after the ring's drawn edge has dwelt on the body —
        // the sweep is readable because it takes time, and a fast cross does not name you.
        if (read.detected) litS[id] = Math.min(MAX_LIT_S, Math.max(0, (Number(litS[id]) || 0) + step));
        else litS[id] = 0;
        const resolved = read.detected && litS[id] >= ring.dwellS;

        reads[id] = {
          detected: read.detected,
          resolved,
          massT: read.massT,
          heat: read.heat,
          strength: read.strength,
          reason: read.reason,
          occludedBy: read.occludedBy || null,
          deep: read.deep === true,
          spoofed: read.spoofed === true,
          gen: gen != null ? gen : null,
          t: now,
        };

        if (resolved && !wasResolved) {
          const td = target.data || (target.data = {});
          td.massSignature = { resolvedBy: scanner.id, profile: profile.id, massT: read.massT, heat: read.heat, atS: now };
          this.bus && this.bus.emit('sensors:signatureResolved', {
            scannerId: scanner.id, profile: profile.id, targetId: id,
            massT: read.massT, heat: read.heat, spoofed: read.spoofed === true,
            deep: read.deep === true, t: now,
          });
        } else if (!resolved && wasResolved) {
          this.bus && this.bus.emit('sensors:signatureLost', {
            scannerId: scanner.id, profile: profile.id, targetId: id, reason: read.reason, t: now,
          });
        }
      }

      // Prune targets that left the field; keep resolved stamps so a hull that crosses a
      // shadow and re-emerges still resolves (a shadow hides, it does not un-resolve).
      for (const id of Object.keys(reads)) {
        if (!seenTargets.has(id)) {
          if (reads[id].resolved) continue;
          if (reads[id].detected) {
            this.bus && this.bus.emit('sensors:signatureLost', {
              scannerId: scanner.id, profile: profile.id, targetId: id, reason: 'left_field', t: now,
            });
          }
          delete reads[id];
          delete litS[id];
        }
      }
      capScanReads(scan);
    }

    // Scanners that left the field drop their ledger rows whole.
    for (const id of Object.keys(sig.scans)) {
      if (!liveScannerIds.has(id)) {
        delete sig.scans[id];
        delete this._litCommsAt[id];
      }
    }

    // ── EXP-25: the pilot on the same glass ─────────────────────────────────────────
    this._updatePlayerSignature(step, state, sig, now);
    this._updatePlayerContact(state, sig, scanners, now);

    // Heat hunters: Lantern cysts, Furnace maws — the SAME heat model with a jaw attached.
    // Coasting cold makes them drift to the next hot hull (08 §5).
    const liveSeekerIds = new Set();
    const huntedBy = [];
    let huntedHeat = 0;
    for (const seeker of seekers) {
      liveSeekerIds.add(seeker.id);
      const pick = pickHeatSeekerTarget(seeker, entities, casters);
      const nextTarget = pick ? pick.target.id : null;
      const nextGen = pick ? occupantGenerationOf(pick.target) : null;
      const prevLock = this._seekerLockGen.get(seeker.id) || null;
      const changed = nextTarget !== (prevLock ? prevLock.targetId : (sig.heatLocks[seeker.id] || null))
        || (nextTarget != null && prevLock && prevLock.gen != null && nextGen != null && nextGen !== prevLock.gen);
      const data = seeker.data || (seeker.data = {});
      const ai = data.ai || (data.ai = {});
      ai.heatTargetId = nextTarget;
      if (nextTarget == null) this._seekerLockGen.delete(seeker.id);
      else this._seekerLockGen.set(seeker.id, { targetId: nextTarget, gen: nextGen });
      if (nextTarget === playerId && nextTarget != null) {
        huntedBy.push(seeker.id);
        if (pick && pick.heat > huntedHeat) huntedHeat = pick.heat;
      }
      // Write the ledger EVERY tick — a hostile save row must converge to the live pick,
      // not wedge divergence because the in-memory map disagrees with the ledger.
      sig.heatLocks[seeker.id] = nextTarget;
      if (changed) {
        this.bus && this.bus.emit(nextTarget ? 'sensors:heatLock' : 'sensors:heatLost', {
          seekerId: seeker.id, targetId: nextTarget, heat: pick ? pick.heat : 0, t: now,
        });
        if (nextTarget === playerId && nextTarget != null) this._warnPlayerHunted(seeker, pick, now);
      }
    }
    for (const id of Object.keys(sig.heatLocks)) {
      if (!liveSeekerIds.has(id)) {
        delete sig.heatLocks[id];
        this._seekerLockGen.delete(id);
        delete this._heatWarnAt[id];
      }
    }
    sig.playerHunted = huntedBy.length ? { seekerIds: huntedBy, heat: huntedHeat, t: now } : null;
  },

  // ── EXP-25 halves ──────────────────────────────────────────────────────────────────

  /** The pilot's own signature, read on the same model the scale uses — plus the running-
   *  quiet verb: sit on no thrust for QUIET_SPIN_DOWN_S and the drive idles cold; any burn,
   *  brake, boost or reel relights it instantly. */
  _updatePlayerSignature(step, state, sig, now) {
    const prev = sig.playerSignature || null;
    const player = entityById(state, state.playerId);
    if (!player || player.alive === false || !player.pos) {
      if (prev) sig.playerSignature = null;
      return;
    }
    const inp = (state.input && typeof state.input === 'object') ? state.input : null;
    if (inp) {
      const tether = state.player && state.player.tether;
      const burning = Math.abs(Number(inp.moveX) || 0) > QUIET_INPUT_EPS
        || Math.abs(Number(inp.moveZ) || 0) > QUIET_INPUT_EPS
        || Math.abs(Number(inp.turnIntent) || 0) > QUIET_INPUT_EPS
        || inp.boost === true || inp.brake === true
        || !!(tether && tether.reeling);
      const data = player.data || (player.data = {});
      if (burning) {
        sig.playerQuietS = 0;
        if (data.quietCoast === true) {
          data.quietCoast = false;
          this.bus && this.bus.emit('sensors:quietCoast', { cold: false, t: now });
        }
      } else {
        sig.playerQuietS = Math.min(MAX_QUIET_S, sig.playerQuietS + step);
        if (sig.playerQuietS >= QUIET_SPIN_DOWN_S && data.quietCoast !== true) {
          data.quietCoast = true;
          this.bus && this.bus.emit('sensors:quietCoast', { cold: true, t: now });
        }
      }
    }
    const sg = signatureOf(player);
    const cargoT = Math.max(0, Number(state.player && state.player.cargo && state.player.cargo.usedMass) || 0);
    const tier = signatureTier(sg);
    sig.playerSignature = {
      massT: sg.massT,
      cargoT,
      heat: sg.heat,
      strength: sg.strength,
      tier,
      cold: sg.cold,
      spoofed: sg.spoofed === true,
      t: now,
    };
    if (!prev || prev.tier !== tier || prev.cold !== sg.cold) {
      this.bus && this.bus.emit('sensors:playerSignature', {
        tier, prevTier: prev ? prev.tier : null, massT: sg.massT, heat: sg.heat,
        strength: sg.strength, cold: sg.cold, t: now,
      });
    }
  },

  /** The sweep that is painting the pilot: the scanner with the deepest banked dwell on
   *  them this pass, plus whoever already holds them resolved. Edges emit so a HUD can put
   *  the countdown on the glass before the name lands. */
  _updatePlayerContact(state, sig, scanners, now) {
    const pid = state.playerId;
    const prev = sig.playerContact || null;
    if (pid == null) {
      if (prev) sig.playerContact = null;
      return;
    }
    let litScanner = null;
    let litVal = 0;
    let litRead = null;
    let resolvedBy = null;
    let shadowedBy = null;
    for (const scanner of scanners) {
      const scan = sig.scans[scanner.id];
      if (!scan) continue;
      const read = scan.reads && scan.reads[pid];
      if (!read) continue;
      if (read.resolved === true && resolvedBy == null) resolvedBy = scanner.id;
      if (read.reason === 'mass_shadow' && read.occludedBy != null && shadowedBy == null) {
        shadowedBy = { scannerId: scanner.id, occludedBy: read.occludedBy };
      }
      const lit = Number(scan.litS && scan.litS[pid]) || 0;
      if (lit > litVal) { litVal = lit; litScanner = scanner; litRead = read; }
    }
    const prevLitId = prev ? prev.litScannerId : null;
    if (!litScanner) {
      // Commit the contact state BEFORE the emit — listeners re-enter synchronously and
      // must not see a stale lit-scanner stamp.
      sig.playerContact = (resolvedBy || shadowedBy)
        ? {
            litScannerId: null, profileId: null, scannerLabel: null, litS: 0, dwellS: 0,
            occludedBy: null, resolvedBy, shadowedBy, t: now,
          }
        : null;
      if (prevLitId != null) {
        this.bus && this.bus.emit('sensors:playerUnlit', { scannerId: prevLitId, resolvedBy: resolvedBy || null, t: now });
      }
      return;
    }
    const profile = scannerProfileFor(litScanner) || {};
    const dwellS = Math.max(0.1, Number(profile.dwellS) || 1);
    const label = scannerLabel(litScanner, profile);
    sig.playerContact = {
      litScannerId: litScanner.id,
      profileId: profile.id || null,
      scannerLabel: label,
      litS: litVal,
      dwellS,
      occludedBy: litRead && litRead.occludedBy || null,
      resolvedBy,
      shadowedBy,
      t: now,
    };
    if (prevLitId !== litScanner.id) {
      this.bus && this.bus.emit('sensors:playerLit', {
        scannerId: litScanner.id, profileId: profile.id || null, dwellS, t: now,
      });
      const last = this._litCommsAt[litScanner.id];
      if (last == null || now - last >= PLAYER_LIT_COMMS_GAP_S) {
        this._litCommsAt[litScanner.id] = now;
        this.bus && this.bus.emit('comms:log', {
          from: String(label),
          text: `The ring's edge is on your hull — ${dwellS.toFixed(1)}s to a name.`,
          kind: 'scan',
        });
      }
    }
  },

  /** A heat hunter fixing on the pilot is a sentence, not a statistic — throttle the
   *  wording per seeker so a flickering lock cannot spam the feed. */
  _warnPlayerHunted(seeker, pick, now) {
    const last = this._heatWarnAt[seeker.id];
    if (last != null && now - last < HEAT_WARN_COMMS_GAP_S) return;
    this._heatWarnAt[seeker.id] = now;
    const data = seeker.data || {};
    const label = data.scanLabel || 'A heat hunter';
    this.bus && this.bus.emit('comms:log', {
      from: 'SCOPE',
      text: `${label} is tracking your heat — cut the burn and coast cold to drop it.`,
      kind: 'warning',
    });
  },

  /** The player's own pulse runs the shared model back at the world: it names the
   *  signatures inside its radius loudest-first, marks returns lost in mass shadow (the
   *  honest "something is back there"), counts rock clutter, and stamps the resolved
   *  hulls' data.massSignature — the same stamp a sweep would write. */
  _onScanPulse(payload) {
    const state = this.state;
    if (!state || !payload || payload.source !== 'player-scanner') return;
    const origin = payload.pos;
    if (!origin || !Number.isFinite(origin.x) || !Number.isFinite(origin.z)) return;
    const now = Number(state.simTime) || 0;
    const radius = Math.max(80, Math.min(6000, Number(payload.radius) || 1200));
    const pid = state.playerId;
    const profile = { ...PLAYER_PULSE_PROFILE, ringRadius: radius };
    const entities = entityListOf(state);
    const casters = [];
    for (const e of entities) { if (castsMassShadow(e)) casters.push(e); }
    const deepR = radius * PLAYER_PULSE_DEEP_MULT;
    const contacts = [];
    const shadowed = [];
    let clutter = 0;
    for (const e of entities) {
      if (!e || e.alive === false || !e.pos || e.id === pid) continue;
      const data = e.data || {};
      // Deception phantoms keep the ghost system's reveal law — a phantom's fake mass is
      // not an honest signature read.
      if (data.isGhost === true || data.ghost === true) continue;
      const dx = e.pos.x - origin.x;
      const dz = e.pos.z - origin.z;
      if (dx * dx + dz * dz > deepR * deepR) continue;
      const read = signatureRead(profile, origin, e, casters);
      if (read.reason === 'out_of_ring') continue;
      if (read.reason === 'mass_shadow') {
        if (shadowed.length < PULSE_REPORT_MAX_SHADOWED) {
          shadowed.push({
            id: e.id,
            gen: occupantGenerationOf(e),
            occludedBy: read.occludedBy || null,
            pos: { x: Math.round(e.pos.x), z: Math.round(e.pos.z) },
          });
        }
        continue;
      }
      if (!read.detected) { clutter++; continue; }
      contacts.push({
        id: e.id,
        gen: occupantGenerationOf(e),
        massT: Math.round(read.massT * 10) / 10,
        heat: Math.round(read.heat * 100) / 100,
        strength: Math.round(read.strength * 100) / 100,
        tier: signatureTier(signatureOf(e)),
        deep: read.deep === true,
        spoofed: read.spoofed === true,
        cold: read.cold === true,
        label: data.scanLabel || null,
        pos: { x: Math.round(e.pos.x), z: Math.round(e.pos.z) },
        range: Math.round(Math.hypot(dx, dz)),
      });
    }
    contacts.sort((a, b) => (b.strength - a.strength) || String(a.id).localeCompare(String(b.id)));
    if (contacts.length > PULSE_REPORT_MAX_CONTACTS) contacts.length = PULSE_REPORT_MAX_CONTACTS;
    const sig = ensureSignatureState(state);
    sig.playerReport = {
      scannerId: pid || null,
      atS: now,
      radius,
      contacts,
      shadowed,
      clutter,
    };
    // The pulse names what it resolved — every stamp lands before the report event, so a
    // synchronous listener reading the board sees the same world.
    for (const c of contacts) {
      const e = entityById(state, c.id);
      if (!e || e.alive === false) continue;
      if (c.gen != null && occupantGenerationOf(e) !== c.gen) continue;
      const td = e.data || (e.data = {});
      td.massSignature = { resolvedBy: pid || 'player', profile: 'player_pulse', massT: c.massT, heat: c.heat, atS: now };
    }
    this.bus && this.bus.emit('sensors:signatureReport', {
      scannerId: pid || null,
      contacts: contacts.map((c) => ({ ...c })),
      shadowed: shadowed.map((s) => ({ ...s })),
      clutter,
      t: now,
    });
    const parts = [`${contacts.length} signature${contacts.length === 1 ? '' : 's'} named`];
    const heaviest = contacts[0];
    if (heaviest) {
      parts.push(`heaviest ${Math.round(heaviest.massT)} t${heaviest.tier === 'hot' ? ' burning hot' : ''}${heaviest.spoofed ? ' (forged)' : ''}`);
    }
    if (shadowed.length) parts.push(`${shadowed.length} return${shadowed.length === 1 ? '' : 's'} lost in mass shadow`);
    if (clutter) parts.push(`${clutter} faint return${clutter === 1 ? '' : 's'}`);
    this.bus && this.bus.emit('comms:log', { from: 'SCOPE', text: `Signature board — ${parts.join(' · ')}`, kind: 'scan' });
  },
};

export default massSignature;
