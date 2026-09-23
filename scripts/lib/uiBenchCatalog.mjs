// Agent-facing ids for the UI bench. The page (`tools/ui-bench.js`) mounts `screen`.
// A shot id can be the screen id or a surface id from scripts/ui-grammar-surfaces.mjs.
// Backdrops are committed stills — the bench never boots the game to get a background.

export const BACKDROPS = Object.freeze({
  title: '../assets/ui/backdrops/backdrop-title.jpg',
  shell: '../assets/ui/backdrops/backdrop-shell.jpg',
  world: '../assets/ui/backdrops/backdrop-crucible-door.jpg',
});

/** `ruleset` picks the Crucible run a draft/refit shot seeds (tools/ui-bench.js seedCrucibleShot).
 *  @type {readonly {id: string, screen: string, backdrop: keyof typeof BACKDROPS, tab?: string, overlay?: string, focus?: string, ruleset?: string}[]} */
export const UI_BENCH_SHOTS = Object.freeze([
  { id: 'title', screen: 'mainMenu', backdrop: 'title' },
  { id: 'mainMenu', screen: 'mainMenu', backdrop: 'title' },
  { id: 'motionAsk', screen: 'motionAsk', backdrop: 'title' },
  { id: 'new-game', screen: 'newGame', backdrop: 'title' },
  { id: 'newGame', screen: 'newGame', backdrop: 'title' },
  { id: 'pause', screen: 'pause', backdrop: 'title' },
  { id: 'settings', screen: 'settings', backdrop: 'title' },
  // `saves: 'filed'` loads with two lives on file (tools/ui-bench-saves.js); -empty is a fresh machine.
  { id: 'save-load', screen: 'saveLoad', backdrop: 'title', saves: 'filed' },
  { id: 'saveLoad', screen: 'saveLoad', backdrop: 'title', saves: 'filed' },
  { id: 'save-load-empty', screen: 'saveLoad', backdrop: 'title' },
  { id: 'help', screen: 'help', backdrop: 'title' },
  { id: 'codex', screen: 'codex', backdrop: 'title' },
  { id: 'mission-log', screen: 'missionLog', backdrop: 'title' },
  { id: 'missionLog', screen: 'missionLog', backdrop: 'title' },
  { id: 'credits', screen: 'credits', backdrop: 'title' },
  { id: 'achievements', screen: 'achievements', backdrop: 'title' },
  { id: 'game-over', screen: 'gameOver', backdrop: 'title' },
  { id: 'gameOver', screen: 'gameOver', backdrop: 'title' },
  { id: 'tech-tree', screen: 'techTree', backdrop: 'title' },
  { id: 'techTree', screen: 'techTree', backdrop: 'title' },
  // A career some hours in: six nodes researched and research points banked (tools/ui-bench.js).
  { id: 'tech-tree-progress', screen: 'techTree', backdrop: 'title', research: ['tech_combat_basics', 'tech_strike_craft', 'tech_fire_control', 'tech_deflector_theory', 'tech_industrial_mining', 'tech_drive_tuning'] },

  { id: 'flight', screen: 'flight', backdrop: 'world' },
  { id: 'power-rail', screen: 'flight', backdrop: 'world' },
  { id: 'crucibleHud', screen: 'crucibleHud', backdrop: 'world' },
  { id: 'comms-radial', screen: 'flight', overlay: 'comms', backdrop: 'world' },
  { id: 'wingman-radial', screen: 'flight', overlay: 'wingman', backdrop: 'world' },

  { id: 'ship', screen: 'ship', backdrop: 'world' },
  { id: 'footprint', screen: 'footprint', backdrop: 'world' },
  { id: 'range', screen: 'range', backdrop: 'world' },
  { id: 'chart', screen: 'galaxyMap', backdrop: 'world' },
  { id: 'galaxyMap', screen: 'galaxyMap', backdrop: 'world' },
  { id: 'chart-galaxy', screen: 'galaxyMap', focus: 'galaxy', backdrop: 'world' },

  { id: 'station', screen: 'station', backdrop: 'shell' },
  { id: 'station-dock', screen: 'station', backdrop: 'shell' },
  { id: 'station-market', screen: 'station', tab: 'market', backdrop: 'shell' },
  { id: 'station-shipworks', screen: 'station', tab: 'shipworks', backdrop: 'shell' },
  { id: 'station-industry', screen: 'station', tab: 'industry', backdrop: 'shell' },
  { id: 'station-contracts', screen: 'station', tab: 'contracts', backdrop: 'shell' },
  { id: 'station-factions', screen: 'station', tab: 'factions', backdrop: 'shell' },
  { id: 'station-bar', screen: 'station', tab: 'bar', backdrop: 'shell' },
  { id: 'station-ledger', screen: 'station', tab: 'ledger', backdrop: 'shell' },

  { id: 'crucible', screen: 'crucible', backdrop: 'world' },
  { id: 'crucible-door', screen: 'crucible', backdrop: 'world' },
  { id: 'crucible-draft', screen: 'crucibleDraft', backdrop: 'world' },
  { id: 'crucibleDraft', screen: 'crucibleDraft', backdrop: 'world' },
  { id: 'crucible-rearm', screen: 'crucibleDraft', backdrop: 'world', ruleset: 'scored' },
  { id: 'crucible-refit', screen: 'crucibleRefit', backdrop: 'world' },
  { id: 'crucibleRefit', screen: 'crucibleRefit', backdrop: 'world' },
  { id: 'crucible-refit-swarm', screen: 'crucibleRefit', backdrop: 'world', ruleset: 'swarm' },
  { id: 'crucible-results', screen: 'crucibleResults', backdrop: 'world' },
  { id: 'crucibleResults', screen: 'crucibleResults', backdrop: 'world' },

  { id: 'asteroid-works', screen: 'drill', backdrop: 'world' },
  { id: 'drill', screen: 'drill', backdrop: 'world' },
  { id: 'base', screen: 'base', backdrop: 'shell' },
  { id: 'automation', screen: 'automation', backdrop: 'shell' },

  { id: 'replay', screen: 'replay', backdrop: 'title' },
  { id: 'clips', screen: 'clips', backdrop: 'title' },
  { id: 'sandbox', screen: 'sandbox', backdrop: 'title' },
  { id: 'localmap', screen: 'localmap', backdrop: 'world' },
  { id: 'localmap-legacy', screen: 'localmap', backdrop: 'world' },
  { id: 'starmap', screen: 'starmap', backdrop: 'world' },
  { id: 'starmap-legacy', screen: 'starmap', backdrop: 'world' },
]);

const BY_ID = new Map(UI_BENCH_SHOTS.map((shot) => [shot.id, shot]));

export function resolveShot(id) {
  return BY_ID.get(id) || null;
}

export function listShotIds() {
  return UI_BENCH_SHOTS.map((shot) => shot.id);
}
