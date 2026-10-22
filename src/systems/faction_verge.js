// faction_verge.js — W-VERGE (build_map §34.5 row 529, bible 02 §14).
//
// "PRESENT. WITNESS. APPEAL." Done-when:
//   · machine bodies: the row's eight kinds carry bodies (VERGE_MACHINE_BODIES data)
//   · directives land on the glass as one capitalized word (`verge:directive`)
//   · the Appeal (E-30): break a directive and a court convenes at the Appeals
//     Clerk; carry the right object at the right mass into the chamber and the
//     appeal is granted — otherwise the directive holds and a law zone grows
//   · the Sleeping Jury (E-34): twelve dormant jurors; one weighed piece of
//     testimony wakes one juror
//   · the Line-site Class trial: a weighed Measure Engine fragment on your Line
//     records the next Class
//   · machines never destroy: nothing here kills; violations and appeals persist
//
// Deterministic: windows and clocks read simTime; weighing stamps true mass.

import {
  VERGE_MACHINE_BODIES,
  VERGE_DIRECTIVE_WORDS,
  VERGE_APPEAL,
  VERGE_SLEEPING_JURY,
  VERGE_LINE_TRIAL,
  VERGE_BARKS,
} from '../data/factions/vergelayers.js';

const dist2 = (a, b) => { const dx = a.x - b.x, dz = a.z - b.z; return dx * dx + dz * dz; };

/** Fresh serializable Verge record: violations, the court, the jury, law zones, grants. */
export function ensureVergeState(state) {
  if (!state.verge || typeof state.verge !== 'object') {
    state.verge = {
      violations: [], court: null, lawZones: [],
      jurors: Array(VERGE_SLEEPING_JURY.jurorCount).fill(false),
      jurorsAwake: 0, appeals: [], lineClassGrants: 0,
    };
  }
  const v = state.verge;
  if (!Array.isArray(v.violations)) v.violations = [];
  if (v.court === undefined) v.court = null;
  if (!Array.isArray(v.lawZones)) v.lawZones = [];
  if (!Array.isArray(v.jurors) || v.jurors.length !== VERGE_SLEEPING_JURY.jurorCount) {
    v.jurors = Array(VERGE_SLEEPING_JURY.jurorCount).fill(false);
  }
  if (!Number.isFinite(v.jurorsAwake)) v.jurorsAwake = v.jurors.filter(Boolean).length;
  if (!Array.isArray(v.appeals)) v.appeals = [];
  if (!Number.isFinite(v.lineClassGrants)) v.lineClassGrants = 0;
  return v;
}

