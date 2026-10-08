// FB-055 — one industrial readout. Drones, traders, outposts, and sites share
// this projection. It reads numbers the sim already stored. It does not hire,
// recall, or retask anything.

const DAY_MIN = 1440;
const RAW_ID = /^[a-z0-9]+(?:[_-][a-z0-9]+)+$/;

const STATUS_WORD = Object.freeze({
  running: 'Running',
  active: 'Running',
  working: 'Running',
  deployed: 'Running',
  idle: 'Idle',
  waiting: 'Waiting',
  distressed: 'Distressed',
  raided: 'Raided',
  lowfuel: 'No fuel',
  stranded: 'No fuel',
  stalled: 'Buffer full',
  full: 'Buffer full',
  full_storage: 'Hold is full',
  no_power: 'No power',
  no_exposed_face: 'No rock to cut',
  blocked_lane: 'Lane blocked',
  missing_input: 'Out of fuel',
  launch_capacity: 'No launch room',
  poor_destination: 'Depot is not buying',
  demand_saturation: 'Depot is full of this ore',
  over_capacity: 'Lane over capacity',
});

function finite(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function wordsFromId(id) {
  return String(id || '')
    .replace(/^(drone_|trader_|outpost_|cmdty_|ship_|sector_|mod_|site_)/, '')
    .split(/[_-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function assetName(asset, fallback) {
  const name = asset && typeof asset.name === 'string' ? asset.name.trim() : '';
  if (name && name !== asset.defId && !RAW_ID.test(name)) return name;
  const defId = asset && typeof asset.defId === 'string' ? asset.defId : '';
  if (defId) return wordsFromId(defId) || fallback;
  const siteName = asset && typeof asset.siteName === 'string' ? asset.siteName.trim() : '';
  if (siteName && !RAW_ID.test(siteName)) return siteName;
  return fallback;
}

export function limitWord(asset) {
  const op = asset && asset.operation && typeof asset.operation === 'object' ? asset.operation : null;
  if (op && typeof op.statusLabel === 'string' && op.statusLabel.trim()) return op.statusLabel.trim();
  if (op && typeof op.label === 'string' && op.label.trim()) return op.label.trim();
  const raw = asset && (asset.limit
    || (asset.status && typeof asset.status === 'object' ? asset.status.limit || asset.status.state : asset.status));
  const key = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (key && STATUS_WORD[key]) return STATUS_WORD[key];
  if (key && !RAW_ID.test(key)) return key.charAt(0).toUpperCase() + key.slice(1);
  if (asset && asset.overCapacity) return 'Lane over capacity';
  return 'Running';
}

function ratePerMinOf(asset) {
  if (!asset) return 0;
  if (asset.ratePerMin != null && finite(asset.ratePerMin) > 0) return finite(asset.ratePerMin);
  const op = asset.operation;
  if (op && op.netThroughputPerMin != null) return Math.max(0, finite(op.netThroughputPerMin));
  if (asset.exportRatePerMin != null) return Math.max(0, finite(asset.exportRatePerMin));
  return Math.max(0, finite(asset.ratePerMin));
}

function unitOf(kind) {
  return kind === 'Site' ? 'u' : 'cr';
}

function lineFor(kind, asset) {
  const name = assetName(asset, kind);
  const perDay = Math.round(ratePerMinOf(asset) * DAY_MIN);
  const limit = limitWord(asset);
  const unit = unitOf(kind);
  return {
    kind,
    name,
    outputPerDay: perDay,
    unit,
    limit,
    text: `${name} — ${perDay} ${unit}/day, limited by ${limit}.`,
    crest: `${name} ${perDay} ${unit}/day · ${limit}`,
  };
}

function siteRecord(view) {
  if (!view || typeof view !== 'object') return null;
  const machines = Array.isArray(view.machines) ? view.machines : [];
  const limited = machines.find((machine) => machine && machine.status && (machine.status.limit || (machine.status.state && machine.status.state !== 'running')));
  const lanes = Array.isArray(view.lanes) ? view.lanes : [];
  const spilled = lanes.find((lane) => lane && (lane.overCapacity || lane.spilled));
  return {
    name: view.name,
    siteName: view.siteName || (view.site && view.site.name),
    defId: view.defId,
    ratePerMin: view.ratePerMin != null ? view.ratePerMin : view.exportRatePerMin,
    exportRatePerMin: view.exportRatePerMin,
    status: (limited && limited.status) || (spilled ? 'over_capacity' : null),
    limit: limited && limited.status ? (limited.status.limit || limited.status.state) : (spilled ? 'over_capacity' : null),
    overCapacity: !!spilled,
  };
}

/**
 * The shared readout. `sites` are projections (exportRatePerMin, machines, lanes)
 * or plain records. Money assets stay in credits; a site stays in units.
 */
export function industryReadout({ drones = [], traders = [], outposts = [], sites = [] } = {}) {
  const lines = [
    ...drones.filter(Boolean).map((asset) => lineFor('Drone', asset)),
    ...traders.filter(Boolean).map((asset) => lineFor('Trader', asset)),
    ...outposts.filter(Boolean).map((asset) => lineFor('Outpost', asset)),
    ...sites.map(siteRecord).filter(Boolean).map((asset) => lineFor('Site', asset)),
  ];
  const sentence = lines.length
    ? lines.map((line) => line.text).join(' ')
    : 'No industrial output on record.';
  const crest = lines.length
    ? (lines.find((line) => line.limit !== 'Running') || lines[0]).crest
    : 'No output on record';
  return { lines, sentence, crest };
}

export function industryReadoutFromState(state, siteViews = []) {
  const automation = state && state.automation && typeof state.automation === 'object' ? state.automation : {};
  const views = Array.isArray(siteViews) ? siteViews : [];
  return industryReadout({
    drones: automation.drones || [],
    traders: automation.traders || [],
    outposts: automation.outposts || [],
    sites: views,
  });
}

/** A trader finished a cycle and nobody was listening. One sentence, from the receipt. */
export function traderCycleLine(payload) {
  const receipt = payload && payload.receipt && typeof payload.receipt === 'object' ? payload.receipt : null;
  if (!receipt) return 'A trader finished a run.';
  const credited = Math.round(finite(receipt.credited));
  if (receipt.result === 'paid' && credited > 0) return `Trader run paid ${credited} cr.`;
  return 'A trader finished a run with no payout.';
}

export function renderIndustryStrip(model, { cycle = '' } = {}) {
  const readout = model && Array.isArray(model.lines) ? model : industryReadout();
  const root = document.createElement('div');
  root.className = 'au-industry';
  root.setAttribute('aria-label', 'Industrial output');
  root.dataset.industry = 'readout';
  const sentence = document.createElement('p');
  sentence.className = 'au-note';
  sentence.dataset.industrySentence = '1';
  sentence.textContent = readout.sentence;
  root.appendChild(sentence);
  if (readout.lines.length) {
    const list = document.createElement('ul');
    list.className = 'au-industry-rows';
    for (const line of readout.lines) {
      const item = document.createElement('li');
      item.textContent = line.text;
      list.appendChild(item);
    }
    root.appendChild(list);
  }
  const note = document.createElement('p');
  note.className = 'au-note';
  note.dataset.industryCycle = '1';
  note.textContent = cycle || '';
  if (!cycle) note.hidden = true;
  root.appendChild(note);
  return root;
}
