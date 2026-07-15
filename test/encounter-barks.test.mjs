// Unit test: ENCOUNTER_BARKS variant arrays + barkText seeded pick + sim voice path.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { createSimulation } from '../src/core/sim.js';
import { mulberry32, hash32 } from '../src/core/rng.js';
import { ENCOUNTERS, ENCOUNTER_BARKS, NAMED_CAPTAINS, barkText } from '../src/data/encounters.js';
import { zonesForSector } from '../src/data/sectorZones.js';
import { encounterDirector, planEncounterShape } from '../src/systems/encounterDirector.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';

const SCRATCH = process.env.SF_BARK_SCRATCH
  || path.join(process.env.LOCALAPPDATA || '/tmp', 'Temp', 'grok-goal-2c8b25af2265', 'implementer');

const EXPANDED_KEYS = [
  'toll_demand', 'toll_paid_ack', 'toll_refused_ack', 'toll_flee_ack', 'toll_broke_ack',
  'patrol_scan_hail', 'patrol_scan_clear', 'patrol_scan_caught', 'patrol_scan_refused',
  'ambush_tele', 'ambush_spring', 'distress_call', 'distress_rescued_ack', 'distress_bait_spring',
  'convoy_depart', 'trader_pass', 'patrol_beat_hail', 'salvage_ping', 'bounty_notice',
];

const ORIGINAL_LINES = {
  toll_demand: 'REACH: toll {amount} cr. Cut thrust to pay, or run.',
  toll_paid_ack: 'Smart trade. Lane is yours.',
  toll_refused_ack: 'Wrong answer. Take the cargo.',
  toll_flee_ack: 'Runner. Burn them down.',
  toll_broke_ack: 'Empty pockets. Take it out of the hull.',
  patrol_scan_hail: 'CONCORD: cut thrust for scan.',
  patrol_scan_clear: 'Clear. Fly safe.',
  patrol_scan_caught: 'Contraband confirmed. Fine logged, goods seized.',
  patrol_scan_refused: 'Scan refused. Transponder flagged.',
  ambush_tele: 'Sensor ghosts in the belt shadow. Stay sharp.',
  ambush_spring: 'Ambush. Cut them off — nobody leaves with cargo.',
  distress_call: 'Mayday. Drive dead, shields failing. Anyone.',
  distress_rescued_ack: 'You came. Thought nobody would.',
  distress_bait_spring: 'Gotcha. Light them up.',
  convoy_depart: '{faction} convoy on the lane — {cargo} for {dest}.',
  trader_pass: 'Hauler on approach. {cargo} for {dest}.',
  patrol_beat_hail: 'Concord patrol on station. Fly clean.',
  salvage_ping: 'Salvage transponder, faint. Derelict field marked.',
  bounty_notice: 'Bounty board paid up front. Nothing personal.',
};

const PLACEHOLDER_KEYS = {
  toll_demand: ['{amount}'],
  convoy_depart: ['{faction}', '{cargo}', '{dest}'],
  trader_pass: ['{cargo}', '{dest}'],
};

let failures = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failures++; }

for (const key of EXPANDED_KEYS) {
  const val = ENCOUNTER_BARKS[key];
  if (!Array.isArray(val)) { fail(`${key} is not an array`); continue; }
  if (val.length < 3 || val.length > 5) fail(`${key} has ${val.length} variants (need 3–5)`);
  if (val[0] !== ORIGINAL_LINES[key]) fail(`${key}[0] does not match original line`);
}

for (const [key, tokens] of Object.entries(PLACEHOLDER_KEYS)) {
  for (const line of ENCOUNTER_BARKS[key]) {
    for (const tok of tokens) {
      if (!line.includes(tok)) fail(`${key} variant missing ${tok}: "${line}"`);
    }
  }
}

for (const key of EXPANDED_KEYS) {
  for (const line of ENCOUNTER_BARKS[key]) {
    if (typeof line !== 'string' || !line.trim()) fail(`${key} has empty/non-string copy`);
    if (/[\r\n\u2028\u2029]/u.test(line)) fail(`${key} must fit the inline voice surface: "${line}"`);
    if (/[\u0000-\u001f\u007f\ufffd]/u.test(line)) fail(`${key} contains an unsafe control/replacement character: "${line}"`);
  }
}

