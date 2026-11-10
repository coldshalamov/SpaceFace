// 569 — BUILD YOUR OWN ESCAPE (M16). A broker in an outlaw pocket wants a watched dead-drop cache
// brought to a rendezvous. A Reach crew watches the cache and comes the moment it moves. Nothing
// out there is anchored except one loose slag hulk — heavy enough to be a real Massline anchor for
// a starter hull, light enough to tow into the escape lane BEFORE taking the cargo.
//
//   * prepare: tow or shove the hulk where the escape wants it (any honest physics; no scripted
//     "placed" flag — the encounter only measures how far it really moved);
//   * take: scoop the cache into the hold; three Reach raiders come in from the far side;
//   * escape: swing off the anchor you set, or fight through cover; deliver to the broker, or dump
//     the cache as bait and live with the broker's contempt.
//
// An anchor lost in setup is not replaced. Preparation pays 150 more; no stunt does.
import { deepFreeze, defineEncounter } from './catalog.js';
import { removeCargo } from '../../systems/cargo.js';

export const encounterOrder = 569;
export const trigger = deepFreeze({
  id: 'build_your_own_escape',
  tier: 'minor',
  deck: 'combat',
  weight: 1.1,
  zoneTypes: ['outlaw_zone'],
  script: 'selfRegistered',
  pressureCost: 22,
  cooldownS: 1200,
  proximity: true,
});

const WINDOW_S = 300;
const CACHE_COMMODITY = 'cmdty_stolen_goods';
const CACHE_QTY = 6;
const CACHE_TTL_S = WINDOW_S + 30;
const BROKER_DIST_WU = 1600;           // rendezvous, along the exit line from the cache
const HULK_ALONG_WU = 600;             // where along the line the hulk sits...
const HULK_OFF_LINE_WU = 400;          // ...and how far off it (350-450)
// Starter Hitch: coupling mass 35 -> the latch pill reads ANCHOR at >= 3x (105). 180 is 5.1x, well
// above the read, yet the starter's own tow law puts a 180 t load under way at ~28 WU/s (a tow-class
// 65 t load runs ~60), so it moves with effort instead of not at all. Never 1e6 (immovable).
const HULK_MASS = 180;
const HULK_RADIUS = 14;
const PREP_MOVED_WU = 250;
const DELIVER_WU = 180;
const RAIDER_RANGE_WU = [900, 1100];
const RAIDER_SPREAD_WU = 70;
const RAIDER_RETRY_EVERY_S = 2;
const RAIDER_RETRY_FOR_S = 20;
const BAIT_BREAKOFF_S = 18;
const CACHE_GONE_GRACE_S = 2;
const RAIDER_COUNT = 3;
const ESCAPE_WINDOW_S = 240;           // after the pickup the run is bounded too: nobody pays for a stale escape
const BASE_PAY = 450;
const PREP_BONUS = 150;
const CLEAR_WU = 60;
const LAYOUT_TRIES = 36;
const LAYOUT_STEP_WU = 140;

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

function blockersNear(state, center, radius) {
  const out = [];
  for (const e of state.entityList || []) {
    if (!e || e.alive === false || !e.pos || e.id === state.playerId) continue;
    if (!(Number(e.radius) > 0) || e.type === 'projectile' || e.type === 'fx' || e.type === 'pickup') continue;
    if (dist(e.pos, center) <= radius) out.push(e);
  }
  return out;
}

function blockedCount(blockers, points) {
  let n = 0;
  for (const p of points) {
    for (const r of blockers) {
      if (dist(r.pos, p) < (r.radius || 0) + CLEAR_WU) n++;
    }
  }
  return n;
}

/** Cache at the base, broker 1600 WU down the exit line, hulk 600 along it and 400 off it, all in
 * clear space: a deterministic ring walk with the least-blocked candidate as the fallback. */
