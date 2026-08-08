import path from 'node:path';

import {
  createCeresFiveMinuteBrowserManifest,
  CERES_FIVE_MINUTE_FIXED_SEED,
  CERES_FIVE_MINUTE_SIMULATION_SECONDS,
  CERES_FIVE_MINUTE_SIMULATION_TICKS,
  CERES_FIVE_MINUTE_SOURCE_IDENTITY,
} from './ceres-five-minute-browser.mjs';

export {
  CERES_FIVE_MINUTE_FIXED_SEED,
  CERES_FIVE_MINUTE_SIMULATION_SECONDS,
  CERES_FIVE_MINUTE_SIMULATION_TICKS,
  CERES_FIVE_MINUTE_SOURCE_IDENTITY,
};

export function createCeresFiveMinuteElectronManifest(overrides = {}) {
  return createCeresFiveMinuteBrowserManifest({
    id: 'ceres-five-minute-electron',
    runtimeKind: 'electron',
    commandArgs: [
      'scripts/check-ceres-five-minute.mjs',
      '--runtime=electron',
      '--acceptance',
    ],
    artifactRoot: path.join(
      '.devshots',
      'physics-as-spectacle',
      'ceres-five-minute',
      'electron',
    ),
    ...overrides,
  });
}

export const ceresFiveMinuteElectronManifest = createCeresFiveMinuteElectronManifest();
export default ceresFiveMinuteElectronManifest;