{
  const a1 = barkText('toll_demand', { amount: 120 }, 'enc-a');
  const a2 = barkText('toll_demand', { amount: 120 }, 'enc-a');
  if (a1 !== a2) fail('barkText not stable for same pick key');
  if (!a1.includes('120')) fail(`fmt substitution failed: "${a1}"`);
  const picks = new Set(['enc-a', 'enc-b', 'enc-c', 'enc-d', 'enc-e'].map((k) => barkText('toll_demand', { amount: 120 }, k)));
  if (picks.size < 2) fail(`expected ≥2 distinct toll_demand picks, got ${picks.size}`);
}

for (const key of ['hunter_iask', 'claim_ping', 'snare_warn', 'miniboss_taunt']) {
  const text = barkText(key);
  if (typeof text !== 'string' || text.length === 0) fail(`legacy bark ${key} empty`);
}

for (const c of NAMED_CAPTAINS) {
  const text = barkText(c.bark);
  if (typeof text !== 'string' || text.length === 0) fail(`${c.id}: barkText(${c.bark}) empty`);
}

const HAIL_KEYS = ['toll_demand', 'patrol_scan_hail', 'patrol_beat_hail'];
for (const key of HAIL_KEYS) {
  for (let i = 1; i < ENCOUNTER_BARKS[key].length; i++) {
    const line = ENCOUNTER_BARKS[key][i];
    if (!/^(REACH|VAEL|CONCORD|MERIDIAN):/.test(line)) {
      fail(`${key}[${i}] hail missing CAPS callsign prefix: "${line}"`);
    }
  }
}

function forceTollPrimary(seed, seq) {
  const sim = createSimulation({ seed, systems: [spawnBudget, encounterDirector] });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = 'sector_tethys_junction';
  const player = sim.spawn({ type: 'ship', team: 0, pos: { x: 500, z: 1500 }, vel: { x: 0, z: 0 }, hull: 200, hullMax: 200, radius: 6 });
  state.playerId = player.id;
  state.player.cargo.items = { cmdty_refined_metals: 12 };
  const voice = [];
  bus.on('encounter:voice', (p) => voice.push({ ...p }));
  bus.emit('sector:enter', { sectorId: 'sector_tethys_junction' });
  const inst = sim.registry.get('encounterDirector');
  const dir = state.encounterDirector;
  const shape = ENCOUNTERS.pirate_toll;
  const zones = zonesForSector('sector_tethys_junction').filter((z) => shape.zoneTypes.includes(z.type));
  const item = planEncounterShape(shape, zones[0], 'sector_tethys_junction', 0, seq, mulberry32(hash32(seed, 'toll-voice', seq)));
  item.sectorId = 'sector_tethys_junction';
  dir.pressure.combat = 140;
  inst._fire(dir, state, item, shape, state.simTime || 0);
  const primary = voice.find((v) => v.encounterId === item.encounterId && v.primary);
  return { encounterId: item.encounterId, text: primary?.text || '' };
}

fs.mkdirSync(SCRATCH, { recursive: true });
const pickKeys = ['enc-a', 'enc-b', 'enc-c'];
const vars = { amount: 120, faction: 'Reach', cargo: 'iron ore', dest: 'Nexus' };
const sample = pickKeys.map((k) => barkText('toll_demand', vars, k));
fs.writeFileSync(path.join(SCRATCH, 'bark-variant-sample.log'), sample.join('\n') + '\n');

const probeLines = [];
for (const key of EXPANDED_KEYS) {
  for (const pk of pickKeys) {
    probeLines.push(`${key}@${pk}: ${barkText(key, vars, pk)}`);
  }
}
fs.writeFileSync(path.join(SCRATCH, 'bark-variant-probe.log'), probeLines.join('\n') + '\n');

{
  const simLines = [];
  const texts = new Set();
  for (const [seq, seed] of [71, 72, 73, 74, 75].map((s, i) => [i, s])) {
    const { encounterId, text } = forceTollPrimary(seed, seq);
    simLines.push(`seed=${seed} enc=${encounterId}: ${text}`);
    if (text) texts.add(text);
  }
  fs.writeFileSync(path.join(SCRATCH, 'bark-voice-sim.log'), simLines.join('\n') + '\n');
  if (texts.size < 2) fail(`sim voice expected ≥2 distinct toll_demand texts, got ${texts.size}`);
}

if (failures) {
  console.error(`encounter-barks.test: ${failures} failures`);
  process.exit(1);
}
console.log(`encounter-barks.test: ok (${EXPANDED_KEYS.length} expanded keys, variant pick verified)`);
process.exit(0);
