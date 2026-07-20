import { readFileSync } from 'node:fs';

const ROOT = new URL('../', import.meta.url);
const inputSrc = readFileSync(new URL('src/systems/input.js', ROOT), 'utf8');
const flightV3Src = readFileSync(new URL('src/systems/flightV3.js', ROOT), 'utf8');
const slotSrc = readFileSync(new URL('src/core/flight/pursuitSlotAssist.js', ROOT), 'utf8');
const checks = [];

check('SPEC3-16 MMB selects the shared pursuit slot while non-ships retain GOTO', () => {
  assertSource(/MouseButton1|MMB|middle|auxiliary/i, inputSrc,
    'input.js must retain MMB as the direct pursuit/approach control');
  assertSource(/createPursuitSlot\(\{ host: p, target: lockEnt, source: 'mmb' \}\)/, inputSrc,
    'MMB ship selection must feed the shared PQ-007 slot contract');
  assertSource(/ui:setCourse[\s\S]*autopilot:\s*true/, inputSrc,
    'MMB non-ship selection must retain the existing GOTO behavior');
});

check('PQ-007 pursuit is an additive membrane, not a flight mode or path follower', () => {
  assertSource(/stepPursuitSlotAssist/, flightV3Src,
    'Flight V3 must consume the bounded pursuit-slot controller');
  assertSource(/queuePhysicsImpulse\(entity, pursuitSlot\.impulse\)/, flightV3Src,
    'pursuit commands must cross the accumulating impulse membrane');
  assertNoSource(/manual\|autopursuit\|cruise\|lane|pursuitFollowPoint|AUTOPURSUIT_FOLLOW_DIST/, flightV3Src,
    'pursuit must not own a flight mode or preserve the retired fixed-tail follower');
});

check('PQ-007 station is target-relative, bounded, and velocity-fed', () => {
  assertSource(/targetHeading\(target\)[\s\S]*slot\.bearing/, slotSrc,
    'desired position must be expressed in the target heading frame');
  assertSource(/target\.vel\.x[\s\S]*target\.vel\.z/, slotSrc,
    'the controller must match target velocity rather than chase raw position');
  assertSource(/maxAccelerationFraction[\s\S]*Math\.min/, slotSrc,
    'the additive controller must cap assist authority');
  assertSource(/invalid-body|invalid-target|invalid-command/, slotSrc,
    'non-finite inputs/outputs must fail closed');
});

check('manual input releases within the same input tick and prevents same-tick re-arm', () => {
  assertSource(/reason = manualPursuitOverride \? 'manual-override'/, inputSrc,
    'manual movement must deactivate the selected slot');
  assertSource(/active:\s*false, reason, releasedTick:\s*state\.tick/, inputSrc,
    'the release reason and exact fixed tick must be committed to the shared input slot');
  assertSource(/pursuitPressed && !manualPursuitOverride/, inputSrc,
    'MMB must not re-arm after manual authority has won the tick');
});

const failed = checks.filter((entry) => !entry.ok);
for (const entry of checks) {
  console.log(entry.ok ? `PASS ${entry.name}` : `FAIL ${entry.name}: ${entry.error}`);
}
if (failed.length) {
  console.log(`\n${failed.length}/${checks.length} pursuit-slot checks failed.`);
  process.exit(1);
}

console.log(`\nAll ${checks.length} pursuit-slot checks passed.`);

function check(name, fn) {
  try {
    fn();
    checks.push({ name, ok: true });
  } catch (error) {
    checks.push({ name, ok: false, error: error && error.message ? error.message : String(error) });
  }
}

function assertSource(pattern, source, message) {
  if (!pattern.test(source)) throw new Error(message);
}

function assertNoSource(pattern, source, message) {
  if (pattern.test(source)) throw new Error(message);
}
