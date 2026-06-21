// SG-08 runtime adapters: consume normalized semantic presentation cues and fan them out to
// existing camera, audio, UI, and accessibility buses. This stays DOM/Three/WebAudio-free so the
// same contract is testable in headless replay.

export const PRESENTATION_ADAPTERS_SCHEMA_VERSION = 1;

export const PRESENTATION_AUDIO_CUE_BY_ID = Object.freeze({
  'tether.attach': 'presentation.tether.attach',
  'tether.near_break': 'presentation.tether.near_break',
  'tether.break': 'presentation.tether.break',
  'shield.collapse': 'presentation.shield.collapse',
  'subsystem.disabled': 'presentation.subsystem.disabled',
  'scenario.signal.pulse': 'presentation.scenario.signal',
  'scenario.comms.kessler': 'presentation.comms.priority',
  'scenario.comms.denial': 'presentation.comms.priority',
  'scenario.objective.priority_split': 'presentation.objective.split',
  'scenario.branch.resolved': 'presentation.branch.resolved',
});

const UI_CUES = Object.freeze({
  'tether.attach': uiCue('presentation:tether:attach', 'info', 'MASSLINE ATTACHED', 1.4),
  'tether.near_break': uiCue('presentation:tether:near-break', 'warn', 'MASSLINE STRAIN', 1.2),
  'tether.break': uiCue('presentation:tether:break', 'danger', 'MASSLINE BROKEN', 1.8),
  'shield.collapse': uiCue('presentation:shield:collapse', 'danger', 'SHIELDS COLLAPSED', 1.8),
  'subsystem.disabled': uiCue('presentation:subsystem:disabled', 'warn', 'SUBSYSTEM DISABLED', 1.8),
  'scenario.signal.pulse': uiCue('presentation:scenario:signal', 'info', 'UNREGISTERED SIGNAL', 2.2),
  'scenario.comms.kessler': uiCue('presentation:scenario:kessler', 'info', 'PRIORITY COMMS', 2.2),
  'scenario.comms.denial': uiCue('presentation:scenario:denial', 'warn', 'OFFICIAL DENIAL', 2.2),
  'scenario.objective.priority_split': uiCue('presentation:scenario:priority-split', 'warn', 'OBJECTIVES SPLIT', 2.4),
  'scenario.branch.resolved': uiCue('presentation:scenario:resolved', 'info', 'EVIDENCE ROUTE LOCKED', 2.4),
});

const CAPTIONS = Object.freeze({
  'tether.attach': 'Massline attached.',
  'tether.near_break': 'Massline strain rising.',
  'tether.break': 'Massline broken.',
  'shield.collapse': 'Shield collapse.',
  'subsystem.disabled': 'Subsystem disabled.',
  'scenario.signal.pulse': 'Unregistered signal pulse.',
  'scenario.comms.kessler': 'Priority communication from Kessler.',
  'scenario.comms.denial': 'Official channel denies the shipment.',
  'scenario.objective.priority_split': 'Civilian objective competing with evidence recovery.',
  'scenario.branch.resolved': 'Evidence route resolved.',
});

