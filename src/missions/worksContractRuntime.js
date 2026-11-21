// Works contracts at run time. The catalog and the words live in src/data/worksContracts.js; this
// file turns the rover's, the site system's and the planet's own events into progress on an active
// works contract. It owns nothing but the mission's `params.works` record: ore is granted by the
// drill, machines are built by the site system, and payment is settled by missions.
import { ROWS } from '../systems/drillFieldModel.js';
import {
  WORKS_CONTRACT_SOURCE, WORKS_CONTRACT_TYPE, WORKS_CONTRACTS,
  worksBonusCr, worksBonusName, worksBonusState, worksBonusTotal, worksContractOpen,
  worksGoodName, worksMachineName, worksObjectiveTarget, worksOfferFor,
} from '../data/worksContracts.js';
import { PLANET_SITE } from '../data/planets.js';
import { ZONE_TETHYS_ANVIL } from '../data/authoredPlaces.js';
import { sectorLocalToGlobalForSector } from '../data/sectorCoordinates.js';
import { resolveBoreFamily } from '../systems/drillFieldModel.js';

export { WORKS_CONTRACT_TYPE, WORKS_CONTRACT_SOURCE };

export const isWorksContract = (mission) => !!mission && mission.type === WORKS_CONTRACT_TYPE
  && !!(mission.params && mission.params.works);

const flagsOf = (state) => {
  const story = state.story || (state.story = {});
  const flags = story.flags || (story.flags = {});
  return flags.worksContracts || (flags.worksContracts = {});
};

/** Keep a station's board in step with what is open: post what is missing, pull what has closed. */
export function syncWorksContractOffers(owner, info, board) {
  if (!info || !board || !Array.isArray(board.slots)) return false;
  const state = owner.state;
  if (state.run?.kind === 'survival') return false;
  const active = (state.missions.active || []).filter((m) => m && m.status === 'active' && isWorksContract(m));
  let changed = false;
  for (const row of WORKS_CONTRACTS) {
    if (row.stationId !== info.id) continue;
    const index = board.slots.findIndex((offer) => offer && offer.params && offer.params.works
      && offer.params.works.id === row.id);
    const want = worksContractOpen(state, row) && !active.some((m) => m.params.works.id === row.id);
    if (want && index < 0) {
      const offer = worksOfferFor(row.id, state);
      if (offer) { board.slots.push(offer); changed = true; }
    } else if (!want && index >= 0) {
      board.slots.splice(index, 1);
      changed = true;
    }
  }
  return changed;
}

/** Accept-time check: a kit needs room in the hold, so the parts are never silently short. */
export function worksContractPreflight(owner, offer) {
  const works = offer && offer.params && offer.params.works;
  if (!works) return { ok: true };
  const active = (owner.state.missions.active || []).some((m) => m && m.status === 'active'
    && isWorksContract(m) && m.params.works.id === works.id);
  if (active) return { ok: false, reason: 'You are already working this contract.' };
  return { ok: true };
}

/** Load the fronted parts. A short hold is said out loud and the rest waits at the desk's price. */
export function grantWorksKit(owner, mission, addCargo) {
  const works = mission.params.works;
  mission.chainNextSeed = null;
  if (!works.kit || works.kitGranted) return;
  const short = [];
  for (const [goodId, qty] of Object.entries(works.kit)) {
    const got = addCargo(owner.state, goodId, qty);
    if (got < qty) short.push(`${qty - got} ${worksGoodName(goodId)}`);
  }
  works.kitGranted = true;
  owner.bus.emit('toast', short.length
    ? { text: `Parts loaded, but the hold was full: ${short.join(', ')} left on the dock. Buy them at any station.`, kind: 'warn', ttl: 7 }
    : { text: 'Construction parts loaded for this claim.', kind: 'good', ttl: 4 });
}

function eachActive(owner, fn) {
  const active = owner.state.missions.active || [];
  for (let i = active.length - 1; i >= 0; i--) {
    const mission = active[i];
    if (!mission || mission.status !== 'active' || !isWorksContract(mission)) continue;
    fn(mission, i, mission.params.works);
  }
}

