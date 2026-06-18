// Verifies browser-facing UI screen modules import cleanly and expose valid screen definitions.
// This catches broken relative imports before the dynamic browser registry silently skips a screen.
const checks = [
  ['../src/ui/screens/stationHub.js', 'stationHub'],
  ['../src/ui/screens/starmap.js', 'starmapScreen'],
  ['../src/ui/screens/techTree.js', 'techTreeScreen'],
  ['../src/ui/screens/automationPanel.js', 'automationScreen'],
  ['../src/ui/screens/mainMenu.js', 'mainMenuScreen'],
  ['../src/ui/screens/newGame.js', 'newGameScreen'],
  ['../src/ui/screens/pause.js', 'pauseScreen'],
  ['../src/ui/screens/settings.js', 'settingsScreen'],
  ['../src/ui/screens/saveLoad.js', 'saveLoadScreen'],
  ['../src/ui/screens/help.js', 'helpScreen'],
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

console.log(`\n${ok} UI screen imports ok, ${fail} fail`);
process.exit(fail ? 1 : 0);
