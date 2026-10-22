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

const PYLON = (DMC.custom && DMC.custom.claimPylon) || {};
const CLAIM_RADIUS_WU = Math.max(1, Number(PYLON.claimRadiusWu) || 220);
const SETTLE_SPEED = Math.max(0.1, Number(PYLON.settleSpeed) || 8);
const STAMP = PYLON.stamp || 'claimedBy';

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
    for (const pylonId of Object.keys(drift.claims)) {
      if (livePylonIds.has(pylonId)) continue;
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
  },
};

export default factionDrift;
