// src/ui/fieldBuild/fieldArchitectPanels.js — 5-Tab Studio RTS & Asteroid City Workspace Panels.
// Tabs:
//   1. 'site'      — Site & Interior (Live Cutaway, Anomalies, Remote Blueprints, Directives, Links, Reserves)
//   2. 'orbital'   — Orbital Megastructures (12 Tiers 1-4) & Autonomous Belt Drone Bay
//   3. 'matrix'    — Sector Supply Matrix & Auto-Balance Network Solver
//   4. 'doctrines' — Alpha Centauri 4x3 Belt Doctrine Tech Tree
//   5. 'charters'  — Weather Forecast, Syndicate Raid Defense Readiness & Industrial Charters
import { SITE_BALANCE, SITE_MACHINE_BY_ID, SITE_RECIPE_BY_ID } from '../../data/sites.js';
import {
  ASTEROID_BLUEPRINTS,
  ASTEROID_BLUEPRINT_BY_ID,
  BELT_CHARTER_TEMPLATES,
  BELT_DOCTRINES,
  BELT_DRONE_TYPE_LIST,
  BELT_ORBITAL_STRUCTURE_LIST,
  SITE_DIRECTIVES,
} from '../../data/beltEmpireData.js';
import { rotateCellOffset } from '../../systems/asteroidInteriorPuzzle.js';
import { commodityDisplayName } from '../commodityNames.js';
import { rockName } from '../asteroid/rockNames.js';
import { rockReportLines, rockReportSentence } from '../asteroid/rockReport.js';

export const ARCHITECT_TABS = Object.freeze([
  Object.freeze({ id: 'site', label: 'Rock' }),
  Object.freeze({ id: 'orbital', label: 'Orbit' }),
  Object.freeze({ id: 'matrix', label: 'Supply' }),
  Object.freeze({ id: 'doctrines', label: 'Upgrades' }),
  Object.freeze({ id: 'charters', label: 'Charter' }),
]);

const DOCTRINE_BRANCH_LABELS = Object.freeze({
  deep_core: 'Deep Core Extraction',
  thermodynamics: 'Cryo-Thermodynamics',
  swarm: 'Swarm Logistics',
  sovereignty: 'Bastion Sovereignty',
});

function el(tag, className = '', text = null) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function machineModeDisplayName(mode) {
  if (!mode) return '';
  const rec = SITE_RECIPE_BY_ID.get(mode);
  if (rec) return rec.name;
  return String(mode).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatCostLine(cost) {
  return Object.entries(cost || {})
    .map(([gid, q]) => `${q} ${commodityDisplayName(gid)}`)
    .join(' · ');
}

function buildMiniCutawayElement(site, vm, sys, callbacks) {
  const cut = site?.cutawaySchematic;
  if (!cut) return null;
  const wrap = el('div', 'fb-cutaway-box');
  const cols = cut.cols || 28;
  const rows = cut.rows || 45;
  const cellMap = new Map();
  for (const h of Array.isArray(cut.highlights) ? cut.highlights : []) {
    cellMap.set(`${h.c},${h.r}`, h);
  }
  const anomMap = new Map((Array.isArray(cut.anomalies) ? cut.anomalies : []).map((a) => [`${a.col},${a.row}`, a]));

  const activeBp = ASTEROID_BLUEPRINT_BY_ID.get(vm?.blueprintId) || ASTEROID_BLUEPRINTS[0];
  const rot = vm?.blueprintRotation || 0;
  const rotatedCells = (activeBp?.cells || []).map((cell) => {
    const off = rotateCellOffset(cell.dc, cell.dr, rot);
    return { ...cell, dc: off.dc, dr: off.dr };
  });

  const svgNs = 'http://www.w3.org/2000/svg';
  const cell = cols > 18 || rows > 24 ? 6 : 10;
  const svg = document.createElementNS(svgNs, 'svg');
  svg.setAttribute('viewBox', `0 0 ${cols * cell} ${rows * cell}`);
  svg.setAttribute('class', 'fb-cutaway-svg');
  svg.setAttribute('aria-label', 'Interactive Asteroid Interior Subterranean Schematic');

  const captionDefault = `${cut.emptyCells || 0} cells dug · ${cut.veinCells || 0} vein cells · click a cell to place the layout`;
  const caption = el('div', 'fb-cutaway-caption', captionDefault);
  const rectByCoord = new Map();

  function clearGhostPreview() {
    for (const r of rectByCoord.values()) r.classList.remove('fb-cut-ghost');
    caption.textContent = captionDefault;
  }

  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      const key = `${c},${r}`;
      const cellInfo = cellMap.get(key) || null;
      const anom = anomMap.get(key) || null;

      const rect = document.createElementNS(svgNs, 'rect');
      rect.setAttribute('x', String(c * cell + 0.4));
      rect.setAttribute('y', String(r * cell + 0.4));
      rect.setAttribute('width', String(cell - 0.8));
      rect.setAttribute('height', String(cell - 0.8));
      rect.setAttribute('rx', '1');
      rect.classList.add('fb-cut-cell');

      let fill = '#2b3138';
      if (cellInfo?.kind === 'empty') fill = '#101418';
      else if (cellInfo?.kind === 'vein') fill = '#806534';
      else if (cellInfo?.kind === 'gas') fill = '#265c4e';
      else if (cellInfo?.kind === 'rock') fill = '#383e46';
      rect.setAttribute('fill', fill);

      rect.addEventListener('mouseenter', () => {
        for (const elRect of rectByCoord.values()) elRect.classList.remove('fb-cut-ghost');
        for (const offset of rotatedCells) {
          const targetRect = rectByCoord.get(`${c + offset.dc},${r + offset.dr}`);
          if (targetRect) targetRect.classList.add('fb-cut-ghost');
        }
        const subj = cellInfo?.machineId
          ? (SITE_MACHINE_BY_ID.get(cellInfo.machineId)?.name || cellInfo.machineId)
          : (anom ? `${anom.name} (${anom.status})`
            : (cellInfo?.ore ? commodityDisplayName(cellInfo.ore)
              : (cellInfo?.kind === 'gas' ? 'Gas pocket'
                : (cellInfo?.kind === 'empty' ? 'Excavated' : 'Rock wall'))));
        caption.textContent = `(${c},${r}) · ${subj} · Click to stamp ${activeBp?.name || 'blueprint'}`;
      });
      rect.addEventListener('click', () => {
        if (!sys?.applySiteBlueprint || !activeBp) return;
        callbacks.runSiteOp(
          sys.applySiteBlueprint(site.siteId, activeBp.id, c, r, rot),
          `${activeBp.name} stamped at (${c}, ${r}).`,
        );
      });

      rectByCoord.set(key, rect);
      svg.appendChild(rect);

      if (anom) {
        const dot = document.createElementNS(svgNs, 'circle');
        dot.setAttribute('cx', String((c + 0.5) * cell));
        dot.setAttribute('cy', String((r + 0.5) * cell));
        dot.setAttribute('r', String(Math.max(1.6, cell * 0.34)));
        dot.setAttribute('fill', anom.status === 'breached' ? '#6d757d' : (anom.status === 'tapped' ? '#4ce0a7' : '#f2b949'));
        dot.style.pointerEvents = 'none';
        svg.appendChild(dot);
      }

      if (cellInfo?.machineId) {
        const mRect = document.createElementNS(svgNs, 'rect');
        mRect.setAttribute('x', String(c * cell + cell * 0.18));
        mRect.setAttribute('y', String(r * cell + cell * 0.18));
        mRect.setAttribute('width', String(cell * 0.64));
        mRect.setAttribute('height', String(cell * 0.64));
        mRect.setAttribute('fill', cellInfo.machineId === 'sm_massline_core' ? '#f2b949' : (cellInfo.machineId === 'sm_cryo_condenser' ? '#7cd4fc' : '#5ac8fa'));
        mRect.style.pointerEvents = 'none';
        svg.appendChild(mRect);
      }
    }
  }
  svg.addEventListener('mouseleave', clearGhostPreview);
  wrap.append(svg, caption);
  return wrap;
}

