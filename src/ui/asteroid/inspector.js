// Contextual inspector — the right panel of the asteroid screen. Everything here reads like a
// sentence (brief §1/§6), never a stat wall: "Iron contacts: 3 · Dense matrix: 2 · Estimated
// output: 4.6/min". One card at a time: tile, machine, network, or the site overview.
import { SITE_MACHINE_BY_ID, SITE_RECIPE_BY_ID, SITE_BALANCE } from '../../data/sites.js';
import { COMMODITIES } from '../../data/commodities.js';
import { MATERIALS, ORE_TINTS } from './asteroidRenderer2d.js';
import { drillTierReqForOre } from '../../systems/drill.js';

const COMMODITY_BY_ID = new Map(COMMODITIES.map((c) => [c.id, c]));

export function commodityName(id) {
  const c = COMMODITY_BY_ID.get(id);
  return (c && c.name) || String(id || '').replace(/^cmdty_/, '').replace(/_/g, ' ');
}

const STATUS_SENTENCES = {
  running: () => 'Running.',
  building: () => 'Assembling.',
  throttled: () => 'Running — throttled by the power network.',
  starved: (limit) => `Starved — waiting on ${limit && limit.startsWith('input:') ? commodityName(limit.slice(6)) : 'feedstock'}.`,
  limited: () => 'Running — lane throughput is the bottleneck.',
  backlogged: () => 'Backlogged — the lane buffer is full. Export or expand storage.',
  stalled: () => 'Stalled.',
  'fleet-full': () => 'Fleet at target — holding until a courier is spent.',
  'no-power': () => 'No power. Connect a cable to a generator or the Core.',
  'no-pods': () => 'Export buffer full but no couriers ready — check the fabricator.',
  'no-network': () => 'No material lane. Output has nowhere to go.',
  'no-geology': () => 'No usable contacts. Every neighboring cell is hollow.',
  staged: () => 'Cargo staged — waiting for a full pod load.',
  idle: () => 'Idle.',
};

export function statusSentence(status) {
  const fn = STATUS_SENTENCES[(status && status.state) || 'idle'] || STATUS_SENTENCES.idle;
  return fn(status && status.limit);
}

export function contactSentence(geo) {
  if (!geo) return 'Contacts unresolved.';
  const parts = [];
  for (const oreId of Object.keys(geo.ores || {}).sort()) {
    parts.push(`${commodityName(oreId)} contacts: ${geo.ores[oreId]}`);
  }
  if (geo.matrix) parts.push(`${MATERIALS.matrix.name}: ${geo.matrix}`);
  if (geo.basalt) parts.push(`${MATERIALS.basalt.name}: ${geo.basalt}`);
  if (geo.gas) parts.push(`Gas pockets: ${geo.gas}`);
  parts.push(`Open faces: ${geo.empty}`);
  return parts.join(' · ');
}

export function outputSentence(capability, powerRatio) {
  if (!capability) return null;
  const parts = [];
  const scale = Math.max(0, Math.min(1, powerRatio == null ? 1 : powerRatio));
  for (const goodId of Object.keys(capability.outputsPerMin).sort()) {
    const rate = capability.outputsPerMin[goodId] * (capability.powerDraw > 0 ? scale : 1);
    parts.push(`${commodityName(goodId)} ${rate.toFixed(1)}/min`);
  }
  if (capability.powerGen > 0) parts.push(`${capability.powerGen.toFixed(0)} MW generated`);
  if (!parts.length) return null;
  return `Estimated output: ${parts.join(' · ')}`;
}

export function fleetSentences(proj) {
  const fleet = proj.fleet;
  const perPodMin = fleet.podCapacity > 0 ? proj.exportRatePerMin / fleet.podCapacity : 0;
  const lines = [];
  lines.push(`Export production: ${proj.exportRatePerMin.toFixed(1)} units/min.`);
  if (perPodMin > 0) {
    const everyS = perPodMin > 0 ? Math.round(60 / perPodMin) : 0;
    lines.push(`At ${fleet.podCapacity}u per pod that fills a courier every ${formatDuration(everyS)}.`);
  } else {
    lines.push('Nothing is flagged for export yet.');
  }
  lines.push(`Couriers ready: ${fleet.podsReady} of ${fleet.podTarget} target · ${fleet.inFlightCount} in flight.`);
  if (fleet.podsReady >= fleet.podTarget && fleet.podTarget > 0) {
    lines.push(`Fleet at target — pod production paused.`);
  } else if (perPodMin * fleet.podBuildS / 60 > 1) {
    lines.push('Exports outpace pod assembly — couriers will run dry.');
  }
  return lines;
}