function findLayout(state, center, rng) {
  const blockers = blockersNear(state, center, BROKER_DIST_WU + 1200);
  const dir0 = rng() * Math.PI * 2;
  const side = rng() < 0.5 ? -1 : 1;
  let best = null;
  for (let i = 0; i < LAYOUT_TRIES; i++) {
    const ring = Math.floor(i / 6);
    const cache = i === 0
      ? { x: center.x, z: center.z }
      : {
        x: center.x + Math.cos(dir0 + i * 1.047) * ring * LAYOUT_STEP_WU,
        z: center.z + Math.sin(dir0 + i * 1.047) * ring * LAYOUT_STEP_WU,
      };
    const ang = dir0 + i * 0.7;
    const dx = Math.cos(ang), dz = Math.sin(ang);
    const layout = {
      cache,
      broker: { x: cache.x + dx * BROKER_DIST_WU, z: cache.z + dz * BROKER_DIST_WU },
      hulk: {
        x: cache.x + dx * HULK_ALONG_WU - dz * HULK_OFF_LINE_WU * side,
        z: cache.z + dz * HULK_ALONG_WU + dx * HULK_OFF_LINE_WU * side,
      },
      dir: { x: dx, z: dz },
    };
    const blocked = blockedCount(blockers, [layout.cache, layout.broker, layout.hulk]);
    if (blocked === 0) return layout;
    if (!best || blocked < best.blocked) best = { layout, blocked };
  }
  return best.layout;
}

function entityById(state, id) {
  return id != null && state.entities ? state.entities.get(id) || null : null;
}

function alive(e) { return !!e && e.alive !== false; }

function holdOf(state, commodityId) {
  const items = state && state.player && state.player.cargo && state.player.cargo.items;
  const value = items ? items[commodityId] : 0;
  const n = typeof value === 'number' ? value : Number(value && value.qty);
  return Number.isFinite(n) ? n : 0;
}

