// Intervention loop (V2 §2 / cut-list #21). When your automation fails — a drone runs out of fuel,
// a trader is killed on a dangerous route, a fleet ship is destroyed — the game doesn't just send a
// sad notification. It spawns the asset's cargo as a SALVAGE WRECK the player can fly out and
// recover, and raises an alert pointing to it. Your empire generates content for you; losses are
// interactive, not silent.
//
// INFERENCE honest-loss: the wreck is no longer ghost cargo. The site depends on the cause —
// raiders leave a picked hull with one of their own still circling it, mechanical deaths leave a
// full hold of what the asset actually carried — and a loss in another sector waits THERE as a
// logged recovery site instead of teleporting to the player's feet. A claim-jumper burns in on
// every site and strips it over time, so dallying is a decision with a price.
//
// Scope: hooks automation:assetLost, spawns a wreck with recoverable cargo, raises a danger-tier
// alert + a nav arrow. Recovery uses the EXISTING salvage beam (mining.js drains wrecks) — no new
// mechanic, just content wiring. Keeps a rolling log of interventions for the "your save is your
// story" law. Never writes credits, cargo, or rep (single-writer §0.6); never rolls its own losses.

import { drawSeeded, hash32 } from '../core/rng.js';
import { deferSectorEnterMaterialization, deferredEnterNow, deferredEnterProviderInFlight } from '../core/sectorEnterDefer.js';
import { WRECK_COLLIDER_PROPORTIONS } from '../data/wreckClasses.js';

const MAX_ACTIVE = 4;        // cap concurrent interventions so a mass-loss event doesn't spam wrecks
const MAX_PENDING = 6;       // cap logged cross-sector sites (oldest drops; the loss stays in ledgers)
const ALERT_TTL = 12;        // seconds the "intervention available" alert stays on the HUD
const RAID_SECURITY_BELOW = 0.45;  // losses below this security read as raids unless told otherwise
const RAID_RECOVERY_FRAC = 0.15;   // raiders leave 15% of value + scrap
const INTACT_RECOVERY_FRAC = 0.5;  // mechanical deaths leave 50%
const IRON_VALUE = 28;       // iron baseline for value→units conversion
const GUARD_RING_MIN = 300;  // lingering raider orbits this far out...
const GUARD_RING_MAX = 520;  // ...to this far
const JUMPER_RANGE = 1500;   // claim-jumper burns in from this far out
const JUMPER_STRIP_RANGE = 140;    // inside this the jumper works the pool
const JUMPER_STRIP_S = 2.5;  // ...one unit per this many seconds
const JUMPER_FLEE_RANGE = 320;     // player inside this spooks the jumper off
const JUMPER_DESPAWN_RANGE = 2600; // fled this far → gone
const JUMPER_DROP_MAX = 3;   // spooked jumper drops up to this many stolen units as one pod
// INF-U16: a latched Massline shakes the take loose. A tether on a laden jumper
// rips one unit free per RIP_S as a scoopable pod — the rope is the recovery
// tool, not just the chase. First rip bolts the jumper (it abandons the strip
// and runs with your line on); the rip continues while latched, so holding the
// line on a runner is the skill. Re-latching re-arms the cadence.
const JUMPER_RIP_S = 2.5;

const KIND_LABEL = {
  drone: 'Mining drone', trader: 'Trade hauler', fleet: 'Wingman', outpost: 'Outpost',
};

// Explicit-cause synonyms. automation:assetLost carries no cause today; when a foreign emitter
// (or a future automation) includes one, it wins over the security inference below.
const RAID_CAUSE = /raid|pirat|kill|attack|combat|hijack|ambush/i;
const CALM_CAUSE = /fuel|malfunction|breakdown|mechanical|wear|fault/i;

