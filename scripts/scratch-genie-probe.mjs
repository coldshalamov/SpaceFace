// Scratch probe: do the genie systems emit under a minimal harness?
import { createBus } from '../src/core/eventBus.js';
import { createChronicler } from '../src/systems/chronicler.js';
import { createTensionDirectorSystem } from '../src/systems/tensionDirector.js';

const bus = createBus();
const seen = [];
const origEmit = bus.emit.bind(bus);
bus.emit = (type, payload) => { seen.push(type); return origEmit(type, payload); };

const state = {
  simTime: 0, playerId: 'player_1',
  entities: new Map(),
  world: { currentSectorId: 'sector_helios_prime' },
  run: {},
};
const chronicler = createChronicler({ shouldObserve: () => true });
const td = createTensionDirectorSystem();
const ctx = { state, bus, helpers: {} };
chronicler.init(ctx); td.init(ctx);
console.log('init ok. chronicler name:', chronicler.name, '| td name:', td.name);

// Feed the chronicler a kill + salvage + trade to cross a story threshold
bus.emit('entity:killed', { id: 'pirate_1', killerId: 'player_1', playerCaused: true, sectorId: 'sector_helios_prime', presentation: { cause: 'collision' } });
bus.emit('aftermathWreck:recorded', { markerId: 'wreck_1', victimId: 'pirate_1', sectorId: 'sector_helios_prime' });
bus.emit('salvage:completed', { wreckId: 'wreck_1', markerId: 'wreck_1' });
bus.emit('economy:tradeCompleted', { side: 'sell', quantity: 4, value: 240, stationId: 'station_helios' });
// Feed TD observations a hostile pressure signal
bus.emit('combat:damage', { targetId: 'player_1', amount: 10, attackerId: 'pirate_2' });

const dt = 1 / 60;
for (let i = 0; i < 60 * 130; i++) { // 130 sim-seconds
  state.simTime += dt;
  chronicler.update(dt, state);
  td.update(dt, state);
}
console.log('emitted event types:', seen.filter(t => /^(tension|chronicler|news)/.test(t)).join(', ') || 'NONE');
console.log('chronicler diagnostics:', JSON.stringify(chronicler.diagnostics?.() || {}));
console.log('td inspect keys:', Object.keys(td.inspect?.() || {}));
