// src/ui/screens/automationPanel.js — Automation / passive-fleet screen (ARCHITECTURE §5, spec 09).
// Tabs: Drones / Traders / Outposts / Fleet. Reads state.automation (+ static defs for the
// purchasable catalog). Buy / assign / order buttons emit ui:fleetOrder{shipId,order,targetRef}
// (the automation system is the sole handler — §4.4). Shows passive-income rate + a passive-cap
// bar derived from the active-income reference curve. READ-ONLY on state; emits intents only.
//
// Export: automationScreen  (id 'automation'). No 'three' import.

import { DRONES, TRADERS, OUTPOSTS, AUTO_BALANCE } from '../../data/automation.js';
import { BLUEPRINTS } from '../../data/blueprints.js';
import { COMMODITIES } from '../../data/commodities.js';
import { TECH_NODES } from '../../data/tech.js';
import { droneBayCapacityForState } from '../../systems/automation.js';
import { shipworksStationAccess } from '../../systems/ships.js';
import { escapeHtml } from '../comms.js';
import { enhanceSelects } from '../uiPrimitives.js';
import { MAP_FOCUS, openGalaxyMap } from '../mapAuthority.js';

const DRONE_DISPLAY_ORE_ID = 'cmdty_ore_iron';
const DRONE_DISPLAY_ORE_VALUE = (COMMODITIES.find((c) => c.id === DRONE_DISPLAY_ORE_ID) || {}).basePrice || 28;
const COMMODITY_BY_ID = new Map(COMMODITIES.map((commodity) => [commodity.id, commodity]));
const TECH_BY_ID = new Map(TECH_NODES.map((t) => [t.id, t]));
const FIELD_FACTORY_BLUEPRINTS = BLUEPRINTS.filter((bp) => bp.fieldCraftable === true && bp.outputs.kind === 'commodity');

const PROGRAM_OPTIONS = Object.freeze([
  { value: '', label: 'Manual (mine -> bank)', meta: 'Banks ore in the drone buffer; recall to cash out.' },
  { value: 'mine_to_depot', label: 'Mine -> Haul -> Sell', meta: 'Loops field mining into depot sales through the passive cap.' },
  { value: 'patrol_guard', label: 'Guard Player', meta: 'Keeps the drone close as a defensive escort.' },
  { value: 'scout_report', label: 'Scout -> Report', meta: 'Tests beacon movement and a short overwatch loop.' },
]);

const TABS = [
  { id: 'drones',   label: 'Drones'   },
  { id: 'traders',  label: 'Traders'  },
  { id: 'outposts', label: 'Outposts' },
  { id: 'fleet',    label: 'Fleet'    },
];

export function describeAutomationPurchase(kind, def, state = {}) {
  if (!def) {
    return {
      state: 'missing',
      disabled: true,
      label: 'Unavailable',
      title: 'Select an automation asset to inspect purchase options.',
    };
  }
  const player = (state && state.player) || {};
  const researched = new Set(player.researchedNodes || []);
  const credits = Math.max(0, Number(player.credits) || 0);
  const assetName = prettyLabel(def.id);
  const cost = automationPurchaseCost(kind, def);

  if (kind === 'drone') {
    const tier = playerTierFromState(state);
    if ((def.tier || 1) > tier) {
      const req = techName(droneTierTechId(def.tier));
      return {
        state: 'tier',
        disabled: true,
        label: 'Research ' + req,
        title: assetName + ' requires drone tier ' + def.tier + ', unlocked by ' + req + '.',
      };
    }
    const bay = droneBayCapacityForState(state);
    if (bay.compatibleSlotCount <= 0) {
      return {
        state: 'drone_hull',
        disabled: true,
        label: bay.droneControlResearched ? 'Need L-utility hull' : 'Research + L-utility hull',
        title: bay.droneControlResearched
          ? 'Acquire or switch to a hull with an L utility slot, then fit Drone Bay L before deploying ' + assetName + '.'
          : 'Research Drone Control, then acquire or switch to a hull with an L utility slot and fit Drone Bay L before deploying ' + assetName + '.',
      };
    }
    if (!bay.droneControlResearched) {
      return {
        state: 'drone_tech',
        disabled: true,
        label: 'Research Drone Control',
        title: 'Research Drone Control before fitting Drone Bay L and deploying ' + assetName + '.',
      };
    }
    if (bay.capacity <= 0) {
      return {
        state: 'drone_bay',
        disabled: true,
        label: 'Fit Drone Bay L',
        title: 'Fit a Drone Bay L on the active ship before deploying ' + assetName + '.',
      };
    }
    if (bay.used >= bay.capacity) {
      return {
        state: 'drone_capacity',
        disabled: true,
        label: `Bay full ${bay.used}/${bay.capacity}`,
        title: `Active-ship Drone Bay capacity is full (${bay.used}/${bay.capacity}). Recall a drone or fit more capacity.`,
      };
    }
  } else if (kind === 'trader' && !researched.has('tech_autonomous_fleets')) {
    const req = techName('tech_autonomous_fleets');
    return {
      state: 'tech',
      disabled: true,
      label: 'Research ' + req,
      title: assetName + ' hiring requires ' + req + '.',
    };
  } else if (kind === 'outpost' && !researched.has('tech_outpost_charter')) {
    const req = techName('tech_outpost_charter');
    return {
      state: 'tech',
      disabled: true,
      label: 'Research ' + req,
      title: assetName + ' construction requires ' + req + '.',
    };
  }

  if (credits < cost) {
    const missing = Math.max(0, cost - credits);
    return {
      state: 'funding',
      disabled: true,
      label: 'Need ' + fmtCr(missing) + ' cr',
      title: assetName + ' costs ' + fmtCr(cost) + ' cr. You need ' + fmtCr(missing) + ' more credits.',
    };
  }

  const verb = kind === 'trader' ? 'Hire' : kind === 'outpost' ? 'Build' : 'Buy';
  return {
    state: 'available',
    disabled: false,
    label: verb + ' ' + fmtCr(cost) + ' cr',
    title: verb + ' ' + assetName + ' for ' + fmtCr(cost) + ' cr.',
  };
}

// Pure view model for the outpost flow strip. Production telemetry is authoritative for live
// throughput; authored recipes only explain its ratios. A legacy save with no telemetry stays
// explicitly pending instead of presenting the theoretical rate as observed output.
export function describeOutpostOperation(outpost = {}, def = {}) {
  const production = outpost.production && typeof outpost.production === 'object'
    ? outpost.production
    : null;
  const recipe = (def && def.recipe) || outpost.recipe || null;
  const recipeInputs = recipe && recipe.inputs && typeof recipe.inputs === 'object'
    ? Object.entries(recipe.inputs)
      .filter(([, amount]) => Number(amount) > 0)
      .sort(([left], [right]) => String(left).localeCompare(String(right)))
    : [];
  const recipeOutput = recipe && recipe.output && typeof recipe.output === 'object'
    ? Object.entries(recipe.output).find(([, amount]) => Number(amount) > 0)
    : null;
  const outputPerBatch = recipeOutput ? Number(recipeOutput[1]) : 1;
  const outputGoodId = (production && production.outputGoodId)
    || (recipeOutput && recipeOutput[0])
    || (recipe && recipe.passive ? 'credits' : null);
  const observedActualRate = finiteNumber(production && production.actualRate);
  const requestedRate = finiteNumber(production && production.requestedRate);
  const hasTelemetry = observedActualRate != null && requestedRate != null;
  const rawStatus = String(outpost.status || (production && production.status) || '').toLowerCase();

  let state = 'pending';
  if (rawStatus === 'distressed') state = 'distressed';
  else if (rawStatus === 'raided') state = 'raided';
  else if (rawStatus === 'storage_full') state = 'storage_full';
  else if (rawStatus === 'starved') state = 'starved';
  else if (hasTelemetry && (rawStatus === 'producing' || (production && production.status === 'producing'))) state = 'producing';

  // Distress, raids, and a full output bay stop the line even if their last telemetry sample was
  // recorded while producing. The status is newer authority than that stale sample.
  const lineStopped = state === 'distressed' || state === 'raided' || state === 'storage_full';
  const actualRate = lineStopped ? 0 : hasTelemetry ? observedActualRate : null;
  const limitingGoodId = (production && production.limitingGoodId)
    || firstPositiveKey(production && production.missingByGood);
  const limitingLabel = limitingGoodId ? commodityName(limitingGoodId) : null;

  let statusLabel = 'Awaiting telemetry';
  let detail = 'Production telemetry will appear after the next simulation update.';
  let tone = 'neutral';
  if (state === 'producing') {
    statusLabel = 'Producing';
    detail = recipe && recipe.passive
      ? 'Passive output is flowing into local storage.'
      : 'Feedstock is reaching the line and output is accumulating.';
    tone = 'ok';
  } else if (state === 'starved') {
    statusLabel = limitingLabel ? `Starved: ${limitingLabel}` : 'Starved';
    detail = limitingLabel
      ? `${limitingLabel} feed is below this recipe's current demand.`
      : 'One or more required inputs are not reaching this facility.';
    tone = 'warn';
  } else if (state === 'storage_full') {
    statusLabel = 'Storage full';
    detail = outpost.autoSell
      ? 'Output bay is full; the next autosell cycle will clear room.'
      : 'Output bay is full; manual logistics must clear room.';
    tone = 'warn';
  } else if (state === 'raided') {
    statusLabel = 'Raided';
    detail = 'Production is paused during raid recovery.';
    tone = 'bad';
  } else if (state === 'distressed') {
    statusLabel = 'Distressed';
    detail = 'Production halted while upkeep is unpaid.';
    tone = 'bad';
  }

  const inputs = recipeInputs.map(([goodId, amountPerBatchRaw]) => {
    const amountPerBatch = Number(amountPerBatchRaw);
    const perMinute = actualRate != null && outputPerBatch > 0
      ? roundFlow((actualRate * amountPerBatch / outputPerBatch) * 60)
      : null;
    return {
      goodId,
      label: commodityName(goodId),
      actualPerMin: perMinute,
      short: !!(production && Number(production.missingByGood && production.missingByGood[goodId]) > 0),
    };
  });
  const output = {
    goodId: outputGoodId,
    label: outputGoodId === 'credits' ? 'Credits' : commodityName(outputGoodId),
    actualPerMin: actualRate == null ? null : roundFlow(actualRate * 60),
    targetPerMin: requestedRate == null ? null : roundFlow(requestedRate * 60),
    unit: outputGoodId === 'credits' ? 'cr/min' : 'u/min',
  };
  const capacity = Math.max(0, Number(outpost.storageCap != null ? outpost.storageCap : def.storageCap) || 0);
  const stored = Math.max(0, Number(outpost.storage) || 0);
  const storage = {
    stored: Math.round(stored),
    capacity: Math.round(capacity),
    unit: outputGoodId === 'credits' ? 'cr' : 'u',
    fill: capacity > 0 ? Math.max(0, Math.min(1, stored / capacity)) : 0,
  };

  let feeders;
  if (recipe && recipe.passive) {
    feeders = { state: 'not-needed', count: 0, label: 'No feedstock required', availability: 'Self-contained' };
  } else {
    const feederCount = finiteNumber(production && production.localFeeders);
    if (feederCount == null) {
      feeders = { state: 'pending', count: null, label: 'Feeder telemetry pending', availability: 'Availability pending' };
    } else {
      const count = Math.max(0, Math.floor(feederCount));
      const feederState = state === 'starved' ? 'short' : count > 0 ? 'linked' : 'none';
      feeders = {
        state: feederState,
        count,
        label: count === 1 ? '1 local feeder detected' : `${count || 'No'} local feeders detected`,
        availability: feederState === 'short' ? 'Feed unavailable' : feederState === 'linked' ? 'Feed linked' : 'No feed linked',
      };
    }
  }

  const inputSummary = inputs.length
    ? inputs.map((entry) => `${entry.label} ${spokenRate(entry.actualPerMin, 'units per minute')}`).join(', ')
    : 'no feedstock required';
  const outputSummary = `${output.label} ${spokenComparisonRate(output.actualPerMin, output.targetPerMin, outputGoodId === 'credits' ? 'credits per minute' : 'units per minute')}`;
  const accessibleSummary = `${statusLabel}. Input draw: ${inputSummary}. Output: ${outputSummary}. Storage ${storage.stored} of ${storage.capacity} ${outputGoodId === 'credits' ? 'credits' : 'units'}. ${feeders.label}; ${feeders.availability}. ${detail}`;

  return { state, tone, statusLabel, detail, inputs, output, storage, feeders, accessibleSummary };
}