export const intervention = {
  name: 'intervention',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers;
    // active interventions: { id, kind, sectorId, wreckEntityId, guardId, jumper, value, t }
    if (!this.state.interventions) this.state.interventions = [];
    // logged cross-sector sites waiting for the player to arrive: { id, kind, value, sectorId, ... }
    if (!this.state.pendingInterventions) this.state.pendingInterventions = [];
    if (!this.state.interventionMeta) {
      this.state.interventionMeta = { rngSeed: hash32(this.state.meta && this.state.meta.seed, 'intervention') };
    }
    this._nextId = 1;

    // The trigger: an automation asset was lost. Spawn salvage + raise the alert.
    this.bus.on('automation:assetLost', (p) => this._onAssetLost(p));
    // Cross-sector honesty: a logged site materializes when the player arrives.
    // Live GPU + flight + hard enter: defer into the cook's FIFO — the census
    // drains the same _materializePendings call under its slice clock in
    // listener order instead of synchronously inside the emit.
    this.bus.on('sector:enter', (p) => {
      if (deferSectorEnterMaterialization(this.state, p, this._cookProvider)) return;
      this._materializePendings();
    });
    // Census arm: logged sites materialize inside the sector cook deterministically.
    this._cookProvider = () => this._materializePendingsSteps();
    (this.helpers.sectorCookProviders || (this.helpers.sectorCookProviders = []))
      .push(this._cookProvider);
  },

  _onAssetLost(p) {
    if (!p) return;
    const state = this.state;
    const currentSector = state.world && state.world.currentSectorId;
    const sectorId = p.sectorId || currentSector;
    const value = p.value || 0;
    if (value <= 0) return; // nothing to recover (e.g., an empty drone)

    const cause = resolveCause(p, state);
    if (sectorId && currentSector && sectorId !== currentSector) {
      this._logPending(p, sectorId, value, cause);
      return;
    }
    this._spawnSite({
      kind: p.kind || 'asset',
      value,
      sectorId: sectorId || currentSector,
      cause,
      cargo: p.cargo || null,
      killerFactionId: p.killerFactionId || null,
      shipDefId: p.shipDefId || null,
      assetId: p.id || null,
    });
  },

  // A loss in another sector is a logged site, not a teleporting wreck. It spawns when
  // the player enters that sector (sector:enter, plus the update sweep for save loads).
  _logPending(p, sectorId, value, cause) {
    const list = this.state.pendingInterventions;
    while (list.length >= MAX_PENDING) list.shift();
    const rec = {
      id: this._nextId++,
      kind: p.kind || 'asset',
      value,
      sectorId,
      cause,
      cargo: cloneCargo(p.cargo),
      killerFactionId: p.killerFactionId || null,
      shipDefId: p.shipDefId || null,
      assetId: p.id || null,
      t: this.state.simTime || 0,
    };
    list.push(rec);
    const label = KIND_LABEL[rec.kind] || 'Asset';
    const where = sectorName(this.state, sectorId);
    this.bus.emit('toast', {
      text: `${label} lost in ${where} — recovery site logged. Fly there to work it before the jumpers do.`,
      kind: 'warn',
      ttl: 6,
    });
    this.bus.emit('intervention:logged', { ...rec });
  },

  _materializePendings() {
    // Sync lane (emit listener, update sweep): drain the chunked steps inline —
    // the census drive holds the same generator across its slices. While the
    // FIFO holds this provider's live entry, the inline run would be a second
    // driver on the same mutable pendingInterventions array — defer to it.
    if (deferredEnterProviderInFlight(this.state, this._cookProvider)) return;
    for (const _ of this._materializePendingsSteps()) { /* inline */ }
  },

  *_materializePendingsSteps() {
    const state = this.state;
    const current = state.world && state.world.currentSectorId;
    if (!current) return;
    const pendings = state.pendingInterventions || [];
    for (let i = pendings.length - 1; i >= 0; i--) {
      yield;
      const rec = pendings[i];
      if (!rec || rec.sectorId !== current) continue;
      if ((state.interventions || []).length >= MAX_ACTIVE) return;
      const spawned = this._spawnSite({ ...rec, arrived: true });
      if (spawned) pendings.splice(i, 1);
      else break; // no player/spawner in this harness — keep the log, don't spin
    }
  },

  _spawnSite(job) {
    const state = this.state;
    const player = state.entities.get(state.playerId);
    if (!player || !this.helpers || !this.helpers.spawnEntity) return null;
    const recId = job.id || this._nextId++;

    // Cap concurrent interventions: drop the oldest if at cap (older wrecks are likely gone anyway).
    const list = state.interventions;
    while (list.length >= MAX_ACTIVE) {
      const old = list.shift();
      // leave the wreck in the world — just stop tracking it as an active intervention
    }

    const ang = this._rng() * Math.PI * 2;
    const dist = 280 + this._rng() * 220;
    const pos = { x: player.pos.x + Math.cos(ang) * dist, z: player.pos.z + Math.sin(ang) * dist };

    const pool = buildPool(job, () => this._rng());
    const wreck = this.helpers.spawnEntity({
      type: 'wreck', pos, radius: 8, mass: 1e6,
      hull: 1, hullMax: 1,
      // SFQ-B025: the authored 1e6 dead-mass is the body's own mass — normalization must not
      // substitute the ~51-mass wreck-density value for an intended immovable hulk.
      physicsBody: { shape: 'capsule', mass: 1e6 },
      data: {
        parentType: job.kind || 'asset',
        proportions: WRECK_COLLIDER_PROPORTIONS,
        loot: [],
        salvagePool: pool,
        salvageTimeLeft: 8, // a bit longer than a ship wreck so there's time to fly out
        interventionId: recId,
        interventionCause: job.cause,
      },
    });

    const rec = {
      id: recId,
      kind: job.kind || 'asset',
      cause: job.cause,
      sectorId: job.sectorId,
      wreckEntityId: wreck ? wreck.id : null,
      guardId: null,
      jumper: null,
      value: job.value,
      recoverable: poolTotal(pool),
      t: deferredEnterNow(state) || 0,
    };
    if (job.cause === 'raided') rec.guardId = this._spawnGuard(rec, pos);
    rec.jumper = this._spawnJumper(rec, pos);
    list.push(rec);

    // Raise the alert + toast. The HUD's alerts queue shows it; the toast gives the action prompt.
    // A materialized pending is an arrival, not a fresh loss — the copy says so.
    const kindLabel = KIND_LABEL[rec.kind] || 'Asset';
    const causeLine = rec.cause === 'raided'
      ? 'Raiders picked the wreck — one still circles it.'
      : 'Hold largely intact — work it before the jumpers do.';
    const arrived = job.arrived === true;
    this.bus.emit('alert', {
      key: 'intervention-' + rec.id,
      sev: 'warn',
      text: kindLabel.toUpperCase() + (arrived ? ' RECOVERY SITE — SALVAGE AVAILABLE' : ' LOST — SALVAGE AVAILABLE'),
      ttl: ALERT_TTL,
    });
    this.bus.emit('toast', {
      text: arrived
        ? `Recovery site: your lost ${rec.kind}'s wreck. ${causeLine} (${rec.recoverable}u recoverable).`
        : `${kindLabel} lost! ${causeLine} (${rec.recoverable}u recoverable).`,
      kind: 'warn',
      ttl: 6,
    });
    this.bus.emit('camera:shake', { amount: 0.3 });
    this.bus.emit('intervention:available', { ...rec });
    return rec;
  },

  // Raiders don't all leave. One circles the picked wreck — the site's teeth.
  _spawnGuard(rec, wreckPos) {
    const ang = this._rng() * Math.PI * 2;
    const dist = GUARD_RING_MIN + this._rng() * (GUARD_RING_MAX - GUARD_RING_MIN);
    const guard = this.helpers.spawnEntity({
      type: 'ship', team: 1,
      factionId: 'faction_reach',
      pos: { x: wreckPos.x + Math.cos(ang) * dist, z: wreckPos.z + Math.sin(ang) * dist },
      vel: { x: 0, z: 0 },
      radius: 11, mass: 14, hull: 90, hullMax: 90,
      data: {
        ai: { archetype: 'pirate', spawnContext: 'intervention_guard', passive: false },
        interventionGuard: rec.id,
      },
    });
    return guard && guard.id != null ? guard.id : null;
  },

  // Every site draws a claim-jumper: a neutral salvager that burns in, works the pool,
  // and spooks when the player closes. Steered by intent (this system runs post-AI).
  _spawnJumper(rec, wreckPos) {
    const ang = this._rng() * Math.PI * 2;
    const jumper = this.helpers.spawnEntity({
      type: 'ship', team: 2,
      factionId: 'faction_free',
      pos: { x: wreckPos.x + Math.cos(ang) * JUMPER_RANGE, z: wreckPos.z + Math.sin(ang) * JUMPER_RANGE },
      vel: { x: 0, z: 0 },
      radius: 10, mass: 12, hull: 70, hullMax: 70,
      data: {
        ai: { archetype: 'fleeing_trader', spawnContext: 'intervention_jumper', passive: true },
        interventionJumper: rec.id,
      },
    });
    if (!jumper || jumper.id == null) return null;
    return { entityId: jumper.id, phase: 'inbound', stripAt: 0, stolen: 0, announced: false };
  },

  update(dt, state) {
    // Save loads land the player in a sector without a fresh sector:enter — sweep pendings too.
    this._materializePendings();
    const list = state.interventions;
    if (!list || !list.length) return;
    for (let i = list.length - 1; i >= 0; i--) {
      const rec = list[i];
      this._tickJumper(state, rec);
      const e = rec.wreckEntityId != null ? state.entities.get(rec.wreckEntityId) : null;
      if (!e || !e.alive) {
        // wreck gone (salvaged or despawned) — close the intervention
        list.splice(i, 1);
        this.bus.emit('intervention:closed', {
          id: rec.id,
          recovered: !e || (e.data && e.data._salvaged),
          strippedByJumper: (rec.jumper && rec.jumper.stolen) || 0,
        });
      }
    }
  },

  // Jumper beat: inbound → stripping (drains the pool on a timer) → fled (spooked by
  // the player, drops part of the take as one pod) or gone (pool empty, take kept).
  _tickJumper(state, rec) {
    const jumper = rec.jumper;
    if (!jumper || jumper.phase === 'gone') return;
    const ent = jumper.entityId != null ? state.entities.get(jumper.entityId) : null;
    if (!ent || ent.alive === false) {
      jumper.phase = 'gone';
      return;
    }
    const player = state.entities.get(state.playerId);
    const wreck = rec.wreckEntityId != null ? state.entities.get(rec.wreckEntityId) : null;
    const now = state.simTime || 0;
    // INF-U16 v1: the tether rip ticks in every live phase, including the chase.
    this._tickJumperRip(state, rec, ent, now);
    if (jumper.phase === 'fled') {
      steerIntent(ent, awayFrom(ent.pos, player && player.pos));
      ent.data.intent.mode = 'intervention_jumper_flee';
      const fled = player && player.pos ? distance(ent.pos, player.pos) : 0;
      if (fled > JUMPER_DESPAWN_RANGE && this.helpers && typeof this.helpers.removeEntity === 'function') {
        this.helpers.removeEntity(ent.id);
        jumper.phase = 'gone';
      }
      return;
    }
    if (player && player.pos && distance(ent.pos, player.pos) < JUMPER_FLEE_RANGE) {
      this._spookJumper(state, rec, ent, wreck);
      return;
    }
    if (!wreck || wreck.alive === false) {
      // Nothing left to work — drift off without fanfare.
      jumper.phase = 'fled';
      return;
    }
    if (distance(ent.pos, wreck.pos) > JUMPER_STRIP_RANGE) {
      jumper.phase = 'inbound';
      steerIntent(ent, toward(ent.pos, wreck.pos));
      ent.data.intent.mode = 'intervention_jumper_inbound';
      return;
    }
    jumper.phase = 'stripping';
    stopIntent(ent);
    ent.data.intent.mode = 'intervention_jumper_strip';
    if (!jumper.announced) {
      jumper.announced = true;
      jumper.stripAt = now + JUMPER_STRIP_S;
      this.bus.emit('toast', {
        text: 'A claim-jumper is stripping your wreck — hurry or spook it off!',
        kind: 'warn', ttl: 5,
      });
      return;
    }
    if (now >= jumper.stripAt) {
      jumper.stripAt = now + JUMPER_STRIP_S;
      if (stripOneUnit(wreck)) {
        jumper.stolen += 1;
      } else {
        // Pool empty: the jumper keeps the take and burns out.
        jumper.phase = 'fled';
        this.bus.emit('toast', {
          text: 'The claim-jumper stripped the wreck clean and burned out.',
          kind: 'error', ttl: 5,
        });
      }
    }
  },

  // INF-U16 v1: a latched line shakes the take loose — one unit per RIP_S as a
  // scoopable pod, stolen decremented as pods spawn (never decremented without
  // a pod). v2: the first rip bolts a working jumper — it abandons the strip
  // and runs with the line on; the rip keeps ticking through the chase.
  _tickJumperRip(state, rec, ent, now) {
    const jumper = rec.jumper;
    const tether = state.player && state.player.tether;
    const latched = !!(tether && tether.active && tether.targetId === ent.id);
    if (!latched || !(jumper.stolen > 0)) {
      if (!latched) jumper.ripAt = 0; // re-latching re-arms the cadence
      return;
    }
    if (!(jumper.ripAt > 0)) jumper.ripAt = now + JUMPER_RIP_S;
    if (now < jumper.ripAt) return;
    jumper.ripAt = now + JUMPER_RIP_S;
    if (!this.helpers || typeof this.helpers.spawnEntity !== 'function') return;
    this.helpers.spawnEntity({
      type: 'pickup',
      pos: { x: ent.pos.x, z: ent.pos.z },
      vel: { x: (ent.vel && ent.vel.x || 0) * 0.3, z: (ent.vel && ent.vel.z || 0) * 0.3 },
      radius: 3, mass: 0.1, collides: true,
      data: {
        kind: 'cargo', commodityId: 'cmdty_scrap_metal', amount: 1,
        despawnAt: now + 90,
        jumperRip: rec.id,
      },
    });
    jumper.stolen -= 1;
    jumper.ripped = (jumper.ripped || 0) + 1;
    if (!jumper.ripAnnounced) {
      jumper.ripAnnounced = true;
      this.bus.emit('toast', {
        text: 'The tether shakes cargo loose — hold the line!',
        kind: 'good', ttl: 4,
      });
    }
    if (jumper.phase === 'stripping' || jumper.phase === 'inbound') {
      jumper.phase = 'fled';
      this.bus.emit('toast', {
        text: 'The jumper bolts with your line on — run it down!',
        kind: 'warn', ttl: 4,
      });
    }
    this.bus.emit('intervention:jumperRipped', {
      id: rec.id, ripped: jumper.ripped, left: jumper.stolen, at: now,
    });
  },

  // The player closed in: the jumper drops part of its take as one scoopable pod and runs.
  _spookJumper(state, rec, ent, wreck) {
    const jumper = rec.jumper;
    jumper.phase = 'fled';
    const drop = Math.min(jumper.stolen, JUMPER_DROP_MAX);
    if (drop > 0 && this.helpers && typeof this.helpers.spawnEntity === 'function') {
      this.helpers.spawnEntity({
        type: 'pickup',
        pos: { x: ent.pos.x, z: ent.pos.z },
        vel: { x: (ent.vel && ent.vel.x || 0) * 0.3, z: (ent.vel && ent.vel.z || 0) * 0.3 },
        radius: 3, mass: 0.1, collides: true,
        data: {
          kind: 'cargo', commodityId: 'cmdty_scrap_metal', amount: drop,
          despawnAt: (state.simTime || 0) + 90,
          jumperDrop: rec.id,
        },
      });
      jumper.stolen -= drop;
    }
    this.bus.emit('toast', {
      text: drop > 0
        ? 'The claim-jumper spooks and drops part of its take!'
        : 'The claim-jumper spooks off before it could strip anything.',
      kind: 'good', ttl: 4,
    });
    steerIntent(ent, awayFrom(ent.pos, state.entities.get(state.playerId) && state.entities.get(state.playerId).pos));
    ent.data.intent.mode = 'intervention_jumper_flee';
  },

  // Public read API for UI (a future interventions log). Returns active interventions.
  active() { return (this.state.interventions || []).slice(); },

  // Logged cross-sector sites still waiting for the player to arrive.
  pending() { return (this.state.pendingInterventions || []).slice(); },

  newGame() {
    this.state.interventions = [];
    this.state.pendingInterventions = [];
    this.state.interventionMeta = { rngSeed: hash32(this.state.meta && this.state.meta.seed, 'intervention') };
    this._nextId = 1;
  },

  _rng() {
    if (!this.state.interventionMeta) this.state.interventionMeta = {};
    return drawSeeded(
      this.state.interventionMeta,
      'rngSeed',
      hash32(this.state.meta && this.state.meta.seed, 'intervention'),
    );
  },
};