export const vergeCourt = {
  name: 'vergeCourt',

  init(ctx) {
    this.ctx = ctx; this.state = ctx.state; this.bus = ctx.bus; this.helpers = ctx.helpers;
    ensureVergeState(this.state);
  },

  // ── Directives: one capitalized word on the glass, a window, a verdict ──────────
  _tickDirectives(state) {
    const v = ensureVergeState(state);
    const player = state.entities.get(state.playerId);
    if (!player || player.alive === false) return;
    for (const m of state.entityList) {
      if (!m || m.alive === false || typeof m.data?.vergeDirective !== 'string') continue;
      const d = m.data;
      const radius = Number(d.directiveRadius) || 400;
      const inside = dist2(player.pos, m.pos) <= radius * radius;
      if (inside && !Number.isFinite(d.directiveIssuedAt)) {
        d.directiveIssuedAt = state.simTime;
        const word = VERGE_DIRECTIVE_WORDS[d.vergeDirective] || `${d.vergeDirective}.`;
        this.bus.emit('verge:directive', {
          machineId: m.id, directive: d.vergeDirective, word, tick: state.tick,
        });
        this.bus.emit('comms:log', { text: word, speaker: 'Verge machine' });
      }
      if (!inside && Number.isFinite(d.directiveIssuedAt)) {
        // Left inside the window: the directive was obeyed.
        d.directiveIssuedAt = undefined;
        d.directiveHonored = true;
      }
      // VACATE is the timed directive: still inside past the window is a violation.
      if (inside && d.vergeDirective === 'VACATE' && Number.isFinite(d.directiveIssuedAt)
          && state.simTime >= d.directiveIssuedAt + (Number(d.directiveWindowS) || 8)) {
        d.directiveIssuedAt = undefined;
        this._recordViolation(state, m, player);
      }
    }
  },

  _recordViolation(state, machine, player) {
    const v = ensureVergeState(state);
    v.violations.push({
      directive: machine.data.vergeDirective, machineId: machine.id,
      violatorId: player.id, at: state.simTime,
    });
    player.data.directiveViolated = true;
    this.bus.emit('verge:directiveViolated', {
      directive: machine.data.vergeDirective, machineId: machine.id, tick: state.tick,
    });
    // The court convenes at the nearest living Appeals Clerk.
    const clerk = this._nearestMachine(state, player.pos, 'appeals_clerk');
    if (clerk && !v.court) {
      v.court = { convened: true, clerkId: clerk.id, at: state.simTime };
      this.bus.emit('verge:courtConvened', { clerkId: clerk.id, tick: state.tick });
      this.bus.emit('comms:log', { text: VERGE_BARKS.appealHeard, speaker: 'Appeals Clerk' });
    }
  },

  _nearestMachine(state, pos, kind) {
    let best = null, bestD = Infinity;
    for (const e of state.entityList) {
      if (!e || e.alive === false || e.data?.machineKind !== kind) continue;
      const d = dist2(e.pos, pos);
      if (d < bestD) { bestD = d; best = e; }
    }
    return best;
  },

  // ── Measure Engines weigh everything: true mass is the only testimony ──────────
  _tickMeasureEngines(state) {
    for (const m of state.entityList) {
      if (!m || m.alive === false || m.data?.machineKind !== 'measure') continue;
      const readR = Number(m.data.readR) || 500;
      for (const e of state.entityList) {
        if (!e || e.alive === false || e.id === m.id) continue;
        if (e.data?.machineKind) continue; // machines do not weigh machines
        if (e.data?.weighedBy === m.id) continue;
        if (dist2(e.pos, m.pos) > readR * readR) continue;
        e.data = e.data || {};
        e.data.weighedMass = e.mass;
        e.data.weighedBy = m.id;
        e.data.weighedAt = state.simTime;
        this.bus.emit('verge:massWeighed', {
          engineId: m.id, entityId: e.id, mass: e.mass, tick: state.tick,
        });
        this.bus.emit('comms:log', { text: VERGE_BARKS.massCorrect, speaker: 'Measure Engine' });
      }
    }
  },

  // ── E-30: the Appeal — weighed evidence in the Exception Chamber ───────────────
  _tickAppeal(state) {
    const v = ensureVergeState(state);
    if (!v.court || v.court.convened !== true) return;
    const clerk = state.entities.get(v.court.clerkId);
    if (!clerk || clerk.alive === false) return;
    const player = state.entities.get(state.playerId);
    if (!player) return;
    const chamberR2 = VERGE_APPEAL.chamberRadius ** 2;
    if (dist2(player.pos, clerk.pos) > chamberR2) return; // you must stand in the chamber
    for (const e of state.entityList) {
      if (!e || e.alive === false || e.data?.evidence !== true) continue;
      if (Number.isFinite(e.data.judgedAt)) continue;
      if (dist2(e.pos, clerk.pos) > chamberR2) continue;
      e.data.judgedAt = state.simTime;
      const diff = Math.abs(e.mass - VERGE_APPEAL.evidenceMass);
      if (diff <= VERGE_APPEAL.evidenceMassTolerance) {
        v.violations.shift(); // the oldest charge is struck
        v.appeals.push({ result: 'granted', evidenceId: e.id, at: state.simTime });
        v.court = null;
        player.data.directiveViolated = false;
        this.bus.emit('verge:appealGranted', {
          clerkId: clerk.id, evidenceId: e.id, mass: e.mass, tick: state.tick,
        });
        this.bus.emit('comms:log', { text: VERGE_BARKS.massCorrect, speaker: 'Appeals Clerk' });
      } else {
        v.appeals.push({ result: 'denied', evidenceId: e.id, mass: e.mass, at: state.simTime });
        v.lawZones.push({
          x: clerk.pos.x, z: clerk.pos.z, r: VERGE_APPEAL.lawZoneRadius, at: state.simTime,
        });
        this.bus.emit('verge:appealDenied', {
          clerkId: clerk.id, evidenceId: e.id, mass: e.mass,
          wanted: VERGE_APPEAL.evidenceMass, tick: state.tick,
        });
        this.bus.emit('comms:log', { text: VERGE_BARKS.massIncorrect, speaker: 'Appeals Clerk' });
      }
      return; // the court weighs one object per beat
    }
  },

  // ── E-34: the Sleeping Jury — one weighed testimony per juror ──────────────────
  _tickJury(state) {
    const v = ensureVergeState(state);
    for (const jury of state.entityList) {
      if (!jury || jury.alive === false || jury.data?.machineKind !== 'sleeping_jury') continue;
      const r2 = VERGE_SLEEPING_JURY.testimonyRadius ** 2;
      for (const e of state.entityList) {
        if (!e || e.alive === false || e.data?.testimony !== true) continue;
        if (e.data.testimonyConsumed === true) continue;
        if (VERGE_SLEEPING_JURY.requiresWeighedObject && !Number.isFinite(e.data.weighedMass)) continue;
        if (dist2(e.pos, jury.pos) > r2) continue;
        const seat = v.jurors.indexOf(false);
        if (seat < 0) break; // all twelve are awake
        v.jurors[seat] = true;
        v.jurorsAwake += 1;
        e.data.testimonyConsumed = true;
        e.data.testimonyFor = jury.id;
        this.bus.emit('verge:jurorWoke', {
          juryId: jury.id, juror: seat, awake: v.jurorsAwake, tick: state.tick,
        });
        this.bus.emit('comms:log', { text: VERGE_SLEEPING_JURY.wakeLine, speaker: 'Sleeping Jury' });
      }
    }
  },

  // ── The Line-site Class trial: a weighed Measure fragment records a Class ───────
  _tickLineTrial(state) {
    const v = ensureVergeState(state);
    const player = state.entities.get(state.playerId);
    if (!player) return;
    const tether = player.tether || state.player?.tether;
    const held = tether && tether.active ? state.entities.get(tether.targetId) : null;
    if (!held || held.alive === false) return;
    const hd = held.data || {};
    if (hd.typeId !== VERGE_LINE_TRIAL.fragmentTypeId) return;
    if (!Number.isFinite(hd.weighedMass)) return; // the engine must have weighed it first
    if (hd.trialConsumed === true) return;
    hd.trialConsumed = true;
    v.lineClassGrants += VERGE_LINE_TRIAL.trialClassStep;
    this.bus.emit('verge:lineTrialPassed', {
      holderId: player.id, fragmentId: held.id,
      grant: VERGE_LINE_TRIAL.trialClassStep, tick: state.tick,
    });
    this.bus.emit('comms:log', { text: VERGE_LINE_TRIAL.trialLine, speaker: 'Measure Engine' });
  },

  update(dt, state) {
    ensureVergeState(state);
    this._tickDirectives(state);
    this._tickMeasureEngines(state);
    this._tickAppeal(state);
    this._tickJury(state);
    this._tickLineTrial(state);
  },
};

export { VERGE_MACHINE_BODIES };
export default vergeCourt;