const STYLE_ID = 'sf-automation-style';
const CSS = `
#sf-automation { width: min(92vw, 1000px); height: min(88vh, 720px); display: flex; flex-direction: column;
  background: linear-gradient(180deg, var(--panel-2), var(--panel)); border: 1px solid var(--panel-edge);
  border-radius: 10px; box-shadow: 0 12px 48px rgba(0,0,0,.6); overflow: hidden; pointer-events: auto; }
#sf-automation .au-head { padding: 12px 18px; border-bottom: 1px solid var(--panel-edge); background: rgba(8,14,26,.7);
  display: flex; flex-direction: column; gap: 10px; }
#sf-automation .au-top { display: flex; align-items: center; justify-content: space-between; }
#sf-automation .au-top-right { display: flex; align-items: center; gap: 14px; }
#sf-automation .au-title { font-size: 1.2em; letter-spacing: .12em; text-transform: uppercase; color: var(--accent);
  text-shadow: 0 0 12px rgba(57,208,255,.5); }
#sf-automation .au-credits { font-family: var(--mono); font-size: .9em; color: var(--energy); }
#sf-automation .au-close { font-family: var(--mono); font-size: .74em; letter-spacing: .08em; text-transform: uppercase;
  padding: 5px 12px; border-radius: 6px; color: var(--ink-dim); }
#sf-automation .au-close:hover { color: #fff; border-color: var(--accent); }
#sf-automation .au-income { display: flex; align-items: center; gap: 14px; font-family: var(--mono); font-size: .8em; }
#sf-automation .au-income .lbl { color: var(--ink-dim); }
#sf-automation .au-income .val { color: var(--accent-2); font-weight: 700; }
#sf-automation .au-capbar { flex: 1; height: 12px; border-radius: 6px; background: rgba(10,18,30,.9);
  border: 1px solid var(--panel-edge); position: relative; overflow: hidden; min-width: 120px; }
#sf-automation .au-capfill { position: absolute; left: 0; top: 0; bottom: 0; width: 0%;
  background: linear-gradient(90deg, var(--accent-2), var(--accent)); transition: width .2s ease; }
#sf-automation .au-captxt { font-family: var(--mono); font-size: .72em; color: var(--ink-dim); white-space: nowrap; }
#sf-automation .au-tabs { display: flex; gap: 4px; }
#sf-automation .au-tab { padding: 6px 16px; font-size: .82em; letter-spacing: .06em; text-transform: uppercase;
  border-radius: 6px 6px 0 0; }
#sf-automation .au-tab.active { background: rgba(57,208,255,.14); border-color: var(--accent); color: #fff;
  text-shadow: 0 0 8px rgba(57,208,255,.5); }
#sf-automation .au-body { flex: 1; overflow-y: auto; padding: 16px 18px; display: flex; flex-direction: column; gap: 18px; }
#sf-automation .au-command { display: grid; grid-template-columns: minmax(230px, 1.08fr) minmax(0, 1.92fr);
  gap: 12px; align-items: stretch; }
#sf-automation .au-next, #sf-automation .au-summary {
  border: 1px solid var(--panel-edge); border-radius: 8px; background: rgba(10,18,30,.62);
  padding: 12px 13px; }
#sf-automation .au-next { display: flex; flex-direction: column; gap: 8px; border-color: rgba(57,208,255,.42); }
#sf-automation .au-kicker { font-family: var(--mono); font-size: .68em; letter-spacing: .13em; text-transform: uppercase;
  color: var(--accent-2); }
#sf-automation .au-next-title { font-size: 1em; color: var(--ink); }
#sf-automation .au-next-body { font-size: .82em; line-height: 1.35; color: var(--ink-dim); }
#sf-automation .au-next-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-top: auto; }
#sf-automation .au-next-meta { font-family: var(--mono); font-size: .72em; color: var(--energy); }
#sf-automation .au-cta { padding: 7px 12px; white-space: nowrap; border-color: var(--accent-2);
  background: rgba(57,208,255,.11); color: var(--ink); }
#sf-automation .au-summary { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 9px; }
#sf-automation .au-metric { min-width: 0; border: 1px solid rgba(57,208,255,.16); border-radius: 6px;
  background: rgba(6,10,18,.5); padding: 8px 9px; }
#sf-automation .au-metric .k { font-family: var(--mono); font-size: .66em; letter-spacing: .09em; text-transform: uppercase;
  color: var(--ink-mute); }
#sf-automation .au-metric .v { margin-top: 4px; font-family: var(--mono); font-size: .88em; color: var(--ink); }
#sf-automation .au-metric .s { margin-top: 3px; font-size: .72em; line-height: 1.25; color: var(--ink-dim); }
#sf-automation .au-note { font-size: .78em; color: var(--ink-dim); line-height: 1.35; margin-top: 6px; }
#sf-automation .au-section-h { font-family: var(--mono); font-size: .76em; letter-spacing: .14em; text-transform: uppercase;
  color: var(--ink-mute); border-bottom: 1px solid var(--panel-edge); padding-bottom: 5px; margin-bottom: 2px; }
#sf-automation .au-card { display: flex; align-items: center; gap: 14px; padding: 11px 13px;
  background: rgba(10,18,30,.6); border: 1px solid var(--panel-edge); border-radius: 8px; }
#sf-automation .au-card .nm { font-size: .96em; color: var(--ink); }
#sf-automation .au-card .meta { font-family: var(--mono); font-size: .76em; color: var(--ink-dim); margin-top: 3px;
  display: flex; gap: 14px; flex-wrap: wrap; }
#sf-automation .au-card .grow { flex: 1; min-width: 0; }
#sf-automation .au-card button { padding: 7px 14px; white-space: nowrap; }
#sf-automation .au-card.au-outpost { align-items: stretch; padding: 13px 14px; }
#sf-automation .au-card.au-outpost > .au-recall { align-self: center; min-height: 38px; }
#sf-automation .au-outpost-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
#sf-automation .au-outpost-head .nm { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
#sf-automation .au-outpost-flow { display: grid; grid-template-columns: minmax(150px, 1fr) 30px minmax(145px, .92fr) 30px minmax(170px, 1.12fr);
  align-items: stretch; gap: 5px; margin-top: 9px; padding: 9px 10px; border-top: 1px solid rgba(57,208,255,.16);
  border-bottom: 1px solid rgba(57,208,255,.16); background: linear-gradient(90deg, rgba(6,10,18,.46), rgba(12,23,36,.58), rgba(6,10,18,.46)); }
#sf-automation .au-flow-node, #sf-automation .au-flow-core { min-width: 0; display: flex; flex-direction: column; justify-content: center; gap: 3px; }
#sf-automation .au-flow-core { padding: 5px 8px; text-align: center; border-left: 1px solid rgba(57,208,255,.2); border-right: 1px solid rgba(57,208,255,.2); }
#sf-automation .au-flow-k { font-family: var(--mono); font-size: .62em; letter-spacing: .13em; text-transform: uppercase; color: var(--ink-mute); }
#sf-automation .au-flow-node strong, #sf-automation .au-flow-core strong { overflow: hidden; text-overflow: ellipsis; color: var(--ink); font-size: .84em; }
#sf-automation .au-flow-core strong { white-space: normal; }
#sf-automation .au-flow-v { font-family: var(--mono); font-size: .72em; color: var(--ink-dim); }
#sf-automation .au-flow-v + .au-flow-v { margin-top: 1px; }
#sf-automation .au-storebar { width: 72px; height: 5px; margin-left: 5px; border-radius: 1px; background: rgba(20,28,42,.9);
  overflow: hidden; display: inline-block; vertical-align: middle; }
#sf-automation .au-storebar > i { display: block; height: 100%; }
#sf-automation .au-flow-link { align-self: center; position: relative; height: 1px; background: rgba(127,152,172,.3); }
#sf-automation .au-flow-link::after { content: ''; position: absolute; right: -1px; top: -3px; width: 6px; height: 6px;
  border-top: 1px solid currentColor; border-right: 1px solid currentColor; transform: rotate(45deg); color: rgba(127,152,172,.65); }
#sf-automation .au-outpost-flow[data-state="producing"] .au-flow-link { background: rgba(98,224,138,.55); box-shadow: 0 0 8px rgba(98,224,138,.14); }
#sf-automation .au-outpost-flow[data-state="producing"] .au-flow-link::after { color: var(--good); }
#sf-automation .au-outpost-flow[data-state="starved"] .au-flow-link,
#sf-automation .au-outpost-flow[data-state="storage_full"] .au-flow-link { background: rgba(255,179,71,.48); }
#sf-automation .au-outpost-flow[data-state="starved"] .au-flow-link::after,
#sf-automation .au-outpost-flow[data-state="storage_full"] .au-flow-link::after { color: var(--warn); }
#sf-automation .au-outpost-flow[data-state="raided"] .au-flow-link,
#sf-automation .au-outpost-flow[data-state="distressed"] .au-flow-link { background: rgba(255,84,112,.44); }
#sf-automation .au-outpost-flow[data-state="raided"] .au-flow-link::after,
#sf-automation .au-outpost-flow[data-state="distressed"] .au-flow-link::after { color: var(--danger); }
#sf-automation .au-operation-status { display: inline-flex; align-items: center; justify-content: center; gap: 6px; }
#sf-automation .au-operation-status::before { content: ''; width: 6px; height: 6px; border: 1px solid currentColor; transform: rotate(45deg); }
#sf-automation .au-operation-status.ok { color: var(--good); }
#sf-automation .au-operation-status.warn { color: var(--warn); }
#sf-automation .au-operation-status.bad { color: var(--danger); }
#sf-automation .au-operation-status.neutral { color: var(--ink-dim); }
#sf-automation .au-operation-reason { margin-top: 7px; font-size: .76em; line-height: 1.35; color: var(--ink-dim); }
#sf-automation .au-outpost-detail { margin-top: 6px; font-size: .74em; color: var(--ink-dim); }
#sf-automation .au-outpost-detail summary { width: fit-content; cursor: pointer; color: var(--accent-2); }
#sf-automation .au-outpost-detail summary:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
#sf-automation .au-outpost-detail .au-detail-row { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 6px; font-family: var(--mono); }
#sf-automation .au-buy { background: rgba(98,224,138,.12); border-color: var(--good); color: #d9ffe7; }
#sf-automation .au-buy:hover { border-color: var(--good); }
#sf-automation .au-order { background: rgba(57,208,255,.1); border-color: var(--accent-2); }
#sf-automation .au-recall { background: rgba(255,84,112,.1); border-color: var(--danger); color: #ffd6dd; }
#sf-automation .au-empty { font-size: .84em; color: var(--ink-mute); font-style: italic; padding: 6px 0; }
#sf-automation .au-pill { font-family: var(--mono); font-size: .68em; padding: 1px 7px; border-radius: 10px;
  border: 1px solid var(--panel-edge); color: var(--ink-dim); }
#sf-automation .au-pill.ok { color: var(--good); border-color: rgba(98,224,138,.5); }
#sf-automation .au-pill.warn { color: var(--warn); border-color: rgba(255,179,71,.5); }
#sf-automation .au-pill.bad { color: var(--danger); border-color: rgba(255,84,112,.5); }
#sf-automation .au-program-row { display:flex; align-items:center; gap:8px; margin-top:6px; }
#sf-automation .au-program-label { font-size:.7em; color:var(--ink-mute); letter-spacing:.04em; text-transform:uppercase; }
#sf-automation .au-program { font-family:var(--mono); font-size:.78em; padding:3px 8px; border-radius:4px;
  background:var(--panel); color:var(--ink); border:1px solid var(--panel-edge); cursor:pointer; }
#sf-automation .au-program-badge { font-family:var(--mono); font-size:.66em; padding:1px 6px; border-radius:8px;
  background:rgba(57,208,255,.12); color:var(--accent); border:1px solid rgba(57,208,255,.4); margin-left:6px; }
#sf-automation .au-minibar { width: 90px; height: 6px; border-radius: 3px; background: rgba(20,28,42,.9);
  overflow: hidden; display: inline-block; vertical-align: middle; }
#sf-automation .au-minibar > i { display: block; height: 100%; background: var(--good); }
#sf-automation .au-locked { font-size: .8em; color: var(--warn); }
@media (max-width: 760px) {
  #sf-automation .au-command { grid-template-columns: 1fr; }
  #sf-automation .au-summary { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  #sf-automation .au-outpost-flow { grid-template-columns: 1fr; }
  #sf-automation .au-flow-link { display: none; }
  #sf-automation .au-flow-node, #sf-automation .au-flow-core { padding: 5px 0; text-align: left; border-left: 0; border-right: 0; }
}
`;

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent = CSS;
  document.head.appendChild(el);
}

