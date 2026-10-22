// Mass-signature stealth — the ticking half of src/data/massSignature.js (build_map §34
// row 513, expansion bible 08 §5). Sensors read mass and heat inside drawn sweep rings;
// large bodies cast mass shadows; Hush-held cargo, decoy pods and cold coasting hide mass;
// Lantern cysts and Furnace maws hunt the same heat read.
//
// Owns state.massSignature (a serializable readings ledger) and the data stamps it writes:
//   scanner.data.sweepRing     — {origin, radius, edgeAngle, edgePeriodS} for the glass
//   target.data.massSignature  — {resolvedBy, massT, heat, atS} once a scanner resolves it
//   seeker.data.ai.heatTargetId — the heat hunters' shared-model pick
//
// Determinism: reads state.simTime/state.tick only; no RNG, no wall clock.
// Registration hunks (manifest id 'massSignature', clock CALENDAR) live with this file's row.

import {
  scannerProfileFor, castsMassShadow, signatureRead, pickHeatSeekerTarget,
  sweepRingFor, SWEEP_SCANNER_PROFILES,
} from '../data/massSignature.js';

function ensureSignatureState(state) {
  const s = state.massSignature || (state.massSignature = {});
  if (!s.scans || typeof s.scans !== 'object') s.scans = {};
  if (!s.heatLocks || typeof s.heatLocks !== 'object') s.heatLocks = {};
  return s;
}

function entityListOf(state) {
  if (Array.isArray(state.entityList)) return state.entityList;
  if (state.entities && typeof state.entities.values === 'function') return [...state.entities.values()];
  return [];
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
      pickHeatSeekerTarget,
      sweepRingFor,
      profiles: SWEEP_SCANNER_PROFILES,
    };
  },

  update(dt, state) {
    const sig = ensureSignatureState(state);
    const now = Number(state.simTime) || 0;
    const step = Number(dt) > 0 ? Number(dt) : 1 / 60;
    const entities = entityListOf(state);

    const casters = [];
    const scanners = [];
    const seekers = [];
    for (const e of entities) {
      if (!e || e.alive === false || !e.pos) continue;
      if (castsMassShadow(e)) casters.push(e);
      const data = e.data || {};
      if (data.heatSeeker === true) { seekers.push(e); continue; }
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

      const scan = sig.scans[scanner.id] || (sig.scans[scanner.id] = { reads: {}, litS: {} });
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
          || Number.isFinite(tdata.heatSignature);
        if (!readable) continue;

        const read = signatureRead(profile, scanner.pos, target, casters);
        const id = target.id;
        seenTargets.add(id);
        const prev = reads[id] || null;
        const wasResolved = prev && prev.resolved === true;

        // A signature resolves only after the ring's drawn edge has dwelt on the body —
        // the sweep is readable because it takes time, and a fast cross does not name you.
        if (read.detected) litS[id] = (Number(litS[id]) || 0) + step;
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
          spoofed: read.spoofed === true,
          t: now,
        };

        if (resolved && !wasResolved) {
          const td = target.data || (target.data = {});
          td.massSignature = { resolvedBy: scanner.id, profile: profile.id, massT: read.massT, heat: read.heat, atS: now };
          this.bus && this.bus.emit('sensors:signatureResolved', {
            scannerId: scanner.id, profile: profile.id, targetId: id,
            massT: read.massT, heat: read.heat, spoofed: read.spoofed === true, t: now,
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
    }

    // Scanners that left the field drop their ledger rows whole.
    for (const id of Object.keys(sig.scans)) {
      if (!liveScannerIds.has(id)) delete sig.scans[id];
    }

    // Heat hunters: Lantern cysts, Furnace maws — the SAME heat model with a jaw attached.
    // Coasting cold makes them drift to the next hot hull (08 §5).
    const liveSeekerIds = new Set();
    for (const seeker of seekers) {
      liveSeekerIds.add(seeker.id);
      const pick = pickHeatSeekerTarget(seeker, entities, casters);
      const prevTarget = sig.heatLocks[seeker.id] || null;
      const nextTarget = pick ? pick.target.id : null;
      const data = seeker.data || (seeker.data = {});
      const ai = data.ai || (data.ai = {});
      ai.heatTargetId = nextTarget;
      if (nextTarget !== prevTarget) {
        sig.heatLocks[seeker.id] = nextTarget;
        this.bus && this.bus.emit(nextTarget ? 'sensors:heatLock' : 'sensors:heatLost', {
          seekerId: seeker.id, targetId: nextTarget, heat: pick ? pick.heat : 0, t: now,
        });
      }
    }
    for (const id of Object.keys(sig.heatLocks)) {
      if (!liveSeekerIds.has(id)) delete sig.heatLocks[id];
    }
  },
};

export default massSignature;