const inWorkSector = (owner, mission) => owner.state.world
  && owner.state.world.currentSectorId === mission.destSectorId;

function touch(owner, mission) {
  owner._refreshTrackedMissionNav(mission);
  owner.bus.emit('mission:updated', { missionId: mission.id, objectiveProgress: mission.objectiveProgress });
}

function advance(owner, mission, index, amount) {
  mission.objectiveProgress = Math.min(mission.objectiveTarget, (Number(mission.objectiveProgress) || 0) + amount);
  if (mission.objectiveProgress >= mission.objectiveTarget) settle(owner, mission, index);
  else touch(owner, mission);
}

function settle(owner, mission, index) {
  const works = mission.params.works;
  const earned = [];
  for (const term of works.bonus || []) {
    if (!worksBonusState(works, term).ok) continue;
    earned.push({ kind: term.kind, name: worksBonusName(term), cr: worksBonusCr(works, term) });
  }
  works.bonusEarned = earned;
  works.bonusCr = worksBonusTotal(works);
  // The contract is paid as one figure: base plus every bonus term that still stands.
  mission.reward_cr = (Number(works.baseRewardCr) || 0) + works.bonusCr;
  const record = flagsOf(owner.state);
  record[works.id] = (Number(record[works.id]) || 0) + 1;
  owner._completeMission(mission, index);
  if (mission.status !== 'completed') {
    // A blocking term kept it open; the count is restored when it actually settles.
    record[works.id] = Math.max(0, record[works.id] - 1);
    return;
  }
  for (const item of earned) {
    owner.bus.emit('toast', { text: `${item.name}: +${item.cr} cr`, kind: 'good', ttl: 5 });
  }
  const missed = (works.bonus || []).filter((term) => !worksBonusState(works, term).ok);
  if (missed.length) {
    owner.bus.emit('toast', {
      text: `Bonus missed: ${missed.map((term) => worksBonusState(works, term).text).join(', ')}.`,
      kind: 'info', ttl: 5,
    });
  }
}

// ── The rover ───────────────────────────────────────────────────────────────────────────────────

/** Ore the rover banked. `p.pos` is the board cell, so a depth term can be read straight off it. */
export function onWorksDrillYield(owner, p) {
  if (!p || !p.commodityId || !(p.qty > 0)) return;
  eachActive(owner, (mission, index, works) => {
    const goal = works.goal;
    if (goal.kind !== 'cut' || goal.ore !== p.commodityId || !inWorkSector(owner, mission)) return;
    if (Number.isFinite(goal.minDepth) && p.pos && Number.isFinite(p.pos.row)
      && p.pos.row / Math.max(1, ROWS - 1) < goal.minDepth) return;
    advance(owner, mission, index, p.qty);
  });
}

/** A cell the pilot opened, by the bit or by a charge. A roof that fell on its own is not a stroke. */
export function onWorksDrillBreak(owner, p) {
  if (!p || p.cave) return;
  eachActive(owner, (mission, index, works) => {
    if (!inWorkSector(owner, mission)) return;
    const counts = (works.bonus || []).some((term) => term.kind === 'par');
    if (counts) {
      const before = works.cells | 0;
      works.cells = before + 1;
      const par = works.bonus.find((term) => term.kind === 'par');
      if (before <= par.cells && works.cells > par.cells) {
        owner.bus.emit('toast', { text: `${mission.title}: over ${par.cells} cells. The light-dig bonus is gone.`, kind: 'warn', ttl: 5 });
      }
    }
    if (works.goal.kind === 'blast' && p.blast) advance(owner, mission, index, 1);
    else if (counts) touch(owner, mission);
  });
}

export function onWorksGasHit(owner) {
  eachActive(owner, (mission, _index, works) => {
    if (!inWorkSector(owner, mission)) return;
    const first = !(works.breaches > 0);
    works.breaches = (works.breaches | 0) + 1;
    if (first && (works.bonus || []).some((term) => term.kind === 'sealed')) {
      owner.bus.emit('toast', { text: `${mission.title}: gas breached. The sealed-rock bonus is gone.`, kind: 'warn', ttl: 5 });
      touch(owner, mission);
    }
  });
}

