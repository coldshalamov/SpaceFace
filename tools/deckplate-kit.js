// Deckplate kit page — the hardware assembled into a representative console, with the game's own
// strings, so the system is judged as a screen and not as a swatch list. Served by any repo server
// (scripts/ui-page-shot.mjs shoots it). Nothing here is a game module.

import { injectDeckplate, dpIcon } from '../src/ui/deckplate/index.js';

injectDeckplate();

const stage = document.getElementById('stage');
const q = new URLSearchParams(location.search);

const rows = [
  ['energy-core', 'Fuel Cells', 'Solar Concord refinery · 48 u in hold', '112 cr', 62, 80, true],
  ['ore', 'Refined Metals', 'Ceres smelter · demand rising', '86 cr', 30, 92],
  ['asteroid', 'Water Ice', 'Belt haul · 3 buyers', '41 cr', 88, 40],
  ['cargo', 'Medical Supplies', 'Relief contract grade', '230 cr', 14, 70],
  ['module', 'Drive Coils', 'Shipworks spare · 2 in stock', '1,450 cr', 8, 35],
  ['munitions', 'Pulse Cells', 'Ordnance · restricted in HIGH SEC', '64 cr', 55, 20],
  ['freighter', 'Hull Plate', 'Salvage grade · Tethys yards', '310 cr', 40, 55],
  ['heat', 'Coolant', 'Station stock · rationed', '27 cr', 20, 88],
];

const rowHtml = rows.map(([icon, name, sub, read, supply, demand, sel], i) => `
  <button class="dp-row kit-row${sel ? ' is-selected' : ''}" style="--dp-i:${i}" ${sel ? 'aria-selected="true"' : ''}>
    ${dpIcon(icon, 24)}
    <span><span class="dp-row__name">${name}</span><span class="dp-row__sub">${sub}</span></span>
    <span class="kit-meters"><span class="dp-legend">Supply</span><span class="dp-meter"><i style="--v:${supply}%"></i></span><span class="dp-legend">Demand</span><span class="dp-meter dp-meter--lamp"><i style="--v:${demand}%"></i></span></span>
    <span class="dp-row__read">${read}</span>
  </button>`).join('');

const tabs = ['Market', 'Shipworks', 'Industry', 'Missions', 'Factions', 'Bar', 'Ledger'];
const tabHtml = tabs.map((t, i) => `<button class="dp-selector__tab" role="tab" ${i === 0 ? 'aria-selected="true"' : 'aria-selected="false"'}>${t}</button>`).join('');

const tiles = [
  ['tile.mode.swarm.png', 'Swarm', 'Endless'],
  ['tile.mode.gauntlet.png', 'Gauntlet', '10 waves'],
  ['tile.arena.cryo-drift.png', 'Cryo Drift', 'Arena'],
];
const tileHtml = tiles.map(([file, name, sub], i) => `
  <button class="dp-tile${i === 0 ? ' is-selected' : ''}" ${i === 0 ? 'aria-pressed="true"' : ''}>
    <span class="dp-tile__art" style="background-image:url('/assets/ui/kit/assets/tiles/${file}')"></span>
    <span class="dp-tile__cap"><span class="dp-tile__name">${name}</span><span class="dp-legend">${sub}</span></span>
  </button>`).join('');

