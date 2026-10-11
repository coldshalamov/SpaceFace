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
  if (view.revealed) bits.push('fix held — brake alongside or tow the relay');
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
    distance: 0,
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
    this.state = ctx.state;
    this.bus = ctx.bus;
    this._onPulse = (payload) => this._fromPulse(payload || {});
    this._onInvestigate = (payload) => this._fromInvestigate(payload || {});
    this._onTrack = (payload) => this._fromInvestigate(payload || {});
    this._onArm = (payload) => this.arm(payload || {});
    this._onTow = (payload) => this._fromTow(payload || {});
    this._onFocus = (payload) => this._fromFocus(payload || {});
    if (!this.bus || typeof this.bus.on !== 'function') return;
    this.bus.on('scan:pulse', this._onPulse);
    this.bus.on('signal:investigate', this._onInvestigate);
    this.bus.on('signal:track', this._onTrack);
    this.bus.on('spectrum:arm', this._onArm);
    this.bus.on('spectrum:tow', this._onTow);
    this.bus.on('spectrum:focus', this._onFocus);
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
    const model = state && state.spectrum;
    if (!model || !model.caseId || model.resolved) return;
    const actions = state.input && state.input.actions;
    if (!actions || !actions.brake) return;
    const player = playerOf(state);
    if (!player || !player.pos) return;
    const before = model.receipts.length;
    const result = applyBrake(model, player.pos, player.vel || { x: 0, z: 0 }, state.simTime || 0);
    this._flushReceipts(before);
    if (result && result.resolved) this._emitResolved();
  },

  serialize() {
    return serializeSpectrum(this.state && this.state.spectrum);
  },

  deserialize(data) {
    if (!this.state) return;
    const model = hydrateSpectrum(data);
    if (model) this.state.spectrum = model;
  },

  _fromPulse(payload) {
    if (!payload || payload.source !== 'player-scanner') return;
    const state = this.state;
    const model = state && state.spectrum;
    if (!model || !model.caseId || model.resolved) return;
    const player = playerOf(state);
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
    const row = rowFromPublic(model, view);
    this.bus.emit('signal:scanResults', {
      sectorId: state.world && state.world.currentSectorId || null,
      scannedAt: state.simTime || 0,
      primary: row,
      signals: [row],
      total: 1,
    });
  },

  _fromInvestigate(payload) {
    const id = String(payload.signalId || payload.id || '');
    if (!id.startsWith('spectrum:')) return false;
    const model = this.state && this.state.spectrum;
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
    return applyFocus(model, payload.key || payload.motionClass || payload.chartLabel || payload.focus);
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
