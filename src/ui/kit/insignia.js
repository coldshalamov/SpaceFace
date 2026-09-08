/** SpaceFace instrument glyphs. Authored on a 24-unit optical grid; no font icons or network assets.
 * Decorative instances are hidden from assistive technology. The native control supplies its name.
 */
const PATHS = Object.freeze({
  launch: '<path d="M4 18 12 3l8 15-8-4-8 4Z"/><path d="M12 14v7M9 21h6"/>',
  resume: '<path d="m8 4 12 8-12 8V4Z"/><path d="M3 5v14"/>',
  save: '<path d="M4 3h13l3 3v15H4V3Z"/><path d="M8 3v6h8V3M8 21v-8h8v8"/>',
  load: '<path d="M3 8V4h7l2 3h9v13H3V8Z"/><path d="M7 13h10m-4-4 4 4-4 4"/>',
  settings: '<path d="M4 5h16M4 12h16M4 19h16"/><path d="M8 2v6m8 1v6m-8 1v6" stroke-width="3"/>',
  ship: '<path d="m12 2 3 6 5 4v6l-5-2-3 6-3-6-5 2v-6l5-4 3-6Z"/><path d="M12 7v9M7 12h10"/>',
  market: '<path d="m3 7 9-4 9 4v11l-9 4-9-4V7Z"/><path d="m3 7 9 4 9-4M12 11v11M7 5l10 5v5"/>',
  shipworks: '<path d="M14 3a6 6 0 0 0-7 7L2 17l5 5 7-7a6 6 0 0 0 7-7l-5 4-4-4 2-5Z"/>',
  contracts: '<path d="M5 3h10l4 4v14H5V3Z"/><path d="M14 3v5h5M8 12h8M8 16h4"/><path d="m13 18 2 2 4-4"/>',
  bar: '<path d="M5 3h14l-3 10h-8L5 3ZM12 13v8M7 21h10M6 7h12"/>',
  industry: '<path d="M3 21V9l6 4V7l6 4V3h5v18H3Z"/><path d="M7 17h2m4 0h3"/>',
  factions: '<path d="M5 22V3h14l-3 5 3 5H5"/><path d="m8 7 2 2 3-3"/>',
  ledger: '<path d="M5 3h14v18H5V3ZM8 7h8M8 11h3M8 15h3M14 11h2m-2 4h2M8 19h8"/>',
  map: '<path d="m3 5 6-3 6 3 6-3v17l-6 3-6-3-6 3V5Z"/><path d="M9 2v17M15 5v17m-9-9 6-5 6 4"/>',
  operations: '<path d="M9 3h6v6H9zM2 16h6v6H2zM16 16h6v6h-6zM12 9v4M5 16v-3h14v3"/>',
  help: '<path d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z"/><path d="M9 8a3 3 0 1 1 4 3c-1 1-1 1-1 3M12 17v1"/>',
  codex: '<path d="M12 5C9 2 5 2 2 3v16c4-1 7 0 10 2 3-2 6-3 10-2V3c-3-1-7-1-10 2Zm0 0v16M5 7l4 1M5 11l4 1m6-4 4-1m-4 5 4-1"/>',
  photo: '<path d="M3 7h5l2-3h5l2 3h4v13H3V7Z"/><circle cx="12" cy="13" r="4"/>',
  quit: '<path d="M10 3H4v18h6M13 7l5 5-5 5M8 12h13"/>',
  crucible: '<path d="m4 3 6 8-3 3-5-5m18-6-6 8 3 3 5-5M7 14l10 8m0-8L7 22M12 3v4"/>',
  archive: '<path d="M3 4h18v5H3zM5 9v12h14V9M9 13h6m-3 0v5"/>',
  research: '<path d="M9 2h6M10 2v7L3 20h18L14 9V2M7 14h10M9 17h1m4-1h1"/>',
  back: '<path d="m10 5-7 7 7 7M3 12h18"/>',
  confirm: '<path d="m4 12 5 5L20 5M4 21h16"/>',
  lock: '<path d="M5 10h14v11H5zM8 10V6a4 4 0 0 1 8 0v4M12 14v3"/>',
  warning: '<path d="M12 2 23 21H1L12 2Z"/><path d="M12 8v6m0 3v1"/>',
  target: '<path d="M3 9V3h6m6 0h6v6m0 6v6h-6m-6 0H3v-6"/><circle cx="12" cy="12" r="4"/><path d="M12 6v3m0 6v3M6 12h3m6 0h3"/>',
  shield: '<path d="m12 2 9 4v7c-1 5-5 8-9 10-4-2-8-5-9-10V6l9-4Z"/><path d="M7 8h10m-5 0v9"/>',
  energy: '<path d="M13 2 4 14h7l-1 8L21 9h-8V2Z"/>',
  fuel: '<path d="M4 3h10v18H4zM6 6h6v5H6zM14 13h3v5a2 2 0 0 0 4 0V9l-4-4M2 21h14"/>',
  command: '<path d="M3 4h18v16H3zM7 8l4 4-4 4m7 0h4"/>',
});
const ALIASES = Object.freeze({ continue: 'resume', newGame: 'launch', undock: 'launch', flight: 'launch',
  outfit: 'shipworks', shipyard: 'shipworks', missions: 'contracts', missionLog: 'contracts',
  automation: 'operations', techTree: 'research', sandbox: 'command', mainMenu: 'back', settings: 'settings' });
export function instrumentGlyph(name = 'command', className = '') {
  const key = ALIASES[name] || name;
  const path = PATHS[key] || PATHS.command;
  // Both attributes are controlled by code, not by save, content or player strings.
  const cls = String(className).replace(/[^a-zA-Z0-9 _-]/g, '');
  return `<svg class="cd-glyph ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="square" stroke-linejoin="bevel" aria-hidden="true" focusable="false">${path}</svg>`;
}
export function glyphForAction(action, label = '') {
  if (PATHS[action] || ALIASES[action]) return action;
  const match = String(label).toLowerCase();
  const families = [['resume', 'resume'], ['setting', 'settings'], ['save', 'save'], ['load', 'load'],
    ['mission', 'contracts'], ['ship', 'ship'], ['operation', 'operations'], ['map', 'map'],
    ['help', 'help'], ['codex', 'codex'], ['photo', 'photo'], ['quit', 'quit'], ['main menu', 'back'],
    ['research', 'research'], ['back', 'back'], ['cancel', 'back'], ['buy', 'market'], ['sell', 'market'],
    ['install', 'shipworks'], ['fit', 'shipworks'], ['accept', 'confirm'], ['launch', 'launch']];
  return families.find(([word]) => match.includes(word))?.[1] || 'command';
}
/** Keeps text native and the button's accessible name unchanged. */
export function instrumentControl(button, { action, label, icon } = {}) {
  const name = label ?? button.textContent;
  button.classList.add('cd-control');
  const face = document.createElement('span'); face.className = 'cd-control__face'; face.textContent = name;
  const glyph = document.createElement('span'); glyph.className = 'cd-control__glyph';
  glyph.innerHTML = instrumentGlyph(icon || glyphForAction(action, name));
  const latch = document.createElement('span'); latch.className = 'cd-control__latch'; latch.setAttribute('aria-hidden', 'true');
  button.replaceChildren(glyph, face, latch);
  return button;
}
