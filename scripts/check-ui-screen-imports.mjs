// Verifies browser-facing UI screen modules import cleanly and expose valid screen definitions.
// This catches broken relative imports before the dynamic browser registry silently skips a screen.
import { readFileSync } from 'node:fs';

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

const helpSrc = readFileSync(new URL('../src/ui/screens/help.js', import.meta.url), 'utf8');
const localmapSrc = readFileSync(new URL('../src/ui/screens/localmap.js', import.meta.url), 'utf8');
const codexSrc = readFileSync(new URL('../src/ui/screens/codex.js', import.meta.url), 'utf8');
const missionLogSrc = readFileSync(new URL('../src/ui/screens/missionLog.js', import.meta.url), 'utf8');
const newGameSrc = readFileSync(new URL('../src/ui/screens/newGame.js', import.meta.url), 'utf8');
const gameOverSrc = readFileSync(new URL('../src/ui/screens/gameOver.js', import.meta.url), 'utf8');
const factionsSrc = readFileSync(new URL('../src/ui/screens/factions.js', import.meta.url), 'utf8');
const automationSrc = readFileSync(new URL('../src/ui/screens/automationPanel.js', import.meta.url), 'utf8');
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
  || !helpSrc.includes('BINDINGS.starmap.label')) {
  console.log('FAIL helpScreen - fixed UI key labels must read src/ui/bindings.js');
  fail++;
} else if (/'E \(when prompted\)'|'E near a station|local map \(N\) \/ star-map \(M\)/.test(helpSrc)) {
  console.log('FAIL helpScreen - fixed UI key labels must not hard-code dock/localmap/starmap keys');
  fail++;
} else {
  console.log('ok   helpScreen - fixed UI key labels read the binding registry');
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
if (!gameOverSrc.includes('_refreshSummary(ctx)') || !/onShow\(ctx\)\s*\{[\s\S]*this\._refreshSummary\(ctx\)/.test(gameOverSrc)
  || !/refresh\(ctx\)\s*\{ this\._refreshSummary\(ctx\); \}/.test(gameOverSrc)) {
  console.log('FAIL gameOverScreen - cached screen must refresh run summary on show/refresh');
  fail++;
} else {
  console.log('ok   gameOverScreen - cached run summary refreshes on show');
  ok++;
}

console.log(`\n${ok} UI screen imports ok, ${fail} fail`);
process.exit(fail ? 1 : 0);