export const automationScreen = {
  id: 'automation',
  _ctx: null,
  _root: null,
  _tab: 'drones',
  _els: null,
  _bodySig: '',

  mount(rootEl, ctx) {
    injectStyle();
    this._ctx = ctx;
    this._root = rootEl;
    rootEl.id = 'sf-automation';
    rootEl.innerHTML = `
      <div class="au-head">
        <div class="au-top">
          <div class="au-title">Automation</div>
          <div class="au-top-right">
            <div class="au-credits">CR <span data-cr>0</span></div>
            <button class="au-close" type="button" data-close aria-label="Close operations board">Close</button>
          </div>
        </div>
        <div class="au-income">
          <span class="lbl">PASSIVE</span><span class="val" data-rate>0 cr/min</span>
          <div class="au-capbar"><div class="au-capfill" data-capfill></div></div>
          <span class="au-captxt" data-captxt>cap —</span>
        </div>
        <div class="au-tabs" data-tabs>
          ${TABS.map((t) => `<button class="au-tab" data-tab="${t.id}">${t.label}</button>`).join('')}
        </div>
      </div>
      <div class="au-body" data-body></div>`;
    const body = rootEl.querySelector('[data-body]');
    this._els = {
      cr: rootEl.querySelector('[data-cr]'),
      rate: rootEl.querySelector('[data-rate]'),
      capfill: rootEl.querySelector('[data-capfill]'),
      captxt: rootEl.querySelector('[data-captxt]'),
      body,
      tabs: Array.from(rootEl.querySelectorAll('[data-tab]')),
    };

    rootEl.querySelector('[data-tabs]').addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-tab]');
      if (btn && btn.dataset.tab !== this._tab) { this._tab = btn.dataset.tab; this.refresh(this._ctx, { forceBody: true }); }
    });

    const closeBtn = rootEl.querySelector('[data-close]');
    if (closeBtn) closeBtn.addEventListener('click', () => this._close());

    // one delegated listener for all action buttons in the body
    body.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-act]');
      if (btn) this._onAction(btn.dataset.act, btn.dataset.ref, btn.dataset.kind);
    });
    // V2 §4 / cut-list #28: program dropdown change handler. Selector is tag-agnostic: since the
    // native select was replaced by the sf-select widget the element is a div carrying the same
    // data-act/data-ref/data-kind attributes and a .value property.
    body.addEventListener('change', (e) => {
      const sel = e.target.closest('[data-act="assignProgram"], [data-act="assignOutpostRecipe"]');
      if (!sel) return;
      this._onAction(sel.dataset.act, sel.dataset.ref, sel.dataset.kind, sel.value);
    });
  },

  onShow(ctx) { if (ctx) this._ctx = ctx; this.refresh(this._ctx, { forceBody: true }); },
  onHide() { /* cached DOM retained */ },

  // Pop back to whatever pushed us (pause menu in normal play). Mirrors codex.js's Close; ESC also
  // pops (input.js), but a visible exit keeps the screen self-explanatory (taste bar §7).
  _close() {
    const ctx = this._ctx;
    const ui = ctx && ctx.registry && ctx.registry.get && ctx.registry.get('ui');
    const mgr = (ctx && ctx.screenManager) || (ui && ui.screenManager) || null;
    if (mgr && typeof mgr.popScreen === 'function') { mgr.popScreen(); return; }
    if (ctx && ctx.bus) ctx.bus.emit('ui:popScreen', {});
  },

  refresh(ctx, opts = {}) {
    if (ctx) this._ctx = ctx;
    if (!this._root) return;
    this._syncHeader();
    this._syncTabs();
    const sig = this._bodySignature();
    if (opts.forceBody || sig !== this._bodySig) {
      this._bodySig = sig;
      this._renderBody();
    }
  },

  // ---- internals ----------------------------------------------------------
  _auto() {
    const st = this._ctx.state;
    return st.automation || { drones: [], traders: [], outposts: [], fleet: [], fleetCap: 0,
      meta: {}, accumulators: {}, balance: AUTO_BALANCE };
  },

  _balance() {
    const a = this._auto();
    return a.balance || AUTO_BALANCE;
  },

  // Player progression tier — used to bound the passive cap and gate higher-tier assets.
  // Derived from droneTierCap (set by tech) so the panel matches what the player has unlocked.
  _playerTier() {
    const st = this._ctx.state;
    const cap = (st.player && st.player.droneTierCap) || 1;
    return Math.max(1, Math.min(5, cap));
  },

  _passiveCapPerMin() {
    return passiveCapPerMin(this._ctx.state);
  },

  // current passive rate: sum of net (income - upkeep) across deployed assets.
  _currentRatePerMin() {
    return summarizeAutomationOperations(this._ctx.state).netRatePerMin;
  },

  _syncHeader() {
    const st = this._ctx.state;
    const cr = this._els && this._els.cr;
    if (cr) cr.textContent = ((st.player && st.player.credits) || 0).toLocaleString();

    const rate = this._currentRatePerMin();
    const cap = this._passiveCapPerMin();
    const rateEl = this._els && this._els.rate;
    if (rateEl) rateEl.textContent = `${Math.round(rate)} cr/min`;
    const fill = this._els && this._els.capfill;
    if (fill) fill.style.width = (cap > 0 ? Math.max(0, Math.min(100, (rate / cap) * 100)) : 0).toFixed(1) + '%';
    const captxt = this._els && this._els.captxt;
    if (captxt) captxt.textContent = `cap ${Math.round(cap)} cr/min`;
  },

  _syncTabs() {
    const tabs = (this._els && this._els.tabs) || [];
    for (const b of tabs) {
      b.classList.toggle('active', b.dataset.tab === this._tab);
    }
  },

  _bodySignature() {
    const a = this._auto();
    const st = this._ctx.state;
    const player = st.player || {};
    const summary = summarizeAutomationOperations(st);
    const next = automationNextAction(st);
    const droneBay = droneBayCapacityForState(st);
    const parts = [
      this._tab,
      this._playerTier(),
      player.activeShipIndex || 0,
      Math.round(player.credits || 0),
      Math.round(summary.grossRatePerMin || 0),
      Math.round(summary.netRatePerMin || 0),
      Math.round(summary.upkeepPerMin || 0),
      Math.round(summary.capUsedPct || 0),
      Math.round(summary.totalPassiveEarnedLifetime || 0),
      next && next.tab,
      next && next.title,
      next && next.action,
      next && next.targetRef,
      droneBay.bayCount,
      droneBay.compatibleSlotCount,
      droneBay.droneControlResearched,
      droneBay.capacity,
      droneBay.used,
    ];
    if (this._tab === 'drones') {
      for (const d of a.drones || []) {
        const program = d.program && d.program.templateId;
        parts.push(d.id, d.defId, d.status, Math.round(d.buffer || 0), Math.round(d.fuel || 0), program || '');
      }
    } else if (this._tab === 'traders') {
      const hireUnlocked = (player.researchedNodes || []).includes('tech_autonomous_fleets');
      parts.push(hireUnlocked ? 1 : 0);
      for (const t of a.traders || []) {
        const route = t.route ? `${t.route.from || ''}>${t.route.to || ''}` : '';
        parts.push(t.id, t.defId, t.status, route, Math.round(t.ratePerMin || 0));
      }
    } else if (this._tab === 'outposts') {
      const buildUnlocked = (player.researchedNodes || []).includes('tech_outpost_charter');
      parts.push(buildUnlocked ? 1 : 0);
      for (const o of a.outposts || []) {
        const production = o.production || {};
        parts.push(
          o.id,
          o.defId,
          o.recipeBlueprintId || '',
          o.status,
          o.sectorId || '',
          Math.round(o.storage || 0),
          Math.round(o.storageCap || 0),
          Math.round((o.ratePerMin || 0) * 100) / 100,
          production.status || '',
          production.outputGoodId || '',
          production.actualRate != null ? Math.round(production.actualRate * 1000) / 1000 : '',
          production.requestedRate != null ? Math.round(production.requestedRate * 1000) / 1000 : '',
          production.limitingGoodId || '',
          production.localFeeders != null ? production.localFeeders : '',
          Object.keys(production.missingByGood || {}).sort().join(','),
          o.autoSell ? 1 : 0,
        );
      }
    } else {
      const owned = player.ownedShips || [];
      parts.push(a.fleetCap || 0, owned.length);
      for (const fs of a.fleet || []) {
        parts.push(fs.id, fs.defId, fs.name || '', fs.status, fs.order || '', fs._liveId || '', fs.hullPct != null ? Math.round(fs.hullPct * 100) : '');
      }
      for (let i = 0; i < owned.length; i++) parts.push(i, owned[i] && owned[i].defId, owned[i] && owned[i].customName);
    }
    return parts.join('|');
  },

  _renderBody() {
    const body = this._els && this._els.body;
    if (!body) return;
    const focusSnapshot = captureAutomationBodyFocus(body);
    const openOutpostDetails = this._tab === 'outposts'
      ? new Set(Array.from(body.querySelectorAll('details[data-outpost-detail][open]'), (details) => details.dataset.outpostDetail))
      : new Set();
    const frag = document.createDocumentFragment();
    this._renderOperationsBoard(frag);
    if (this._tab === 'drones') this._renderDrones(frag);
    else if (this._tab === 'traders') this._renderTraders(frag);
    else if (this._tab === 'outposts') this._renderOutposts(frag);
    else this._renderFleet(frag);
    body.replaceChildren(frag);
    // Swap any native <select> (drone program dropdowns) for the styled sf-select widget before
    // focus restore, so the restored focus lands on the live control.
    enhanceSelects(body);
    if (this._tab === 'outposts' && openOutpostDetails.size) {
      for (const details of body.querySelectorAll('details[data-outpost-detail]')) {
        if (openOutpostDetails.has(details.dataset.outpostDetail)) details.open = true;
      }
    }
    restoreAutomationBodyFocus(body, focusSnapshot);
  },

  _section(title) {
    const h = document.createElement('div');
    h.className = 'au-section-h';
    h.textContent = title;
    return h;
  },

  _renderOperationsBoard(frag) {
    const summary = summarizeAutomationOperations(this._ctx.state);
    const next = automationNextAction(this._ctx.state);
    const capLoad = describeAutomationCapLoad(summary);
    const action = next.action || 'switchTab';
    const actionTarget = next.targetRef != null ? next.targetRef : next.tab;
    const actionTitle = next.actionTitle || next.cta;
    const kindAttr = next.kind ? ` data-kind="${escapeHtml(next.kind)}"` : '';
    const wrap = document.createElement('div');
    wrap.className = 'au-command';
    wrap.innerHTML = `
      <div class="au-next">
        <div class="au-kicker">Operations Board</div>
        <div class="au-next-title">${escapeHtml(next.title)}</div>
        <div class="au-next-body">${escapeHtml(next.body)}</div>
        <div class="au-next-row">
          <span class="au-next-meta">${escapeHtml(next.meta)}</span>
          <button class="au-cta" data-focus-key="operations-next:${escapeHtml(action)}:${escapeHtml(actionTarget)}" data-act="${escapeHtml(action)}" data-ref="${escapeHtml(actionTarget)}"${kindAttr} title="${escapeHtml(actionTitle)}" aria-label="${escapeHtml(actionTitle)}">${escapeHtml(next.cta)}</button>
        </div>
      </div>
      <div class="au-summary" aria-label="Automation summary">
        ${metricHtml('Assets', String(summary.activeAssets), `${summary.drones} drones / ${summary.traders} traders / ${summary.outposts} outposts`)}
        ${metricHtml('Net Flow', `${fmtCr(summary.netRatePerMin)} cr/min`, `gross ${fmtCr(summary.grossRatePerMin)} - upkeep ${fmtCr(summary.upkeepPerMin)}`)}
        ${metricHtml('Cap Load', capLoad.label, capLoad.detail)}
        ${metricHtml('Lifetime', `${fmtCr(summary.totalPassiveEarnedLifetime)} cr`, summary.distressedAssets ? `${summary.distressedAssets} distressed` : 'stable')}
      </div>`;
    frag.appendChild(wrap);
  },

  _renderDrones(frag) {
    const a = this._auto();
    const owned = a.drones || [];
    const tier = this._playerTier();
    const droneBay = droneBayCapacityForState(this._ctx.state);

    frag.appendChild(this._section(`Deployed Drones (${owned.length}/${droneBay.capacity})`));
    if (!owned.length) {
      frag.appendChild(emptyEl('No drones deployed. Buy a Mk1 near an asteroid field, then recall it before fuel runs dry to bank ore.'));
    } else {
      for (const d of owned) {
        const def = DRONES.find((x) => x.id === d.defId) || d;
        const buf = d.buffer != null ? d.buffer : 0;
        const bufCap = def.bufferCap || 1;
        const fuelPct = d.fuelMax ? (d.fuel || 0) / d.fuelMax : (def.fuelMax ? (d.fuel || 0) / def.fuelMax : 1);
        // V2 §4 / cut-list #28: program dropdown. Shows the drone's current alphabet template (or
        // Manual for the legacy mine-to-buffer loop). Switching emits assignProgram.
        const curTpl = (d.program && d.program.templateId) || '';
        const programOpts = PROGRAM_OPTIONS
          .map((opt) => `<option value="${escapeHtml(opt.value)}" ${curTpl === opt.value ? 'selected' : ''}>${escapeHtml(opt.label)}</option>`)
          .join('');
        const programBadge = curTpl ? ` <span class="au-program-badge">${escapeHtml(programLabel(curTpl))}</span>` : '';
        const programMeta = curTpl ? programMetaText(curTpl) : PROGRAM_OPTIONS[0].meta;
        const card = document.createElement('div');
        card.className = 'au-card';
        card.innerHTML = `
          <div class="grow">
            <div class="nm">${prettyId(def.id)} ${statusPill(d.status)}${programBadge}</div>
            <div class="meta">
              <span>tier ${def.tier}</span>
              <span>mine ${def.mineRate}/s</span>
              <span>yield ~${fmtCr(estDroneRate(d))}/min gross</span>
              <span>buffer ${Math.round(buf)}/${bufCap} ${miniBar(buf / bufCap)}</span>
              <span>fuel ${miniBar(fuelPct)}</span>
              <span>upkeep ${def.upkeepPerMin}/min</span>
            </div>
            <div class="au-program-row">
              <span class="au-program-label">Program:</span>
              <select class="au-program" data-act="assignProgram" data-ref="${d.id != null ? d.id : def.id}" data-kind="drone">${programOpts}</select>
            </div>
            <div class="au-note">${escapeHtml(programMeta)}</div>
          </div>
          <button class="au-order" data-act="recall" data-ref="${d.id != null ? d.id : def.id}" data-kind="drone">Recall</button>`;
        frag.appendChild(card);
      }
    }

    frag.appendChild(this._section('Drone Bay — Purchase'));
    for (const def of DRONES) {
      const locked = def.tier > tier;
      const purchase = describeAutomationPurchase('drone', def, this._ctx.state);
      const card = document.createElement('div');
      card.className = 'au-card';
      card.innerHTML = `
        <div class="grow">
          <div class="nm">${prettyId(def.id)} ${locked ? `<span class="au-locked">requires drone tier ${def.tier}</span>` : ''}</div>
          <div class="meta">
            <span>mine ${def.mineRate}/s</span>
            <span>yield ~${fmtCr(estDroneRate(def))}/min gross</span>
            <span>buffer ${def.bufferCap}</span>
            <span>range ${def.deployRange}</span>
            <span>upkeep ${def.upkeepPerMin}/min</span>
          </div>
          ${locked ? `<div class="au-note">Research logistics upgrades to unlock this heavier drone tier.</div>` : `<div class="au-note">Best first passive asset: low upkeep, visible in the field, and reversible on recall.</div>`}
        </div>
        <button class="au-buy" data-act="buyDrone" data-ref="${def.id}" title="${escapeHtml(purchase.title)}" aria-label="${escapeHtml(purchase.title)}"${purchase.disabled ? ' disabled' : ''}>${escapeHtml(purchase.label)}</button>`;
      frag.appendChild(card);
    }
  },

  _renderTraders(frag) {
    const a = this._auto();
    const owned = a.traders || [];
    const st = this._ctx.state;
    const hireUnlocked = (st.player && st.player.researchedNodes || []).includes('tech_autonomous_fleets');

    frag.appendChild(this._section(`Active Traders (${owned.length})`));
    if (!owned.length) {
      frag.appendChild(emptyEl(hireUnlocked
        ? 'No NPC traders hired. Hire one to turn known price spreads into capped passive income.'
        : 'No NPC traders hired. Research Autonomous Fleets, then hire haulers for managed trade routes.'));
    } else {
      for (const t of owned) {
        const def = TRADERS.find((x) => x.id === t.defId) || t;
        const card = document.createElement('div');
        card.className = 'au-card';
        const route = t.route ? `${escapeHtml(t.route.from || '?')} → ${escapeHtml(t.route.to || '?')}` : 'idle (assign route)';
        const hot = Math.round((t.hotness || 0) * 100);
        card.innerHTML = `
          <div class="grow">
            <div class="nm">${prettyId(def.id)} ${statusPill(t.status)}</div>
            <div class="meta">
              <span>cargo ${def.cargoVol}u</span>
              <span>cycle ${def.cycleTime}s</span>
              <span>route ${route}</span>
              <span>route heat ${hot}%</span>
              <span>upkeep ${def.upkeepPerMin}/min</span>
            </div>
            <div class="au-note">${t.route ? 'Reroute when heat rises or spreads collapse; escorts lower loss risk on dangerous lanes.' : 'Use Route to assign a profitable two-station lane.'}</div>
          </div>
          <button class="au-order" data-act="assignRoute" data-ref="${t.id != null ? t.id : def.id}" data-kind="trader">Route</button>
          <button class="au-recall" data-act="dismiss" data-ref="${t.id != null ? t.id : def.id}" data-kind="trader">Dismiss</button>`;
        frag.appendChild(card);
      }
    }

    frag.appendChild(this._section('Hire Trader'));
    if (!hireUnlocked) {
      frag.appendChild(lockedEl('NPC trader hiring requires Autonomous Fleets in the logistics tech branch.'));
    }
    for (const def of TRADERS) {
      const purchase = describeAutomationPurchase('trader', def, this._ctx.state);
      const card = document.createElement('div');
      card.className = 'au-card';
      card.innerHTML = `
        <div class="grow">
          <div class="nm">${prettyId(def.id)}</div>
          <div class="meta">
            <span>cargo ${def.cargoVol}u</span>
            <span>cycle ${def.cycleTime}s</span>
            <span>eff ${Math.round(def.tradeEff * 100)}%</span>
            <span>loss/cycle ${Math.round(def.baseLossPerCycle * 100)}%</span>
            <span>upkeep ${def.upkeepPerMin}/min</span>
          </div>
          <div class="au-note">${hireUnlocked ? 'Auto-picks a profitable route now; use Route later to reset heat and find a fresh spread.' : 'Unlocks after Drone Swarm, when the player has seen enough logistics to manage risk.'}</div>
        </div>
        <button class="au-buy" data-act="hireTrader" data-ref="${def.id}" title="${escapeHtml(purchase.title)}" aria-label="${escapeHtml(purchase.title)}"${purchase.disabled ? ' disabled' : ''}>${escapeHtml(purchase.label)}</button>`;
      frag.appendChild(card);
    }
  },

  _renderOutposts(frag) {
    const a = this._auto();
    const owned = a.outposts || [];
    const st = this._ctx.state;
    const buildUnlocked = (st.player && st.player.researchedNodes || []).includes('tech_outpost_charter');

    frag.appendChild(this._section(`Outposts (${owned.length})`));
    if (!owned.length) {
      frag.appendChild(emptyEl(buildUnlocked
        ? 'No outposts established. Build one in a sector you can defend to anchor long-term income.'
        : 'No outposts established. Research Outpost Charter after Autonomous Fleets to start sector ownership.'));
    } else {
      for (const o of owned) {
        const def = OUTPOSTS.find((x) => x.id === o.defId) || o;
        const factoryCapable = !(def.recipe && def.recipe.passive);
        const unlocked = new Set(st.crafting && st.crafting.unlockedBlueprints || []);
        const selectedBlueprint = factoryCapable
          ? FIELD_FACTORY_BLUEPRINTS.find((bp) => bp.id === o.recipeBlueprintId && unlocked.has(bp.id))
          : null;
        const recipe = selectedBlueprint
          ? { inputs: selectedBlueprint.inputs, output: { [selectedBlueprint.outputs.id]: selectedBlueprint.outputs.qty || 1 } }
          : def.recipe;
        const operation = describeOutpostOperation(o, { ...def, recipe });
        const recipeOptions = [
          `<option value=""${selectedBlueprint ? '' : ' selected'}>Facility standard — ${escapeHtml(recipeText(def.recipe))}</option>`,
          ...FIELD_FACTORY_BLUEPRINTS.filter((bp) => unlocked.has(bp.id)).map((bp) => (
            `<option value="${escapeHtml(bp.id)}"${selectedBlueprint && selectedBlueprint.id === bp.id ? ' selected' : ''}>${escapeHtml(bp.name)} — ${escapeHtml(recipeText({ inputs: bp.inputs, output: { [bp.outputs.id]: bp.outputs.qty || 1 } }))}</option>`
          )),
        ].join('');
        const lineChangeBlocked = (Number(o.storage) || 0) > 1e-9;
        const inputHtml = operation.inputs.length
          ? operation.inputs.map((input) => `
              <strong>${escapeHtml(input.label)}</strong>
              <span class="au-flow-v">${escapeHtml(rateText(input.actualPerMin, 'u/min'))}${input.short ? ' · short' : ''}</span>`).join('')
          : `<strong>No feedstock</strong><span class="au-flow-v">self-contained facility</span>`;
        const outputRate = comparisonRateText(operation.output.actualPerMin, operation.output.targetPerMin, operation.output.unit);
        const storageText = `${displayFlowNumber(operation.storage.stored)}/${displayFlowNumber(operation.storage.capacity)} ${operation.storage.unit} stored`;
        const card = document.createElement('div');
        card.className = 'au-card au-outpost';
        card.innerHTML = `
          <div class="grow">
            <div class="au-outpost-head">
              <div class="nm">${prettyId(def.id)} <span class="au-pill">${o.sectorId ? prettyId(o.sectorId) : 'unsited'}</span></div>
            </div>
            <div class="au-outpost-flow" data-state="${escapeHtml(operation.state)}" role="img" aria-label="${escapeHtml(operation.accessibleSummary)}">
              <div class="au-flow-node">
                <span class="au-flow-k">Input draw</span>
                ${inputHtml}
              </div>
              <span class="au-flow-link" aria-hidden="true"></span>
              <div class="au-flow-core">
                <span class="au-flow-k">Line state</span>
                <strong class="au-operation-status ${escapeHtml(operation.tone)}">${escapeHtml(operation.statusLabel)}</strong>
                <span class="au-flow-v">${escapeHtml(operation.feeders.label)} · ${escapeHtml(operation.feeders.availability)}</span>
              </div>
              <span class="au-flow-link" aria-hidden="true"></span>
              <div class="au-flow-node">
                <span class="au-flow-k">Output</span>
                <strong>${escapeHtml(operation.output.label)}</strong>
                <span class="au-flow-v">${escapeHtml(outputRate)}</span>
                <span class="au-flow-v">${escapeHtml(storageText)} ${storageBar(operation.storage.fill)}</span>
              </div>
            </div>
            <div class="au-operation-reason">${escapeHtml(operation.detail)}</div>
            ${factoryCapable ? `<div class="au-program-row">
              <span class="au-program-label">Factory line:</span>
              <select class="au-program" data-act="assignOutpostRecipe" data-ref="${o.id != null ? o.id : def.id}" data-kind="outpost" ${lineChangeBlocked ? 'disabled' : ''}>${recipeOptions}</select>
              ${lineChangeBlocked ? '<span class="au-program-badge">empty stored output to change</span>' : ''}
            </div>` : ''}
            <details class="au-outpost-detail" data-outpost-detail="${escapeHtml(o.id != null ? o.id : def.id)}">
              <summary>Facility details</summary>
              <div class="au-detail-row">
                <span>${escapeHtml(recipeText(recipe))}</span>
                <span>defense ${escapeHtml(def.defense)}</span>
                <span>upkeep ${escapeHtml(def.upkeepPerMin)}/min</span>
                <span>${o.autoSell ? 'autosell every minute' : 'manual logistics'}</span>
              </div>
            </details>
          </div>
          <button class="au-recall" data-act="decommission" data-ref="${o.id != null ? o.id : def.id}" data-kind="outpost" aria-label="Decommission ${prettyId(def.id)}">Decommission</button>`;
        frag.appendChild(card);
      }
    }

    frag.appendChild(this._section('Construct Outpost'));
    if (!buildUnlocked) {
      frag.appendChild(lockedEl('Outpost construction requires Outpost Charter in the logistics tech branch.'));
    }
    for (const def of OUTPOSTS) {
      const purchase = describeAutomationPurchase('outpost', def, this._ctx.state);
      const card = document.createElement('div');
      card.className = 'au-card';
      card.innerHTML = `
        <div class="grow">
          <div class="nm">${prettyId(def.id)}</div>
          <div class="meta">
            <span>${escapeHtml(recipeText(def.recipe))}</span>
            <span>out ${def.outRate}/s</span>
            <span>storage ${def.storageCap}</span>
            <span>defense ${def.defense}</span>
            <span>upkeep ${def.upkeepPerMin}/min</span>
          </div>
          <div class="au-note">${buildUnlocked ? 'High upkeep, high commitment: best after you can protect the sector or fund losses.' : 'This is the empire layer; reach it after traders prove the route economy.'}</div>
        </div>
        <button class="au-buy" data-act="buildOutpost" data-ref="${def.id}" title="${escapeHtml(purchase.title)}" aria-label="${escapeHtml(purchase.title)}"${purchase.disabled ? ' disabled' : ''}>${escapeHtml(purchase.label)}</button>`;
      frag.appendChild(card);
    }
  },

  _renderFleet(frag) {
    const a = this._auto();
    const fleet = a.fleet || [];
    const cap = a.fleetCap || (this._balance().fleetCapByTier || AUTO_BALANCE.fleetCapByTier || [2])[this._playerTier() - 1] || 0;

    const h = this._section(`Escort / Wingmen Fleet (${fleet.length}/${cap})`);
    frag.appendChild(h);

    if (!fleet.length) {
      frag.appendChild(emptyEl('No wingmen assigned. Spare owned ships can launch as escorts and reduce automation loss risk.'));
    } else {
      for (const fs of fleet) {
        const card = document.createElement('div');
        card.className = 'au-card';
        const order = fs.order || 'escort';
        const deployment = describeWingmanDeployment(fs);
        card.innerHTML = `
          <div class="grow">
            <div class="nm">${escapeHtml(fs.name) || prettyId(fs.defId || 'wingman')} ${statusPill(fs.status)}</div>
            <div class="meta">
              <span>order ${escapeHtml(order)}</span>
              <span>deploy ${deploymentPill(deployment)}</span>
              ${fs.hullPct != null ? `<span>hull ${Math.round(fs.hullPct * 100)}% ${miniBar(fs.hullPct)}</span>` : ''}
            </div>
            <div class="au-note">${escapeHtml(deployment.detail)} Escort protects you now and can guard automation assets as the fleet layer expands.</div>
          </div>
          <button class="au-order" data-act="orderEscort" data-ref="${fs.id != null ? fs.id : fs.defId}" data-kind="fleet">Escort</button>
          <button class="au-order" data-act="orderMine" data-ref="${fs.id != null ? fs.id : fs.defId}" data-kind="fleet">Mine</button>
          <button class="au-recall" data-act="orderRecall" data-ref="${fs.id != null ? fs.id : fs.defId}" data-kind="fleet">Recall</button>`;
        frag.appendChild(card);
      }
    }

    // assignable owned ships (anything beyond the active hull can be tasked)
    const st = this._ctx.state;
    const owned = (st.player && st.player.ownedShips) || [];
    const activeIdx = (st.player && st.player.activeShipIndex) || 0;
    frag.appendChild(this._section('Assign Owned Ship'));
    const assignable = owned.map((s, i) => ({ s, i })).filter(({ i }) => i !== activeIdx);
    if (!assignable.length) {
      frag.appendChild(emptyEl('No spare ships to assign. Buy a second hull at a shipyard, then return here to crew it as a wingman.'));
    } else if (fleet.length >= cap) {
      frag.appendChild(lockedEl(`Fleet at capacity (${cap}). Research higher Drone/Fleet tiers to expand.`));
    } else {
      for (const { s, i } of assignable) {
        const card = document.createElement('div');
        card.className = 'au-card';
        card.innerHTML = `
          <div class="grow">
            <div class="nm">${escapeHtml(s.customName) || prettyId(s.defId)}</div>
            <div class="meta"><span>${prettyId(s.defId)}</span><span>starts on escort</span></div>
            <div class="au-note">Assigned ships remain in the automation ledger and spawn as live wingmen in-sector.</div>
          </div>
          <button class="au-buy" data-act="assignFleet" data-ref="${i}" data-kind="ownedShip">Assign as Wingman</button>`;
        frag.appendChild(card);
      }
    }
  },

  // ---- intent dispatch ----------------------------------------------------
  // `extra` carries the selected value for <select>-driven actions (e.g. assignProgram templateId).
  _onAction(act, ref, kind, extra) {
    if (act === 'openShipworksRoute') {
      const ctx = this._ctx;
      const access = shipworksStationAccess(ctx && ctx.state);
      if (access.hull) {
        this._close();
        if (ctx && ctx.bus) ctx.bus.emit('station:navigate', { destination: 'shipworks' });
      } else {
        openGalaxyMap(ctx, {
          focus: MAP_FOCUS.GALAXY,
          sectorId: 'sector_helios_prime',
          stationId: 'station_helios',
          label: 'Helios Station · Shipworks',
          source: 'automation:drone-bay-hull',
        });
      }
      return;
    }
    if (act === 'switchTab') {
      if (TABS.some((t) => t.id === ref)) {
        this._tab = ref;
        this.refresh(this._ctx, { forceBody: true });
      }
      return;
    }

    const bus = this._ctx.bus;
    // single intent channel into automation: ui:fleetOrder {shipId, order, targetRef} (§4.4).
    // shipId carries the instance id for existing assets; targetRef carries the catalog defId or
    // owned-ship index for purchase/assign orders. order is the verb the automation system switches on.
    const toastFor = {
      buyDrone: 'Deploying mining drone…',
      recall: 'Recalling asset…',
      hireTrader: 'Hiring NPC trader…',
      assignRoute: 'Assigning trade route…',
      dismiss: 'Dismissing trader…',
      buildOutpost: 'Constructing outpost…',
      decommission: 'Decommissioning outpost…',
      orderEscort: 'Order: escort.',
      orderMine: 'Order: mine.',
      orderRecall: 'Order: recall.',
      assignFleet: 'Assigning wingman…',
      assignProgram: 'Assigning drone program…',
      assignOutpostRecipe: 'Changing factory line…',
    };

    // For purchases/assigns the instance does not exist yet → shipId null, targetRef = defId/index.
    const purchaseLike = ['buyDrone', 'hireTrader', 'buildOutpost', 'assignFleet'];
    const isPurchase = purchaseLike.includes(act);
    // assignProgram targets an EXISTING drone (shipId = ref) with the templateId as targetRef.
    const isProgram = act === 'assignProgram' || act === 'assignOutpostRecipe';

    bus.emit('ui:fleetOrder', {
      shipId: (isPurchase) ? null : numOr(ref),
      order: act,
      targetRef: isProgram ? (extra || null) : ref,
      kind: kind || null,
    });

    if (toastFor[act]) bus.emit('toast', { text: toastFor[act], kind: 'info', ttl: 2500 });

    // refresh in case automation handled synchronously; otherwise it re-emits change events the
    // uiRoot will route back to refresh() anyway.
    this.refresh(this._ctx, { forceBody: true });
  },
};

