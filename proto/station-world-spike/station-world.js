import { createAuthoredShipStage } from '/proto/station-world-spike/authored-ship-stage.js';

const world = document.querySelector('#station-world');
const canvas = document.querySelector('#bay-canvas');
const crown = document.querySelector('#service-crown');
const servicesRoot = document.querySelector('#ship-services');
const modeSignal = document.querySelector('#mode-signal');
const modeTrace = document.querySelector('#mode-trace');
const pathsRoot = document.querySelector('#umbilical-paths');
const receipt = document.querySelector('#receipt');
const acquisitionText = document.querySelector('#acquisition-text');
const creditsEl = document.querySelector('#credits');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

const mount = createAuthoredShipStage(canvas, {
  onFirstFrame: () => world.classList.add('has-ship'),
  onError: () => world.classList.add('ship-load-failed'),
});
mount.setYaw(-Math.PI * .18);

const icon = (paths) => `<svg viewBox="0 0 32 32" aria-hidden="true">${paths}</svg>`;
const icons = {
  shipworks: icon('<path d="M16 4 22 9v11l-6 8-6-8V9Z"/><circle cx="16" cy="14" r="3"/><path d="m10 10-5 5 5 2m12-7 5 5-5 2"/>'),
  exchange: icon('<path d="M5 22c5-9 9-2 13-10 3-6 6-5 9-5"/><path d="M5 26h22M8 18v8m6-12v12m6-8v8m6-15v15"/>'),
  foundry: icon('<path d="M6 25V13l7 4v-6l7 5V8h6v17Z"/><path d="M10 25v-4h4v4m5 0v-5h4v5"/>'),
  operations: icon('<circle cx="16" cy="16" r="11"/><circle cx="16" cy="16" r="3"/><path d="M16 5v5m0 12v5M5 16h5m12 0h5m-4-7-4 4m-6 6-4 4"/>'),
  authority: icon('<path d="M16 4 26 8v8c0 6-4 9-10 12-6-3-10-6-10-12V8Z"/><path d="m11 17 3 3 7-8"/>'),
  concourse: icon('<circle cx="12" cy="12" r="4"/><circle cx="23" cy="11" r="3"/><path d="M5 27c0-6 3-9 7-9s7 3 7 9m0-7c4 0 7 2 7 7"/>'),
  repair: icon('<path d="m10 7 5 5-3 3-5-5c-2 5 2 9 7 8l7 7 4-4-7-7c1-5-3-9-8-7Z"/>'),
  refuel: icon('<path d="M9 27V6h12v21M7 27h16M12 10h6"/><path d="M21 12h3l3 4v7c0 2-3 2-3 0v-5h-3"/>'),
  resupply: icon('<path d="M6 10h20v14H6zM10 7h12v3M11 17h10m-5-5v10"/>'),
  undock: icon('<path d="M16 27V7m-7 7 7-7 7 7"/><path d="M6 25h20"/>'),
};

const modes = [
  { id: 'shipworks', label: 'Shipworks', code: 'HULL / FIT', hint: 'Operate the ship and its physical systems' },
  { id: 'exchange', label: 'Exchange', code: 'CARGO / VALUE', hint: 'Move carried cargo through the local economy' },
  { id: 'foundry', label: 'Foundry', code: 'MATTER / FORM', hint: 'Trace materials into parts and hulls' },
  { id: 'operations', label: 'Operations', code: 'ROUTE / RISK', hint: 'Bind a contract future into navigation' },
  { id: 'authority', label: 'Authority', code: 'ACCESS / TRUST', hint: 'Inspect the forces governing this station' },
  { id: 'concourse', label: 'Concourse', code: 'PEOPLE / SIGNAL', hint: 'Tune into contacts, rumors, and evidence' },
];

const modeNodes = modes.map((mode, index) => {
  const t = index / (modes.length - 1);
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'crown-node';
  button.dataset.mode = mode.id;
  button.style.left = `${17 + t * 66}%`;
  button.style.top = `${25 - Math.sin(t * Math.PI) * 12}%`;
  button.style.setProperty('--delay', `${.42 + index * .065}s`);
  button.setAttribute('aria-label', `${mode.label}: ${mode.hint}`);
  button.innerHTML = `<span class="crown-node__body">${icons[mode.id]}</span><span class="crown-node__label">${mode.label}</span><span class="crown-node__code">${mode.code}</span>`;
  button.addEventListener('click', () => selectMode(mode, button));
  button.addEventListener('keydown', (event) => moveCrownFocus(event, index));
  crown.append(button);
  return button;
});

