// src/systems/encounterDirector.js — THE KEYSTONE that makes the world feel alive.
//
// Deterministically schedules a weighted budget of ENCOUNTERS per sector-day, anchored to the NAMED
// zones in sectorZones.js: convoys on trade lanes, Concord patrols on corridors, pirate ambushes on
// ambush lanes, distress calls (60% genuine / 40% pirate bait), and rare named mini-bosses. It:
//   * derives EVERYTHING from a seeded RNG — mulberry32(hash32(seed, sectorId, dayIndex)) — so the same
//     sector-day always yields the same schedule (self-test asserts this),
//   * caps the schedule at ~1 major + 2 minor per sector-day,
//   * requests slots from the SINGLE spawnBudget authority (ctx.helpers.spawnBudget) BEFORE spawning,
//     so encounters coexist with zone ambient + missions without exceeding the live NPC cap,
//   * spawns ships via makeEnemySpawnSpec(...) + ctx.helpers.spawnEntity with a shared spec.data.ai
//     .squadId per encounter (so the SG-06 roster in aiPorts.js forms them into one squad),
//   * tags ai.spawnContext appropriately (hostiles use 'encounter'; patrols 'patrol'; convoys the
//     non-danger 'convoy_civilian'), and
//   * speaks a readable comms bark via ctx.helpers.voice?.say (else a 'toast').
//
// Owns state.encounterDirector only (§0.6). It NEVER edits world.js — encounters spawn their own
// entities. It is ADDITIVE + GUARDED: if a sector has no zones, or spawnBudget/spawnEntity are absent,
// it simply schedules/spawns nothing and never throws. factionId is READABILITY only; hostility is
// decided by scanner.isHostileToPlayer via team/archetype/context, never by factionId.

import { hash32, mulberry32 } from '../core/rng.js';
import { zonesForSector, zoneTypeMeta } from '../data/sectorZones.js';
import { makeEnemySpawnSpec } from './combat.js';
import { ENCOUNTERS, barkText } from '../data/encounters.js';

const MAX_MAJOR_PER_DAY = 1;    // at most one major encounter (mini-boss) per sector-day
const MAX_MINOR_PER_DAY = 2;    // at most two minor encounters per sector-day
const RARE_GATE = 0.75;         // a 'rare' shape (mini-boss) only fires when its extra roll clears this
const DAY_SECONDS = 600;        // matches core's DAY_SECONDS (10 sim-min "day"); used for spacing only