const AUTOMATION_BODY_FOCUSABLES = 'button, input, select, textarea, summary, [tabindex]';

function captureAutomationBodyFocus(body) {
  const active = typeof document !== 'undefined' ? document.activeElement : null;
  if (!active || !body.contains(active)) return null;
  const key = automationFocusKey(active);
  if (!key) return null;

  const tag = String(active.tagName || '').toUpperCase();
  const inputType = String(active.type || '').toLowerCase();
  const preservesTypedValue = tag === 'TEXTAREA'
    || (tag === 'INPUT' && (!inputType || inputType === 'text' || inputType === 'search'));
  return {
    key,
    typedValue: preservesTypedValue ? String(active.value || '') : null,
    selectionStart: preservesTypedValue && Number.isFinite(active.selectionStart) ? active.selectionStart : null,
    selectionEnd: preservesTypedValue && Number.isFinite(active.selectionEnd) ? active.selectionEnd : null,
    selectionDirection: preservesTypedValue ? active.selectionDirection : null,
  };
}

function restoreAutomationBodyFocus(body, snapshot) {
  if (!snapshot) return;
  const target = Array.from(body.querySelectorAll(AUTOMATION_BODY_FOCUSABLES))
    .find((candidate) => automationFocusKey(candidate) === snapshot.key);
  if (!target || target.disabled || target.hidden || target.isConnected === false) return;

  if (snapshot.typedValue != null) target.value = snapshot.typedValue;
  target.focus({ preventScroll: true });
  if (snapshot.selectionStart != null && typeof target.setSelectionRange === 'function') {
    try {
      target.setSelectionRange(snapshot.selectionStart, snapshot.selectionEnd, snapshot.selectionDirection || 'none');
    } catch (_) { /* unsupported input types retain focus without selection restoration */ }
  }
}

