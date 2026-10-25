// Drift identity mechanics — build_map §34 row 530, expansion bible 02 §3.
//
//   * CLAIM PYLONS — pylons that stake a claim and can be THROWN. A pylon that settles
//     (slows below its settle speed) stakes every rock inside its claim radius; throw it
//     somewhere else and the claim lifts and re-stakes where it lands. Two crews contest
//     the same rock and the freshest stake wins — that IS the feud E-06 is about.
//   * Claim Jump and the Breaker Derby live in encounters 704/706; the Breaker Head's
//     split rule is row 501's head work — this system only owns the claim surface.
//
// Data contract:
//   pylon.data.claimPylon    — true: this prop stakes claims when it lands
//   pylon.data.ownerId       — who threw it ('faction_dmc', 'player', an entity id)
//   rock.data.claimedBy      — the freshest staker's owner id
//   rock.data.claimPylonId   — the pylon holding the stake
// Ledger: state.drift.claims[pylonId] = { rockIds, atS } — serializable, deterministic.
//
// Registration hunks (manifest id 'faction_drift') live with this file's row.

import { faction as DMC } from '../data/factions/dmc.js';
import { SECTORS } from '../data/sectors.js';
import { sectorLocalToGlobalForSector } from '../data/sectorCoordinates.js';
import { queryAsteroidField } from '../world/asteroidField.js';

const PYLON = (DMC.custom && DMC.custom.claimPylon) || {};
const CLAIM_RADIUS_WU = Math.max(1, Number(PYLON.claimRadiusWu) || 220);
const SETTLE_SPEED = Math.max(0.1, Number(PYLON.settleSpeed) || 8);
const STAMP = PYLON.stamp || 'claimedBy';

// Claim Forty-Tag is a settled pin on the Ceres belt. The throwable pylons never
// spawn one, so the face filed nothing and a scan of the rock stayed silent.
// The position is the live POI, so a later chart edit moves the stake with the pin.
function fortyTagLocal() {
  const sector = SECTORS.find((row) => row && row.id === 'sector_ceres_belt');
  const poi = sector && (sector.pois || []).find((row) => row && row.id === 'poi_ceres_claim_tag');
  const pos = poi && poi.pos;
  return { x: Number(pos && pos.x) || 640, z: Number(pos && pos.z) || -500 };
}
const FORTY_TAG_PIN = Object.freeze({
  id: 'pin:poi_ceres_claim_tag',
  sectorId: 'sector_ceres_belt',
  ownerId: 'faction_dmc',
  label: 'Forty-Tag',
  local: Object.freeze(fortyTagLocal()),
});

function pinWhere(pin) {
  return sectorLocalToGlobalForSector(pin.local, pin.sectorId);
}
const AUTHORED_PINS = Object.freeze([FORTY_TAG_PIN]);
const AUTHORED_PIN_IDS = new Set(AUTHORED_PINS.map((pin) => pin.id));
export const FORTY_TAG_CLAIM_LINE = 'Forty-Tag holds this face. The Drift stamp is live.';

function claimScanLabel(label) {
  return `${label} · Drift claim`;
}

function rememberScan(data) {
  if (!Object.prototype.hasOwnProperty.call(data, 'claimScanPrior')) {
    data.claimScanPrior = data.scanLabel == null ? null : data.scanLabel;
  }
}

function restoreScan(data, label) {
  if (!data || data.scanLabel !== label) return;
  if (Object.prototype.hasOwnProperty.call(data, 'claimScanPrior')) {
    if (data.claimScanPrior == null) delete data.scanLabel;
    else data.scanLabel = data.claimScanPrior;
    delete data.claimScanPrior;
  } else {
    delete data.scanLabel;
  }
}

function clearStake(rock, pylonId, label) {
  const data = rock && rock.data;
  if (!data || data.claimPylonId !== pylonId) return;
  restoreScan(data, label);
  delete data[STAMP];
  delete data.claimPylonId;
  delete data.claimedAtS;
}

function bodyById(state, id) {
  const live = state.entities && state.entities.get && state.entities.get(id);
  if (live) return live;
  const field = state.world && state.world.asteroidField;
  return (field && field.byId && field.byId.get(id)) || null;
}

function releaseAuthoredPin(state, drift, pin) {
  const claim = drift.claims[pin.id];
  if (!claim) return;
  const label = claimScanLabel(pin.label);
  for (const rockId of claim.rockIds || []) clearStake(bodyById(state, rockId), pin.id, label);
  delete drift.claims[pin.id];
}

