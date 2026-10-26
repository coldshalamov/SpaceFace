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

const FACTION_ID = 'faction_understory';
const EDIBLE = new Set(UNDERSTORY_GARDENS.edibleTypes);
const dist2 = (a, b) => { const dx = a.x - b.x, dz = a.z - b.z; return dx * dx + dz * dz; };

export function stageForBiomass(biomass) {
  const m = Number(biomass) || 0;
  let stage = UNDERSTORY_GARDEN_STAGES[0];
  for (const row of UNDERSTORY_GARDEN_STAGES) if (m >= row.massFloor) stage = row;
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
  for (const e of state.entityList) if (e && e.alive !== false && e.data && e.data.understoryGarden === true) out.push(e);
  return out;
}

/** Spawn a garden body. Returns the entity. */
export function spawnGarden(state, helpers, { x, z, sectorId = null, biomass = 0, gardenId = null }) {
  const stage = stageForBiomass(biomass);
  const id = gardenId || `garden:${state.tick}:${Math.floor(state.rng() * 1e9)}`;
  const e = helpers.spawnEntity({
    type: 'garden', team: 0, factionId: FACTION_ID,
    pos: { x, z }, vel: { x: 0, z: 0 }, rot: 0,
    radius: stage.radius, mass: 8000, hull: 1e9, hullMax: 1e9,
    collides: true, flags: { persistent: true },
    data: {
      understoryGarden: true, gardenId: id, gardenStage: stage.stage, gardenStageId: stage.id,
      gardenBiomass: biomass, sectorId: sectorId || state.world?.currentSectorId || null,
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
  e.radius = stage.radius;
  e.data.name = stage.label;
  e.data.scanLabel = `UNDERSTORY GARDEN · ${stage.label.toUpperCase()} · stage ${stage.stage}/5`;
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
    this.ctx = ctx; this.state = ctx.state; this.bus = ctx.bus; this.helpers = ctx.helpers;
    this._subs = [
      this.bus.on('entity:killed', (p) => this._onKilled(p)),
    ];
    ensureUnderstoryState(this.state);
  },

  /** sporeBloomOnDeath: a dead Understory hull seeds a stage-1 garden where it falls. */
  _onKilled(p) {
    if (UNDERSTORY_GARDENS.deathSeedsGarden !== true || !p) return;
    const e = this.state.entities.get(p.id);
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

  /** Is this body food for the slow rot? Living ships, stations and machines are not. */
  isEdible(e) {
    if (!e || e.alive === false || !e.data) return false;
    if (e.data.understoryGarden === true || e.factionId === FACTION_ID) return false;
    if (e.id === this.state.playerId) return false;
    return EDIBLE.has(e.type);
  },

  /** Was this mass player-delivered (flung/towed)? The Compost Run credits on that. */
  _playerFed(e) {
    const s = this.state;
    if (e.data?.lastThrowerId === s.playerId || e.data?.thrownBy === s.playerId) return true;
    const tether = s.player?.tether;
    if (tether && tether.targetId === e.id) return true;
    return false;
  },

  /** One digestion pass for a garden: eat every edible body inside the padded ring. */
  _digest(e, rec) {
    const s = this.state;
    const reach = e.radius * UNDERSTORY_GARDENS.absorbPadding;
    const reach2 = reach * reach;
    for (const prey of s.entityList) {
      if (prey === e || !this.isEdible(prey)) continue;
      const pr = Number(prey.radius) || 0;
      if (dist2(prey.pos, e.pos) > (reach + pr) * (reach + pr)) continue;
      const fedMass = Math.max(0, Number(prey.mass) || 0);
      const gained = fedMass * UNDERSTORY_GARDENS.digestionYield;
      rec.biomass += gained;
      rec.fedMass += fedMass;
      const byPlayer = this._playerFed(prey);
      if (byPlayer) rec.fedByPlayer += fedMass;
      this.helpers.removeEntity(prey.id, { reason: 'understory_garden' });
      this.bus.emit('understory:gardenFed', {
        gardenId: e.data.gardenId, entityId: e.id, eatenId: prey.id, eatenType: prey.type,
        fedMass, gained, byPlayer, tick: s.tick,
      });
      if (byPlayer) this._creditCompost(e, rec, fedMass);
    }
  },

  /** E-26 the Compost Run: player-fed mass accrues until the run closes. */
  _creditCompost(e, rec, fedMass) {
    const s = this.state, u = ensureUnderstoryState(s);
    // The run ledger is session-only (state.understory is not serialized), but the completed
    // stamp rides the garden's persistent entity data — a save/continue cannot re-mint the reward.
    const run = u.compost[e.data.gardenId] || (u.compost[e.data.gardenId] = {
      gardenId: e.data.gardenId, fedMass: 0, complete: e.data.compostRunComplete === true,
    });
    if (run.complete) return;
    run.fedMass += fedMass;
    if (run.fedMass >= UNDERSTORY_COMPOST_RUN.targetMass) {
      run.complete = true;
      run.completedAt = s.simTime;
      e.data.compostRunComplete = true;
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
    const u = ensureUnderstoryState(state);
    const gardens = gardenEntities(state);
    for (const e of gardens) {
      const rec = u.gardens[e.data.gardenId]
        || (u.gardens[e.data.gardenId] = {
          sectorId: e.data.sectorId || state.world?.currentSectorId || null,
          stage: e.data.gardenStage | 0, biomass: Number(e.data.gardenBiomass) || 0,
          x: e.pos.x, z: e.pos.z, fedByPlayer: 0, fedMass: 0, seededAt: state.simTime,
        });
      rec.x = e.pos.x; rec.z = e.pos.z;
      if (!rec.sectorId) rec.sectorId = e.data.sectorId || state.world?.currentSectorId || null;
      this._digest(e, rec);
      const { grew, stage } = syncGardenStage(state, e, rec);
      if (grew) {
        this.bus.emit('understory:gardenStage', {
          gardenId: e.data.gardenId, entityId: e.id, stage: stage.stage, stageId: stage.id,
          tick: state.tick,
        });
        this.bus.emit('comms:log', { text: pickBark(state, UNDERSTORY_BARKS.stageUp), speaker: 'The Understory' });
      }
    }
    this._tendGardeners();
    this._sporeHead();
    this._syncTidePushback();
  },
};

export default understoryGardens;
