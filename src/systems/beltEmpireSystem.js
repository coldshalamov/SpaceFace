// src/systems/beltEmpireSystem.js — Autonomous Belt Empire Simulation, Drone Fleet,
// Weather & Raids, Charter Contracts, Supply Matrix, and Network Auto-Balancer.
// Pure, deterministic simulation helper owned by src/systems/asteroidSites.js.
// Zero wall-clock timers, zero Math.random(), zero Three.js/DOM, and never writes credits directly.
import { hash32 } from '../core/rng.js';
import { SITE_MACHINE_BY_ID, SITE_RECIPE_BY_ID, SITE_BALANCE, RAID_RULES } from '../data/sites.js';
import { COMMODITIES } from '../data/commodities.js';
const COMMODITY_BY_ID = new Map(COMMODITIES.map((c) => [c.id, c]));
import {
  BELT_ORBITAL_STRUCTURES,
  BELT_DRONE_TYPES,
  BELT_DOCTRINES,
  BELT_DOCTRINE_BY_ID,
  BELT_WEATHER_TYPES,
  BELT_CHARTER_TEMPLATES,
} from '../data/beltEmpireData.js';
import { machineCapability, round3 } from './siteProduction.js';
import { storeTotal } from './siteLogistics.js';
import { SECTORS, dangerIndex } from '../data/sectors.js';
const SECTOR_BY_ID = new Map(SECTORS.map((s) => [s.id, s]));

export const DEFAULT_EMPIRE_WEATHER_ID = 'calm_drift';
export const MAX_ACTIVE_CHARTERS = 3;

const WEATHER_BY_ID = new Map(BELT_WEATHER_TYPES.map((w) => [w.id, w]));
const CHARTER_BY_ID = new Map(BELT_CHARTER_TEMPLATES.map((c) => [c.id, c]));

export function makeDefaultEmpireState(simTime = 0) {
  const t0 = Math.max(0, Math.round(Number(simTime) || 0));
  const baseWeather = WEATHER_BY_ID.get(DEFAULT_EMPIRE_WEATHER_ID) || BELT_WEATHER_TYPES[0];
  return {
    doctrines: {},
    activeCharters: [],
    completedCharters: [],
    weather: {
      id: baseWeather.id,
      startedAt: t0,
      endsAt: t0 + (baseWeather.durationS || 120),
      cycle: 0,
    },
    raidStatus: {
      lastCheckT: t0,
      pressure: 0,
      mitigated: 0,
      losses: 0,
      lastMessage: null,
    },
    stats: {
      droneHarvestedU: 0,
      regocreteCastU: 0,
      chartersCompleted: 0,
      autoLinksBuilt: 0,
    },
  };
}

export function normalizeEmpireState(raw, simTime = 0) {
  const def = makeDefaultEmpireState(simTime);
  if (!raw || typeof raw !== 'object') return def;

  // Doctrines map
  const doctrines = {};
  if (raw.doctrines && typeof raw.doctrines === 'object') {
    for (const id of Object.keys(raw.doctrines)) {
      if (!BELT_DOCTRINE_BY_ID.has(id)) continue;
      const entry = raw.doctrines[id];
      if (!entry) continue;
      doctrines[id] = {
        unlockedAt: Math.max(0, Math.round(Number(entry.unlockedAt) || 0)),
      };
    }
  }

  // Active charters
  const activeCharters = [];
  if (Array.isArray(raw.activeCharters)) {
    for (const c of raw.activeCharters) {
      if (!c || typeof c.id !== 'string') continue;
      const tpl = CHARTER_BY_ID.get(c.id);
      if (!tpl) continue;
      if (activeCharters.some((x) => x.id === c.id)) continue;
      activeCharters.push({
        id: tpl.id,
        acceptedAt: Math.max(0, Math.round(Number(c.acceptedAt) || 0)),
        progress: Math.max(0, Number(c.progress) || 0),
        target: tpl.requirement.target,
      });
      if (activeCharters.length >= MAX_ACTIVE_CHARTERS) break;
    }
  }

  // Completed charter IDs
  const completedCharters = [];
  if (Array.isArray(raw.completedCharters)) {
    for (const item of raw.completedCharters) {
      const id = typeof item === 'string' ? item : item?.id;
      if (id && CHARTER_BY_ID.has(id) && !completedCharters.includes(id)) {
        completedCharters.push(id);
      }
    }
  }

  // Weather
  const wRaw = raw.weather && typeof raw.weather === 'object' ? raw.weather : {};
  const wDef = WEATHER_BY_ID.get(wRaw.id) || BELT_WEATHER_TYPES[0];
  const startedAt = Math.max(0, Number(wRaw.startedAt) || 0);
  const endsAt = Number.isFinite(wRaw.endsAt) && wRaw.endsAt > startedAt
    ? Number(wRaw.endsAt)
    : startedAt + (wDef.durationS || 120);

  const rRaw = raw.raidStatus && typeof raw.raidStatus === 'object' ? raw.raidStatus : {};
  const sRaw = raw.stats && typeof raw.stats === 'object' ? raw.stats : {};

  return {
    doctrines,
    activeCharters,
    completedCharters,
    weather: {
      id: wDef.id,
      startedAt,
      endsAt,
      cycle: Math.max(0, Math.trunc(Number(wRaw.cycle) || 0)),
    },
    raidStatus: {
      lastCheckT: Math.max(0, Number(rRaw.lastCheckT) || 0),
      pressure: Math.max(0, Number(rRaw.pressure) || 0),
      mitigated: Math.max(0, Math.trunc(Number(rRaw.mitigated) || 0)),
      losses: Math.max(0, Math.trunc(Number(rRaw.losses) || 0)),
      lastMessage: typeof rRaw.lastMessage === 'string' ? rRaw.lastMessage : null,
    },
    stats: {
      droneHarvestedU: Math.max(0, Number(sRaw.droneHarvestedU) || 0),
      regocreteCastU: Math.max(0, Number(sRaw.regocreteCastU) || 0),
      chartersCompleted: Math.max(0, Math.trunc(Number(sRaw.chartersCompleted) || 0)),
      autoLinksBuilt: Math.max(0, Math.trunc(Number(sRaw.autoLinksBuilt) || 0)),
    },
  };
}

