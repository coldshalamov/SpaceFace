// SG-08 runtime adapters: consume normalized semantic presentation cues and fan them out to
// existing camera, audio, UI, and accessibility buses. This stays DOM/Three/WebAudio-free so the
// same contract is testable in headless replay.

import { deriveVfxAdmissionMetadata } from '../presentation/vfxAdmissionPriority.js';

export const PRESENTATION_ADAPTERS_SCHEMA_VERSION = 1;

/**
 * Minimum `playerRelevance` (cueSchema.js:109-122) for a cue to reach the three PLAYER-scoped
 * lanes — HUD alert, accessibility caption, and camera trauma. Read off that function's own table:
 * 1 = the player is the cue's target, 0.88 = the player is its source, and everything below is a
 * pure distance falloff topping out at 0.72 for "within 80 units". 0.8 therefore means "the player
 * is a participant" while excluding "this happened near the player". The vfx and audio lanes are
 * world-scoped and deliberately not gated by this. See _applyCue.
 */
export const PLAYER_LANE_RELEVANCE_FLOOR = 0.8;

export const PRESENTATION_AUDIO_CUE_BY_ID = Object.freeze({
  'travel.cruise.charging': 'presentation.travel.cruise_charge',
  'travel.cruise.engaged': 'presentation.travel.lane_lock',
  'travel.cruise.cancelled': 'presentation.travel.cancel',
  'travel.cruise.interrupted': 'presentation.travel.fail',
  'travel.gate.approach': 'presentation.travel.gate_approach',
  'travel.corridor.continuity': 'presentation.travel.lane_lock',
  'travel.jump.aligning': 'presentation.travel.gate_align',
  'travel.jump.commit_window': 'presentation.travel.commit_window',
  'travel.jump.committed': 'presentation.travel.commit',
  'travel.transition.continuity': 'presentation.travel.transit',
  'travel.arrival.oriented': 'presentation.travel.arrival',
  'travel.arrival.sector_identity': 'presentation.travel.sector_identity',
  'travel.discovery.mapped': 'presentation.travel.discovery',
  'travel.interdiction.triggered': 'presentation.travel.interdiction',
  'travel.jump.failed': 'presentation.travel.fail',
  'travel.recovery.resumed': 'presentation.travel.recovery',
  'travel.aftermath.clear': 'presentation.travel.settle',
  'travel.aftermath.contested': 'presentation.travel.contested',
  'mining.survey.pulse': 'presentation.mining.scan_pulse',
  'mining.survey.resolved': 'presentation.mining.scan_return',
  'mining.survey.classified': 'presentation.mining.scan_classified',
  'mining.survey.tracked': 'presentation.mining.scan_tracked',
  'mining.survey.investigated': 'presentation.mining.scan_investigated',
  'mining.extraction.locked': 'presentation.mining.cutter_lock',
  'mining.seam.quality': 'presentation.mining.hardness',
  'mining.seam.reward': 'presentation.mining.seam_reward',
  'mining.fracture.anticipation': 'presentation.mining.fracture_warning',
  'mining.fracture.released': 'presentation.mining.fracture_break',
  'mining.rich_core.exposed': 'presentation.mining.core_exposed',
  'mining.rich_core.charge': 'presentation.mining.core_charge',
  'mining.rich_core.completed': 'presentation.mining.core_reward',
  'mining.rich_core.fizzle': 'presentation.mining.core_fizzle',
  'mining.chunk.tether_required': 'presentation.mining.mass_required',
  'mining.chunk.mass_engaged': 'presentation.mining.mass_engaged',
  'mining.cargo.mass_settled': 'presentation.mining.cargo_settle',
  'mining.cargo.full': 'presentation.mining.cargo_full',
  'mining.field.aftermath': 'presentation.mining.field_settle',
  'mining.heat.overheated': 'presentation.mining.heat_warning',
  'mining.vent.ready': 'presentation.mining.vent_ready',
  'mining.yield.collected': 'presentation.mining.yield',
  'mining.drill.seismic_pulse': 'presentation.mining.seismic_pulse',
  'mining.drill.contact': 'presentation.mining.drill_contact',
  'mining.drill.break': 'presentation.mining.drill_break',
  'mining.drill.yield': 'presentation.mining.drill_yield',
  'mining.drill.gas_hazard': 'presentation.mining.gas_hazard',
  'mining.drill.aborted': 'presentation.mining.drill_abort',
  'mining.drill.retry': 'presentation.mining.drill_retry',
  'combat.doctrine.setup': 'presentation.combat.doctrine_setup',
  'combat.doctrine.telegraph': 'presentation.combat.doctrine_telegraph',
  'combat.doctrine.action': 'presentation.combat.doctrine_commit',
  'combat.doctrine.aftermath': 'presentation.combat.doctrine_aftermath',
  'combat.doctrine.break': 'presentation.combat.doctrine_break',
  'combat.doctrine.withdraw': 'presentation.combat.doctrine_withdraw',
  'combat.damage.applied': 'presentation.combat.damage_applied',
  'combat.near_miss': 'presentation.combat.near_miss',
  'combat.player.hit': 'presentation.combat.player_hit',
  'combat.player.kill': 'presentation.combat.player_kill',
  'tether.attach': 'presentation.tether.attach',
  'tether.near_break': 'presentation.tether.near_break',
  'tether.break': 'presentation.tether.break',
  'tether.whip_impact': 'presentation.tether.whip_impact',
  'massline.threat': 'presentation.massline.threat',
  'massline.counter_tether.cut': 'presentation.massline.threat',
  'massline.counter_tether.overload': 'presentation.massline.threat',
  'tether.release.good': 'presentation.tether.release',
  'tether.release.clean': 'presentation.tether.release',
  'tether.release.razor': 'presentation.tether.release',
  'shield.collapse': 'presentation.shield.collapse',
  'subsystem.disabled': 'presentation.subsystem.disabled',
  'scenario.signal.pulse': 'presentation.scenario.signal',
  'scenario.comms.kessler': 'presentation.comms.kessler',
  'scenario.comms.denial': 'presentation.comms.denial',
  'scenario.objective.priority_split': 'presentation.objective.split',
  'scenario.branch.resolved': 'presentation.branch.resolved',
  // PQ-023 family (c). Every presentation recipe must map to a concrete authored audio recipe
  // (check-sg08-mix-profile enforces this), so these reuse existing authored signatures rather than
  // inventing assets: a site component failing under `physics:impact` is a structural break, and a
  // restoration is the completion of industrial-beam work. Deliberately NOT
  // presentation.subsystem.disabled -- that signature means the PLAYER's own subsystem died, and
  // reusing it would blur two different mechanical facts. Dedicated site audio is a follow-up.
  'world_site.damage': 'presentation.mining.fracture_break',
  'world_site.recovery': 'presentation.mining.core_reward',
});

