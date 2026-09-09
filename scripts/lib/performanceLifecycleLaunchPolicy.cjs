'use strict';

const PLAYWRIGHT_BACKGROUND_EXECUTION_SWITCHES = Object.freeze([
  '--disable-background-timer-throttling',
  '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding',
]);

const POLICY_SCHEMA = 'spaceface.performanceLifecycleLaunchPolicy.v1';
const POLICY_GLOBAL = '__spacefacePerformanceLifecycleLaunchPolicy';

function applyElectronLifecycleLaunchPolicy() {
  const { app } = require('electron');
  const switchNames = PLAYWRIGHT_BACKGROUND_EXECUTION_SWITCHES.map((value) => value.slice(2));
  const presentBefore = switchNames.filter((name) => app.commandLine.hasSwitch(name));
  for (const name of switchNames) app.commandLine.removeSwitch(name);
  const presentAfter = switchNames.filter((name) => app.commandLine.hasSwitch(name));
  const record = Object.freeze({
    schema: POLICY_SCHEMA,
    driver: 'harness-electron-preload-remove-switch',
    forbiddenSwitches: [...PLAYWRIGHT_BACKGROUND_EXECUTION_SWITCHES],
    presentBefore: presentBefore.map((name) => `--${name}`),
    presentAfter: presentAfter.map((name) => `--${name}`),
    appliedBeforeAppReady: app.isReady() === false,
    productRuntimeOverride: false,
  });
  Object.defineProperty(globalThis, POLICY_GLOBAL, {
    configurable: false,
    enumerable: false,
    writable: false,
    value: record,
  });
  return record;
}

if (process.versions.electron) applyElectronLifecycleLaunchPolicy();

module.exports = {
  PLAYWRIGHT_BACKGROUND_EXECUTION_SWITCHES,
  POLICY_GLOBAL,
  POLICY_SCHEMA,
  applyElectronLifecycleLaunchPolicy,
};
