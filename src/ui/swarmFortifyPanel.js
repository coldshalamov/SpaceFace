import { SWARM_FORTIFY_DEVICES } from '../data/swarmFortify.js';
import { injectOrreryScreens } from './orrery/screenLayouts.js';
import { injectSwarmFortifyLayouts } from './orrery/swarmFortifyLayouts.js';
import { cue } from './kit/index.js';

let nextRequestId = 1;
const SVG_NS = 'http://www.w3.org/2000/svg';
const reasons = {
  occupied: 'That position already holds a structure.',
  socket_blocked: 'That position is occupied or physically obstructed. Choose another position.',
  phase_closed: 'Construction is available between waves.',
  run_changed_during_purchase: 'The run changed before construction could commit.',
  blocked: 'That approach is obstructed. Choose another position.',
  placement_blocked: 'That approach is obstructed. Choose another position.',
  credits: 'The run purse cannot cover that purchase.',
  insufficient_funds: 'The run purse cannot cover that purchase.',
  pilot_clearance: 'The pilot is too close. Choose another position.',
  phase: 'Construction is available between waves.',
  run_changed: 'The run changed before construction could commit.',
  spawn_failed: 'The structure could not be placed. No credits were spent.',
};
function element(doc, tag, className, text) {
  const node = doc.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}
function svg(doc, tag, attributes) {
  const node = doc.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  return node;
}
function deviceSlots(model, deviceId) {
  return (model.sockets || []).map(slot => ({ ...slot, ...(slot.devices?.[deviceId] || {}) }));
}
export function fortifyAvailable(run) {
  return run?.kind === 'survival' && run.ruleset === 'swarm' && run.wave >= 1
    && (run.phase === 'draft' || run.phase === 'refit');
}