export const runtime = Object.freeze({
  fire(d, live, state) {
    const ships = (live.plan && live.plan.ships) || [];
    const brokerSpec = ships.find((sh) => sh && sh.role === 'broker');
    const raiderSpecs = ships.filter((sh) => sh && sh.role === 'raider');
    if (!brokerSpec) return d.abort(live, 'no_cast');
    const center = (live.plan && live.plan.zoneCenter) || live.anchor;
    if (!center || !Number.isFinite(center.x)) return d.abort(live, 'no_zone_anchor');

    const layout = findLayout(state, center, d.stream(live, 'm16_layout'));
    brokerSpec.pos = { ...layout.broker };
    brokerSpec.factionId = 'faction_quiet';
    brokerSpec.passive = true;
    const ids = d.spawnShips(live, [brokerSpec]);
    if (!ids.length || d.aliveCount(live, 'broker') < 1) return d.abort(live, 'no_budget');
    const broker = d.entsOf(live, 'broker')[0];
    if (broker && broker.data) broker.data.scanLabel = 'BROKER — RENDEZVOUS';

    const cache = d.spawnFreightPickup(live, {
      pos: layout.cache, commodityId: CACHE_COMMODITY, qty: CACHE_QTY, ttlS: CACHE_TTL_S,
    });
    const hulk = d.spawnWreck(live, {
      pos: layout.hulk, pool: { cmdty_scrap_metal: 3 },
      scanLabel: 'LOOSE SLAG HULK — THE ONLY ANCHOR OUT HERE', storyPropKind: 'm16_slag_hulk',
    });
    if (!cache || !hulk) return d.abort(live, 'no_bodies');
    // spawnWreck authors dead mass (1e6, immovable). This one is loose: a dynamic body with a real
    // mass, explicitly latchable, so the Massline can both anchor on it and drag it.
    hulk.mass = HULK_MASS;
    hulk.radius = HULK_RADIUS;
    hulk.physicsBody = { shape: 'capsule', mass: HULK_MASS, dynamic: true };
    hulk.data = hulk.data || {};
    hulk.data.masslineTetherable = true;
    // It is the anchor, not salvage: no pool for salvors, the mining beam or a tow job to strip.
    hulk.data.salvagePool = {};
    hulk.data.salvageTimeLeft = 0;
    if (cache.data) cache.data.scanLabel = 'DEAD-DROP CACHE — WATCHED';
    if (cache.data) cache.data.encounterId = live.id;

    const now = d.now();
    live.data.escape = {
      cacheId: cache.id,
      hulkId: hulk.id,
      hulkSpawn: { ...layout.hulk },
      cachePos: { ...layout.cache },
      brokerPos: { ...layout.broker },
      lastStock: holdOf(state, CACHE_COMMODITY),
      raiderSpecs: raiderSpecs.map((sh) => ({ ...sh })),
      takenAt: null,
      escapeEndsAt: null,
      preStock: 0,
      prepMoved: false,
      cacheGoneAt: null,
      raidersSpawned: 0,
      raiderAttempts: 0,
      raiderRetryAt: null,
      raiderGiveUpAt: null,
      latchHinted: false,
      settled: false,
    };
    live.deadlineAt = now + WINDOW_S;
    live.phase = 'prepare';
    live.approach = { signal: 'watched_cache_and_loose_hulk', contacts: ids.length + 2, t: now };
    d.say(live, 'alert',
      'BROKER: There\'s a cache sitting out there. A Reach crew is watching it, and the moment it moves, so do they. That loose slag hulk is the only thing out here you can swing on. Your call where it sits.',
      null, { primary: true, literal: true });
  },

  event(d, live, state, name, payload) {
    const esc = live.data && live.data.escape;
    if (!esc || live.phase === 'done' || esc.settled) return;
    if (name === 'tetherAttached') {
      if (!payload || payload.targetId !== esc.hulkId || esc.latchHinted || esc.takenAt != null) return;
      esc.latchHinted = true;
      d.say(live, 'alert',
        'BROKER: That hulk will hold a line. Park it in your lane before you touch the cache.',
        null, { literal: true });
    }
  },

  _spawnRaiders(d, live, esc) {
    const attempt = esc.raiderAttempts++;
    const player = d.player();
    if (!player || !player.pos) return;
    const rng = d.stream(live, `m16_raiders_${attempt}`);
    // The far side from the rendezvous: pursuit comes from behind the cache, not from the exit.
    const away = Math.atan2(player.pos.z - esc.brokerPos.z, player.pos.x - esc.brokerPos.x);
    const bearing = away + (rng() - 0.5) * 0.5;
    const range = RAIDER_RANGE_WU[0] + rng() * (RAIDER_RANGE_WU[1] - RAIDER_RANGE_WU[0]);
    const base = { x: player.pos.x + Math.cos(bearing) * range, z: player.pos.z + Math.sin(bearing) * range };
    const fallback = esc.raiderSpecs.length ? esc.raiderSpecs : [{ archetype: 'wasp_swarmer', level: 1 }];
    // A half-denied grant tops up: only the missing hulls are requested on a retry.
    const have = esc.raidersSpawned;
    const specs = [];
    for (let i = have; i < RAIDER_COUNT; i++) specs.push({ ...fallback[Math.min(i, fallback.length - 1)] });
    if (!specs.length) return;
    const perp = { x: -Math.sin(bearing), z: Math.cos(bearing) };
    const placed = specs.map((sh, i) => ({
      ...sh,
      archetype: sh.archetype || 'wasp_swarmer',
      role: 'raider',
      factionId: 'faction_reach',
      team: 1,
      context: 'encounter',
      passive: false,
      pos: { x: base.x + perp.x * (have + i - 1) * RAIDER_SPREAD_WU, z: base.z + perp.z * (have + i - 1) * RAIDER_SPREAD_WU },
      scanLabel: 'REACH RAIDER — WATCHING THE CACHE',
    }));
    const ids = d.spawnShips(live, placed);
    if (esc.raiderGiveUpAt == null) esc.raiderGiveUpAt = d.now() + RAIDER_RETRY_FOR_S;
    if (ids.length) {
      if (have === 0) d.say(live, 'alert', 'REACH: That cache is ours. Burn him.', null, { literal: true });
      esc.raidersSpawned += ids.length;
    }
    esc.raiderRetryAt = esc.raidersSpawned >= RAIDER_COUNT ? null : d.now() + RAIDER_RETRY_EVERY_S;
  },

  tick(d, live, state, now) {
    const esc = live.data && live.data.escape;
    if (!esc || live.phase === 'done' || esc.settled) return;
    const player = d.player();
    if (!alive(player)) return this._settle(d, live, esc, 'lost');
    const commodityHeld = holdOf(state, CACHE_COMMODITY);

    if (esc.takenAt == null) {
      const cache = entityById(state, esc.cacheId);
      if (alive(cache)) {
        // The hold's stock of this commodity, tracked while the cache is still on the field: the
        // pickup is the jump from this number, wherever the pilot's own trading left it.
        esc.lastStock = commodityHeld;
        if (now >= live.deadlineAt) return this._settle(d, live, esc, 'lapsed');
        return;
      }
      // The cache left the field: scooped into the hold, or destroyed. The hold decides which.
      if (commodityHeld >= esc.lastStock + CACHE_QTY) {
        esc.takenAt = now;
        esc.escapeEndsAt = now + ESCAPE_WINDOW_S;
        esc.preStock = Math.max(0, esc.lastStock);
        live.phase = 'escape';
        const hulk = entityById(state, esc.hulkId);
        esc.prepMoved = alive(hulk) && dist(hulk.pos, esc.hulkSpawn) >= PREP_MOVED_WU;
        this._spawnRaiders(d, live, esc);
        return;
      }
      if (esc.cacheGoneAt == null) esc.cacheGoneAt = now;
      if (now - esc.cacheGoneAt >= CACHE_GONE_GRACE_S) return this._settle(d, live, esc, 'lost');
      return;
    }

    if (esc.raidersSpawned < RAIDER_COUNT && esc.raiderRetryAt != null && now < esc.raiderGiveUpAt && now >= esc.raiderRetryAt) {
      this._spawnRaiders(d, live, esc);
    }
    // The lot is what the hold holds above the stock it had before the pickup (selling or buying
    // the same commodity on the way cannot fake a delivery or a dump).
    const lot = Math.max(0, commodityHeld - esc.preStock);
    if (lot <= CACHE_QTY * 0.5) return this._settle(d, live, esc, 'bait');
    const broker = d.entsOf(live, 'broker')[0];
    if (broker && lot >= CACHE_QTY && dist(player.pos, broker.pos) <= DELIVER_WU) return this._settle(d, live, esc, 'delivered');
    if (now >= esc.escapeEndsAt) return this._settle(d, live, esc, 'lapsed');
    if (!broker && now >= live.deadlineAt) return this._settle(d, live, esc, 'lost');
  },

  _settle(d, live, esc, outcome) {
    if (esc.settled) return;
    esc.settled = true;
    if (outcome === 'delivered') {
      // The broker pays for the cargo that actually changes hands, never for an assumed lot.
      const removed = removeCargo(d.state, CACHE_COMMODITY, CACHE_QTY) | 0;
      if (removed >= CACHE_QTY) {
        d.grant(BASE_PAY + (esc.prepMoved ? PREP_BONUS : 0), 'build_your_own_escape:delivered');
        d.rep('faction_quiet', 4, 'build_your_own_escape_delivered');
      } else {
        outcome = 'bait';
      }
    }
    if (outcome === 'bait') {
      d.rep('faction_quiet', -2, 'build_your_own_escape_bait');
      d.despawnAll(live, BAIT_BREAKOFF_S, 'raider');
    }
    d.despawnAll(live, 12, 'broker');
    const survivors = outcome === 'bait' ? [] : d.entsOf(live, 'raider');
    const result = d.resolve(live, outcome, { speak: true });
    // Raiders still flying after a delivery, a loss or a lapse are ordinary hostiles now.
    for (const r of survivors) {
      if (r.data && r.data.despawnAt != null) delete r.data.despawnAt;
    }
    return result;
  },
});