export function onWorksRigHurt(owner) {
  eachActive(owner, (mission, _index, works) => {
    if (!inWorkSector(owner, mission)) return;
    const first = !(works.hurt > 0);
    works.hurt = (works.hurt | 0) + 1;
    if (first && (works.bonus || []).some((term) => term.kind === 'unhurt')) touch(owner, mission);
  });
}

// ── Machines inside the rock ────────────────────────────────────────────────────────────────────

function machineContacts(owner, siteId, machineId) {
  const sites = owner.registry && owner.registry.get && owner.registry.get('asteroidSites');
  const projection = sites && typeof sites.projection === 'function' ? sites.projection(siteId) : null;
  const machine = projection && (projection.machines || []).find((m) => m && m.id === machineId);
  const geo = machine && machine.geo;
  if (!geo) return null;
  const ore = Object.values(geo.ores || {}).reduce((sum, n) => sum + n, 0);
  return { solid: geo.solid | 0, gas: geo.gas | 0, ore, matrix: geo.matrix | 0, basalt: geo.basalt | 0 };
}

function contactsShort(need, have) {
  const parts = [];
  if (need.solid && have.solid < need.solid) parts.push(`${have.solid} of ${need.solid} solid cells`);
  if (need.ore && have.ore < need.ore) parts.push(`${have.ore} of ${need.ore} ore veins`);
  if (need.gas && have.gas < need.gas) parts.push(`${have.gas} of ${need.gas} gas cells`);
  return parts;
}

export function onWorksMachineInstalled(owner, p) {
  if (!p || !p.defId) return;
  eachActive(owner, (mission, index, works) => {
    const goal = works.goal;
    if (!inWorkSector(owner, mission)) return;
    if (goal.kind === 'installSet') {
      if (!goal.defs.includes(p.defId) || works.installed.includes(p.defId)) return;
      works.installed.push(p.defId);
      advance(owner, mission, index, 1);
      return;
    }
    if (goal.kind !== 'install' || goal.defId !== p.defId) return;
    const need = goal.contacts || {};
    const have = machineContacts(owner, p.siteId, p.machineId);
    if (!have) return;
    const short = contactsShort(need, have);
    if (short.length) {
      owner.bus.emit('toast', {
        text: `${mission.title}: this ${worksMachineName(p.defId)} touches ${short.join(' and ')}. Dismantle it and try a better bay.`,
        kind: 'info', ttl: 7,
      });
      return;
    }
    advance(owner, mission, index, 1);
  });
}

export function onWorksCourierDelivered(owner, p) {
  const units = Math.max(0, Math.floor(Number(p && p.units) || 0));
  if (!units) return;
  eachActive(owner, (mission, index, works) => {
    if (works.goal.kind === 'deliver') advance(owner, mission, index, units);
  });
}

export function onWorksLinkCreated(owner, p) {
  eachActive(owner, (mission, index, works) => {
    if (works.goal.kind !== 'link' || !inWorkSector(owner, mission)) return;
    if (works.goal.linkKind && p && p.kind && p.kind !== works.goal.linkKind) return;
    advance(owner, mission, index, 1);
  });
}

export function onWorksDefenseDeployed(owner, p) {
  eachActive(owner, (mission, index, works) => {
    if (works.goal.kind !== 'defense' || !inWorkSector(owner, mission)) return;
    const kind = p && p.defense && (p.defense.kind || p.defense.type);
    if (kind && kind !== 'turret') return;
    advance(owner, mission, index, 1);
  });
}

// ── Claims and power: read off the site system, not counted from events ─────────────────────────
// How many anchored claims stand in a sector, and how much one of them generates, are facts about
// the yard as it is now. A claim can already exist when the job is taken and can be lost while it
// is open, so these two goals are re-read on a slow beat instead of being counted up from events.
export const WORKS_SITE_POLL_TICKS = 60;
// Reading what a claim runs on costs a few milliseconds (it is the site system's full readout),
// so the power goal reads it once a second only for a short while after the yard changed, and
// otherwise on a slow safety beat. Counting claims is a record scan and keeps the fast beat.
export const WORKS_POWER_IDLE_POLL_TICKS = 1800;
export const WORKS_YARD_HOT_TICKS = 600;