export const encounterDirector = {
  name: 'encounterDirector',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus || null;
    this.helpers = ctx.helpers || (ctx.helpers = {});
    ensureDirectorState(this.state);

    if (this.bus && typeof this.bus.on === 'function') {
      // Re-plan the schedule on sector entry and each in-game day rollover; clear on load/new game.
      this.bus.on('sector:enter', (p) => this._planSector(p && p.sectorId));
      this.bus.on('day:tick', () => this._planSector(this._currentSectorId()));
      this.bus.on('save:loaded', () => { this.state.encounterDirector = freshState(); });
      // Free a budget slot when an encounter ship dies/despawns so the ledger tracks the live count.
      this.bus.on('entity:destroyed', (p) => this._onEntityGone(p));
    }
  },

  newGame() { this.state.encounterDirector = freshState(); },

  update(_dt, state) {
    const dir = ensureDirectorState(state);
    if (!dir.pending.length) return;                 // no scheduled encounters → strict no-op
    if (state.mode && state.mode !== 'flight') return; // only run live in flight
    const now = state.simTime || 0;
    for (let i = dir.pending.length - 1; i >= 0; i--) {
      const item = dir.pending[i];
      if (now < item.dueAt) continue;
      dir.pending.splice(i, 1);
      this._runEncounter(item, state);
    }
  },

  // ── scheduling ─────────────────────────────────────────────────────────────────────────────────

  // Build the deterministic schedule for a sector-day. Pure aside from writing dir.pending.
  _planSector(sectorId) {
    const state = this.state;
    const dir = ensureDirectorState(state);
    if (!sectorId) return;
    const dayIndex = Math.floor((state.simTime || 0) / DAY_SECONDS);
    const key = `${sectorId}#${dayIndex}`;
    if (dir.plannedKey === key) return;              // already planned this sector-day
    dir.plannedKey = key;
    // Drop any not-yet-fired encounters from the previous sector/day (their zones no longer apply).
    dir.pending = [];

    const zones = zonesForSector(sectorId);
    if (!zones.length) return;                       // no zones → schedule nothing (additive)

    const schedule = planEncounters(state.meta && state.meta.seed, sectorId, dayIndex, zones);
    const now = state.simTime || 0;
    for (const s of schedule) {
      dir.pending.push({ ...s, sectorId, dueAt: now + s.delay });
    }
    dir.lastPlanned = { sectorId, dayIndex, count: schedule.length };
  },

  // ── spawning ───────────────────────────────────────────────────────────────────────────────────

  _runEncounter(item, state) {
    const spawnEntity = this.helpers && this.helpers.spawnEntity;
    if (typeof spawnEntity !== 'function') return;   // no spawner → cannot run (additive guard)
    const budget = this.helpers && this.helpers.spawnBudget;

    // Collect the concrete ships (each: {archetype, level, pos, factionId, context}) for this encounter.
    const ships = item.ships || [];
    if (!ships.length) return;

    // Reserve slots from the single authority BEFORE spawning. If we can't get at least one, skip the
    // encounter entirely (the world is already at cap — better to no-op than exceed it).
    const squadId = item.squadId;
    let grant = ships.length;
    if (budget && typeof budget.request === 'function') {
      grant = budget.request(ships.length, squadId);
      if (grant <= 0) return;                        // world full → drop this encounter cleanly
    }

    const spawned = [];
    for (let i = 0; i < ships.length && spawned.length < grant; i++) {
      const sh = ships[i];
      const spec = makeEnemySpawnSpec(sh.archetype, sh.level, sh.pos, { factionId: sh.factionId });
      spec.data = spec.data || {};
      spec.data.ai = spec.data.ai || {};
      spec.data.ai.squadId = squadId;                // one squad per encounter → SG-06 forms them up
      spec.data.ai.doctrine = sh.doctrine || spec.data.ai.doctrine;
      if (sh.formation) spec.data.ai.formation = sh.formation;
      spec.data.ai.spawnContext = sh.context;        // hostiles 'encounter'; patrol 'patrol'; convoy civilian
      spec.data.ai.sectorId = item.sectorId;
      spec.data.ai.zoneId = item.zoneId;
      spec.data.ai.zoneName = item.zoneName;
      spec.data.ai.encounterId = item.encounterId;
      spec.data.ai.encounterKind = item.kind;
      if (sh.bossName) { spec.data.ai.name = sh.bossName; spec.data.encounterBoss = true; }
      const ent = spawnEntity(spec);
      if (ent && ent.id != null) spawned.push(ent.id);
    }

    // If we spawned fewer than we reserved (e.g. spawner refused), return the unused slots.
    if (budget && typeof budget.releaseSome === 'function' && spawned.length < grant) {
      budget.releaseSome(squadId, grant - spawned.length);
    }

    // Track the live squad so entity:destroyed can free slots as members die.
    const dir = ensureDirectorState(state);
    dir.active[squadId] = { ids: spawned.slice(), sectorId: item.sectorId };

    this._say(item.bark, item.factionId);
    if (this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit('encounter:spawned', {
        encounterId: item.encounterId, kind: item.kind, squadId,
        sectorId: item.sectorId, zoneId: item.zoneId, count: spawned.length,
      });
    }
  },

  // Free a budget slot when a member of a tracked encounter squad dies/despawns.
  _onEntityGone(p) {
    const id = p && p.id;
    if (id == null) return;
    const dir = ensureDirectorState(this.state);
    const budget = this.helpers && this.helpers.spawnBudget;
    for (const squadId of Object.keys(dir.active)) {
      const rec = dir.active[squadId];
      const idx = rec.ids.indexOf(id);
      if (idx === -1) continue;
      rec.ids.splice(idx, 1);
      if (budget && typeof budget.releaseSome === 'function') budget.releaseSome(squadId, 1);
      if (!rec.ids.length) delete dir.active[squadId];
      return;
    }
  },

  // ── comms ────────────────────────────────────────────────────────────────────────────────────

  _say(barkId, factionId) {
    const text = barkText(barkId);
    if (!text) return;
    const voice = this.helpers && this.helpers.voice;
    if (voice && typeof voice.say === 'function') {
      voice.say({ text, factionId, kind: 'encounter' });
      return;
    }
    if (this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit('toast', { text, kind: 'info', ttl: 4 });
    }
  },

  _currentSectorId() {
    const w = this.state && this.state.world;
    return (w && w.currentSectorId) || null;
  },
};

