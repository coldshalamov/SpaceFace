// Mining system (ARCHITECTURE §2.3 step 9). Owns asteroid extraction, ore ejection as
// collectible pickups, the magnet auto-collect pull, and wreck salvage.
//
// Drive: the player holds RIGHT-MOUSE / gamepad LT / touch MINE -> state.input.fireGroup === 2.
// The active mining beam
// runtime lives on state.player.miningBeam (gameState §3.5); we also honor a per-entity
// entity.data.miningBeam override if a future ships/outfitting pass writes one there.
//
// Each tick we shave miningBeam.dps*dt ore-HP off the soft-locked asteroid, accrue fractional
// ore, and release whole units in 25% ejection bursts (+ a final flush on destruction). Released
// ore either spawns drifting 'pickup' entities (magnet-pulled to the ship) or, when the beam has
// directToCargo, is credited straight to cargo. Salvage drains a wreck's pool the same way.
//
// Determinism (§0.5): all weighted ore rolls use state.rng() — never Math.random().
// Single-writer (§0.6): cargo is owned by the cargo module; we route ore through its addCargo
// helper / pickup:collected event and only fall back to a direct write while cargo is a stub.
import { ORES, ASTEROIDS, BEAMS, deriveAsteroidSeams } from '../data/mining.js';
import { COMMODITIES } from '../data/commodities.js';
import { MODULES } from '../data/modules.js';
import { queryNearbyEntities } from '../core/spatialQuery.js';
import {
  clearPickupAcceptanceRetry,
  finiteWholePickupAmount,
  PICKUP_ACCEPTANCE_RETRY_S,
  pickupAcceptanceRetryBlocks,
  resolvePickupAcceptance,
  setPickupAcceptanceRetry,
} from '../core/pickupAcceptance.js';
import { presentationAllowsPlayerFacingAction } from '../core/presentationAdmission.js';
import { verbAcceptsType } from '../data/interactionDescriptorCatalog.js';
import { describeEntity } from './interactionDescriptors.js';
import { resolveBeamVerb, spawnPayloadEntity, BEAM_CUE_IDS } from '../combat/industrialBeam.js';
import { actionForWreck, poolForAction } from '../data/salvageActions.js';
import { removeCargo, addCargo } from './cargo.js';
import {
  claimRichSeamOpportunity,
  recordFieldExtraction,
  richSeamOpportunityForEntity,
} from './fieldDepletion.js';

export const MAGNET_RANGE = 420; // wu pull radius for Mining 2.0's stronger ore vacuum
export const MAGNET_ACCEL = 900; // wu/s² authority toward the seek velocity (not absolute thrust)
// Relative approach speed while magnetized (added on top of the player's velocity so flybys collect).
export const MAGNET_APPROACH_MIN = 100;
export const MAGNET_APPROACH_MAX = 280;
export const RICH_CORE_CHANCE = 0.15;
export const RICH_CORE_DURATION_S = 3.5;
export const RICH_CORE_WINDOW_LO = 0.12;
export const RICH_CORE_WINDOW_HI = 0.22;
export const BULK_HAUL_MIN_U = 20;
export const BULK_HAUL_PAY_MULT = 0.8;
export const BULK_HAUL_REFINERY_FEE = 0.06;
export const RICH_SEAM_HEAT_MULT = 1.35;
// Fracture: the largest fragment is the CORE CHUNK — the piece that is visibly too big to scoop and
// therefore has to be dragged home on the Massline (GDD §5.5's loop-lock; grammar §9.5.2 amputation
// 2). Before this existed, chunk yield was `parentYield * ratio(0.35-0.5) / count(2-3)`, capped at
// about 8u against a 20u threshold — so `bulkHaulPayoutForChunk`, `_onDocked` and the whole
// `src/ui/prompts/bulkHaulTag.js` system were unreachable code that had never run once.
// The core chunk is bonus ore (the parent has already paid out its full `yieldU` as loose ore before
// it fractures), so raising it adds income to the tether path rather than moving income onto it.
export const BULK_CORE_YIELD_FRAC = 0.85;  // of parent yieldU; >= 25u parent makes a haulable core
export const BULK_CORE_RADIUS_FRAC = 0.58; // parent radii — reads as oversized next to its siblings
export const BULK_CORE_MASS_FRAC = 0.6;    // parent mass; strictly lighter than the rock you just
                                           // tethered, so this cannot load a line harder than the
                                           // parent already could (Massline stays unbreakable).
const PICKUP_RADIUS = 2.2;      // wu collectible radius
const PICKUP_COLLECT_PAD = 14;  // ship-radius pad for scoop contact (generous so flybys don't miss)
const PICKUP_TTL = 90;          // s before an uncollected pickup despawns
const SALVAGE_TIME_DEFAULT = 6; // s to fully drain a wreck if combat didn't set one
const MINEABLE_QUERY_RADIUS_PAD = 64;
const SEAM_HIT_RADIUS = 14;
// SEAM_YIELD_OFF is a YIELD fraction, as its name has always claimed. Off-seam beam time delivers
// 35% of the ore per point of rock removed, so spraying a rock destroys it for a third of its ore.
// It used to be applied to extraction SPEED instead, which left total yield per rock identical and
// made aim cost nothing but patience — a penalty the player cannot see and therefore cannot learn
// from (grammar §9.5.3). Speed keeps a much gentler penalty so the beam still visibly bites harder
// on a seam; the money is in the yield term.
export const SEAM_YIELD_OFF = 0.35;
export const SEAM_SPEED_OFF = 0.7;
const SEAM_HIT_EVENT_INTERVAL = 0.5;
const BEAM_PICKUP_DIRECT_RADIUS = 60;
const MINING_NOISE_GAIN_PER_S = 8;
const MINING_NOISE_DECAY_PER_S = 3;
const MINING_NOISE_DANGER = 70;
// Loud mining is supposed to attract interdiction (grammar §9.5.2 amputation 3). The attention meter
// accumulated and emitted `danger:miningNoise` to nobody, so "greed gets loud" was a UI label
// describing a mechanic that did not exist (src/ui/panels/moduleRisk.js:76 still says it does).
// dangerModel.js is a pure kernel with no bus, so the wiring goes through the impulse seam its
// runtime adapter already owns: sectorSim.js:103 subscribes to `sectorsim:impulse`.
const MINING_NOISE_DANGER_IMPULSE = 0.05;   // sector-field danger added per threshold crossing
const MINING_NOISE_IMPULSE_COOLDOWN_S = 45; // one crossing may pay once per this window

// --- beam heat / vent rhythm ------------------------------------------------
// Fallbacks for a beam runtime whose tierId is missing from the BEAMS table.
const BEAM_HEAT_MAX = 100;
const BEAM_HEAT_RATE = 22;
const BEAM_COOL_RATE = 55;
// The amber band: from here to the peg, releasing pays a vent bonus that scales with how deep into
// the band you went. Wide on purpose (38% of the gauge, ~1.7 s on mk1) — this is a rhythm, not a
// reaction test, and the player is also flying and aiming.
export const BEAM_VENT_BAND_LO = 0.62;
// Fraction of the pulse's own ore paid as the vent bonus at the very top of the band.
export const BEAM_VENT_BONUS_MAX = 0.75;
// Pegging the gauge locks the beam until heat falls back to this fraction, and the radiators dump
// slower once saturated — that multiplier is the whole cost of overheating, on top of forfeiting
// the pulse's stored vent bonus.
export const BEAM_OVERHEAT_RESET = 0.15;
export const BEAM_OVERHEAT_COOL_MULT = 0.6;
// Heat telemetry is a continuous signal on a 50 Hz bus; quantize it so HUD/audio consumers get a
// readable stream instead of one event per tick.
const BEAM_HEAT_EMIT_STEP = 0.02;

const ORE_BY_ID = new Map(ORES.map((o) => [o.id, o]));
const AST_BY_ID = new Map(ASTEROIDS.map((a) => [a.id, a]));
const BEAM_BY_ID = new Map(BEAMS.map((b) => [b.id, b]));
const COMMODITY_BY_ID = new Map(COMMODITIES.map((c) => [c.id, c]));
const MODULE_BY_ID = new Map(MODULES.map((m) => [m.id, m]));