function renderSiteTab({ panel, vm, sys, callbacks }) {
  const { runSiteOp, activateTool, enterSelectedWorks, setTab, setBlueprint, rotateBlueprint, focusAsteroid } = callbacks;

  // Multi-select batch command deck
  if (Array.isArray(vm.selectedAsteroidIds) && vm.selectedAsteroidIds.length > 1) {
    const batchSec = el('div', 'fb-section fb-batch-card');
    batchSec.appendChild(el('h4', 'fb-sec-title', `${vm.selectedAsteroidIds.length} rocks picked`));
    const btnRow = el('div', 'fb-inline-controls');
    const rigAll = el('button', 'fb-mini-btn primary', 'Claim all');
    rigAll.type = 'button';
    rigAll.addEventListener('click', () => {
      for (const aid of vm.selectedAsteroidIds) {
        if (!sys?.siteForAsteroid?.(aid)) runSiteOp(sys.commissionFieldAsteroid(aid, 'extractor'), null);
      }
      callbacks.toast(`Claiming ${vm.selectedAsteroidIds.length} rocks.`, 'good');
    });
    const turAll = el('button', 'fb-mini-btn', 'Turret on each');
    turAll.type = 'button';
    turAll.addEventListener('click', () => {
      for (const aid of vm.selectedAsteroidIds) {
        const s = sys?.siteForAsteroid?.(aid);
        if (s) runSiteOp(sys.deploySiteDefense(s.id, 'turret'), null);
      }
    });
    const clearBatch = el('button', 'fb-mini-btn', 'Clear');
    clearBatch.type = 'button';
    clearBatch.addEventListener('click', () => callbacks.clearBatch());
    btnRow.append(rigAll, turAll, clearBatch);
    batchSec.appendChild(btnRow);
    panel.appendChild(batchSec);
  }

  if (!vm.selectedAsteroid && !vm.selectedSite) {
    const head = el('div', 'fb-card-head');
    head.append(el('h3', 'fb-card-title', 'This belt'), el('span', 'fb-badge', `${vm.network.totals.siteCount} claims`));
    panel.appendChild(head);
    panel.appendChild(el('p', 'fb-tool-sub', 'Click a rock to see what is in it. Press 1 to claim it, or 8 to set the rover down and work it by hand. Drag across empty space to pick several rocks.'));

    const sec = el('div', 'fb-section');
    sec.appendChild(el('h4', 'fb-sec-title', 'Your claims here'));
    const list = el('div', 'fb-list');
    if (!vm.network.sites.length) {
      list.appendChild(el('div', 'fb-tool-sub', 'You have no claim in this sector yet. Pick a rock and press 1.'));
    } else {
      for (const s of vm.network.sites) {
        const row = el('div', 'fb-item-row');
        // Each claim by its name and what it amounts to: its trade, how well it was dug, what it makes.
        const what = el('span', 'fb-claim-line');
        what.append(el('strong', '', rockName(s.asteroidId)), el('span', 'fb-tool-sub', rockReportSentence(s.report)));
        row.append(
          what,
          (() => {
            const b = el('button', 'fb-mini-btn', 'Focus');
            b.type = 'button';
            b.addEventListener('click', () => focusAsteroid(s.asteroidId, s.pos));
            return b;
          })(),
        );
        list.appendChild(row);
      }
    }
    sec.appendChild(list);
    panel.appendChild(sec);
    return;
  }

  const head = el('div', 'fb-card-head');
  // A claimed rock keeps its name; its trade is the badge beside it.
  const title = (vm.selectedAsteroid && vm.selectedAsteroid.name)
    || (vm.selectedSite ? rockName(vm.selectedSite.asteroidId) : 'Asteroid');
  const badge = el('span', `fb-badge ${vm.selectedSite ? 'mint' : 'amber'}`,
    vm.selectedSite ? vm.selectedSite.specialization.label : 'Unclaimed');
  head.append(el('h3', 'fb-card-title', title), badge);
  panel.appendChild(head);

  if (vm.selectedAsteroid) {
    const geoSec = el('div', 'fb-section');
    geoSec.appendChild(el('h4', 'fb-sec-title', `${vm.selectedAsteroid.kind || 'Asteroid'} · what the laser brings up`));
    const statsRow = el('div', 'fb-kv-row');
    statsRow.append(
      el('span', '', 'Ore left for the laser'),
      el('span', 'fb-kv-val', `${vm.selectedAsteroid.yieldU} units`),
    );
    geoSec.appendChild(statsRow);
    for (const c of vm.selectedAsteroid.composition) {
      const bar = el('div', 'fb-comp-bar');
      const tr = el('div', 'fb-comp-track');
      const fill = el('div', 'fb-comp-fill');
      fill.style.width = `${Math.max(6, Math.min(100, c.pct))}%`;
      tr.appendChild(fill);
      bar.append(el('span', '', c.name), tr, el('span', 'fb-kv-val', `${c.pct}%`));
      geoSec.appendChild(bar);
    }
    // The rover's half of the picture: what is inside and how deep, from the same scan the
    // target card shows in flight.
    if (vm.selectedAsteroid.assay) geoSec.appendChild(el('p', 'fb-tool-sub', vm.selectedAsteroid.assay));
    panel.appendChild(geoSec);
  }

  if (!vm.selectedSite) {
    const actSec = el('div', 'fb-section');
    const rigBtn = el('button', 'fb-action-btn primary', 'Claim and start mining (1)');
    rigBtn.type = 'button';
    rigBtn.addEventListener('click', () => activateTool('commission'));
    const refBtn = el('button', 'fb-action-btn', 'Claim with a smelter');
    refBtn.type = 'button';
    refBtn.addEventListener('click', () => runSiteOp(sys.commissionFieldAsteroid(vm.selectedAsteroid.id, 'refinery'), 'Claimed, with a smelter running.'));
    const bpBtn = el('button', 'fb-action-btn', 'Dig a starter pocket');
    bpBtn.type = 'button';
    bpBtn.addEventListener('click', () => runSiteOp(sys.applySiteBlueprint(vm.selectedAsteroid.id, 'bp_starter_pocket', null, null, 0), 'Starter pocket dug.'));
    const drillBtn = el('button', 'fb-action-btn', 'Go inside with the rover (8)');
    drillBtn.type = 'button';
    drillBtn.addEventListener('click', () => enterSelectedWorks());
    actSec.append(rigBtn, refBtn, bpBtn, drillBtn);
    panel.appendChild(actSec);
    return;
  }

  const site = vm.selectedSite;
  // What this rock amounts to: the same report the rover board gives on the way out.
  if (site.report) {
    const repSec = el('div', 'fb-section fb-rock-report');
    repSec.appendChild(el('h4', 'fb-sec-title', 'What this rock is now'));
    const raidPressure = Number(vm.empire?.raidStatus?.pressure) || 0;
    for (const line of rockReportLines(site.report, { nameOf: rockName, raidPressure })) {
      const row = el('div', `fb-kv-row fb-report-row${line.tone ? ` is-${line.tone}` : ''}`);
      row.append(el('span', '', line.label), el('span', 'fb-kv-val', line.value));
      repSec.appendChild(row);
    }
    panel.appendChild(repSec);
  }
  const capPct = site.synergies?.summary?.capacitorCapacityMwS > 0
    ? Math.round((site.capacitorMwS / site.synergies.summary.capacitorCapacityMwS) * 100)
    : 0;
  const pwrRow = el('div', 'fb-kv-row');
  pwrRow.append(el('span', '', 'Power made / used'), el('span', 'fb-kv-val', `${site.totalPowerGenMw.toFixed(0)} / ${site.totalPowerDrawMw.toFixed(0)} MW`));
  const capRow = el('div', 'fb-kv-row');
  capRow.append(el('span', '', 'Stored charge'), el('span', 'fb-kv-val', `${capPct}%`));
  const storRow = el('div', 'fb-kv-row');
  storRow.append(el('span', '', 'In store'), el('span', 'fb-kv-val', `${site.storedU} of ${site.capacityU} units`));
  const defRow = el('div', 'fb-kv-row');
  defRow.append(el('span', '', 'Guards and drones'), el('span', 'fb-kv-val', `${site.defenses.length} built · ${site.drones?.length || 0} of ${site.maxDrones || 6} drones`));
  panel.append(pwrRow, capRow, storRow, defRow);

  // Live Interior Cutaway + Remote Blueprint Stamper
  const intSec = el('div', 'fb-section');
  intSec.appendChild(el('h4', 'fb-sec-title', 'Inside the rock'));
  const cutEl = buildMiniCutawayElement(site, vm, sys, callbacks);
  if (cutEl) intSec.appendChild(cutEl);

  const bpRow = el('div', 'fb-inline-controls');
  const bpSel = el('select', 'fb-select');
  for (const bp of ASTEROID_BLUEPRINTS) {
    const opt = document.createElement('option');
    opt.value = bp.id;
    opt.textContent = bp.name;
    bpSel.appendChild(opt);
  }
  bpSel.value = vm.blueprintId || ASTEROID_BLUEPRINTS[0].id;
  bpSel.addEventListener('change', () => setBlueprint(bpSel.value));

  const rotBtn = el('button', 'fb-mini-btn', `Turn (R): ${(vm.blueprintRotation || 0) * 90}°`);
  rotBtn.type = 'button';
  rotBtn.title = 'Rotate blueprint 90 degrees';
  rotBtn.addEventListener('click', () => rotateBlueprint());

  const bestSeat = (site.blueprintSuggestions || [])[0] || null;
  const bestBtn = el('button', 'fb-mini-btn', 'Best spot');
  bestBtn.type = 'button';
  bestBtn.title = bestSeat
    ? `Stamp best fit (${bestSeat.col},${bestSeat.row} at ${(bestSeat.rotation || 0) * 90}°)`
    : 'Auto-find highest synergy seat';
  bestBtn.addEventListener('click', () => {
    const col = bestSeat ? bestSeat.col : null;
    const row = bestSeat ? bestSeat.row : null;
    const rotUse = bestSeat ? bestSeat.rotation : (vm.blueprintRotation || 0);
    runSiteOp(sys.applySiteBlueprint(site.siteId, bpSel.value, col, row, rotUse), 'Layout placed in its best spot.');
  });

  const stampBtn = el('button', 'fb-mini-btn primary', 'Place');
  stampBtn.type = 'button';
  stampBtn.addEventListener('click', () => {
    runSiteOp(sys.applySiteBlueprint(site.siteId, bpSel.value, null, null, vm.blueprintRotation || 0), 'Layout placed.');
  });
  bpRow.append(bpSel, rotBtn, bestBtn, stampBtn);
  intSec.appendChild(bpRow);

  // Active Synergies Summary Strip
  const syn = site.synergies?.summary || null;
  if (syn) {
    const synChips = [];
    if (syn.cryoCooledMachines > 0) synChips.push(`Cryo Cooled x${syn.cryoCooledMachines}`);
    if (syn.resonatorBoostedMachines > 0) synChips.push(`Harmonic Yield x${syn.resonatorBoostedMachines}`);
    if (syn.bracedMachines > 0) synChips.push(`Braced Span x${syn.bracedMachines}`);
    if (syn.linkSpeedMult > 1.05) synChips.push(`Mass Driver +${Math.round((syn.linkSpeedMult - 1) * 100)}%`);
    if (syn.tappedAnomalies > 0) synChips.push(`Anomaly Aura x${syn.tappedAnomalies}`);
    if (synChips.length) {
      const strip = el('div', 'fb-synergy-strip');
      for (const lbl of synChips) strip.appendChild(el('span', 'fb-badge mint', lbl));
      intSec.appendChild(strip);
    }
  }

  // Shift Directives (5 tactical presets)
  const dirTitle = el('div', 'fb-kv-row');
  dirTitle.append(el('span', '', 'Work order'), el('span', 'fb-kv-val', site.directive?.name || 'Balanced'));
  intSec.appendChild(dirTitle);
  const dirBar = el('div', 'fb-pill-strip');
  for (const d of SITE_DIRECTIVES) {
    const b = el('button', `fb-chip-btn ${site.directive?.id === d.id ? 'active' : ''}`, d.short || d.name);
    b.type = 'button';
    b.title = `${d.name}: ${d.summary}`;
    b.addEventListener('click', () => runSiteOp(sys.setSiteDirective(site.siteId, d.id), `Work order: ${d.name}.`));
    dirBar.appendChild(b);
  }
  intSec.appendChild(dirBar);
  panel.appendChild(intSec);

  // Anomalies list ("Tap Forever vs Mine Now")
  if (site.anomalies?.length) {
    const anomSec = el('div', 'fb-section');
    anomSec.appendChild(el('h4', 'fb-sec-title', 'Odd finds in the rock'));
    const aList = el('div', 'fb-list');
    for (const a of site.anomalies) {
      const row = el('div', 'fb-item-row');
      const statusTxt = a.status === 'tapped' ? 'in use' : (a.status === 'breached' ? 'dug out' : 'sealed');
      row.append(
        el('span', '', `${a.name} · ${statusTxt}`),
        a.status !== 'breached'
          ? (() => {
            const br = el('button', 'fb-mini-btn', 'Dig it out');
            br.type = 'button';
            br.title = `Breach for lump cache: ${formatCostLine(a.lumpLoot)}`;
            br.addEventListener('click', () => runSiteOp(sys.tapOrScanSiteAnomalies(site.siteId, 'breach', a.id), `${a.name} dug out.`));
            return br;
          })()
          : el('span', 'fb-kv-val', 'Cleared'),
      );
      aList.appendChild(row);
    }
    anomSec.appendChild(aList);
    panel.appendChild(anomSec);
  }

  // Reserve floors
  const storeEntries = [];
  const merged = {};
  for (const lane of site.lanes || []) {
    for (const [gid, qty] of Object.entries(lane.store || {})) {
      merged[gid] = (merged[gid] || 0) + (Number(qty) || 0);
    }
  }
  for (const gid of Object.keys(site.reserves || {})) {
    if (merged[gid] == null) merged[gid] = 0;
  }
  for (const gid of Object.keys(merged).sort()) {
    storeEntries.push([gid, Math.floor(merged[gid]), Math.trunc(Number(site.reserves?.[gid]) || 0)]);
  }
  const stockSec = el('div', 'fb-section');
  stockSec.appendChild(el('h4', 'fb-sec-title', 'Stock, and how much to keep back'));
  const stockList = el('div', 'fb-list');
  if (!storeEntries.length) {
    stockList.appendChild(el('div', 'fb-tool-sub', 'Nothing in store yet.'));
  } else {
    for (const [goodId, qty, reserve] of storeEntries) {
      const row = el('div', 'fb-item-row');
      const ctrl = el('div', 'fb-inline-controls');
      const minus = el('button', 'fb-mini-btn', '−5');
      minus.type = 'button';
      minus.addEventListener('click', () => runSiteOp(sys.setReserveFloor(site.siteId, goodId, Math.max(0, reserve - 5))));
      const lbl = el('span', 'fb-kv-val', `${reserve} units`);
      const plus = el('button', 'fb-mini-btn', '+5');
      plus.type = 'button';
      plus.addEventListener('click', () => runSiteOp(sys.setReserveFloor(site.siteId, goodId, Math.min(500, reserve + 5))));
      ctrl.append(minus, lbl, plus);
      row.append(el('span', '', `${commodityDisplayName(goodId)}: ${qty} units`), ctrl);
      stockList.appendChild(row);
    }
  }
  stockSec.appendChild(stockList);
  panel.appendChild(stockSec);

  // Inter-Asteroid Links
  const linkSec = el('div', 'fb-section');
  linkSec.appendChild(el('h4', 'fb-sec-title', 'Lines to other rocks'));
  const linkList = el('div', 'fb-list');
  for (const l of site.links) {
    const peer = vm.peerSites.find((p) => p.siteId === l.targetSiteId);
    const row = el('div', 'fb-item-row');
    const desc = `${l.kind === 'power' ? 'Power' : 'Cargo'} → ${peer ? rockName(peer.asteroidId) : 'a rock out of this sector'}`;
    const rm = el('button', 'fb-mini-btn danger', '×');
    rm.type = 'button';
    rm.addEventListener('click', () => runSiteOp(sys.removeSiteLink(site.siteId, l.targetSiteId, l.kind), 'Link removed.'));
    row.append(el('span', '', `${desc} (${l.kind === 'power' ? `${l.ratePerMin || 0} MW` : `${Math.round(l.transferredU || 0)} units`})`), rm);
    linkList.appendChild(row);
  }
  if (vm.peerSites.length) {
    const quickLinkRow = el('div', 'fb-inline-controls');
    const peerSel = el('select', 'fb-select');
    for (const peer of vm.peerSites) {
      const opt = document.createElement('option');
      opt.value = peer.siteId;
      opt.textContent = `${rockName(peer.asteroidId)} · ${peer.specialization?.label || 'Claim'}`;
      peerSel.appendChild(opt);
    }
    const addMatBtn = el('button', 'fb-mini-btn', '+Cargo');
    addMatBtn.type = 'button';
    addMatBtn.addEventListener('click', () => runSiteOp(sys.setSiteLink(site.siteId, peerSel.value, 'material', vm.selectedLinkGoodId || null), 'Cargo line run.'));
    const addPwrBtn = el('button', 'fb-mini-btn', '+Power');
    addPwrBtn.type = 'button';
    addPwrBtn.addEventListener('click', () => runSiteOp(sys.setSiteLink(site.siteId, peerSel.value, 'power', null), 'Power line run.'));
    quickLinkRow.append(peerSel, addMatBtn, addPwrBtn);
    linkList.appendChild(quickLinkRow);
  }
  linkSec.appendChild(linkList);
  panel.appendChild(linkSec);

  // Machine Recipes & Trade Route + Enter Asteroid Works
  const opsSec = el('div', 'fb-section');
  opsSec.appendChild(el('h4', 'fb-sec-title', 'What it makes and where it sells'));
  for (const m of site.machines) {
    const def = SITE_MACHINE_BY_ID.get(m.defId);
    if (!def?.modes?.length) continue;
    const modeRow = el('div', 'fb-kv-row');
    modeRow.append(el('span', '', def.short || def.name));
    const modeSel = el('select', 'fb-select');
    for (const modeId of def.modes) {
      const opt = document.createElement('option');
      opt.value = modeId;
      opt.textContent = machineModeDisplayName(modeId);
      modeSel.appendChild(opt);
    }
    modeSel.value = m.mode || def.defaultMode;
    modeSel.addEventListener('change', () => runSiteOp(sys.setMachineMode(site.siteId, m.id, modeSel.value), `Retooled to ${machineModeDisplayName(modeSel.value)}.`));
    modeRow.appendChild(modeSel);
    opsSec.appendChild(modeRow);
  }
  if (site.courier?.stations?.length) {
    const routeRow = el('div', 'fb-kv-row');
    routeRow.append(el('span', '', 'Sells at'));
    const stSel = el('select', 'fb-select');
    const autoOpt = document.createElement('option');
    autoOpt.value = '';
    autoOpt.textContent = `Auto (${site.courier.stations[0].name})`;
    stSel.appendChild(autoOpt);
    for (const st of site.courier.stations) {
      const opt = document.createElement('option');
      opt.value = st.id;
      opt.textContent = st.name;
      stSel.appendChild(opt);
    }
    stSel.value = site.courier.destinationId || '';
    stSel.addEventListener('change', () => runSiteOp(sys.setPodDestination(site.siteId, stSel.value || null), 'Courier trade route updated.'));
    routeRow.appendChild(stSel);
    opsSec.appendChild(routeRow);
  }
  const navRow = el('div', 'fb-inline-controls');
  const orbShortcut = el('button', 'fb-action-btn', 'Guards and drones');
  orbShortcut.type = 'button';
  orbShortcut.addEventListener('click', () => setTab('orbital'));
  const openBtn = el('button', 'fb-action-btn primary', 'Go inside (8)');
  openBtn.type = 'button';
  openBtn.addEventListener('click', () => enterSelectedWorks());
  navRow.append(orbShortcut, openBtn);
  opsSec.appendChild(navRow);
  panel.appendChild(opsSec);
}

