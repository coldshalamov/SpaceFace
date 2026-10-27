// faction_understory.js — W-UNDERSTORY (build_map §34.5 row 517, bible 02 §10).
//
// The Understory's persistent mark is the garden: a wreck-reef that digests dead mass
// through five persisted growth stages. Done-when:
//   · five persisted growth stages (UNDERSTORY_GARDEN_STAGES, biomass floors)
//   · impacts absorbed in gardens — loose edible mass inside the ring is eaten and grows it
//   · Gardener skiff presence (tends the nearest garden)
//   · the Compost Run (E-26): player-fed mass closes a run per garden
//   · a stage-4+ garden pushes the local tide line (understoryTidePushbackAt — row 520 reads)
//   · Spore Head: a held mass grows a rot-skin (low bounce, sticks on impact)
//   · sporeBloomOnDeath: a dead Understory hull seeds a stage-1 garden where it falls
//
// Deterministic: growth reads entity mass and simTime only; bark picks draw from state.rng.

import {
  UNDERSTORY_GARDENS,
  UNDERSTORY_GARDEN_STAGES,
  UNDERSTORY_COMPOST_RUN,
  UNDERSTORY_SPORE_HEAD,
  UNDERSTORY_BARKS,
} from '../data/factions/understory.js';

import { UNDERSTORY_MASS_EPSILON, UNDERSTORY_RECEIVER, receiverPosition, firstPlayerGardenGrowth, hasUnderstoryGardenVisualIdentity, gardenGrowthRadius, normalizePlayerGardenGrowth } from '../data/understoryReceiver.js';

import { hullEnvelopeWu, proxyOuterRadiusWu, COLLISION_PROXY_MANIFESTS } from '../data/collisionProxyManifests.js';
import { modelTruthProxyManifest } from '../data/modelTruth.js';
import { shouldSyncPhysicsBodyEntity, substanceFor } from '../core/physicsAuthority.js';
import { PHYSICS_MATERIALS } from '../data/physicsMaterials.js';

const FACTION_ID = 'faction_understory';
const EDIBLE = new Set(UNDERSTORY_GARDENS.edibleTypes);
const dist2 = (a, b) => { const dx = a.x - b.x, dz = a.z - b.z; return dx * dx + dz * dz; };

export function stageForBiomass(biomass) {
  const m = Number(biomass) || 0;
  let stage = UNDERSTORY_GARDEN_STAGES[0];
  for (const row of UNDERSTORY_GARDEN_STAGES) if (m + UNDERSTORY_MASS_EPSILON >= row.massFloor) stage = row;
  return stage;
}

/** Fresh serializable Understory record (gardens, compost runs, tide pushback). */
export function ensureUnderstoryState(state) {
  if (!state.understory || typeof state.understory !== 'object') {
    state.understory = { gardens: {}, compost: {}, tidePushback: {} };
  }
  const u = state.understory;
  if (!u.gardens || typeof u.gardens !== 'object') u.gardens = {};
  if (!u.compost || typeof u.compost !== 'object') u.compost = {};
  if (!u.tidePushback || typeof u.tidePushback !== 'object') u.tidePushback = {};
  return u;
}

/** Live garden entities in the active sector (data.understoryGarden === true). */
export function gardenEntities(state) {
  const out = [];
  for (const e of state.entityList) if (e && e.alive !== false && e.type === 'garden'
    && e.factionId === FACTION_ID && state.entities?.get(e.id) === e && e.data?.understoryGarden === true) out.push(e);
  return out;
}