export function ensureEmpireState(sitesRoot, simTime = 0) {
  if (!sitesRoot || typeof sitesRoot !== 'object') return makeDefaultEmpireState(simTime);
  if (!sitesRoot.empire || typeof sitesRoot.empire !== 'object') {
    sitesRoot.empire = makeDefaultEmpireState(simTime);
  } else {
    sitesRoot.empire = normalizeEmpireState(sitesRoot.empire, simTime);
  }
  return sitesRoot.empire;
}

export function normalizeSiteDrones(drones) {
  if (!Array.isArray(drones)) return [];
  const out = [];
  for (let i = 0; i < drones.length; i++) {
    const d = drones[i];
    if (!d || !BELT_DRONE_TYPES[d.kind]) continue;
    out.push({
      id: typeof d.id === 'string' && d.id ? d.id : `drone_${i + 1}_${d.kind}`,
      kind: d.kind,
      installedT: Math.max(0, Math.round(Number(d.installedT) || 0)),
      targetAsteroidId: Number.isFinite(d.targetAsteroidId) ? d.targetAsteroidId : null,
      cargoGood: typeof d.cargoGood === 'string' ? d.cargoGood : null,
      cargoU: Math.max(0, Number(d.cargoU) || 0),
      phase: typeof d.phase === 'string' ? d.phase : 'idle',
      cycleCount: Math.max(0, Math.trunc(Number(d.cycleCount) || 0)),
    });
  }
  return out;
}

export function getEmpireModifiers(empire) {
  const unlocked = empire && typeof empire.doctrines === 'object' ? empire.doctrines : {};
  const unlockedIds = Object.keys(unlocked).filter((id) => !!unlocked[id] && BELT_DOCTRINE_BY_ID.has(id));
  const mods = {
    unlockedIds,
    extractorYieldMult: 0,
    processBonusBonus: 0,
    coolingBonus: 0,
    powerTransferEffBonus: 0,
    powerDrawDiscount: 0,
    linkRateBonus: 0,
    droneEfficiencyMult: 0,
    freeDroneBerths: 0,
    laneCapacityBonus: 0,
    podLossReduction: 0,
    defenseBonusPct: 0,
    charterPayoutBonus: 0,
    massDriverVelocityMult: 1,
  };
  for (const id of unlockedIds) {
    const doc = BELT_DOCTRINE_BY_ID.get(id);
    if (!doc) continue;
    if (doc.effectKey === 'extractorYieldMult') mods.extractorYieldMult += doc.effectValue;
    else if (doc.effectKey === 'processBonusBonus') mods.processBonusBonus += doc.effectValue;
    else if (doc.effectKey === 'coolingBonus') mods.coolingBonus += doc.effectValue;
    else if (doc.effectKey === 'powerTransferEffBonus') mods.powerTransferEffBonus += doc.effectValue;
    else if (doc.effectKey === 'powerDrawDiscount') mods.powerDrawDiscount += doc.effectValue;
    else if (doc.effectKey === 'linkRateBonus') mods.linkRateBonus += doc.effectValue;
    else if (doc.effectKey === 'droneEfficiencyMult') {
      mods.droneEfficiencyMult += doc.effectValue;
      if (id === 'doc_swarm_2') mods.freeDroneBerths += 1;
    } else if (doc.effectKey === 'laneCapacityBonus') {
      mods.laneCapacityBonus += doc.effectValue;
      mods.massDriverVelocityMult += 0.25;
    } else if (doc.effectKey === 'podLossReduction') mods.podLossReduction += doc.effectValue;
    else if (doc.effectKey === 'defenseBonusPct') mods.defenseBonusPct += doc.effectValue;
    else if (doc.effectKey === 'charterPayoutBonus') mods.charterPayoutBonus += doc.effectValue;
  }
  return mods;
}

