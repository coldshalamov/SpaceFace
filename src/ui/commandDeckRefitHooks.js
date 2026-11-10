/** Live SpaceFace screen ids and station destinations → command-deck surfaces.
 * Semantic fallbacks in commandDeckRefit.js still cover screens mounted later. */
export const SCREEN_ID_TO_SURFACE = Object.freeze({
  mainMenu: 'title',
  newGame: 'new-game',
  pause: 'pause',
  gameOver: 'game-over',
  settings: 'settings',
  saveLoad: 'saves',
  help: 'help',
  codex: 'codex',
  drill: 'mining',
  station: 'station',
  ship: 'ship',
  range: 'range',
  galaxyMap: 'galaxy-map',
  starmap: 'galaxy-map',
  localmap: 'local-map',
  missionLog: 'missions',
  techTree: 'research',
  automation: 'automation',
  crucible: 'crucible',
  crucibleDraft: 'crucible',
  crucibleRefit: 'crucible',
  crucibleResults: 'crucible',
});

export const STATION_OPERATION_TO_SURFACE = Object.freeze({
  market: 'market',
  shipworks: 'shipworks',
  industry: 'industry',
  contracts: 'contracts',
  factions: 'factions',
  bar: 'contacts',
  ledger: 'ledger',
});

export function stationOperationToSurface(operation) {
  return STATION_OPERATION_TO_SURFACE[operation] || null;
}

export const sourceSurfaceHooks = Object.freeze([
  ...Object.entries(SCREEN_ID_TO_SURFACE).map(([id, kind]) => ({
    kind,
    selector: `[data-screen="${id}"]`,
  })),
  ...Object.entries(STATION_OPERATION_TO_SURFACE).map(([operation, kind]) => ({
    kind,
    selector: `[data-screen="station"][data-view="${kind}"]`,
  })),
  { kind: 'flight', selector: '#hud' },
  { kind: 'confirmation', selector: '#sf-confirm-root' },
  { kind: 'confirmation', selector: '.sf-confirm' },
]);
