import { TensionDirector } from '../../src/ai/tensionDirector.js';
import { createBus } from '../../../fixture/eventBus.js';
import { createTensionDirectorSystem } from '../../src/systems/tensionDirector.js';

export const healthy = Object.freeze({ eligible: true, hull: 1, shield: 1, profile: 'standard',
  nearbyCombat: 0, liveCombat: 0, pendingCombat: 3, pendingCivilian: 2 });
export function advanceTo(engine, target, sensors = healthy) {
  let out = null;
  for (let t = Math.max(0, Math.ceil(engine.state.lastUpdateAt)); t <= target; t++) out = engine.advance(t, sensors);
  return out;
}
export function boot(overrides = {}) {
  const player = { id: 1, alive: true, hull: 100, hullMax: 100, shield: 100, shieldMax: 100,
    pos: { x: 0, y: 0, z: 0 } };
  const state = {
    simTime: 0, tick: 0, mode: 'flight', playerId: 1, player: { flags: {}, credits: 100 },
    entities: new Map([[1, player]]), world: { currentSectorId: 'sector_test' },
    settings: { gameplay: { difficulty: 'standard' } },
    encounterDirector: { live: {}, pending: [], pressure: { combat: 140, civilian: 140 },
      noise: { mining: 0 }, window: [], cooldowns: {}, lastAmbientAt: -1e9,
      lastMeaningfulAt: -1e9, lastMajorAt: -1e9 },
    ...overrides,
  };
  const bus = createBus();
  const helpers = {};
  const system = createTensionDirectorSystem();
  system.init({ state, bus, helpers });
  const step = (t, dt = 1) => { state.simTime = t; state.tick = Math.round(t * 60); system.update(dt, state); };
  return { state, bus, helpers, system, player, step };
}
export function seeded(seed) {
  let a = seed >>> 0;
  return () => { a += 0x6D2B79F5; let t = a; t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
export function drive(engine, start, end, seed = 4242) {
  const rng = seeded(seed);
  const records = [];
  for (let t = start; t <= end; t++) {
    const roll = rng();
    if (roll < 0.12) engine.observe(t, { kind: 'incoming', amount: roll });
    else if (roll < 0.3) engine.observe(t, { kind: 'mining' });
    if (t % 197 === 0) engine.observe(t, { kind: 'kill', token: `kill:${t}` });
    const result = engine.advance(t, { ...healthy, hull: roll < 0.03 ? 0.24 : 0.85 });
    if (result) records.push(result);
  }
  return records;
}
export { TensionDirector };