function automationFocusKey(element) {
  if (!element) return null;
  const dataset = element.dataset || {};
  if (dataset.focusKey) return `explicit:${dataset.focusKey}`;
  if (element.id) return `id:${element.id}`;

  const tag = String(element.tagName || '').toLowerCase();
  if (dataset.act) {
    return `action:${tag}:${dataset.act}:${dataset.ref || ''}:${dataset.kind || ''}`;
  }
  if (element.name) return `name:${tag}:${element.name}`;
  if (dataset.search != null) return `search:${tag}:${dataset.search}`;
  if (dataset.filter != null) return `filter:${tag}:${dataset.filter}`;

  const details = typeof element.closest === 'function'
    ? element.closest('details[data-outpost-detail]')
    : null;
  if (details && tag === 'summary') return `outpost-details:${details.dataset.outpostDetail}:summary`;
  return null;
}

// ---- helpers ----------------------------------------------------------------
export function summarizeAutomationOperations(state) {
  const a = automationState(state);
  const drones = (a.drones || []).length;
  const traders = (a.traders || []).length;
  const outposts = (a.outposts || []).length;
  const fleet = (a.fleet || []).length;
  const grossRatePerMin = grossRatePerMinFromAutomation(a);
  const upkeepPerMin = estimateUpkeepPerMin(a);
  const netRatePerMin = grossRatePerMin - upkeepPerMin;
  const capPerMin = passiveCapPerMin(state);
  const distressedAssets = countDistressedAssets(a);
  return {
    drones,
    traders,
    outposts,
    fleet,
    activeAssets: drones + traders + outposts + fleet,
    grossRatePerMin,
    upkeepPerMin,
    netRatePerMin,
    capPerMin,
    capHeadroomPerMin: capPerMin - Math.max(0, grossRatePerMin),
    capOveragePerMin: Math.max(0, Math.max(0, grossRatePerMin) - capPerMin),
    capUsedPct: capPerMin > 0 ? Math.min(999, Math.max(0, grossRatePerMin / capPerMin * 100)) : 0,
    totalPassiveEarnedLifetime: (a.meta && a.meta.totalPassiveEarnedLifetime) || 0,
    distressedAssets,
  };
}

