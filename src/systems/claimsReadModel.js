// Shared claim read model; the claims system remains the sole state writer.
import { BODY_MODULE_BY_ID, BODY_SPECIALIZATION_BY_ID } from '../data/claimableBodies.js';
import { CLAIM_REFINERY_RECIPES, CLAIM_REFINERY_INPUT_IDS } from '../data/sites.js';
import { SECTORS, dangerIndex } from '../data/sectors.js';

// Refinery conversion uses two units of ore per refined unit.
export const REFINE_RATIO = 2;

// A full output store is a readout; the operating state stays active.
export const OUTPUT_STORE_FULL_LINE = 'Output store full — collect refined goods';

// Parked input that cannot form a whole batch is a recoverable stall.
export const INPUT_STARVED_LINE = 'Awaiting ore — next batch consumes ' + REFINE_RATIO + 'u of one refinable ore';

// One recipe book shared by the refinery tick and its readout.
export const CLAIM_RECIPES = CLAIM_REFINERY_RECIPES.map((r) => {
  const [outputId, outputU] = Object.entries(r.output)[0];
  return { id: r.id, inputs: r.inputs, outputId, outputU,
    batchU: Object.values(r.inputs).reduce((s, q) => s + q, 0),
    primaryInputId: Object.keys(r.inputs)[0] };
});

export const CLAIM_INPUT_SET = new Set(CLAIM_REFINERY_INPUT_IDS);

export function readyClaimRecipe(stock) {
  const have = stock || {};
  for (const r of CLAIM_RECIPES) {
    let ok = true;
    for (const id in r.inputs) { if (!((Number(have[id]) || 0) >= r.inputs[id])) { ok = false; break; } }
    if (ok) return r;
  }
  return null;
}

// Raid cadence and security/loss rules shared with the claim simulation.
export const SPEC_RAID_EVERY_S = 600;

export const RAID_SECURITY_FLOOR = 0.5;

export const SPEC_RAID_LOSS_FRAC = 0.7;

// Dry stores are tolerated briefly before depot support lapses.
export const DEPOT_SUPPORT_GRACE_S = 90;

export const DEPOT_PATROL_SHAPE_ID = 'patrol_beat';

// Concord owns the patrol shape in every sector.
export const DEPOT_PATROL_FACTION_ID = 'faction_scn';

// Position the rotation a third of the way along the lane.
export const DEPOT_PATROL_ANCHOR_FRAC = 0.35;

export const DEPOT_PATROL_ZONE_RADIUS_WU = 280;

export const DEPOT_PATROL_ID_PREFIX = 'depot-patrol:';

export const SECTOR_BY_ID = new Map(SECTORS.map((s) => [s.id, s]));

export function sumStore(bucket) {
  let total = 0;
  for (const id in bucket) total += bucket[id] || 0;
  return total;
}

// Unrefinable legacy input remains the player’s and is exposed for collection.
export function strandedInputUnits(bucket) {
  let total = 0;
  for (const id in bucket) {
    if (!CLAIM_INPUT_SET.has(id)) total += bucket[id] || 0;
  }
  return total;
}

// pTrip × (1 − pRepel) equals the legacy raid chance.
export function raidTripChance(danger, opts = {}) {
  const base = Math.min(Math.max((danger || 0) * 0.4, 0), 0.5);
  return opts.deterred ? base * 0.5 : base;
}

export function repelChance(defenseRating) {
  return 1 - 1 / Math.max(1, (defenseRating || 0) / 20);
}

// Battery, local garrison and active same-sector Bastion coverage.
export function claimDefenseRating(body, bodies = []) {
  if (!body) return 0;
  let rating = 0;
  const battery = BODY_MODULE_BY_ID.get('mod_defense');
  if (body.modules && body.modules.includes('mod_defense')) rating += (battery && battery.defenseRating) || 0;
  const bastionDef = BODY_SPECIALIZATION_BY_ID.get('spec_bastion');
  if (body.spec && body.spec.id === 'spec_bastion' && body.spec.status === 'active' && bastionDef) {
    rating += bastionDef.defenseBonus || 0;
  }
  if (bastionDef) {
    const covered = bodies.some((b) => b && b !== body && b.sectorId === body.sectorId
      && b.spec && b.spec.id === 'spec_bastion' && b.spec.status === 'active');
    if (covered) rating += bastionDef.coverageBonus || 0;
  }
  return rating;
}

