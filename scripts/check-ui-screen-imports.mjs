// Verifies browser-facing UI screen modules import cleanly and expose valid screen definitions.
// This catches broken relative imports before the dynamic browser registry silently skips a screen.
import { readFileSync } from 'node:fs';
import { BINDINGS } from '../src/ui/bindings.js';

const checks = [
  ['../src/ui/screens/stationHub.js', 'stationHub'],
  ['../src/ui/screens/starmap.js', 'starmapScreen'],
  ['../src/ui/screens/localmap.js', 'localmapScreen'],
  ['../src/ui/screens/techTree.js', 'techTreeScreen'],
  ['../src/ui/screens/automationPanel.js', 'automationScreen'],
  ['../src/ui/screens/drill.js', 'drillScreen'],
  ['../src/ui/screens/base.js', 'baseScreen'],
  ['../src/ui/screens/mainMenu.js', 'mainMenuScreen'],
  ['../src/ui/screens/newGame.js', 'newGameScreen'],
  ['../src/ui/screens/pause.js', 'pauseScreen'],
  ['../src/ui/screens/gameOver.js', 'gameOverScreen'],
  ['../src/ui/screens/settings.js', 'settingsScreen'],
  ['../src/ui/screens/saveLoad.js', 'saveLoadScreen'],
  ['../src/ui/screens/help.js', 'helpScreen'],
  ['../src/ui/screens/codex.js', 'codexScreen'],
  ['../src/ui/screens/missionLog.js', 'missionLogScreen'],
];

let ok = 0;
let fail = 0;
const loaded = new Map();

for (const [path, exportName] of checks) {
  try {
    const mod = await import(path);
    const def = mod[exportName];
    loaded.set(exportName, def);
    const missing = [];
    if (!def) missing.push(exportName);
    if (def && !def.id) missing.push(`${exportName}.id`);
    if (def && typeof def.mount !== 'function') missing.push(`${exportName}.mount`);
    if (missing.length) {
      console.log(`FAIL ${path} - missing ${missing.join(', ')}`);
      fail++;
      continue;
    }
    console.log(`ok   ${path} - ${exportName}:${def.id}`);
    ok++;
  } catch (err) {
    console.log(`ERR  ${path} - ${err.message}`);
    fail++;
  }
}

const starmap = loaded.get('starmapScreen');
if (starmap) {
  let popped = 0;
  const handled = typeof starmap.onKey === 'function' &&
    starmap.onKey({ key: 'M' }, { screenManager: { popScreen() { popped++; } } });
  if (!handled || popped !== 1) {
    console.log('FAIL starmapScreen - M shortcut must close the starmap');
    fail++;
  } else {
    console.log('ok   starmapScreen - M shortcut closes');
    ok++;
  }
}

const localmap = loaded.get('localmapScreen');
if (localmap) {
  let popped = 0;
  const handled = typeof localmap.onKey === 'function' &&
    localmap.onKey({ key: 'N' }, { screenManager: { popScreen() { popped++; } } });
  if (!handled || popped !== 1) {
    console.log('FAIL localmapScreen - N shortcut must close the local map');
    fail++;
  } else {
    console.log('ok   localmapScreen - N shortcut closes');
    ok++;
  }
}