stage.innerHTML = `
<style>
  .kit { position:absolute; inset:0; display:grid; box-sizing:border-box;
    grid-template-columns:minmax(0, 1.25fr) minmax(0, .95fr); grid-template-rows:auto minmax(0, 1fr) auto;
    gap:calc(18px * var(--k-s, 1)) calc(22px * var(--k-s, 1)); padding:calc(34px * var(--k-s, 1)) calc(44px * var(--k-s, 1)) calc(28px * var(--k-s, 1)); }
  .kit__top { grid-column:1 / -1; display:flex; align-items:flex-end; justify-content:space-between; gap:20px; }
  .kit__credits { display:flex; align-items:center; gap:14px; padding:10px 18px; }
  .kit__credits .dp-icon { color:var(--dp-ink-dim); }
  .kit__credits .dp-icon .accent { fill:var(--dp-lamp); }
  .kit__num { font-family:var(--dp-face-display); font-variation-settings:"wght" 760, "wdth" 110; font-size:26px; color:var(--dp-lamp-hot); text-shadow:0 0 14px var(--dp-lamp-bloom); font-variant-numeric:tabular-nums; }
  .kit__main { display:grid; grid-template-rows:auto auto minmax(0, 1fr); gap:12px; min-height:0; padding-top:12px; }
  .kit__main .dp-rows { overflow:hidden; min-height:0; }
  .kit-row { grid-template-columns:auto minmax(0, 1fr) minmax(0, 220px) 90px; }
  .kit-meters { display:grid; grid-template-columns:auto 1fr; align-items:center; gap:4px 8px; }
  .kit-meters .dp-legend { font-size:12px; letter-spacing:.14em; }
  @media (max-width:1400px) { .kit-meters { display:none; } .kit-row { grid-template-columns:auto minmax(0, 1fr) 90px; } }
  .kit__side { display:grid; grid-template-rows:auto auto minmax(150px, 1fr); gap:calc(16px * var(--k-s, 1)); min-height:0; }
  .kit__side > * { min-height:0; overflow:hidden; }
  .kit__detail h2 { margin:0; font-family:var(--dp-face-display); font-variation-settings:"wght" 800, "wdth" 112; font-size:28px; letter-spacing:.04em; text-transform:uppercase; }
  .kit__stats { display:grid; grid-template-columns:repeat(3, 1fr); gap:12px; margin:14px 0 16px; }
  .kit__stat .dp-legend { display:block; margin-bottom:4px; }
  .kit__stat b { font-family:var(--dp-face-read); font-weight:650; font-size:22px; font-variant-numeric:tabular-nums; color:var(--dp-ink); }
  .kit__stat b.lamp { color:var(--dp-lamp-hot); text-shadow:0 0 12px var(--dp-lamp-bloom-soft); }
  .kit__qty { display:grid; grid-template-columns:1fr auto; gap:14px; align-items:center; margin-bottom:16px; }
  .kit__keys { display:flex; gap:10px; flex-wrap:wrap; }
  .kit__prefs { display:grid; grid-template-columns:1fr auto; gap:10px 18px; align-items:center; }
  .kit__prefs label { font-family:var(--dp-face-read); font-size:var(--dp-fs-data); color:var(--dp-ink-dim); }
  .kit__tiles { grid-column:1 / 2; display:grid; grid-template-columns:repeat(3, 1fr); gap:14px; min-height:0; }
  .kit__tiles .dp-tile { min-height:0; }
  @media (max-height:800px) { .kit__tiles .dp-tile__art { min-height:74px; } }
  .kit__foot { grid-column:2 / 3; display:flex; align-items:flex-end; justify-content:flex-end; gap:22px; }
  .kit__bank { margin-top:14px; }
</style>
<div class="kit">
  <header class="kit__top">
    <div class="dp-placard dp-enter">
      <div><h1 class="dp-placard__title">Helios Station</h1><div class="dp-placard__sub">Berth 04 · Solar Concord · High Security</div></div>
    </div>
    <div class="dp-glass kit__credits dp-enter">${dpIcon('credits', 32)}<span class="dp-legend">Credits</span><span class="kit__num">5,000</span></div>
  </header>

  <section class="dp-mfd kit__main dp-enter">
    <nav class="dp-selector" role="tablist" aria-label="Station consoles">${tabHtml}</nav>
    <div class="dp-section-head"><span class="dp-legend">Market · Buy</span><span class="dp-legend">8 lines · prices live</span></div>
    <div class="dp-rows dp-stagger">${rowHtml}</div>
  </section>

  <aside class="kit__side">
    <section class="dp-glass kit__detail dp-enter">
      <div class="dp-section-head"><span class="dp-legend">Selected line</span></div>
      <h2>Fuel Cells</h2>
      <div class="kit__stats">
        <div class="kit__stat"><span class="dp-legend">Price</span><b class="lamp">112 cr</b></div>
        <div class="kit__stat"><span class="dp-legend">In hold</span><b>48 u</b></div>
        <div class="kit__stat"><span class="dp-legend">Space</span><b>12 / 40</b></div>
      </div>
      <div class="kit__qty">
        <input class="dp-range" type="range" min="0" max="12" value="6" aria-label="Quantity" style="--dp-range-pct:50%">
        <div class="dp-stepper"><button class="dp-key dp-key--small dp-key--icon" aria-label="Less">${dpIcon('minus', 20)}</button><span class="dp-stepper__read">6 u</span><button class="dp-key dp-key--small dp-key--icon" aria-label="More">${dpIcon('plus', 20)}</button></div>
      </div>
      <div class="kit__keys">
        <button class="dp-key dp-key--primary">${dpIcon('buy', 20)}Buy 6 · 672 cr<span class="dp-kbd">E</span></button>
        <button class="dp-key">${dpIcon('sell', 20)}Sell</button>
        <button class="dp-key dp-key--hazard">Jettison</button>
      </div>
    </section>
    <section class="dp-glass dp-enter">
      <div class="dp-section-head"><span class="dp-legend">Console</span></div>
      <div class="kit__prefs">
        <label>Auto-sell ore on dock</label><button class="dp-switch" role="switch" aria-checked="true"><span>Off</span><span>On</span></button>
        <label>Confirm large trades</label><button class="dp-switch" role="switch" aria-checked="false"><span>Off</span><span>On</span></button>
        <label>Price alert threshold</label><input class="dp-range" type="range" value="70" aria-label="Threshold" style="--dp-range-pct:70%;width:200px">
      </div>
    </section>
    <section class="dp-glass dp-enter">
      <div class="dp-section-head"><span class="dp-legend">Contract board</span></div><div class="dp-empty"><div class="dp-empty__head">Board empty</div><div class="dp-empty__read">Refresh in 04:12</div><div class="dp-empty__body">The Concord posts new haul work at the next cycle. Ceres Belt is posting now.</div></div>
    </section>
  </aside>

  <div class="kit__tiles">${tileHtml}</div>
  <footer class="kit__foot">
    <span class="dp-prompt"><span class="dp-kbd">Esc</span>Undock</span>
    <span class="dp-prompt"><span class="dp-kbd">Tab</span>Next console</span>
    <span class="dp-prompt"><span class="dp-kbd">E</span>Buy</span>
  </footer>
</div>
${q.get('dialog') ? `<div class="dp-scrim"><div class="dp-mfd dp-dialog dp-dialog--danger dp-enter" role="dialog" aria-modal="true" aria-labelledby="dlg-t"><h2 class="dp-dialog__title" id="dlg-t">Jettison 48 u Fuel Cells?</h2><p class="dp-dialog__body">The cargo is lost. Nearby haulers may salvage it. This cannot be undone.</p><div class="dp-dialog__keys"><button class="dp-key">Keep cargo</button><button class="dp-key dp-key--hazard">Jettison</button></div></div></div>` : ''}
`;