function renderOrbitalTab({ panel, vm, sys, callbacks }) {
  const { runSiteOp, setOrbitalFilter } = callbacks;
  if (!vm.selectedSite) {
    panel.appendChild(el('h3', 'fb-card-title', 'Guards and drones'));
    panel.appendChild(el('p', 'fb-tool-sub', 'Pick one of your claims first. Then you can build guards around it and launch drones.'));
    return;
  }
  const site = vm.selectedSite;
  const head = el('div', 'fb-card-head');
  head.append(el('h3', 'fb-card-title', 'Guards and drones'), el('span', 'fb-badge mint', `${site.defenses.length}/${SITE_BALANCE.maxDefensesPerSite}`));
  panel.appendChild(head);

  // Autonomous Fleet Drones
  const droneSec = el('div', 'fb-section');
  droneSec.appendChild(el('h4', 'fb-sec-title', `Drones (${site.drones?.length || 0} of ${site.maxDrones || 6})`));
  const droneList = el('div', 'fb-list');
  for (const spec of BELT_DRONE_TYPE_LIST) {
    const row = el('div', 'fb-struct-card');
    const top = el('div', 'fb-kv-row');
    const buildBtn = el('button', 'fb-mini-btn primary', 'Launch');
    buildBtn.type = 'button';
    buildBtn.disabled = (site.drones?.length || 0) >= (site.maxDrones || 6);
    buildBtn.addEventListener('click', () => runSiteOp(sys.commissionSiteDrone(site.siteId, spec.id), `${spec.name} launched.`));
    top.append(el('strong', '', spec.name), buildBtn);
    row.append(top, el('div', 'fb-tool-sub', `${spec.summary}`), el('div', 'fb-cost-line', `Cost: ${formatCostLine(spec.cost)}`));
    droneList.appendChild(row);
  }
  if (site.drones?.length) {
    for (const d of site.drones) {
      const row = el('div', 'fb-item-row');
      row.append(el('span', '', `${d.kind.toUpperCase()} (${d.phase || 'active'})`), el('span', 'fb-kv-val', `${d.cycleCount || 0} runs`));
      droneList.appendChild(row);
    }
  }
  droneSec.appendChild(droneList);
  panel.appendChild(droneSec);

  // 12 Tiered Orbital Megastructures + Role Filter Pills
  const orbSec = el('div', 'fb-section');
  orbSec.appendChild(el('h4', 'fb-sec-title', 'Built around the rock'));
  const roleFilter = vm.orbitalFilter || 'all';
  const filterBar = el('div', 'fb-pill-strip');
  for (const [fKey, fLbl] of [['all', 'All'], ['power', 'Power'], ['defense', 'Defense'], ['logistics', 'Logistics'], ['fleet', 'Fleet']]) {
    const fb = el('button', `fb-chip-btn ${roleFilter === fKey ? 'active' : ''}`, fLbl);
    fb.type = 'button';
    fb.addEventListener('click', () => setOrbitalFilter?.(fKey));
    filterBar.appendChild(fb);
  }
  orbSec.appendChild(filterBar);

  const orbList = el('div', 'fb-list');
  const filteredStructs = BELT_ORBITAL_STRUCTURE_LIST.filter((s) => {
    if (roleFilter === 'all') return true;
    if (roleFilter === 'power') return s.role === 'power' || s.role === 'thermal';
    if (roleFilter === 'logistics') return s.role === 'logistics' || s.role === 'commerce' || s.role === 'industry';
    return s.role === roleFilter;
  });
  for (const struct of filteredStructs) {
    const installedCount = site.defenses.filter((d) => d.kind === struct.id).length;
    const card = el('div', 'fb-struct-card');
    const top = el('div', 'fb-kv-row');
    const deployBtn = el('button', 'fb-mini-btn', 'Build');
    deployBtn.type = 'button';
    deployBtn.disabled = site.defenses.length >= SITE_BALANCE.maxDefensesPerSite;
    deployBtn.addEventListener('click', () => runSiteOp(sys.deploySiteDefense(site.siteId, struct.id), `${struct.name} anchored on flank orbit.`));
    top.append(
      el('strong', '', `${struct.name}${installedCount > 0 ? ` (${installedCount} built)` : ''}`),
      deployBtn,
    );
    card.append(
      top,
      el('div', 'fb-tool-sub', struct.summary),
      el('div', 'fb-cost-line', `${struct.powerDeltaMw >= 0 ? `+${struct.powerDeltaMw}` : struct.powerDeltaMw} MW · Cost: ${formatCostLine(struct.cost)}`),
    );
    orbList.appendChild(card);
  }
  orbSec.appendChild(orbList);
  panel.appendChild(orbSec);
}

