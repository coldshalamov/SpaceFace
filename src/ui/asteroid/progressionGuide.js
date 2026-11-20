// Read-only next actions, derived from the live mine and factory. No tutorial save FSM:
// rebuilding, returning to a claim, or importing materials immediately changes the advice.
import { planSiteVisit } from '../../systems/siteIndustryPlanner.js';
import { SITE_BALANCE, SITE_MACHINE_BY_ID, SITE_RECIPE_BY_ID } from '../../data/sites.js';
import { machineCapability } from '../../systems/siteProduction.js';
import { commodityDisplayName } from '../commodityNames.js';

/** Find a walkable starter seat. The first extractor shares power and storage with the Core. */
export function findStarterBay({ drill, site, defId, canInstall }) {
  const core = site?.machines?.find(m => m.defId === 'sm_massline_core');
  const extractor = defId === 'sm_extractor';
  const origin = extractor ? core : drill?.avatar;
  if (!drill?.field || !origin) return null;
  const def = SITE_MACHINE_BY_ID.get(defId);
  let best = null;
  let bestRate = 0;
  for (const [dc, dr] of [[0, 1], [1, 0], [-1, 0], [0, -1]]) {
    const col = origin.col + dc;
    const row = origin.row + dr;
    if (drill.field?.[col]?.[row]?.type !== 'empty') continue;
    const check = canInstall({ asteroidId: drill.asteroidId, defId, col, row, preview: true });
    if (!check?.ok || check.sealsReturn) continue;
    if (!extractor) return { col, row };
    const capability = machineCapability(def, check.profile, def.modes?.[0]);
    const rate = Object.values(capability.outputsPerMin).reduce((sum, n) => sum + n, 0);
    if (rate > bestRate) {
      bestRate = rate;
      best = { col, row };
    }
  }
  return best;
}