function resolveCause(p, state) {
  const explicit = String((p && p.cause) || '');
  if (RAID_CAUSE.test(explicit)) return 'raided';
  if (CALM_CAUSE.test(explicit)) return 'mechanical';
  if (p && (p.killerFactionId || p.attackerId != null)) return 'raided';
  const sector = p && p.sectorId && state.world && state.world.sectors && state.world.sectors[p.sectorId];
  const security = sector && Number.isFinite(sector.security) ? sector.security : 0.6;
  return security < RAID_SECURITY_BELOW ? 'raided' : 'mechanical';
}

// Raiders leave scrap and a token; mechanical deaths leave half of what was actually
// aboard (the payload cargo when a foreign emitter names it, else a value-derived mix).
function buildPool(job, rng) {
  const pool = { cmdty_scrap_metal: 1 + Math.floor(rng() * 2) };
  if (job.cause === 'raided') {
    const token = Math.max(1, Math.floor((job.value * RAID_RECOVERY_FRAC) / IRON_VALUE));
    pool.cmdty_ore_iron = token;
    return pool;
  }
  const cargo = job.cargo && typeof job.cargo === 'object' ? job.cargo : null;
  if (cargo) {
    for (const [id, qty] of Object.entries(cargo)) {
      if (typeof id !== 'string' || id.indexOf('cmdty_') !== 0) continue;
      const half = Math.floor((Number(qty) || 0) * INTACT_RECOVERY_FRAC);
      if (half > 0) pool[id] = (pool[id] || 0) + half;
    }
    if (poolTotal(pool) > pool.cmdty_scrap_metal) return pool;
  }
  const units = Math.max(2, Math.floor((job.value * INTACT_RECOVERY_FRAC) / IRON_VALUE));
  pool.cmdty_ore_iron = Math.max(1, Math.floor(units * 0.66));
  pool.cmdty_silicate = Math.max(1, units - pool.cmdty_ore_iron);
  return pool;
}

