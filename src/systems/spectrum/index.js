// Spectrum system. Listens to the scanner's existing scan:pulse and to the
// investigation verbs the prompt deck already emits. It does not register
// itself, does not pay research grants, and does not plot a course to a fix
// the player has not earned. See src/data/spectrum/ADAPTER.md.

import {
  applyBrake,
  applyFocus,
  applyMeasure,
  applyTow,
  createSpectrumModel,
  hydrateSpectrum,
  publicSpectrum,
  serializeSpectrum,
} from './model.js';
import { SPECTRUM_PLACEMENTS } from '../../data/spectrum/placements.js';
import { sectorLocalToGlobalForSector } from '../../data/sectorCoordinates.js';
import { bindSpectrumWorld, materializeSpectrum, refreshSpectrumBodies, driveSpectrumBodies, captureSpectrumBodies, clearSpectrumBodies } from './live.js';

function playerOf(state) {
  if (!state || !state.entities || !state.playerId) return null;
  try { return state.entities.get(state.playerId) || null; }
  catch { return null; }
}

function rowFromPublic(model, view) {
  const focus = view.tracks.find((track) => track.key === view.focusKey) || view.tracks[0] || null;
  const sampleCount = focus ? focus.sampleCount : view.log.length;
  const classification = view.revealed ? view.identity : 'UNRESOLVED RETURN';
  const bits = [];
  if (view.reason && view.reason !== 'ok') bits.push(view.reason.replace(/_/g, ' '));
  if (focus && focus.motionClass && focus.motionClass !== 'UNKNOWN') bits.push(focus.motionClass.toLowerCase());
  if (focus && focus.contradiction) bits.push('claim disagrees');
  if (focus && focus.echo) bits.push('echo off a charted wall');
  if (view.reversed) bits.push('lock reversed');
  if (view.reason === 'jammed') bits.push(`${Math.max(0, Math.round(Number(view.jamWu) || 0))} WU to leave the curtain`);
  if (view.revealed) bits.push('fix held — the case payoff is its own mechanism, not a stop on the mark');
  else bits.push('move and pulse again');
  const detail = bits.join('. ').replace(/^\w/, (c) => c.toUpperCase());
  const row = {
    id: `spectrum:${model.caseId}`,
    classification,
    confidence: view.revealed ? 0.92 : Math.max(0.12, Math.min(0.7, 0.18 + sampleCount * 0.12)),
    trackable: true,
    manualInvestigation: true,
    detail,
    strength: view.accepted ? 0.6 : 0.2,
    distance: view.reason === 'jammed' ? Math.max(0, Math.round(Number(view.jamWu) || 0)) : 0,
    scanCount: Math.max(1, sampleCount),
    pos: view.observer ? { x: view.observer.x, z: view.observer.z } : { x: 0, z: 0 },
    spectrum: {
      caseId: view.caseId,
      revealed: view.revealed,
      resolved: view.resolved,
      reversed: view.reversed,
      reason: view.reason,
      area: view.area,
      identity: view.identity,
      focusKey: view.focusKey,
      tracks: view.tracks,
    },
  };
  if (view.bearingDeg != null) {
    row.triangulation = {
      bearingDeg: view.bearingDeg,
      sampleCount,
      requiredPings: 3,
      accepted: view.accepted,
      reason: view.reason === 'ok' ? null : view.reason,
    };
  }
  return row;
}

