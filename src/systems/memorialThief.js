// A scavenger that tries to lift the Candle Fleet sample pod before the player does.
// uniqueWrecks owns the durable outcome; npcJobs flies the hull when present.
import { makeShipEntitySpec } from './ships.js';
import { isSurvivalRunLive } from './adventureMigration.js';
import { indexedWorldRecordEntity } from '../world/livingWorldViews.js';
import { HELIOS_ROPE_CACHE } from '../data/worldOneOffs.js';

const SECTOR = 'sector_helios_prime';
const CACHE_ID = HELIOS_ROPE_CACHE.id;
const PLAYER_SCARE_R = 220;
const STEAL_R = 36;
const INTERCEPT_R = 80;

export function normalizeMemorialThief(value) {
  return {
    spawned: value?.spawned === true,
    fled: value?.fled === true,
    stolen: value?.stolen === true,
    intercepted: value?.intercepted === true,
  };
}

export function createMemorialThief(owner) {
  const { state, helpers, bus } = owner;
  let actor = null;
  const own = () => {
    const wrecks = owner._ensureState();
    return wrecks.memorialThief || (wrecks.memorialThief = normalizeMemorialThief());
  };
  const recordId = () => `memorial-thief:${state.meta?.seed || 1}`;
  const cache = () => (state.entityList || []).find((entity) => entity
    && entity.alive !== false
    && entity.data
    && entity.data.oneOffId === CACHE_ID) || null;
  const thief = () => {
    if (actor?.alive && state.entities.get(actor.id) === actor) return actor;
    const found = indexedWorldRecordEntity(state, recordId());
    if (found) actor = found;
    return found || null;
  };
  const player = () => (state.entities && state.entities.get
    ? state.entities.get(state.playerId) : null);

  function commissionApproach(entity, cacheEnt) {
    if (!entity || !cacheEnt || !helpers.npcJobs || typeof helpers.npcJobs.assign !== 'function') return;
    if (entity.data.jobId) return;
    helpers.npcJobs.assign(entity, {
      kind: 'hauler',
      sectorId: SECTOR,
      speed: 46,
      route: [
        { id: 'thief-hold', pos: { ...entity.pos } },
        { id: 'candle-cache', pos: { ...cacheEnt.pos }, label: 'Candle Fleet sample pod' },
      ],
      payload: { memorialThief: true },
    });
  }

  function spawn(cacheEnt) {
    const mem = own();
    if (mem.stolen || mem.fled || mem.intercepted) return null;
    const existing = thief();
    if (existing) return existing;
    if (state.world?.records?.byId?.[recordId()]) return null;
    if (!helpers || typeof helpers.spawnEntity !== 'function') return null;
    const spec = makeShipEntitySpec('ship_drifter', {
      team: 1,
      factionId: 'faction_vael',
      pos: { x: cacheEnt.pos.x + 280, z: cacheEnt.pos.z + 40 },
      ai: { archetype: 'passive', passive: true, spawnContext: 'opportunist' },
    });
    spec.flags = { persistent: true };
    Object.assign(spec.data, {
      worldRecordId: recordId(),
      persistenceOwner: 'uniqueWrecks:memorialThief',
      memorialThief: true,
      sectorId: SECTOR,
      scanLabel: 'CANDLE FLEET SCAVENGER',
    });
    const entity = helpers.spawnEntity(spec);
    if (!entity) return null;
    actor = entity;
    mem.spawned = true;
    commissionApproach(entity, cacheEnt);
    return entity;
  }

  function flee(entity, from, text) {
    own().fled = true;
    if (entity?.data?.jobId) helpers.npcJobs?.release(entity.data.jobId);
    if (bus && typeof bus.emit === 'function') {
      bus.emit('toast', { kind: 'info', ttl: 5, text });
      bus.emit('comms:popup', {
        id: 'memorial_thief_fled',
        sender: 'CANDLE WATCH',
        text,
        category: 'world',
        ttl: 8,
      });
    }
    if (!helpers.npcJobs || typeof helpers.npcJobs.assign !== 'function' || !from?.pos || !entity?.pos) return;
    const dx = entity.pos.x - from.pos.x;
    const dz = entity.pos.z - from.pos.z;
    const length = Math.hypot(dx, dz) || 1;
    helpers.npcJobs.assign(entity, {
      kind: 'hauler',
      sectorId: SECTOR,
      speed: 70,
      route: [
        { id: 'flee-start', pos: { ...entity.pos } },
        {
          id: 'flee-out',
          pos: { x: entity.pos.x + dx / length * 900, z: entity.pos.z + dz / length * 900 },
          label: 'Burn away',
        },
      ],
      payload: { memorialThief: true, fleeing: true },
    });
  }

  function steal(entity, cacheEnt) {
    own().stolen = true;
    if (cacheEnt) cacheEnt.alive = false;
    if (entity?.data?.jobId) helpers.npcJobs?.release(entity.data.jobId);
    if (bus && typeof bus.emit === 'function') {
      bus.emit('news:publish', {
        text: 'CANDLE FLEET SAMPLE POD LIFTED. THE MEMORIAL WATCH FILES THE LOSS.',
        kind: 'theft',
        sourceRef: 'followup.memorial_thief_stolen',
        sectorId: SECTOR,
      });
      bus.emit('toast', {
        kind: 'warn',
        ttl: 6,
        text: 'The scavenger latches the Candle Fleet pod and burns out.',
      });
    }
  }

  function sync() {
    if (isSurvivalRunLive(state.run)) return;
    if (state.world?.currentSectorId !== SECTOR) return;
    const mem = own();
    if (mem.stolen || mem.fled || mem.intercepted) return;
    const cacheEnt = cache();
    if (!cacheEnt || !cacheEnt.pos) return;
    const self = player();
    if (self?.pos && Math.hypot(self.pos.x - cacheEnt.pos.x, self.pos.z - cacheEnt.pos.z) < INTERCEPT_R) {
      mem.intercepted = true;
      const entity = thief();
      if (entity) flee(entity, self, 'The scavenger shears off the Candle Fleet. The pod is yours.');
      return;
    }
    const entity = spawn(cacheEnt);
    if (!entity || !entity.pos) return;
    commissionApproach(entity, cacheEnt);
    if (self?.pos && Math.hypot(self.pos.x - entity.pos.x, self.pos.z - entity.pos.z) < PLAYER_SCARE_R) {
      flee(entity, self, 'The scavenger dumps the approach and burns away from the candles.');
      return;
    }
    if (Math.hypot(entity.pos.x - cacheEnt.pos.x, entity.pos.z - cacheEnt.pos.z) < STEAL_R) {
      steal(entity, cacheEnt);
    }
  }

  function killed(payload) {
    const entity = thief();
    if (!entity || payload?.id !== entity.id) return;
    own().intercepted = true;
    own().fled = true;
  }

  return { sync, killed, clear: () => { actor = null; } };
}
