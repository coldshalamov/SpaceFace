#!/usr/bin/env node
// Structural gate: ENCOUNTER_BARKS variant arrays + barkText pickKey must be on HEAD.
import assert from 'node:assert/strict';
import { ENCOUNTER_BARKS, barkText } from '../src/data/encounters.js';

const KEYS = [
  'toll_demand', 'toll_paid_ack', 'toll_refused_ack', 'toll_flee_ack', 'toll_broke_ack',
  'patrol_scan_hail', 'patrol_scan_clear', 'patrol_scan_caught', 'patrol_scan_refused',
  'ambush_tele', 'ambush_spring', 'distress_call', 'distress_rescued_ack', 'distress_bait_spring',
  'convoy_depart', 'trader_pass', 'patrol_beat_hail', 'salvage_ping', 'bounty_notice',
];

const ORIGINAL = {
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

assert.equal(barkText.length, 3, 'barkText must accept (barkId, vars, pickKey)');
for (const key of KEYS) {
  const val = ENCOUNTER_BARKS[key];
  assert(Array.isArray(val), `${key} must be a variant array`);
  assert(val.length >= 3 && val.length <= 5, `${key} must have 3–5 variants`);
  assert.equal(val[0], ORIGINAL[key], `${key}[0] must match original line`);
}
const a = barkText('toll_demand', { amount: 1 }, 'k1');
const b = barkText('toll_demand', { amount: 1 }, 'k1');
assert.equal(a, b, 'same pickKey must be stable');
console.log(`assert-bark-on-head: ok (${KEYS.length} variant keys on HEAD)`);