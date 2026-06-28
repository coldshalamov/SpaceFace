// check-countermeasures.mjs — guards the missile-countermeasure / EW contract (goal P1-7).
//
// Homing missiles are the biggest single combat threat, and before P1-7 the only counterplay was
// dodging. This check pins the full countermeasure contract so a refactor can't silently break the
// interception:
//   1. The countermeasure modules exist (chaff + ECM) with the required config fields.
//   2. systems/countermeasures.js exists, exports the system, and reads the module config.
//   3. The system is registered in UPDATE_ORDER (after weapons, before combat).
//   4. input.js exposes the deploy keybind + sets state.input.deployCountermeasure.
//   5. weapons.js homing-steering reads data.turnRate (so ECM jamming actually takes effect) and
//      data.targetId (so chaff diversion actually retargets missiles).
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MODULES } from '../src/data/modules.js';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

// 1. Countermeasure modules exist with the required config.
const cms = MODULES.filter((m) => m.mods && m.mods.countermeasure);
assert.ok(cms.length >= 2, 'at least 2 countermeasure modules must exist (chaff + ECM)');
const chaff = cms.find((m) => m.mods.countermeasure.kind === 'chaff');
const ecm = cms.find((m) => m.mods.countermeasure.kind === 'ecm');
assert.ok(chaff, 'a chaff countermeasure module must exist');
assert.ok(ecm, 'an ECM countermeasure module must exist');
for (const m of cms) {
  const c = m.mods.countermeasure;
  assert.equal(m.slotType, 'utility', `countermeasure ${m.id} must use the utility slot`);
  for (const f of ['kind', 'radius', 'durationS', 'cooldownS', 'lockBreakPct']) {
    assert.ok(f in c, `countermeasure ${m.id} missing mods.countermeasure.${f}`);
  }
  assert.ok(c.radius > 0 && c.durationS > 0 && c.cooldownS > 0, `countermeasure ${m.id} has non-positive radius/duration/cooldown`);
}
// ECM must specify a turnRateMult (the jamming strength).
assert.ok('turnRateMult' in ecm.mods.countermeasure, 'ECM module must specify turnRateMult (jamming strength)');
// Chaff must specify a divertPct (fraction of missiles diverted to the decoy).
assert.ok('divertPct' in chaff.mods.countermeasure, 'chaff module must specify divertPct (missile diversion fraction)');

// 2. The countermeasures system exists + exports correctly.
assert.ok(existsSync(join(ROOT, 'src/systems/countermeasures.js')), 'src/systems/countermeasures.js must exist');
const cmSrc = read('src/systems/countermeasures.js');
assert.match(cmSrc, /export const countermeasures/, 'countermeasures.js must export the countermeasures system');
assert.match(cmSrc, /kind !== 'missile'/, 'countermeasures must target missile projectiles (skip non-missiles)');
assert.match(cmSrc, /lockProgress/, 'countermeasures must break attacker locks (read/write lockProgress)');
assert.match(cmSrc, /d\.targetId/, 'countermeasures must divert missiles (rewrite data.targetId)');
assert.match(cmSrc, /d\.turnRate/, 'countermeasures must jam guidance (write data.turnRate for ECM)');

// 3. Registered in UPDATE_ORDER (after weapons, before combat — so diversion happens pre-resolve).
const regSrc = read('src/core/registry.js');
assert.match(regSrc, /import \{ countermeasures \}/, 'registry must import countermeasures');
assert.match(regSrc, /weapons, countermeasures,/, 'countermeasures must appear after weapons in the system lists');

// 4. input.js exposes the deploy keybind + sets the flag.
const inputSrc = read('src/systems/input.js');
const gamepadSrc = read('src/systems/gamepad.js');
const promptSrc = read('src/ui/controlPrompts.js');
const helpSrc = read('src/ui/screens/help.js');
const readmeSrc = read('README.md');
assert.match(inputSrc, /countermeasure:\s*\['KeyX'\]/, 'input.js must default the countermeasure keybind to KeyX');
assert.doesNotMatch(inputSrc, /countermeasure:\s*\['KeyC'\]/,
  'countermeasure must not share KeyC with claim/base interaction');
assert.match(inputSrc, /x:\s*'KeyX'/, 'input fallback map must recognize X as the countermeasure key');
assert.match(gamepadSrc, /countermeasure:\s*\['r3'\]/, 'gamepad R3 must deploy countermeasures');
assert.match(inputSrc, /gp\.actions\.countermeasure[\s\S]*inp\.deployCountermeasure/,
  'input.js must merge the gamepad countermeasure action into deployCountermeasure');
assert.match(inputSrc, /inp\.deployCountermeasure/, 'input.js must set state.input.deployCountermeasure on deploy');
assert.match(promptSrc, /X countermeasure/, 'keyboard prompts must teach X as countermeasure');
assert.match(promptSrc, /R3 countermeasure/, 'gamepad prompts must teach R3 as countermeasure');
assert.match(helpSrc, /Countermeasure[\s\S]*X/, 'Help must document keyboard countermeasure');
assert.match(helpSrc, /Countermeasure[\s\S]*R3/, 'Help must document gamepad countermeasure');
assert.match(readmeSrc, /\|\s*Countermeasure\s*\|\s*\*\*X\*\* \/ \*\*R3\*\*/,
  'README controls must document X / R3 countermeasure');

// 5. weapons.js homing-steering reads the fields the countermeasure writes.
const weaponsSrc = read('src/systems/weapons.js');
assert.match(weaponsSrc, /d\.turnRate/, 'weapons.js homing-steering must read data.turnRate (ECM jamming target)');
assert.match(weaponsSrc, /d\.targetId/, 'weapons.js homing-steering must read data.targetId (chaff diversion target)');
assert.match(weaponsSrc, /'missile'/, "weapons.js must reference the 'missile' kind (homing-steering + projectile spawn)");

// 6. The deploy input flag is part of the default input state (so reading it never yields undefined).
const gsSrc = read('src/core/gameState.js');
assert.match(gsSrc, /deployCountermeasure/, 'gameState default input must include deployCountermeasure');

console.log(`Countermeasures OK — ${cms.length} modules (${cms.map((m) => m.mods.countermeasure.kind).join(', ')}), system registered, deploy keybind wired, homing-steering integration confirmed.`);
