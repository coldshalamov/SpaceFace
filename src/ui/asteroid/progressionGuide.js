// Read-only next actions, derived from the live mine and factory. No tutorial save FSM:
// rebuilding, returning to a claim, or importing materials immediately changes the advice.
import { planSiteVisit } from '../../systems/siteIndustryPlanner.js';

export function miningNextStep({ drill, site, projection, cargo = {}, build = false,
  movementLabel = 'WASD / arrows', scanLabel = 'C', coreMissing = null, extractorMissing = null } = {}) {
  if (!drill) return null;
  const step = (id, title, detail, action = null, label = null, selection = null) =>
    ({ id, title, detail: build && action === 'build'
      ? `${detail} Click or Enter places; B returns to driving.` : detail, action, label, selection });
  const machines = projection?.machines || site?.machines || [];
  const core = machines.find(m => m.defId === 'sm_massline_core');
  if (cargo.capVolume > 0 && cargo.usedVolume >= cargo.capVolume) {
    return step('hold-full', 'Make room in your hold',
      'Leave and sell cargo at a station, or transfer feedstock into your connected site.',
      site ? 'site' : 'leave', site ? 'Open transfers' : 'Leave asteroid');
  }
  if (drill.overheated || drill.energyDepleted) return step('recover', 'Let the rig recover',
    'Release the direction to cool and recharge. Survey the nearby rock while you recover.', 'scan', 'Survey');
  if (!core) {
    if (!build && !(drill.tilesCleared > 1)) return step('bore', 'Cut your first tunnel',
      `Hold ${movementLabel} to drive and bore. Hover a block to inspect it.`, 'help', 'Controls');
    if (!build && !(drill.scan?.serial > 0)) return step('survey', 'Find a face worth keeping',
      `Press ${scanLabel} to survey. Leave ore and sealed gas beside a small bay for future machines.`, 'scan', 'Survey');
    const kit = planSiteVisit('first_claim', { cargo: cargo.items || {}, machines });
    const missing = coreMissing == null ? !kit.ready : Object.keys(coreMissing).length > 0;
    if (missing) return step('kit', 'Bring your first construction kit',
      'Mining earns the cargo to sell. Buy the starter parts at a station; Plan lists only what is still missing.',
      'plan', 'First claim plan', 'first_claim');
    return step('core', 'Stake a reachable bay',
      'Place the Core in a hollow beside the rover. Keep the entrance and a route around each machine clear.',
      'build', 'Place Core', 'sm_massline_core');
  }
  const extractor = machines.find(m => m.defId === 'sm_extractor');
  if (!extractor && (extractorMissing == null
    ? !planSiteVisit('first_claim', { cargo: cargo.items || {}, machines }).ready
    : Object.keys(extractorMissing).length > 0)) return step('extractor-kit', 'Bring the extractor parts',
    'Your Core is saved on this claim. The first-claim plan now lists only the parts still needed for its extractor.',
    'plan', 'Remaining shopping list', 'first_claim');
  if (!extractor) return step('extractor', 'Give the Core a producer',
    'Place an extractor beside unmined ore or silicate. Touching the Core shares power and materials.',
    'build', 'Place extractor', 'sm_extractor');
  const producers = machines.filter(m => m.defId !== 'sm_massline_core');
  const fault = producers.find(m => ['no-geology', 'no-power', 'no-network', 'starved', 'backlogged'].includes(m.status?.state));
  if (fault?.status?.state === 'no-geology') return step('geology', 'Keep a working face',
    'This machine lost its deposit. Dismantle and move it beside intact rock; mining the face removes its supply.', 'build', 'Dismantle', 'remove');
  if (fault?.status?.state === 'no-power' || producers.some(m => m.powerRatio === 0)) return step('power', 'Bring power to the machine',
    'Paint Power Cable through the hollow from the Core to the machine. Cables and lanes can share cells.', 'build', 'Route power', 'power');
  if (fault?.status?.state === 'no-network' || producers.some(m => m.laneKey === null)) return step('lane', 'Join the material network',
    'Paint Material Lane from the Core to the machine. Adjacent machines connect directly; tunnels stay walkable.', 'build', 'Route materials', 'lane');
  if (fault?.status?.state === 'starved') return step('inputs', 'Feed the next process',
    'Choose a recipe in Site. Connect its suppliers by material lane, or transfer missing inputs from your hold.', 'site', 'Recipes and transfers');
  if (fault?.status?.state === 'backlogged') return step('storage', 'Make room for production',
    'Take stored goods into your hold. Powered Cargo Ports add lane capacity; couriers need pods and goods set to Ship.', 'site', 'Collect output');
  const stocked = (projection?.lanes || []).some(l => Object.values(l.store || {}).some(n => n >= 1));
  if (stocked && !machines.some(m => m.defId === 'sm_refinery')) return step('collect', 'Your deposit is paying again',
    'Take output from Site → Rover transfer. Keep the source blocks intact: the extractor can use them indefinitely.', 'site', 'Collect output');
  const refining = machines.some(m => m.defId === 'sm_refinery');
  const fabricating = machines.some(m => m.defId === 'sm_fabricator');
  if (!refining) return step('refine', 'Turn ore into building materials',
    'The extractor keeps working while you explore. Next: smelt iron, fuse silica and tap sealed gas for more power.', 'plan', 'Plan refining', 'refining');
  if (!fabricating) return step('fabricate', 'Add your first production chain',
    'Feed refined metal and silica into electronics. Keep intermediate goods on Hold so the next machine can use them.', 'plan', 'Plan fabrication', 'courier');
  return step('expand', 'Build the next link',
    'Make circuitry and fuel cells, then controllers for more machines. Import ores this asteroid lacks.', 'plan', 'Plan construction supplies', 'construction');
}