function moveCrownFocus(event, index) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  let next = index;
  if (event.key === 'ArrowLeft') next = (index - 1 + modeNodes.length) % modeNodes.length;
  if (event.key === 'ArrowRight') next = (index + 1) % modeNodes.length;
  if (event.key === 'Home') next = 0;
  if (event.key === 'End') next = modeNodes.length - 1;
  modeNodes[next].focus();
}

function selectMode(mode, node) {
  modeNodes.forEach((candidate) => {
    candidate.removeAttribute('aria-current');
    candidate.style.setProperty('--scale', '1');
  });
  node.setAttribute('aria-current', 'page');
  world.dataset.mode = mode.id;
  modeSignal.classList.remove('is-changing');
  void modeSignal.offsetWidth;
  modeSignal.classList.add('is-changing');
  modeSignal.querySelector('span').textContent = 'STATION TWIN / OPERATING LAYER';
  modeSignal.querySelector('strong').textContent = mode.label;
  modeSignal.querySelector('small').textContent = mode.hint;
  const rect = node.getBoundingClientRect();
  const x = (rect.left + rect.width / 2) / innerWidth * 1000;
  const y = (rect.top + rect.height / 2) / innerHeight * 700;
  modeTrace.innerHTML = `<path class="mode-trace-path" d="M ${x.toFixed(1)} ${y.toFixed(1)} Q 500 250 500 385"/>`;
  showReceipt(`${mode.label.toUpperCase()} <b>CONNECTED</b><br>${mode.hint}`);
}

let pointer = null;
let crownFrame = 0;
function updateCrownScale() {
  crownFrame = 0;
  if (!pointer || reduced) return;
  for (const node of modeNodes) {
    if (node.hasAttribute('aria-current')) {
      node.style.setProperty('--scale', '1');
      continue;
    }
    const r = node.getBoundingClientRect();
    const dx = pointer.x - (r.left + r.width / 2);
    const dy = pointer.y - (r.top + r.height / 2);
    const distance = Math.hypot(dx, dy);
    const response = Math.exp(-Math.pow(distance / 118, 2));
    node.style.setProperty('--scale', (1 + response * .34).toFixed(3));
  }
}
world.addEventListener('pointermove', (event) => {
  pointer = { x: event.clientX, y: event.clientY };
  if (!crownFrame) crownFrame = requestAnimationFrame(updateCrownScale);
});
world.addEventListener('pointerleave', () => {
  pointer = null;
  modeNodes.forEach((node) => node.style.setProperty('--scale', '1'));
});

const serviceData = [
  { id: 'repair', label: 'Repair', detail: '23 CR', x: 27, y: 72, tx: 44, ty: 57, state: 'warn' },
  { id: 'refuel', label: 'Refuel', detail: 'FULL', x: 39, y: 80, tx: 47, ty: 62, state: 'full' },
  { id: 'resupply', label: 'Resupply', detail: '18 CR', x: 61, y: 80, tx: 53, ty: 62, state: 'warn' },
  { id: 'undock', label: 'Undock', detail: 'READY', x: 73, y: 72, tx: 56, ty: 57, state: 'ready' },
];

const serviceNodes = new Map();
serviceData.forEach((service, index) => {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'service-node';
  button.dataset.service = service.id;
  button.dataset.state = service.state;
  button.style.left = `${service.x}%`;
  button.style.top = `${service.y}%`;
  button.style.setProperty('--delay', `${1.05 + index * .08}s`);
  button.setAttribute('aria-label', `${service.label}, ${service.detail}`);
  button.innerHTML = `<span class="service-node__ring">${icons[service.id]}</span><span class="service-node__copy"><b>${service.label}</b><small>${service.detail}</small></span>`;
  button.addEventListener('click', () => operateService(service, button));
  servicesRoot.append(button);
  serviceNodes.set(service.id, button);

  const x1 = service.tx * 10;
  const y1 = service.ty * 7;
  const x2 = service.x * 10;
  const y2 = service.y * 7;
  pathsRoot.insertAdjacentHTML('beforeend', `<path id="path-${service.id}" class="umbilical-path" d="M ${x1} ${y1} Q ${(x1 + x2) / 2} ${Math.max(y1, y2) + 36} ${x2} ${y2}"/>`);
});