/** Spawn a garden body. Returns the entity. */
export function spawnGarden(state, helpers, { x, z, sectorId = null, biomass = 0, gardenId = null, authoredReceiver = false }) {
  const stage = stageForBiomass(biomass);
  const id = gardenId || `garden:${state.tick}:${Math.floor(state.rng() * 1e9)}`;
  const e = helpers.spawnEntity({
    type: 'garden', team: 0, factionId: FACTION_ID,
    pos: { x, z }, vel: { x: 0, z: 0 }, rot: 0,
    radius: authoredReceiver ? UNDERSTORY_RECEIVER.hullPhysicsReferenceRadius : stage.radius, mass: 8000, hull: 1e9, hullMax: 1e9,
    collides: true, flags: { persistent: true },
    ...(authoredReceiver ? { physicsBody: { radius: UNDERSTORY_RECEIVER.hullPhysicsReferenceRadius, dynamic: false, material: 'debris',
      contact: { restitution: 0.05, friction: 0.8 } } }
      : { physicsBody: { useMeasuredSkin: false } }),
    data: {
      understoryGarden: true, gardenId: id, gardenStage: stage.stage, gardenStageId: stage.id,
      gardenBiomass: biomass, gardenRadius: stage.radius, gardenFedMass: 0, gardenFedByPlayer: 0, compostFedMass: 0,
      placeId: 'place_dead_hulk', poi: true, placeTargetRadius: UNDERSTORY_RECEIVER.hullDrawRadius,
      authoredUnderstoryReceiver: authoredReceiver,
      sectorId: sectorId || state.world?.currentSectorId || null,
      name: stage.label, scannable: true,
      scanLabel: `UNDERSTORY GARDEN · ${stage.label.toUpperCase()} · stage ${stage.stage}/5`,
      // Spongy contact dressing for the physics/material lanes (low restitution is the
      // faction's "absorbed" signature — the garden eats what lands, it does not bounce it).
      restitutionMult: 0.05, softImpact: true,
    },
  });
  const u = ensureUnderstoryState(state);
  u.gardens[id] = {
    sectorId: e.data.sectorId, stage: stage.stage, biomass,
    x, z, fedByPlayer: 0, fedMass: 0, seededAt: state.simTime,
  };
  return e;
}

/** Biomass → stage write on both the entity and the persisted record. Returns stage row. */
function syncGardenStage(state, e, rec) {
  const stage = stageForBiomass(rec.biomass);
  const prevStage = e.data.gardenStage | 0;
  e.data.gardenBiomass = rec.biomass;
  e.data.gardenStage = stage.stage;
  e.data.gardenStageId = stage.id;
  e.data.gardenRadius = stage.radius;
  e.radius = e.data.authoredUnderstoryReceiver ? UNDERSTORY_RECEIVER.hullPhysicsReferenceRadius : stage.radius;
  e.data.gardenFedMass = rec.fedMass;
  e.data.gardenFedByPlayer = rec.fedByPlayer;
  e.data.name = e.data.authoredUnderstoryReceiver ? UNDERSTORY_RECEIVER.name : stage.label;
  const fed = Number(e.data.compostFedMass) || 0;
  const amount = n => String(Math.round(n * 100) / 100);
  e.data.scanLabel = `UNDERSTORY GARDEN · ${stage.label.toUpperCase()} · stage ${stage.stage}/5 · ${amount(rec.biomass)} biomass · ${amount(fed)}/${UNDERSTORY_COMPOST_RUN.targetMass}t fed · ${amount(Math.max(0, UNDERSTORY_COMPOST_RUN.targetMass - fed))}t remaining · ${e.data.compostRunComplete ? 'run paid once' : 'pays only at 240t (12cr/t)'}`;
  rec.stage = stage.stage;
  if (stage.stage > prevStage) return { grew: true, stage };
  return { grew: false, stage };
}

/**
 * Bloom tide pushback contributed by Understory gardens in a sector (row 520 contract).
 * A garden of stage 4 or higher pushes the local tide line; returns >= 0.
 */
export function understoryTidePushbackAt(state, sectorId) {
  const u = ensureUnderstoryState(state);
  let push = 0;
  for (const id of Object.keys(u.gardens)) {
    const g = u.gardens[id];
    if (g && g.sectorId === sectorId && g.stage >= UNDERSTORY_GARDENS.tidePushbackStage) {
      push += UNDERSTORY_GARDENS.tidePushbackPerGarden;
    }
  }
  return push;
}

function pickBark(state, lines) {
  if (!Array.isArray(lines) || !lines.length) return '';
  return lines[Math.floor(state.rng() * lines.length) % lines.length];
}