function refreshAuthoredPins(host, state, drift, now, entities) {
  const sectorId = state.world && state.world.currentSectorId;
  const player = state.entities && state.entities.get && state.entities.get(state.playerId);
  const flying = !state.mode || state.mode === 'flight';
  for (const pin of AUTHORED_PINS) {
    if (sectorId !== pin.sectorId) {
      releaseAuthoredPin(state, drift, pin);
      continue;
    }
    const label = claimScanLabel(pin.label);
    const where = pinWhere(pin);
    const previous = drift.claims[pin.id];
    const rockIds = [];
    const reach = CLAIM_RADIUS_WU * CLAIM_RADIUS_WU;
    const seen = new Set();
    const hold = (rock) => {
      if (!isStakeableRock(rock) || seen.has(rock.id)) return;
      seen.add(rock.id);
      const dx = rock.pos.x - where.x;
      const dz = rock.pos.z - where.z;
      if (dx * dx + dz * dz > reach) return;
      const data = rock.data || (rock.data = {});
      if (data.claimPylonId && data.claimPylonId !== pin.id) {
        restoreScan(data, label);
        return;
      }
      const already = data.claimPylonId === pin.id;
      rememberScan(data);
      data[STAMP] = pin.ownerId;
      data.claimPylonId = pin.id;
      if (!already) data.claimedAtS = now;
      if (data.scanLabel !== label) data.scanLabel = label;
      rockIds.push(rock.id);
    };
    for (const rock of entities) hold(rock);
    // Belt rocks sit in the field shelf until a pilot is on top of them.
    // The claim has to be on that shelf, or the face the player flies through stays blank.
    const shelved = queryAsteroidField(state, where, CLAIM_RADIUS_WU);
    for (const rock of shelved) hold(rock);
    for (const rockId of (previous && previous.rockIds) || []) {
      if (seen.has(rockId) && rockIds.includes(rockId)) continue;
      clearStake(bodyById(state, rockId), pin.id, label);
    }
    const claim = previous || { atS: now, hailed: false };
    claim.rockIds = rockIds;
    if (claim.atS == null) claim.atS = now;
    claim.ownerId = pin.ownerId;
    claim.authored = true;
    drift.claims[pin.id] = claim;
    if (!flying || claim.hailed || !player || player.alive === false || !player.pos) continue;
    const pdx = player.pos.x - where.x;
    const pdz = player.pos.z - where.z;
    if (pdx * pdx + pdz * pdz > reach) continue;
    claim.hailed = true;
    if (host.bus && typeof host.bus.emit === 'function') {
      host.bus.emit('toast', { text: FORTY_TAG_CLAIM_LINE, kind: 'info', ttl: 4 });
    }
  }
}

function entityListOf(state) {
  if (Array.isArray(state.entityList)) return state.entityList;
  if (state.entities && typeof state.entities.values === 'function') return [...state.entities.values()];
  return [];
}

function ensureState(state) {
  const s = state.drift || (state.drift = {});
  if (!s.claims || typeof s.claims !== 'object') s.claims = {};
  return s;
}

function speed(e) {
  const v = e && e.vel;
  return v ? Math.hypot(v.x, v.z) : 0;
}

function isStakeableRock(e) {
  if (!e || e.alive === false || !e.pos) return false;
  const d = e.data || {};
  return e.type === 'asteroid' || e.type === 'rock' || d.stakeable === true || d.rock === true;
}

export const factionDrift = {
  name: 'faction_drift',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus || null;
    ensureState(this.state);
  },

  update(dt, state) {
    const drift = ensureState(state);
    const now = Number(state.simTime) || 0;
    void dt;
    const entities = entityListOf(state);
    const livePylonIds = new Set();

    for (const pylon of entities) {
      if (!pylon || !pylon.pos || (pylon.data || {}).claimPylon !== true) continue;
      livePylonIds.add(pylon.id);
      const pd = pylon.data;
      const owner = pd.ownerId || 'faction_dmc';
      const landed = pylon.alive !== false && speed(pylon) < SETTLE_SPEED;
      const claim = drift.claims[pylon.id] || null;

      if (!landed) {
        // Thrown again — or dead — and the claim lifts off the rocks it was holding.
        if (claim) {
          for (const rockId of claim.rockIds) {
            const rock = state.entities.get(rockId);
            if (rock && rock.data && rock.data.claimPylonId === pylon.id) {
              delete rock.data[STAMP];
              delete rock.data.claimPylonId;
              delete rock.data.claimedAtS;
            }
          }
          delete drift.claims[pylon.id];
          this.bus && this.bus.emit('drift:claimLifted', { pylonId: pylon.id, ownerId: owner, t: now });
        }
        continue;
      }

      // Landed — already staked this spot? Restaking the same rocks is a no-op.
      if (claim) continue;

      // Find every stakeable rock in the radius; the freshest stake wins contested ground.
      const rockIds = [];
      const contested = [];
      for (const rock of entities) {
        if (rock === pylon || !isStakeableRock(rock)) continue;
        const dx = rock.pos.x - pylon.pos.x, dz = rock.pos.z - pylon.pos.z;
        if (dx * dx + dz * dz > CLAIM_RADIUS_WU * CLAIM_RADIUS_WU) continue;
        const rd = rock.data || (rock.data = {});
        if (rd.claimPylonId && rd.claimPylonId !== pylon.id) contested.push(rock.id);
        rd[STAMP] = owner;
        rd.claimPylonId = pylon.id;
        rd.claimedAtS = now;
        rockIds.push(rock.id);
      }
      drift.claims[pylon.id] = { rockIds, atS: now, ownerId: owner };
      this.bus && this.bus.emit('drift:claimStaked', {
        pylonId: pylon.id, ownerId: owner, rockIds, contested, t: now,
      });
      if (contested.length) {
        this.bus && this.bus.emit('drift:claimContested', {
          pylonId: pylon.id, ownerId: owner, rockIds: contested, t: now,
        });
      }
    }

    // A pylon that left the field or died releases its claim — the deed dies with the stake.
    // An authored pin is not an entity; leaving its sector releases it below.
    for (const pylonId of Object.keys(drift.claims)) {
      if (livePylonIds.has(pylonId) || AUTHORED_PIN_IDS.has(pylonId)) continue;
      const claim = drift.claims[pylonId];
      for (const rockId of claim.rockIds) {
        const rock = state.entities.get(rockId);
        if (rock && rock.data && rock.data.claimPylonId === pylonId) {
          delete rock.data[STAMP];
          delete rock.data.claimPylonId;
          delete rock.data.claimedAtS;
        }
      }
      delete drift.claims[pylonId];
    }

    refreshAuthoredPins(this, state, drift, now, entities);
  },
};

export default factionDrift;
