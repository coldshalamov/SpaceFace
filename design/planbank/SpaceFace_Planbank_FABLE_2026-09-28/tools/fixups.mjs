// Exact, counted replacements applied to the bank data after the first audit run (kept for the record).
// Convention introduced here: a backticked identifier starting with `+` is a NEW name the task creates.
import fs from 'node:fs';
import path from 'node:path';
const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const B = (n) => path.join(HERE, 'bank', n);
const R = [
  // 01-hand
  ['packets-01-hand.mjs', '(`curve`, `expo`, `sensitivity` have zero hits in `gamepad.js` and `settings.js`)', '(the terms curve, expo and sensitivity have zero hits in `gamepad.js` and `settings.js`)'],
  ['packets-01-hand.mjs', 'Add `controls.gamepad.curve` (linear/expo), `deadzoneRight`, `sensitivityAim`, `sensitivityFly` and `controls.mouse.sensitivity`/`invertY` to `defaultSettings()`', 'Add `+controls.gamepad.curve` (linear/expo), `+deadzoneRight`, `+sensitivityAim`, `+sensitivityFly` and `+controls.mouse.sensitivity`/`+controls.mouse.invertY` to `defaultSettings()`'],
  ['packets-01-hand.mjs', 'Locate the HUD gauge suites with `rg speedGauge test/`.', 'Locate the HUD gauge suites with `rg setKitGauge test/` (the gauge helper) and name what you verified.'],
  ['packets-01-hand.mjs', 'the new gameplay setting `pursuitSlotAssist` is on', 'the new gameplay setting `+gameplay.pursuitSlotAssist` is on'],
  ['packets-01-hand.mjs', 'Add `accessibility.haptics` (off/low/full)', 'Add `+accessibility.haptics` (off/low/full)'],
  // 03-fight
  ['packets-03-fight.mjs', '(`hitConfirm`, `hitmarker` and `hitMarker` have zero hits in `src/`)', '(the terms hitConfirm, hitmarker and hitMarker have zero hits in `src/`)'],
  ['packets-03-fight.mjs', '`phaseAtTurretsLost: [4, 10]`', '`+phaseAtTurretsLost: [4, 10]`'],
  ['packets-03-fight.mjs', 'optional `enemyId` and `scoreId`', 'optional `+enemyId` and `+scoreId`'],
  ['packets-20-more.mjs', 'Add `physicalClass` to every', 'Add `+physicalClass` to every'],
  // 05-world
  ['packets-05-world.mjs', 'Author `PALLAS_ACTIVITY_POCKETS`', 'Author `+PALLAS_ACTIVITY_POCKETS`'],
  ['packets-05-world.mjs', 'chronicler suites under `test/chronicler` stay green', '`tests/chronicler/chronicler.test.mjs` and `tests/chronicler/hardening.test.mjs` stay green'],
  ['packets-05-world.mjs', "'Run the suites under `test/chronicler/` and `test/market-news-literal-publish.test.mjs`.'", "'`tests/chronicler/chronicler.test.mjs`', '`tests/chronicler/hardening.test.mjs`', '`test/market-news-literal-publish.test.mjs`'"],
  ['packets-05-world.mjs', 'exposed as `rankForState`', 'exposed as `+rankForState`'],
  // 07-longgame
  ['packets-07-longgame.mjs', '`player.sessionSinkLedger`', '`player.sessionSinks`', 2],
  ['packets-07-longgame.mjs', 'Add `player.tradeMargins[commodityId]` roll-ups', 'Add `+player.tradeMargins[commodityId]` roll-ups'],
  ['packets-07-longgame.mjs', 'Locate boost suites with `rg boostCd test/`.', 'Locate boost suites with `rg boostCdS src/ test/` (the authored field) and name what you verified.'],
  ['packets-07-longgame.mjs', 'Add a `ui:setShipName` intent', 'Add a `+ui:setShipName` intent'],
  ['packets-07-longgame.mjs', 'author `drive_torch_xl` as', 'author `+drive_torch_xl` as'],
  ['packets-07-longgame.mjs', '(`ui:setActiveShip`, `ui:sellShip`)', '(`ui:setActiveShip` and the sell verb)'],
  ['packets-07-longgame.mjs', "'Run the suites under `test/chronicler/`.'", "'`tests/chronicler/chronicler.test.mjs`', '`tests/chronicler/hardening.test.mjs`'"],
  ['packets-07-longgame.mjs', 'settle the mission as `failed_external`', 'settle the mission as `+failed_external`'],
  // 11-presentation
  ['packets-11-presentation.mjs', 'Author `sfx_cargo_jettison` in `RECIPES`', 'Author `+sfx_cargo_jettison` in `RECIPES`'],
  ['packets-11-presentation.mjs', 'through `presetFor(eventKind, severity)`', 'through `presetFor(kind)` (extend it with a severity argument)'],
  ['packets-11-presentation.mjs', 'Declare a `reducedMode` on all 85 recipes', 'Declare a `+reducedMode` on all 85 recipes'],
  ['packets-11-presentation.mjs', 'a new recipe without `reducedMode` fails', 'a new recipe without `+reducedMode` fails'],
  // 14-machine
  ['packets-14-machine.mjs', 'Publish `state.render.arrivalRosterMiss`', 'Publish `+state.render.arrivalRosterMiss`'],
  ['packets-14-machine.mjs', '`arrivalRosterMiss` ≤ 2', '`+arrivalRosterMiss` ≤ 2'],
  ['packets-14-machine.mjs', "Gzip the envelope with `CompressionStream('gzip')` inside the worker", 'Gzip the envelope with the CompressionStream web API (gzip) inside the worker'],
  ['packets-20-more.mjs', 'Add `probe:heap-verify`, `probe:main-thread` and `probe:crucible-cpu` npm scripts', 'Add `+probe:heap-verify`, `+probe:main-thread` and `+probe:crucible-cpu` npm scripts'],
  // 15-professional
  ['packets-15-professional.mjs', "'scripts/check-settings-keys.mjs'", "'scripts/fb-check-settings-keys.mjs'"],
  ['packets-15-professional.mjs', 'Add `scripts/check-settings-keys.mjs`:', 'Add `scripts/fb-check-settings-keys.mjs`:'],
  ['packets-15-professional.mjs', 'Add `video.hudScale`, `video.hudOpacity` to `defaultSettings()`', 'Add `+video.hudScale`, `+video.hudOpacity` to `defaultSettings()`'],
  ['packets-15-professional.mjs', 'Port the hardship clamp into `stationServices._startJob` for refuel', 'Port the hardship clamp into `enqueuePlayerJob` in `stationServices.js` for refuel'],
  ['packets-15-professional.mjs', 'Expose a read-only `careerStats()` accessor', 'Expose a read-only `+careerStats()` accessor'],
  ['packets-15-professional.mjs', 'reads `careerStats()`, `player.stats`', 'reads `+careerStats()`, `player.stats`'],
  ['packets-15-professional.mjs', '`importString`/`exportString` therefore move the world', '`importString` and its export twin therefore move the world'],
  ['packets-15-professional.mjs', "'scripts/fuzz-save-envelope.mjs'", "'scripts/fb-fuzz-save-envelope.mjs'"],
  ['packets-15-professional.mjs', 'after a forced `QuotaExceeded`,', 'after a forced `QuotaExceededError`,'],
  ['packets-15-professional.mjs', '(`unstick`, `isStuck`, `stuckS` have zero hits under `src/systems` and `src/core`)', '(the terms unstick, isStuck and stuckS have zero hits under `src/systems` and `src/core`)'],
  ['packets-15-professional.mjs', 'Accumulate `stuckS` in `world.js`', 'Accumulate `+stuckS` in `world.js`'],
  ['packets-15-professional.mjs', '`holdToToggle` has zero hits in `src/`', 'holdToToggle has zero hits in `src/`'],
  ['packets-15-professional.mjs', 'Add `accessibility.holdToToggle` (off / per-verb set)', 'Add `+accessibility.holdToToggle` (off / per-verb set)'],
  ['packets-15-professional.mjs', "writeSet: ['test/fb-migration-ladder.test.mjs', 'test/fixtures/fb-save-versions'],", "writeSet: ['test/fb-migration-ladder.test.mjs', 'test/fixtures/fb-save-v01.json'],"],
  ['packets-15-professional.mjs', 'Author a minimal fixture per version under `test/fixtures/fb-save-versions/`;', 'Author a minimal fixture per version as `test/fixtures/fb-save-v01.json` through v14;'],
  ['packets-15-professional.mjs', 'Add `controls.gamepad.glyphSet` consumed by', 'Add `+controls.gamepad.glyphSet` consumed by'],
  ['packets-20-more.mjs', 'Add `audio.muteOnFocusLoss` and `gameplay.pauseOnFocusLoss`', 'Add `+audio.muteOnFocusLoss` and `+gameplay.pauseOnFocusLoss`'],
  ['packets-20-more.mjs', 'Add a `cargo_insurance` service', 'Add a `+cargo_insurance` service'],
  ['packets-20-more.mjs', 'play an authored `sfx_fuel_empty` sting', 'play an authored `+sfx_fuel_empty` sting'],
  // lines near-dup
  ['lines-02.mjs', "done: 'On seed 4242 the first `massSeed:deployed` produces one hint line; a focused test pins once per profile',", "done: 'Deploying a mass seed for the first time on seed 4242 yields exactly one hint and later deploys none; a focused test pins the profile flag',"],
];
let bad = 0;
for (const [file, from, to, expect = 1] of R) {
  const p = B(file); let t = fs.readFileSync(p, 'utf8');
  const n = t.split(from).length - 1;
  if (n !== expect) { console.log(`MISMATCH ${file}: expected ${expect} found ${n}: ${from.slice(0, 70)}`); bad++; continue; }
  t = t.split(from).join(to); fs.writeFileSync(p, t, 'utf8');
}
console.log(bad ? `${bad} mismatches` : `all ${R.length} replacements applied`);
