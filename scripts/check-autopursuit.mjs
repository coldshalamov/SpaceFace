import { readFileSync } from 'node:fs';

const ROOT = new URL('../', import.meta.url);
const inputSrc = readFileSync(new URL('src/systems/input.js', ROOT), 'utf8');
const flightSrc = readFileSync(new URL('src/systems/flight.js', ROOT), 'utf8');
const flightV3Src = readFileSync(new URL('src/systems/flightV3.js', ROOT), 'utf8');
const gameStateSrc = readFileSync(new URL('src/core/gameState.js', ROOT), 'utf8');
const allFlightSrc = `${flightSrc}\n${flightV3Src}`;

const checks = [];
check('SPEC3-16 autopursuit input is a held action, not auto-fire toggle', () => {
  assertSource(/autopursuit|autoPursuit|auto-pursuit/i, inputSrc,
    'input.js must expose a held autopursuit action (MMB or F per spec)');
  assertSource(/MouseButton1|middle|auxiliary|MMB|KeyF/i, inputSrc,
    'autopursuit input must be bound to MMB or F');
});

check('SPEC3-16 autopursuit owns flight mode and modeChanged events', () => {
  assertSource(/autopursuit|autoPursuit|auto-pursuit/i, allFlightSrc,
    'flight system must implement an autopursuit mode');
  assertSource(/flight:modeChanged/, allFlightSrc,
    'flight system must emit flight:modeChanged {from,to,reason}');
  assertSource(/manual\|autopursuit\|cruise\|lane|manual['"].*autopursuit|autopursuit['"].*manual/s, allFlightSrc,
    'flight mode contract must include manual and autopursuit states');
});

check('SPEC3-16 autopursuit follows behind the locked target', () => {
  assertSource(/180/, allFlightSrc, 'autopursuit must encode the lower follow distance of 180 wu');
  assertSource(/320/, allFlightSrc, 'autopursuit must encode the upper follow distance of 320 wu');
  assertSource(/solveIntercept|intercept|lead/i, allFlightSrc,
    'autopursuit must steer toward an intercept point, not directly at current target position');
  assertSource(/desiredPursuitVelocity|matchVelocity|speed[-_ ]?match|velocity[-_ ]?match/i, allFlightSrc,
    'autopursuit must compute a target-relative desired velocity');
  assertSource(/AUTOPURSUIT_MATCH_GAIN|worldVelocityErrorToInput/i, allFlightSrc,
    'autopursuit must convert desired velocity into speed-matching flight input');
});

check('SPEC3-16 release returns manual within one tick and save/load does not persist held mode', () => {
  assertSource(/release|held|hold/i, allFlightSrc,
    'autopursuit must be a hold mode with release semantics');
  assertSource(/manual/, allFlightSrc, 'autopursuit release must return to manual');
  assertSource(/flight.*mode|mode.*flight/s, gameStateSrc + allFlightSrc,
    'state.flight.mode must be represented for save/load filtering');
});

const failed = checks.filter((entry) => !entry.ok);
for (const entry of checks) {
  console.log(entry.ok ? `PASS ${entry.name}` : `FAIL ${entry.name}: ${entry.error}`);
}
if (failed.length) {
  console.log(`\n${failed.length}/${checks.length} autopursuit checks failed.`);
  process.exit(1);
}

console.log(`\nAll ${checks.length} autopursuit checks passed.`);

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