export const mining = {
  name: 'mining',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers;
    this.registry = ctx.registry;
    this._pickupScratch = [];
    this._mineableScratch = [];
    this._diag = {
      pickupScans: 0,
      pickupSpatialQueries: 0,
      pickupCandidates: 0,
      pickupsMagnetized: 0,
      pickupsCollected: 0,
      targetSpatialQueries: 0,
      targetCandidates: 0,
    };

    this._beaming = false;     // was the player beam active last tick (start/stop edges)
    this._lockTargetId = null; // currently soft-locked asteroid/wreck id
    this._activeBeamLine = null;
    // Vent rhythm bookkeeping. `_pulseOre` is the ore (fractional units) this beam-on window has
    // already delivered; venting inside the amber band cashes a fraction of it as a bonus burst.
    this._pulseOre = 0;
    this._pulseTargetId = null;
    this._pulseCommodityId = null;
    this._heatEmitPct = -1;
    this._noiseImpulseAt = -Infinity;
    this._ventTaught = false;

    const bus = this.bus;
    // Combat spawns a wreck on ship death so the player can salvage it.
    bus.on('entity:killed', (p) => this._onShipDestroyed(p));
    // Combat loot drops → materialize as collectible pickups (shared pickup path).
    bus.on('loot:drop', (p) => this._onLootDrop(p));
    // Collect ore/cargo pickups into the hold (physics emits this on contact; we also self-emit).
    bus.on('pickup:collected', (p) => this._onPickupCollected(p));
    bus.on('dock:docked', (p) => this._onDocked(p));
    // Fresh sector → drop the stale beam lock (world regenerates the field).
    bus.on('sector:enter', () => { this._lockTargetId = null; this._stopBeam(); this._resetBeamHeat(); });
  },

  // ---- main per-tick update -------------------------------------------------
  update(dt, state) {
    resetMiningDiagnostics(this._diag);
    const player = state.entities.get(state.playerId);
    const firing = !!player && player.alive && !player.flags.docked
      && state.mode === 'flight' && state.input.fireGroup === 2;

    let beam = null;
    if (player) {
      beam = this._beamRuntime(player);
      // An overheated beam is locked out until the radiators catch up. Routing through _stopBeam
      // (rather than a silent skip) means the release edge fires: the beam visibly cuts out, the
      // target lock drops, and the vent evaluation runs and reports the forfeited bonus.
      if (firing && beam && !beam.overheated) this._runPlayerBeam(player, beam, dt, state);
      else this._stopBeam();
    }
    // Heat runs after the beam so the vent evaluated on a release edge reads the heat the player
    // actually let go at, and so cooling keeps ticking on every frame the beam is off.
    this._updateBeamHeat(beam, this._beaming, dt, state);
    this._updateRichCoreCharge(firing, dt, state);
    this._updateMiningNoise(this._beaming, dt, state);

    this._updatePickups(dt, state);
  },

  // ---- beam runtime resolution ----------------------------------------------
  // The beam's mutable runtime (directToCargo/tierId) lives on the player record;
  // dps/range come from the BEAMS tier table keyed by tierId.
  _beamRuntime(player) {
    const beam = (player.data && player.data.miningBeam) || this.state.player.miningBeam;
    if (!beam) return null;
    const tier = BEAM_BY_ID.get(beam.tierId) || BEAM_BY_ID.get('beam_mk1');
    if (tier) {
      if (!beam.dps) beam.dps = tier.dps;
      if (!beam.range) beam.range = tier.range;
      // Heat is beam-tier state, not a per-save authored value: default it from the table but let an
      // outfitting/module pass override it by writing the field first.
      if (!(beam.heatMax > 0)) beam.heatMax = tier.heatMax || BEAM_HEAT_MAX;
      if (!(beam.heatRate > 0)) beam.heatRate = tier.heatRate || BEAM_HEAT_RATE;
      if (!(beam.coolRate > 0)) beam.coolRate = tier.coolRate || BEAM_COOL_RATE;
    }
    if (!Number.isFinite(beam.heat)) beam.heat = 0;
    if (typeof beam.overheated !== 'boolean') beam.overheated = false;
    return beam;
  },

  _runPlayerBeam(player, beam, dt, state) {
    const target = this._acquireTarget(player, beam.range, state);
    if (!target) { this._stopBeam(); return; }

    const desc = describeEntity(state, target);
    if (target.data && target.data.worldSiteId && target.data.worldSiteComponentId) {
      return this._runWorldSiteBeam(player, target, desc, beam, dt, state);
    }
    const toolState = {
      mode: (state.ui && state.ui.beamMode) || (state.player && state.player.beamMode) || 'auto',
      selectedComponentId: (state.ui && state.ui.componentSelection && state.ui.componentSelection.componentId) || null,
      credits: (state.player && state.player.credits) || 0,
      cargo: (state.player && state.player.cargo && state.player.cargo.items) || {},
      receiver: (state.input && state.input.receiver) || null,
    };
    const resolved = resolveBeamVerb(desc, toolState);

    if (!this._beaming || this._lockTargetId !== target.id || this._activeVerb !== resolved.verb) {
      this._lockTargetId = target.id;
      this._activeVerb = resolved.verb;
      this.bus.emit('mining:start', {
        minerId: player.id,
        targetId: target.id,
        verb: resolved.verb,
        position: { x: target.pos.x, z: target.pos.z }
      });
    }
    this._beaming = true;

    this._activeBeamLine = beamLineFor(player, target);
    if (this._activeBeamLine) this._activeBeamLine.verb = resolved.verb;

    if (!resolved.ok) {
      this.bus.emit('beam:denied', { minerId: player.id, targetId: target.id, verb: resolved.verb, reason: resolved.reason });
      return;
    }

    const dps = (beam.dps || 18) * (beam.directToCargo ? 1.08 : 1);
    switch (resolved.verb) {
      case 'extract':
        if (target.type === 'wreck') this._drainWreck(player, target, dps, dt);
        else this.applyMining(target.id, dps, dt, player.id);
        break;

      case 'cut':
        // The authored Vesta freighter still presents the familiar CUT interaction, but its
        // value lives in salvage's finite source ledger. Never route that gesture through the
        // generic cut-panel payload generator, which would create a second pool beside the wreck.
        if (target.type === 'wreck' && target.data && target.data.salvageSourceKey) {
          this._drainWreck(player, target, dps, dt);
        } else {
          this._applyCut(player, target, resolved, dps, dt);
        }
        break;

      case 'repair':
        this._applyRepair(player, target, resolved, dps, dt);
        break;

      case 'transfer':
        this._applyTransfer(player, target, resolved, dps, dt);
        break;

      default:
        this.applyMining(target.id, dps, dt, player.id);
        break;
    }
  },

  _runWorldSiteBeam(player, target, descriptor, beam, dt, state) {
    const data = target.data || {};
    const componentId = data.worldSiteComponentId;
    const component = descriptor && descriptor.components
      && descriptor.components.find((candidate) => candidate.componentId === componentId);
    const sites = this.registry && this.registry.get && this.registry.get('asteroidSites');
    if (!presentationAllowsPlayerFacingAction(target, state)) {
      this.bus.emit('beam:denied', {
        minerId: player.id, targetId: target.id, verb: component && component.verb || 'extract',
        reason: 'presentation-unavailable',
      });
      return { ok: false, duplicate: false, reason: 'presentation-unavailable', moved: 0 };
    }
    if (component && component.active === false) {
      const reason = component.inactiveReason || 'operation-unavailable';
      this.bus.emit('beam:denied', {
        minerId: player.id,
        targetId: target.id,
        verb: component.verb || 'extract',
        reason,
      });
      return { ok: false, duplicate: false, reason, moved: 0 };
    }
    if (!component || !component.verb || !component.operationId
      || !sites || typeof sites.applyWorldSiteBeamOperation !== 'function') {
      this.bus.emit('beam:denied', {
        minerId: player.id,
        targetId: target.id,
        verb: component && component.verb || 'extract',
        reason: 'operation-unavailable',
      });
      return { ok: false, reason: 'operation-unavailable' };
    }

    const dps = (beam.dps || 18) * (beam.directToCargo ? 1.08 : 1);
    const amount = component.verb === 'transfer' ? 1 : dps * dt;
    const starting = !this._beaming || this._lockTargetId !== target.id || this._activeVerb !== component.verb;
    const result = sites.applyWorldSiteBeamOperation({
      siteId: data.worldSiteId,
      componentId,
      verb: component.verb,
      amount,
      requestStreamId: 'player-industrial-beam',
      requestSequence: state.tick | 0,
      tick: state.tick | 0,
    });

    this._lockTargetId = target.id;
    this._activeVerb = component.verb;
    this._beaming = true;
    this._activeBeamLine = beamLineFor(player, target);
    if (this._activeBeamLine) this._activeBeamLine.verb = component.verb;

    // A replay is a complete no-op: asteroidSites returns the same record and no intents; the
    // mining adapter likewise emits no synthetic success/start edge for the repeated receipt.
    if (result.duplicate) return result;
    if (!result.ok || !(result.moved > 0)) {
      this.bus.emit('beam:denied', {
        minerId: player.id,
        targetId: target.id,
        verb: component.verb,
        reason: result.reason || 'operation-no-progress',
      });
      return result;
    }

    if (starting) {
      this.bus.emit('mining:start', {
        minerId: player.id,
        targetId: target.id,
        verb: component.verb,
        position: { x: target.pos.x, z: target.pos.z },
      });
    }
    return result;
  },

  _applyCut(player, target, resolved, dps, dt) {
    const d = target.data || (target.data = {});
    d.cutProgress = (d.cutProgress || 0) + dps * dt;
    const threshold = Number(d.cutThreshold) || 50;
    if (d.cutProgress >= threshold) {
      d.cutProgress = 0;
      const action = actionForWreck(target);
      const pool = action ? poolForAction(action) : { cmdty_scrap_metal: 4 };
      const radius = Math.max(3, Math.round((target.radius || 10) * 0.35));
      const payload = spawnPayloadEntity(this.state, {
        pos: { x: target.pos.x + (this.state.rng ? (this.state.rng() - 0.5) * 6 : 0), z: target.pos.z + (this.state.rng ? (this.state.rng() - 0.5) * 6 : 0) },
        radius,
        mass: radius * 12,
        ownerId: player.id,
        factionId: player.factionId || 'player',
        salvagePool: pool,
        payloadType: action ? action.id : 'cut_panel'
      });
      this.bus.emit('salvage:cutComplete', { targetId: target.id, payloadId: payload.id });
    }
  },

  _applyRepair(player, target, resolved, dps, dt) {
    const heal = dps * dt * 2.0;
    const costCr = Math.ceil(heal * 1.5);
    // Credits have a SOLE writer (economy §0.6): charge through the sanctioned intent, never a
    // direct state.player.credits write from this system.
    if (costCr > 0) this.bus.emit('economy:chargeCredits', { amount: costCr, reason: 'beam:repair' });
    if (resolved.componentId) {
      const combat = this.registry && this.registry.get && this.registry.get('combat');
      if (combat && typeof combat.repair === 'function') {
        combat.repair(target.id, resolved.componentId, heal, 'beam_repair');
      }
    } else {
      if (target.hull != null && target.hullMax != null) {
        target.hull = Math.min(target.hullMax, target.hull + heal);
      }
      if (target.armorHp != null && target.armorMax != null) {
        target.armorHp = Math.min(target.armorMax, target.armorHp + heal);
      }
    }
    this.bus.emit('beam:repaired', { targetId: target.id, healAmount: heal });
  },

  _applyTransfer(player, target, resolved, dps, dt) {
    const hints = resolved.receiverHints || {};
    const qty = Math.max(1, Math.floor(dps * dt * 0.5));
    if (hints.type === 'site_machine' && hints.siteId && hints.machineId) {
      const sites = this.registry && this.registry.get && this.registry.get('asteroidSites');
      const items = (this.state.player && this.state.player.cargo && this.state.player.cargo.items) || {};
      const goodId = Object.keys(items)[0];
      if (sites && typeof sites.transferGoods === 'function' && goodId) {
        sites.transferGoods(hints.siteId, hints.machineId, goodId, qty, 'deposit');
      }
    } else if (hints.type === 'claim_store' && hints.bodyId) {
      const claims = this.registry && this.registry.get && this.registry.get('claims');
      const items = (this.state.player && this.state.player.cargo && this.state.player.cargo.items) || {};
      const goodId = Object.keys(items)[0];
      if (claims && typeof claims.deliverToClaim === 'function' && goodId) {
        claims.deliverToClaim(hints.bodyId, goodId, qty);
      }
    } else if (target && target.data) {
      const items = (this.state.player && this.state.player.cargo && this.state.player.cargo.items) || {};
      const goodId = Object.keys(items)[0];
      if (goodId) {
        const removed = removeCargo(this.state, goodId, qty);
        if (removed > 0) {
          target.data.salvagePool = target.data.salvagePool || {};
          target.data.salvagePool[goodId] = (target.data.salvagePool[goodId] || 0) + removed;
        }
      }
    }
    this.bus.emit('beam:transferred', { targetId: target.id });
  },

  _stopBeam() {
    if (!this._beaming) {
      this._activeBeamLine = null;
      return;
    }
    this._beaming = false;
    this._activeBeamLine = null;
    // Cash the vent BEFORE the stop receipt: the presentation orchestrator clears its mining cycle
    // on `mining:stop`, so a bonus emitted after it would arrive with no target to anchor to.
    this._resolveVent();
    this.bus.emit('mining:stop', { minerId: this.state.playerId, targetId: this._lockTargetId, position: null });
    this._lockTargetId = null;
  },

  // ---- heat / vent rhythm ---------------------------------------------------
  // The pulse-timing half of mining (grammar §9.5.1/§9.5.2). Heat climbs while the beam works, the
  // amber band opens near the top, and letting go inside it cashes part of the pulse as bonus ore.
  // Hold past the peg and the beam locks out, the radiators dump slowly, and the bonus is gone.
  // Perfect pulsing beats the old hold-forever rate; pegging the gauge every cycle is well below it.
  _updateBeamHeat(beam, working, dt, state) {
    if (!beam) return;
    const heatMax = beam.heatMax > 0 ? beam.heatMax : BEAM_HEAT_MAX;
    const prev = Number.isFinite(beam.heat) ? beam.heat : 0;
    const wasOverheated = !!beam.overheated;
    let heat;
    if (working && !wasOverheated) {
      const target = this._lockTargetId != null && state.entities && state.entities.get
        ? state.entities.get(this._lockTargetId)
        : null;
      const richSeam = target ? richSeamOpportunityForEntity(state, target) : null;
      const heatMult = richSeam && richSeam.state === 'open' ? RICH_SEAM_HEAT_MULT : 1;
      heat = Math.min(
        heatMax,
        prev + (beam.heatRate > 0 ? beam.heatRate : BEAM_HEAT_RATE) * heatMult * dt,
      );
    } else {
      const cool = (beam.coolRate > 0 ? beam.coolRate : BEAM_COOL_RATE)
        * (wasOverheated ? BEAM_OVERHEAT_COOL_MULT : 1);
      heat = Math.max(0, prev - cool * dt);
    }
    beam.heat = heat;
    const pct = heatMax > 0 ? heat / heatMax : 0;
    const prevPct = heatMax > 0 ? prev / heatMax : 0;

    if (!wasOverheated && prevPct < BEAM_VENT_BAND_LO && pct >= BEAM_VENT_BAND_LO) {
      this.bus.emit('mining:ventReady', {
        minerId: state.playerId, heat, heatMax, pct, bandLo: BEAM_VENT_BAND_LO,
      });
      // The chime itself now arrives via presentationOrchestrator's mining.vent.ready subscription
      // (-> presentation.mining.vent_ready -> sfx_vent_chime), which is the same sample this line
      // used to play directly. Measured: emitting both plays the chime twice on every crossing.
      // The alert below is NOT redundant — mining.vent.ready has no UI_CUES or CAPTIONS entry in
      // presentationAdapters, so the cue carries audio and vfx only.
      // The chime is the permanent signal. Spell it out in words until the player has actually
      // cashed a vent once — a rhythm nobody has been told about is just a beam that stops working.
      // Self-terminating on purpose: no counter to tune, no toast after you have learned the verb.
      if (!this._ventTaught) {
        this.bus.emit('alert', { key: 'mining-vent', sev: 'info', text: 'VENT READY — RELEASE BEAM', ttl: 1.6 });
      }
    }

    if (!wasOverheated && heat >= heatMax) {
      beam.overheated = true;
      const forfeited = this._pulseOre;
      this._pulseOre = 0; // pegging the gauge forfeits the stored bonus — that IS the mistake
      this.bus.emit('mining:overheated', { minerId: state.playerId, heatMax, forfeitedOreU: forfeited });
      // Same as the vent chime above: the warning sample now arrives through the orchestrator's
      // mining.heat.overheated subscription (-> presentation.mining.heat_warning ->
      // sfx_mining_heat_warning). Lane 5's handoff only named the vent chime, but this emit is the
      // identical defect and was measured doubling the same way once the cue was wired.
      this.bus.emit('alert', { key: 'mining-heat', sev: 'warn', text: 'BEAM OVERHEATED — VENTING', ttl: 2.4 });
    } else if (wasOverheated && pct <= BEAM_OVERHEAT_RESET) {
      beam.overheated = false;
      this.bus.emit('mining:beamCooled', { minerId: state.playerId, heat, heatMax, pct });
    }

    const quantized = Math.round(pct / BEAM_HEAT_EMIT_STEP) * BEAM_HEAT_EMIT_STEP;
    if (quantized !== this._heatEmitPct) {
      this._heatEmitPct = quantized;
      this.bus.emit('mining:heatChanged', {
        minerId: state.playerId,
        heat,
        heatMax,
        pct,
        band: beam.overheated ? 'overheated' : pct >= BEAM_VENT_BAND_LO ? 'vent' : pct > 0 ? 'warm' : 'cold',
        overheated: !!beam.overheated,
      });
    }
  },

  // Falling edge of the beam. Pays the vent bonus as real ore through the normal release path so it
  // lands in the hold, floats "+N <Ore>" like every other yield, and is worth exactly what the ore
  // is worth — no separate currency, no invisible stat.
  _resolveVent() {
    const pulseOre = this._pulseOre;
    const targetId = this._pulseTargetId;
    const commodityId = this._pulseCommodityId;
    this._pulseOre = 0;
    this._pulseTargetId = null;
    this._pulseCommodityId = null;
    const player = this.state.entities.get(this.state.playerId);
    const beam = player ? this._beamRuntime(player) : null;
    if (!beam || beam.overheated) return null;
    const heatMax = beam.heatMax > 0 ? beam.heatMax : BEAM_HEAT_MAX;
    const pct = heatMax > 0 ? (Number.isFinite(beam.heat) ? beam.heat : 0) / heatMax : 0;
    if (pct < BEAM_VENT_BAND_LO) return null;
    const depth = Math.min(1, (pct - BEAM_VENT_BAND_LO) / Math.max(1e-6, 1 - BEAM_VENT_BAND_LO));
    const bonusU = Math.floor(pulseOre * BEAM_VENT_BONUS_MAX * depth);
    if (!(bonusU > 0)) return null;
    this._ventTaught = true;
    const rock = targetId != null ? this.state.entities.get(targetId) : null;
    const pos = rock && rock.pos ? { x: rock.pos.x, z: rock.pos.z } : (player.pos ? { x: player.pos.x, z: player.pos.z } : null);
    const id = commodityId || 'cmdty_silicate';
    this.bus.emit('mining:yield', { commodityId: id, qty: bonusU, pos, minerId: player.id, ventBonus: true });
    const accepted = this._giveCargo(id, bonusU, player.id);
    if (accepted <= 0) this.bus.emit('cargo:full', { commodityId: id });
    this.bus.emit('mining:ventBonus', {
      minerId: player.id,
      asteroidId: targetId,
      commodityId: id,
      qty: bonusU,
      pulseOreU: pulseOre,
      heatPct: pct,
      depth,
    });
    this.bus.emit('audio:cue', { id: 'sfx_mining_seam_reward', gain: 0.7 });
    return { qty: bonusU, commodityId: id, depth };
  },

  _resetBeamHeat() {
    const player = this.state.entities.get(this.state.playerId);
    const beam = player ? this._beamRuntime(player) : null;
    this._pulseOre = 0;
    this._pulseTargetId = null;
    this._pulseCommodityId = null;
    this._heatEmitPct = -1;
    if (!beam) return;
    beam.heat = 0;
    beam.overheated = false;
  },

  _isValidMineableTarget(entity, ship, range, state = this.state) {
    if (!entity || !entity.alive) return false;
    // PQ-015: beam type-membership from the shared catalog (identical to the former asteroid|wreck
    // literal). The mined-out and range layers below are UNCHANGED.
    if (!verbAcceptsType('mine', entity.type)) return false;
    if (!presentationAllowsPlayerFacingAction(entity, state)) return false;
    if (entity.type === 'asteroid' && entity.data && entity.data.respawnAt != null) return false;
    const dx = entity.pos.x - ship.pos.x, dz = entity.pos.z - ship.pos.z;
    const dist = Math.hypot(dx, dz);
    return dist <= range + (entity.radius || 0);
  },

  // Nearest mineable target (asteroid or salvageable wreck) within range, biased toward aim.
  // While the beam is held, the first-acquired target stays locked until fire is released.
  _acquireTarget(ship, range, state) {
    const tetherTarget = activeMineableTetherTarget(state, ship, range);
    if (tetherTarget !== undefined) return tetherTarget;

    if (this._beaming && this._lockTargetId != null) {
      const locked = state.entities.get(this._lockTargetId);
      if (locked && this._isValidMineableTarget(locked, ship, range, state)) return locked;
      return null;
    }

    const selectedSiteIntent = state.input && state.input.actions && state.input.actions.siteBeam === true;
    const selected = selectedSiteIntent && state.player && state.player.targetId != null
      ? state.entities.get(state.player.targetId)
      : null;
    if (selected && selected.data && selected.data.worldSiteTargetable === true
      && this._isValidMineableTarget(selected, ship, range, state)) return selected;

    const aim = state.input.aimAngle || 0;
    const ax = Math.cos(aim), az = Math.sin(aim);
    let best = null, bestScore = -Infinity;
    const mineables = mineablesNearShip(state, ship, range + MINEABLE_QUERY_RADIUS_PAD, this._mineableScratch);
    this._diag.targetSpatialQueries = mineables === this._mineableScratch ? 1 : 0;
    this._diag.targetCandidates = mineables.length;
    for (const e of mineables) {
      if (!e.alive) continue;
      if (!verbAcceptsType('mine', e.type)) continue; // PQ-015: shared beam membership (asteroid|wreck)
      if (!presentationAllowsPlayerFacingAction(e, state)) continue;
      if (e.type === 'asteroid' && e.data && e.data.respawnAt != null) continue; // mined-out, awaiting respawn
      const dx = e.pos.x - ship.pos.x, dz = e.pos.z - ship.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > range + (e.radius || 0)) continue;
      const inv = 1 / (dist || 1);
      const dot = (dx * inv) * ax + (dz * inv) * az; // -1..1 alignment with the aim direction
      // alignment dominates so the cursor picks the rock; nearer breaks ties.
      const score = dot * 2 - dist / Math.max(1, range);
      if (score > bestScore) { bestScore = score; best = e; }
    }
    return best;
  },

  // ---- core extraction (callable so mining drones reuse the exact mechanic) --
  // Shave ore-HP, accrue fractional ore, release whole units on 25% ejection steps + final burst.
  // Returns the number of ore units released this call.
  applyMining(targetId, dps, dt, minerId = this.state.playerId) {
    const state = this.state;
    const ast = state.entities.get(targetId);
    if (!ast || !ast.alive || ast.type !== 'asteroid') return 0;
    const d = ast.data || (ast.data = {});
    // Core-anchored site rocks are beam-locked (ASTEROID_SITES_BRIEF §2): a developed asteroid
    // moves cargo through its physical port, never back out through the mining laser. Destroying
    // the rock would also orphan the machines inside it. asteroidSites.js stamps siteAnchored.
    if (d.siteAnchored) {
      this.bus.emit('mining:beamLocked', { asteroidId: ast.id, siteId: d.siteId || null });
      return 0;
    }
    this._ensureAsteroidSeams(ast);

    // Normalize ore-HP fields from whatever the spawner gave us (bootstrap uses oreHP/oreHPMax).
    const hpMax = d.oreHPMax || d.oreHP || ast.hullMax || 1;
    if (d.oreHPMax == null) d.oreHPMax = hpMax;
    if (d.oreHP == null) d.oreHP = (ast.hull != null && ast.hull > 0) ? ast.hull : hpMax;

    const def = AST_BY_ID.get(d.typeId) || AST_BY_ID.get('ast_common_rock');
    const yieldTotal = d.yieldU != null ? d.yieldU : this._defaultYield(def, hpMax);
    if (d.yieldU == null) d.yieldU = yieldTotal;
    if (d.isChunk && bulkChunkMass(ast) > BULK_HAUL_MIN_U) {
      this.bus.emit('mining:bulkRequiresTether', {
        asteroidId: ast.id,
        massU: bulkChunkMass(ast),
        commodityId: d.commodityId || this._dominantOre(def),
      });
      return 0;
    }
    if (d.pctEjected == null) d.pctEjected = 0;
    if (d._oreCarry == null) d._oreCarry = 0; // fractional ore awaiting a whole unit

    const miner = state.entities.get(minerId);
    const contact = this._beamContactPoint(ast, miner);
    const seam = this._seamYield(ast, contact);
    if (seam.onSeam) this._emitSeamHit(ast, d, state);

    const before = d.oreHP;
    d.oreHP = Math.max(0, d.oreHP - dps * seam.speedMult * dt);
    ast.hull = d.oreHP; // keep the hull alias in sync
    const lost = before - d.oreHP;
    if (lost <= 0) return 0;

    this.bus.emit('mining:tick', {
      contactPos: contact,
      oreType: this._dominantOre(def),
      seamHit: seam.onSeam,
      yieldMult: seam.yieldMult,
    });

    // Continuous ore delivery (Mining 2.0 feel fix — see design/WORLD_OVERHAUL_2_1.md §Mining).
    // Convert the ore-HP shaved THIS tick straight into fractional ore units and release whole
    // units as they accrue, so gain trickles in lockstep with beam damage. Previously ore only
    // ejected when cumulative loss crossed 25% thresholds (EJECT_STEP), so the player saw long
    // silent beams punctuated by lump "dumps".
    //
    // `d.yieldU` is the rock's MAXIMUM, not a guarantee: Σ(per-tick loss) == hpMax, so a rock burned
    // entirely on-seam pays its full yieldU, and every off-seam tick pays SEAM_YIELD_OFF of what
    // that material was worth. Aim is therefore worth ore. (It used to be worth only time — the
    // multiplier was applied to extraction speed, which cancelled out of the total.)
    const pctNow = 1 - d.oreHP / hpMax;
    const destroyed = d.oreHP <= 0;
    const yieldPerHp = hpMax > 0 ? yieldTotal / hpMax : 0;
    const delivered = lost * yieldPerHp * seam.yieldMult;
    d._oreCarry += delivered;
    let richClaim = null;
    if (destroyed && minerId === state.playerId) {
      richClaim = claimRichSeamOpportunity(state, {
        fieldId: d.fieldId,
        activityObjectSlotId: d.activityObjectSlotId,
        claimId: `player-rich-seam:${state.playerId}:${ast.id}:${state.tick | 0}`,
        claimedByKind: 'player',
        claimedById: state.playerId,
        resolution: 'exploit',
        simTime: state.simTime,
      });
      if (richClaim) {
        d._oreCarry += richClaim.claimedBonusU;
        d._richBonusPending = (d._richBonusPending || 0) + richClaim.claimedBonusU;
        d._richLotSource = {
          richOpportunityId: richClaim.opportunityId,
          richBonusU: richClaim.claimedBonusU,
          fieldId: d.fieldId,
          activityObjectSlotId: d.activityObjectSlotId,
          richResolution: richClaim.resolution || 'exploit',
          sourceOwner: 'player',
        };
        recordFieldExtraction(state, {
          fieldId: d.fieldId,
          sectorId: d.sectorId || (state.world && state.world.currentSectorId) || null,
          extractedU: richClaim.claimedBonusU,
          asteroidId: ast.id,
          simTime: state.simTime,
          tick: state.tick,
          destroyed: false,
          event: 'rich_seam_bonus',
          source: 'player_mining',
          jobId: richClaim.claimId,
        });
        this.bus.emit('field:richSeamWorked', {
          ...richClaim,
          minerId: state.playerId,
          asteroidId: ast.id,
          commodityId: d.commodityId || this._dominantOre(def),
          extractedU: richClaim.claimedBonusU,
        });
      }
    }
    // Vent bookkeeping: how much ore this beam-on window has produced so far, and from what. Only
    // the player runs the vent rhythm — mining drones reuse applyMining and must not bank a bonus.
    if (minerId === state.playerId) {
      this._pulseOre += delivered;
      this._pulseTargetId = ast.id;
      this._pulseCommodityId = d.commodityId || this._dominantOre(def);
    }
    d.pctEjected = destroyed ? 1 : pctNow; // kept in sync for telemetry/readers
    d.miningWear = destroyed ? 1 : pctNow; // render hint: 0 = pristine, 1 = spent (progressive shrink/darken)
    let releaseUnits = Math.floor(d._oreCarry + 1e-9);
    d._oreCarry -= releaseUnits;
    if (destroyed && d._oreCarry > 1e-6) {
      releaseUnits += 1; // flush the final fractional remainder so small rocks still yield their last unit
      d._oreCarry = 0;
    }

    if (releaseUnits > 0) this._releaseOre(ast, def, releaseUnits, miner, d._richLotSource, d);

    if (destroyed) {
      if (!d.isChunk) {
        this._fractureAsteroid(ast, def, miner);
        this._maybeExposeRichCore(ast, def, miner);
      }
      this.bus.emit('asteroid:destroyed', { id: ast.id, typeId: d.typeId || (def && def.id), pos: { x: ast.pos.x, z: ast.pos.z } });
      d.respawnAt = state.simTime + ((def && def.respawnSec) || 90); // world reads this to repopulate
      ast.alive = false;
    }
    return releaseUnits;
  },

  // Release `units` of ore: roll each unit's commodity from the asteroid's weighted table
  // (tier-gated, renormalized), then either credit cargo directly or eject magnet pickups.
  _releaseOre(ast, def, units, miner, richLotSource = null, asteroidData = null) {
    const beam = miner ? this._beamRuntime(miner) : null;
    const direct = !!(beam && beam.directToCargo) && miner && miner.id === this.state.playerId;
    const buckets = new Map(); // collapse a burst of N units into a few pickups / yields
    for (let i = 0; i < units; i++) {
      const id = this._rollOre(def, ast);
      if (!id) continue;
      buckets.set(id, (buckets.get(id) || 0) + 1);
    }
    for (const [commodityId, qty] of buckets) {
      this.bus.emit('mining:yield', { commodityId, qty, pos: { x: ast.pos.x, z: ast.pos.z }, minerId: miner ? miner.id : null });
      const richQty = richLotSource && asteroidData && asteroidData._richBonusPending > 0
        ? Math.min(qty, asteroidData._richBonusPending)
        : 0;
      if (direct) {
        if (qty > richQty) this._giveCargo(commodityId, qty - richQty, miner.id);
        let materializedRich = 0;
        if (richQty > 0) {
          const acceptedRich = this._giveCargo(commodityId, richQty, miner.id, { ...richLotSource, richQty });
          materializedRich += acceptedRich;
          const rejectedRich = Math.max(0, richQty - acceptedRich);
          if (rejectedRich > 0) {
            materializedRich += this._spawnPickup(
              ast,
              commodityId,
              rejectedRich,
              { ...richLotSource, richQty: rejectedRich },
            );
          }
        }
        if (asteroidData && materializedRich > 0) {
          asteroidData._richBonusPending = Math.max(0, asteroidData._richBonusPending - materializedRich);
        }
      } else {
        if (qty > richQty) this._spawnPickup(ast, commodityId, qty - richQty);
        if (richQty > 0) {
          const spawnedRich = this._spawnPickup(ast, commodityId, richQty, { ...richLotSource, richQty });
          if (asteroidData && spawnedRich > 0) asteroidData._richBonusPending -= spawnedRich;
        }
      }
    }
    if (asteroidData && asteroidData._richBonusPending <= 0) {
      asteroidData._richBonusPending = 0;
      asteroidData._richLotSource = null;
    }
  },

  // weighted, tier-filtered ore pick using the deterministic sim RNG
  _rollOre(def, ast) {
    const table = (def && def.oreTable) || { cmdty_silicate: 0.7, cmdty_ore_iron: 0.3 };
    const tierCap = (ast.data && ast.data.tierCap != null) ? ast.data.tierCap : (def ? def.tierCap : 0);
    let total = 0;
    const entries = [];
    for (const id in table) {
      const ore = ORE_BY_ID.get(id);
      if (ore && ore.tier > tierCap) continue; // gated out → renormalize by skipping
      total += table[id];
      entries.push([id, table[id]]);
    }
    if (!entries.length || total <= 0) return 'cmdty_silicate'; // never drop nothing
    let r = this.state.rng() * total;
    for (const [id, w] of entries) { r -= w; if (r <= 0) return id; }
    return entries[entries.length - 1][0];
  },

  // ---- pickups: spawn + magnet pull + collection ----------------------------
  _spawnPickup(srcEnt, commodityId, amount, lotSource = null) {
    if (!this.helpers || typeof this.helpers.spawnEntity !== 'function' || !(amount > 0)) return 0;
    const rng = this.state.rng;
    const ang = rng() * Math.PI * 2;
    const r = (srcEnt.radius || 6) + 2 + rng() * 4;
    const speed = 8 + rng() * 10;
    this.helpers.spawnEntity({
      type: 'pickup',
      pos: { x: srcEnt.pos.x + Math.cos(ang) * r, z: srcEnt.pos.z + Math.sin(ang) * r },
      vel: { x: Math.cos(ang) * speed, z: Math.sin(ang) * speed },
      radius: PICKUP_RADIUS, mass: 0.1, collides: true,
      data: {
        kind: 'ore', commodityId, amount, despawnAt: this.state.simTime + PICKUP_TTL,
        ...(lotSource ? { richLotSource: lotSource } : {}),
      },
    });
    return amount;
  },

  _updatePickups(dt, state) {
    const player = state.entities.get(state.playerId);
    if (!player) return;
    // Fitted tractor modules publish magnetRange through derived (ships.getDerivedStats);
    // fall back to the legacy player.magnetRange knobs so labs/tests without fittings still work.
    const magnet = playerPickupMagnetRange(state, player);
    // Generous scoop so scrap doesn't require golf-putting the nose onto a gem.
    const collectRadius = (player.radius || 6) + PICKUP_COLLECT_PAD;
    const queryRadius = Math.max(magnet, collectRadius) + PICKUP_RADIUS;
    const emptyPickupDomain = hasAuthoritativeEmptyPickupIndex(state);
    const pickups = emptyPickupDomain
      ? clearScratch(this._pickupScratch)
      : pickupsNearPlayer(state, player, queryRadius, this._pickupScratch);
    this._diag.pickupScans = 1;
    this._diag.pickupSpatialQueries = !emptyPickupDomain && pickups === this._pickupScratch ? 1 : 0;
    this._diag.pickupCandidates = pickups.length;
    this._diag.pickupsMagnetized = 0;
    this._diag.pickupsCollected = 0;
    const pvx = finiteNum(player.vel && player.vel.x);
    const pvz = finiteNum(player.vel && player.vel.z);
    for (const e of pickups) {
      if (!e.alive || e.type !== 'pickup') continue;
      const pickupData = e.data || {};
      const embargoUntil = Number(pickupData.pickupEmbargoUntil);
      if (Number.isFinite(embargoUntil) && state.simTime < embargoUntil) {
        // Jettison reaction mass must establish real separation before the generic magnet/direct
        // collector can reclaim it. `collides:false` on the authored spawn closes the parallel
        // physics-contact path during the same deterministic sim-time window.
        continue;
      }
      if (pickupAcceptanceRetryBlocks(
        pickupData,
        player.id,
        state.playerId,
        state.simTime,
      )) continue;
      if (pickupData.jettisonedCargo && e.collides === false) e.collides = true;
      const beamCollection = this._collectPickupOnBeamLine(e, player);
      if (beamCollection) {
        if (beamCollection.accepted > 0 || beamCollection.legacyFullConsume) this._diag.pickupsCollected++;
        continue;
      }
      const dx = player.pos.x - e.pos.x, dz = player.pos.z - e.pos.z;
      const dist = Math.hypot(dx, dz) || 1e-4;
      if (dist <= magnet) {
        // Homing vacuum: inherit player velocity, then accelerate relative approach.
        // An absolute speed cap used to make combat flybys miss (player ~combatSpeed, pickups
        // clamped below the ship's speed so they couldn't catch up). Cap relative approach only.
        const nx = dx / dist, nz = dz / dist;
        const rangeT = clamp01(dist / Math.max(1, magnet));
        const approach = MAGNET_APPROACH_MIN + (MAGNET_APPROACH_MAX - MAGNET_APPROACH_MIN) * rangeT;
        // Closer scrap rushes in harder so final scoop doesn't feel floaty.
        const closeBoost = dist < collectRadius * 2.5 ? 1.35 : 1;
        const desiredVx = pvx + nx * approach * closeBoost;
        const desiredVz = pvz + nz * approach * closeBoost;
        const dvx = desiredVx - finiteNum(e.vel && e.vel.x);
        const dvz = desiredVz - finiteNum(e.vel && e.vel.z);
        const need = Math.hypot(dvx, dvz);
        const maxDv = MAGNET_ACCEL * dt * (closeBoost > 1 ? 1.6 : 1);
        if (!(e.vel)) e.vel = { x: 0, z: 0 };
        if (need <= maxDv || need < 1e-6) {
          e.vel.x = desiredVx;
          e.vel.z = desiredVz;
        } else {
          const s = maxDv / need;
          e.vel.x = finiteNum(e.vel.x) + dvx * s;
          e.vel.z = finiteNum(e.vel.z) + dvz * s;
        }
        this._diag.pickupsMagnetized++;
      }
      // direct collect on overlap (physics also emits pickup:collected on contact; idempotent via alive guard)
      if (dist <= collectRadius) {
        const acceptance = this._collectPickupViaEvent(e, player);
        if (acceptance.accepted > 0 || acceptance.legacyFullConsume) this._diag.pickupsCollected++;
      }
    }
    state.miningRuntime = state.miningRuntime || {};
    state.miningRuntime.diagnostics = this._diag;
  },

  _onPickupCollected(p) {
    if (!p || !p.commodityId) return;
    if (p.collectorId !== this.state.playerId) return; // drones manage their own holds
    const cargoSys = this.registry && this.registry.get && this.registry.get('cargo');
    if (cargoSys && typeof cargoSys.addCargo === 'function') return; // cargo owns collected pickups
    const kind = p.kind || 'ore';
    if (kind === 'credits' || kind === 'module') return; // economy/ships own those
    const requested = finiteWholePickupAmount(p.amount);
    if (requested <= 0) {
      p.acceptedAmount = 0;
      p.rejectedAmount = 0;
      p.invalidAmount = true;
      return;
    }
    const accepted = this._giveCargo(p.commodityId, requested, p.collectorId, p.richLotSource);
    p.acceptedAmount = accepted;
    p.rejectedAmount = Math.max(0, requested - accepted);
    if (p.rejectedAmount > 0) {
      p.acceptanceRetryAt = (this.state.simTime || 0) + PICKUP_ACCEPTANCE_RETRY_S;
    }
    if (accepted <= 0) this.bus.emit('cargo:full', { commodityId: p.commodityId });
  },

  // ---- wreck salvage --------------------------------------------------------
  // Combat kills leave a SALVAGE WRECK (the glowing debris mass) with a beam-drain pool.
  // Pocket scrap also spawns as magnetized pickups via loot:drop / lootShards — those fly in.
  // The wreck itself stays put; hold mining beam on it to strip the remaining salvagePool.
  _onShipDestroyed(p) {
    if (!p) return;
    const isShip = p.type === 'ship' || p.victimClass === 'ship';
    if (!isShip) return;
    const pos = p.pos || { x: 0, z: 0 };
    const aftermathOwner = this.registry && typeof this.registry.get === 'function'
      ? this.registry.get('aftermathWrecks')
      : null;
    const aftermathPlan = aftermathOwner && typeof aftermathOwner.immediateWreckPlan === 'function'
      ? aftermathOwner.immediateWreckPlan(p)
      : null;
    // A duplicate kill notification for a marker whose wreck is already live must not mint a second
    // salvage pool. The durable owner has already checked entity liveness for this exact marker.
    if (aftermathPlan && aftermathPlan.entityId != null) {
      return this.state.entities && this.state.entities.get(aftermathPlan.entityId) || null;
    }

    const spec = aftermathPlan && aftermathPlan.spec || {
      type: 'wreck', pos: { x: pos.x, z: pos.z }, radius: 7, mass: 1e6,
      hull: 1, hullMax: 1,
      data: {
        parentType: 'ship',
        kind: 'wreck',
        label: 'Salvage Wreck',
        scanLabel: 'Salvage Wreck',
        name: 'Salvage Wreck',
        loot: [],
        salvagePool: this._lootToPool(),
        salvageTimeLeft: SALVAGE_TIME_DEFAULT,
      },
    };
    const wreck = this.helpers.spawnEntity(spec);
    if (wreck && aftermathPlan && aftermathOwner && typeof aftermathOwner.bindImmediateWreck === 'function') {
      aftermathOwner.bindImmediateWreck(aftermathPlan.markerId, wreck);
    }
    return wreck;
  },

  // Default salvage contents for a destroyed ship (scrap + a chance of electronics).
  _lootToPool() {
    const rng = this.state.rng;
    const pool = { cmdty_scrap_metal: 2 + Math.floor(rng() * 3) };
    if (rng() < 0.5) pool.cmdty_salvage_electronics = 1;
    return pool;
  },

  _drainWreck(player, wreck, dps, dt) {
    const d = wreck.data || (wreck.data = {});
    const sourceKey = typeof d.salvageSourceKey === 'string' ? d.salvageSourceKey : null;
    const salvageApi = sourceKey && this.helpers && this.helpers.salvage;
    const source = salvageApi && typeof salvageApi.source === 'function' ? salvageApi.source(sourceKey) : null;
    // An authored source is a mirrored physical wreck, never an independent loot pool. Refresh
    // from salvage's ledger before calculating the beam release so a cutter/player race cannot
    // create value from a stale entity copy.
    if (sourceKey) {
      if (!source || source.extracted || source.remainingQty <= 0) {
        d.salvagePool = {};
        d._salvaged = true;
        wreck.alive = false;
        this._stopBeam();
        return;
      }
      d.salvagePool = { ...source.remainingPool };
    }
    let pool = d.salvagePool || (d.salvagePool = {});
    if (d.salvageTimeLeft == null) d.salvageTimeLeft = SALVAGE_TIME_DEFAULT;
    if (d._total == null) d._total = Object.values(pool).reduce((a, b) => a + b, 0);
    if (d._carry == null) d._carry = 0;

    // drain proportionally over the salvage time, scaled by beam dps relative to the mk1 baseline
    const frac = (dt * Math.max(1, dps) / 18) / Math.max(0.001, SALVAGE_TIME_DEFAULT);
    d._carry += (d._total || 0) * frac;
    d.salvageTimeLeft = Math.max(0, d.salvageTimeLeft - dt);

    let remaining = Object.values(pool).reduce((a, b) => a + b, 0);
    let release = Math.floor(d._carry);
    if (d.salvageTimeLeft <= 0) release = remaining; // flush the rest at the end
    if (release > remaining) release = remaining;

    let got = {};
    let n = release;
    if (sourceKey) {
      const requested = {};
      for (const id of Object.keys(pool).sort((a, b) => a.localeCompare(b))) {
        if (n <= 0) break;
        const take = Math.min(pool[id], n);
        if (take > 0) { requested[id] = take; n -= take; }
      }
      const drained = salvageApi && typeof salvageApi.drainSource === 'function'
        ? salvageApi.drainSource({ sourceKey, minerId: player && player.id, requested })
        : null;
      got = drained && drained.ok && drained.taken ? drained.taken : {};
      const takenTotal = Object.values(got).reduce((sum, qty) => sum + (Number(qty) || 0), 0);
      d._carry = Math.max(0, d._carry - takenTotal);
      pool = drained && drained.source && drained.source.remainingPool
        ? { ...drained.source.remainingPool }
        : {};
      d.salvagePool = pool;
      remaining = drained && drained.source && Number.isFinite(drained.source.remainingQty)
        ? drained.source.remainingQty
        : 0;
    } else {
      for (const id in pool) {
        if (n <= 0) break;
        const take = Math.min(pool[id], n);
        if (take > 0) { pool[id] -= take; got[id] = (got[id] || 0) + take; n -= take; d._carry -= take; }
      }
      remaining = Object.values(pool).reduce((a, b) => a + b, 0);
    }
    for (const id in got) {
      this.bus.emit('mining:yield', { commodityId: id, qty: got[id], pos: { x: wreck.pos.x, z: wreck.pos.z }, minerId: player ? player.id : null });
      this._spawnPickup(wreck, id, got[id]);
    }

    if (d.salvageTimeLeft <= 0 || remaining <= 0) {
      this.bus.emit('salvage:completed', {
        wreckId: wreck.id,
        markerId: d.markerId || d.provenance && d.provenance.markerId || null,
        loot: got,
      });
      // Mark recovered so the intervention loop reports recovered=true (it reads e.data._salvaged).
      // _drainWreck only runs while the player's salvage beam is on the wreck, so reaching completion
      // here means the player did recover cargo (vs an untouched wreck despawning).
      d._salvaged = true;
      wreck.alive = false;
      this._stopBeam();
    }
  },

  _onLootDrop(p) {
    if (!p) return;
    const pos = p.pos || { x: 0, z: 0 };
    const stub = { pos: { x: pos.x, z: pos.z }, radius: 4 };
    for (const it of (p.items || [])) {
      if (it && it.commodityId) this._spawnPickup(stub, it.commodityId, it.qty || 1);
    }
  },

  _fractureAsteroid(ast, def, miner) {
    if (!ast || !ast.data || ast.data.isChunk) return;
    const rng = this.state.rng;
    const parentRadius = Math.max(1, ast.radius || (ast.data && ast.data.size) || 6);
    const parentHp = Math.max(1, ast.data.oreHPMax || ast.hullMax || ast.hull || 1);
    const parentYield = Math.max(1, ast.data.yieldU || this._defaultYield(def, parentHp));
    const count = 2 + Math.floor(rng() * 2);
    const parentSeams = Array.isArray(ast.data.seams) ? ast.data.seams : [];
    const seamCount = Math.max(1, parentSeams.length - 1);
    // Chunk 0 is the CORE CHUNK when the parent was big enough to leave one behind. It carries a
    // yield the hold cannot swallow, which is the only thing that makes the tether-haul path — and
    // its already-built prompt, payout and refinery dock handler — reachable at all.
    const coreYield = Math.round(parentYield * BULK_CORE_YIELD_FRAC);
    const hasCore = coreYield > BULK_HAUL_MIN_U;
    for (let i = 0; i < count; i++) {
      const isCore = hasCore && i === 0;
      const ratio = isCore ? BULK_CORE_RADIUS_FRAC : 0.35 + rng() * 0.15;
      const radius = parentRadius * ratio;
      const ang = (Math.PI * 2 * i) / count + rng() * 0.6;
      const dist = parentRadius * 0.45 + radius + 4;
      const oreHP = isCore
        ? Math.max(4, Math.round(parentHp * BULK_CORE_YIELD_FRAC))
        : Math.max(4, Math.round(parentHp * ratio / count));
      const yieldU = isCore ? coreYield : Math.max(1, Math.round(parentYield * ratio / count));
      const chunk = this.helpers.spawnEntity({
        type: 'asteroid',
        pos: {
          x: ast.pos.x + Math.cos(ang) * dist,
          z: ast.pos.z + Math.sin(ang) * dist,
        },
        radius,
        // A core chunk is deliberately heavy — the sluggish tow IS the mechanic — but it is capped
        // strictly below the parent the player was already able to tether, so this cannot put a load
        // on the Massline that the parent could not. Lines still do not snap under haul.
        mass: isCore
          ? Math.max(40, (ast.mass || 200) * BULK_CORE_MASS_FRAC)
          : Math.max(40, (ast.mass || 200) * ratio / count),
        angVel: (rng() - 0.5) * (isCore ? 0.18 : 0.45),
        hull: oreHP,
        hullMax: oreHP,
        collides: true,
        data: {
          typeId: ast.data.typeId || (def && def.id) || 'ast_common_rock',
          tier: ast.data.tier,
          tierCap: ast.data.tierCap,
          oreHP,
          oreHPMax: oreHP,
          yieldU,
          bulkMassU: yieldU,
          commodityId: this._dominantOre(def),
          basePrice: commodityBasePrice(this._dominantOre(def)),
          size: radius,
          pctEjected: 0,
          respawnSec: ast.data.respawnSec,
          fieldId: ast.data.fieldId,
          isChunk: true,
          bulkCore: isCore,
        },
      });
      chunk.data.seams = inheritChunkSeams(parentSeams, seamCount, radius, i);
      if (ast.data.scanHighlightUntil != null && ast.data.scanHighlightUntil > this.state.simTime) {
        chunk.data.scanHighlightUntil = ast.data.scanHighlightUntil;
        chunk.data.scanOreGlyph = ast.data.scanOreGlyph;
      }
      this.bus.emit('asteroid:chunked', {
        parentId: ast.id,
        chunkId: chunk.id,
        minerId: miner ? miner.id : null,
        massU: yieldU,
        bulkCore: isCore,
        commodityId: chunk.data.commodityId,
      });
    }
  },

  _maybeExposeRichCore(ast, def, miner) {
    const plan = richCorePlan(this.state && this.state.meta && this.state.meta.seed, ast, def);
    if (!plan.hasCore) return null;
    const runtime = this.state.player.mining || (this.state.player.mining = {});
    const core = {
      id: 'rich_core:' + ast.id,
      asteroidId: ast.id,
      commodityId: plan.commodityId,
      multiplier: plan.multiplier,
      windowPct: clamp(plan.windowPct + playerModSum(this.state, 'richCoreRingPctBonus'), RICH_CORE_WINDOW_LO, 0.5),
      durationS: RICH_CORE_DURATION_S,
      openedAt: this.state.simTime,
      expiresAt: this.state.simTime + RICH_CORE_DURATION_S,
      chargeStartedAt: null,
      resolved: false,
    };
    runtime.richCore = core;
    this.bus.emit('mining:richCoreExposed', {
      asteroidId: ast.id,
      commodityId: core.commodityId,
      multiplier: core.multiplier,
      windowPct: core.windowPct,
      durationS: core.durationS,
      minerId: miner ? miner.id : null,
    });
    return core;
  },

  _updateRichCoreCharge(firing, dt, state) {
    const runtime = state && state.player && state.player.mining;
    const core = runtime && runtime.richCore;
    if (!core || core.resolved) return;
    if (state.simTime > core.expiresAt) {
      this._resolveRichCore(core, 1);
      return;
    }
    if (firing) {
      if (core.chargeStartedAt == null) {
        core.chargeStartedAt = state.simTime;
        this.bus.emit('mining:richCoreChargeStart', { asteroidId: core.asteroidId });
      }
      core.chargeT = clamp(state.simTime - core.chargeStartedAt, 0, core.durationS);
      return;
    }
    if (core.chargeStartedAt != null) {
      const progress = clamp((state.simTime - core.chargeStartedAt) / Math.max(0.001, core.durationS), 0, 1);
      this._resolveRichCore(core, progress);
    }
  },

  _resolveRichCore(core, progress) {
    if (!core || core.resolved) return null;
    const half = Math.max(0, Number(core.windowPct) || RICH_CORE_WINDOW_LO) * 0.5;
    const hit = Math.abs((Number(progress) || 0) - 0.5) <= half;
    core.resolved = true;
    let qty = 0;
    if (hit) {
      qty = Math.max(3, Math.min(8, Math.round(core.multiplier || 3)));
      this._giveCargo(core.commodityId, qty, this.state.playerId);
      const rock = this.state.entities && this.state.entities.get && this.state.entities.get(core.asteroidId);
      const pos = rock && rock.pos
        ? { x: rock.pos.x, z: rock.pos.z }
        : null;
      this.bus.emit('mining:yield', {
        commodityId: core.commodityId, qty, pos, minerId: this.state.playerId, richCore: true,
      });
      this.bus.emit('mining:richCoreCompleted', { asteroidId: core.asteroidId, commodityId: core.commodityId, qty, multiplier: qty });
    } else {
      this.bus.emit('mining:richCoreFizzle', { asteroidId: core.asteroidId, commodityId: core.commodityId });
      this.bus.emit('audio:cue', { id: 'mining_core_fizzle' });
    }
    if (this.state.player && this.state.player.mining && this.state.player.mining.richCore === core) {
      delete this.state.player.mining.richCore;
    }
    return { hit, qty, commodityId: core.commodityId };
  },

  _onDocked(p) {
    const stationId = p && p.stationId;
    if (!stationId || !isRefineryStation(this.state, stationId)) return;
    const chunk = this._activeBulkChunk();
    if (!chunk) return;
    const payout = bulkHaulPayoutForChunk(chunk);
    if (!(payout.credits > 0)) return;
    chunk.alive = false;
    this.bus.emit('economy:grantCredits', { amount: payout.credits, reason: 'mining:bulk_haul' });
    this.bus.emit('mining:bulkHaulDelivered', {
      stationId,
      chunkId: chunk.id,
      massU: payout.massU,
      commodityId: payout.commodityId,
      basePrice: payout.basePrice,
      gross: payout.gross,
      fee: payout.fee,
      credits: payout.credits,
    });
  },

  _activeBulkChunk() {
    const state = this.state;
    const tether = state.player && state.player.tether;
    const ids = [];
    if (tether && tether.targetId != null) ids.push(tether.targetId);
    if (tether && tether.attachedId != null) ids.push(tether.attachedId);
    const attach = state.combat && state.combat.attachments;
    const byId = attach && attach.byId || {};
    for (const id in byId) {
      const a = byId[id];
      if (a && (a.ownerId === state.playerId || a.sourceId === state.playerId) && (a.targetId != null || a.bodyBId != null)) {
        ids.push(a.targetId != null ? a.targetId : a.bodyBId);
      }
    }
    for (const id of ids) {
      const e = state.entities.get(id);
      if (isBulkHaulChunk(e)) return e;
    }
    return null;
  },

  _collectPickupOnBeamLine(pickup, player) {
    const line = this._activeBeamLine;
    if (!line || !pickup || !pickup.data || !pickup.data.commodityId) return false;
    if (pointSegmentDistanceSq(pickup.pos.x, pickup.pos.z, line.ax, line.az, line.bx, line.bz) >
      BEAM_PICKUP_DIRECT_RADIUS * BEAM_PICKUP_DIRECT_RADIUS) return false;
    return this._collectPickupViaEvent(pickup, player);
  },

  _collectPickupViaEvent(pickup, player) {
    if (pickupAcceptanceRetryBlocks(
      pickup && pickup.data,
      player && player.id,
      this.state && this.state.playerId,
      this.state && this.state.simTime,
    )) {
      return {
        accepted: 0,
        rejected: finiteWholePickupAmount(pickup.data.amount),
        legacyFullConsume: false,
        deferred: true,
      };
    }
    const requested = finiteWholePickupAmount(pickup && pickup.data && pickup.data.amount);
    if (requested <= 0) {
      clearPickupAcceptanceRetry(pickup && pickup.data);
      pickup.alive = false;
      return { accepted: 0, rejected: 0, legacyFullConsume: false, invalidAmount: true };
    }
    const payload = {
      pickupId: pickup.id,
      collectorId: player.id,
      kind: pickup.data.kind || 'ore',
      amount: requested,
      commodityId: pickup.data.commodityId,
      pos: { x: pickup.pos.x, z: pickup.pos.z },
      ...(pickup.data.richLotSource ? {
        richLotSource: {
          ...pickup.data.richLotSource,
          richQty: Math.min(requested, Math.max(0, Math.floor(Number(pickup.data.richLotSource.richQty) || 0))),
        },
      } : {}),
    };
    this.bus.emit('pickup:collected', payload);
    const acceptance = resolvePickupAcceptance(payload, requested);
    if (acceptance.rejected <= 0) {
      pickup.alive = false;
      clearPickupAcceptanceRetry(pickup.data);
    } else {
      if (acceptance.accepted > 0) pickup.data.amount = acceptance.rejected;
      const ownerRetryAt = Number(payload.acceptanceRetryAt);
      setPickupAcceptanceRetry(
        pickup.data,
        player && player.id,
        Number.isFinite(ownerRetryAt)
          ? ownerRetryAt
          : (this.state.simTime || 0) + PICKUP_ACCEPTANCE_RETRY_S,
      );
    }
    return acceptance;
  },

  // ---- cargo bridge (single-writer aware) -----------------------------------
  // Prefer the cargo module's writer; fall back to a direct, conservative write while cargo is a
  // stub so the early loop (mine → fill hold) is demonstrable. When cargo becomes real it wins.
  _giveCargo(commodityId, qty, collectorId, lotSource = null) {
    qty = finiteWholePickupAmount(qty);
    if (qty <= 0) return 0;
    const cargoSys = this.registry && this.registry.get && this.registry.get('cargo');
    if (cargoSys && typeof cargoSys.addCargo === 'function') {
      return cargoSys.addCargo(commodityId, qty, lotSource);
    }
    if (collectorId != null && collectorId !== this.state.playerId) return 0;
    return this._directAddCargo(commodityId, qty, lotSource);
  },

  _directAddCargo(commodityId, qty, lotSource = null) {
    qty = finiteWholePickupAmount(qty);
    if (qty <= 0) return 0;
    const cargo = this.state.player.cargo;
    if (!cargo) return 0;
    if (!cargo.items) cargo.items = {};
    const ore = ORE_BY_ID.get(commodityId);
    const vol = (ore && ore.vol) || 1;
    const mass = (ore && ore.mass) || 1;
    const cap = Number.isFinite(cargo.capVolume) ? cargo.capVolume : 40;
    const free = cap - (cargo.usedVolume || 0);
    const accepted = Math.max(0, Math.min(qty, Math.floor(free / vol)));
    if (accepted <= 0) return 0;
    cargo.items[commodityId] = (cargo.items[commodityId] || 0) + accepted;
    cargo.usedVolume = (cargo.usedVolume || 0) + accepted * vol;
    cargo.usedMass = (cargo.usedMass || 0) + accepted * mass;
    if (lotSource && typeof lotSource.richOpportunityId === 'string') {
      if (!Array.isArray(cargo.richLots)) cargo.richLots = [];
      const lotId = lotSource.lotId || `rich-lot:${lotSource.richOpportunityId}`;
      const existing = cargo.richLots.find((row) => row && row.lotId === lotId);
      const lot = {
        lotId,
        commodityId,
        qty: accepted,
        richOpportunityId: lotSource.richOpportunityId,
        richBonusU: Math.max(0, Math.floor(Number(lotSource.richBonusU) || 0)),
        fieldId: lotSource.fieldId == null ? null : String(lotSource.fieldId),
        activityObjectSlotId: lotSource.activityObjectSlotId == null ? null : String(lotSource.activityObjectSlotId),
        resolution: lotSource.richResolution || lotSource.resolution || null,
        sourceOwner: lotSource.sourceOwner || 'player',
      };
      if (existing) existing.qty += accepted; else cargo.richLots.push(lot);
    }
    this.bus.emit('cargo:changed', { cargo, usedU: cargo.usedVolume, massT: cargo.usedMass });
    return accepted;
  },

  // ---- helpers --------------------------------------------------------------
  _updateMiningNoise(beaming, dt, state) {
    if (!state || !state.player) return;
    const before = clamp(state.player.miningNoise || 0, 0, 100);
    const delta = (beaming ? MINING_NOISE_GAIN_PER_S : -MINING_NOISE_DECAY_PER_S) * dt;
    const after = clamp(before + delta, 0, 100);
    state.player.miningNoise = after;
    if (before <= MINING_NOISE_DANGER && after > MINING_NOISE_DANGER) {
      this.bus.emit('danger:miningNoise', { level: after, threshold: MINING_NOISE_DANGER });
      this._raiseMiningNoiseDanger(after, state);
    }
  },

  // The attention meter's consequence. `danger:miningNoise` had no subscriber anywhere in src/, so
  // the game told the player (src/ui/panels/moduleRisk.js:76) that sustained beam use is dangerous
  // and then made it free. dangerModel.js is a pure kernel, so this goes through the impulse seam
  // its runtime adapter already owns — sectorSim.js subscribes to `sectorsim:impulse` and folds the
  // delta into the sector's danger node. Rising danger lowers effective regional security, which
  // encounterDirector reads straight into its combat-pressure accrual: loud mining brings hunters.
  //
  // Rate-limited because the meter can re-cross the threshold every few seconds of beam time and an
  // unbounded drip would let one mining session dominate a sector's whole field history.
  _raiseMiningNoiseDanger(level, state) {
    const now = Number(state.simTime) || 0;
    if (now - this._noiseImpulseAt < MINING_NOISE_IMPULSE_COOLDOWN_S) return;
    this._noiseImpulseAt = now;
    const sectorId = state.world && state.world.currentSectorId;
    if (!sectorId) return;
    this.bus.emit('sectorsim:impulse', {
      kind: 'mining_noise',
      sectorId,
      danger: MINING_NOISE_DANGER_IMPULSE,
    });
  },

  _ensureAsteroidSeams(ast) {
    const d = ast && ast.data || null;
    if (!d) return [];
    if (Array.isArray(d.seams)) return d.seams;
    d.seams = deriveAsteroidSeams(this.state.meta.seed, ast.id, ast.radius || d.size || 1, {
      hash32: this.helpers && this.helpers.hash32,
      mulberry32: this.helpers && this.helpers.mulberry32,
    });
    return d.seams;
  },

  _beamContactPoint(ast, miner) {
    if (!miner) return { x: ast.pos.x, z: ast.pos.z };
    const aim = this.state.input && Number.isFinite(this.state.input.aimAngle)
      ? this.state.input.aimAngle
      : Math.atan2(ast.pos.z - miner.pos.z, ast.pos.x - miner.pos.x);
    const hit = rayCircleContact(miner.pos, aim, ast.pos, ast.radius || 6);
    return hit || this._surfacePoint(ast, miner);
  },

  // Aim is a bet, not decoration: `yieldMult` is what the rock PAYS for the material you remove,
  // `speedMult` is only how fast the beam chews. Off-seam therefore burns a rock down at nearly full
  // speed for a third of its ore — a loss the player can see in the float text, which is the point.
  _seamYield(ast, contact) {
    const seams = this._ensureAsteroidSeams(ast);
    const off = { onSeam: false, yieldMult: SEAM_YIELD_OFF, speedMult: SEAM_SPEED_OFF };
    if (!seams.length || !contact) return off;
    const hitR2 = SEAM_HIT_RADIUS * SEAM_HIT_RADIUS;
    for (const seam of seams) {
      const p = seamWorldPoint(ast, seam);
      const dx = contact.x - p.x;
      const dz = contact.z - p.z;
      if (dx * dx + dz * dz <= hitR2) return { onSeam: true, yieldMult: 1, speedMult: 1 };
    }
    return off;
  },

  _emitSeamHit(ast, data, state) {
    const last = data._lastSeamHitEventAt;
    if (last != null && state.simTime - last < SEAM_HIT_EVENT_INTERVAL) return;
    data._lastSeamHitEventAt = state.simTime;
    this.bus.emit('mining:seamHit', { asteroidId: ast.id });
  },

  _defaultYield(def, hpMax) {
    if (!def || !def.yieldU) return Math.max(1, Math.round(hpMax / 20));
    const [yLo, yHi] = def.yieldU;
    const [hpLo, hpHi] = def.hp || [hpMax, hpMax];
    if (hpHi === hpLo) return yLo;
    const t = Math.max(0, Math.min(1, (hpMax - hpLo) / (hpHi - hpLo)));
    return Math.max(1, Math.round(yLo + (yHi - yLo) * t));
  },

  _dominantOre(def) {
    const table = (def && def.oreTable) || null;
    if (!table) return 'cmdty_silicate';
    let bestId = null, bestW = -1;
    for (const id in table) { if (table[id] > bestW) { bestW = table[id]; bestId = id; } }
    return bestId || 'cmdty_silicate';
  },

  _surfacePoint(ast, miner) {
    if (!miner) return { x: ast.pos.x, z: ast.pos.z };
    const dx = miner.pos.x - ast.pos.x, dz = miner.pos.z - ast.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    const r = ast.radius || 6;
    return { x: ast.pos.x + (dx / d) * r, z: ast.pos.z + (dz / d) * r };
  },
};

