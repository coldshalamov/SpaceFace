// w-550: the arsenal triage's last clause — every tool parked "until its Line
// head exists" now retires to a real §7.1 home (or the named merged power), and
// a retired mark never names a target that does not exist.
import assert from 'node:assert/strict';
import test from 'node:test';

import { WEAPONS } from '../src/data/weapons.js';
import { MODULES } from '../src/data/modules.js';
import { EMERGENT_WEAPON_DEFS } from '../src/data/emergentPrimitives.js';

const MODULE_IDS = new Set(MODULES.map((d) => d.id));
const POWER_HOMES = new Set(['pull', 'shove', 'bomb', 'pin', 'line']);
const ALL_DEFS = [...WEAPONS, ...MODULES, ...(EMERGENT_WEAPON_DEFS || [])];

test('w-550: the six head-parked tools retire to their authored §7.1 homes', () => {
  const expected = new Map([
    ['tool_thruster_hijacker', 'mod_line_head_override'],
    ['wpn_rcs_disruptor_m', 'mod_line_head_override'],
    ['tool_seismic_gong', 'mod_line_head_bell'],
    ['tool_quantum_sympathy', 'mod_line_head_sympathy'],
    ['tool_hardlight_prism', 'mod_line_head_weld'],
    ['tool_polarity_inverter', 'shove'],
  ]);
  for (const [id, home] of expected) {
    const def = ALL_DEFS.find((d) => d.id === id);
    assert.ok(def, `${id} missing from the catalogs`);
    assert.equal(def.retiredInto, home, `${id} retires to ${home}`);
  }
});

test('w-550: every retired mark names a home that exists — never a dead pointer', () => {
  for (const def of ALL_DEFS) {
    if (!def || !def.retiredInto) continue;
    const home = def.retiredInto;
    assert.ok(
      POWER_HOMES.has(home) || MODULE_IDS.has(home) || WEAPONS.some((w) => w.id === home),
      `${def.id} retires into ${home}, which exists nowhere`,
    );
  }
});