export function describeAutomationCapLoad(summary = {}) {
  const cap = Math.max(0, Number(summary.capPerMin) || 0);
  const gross = Math.max(0, Number(summary.grossRatePerMin) || 0);
  const pctValue = cap > 0 ? Math.min(999, Math.max(0, gross / cap * 100)) : 0;
  const label = Math.round(pctValue) + '%';
  const overage = Math.max(0, Number(summary.capOveragePerMin) || (gross - cap));
  if (overage > 0) {
    return {
      state: 'over-cap',
      label,
      detail: fmtCr(overage) + ' cr/min over cap; overflow dropped',
      overagePerMin: overage,
      headroomPerMin: 0,
    };
  }
  const headroom = Math.max(0, cap - gross);
  return {
    state: pctValue >= 90 ? 'tight' : 'healthy',
    label,
    detail: fmtCr(headroom) + ' cr/min headroom',
    overagePerMin: 0,
    headroomPerMin: headroom,
  };
}

export function describeWingmanDeployment(fs = {}) {
  const status = String(fs.status || fs.order || '').toLowerCase();
  if (fs._liveId != null) {
    return {
      state: 'live',
      label: 'LIVE',
      className: 'ok',
      detail: 'Deployed in the current sector; hull updates from live combat.',
    };
  }
  if (status === 'lost' || status === 'destroyed') {
    return {
      state: 'lost',
      label: 'LOST',
      className: 'bad',
      detail: 'Removed from the active wing; replace it from an owned spare hull.',
    };
  }
  if (status === 'idle') {
    return {
      state: 'standby',
      label: 'STANDBY',
      className: 'warn',
      detail: 'Recalled to the ledger; order Escort to redeploy on the next sector entry.',
    };
  }
  return {
    state: 'ready',
    label: 'READY',
    className: '',
    detail: 'Ready in the fleet ledger; deploys beside you on the next sector entry.',
  };
}