function pickupsNearPlayer(state, player, radius, out) {
  return queryNearbyEntities(state, player.pos, radius, out,
    (state.entityIndex && state.entityIndex.pickups) || state.entityList);
}

function hasAuthoritativeEmptyPickupIndex(state) {
  const index = state && state.entityIndex;
  return !!(index && index.__spacefaceEntityIndexV1 && index.ready &&
    Array.isArray(index.pickups) && index.pickups.length === 0);
}

function clearScratch(out) {
  out.length = 0;
  return out;
}

function mineablesNearShip(state, ship, radius, out) {
  return queryNearbyEntities(state, ship.pos, radius, out,
    (state.entityIndex && state.entityIndex.mineables) || state.entityList);
}

function activeMineableTetherTarget(state, ship, range) {
  if (!state || !ship) return undefined;
  const ids = [];
  const tether = state.player && state.player.tether;
  if (tether && tether.active && tether.targetId != null) ids.push(tether.targetId);
  const attachments = state.combat && state.combat.attachments && state.combat.attachments.byId || {};
  for (const att of Object.values(attachments)) {
    if (!att || att.state !== 'active' || att.ownerId !== state.playerId || att.targetId == null) continue;
    if (att.defId !== 'tether_standard' && att.defId !== 'attachment_massline') continue;
    ids.push(att.targetId);
  }
  if (!ids.length) return undefined;
  for (const id of ids) {
    const target = state.entities && state.entities.get && state.entities.get(id);
    if (!target || !target.alive || (target.type !== 'asteroid' && target.type !== 'wreck')) continue;
    const dx = target.pos.x - ship.pos.x;
    const dz = target.pos.z - ship.pos.z;
    const dist = Math.hypot(dx, dz);
    const allowed = Math.max(0, Number(range) || 0) + (target.radius || 0) + (ship.radius || 0);
    return dist <= allowed ? target : null;
  }
  return undefined;
}