export function getActiveWeather(empire, state) {
  const simT = Math.max(0, Number(state?.simTime) || 0);
  const wRec = empire?.weather || { id: DEFAULT_EMPIRE_WEATHER_ID, startedAt: 0, endsAt: 120, cycle: 0 };
  const def = WEATHER_BY_ID.get(wRec.id) || BELT_WEATHER_TYPES[0];
  return {
    id: def.id,
    name: def.name,
    tone: def.tone || 'mint',
    heatDelta: Number(def.heatDelta) || 0,
    powerMult: Number(def.powerMult) || 1,
    podRiskDelta: Number(def.podRiskDelta) || 0,
    yieldMult: Number(def.yieldMult) || 1,
    summary: def.summary,
    startedAt: wRec.startedAt || 0,
    endsAt: wRec.endsAt || (wRec.startedAt || 0) + (def.durationS || 120),
    remainingS: Math.max(0, Math.round((wRec.endsAt || 0) - simT)),
    cycle: wRec.cycle || 0,
  };
}

function siteDefenseTotals(site, mods) {
  let orbitalDefense = 0;
  let podRiskReduction = mods.podLossReduction || 0;
  let stormImmune = false;
  let maxDrones = SITE_BALANCE.maxDronesPerSite || 6;
  maxDrones += mods.freeDroneBerths || 0;

  for (const def of site?.defenses || []) {
    const spec = BELT_ORBITAL_STRUCTURES[def?.kind];
    if (!spec) continue;
    orbitalDefense += Number(spec.defenseRating) || 0;
    podRiskReduction += Number(spec.podRiskReduction) || 0;
    if (spec.stormImmune) stormImmune = true;
    maxDrones += Number(spec.droneSlotsBonus) || 0;
  }

  let patrolDefense = 0;
  let harvesterCount = 0;
  let shuttleCount = 0;
  let patrolCount = 0;
  for (const d of site?.drones || []) {
    const spec = BELT_DRONE_TYPES[d?.kind];
    if (!spec) continue;
    if (d.kind === 'harvester') harvesterCount++;
    else if (d.kind === 'shuttle') shuttleCount++;
    else if (d.kind === 'patrol') patrolCount++;
    patrolDefense += Number(spec.defenseRating) || 0;
    podRiskReduction += Number(spec.podRiskReduction) || 0;
  }

  const rawDefense = orbitalDefense + patrolDefense;
  const totalDefenseRating = Math.round(rawDefense * (1 + (mods.defenseBonusPct || 0)));

  return {
    orbitalDefense,
    patrolDefense,
    totalDefenseRating,
    podRiskReduction,
    stormImmune,
    maxDrones,
    harvesterCount,
    shuttleCount,
    patrolCount,
  };
}

export function getSiteDroneCapacity(site, empire) {
  const mods = getEmpireModifiers(empire);
  return siteDefenseTotals(site, mods).maxDrones;
}

function resolveEntityPos(state, asteroidId, fallbackAnchor) {
  const ent = state?.entities?.get?.(asteroidId);
  if (ent && ent.pos && Number.isFinite(ent.pos.x) && Number.isFinite(ent.pos.z)) {
    return { x: ent.pos.x, z: ent.pos.z };
  }
  if (fallbackAnchor && Number.isFinite(fallbackAnchor.x) && Number.isFinite(fallbackAnchor.z)) {
    return { x: fallbackAnchor.x, z: fallbackAnchor.z };
  }
  return null;
}

function findNearestHarvestRock(site, state, rangeWu) {
  if (!state?.entities?.values) return null;
  const origin = resolveEntityPos(state, site.asteroidId, site.anchor);
  if (!origin) return null;
  let best = null;
  let bestDist = Infinity;
  for (const ent of state.entities.values()) {
    if (!ent || ent.alive === false || ent.type !== 'asteroid' || ent.id === site.asteroidId) continue;
    if (ent.data?.siteId) continue; // Only harvest unclaimed wild belt rocks
    const pos = ent.pos;
    if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.z)) continue;
    const dist = Math.hypot(pos.x - origin.x, pos.z - origin.z);
    if (dist <= rangeWu && dist < bestDist) {
      bestDist = dist;
      best = ent;
    }
  }
  return best;
}

/**
 * Step all autonomous belt drones owned by one commissioned asteroid site.
 */