/** A machine, sail, tether or claim changed somewhere: power goals look again for the next ten seconds. */
export function onWorksYardChanged(owner) {
  owner._worksYardHotUntil = (owner.state.tick | 0) + WORKS_YARD_HOT_TICKS;
}

/** Anchored claims standing in a sector, straight off the site records: a read, no projection. */
function anchoredClaims(owner, sectorId) {
  const sites = owner.state.sites;
  const byId = (sites && sites.byId) || {};
  const order = sites && Array.isArray(sites.order) ? sites.order : Object.keys(byId);
  const out = [];
  for (const id of order) {
    const site = byId[id];
    if (site && site.anchored && site.sectorId === sectorId) out.push(site);
  }
  return out;
}

/**
 * Per-tick drive for one works contract. Only the two yard goals do anything, on a beat kept as a
 * last-polled tick so a mission system that is not stepped on every tick still polls. Claims are
 * counted off the records. Power asks the site system for one claim at a time, never the
 * sector-wide summary (supply matrix, weather, empire), and only while the yard is changing.
 */
export function driveWorksContract(owner, mission, index) {
  const works = mission.params.works;
  const goal = works.goal;
  if (goal.kind !== 'claims' && goal.kind !== 'power') return;
  const tick = owner.state.tick | 0;
  const due = owner._worksSitePollDue || (owner._worksSitePollDue = new Map());
  const last = due.get(mission.id);
  const beat = goal.kind === 'claims' || tick < (owner._worksYardHotUntil | 0)
    ? WORKS_SITE_POLL_TICKS : WORKS_POWER_IDLE_POLL_TICKS;
  if (last != null && tick >= last && tick < last + beat) return;
  due.set(mission.id, tick);
  const claims = anchoredClaims(owner, mission.destSectorId);
  if (goal.kind === 'claims') {
    const held = Math.min(mission.objectiveTarget, claims.length);
    if (held === mission.objectiveProgress) return;
    mission.objectiveProgress = held;
    if (held >= mission.objectiveTarget) { due.delete(mission.id); settle(owner, mission, index); }
    else touch(owner, mission);
    return;
  }
  const sitesSys = owner.registry && owner.registry.get && owner.registry.get('asteroidSites');
  let best = 0;
  if (sitesSys && typeof sitesSys.projection === 'function') {
    for (const site of claims) {
      const view = sitesSys.projection(site.id);
      best = Math.max(best, Number(view && view.totalPowerGenMw) || 0);
    }
  }
  const rounded = Math.floor(best);
  if (best >= goal.mw) { works.bestMw = rounded; due.delete(mission.id); advance(owner, mission, index, 1); return; }
  if (rounded !== (works.bestMw | 0)) { works.bestMw = rounded; touch(owner, mission); }
}

// ── The planet ──────────────────────────────────────────────────────────────────────────────────

export function onWorksPlanetHarvest(owner, p) {
  if (!p || !p.commodityId || !(p.qty > 0)) return;
  eachActive(owner, (mission, index, works) => {
    if (works.goal.kind !== 'skim' || works.goal.commodityId !== p.commodityId) return;
    advance(owner, mission, index, p.qty);
  });
}

// ── Where the work is ───────────────────────────────────────────────────────────────────────────

const ANVIL_CENTRE = sectorLocalToGlobalForSector(ZONE_TETHYS_ANVIL.center, PLANET_SITE.sectorId);

function nearest(state, candidates) {
  const player = state.entities.get(state.playerId);
  const px = player && player.pos ? player.pos.x : 0;
  const pz = player && player.pos ? player.pos.z : 0;
  let best = null, bestD2 = Infinity;
  for (const entity of candidates) {
    const d2 = (entity.pos.x - px) ** 2 + (entity.pos.z - pz) ** 2;
    if (d2 < bestD2) { best = entity; bestD2 = d2; }
  }
  return best;
}