function resetMiningDiagnostics(diag) {
  if (!diag) return;
  diag.pickupScans = 0;
  diag.pickupSpatialQueries = 0;
  diag.pickupCandidates = 0;
  diag.pickupsMagnetized = 0;
  diag.pickupsCollected = 0;
  diag.targetSpatialQueries = 0;
  diag.targetCandidates = 0;
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, Number(n) || 0));
}

function clamp01(n) {
  return clamp(n, 0, 1);
}

function finiteNum(n, fallback = 0) {
  return Number.isFinite(n) ? n : fallback;
}

function beamLineFor(player, target) {
  return {
    ax: player.pos.x,
    az: player.pos.z,
    bx: target.pos.x,
    bz: target.pos.z,
  };
}

function rayCircleContact(origin, aim, center, radius) {
  const dx = Math.cos(aim);
  const dz = Math.sin(aim);
  const ox = origin.x - center.x;
  const oz = origin.z - center.z;
  const b = 2 * (ox * dx + oz * dz);
  const c = ox * ox + oz * oz - radius * radius;
  const disc = b * b - 4 * c;
  if (disc < 0) return null;
  const root = Math.sqrt(disc);
  const t0 = (-b - root) / 2;
  const t1 = (-b + root) / 2;
  const t = t0 >= 0 ? t0 : t1 >= 0 ? t1 : null;
  if (t == null) return null;
  return { x: origin.x + dx * t, z: origin.z + dz * t };
}

