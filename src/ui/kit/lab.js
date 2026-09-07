// One isolated page using the exported builders. All numbers are fixtures, not market quotes.
import { el, words, rows, table, hero, title, cut, settle, stamp,
  TEMPERATURES, setTemperature, bindSound, cue, KIT_SOUND_PALETTE } from './index.js';

const root = document.getElementById('kit');
const format = value => Number(value).toLocaleString('en-US');
// First three records: TASK_A_KIT_AND_TITLE §1.5. Other names: src/data/commodities.js.
const commodities = [
  ['ore', 'Ore, refined', 4750, 4310, 120], ['ice', 'Water ice', 310, 288, 1240],
  ['plate', 'Hull plate', 2100, 1905, 36], ['iron', 'Iron Ore', 28, 25, 900],
  ['copper', 'Copper Ore', 40, 36, 420], ['titanium', 'Titanium Ore', 65, 59, 210],
  ['silicate', 'Silicate Rock', 8, 7, 2400], ['volatiles', 'Ice Volatiles', 35, 31, 580],
  ['hydrogen', 'Hydrogen Gas', 20, 18, 740], ['helium', 'Helium-3', 80, 72, 190],
  ['alloys', 'Composite Alloys', 140, 127, 64], ['fuel', 'Fuel Cells', 95, 86, 300],
];
// This exact crest is copied from src/ui/station/icons.js FACTION_RAW.helix at the base.
const HELIX = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><g fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M7 3.6C7 7.5 17 8 17 12s-10 4.5-10 8.4M17 3.6C17 7.5 7 8 7 12s10 4.5 10 8.4"/><path d="M8.2 6h7.6M7 12h10M8.2 18h7.6" opacity="0.8"/></g></svg>';
const cues = [];
const status = el('output', 'k-t-fine k-62', 'Muted isolation fixture · no world mounted');
status.id = 'kit-status'; status.setAttribute('aria-live', 'polite');
// This observer exercises the production payload contract, without creating an audio context.
const unbindSound = bindSound({ emit(name, payload) {
  if (name !== 'audio:cue') throw new Error(`Unexpected kit bus event: ${name}`);
  cues.push({ ...payload }); if (cues.length > 32) cues.shift();
  status.value = `Muted cue · ${payload.id} · gain ${payload.gain}`;
} });
const disposals = [unbindSound];

function section(name, heading, subtitle, variant = '') {
  const screen = el('section', `k-screen ${variant}`.trim());
  screen.dataset.shot = name; screen.dataset.kReady = '0';
  screen.setAttribute('aria-label', heading); screen.append(title(heading, subtitle));
  const hang = el('div', 'k-hang k-lab-stack');
  const stage = el('div', 'k-stage k-lab-stack');
  const foot = el('footer', 'k-foot');
  if (!variant.includes('k-screen--stage')) screen.append(hang);
  screen.append(stage, foot); root.append(screen);
  return { screen, hang, stage, foot };
}
function action(label, onClick, { primary = false, danger = false, size = 'body', action: id } = {}) {
  const button = el('button', `k-word k-word--${size}${primary ? ' k-word--primary' : ''}${danger ? ' k-word--danger' : ''}`, label);
  button.type = 'button'; button.dataset.action = id || label.toLowerCase().replaceAll(' ', '-');
  button.addEventListener('click', () => {
    if (button.getAttribute('aria-pressed') === 'true') return;
    const outcome = onClick?.(button);
    if (outcome !== false) cue(outcome === 'deny' ? 'deny' : 'confirm');
  });
  return button;
}
function field(label, control) {
  const wrapper = el('label', 'k-lab-field'); wrapper.append(el('span', 'k-t-body k-62', label), control); return wrapper;
}
function toggle(label, choices, initial, onPick) {
  const group = el('div', 'k-words k-words--row'); group.setAttribute('role', 'group'); group.setAttribute('aria-label', label);
  choices.forEach(choice => {
    const button = action(choice, () => {
      for (const other of group.children) other.setAttribute('aria-pressed', String(other === button));
      onPick?.(choice);
    });
    button.setAttribute('aria-pressed', String(choice === initial)); group.append(button);
  });
  return group;
}