const UI_CUES = Object.freeze({
  'combat.player.kill': uiCue('presentation:combat:player-kill', 'info', 'TARGET DESTROYED', 1.4),
  'tether.attach': uiCue('presentation:tether:attach', 'info', 'MASSLINE ATTACHED', 1.4),
  'tether.near_break': uiCue('presentation:tether:near-break', 'warn', 'MASSLINE STRAIN', 1.2),
  'tether.break': uiCue('presentation:tether:break', 'danger', 'MASSLINE BROKEN', 1.8),
  // Rung 14 — the whip payoff readout (the crack landed). Info tier: it's a reward, not a warning.
  'tether.whip_impact': uiCue('presentation:tether:whip-impact', 'info', 'MASSLINE IMPACT', 1.4),
  // Rung 10 — swing-danger warn (line-near-break / hostile-on-arc / collision-course).
  'massline.threat': uiCue('presentation:massline:threat', 'warn', 'SWING THREAT', 1.4),
  'massline.counter_tether.cut': uiCue('presentation:massline:counter-tether-cut', 'danger', 'LINE CUT', 1.4),
  'massline.counter_tether.overload': uiCue('presentation:massline:counter-tether-overload', 'danger', 'OVERLOAD', 1.4),
  // Prompt 03 — release-rated toasts. Severity/ttl escalate good -> clean -> razor so the razor
  // cue is visibly stronger than good. Messy has no entry (no UI cue for messy releases).
  'tether.release.good': uiCue('presentation:tether:release-good', 'info', 'CLEAN RELEASE', 1.1),
  'tether.release.clean': uiCue('presentation:tether:release-clean', 'info', 'CLEAN CUT', 1.5),
  'tether.release.razor': uiCue('presentation:tether:release-razor', 'warn', 'RAZOR CUT', 2.0),
  'massline.release.missed': uiCue('presentation:massline:release-missed', 'info', 'MISSED WINDOW', 1.1),
  'shield.collapse': uiCue('presentation:shield:collapse', 'danger', 'SHIELDS COLLAPSED', 1.8),
  'subsystem.disabled': uiCue('presentation:subsystem:disabled', 'warn', 'SUBSYSTEM DISABLED', 1.8, true),
  'scenario.signal.pulse': uiCue('presentation:scenario:signal', 'info', 'UNREGISTERED SIGNAL', 2.2, true),
  'scenario.comms.kessler': uiCue('presentation:scenario:kessler', 'info', 'PRIORITY COMMS', 2.2, true),
  'scenario.comms.denial': uiCue('presentation:scenario:denial', 'warn', 'OFFICIAL DENIAL', 2.2, true),
  'scenario.objective.priority_split': uiCue('presentation:scenario:priority-split', 'warn', 'OBJECTIVES SPLIT', 2.4, true),
  'scenario.branch.resolved': uiCue('presentation:scenario:resolved', 'info', 'EVIDENCE ROUTE LOCKED', 2.4, true),
});