function seamWorldPoint(ast, seam) {
  let local = seam && seam.localOffset || null;
  if (!local && seam && Number.isFinite(seam.offset)) {
    const angle = Number.isFinite(seam.angle) ? seam.angle : 0;
    local = { x: Math.cos(angle) * seam.offset, z: Math.sin(angle) * seam.offset };
  }
  local = local || { x: 0, z: 0 };
  const rot = ast.rot || 0;
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  return {
    x: ast.pos.x + local.x * c - local.z * s,
    z: ast.pos.z + local.x * s + local.z * c,
  };
}

function pointSegmentDistanceSq(px, pz, ax, az, bx, bz) {
  const vx = bx - ax;
  const vz = bz - az;
  const len2 = vx * vx + vz * vz;
  if (len2 <= 1e-9) {
    const dx = px - ax;
    const dz = pz - az;
    return dx * dx + dz * dz;
  }
  const t = clamp(((px - ax) * vx + (pz - az) * vz) / len2, 0, 1);
  const cx = ax + vx * t;
  const cz = az + vz * t;
  const dx = px - cx;
  const dz = pz - cz;
  return dx * dx + dz * dz;
}

function inheritChunkSeams(parentSeams, count, radius, chunkIndex) {
  if (!Array.isArray(parentSeams) || !parentSeams.length || count <= 0) return [];
  const seams = [];
  for (let i = 0; i < count; i++) {
    const src = parentSeams[(chunkIndex + i) % parentSeams.length] || {};
    const angle = Number.isFinite(src.angle) ? src.angle : 0;
    const radial = radius * (0.45 + 0.1 * ((chunkIndex + i) % 3));
    seams.push({
      angle,
      localOffset: {
        x: Math.round(Math.cos(angle) * radial * 1e6) / 1e6,
        z: Math.round(Math.sin(angle) * radial * 1e6) / 1e6,
      },
    });
  }
  return seams;
}