// The paused armory reads worker receipts. It never debits the purse or places a body itself.
export const crucibleFortifyScreen = {
  id: 'crucibleFortify', data: { locked: true },
  mount(root, ctx) {
    this._ctx = ctx; this._root = root; this._doc = root.ownerDocument || globalThis.document;
    this._shown = false; this._deviceId = 'gravity_beacon'; this._socketId = null;
    this._model = null; this._pending = null; this._queryId = null; this._offs = [];
    root.replaceChildren();
    root.classList.add('k-screen', 'k-screen--stage', 'sf-crucible', 'sf-crucible-fortify', 'orr-crucible');
    root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-labelledby', 'sf-fortify-title'); root.dataset.stamp = 'SWARM / FORTIFY';
    injectOrreryScreens(); injectSwarmFortifyLayouts(this._doc);
    const make = (tag, cls, text) => element(this._doc, tag, cls, text);
    const title = make('header', 'k-title');
    const heading = make('h1', 'k-display k-t-title', 'Fortify the field'); heading.id = 'sf-fortify-title';
    this._balance = make('p', 'k-sentence sf-fortify-balance', 'Reading the run purse…');
    title.append(heading, make('p', 'k-sentence', 'Build while paused. Your first defense establishes three fixed approaches. Defenses remain between waves and can be destroyed.'), this._balance);
    const layout = make('section', 'sf-fortify-layout'); layout.dataset.sfScroll = 'fortify';
    const plan = make('section', 'sf-fortify-plan'); plan.setAttribute('aria-label', 'Arena construction positions');
    this._map = svg(this._doc, 'svg', { viewBox: '-560 -560 1120 1120', role: 'img', 'aria-label': 'Live paused field: physical obstacles, defenses, approach corridors and selected device reach' });
    this._sockets = make('div', 'sf-fortify-sockets');
    this._sockets.setAttribute('role', 'group'); this._sockets.setAttribute('aria-label', 'Construction position');
    this._position = make('p', 'k-sentence sf-fortify-position', '');
    plan.append(this._map, this._sockets, this._position);
    const shelf = make('section', 'sf-fortify-shelf'); shelf.dataset.sfScroll = 'fortify-shelf';
    shelf.setAttribute('aria-label', 'Construction devices'); this._deviceButtons = new Map();
    for (const device of Object.values(SWARM_FORTIFY_DEVICES)) {
      const button = make('button', 'sf-fortify-device'); button.type = 'button'; button.dataset.deviceId = device.id;
      button.setAttribute('aria-pressed', String(device.id === this._deviceId));
      button.append(make('strong', '', device.name), make('span', 'k-t-fine', device.cost + ' cr'), make('small', '', device.description));
      button.addEventListener('click', () => { this._deviceId = device.id; this._paint(); });
      this._deviceButtons.set(device.id, button); shelf.appendChild(button);
    }
    this._structures = make('section', 'sf-fortify-state'); shelf.appendChild(this._structures); layout.append(plan, shelf);
    const foot = make('footer', 'k-foot'); this._build = make('button', 'k-word k-word--emph sf-fortify-build', 'Choose a position');
    this._build.type = 'button'; this._build.disabled = true;
    this._build.addEventListener('click', () => this._submit('swarm:fortifyBuildRequested', { deviceId: this._deviceId, socketId: this._socketId }));
    const close = make('button', 'k-word sf-fortify-close', 'Return to armory'); close.type = 'button'; this._close = close;
    close.addEventListener('click', () => ctx.bus.emit('ui:popScreen', {}));
    this._note = make('p', 'k-sentence sf-fortify-receipt', 'Choose a device, then a field position.');
    this._note.setAttribute('role', 'status'); this._note.setAttribute('aria-live', 'polite');
    foot.append(this._build, close, this._note); root.append(title, layout, foot);
    root.addEventListener('keydown', event => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault(); event.stopPropagation(); close.click();
    });
    this._offs.push(ctx.bus.on('swarm:fortifyState', model => {
      if (!this._shown || model?.requestId !== this._queryId) return;
      this._model = model; this._paint();
    }));
    this._offs.push(ctx.bus.on('swarm:fortifyBuildResolved', receipt => this._receive(receipt)));
    root.dataset.kReady = '1';
  },
  onShow() {
    this._shown = true; this._model = null; this._pending = null;
    this._note.textContent = 'Choose a device, then a field position.'; this._paint(); this._requestView();
    this._offCancel?.();
    this._offCancel = this._ctx.bus.on('ui:cancel', () => {
      if (this._ctx?.screenManager?.top() === this.id) this._ctx.bus.emit('ui:popScreen', {});
    });
  },
  onHide() { this._shown = false; this._queryId = null; this._offCancel?.(); this._offCancel = null; },
  refresh(ctx, options) { this._ctx = ctx; if (this._shown && !options?.periodic) this._requestView(); },
  dispose() { this.onHide(); for (const off of this._offs || []) off?.(); this._offs = []; this._ctx = null; this._root = null; },
  _requestView() { this._queryId = nextRequestId++; this._ctx.bus.emit('swarm:fortifyStateRequested', { requestId: this._queryId }); },
  _submit(type, payload) {
    if (this._pending || !this._model || (type === 'swarm:fortifyBuildRequested' && this._build.disabled)) return;
    const requestId = nextRequestId++; this._pending = requestId;
    this._note.textContent = 'Settling the request…'; this._paint();
    const request = { ...payload, requestId, runToken: this._model.runToken };
    if (type === 'swarm:fortifyBuildRequested') this._ctx.bus.emit('swarm:fortifyBuildRequested', request);
    else if (type === 'swarm:fortifyRepairRequested') this._ctx.bus.emit('swarm:fortifyRepairRequested', request);
    else if (type === 'swarm:fortifyReloadRequested') this._ctx.bus.emit('swarm:fortifyReloadRequested', request);
  },
  _receive(receipt) {
    if (!this._shown || receipt?.requestId !== this._pending) return;
    this._pending = null;
    if (receipt.runToken !== this._model?.runToken) {
      this._note.textContent = 'The run changed before that request completed.'; this._requestView(); return;
    }
    this._note.textContent = receipt.accepted === true
      ? (receipt.serviced ? 'Turret rearmed and ready.' : receipt.repaired ? 'Structure repaired and ready.'
        : receipt.modeActivated ? 'Structure placed. Future waves enter from three fixed approaches.'
        : 'Structure placed. It will work in the next wave.')
      : reasons[receipt.reason] || 'Construction refused. No credits were spent; choose another position.';
    cue(receipt.accepted === true ? 'confirm' : 'deny');
    if (receipt.readModel) { this._model = receipt.readModel; this._paint(); } else this._requestView();
  },
  _paint() {
    const model = this._model;
    for (const [id, button] of this._deviceButtons) button.setAttribute('aria-pressed', String(id === this._deviceId));
    if (!model) { this._build.disabled = true; return; }
    const active = this._doc.activeElement;
    const focusSocket = this._root.contains(active) ? active?.dataset?.socketId : null;
    const focusRepair = this._root.contains(active) ? active?.dataset?.repairId : null;
    this._balance.textContent = 'Run purse · ' + Math.max(0, Math.floor(model.credits || 0)) + ' cr';
    const slots = deviceSlots(model, this._deviceId);
    if (!slots.some(slot => slot.id === this._socketId)) this._socketId = slots.find(slot => !slot.blocked && !slot.occupied)?.id || slots[0]?.id || null;
    this._sockets.replaceChildren();
    for (let index = 0; index < slots.length; index++) {
      const slot = slots[index];
      const button = element(this._doc, 'button', 'k-word k-word--fine', (index + 1) + ' · ' + (slot.label || slot.id).replace(' corridor', ''));
      button.type = 'button'; button.dataset.socketId = slot.id; button.setAttribute('aria-pressed', String(slot.id === this._socketId));
      button.title = slot.occupied ? 'Structure already placed' : slot.blocked ? 'Physical approach obstructed' : 'Select construction position';
      button.addEventListener('click', () => { this._socketId = slot.id; this._paint(); }); this._sockets.appendChild(button);
    }
    const device = SWARM_FORTIFY_DEVICES[this._deviceId]; const selected = slots.find(slot => slot.id === this._socketId);
    this._position.textContent = !selected ? 'No construction position is available.'
      : selected.occupied ? 'Position ' + (slots.indexOf(selected) + 1) + ' is occupied. Choose another position to build.'
      : selected.blocked ? reasons[selected.reason] || 'Position ' + (slots.indexOf(selected) + 1) + ' is obstructed. Choose another position to build.'
      : 'Position ' + (slots.indexOf(selected) + 1) + ' · clear physical approach.';
    this._build.textContent = selected ? 'Build ' + device.name + ' · ' + device.cost + ' cr' : 'No construction position available';
    this._build.disabled = !!this._pending || !selected || selected.blocked || selected.occupied || !(model.credits >= device.cost) || !['draft', 'refit'].includes(model.phase);
    this._paintMap(model, slots); this._structures.replaceChildren(element(this._doc, 'h2', 'k-t-emph', 'In the field'));
    const list = element(this._doc, 'ul');
    if (!model.structures?.length) list.appendChild(element(this._doc, 'li', 'sf-fortify-empty', 'No defenses placed.'));
    for (const structure of model.structures || []) {
      const name = SWARM_FORTIFY_DEVICES[structure.deviceId]?.name || 'Structure';
      let detail = name + ' · ' + Math.max(0, Math.ceil(structure.hull || 0)) + '/' + Math.ceil(structure.hullMax || 0) + ' hull';
      if (Number.isFinite(structure.ammo)) detail += ' · ' + structure.ammo + ' rounds';
      if (structure.heat > 0) detail += ' · ' + Math.ceil(structure.heat) + '% heat';
      const row = element(this._doc, 'li', '', detail);
      if (structure.hull < structure.hullMax && Number.isSafeInteger(structure.repairCost) && structure.repairCost > 0) {
        const repair = element(this._doc, 'button', 'k-word k-word--fine', 'Repair · ' + structure.repairCost + ' cr');
        repair.type = 'button'; repair.dataset.repairId = String(structure.id); repair.disabled = !!this._pending || model.credits < structure.repairCost;
        repair.addEventListener('click', () => { if (!repair.disabled) this._submit('swarm:fortifyRepairRequested', { entityId: structure.entityId }); }); row.appendChild(repair);
      }
      if (Number.isFinite(structure.ammo) && structure.ammo < structure.ammoMax
        && Number.isSafeInteger(structure.serviceCost) && structure.serviceCost > 0) {
        const service = element(this._doc, 'button', 'k-word k-word--fine', 'Rearm · ' + structure.serviceCost + ' cr');
        service.type = 'button'; service.dataset.repairId = 'ammo:' + structure.id;
        service.disabled = !!this._pending || model.credits < structure.serviceCost;
        service.addEventListener('click', () => { if (!service.disabled) this._submit('swarm:fortifyReloadRequested', { entityId: structure.entityId }); });
        row.appendChild(service);
      }
      list.appendChild(row);
    }
    this._structures.appendChild(list);
    if (focusSocket) [...this._sockets.children].find(button => button.dataset.socketId === focusSocket)?.focus();
    else if (focusRepair) {
      const repair = [...this._structures.querySelectorAll('[data-repair-id]')].find(button => button.dataset.repairId === focusRepair);
      (repair || (this._build.disabled ? this._close : this._build)).focus();
    }
  },
  _paintMap(model, slots) {
    this._map.replaceChildren();
    // Match the fixed chase picture and radar: +X reads left, +Z reads up.
    const layer = svg(this._doc, 'g', { transform: 'scale(-1 -1)' });
    this._map.appendChild(layer);
    const origin = model.arena || model.player || { x: 0, z: 0 };
    layer.appendChild(svg(this._doc, 'circle', { cx: 0, cy: 0, r: 430, class: 'sf-fortify-orbit' }));
    for (const body of model.terrain || []) {
      layer.appendChild(svg(this._doc, 'circle', { cx: body.x - origin.x, cy: body.z - origin.z,
        r: body.radius, class: 'sf-fortify-terrain', 'data-body-type': body.type }));
    }
    for (const bearing of [-Math.PI / 2, Math.PI, 0]) {
      const a = bearing + (origin.rotation || 0), x = Math.cos(a), z = Math.sin(a);
      layer.appendChild(svg(this._doc, 'path', { d: `M ${x * 535} ${z * 535} L ${x * 440} ${z * 440} M ${x * 460 - z * 15} ${z * 460 + x * 15} L ${x * 440} ${z * 440} L ${x * 460 + z * 15} ${z * 460 - x * 15}`,
        class: 'sf-fortify-approach' }));
    }
    for (const structure of model.structures || []) {
      const device = SWARM_FORTIFY_DEVICES[structure.deviceId];
      for (const pos of structure.positions || []) layer.appendChild(svg(this._doc, 'circle', {
        cx: pos.x - origin.x, cy: pos.z - origin.z, r: device?.colliderRadius || 12, class: 'sf-fortify-built',
      }));
    }
    const selected = slots.find(slot => slot.id === this._socketId);
    const device = SWARM_FORTIFY_DEVICES[this._deviceId];
    if (selected?.positions?.length) {
      const points = selected.positions.map(pos => ({ x: pos.x - origin.x, z: pos.z - origin.z }));
      const preview = svg(this._doc, 'g', { class: 'sf-fortify-preview', 'data-blocked': !!selected.blocked });
      const radius = device.field?.radius || (device.id === 'kinetic_turret' ? device.effect.range : null);
      if (radius) preview.appendChild(svg(this._doc, 'circle', { cx: points[0].x, cy: points[0].z, r: radius, class: 'sf-fortify-reach' }));
      if (points.length === 2) preview.appendChild(svg(this._doc, 'path', {
        d: `M ${points[0].x} ${points[0].z} L ${points[1].x} ${points[1].z}`, class: 'sf-fortify-pair',
      }));
      for (const point of points) preview.appendChild(svg(this._doc, 'circle', {
        cx: point.x, cy: point.z, r: device.colliderRadius, class: 'sf-fortify-footprint',
      }));
      layer.appendChild(preview);
    }
    for (let index = 0; index < slots.length; index++) {
      const slot = slots[index];
      const x = Number(slot.x) - Number(origin.x); const z = Number(slot.z) - Number(origin.z);
      if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
      layer.appendChild(svg(this._doc, 'path', { d: 'M 0 0 L ' + x + ' ' + z, class: 'sf-fortify-link' }));
      layer.appendChild(svg(this._doc, 'circle', { cx: x, cy: z, r: 40, class: 'sf-fortify-point', 'data-selected': slot.id === this._socketId, 'data-blocked': !!slot.blocked, 'data-occupied': !!slot.occupied }));
      const label = svg(this._doc, 'text', { x, y: z, transform: `rotate(180 ${x} ${z})`, 'data-occupied': !!slot.occupied }); label.textContent = String(index + 1); layer.appendChild(label);
    }
    if (model.player) {
      const x = model.player.x - origin.x; const z = model.player.z - origin.z;
      if (Number.isFinite(x) && Number.isFinite(z)) layer.appendChild(svg(this._doc, 'path', { d: 'M ' + (x + 12) + ' ' + z + ' L ' + (x - 9) + ' ' + (z - 8) + ' L ' + (x - 9) + ' ' + (z + 8) + ' Z', class: 'sf-fortify-pilot', transform: 'rotate(' + ((model.player.rotation || 0) * 180 / Math.PI) + ' ' + x + ' ' + z + ')' }));
    }
  },
};