const CAPTIONS = Object.freeze({
  'combat.player.kill': 'Target destroyed.',
  'tether.attach': 'Massline attached.',
  'tether.near_break': 'Massline strain rising.',
  'tether.break': 'Massline broken.',
  'tether.whip_impact': 'Massline impact landed.',
  'massline.threat': 'Swing threat detected.',
  'massline.counter_tether.cut': 'Enemy is preparing to cut the Massline.',
  'massline.counter_tether.overload': 'Enemy is preparing a Massline overload break.',
  'tether.release.good': 'Clean release.',
  'tether.release.clean': 'Clean cut.',
  'tether.release.razor': 'Razor cut.',
  'massline.release.missed': 'Massline release window missed.',
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
    this._lastRoleBriefingKey = null;
    this._pendingRoleBriefing = null;
    this._pendingRoleUndockTimer = null;
    this._roleBriefings = 0;
    this._subscriptions = [
      this.bus.on('presentation:cue', (cue) => this._applyCue(cue || {})),
      // M5 active-hull role briefing: ships publishes ship:roleContext; adapters own the toast.
      this.bus.on('ship:roleContext', (context) => this._onShipRoleContext(context || {})),
      this.bus.on('mode:changed', ({ mode } = {}) => this._onModeChanged(mode)),
      this.bus.on('game:started', () => this._onGameStarted()),
      this.bus.on('tutorial:finished', () => this._onTutorialFinished()),
      this.bus.on('dock:undocked', () => this._onDockUndocked()),
      this.bus.on('save:loaded', () => this._resetRuntime()),
    ];
  },

  dispose() {
    while (this._subscriptions && this._subscriptions.length) {
      const unsub = this._subscriptions.pop();
      try { unsub(); } catch (_err) {}
    }
    this._lastRoleBriefingKey = null;
    this._pendingRoleBriefing = null;
    if (this._pendingRoleUndockTimer != null) clearTimeout(this._pendingRoleUndockTimer);
    this._pendingRoleUndockTimer = null;
  },

  inspect() {
    return {
      schema: 'spaceface.presentationAdaptersInspect.v1',
      schemaVersion: PRESENTATION_ADAPTERS_SCHEMA_VERSION,
      applied: this._applied || 0,
      lastApplied: this._lastApplied,
      roleBriefings: this._roleBriefings || 0,
      lastRoleBriefingKey: this._lastRoleBriefingKey || null,
      pendingRoleBriefingSource: this._pendingRoleBriefing && this._pendingRoleBriefing.source || null,
    };
  },

  _resetRuntime() {
    this._applied = 0;
    this._lastApplied = null;
    // Allow one Continue briefing after restore; do not re-fire without a new ship:roleContext.
    this._lastRoleBriefingKey = null;
    this._travelAudioTick = null;
    this._travelAudioSources = new Set();
    this._miningAudioTick = null;
    this._miningAudioSources = new Set();
    this._doctrineAudioTick = null;
    this._doctrineAudioSources = new Set();
    this._combatAftermathAudioTick = null;
    this._combatAftermathAudioClaimed = false;
  },

  /**
   * Production consumer for active-hull role continuity. Emits a concise non-diegetic toast only
   * when ships marks the packet announce:true (New Game, Continue, real hull switch). Silent for
   * queries, no-ops, recomputes, and reinit without a fresh publish.
   */
  _onShipRoleContext(context) {
    if (!context || context.announce !== true) return null;
    const source = context.source || '';
    if (source !== 'new_game' && source !== 'save_loaded' && source !== 'active_ship_changed') {
      return null;
    }
    const name = String(context.name || '').trim();
    const roleLabel = String(context.roleLabel || '').trim();
    const signatureVerb = String(context.signatureVerb || '').trim();
    if (!name || !roleLabel || !signatureVerb) return null;

    // New Game and Continue publish their role packet while the canonical authored-visual gate is
    // still in loading mode. Starting the five-second toast there makes it expire behind the veil.
    // Hold only that transition-time packet. Continue can surface at mode:changed(flight); New Game
    // waits until game:started has finished so the UI's run-boundary reset cannot erase the toast.
    // A later packet replaces an abandoned transition.
    if (this.state && (this.state.mode === 'loading'
      || this.state.ui?.docked === true
      || tutorialOwnsOpeningPresentation(this.state))) {
      this._pendingRoleBriefing = { ...context };
      return null;
    }

    return this._surfaceRoleBriefing(context);
  },

  _onModeChanged(mode) {
    if (mode !== 'flight' || !this._pendingRoleBriefing) return null;
    if (tutorialOwnsOpeningPresentation(this.state)) return null;
    if (this._pendingRoleBriefing.source === 'new_game') return null;
    const pending = this._pendingRoleBriefing;
    this._pendingRoleBriefing = null;
    return this._surfaceRoleBriefing(pending);
  },

  _onGameStarted() {
    if (!this._pendingRoleBriefing || this._pendingRoleBriefing.source !== 'new_game') return null;
    const pending = this._pendingRoleBriefing;
    // presentationAdapters is initialized before UI listeners. Defer until every synchronous
    // game:started consumer has reset its surface. Onboarding is also initialized after this
    // adapter, so its listener establishes tutorial ownership later in the same event dispatch.
    queueMicrotask(() => {
      if (!this.bus || !this.state || this._pendingRoleBriefing !== pending) return;
      if (this.state.mode !== 'flight' || tutorialOwnsOpeningPresentation(this.state)) return;
      this._pendingRoleBriefing = null;
      this._surfaceRoleBriefing(pending);
    });
    return pending;
  },

  _onTutorialFinished() {
    if (!this._pendingRoleBriefing) return null;
    const pending = this._pendingRoleBriefing;
    // Let every synchronous tutorial-handoff consumer retire its own opening surface first. The
    // role card is informational and may follow that boundary; it never owns the tutorial interval.
    queueMicrotask(() => {
      if (!this.bus || !this.state || this._pendingRoleBriefing !== pending) return;
      if (this.state.mode !== 'flight'
        || this.state.ui?.docked === true
        || tutorialOwnsOpeningPresentation(this.state)) return;
      this._pendingRoleBriefing = null;
      this._surfaceRoleBriefing(pending);
    });
    return pending;
  },

  _onDockUndocked() {
    if (!this._pendingRoleBriefing || this._pendingRoleBriefing.source !== 'active_ship_changed') {
      return null;
    }
    const pending = this._pendingRoleBriefing;
    const surfaceAfterStationCloses = () => {
      if (!this.bus || !this.state || this._pendingRoleBriefing !== pending) return;
      if (this.state.mode !== 'flight'
        || this.state.ui?.docked === true
        || tutorialOwnsOpeningPresentation(this.state)) return;
      this._pendingRoleBriefing = null;
      this._pendingRoleUndockTimer = null;
      this._surfaceRoleBriefing(pending);
    };
    // uiRoot commits the screen swap after its 400 ms launch fade. Wait beyond that canonical
    // boundary before starting the five-second briefing clock; otherwise the toast expires behind
    // the still-opaque station screen. Immediate delivery remains available to headless consumers.
    queueMicrotask(() => {
      if (!this.bus || !this.state || this._pendingRoleBriefing !== pending) return;
      if (this.state.ui?.docked !== true) {
        surfaceAfterStationCloses();
        return;
      }
      if (this._pendingRoleUndockTimer != null) clearTimeout(this._pendingRoleUndockTimer);
      this._pendingRoleUndockTimer = setTimeout(surfaceAfterStationCloses, 450);
    });
    return pending;
  },

  _surfaceRoleBriefing(context) {
    const source = String(context.source || '').trim();
    const name = String(context.name || '').trim();
    const roleLabel = String(context.roleLabel || '').trim();
    const signatureVerb = String(context.signatureVerb || '').trim();
    if (!name || !roleLabel || !signatureVerb) return null;

    const tick = currentTick(this.state);
    const key = [source, context.defId || '', context.role || '', tick].join('|');
    if (this._lastRoleBriefingKey === key) return null;
    this._lastRoleBriefingKey = key;

    const text = name + ' active · ' + roleLabel + ' — ' + signatureVerb;
    const toast = {
      text,
      kind: 'info',
      ttl: 5,
      key: 'ship.role.briefing',
      source,
      defId: context.defId || null,
      role: context.role || null,
    };
    this.bus.emit('toast', toast);
    this.bus.emit('presentation:uiCue', {
      key: 'presentation:ship:role-briefing',
      sev: 'info',
      text,
      ttl: 5,
      cueId: 'ship.role.briefing',
      lane: 'ui.toast',
      source,
      defId: context.defId || null,
    });
    this._roleBriefings = (this._roleBriefings || 0) + 1;
    this._applied = (this._applied || 0) + 1;
    this._lastApplied = {
      tick,
      id: 'ship.role.briefing',
      outputLanes: ['ui'],
      source,
    };
    return toast;
  },

  _applyCue(cue) {
    const outputs = {};
    // Lane audience split (GDD 2.0 pillar 3, "one primary transient voice at a time").
    //
    // Three of these five lanes are statements ABOUT THE PLAYER'S SHIP: a HUD banner, its
    // accessibility caption, and a kick to the player's camera. The other two describe the WORLD.
    // Until now all five fired for any entity, so an NPC's shield breaking anywhere in the sector
    // raised a red "SHIELDS COLLAPSED" banner, spoke it, and shook the player's camera while the
    // player sat at full hull — which teaches players to ignore the highest-severity channel the
    // HUD has, and that costs every legitimate warning behind it.
    //
    // No new schema field is needed: cueSchema.js:181 already computes playerRelevance for every
    // cue (1 = player is the target, 0.88 = player is the source, then a distance falloff of
    // 0.72/0.52/0.28/0.08), and it has been arriving here unread apart from one caption-assertiveness
    // test. The 0.8 floor is read straight off that table: it admits "the player is a participant"
    // and excludes "this happened somewhere near the player", which is exactly the line a red banner
    // should sit on. 0.72 would readmit every nearby NPC brawl.
    //
    // vfx and audio stay WORLD-scoped on purpose. An NPC's shield popping should spark at the NPC —
    // that is pillar 2, "read the battlefield at a glance" — and the audio lane is already
    // spatialized and voice-budgeted, so gating it would deaden the world rather than declutter it.
    const playerScoped = finite(cue && cue.playerRelevance, 1) >= PLAYER_LANE_RELEVANCE_FLOOR;
    const tutorialOwnsSignalAnnouncement = onboardingOwnsSignalAnnouncement(this.state, cue);
    const camera = playerScoped ? this._applyCamera(cue) : null;
    if (camera) outputs.camera = camera;
    const vfx = this._applyVfx(cue);
    if (vfx) outputs.vfx = vfx;
    const audio = this._applyAudio(cue);
    if (audio) outputs.audio = audio;
    const ui = playerScoped && !tutorialOwnsSignalAnnouncement ? this._applyUi(cue) : null;
    if (ui) outputs.ui = ui;
    const accessibility = playerScoped && !tutorialOwnsSignalAnnouncement
      ? this._applyAccessibility(cue)
      : null;
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
    const lane = cue && cue.lanes && cue.lanes.vfx || null;
    if (!lane || lane === 'vfx.none') return null;
    if (lane.startsWith('vfx.direct_')) {
      return { event: 'direct_vfx_owner', lane, reconciled: true };
    }
    const budget = cue && cue.budgets || {};
    const flashReduced = !!(this.state && this.state.settings && this.state.settings.accessibility && this.state.settings.accessibility.flashReduce);
    const admission = deriveVfxAdmissionMetadata(cue, this.state);
    const payload = {
      id: cue.id,
      lane,
      particles: Math.max(0, Math.floor(finite(budget.particles, 0) * (flashReduced ? 0.5 : 1))),
      lights: Math.max(0, Math.floor(finite(budget.lights, 0) * (flashReduced ? 0 : 1))),
      flashReduced,
      position: cue.position || null,
      direction: cue.direction || null,
      magnitude: finite(cue.magnitude, 1),
      importance: admission.importance,
      playerRelevance: admission.playerRelevance,
      distance: Math.max(0, finite(cue.distance, 0)),
      proximity: admission.proximity,
      severity: admission.severity,
      targetRelevance: admission.targetRelevance,
      playerCaused: admission.playerCaused,
      currentTarget: admission.currentTarget,
      admissionPriority: admission.admissionPriority,
      priorityComponents: {
        importance: admission.importance,
        playerRelevance: admission.playerRelevance,
        proximity: admission.proximity,
        severity: admission.severity,
        targetRelevance: admission.targetRelevance,
        playerCaused: admission.playerCaused,
        currentTarget: admission.currentTarget,
      },
      material: cue.material || 'unknown',
      sourceId: admission.sourceId,
      targetId: admission.targetId,
      tags: Array.isArray(cue.tags) ? [...cue.tags] : [],
    };
    this.bus.emit('presentation:vfxCue', payload);
    return {
      event: 'presentation:vfxCue',
      particles: payload.particles,
      lights: payload.lights,
      flashReduced,
      admissionPriority: payload.admissionPriority,
    };
  },

  _applyAudio(cue) {
    const mappedAudioId = PRESENTATION_AUDIO_CUE_BY_ID[cue && cue.id];
    if (!mappedAudioId) return null;
    const audioId = subsystemAudioId(cue, doctrineAudioId(cue, mappedAudioId));
    if (cue.id.startsWith('travel.') && !this._claimTravelAudioFloor(cue)) return null;
    if (cue.id.startsWith('mining.') && !this._claimMiningAudioFloor(cue)) return null;
    if (cue.id.startsWith('combat.doctrine.') && !doctrineCueOwnsAudio(cue)) return null;
    if (cue.id.startsWith('combat.doctrine.') && !this._claimDoctrineAudioFloor(cue)) return null;
    if (isCombatAftermathCue(cue) && !combatAftermathCueOwnsAudio(cue, this.state)) return null;
    if (cue.id === 'combat.near_miss' && !this._claimCombatAftermathAudioFloor(cue)) return null;
    const payload = {
      id: audioId,
      cueId: cue.id,
      lane: cue.lanes && cue.lanes.audio || null,
      position: scenarioAudioPosition(cue),
      gain: combatAftermathGain(cue),
      rate: combatAftermathRate(cue),
      duck: shouldDuckAudio(cue),
      // Preserve the semantic audio route for observability while the earlier raw shieldDown event
      // remains the sole physical shield-break voice.
      playbackOwnedByRaw: cue.id === 'shield.collapse',
    };
    this.bus.emit('presentation:audioCue', payload);
    this.bus.emit('audio:cue', payload);
    return { event: 'audio:cue', id: audioId, duck: payload.duck };
  },

  _claimTravelAudioFloor(cue) {
    const tick = currentTick(this.state);
    if (this._travelAudioTick !== tick) {
      this._travelAudioTick = tick;
      this._travelAudioSources = new Set();
    }
    // A single gameplay event can produce multiple structural presentation receipts (for example,
    // jump committed + transition continuity). Keep those receipts for VFX/telemetry while only
    // the first owns the audible floor. Distinct urgent events in the same tick still read.
    const sourceEvent = cue.sourceEvent || cue.id;
    if (this._travelAudioSources.has(sourceEvent)) return false;
    this._travelAudioSources.add(sourceEvent);
    return true;
  },

  _claimMiningAudioFloor(cue) {
    const tick = currentTick(this.state);
    if (this._miningAudioTick !== tick) {
      this._miningAudioTick = tick;
      this._miningAudioSources = new Set();
    }
    const sourceEvent = cue.sourceEvent || cue.id;
    if (this._miningAudioSources.has(sourceEvent)) return false;
    this._miningAudioSources.add(sourceEvent);
    return true;
  },

  _claimDoctrineAudioFloor(cue) {
    const tick = currentTick(this.state);
    if (this._doctrineAudioTick !== tick) {
      this._doctrineAudioTick = tick;
      this._doctrineAudioSources = new Set();
    }
    // Doctrine telegraphs are squad information: several actors changing together still speak once.
    const key = cue.sourceEvent || cue.id;
    if (this._doctrineAudioSources.has(key)) return false;
    this._doctrineAudioSources.add(key);
    return true;
  },

  _claimCombatAftermathAudioFloor(cue) {
    const tick = currentTick(this.state);
    if (this._combatAftermathAudioTick !== tick) {
      this._combatAftermathAudioTick = tick;
      this._combatAftermathAudioClaimed = false;
    }
    // Several projectiles can cross the player in one sim tick. Preserve every semantic/VFX receipt,
    // but permit only one restrained flyby voice so crossfire never becomes a noise storm.
    if (this._combatAftermathAudioClaimed) return false;
    this._combatAftermathAudioClaimed = true;
    return true;
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
      audioOwnedByPresentation: !!def.audioOwnedByPresentation,
    };
    this.bus.emit('presentation:uiCue', payload);
    this.bus.emit('alert', payload);
    return { event: 'alert', key: payload.key, sev: payload.sev, shape: payload.shape };
  },

  _applyAccessibility(cue) {
    // PQ-023 family (e): an owner-supplied accessibilityText outranks the static table. The table
    // can only say one fixed sentence per cue id, which cannot name WHICH component failed. Cues
    // that supply nothing keep their existing table entry unchanged.
    const text = (cue && cue.accessibilityText) || CAPTIONS[cue && cue.id];
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

function uiCue(key, sev, text, ttl, audioOwnedByPresentation = false) {
  return Object.freeze({ key, sev, text, ttl, audioOwnedByPresentation });
}

function onboardingOwnsSignalAnnouncement(state, cue) {
  const onboarding = state && state.onboarding;
  return cue && cue.id === 'scenario.signal.pulse'
    && !!(onboarding && onboarding.active && !onboarding.finished);
}

function shapeForCue(id) {
  if (id === 'combat.player.kill') return 'cross';
  // PQ-023: distinct non-colour glyphs so a forced-colors or greyscale player can tell a site
  // failure from a restoration without reading the caption.
  if (id === 'world_site.damage') return 'bracket';
  if (id === 'world_site.recovery') return 'ring';
  if (id === 'massline.release.missed') return 'arc';
  if (id && (id.startsWith('tether.') || id.startsWith('massline.counter_tether.'))) return 'arc';
  if (id === 'shield.collapse') return 'ring';
  if (id === 'subsystem.disabled') return 'bracket';
  if (id && id.startsWith('scenario.comms.')) return 'diamond';
  if (id && id.startsWith('scenario.objective.')) return 'split';
  return 'pulse';
}

function miningAudioRate(cue) {
  if (!cue || !String(cue.id || '').startsWith('mining.')) return 1;
  const tags = Array.isArray(cue.tags) ? cue.tags : [];
  if (cue.id === 'mining.seam.quality') return tags.includes('on_seam') ? 1.16 : 0.84;
  if (cue.id === 'mining.drill.contact') {
    if (tags.includes('hard')) return 0.78;
    if (tags.includes('soft')) return 1.12;
  }
  return 1;
}

function doctrineAudioId(cue, fallback) {
  if (!cue || !String(cue.id || '').startsWith('combat.doctrine.')) return fallback;
  const doctrineId = ['interceptor_flyby', 'brawler_commit', 'tether_control_raider', 'ranged_disengager']
    .find((id) => Array.isArray(cue.tags) && cue.tags.includes(id));
  if (!doctrineId) return fallback;
  const stage = cue.id.endsWith('.setup') ? 'setup'
    : cue.id.endsWith('.break') ? 'break'
      : cue.id.endsWith('.withdraw') ? 'withdraw'
        : null;
  if (!stage) return fallback;
  return `presentation.combat.${doctrineId}.${stage}`;
}

function subsystemAudioId(cue, fallback) {
  if (!cue || cue.id !== 'subsystem.disabled') return fallback;
  const subsystemId = String(cue.subsystemId || '').toLowerCase();
  if (subsystemId.includes('drive') || subsystemId.includes('engine')) return 'presentation.subsystem.drive_disabled';
  if (subsystemId.includes('sensor') || subsystemId.includes('comms')) return 'presentation.subsystem.sensor_disabled';
  if (subsystemId.includes('weapon') || subsystemId.includes('hardpoint')) return 'presentation.subsystem.weapon_disabled';
  return fallback;
}

function doctrineCueOwnsAudio(cue) {
  if (finite(cue && cue.budgets && cue.budgets.voices, 0) <= 0) return false;
  // Full flee already owns a faction bark/combat-outcome voice. Phase recovery has no such owner.
  if (cue.id === 'combat.doctrine.withdraw' && cue.sourceEvent === 'ai:flee') return false;
  return true;
}

function isCombatAftermathCue(cue) {
  const id = String(cue && cue.id || '');
  return id === 'combat.damage.applied'
    || id === 'combat.near_miss'
    || id === 'combat.player.hit'
    || id === 'combat.player.kill'
    || id === 'shield.collapse';
}

function combatAftermathCueOwnsAudio(cue, state) {
  if (cue && cue.id === 'shield.collapse') return true;
  if (finite(cue && cue.budgets && cue.budgets.voices, 0) <= 0) return false;
  // shieldDown, combat:damage and entity:killed are the canonical physical voices. The only gap in
  // that raw chain is a projectile passing close to the player without impact.
  if (cue.id !== 'combat.near_miss') return false;
  return cue.targetId != null && cue.targetId === (state && state.playerId);
}

function combatAftermathGain(cue) {
  if (cue && cue.id === 'combat.near_miss') return 0.58;
  return round4(0.45 + clamp01(finite(cue && cue.importance, 0.5)) * 0.35);
}

function combatAftermathRate(cue) {
  if (cue && cue.id === 'combat.near_miss') return 1.06;
  return miningAudioRate(cue);
}

function shouldDuckAudio(cue) {
  if (isCombatAftermathCue(cue) || (cue && cue.id === 'subsystem.disabled')) return false;
  if (cue && String(cue.id || '').startsWith('scenario.')) return String(cue.id).startsWith('scenario.comms.');
  return (cue.tags || []).includes('comms') || finite(cue.importance, 0) >= 0.85;
}

function scenarioAudioPosition(cue) {
  if (cue && String(cue.id || '').startsWith('scenario.comms.')) return null;
  return cue && cue.position || null;
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

function tutorialOwnsOpeningPresentation(state) {
  const onboarding = state && state.onboarding;
  return !!(onboarding && onboarding.active && !onboarding.finished);
}
