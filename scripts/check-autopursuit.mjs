import { readFileSync } from 'node:fs';
import { DYNAMIC_FLIGHT_STICK_TUNING, dynamicFlightStickRadius } from '../src/systems/dynamicFlightStick.js';

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

check('trackpad motion drives a bounded dynamic combat stick', () => {
  assertSource(/recordAutoTargetStick/, inputSource,
    'relative pointer motion must feed the combat stick');
  assertSource(/recordDynamicFlightStick/, inputSource,
    'input must use the bounded dynamic-stick reducer');
  assertSource(/publishAutoTargetStick/, inputSource,
    'the input tick must publish the live stick vector');
  assertNoSource(/recordAutoTargetPath\(this/, inputSource,
    'desktop G must no longer author persistent flight geometry');
  const radius = dynamicFlightStickRadius(1920, 1080);
  if (!(radius >= DYNAMIC_FLIGHT_STICK_TUNING.minRadiusPx
    && radius <= DYNAMIC_FLIGHT_STICK_TUNING.maxRadiusPx)) {
    throw new Error('combat-stick radius must remain inside its authored calibration envelope');
  }
});

check('weapon lead stays independent from ship steering', () => {
  assertSource(/computeLockedLeadPoint/, modeSource,
    'auto-target must compute projectile lead');
  assertSource(/inp\.aimAngle\s*=/, modeSource,
    'auto-target must write weapon aim');
  assertSource(/autoTargetVector/, modeSource,
    'combat stick must enter through the independent flight-vector channel');
  assertSource(/applyWorldFlightCommand/, modeSource,
    'combat stick must write flight intent separately from weapon aim');
});

check('auto-target keeps ordinary ship physics and no orbit controller', () => {
  assertSource(/applyAutoTargetHelmProfile/, flightSource,
    'Flight V3 must retain the responsive auto-target helm profile');
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
  try { fn(); checks.push({ name, ok: true }); }
  catch (error) { checks.push({ name, ok: false, error: error?.message || String(error) }); }
}
function assertSource(pattern, source, message) { if (!pattern.test(source)) throw new Error(message); }
function assertNoSource(pattern, source, message) { if (pattern.test(source)) throw new Error(message); }