export function formatDuration(seconds) {
  const s = Math.max(0, Math.round(seconds));
  if (s < 90) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem ? `${m}m ${rem}s` : `${m}m`;
}

// ------------------------------------------------------------------ DOM cards

export function createInspector(container, actions, opts = {}) {
  const root = document.createElement('div');
  root.className = 'ast-inspector';
  container.appendChild(root);
  // Optional dock for the contact-ring schematic (the context bay's right column).
  const ringDock = opts.ringDock || null;

  function clear() {
    root.replaceChildren();
    if (ringDock) ringDock.replaceChildren();
  }

  // The core primitive as an instrument: a 3×3 diagram of what the subject reads.
  // `cells` is a contactProfile.cells array (absolute col/row for all 8 ring offsets).
  function showRing(cells) {
    if (!ringDock || !Array.isArray(cells) || !cells.length) return;
    let minC = Infinity; let maxC = -Infinity; let minR = Infinity; let maxR = -Infinity;
    for (const c of cells) {
      minC = Math.min(minC, c.col); maxC = Math.max(maxC, c.col);
      minR = Math.min(minR, c.row); maxR = Math.max(maxR, c.row);
    }
    const centerC = (minC + maxC) / 2;
    const centerR = (minR + maxR) / 2;
    const slot = document.createElement('div');
    slot.className = 'ao-ring-slot';
    const grid = document.createElement('div');
    grid.className = 'ao-ring';
    grid.setAttribute('role', 'img');
    grid.setAttribute('aria-label', 'Contact ring diagram');
    const byPos = new Map();
    for (const c of cells) {
      const dc = Math.round(c.col - centerC);
      const dr = Math.round(c.row - centerR);
      if (dc < -1 || dc > 1 || dr < -1 || dr > 1) continue;
      byPos.set((dr + 1) * 3 + (dc + 1), c);
    }
    for (let i = 0; i < 9; i++) {
      const cell = document.createElement('span');
      cell.className = 'ao-ring-cell';
      if (i === 4) {
        cell.classList.add('center');
      } else {
        const c = byPos.get(i);
        const kind = c ? c.kind : 'empty';
        if (kind === 'empty') cell.classList.add('hollow');
        else if (kind === 'ore') cell.style.background = (ORE_TINTS[c.ore] || {}).vein || '#8d8d8d';
        else if (kind === 'gas') cell.style.background = MATERIALS.gas.glow;
        else if (kind === 'matrix') cell.style.background = MATERIALS.matrix.base;
        else cell.style.background = MATERIALS.basalt.base;
      }
      grid.appendChild(cell);
    }
    const lbl = document.createElement('span');
    lbl.className = 'ao-ring-lbl';
    lbl.textContent = 'Contact ring';
    slot.append(grid, lbl);
    ringDock.appendChild(slot);
  }

  function head(kicker, title) {
    const k = document.createElement('div');
    k.className = 'ast-insp-kicker';
    k.textContent = kicker;
    const t = document.createElement('div');
    t.className = 'ast-insp-title';
    t.textContent = title;
    root.append(k, t);
  }

  function line(text, cls = '') {
    const el = document.createElement('div');
    el.className = `ast-insp-line ${cls}`.trim();
    el.textContent = text;
    root.appendChild(el);
    return el;
  }

  function button(label, onClick, cls = '') {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `sf-btn ast-insp-btn ${cls}`.trim();
    b.textContent = label;
    b.addEventListener('click', onClick);
    root.appendChild(b);
    return b;
  }

  function showTile({ tile, col, row, surveyed, telemetry, drillTier }) {
    clear();
    if (!tile) { head('Boundary', 'Asteroid edge'); line('Nothing beyond the survey line.'); return; }
    if (!surveyed && tile.type !== 'gas' && tile.type !== 'empty') {
      head(`Cell ${col},${row}`, 'Unsurveyed strata');
      line('Composition unresolved. Pulse the survey to identify it.');
      return;
    }
    if (tile.type === 'empty') {
      head(`Cell ${col},${row}`, tile.structure ? 'Machine housing' : 'Open bore');
      line(tile.structure
        ? 'A machine occupies this cell. Inspect it in build mode.'
        : 'Hollow and buildable. Every machine placed here reads its eight neighbors.');
      return;
    }
    if (tile.type === 'gas') {
      head(`Cell ${col},${row}`, 'Compressed gas pocket');
      line('Breaching it vents into the bore and damages the rig.', 'bad');
      line('A Gas Tap built beside it turns the hazard into power or feedstock — the pocket itself must stay sealed.', 'good');
      return;
    }
    if (tile.type === 'vein' && tile.ore) {
      const name = commodityName(tile.ore);
      head(`Cell ${col},${row}`, `${name} vein`);
      const price = (COMMODITY_BY_ID.get(tile.ore) || {}).basePrice || 0;
      line(`Drilling it out pays ${tile.yieldU || 0}u of ${name} once (${price} cr/u market).`);
      line('Preserved as a machine contact it pays that ore forever — and drilling it away later is permanent.', 'good');
      const req = tile.tierReq || drillTierReqForOre(tile.ore);
      if (drillTier < req) line(`Locked — needs drill MK${req}.`, 'bad');
      if (telemetry) line(`Hardness ${telemetry.hardness.toFixed(2)} · ${Math.round(telemetry.progress * 100)}% cut.`);
      return;
    }
    const isMatrix = tile.type === 'dirt';
    head(`Cell ${col},${row}`, isMatrix ? MATERIALS.matrix.name : MATERIALS.basalt.name);
    line(isMatrix
      ? 'Bulk silicate feedstock. Extractors work it for silicate; hollowing it is cheap floor.'
      : 'Dense mineral mass. Slow to cut; extractors read it as low-grade silicate.');
    if (telemetry) line(`Hardness ${telemetry.hardness.toFixed(2)} · ${Math.round(telemetry.progress * 100)}% cut.`);
  }

  function showMachine(m, proj) {
    clear();
    const def = SITE_MACHINE_BY_ID.get(m.defId);
    head(`${def ? def.verb.toUpperCase() : 'MACHINE'} · ${m.col},${m.row}`, def ? def.name : m.defId);
    line(statusSentence(m.status), m.status && (m.status.state === 'no-power' || m.status.state === 'no-network' || m.status.state === 'no-geology') ? 'bad' : (m.status && m.status.state === 'running' ? 'good' : ''));
    if (def && def.usesGeology) {
      line(contactSentence(m.geo));
      if (m.geo) showRing(m.geo.cells);
    }
    const out = outputSentence(m.capability, m.powerRatio);
    if (out) line(out, 'good');
    if (def && def.power < 0) line(`Power demand: ${-def.power} MW · network at ${Math.round((m.powerRatio || 0) * 100)}%.`);
    if (def && def.id === 'sm_massline_core') line(`Umbilical feed: ${def.power} MW into its cable network.`, 'good');
    if (m.job) {
      const recipe = SITE_RECIPE_BY_ID.get(m.job.recipeId);
      line(`Batch: ${recipe ? recipe.name : m.job.recipeId} — ${Math.round(((m.status && m.status.progress) || 0) * 100)}%.`);
    }

    if (def && Array.isArray(def.modes) && def.modes.length > 1) {
      const wrap = document.createElement('div');
      wrap.className = 'ast-insp-modes';
      wrap.setAttribute('role', 'group');
      wrap.setAttribute('aria-label', `${def.name} mode`);
      for (const mode of def.modes) {
        const recipe = SITE_RECIPE_BY_ID.get(mode);
        const label = recipe ? recipe.name : (mode.charAt(0).toUpperCase() + mode.slice(1));
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'sf-btn ast-mode-btn';
        b.textContent = label;
        b.setAttribute('aria-pressed', String(m.mode === mode));
        if (m.mode === mode) b.classList.add('active');
        b.addEventListener('click', () => actions.setMode(m.id, mode));
        wrap.appendChild(b);
      }
      root.appendChild(wrap);
      if (m.job) line('Retooling scraps the committed batch.', 'warn');
    }

    if (m.laneKey != null) {
      const lane = proj.lanes.find((l) => l.key === m.laneKey);
      if (lane) {
        line(`Lane network: ${Math.round(lane.stored)}u of ${lane.capacity}u buffered · ${lane.throughputPerMin}/min shared throughput.`);
        if (actions.canTransfer && actions.canTransfer()) {
          const row = document.createElement('div');
          row.className = 'ast-insp-transfer';
          const dep = document.createElement('button');
          dep.type = 'button';
          dep.className = 'sf-btn ast-insp-btn';
          dep.textContent = 'Load from hold';
          dep.addEventListener('click', () => actions.openTransfer(m.id, 'deposit'));
          const wd = document.createElement('button');
          wd.type = 'button';
          wd.className = 'sf-btn ast-insp-btn';
          wd.textContent = 'Take to hold';
          wd.addEventListener('click', () => actions.openTransfer(m.id, 'withdraw'));
          row.append(dep, wd);
          root.appendChild(row);
        }
      }
    } else if (def && def.id !== 'sm_massline_core') {
      line('Not on a material lane — bolt it to a lane or a neighboring machine.', 'warn');
    }

    if (def && def.id !== 'sm_massline_core') {
      button('Dismantle (control unit recovered)', () => actions.remove(m.id), 'danger');
    } else {
      line('The Core anchors everything here. It does not dismantle.', 'warn');
    }
  }

  function showNetwork(kind, net) {
    clear();
    if (kind === 'power') {
      head('Power network', `${net.gen.toFixed(0)} MW / ${net.draw.toFixed(0)} MW`);
      if (net.draw <= 0) line('Generation with no demand. Ready for machines.');
      else if (net.ratio >= 1) line('Fully powered.', 'good');
      else line(`Brown-out: machines on this network run at ${Math.round(net.ratio * 100)}%. Add generation or shed load.`, 'bad');
      line(`${net.machineIds.length} machines · ${net.overlayCells.length} cable cells.`);
    } else {
      head('Material lane', `${Math.round(net.stored)}u / ${net.capacity}u`);
      line(`Shared buffer with ${net.throughputPerMin} units/min of network throughput.`);
      const goods = Object.keys(net.store || {}).filter((g) => (net.store[g] || 0) >= 1).sort();
      if (goods.length) line(goods.map((g) => `${commodityName(g)} ${Math.floor(net.store[g])}`).join(' · '));
      else line('Empty. Machines bolted to this lane will fill it.');
      line('More lane cells mean more buffer — the track is the storage.', 'good');
    }
  }

  function showSite(proj, extra = {}) {
    clear();
    head('Site overview', proj.anchored ? 'Anchored claim' : 'Unanchored claim');
    if (!proj.anchored) {
      line('No Massline Core: leave this sector and the claim — machines included — is gone.', 'bad');
    } else {
      line('Massline Core online. This asteroid persists and accepts remote construction.', 'good');
    }
    const totalGen = proj.power.reduce((s, p) => s + p.gen, 0);
    const totalDraw = proj.power.reduce((s, p) => s + p.draw, 0);
    const worst = proj.power.reduce((w, p) => Math.min(w, p.ratio), 1);
    line(`Power: ${totalGen.toFixed(0)} MW generated · ${totalDraw.toFixed(0)} MW demanded${worst < 1 ? ` · weakest network at ${Math.round(worst * 100)}%` : ''}.`, worst < 1 ? 'warn' : '');
    for (const s of fleetSentences(proj)) line(s);
    if (extra.paused) line('Site runs on ship time — flows resume when you retract the rig.', 'warn');

    if (actions.setPodTarget) {
      const row = document.createElement('div');
      row.className = 'ast-insp-transfer';
      const label = document.createElement('span');
      label.className = 'ast-insp-line';
      label.textContent = `Courier fleet target: ${proj.fleet.podTarget}`;
      label.id = 'ast-pod-target-label';
      const minus = document.createElement('button');
      minus.type = 'button';
      minus.className = 'sf-btn ast-insp-btn';
      minus.textContent = '−';
      minus.setAttribute('aria-label', 'Lower courier fleet target');
      minus.addEventListener('click', () => actions.setPodTarget(proj.fleet.podTarget - 1));
      const plus = document.createElement('button');
      plus.type = 'button';
      plus.className = 'sf-btn ast-insp-btn';
      plus.textContent = '+';
      plus.setAttribute('aria-label', 'Raise courier fleet target');
      plus.addEventListener('click', () => actions.setPodTarget(proj.fleet.podTarget + 1));
      row.append(minus, label, plus);
      root.appendChild(row);
    }

    // Export policy — per-good HOLD/SHIP toggles for everything present or producible.
    const goods = new Set();
    for (const lane of proj.lanes) for (const g of Object.keys(lane.store || {})) goods.add(g);
    for (const m of proj.machines) {
      if (m.capability) for (const g of Object.keys(m.capability.outputsPerMin)) goods.add(g);
    }
    for (const g of Object.keys(proj.exportBuffer || {})) goods.add(g);
    if (goods.size) {
      const title = document.createElement('div');
      title.className = 'ast-insp-kicker';
      title.textContent = 'Export policy';
      root.appendChild(title);
      const wrap = document.createElement('div');
      wrap.className = 'ast-insp-exports';
      for (const g of [...goods].sort()) {
        const held = !!proj.exportOff[g];
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'sf-btn ast-export-btn' + (held ? '' : ' active');
        b.textContent = `${commodityName(g)}: ${held ? 'Hold' : 'Ship'}`;
        b.setAttribute('aria-pressed', String(!held));
        b.addEventListener('click', () => actions.setExport(g, held));
        wrap.appendChild(b);
      }
      root.appendChild(wrap);
    }
    if (storeTotalLike(proj.exportBuffer) > 0) {
      line(`Launch buffer: ${Math.floor(storeTotalLike(proj.exportBuffer))}u staged of ${SITE_BALANCE.podCapacity}u per pod.`);
    }
  }

  function showGhost(defId, check, costText) {
    clear();
    const def = SITE_MACHINE_BY_ID.get(defId);
    head('Placement preview', def ? def.name : defId);
    if (def) line(def.desc);
    if (costText) line(`Cost: ${costText}`);
    if (check) {
      if (check.ok) {
        line('Placement valid — the highlighted ring is what it will read.', 'good');
        if (def && def.usesGeology && check.profile) line(contactSentence(check.profile));
      } else {
        line(placementReason(check), 'bad');
      }
      if (check.profile) showRing(check.profile.cells);
    }
  }

  return { root, showTile, showMachine, showNetwork, showSite, showGhost };
}

function storeTotalLike(store) {
  let t = 0;
  for (const k of Object.keys(store || {})) t += Math.max(0, Number(store[k]) || 0);
  return t;
}

export function placementReason(check) {
  const reasons = {
    'not-hollow': 'The cell must be hollow. Bore it out first.',
    occupied: 'A machine already occupies this cell.',
    'rover-here': 'The rover is parked there — move it first.',
    'rover-not-adjacent': 'Manual install: drive the rover next to the cell (the Core unlocks remote construction).',
    'needs-gas-contact': 'A Gas Tap must sit beside at least one sealed gas pocket.',
    unique: 'Only one Massline Core per asteroid.',
    materials: 'Missing materials.',
    'no-session': 'No bore link. Tether and drill into the rock first.',
    'out-of-bounds': 'Outside the survey grid.',
    'core-locked': 'The Core does not dismantle.',
  };
  let text = reasons[check.reason] || 'Placement blocked.';
  if (check.reason === 'materials' && check.missing) {
    const parts = Object.keys(check.missing).sort().map((g) => `${check.missing[g]} ${commodityName(g)}`);
    text = `Missing: ${parts.join(', ')}. Site stores and ship hold are both checked.`;
  }
  return text;
}