function renderMatrixTab({ panel, vm, sys, callbacks }) {
  const { runSiteOp } = callbacks;
  const m = vm.supplyMatrix || vm.network.supplyMatrix || { commodities: [], totalPowerGenMw: 0, totalPowerDrawMw: 0, netPowerMw: 0, activeLinkCount: 0 };

  const head = el('div', 'fb-card-head');
  head.append(el('h3', 'fb-card-title', 'Supply in this belt'), el('span', 'fb-badge', `${m.activeLinkCount || 0} links`));
  panel.appendChild(head);

  const summaryRow = el('div', 'fb-kv-row');
  summaryRow.append(el('span', '', 'Power made / used'), el('span', 'fb-kv-val', `${m.totalPowerGenMw || 0} / ${m.totalPowerDrawMw || 0} MW (${m.netPowerMw >= 0 ? '+' : ''}${m.netPowerMw || 0})`));
  panel.appendChild(summaryRow);

  const autoBtn = el('button', 'fb-action-btn primary', 'Link my claims for me (G)');
  autoBtn.type = 'button';
  autoBtn.addEventListener('click', () => {
    runSiteOp(sys.autoLinkSectorCluster(vm.sectorId), 'Lines run between your claims.');
  });
  panel.appendChild(autoBtn);

  // Sector-Wide Batch Directives
  if (vm.network.sites?.length) {
    const batchDirSec = el('div', 'fb-section');
    batchDirSec.appendChild(el('h4', 'fb-sec-title', 'Work order for every claim'));
    const bar = el('div', 'fb-pill-strip');
    for (const d of SITE_DIRECTIVES) {
      const b = el('button', 'fb-chip-btn', d.short || d.name);
      b.type = 'button';
      b.title = `Set ALL sector sites to ${d.name}: ${d.summary}`;
      b.addEventListener('click', () => {
        for (const s of vm.network.sites) {
          sys.setSiteDirective(s.siteId, d.id);
        }
        callbacks.toast(`All ${vm.network.sites.length} sector sites shifted to ${d.name}.`, 'good');
      });
      bar.appendChild(b);
    }
    batchDirSec.appendChild(bar);
    panel.appendChild(batchDirSec);
  }

  const sec = el('div', 'fb-section');
  sec.appendChild(el('h4', 'fb-sec-title', 'Made and used each minute'));
  const list = el('div', 'fb-list');
  if (!m.commodities?.length) {
    list.appendChild(el('div', 'fb-tool-sub', 'Nothing is being made in this belt yet.'));
  } else {
    for (const c of m.commodities) {
      const card = el('div', 'fb-struct-card');
      const row = el('div', 'fb-kv-row');
      const tone = c.bottleneck === 'deficit' ? 'danger-txt' : (c.bottleneck === 'surplus' ? 'mint-txt' : '');
      row.append(
        el('span', '', `${c.name} (${Math.round(c.stockU)} units)`),
        el('span', `fb-kv-val ${tone}`, `+${c.prodPerMin} / −${c.consPerMin} (${c.netPerMin >= 0 ? '+' : ''}${c.netPerMin})`),
      );
      const totalFlow = Math.max(0.1, Number(c.prodPerMin || 0) + Number(c.consPerMin || 0));
      const ratioPct = Math.round((Number(c.prodPerMin || 0) / totalFlow) * 100);
      const tr = el('div', 'fb-comp-track');
      const fill = el('div', `fb-comp-fill ${c.bottleneck === 'deficit' ? 'danger' : 'mint'}`);
      fill.style.width = `${Math.max(4, Math.min(100, ratioPct))}%`;
      tr.appendChild(fill);
      card.append(row, tr);
      list.appendChild(card);
    }
  }
  sec.appendChild(list);
  panel.appendChild(sec);
}