let credits = 5400;
function operateService(service, button) {
  if (button.classList.contains('is-processing')) return;
  if (service.id === 'refuel') {
    showReceipt('FUEL LINK <b>FULL</b><br>No propellant transfer required');
    return;
  }
  button.classList.add('is-processing');
  document.querySelector(`#path-${service.id}`)?.classList.add('is-active');
  setTimeout(() => {
    button.classList.remove('is-processing');
    document.querySelector(`#path-${service.id}`)?.classList.remove('is-active');
    if (service.id === 'repair' && service.detail !== 'CLEAR') {
      credits -= 23;
      service.detail = 'CLEAR';
      button.dataset.state = 'full';
      button.querySelector('small').textContent = 'CLEAR';
      button.setAttribute('aria-label', 'Repair, hull restored, clear');
      creditsEl.textContent = credits.toLocaleString('en-US');
      showReceipt('HULL RESTORED <b>81% → 100%</b><br>CREDITS −23 · SERVICE LINK SETTLED');
    } else if (service.id === 'resupply' && service.detail !== 'STOWED') {
      credits -= 18;
      service.detail = 'STOWED';
      button.dataset.state = 'full';
      button.querySelector('small').textContent = 'STOWED';
      creditsEl.textContent = credits.toLocaleString('en-US');
      showReceipt('MUNITIONS STOWED <b>READY</b><br>CREDITS −18 · HOLD MASS UPDATED');
    } else if (service.id === 'undock') {
      showReceipt('DEPARTURE CIRCUIT <b>ARMED</b><br>Confirm again in the live route to release berth');
    } else {
      showReceipt(`${service.label.toUpperCase()} <b>CLEAR</b><br>No further service required`);
    }
  }, reduced ? 1 : 680);
}

let receiptTimer = 0;
function showReceipt(html) {
  clearTimeout(receiptTimer);
  receipt.classList.remove('is-visible');
  void receipt.offsetWidth;
  receipt.innerHTML = html;
  receipt.classList.add('is-visible');
  receiptTimer = setTimeout(() => receipt.classList.remove('is-visible'), reduced ? 1400 : 2300);
}

const acquisitionStates = [
  'AUTHORITY KEY ACCEPTED',
  'BERTH 07 HARD-LOCKED',
  'SHIP SYSTEMS INDEXED',
  'STATION TWIN LIVE',
];
if (!reduced) {
  acquisitionStates.forEach((text, index) => setTimeout(() => { acquisitionText.textContent = text; }, 380 + index * 440));
} else {
  acquisitionText.textContent = acquisitionStates.at(-1);
}

let dragging = false;
let lastX = 0;
canvas.addEventListener('pointerdown', (event) => {
  dragging = true;
  lastX = event.clientX;
  canvas.setPointerCapture(event.pointerId);
  canvas.classList.add('is-dragging');
});
canvas.addEventListener('pointermove', (event) => {
  if (!dragging) return;
  const delta = event.clientX - lastX;
  lastX = event.clientX;
  mount.rotateBy(delta * .008);
});
canvas.addEventListener('pointerup', (event) => {
  dragging = false;
  canvas.releasePointerCapture(event.pointerId);
  canvas.classList.remove('is-dragging');
});
canvas.addEventListener('wheel', (event) => {
  event.preventDefault();
  mount.zoomBy(-Math.sign(event.deltaY) * .08);
}, { passive: false });

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  modeNodes.forEach((node) => node.removeAttribute('aria-current'));
  world.dataset.mode = 'berth';
  modeSignal.querySelector('span').textContent = 'STATION TWIN';
  modeSignal.querySelector('strong').textContent = 'BERTH OVERVIEW';
  modeSignal.querySelector('small').textContent = 'Select a station system or operate a service connection';
  modeTrace.innerHTML = '';
  canvas.focus?.();
});

addEventListener('pagehide', () => {
  if (crownFrame) cancelAnimationFrame(crownFrame);
  clearTimeout(receiptTimer);
  mount.dispose();
}, { once: true });