const helpSrc = readFileSync(new URL('../src/ui/screens/help.js', import.meta.url), 'utf8');
const bindingsSrc = readFileSync(new URL('../src/ui/bindings.js', import.meta.url), 'utf8');
const inputSrc = readFileSync(new URL('../src/ui/input.js', import.meta.url), 'utf8');
const localmapSrc = readFileSync(new URL('../src/ui/screens/localmap.js', import.meta.url), 'utf8');
const codexSrc = readFileSync(new URL('../src/ui/screens/codex.js', import.meta.url), 'utf8');
const missionLogSrc = readFileSync(new URL('../src/ui/screens/missionLog.js', import.meta.url), 'utf8');
const stationHubSrc = readFileSync(new URL('../src/ui/screens/stationHub.js', import.meta.url), 'utf8');
const hudSrc = readFileSync(new URL('../src/ui/hud.js', import.meta.url), 'utf8');
const alertsSrc = readFileSync(new URL('../src/ui/alerts.js', import.meta.url), 'utf8');
const commsSrc = readFileSync(new URL('../src/ui/comms.js', import.meta.url), 'utf8');
const uiRootSrc = readFileSync(new URL('../src/ui/uiRoot.js', import.meta.url), 'utf8');
const controlPromptsSrc = readFileSync(new URL('../src/ui/controlPrompts.js', import.meta.url), 'utf8');
const mainMenuSrc = readFileSync(new URL('../src/ui/screens/mainMenu.js', import.meta.url), 'utf8');
const newGameSrc = readFileSync(new URL('../src/ui/screens/newGame.js', import.meta.url), 'utf8');
const gameOverSrc = readFileSync(new URL('../src/ui/screens/gameOver.js', import.meta.url), 'utf8');
const factionsSrc = readFileSync(new URL('../src/ui/screens/factions.js', import.meta.url), 'utf8');
const automationSrc = readFileSync(new URL('../src/ui/screens/automationPanel.js', import.meta.url), 'utf8');
const pauseSrc = readFileSync(new URL('../src/ui/screens/pause.js', import.meta.url), 'utf8');
const settingsSrc = readFileSync(new URL('../src/ui/screens/settings.js', import.meta.url), 'utf8');
const saveLoadSrc = readFileSync(new URL('../src/ui/screens/saveLoad.js', import.meta.url), 'utf8');

const menuStyleSources = [
  ['mainMenu', mainMenuSrc],
  ['newGame', newGameSrc],
  ['pause', pauseSrc],
  ['settings', settingsSrc],
  ['saveLoad', saveLoadSrc],
  ['help', helpSrc],
];
const menuStyleIds = menuStyleSources.map(([name, src]) => {
  const match = src.match(/const STYLE_ID = '([^']+)'/);
  return [name, match && match[1]];
});
const missingStyleIds = menuStyleIds.filter(([, id]) => !id).map(([name]) => name);
const duplicateStyleIds = menuStyleIds
  .filter(([, id], index, all) => id && all.findIndex(([, other]) => other === id) !== index)
  .map(([name, id]) => `${name}:${id}`);