export function cachedRelayDestination(body) {
  return body.linkedStationId || (body.spec && body.spec.destStationId) || null;
}

export const claimsReadMethods = {
  // Is the POI already claimed by the player?
  isClaimed(poiId) {
    return (this.state.claims.bodies || []).some((b) => b.poiId === poiId);
  },
  // Base readout uses the same risk and production rules as the writer.
  ledger(bodyId) {
    const bodies = (this.state.claims && this.state.claims.bodies) || [];
    const body = bodies.find((b) => b.id === bodyId);
    if (!body) return null;
    const spec = body.spec;
    const def = spec && BODY_SPECIALIZATION_BY_ID.get(spec.id);
    if (!spec || !def) {
      return { bodyId: body.id, name: body.name, specId: null, specName: null, status: null };
    }
    const t = this.state.simTime || 0;
    const sector = SECTOR_BY_ID.get(body.sectorId);
    const security = sector ? sector.security : 1;
    const danger = sector ? dangerIndex(sector) : 0;
    const rating = claimDefenseRating(body, bodies);
    const covered = bodies.some((b) => b !== body && b.sectorId === body.sectorId
      && b.spec && b.spec.id === 'spec_bastion' && b.spec.status === 'active');
    const deterred = (spec.deterrenceUntil || 0) > t;
    const meta = this.state.claims.meta;
    const strandedInputU = def.id === 'spec_refinery'
      ? strandedInputUnits(spec.store && spec.store.input)
      : 0;
    const out = {
      bodyId: body.id,
      name: body.name,
      specId: def.id,
      specName: def.name,
      status: spec.status,
      since: spec.since,
      upkeepPerMin: def.upkeepPerMin,
      upkeepDebt: Math.round(spec.upkeepDebt || 0),
      stores: {
        inputU: sumStore(spec.store.input),
        inputCapU: def.id === 'spec_refinery' ? def.inputCapU : (def.id === 'spec_relay' ? def.storeCapU : 0),
        outputU: sumStore(spec.store.output),
        outputCapU: def.id === 'spec_refinery' ? def.outputCapU : 0,
        strandedInputU,
      },
      flows: {
        refinedTotalU: spec.totals.refinedTotalU,
        soldTotalCr: spec.totals.soldTotalCr,
        lostTotalU: spec.totals.lostU,
        upkeepPaidCr: spec.totals.upkeepPaidCr,
        forwardedU: spec.totals.forwardedU || 0,
        receivedU: spec.totals.receivedU || 0,
      },
      defense: { rating, coveredByBastion: covered },
      risk: {
        security,
        raidEligible: !!sector && security < RAID_SECURITY_FLOOR,
        tripChance: raidTripChance(danger, { deterred }),
        repelChance: repelChance(rating),
        lossFrac: covered ? BODY_SPECIALIZATION_BY_ID.get('spec_bastion').coveredLossFrac : SPEC_RAID_LOSS_FRAC,
        deterredUntil: spec.deterrenceUntil || 0,
        nextRollInS: meta ? Math.max(0, SPEC_RAID_EVERY_S - (meta.raidAccum || 0)) : SPEC_RAID_EVERY_S,
      },
      convoy: spec.convoy
        ? { ...spec.convoy, etaS: Math.max(0, spec.convoy.arriveAt - t) }
        : null,
      throughput: null,
      readiness: null,
      infrastructure: body.infrastructure ? {
        id: body.infrastructure.id,
        name: body.infrastructure.name,
        stage: body.infrastructure.stage,
        operational: body.infrastructure.operational === true,
        stationId: body.infrastructure.stationId,
        stationName: this._stationName(body.infrastructure.stationId) || body.infrastructure.stationId,
        distanceWU: body.infrastructure.distanceWU,
        ceilingMult: body.infrastructure.ceilingMult,
        rampMult: body.infrastructure.rampMult,
        alignRemainingS: body.infrastructure.stage === 'aligning'
          ? Math.max(0, (body.infrastructure.alignUntil || 0) - t)
          : 0,
        damagePolicy: body.infrastructure.damagePolicy,
      } : null,
      depot: this._depotSupportReadout(body),
      lastEvent: spec.receipts.length ? spec.receipts[spec.receipts.length - 1] : null,
      receipts: spec.receipts.slice(),
    };
    // A full store is a readout, not a mode change; input that cannot cover the next
    // real conversion reads out the same way. Cold and raided sites keep their word.
    if (def.id === 'spec_refinery') {
      const ready = this._refineryReadiness(spec, def);
      out.throughput = {
        refineRatePerS: def.refineRatePerS,
        refineRatio: REFINE_RATIO,
        nextBatch: {
          goodId: ready.nextOre,
          inputU: ready.recipe ? ready.recipe.batchU : REFINE_RATIO,
          outputU: ready.recipe ? ready.recipe.outputU : 1,
          recipeId: ready.recipe ? ready.recipe.id : null,
        },
      };
      if (spec.status === 'active') {
        if (ready.outputRoomU <= 0) out.status = OUTPUT_STORE_FULL_LINE;
        else if (ready.starved) out.status = INPUT_STARVED_LINE;
      }
    } else if (def.id === 'spec_relay') {
      out.throughput = {
        convoyLoadU: def.convoyLoadU,
        minLoadU: def.minLoadU,
        dispatchEveryS: def.dispatchEveryS,
        transitS: def.transitS,
        saleFee: def.saleFee,
        destStationId: this._relayDestination(body, { resolve: false }),
      };
    } else if (def.id === 'spec_bastion') {
      out.readiness = {
        coveredBodies: bodies.filter((b) => b.sectorId === body.sectorId && b.spec).length,
        defenseBonus: def.defenseBonus,
        coverageBonus: def.coverageBonus,
        active: spec.status === 'active',
      };
    }
    return out;
  },
  // Shared next-batch, output-room and input-starvation read.
  _refineryReadiness(spec, def) {
    // Pure readout — tolerate a spec whose store has not been materialized yet and report
    // "nothing held" instead of crashing the tick.
    const input = (spec.store && spec.store.input) || {};
    const output = (spec.store && spec.store.output) || {};
    const recipe = readyClaimRecipe(input);
    const outputRoomU = Math.max(0, def.outputCapU - sumStore(output));
    return {
      recipe,
      nextOre: recipe ? recipe.primaryInputId : null,
      outputRoomU,
      working: !!recipe && outputRoomU > 0,
      // Parked freight or an in-flight partial batch with no whole conversion
      // available is a stall; a never-stocked site simply idles.
      starved: !recipe && (sumStore(input) > 0 || (spec.acc || 0) > 0),
    };
  },
  _stationName(stationId) {
    if (!stationId) return null;
    const byStationId = this.state.entityIndex && this.state.entityIndex.byStationId;
    const indexed = byStationId && byStationId.get(stationId);
    if (indexed && indexed.alive && indexed.type === 'station' && indexed.data) return indexed.data.name || stationId;
    const stations = (this.state.entityIndex && this.state.entityIndex.stations) || this.state.entityList;
    for (const e of stations) {
      if (e.alive && e.type === 'station' && e.data && e.data.stationId === stationId) return e.data.name || stationId;
    }
    return stationId;
  },
  _depotStocked(body) {
    const spec = body && body.spec;
    if (!spec || spec.id !== 'spec_relay' || spec.status !== 'active') return false;
    if (sumStore(spec.store.input) > 0) return true;
    return !!(spec.convoy && spec.convoy.qty > 0);
  },
  _depotSupportReadout(body) {
    const ds = body && body.depotSupport;
    if (!ds) return null;
    const t = this.state.simTime || 0;
    return {
      supported: ds.supported === true,
      since: ds.since,
      stocked: this._depotStocked(body),
      dryForS: ds.dryAt ? Math.max(0, t - ds.dryAt) : 0,
      graceS: DEPOT_SUPPORT_GRACE_S,
      lapsedAt: ds.lapsedAt,
      lapseReason: ds.lapseReason,
      patrolFactionId: DEPOT_PATROL_FACTION_ID,
      patrolLive: !!ds.patrol.encounterId,
      patrolEncounterId: ds.patrol.encounterId,
      rotations: ds.rotations,
      completedRotations: ds.completedRotations,
      lastDenied: ds.patrol.lastDenied,
    };
  },
  list() { return (this.state.claims && this.state.claims.bodies) || []; },
  _relayDestination(body) { return cachedRelayDestination(body); },
};

export function claimsReadView(state) {
  const view = Object.create(claimsReadMethods);
  view.state = state;
  view.bus = null;
  view.ctx = { state, bus: null };
  return view;
}