export function stepBeltDroneFleet(site, state, dtS, rt, synergies, empire) {
  const mods = getEmpireModifiers(empire);
  const weather = getActiveWeather(empire, state);
  const drones = Array.isArray(site?.drones) ? site.drones : [];
  const totals = siteDefenseTotals(site, mods);
  if (!drones.length || !(dtS > 0)) {
    return {
      ...totals,
      shuttleLinkBoostPerMin: totals.shuttleCount * BELT_DRONE_TYPES.shuttle.linkBoostPerMin,
    };
  }

  const storageBonus = (synergies?.summary?.orbitalStorageBonus || 0) + (mods.laneCapacityBonus || 0);
  const firstActiveLinkTargetId = (site.links || []).find((l) => l && l.active !== false)?.targetSiteId || null;

  for (const drone of drones) {
    if (!drone || !BELT_DRONE_TYPES[drone.kind]) continue;
    if (drone.kind === 'harvester') {
      const spec = BELT_DRONE_TYPES.harvester;
      // Pick or validate wild target rock
      let target = drone.targetAsteroidId != null ? state?.entities?.get?.(drone.targetAsteroidId) : null;
      if (!target || target.alive === false || target.type !== 'asteroid' || target.data?.siteId) {
        target = findNearestHarvestRock(site, state, spec.rangeWu);
        drone.targetAsteroidId = target ? target.id : null;
      }
      if (!target || !rt?.laneComps?.length) {
        drone.phase = 'idle';
        continue;
      }
      const oreGood = (target.data && typeof target.data.oreType === 'string' && COMMODITY_BY_ID.has(target.data.oreType))
        ? target.data.oreType
        : 'cmdty_ore_iron';
      const ratePerS = (spec.harvestRatePerMin / 60) * (1 + mods.droneEfficiencyMult) * (weather.yieldMult || 1);
      const gain = ratePerS * dtS;
      drone.cargoGood = oreGood;
      drone.cargoU = round3((Number(drone.cargoU) || 0) + gain);
      drone.phase = drone.cargoU >= 1 ? 'returning' : 'harvesting';

      if (drone.cargoU >= 1) {
        const whole = Math.floor(drone.cargoU);
        let deposited = 0;
        for (const comp of rt.laneComps) {
          if (deposited >= whole) break;
          const st = rt.stores[comp.key];
          if (!st) continue;
          const cap = (rt.capacity[comp.key] || 0) + storageBonus;
          const free = Math.max(0, Math.floor(cap - storeTotal(st)));
          const put = Math.min(whole - deposited, free);
          if (put > 0) {
            st[oreGood] = (Number(st[oreGood]) || 0) + put;
            deposited += put;
          }
        }
        if (deposited > 0) {
          drone.cargoU = Math.max(0, round3(drone.cargoU - deposited));
          drone.cycleCount = (drone.cycleCount || 0) + 1;
          drone.phase = 'harvesting';
          if (empire?.stats) {
            empire.stats.droneHarvestedU = round3((empire.stats.droneHarvestedU || 0) + deposited);
          }
        }
      }
    } else if (drone.kind === 'shuttle') {
      drone.targetAsteroidId = null;
      drone.phase = firstActiveLinkTargetId ? `escorting:${firstActiveLinkTargetId}` : 'standby';
    } else if (drone.kind === 'patrol') {
      drone.targetAsteroidId = null;
      drone.phase = 'patrolling';
    }
  }

  return {
    ...totals,
    shuttleLinkBoostPerMin: totals.shuttleCount * BELT_DRONE_TYPES.shuttle.linkBoostPerMin,
  };
}

/**
 * Pure read-only aggregation of production vs consumption rates, stock, links, power,
 * and bottlenecks across every commissioned asteroid site in a sector.
 */
