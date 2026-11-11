// Read-only intermission handoff from the physical Fortify owner. A depleted
// emplacement should be noticed before launch, without buying service for the pilot.
import { SWARM_FORTIFY_DEVICES, swarmFortifySocket } from '../data/swarmFortify.js';

const eligible = run => run?.kind === 'survival' && run.ruleset === 'swarm'
  && ['draft', 'refit'].includes(run.phase) && Number.isInteger(run.wave) && run.wave >= 1;
const count = value => Number.isSafeInteger(value) && value >= 0;

export function fortifyReadiness(model) {
  const fallback = { label: 'Fortify the field', detail: 'Build or service your field devices.' };
  if (!model || !Array.isArray(model.structures)) return fallback;
  const rows = model.structures.filter(row => row && SWARM_FORTIFY_DEVICES[row.deviceId]);
  const lost = Array.isArray(model.lostDevices) ? model.lostDevices.filter(loss =>
    loss && SWARM_FORTIFY_DEVICES[loss.deviceId] && swarmFortifySocket(loss.socketId)) : [];
  if (!rows.length && !lost.length) return fallback;
  let service = false, restock = false;
  const details = rows.map(row => {
    const parts = [SWARM_FORTIFY_DEVICES[row.deviceId].name];
    if (row.missingEndpoint === true) { parts.push('one endpoint lost'); service = true; }
    else if (row.operational === false) { parts.push('offline'); service = true; }
    if (count(row.ammo) && count(row.ammoMax) && row.ammoMax > 0) {
      parts.push(`${row.ammo} of ${row.ammoMax} shots`);
      if (row.ammo === 0) service = true;
      if (row.ammo < row.ammoMax) {
        restock = true;
        if (count(row.serviceCost)) parts.push(`reload ${row.serviceCost} cr`);
      }
    }
    if (Number.isFinite(row.hull) && Number.isFinite(row.hullMax) && row.hullMax > 0
      && row.hull < row.hullMax) {
      service = true;
      parts.push(`hull ${Math.ceil(Math.max(0, row.hull))} of ${Math.ceil(row.hullMax)}`);
      if (count(row.repairCost) && !row.missingEndpoint) parts.push(`repair ${row.repairCost} cr`);
    }
    return parts.join(', ');
  });
  for (const loss of lost) details.push(`${SWARM_FORTIFY_DEVICES[loss.deviceId].name} lost at ${swarmFortifySocket(loss.socketId).label}`);
  return {
    label: service ? 'Fortify · service needed' : lost.length ? `Fortify · ${lost.length} lost` : restock ? 'Fortify · restock'
      : `Fortify · ${rows.length} device${rows.length === 1 ? '' : 's'}`,
    detail: `${details.join('. ')}. Open Fortify to inspect, service or rebuild; purchases are optional.`,
  };
}

let sequence = 0;

/** Only the visible shop's matching owner reply may replace its neutral link. */
export function bindFortifyReadiness(screen, ctx) {
  screen._fortifyReadinessOff?.();
  screen._fortifyReadinessOff = null;
  const button = screen._fortifyBtn, bus = ctx?.bus;
  if (!button) return;
  const paint = model => {
    const copy = fortifyReadiness(model);
    button.textContent = copy.label;
    button.setAttribute('title', copy.detail);
    button.setAttribute('aria-label', `${copy.label}. ${copy.detail}`);
  };
  paint(null);
  if (!eligible(ctx.state?.run) || !bus?.on || !bus?.emit) return;
  const wave = ctx.state.run.wave, seed = ctx.state.run.seed, phase = ctx.state.run.phase;
  const requestId = `fortify-preparation-${++sequence}`;
  let active = true, token = null;
  const current = () => active && eligible(ctx.state?.run)
    && ctx.state.run.wave === wave && ctx.state.run.seed === seed && ctx.state.run.phase === phase;
  const accepts = model => current() && model?.wave === wave && model.phase === phase
    && model.runToken != null && Array.isArray(model.structures);
  const offs = [
    bus.on('swarm:fortifyState', model => {
      if (model?.requestId !== requestId || !accepts(model)) return;
      token = model.runToken;
      paint(model);
    }),
    bus.on('swarm:fortifyBuildResolved', receipt => {
      if (token == null || receipt?.runToken !== token || !accepts(receipt.readModel)
        || receipt.readModel.runToken !== token) return;
      paint(receipt.readModel);
    }),
  ];
  const dispose = () => {
    active = false;
    for (const off of offs) off?.();
    paint(null);
  };
  offs.push(bus.on('run:started', dispose), bus.on('run:ended', dispose));
  screen._fortifyReadinessOff = dispose;
  bus.emit('swarm:fortifyStateRequested', { requestId });
}
