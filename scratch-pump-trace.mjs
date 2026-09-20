// scratch-pump-trace.mjs — offline trace of the encounter pump for a parked player at the nyx
// fringe. Real planner output, real director pump, stubbed world. Shows where each combat beat
// dies: pacing defer, gate defer, relocation, fire, or abort.
import { encounterDirector, planEncounters } from './src/systems/encounterDirector.js';
import { ENCOUNTERS } from './src/data/encounters.js';
import { zonesForSector } from './src/data/sectorZones.js';
import { sectorLocalToGlobalForSector } from './src/data/sectorCoordinates.js';
import { COMMODITIES } from './src/data/commodities.js';

const SEED = 4242;
const SECTOR = 'sector_nyx_march';
const DAY_S = 600;
const PARK = { x: -36492, z: 16020 }; // the measured parking spot (nyx fringe)

const entities = new Map();
const player = {
  id: 1, type: 'ship', alive: true, hull: 140, hullMax: 140, shield: 345, shieldMax: 345,
  pos: { ...PARK }, vel: { x: 0, z: 0 }, flags: {},
};
entities.set(1, player);
const state = {
  playerId: 1, entities, simTime: 0, tick: 0,
  player: { flags: {}, credits: 5000, cargo: { items: {} }, bounty: 0, heat: 0 },
  onboarding: { active: false, finished: true },
  ui: {}, world: { currentSectorId: SECTOR }, meta: { seed: SEED },
  story: { beatIndex: 3 },
};
const events = [];
let nextEntId = 10;
const dir = Object.create(encounterDirector);
dir.state = state;
dir.bus = { emit(name, payload) { events.push({ t: state.simTime, name, payload }); }, on() {} };
dir.helpers = {
  spawnEntity(spec) {
    const ent = { id: nextEntId++, alive: true, type: spec.type || 'ship', pos: { ...spec.pos }, data: spec.data || {} };
    entities.set(ent.id, ent);
    return ent;
  },
};
state.encounterDirector = {
  pending: [], active: {}, live: {}, plannedKey: null,
  pressure: { combat: 0, civilian: 0 }, noise: { mining: 0 }, window: [], cooldowns: {},
  named: {}, externalNamed: {}, receipts: [],
  stats: { fired: 0, resolved: 0, fizzled: 0 },
  lastMeaningfulAt: -1e9, lastAmbientAt: -1e9, lastMajorAt: -1e9, lastEndAt: -1e9,
  escalationSeeds: [], sessionRhythm: null, _accum: 0,
};

const zones = zonesForSector(SECTOR);
const cmdty = COMMODITIES.find((c) => (c.basePrice || 0) > 20);
state.player.cargo.items[cmdty.id] = 30; // hunter carries some cargo in the battery? start without:
delete state.player.cargo.items[cmdty.id];

const trace = [];
let lastDay = -1;
for (let t = 0; t <= 3 * DAY_S * 10; t++) { // 30 sector-days at 1 Hz
  state.simTime = t;
  const day = Math.floor(t / DAY_S);
  if (day !== lastDay) {
    lastDay = day;
    // _planSector requires zones + simTime-derived dayIndex; call through the director.
    dir._planSector(SECTOR);
    trace.push({ t, ev: 'plan', day, pending: state.encounterDirector.pending.map((i) => i.shapeId) });
  }
  // pressure accrual (mirrors the director's 1 Hz _accrue, without zone-threat detail)
  const step = 1;
  dir.state.encounterDirector.pressure.combat = Math.min(140, dir.state.encounterDirector.pressure.combat + 1.0 * step);
  dir.state.encounterDirector.pressure.civilian = Math.min(140, dir.state.encounterDirector.pressure.civilian + 0.5 * step);
  // session rhythm: cheap stand-in — advance phases on the same soft-dwell schedule via the real fn
  dir._tickSessionRhythm(dir.state.encounterDirector, state, t);
  dir._pump(dir.state.encounterDirector, state, t);
  // resolve live encounters after 60s so combat_busy doesn't pin the whole run
  for (const [id, live] of Object.entries(dir.state.encounterDirector.live)) {
    if (live.phase !== 'done' && t - live.startedAt > 90) dir.resolve(live, 'escaped');
  }
}
for (const row of trace) console.log(JSON.stringify(row));
const tel = events.filter((e) => e.name === 'encounter:telegraph');
const spn = events.filter((e) => e.name === 'encounter:spawned');
const res = events.filter((e) => e.name === 'encounter:resolved');
console.log('telegraphs:', tel.length, 'spawned:', spn.length, 'resolved:', res.length);
const oc = {};
for (const r of res) { const k = r.payload.kind + ':' + r.payload.outcome; oc[k] = (oc[k] || 0) + 1; }
console.log('outcomes:', JSON.stringify(oc, null, 1));
const telShapes = {};
for (const r of tel) telShapes[r.payload.kind] = (telShapes[r.payload.kind] || 0) + 1;
console.log('telegraph shapes:', JSON.stringify(telShapes));
const relocated = tel.filter((r) => r.payload.relocated === true).length;
console.log('relocated fires:', relocated);
const pending = state.encounterDirector.pending.map((i) => `${i.shapeId}(defers=${i.defers},due=${Math.round(i.dueAt - t)})`);
console.log('final pending:', JSON.stringify(pending), 'fizzled:', state.encounterDirector.stats.fizzled);