// ── PURE PLANNER (headless-testable; no Three/DOM, no bus, no Math.random) ─────────────────────────

/**
 * Deterministically plan a sector-day's encounters. Everything derives from
 * mulberry32(hash32(seed, sectorId, dayIndex)). Returns an array of concrete encounter items, each with
 * its resolved ship list (positions/levels), squadId, bark, and a stagger delay.
 *
 * @param seed       state.meta.seed (any) — hashed with sectorId+dayIndex for the stream.
 * @param sectorId   the sector being planned.
 * @param dayIndex   integer day bucket (simTime / DAY_SECONDS).
 * @param zones      zonesForSector(sectorId) — the named-zone substrate to anchor onto.
 * @returns Array<{ encounterId, kind, tier, squadId, zoneId, zoneName, factionId, bark, delay, ships:[...] }>
 */
export function planEncounters(seed, sectorId, dayIndex, zones) {
  const out = [];
  if (!Array.isArray(zones) || !zones.length) return out;
  const rng = mulberry32(hash32(seed == null ? 0 : seed, String(sectorId), dayIndex | 0));

  // Which zone types exist here, and the zones grouped by type for anchoring.
  const zonesByType = new Map();
  for (const z of zones) {
    if (!z || !z.type || !z.center) continue;
    if (!zonesByType.has(z.type)) zonesByType.set(z.type, []);
    zonesByType.get(z.type).push(z);
  }
  if (!zonesByType.size) return out;
  const presentTypes = new Set(zonesByType.keys());

  let seq = 0;
  const scheduleTier = (tier, maxCount) => {
    const candidates = Object.values(ENCOUNTERS).filter(
      (e) => e.tier === tier && e.zoneTypes && e.zoneTypes.some((zt) => presentTypes.has(zt)),
    );
    if (!candidates.length) return;
    // How many to schedule this tier: a seeded count in [0..maxCount], biased toward fewer.
    const roll = rng();
    let count = tier === 'major'
      ? (roll < 0.35 ? 1 : 0)                        // majors are rare
      : Math.min(maxCount, Math.floor(roll * (maxCount + 1)));
    count = Math.min(count, maxCount);
    for (let i = 0; i < count; i++) {
      const enc = pickWeighted(candidates, rng);
      if (!enc) continue;
      if (enc.rare && rng() < RARE_GATE) continue;   // rare shapes need an extra gate to actually fire
      const zone = pickZoneFor(enc, zonesByType, rng);
      if (!zone) continue;
      const item = resolveEncounter(enc, zone, sectorId, dayIndex, seq++, rng);
      if (item && item.ships.length) out.push(item);
    }
  };

  scheduleTier('major', MAX_MAJOR_PER_DAY);
  scheduleTier('minor', MAX_MINOR_PER_DAY);
  return out;
}

// Resolve one encounter shape on a chosen zone into concrete ships + metadata.
function resolveEncounter(enc, zone, sectorId, dayIndex, seq, rng) {
  const squadId = `enc_${sectorId}_${dayIndex}_${enc.id}_${seq}`;
  const level = zoneLevelBand(zone);
  const ships = [];
  let factionId = enc.factionId;
  let bark = enc.bark;
  let kind = enc.id;

  if (enc.variant === 'distress') {
    // 60% genuine / 40% pirate bait — the load-bearing seeded roll for this encounter.
    const genuine = rng() < (Number.isFinite(enc.genuineChance) ? enc.genuineChance : 0.6);
    const branch = genuine ? enc.genuine : enc.bait;
    factionId = branch.factionId;
    bark = branch.bark;
    kind = genuine ? 'distress_genuine' : 'distress_bait';
    addSquad(ships, branch.squad, branch.factionId, branch.context, zone, level, rng);
    if (genuine && branch.threat) {
      addSquad(ships, branch.threat, branch.threat.factionId, branch.threat.context, zone, level, rng);
    }
  } else if (enc.boss) {
    // Named mini-boss: the captain (elite, top-of-band) plus a supporting wing.
    const bossName = enc.boss.names && enc.boss.names.length
      ? enc.boss.names[Math.floor(rng() * enc.boss.names.length) % enc.boss.names.length]
      : null;
    ships.push({
      archetype: enc.boss.archetype,
      level: level[1] + (enc.boss.levelBonus || 0),
      pos: jitter(zone, rng, 120),
      factionId: enc.factionId,
      context: enc.context,
      doctrine: enc.squad && enc.squad.doctrine,
      formation: enc.squad && enc.squad.formation,
      bossName,
    });
    addSquad(ships, enc.squad, enc.factionId, enc.context, zone, level, rng);
  } else {
    addSquad(ships, enc.squad, enc.factionId, enc.context, zone, level, rng);
    if (enc.escort) addSquad(ships, enc.escort, enc.escort.factionId, enc.escort.context, zone, level, rng);
  }

  return {
    encounterId: `${squadId}`,
    kind, tier: enc.tier, squadId,
    zoneId: zone.id, zoneName: zone.name,
    factionId, bark,
    delay: 4 + rng() * 30,        // stagger onset a few→30s in so they don't all pop at entry
    ships,
  };
}