/** The marker for a works contract: the nearest rock that can actually do the job, or the planet. */
export function worksContractWaypoint(owner, mission) {
  if (!isWorksContract(mission)) return null;
  const state = owner.state;
  const works = mission.params.works;
  const goal = works.goal;
  const here = state.world && state.world.currentSectorId === mission.destSectorId;
  const out = { stationId: null, sectorId: mission.destSectorId };
  if (goal.kind === 'skim') {
    return { ...out, label: PLANET_SITE.name, pos: { x: ANVIL_CENTRE.x, z: ANVIL_CENTRE.z },
      reason: goal.commodityId === 'cmdty_gas_helium3'
        ? 'Scoop in the storm band, below the skim. Climb out to cool.'
        : 'Fly the skim band with the scoop open.' };
  }
  if (goal.kind === 'deliver') return { ...out, reason: 'Set goods to Ship at a powered Cargo Port on one of your claims.' };
  if (goal.kind === 'power') return { ...out, reason: 'Build power on one of your claims here: gas taps inside, solar sails outside, a tether from a second claim.' };
  if (!here) return { ...out, reason: 'The work is in this sector.' };
  const rocks = [];
  for (const entity of state.entityList || []) {
    if (!entity || entity.alive === false || entity.type !== 'asteroid' || !entity.pos) continue;
    const data = entity.data || {};
    if (goal.kind === 'link' || goal.kind === 'defense') { if (data.siteId) rocks.push(entity); continue; }
    if (goal.kind === 'claims') { if (!data.siteId) rocks.push(entity); continue; }
    if (goal.kind === 'cut' && works.rockTypes && works.rockTypes.length
      && !works.rockTypes.includes(resolveBoreFamily(data))) continue;
    rocks.push(entity);
  }
  const rock = nearest(state, rocks);
  const reason = goal.kind === 'cut' ? 'Fly up to this rock and press B to set the rover down.'
    : goal.kind === 'blast' ? 'Press B at this rock to set the rover down, then arm bore charges.'
      : goal.kind === 'link' ? 'Open Field Build over your claims.'
        : goal.kind === 'defense' ? 'Open Field Build over your claim.'
          : goal.kind === 'claims' ? 'Press B at this rock to set the rover down, then install a machine to anchor the claim.'
          : 'Press B at this rock to set the rover down, dig a bay, then build.';
  if (!rock) {
    return { ...out, reason: goal.kind === 'link' || goal.kind === 'defense'
      ? 'Stake a claim in this sector first.' : reason };
  }
  return { ...out, label: mission.title, targetEntityId: rock.id, pos: { x: rock.pos.x, z: rock.pos.z }, reason };
}

// ── Words after the job ─────────────────────────────────────────────────────────────────────────

export function worksContractDebrief(mission) {
  const works = mission && mission.params && mission.params.works;
  if (!works) return null;
  const goal = works.goal;
  const earned = (works.bonusEarned || []).map((item) => item.name.toLowerCase());
  const tail = earned.length ? ` Paid in full with the bonus for ${earned.join(' and ')}.` : '';
  switch (goal.kind) {
    case 'cut': return `${worksGoodName(goal.ore)} weighed in from one seam, cut by hand.${tail}`;
    case 'blast': return `The hall is open and the survey has measured it.${tail}`;
    case 'installSet': return 'The claim is registered in your name. What it earns from here is yours.';
    case 'install': return `The inspector read the ring around your ${worksMachineName(goal.defId)} and signed it off.`;
    case 'deliver': return 'Receiving counted every pod in. Your works can ship without you.';
    case 'link': return 'Two rocks, one supply. The claims desk has the line on its chart.';
    case 'defense': return 'The pylon is on the outpost’s watch list. Raiders can read that too.';
    case 'skim': return `${worksGoodName(goal.commodityId)} metered in at the exchange.`;
    case 'claims': return 'The desk has every one of those rocks on its chart, in your name.';
    case 'power': return 'The meter held at the mark. That claim can carry real machinery now.';
    default: return 'Work signed off and paid.';
  }
}

export function worksContractLossText() {
  return 'The contract lapsed. The desk will post it again.';
}

export { worksObjectiveTarget };