function renderDoctrinesTab({ panel, vm, sys, callbacks }) {
  const { runSiteOp } = callbacks;
  const empire = vm.empire || { doctrines: {} };
  const unlocked = empire.doctrines || {};
  const unlockedCount = Object.keys(unlocked).filter((k) => !!unlocked[k]).length;

  const head = el('div', 'fb-card-head');
  head.append(el('h3', 'fb-card-title', 'Belt Doctrines'), el('span', 'fb-badge amber', `${unlockedCount} / ${BELT_DOCTRINES.length}`));
  panel.appendChild(head);
  panel.appendChild(el('p', 'fb-tool-sub', 'Doctrines are permanent upgrades for every claim you own: more ore, cooler machines, better drones, a stronger guard.'));

  // Cumulative Empire Modifier Summary
  const mods = vm.empireModifiers || null;
  if (mods) {
    const modStrip = el('div', 'fb-synergy-strip');
    if (mods.yieldMult > 1) modStrip.appendChild(el('span', 'fb-badge mint', `Yield +${Math.round((mods.yieldMult - 1) * 100)}%`));
    if (mods.coolingMult > 1) modStrip.appendChild(el('span', 'fb-badge', `Cryo +${Math.round((mods.coolingMult - 1) * 100)}%`));
    if (mods.droneYieldMult > 1) modStrip.appendChild(el('span', 'fb-badge amber', `Drones +${Math.round((mods.droneYieldMult - 1) * 100)}%`));
    if (mods.linkSpeedMult > 1) modStrip.appendChild(el('span', 'fb-badge', `Links +${Math.round((mods.linkSpeedMult - 1) * 100)}%`));
    if (mods.defenseMult > 1) modStrip.appendChild(el('span', 'fb-badge mint', `Defense +${Math.round((mods.defenseMult - 1) * 100)}%`));
    if (modStrip.children.length) panel.appendChild(modStrip);
  }

  const branches = ['deep_core', 'thermodynamics', 'swarm', 'sovereignty'];
  for (const branchKey of branches) {
    const sec = el('div', 'fb-section');
    sec.appendChild(el('h4', 'fb-sec-title', DOCTRINE_BRANCH_LABELS[branchKey] || branchKey));
    const list = el('div', 'fb-list');
    for (const doc of BELT_DOCTRINES.filter((d) => d.branch === branchKey)) {
      const isDone = !!unlocked[doc.id];
      const prereqOk = !doc.prereq || !!unlocked[doc.prereq];
      const card = el('div', `fb-struct-card ${isDone ? 'unlocked' : ''}`);
      const top = el('div', 'fb-kv-row');
      const actBtn = el('button', `fb-mini-btn ${isDone ? 'mint' : 'primary'}`, isDone ? 'Active' : `${doc.costCredits} cr`);
      actBtn.type = 'button';
      actBtn.disabled = isDone || !prereqOk;
      actBtn.addEventListener('click', () => runSiteOp(sys.unlockBeltDoctrine(doc.id), `Doctrine researched: ${doc.name}.`));
      top.append(el('strong', '', `${doc.name} · tier ${doc.tier}`), actBtn);
      card.append(top, el('div', 'fb-tool-sub', doc.summary));
      list.appendChild(card);
    }
    sec.appendChild(list);
    panel.appendChild(sec);
  }
}