export function automationNextAction(state) {
  const a = automationState(state);
  const player = (state && state.player) || {};
  const credits = player.credits || 0;
  const researched = player.researchedNodes || [];
  const summary = summarizeAutomationOperations(state);
  const hasTraderTech = researched.includes('tech_autonomous_fleets');
  const hasOutpostTech = researched.includes('tech_outpost_charter');
  const droneMk1 = DRONES[0] || {};
  const ownedShips = player.ownedShips || [];
  const activeShipIndex = player.activeShipIndex || 0;
  const spareShipIndex = ownedShips.findIndex((_ship, index) => index !== activeShipIndex);
  const spareShips = spareShipIndex >= 0;
  if (summary.distressedAssets > 0) {
    return nextAction('drones', 'Stabilize distressed assets',
      'Your automation is unpaid or under attack. Bank drone buffers, cut upkeep, or fly rescue before repossession.',
      `${summary.distressedAssets} distressed`, 'Review Assets');
  }
  if (!(a.drones || []).length) {
    const purchase = describeAutomationPurchase('drone', droneMk1, state);
    const prerequisite = purchase.state === 'drone_hull'
      || purchase.state === 'drone_tech'
      || purchase.state === 'drone_bay';
    const starterBody = prerequisite
      ? purchase.title
      : purchase.state === 'drone_capacity'
        ? 'The active ship has no free drone slot. Recall a deployed drone or fit more Drone Bay capacity.'
        : credits >= (droneMk1.cost || 0)
          ? 'Start the passive layer with a Mk1 drone. It is cheap, visible in the field, and recallable if the route goes bad.'
          : 'Earn enough credits for a Mk1 mining drone, then start automation with a reversible low-upkeep asset.';
    const shipworksReady = purchase.state === 'drone_hull' && shipworksStationAccess(state).hull;
    const cta = purchase.state === 'available'
      ? 'Deploy Mk1'
      : purchase.state === 'drone_hull'
        ? (shipworksReady ? 'Open Shipworks' : 'Plot Helios Shipworks')
        : 'Open Drone Bay';
    const options = purchase.state === 'available'
      ? {
        action: 'buyDrone',
        targetRef: droneMk1.id,
        kind: 'drone',
        actionTitle: purchase.title,
      }
      : purchase.state === 'drone_hull'
        ? { action: 'openShipworksRoute', targetRef: 'shipworks', actionTitle: purchase.title }
        : { actionTitle: purchase.title };
    return nextAction('drones', 'Deploy a mining drone',
      starterBody,
      `${fmtCr(droneMk1.cost || 0)} cr starter`,
      cta,
      options);
  }
  if (summary.capUsedPct >= 90) {
    const capLoad = describeAutomationCapLoad(summary);
    const overCap = capLoad.state === 'over-cap';
    return nextAction('drones', 'Raise automation ceiling',
      overCap
        ? 'Passive production is over the hard cap, so overflow is dropped. Research logistics tiers or rebalance assets before buying more raw output.'
        : 'Passive production is pressing into the cap. Research logistics tiers or rebalance assets before buying more raw output.',
      overCap ? `${fmtCr(capLoad.overagePerMin)} cr/min over cap` : `${Math.round(summary.capUsedPct)}% cap load`,
      'Review Drones');
  }
  if (!(a.traders || []).length) {
    const trader = TRADERS[0] || {};
    const purchase = describeAutomationPurchase('trader', trader, state);
    if (hasTraderTech) {
      return nextAction('traders', 'Hire a route trader',
        'Turn market spreads into managed income. Reroute when heat climbs so the lane keeps paying.',
        'Autonomous Fleets ready',
        purchase.state === 'available' ? 'Hire Hauler' : 'Open Traders',
        purchase.state === 'available' ? {
          action: 'hireTrader',
          targetRef: trader.id,
          kind: 'trader',
          actionTitle: purchase.title,
        } : { actionTitle: purchase.title });
    }
    return nextAction('traders', 'Research Autonomous Fleets',
      'Traders unlock after the drone layer, giving the player a second automation verb: managing route heat and danger.',
      'Tech locked', 'View Traders');
  }
  if (!(a.outposts || []).length) {
    if (hasOutpostTech) {
      const outpost = cheapestOutpost();
      const purchase = describeAutomationPurchase('outpost', outpost, state);
      return nextAction('outposts', 'Found a sector outpost',
        'Outposts convert money into territory. Build one where your fleet can absorb raids and upkeep.',
        'Charter ready',
        purchase.state === 'available' ? 'Build Outpost' : 'Open Outposts',
        purchase.state === 'available' ? {
          action: 'buildOutpost',
          targetRef: outpost.id,
          kind: 'outpost',
          actionTitle: purchase.title,
        } : { actionTitle: purchase.title });
    }
    return nextAction('outposts', 'Work toward Outpost Charter',
      'The empire layer should come after traders prove the route economy and the player can fund higher upkeep.',
      'Tech locked', 'View Outposts');
  }
  if (!(a.fleet || []).length && spareShips) {
    return nextAction('fleet', 'Assign a spare hull',
      'Crew a second owned ship as a wingman so automation risk starts feeling protectable, not random.',
      `${ownedShips.length - 1} spare hulls`, 'Assign Wingman', {
        action: 'assignFleet',
        targetRef: spareShipIndex,
        kind: 'ownedShip',
        actionTitle: 'Assign spare hull as a wingman.',
      });
  }
  return nextAction('fleet', 'Keep routes defended',
    'Your automation stack is online. Keep the cap healthy, rotate hot trader routes, and add escorts before dangerous expansion.',
    `${fmtCr(summary.netRatePerMin)} cr/min net`, 'Review Fleet');
}