const overview = section('kit-words', 'Helios Prime', 'The kit · words, temperature and edge-hung instruments');
overview.hang.append(words([
  { action: 'continue', label: 'Continue', current: true, sub: 'Helios Prime · Hitch · 5,000 CR' },
  { action: 'newGame', label: 'New game' }, { action: 'load', label: 'Load', disabled: true, sub: 'No other saves' },
  { action: 'crucible', label: 'Crucible' }, { action: 'archive', label: 'Archive' },
  { action: 'settings', label: 'Settings' }, { action: 'quit', label: 'Quit', danger: true },
], { onPick: name => { status.value = `Fixture action · ${name}`; }, ariaLabel: 'Menu words' }));
overview.stage.append(hero('5,000', 'Credits'), el('p', 'k-sentence', 'The world belongs in the shot. This isolated kit is not a hull photograph.'));
const temperatureControls = toggle('Temperature', TEMPERATURES, 'menu', name => setTemperature(name));
temperatureControls.id = 'kit-temperature'; overview.stage.append(temperatureControls);
overview.stage.append(toggle('Reduced motion', ['Full motion', 'Plain cut'], 'Full motion', value => {
  document.documentElement.classList.toggle('sf-reduce-motion', value === 'Plain cut');
}));
overview.stage.append(toggle('Contrast', ['Default', 'High contrast'], 'Default', value => {
  document.documentElement.classList.toggle('sf-high-contrast', value === 'High contrast');
}));
const transitionStage = el('div', 'k-lab-stack');
const resting = el('p', 'k-sentence--emph k-t-emph', 'Hitch · docked');
const arriving = el('p', 'k-sentence--emph k-t-emph', 'Hitch · ready'); arriving.hidden = true;
transitionStage.append(resting, arriving);
let atDock = true; let cancelMotion = () => {};
overview.stage.append(action('Cut and settle', () => {
  cancelMotion();
  const next = atDock ? arriving : resting, previous = atDock ? resting : arriving;
  cut(previous, next, { state: 'kit:transition-demo' });
  cancelMotion = settle(next, { from: 'right', state: 'kit:transition-demo' }); atDock = !atDock;
}, { action: 'settle-demo' }), transitionStage);
disposals.push(() => cancelMotion());
overview.foot.append(words([
  { action: 'market', label: 'Market', current: true }, { action: 'contracts', label: 'Contracts' },
  { action: 'shipworks', label: 'Shipworks' },
], { row: true, size: 'body', ariaLabel: 'Foot navigation' }), status);

const register = section('kit-register', 'Market', 'Twelve hairline rows · one selected price', 'k-screen--split k-screen--dense');
const price = hero('4,750', 'Credits per unit', { size: 'hero', signal: true });
const itemTitle = el('h2', 'k-display k-t-title', 'Ore, refined');
const buy = action('Buy', () => { status.value = 'Fixture only · no credits spent'; }, { primary: true, size: 'emph' });
const sell = action('Sell', () => { status.value = 'Fixture only · no cargo sold'; }, { size: 'emph' });
register.stage.append(itemTitle, price, el('p', 'k-sentence', 'Local demand is above the arriving supply.'), buy, sell);
const quantity = el('input', 'k-input k-input--num'); quantity.type = 'number'; quantity.min = '1'; quantity.max = '120'; quantity.value = '1';
register.stage.append(field('Quantity', quantity));
const inventory = table({
  ariaLabel: 'Market fixture', head: [{ label: 'Commodity' }, { label: 'Buy', num: true }, { label: 'Sell', num: true }, { label: 'Stock', num: true }],
  body: commodities.map(([id, name, buyPrice, sellPrice, stock], index) => ({ id, cells: [name, format(buyPrice), format(sellPrice), format(stock)], selected: index === 0 })),
  onPick(id) {
    const item = commodities.find(record => record[0] === id); itemTitle.textContent = item[1];
    price.querySelector('.k-hero__n').textContent = format(item[2]); quantity.max = String(item[4]);
    quantity.value = String(Math.min(Number(quantity.value) || 1, item[4]));
  },
  onSort(column, direction, body) {
    const sign = direction === 'ascending' ? 1 : -1;
    const ordered = [...body.rows].sort((a, b) => {
      const left = commodities.find(record => record[0] === a.dataset.id)[column + 1];
      const right = commodities.find(record => record[0] === b.dataset.id)[column + 1];
      return sign * (typeof left === 'number' ? left - right : left.localeCompare(right));
    });
    body.append(...ordered);
  },
});
register.hang.append(inventory); register.foot.append(el('p', 'k-t-fine k-62', 'Fixture prices · not an economy change'));

const components = section('kit-components', 'Instruments', 'Rows, controls, crests, pins, bars and empty states', 'k-screen--split');
components.hang.append(rows(commodities.map(([id, name, value], index) => ({ id, name, num: format(value), selected: index === 0 })), { ariaLabel: 'Cargo rows' }));
components.hang.append(el('p', 'k-empty', 'No contracts posted here today.'));
const pilot = el('input', 'k-input'); pilot.type = 'text'; pilot.value = 'Hitch'; pilot.maxLength = 40;
const select = el('select', 'k-select');
for (const name of ['Display', 'Controls', 'Audio', 'Accessibility', 'Game']) select.append(el('option', '', name));
const range = el('input', 'k-range'); range.type = 'range'; range.min = '0'; range.max = '100'; range.value = '62';
const rangeValue = el('output', 'k-t-emph', '62'); range.id = 'kit-range'; rangeValue.htmlFor = range.id;
const bar = el('div', 'k-bar k-bar--signal'); bar.setAttribute('role', 'meter'); bar.setAttribute('aria-label', 'Heat');
bar.setAttribute('aria-valuemin', '0'); bar.setAttribute('aria-valuemax', '100'); bar.setAttribute('aria-valuenow', '62');
const fill = el('span', 'k-bar__fill'); fill.style.width = '62%'; bar.append(fill);
range.addEventListener('input', () => { rangeValue.value = range.value; fill.style.width = `${range.value}%`; bar.setAttribute('aria-valuenow', range.value); });
components.stage.append(field('Pilot name', pilot), field('Settings section', select), field('Level', range), rangeValue,
  toggle('Captions', ['Off', 'On'], 'On'), bar, el('hr', 'k-rule'));