export function miningNextStep({ drill, site, projection, cargo = {}, build = false,
  movementLabel = 'WASD / arrows', scanLabel = 'C', firstTunnel = undefined,
  coreMissing = null, extractorMissing = null } = {}) {
  if (!drill) return null;
  const step = (id, title, detail, action = null, label = null, selection = null) =>
    ({ id, title, detail: build && action === 'build'
      ? `${detail} Click or Enter places. B returns to driving.` : detail, action, label, selection });
  const machines = projection?.machines || site?.machines || [];
  const core = machines.find(m => m.defId === 'sm_massline_core');
  const kit = !core && planSiteVisit('first_claim', { cargo: cargo.items || {}, machines });
  const canStake = core || (coreMissing == null ? kit.ready : Object.keys(coreMissing).length === 0);
  if (!canStake && cargo.capVolume > 0 && cargo.usedVolume >= cargo.capVolume) {
    return step('hold-full', 'Make room in your hold',
      'Leave and sell cargo at a station, or transfer feedstock into your connected site.',
      site ? 'site' : 'leave', site ? 'Open transfers' : 'Leave asteroid');
  }
  if (drill.overheated || drill.energyDepleted) return step('recover', 'Let the rig recover',
    'Release the direction to cool and recharge. Survey the nearby rock while you recover.', 'scan', 'Survey');
  if (!core) {
    if (!build && !(drill.tilesCleared > 1)) return step('bore', 'Cut your first tunnel',
      firstTunnel === undefined
        ? `Hold ${movementLabel} to drive and bore. Hover a block to inspect it.`
        : firstTunnel
          ? `Hold ${firstTunnel.label} to drive ${firstTunnel.direction} and bore. Hover a block to inspect it.`
          : 'Choose a reachable face. Open Controls for driving keys; hover a block to inspect it.',
      'help', 'Controls');
    if (!build && !(drill.scan?.serial > 0)) return step('survey', 'Find a face worth keeping',
      `${scanLabel === 'UNBOUND' ? 'Use Survey to read the nearby rock.' : `Press ${scanLabel} to survey.`} Leave ore and sealed gas beside a small bay for future machines.`,
      'scan', 'Survey');
    if (!canStake) return step('kit', 'Bring your first construction kit',
      'Mining earns the cargo to sell. Buy the starter parts at a station; Plan lists only what is still missing.',
      'plan', 'First claim plan', 'first_claim');
    return step('core', 'Stake a reachable bay',
      'Choose a side bay beside the rover. Leave a clear tunnel back to the shaft.',
      'build', 'Find Core bay', 'sm_massline_core');
  }
  const extractor = machines.find(m => m.defId === 'sm_extractor');
  if (!extractor && (extractorMissing == null
    ? !planSiteVisit('first_claim', { cargo: cargo.items || {}, machines }).ready
    : Object.keys(extractorMissing).length > 0)) return step('extractor-kit', 'Bring the extractor parts',
    'Your Core is saved on this claim. The first-claim plan now lists only the parts still needed for its extractor.',
    'plan', 'Remaining shopping list', 'first_claim');
  if (!extractor) return step('extractor', 'Give the Core a producer',
    'Find a bay that touches the Core and intact rock. The extractor shares power and storage with the Core.',
    'build', 'Find extractor bay', 'sm_extractor');
  const producers = machines.filter(m => m.defId !== 'sm_massline_core');
  const hasFault = state => producers.some(m => m.status?.state === state);
  const name = m => SITE_MACHINE_BY_ID.get(m.defId)?.short || 'machine';
  const route = (id, title, detail, label, kind, machineId, targetKeys) => ({
    ...step(id, title, detail, 'route', label), route: { kind, machineId, targetKeys },
  });
  const bay = (id, title, detail, label, machine, kit) => ({
    ...step(id, title, detail, 'factory-bay', label, machine), kit,
  });
  const port = machines.find(m => m.defId === 'sm_cargo_port');
  const fleet = projection?.fleet || site?.fleet;
  const fabricator = machines.find(m => m.defId === 'sm_fabricator');
  const firstDelivery = port && fleet && !(fleet.delivered > 0);
  if (firstDelivery && (fleet.inFlightCount > 0 || fleet.inFlight?.length)) {
    return step('first-flight', 'Your first courier is in flight',
      'Return to flight to let the courier reach the station. Site shows the delivery and credit receipt.', 'leave', 'Return to flight');
  }
  const readyUnits = projection?.courier?.readyUnits;
  if (firstDelivery && readyUnits > 0) {
    return step('launch-pod', 'Your first courier is ready',
      `The port has a pod and ${readyUnits} units of cargo ready. Return to flight to send it to the station.`, 'leave', 'Return to flight');
  }
  if (hasFault('no-geology')) return step('geology', 'Keep a working face',
    'This machine lost its deposit. Dismantle and move it beside intact rock; mining the face removes its supply.', 'build', 'Dismantle', 'remove');
  const dark = producers.find(m => m.capability?.powerDraw > 0 && m.powerRatio === 0);
  if (dark) {
    const sources = (projection?.power || []).filter(net => net.gen > net.draw).map(net => net.key);
    if (sources.length) return route('power', `Power the ${name(dark).toLowerCase()}`,
      'Trace a cable to a generator with spare power through the open tunnels.', 'Route power', 'power', dark.id, sources);
    return step('power-capacity', 'Add generation',
      `${name(dark)} needs ${dark.capability.powerDraw} MW. A gas tap can turn preserved gas into more power.`,
      'plan', 'Plan gas power', 'refining');
  }
  if (hasFault('no-network')) return step('lane', 'Join the material network',
    'Paint Material Lane from the Core to the machine. Adjacent machines connect directly; tunnels stay walkable.', 'build', 'Route materials', 'lane');
  const lanes = projection?.lanes || [];
  if (firstDelivery && fleet.podsReady > 0 && port.powerRatio > 0 && port.laneKey != null) {
    const shipsFrom = lane => Object.entries(lane.store || {}).some(([id, qty]) => (
      !projection?.exportOff?.[id] && qty - (projection?.reserves?.[id] || 0) > 1e-9
    ));
    const loading = lanes.some(lane => lane.key === port.laneKey && shipsFrom(lane));
    const sourceLanes = lanes.filter(lane => lane.key !== port.laneKey && shipsFrom(lane)).map(lane => lane.key);
    if (!loading && sourceLanes.length) {
      return route('cargo-lane', 'Bring stock to the cargo port',
        'Join a lane holding goods set to Ship so the powered port can load them.', 'Route cargo', 'lane', port.id, sourceLanes);
    }
    const capacity = fleet.podCapacity || SITE_BALANCE.podCapacity;
    const staged = Math.min(capacity, Math.floor(projection?.courier?.stagedUnits || 0));
    return step('first-pod', 'Load your first shipment',
      loading
        ? `${staged} of ${capacity} units staged. The port is loading from its lane while you work.`
        : 'Set a surplus good to Ship, then supply it to the port’s material lane.',
      'site', 'Open shipping', { section: loading ? 'couriers' : 'exports' });
  }
  const hungry = producers.find(m => m.status?.state === 'starved' && m.status.limit?.startsWith('input:')
    && !Object.values(m.status.ratePerMin || {}).some(rate => rate > 0));
  if (hungry) {
    const id = hungry.status.limit.slice('input:'.length);
    const good = commodityDisplayName(id);
    const local = lanes.find(lane => lane.key === hungry.laneKey);
    const alternative = hungry.defId === 'sm_refinery' && SITE_MACHINE_BY_ID.get(hungry.defId).modes
      .filter(mode => mode !== hungry.mode).map(mode => SITE_RECIPE_BY_ID.get(mode))
      .find(recipe => Object.entries(recipe.inputs).every(([inputId, qty]) => (local?.store?.[inputId] || 0) >= qty));
    if (alternative) return step('recipe', 'Refine what this lane holds',
      `The refinery can run ${alternative.name} with its current stock. You can also bring in ${good.toLowerCase()}.`,
      'site', 'Choose refinery recipe', { section: 'modes', machineId: hungry.id });
    const suppliers = new Set(producers.filter(m => m.powerRatio > 0 && (m.capability?.outputsPerMin?.[id] > 0
      || m.status?.ratePerMin?.[id] > 0))
      .map(m => m.laneKey));
    const sources = lanes.filter(lane => lane.key !== hungry.laneKey
      && (lane.store?.[id] > 0 || suppliers.has(lane.key))).map(lane => lane.key);
    if (sources.length) return route('feed', `Feed the ${name(hungry).toLowerCase()}`,
      `Send ${good.toLowerCase()} from a supplying lane through the open tunnels.`, 'Route feedstock', 'lane', hungry.id, sources);
    return step('inputs', `Supply ${good.toLowerCase()}`,
      `${name(hungry)} is waiting for this feedstock. Transfer it from the rover or choose another recipe.`,
      'site', 'Open transfers', { section: 'transfer', machineId: hungry.id, goodId: id });
  }
  if (hasFault('backlogged')) return step('storage', 'Make room for production',
    'Take stored goods into your hold. Powered Cargo Ports add lane capacity; couriers need pods and goods set to Ship.', 'site', 'Collect output');
  if (firstDelivery && fleet.podsReady <= 0) {
    if (!fabricator) return bay('pods', 'Build a replacement courier',
      'Add a fabricator that can use the lane’s electronics, refined metal and silica.',
      'Find fabricator bay', 'sm_fabricator', 'courier');
    return step('pods', 'Build a replacement courier',
      'Set the fabricator to Assemble courier pod and choose a pod target above zero. Keep its feedstocks on Hold.',
      'site', 'Open machine modes', { section: 'modes', machineId: fabricator.id });
  }
  const refining = machines.some(m => m.defId === 'sm_refinery');
  if (!refining) return bay('refine', 'Turn ore into building materials',
    'Keep the extractor’s rock faces intact. Collect surplus in Site or keep it on the lane to smelt and fuse.',
    'Find refinery bay', 'sm_refinery', 'refining');
  if (!port) return bay('cargo-port', 'Send your first shipment',
    'Install a cargo port on a powered production lane. It starts with a pod ready to load.',
    'Find cargo port bay', 'sm_cargo_port', 'courier');
  if (!fabricator) return bay('fabricate', 'Add your first production chain',
    'Feed refined metal and purified silica into electronics. A fabricator can also replenish courier pods.',
    'Find fabricator bay', 'sm_fabricator', 'courier');
  return step('expand', 'Build the next link',
    'Make circuitry and fuel cells, then controllers for more machines. Import ores this asteroid lacks.', 'plan', 'Plan construction supplies', 'construction');
}