export default defineEncounter(trigger, {
  shape: {
    situation: 'ambush',
    place: trigger.zoneTypes,
    twist: 'none',
    actor: 'faction_quiet',
  },
  factionId: 'faction_quiet',
  title: 'BUILD YOUR OWN ESCAPE',
  primaryLine: 'BROKER: There\'s a cache sitting out there. A Reach crew is watching it, and the moment it moves, so do they. That loose slag hulk is the only thing out here you can swing on. Your call where it sits.',
  verbs: ['latch', 'tow', 'sling', 'escape'],
  civilian: {
    archetypes: ['mule_trader'],
    size: [1, 1],
    factionId: 'faction_quiet',
    context: 'civilian',
    team: 2,
    passive: true,
  },
  squad: {
    archetypes: ['wasp_swarmer'],
    size: [3, 3],
    factionId: 'faction_reach',
    context: 'encounter',
    team: 1,
    clusterRadius: 60,
    minSeparation: 40,
    doctrine: 'scavenger',
    formation: 'wedge',
  },
  predation: {
    carrierRole: 'broker',
    raiderRole: 'raider',
  },
  bark: null,
  deadlineS: WINDOW_S,
  receipts: {
    delivered: 'DELIVERED — the broker takes the cache and pays out.',
    bait: 'You dumped the cache — I don\'t pay for weather. The Reach crew breaks off for the pods.',
    lost: 'The cache is gone with you or without you. The broker pays nothing.',
    lapsed: 'The window closed with the cache undelivered. The broker leaves and pays nothing.',
  },
});