function nextAction(tab, title, body, meta, cta, options = {}) {
  return {
    tab,
    title,
    body,
    meta,
    cta,
    action: options.action || 'switchTab',
    targetRef: options.targetRef != null ? options.targetRef : tab,
    kind: options.kind || null,
    actionTitle: options.actionTitle || cta,
  };
}

function cheapestOutpost() {
  return OUTPOSTS
    .slice()
    .sort((a, b) => automationPurchaseCost('outpost', a) - automationPurchaseCost('outpost', b))[0] || {};
}

function automationState(state) {
  return (state && state.automation) || { drones: [], traders: [], outposts: [], fleet: [], fleetCap: 0,
    meta: {}, accumulators: {}, balance: AUTO_BALANCE };
}

function passiveCapPerMin(state) {
  const a = automationState(state);
  const bal = a.balance || AUTO_BALANCE;
  const ref = bal.activeRefByTier || AUTO_BALANCE.activeRefByTier;
  const tier = playerTierFromState(state);
  const active = ref[Math.min(tier, ref.length) - 1] || ref[0] || 0;
  const frac = bal.passiveCapFrac != null ? bal.passiveCapFrac : 0.45;
  return active * frac;
}

function playerTierFromState(state) {
  const player = (state && state.player) || {};
  const cap = player.droneTierCap || 1;
  return Math.max(1, Math.min(5, Math.round(cap) || 1));
}

function automationPurchaseCost(kind, def) {
  if (kind === 'trader') return Math.max(0, Number(def.hireCost) || 0);
  if (kind === 'outpost') return Math.max(0, Number(def.buildCost) || 0);
  return Math.max(0, Number(def.cost) || 0);
}

function droneTierTechId(tier) {
  const want = Math.max(1, Math.round(tier || 1));
  const match = TECH_NODES
    .filter((node) => node.unlocks && node.unlocks.droneTierCap >= want)
    .sort((a, b) => (a.unlocks.droneTierCap || 0) - (b.unlocks.droneTierCap || 0))[0];
  return match ? match.id : 'tech_drone_control';
}

function techName(id) {
  const node = TECH_BY_ID.get(id);
  return (node && node.name) || String(id || 'required tech').replace(/^tech_/, '').replace(/_/g, ' ');
}

function grossRatePerMinFromAutomation(a) {
  let rate = 0;
  for (const d of a.drones || []) rate += d.ratePerMin != null ? d.ratePerMin : estDroneRate(d);
  for (const t of a.traders || []) rate += t.ratePerMin != null ? t.ratePerMin : 0;
  for (const o of a.outposts || []) rate += o.ratePerMin != null ? o.ratePerMin : 0;
  return rate;
}

function estimateUpkeepPerMin(a) {
  let sum = 0;
  for (const d of a.drones || []) sum += defUpkeep(DRONES, d);
  for (const t of a.traders || []) sum += defUpkeep(TRADERS, t);
  for (const o of a.outposts || []) {
    const def = OUTPOSTS.find((x) => x.id === o.defId) || o;
    sum += (def.upkeepPerMin || 0) * Math.pow(1.5, (o.level || 1) - 1);
  }
  return sum;
}

function defUpkeep(defs, inst) {
  const def = defs.find((x) => x.id === inst.defId) || inst;
  return def.upkeepPerMin || 0;
}

function countDistressedAssets(a) {
  let n = 0;
  for (const list of [a.drones || [], a.traders || [], a.outposts || [], a.fleet || []]) {
    for (const asset of list) {
      if (asset && (asset.status === 'distressed' || asset.status === 'raided' || asset.status === 'lowfuel')) n++;
    }
  }
  return n;
}

function estDroneRate(d) {
  // Display-only fallback when an asset has not reported ratePerMin yet; automation owns payouts.
  const def = DRONES.find((x) => x.id === d.defId) || d;
  return (def.mineRate || 0) * 60 * DRONE_DISPLAY_ORE_VALUE;
}

function programLabel(id) {
  const opt = PROGRAM_OPTIONS.find((x) => x.value === id);
  return opt ? opt.label : prettyId(id);
}

function programMetaText(id) {
  const opt = PROGRAM_OPTIONS.find((x) => x.value === id);
  return opt ? opt.meta : 'Custom program assigned.';
}

function metricHtml(k, v, s) {
  return `<div class="au-metric"><div class="k">${escapeHtml(k)}</div><div class="v">${escapeHtml(v)}</div><div class="s">${escapeHtml(s)}</div></div>`;
}

function recipeText(r) {
  if (!r) return 'idle';
  if (r.passive) return `passive ${r.creditGen || 0} cr/s`;
  const ins = r.inputs ? Object.entries(r.inputs).map(([k, v]) => `${v}× ${commodityName(k)}`).join(' + ') : '?';
  const out = r.output ? Object.entries(r.output).map(([k, v]) => `${v}× ${commodityName(k)}`).join(' + ') : '?';
  return `${ins} → ${out}`;
}

function statusPill(status) {
  if (!status || status === 'active' || status === 'working' || status === 'deployed') return `<span class="au-pill ok">active</span>`;
  if (status === 'distressed' || status === 'lowfuel' || status === 'idle') return `<span class="au-pill warn">${escapeHtml(status)}</span>`;
  if (status === 'lost' || status === 'raided' || status === 'destroyed') return `<span class="au-pill bad">${escapeHtml(status)}</span>`;
  return `<span class="au-pill">${escapeHtml(status)}</span>`;
}

function deploymentPill(deployment) {
  const cls = deployment.className ? ' ' + deployment.className : '';
  return `<span class="au-pill${cls}">${escapeHtml(deployment.label)}</span>`;
}

function miniBar(frac) {
  const pct = Math.max(0, Math.min(1, frac || 0)) * 100;
  const col = pct < 25 ? 'var(--danger)' : pct < 55 ? 'var(--warn)' : 'var(--good)';
  return `<span class="au-minibar"><i style="width:${pct.toFixed(0)}%;background:${col}"></i></span>`;
}

function storageBar(frac) {
  const pct = Math.max(0, Math.min(1, frac || 0)) * 100;
  const color = pct >= 90 ? 'var(--warn)' : 'var(--accent-2)';
  return `<span class="au-storebar" aria-hidden="true"><i style="width:${pct.toFixed(0)}%;background:${color}"></i></span>`;
}

function emptyEl(text) {
  const d = document.createElement('div');
  d.className = 'au-empty';
  d.textContent = text;
  return d;
}
function lockedEl(text) {
  const d = document.createElement('div');
  d.className = 'au-locked';
  d.textContent = '⛔ ' + text;
  return d;
}

function prettyId(id) {
  return escapeHtml(prettyLabel(id));
}

function prettyLabel(id) {
  return String(id || '')
    .replace(/^(drone_|trader_|outpost_|cmdty_|ship_|sector_|mod_)/, '')
    .replace(/_/g, ' ');
}

function commodityName(id) {
  if (id === 'credits') return 'Credits';
  const commodity = COMMODITY_BY_ID.get(id);
  if (commodity && commodity.name) return commodity.name;
  const label = prettyLabel(id);
  return label.replace(/\b\w/g, (char) => char.toUpperCase());
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && value !== null && value !== '' ? number : null;
}

function firstPositiveKey(record) {
  return Object.keys(record || {}).sort().find((key) => Number(record[key]) > 0) || null;
}

function roundFlow(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function displayFlowNumber(value) {
  if (value == null) return '—';
  const number = Number(value) || 0;
  return Number.isInteger(number) ? String(number) : number.toFixed(number < 10 ? 2 : 1).replace(/\.0$/, '');
}

function rateText(value, unit) {
  return value == null ? 'awaiting telemetry' : `${displayFlowNumber(value)} ${unit}`;
}

function comparisonRateText(actual, target, unit) {
  if (actual == null) return 'awaiting telemetry';
  if (target == null) return `${displayFlowNumber(actual)} ${unit}`;
  return `${displayFlowNumber(actual)} / ${displayFlowNumber(target)} ${unit}`;
}

function spokenRate(value, unit) {
  return value == null ? 'awaiting telemetry' : `${displayFlowNumber(value)} ${unit}`;
}

function spokenComparisonRate(actual, target, unit) {
  if (actual == null) return 'awaiting telemetry';
  if (target == null) return `${displayFlowNumber(actual)} ${unit}`;
  return `${displayFlowNumber(actual)} of ${displayFlowNumber(target)} ${unit}`;
}

function numOr(v) {
  const n = Number(v);
  return Number.isFinite(n) && String(v).trim() !== '' && !/^[a-z]/i.test(String(v)) ? n : v;
}

function fmtCr(v) {
  v = Math.round(v || 0);
  if (v >= 1e6) return (v / 1e6).toFixed(1) + 'M';
  if (v >= 1e4) return (v / 1e3).toFixed(0) + 'k';
  return v.toLocaleString();
}