export function computeSectorSupplyMatrix(sitesSys, sectorId = null) {
  const sites = sitesSys?.state?.sites;
  const empire = sitesSys?.state?.sites?.empire || makeDefaultEmpireState(sitesSys?.state?.simTime || 0);
  const mods = getEmpireModifiers(empire);
  const weather = getActiveWeather(empire, sitesSys?.state);
  const rowsByGood = {};
  const siteSummaries = [];

  let totalPowerGenMw = 0;
  let totalPowerDrawMw = 0;
  let totalDefenseRating = 0;
  let activeLinkCount = 0;
  let totalDrones = 0;
  let hasTier3OrDrydock = false;

  const ensureGoodRow = (goodId) => {
    if (!rowsByGood[goodId]) {
      const c = COMMODITY_BY_ID.get(goodId);
      rowsByGood[goodId] = {
        goodId,
        name: c ? c.name : goodId,
        basePrice: c ? (Number(c.basePrice) || 10) : 10,
        prodPerMin: 0,
        consPerMin: 0,
        netPerMin: 0,
        stockU: 0,
        reservedU: 0,
        exportingSites: 0,
        linkedOut: 0,
        bottleneck: 'balanced',
      };
    }
    return rowsByGood[goodId];
  };

  if (sites && sites.byId) {
    for (const siteId of sites.order || []) {
      const site = sites.byId[siteId];
      if (!site || !site.anchored) continue;
      if (sectorId && site.sectorId && site.sectorId !== sectorId) continue;

      const rt = typeof sitesSys._runtime === 'function' ? sitesSys._runtime(site) : null;
      const defStats = siteDefenseTotals(site, mods);
      totalDefenseRating += defStats.totalDefenseRating;
      totalDrones += (site.drones || []).length;

      let siteGenMw = 0;
      let siteDrawMw = 0;
      // Good neighbours speed every machine in the rock (NEIGHBOUR_RULES). The ledger carries the
      // same multiplier the tick applies, so the rock card, the supply tab and the balancer all
      // show the rate the rock really runs at once a line is drawn.
      const neighbourMult = typeof sitesSys.neighbourLift === 'function'
        ? (Number(sitesSys.neighbourLift(site).mult) || 1) : 1;
      const produces = new Set();
      const consumes = new Set();
      const prodByGood = {};
      const consByGood = {};
      let dark = 0;

      // Add orbital power and regocrete barge passive production
      for (const d of site.defenses || []) {
        const spec = BELT_ORBITAL_STRUCTURES[d?.kind];
        if (!spec) continue;
        const pDelta = (Number(spec.powerDeltaMw) || 0) * (spec.role === 'power' ? (weather.powerMult || 1) : 1);
        if (pDelta > 0) siteGenMw += pDelta;
        else if (pDelta < 0) siteDrawMw += Math.abs(pDelta);
        if (spec.passiveRegocretePerMin > 0) {
          const rRow = ensureGoodRow('cmdty_regocrete');
          rRow.prodPerMin = round3(rRow.prodPerMin + spec.passiveRegocretePerMin);
          prodByGood.cmdty_regocrete = round3((prodByGood.cmdty_regocrete || 0) + spec.passiveRegocretePerMin);
          produces.add('cmdty_regocrete');
        }
        if (d.kind === 'orbital_shipyard') hasTier3OrDrydock = true;
      }

      // Harvester drone raw production rate estimate
      if (defStats.harvesterCount > 0) {
        const droneRate = defStats.harvesterCount * BELT_DRONE_TYPES.harvester.harvestRatePerMin * (1 + mods.droneEfficiencyMult);
        const dRow = ensureGoodRow('cmdty_ore_iron');
        dRow.prodPerMin = round3(dRow.prodPerMin + droneRate);
        prodByGood.cmdty_ore_iron = round3((prodByGood.cmdty_ore_iron || 0) + droneRate);
        produces.add('cmdty_ore_iron');
      }

      let shareByNet = null;
      const networkShare = (key) => {
        if (!shareByNet) {
          shareByNet = {};
          for (const comp of rt?.powerComps || []) {
            let gen = 0;
            let draw = 0;
            for (const mid of comp.machineIds) {
              const pm = (site.machines || []).find((x) => x.id === mid);
              const pdef = pm && SITE_MACHINE_BY_ID.get(pm.defId);
              if (!pdef) continue;
              const pcap = machineCapability(pdef, rt?.geo?.[pm.id] || null, pm.mode);
              gen += pcap.powerGen || 0;
              draw += (pcap.powerDraw || 0) * (1 - (mods.powerDrawDiscount || 0));
            }
            shareByNet[comp.key] = draw > 0 ? Math.max(0, Math.min(1, gen / draw)) : 1;
          }
        }
        return shareByNet[key] ?? 1;
      };

      // Machines inside the asteroid
      for (const m of site.machines || []) {
        const def = SITE_MACHINE_BY_ID.get(m.defId);
        if (!def) continue;
        if (m.defId === 'sm_deep_synthesizer') hasTier3OrDrydock = true;
        const geo = rt?.geo?.[m.id] || null;
        const cap = machineCapability(def, geo, m.mode);
        const pk = rt?.powerCompByMachine?.[m.id];
        const status = rt?.status?.[m.id];
        // The tick keeps each power network's served share; a read view has never ticked, so it
        // works the share out from the network's own machines (generation over draw).
        const ratio = status && Number.isFinite(status.powerRatio)
          ? status.powerRatio
          : (pk != null ? (rt?.compRatio?.[pk] ?? networkShare(pk)) : 1);
        siteGenMw += cap.powerGen || 0;
        siteDrawMw += (cap.powerDraw || 0) * (1 - (mods.powerDrawDiscount || 0));

        const rec = m.mode ? SITE_RECIPE_BY_ID.get(m.mode) : null;
        // A machine with no power makes nothing. Its rated output is not production: counting
        // it told the player a rock made 6 a minute while its stores stayed empty.
        const makesGoods = !!rec || Object.keys(cap.outputsPerMin || {}).length > 0;
        if (makesGoods && (cap.powerDraw || 0) > 0 && ratio <= 0) dark += 1;
        if (rec) {
          const procMult = Math.max(0.25, cap.processMultiplier || 1);
          const inputSum = Math.max(1, Object.values(rec.inputs || {}).reduce((s, q) => s + q, 0));
          const batchesPerMin = (rec.inputRatePerMin
            ? ((rec.inputRatePerMin / inputSum) * procMult * ratio)
            : ((60 / Math.max(1, rec.buildS || 60)) * procMult * ratio)) * neighbourMult;
          for (const [inGood, qty] of Object.entries(rec.inputs || {})) {
            const cRate = qty * batchesPerMin;
            const row = ensureGoodRow(inGood);
            row.consPerMin = round3(row.consPerMin + cRate);
            consByGood[inGood] = round3((consByGood[inGood] || 0) + cRate);
            consumes.add(inGood);
          }
          const outMap = rec.output || rec.outputs || {};
          for (const [outGood, qty] of Object.entries(outMap)) {
            if (!COMMODITY_BY_ID.has(outGood)) continue;
            const pRate = qty * batchesPerMin;
            const row = ensureGoodRow(outGood);
            row.prodPerMin = round3(row.prodPerMin + pRate);
            prodByGood[outGood] = round3((prodByGood[outGood] || 0) + pRate);
            produces.add(outGood);
          }
        } else if (cap.outputsPerMin) {
          for (const [outGood, baseRate] of Object.entries(cap.outputsPerMin)) {
            if (!COMMODITY_BY_ID.has(outGood)) continue;
            const pRate = baseRate * (1 + mods.extractorYieldMult) * ratio * neighbourMult;
            const row = ensureGoodRow(outGood);
            row.prodPerMin = round3(row.prodPerMin + pRate);
            prodByGood[outGood] = round3((prodByGood[outGood] || 0) + pRate);
            produces.add(outGood);
          }
        }
      }

      // Stock & reserves
      const siteStock = {};
      for (const ls of site.laneStores || []) {
        for (const [g, q] of Object.entries(ls?.store || {})) {
          const qty = Number(q) || 0;
          if (qty <= 0) continue;
          siteStock[g] = (siteStock[g] || 0) + qty;
          const row = ensureGoodRow(g);
          row.stockU = round3(row.stockU + qty);
        }
      }
      for (const [g, minU] of Object.entries(site.reserves || {})) {
        const res = Math.max(0, Number(minU) || 0);
        if (res > 0) ensureGoodRow(g).reservedU += res;
      }
      for (const g of produces) {
        if (!site.exportOff?.[g]) ensureGoodRow(g).exportingSites += 1;
      }

      const activeLinks = (site.links || []).filter((l) => l && l.active !== false);
      activeLinkCount += activeLinks.length;
      for (const l of activeLinks) {
        if (l.kind === 'material' && l.goodId && rowsByGood[l.goodId]) {
          rowsByGood[l.goodId].linkedOut += 1;
        }
      }

      totalPowerGenMw = round3(totalPowerGenMw + siteGenMw);
      totalPowerDrawMw = round3(totalPowerDrawMw + siteDrawMw);

      siteSummaries.push({
        siteId: site.id,
        asteroidId: site.asteroidId,
        genMw: round3(siteGenMw),
        drawMw: round3(siteDrawMw),
        netMw: round3(siteGenMw - siteDrawMw),
        produces: Array.from(produces),
        consumes: Array.from(consumes),
        prodByGood,
        consByGood,
        stock: siteStock,
        defenseRating: defStats.totalDefenseRating,
        darkMachines: dark,
        exportedU: Number(site.stats?.exportedU) || 0,
      });
    }
  }

  const commodities = Object.values(rowsByGood)
    .map((r) => {
      const net = round3(r.prodPerMin - r.consPerMin);
      let bottleneck = 'balanced';
      if (r.consPerMin > r.prodPerMin + 0.1 && r.stockU < 5) bottleneck = 'deficit';
      else if (r.prodPerMin > r.consPerMin + 0.15) bottleneck = 'surplus';
      return { ...r, netPerMin: net, bottleneck };
    })
    .sort((a, b) => Math.abs(b.netPerMin) - Math.abs(a.netPerMin) || a.goodId.localeCompare(b.goodId));

  return {
    sectorId,
    siteCount: siteSummaries.length,
    activeLinkCount,
    totalPowerGenMw,
    totalPowerDrawMw,
    netPowerMw: round3(totalPowerGenMw - totalPowerDrawMw),
    totalDefenseRating,
    totalDrones,
    hasTier3OrDrydock,
    commodities,
    sites: siteSummaries,
  };
}