// Append `size`-many ships from a squad template onto `ships`, clustered on the zone.
function addSquad(ships, squad, factionId, context, zone, levelBand, rng) {
  if (!squad || !squad.archetypes || !squad.archetypes.length) return;
  const [lo, hi] = Array.isArray(squad.size) && squad.size.length === 2 ? squad.size : [1, 2];
  const n = Math.max(1, Math.round(lo + rng() * Math.max(0, hi - lo)));
  for (let i = 0; i < n; i++) {
    const archetype = squad.archetypes[Math.floor(rng() * squad.archetypes.length) % squad.archetypes.length];
    const level = Math.round(levelBand[0] + (levelBand[1] - levelBand[0]) * (0.4 + rng() * 0.6));
    ships.push({
      archetype,
      level,
      pos: jitter(zone, rng, Math.min(zone.radius || 260, 260)),
      factionId,
      context,
      doctrine: squad.doctrine,
      formation: squad.formation,
    });
  }
}

// A deterministic clustered position inside a zone (tight so the squad forms one formation).
function jitter(zone, rng, clusterR) {
  const c = zone.center || { x: 0, z: 0 };
  const ang = rng() * Math.PI * 2;
  const r = Math.sqrt(rng()) * clusterR;
  return { x: c.x + Math.cos(ang) * r, z: c.z + Math.sin(ang) * r };
}

// Choose a zone matching the encounter's zoneTypes (prefer the affinity order, seeded among matches).
function pickZoneFor(enc, zonesByType, rng) {
  const matches = [];
  for (const zt of enc.zoneTypes) {
    const zs = zonesByType.get(zt);
    if (zs && zs.length) for (const z of zs) matches.push(z);
  }
  if (!matches.length) return null;
  return matches[Math.floor(rng() * matches.length) % matches.length];
}

// Weighted pick over encounter shapes using their `weight`.
function pickWeighted(list, rng) {
  let total = 0;
  for (const e of list) total += Math.max(0, e.weight || 1);
  if (total <= 0) return list[0] || null;
  let r = rng() * total;
  for (const e of list) {
    r -= Math.max(0, e.weight || 1);
    if (r <= 0) return e;
  }
  return list[list.length - 1];
}

// A [lo,hi] level band for a zone from its readability threat tier (higher threat → tougher ships).
function zoneLevelBand(zone) {
  const threat = Number.isFinite(zone.threat) ? zone.threat : (zoneTypeMeta(zone.type).threat || 1);
  const lo = Math.max(1, threat);
  const hi = Math.max(lo + 1, threat + 3);
  return [lo, hi];
}

// ── STATE ──────────────────────────────────────────────────────────────────────────────────────

function freshState() {
  return { pending: [], active: {}, plannedKey: null, lastPlanned: null };
}

function ensureDirectorState(state) {
  if (!state.encounterDirector || typeof state.encounterDirector !== 'object' || Array.isArray(state.encounterDirector)) {
    state.encounterDirector = freshState();
  }
  const d = state.encounterDirector;
  if (!Array.isArray(d.pending)) d.pending = [];
  if (!d.active || typeof d.active !== 'object' || Array.isArray(d.active)) d.active = {};
  if (!('plannedKey' in d)) d.plannedKey = null;
  return d;
}