export const spectrum = {
  name: 'spectrum',

  init(ctx) {
    for (const off of this._off || []) if (typeof off === 'function') off();
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers || {};
    this._off = [];
    this._sectorState = {};
    this._completed = {};
    this._activeSector = null;
    this._pendingResult = null;
    this._pulseSeq = 0;
    this._resolvedKeys = new Set();
    this._onPulse = (payload) => this._fromPulse(payload || {});
    this._onInvestigate = (payload) => this._fromInvestigate(payload || {});
    this._onTrack = (payload) => this._fromInvestigate(payload || {});
    this._onArm = (payload) => this.arm(payload || {});
    this._onTow = (payload) => this._fromTow(payload || {});
    this._onFocus = (payload) => this._fromFocus(payload || {});
    if (!this.bus || typeof this.bus.on !== 'function') return;
    for (const [event, handler] of [['scan:pulse', this._onPulse], ['signal:investigate', this._onInvestigate],
      ['signal:track', this._onTrack], ['spectrum:arm', this._onArm], ['spectrum:tow', this._onTow],
      ['spectrum:focus', this._onFocus], ['sector:exit', () => this._leave()],
      ['game:new', () => { this._leave(); this._sectorState = {}; this._completed = {}; this.state.spectrum = null; }]]) {
      this._off.push(this.bus.on(event, handler));
    }
  },

  arm(payload) {
    const state = this.state;
    if (!state) return false;
    const caseId = payload.caseId || payload.id;
    const model = createSpectrumModel(caseId, state.simTime || 0, state.meta && state.meta.seed);
    if (!model) return false;
    state.spectrum = model;
    return true;
  },

  update(_dt, state) {
    this.state = state;
    this._ensureLive();
    const model = state && state.spectrum;
    if (!model || !model.caseId) return;
    if (model.liveBound) refreshSpectrumBodies(model, state);
    if (this._pendingResult) { this.bus.emit('signal:scanResults', this._pendingResult); this._pendingResult = null; }
    state.spectrumPublic = publicSpectrum(model);
    if (model.resolved) { this._emitResolved(); return; }
    if (state.mode !== 'flight' || !(state.timeScale > 0)) return;
    driveSpectrumBodies(model, state, _dt);
    const actions = state.input && state.input.actions;
    if (!actions?.brake && !state.input?.brake) return;
    const player = playerOf(state);
    if (!player || !player.pos) return;
    const before = model.receipts.length;
    const result = applyBrake(model, player.pos, player.vel || { x: 0, z: 0 }, state.simTime || 0);
    this._flushReceipts(before);
    if (result && result.resolved) this._emitResolved();
    state.spectrumPublic = publicSpectrum(model);
  },

  _ensureLive() {
    const state = this.state, sectorId = state.world?.currentSectorId;
    const kind = state.run?.kind;
    if (state.physicsVenueSession || state.physicsVenue?.active || !this.helpers.spawnEntity || state.mode !== 'flight' || !(state.timeScale > 0)
      || (kind && kind !== 'adventure' && kind !== 'campaign')) return;
    const cases = SPECTRUM_PLACEMENTS[sectorId];
    if (!cases || this._activeSector === sectorId) return;
    const completed = this._completed[sectorId] || [];
    const prior = this._sectorState[sectorId];
    let model = prior && !prior.resolved ? hydrateSpectrum(prior) : null;
    if (!model && state.spectrum?.liveBound && state.spectrum.sectorId === sectorId && !state.spectrum.resolved) model = state.spectrum;
    if (!model) {
      const id = cases.find((candidate) => !completed.includes(candidate));
      if (!id) return;
      model = createSpectrumModel(id, state.simTime || 0, state.meta?.seed);
      bindSpectrumWorld(model, sectorLocalToGlobalForSector({ x: -600, z: -500 }, sectorId));
    }
    model.sectorId = sectorId;
    state.spectrum = model;
    materializeSpectrum(model, state, this.helpers, prior?.liveBodies || this._savedBodies || []);
    this._savedBodies = null; this._activeSector = sectorId;
  },

  _leave() {
    const model = this.state?.spectrum;
    if (model?.liveBound && model.sectorId) this._sectorState[model.sectorId] = {
      ...serializeSpectrum(model), sectorId: model.sectorId, liveBodies: captureSpectrumBodies(model, this.state),
    };
    clearSpectrumBodies(this.state, this.helpers);
    if (this.state) { this.state.spectrum = null; this.state.spectrumPublic = null; }
    this._activeSector = null; this._pendingResult = null; this._pulseSeq = 0;
  },

  serialize() {
    const model = this.state && this.state.spectrum;
    const saved = serializeSpectrum(model) || { schemaVersion: 1, caseId: null };
    return { ...saved, sectorId: model?.sectorId || null,
      liveBodies: captureSpectrumBodies(model, this.state),
      sectorState: structuredClone(this._sectorState), completed: structuredClone(this._completed) };
  },

  deserialize(data) {
    if (!this.state) return;
    this._leave();
    this._sectorState = data?.sectorState || {};
    this._completed = data?.completed || {};
    this._savedBodies = Array.isArray(data?.liveBodies) ? data.liveBodies : [];
    const model = hydrateSpectrum(data);
    if (model) model.sectorId = data.sectorId || null;
    this.state.spectrum = model;
    this.state.spectrumPublic = publicSpectrum(model);
  },

  destroy() {
    for (const off of this._off || []) if (typeof off === 'function') off();
    this._off = [];
    clearSpectrumBodies(this.state, this.helpers);
    this._pendingResult = null;
  },

  _fromPulse(payload) {
    if (!payload || payload.source !== 'player-scanner') return;
    this._ensureLive();
    const state = this.state;
    const model = state && state.spectrum;
    if (!model || !model.caseId || model.resolved) return;
    const player = playerOf(state);
    if (!player || payload.scannerId !== player.id || !Number.isSafeInteger(payload.seq)
      || payload.seq <= this._pulseSeq || state.mode !== 'flight' || !(state.timeScale > 0)) return;
    this._pulseSeq = payload.seq;
    if (model.liveBound) refreshSpectrumBodies(model, state);
    const origin = payload.pos || (player && player.pos);
    if (!origin) return;
    const before = model.receipts.length;
    const view = applyMeasure(
      model,
      origin,
      (player && player.vel) || { x: 0, z: 0 },
      Number.isFinite(payload.simTime) ? payload.simTime : state.simTime || 0,
    );
    if (!view) return;
    this._flushReceipts(before);
    if (model.resolved) this._emitResolved();
    this._publishScanResult(model, view);
  },

  _publishScanResult(model, view) {
    const state = this.state;
    state.spectrumPublic = view;
    const row = rowFromPublic(model, view);
    this._pendingResult = {
      sectorId: state.world && state.world.currentSectorId || null,
      scannedAt: state.simTime || 0,
      primary: row,
      signals: [row],
      total: 1,
    };
    // Legacy isolated fixtures have no live bindings. Production publishes after
    // scanner.update, so its ordinary result batch cannot replace this manual row.
    if (!model.liveBound) { this.bus.emit('signal:scanResults', this._pendingResult); this._pendingResult = null; }
  },

  _fromInvestigate(payload) {
    const id = String(payload.signalId || payload.id || '');
    if (!id.startsWith('spectrum:')) return false;
    const model = this.state && this.state.spectrum;
    if (id !== `spectrum:${model?.caseId}`) return false;
    const view = publicSpectrum(model);
    if (!view) return false;
    // Manual investigation never sets a course. The fix is not a waypoint.
    this.bus.emit('signal:investigating', {
      id,
      classification: view.revealed ? view.identity : 'UNRESOLVED RETURN',
      manualInvestigation: true,
      pos: view.observer ? { ...view.observer } : { x: 0, z: 0 },
    });
    return true;
  },

  _fromTow(payload) {
    const model = this.state && this.state.spectrum;
    const player = playerOf(this.state);
    if (!model || !player || !player.pos) return { ok: false, reason: 'no-player' };
    const before = model.receipts.length;
    const result = applyTow(
      model,
      payload.propId,
      { x: Number(payload.x), z: Number(payload.z) },
      player.pos,
      this.state.simTime || 0,
    );
    this._flushReceipts(before);
    if (model.resolved) this._emitResolved();
    return result;
  },

  _fromFocus(payload) {
    const model = this.state && this.state.spectrum;
    if (!model) return false;
    const before = model.receipts.length;
    const focused = applyFocus(model, payload.key || payload.motionClass || payload.chartLabel || payload.focus);
    this._flushReceipts(before);
    if (model.resolved) this._emitResolved();
    if (focused) this._publishScanResult(model, publicSpectrum(model));
    return focused;
  },

  _flushReceipts(before) {
    const model = this.state && this.state.spectrum;
    if (!model || !this.bus) return;
    for (let i = before; i < model.receipts.length; i++) {
      this.bus.emit('toast', { text: model.receipts[i], kind: 'info', ttl: 4 });
    }
  },

  _emitResolved() {
    const model = this.state && this.state.spectrum;
    const view = publicSpectrum(model);
    if (!view || !this.bus) return;
    const key = `${model.sectorId || 'isolated'}:${model.caseId}:${model.armedAt}`;
    if (this._resolvedKeys.has(key)) return;
    this._resolvedKeys.add(key);
    if (model.liveBound && model.sectorId) {
      const completed = this._completed[model.sectorId] || (this._completed[model.sectorId] = []);
      if (completed.includes(model.caseId)) return;
      completed.push(model.caseId);
    }
    this.bus.emit('spectrum:resolved', {
      caseId: view.caseId,
      identity: view.identity,
      fix: view.fix ? { ...view.fix } : null,
    });
  },
};

export {
  applyBrake,
  applyFocus,
  applyMeasure,
  applyTow,
  createSpectrumModel,
  hydrateSpectrum,
  publicSpectrum,
  serializeSpectrum,
};