export const understoryGardens = {
  name: 'understoryGardens',

  init(ctx) {
    this.dispose();
    this.ctx = ctx; this.state = ctx.state; this.bus = ctx.bus; this.helpers = ctx.helpers;
    this._saveRestoring = false;
    this._subs = [
      this.bus.on('entity:spawned', (p) => this._adoptGardenVisual(p?.entity || this.state.entities.get(p?.id))),
      this.bus.on('entity:killed', (p) => this._onKilled(p)),
      this.bus.on('sector:enter', () => this.ensureAuthoredReceiver()),
      this.bus.on('save:restoring', () => { this._saveRestoring = true; }),
      this.bus.on('save:loaded', () => {
        const authoredReceiver = ensureUnderstoryState(this.state).authoredReceiver;
        this.state.understory = { gardens: {}, compost: {}, tidePushback: {}, authoredReceiver };
        this._saveRestoring = false; this.ensureAuthoredReceiver(); this._announceStoredGrowth();
      }),
      this.bus.on('save:error', () => { this._saveRestoring = false; }),
      this.bus.on('game:started', () => {
        this.state.understory = { gardens: {}, compost: {}, tidePushback: {} };
        this._saveRestoring = false;
      }),
    ];
    ensureUnderstoryState(this.state);
  },

  dispose() {
    for (const off of this._subs || []) if (typeof off === 'function') off();
    this._subs = [];
  },

  /** Legacy persistent gardens receive only missing visual identity on real spawn, before queued mesh build. */
  _adoptGardenVisual(e) {
    if (!e || e.alive === false || e.type !== 'garden' || e.factionId !== FACTION_ID
      || this.state.entities.get(e.id) !== e || e.flags?.persistent !== true
      || e.data?.understoryGarden !== true || e.data.authoredUnderstoryReceiver === true) return false;
    const d = e.data, body = e.physicsBody;
    // Adding presentation must not adopt a new skin on a later fixed-radius Continue.
    // Respect explicit custom geometry/skin choices and the nonphysical false sentinel.
    if (d.compoundSkin === true || d.collisionProxy != null
      || (body && (typeof body !== 'object' || body.useMeasuredSkin === true
        || body.collisionProxyManifest || (body.shape && body.shape !== 'ball')))) return false;
    if (['placeId', 'landmarkGlb', 'archetypeGlb', 'defId', 'assetRef', 'packagedPropFile',
      'modelId', 'modelUrl', 'visualId', 'visualType', 'assetId', 'claimSpecId', 'claimOwned', 'storyPropKind'].some(key => d[key] != null)) return false;
    if (body !== false) e.physicsBody = { ...(body || {}), useMeasuredSkin: false };
    d.placeId = 'place_dead_hulk'; d.poi = true; d.placeTargetRadius = UNDERSTORY_RECEIVER.hullDrawRadius;
    // Presentation follows the unchanged legacy collision radius; never reset growth or run facts.
    d.gardenRadius = Math.max(0, Number(e.radius) || stageForBiomass(d.gardenBiomass).radius);
    return true;
  },

  /** Existing body/model owners bound occupancy; core/native spawn is not a placement veto. */
  _receiverSiteClear(pos, intendedPrey = null) {
    // Released hull's measured skin reaches73.13WU;76 is a conservative fixed-core envelope.
    // It is not the90–380 living footprint or its437WU mature intake.
    const coreRadius = 76;
    const excluded = intendedPrey && this._playerFed(intendedPrey)
      && this._feedMassAvailable(intendedPrey) > 0 ? intendedPrey : null;
    for (const body of this.state.entityList) {
      if (!body || body.alive === false || this.state.entities.get(body.id) !== body
        || body === excluded || !shouldSyncPhysicsBodyEntity(body)) continue;
      if (!Number.isFinite(body.pos?.x) || !Number.isFinite(body.pos?.z)) continue;
      const substance = substanceFor(body);
      // The native material table, not the semantic 'sensor' name, decides noncontact.
      // Ordinary pickups can still contact this solid hull.
      if (PHYSICS_MATERIALS[substance.material]?.ghost === true) continue;
      let radius = Math.max(0, Number(body.radius) || 0, Number(body.physicsBody?.radius) || 0,
        hullEnvelopeWu(body));
      // Include explicit/declared and measured shapes. Taking all bounds is conservative even
      // when an authored override opts out of a measured skin; never under-bound a wide proxy.
      for (const manifest of [body.physicsBody?.collisionProxyManifest,
        COLLISION_PROXY_MANIFESTS[body.data?.collisionProxy], modelTruthProxyManifest(body)]) {
        if (manifest) radius = Math.max(radius, proxyOuterRadiusWu(manifest, body));
      }
      if (!Number.isFinite(radius) || dist2(body.pos, pos) <= (coreRadius + radius) ** 2) {
        if (!this._receiverClearanceWait) this.bus.emit('comms:log', { speaker: 'The Understory',
          text: 'The receiving bed is occupied. Move clear of the old hull footprint; no delivered material is consumed while it waits for space.' });
        this._receiverClearanceWait = true;
        return false;
      }
    }
    this._receiverClearanceWait = false;
    return true;
  },

  ensureAuthoredReceiver() {
    if (this._saveRestoring || (this.state.run?.kind && this.state.run.kind !== 'adventure')
      || this.state.world?.currentSectorId !== UNDERSTORY_RECEIVER.sectorId) return null;
    const own = ensureUnderstoryState(this.state);
    const existing = gardenEntities(this.state).find(e => e.data.gardenId === UNDERSTORY_RECEIVER.gardenId);
    if (existing && existing.hull > 0 && existing.flags?.persistent === true
      && existing.data.gardenDestroyed !== true) { own.authoredReceiver = { status: 'live' }; return existing; }
    if (existing) { own.authoredReceiver = { status: 'unavailable' }; return null; }
    // A missing live body is not a license to resurrect a finite receiver.
    if (own.authoredReceiver?.status && own.authoredReceiver.status !== 'unseen') return null;
    const pos = receiverPosition();
    if (!this._receiverSiteClear(pos)) return null;
    const e = spawnGarden(this.state, this.helpers, { ...pos, sectorId: UNDERSTORY_RECEIVER.sectorId,
      biomass: UNDERSTORY_RECEIVER.initialBiomass, gardenId: UNDERSTORY_RECEIVER.gardenId, authoredReceiver: true });
    own.authoredReceiver = { status: 'live' };
    e.data.name = UNDERSTORY_RECEIVER.name;
    this.bus.emit('comms:log', { speaker: 'The Understory',
      text: 'Rookside Receiving Garden is open. The old hull already holds 52 biomass. Bring real dead mass; your 240t run begins at zero. Keep the cockpit outside the growth and send the cargo in.' });
    return e;
  },

  _gardenSnapshot(e) {
    const d = e.data;
    return { gardenBiomass: Math.max(0, Number(d.gardenBiomass) || 0),
      gardenFedMass: Math.max(0, Number(d.gardenFedMass) || 0),
      gardenFedByPlayer: Math.max(0, Number(d.gardenFedByPlayer) || 0),
      compostFedMass: Math.max(0, Number(d.compostFedMass) || 0),
      compostRunComplete: d.compostRunComplete === true,
      compostCompletedAt: Number.isFinite(d.compostCompletedAt) ? d.compostCompletedAt : null,
      gardenFirstPlayerGrowth: d.gardenFirstPlayerGrowth ? { ...d.gardenFirstPlayerGrowth } : null };
  },

  /** Additive save section: live progress stays on entities; only finite terminal facts live here. */
  serialize() {
    const own = ensureUnderstoryState(this.state).authoredReceiver;
    if (!own) return undefined;
    const result = { version: 1, authoredReceiver: { status: own.status } };
    if (own.status === 'destroyed') {
      result.authoredReceiver.terminalGardenData = this._normalizeTerminal(own.terminalGardenData);
      result.authoredReceiver.firstPlayerGrowth = result.authoredReceiver.terminalGardenData?.gardenFirstPlayerGrowth || null;
    }
    return result;
  },

  _normalizeTerminal(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const fields = ['gardenBiomass', 'gardenFedMass', 'gardenFedByPlayer', 'compostFedMass'];
    if (fields.some(key => !Number.isFinite(raw[key]) || raw[key] < 0)
      || raw.gardenFedByPlayer > raw.gardenFedMass || raw.compostFedMass > raw.gardenFedByPlayer
      || typeof raw.compostRunComplete !== 'boolean') return null;
    const receipt = raw.gardenFirstPlayerGrowth == null ? null
      : normalizePlayerGardenGrowth(raw.gardenFirstPlayerGrowth, UNDERSTORY_RECEIVER.gardenId);
    if (raw.gardenFirstPlayerGrowth != null && (!receipt || receipt.fedMass > raw.gardenFedByPlayer)) return null;
    return { ...Object.fromEntries(fields.map(key => [key, raw[key]])),
      compostRunComplete: raw.compostRunComplete,
      compostCompletedAt: Number.isFinite(raw.compostCompletedAt) ? raw.compostCompletedAt : null,
      gardenFirstPlayerGrowth: receipt };
  },

  deserialize(data) {
    const own = this.state.understory = { gardens: {}, compost: {}, tidePushback: {} };
    if (data === undefined) return; // Only an absent legacy section may create initial ecology.
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      own.authoredReceiver = { status: 'unavailable' }; return;
    }
    const row = data.version === 1 && data.authoredReceiver;
    if (!row || !['unseen', 'live', 'destroyed', 'unavailable'].includes(row.status)) {
      own.authoredReceiver = { status: 'unavailable' }; return;
    }
    if (row.status === 'destroyed') {
      const terminal = this._normalizeTerminal(row.terminalGardenData);
      own.authoredReceiver = terminal ? { status: 'destroyed', terminalGardenData: terminal,
        firstPlayerGrowth: terminal.gardenFirstPlayerGrowth } : { status: 'unavailable' };
      return;
    }
    own.authoredReceiver = { status: row.status };
  },

  _feedMassAvailable(prey) {
    if (!this.isEdible(prey)) return null;
    if (prey.data?.jettisonedCargo === true) {
      return this.ctx.registry?.get?.('lootShards')?.gardenFeedMass?.(prey) ?? null;
    }
    if (prey.data?.persistenceOwner === 'aftermathWrecks') {
      return this.ctx.registry?.get?.('aftermathWrecks')?.gardenFeedMass?.(prey) ?? null;
    }
    return Number(prey.mass);
  },

  _reseedDestroyedReceiver() {
    if (this._saveRestoring || (this.state.run?.kind && this.state.run.kind !== 'adventure')) return null;
    const own = ensureUnderstoryState(this.state), lifecycle = own.authoredReceiver;
    if (lifecycle?.status !== 'destroyed' || this.state.world?.currentSectorId !== UNDERSTORY_RECEIVER.sectorId) return null;
    const saved = this._normalizeTerminal(lifecycle.terminalGardenData);
    if (!saved) return null;
    const pos = receiverPosition(), mouth = UNDERSTORY_GARDEN_STAGES[0].radius * UNDERSTORY_GARDENS.absorbPadding;
    for (const prey of this.state.entityList) {
      if (!this._playerFed(prey) || !(this._feedMassAvailable(prey) > 0)) continue;
      const reach = mouth + (Number(prey.radius) || 0);
      if (dist2(prey.pos, pos) > reach * reach) continue;
      if (!this._receiverSiteClear(pos, prey)) return null;
      // A real admissible load, not time/re-entry, regrows the old rooted site. No52-biomass subsidy.
      const garden = spawnGarden(this.state, this.helpers, { ...pos, sectorId: UNDERSTORY_RECEIVER.sectorId,
        biomass: 0, gardenId: UNDERSTORY_RECEIVER.gardenId, authoredReceiver: true });
      Object.assign(garden.data, saved, { gardenBiomass: 0, gardenRegrowth: true });
      const rec = own.gardens[UNDERSTORY_RECEIVER.gardenId];
      rec.fedMass = saved.gardenFedMass; rec.fedByPlayer = saved.gardenFedByPlayer;
      delete own.compost[UNDERSTORY_RECEIVER.gardenId];
      own.authoredReceiver = { status: 'live' };
      this._digest(garden, rec, prey);
      // The exact owner rechecks at commit. A refusal never leaves a free living replacement.
      if (prey.data?.understoryConsumed !== true) {
        this.helpers.removeEntity(garden.id, { reason: 'understory_reseed_refused' });
        own.authoredReceiver = lifecycle; delete own.gardens[UNDERSTORY_RECEIVER.gardenId];
        return null;
      }
      this.bus.emit('comms:log', { speaker: 'The Understory',
        text: 'The ruined receiving bed takes root in the mass you brought. Growth restarts from zero; prior run credit and any completed payment remain unchanged.' });
      return garden;
    }
    return null;
  },

  _announceStoredGrowth() {
    const receipt = firstPlayerGardenGrowth(this.state);
    if (receipt) this.bus.emit('understory:playerGrowth', receipt);
  },

  /** sporeBloomOnDeath: a dead Understory hull seeds a stage-1 garden where it falls. */
  _onKilled(p) {
    if (!p) return;
    const e = this.state.entities.get(p.id);
    if (e?.data?.authoredUnderstoryReceiver === true && e.data.gardenId === UNDERSTORY_RECEIVER.gardenId) {
      // Only an actual lethal body transition is a loss. Residency/absence is never a kill.
      if (e.alive !== false || !Number.isFinite(e.hull) || e.hull > 0 || (p.entity && p.entity !== e)) return;
      const own = ensureUnderstoryState(this.state);
      e.data.gardenDestroyed = true;
      own.authoredReceiver = { status: 'destroyed', terminalGardenData: this._gardenSnapshot(e),
        firstPlayerGrowth: e.data.gardenFirstPlayerGrowth ? { ...e.data.gardenFirstPlayerGrowth } : null };
      delete own.gardens[e.data.gardenId];
      return;
    }
    if (UNDERSTORY_GARDENS.deathSeedsGarden !== true) return;
    if (!e || e.factionId !== FACTION_ID || e.data?.understoryGarden === true) return;
    this.seedGardenAt(e.pos.x, e.pos.z, e.data?.sectorId || this.state.world?.currentSectorId);
  },

  /** Seed a stage-1 garden unless one already overlaps the spot. Returns entity or null. */
  seedGardenAt(x, z, sectorId = null) {
    for (const g of gardenEntities(this.state)) {
      if (dist2(g.pos, { x, z }) <= g.radius * g.radius) return null;
    }
    const e = spawnGarden(this.state, this.helpers, { x, z, sectorId });
    this.bus.emit('understory:gardenSeeded', {
      gardenId: e.data.gardenId, entityId: e.id, pos: { x, z }, tick: this.state.tick,
    });
    return e;
  },

  /** Owned material must retire through its own owner; all other protected bodies stay put. */
  isEdible(e) {
    if (!e || e.alive === false || this.state.entities?.get(e.id) !== e || !e.data || e.data.understoryConsumed === true
      || !Number.isFinite(e.pos?.x) || !Number.isFinite(e.pos?.z)) return false;
    const d = e.data, f = e.flags || {};
    if (!EDIBLE.has(e.type) || !(Number.isFinite(e.mass) && e.mass > 0)
      || d.understoryGarden === true || e.factionId === FACTION_ID || e.id === this.state.playerId) return false;
    if (d.jettisonedCargo === true) {
      return (this.ctx.registry?.get?.('lootShards')?.gardenFeedMass?.(e) ?? 0) > 0;
    }
    if (f.durable || f.invuln || f.protected
      || ['runtimeOwner', 'wreckMissionId', 'identityKey', 'worldSitePayloadId', 'worldSiteStructural',
        'alienSiteId', 'durable', 'freightCustodyPod', 'freightCustody', 'caughtByNet',
        'contractClaimSiteOf', 'salvorClaimedBy', 'recoveryEncounterId', 'storyPropKind',
        'authored', 'authoredCharacter', 'uniqueWreckId', 'authoredWreckId', 'poiId',
        'interventionId', 'onboarding', 'worldOneOff', 'oneOffId', 'berthConsign',
        'physicalCustodyOnly', 'orchardId', 'arenaShardOf', 'reefMineId', 'reefMine',
        'originId', 'destinationId', 'originStationId', 'destStationId', 'claimable']
        .some(key => d[key]) || d.ownership?.ownerId != null || d.cargoIdentity) return false;
    if (f.missionPinned || d.missionPinned || d.missionId || d.missionTag || d.worldRecordId
      || d.resourceBodyId || d.fieldId || d.worldSiteId || d.worldObjectId || d.siteId
      || d.activityObjectSlotId || d.claimId || d.claimedBy || d.playerOwned || d.custodyOwner
      || d.protected || f.protected || d.anchored || d.living || d.survivorPod) return false;
    if (d.persistenceOwner && d.persistenceOwner !== 'aftermathWrecks') return false;
    if (d.persistenceOwner === 'aftermathWrecks') return e.type === 'wreck';
    if (d.markerId || d.provenance || f.persistent || d.persistent || d.ownerId != null || e.ownerId != null) return false;
    return true;
  },

  _consumeMaterial(prey, garden) {
    if (prey.data?.jettisonedCargo === true) {
      return this.ctx.registry?.get?.('lootShards')?.consumeByGarden?.(prey, garden) ?? null;
    }
    if (prey.data?.persistenceOwner === 'aftermathWrecks') {
      const owner = this.ctx.registry?.get?.('aftermathWrecks');
      if (owner?.consumeByGarden?.(prey, garden) !== true) return null;
    }
    return Number(prey.mass);
  },

  /** Was this mass player-delivered (flung/towed)? The Compost Run credits on that. */
  _playerFed(e) {
    const s = this.state;
    if (s.playerId == null) return false;
    if (e.data?.lastThrowerId === s.playerId || e.data?.thrownBy === s.playerId) return true;
    const tether = s.player?.tether;
    if (tether && tether.active !== false && tether.targetId === e.id) return true;
    return false;
  },

  /** One body commits once: retire its actual owner before removal, then retain the receipt. */
  _digest(e, rec, onlyPrey = null) {
    const s = this.state;
    if (e.data.authoredUnderstoryReceiver === true && s.run?.kind && s.run.kind !== 'adventure') return;
    for (const prey of s.entityList) {
      if ((onlyPrey && prey !== onlyPrey) || prey === e || !this.isEdible(prey)) continue;
      const byPlayer = this._playerFed(prey);
      // This authored intake accepts deliveries, not ambient drift that could fill it before Rook.
      if (e.data.authoredUnderstoryReceiver === true && !byPlayer) continue;
      const reach = gardenGrowthRadius(e) * UNDERSTORY_GARDENS.absorbPadding + (Number(prey.radius) || 0);
      if (dist2(prey.pos, e.pos) > reach * reach) continue;
      const fedMass = this._consumeMaterial(prey, e);
      if (!(Number.isFinite(fedMass) && fedMass > 0)) continue;
      const gained = fedMass * UNDERSTORY_GARDENS.digestionYield;
      const fromStage = stageForBiomass(rec.biomass).stage;
      rec.biomass += gained;
      rec.fedMass += fedMass;
      if (byPlayer) rec.fedByPlayer += fedMass;
      prey.data.understoryConsumed = true;
      this.helpers.removeEntity(prey.id, { reason: 'understory_garden' });
      const { grew, stage } = syncGardenStage(s, e, rec);
      const receipt = { version: 1, gardenId: e.data.gardenId, entityId: e.id,
        eatenId: prey.id, eatenType: prey.type, fedMass, gained, byPlayer,
        fromStage, stage: stage.stage, biomass: rec.biomass, tick: s.tick };
      const firstGrowth = grew && byPlayer && hasUnderstoryGardenVisualIdentity(e) && !e.data.gardenFirstPlayerGrowth;
      if (firstGrowth) e.data.gardenFirstPlayerGrowth = { ...receipt };
      // Commit material/growth facts before settlement emits can re-enter another owner.
      if (byPlayer) this._creditCompost(e, rec, fedMass);
      syncGardenStage(s, e, rec);
      if (firstGrowth) this.bus.emit('understory:playerGrowth', receipt);
      this.bus.emit('understory:gardenFed', receipt);
      if (grew) {
        this.bus.emit('understory:gardenStage', { ...receipt, stageId: stage.id });
        this.bus.emit('comms:log', { text: byPlayer ? pickBark(s, UNDERSTORY_BARKS.stageUp)
          : 'The garden takes root in the drifting dead.', speaker: 'The Understory' });
      }
      if (byPlayer) this.bus.emit('comms:log', { speaker: 'The Understory',
        text: `${Math.round(fedMass * 100) / 100}t received; ${Math.round(rec.biomass * 100) / 100} biomass retained. ${Math.round((Number(e.data.compostFedMass) || 0) * 100) / 100}/240t on this run. ${e.data.compostRunComplete ? 'Run paid once.' : 'First growth is not payment; the run pays at 240t.'}` });
    }
  },

  /** E-26 the Compost Run: player-fed mass accrues until the run closes. */
  _creditCompost(e, rec, fedMass) {
    const s = this.state, u = ensureUnderstoryState(s);
    // Both partial mass and terminal settlement ride the ordinary persistent garden data.
    const run = u.compost[e.data.gardenId] || (u.compost[e.data.gardenId] = {
      gardenId: e.data.gardenId, fedMass: Math.max(0, Number(e.data.compostFedMass) || 0), complete: e.data.compostRunComplete === true,
    });
    if (run.complete || e.data.compostRunComplete === true) { run.complete = true; return; }
    run.fedMass += fedMass;
    e.data.compostFedMass = run.fedMass;
    // Decimal contents (for example300u iron) can sum to239.99999999999994t.
    // Compare with numerical tolerance; retain/pay the actual accumulated mass, never add cargo.
    if (run.fedMass + UNDERSTORY_MASS_EPSILON >= UNDERSTORY_COMPOST_RUN.targetMass) {
      run.complete = true;
      run.completedAt = s.simTime;
      e.data.compostRunComplete = true;
      e.data.compostCompletedAt = s.simTime;
      this.bus.emit('understory:compostRunComplete', {
        gardenId: e.data.gardenId, entityId: e.id, fedMass: run.fedMass, tick: s.tick,
      });
      this.bus.emit('comms:log', { text: UNDERSTORY_BARKS.runComplete, speaker: 'The Understory' });
      this.bus.emit('toast', { text: `COMPOST RUN COMPLETE — ${rec.fedByPlayer | 0}t fed`, tone: 'good' });
      this.bus.emit('faction:repDelta', { factionId: FACTION_ID, delta: UNDERSTORY_COMPOST_RUN.repReward, reason: 'compost_run' });
      this.bus.emit('economy:grantCredits', {
        amount: Math.round(run.fedMass * UNDERSTORY_COMPOST_RUN.creditPerTonne),
        reason: 'understory_compost_run',
      });
    }
  },

  /** Gardener skiffs tend the nearest garden — a slow presence orbit, never a chase. */
  _tendGardeners() {
    const s = this.state, gardens = gardenEntities(s);
    if (!gardens.length) return;
    for (const e of s.entityList) {
      if (!e || e.alive === false || e.factionId !== FACTION_ID || e.data?.understoryGarden) continue;
      if (e.data?.role !== 'gardener-skiff' && e.data?.shipRole !== 'gardener-skiff') continue;
      let best = null, bestD2 = Infinity;
      for (const g of gardens) {
        const d2 = dist2(e.pos, g.pos);
        if (d2 < bestD2) { bestD2 = d2; best = g; }
      }
      if (!best) continue;
      const orbit = best.radius + 60;
      const d = Math.sqrt(bestD2) || 1;
      const err = d - orbit;
      const ux = (best.pos.x - e.pos.x) / d, uz = (best.pos.z - e.pos.z) / d;
      const speed = Math.max(-14, Math.min(14, err * 0.05));
      e.vel.x = ux * speed - uz * 6;
      e.vel.z = uz * speed + ux * 6;
    }
  },

  /** Rebuild persisted tide pushback (row 520 reads both the record and the reader). */
  _syncTidePushback() {
    const s = this.state, u = ensureUnderstoryState(s);
    const next = {};
    for (const id of Object.keys(u.gardens)) {
      const g = u.gardens[id];
      if (g && g.sectorId && g.stage >= UNDERSTORY_GARDENS.tidePushbackStage) {
        next[g.sectorId] = (next[g.sectorId] || 0) + UNDERSTORY_GARDENS.tidePushbackPerGarden;
      }
    }
    u.tidePushback = next;
  },

  /**
   * Spore Head: a mass held on the Line by a `head_spore` carrier grows a rot-skin —
   * low restitution and stick-on-impact (glue ammunition). Deterministic hold time.
   */
  _sporeHead() {
    const s = this.state;
    for (const holder of s.entityList) {
      if (!holder || holder.alive === false || holder.data?.lineHeadId !== UNDERSTORY_SPORE_HEAD.id) continue;
      const tether = holder.tether || (holder.id === s.playerId ? s.player?.tether : null);
      const target = tether && tether.active ? s.entities.get(tether.targetId) : null;
      if (!target || target.alive === false) continue;
      const d = target.data || (target.data = {});
      if (d.sporeSkin === true) continue;
      // Integer tick count — a float accumulate can land 4.0 as 3.9999… and never take.
      d.sporeSkinTicks = (d.sporeSkinTicks | 0) + 1;
      if (d.sporeSkinTicks >= Math.ceil(UNDERSTORY_SPORE_HEAD.growS * 60)) {
        d.sporeSkin = true;
        d.restitutionMult = UNDERSTORY_SPORE_HEAD.heldEffect.restitutionMult;
        d.sticksOnImpact = UNDERSTORY_SPORE_HEAD.heldEffect.sticksOnImpact;
        this.bus.emit('understory:sporeSkin', { entityId: target.id, holderId: holder.id, tick: s.tick });
        this.bus.emit('toast', { text: 'SPORE SKIN — it will stick to whatever it hits', tone: 'info' });
      }
    }
  },

  update(_dt, state) {
    if (this._saveRestoring) return;
    this.ensureAuthoredReceiver();
    this._reseedDestroyedReceiver();
    const u = ensureUnderstoryState(state);
    const gardens = gardenEntities(state);
    for (const e of gardens) {
      if (e.data.authoredUnderstoryReceiver === true && state.run?.kind && state.run.kind !== 'adventure') continue;
      const rec = u.gardens[e.data.gardenId]
        || (u.gardens[e.data.gardenId] = {
          sectorId: e.data.sectorId || state.world?.currentSectorId || null,
          stage: e.data.gardenStage | 0, biomass: Number(e.data.gardenBiomass) || 0,
          x: e.pos.x, z: e.pos.z, fedByPlayer: Math.max(0, Number(e.data.gardenFedByPlayer) || 0),
          fedMass: Math.max(0, Number(e.data.gardenFedMass) || 0), seededAt: state.simTime,
        });
      rec.x = e.pos.x; rec.z = e.pos.z;
      if (!rec.sectorId) rec.sectorId = e.data.sectorId || state.world?.currentSectorId || null;
      this._digest(e, rec);
      syncGardenStage(state, e, rec);
    }
    this._tendGardeners();
    this._sporeHead();
    this._syncTidePushback();
  },
};

export default understoryGardens;