if (missingStyleIds.length || duplicateStyleIds.length) {
  console.log('FAIL menu screens - injected STYLE_ID values must be present and unique (missing: ' +
    missingStyleIds.join(', ') + '; duplicate: ' + duplicateStyleIds.join(', ') + ')');
  fail++;
} else {
  console.log('ok   menu screens - injected STYLE_ID values are unique');
  ok++;
}
if (!/shell\(rootEl,\s*'Help'/.test(helpSrc)) {
  console.log('FAIL helpScreen - shell title must be Help, not Codex');
  fail++;
} else {
  console.log('ok   helpScreen - shell title is Help');
  ok++;
}
if (!helpSrc.includes("import { BINDINGS } from '../bindings.js'")
  || !helpSrc.includes('BINDINGS.dock.label')
  || !helpSrc.includes('BINDINGS.localmap.label')
  || !helpSrc.includes('BINDINGS.starmap.label')
  || !helpSrc.includes('BINDINGS.missionLog.label')
  || !helpSrc.includes('BINDINGS.cargo.label')
  || !helpSrc.includes('BINDINGS.comms.label')
  || !helpSrc.includes('BINDINGS.codex.label')) {
  console.log('FAIL helpScreen - fixed UI key labels must read src/ui/bindings.js');
  fail++;
} else if (/'E \(when prompted\)'|'E near a station|local map \(N\) \/ star-map \(M\)|Mission Log \(J\)|'J'|'I'|'L'|'K'/.test(helpSrc)) {
  console.log('FAIL helpScreen - fixed UI key labels must not hard-code dock/localmap/starmap/missionLog/cargo/comms/codex keys');
  fail++;
} else {
  console.log('ok   helpScreen - fixed UI key labels read the binding registry');
  ok++;
}
if (!bindingsSrc.includes("missionLog: { key: 'j', code: 'KeyJ', label: 'J' }")
  || BINDINGS.missionLog.key !== 'j'
  || BINDINGS.missionLog.label !== 'J'
  || !inputSrc.includes('BINDINGS.missionLog.key')
  || !inputSrc.includes('BINDINGS.missionLog.label')
  || !hudSrc.includes('BINDINGS.missionLog.label')
  || !helpSrc.includes('BINDINGS.missionLog.label')
  || !missionLogSrc.includes("import { BINDINGS } from '../bindings.js'")
  || !missionLogSrc.includes('BINDINGS.missionLog.label')
  || !stationHubSrc.includes("import { BINDINGS } from '../bindings.js'")
  || !stationHubSrc.includes('BINDINGS.missionLog.label')) {
  console.log('FAIL missionLog binding - mission log key must read src/ui/bindings.js across input and UI copy');
  fail++;
} else if (/case 'j'|key === 'j'|J Mission Log|Mission Log \(J\)|J to close|Mission log', null, 'J'/.test(inputSrc + hudSrc + helpSrc + missionLogSrc + stationHubSrc)) {
  console.log('FAIL missionLog binding - visible mission log key text must not hard-code J');
  fail++;
} else {
  console.log('ok   missionLog binding - input and visible copy read the binding registry');
  ok++;
}
if (!bindingsSrc.includes("cargo: { key: 'i', code: 'KeyI', label: 'I' }")
  || !bindingsSrc.includes("comms: { key: 'l', code: 'KeyL', label: 'L' }")
  || BINDINGS.cargo.key !== 'i'
  || BINDINGS.comms.key !== 'l'
  || !inputSrc.includes('BINDINGS.cargo.key')
  || !inputSrc.includes('BINDINGS.comms.key')
  || !helpSrc.includes('BINDINGS.cargo.label')
  || !helpSrc.includes('BINDINGS.comms.label')
  || !controlPromptsSrc.includes('BINDINGS.cargo.label')
  || !controlPromptsSrc.includes('BINDINGS.comms.label')
  || !commsSrc.includes("import { BINDINGS } from './bindings.js'")
  || !commsSrc.includes('BINDINGS.comms.label')) {
  console.log('FAIL cargo/comms binding - cargo and comms keys must read src/ui/bindings.js across input, Help, HUD prompt, and backlog button');
  fail++;
} else if (/case 'i'|case 'l'|I cargo|L comms|Comms log \(L\)|Cargo hold', null, 'I'|Comms log', null, 'L'/.test(inputSrc + helpSrc + controlPromptsSrc + commsSrc)) {
  console.log('FAIL cargo/comms binding - visible cargo/comms key text must not hard-code I/L');
  fail++;
} else {
  console.log('ok   cargo/comms binding - input and visible copy read the binding registry');
  ok++;
}
if (!pauseSrc.includes("mk('Mission Log', () => nav(ctx, 'pushScreen', 'missionLog'))")) {
  console.log('FAIL pauseScreen - controller-friendly pause menu must expose Mission Log');
  fail++;
} else if (!helpSrc.includes("['Open mission log', null, 'Pause")) {
  console.log('FAIL helpScreen - gamepad controls must document the Mission Log route');
  fail++;
} else {
  console.log('ok   pause/help - mission log is reachable and documented for controller players');
  ok++;
}
if (!localmapSrc.includes("import { BINDINGS } from '../bindings.js'")
  || !localmapSrc.includes('BINDINGS.localmap.label')
  || !localmapSrc.includes('BINDINGS.starmap.label')) {
  console.log('FAIL localmapScreen - visible map key labels must read src/ui/bindings.js');
  fail++;
} else if (/press N or Esc|Close \(N\)|N map = this system|M map = galaxy|N Local Map|M Star Map/.test(localmapSrc)) {
  console.log('FAIL localmapScreen - visible map key labels must not hard-code localmap/starmap keys');
  fail++;
} else {
  console.log('ok   localmapScreen - visible map key labels read the binding registry');
  ok++;
}
if (!/shell\(rootEl,\s*'Codex'/.test(codexSrc)) {
  console.log('FAIL codexScreen - shell title must be Codex');
  fail++;
} else {
  console.log('ok   codexScreen - shell title is Codex');
  ok++;
}
if (!missionLogSrc.includes("const activeMissions = active.filter((m) => m && m.status === 'active');")
  || !/if \(!activeMissions\.length\) \{[\s\S]*this\._listEl\.innerHTML = '<div class="sf-mlog-empty">[\s\S]*if \(this\._compVisible\) this\._renderCompleted\(\);[\s\S]*return;[\s\S]*\}[\s\S]*for \(const m of activeMissions\)/.test(missionLogSrc)) {
  console.log('FAIL missionLogScreen - completed ledger must refresh even when no active missions remain');
  fail++;
} else {
  console.log('ok   missionLogScreen - completed ledger refreshes on empty active state');
  ok++;
}
if (!hudSrc.includes("import { BINDINGS } from './bindings.js'")
  || !hudSrc.includes('BINDINGS.dock.label')
  || !hudSrc.includes('BINDINGS.localmap.label')
  || !hudSrc.includes('BINDINGS.starmap.label')
  || !hudSrc.includes('BINDINGS.missionLog.label')
  || !alertsSrc.includes("import { BINDINGS, promptLabel } from './bindings.js'")
  || !alertsSrc.includes('BINDINGS.starmap.label')
  || !uiRootSrc.includes("import { controlPrompt } from './controlPrompts.js'")
  || !uiRootSrc.includes("controlPrompt('flight', 'kbm')")
  || !uiRootSrc.includes("controlPrompt('flight', 'gamepad')")
  || !controlPromptsSrc.includes("import { BINDINGS } from './bindings.js'")
  || !controlPromptsSrc.includes('BINDINGS.dock.label')
  || !controlPromptsSrc.includes('BINDINGS.localmap.label')
  || !controlPromptsSrc.includes('BINDINGS.starmap.label')
  || !controlPromptsSrc.includes('BINDINGS.codex.label')) {
  console.log('FAIL flight HUD - dock/localmap/starmap/codex labels must read src/ui/bindings.js');
  fail++;
} else if (/'M Star Map'|'N Local Map'|'E', 'dock'|OPEN STARMAP \(M\)|N local map\s+•\s+M star map|K codex/.test(hudSrc + alertsSrc + uiRootSrc + controlPromptsSrc)) {
  console.log('FAIL flight HUD - dock/localmap/starmap/codex labels must not hard-code visible key text');
  fail++;
} else {
  console.log('ok   flight HUD - dock/localmap/starmap/missionLog/codex labels read the binding registry');
  ok++;
}
const figureDossierKeys = ['protagonist', 'kessler', 'hale', 'slate', 'quinn', 'voss', 'elroy', 'mira', 'rook', 'vale', 'kurtz'];
const missingFigureDossiers = figureDossierKeys.filter((key) => !new RegExp(`${key}:\\s*\\{`).test(codexSrc));
if (missingFigureDossiers.length) {
  console.log('FAIL codexScreen - missing figure dossiers: ' + missingFigureDossiers.join(', '));
  fail++;
} else {
  console.log('ok   codexScreen - figure dossiers cover canonical cast');
  ok++;
}
const runtimeTierLabels = ['Sworn Enemy', 'Hated', 'Hostile', 'Disliked', 'Neutral', 'Accepted', 'Trusted', 'Allied', 'Hero'];
const missingRuntimeTiers = runtimeTierLabels.filter((tier) => !factionsSrc.includes(`name: '${tier}'`));
const staleTierLabels = ['Nemesis', 'Unfriendly', 'Cordial', 'Friendly', 'Honored'].filter((tier) => factionsSrc.includes(tier));
if (missingRuntimeTiers.length || staleTierLabels.length) {
  console.log('FAIL factionsPanel - tier labels drifted (missing: ' + missingRuntimeTiers.join(', ') + '; stale: ' + staleTierLabels.join(', ') + ')');
  fail++;
} else if (!/AGGRO_THRESHOLD\s*=\s*-150/.test(factionsSrc) || !/relationSummary/.test(factionsSrc)) {
  console.log('FAIL factionsPanel - missing aggro threshold or relation summary');
  fail++;
} else {
  console.log('ok   factionsPanel - tiers match runtime labels and relations are shown');
  ok++;
}
if (automationSrc.includes('ore-u placeholder') || !automationSrc.includes('DRONE_DISPLAY_ORE_VALUE')
  || !automationSrc.includes('yield ~') || !automationSrc.includes('../../data/commodities.js')) {
  console.log('FAIL automationScreen - drone yield display must use commodity baseline, not placeholder economics');
  fail++;
} else {
  console.log('ok   automationScreen - drone yield display uses commodity baseline');
  ok++;
}
if (!newGameSrc.includes('let launching = false') || !newGameSrc.includes("launch.textContent = launching ? 'Launching...' : 'Launch'")
  || !newGameSrc.includes("ctx.bus.on('game:startFailed', restoreLaunch)") || !newGameSrc.includes('if (launching) return')) {
  console.log('FAIL newGameScreen - Launch must guard duplicate async starts and restore after failure');
  fail++;
} else {
  console.log('ok   newGameScreen - Launch is guarded during async startup');
  ok++;
}
if (!mainMenuSrc.includes("setScreenButtonReady(refs.bNew, ctx, 'newGame', 'New Game')")
  || !mainMenuSrc.includes("pushWhenReady(ctx, 'newGame', 'New Game')")
  || !mainMenuSrc.includes("setScreenButtonReady(refs.bLoad, ctx, 'saveLoad', 'Load Game')")
  || !mainMenuSrc.includes("setScreenButtonReady(refs.bSettings, ctx, 'settings', 'Settings')")
  || !uiRootSrc.includes("this._registeredScreens.has('newGame')")
  || !uiRootSrc.includes('this._showMainMenuWhenReady = showMainMenuWhenReady')
  || !uiRootSrc.includes("this.screenManager.top() === 'mainMenu'")
  || !uiRootSrc.includes('this.screenManager.refreshTop()')) {
  console.log('FAIL mainMenuScreen - dynamic screen buttons must wait for registered targets');
  fail++;
} else {
  console.log('ok   mainMenuScreen - dynamic screen buttons wait for registered targets');
  ok++;
}
if (!gameOverSrc.includes('_refreshSummary(ctx)') || !/onShow\(ctx\)\s*\{[\s\S]*this\._refreshSummary\(ctx\)/.test(gameOverSrc)
  || !/refresh\(ctx\)\s*\{ this\._refreshSummary\(ctx\); \}/.test(gameOverSrc)) {
  console.log('FAIL gameOverScreen - cached screen must refresh run summary on show/refresh');
  fail++;
} else {
  console.log('ok   gameOverScreen - cached run summary refreshes on show');
  ok++;
}
if (!gameOverSrc.includes("if (ctx.state) ctx.state.mode = 'menu';") || gameOverSrc.includes("\n      state.mode = 'menu';")) {
  console.log('FAIL gameOverScreen - Main Menu action must use ctx.state, not an undefined global state');
  fail++;
} else {
  console.log('ok   gameOverScreen - Main Menu action uses ctx.state');
  ok++;
}
{
  const { storyProgressLabel } = await import('../src/ui/screens/gameOver.js');
  const direct = storyProgressLabel({
    story: { beatIndex: 3 },
    missions: { completedLog: [{ type: 'cargo_delivery' }, { type: 'recon_scan' }] },
  });
  const legacy = storyProgressLabel({
    missions: { story: { beatIndex: 5 }, completedLog: [] },
  });
  if (direct !== 'Beat 3 / 7' || legacy !== 'Beat 5 / 7' ||
    gameOverSrc.includes("beats: String((missions.completedLog || []).length)")) {
    console.log('FAIL gameOverScreen - run summary must report story beat progress, not completed mission ledger size');
    fail++;
  } else {
    console.log('ok   gameOverScreen - run summary reports story progress');
    ok++;
  }
}

console.log(`\n${ok} UI screen imports ok, ${fail} fail`);
process.exit(fail ? 1 : 0);
