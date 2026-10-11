import { DEFAULT_STARTER_ID, starterById } from './newGameDefaults.js';

export const RACING_DRIVES = Object.freeze([
  Object.freeze({ id: 'standard', name: 'Standard ion', moduleId: 'mod_engine_ion_m', description: 'The normal starter drive.' }),
  Object.freeze({ id: 'sprint', name: 'Sprint', moduleId: 'mod_engine_sprint_m', description: 'Quick acceleration; lower sustained speed.' }),
  Object.freeze({ id: 'endurance', name: 'Endurance', moduleId: 'mod_engine_endurance_m', description: 'Long straights; brake earlier for turns.' }),
]);

export function racingLoadoutFor(starterId, driveId) {
  const starter = starterById(starterId) || starterById(DEFAULT_STARTER_ID);
  const drive = RACING_DRIVES.find(row => row.id === driveId) || RACING_DRIVES[0];
  return { starter, drive, modules: starter.fittedModules.map(id => id.startsWith('mod_engine_') ? drive.moduleId : id) };
}

/** Only fresh temporary circuit flights can borrow a fit. Campaign fittings stay ship-owned. */
export function applyRacingLoadout(state, ships, opts) {
  if (opts?.racingSession !== true || !ships?.fittingsFromDefaults) return false;
  const fit = racingLoadoutFor(opts.starter, opts.racingDrive);
  const owned = state.player?.ownedShips?.[state.player.activeShipIndex || 0];
  if (!owned || owned.defId !== fit.starter.shipId) return false;
  owned.fittings = ships.fittingsFromDefaults(owned.defId, fit.modules);
  return true;
}