function cloneCargo(cargo) {
  if (!cargo || typeof cargo !== 'object') return null;
  const out = {};
  for (const [id, qty] of Object.entries(cargo)) {
    if (typeof id !== 'string' || id.indexOf('cmdty_') !== 0) continue;
    const n = Math.floor(Number(qty) || 0);
    if (n > 0) out[id] = n;
  }
  return Object.keys(out).length ? out : null;
}

function poolTotal(pool) {
  return Object.values(pool || {}).reduce((s, n) => s + (Math.floor(Number(n)) || 0), 0);
}

function sectorName(state, sectorId) {
  const sec = sectorId && state.world && state.world.sectors && state.world.sectors[sectorId];
  return (sec && sec.name) || 'deep space';
}

// Drain one unit from the wreck's pool (richest lot first). Returns false when empty.
function stripOneUnit(wreck) {
  const pool = wreck && wreck.data && wreck.data.salvagePool;
  if (!pool) return false;
  let best = null;
  for (const [id, qty] of Object.entries(pool)) {
    if ((Number(qty) || 0) > 0 && (!best || qty > pool[best])) best = id;
  }
  if (!best) return false;
  pool[best] -= 1;
  if (pool[best] <= 0) delete pool[best];
  return true;
}

function distance(a, b) {
  if (!a || !b) return Infinity;
  return Math.hypot((a.x || 0) - (b.x || 0), (a.z || 0) - (b.z || 0));
}

function toward(from, to) {
  return { x: (to.x || 0) - (from.x || 0), z: (to.z || 0) - (from.z || 0) };
}

function awayFrom(from, threat) {
  if (!threat) return { x: 1, z: 0 };
  return { x: (from.x || 0) - (threat.x || 0), z: (from.z || 0) - (threat.z || 0) };
}

// Project a world-space direction onto flight intent (same convention as beacons:
// moveZ forward along aimAngle; the ship's nose follows aimAngle).
function steerIntent(ent, dir) {
  const data = ent.data || (ent.data = {});
  const intent = data.intent || (data.intent = {});
  const len = Math.hypot(dir.x, dir.z) || 1;
  intent.moveZ = 1;
  intent.moveX = 0;
  intent.aimAngle = Math.atan2(dir.z / len, dir.x / len);
}

function stopIntent(ent) {
  const data = ent.data || (ent.data = {});
  const intent = data.intent || (data.intent = {});
  intent.moveZ = 0;
  intent.moveX = 0;
}