function evaluateCharterProgress(tpl, matrix, empire) {
  const req = tpl.requirement || {};
  if (req.type === 'site_count') return matrix.siteCount;
  if (req.type === 'active_links') return matrix.activeLinkCount;
  if (req.type === 'defense_rating') return matrix.totalDefenseRating;
  if (req.type === 'drone_count') return matrix.totalDrones;
  if (req.type === 'fabricate_tier3') return matrix.hasTier3OrDrydock ? 1 : 0;
  if (req.type === 'export_units') {
    const goodRow = matrix.commodities.find((c) => c.goodId === req.goodId);
    const stocked = goodRow ? Math.floor(goodRow.stockU) : 0;
    const shipped = matrix.sites.reduce((s, x) => s + Math.floor(x.exportedU || 0), 0);
    return Math.max(stocked, Math.min(req.target, stocked + Math.floor(shipped * 0.5)));
  }
  return 0;
}

/**
 * Step sector-level belt weather transitions, raid security pressure checks,
 * and active Industrial Charter payouts.
 */
export function stepBeltEmpireSector(sitesSys, state, dtS) {
  if (!state?.sites) return;
  const simT = Math.max(0, Number(state.simTime) || 0);
  const empire = ensureEmpireState(state.sites, simT);
  const mods = getEmpireModifiers(empire);

  // 1. Deterministic weather cycle progression
  if (simT >= empire.weather.endsAt) {
    const nextCycle = (empire.weather.cycle || 0) + 1;
    const seed = (state.meta && state.meta.seed) || 4242;
    const idx = hash32(seed, 'belt-weather', nextCycle) % BELT_WEATHER_TYPES.length;
    const wDef = BELT_WEATHER_TYPES[idx] || BELT_WEATHER_TYPES[0];
    empire.weather = {
      id: wDef.id,
      startedAt: Math.round(simT),
      endsAt: Math.round(simT) + (wDef.durationS || 120),
      cycle: nextCycle,
    };
    sitesSys.bus?.emit?.('site:weatherChanged', { ...empire.weather, name: wDef.name });
  }

  const sectorId = state.world?.currentSectorId || null;
  const matrix = computeSectorSupplyMatrix(sitesSys, sectorId);

  // 2. Charter contract progress & payout settlement
  if (empire.activeCharters.length > 0) {
    const stillActive = [];
    for (const active of empire.activeCharters) {
      const tpl = CHARTER_BY_ID.get(active.id);
      if (!tpl) continue;
      if (empire.completedCharters.includes(tpl.id)) continue;
      const prog = evaluateCharterProgress(tpl, matrix, empire);
      active.progress = Math.min(tpl.requirement.target, Math.round(prog));
      if (active.progress >= tpl.requirement.target) {
        empire.completedCharters.push(tpl.id);
        empire.stats.chartersCompleted = (empire.stats.chartersCompleted || 0) + 1;
        const payout = Math.round(tpl.rewardCredits * (1 + (mods.charterPayoutBonus || 0)));
        sitesSys.bus?.emit?.('economy:grantCredits', {
          amount: payout,
          reason: `belt:charter:${tpl.id}`,
        });
        sitesSys.bus?.emit?.('site:charterCompleted', {
          charterId: tpl.id,
          name: tpl.name,
          rewardCredits: payout,
        });
      } else {
        stillActive.push(active);
      }
    }
    empire.activeCharters = stillActive;
  }

  // 3. Periodic deterministic raid check across dense belts
  const raidInterval = 180;
  if (simT - (empire.raidStatus.lastCheckT || 0) >= raidInterval) {
    empire.raidStatus.lastCheckT = Math.round(simT);
    const sectorObj = sectorId ? SECTOR_BY_ID.get(sectorId) : null;
    const danger = sectorObj ? dangerIndex(sectorObj) : 0.2;
    empire.raidStatus.pressure = matrix.siteCount >= 2 ? Math.round(25 + matrix.siteCount * 15 + danger * 10) : 0;
    if (matrix.siteCount >= 2) {
      const guard = `Guard ${matrix.totalDefenseRating} of ${empire.raidStatus.pressure} needed.`;
      let hit = null;
      if (matrix.totalDefenseRating >= empire.raidStatus.pressure) {
        empire.raidStatus.mitigated = (empire.raidStatus.mitigated || 0) + 1;
        empire.raidStatus.lastMessage = `Raiders looked this belt over and left. ${guard}`;
      } else {
        empire.raidStatus.losses = (empire.raidStatus.losses || 0) + 1;
        const shortfall = 1 - (matrix.totalDefenseRating / Math.max(1, empire.raidStatus.pressure));
        hit = raidWorstGuardedRock(sitesSys, sectorId, matrix, shortfall);
        empire.raidStatus.lastMessage = hit
          ? `Raiders took ${hit.units} units from your worst-guarded rock. ${guard}`
          : `Raiders came through and found nothing worth taking. ${guard}`;
      }
      sitesSys.bus?.emit?.('site:raidChecked', { ...empire.raidStatus });
      if (hit) sitesSys.bus?.emit?.('site:raided', { ...hit, sectorId });
    }
  }
}