function renderChartersTab({ panel, vm, sys, callbacks }) {
  const { runSiteOp } = callbacks;
  const empire = vm.empire || { activeCharters: [], completedCharters: [], raidStatus: {} };
  const weather = vm.weather;

  const head = el('div', 'fb-card-head');
  head.append(el('h3', 'fb-card-title', 'Weather & Belt Charters'), el('span', 'fb-badge', `${empire.completedCharters?.length || 0} done`));
  panel.appendChild(head);

  if (weather) {
    const wCard = el('div', 'fb-struct-card');
    const top = el('div', 'fb-kv-row');
    top.append(el('strong', '', `Weather: ${weather.name}`), el('span', 'fb-kv-val', `${weather.remainingS}s`));
    wCard.append(top, el('div', 'fb-tool-sub', weather.summary));
    panel.appendChild(wCard);
  }

  const raidSec = el('div', 'fb-section');
  raidSec.appendChild(el('h4', 'fb-sec-title', 'Raids'));
  const rating = vm.network.totals?.totalDefenseRating || 0;
  const pressure = empire.raidStatus?.pressure || 0;
  const rRow = el('div', 'fb-kv-row');
  rRow.append(el('span', '', 'Guard, of what raiders test'), el('span', 'fb-kv-val', `${rating} of ${pressure}`));
  raidSec.appendChild(rRow);
  raidSec.appendChild(el('div', 'fb-tool-sub', pressure > 0
    ? 'Every three minutes raiders test this belt. If the guard falls short they take up to a fifth of the stock at the worst-guarded rock, and less for every turret or patrol drone you add.'
    : 'One claim draws no raiders. A second one does.'));
  if (empire.raidStatus?.lastMessage) {
    raidSec.appendChild(el('div', 'fb-tool-sub', empire.raidStatus.lastMessage));
  }
  panel.appendChild(raidSec);

  const actSec = el('div', 'fb-section');
  actSec.appendChild(el('h4', 'fb-sec-title', `Charters you hold (${empire.activeCharters?.length || 0} of 3)`));
  const actList = el('div', 'fb-list');
  if (!empire.activeCharters?.length) {
    actList.appendChild(el('div', 'fb-tool-sub', 'Take a charter below. Each pays once, when you meet it.'));
  } else {
    for (const c of empire.activeCharters) {
      const tpl = BELT_CHARTER_TEMPLATES.find((t) => t.id === c.id);
      if (!tpl) continue;
      const card = el('div', 'fb-struct-card');
      const top = el('div', 'fb-kv-row');
      const tgt = Math.max(1, c.target || tpl.requirement.target || 1);
      const prog = Math.min(tgt, Math.max(0, c.progress || 0));
      top.append(el('strong', '', tpl.name), el('span', 'fb-kv-val', `${prog} / ${tgt}`));
      const tr = el('div', 'fb-comp-track');
      const fill = el('div', 'fb-comp-fill mint');
      fill.style.width = `${Math.round((prog / tgt) * 100)}%`;
      tr.appendChild(fill);
      card.append(top, tr, el('div', 'fb-tool-sub', `${tpl.summary} (Reward: ${tpl.rewardCredits} cr)`));
      actList.appendChild(card);
    }
  }
  actSec.appendChild(actList);
  panel.appendChild(actSec);

  // Sector-Wide Industrial Telemetry Feed
  const logEvents = [];
  for (const sNode of vm.network.sites || []) {
    const rawSite = sys?.getSite?.(sNode.siteId);
    for (const entry of (rawSite?.ledger || []).slice(0, 3)) {
      if (entry?.text) logEvents.push({ t: Number(entry.t) || 0, tag: rockName(sNode.asteroidId), text: entry.text, kind: entry.kind || 'info' });
    }
  }
  logEvents.sort((a, b) => b.t - a.t);
  if (logEvents.length) {
    const feedSec = el('div', 'fb-section');
    feedSec.appendChild(el('h4', 'fb-sec-title', 'What happened lately'));
    const feedList = el('div', 'fb-list');
    for (const ev of logEvents.slice(0, 6)) {
      const row = el('div', 'fb-item-row');
      row.append(
        el('span', 'fb-badge', ev.tag),
        el('span', 'fb-tool-sub fb-feed-text', ev.text),
      );
      feedList.appendChild(row);
    }
    feedSec.appendChild(feedList);
    panel.appendChild(feedSec);
  }

  const availSec = el('div', 'fb-section');
  availSec.appendChild(el('h4', 'fb-sec-title', 'Charters on offer'));
  const availList = el('div', 'fb-list');
  for (const tpl of BELT_CHARTER_TEMPLATES) {
    const done = empire.completedCharters?.includes(tpl.id);
    const active = empire.activeCharters?.some((c) => c.id === tpl.id);
    const card = el('div', `fb-struct-card ${done ? 'unlocked' : ''}`);
    const top = el('div', 'fb-kv-row');
    const btn = el('button', `fb-mini-btn ${done ? 'mint' : 'primary'}`, done ? 'Done' : (active ? 'Active' : `${tpl.rewardCredits} cr`));
    btn.type = 'button';
    btn.disabled = done || active || (empire.activeCharters?.length || 0) >= 3;
    btn.addEventListener('click', () => runSiteOp(sys.acceptBeltCharter(tpl.id), `Charter accepted: ${tpl.name}.`));
    top.append(el('strong', '', tpl.name), btn);
    card.append(top, el('div', 'fb-tool-sub', tpl.summary));
    availList.appendChild(card);
  }
  availSec.appendChild(availList);
  panel.appendChild(availSec);
}