const pinArea = el('div', 'k-lab-pin'); const pin = el('div', 'k-pin', 'Shield socket'); pin.append(el('span', 'k-pin__sub', 'Hitch · port'));
pinArea.append(pin, el('span', 'k-pin__lead')); components.stage.append(pinArea);
const crests = el('div', 'k-lab-inline'); crests.setAttribute('aria-label', 'Helix Directorate crest at row, standard and hero size');
for (const size of ['row', '', 'hero']) {
  const template = document.createElement('template'); template.innerHTML = HELIX;
  const svg = template.content.firstElementChild; svg.setAttribute('class', `k-crest${size ? ` k-crest--${size}` : ''}`); crests.append(svg);
}
components.foot.append(crests, action('Abandon', () => 'deny', { danger: true, size: 'emph' }));

const type = section('kit-type', 'The scale', 'Twelve through one hundred and sixty · tabular figures', 'k-screen--stage');
const sizes = [['fine', 12], ['data', 14], ['body', 16], ['emph', 20], ['sub', 28], ['menu', 40], ['num', 56], ['title', 80], ['hero', 112], ['name', 160]];
const scale = el('div', 'k-lab-types');
for (const [name, pixels] of sizes) {
  scale.append(el('span', 'k-t-fine k-62', `--k-fs-${name} · ${pixels}`), el('span', `${pixels >= 56 ? 'k-display' : 'k-text'} k-t-${name}`, pixels >= 80 ? 'Hitch' : '0123456789'));
}
type.stage.append(scale);
type.foot.append(hero('56', 'Number'), hero('80', 'Title', { size: 'title' }), hero('112', 'Hero', { size: 'hero' }));

const temperatures = section('kit-temperature', 'Temperature', 'Flight · docked · wanted · Crucible · Works; menu is the sky overlay', 'k-screen--stage');
const swatches = el('div', 'k-lab-temps');
for (const name of TEMPERATURES) {
  const swatch = el('div', 'k-lab-temp'); swatch.dataset.preview = name;
  swatch.append(el('div', 'k-t-sub', name), el('p', 'k-t-data k-62', {
    flight: 'No scrim · gold', menu: 'Sky · 25%', docked: 'Warm · 25% / 45%',
    wanted: 'Cold · 35% · red', crucible: 'No scrim · white', works: 'Own law · passthrough',
  }[name])); swatches.append(swatch);
}
temperatures.stage.append(swatches);
const cueWords = el('div', 'k-words k-words--row');
for (const name of ['open', 'close', 'move', 'confirm', 'deny']) {
  const button = el('button', 'k-word k-word--body', name); button.type = 'button'; button.dataset.action = `cue-${name}`;
  button.addEventListener('click', () => cue(name)); cueWords.append(button);
}
temperatures.stage.append(cueWords, el('p', 'k-sentence', 'Cues are observed, not played, in this muted isolation fixture. Dock, undock and wanted remain owned by game events.'));
const stampWords = el('div', 'k-lab-inline');
for (const word of ['Handling', 'Power', 'Condition', 'Capability']) stampWords.append(el('span', 'k-t-emph', word));
let cancelStamp = () => {};
temperatures.foot.append(action('Stamp words', () => { cancelStamp(); cancelStamp = stamp(stampWords.children, { state: 'kit:stamp-demo' }); }, { action: 'stamp-demo' }), stampWords);
disposals.push(() => cancelStamp());

const query = new URLSearchParams(location.search);
if (query.has('temp')) setTemperature(query.get('temp'));
if (query.get('motion') === 'reduce') document.documentElement.classList.add('sf-reduce-motion');
if (query.has('shot')) for (const screen of root.children) screen.hidden = screen.dataset.shot !== query.get('shot');
window.__kitLab = { cues, palette: KIT_SOUND_PALETTE, temperatures: TEMPERATURES, sizes, setTemperature, dispose() { disposals.splice(0).forEach(dispose => dispose()); } };
window.addEventListener('pagehide', () => window.__kitLab.dispose(), { once: true });
await document.fonts.ready;
for (const screen of root.children) screen.dataset.kReady = '1';
root.dataset.kReady = '1';