export const presentationAdapters = {
  name: 'presentationAdapters',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    this._applied = 0;
    this._lastApplied = null;
    this._subscriptions = [
      this.bus.on('presentation:cue', (cue) => this._applyCue(cue || {})),
      this.bus.on('save:loaded', () => this._resetRuntime()),
    ];
  },

  dispose() {
    while (this._subscriptions && this._subscriptions.length) {
      const unsub = this._subscriptions.pop();
      try { unsub(); } catch (_err) {}
    }
  },

  inspect() {
    return {
      schema: 'spaceface.presentationAdaptersInspect.v1',
      schemaVersion: PRESENTATION_ADAPTERS_SCHEMA_VERSION,
      applied: this._applied || 0,
      lastApplied: this._lastApplied,
    };
  },

  _resetRuntime() {
    this._applied = 0;
    this._lastApplied = null;
  },

  _applyCue(cue) {
    const outputs = {};
    const camera = this._applyCamera(cue);
    if (camera) outputs.camera = camera;
    const vfx = this._applyVfx(cue);
    if (vfx) outputs.vfx = vfx;
    const audio = this._applyAudio(cue);
    if (audio) outputs.audio = audio;
    const ui = this._applyUi(cue);
    if (ui) outputs.ui = ui;
    const accessibility = this._applyAccessibility(cue);
    if (accessibility) outputs.accessibility = accessibility;

    const applied = {
      schema: 'spaceface.presentationCueApplied.v1',
      id: cue.id || null,
      tick: currentTick(this.state),
      simTimeMs: finite(cue.simTimeMs, finite(this.state && this.state.simTime, 0) * 1000),
      sourceEvent: cue.sourceEvent || null,
      dedupeKey: cue.dedupeKey || null,
      lanes: copyObject(cue.lanes),
      outputs,
    };
    this._applied++;
    this._lastApplied = {
      tick: applied.tick,
      id: applied.id,
      outputLanes: Object.keys(outputs).sort(),
    };
    this.bus.emit('presentation:cueApplied', applied);
  },

  _applyCamera(cue) {
    const budget = cue && cue.budgets || {};
    const base = clamp01(finite(budget.cameraTrauma, 0));
    if (base <= 0) return null;
    const motionReduced = !!(this.state && this.state.settings && this.state.settings.video && this.state.settings.video.motionReduce);
    const amount = round4(base * (motionReduced ? 0.25 : 1));
    const payload = {
      id: cue.id,
      amount,
      reason: 'presentation',
      reducedMotion: motionReduced,
      sourceId: cue.sourceId ?? null,
      targetId: cue.targetId ?? null,
      direction: cue.direction || null,
    };
    this.bus.emit('presentation:cameraCue', payload);
    if (amount > 0) this.bus.emit('camera:shake', payload);
    return { event: 'camera:shake', amount, reducedMotion: motionReduced };
  },

  _applyVfx(cue) {
    const budget = cue && cue.budgets || {};
    const flashReduced = !!(this.state && this.state.settings && this.state.settings.accessibility && this.state.settings.accessibility.flashReduce);
    const payload = {
      id: cue.id,
      lane: cue.lanes && cue.lanes.vfx || null,
      particles: Math.max(0, Math.floor(finite(budget.particles, 0) * (flashReduced ? 0.5 : 1))),
      lights: Math.max(0, Math.floor(finite(budget.lights, 0) * (flashReduced ? 0 : 1))),
      flashReduced,
      position: cue.position || null,
      direction: cue.direction || null,
      magnitude: finite(cue.magnitude, 1),
      material: cue.material || 'unknown',
      sourceId: cue.sourceId ?? null,
      targetId: cue.targetId ?? null,
    };
    this.bus.emit('presentation:vfxCue', payload);
    return { event: 'presentation:vfxCue', particles: payload.particles, lights: payload.lights, flashReduced };
  },

  _applyAudio(cue) {
    const audioId = PRESENTATION_AUDIO_CUE_BY_ID[cue && cue.id];
    if (!audioId) return null;
    const payload = {
      id: audioId,
      cueId: cue.id,
      lane: cue.lanes && cue.lanes.audio || null,
      position: cue.position || null,
      gain: round4(0.45 + clamp01(finite(cue.importance, 0.5)) * 0.35),
      duck: (cue.tags || []).includes('comms') || finite(cue.importance, 0) >= 0.85,
    };
    this.bus.emit('presentation:audioCue', payload);
    this.bus.emit('audio:cue', payload);
    return { event: 'audio:cue', id: audioId, duck: payload.duck };
  },

  _applyUi(cue) {
    const def = UI_CUES[cue && cue.id];
    if (!def) return null;
    const payload = {
      key: def.key,
      sev: def.sev,
      text: def.text,
      ttl: def.ttl,
      cueId: cue.id,
      lane: cue.lanes && cue.lanes.ui || null,
      shape: shapeForCue(cue.id),
    };
    this.bus.emit('presentation:uiCue', payload);
    this.bus.emit('alert', payload);
    return { event: 'alert', key: payload.key, sev: payload.sev, shape: payload.shape };
  },

  _applyAccessibility(cue) {
    const text = CAPTIONS[cue && cue.id];
    if (!text) return null;
    const payload = {
      id: cue.id,
      lane: cue.lanes && cue.lanes.accessibility || null,
      text,
      assertive: cue.playerRelevance >= 0.9 || finite(cue.importance, 0) >= 0.85,
      shape: shapeForCue(cue.id),
      highContrast: !!(this.state && this.state.settings && this.state.settings.accessibility && this.state.settings.accessibility.highContrast),
      reducedMotion: !!(this.state && this.state.settings && this.state.settings.video && this.state.settings.video.motionReduce),
      flashReduced: !!(this.state && this.state.settings && this.state.settings.accessibility && this.state.settings.accessibility.flashReduce),
    };
    this.bus.emit('presentation:caption', payload);
    return { event: 'presentation:caption', assertive: payload.assertive, shape: payload.shape };
  },
};

function uiCue(key, sev, text, ttl) {
  return Object.freeze({ key, sev, text, ttl });
}

function shapeForCue(id) {
  if (id && id.startsWith('tether.')) return 'arc';
  if (id === 'shield.collapse') return 'ring';
  if (id === 'subsystem.disabled') return 'bracket';
  if (id && id.startsWith('scenario.comms.')) return 'diamond';
  if (id && id.startsWith('scenario.objective.')) return 'split';
  return 'pulse';
}

function copyObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return { ...value };
}

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function clamp01(value) {
  const n = finite(value, 0);
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

function round4(value) {
  return Math.round(finite(value, 0) * 10000) / 10000;
}

function currentTick(state) {
  return state && Number.isFinite(state.tick) ? state.tick | 0 : 0;
}