export function renderFieldArchitectWorkspace({ inspector, vm, sys, callbacks }) {
  inspector.replaceChildren();
  inspector.hidden = false;

  // Top 5-Tab Workspace Strip
  const tabBar = el('nav', 'fb-tab-bar');
  tabBar.setAttribute('aria-label', 'Field Architect Workspace Tabs');
  for (const t of ARCHITECT_TABS) {
    const btn = el('button', `fb-tab-btn ${vm.activeTab === t.id ? 'active' : ''}`, t.label);
    btn.type = 'button';
    btn.dataset.tab = t.id;
    btn.addEventListener('click', () => callbacks.setTab(t.id));
    tabBar.appendChild(btn);
  }
  inspector.appendChild(tabBar);

  // Weather telemetry bar
  if (vm.weather) {
    const wStrip = el('div', 'fb-weather-strip');
    wStrip.append(
      el('span', '', `${vm.weather.name}`),
      el('span', 'fb-kv-val', `${vm.weather.remainingS}s`),
    );
    inspector.appendChild(wStrip);
  }

  const body = el('div', 'fb-panel-body');
  if (vm.activeTab === 'orbital') renderOrbitalTab({ panel: body, vm, sys, callbacks });
  else if (vm.activeTab === 'matrix') renderMatrixTab({ panel: body, vm, sys, callbacks });
  else if (vm.activeTab === 'doctrines') renderDoctrinesTab({ panel: body, vm, sys, callbacks });
  else if (vm.activeTab === 'charters') renderChartersTab({ panel: body, vm, sys, callbacks });
  else renderSiteTab({ panel: body, vm, sys, callbacks });

  inspector.appendChild(body);
}