/**
 * A raid the belt's guard rating failed to turn away. Raiders go for the rock that is guarded
 * worst (ties: the one holding most), and carry off up to RAID_RULES.lootShare of each good
 * waiting there (less, the closer the belt's guard came to what was needed), from the dock stage
 * first and then the lane stores. Whole units only. Machines, cables
 * and the rock itself are never touched: a raid costs stock, and a turret or a patrol drone on
 * that rock is how a player answers it. Deterministic: no roll, no clock.
 */
export function raidWorstGuardedRock(sitesSys, sectorId, matrix, shortfall = 1) {
  // How far short the belt's guard fell (0..1): part of a guard keeps part of the stock.
  const share = RAID_RULES.lootShare * Math.max(0, Math.min(1, Number.isFinite(shortfall) ? shortfall : 1));
  const byId = sitesSys?.state?.sites?.byId;
  if (!byId || !matrix || !Array.isArray(matrix.sites)) return null;
  let target = null;
  for (const row of matrix.sites) {
    const site = byId[row.siteId];
    if (!site || !site.anchored) continue;
    const stores = raidableStores(sitesSys, site);
    const stock = stores.reduce((s, store) => s + storeTotal(store), 0);
    if (stock < RAID_RULES.minStockU) continue;
    const guard = Number(row.defenseRating) || 0;
    if (!target || guard < target.guard || (guard === target.guard && stock > target.stock)
      || (guard === target.guard && stock === target.stock && site.id < target.site.id)) {
      target = { site, stores, stock, guard };
    }
  }
  if (!target) return null;
  const taken = {};
  let units = 0;
  for (const store of target.stores) {
    for (const goodId of Object.keys(store).sort()) {
      const loot = Math.floor((Number(store[goodId]) || 0) * share);
      if (loot <= 0) continue;
      store[goodId] = (Number(store[goodId]) || 0) - loot;
      if (store[goodId] <= 1e-9) delete store[goodId];
      taken[goodId] = (taken[goodId] || 0) + loot;
      units += loot;
    }
  }
  if (!units) return null;
  if (!target.site.stats) target.site.stats = {};
  target.site.stats.raidedU = (Number(target.site.stats.raidedU) || 0) + units;
  sitesSys._ledger?.(target.site, 'bad',
    `Raiders took ${units} units. A turret or a patrol drone on this rock turns them away.`);
  return { siteId: target.site.id, asteroidId: target.site.asteroidId ?? null, taken, units, guard: target.guard };
}

function raidableStores(sitesSys, site) {
  const out = [];
  if (site.exportBuffer && typeof site.exportBuffer === 'object') out.push(site.exportBuffer);
  if (typeof sitesSys._runtime === 'function') sitesSys._runtime(site);
  for (const lane of Array.isArray(site.laneStores) ? site.laneStores : []) {
    if (lane && lane.store && typeof lane.store === 'object') out.push(lane.store);
  }
  return out;
}