function hash32Local(...args) {
  let h = 0x811c9dc5;
  const s = args.join('|');
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function unitHash(...args) {
  return hash32Local(...args) / 4294967296;
}

export function richCoreWindowPctForTier(tier) {
  const t = clamp(tier, 0, 5) / 5;
  return RICH_CORE_WINDOW_HI + (RICH_CORE_WINDOW_LO - RICH_CORE_WINDOW_HI) * t;
}

function richOreForTier(tier) {
  const target = Math.max(1, Math.floor(Number(tier) || 0) + 1);
  const sorted = ORES.slice().sort((a, b) => (a.tier - b.tier) || a.id.localeCompare(b.id));
  const rare = sorted.find((ore) => ore.tier >= target && ore.tags && ore.tags.includes('rare'));
  const tiered = sorted.find((ore) => ore.tier >= target);
  return (rare || tiered || sorted[sorted.length - 1] || { id: 'cmdty_ore_iron' }).id;
}

export function richCorePlan(seed, asteroid, def = null) {
  const id = asteroid && asteroid.id || 'asteroid';
  const roll = unitHash(seed || 0, id, 'rich_core');
  const tier = asteroid && asteroid.data && asteroid.data.tier != null
    ? asteroid.data.tier
    : def && def.tierCap || 0;
  const mult = 3 + Math.floor(unitHash(seed || 0, id, 'rich_core_mult') * 6);
  return {
    hasCore: roll < RICH_CORE_CHANCE,
    roll,
    multiplier: Math.max(3, Math.min(8, mult)),
    commodityId: richOreForTier(tier),
    windowPct: richCoreWindowPctForTier(tier),
  };
}

function commodityBasePrice(commodityId) {
  const c = COMMODITY_BY_ID.get(commodityId);
  const ore = ORE_BY_ID.get(commodityId);
  return (c && Number(c.basePrice)) || (ore && Number(ore.baseValue)) || 1;
}

function bulkChunkMass(chunk) {
  const d = chunk && chunk.data || {};
  return Math.max(0, Number(d.bulkMassU != null ? d.bulkMassU : d.yieldU != null ? d.yieldU : chunk && chunk.mass) || 0);
}

function chunkCommodity(chunk) {
  const d = chunk && chunk.data || {};
  return d.commodityId || 'cmdty_ore_iron';
}

export function bulkHaulPayoutForChunk(chunk) {
  const commodityId = chunkCommodity(chunk);
  const massU = bulkChunkMass(chunk);
  const basePrice = Math.max(0, Number(chunk && chunk.data && chunk.data.basePrice) || commodityBasePrice(commodityId));
  const gross = massU * basePrice * BULK_HAUL_PAY_MULT;
  const fee = gross * BULK_HAUL_REFINERY_FEE;
  return {
    massU,
    commodityId,
    basePrice,
    gross,
    fee,
    credits: Math.round(gross - fee),
  };
}

function isBulkHaulChunk(e) {
  return !!(e && e.alive !== false && e.type === 'asteroid' && e.data && e.data.isChunk && bulkChunkMass(e) > BULK_HAUL_MIN_U);
}

function isRefineryStation(state, stationId) {
  if (!state || !stationId) return false;
  const entity = (state.entityIndex && state.entityIndex.byStationId && state.entityIndex.byStationId.get(stationId)) ||
    (state.entityList || []).find((e) => e && e.type === 'station' && e.data && e.data.stationId === stationId);
  const data = entity && entity.data;
  if (data && (data.stationTypeId === 'refinery' || data.type === 'refinery' || data.kind === 'refinery')) return true;
  for (const sector of Object.values(state.world && state.world.sectors || {})) {
    for (const station of sector.stations || []) {
      if (station && station.id === stationId) return station.type === 'refinery' || (station.services || []).includes('refine');
    }
  }
  return false;
}

function playerModSum(state, key) {
  if (!state || !key) return 0;
  const player = state.entities && state.entities.get && state.entities.get(state.playerId);
  const fittings = player && player.data && Array.isArray(player.data.fittings) ? player.data.fittings : [];
  let sum = 0;
  for (const id of fittings) {
    const mod = id && MODULE_BY_ID.get(id);
    const value = mod && mod.mods && Number(mod.mods[key]);
    if (Number.isFinite(value)) sum += value;
  }
  return sum;
}

/**
 * Ore-pickup magnet radius for the ordinary freeflight scoop.
 * Single resolve path: max(MAGNET_RANGE floor, ships-owned derived.magnetRange).
 * If derived is missing (lab fixtures), re-scan fittings once so the scoop still works.
 * Exported for focused characterization tests (not a new runtime policy layer).
 */
export function playerPickupMagnetRange(state, playerEntity = null) {
  const player = playerEntity
    || (state && state.entities && state.entities.get && state.entities.get(state.playerId))
    || null;
  const derived = player && player.data && player.data.derived;
  let fromDerived = derived && Number(derived.magnetRange);
  if (!(Number.isFinite(fromDerived) && fromDerived > 0)) {
    fromDerived = maxFittedMagnetRange(player);
  }
  if (Number.isFinite(fromDerived) && fromDerived > MAGNET_RANGE) return fromDerived;
  return MAGNET_RANGE;
}

function maxFittedMagnetRange(player) {
  if (!player || !player.data) return 0;
  const fittings = Array.isArray(player.data.fittings) ? player.data.fittings : [];
  let max = 0;
  for (const id of fittings) {
    const mod = id && MODULE_BY_ID.get(id);
    const value = mod && mod.mods && Number(mod.mods.magnetRange);
    if (Number.isFinite(value) && value > max) max = value;
  }
  return max;
}
