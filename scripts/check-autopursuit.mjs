import { readFileSync } from 'node:fs';

const ROOT = new URL('../', import.meta.url);
const inputSource = readFileSync(new URL('src/systems/input.js', ROOT), 'utf8');
const flightSource = readFileSync(new URL('src/systems/flightV3.js', ROOT), 'utf8');
const modeSource = readFileSync(new URL('src/combat/autoTargetMode.js', ROOT), 'utf8');
const assistSource = readFileSync(new URL('src/systems/autoTargetAssist.js', ROOT), 'utf8');
const checks = [];

check('G remains the auto-target toggle', () => {
  assertSource(/binding\(state,\s*'autoFire'\)/, assistSource,
    'the shipped G handler must resolve the autoFire binding');
  assertSource(/toggleAutoTarget/, assistSource,
    'the shipped G handler must toggle auto-target mode');
});

check('trackpad gestures create a clutchable world-space flight path', () => {
  assertSource(/recordAutoTargetPath/, inputSource,
    'relative pointer motion must record the draw-to-fly path');
  assertSource(/autoTargetPath[\s\S]*points/, inputSource,
    'the input contract must retain path points');
  assertSource(/followAutoTargetPath/, modeSource,
    'auto-target mode must consume the recorded path');
});

check('weapon lead stays independent from ship steering', () => {
  assertSource(/computeLockedLeadPoint/, modeSource,
    'auto-target must compute projectile lead');
  assertSource(/inp\.aimAngle\s*=/, modeSource,
    'auto-target must write weapon aim');
  assertSource(/applyWorldFlightCommand/, modeSource,
    'draw-to-fly must write flight intent separately');
});

check('auto-target flight authority is present without an orbit controller', () => {
  assertSource(/applyAutoTargetHelmProfile/, flightSource,
    'Flight V3 must restore auto-target helm response');
  assertSource(/applyAutoTargetPathProfile/, flightSource,
    'Flight V3 must restore draw-to-fly acceleration authority');
  assertNoSource(/AUTOPURSUIT_FOLLOW_DIST|pursuitFollowPoint|stepPursuitSlotAssist/, flightSource,
    'Flight V3 must not contain an automatic orbit/follow controller');
});

const failed = checks.filter((entry) => !entry.ok);
for (const entry of checks) {
  console.log(entry.ok ? `PASS ${entry.name}` : `FAIL ${entry.name}: ${entry.error}`);
}
if (failed.length) {
  console.log(`\n${failed.length}/${checks.length} auto-target checks failed.`);
  process.exit(1);
}

console.log(`\nAll ${checks.length} auto-target checks passed.`);

function check(name, fn) {
  try {
    fn();
    checks.push({ name, ok: true });
  } catch (error) {
    checks.push({ name, ok: false, error: error?.message || String(error) });
  }
}

function assertSource(pattern, source, message) {
  if (!pattern.test(source)) throw new Error(message);
}

function assertNoSource(pattern, source, message) {
  if (pattern.test(source)) throw new Error(message);
}
