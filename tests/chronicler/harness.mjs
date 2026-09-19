import { createChronicler } from '../../src/systems/chronicler.js';
let createBus;
try { ({ createBus } = await import('../../src/core/eventBus.js')); }
catch (error) {
  if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
  ({ createBus } = await import('../../../fixtures/eventBus.js'));
}
export { createBus };
export const OUTPUTS = ['chronicler:story', 'news:publish', 'chronicler:legend',
  'chronicler:radio', 'chronicler:recall', 'chronicler:voiceAccepted', 'chronicler:voiceRejected'];
export function harness(options = {}, seed = 4242, beforeInit = null) {
  const bus = createBus();
  const state = { simTime: 0, tick: 0, mode: 'flight', playerId: 1, player: { heat: 0, credits: 500 },
    meta: { seed }, world: { currentSectorId: 'helios', activeSector: { name: 'Helios' } },
    entities: new Map(), rng: () => { throw new Error('Chronicler must not consume the gameplay RNG'); } };
  const outputs = [];
  for (const name of OUTPUTS) bus.on(name, p => outputs.push({ event: name, payload: structuredClone(p) }));
  if (beforeInit) beforeInit(bus, state);
  const system = createChronicler(options).init({ state, bus });
  function at(t) { state.simTime = t; state.tick = Math.round(t * 60); }
  return { bus, state, system, outputs, at,
    emit(t, event, p) { at(t); bus.emit(event, p); },
    step(t) { at(t); return system.update(1 / 60, state); },
    events(name) { return outputs.filter(e => e.event === name).map(e => e.payload); } };
}
export function receipts(suffix = '', visibility = 'public') {
  const marker = `aft-morrow${suffix}`, cargo = `cargo-17${suffix}`, sale = `trade-29${suffix}`;
  const victimId = `ship-42${suffix}`, wreckId = `wreck-900${suffix}`;
  return [
    ['entity:killed', { id: victimId, killerId: 1, victimName: `Morrow${suffix}`, victimClass: 'hauler',
      sectorId: 'helios', visibility, presentation: { cause: 'terrain_collision', surface: 'structure', playerCaused: true } }],
    ['aftermathWreck:recorded', { markerId: marker, victimId, killerId: 1, sectorId: 'helios', victimLabel: `Morrow${suffix}`, visibility }],
    ['aftermathWreck:spawned', { markerId: marker, entityId: wreckId, sectorId: 'helios', visibility }],
    ['salvage:completed', { markerId: marker, wreckId, loot: { cmdty_salvage: 999 }, visibility }],
    ['chronicler:provenance', { receiptId: cargo, stage: 'recovered', source: { kind: 'marker', id: marker },
      actorId: 1, commodityId: 'cmdty_salvage', qty: 8, sectorId: 'helios', visibility }],
    ['chronicler:provenance', { receiptId: sale, stage: 'sold', source: { kind: 'receipt', id: cargo },
      actorId: 1, commodityId: 'cmdty_salvage', qty: 4, total: 240, stationId: 'station_helios_dock', sectorId: 'helios', visibility }],
    ['chronicler:provenance', { receiptId: `law-31${suffix}`, stage: 'law', source: { kind: 'receipt', id: sale },
      actorId: 1, kind: 'fencing investigation', sectorId: 'helios', visibility }],
  ];
}
export function chain(h, { t = 10, suffix = '', visibility = 'public', through = 7, order = null } = {}) {
  const rs = receipts(suffix, visibility).slice(0, through);
  for (const i of order || rs.map((_, i) => i)) h.emit(t, ...rs[i]);
  return rs;
}