/**
 * Mindustry-style automatic sector supply balancer: links surplus power sites to power-deficit
 * neighbors, connects raw/intermediate producers to matching downstream consumers, and configures
 * sane feedstock reserve floors.
 */
export function autoBalanceSectorNetwork(sitesSys, sectorId = null) {
  const state = sitesSys?.state;
  const targetSector = sectorId || state?.world?.currentSectorId || null;
  const matrix = computeSectorSupplyMatrix(sitesSys, targetSector);
  const actions = [];
  let linksCreated = 0;
  let linksUpdated = 0;
  let reservesTuned = 0;

  // Compute max tether span between two sites (factoring mass relays)
  const effectiveRange = (aSite, bSite) => {
    const aRelays = (aSite.defenses || []).filter((d) => d?.kind === 'mass_relay').length;
    const bRelays = (bSite.defenses || []).filter((d) => d?.kind === 'mass_relay').length;
    return SITE_BALANCE.linkRangeWu * (aRelays > 0 || bRelays > 0 ? BELT_ORBITAL_STRUCTURES.mass_relay.linkRangeMult : 1);
  };

  const distanceBetween = (aSiteId, bSiteId) => {
    const aSite = sitesSys.getSite(aSiteId);
    const bSite = sitesSys.getSite(bSiteId);
    if (!aSite || !bSite) return Infinity;
    const pA = resolveEntityPos(state, aSite.asteroidId, aSite.anchor);
    const pB = resolveEntityPos(state, bSite.asteroidId, bSite.anchor);
    if (!pA || !pB) return 0; // offline test fixtures without entities stay eligible
    return Math.hypot(pA.x - pB.x, pA.z - pB.z);
  };

  // 1. Power balance links: surplus -> deficit
  const powerSurplus = matrix.sites.filter((s) => s.netMw >= 2).sort((a, b) => b.netMw - a.netMw);
  const powerDeficit = matrix.sites.filter((s) => s.netMw <= 0).sort((a, b) => a.netMw - b.netMw);
  for (const dst of powerDeficit) {
    const dstSite = sitesSys.getSite(dst.siteId);
    if (!dstSite) continue;
    for (const src of powerSurplus) {
      if (src.siteId === dst.siteId || src.netMw < 2) continue;
      const srcSite = sitesSys.getSite(src.siteId);
      if (!srcSite) continue;
      if (distanceBetween(src.siteId, dst.siteId) > effectiveRange(srcSite, dstSite)) continue;
      const already = (srcSite.links || []).some((l) => l && l.targetSiteId === dst.siteId && l.kind === 'power');
      if (already) continue;
      const res = sitesSys.setSiteLink(src.siteId, dst.siteId, 'power');
      if (res && res.ok) {
        linksCreated++;
        src.netMw -= 2;
        actions.push(`Power tether: ${src.siteId} -> ${dst.siteId}`);
        break;
      }
    }
  }

  // 2. Material supply links: producer -> consumer
  for (const dst of matrix.sites) {
    const dstSite = sitesSys.getSite(dst.siteId);
    if (!dstSite || !dst.consumes.length) continue;
    for (const neededGood of dst.consumes) {
      if (dst.produces.includes(neededGood)) {
        const resFloor = sitesSys.setReserveFloor(dst.siteId, neededGood, Math.max(10, Number(dstSite.reserves?.[neededGood]) || 0));
        if (resFloor?.ok) reservesTuned++;
        if ((dst.prodByGood?.[neededGood] || 0) >= (dst.consByGood?.[neededGood] || 0)) {
          continue;
        }
      }
      // Find closest producer or stockholder in sector
      let bestSrc = null;
      let bestDist = Infinity;
      for (const src of matrix.sites) {
        if (src.siteId === dst.siteId) continue;
        const hasGood = src.produces.includes(neededGood) || (src.stock[neededGood] || 0) >= 2;
        if (!hasGood) continue;
        const srcSite = sitesSys.getSite(src.siteId);
        if (!srcSite) continue;
        const dist = distanceBetween(src.siteId, dst.siteId);
        if (dist <= effectiveRange(srcSite, dstSite) && dist < bestDist) {
          bestDist = dist;
          bestSrc = src;
        }
      }
      if (!bestSrc) continue;
      const srcSite = sitesSys.getSite(bestSrc.siteId);
      const existing = (srcSite.links || []).find((l) => l && l.targetSiteId === dst.siteId && l.kind === 'material');
      if (existing && existing.goodId === neededGood) continue;
      const res = sitesSys.setSiteLink(bestSrc.siteId, dst.siteId, 'material', neededGood);
      if (res && res.ok) {
        if (existing) linksUpdated++;
        else linksCreated++;
        actions.push(`Material line (${neededGood}): ${bestSrc.siteId} -> ${dst.siteId}`);
      }
    }
  }

  const empire = ensureEmpireState(state?.sites, state?.simTime || 0);
  empire.stats.autoLinksBuilt = (empire.stats.autoLinksBuilt || 0) + linksCreated;

  return {
    ok: true,
    sectorId: targetSector,
    linksCreated,
    linksUpdated,
    reservesTuned,
    actions,
    matrix: computeSectorSupplyMatrix(sitesSys, targetSector),
  };
}
