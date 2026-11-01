// scripts/lib/bench/playthroughPilots.mjs — scripted player policies for long open-world sessions.
//
// Three archetypes play the game through the player input contract (state.input axes + edge
// action flags + the massline command packet the input grammar normally publishes) and the live
// service paths the browser UI calls (economy.execute trades, dock:docked / dock:undocked bus
// events — the same seam src/balance/courierPublicRoute.js uses headless).
//
// Determinism: policies are pure functions of sim state with fixed thresholds; variety comes from
// tick parity, never Math.random or wall time. Decisions where two or more viable options with a
// real tradeoff existed are logged through ledger.recordDecision (the PQ-177.05 shape).

import { SERVICE_PRICES } from '../../../src/systems/economy.js';
import { COMMODITIES } from '../../../src/data/commodities.js';
import { SECTORS, dangerTier } from '../../../src/data/sectors.js';
import { isHostileToPlayer } from '../../../src/systems/scanner.js';
import { selectedJettisonLot } from '../../../src/systems/cargo.js';
import { furnaceMites, furnaceMouthGlobal } from '../../../src/missions/furnaceWorksite.js';
import { rookPadPosition, rookBoothEligible, rookDeliveryCheck } from '../../../src/characters/rookRules.js';
import { isPlayerWanted } from '../../../src/systems/heat.js';
import { gardenGrowthRadius } from '../../../src/data/understoryReceiver.js';
import { nestSiteClear } from '../../../src/systems/nestVisit.js';
import { nestSnapshotSpawnSites, nestSnapshotAdoptions } from '../../../src/data/encounters/705-the-nest.js';

// The game's own hostility truth (scanner.js) — "not lawful" is not "hostile" (unlawful-neutral
// factions exist and must not be shot for sport).
function hostileToFaction(e, state) {
  const p = player(state);
  return !!(e && e.alive && e.type === 'ship' && e.team !== (p ? p.team : 0)
    && isHostileToPlayer(e, p ? p.team : 0, state));
}
import { SECTOR_GLOBAL_ORIGINS, sectorMembershipAtGlobal } from '../../../src/data/sectorCoordinates.js';

// Sector membership is continuous across the corridor: fly far enough and the world switches
// membership (world.js _tickResidency). Roam targets use the authored global origins table.
const TIER_BY_SECTOR = new Map(SECTORS.map((sec) => [sec.id, dangerTier ? dangerTier(sec) : 0]));

function pickDangerRoam(state) {
  const current = state.world ? state.world.currentSectorId : null;
  const curTier = TIER_BY_SECTOR.get(current) ?? 0;
  const p = player(state);
  const candidates = [];
  for (const [sectorId, origin] of Object.entries(SECTOR_GLOBAL_ORIGINS)) {
    const tier = TIER_BY_SECTOR.get(sectorId) ?? 0;
    if (tier <= curTier) continue;
    candidates.push({ sectorId, origin, tier, d: p ? dist(p.pos, origin) : 0 });
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) => (a.tier - b.tier) || (a.d - b.d));
  return candidates[0]; // nearest highest-reachable-tier step up
}

const TICKS_PER_S = 60;
const DOCK_RANGE_WU = 240;
const TAU = Math.PI * 2;

function wrapAngle(a) {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
}

function player(state) {
  return state.playerId != null ? state.entities.get(state.playerId) : null;
}

function dist(a, b) {
  const dx = a.x - b.x, dz = a.z - b.z;
  return Math.hypot(dx, dz);
}

function nearest(state, pred, maxD = Infinity, fromPos = null) {
  const p = player(state);
  const origin = fromPos || (p ? p.pos : null);
  if (!origin) return null;
  let best = null, bestD = maxD;
  const list = state.entityList || [];
  for (const e of list) {
    if (!e || !e.alive || !pred(e)) continue;
    const d = dist(origin, e.pos);
    if (d < bestD) { bestD = d; best = e; }
  }
  return best ? { entity: best, distance: bestD } : null;
}

// Steer the nose toward a world point, thrust when roughly facing, brake inside a speed-aware
// arrive band (a fixed stop radius at 250 wu/s orbits forever — brake ahead of the stop point).
function steerTo(state, input, targetPos, opts = {}) {
  const p = player(state);
  if (!p) return;
  const arrive = opts.arrive ?? 60;
  const d = dist(p.pos, targetPos);
  const speed = p.vel ? Math.hypot(p.vel.x, p.vel.z) : 0;
  const stopBand = opts.hold ? arrive : arrive + speed * 1.4; // ~1.4 s deceleration lead
  input.aimWorld.x = targetPos.x;
  input.aimWorld.z = targetPos.z;
  input.aimAngle = Math.atan2(targetPos.z - p.pos.z, targetPos.x - p.pos.x);
  const desired = input.aimAngle;
  const err = wrapAngle(desired - (p.rot || 0));
  input.turnIntent = Math.max(-1, Math.min(1, err / 0.6));
  input.moveX = 0;
  if (d <= stopBand) {
    input.moveZ = 0;
    input.brake = !opts.hold;
    input.boost = false;
    return d;
  }
  input.brake = false;
  const facing = Math.abs(err) < (opts.facingSlack ?? 0.45);
  input.moveZ = facing ? 1 : 0; // face first, then burn — never thrust against the turn
  input.boost = !!opts.boost && facing && d > (opts.boostMin ?? 400);
  return d;
}

function neutralInput(state) {
  const input = state.input;
  input.moveX = 0; input.moveZ = 0; input.turnIntent = 0;
  input.boost = false; input.brake = false;
  input.fire = false; input.fireGroup = null; input.autoFire = false;
  input.deployCountermeasure = false;
  input.aimIntentActive = false; // per-tick stamp like the rest — scored massline aim sets it
  input.tetherMode = null; // input.js writes this fresh per tick; a stale 'nearest' hijacks scored latches
  return input;
}

// Cargo lives on state.player.cargo (single-writer: cargo owns it), not on the ship entity.
function cargoUsedOf(state) {
  const cargo = state.player && state.player.cargo && state.player.cargo.items
    ? state.player.cargo.items : null;
  if (!cargo) return 0;
  let used = 0;
  for (const v of Object.values(cargo)) used += Number(v) || 0;
  return used;
}

function cargoCommodities(state) {
  const cargo = state.player && state.player.cargo && state.player.cargo.items
    ? state.player.cargo.items : {};
  return Object.entries(cargo).filter(([id, qty]) => Number(qty) > 0 && id.startsWith('cmdty_'));
}

function cargoCapOf(state, p) {
  // The cargo system owns the real cap (state.player.cargo.capVolume); entity fields are a fallback.
  const pc = state.player && state.player.cargo;
  if (pc && Number.isFinite(pc.capVolume)) return pc.capVolume;
  return (p && (p.cargoCap ?? (p.data && p.data.cargoCap))) || 60;
}

// Capacitor management: thrust weapons and boost drain cap; at empty cap the ship crawls.
// energyReady gates spending; energyFull releases the wait. Ships without cap fields skip this.
function energyReady(p) {
  return !p || !Number.isFinite(p.cap) || !Number.isFinite(p.capMax) || p.cap > p.capMax * 0.2;
}
function energyFull(p) {
  return !p || !Number.isFinite(p.cap) || !Number.isFinite(p.capMax) || p.cap > p.capMax * 0.65;
}

function liveStations(state) {
  const idx = state.entityIndex || {};
  const list = (idx.dockStations && idx.dockStations.length ? idx.dockStations : idx.stations) || [];
  return list.filter((s) => s && s.alive && s.type === 'station');
}

// ── shared service layer (the same live paths the browser UI/balance harnesses use) ─────────
// econ is the MAIN sim's economy instance. The module-level economy.execute delegate re-resolves
// `economy._instance`, which offscreen sector sims overwrite when they fork their own economy —
// so station trades must go through the instance this session booted.
export function createServices({ state, bus, ledger, econ, clock, missions }) {
  return {
    dockAt(station) {
      const p = player(state);
      if (!p || !station) return false;
      if ((state.ui && state.ui.docked) || (p.flags && p.flags.docked)) return true; // already docked
      if (clock && clock.tick() < clock.undockCooldownUntil()) return false; // bounce guard
      const range = DOCK_RANGE_WU + (station.radius || 0); // big hulls keep you farther out
      if (dist(p.pos, station.pos) > range) return false;
      // Production dock:docked carries the station RECORD id ('station_helios'), not the
      // entity id — _onDockedObjectives, ensureBoard, and the market all key on it. Run 47
      // emitted the entity id, so the B0 turn-in, the market sale, and the authored choice
      // offers all silently no-oped while the ship berths.
      const stationId = (station.data && station.data.stationId) || station.stationId || station.id;
      p.flags = p.flags || {};
      p.flags.docked = true;
      state.ui = state.ui || {};
      state.ui.docked = true;
      state.ui.dockedStationId = stationId;
      bus.emit('dock:docked', { stationId });
      return true;
    },
    undock() {
      const p = player(state);
      if (!p) return false;
      p.flags = p.flags || {};
      if (!p.flags.docked) return false;
      p.flags.docked = false;
      state.ui = state.ui || {};
      state.ui.docked = false;
      const stationId = state.ui.dockedStationId;
      state.ui.dockedStationId = null;
      bus.emit('dock:undocked', { stationId, committed: true });
      return true;
    },
    // Live trade path (credits + stock move through economy.execute exactly as the market UI).
    trade(stationId, commodityId, side, qty) {
      if (qty <= 0) return { ok: false, reason: 'zero_qty' };
      const res = econ.execute(stationId, commodityId, side, qty, {});
      if (res && res.ok) {
        const cr = Number(res.cr ?? res.total ?? res.gross ?? 0);
        ledger.recordTrade({ side, stationId, commodityId, qty, cr });
        return res;
      }
      return res || { ok: false };
    },
    // Live service sink + direct restore, mirroring the station repair service.
    repair() {
      const p = player(state);
      if (!p) return 0;
      const missing = (p.hullMax || 0) - (p.hull || 0);
      if (missing <= 0) return 0;
      const cost = Math.ceil(missing * SERVICE_PRICES.repairCrPerHp);
      bus.emit('economy:chargeCredits', { amount: cost, reason: 'service:repair' });
      p.hull = p.hullMax;
      ledger.recordNote(`repair: ${Math.round(missing)} hp for ${cost} cr`);
      return cost;
    },
    sellEverythingAt(stationId) {
      const p = player(state);
      let totalCr = 0, totalU = 0, lines = [];
      for (const [commodityId, qty] of cargoCommodities(state)) {
        const res = this.trade(stationId, commodityId, 'sell', Math.floor(qty));
        if (res && res.ok) {
          const cr = Number(res.cr ?? res.total ?? res.gross ?? 0);
          totalCr += cr; totalU += Math.floor(qty);
          lines.push(`${commodityId} x${Math.floor(qty)} → ${Math.round(cr)} cr`);
        }
      }
      return { totalCr, totalU, lines };
    },
    // The board's public accept path — the same call the UI's ui:acceptMission
    // subscriber and the career cohorts make — but returning the boolean so the
    // pilot can see a refusal (stale row, maxActive, collateral) and move to the
    // next offer instead of logging a take that never landed.
    acceptMission(missionId) {
      return missions && typeof missions.acceptMission === 'function'
        ? missions.acceptMission(missionId)
        : false;
    },
  };
}

// Best sell price for a commodity among visited stations this session (market intel proxy).
function knownStations(state, visitedIds) {
  return visitedIds.size ? [...visitedIds] : (liveStations(state).map((s) => s.id));
}

// ── Archetype 1: prospector (miner-trader) ──────────────────────────────────────────────────
export function createMinerTraderPilot({ state, bus, ledger, services }) {
  const visitedStations = new Set();
  let mode = 'mine'; // mine | haul | docked
  let targetRock = null;
  let targetStation = null;
  let dockedWait = 0; // the sim freezes full ticks while docked, so count pilot steps, not ticks
  let undockCooldownUntil = 0; // prevents dock<->undock bounce when unsellable cargo keeps 'haul' on
  let nextDecisionCheck = 1200; // first decision audit at tick 1200 (20 s in)

  return {
    name: 'prospector',
    step(dt, tick) {
      const p = player(state);
      if (!p || !p.alive) return;
      if (state.ui && state.ui.docked) { mode = 'docked'; }
      const input = neutralInput(state);
      if ((state.ui && state.ui.docked) || (p.flags && p.flags.docked)) {
        // Sell on arrival, breathe a few frozen steps like a player reading the market, undock.
        if (dockedWait === 0) {
          const stationId = state.ui.dockedStationId || (targetStation && targetStation.id);
          visitedStations.add(stationId);
          services.sellEverythingAt(stationId);
          services.repair();
          ledger.recordDecision({
            situation: 'sold hold at station (held full haul vs seeking better price)',
            options: [
              { id: 'sell_here', tradeoff: 'immediate credits, no extra travel risk' },
              { id: 'haul_on', tradeoff: 'possible better price elsewhere, +travel time and danger' },
            ],
            chosen: 'sell_here',
          });
        }
        dockedWait++;
        if (dockedWait > 30) {
          services.undock();
          dockedWait = 0;
          undockCooldownUntil = tick + 1200; // 20 sim-s before another dock attempt
          services.undockCooldownUntilTick = undockCooldownUntil; // visible to dockAt's bounce guard
          mode = 'mine';
          targetRock = null;
        }
        return;
      }

      const used = cargoUsedOf(state);
      const cap = cargoCapOf(state, p);
      if (mode === 'haul' && used >= cap * 0.8 && tick < undockCooldownUntil) {
        // Just undocked and the hold still reads full: the remainder is unsellable mission cargo.
        ledger.recordNote('haul aborted: unsellable cargo blocking the hold');
        mode = 'mine';
      }
      if (used >= cap * 0.8 && tick >= undockCooldownUntil) mode = 'haul';

      // Threat response. Hauling outranks threats — the station is the sanctuary, so a loaded
      // hold pushes through to the dock instead of fleeing forever through a pursuer.
      const threatRange = mode === 'haul' ? 200 : 380;
      const threat = nearest(state, (e) => hostileToFaction(e, state), threatRange);
      if (threat && tick >= nextDecisionCheck) {
        ledger.recordDecision({
          situation: `hostile within ${threatRange} wu while ${mode === 'haul' ? 'hauling' : 'mining'}`,
          options: [
            { id: mode === 'haul' ? 'push_to_station' : 'flee', tradeoff: 'drop the rock, keep cargo and hull' },
            { id: 'stand', tradeoff: 'keep mining income, risk hull and cargo loss' },
          ],
          chosen: mode === 'haul' ? 'push_to_station' : (used > 0 ? 'flee' : 'stand'),
        });
        nextDecisionCheck = tick + 600;
      }
      if (threat && mode !== 'haul' && used > 0) {
        // Flee THROUGH toward the nearest station when one is closer than doubling back.
        const st = liveStations(state).sort((a, b) => dist(p.pos, a.pos) - dist(p.pos, b.pos))[0];
        const goal = st || { pos: { x: p.pos.x * 2 - threat.entity.pos.x, z: p.pos.z * 2 - threat.entity.pos.z } };
        steerTo(state, input, goal.pos, { boost: energyFull(p), arrive: DOCK_RANGE_WU - 20 });
        if (st && tick >= (services.undockCooldownUntilTick || 0)
          && dist(p.pos, st.pos) <= DOCK_RANGE_WU + (st.radius || 0)) services.dockAt(st);
        return;
      }

      if (mode === 'mine') {
        if (!targetRock || !targetRock.alive) {
          const rock = nearest(state, (e) => e.type === 'asteroid' && e.alive
            && e.data && (Number(e.data.yieldU) || 0) > 0); // sector-wide: fields materialize on approach
          if (!rock) {
            // No rocks resident anywhere: hold and let field residency respawn.
            input.brake = true;
            return;
          }
          targetRock = rock.entity;
          if (tick >= nextDecisionCheck) {
            ledger.recordDecision({
              situation: 'chose next rock',
              options: [
                { id: 'nearest_rock', tradeoff: 'less travel, unknown richness' },
                { id: 'rich_rock', tradeoff: 'more yield per asteroid, longer approach' },
              ],
              chosen: 'nearest_rock',
            });
            nextDecisionCheck = tick + 36000; // rock picks are routine; audit at most every 10 sim-min
          }
        }
        const d = steerTo(state, input, targetRock.pos, { arrive: 150, boost: energyFull(p) });
        if (d != null && d <= 170 && energyReady(p)) {
          input.fire = true;
          input.fireGroup = 2; // mining beam (RMB group 2 contract)
        }
        return;
      }

      if (mode === 'haul') {
        if (!targetStation || !targetStation.alive) {
          const st = liveStations(state);
          if (!st.length) return;
          st.sort((a, b) => dist(p.pos, a.pos) - dist(p.pos, b.pos));
          targetStation = st[0];
        }
        const d = steerTo(state, input, targetStation.pos, { arrive: DOCK_RANGE_WU - 20, boost: true });
        if (d != null && d <= DOCK_RANGE_WU + (targetStation.radius || 0)) {
          services.dockAt(targetStation);
        }
      }
    },
  };
}

// ── Archetype 2: hunter (combat-focused) ─────────────────────────────────────────────────────
export function createHunterPilot({ state, bus, ledger, services }) {
  let target = null;
  let mode = 'hunt'; // hunt | loot | dock
  let dockStation = null;
  let noEnemySince = 0;
  let roamTarget = null;
  let strafePhase = 0;
  let nextDecisionCheck = 1800;

  function isHostile(e) {
    return hostileToFaction(e, state);
  }

  return {
    name: 'hunter',
    step(dt, tick) {
      const p = player(state);
      if (!p || !p.alive) return;
      const input = neutralInput(state);

      if ((state.ui && state.ui.docked) || (p.flags && p.flags.docked)) {
        // A hunter's income IS salvage — sell the hold before repairing out, or the
        // combat→aftermath→salvage→economy chain never closes its economy leg.
        services.sellEverythingAt(state.ui.dockedStationId || (dockStation && dockStation.id));
        services.repair();
        // Choose between the two highest-value boards if present (decision each dock).
        const boards = state.missions && state.missions.boards ? state.missions.boards : {};
        const offers = [];
        for (const board of Object.values(boards)) {
          for (const offer of (board && board.offers) || []) offers.push(offer);
        }
        if (offers.length >= 1 && tick >= nextDecisionCheck) {
          offers.sort((a, b) => (Number(b.rewardCr) || 0) - (Number(a.rewardCr) || 0));
          const top = offers[0], second = offers[1];
          ledger.recordDecision({
            situation: 'mission board choice at dock',
            options: [
              { id: `take:${top.id || 'top'}`, tradeoff: `reward ${Math.round(Number(top.rewardCr) || 0)} cr` },
              second
                ? { id: `take:${second.id || 'second'}`, tradeoff: `reward ${Math.round(Number(second.rewardCr) || 0)} cr, maybe safer` }
                : { id: 'skip', tradeoff: 'no second offer; stay free-roam' },
            ],
            chosen: top.id ? `take:${top.id}` : 'skip',
          });
          bus.emit('ui:acceptMission', { missionId: top.id });
          nextDecisionCheck = tick + 3600;
        }
        services.undock();
        // Still-heavy hold after the sell means the remainder is unsellable — hold the dock
        // branch open much longer rather than bouncing on a cargo that cannot convert.
        services.undockCooldownUntilTick = cargoUsedOf(state) >= cargoCapOf(state, p) * 0.7
          ? tick + 36000
          : tick + 1200;
        return;
      }

      const hullFrac = (p.hull || 0) / (p.hullMax || 1);
      if (hullFrac < 0.45) mode = 'dock';
      // A hold heavy with salvage is worth a dock trip — the economy leg only closes if the
      // pilot actually converts wreck scrap into credits. The cooldown stops a dock<->undock
      // bounce when the remainder is unsellable.
      if (cargoUsedOf(state) >= cargoCapOf(state, p) * 0.7
        && tick >= (services.undockCooldownUntilTick || 0)) mode = 'dock';

      // Engage the nearest hostile; disengage decision when outmatched.
      const foe = nearest(state, isHostile, 1600);
      if (foe && tick >= nextDecisionCheck) {
        const foes = (state.entityList || []).filter(isHostile).length;
        ledger.recordDecision({
          situation: `hostile contact (hull ${Math.round(hullFrac * 100)}%, ${foes} hostile(s) in sector)`,
          options: [
            { id: 'engage', tradeoff: 'bounty and salvage, hull risk' },
            { id: 'disengage', tradeoff: 'keep hull, lose time and bounty' },
          ],
          chosen: hullFrac > 0.55 || foes === 1 ? 'engage' : 'disengage',
        });
        nextDecisionCheck = tick + 1200;
      }

      if (mode === 'dock') {
        if (!dockStation || !dockStation.alive) {
          const st = liveStations(state);
          if (!st.length) { mode = 'hunt'; return; }
          st.sort((a, b) => dist(p.pos, a.pos) - dist(p.pos, b.pos));
          dockStation = st[0];
        }
        const d = steerTo(state, input, dockStation.pos, { arrive: DOCK_RANGE_WU - 20, boost: hullFrac > 0.3 });
        if (d != null && d <= DOCK_RANGE_WU + (dockStation.radius || 0)) { services.dockAt(dockStation); mode = 'hunt'; }
        return;
      }

      if (foe) {
        noEnemySince = 0;
        roamTarget = null;
        target = foe.entity;
        state.player.targetId = target.id;
        const d = dist(p.pos, target.pos);
        // Lead the aim slightly by target velocity (no simulator formulas — plain pursuit lead).
        const lead = Math.min(1, d / 600);
        input.aimWorld.x = target.pos.x + (target.vel ? target.vel.x * lead * 0.5 : 0);
        input.aimWorld.z = target.pos.z + (target.vel ? target.vel.z * lead * 0.5 : 0);
        input.aimAngle = Math.atan2(input.aimWorld.z - p.pos.z, input.aimWorld.x - p.pos.x);
        const err = wrapAngle(input.aimAngle - (p.rot || 0));
        input.turnIntent = Math.max(-1, Math.min(1, err / 0.5));
        strafePhase += dt;
        input.moveX = d < 260 ? (Math.floor(strafePhase * 0.8) % 2 ? 1 : -1) : 0;
        input.moveZ = d > 500 ? 1 : (d < 160 ? 0.2 : 0.6);
        input.boost = energyFull(p) && d > 700 && Math.abs(err) < 0.5;
        input.brake = d < 120 && Math.hypot(p.vel ? p.vel.x : 0, p.vel ? p.vel.z : 0) > 120;
        input.fire = energyReady(p) && Math.abs(err) < 0.35 && d < 620;
        input.fireGroup = 1;
        return;
      }

      // No enemies: work the aftermath — wreck pools drain under the mining beam, manifest
      // pods and loose pickups scoop on contact/magnet. Then patrol live rocks; when the
      // sector stays quiet, roam up the danger ladder.
      state.player.targetId = null;
      const loot = nearest(state, (e) => e.alive && (e.type === 'pickup' || e.type === 'cargo'
        || e.type === 'lootShard' || e.type === 'payload'
        || (e.type === 'wreck' && e.data && e.data.salvagePool
          && Object.keys(e.data.salvagePool).length > 0)
        || (e.data && e.data.salvageable)), 700);
      if (loot) {
        const d = steerTo(state, input, loot.entity.pos, { arrive: 40 });
        if (loot.entity.type === 'wreck' && d != null && d <= 200 && energyReady(p)) {
          input.fire = true;
          input.fireGroup = 2; // mining beam drains the wreck's salvage pool
        }
        return;
      }
      noEnemySince += dt;
      if (noEnemySince > 240) {
        if (!roamTarget) {
          roamTarget = pickDangerRoam(state);
          if (roamTarget) {
            ledger.recordNote(`quiet sector; roaming to ${roamTarget.sectorId} (tier ${roamTarget.tier})`);
          }
        }
        if (roamTarget) {
          const d = steerTo(state, input, roamTarget.origin, { arrive: 500, boost: true });
          if (d != null && d <= 600) noEnemySince = 120; // arrived; look around before re-roaming
          return;
        }
      }
      const rock = nearest(state, (e) => e.type === 'asteroid' && e.alive, 2400);
      const waypoint = rock ? rock.entity.pos
        : { x: Math.cos(state.simTime / 90) * 800, z: Math.sin(state.simTime / 90) * 800 };
      steerTo(state, input, waypoint, { arrive: 120, boost: noEnemySince > 120 });
    },
  };
}

// ── Archetype 2b: raider (piracy → WANTED → pursuit → resolution) ─────────────────────────────
// The lawful archetypes can never exercise the law loop: a hunter's kills are clear hostiles,
// which the witness gate correctly clears. A raider is the other half of the measured game —
// it murders protected civilians (preferring ones the law can see, so the receipt is real),
// carries the warrant, and then resolves it the way the world offers: pay the assessed fine
// at a lawful dock, or outrun the search zone. Escaping is possible; it is never free.
const LAWFUL_STATION_FACTIONS = new Set(['faction_scn', 'faction_mts', 'faction_dmc', 'faction_free']);
const WANTED_HEAT = 0.15;

function civilianVictim(e, state) {
  if (!e || !e.alive || e.type !== 'ship' || e.id === state.playerId) return false;
  const data = e.data || {};
  const ai = data.ai || {};
  const role = String(data.trafficRole || data.role || ai.role || ai.archetype || '').toLowerCase();
  return e.team === 2 || ai.spawnContext === 'convoy_civilian'
    || ['hauler', 'courier', 'miner', 'trader', 'civilian', 'fleeing_trader'].some((w) => role.includes(w));
}

export function createRaiderPilot({ state, bus, ledger, services }) {
  let mode = 'hunt'; // hunt | evade | dock
  let dockStation = null;
  let roamTarget = null;
  let strafePhase = 0;
  let nextDecisionCheck = 1800;

  return {
    name: 'raider',
    step(dt, tick) {
      const p = player(state);
      if (!p || !p.alive) return;
      const input = neutralInput(state);
      const heat = (state.player && Number(state.player.heat)) || 0;
      const wanted = heat >= WANTED_HEAT;

      if ((state.ui && state.ui.docked) || (p.flags && p.flags.docked)) {
        services.sellEverythingAt(state.ui.dockedStationId || (dockStation && dockStation.id));
        services.repair();
        services.undock();
        services.undockCooldownUntilTick = cargoUsedOf(state) >= cargoCapOf(state, p) * 0.7
          ? tick + 36000 : tick + 1200;
        mode = 'hunt';
        return;
      }

      const hullFrac = (p.hull || 0) / (p.hullMax || 1);
      if (hullFrac < 0.45) mode = 'dock';
      if (wanted) mode = 'evade';
      else if (mode === 'evade') mode = 'hunt'; // heat decayed or was paid off — back to work
      if (cargoUsedOf(state) >= cargoCapOf(state, p) * 0.7
        && tick >= (services.undockCooldownUntilTick || 0)) mode = 'dock';

      if (mode === 'dock') {
        if (!dockStation || !dockStation.alive) {
          const st = liveStations(state);
          if (!st.length) { mode = 'hunt'; return; }
          st.sort((a, b) => dist(p.pos, a.pos) - dist(p.pos, b.pos));
          dockStation = st[0];
        }
        const d = steerTo(state, input, dockStation.pos, { arrive: DOCK_RANGE_WU - 20, boost: hullFrac > 0.3 });
        if (d != null && d <= DOCK_RANGE_WU + (dockStation.radius || 0)) { services.dockAt(dockStation); mode = 'hunt'; }
        return;
      }

      if (mode === 'evade') {
        // The lawful door: a lawful dock assesses the fine and the sheet clears. Chosen when
        // the credits cover it — escaping consequences is possible, it is never free.
        const canPay = (state.player.credits || 0) >= 500;
        if (tick >= nextDecisionCheck) {
          ledger.recordDecision({
            situation: `wanted (heat ${heat.toFixed(2)}, tier ${(state.player && state.player.wantedTier) || '?'})`,
            options: [
              { id: 'pay_fine', tradeoff: 'real credits, instant clear, safe dock approach' },
              { id: 'run_zone', tradeoff: 'keep credits, outrun the search radius under pursuit' },
            ],
            chosen: canPay ? 'pay_fine' : 'run_zone',
          });
          nextDecisionCheck = tick + 1200;
        }
        if (canPay && tick >= (services.undockCooldownUntilTick || 0)) {
          const st = liveStations(state).filter((s) => LAWFUL_STATION_FACTIONS.has(
            s.factionId || (s.data && s.data.factionId))).sort((a, b) => dist(p.pos, a.pos) - dist(p.pos, b.pos))[0];
          if (st) {
            dockStation = st;
            const d = steerTo(state, input, st.pos, { arrive: DOCK_RANGE_WU - 20, boost: true });
            if (d != null && d <= DOCK_RANGE_WU + (st.radius || 0)) services.dockAt(st);
            return;
          }
        }
        // Outrun the search zone: fly straight away from the heat center until the ledger decays.
        const zone = (state.player && state.player.heatZone) || {};
        const c = zone.active && zone.center && Number.isFinite(zone.center.x) ? zone.center : null;
        let gx = p.pos.x, gz = p.pos.z;
        if (c) {
          const dx = p.pos.x - c.x, dz = p.pos.z - c.z;
          const len = Math.hypot(dx, dz) || 1;
          gx += (dx / len) * 2400;
          gz += (dz / len) * 2400;
        } else {
          gx += Math.cos(state.simTime / 60) * 2400;
          gz += Math.sin(state.simTime / 60) * 2400;
        }
        steerTo(state, input, { x: gx, z: gz }, { arrive: 100, boost: energyFull(p) });
        return;
      }

      // Defend against declared hostiles exactly like the hunter — a raider's self-defense is
      // still lawful force, and killing a clear hostile must never mint heat.
      const foe = nearest(state, (e) => hostileToFaction(e, state), 1400);
      if (foe) {
        strafePhase += dt;
        const t = foe.entity;
        state.player.targetId = t.id;
        const d = dist(p.pos, t.pos);
        const lead = Math.min(1, d / 600);
        input.aimWorld.x = t.pos.x + (t.vel ? t.vel.x * lead * 0.5 : 0);
        input.aimWorld.z = t.pos.z + (t.vel ? t.vel.z * lead * 0.5 : 0);
        input.aimAngle = Math.atan2(input.aimWorld.z - p.pos.z, input.aimWorld.x - p.pos.x);
        const err = wrapAngle(input.aimAngle - (p.rot || 0));
        input.turnIntent = Math.max(-1, Math.min(1, err / 0.5));
        input.moveX = d < 260 ? (Math.floor(strafePhase * 0.8) % 2 ? 1 : -1) : 0;
        input.moveZ = d > 500 ? 1 : (d < 160 ? 0.2 : 0.6);
        input.boost = energyFull(p) && d > 700 && Math.abs(err) < 0.5;
        input.brake = d < 120 && Math.hypot(p.vel ? p.vel.x : 0, p.vel ? p.vel.z : 0) > 120;
        input.fire = energyReady(p) && Math.abs(err) < 0.35 && d < 620;
        input.fireGroup = 1;
        return;
      }

      // The crime: murder a protected civilian — prefer one the law can see, so the receipt is
      // real. Deep-space unwitnessed kills are still lawful-free (that's the gate working).
      const victim = nearest(state, (e) => civilianVictim(e, state)
        && !!nearest(state, (o) => o !== e && o.alive && (o.type === 'ship' || o.type === 'station'), 500, e.pos), 2400)
        || nearest(state, (e) => civilianVictim(e, state), 1600);
      if (victim) {
        if (tick >= nextDecisionCheck) {
          ledger.recordDecision({
            situation: 'protected civilian in reach (murder mints heat only if seen)',
            options: [
              { id: 'murder', tradeoff: 'loot and bounty, heat if a witness or ring sees it' },
              { id: 'pass', tradeoff: 'stay clean, no income' },
            ],
            chosen: 'murder',
          });
          nextDecisionCheck = tick + 1200;
        }
        strafePhase += dt;
        const t = victim.entity;
        state.player.targetId = t.id;
        const d = dist(p.pos, t.pos);
        const lead = Math.min(1, d / 600);
        input.aimWorld.x = t.pos.x + (t.vel ? t.vel.x * lead * 0.5 : 0);
        input.aimWorld.z = t.pos.z + (t.vel ? t.vel.z * lead * 0.5 : 0);
        input.aimAngle = Math.atan2(input.aimWorld.z - p.pos.z, input.aimWorld.x - p.pos.x);
        const err = wrapAngle(input.aimAngle - (p.rot || 0));
        input.turnIntent = Math.max(-1, Math.min(1, err / 0.5));
        input.moveX = d < 260 ? (Math.floor(strafePhase * 0.8) % 2 ? 1 : -1) : 0;
        input.moveZ = d > 500 ? 1 : (d < 160 ? 0.2 : 0.6);
        input.boost = energyFull(p) && d > 700 && Math.abs(err) < 0.5;
        input.brake = d < 120 && Math.hypot(p.vel ? p.vel.x : 0, p.vel ? p.vel.z : 0) > 120;
        input.fire = energyReady(p) && Math.abs(err) < 0.35 && d < 620;
        input.fireGroup = 1;
        return;
      }

      // Work the aftermath, then roam for victims.
      state.player.targetId = null;
      const loot = nearest(state, (e) => e.alive && (e.type === 'pickup' || e.type === 'cargo'
        || e.type === 'lootShard' || e.type === 'payload'
        || (e.type === 'wreck' && e.data && e.data.salvagePool
          && Object.keys(e.data.salvagePool).length > 0)
        || (e.data && e.data.salvageable)), 700);
      if (loot) {
        const d = steerTo(state, input, loot.entity.pos, { arrive: 40 });
        if (loot.entity.type === 'wreck' && d != null && d <= 200 && energyReady(p)) {
          input.fire = true;
          input.fireGroup = 2;
        }
        return;
      }
      roamTarget = roamTarget || liveStations(state)[0] || null;
      const waypoint = roamTarget ? roamTarget.pos
        : { x: Math.cos(state.simTime / 90) * 800, z: Math.sin(state.simTime / 90) * 800 };
      steerTo(state, input, waypoint, { arrive: 140, boost: true });
    },
  };
}

// ── Archetype 3: improviser (tether/physics-heavy) ───────────────────────────────────────────
// Drives the massline command packet directly (the same packet shape the input grammar publishes:
// latch/cut edges, lineControl with reelIn/payOut, orbitDirection).
export function createImproviserPilot({ state, bus, ledger, services }) {
  let phase = 'seek'; // seek | latch | swing | engage | sustain
  let swingStart = 0;
  let orbitDir = 1;
  let latchedId = null;
  let lineAttached = false; // truth comes from tether events, not entity existence
  let roamTarget = null;
  // Live bus names (tetherGameplay): 'tether:latched' on attach, 'tether:broke' on loss —
  // 'tether:attached'/'tether:broken' never fire, leaving lineAttached/latchedId dead.
  const improvHook = (e) => {
    if (!e || e.flail === true) return;
    if (e.sourceId != null && state.playerId != null && e.sourceId !== state.playerId) return;
    lineAttached = true; if (e.targetId != null) latchedId = e.targetId; ledger.recordNote('tether attached');
  };
  bus.on('tether:latched', improvHook);
  bus.on('tether:attached', improvHook);
  const lineLost = (why) => () => { if (lineAttached) ledger.recordNote(`line lost: ${why}`); lineAttached = false; };
  bus.on('tether:broke', lineLost('broke'));
  bus.on('tether:broken', lineLost('broken'));
  bus.on('tether:cut', lineLost('cut'));
  bus.on('tether:cutPlayer', lineLost('cutPlayer'));
  bus.on('tether:released', lineLost('released'));
  bus.on('tether:detach', lineLost('detach'));
  bus.on('tether:detached', lineLost('detached'));
  let releaseGoal = null; // 'speed' | 'hostile'
  let sustainAt = 1800 * 20; // first sustain check at 20 sim-min
  let target = null;
  let nextDecisionCheck = 1500;

  function massline(input, cmd) {
    input.actions = input.actions || {};
    input.actions.massline = cmd;
    input.actions.tetherFire = !!cmd.latch;
  }

  function neutralCommand() {
    return {
      phase: 'idle', latch: false, cut: false, lineControl: false, lineLength: 0,
      reelIn: 0, payOut: 0, orbitDirection: 0, pump: false, buffered: false, source: null,
    };
  }

  function pickLatchTarget(tick) {
    const p = player(state);
    const candidates = (state.entityList || []).filter((e) => e && e.alive && e !== p
      && (e.type === 'ship' || e.type === 'asteroid'));
    const scored = candidates.map((e) => ({
      e,
      d: dist(p.pos, e.pos),
      mass: Number(e.mass) || (e.type === 'asteroid' ? 20 : 8),
      speed: e.vel ? Math.hypot(e.vel.x, e.vel.z) : 0,
    })).filter((c) => c.d < 1100);
    scored.sort((a, b) => a.d - b.d);
    const top = scored.slice(0, 3);
    if (top.length && tick >= nextDecisionCheck) {
      ledger.recordDecision({
        situation: 'latch target choice',
        options: top.map((c, i) => ({
          id: `${c.e.type}:${c.e.id}`,
          tradeoff: `d=${Math.round(c.d)} mass=${Math.round(c.mass)} speed=${Math.round(c.speed)}${i === 0 ? ' (closest)' : ''}`,
        })),
        chosen: `${top[0].e.type}:${top[0].e.id}`,
      });
      nextDecisionCheck = tick + 2400;
    }
    return top[0] || null;
  }

  return {
    name: 'improviser',
    step(dt, tick) {
      const p = player(state);
      if (!p || !p.alive) { massline(neutralInput(state), neutralCommand()); return; }
      const input = neutralInput(state);
      const cmd = neutralCommand();
      massline(input, cmd);

      if ((state.ui && state.ui.docked) || (p.flags && p.flags.docked)) {
        services.sellEverythingAt(state.ui.dockedStationId);
        services.repair();
        services.undock();
        phase = 'seek';
        return;
      }

      const speed = p.vel ? Math.hypot(p.vel.x, p.vel.z) : 0;

      if (phase === 'seek' || phase === 'latch') {
        // The tether consumes the game's own acquisition receipt — the improviser grabs what the
        // reticle offers, exactly like a player steering the preview onto something and pressing.
        const acq = state.masslineAcquisition && state.masslineAcquisition.selected;
        const offered = acq && acq.status === 'ready' && acq.targetId != null
          ? state.entities.get(acq.targetId) : null;
        if (offered && offered.alive && dist(p.pos, offered.pos) < 900) {
          target = offered;
          phase = 'latch';
          roamTarget = null;
          steerTo(state, input, offered.pos, { arrive: 60, facingSlack: 0.35 });
          cmd.latch = true; // edge — one tick; denied presses just retry next tick
          phase = 'swing';
          swingStart = tick;
          orbitDir = Math.floor(tick / TICKS_PER_S / 7) % 2 ? 1 : -1; // deterministic alternation
          releaseGoal = null;
          ledger.recordNote(`latch press -> ${acq.targetType}:${acq.targetId}`);
          if (tick >= nextDecisionCheck) {
            ledger.recordDecision({
              situation: 'latch what the reticle offers',
              options: [
                { id: `${acq.targetType}:${acq.targetId}`, tradeoff: `game-scored candidate (${acq.intentLabel || 'grab'})` },
                { id: 'keep_roaming', tradeoff: 'unknown better target elsewhere, travel time' },
              ],
              chosen: `${acq.targetType}:${acq.targetId}`,
            });
            nextDecisionCheck = tick + 7200; // at most one latch decision per 2 sim-min
          }
          return;
        }
        // Nothing offered yet: steer toward the nearest candidate to feed the acquisition cone,
        // or roam toward a busier sector.
        const pick = pickLatchTarget(tick);
        if (!pick) {
          if (!roamTarget) roamTarget = pickDangerRoam(state);
          const goal = roamTarget ? roamTarget.origin : { x: 0, z: 0 };
          const d = steerTo(state, input, goal, { arrive: 500, boost: energyFull(p) });
          if (d != null && d <= 600) roamTarget = null;
          return;
        }
        target = pick.e;
        phase = 'latch';
        steerTo(state, input, target.pos, { arrive: 100, facingSlack: 0.3, boost: energyFull(p) && pick.d > 500 });
        return;
      }

      if (phase === 'swing') {
        if (!lineAttached || !target || !target.alive) { phase = 'seek'; latchedId = null; return; }
        cmd.lineControl = true;
        cmd.lineLength = 0;
        cmd.orbitDirection = orbitDir;
        cmd.reelIn = speed < 140 ? 1 : 0;      // tighten to gain speed
        cmd.payOut = speed > 320 ? 1 : 0;      // pay out near the cap to keep control
        // Pull toward the target so the orbit actually forms.
        steerTo(state, input, target.pos, { arrive: 10, hold: true });
        const swungS = (tick - swingStart) / TICKS_PER_S;
        const foe = nearest(state, (e) => hostileToFaction(e, state), 700);
        if (swungS > 2.5 && tick >= nextDecisionCheck) {
          ledger.recordDecision({
            situation: `release timing (speed ${Math.round(speed)} wu/s, foe ${foe ? 'near' : 'none'})`,
            options: [
              { id: 'release_now', tradeoff: 'convert swing to slingshot velocity now' },
              { id: 'hold_swing', tradeoff: 'more speed, more drift off course' },
            ],
            chosen: speed >= 230 || swungS > 8 ? 'release_now' : 'hold_swing',
          });
          nextDecisionCheck = tick + 1800;
        }
        if (speed >= 230 || swungS > 8 || swungS > 30) {
          ledger.recordNote(`cut after ${Math.round(swungS * 10) / 10}s at ${Math.round(speed)} wu/s`);
          cmd.cut = true; // edge — one tick
          latchedId = null;
          lineAttached = false;
          releaseGoal = foe ? 'hostile' : 'speed';
          phase = foe ? 'engage' : 'seek';
        }
        return;
      }

      if (phase === 'engage') {
        const foe = nearest(state, (e) => hostileToFaction(e, state), 900);
        if (!foe) { phase = 'seek'; return; }
        state.player.targetId = foe.entity.id;
        steerTo(state, input, foe.entity.pos, { arrive: 200 });
        input.fire = dist(p.pos, foe.entity.pos) < 520;
        input.fireGroup = 1;
        return;
      }

      // sustain: mine and sell every ~20 sim-min so the session stays solvent.
      if (state.simTime >= sustainAt) {
        sustainAt = state.simTime + 1200;
        const used = cargoUsedOf(state);
        if (used > 10) {
          const st = liveStations(state).sort((a, b) => dist(p.pos, a.pos) - dist(p.pos, b.pos))[0];
          if (st) {
            const d = steerTo(state, input, st.pos, { arrive: DOCK_RANGE_WU - 20, boost: true });
            if (d != null && d <= DOCK_RANGE_WU + (st.radius || 0)) services.dockAt(st);
            return;
          }
        }
        const rock = nearest(state, (e) => e.type === 'asteroid' && e.alive
          && e.data && (Number(e.data.yieldU) || 0) > 0, 700);
        if (rock) {
          const d = steerTo(state, input, rock.entity.pos, { arrive: 150 });
          if (d != null && d <= 170) { input.fire = true; input.fireGroup = 2; }
        }
        return;
      }
      phase = 'seek';
    },
  };
}

// ── Archetype 4: stranger (no game knowledge — follows the HUD like a new player) ────────────
// The design-proxy pilot: it knows the CONTROL GRAMMAR (thrust, aim, latch, reel, cut, fire,
// boost, scan, well, dock — the verbs the input contract already exposes) and reads ONLY the
// public guidance a player sees: state.nav.waypoint, state.onboarding.beatAction / beat keys /
// rescue / missingThree / raid / claimed substates. It never scripts the route: it follows
// whatever the current instruction says, so the ledger measures the onboarding rail itself.
export function createStrangerPilot({ state, bus, ledger, services }) {
  const TICKS_PER_S_LOCAL = 60;
  const DOCK_RANGE = 240;
  let swingStartTick = 0;
  let orbitDir = 1;
  let latchedId = null;
  let lineAttached = false;
  let strokeTicks = 0;
  let escapeFrom = null;         // {x,z} the wanted-escape runs away from
  let nearBreakUntil = -1;       // ease the winch when the line warns it is near break
  let grabBraking = false;       // stops a circling beacon approach dead before the creep
  let latchedTargetId = null;    // the body this policy intends to hold
  let needWinch = true;          // every fresh latch must be winched tight before a swing
  let raidWall = null;           // cached throw-target rock (static, so position is stable)
  let stuckTicks = 0;            // consecutive slow ticks while the hull should be moving
  let winchUntil = -1;           // simTime: reel this long after each fresh attach
  let traceWallMark = 0;         // wall-clock mark for the tick-rate heartbeat
  let settledBerth = null;       // `${stationId}|x|z` of the post-tutorial marker's served berth
  const decided = {};            // one decision log per choice point

  // Live bus names: 'tether:latched' on attach, 'tether:broke' on loss. The historical
  // 'tether:attached'/'tether:broken' names never emit — listening for them alone left
  // lineAttached/latchedId dead while real lines physically held (runs 86-89).
  const hook = (e) => {
    if (!e || e.flail === true) return;                       // flail links are not lines
    const owner = e.sourceId != null ? e.sourceId : e.actorId; // latched:sourceId / attached:actorId
    if (owner != null && state.playerId != null && owner !== state.playerId) return;
    lineAttached = true;
    if (e.targetId != null) latchedId = e.targetId;
    needWinch = true; winchUntil = (state.simTime || 0) + 5;
  };
  bus.on('tether:latched', hook);
  bus.on('tether:attached', hook);
  bus.on('jump:chargeAbort', (e) => {
    if (e && e.reason === 'low_fuel') decided.lowFuel = true;
    // A gate the ship cannot afford is no gate at all: the cell map is
    // contiguous, so the route falls back to flying it (run 78 parked at
    // Tethys with 22 credits against a 246-cr charge).
    if (e && e.reason === 'credits') {
      decided.noGateFunds = true;
      decided.gateFundsNeeded = Math.max(decided.gateFundsNeeded || 0, e.creditsNeeded || 0);
    }
  });
  if (process.env.STRANGER_PILOT_TRACE) {
    bus.on('jump:chargeAbort', (e) => console.log(`    [jump] chargeAbort ${JSON.stringify(e)}`));
    bus.on('sector:membershipCandidate', (e) => console.log(`    [jump] membershipCandidate ${JSON.stringify(e)}`));
    bus.on('tether:latchDenied', (e) => console.log(`    [tether] latchDenied ${JSON.stringify(e)}`));
    bus.on('tether:latched', (e) => console.log(`    [tether] latched ${JSON.stringify(e)}`));
    bus.on('tether:attached', (e) => console.log(`    [tether] attached ${JSON.stringify(e)}`));
    bus.on('tether:broke', (e) => console.log(`    [tether] broke ${JSON.stringify(e)}`));
    bus.on('tether:broken', (e) => console.log(`    [tether] broken ${JSON.stringify(e)}`));
    bus.on('tether:cut', (e) => console.log(`    [tether] cut ${JSON.stringify(e)}`));
    bus.on('tether:released', (e) => console.log(`    [tether] released ${JSON.stringify(e)}`));
    bus.on('tether:nearBreak', (e) => console.log(`    [tether] nearBreak ${JSON.stringify(e)}`));
    bus.on('tether:strain', (e) => console.log(`    [tether] strain ${JSON.stringify(e)}`));
    // Every heat write carries its source reason — the log names the crime the
    // moment it mints rather than leaving the pad trace to infer it from a value.
    bus.on('heat:changed', (e) => console.log(`    [heat] t=${Math.round((state && state.simTime) || 0)} heat=${e && e.value != null ? Number(e.value).toFixed(3) : '?'} wanted=${!!(e && e.wanted)} reason=${e && e.reason} zone=${e && e.zone ? `${e.zone.sectorId || '-'} r${Math.round(e.zone.radius || 0)}` : '-'}`));
  }
  const unhook = () => { lineAttached = false; latchedId = null; };
  bus.on('tether:nearBreak', () => { nearBreakUntil = (state.simTime || 0) + 1.4; });
  for (const ev of ['tether:broke', 'tether:broken', 'tether:cut', 'tether:cutPlayer', 'tether:released', 'tether:detached']) {
    bus.on(ev, unhook);
  }

  function massline(input, cmd) {
    input.actions = input.actions || {};
    input.actions.massline = cmd;
    input.actions.tetherFire = !!cmd.latch;
  }

  function neutralCommand() {
    return {
      phase: 'idle', latch: false, cut: false, lineControl: false, lineLength: 0,
      reelIn: 0, payOut: 0, orbitDirection: 0, pump: false, buffered: false, source: null,
    };
  }

  function ob() { return state.onboarding || null; }
  function rescue() {
    const o = ob();
    return o && o.rescue && o.rescue.active && !o.finished && o.rescue.current ? o.rescue : null;
  }
  function rescueEntity(slot) {
    const r = rescue();
    const id = r && r.ids ? r.ids[slot] : null;
    return id != null && state.entities ? state.entities.get(id) : null;
  }
  function three() {
    const o = ob();
    return o && o.missingThree && o.missingThree.active && !o.finished && o.missingThree.current
      ? o.missingThree : null;
  }
  function player() { return state.playerId != null ? state.entities.get(state.playerId) : null; }
  function speedOf(e) { return e && e.vel ? Math.hypot(e.vel.x || 0, e.vel.z || 0) : 0; }
  function dist(a, b) { return a && b ? Math.hypot(a.x - b.x, a.z - b.z) : Infinity; }
  function waypoint() { return state.nav && state.nav.waypoint ? state.nav.waypoint : null; }
  function heat() { return state.player && Number.isFinite(state.player.heat) ? state.player.heat : 0; }

  // The choice beat (B5) completes on mission:accepted. The board lives at the
  // berth: take the authored side-by-side offer that pays most, falling back to
  // the tracked firstTradeContract when the three were never issued. The same
  // read takes the campaign book's posted contract when one is on this board —
  // the row a player would see open in the board UI.
  function pickWork() {
    // One outstanding contract at a time: after the choice beat's first take the
    // rail keeps posting (the book's next job lands when the current one settles),
    // so the once-gate is "no live contract", not "never again".
    if (decided.tookChoice && ((state.missions && state.missions.active) || [])
      .some((m) => m && m.status === 'active')) return;
    const boards = state.missions && state.missions.boards ? state.missions.boards : {};
    // A player reads the board of the station they're berthed at — the authored
    // offers post on their named station, so a remote-board peek would cheat.
    const berthId = state.ui && state.ui.dockedStationId;
    const board = boards[berthId];
    const offers = [];
    let firstTrade = null;
    for (const offer of (board && (board.slots || board.offers)) || []) {
      if (!offer || !offer.id) continue;
      if (offer.source === 'onboardingChoice'
        || (offer.storyTag && offer.storyTag.startsWith('campaign47a:'))) offers.push(offer);
      else if (offer.source === 'firstTradeContract' && !firstTrade) firstTrade = offer;
    }
    const pool = offers.length ? offers : (firstTrade ? [firstTrade] : []);
    if (!pool.length) {
      if (process.env.STRANGER_PILOT_TRACE) {
        const slotKinds = Object.entries(boards).map(([sid, b]) =>
          `${sid}:${((b && (b.slots || b.offers)) || []).map((x) => x && (x.source || x.type || '?')).join('/')}`).join(' | ') || 'no-boards';
        console.log(`    [pick] t=${Math.round(state.simTime)} berth=${berthId} pool=empty boards=${slotKinds.slice(0, 200)}`);
      }
      return;
    }
    pool.sort((a, b) => (Number(b.reward_cr ?? b.rewardCr) || 0) - (Number(a.reward_cr ?? a.rewardCr) || 0));
    const top = pool[0];
    const second = pool[1];
    if (process.env.STRANGER_PILOT_TRACE) {
      console.log(`    [pick] t=${Math.round(state.simTime)} pool=${pool.map((x) => `${x.id}:${x.rewardCr}`).join(',')}`);
    }
    // acceptMission can refuse (stale row, maxActive, collateral gate): walk the
    // board in pay order and log the take only once one actually lands.
    for (const offer of pool) {
      if (!services.acceptMission(offer.id)) continue;
      decided.tookChoice = true;
      if (process.env.STRANGER_PILOT_TRACE) console.log(`    [pick] accepted ${offer.id} (${offer.type}, ${offer.rewardCr}cr)`);
      ledger.recordDecision({
        situation: 'three kinds of work side by side: haul, bounty, survey',
        options: [
          { id: `take:${top.id}`, tradeoff: 'highest pay on the board' },
          second
            ? { id: `take:${second.id}`, tradeoff: 'less pay, maybe safer work' }
            : { id: 'skip', tradeoff: 'stay free-roam' },
        ],
        chosen: `take:${offer.id}`,
      });
      return;
    }
  }

  function nearestDockStation() {
    const stations = (state.entityIndex && state.entityIndex.dockStations) || [];
    const p = player();
    if (!p) return null;
    return stations.filter((s) => s && s.alive)
      .sort((a, b) => dist(p.pos, a.pos) - dist(p.pos, b.pos))[0] || null;
  }

  function stationRecordId(s) {
    return (s && s.data && s.data.stationId) || (s && s.stationId) || (s && s.id) || null;
  }

  // The campaign book posts its next contract on one named station's board
  // (missionBoardOps._syncEmbodiedStoryOffer). When a pending authored offer sits
  // on any board, casting off activates it — the book's own departure hook
  // (missionStoryOps._activateBookContractOnDeparture) accepts the row, which is
  // how alloy_run loaded. A generic story marker only names the NEAREST port, so
  // the offer's presence — not the marker — is what keeps the berth working.
  function bookOffer() {
    const boards = (state.missions && state.missions.boards) || {};
    for (const [sid, board] of Object.entries(boards)) {
      for (const offer of (board && (board.slots || board.offers)) || []) {
        if (offer && offer.storyTag && offer.storyTag.startsWith('campaign47a:')) {
          return { stationId: sid, offer };
        }
      }
    }
    return null;
  }

  function decide(key, situation, options, chosen) {
    if (decided[key]) return chosen;
    decided[key] = true;
    ledger.recordDecision({ situation, options, chosen });
    return chosen;
  }

  // Nearest sizeable rock — the swing lesson's "big rock" is whatever looks biggest nearby.
  function bigRockNear(pos, maxD = 1600) {
    let best = null;
    let bestScore = 0;
    const list = state.entityList || [];
    for (const e of list) {
      if (!e || !e.alive || e.type !== 'asteroid' || !e.pos) continue;
      const d = dist(pos, e.pos);
      if (d > maxD) continue;
      const score = (e.radius || 0) - d * 0.02;
      if (score > bestScore) { bestScore = score; best = e; }
    }
    return best;
  }

  function flyTo(input, pos, opts = {}) {
    const p = player();
    if (!p || !pos) return Infinity;
    const d = dist(p.pos, pos);
    const speed = speedOf(p);
    // Cruise discipline: above 120 wu/s the hull cannot stop inside any arrive band, so bleed
    // speed first — a stranger never needs more than a fast cruise.
    if (speed > 120) {
      input.moveZ = 0;
      input.brake = true;
      return d;
    }
    // Turn-radius coupling: the Hitch circles at roughly speed x 5 of turn radius, so hold
    // speed under d/5 or the hull orbits the mark forever without ever closing.
    if (d < speed * 5) {
      input.moveZ = 0;
      input.brake = true;
      return d;
    }
    const arrive = opts.arrive ?? 60;
    const stopBand = opts.hold ? arrive : arrive + speed * 1.4;
    input.aimAngle = Math.atan2(pos.z - p.pos.z, pos.x - p.pos.x);
    const err = wrapAngle(input.aimAngle - (p.rot || 0));
    input.turnIntent = Math.max(-1, Math.min(1, err / 0.6));
    if (d <= stopBand && !opts.hold) {
      input.moveZ = 0;
      input.brake = true;
      return d;
    }
    const facing = Math.abs(err) < 0.5;
    input.moveZ = facing ? 1 : 0;
    input.boost = !!opts.boost && facing;
    return d;
  }

  function nearestEntityTo(pos, maxD) {
    let best = null;
    let bestD = maxD;
    const list = state.entityList || [];
    for (const e of list) {
      if (!e || !e.alive || !e.pos) continue;
      const dd = dist(pos, e.pos);
      if (dd < bestD) { bestD = dd; best = e; }
    }
    return best;
  }

  function tryLatch(input, cmd, target, label) {
    const p = player();
    if (!p || !target) return false;
    const d = flyTo(input, target.pos, { arrive: 20 });
    // Light bodies punt off the hull on contact, and settle-to-rest brakes are gentle by
    // owner decree: throttle by distance so the hull arrives slow enough to latch, not ram.
    const sp = speedOf(p);
    if (d < 320) {
      // settle-to-rest decel is gentle: creep only the final approach, chase at speed beyond
      const maxSp = Math.max(15, d / 12);
      if (sp > maxSp) {
        input.aimAngle = Math.atan2(target.pos.z - p.pos.z, target.pos.x - p.pos.x);
        input.turnIntent = Math.max(-1, Math.min(1, wrapAngle(input.aimAngle - (p.rot || 0)) / 0.5));
        input.moveZ = 0;
        input.brake = true;
        input.boost = false;
        return d;
      }
    }
    // Park the cursor on the body: acquisition scoring weights cursor proximity, and the nose
    // line alone keeps offering the heavier wreck parked behind the target on the same bearing.
    input.aimWorld = input.aimWorld || {};
    input.aimWorld.x = target.pos.x;
    input.aimWorld.z = target.pos.z;
    input.aimIntentActive = true;
    // Get close and stopped, then wait for the reticle to actually NAME the body before
    // pressing — exactly how a player lines up the diamond. At point-blank the cone holds
    // only the marked body, so the press cannot grab a stranger.
    const speed = speedOf(p);
    const acq = state.masslineAcquisition && state.masslineAcquisition.selected;
    const aimed = acq && acq.status === 'ready' && acq.targetId === target.id;
    // Pulse the latch (press ~2 ticks, release ~10) — a held press is consumed once and the
    // tether never sees the retry, exactly like a player mashing the key until it takes.
    const pulse = (state.tick % 12) < 2;
    // Use the ready scored receipt for the offered body. Ctrl-nearest is a separate player
    // override and can grab a closer incidental hull while the pilot is pursuing a named target.
    if (d < 90 && speed < 60 && !lineAttached && pulse && aimed) {
      input.tetherMode = null;
      cmd.latch = true;
      latchedTargetId = target.id;
      const key = `latch:${label}:${target.id}`;
      if (!decided[key]) {
        decided[key] = true;
        ledger.recordDecision({
          situation: `latch the offered ${label || 'target'}`,
          options: [
            { id: `latch:${target.id}`, tradeoff: 'do the taught verb now' },
            { id: 'wait', tradeoff: 'drift past, maybe a better target later' },
          ],
          chosen: `latch:${target.id}`,
        });
      }
      return true;
    }
    input.tetherMode = null;
    return false;
  }

  function orbitAndRelease(input, cmd, tick, targetId, opts) {
    const p = player();
    const target = state.entities.get(targetId);
    if (!p || !target || !target.alive) return 'lost';
    const speed = speedOf(p);
    if (!lineAttached) return 'relink';
    cmd.lineControl = true;
    cmd.orbitDirection = orbitDir;
    // The winch reads lineLength as a signed rate: negative reels IN, positive pays out.
    cmd.lineLength = speed < opts.minSpeed ? -1 : (speed > opts.releaseSpeed * 0.9 ? 1 : 0);
    flyTo(input, target.pos, { arrive: 10, hold: true });
    const swungS = (tick - swingStartTick) / TICKS_PER_S_LOCAL;
    // Release when fast AND the flung mass heads roughly at the goal body (the "big rock").
    const goal = opts.goal ? state.entities.get(opts.goal) : null;
    if (goal && goal.pos && target.vel) {
      const rel = { x: target.vel.x, z: target.vel.z };
      const sp = Math.hypot(rel.x, rel.z) || 1;
      const toGoal = { x: goal.pos.x - target.pos.x, z: goal.pos.z - target.pos.z };
      const gd = Math.hypot(toGoal.x, toGoal.z) || 1;
      const dot = (rel.x * toGoal.x + rel.z * toGoal.z) / (sp * gd);
      // The orbit sweeps the release direction through every angle: hold on until the swing
      // geometry actually points the mass at the goal, then let go.
      if (speed >= opts.releaseSpeed && dot > (opts.alignDot ?? 0.55)) {
        cmd.cut = true;
        unhook();
        return 'released';
      }
    }
    if (swungS > (opts.maxSwingS ?? 30) || speed >= opts.releaseSpeed * 1.8) {
      cmd.cut = true;
      unhook();
      return 'released';
    }
    return 'swinging';
  }

  function beginSwingIfLatched(targetId) {
    if (lineAttached && latchedId === targetId && swingStartTick === 0) {
      swingStartTick = state.tick;
    }
  }

  return {
    name: 'stranger',
    traceMeta: Object.freeze({ mode: 'adventure', tutorialPilot: true, driver: 'stranger', seed: state.meta.seed }),
    step(dt, tick) {
      if (process.env.STRANGER_PILOT_TRACE) {
        const nowMs = Date.now();
        if (!traceWallMark || nowMs - traceWallMark > 15000) {
          traceWallMark = nowMs;
          const p0 = player();
          const ents = state.entityList ? state.entityList.length : (state.entities ? state.entities.size : -1);
          const evs = state.combat && state.combat.trace && state.combat.trace.events ? state.combat.trace.events.length : -1;
          const att = state.combat && state.combat.attachments && state.combat.attachments.byId ? Object.keys(state.combat.attachments.byId).length : -1;
          console.log(`    [wall] t=${Math.round(state.simTime)} tick=${state.tick} ents=${ents} traceEvs=${evs} attach=${att} alive=${p0 ? p0.alive : 'null'} hull=${p0 ? Math.round(p0.hull || 0) : '-'} docked=${!!(state.ui && state.ui.docked)}`);
        }
      }
      const p = player();
      if (!p || !p.alive) return;
      // Read the same live line state as the HUD. Global line events can belong to NPCs,
      // and a requested cut can be refused, so callbacks alone cannot own this decision.
      const tether = state.player && state.player.tether;
      if (tether) {
        lineAttached = tether.active === true;
        latchedId = lineAttached ? tether.targetId : null;
      }
      const input = neutralInput(state);
      const cmd = neutralCommand();
      massline(input, cmd);
      const o = ob();
      if (process.env.STRANGER_PILOT_TRACE && (state.tick % 180) === 0) {
        const pl = p;
        const act = (state.missions && state.missions.active) || [];
        const msum = act.slice(0, 3).map((m) => {
          const pr = m.params || {};
          const aboard = pr.cmdtyId ? ((state.player && state.player.cargo && state.player.cargo.items && state.player.cargo.items[pr.cmdtyId]) || 0) : '-';
          return `${m.id}:${m.type}:${m.status}@${m.destStationId || m.stationId || '-'}#${m.objectiveProgress}/${m.objectiveTarget} tag=${m.storyTag || '-'} cmd=${pr.cmdtyId || '-'}x${pr.qty || '-'} sealed=${pr.sealedRemaining ?? '-'} hold=${aboard}`;
        }).join(',') || 'none';
        const wpNow = state.nav && state.nav.waypoint;
        console.log(`    [step] t=${Math.round(state.simTime)} beat=${o && o.currentBeat} fin=${o ? !!o.finished : '-'} v=${Math.round(speedOf(pl))} resc=${o && o.rescue ? o.rescue.current : '-'} docked=${!!(state.ui && state.ui.docked) || !!(pl.flags && pl.flags.docked)} mode=${state.mode} teth=${!!(state.player && state.player.tether && state.player.tether.active)} track=${(state.ui && state.ui.trackedMissionId) || '-'} wp=${wpNow ? `${wpNow.kind}:${wpNow.label || ''}:${wpNow.stationId || '-'}` : 'none'} sec=${state.world && state.world.currentSectorId} jump=${(state.jump && state.jump.state) || '-'} missions=${msum} beatAct='${(o && o.beatAction) || ''}'.slice(0,30)`);
      }

      // Docked: sell, breathe, undock (the same station verbs the UI uses).
      if ((state.ui && state.ui.docked) || (p.flags && p.flags.docked)) {
        if (!decided.dockSell) {
          decided.dockSell = true;
          ledger.recordDecision({
            situation: 'docked: sell the hold now or shop the board first',
            options: [
              { id: 'sell_first', tradeoff: 'credits now, board after' },
              { id: 'board_first', tradeoff: 'pick work first, sell on the way out' },
            ],
            chosen: 'sell_first',
          });
        }
        // Sealed manifest freight is contract-bound: selling it mid-route strands the
        // delivery (the units are ordinary cargo; the manifest accounts them). Sell the
        // hold only when no delivery is outstanding.
        const sealedPending = ((state.missions && state.missions.active) || [])
          .some((m) => m && m.params && Number(m.params.sealedRemaining) > 0);
        if (!sealedPending) services.sellEverythingAt(state.ui.dockedStationId);
        // Contract resupply: an addressed delivery/quota contract wants its units aboard —
        // buy the shortfall here so the next berth can settle it. Preloaded/sealed freight
        // comes from the contract itself, never the market.
        {
          const here = state.ui && state.ui.dockedStationId;
          const hold = (state.player && state.player.cargo && state.player.cargo.items) || {};
          for (const m of ((state.missions && state.missions.active) || [])) {
            const pr = m && m.params;
            if (!m || m.status !== 'active' || !m.destStationId || !pr || !pr.cmdtyId || m.preloadedCargo) continue;
            const short = Math.max(1, pr.qty || 1) - (hold[pr.cmdtyId] || 0);
            if (short > 0) services.trade(here, pr.cmdtyId, 'buy', short);
          }
        }
        // Scale 4 weighs a jettisoned pod — with the hold bare, berth-shopping a
        // single loose unit is the freight the scale needs. Stations only sell
        // what they produce: try the trade-hub staples before the mining list.
        {
          const w = state.nav && state.nav.waypoint;
          const holdNow = (state.player && state.player.cargo && state.player.cargo.items) || {};
          const loose = selectedJettisonLot(state) != null;
          if (w && w.kind === 'story' && /scale 4/i.test(w.label || '') && !loose) {
            let bought = null;
            for (const cmdty of ['cmdty_food', 'cmdty_regocrete', 'cmdty_luxury_goods',
              'cmdty_ore_iron', 'cmdty_silicate', 'cmdty_volatiles', 'cmdty_ore_copper']) {
              // A few units: a pod that sails through the ring unread costs a
              // re-run, not another berth round trip (run 67).
              const res = services.trade(state.ui.dockedStationId, cmdty, 'buy', 3);
              if (res && res.ok) { bought = cmdty; break; }
            }
            if (process.env.STRANGER_PILOT_TRACE) {
              console.log(`    [scale4] t=${Math.round(state.simTime)} berth=${state.ui.dockedStationId} bought=${bought || 'refused'}`);
            }
            decided.scale4Shopped = true;
          }
        }
        services.repair();
        // Top the tank at any pump berth — the hardship rule files unpaid units on
        // the note, so a broke stranger is never stranded (run 76: low_fuel aborts).
        {
          const fuel = state.fuel || {};
          const berthId = state.ui && state.ui.dockedStationId;
          const berth = (state.entityIndex && state.entityIndex.dockStations || [])
            .find((s) => s && s.alive && stationRecordId(s) === berthId);
          const pumped = berth && berth.data && Array.isArray(berth.data.services) && berth.data.services.includes('refuel');
          if (pumped && Number.isFinite(fuel.current) && fuel.current < fuel.max - 1) {
            bus.emit('ui:service', { type: 'refuel' });
          }
        }
        // Furnace Detail rack refill — the waypoint's own resupply line: "buy and
        // load more frag at Tethys Trade Hub". Ordnance work is berth-gated to an
        // outfit bay (shipyard/module_craft service); ui:buyPayload + ui:fitPayload
        // are the public intents the Shipworks rack screen emits. A berth without
        // an outfit bay just answers bombs:denied — harmless, idempotent.
        {
          const fm = ((state.missions && state.missions.active) || [])
            .find((m) => m && m.status === 'active' && m.params
              && m.params.furnaceWorksiteVersion === 1);
          const mitesLeft = fm ? (fm.objectiveTarget || 4) - (fm.objectiveProgress || 0) : 0;
          const bag = state.bombs || {};
          const cells = (bag.rack && bag.rack.cells) || [];
          const stock = bag.stock || {};
          const aboard = cells.reduce((n, c) => n + (c && c.id === 'bomb_frag' ? c.count : 0), 0)
            + (stock.bomb_frag || 0);
          const need = mitesLeft * 2 + 2;
          const berthEnt = ((state.entityIndex && state.entityIndex.dockStations) || [])
            .find((s) => s && s.alive && stationRecordId(s) === (state.ui && state.ui.dockedStationId));
          const canOutfit = berthEnt && berthEnt.data && Array.isArray(berthEnt.data.services)
            && (berthEnt.data.services.includes('shipyard') || berthEnt.data.services.includes('module_craft'));
          if (mitesLeft > 0 && aboard < need && canOutfit && !decided.fragGiveUp) {
            // A refused buy (credits, stock) must not loop the ship Tethys↔Ceres
            // forever: after three denied swings the detail waits as open work.
            decided.fragBuys = (decided.fragBuys || 0) + 1;
            if (decided.fragBuys >= 3) decided.fragGiveUp = true;
            bus.emit('ui:buyPayload', { payloadId: 'bomb_frag', units: Math.min(8, need - aboard) });
            bus.emit('ui:fitPayload', { socketIndex: 0, payloadId: 'bomb_frag' });
          }
        }
        // The board is read at the berth: the choice beat completes on
        // mission:accepted, so take the work BEFORE casting off. Run 40 undocked
        // first and parked at the station for 260+ sim-s — the beat's marker had
        // flipped to the mission's own (foreign) diamond, so the pick branch under
        // the wp.onboarding gate never ran.
        pickWork();
        // Stay berthed when the rail is done, no contract is outstanding, and no
        // HUD marker wants the ship elsewhere — the first-hour route ends tied to
        // a dock; undocking just re-parks. A story marker like the Scale 4 pad or
        // any live contract still casts off — and so does a pending campaign book
        // offer on ANY board: the book's own departure hook accepts the posted row
        // on undock (run 68 froze the session holding customs' berth while the
        // Furnace Detail waited on Tethys' board).
        const wMark = waypoint();
        const berthId = state.ui && state.ui.dockedStationId;
        const markerElsewhere = wMark && wMark.pos && (!wMark.stationId || wMark.stationId !== berthId);
        const stillWorking = !(o && o.finished)
          || markerElsewhere
          || !!bookOffer()
          || ((state.missions && state.missions.active) || [])
            .some((m) => m && m.status === 'active');
        if (stillWorking) services.undock();
        return;
      }

      // Tutorial done — fly whatever the board took. A docked-delivery settles on
      // dock:docked at its destination; with no contract outstanding, hold politely.
      // (Must precede the economy branches: after _finish() the stale beat line still
      // matches them and the ship would re-dock the same station forever.)
      if (o && o.finished) {
        const active = (state.missions && state.missions.active) || [];
        // Resupply leg first: an addressed delivery/quota contract whose units are not
        // aboard can't settle anywhere — route to the nearest market berth, buy the
        // shortfall (the docked block does the trade), then let the contract leg resume.
        {
          const hold = (state.player && state.player.cargo && state.player.cargo.items) || {};
          const needs = active.some((m) => {
            const pr = m && m.params;
            return m && m.status === 'active' && m.destStationId && pr && pr.cmdtyId
              && !m.preloadedCargo && (hold[pr.cmdtyId] || 0) < Math.max(1, pr.qty || 1);
          });
          if (needs) {
            const market = ((state.entityIndex && state.entityIndex.dockStations) || [])
              .filter((s) => s && s.alive && s.data && Array.isArray(s.data.services)
                && s.data.services.includes('trade'))
              .sort((a, b) => dist(p.pos, a.pos) - dist(p.pos, b.pos))[0];
            if (market && dist(p.pos, market.pos) > DOCK_RANGE + (market.radius || 0)) {
              flyTo(input, market.pos, { arrive: DOCK_RANGE - 20, boost: true });
              return;
            }
            if (market) { services.dockAt(market); return; }
          }
        }
        // Cross-sector leg: plot through the chart's own seam (`world:requestRoute`
        // writes `state.nav.route` synchronously — a Dijkstra over discovered space),
        // then jump the NEXT hop only. Requesting the destination directly aborts
        // 'not_a_neighbor' on any multi-hop road (run 75: station_expanse sits two
        // gates from tethys_junction; 21k chargeAborts parked the ship forever).
        const mw = waypoint();
        // Pocket-wedge escape (run 124): the beat rolled the instant the garden
        // took the feed, and the braking ship drifted to v≈0 inside the
        // receiver's ~110-WU static hull — every nav leg after that pressed the
        // nose into the interior wall and the hull sat byte-frozen for minutes
        // (same signature as scale4's furniture pin). A hollow-hull pocket's
        // only channel is back the way it came, so remember the last position
        // outside every static-solid envelope while the hull moves; sustained
        // ~0 speed inside one means contact-locked — steer back to that open
        // point. The compost tow dips inside the envelope edge under power and
        // at speed, so an active line can never trigger this.
        {
          const shipR = (p.radius || 10) + 4;
          let shell = null;
          for (const e of (state.entityList || [])) {
            if (!e || e.alive === false || !e.pos || e.id === p.id) continue;
            const r = Number(e.radius) || 0;
            if (r <= shipR) continue;
            const stat = (e.physicsBody && e.physicsBody.dynamic === false)
              || ['asteroid', 'station', 'garden', 'planet', 'massSeed', 'fieldEmitter'].includes(e.type);
            if (!stat) continue;
            if (dist(p.pos, e.pos) < r) { shell = e; break; }
          }
          if (shell) {
            if (speedOf(p) < 5) stuckTicks = (stuckTicks || 0) + 1;
            else stuckTicks = 0;
          } else {
            decided.lastOpen = { x: p.pos.x, z: p.pos.z };
            stuckTicks = 0;
          }
          if (decided.wedgeUntil && (state.simTime || 0) > decided.wedgeUntil) decided.wedgeUntil = 0;
          if (!shell) decided.wedgeUntil = 0;
          else if (!lineAttached && stuckTicks > 240) decided.wedgeUntil = (state.simTime || 0) + 10;
          if (decided.wedgeUntil && decided.lastOpen) {
            if (process.env.STRANGER_PILOT_TRACE && (state.tick % 60) === 0) {
              console.log(`    [wedge] t=${Math.round(state.simTime)} inside ${shell.type}#${shell.id}@${Math.round(dist(p.pos, shell.pos))} escaping to lastOpen=${Math.round(decided.lastOpen.x)},${Math.round(decided.lastOpen.z)} stuck=${stuckTicks}`);
            }
            flyTo(input, decided.lastOpen, { arrive: 24 });
            return;
          }
        }
        // Hop toward a sector through the chart's own seam — same request +
        // first-leg jump the cross-sector leg uses, callable for any target.
        const hopToSector = (targetSec) => {
          const curS = state.world && state.world.currentSectorId;
          if (!targetSec || targetSec === curS) return true;
          // The same rule the cross-sector leg enforces: cast the line off
          // before a gate, never gate-drag a load.
          if (lineAttached) { cmd.cut = true; return true; }
          // No credits for the charge → no hop; callers fly instead. The flag
          // clears once the purse covers the denied charge again.
          if (decided.noGateFunds
            && (state.player && state.player.credits || 0) >= (decided.gateFundsNeeded || Infinity)) {
            decided.noGateFunds = false;
          }
          if (decided.noGateFunds) return false;
          bus.emit('world:requestRoute', { targetSectorId: targetSec, mode: 'gate' });
          const legs = ((state.nav && state.nav.route) || {}).legs || [];
          const hop = legs.find((l) => l && l.from === curS)
            || legs.find((l) => l && l.to && l.to !== curS);
          if (!hop || !hop.to || hop.to === curS) return false;
          if ((state.jump || {}).state === 'IDLE' && (state.jump || {}).cooldownT <= 0) {
            bus.emit('world:requestJump', { targetSectorId: hop.to, via: hop.via || 'gate' });
          }
          input.brake = true;
          return true;
        };
        // WANTED cooling — the authored escape, not a workaround. Above the
        // threshold the search circle lives in the sector that minted it; every
        // tick of `outsideS` inside that sector and outside the circle drops a
        // level. Jumping away FREEZES it (zone.active=false → no decay) — run
        // 115's Rook stall was a busted-scan warrant parked in Charon while the
        // circle sat in Ceres. So before ANY leg may gate-hop the ship further
        // from the crime scene: drop the tow (contract-retained hulls keep
        // their marker record), hop BACK to the zone's sector if needed, then
        // hold outside the circle until the ledger clears.
        if (isPlayerWanted(state)) {
          const zone = state.player && state.player.heatZone;
          const curSec = state.world && state.world.currentSectorId;
          if (lineAttached) { cmd.cut = true; return; }
          if (zone && zone.sectorId && zone.sectorId !== curSec) {
            if (hopToSector(zone.sectorId)) return;
            // No route/funds back — hold local; the sector the warrant opened
            // in is the only place outsideS accrues, so local loiter is already
            // the least-bad stall and keeps the ship off more pads.
            input.brake = speedOf(p) > 6;
            return;
          }
          if (zone && zone.center && Number.isFinite(zone.radius) && zone.radius > 0) {
            const dC = Math.hypot(p.pos.x - zone.center.x, p.pos.z - zone.center.z);
            if (dC <= zone.radius * 1.15) {
              const dir = dC > 1
                ? { x: (p.pos.x - zone.center.x) / dC, z: (p.pos.z - zone.center.z) / dC }
                : { x: 1, z: 0 };
              flyTo(input, {
                x: zone.center.x + dir.x * zone.radius * 1.35,
                z: zone.center.z + dir.z * zone.radius * 1.35,
              }, { arrive: 60 });
              return;
            }
            input.moveZ = 0; input.moveX = 0; input.brake = speedOf(p) > 4;
            if (process.env.STRANGER_PILOT_TRACE && (state.tick % 120) === 0) {
              console.log(`    [heat] cooling t=${Math.round(state.simTime || 0)} d=${Math.round(dC)} r=${Math.round(zone.radius)} heat=${(state.player.heat || 0).toFixed(3)} outsideS=${Math.round(zone.outsideS || 0)}/${zone.clearAfterS || '?'}`);
            }
            return;
          }
          // Wanted with no zone packet — defensive: hold station, keep the line
          // off, and let whatever writer owns the ledger see a still target.
          input.brake = speedOf(p) > 4;
          return;
        }
        // Furnace Detail's open ledger owns navigation while any lot is
        // unresolved — received and lost both close a slot, and no other
        // contract's route may pull the ship off the worksite mid-ledger
        // (run 77: m_5's gate route dragged a tethered pod Vesta→Helios→Phoebe
        // at 9000 wu/s and left the ledger dangling 78 km out).
        const furnaceM = active.find((m) => m && m.status === 'active' && m.params
          && m.params.furnaceWorksiteVersion === 1);
        const furnaceRows = furnaceM
          ? (furnaceM.params.furnaceLots || []).filter((row) => row && !row.received && !row.lost)
          : [];
        const furnaceMitesOpen = furnaceM
          && (furnaceM.objectiveProgress || 0) < (furnaceM.objectiveTarget || 4);
        const furnaceCells = (((state.bombs || {}).rack || {}).cells) || [];
        const furnaceFragLoaded = furnaceCells.some((c) => c && c.id === 'bomb_frag' && c.count > 0);
        const furnaceLedger = furnaceM && (furnaceMitesOpen || furnaceRows.length > 0);
        if (furnaceLedger) {
          const curSec = state.world && state.world.currentSectorId;
          const DEST = furnaceM.destSectorId;
          if (furnaceMitesOpen) {
            if (!furnaceFragLoaded && !decided.fragGiveUp) {
              // Rack refill route (the waypoint's own resupply line): hop to the
              // Tethys shipyard berth, the docked block files buy/fit intents.
              if (curSec !== 'sector_tethys_junction') {
                if (!hopToSector('sector_tethys_junction')) decided.fragGiveUp = true;
                return;
              }
              const tethys = ((state.entityIndex && state.entityIndex.dockStations) || [])
                .find((s) => s && s.alive && stationRecordId(s) === 'station_tethys');
              if (tethys && dist(p.pos, tethys.pos) > DOCK_RANGE + (tethys.radius || 0)) {
                // No boost near the lip of a dock window: a 475 wu/s pass needs
                // kilometres to brake and just re-orbits (run 78).
                flyTo(input, tethys.pos, { arrive: DOCK_RANGE - 20 });
                return;
              }
              if (tethys) { services.dockAt(tethys); return; }
            }
            // Mites only exist in the worksite cell — while away, the only
            // authorized trip is home (the in-sector block does the drops).
            if (curSec !== DEST) {
              if (!hopToSector(DEST) && mw && mw.pos) {
                flyTo(input, mw.pos, { arrive: 80, boost: energyReady(p) });
              }
              return;
            }
          } else {
          const livePods = furnaceRows
            .map((row) => state.entities.get(row.entityId))
            .filter((e) => e && e.alive !== false && e.pos)
            .map((e) => ({ e, sec: sectorMembershipAtGlobal(e.pos) }))
            .sort((a, b) => dist(p.pos, a.e.pos) - dist(p.pos, b.e.pos));
          const feedable = livePods.filter((row) => row.sec === DEST);
          const foreign = livePods.filter((row) => row.sec !== DEST);
          if (process.env.STRANGER_PILOT_TRACE && (state.tick % 120) === 0) {
            console.log(`    [furnace-ledger] t=${Math.round(state.simTime || 0)} sec=${curSec} feed=${feedable.length} foreign=${foreign.length} shelved=${furnaceRows.length - livePods.length} frag=${furnaceFragLoaded} prog=${furnaceM.objectiveProgress}/${furnaceM.objectiveTarget}`);
          }
          // Aiming AT a foreign pod's position parks at the arrive band on the
          // near side of the cell line — the goal is crossing INTO its cell, so
          // every fallback flight aims 400 wu past the mark (run 79 parked 60 wu
          // short of a Tethys-side pod for 80+ s).
          const flyPast = (pos) => {
            const dx = pos.x - p.pos.x, dz = pos.z - p.pos.z;
            const dd = Math.hypot(dx, dz) || 1;
            flyTo(input, { x: pos.x + (dx / dd) * 400, z: pos.z + (dz / dd) * 400 },
              { arrive: 60, boost: energyReady(p) });
          };
          if (feedable.length) {
            // Towable pods wait in the worksite cell — the only trip the ledger
            // authorizes while away is home. In-sector the block below tows.
            if (curSec !== DEST) {
              if (!hopToSector(DEST)) flyPast(feedable[0].e.pos);
              return;
            }
          } else if (foreign.length) {
            const t = foreign[0];
            // Haul first: a foreign pod can't cross the lip from its cell —
            // but the line crosses cell boundaries without a gate, so drag it
            // home. The ship leads the tow and flips sectors a moment before
            // the pod does; checking the tow before the hop check is what keeps
            // the line from being cut at every boundary (the pod's membership
            // flips mid-tow and it is feedable from there). Run 80 showed why
            // killing it isn't an option: a 220-hull pod shrugs off the rack's
            // 30-damage frags — towing is the authored recovery.
            if (lineAttached && latchedId === t.e.id) {
              cmd.lineControl = true;
              cmd.lineLength = -0.6;
              flyTo(input, furnaceMouthGlobal(), { arrive: 10 });
              return;
            }
            if (lineAttached) { cmd.cut = true; return; }
            if (t.sec !== curSec) {
              // The cell map is contiguous — an uncharted sector that gates
              // can't route to is still a straight flight.
              if (!hopToSector(t.sec)) flyPast(t.e.pos);
              return;
            }
            {
              const d0 = dist(p.pos, t.e.pos);
              const pv0 = t.e.vel || { x: 0, z: 0 };
              // Intercept time, not a flat lead: `d/60 → cap 30 s` aims at a
              // point 30 s ahead of the pod and stalls at d≈3600 (run 82 — the
              // ghost point rides the pod's track forever). Aiming where the
              // pod will be when the ship can reach its spot converges.
              const leadS0 = Math.min(d0 / Math.max(speedOf(p), 80), 25);
              const lead0 = {
                x: t.e.pos.x + pv0.x * leadS0,
                z: t.e.pos.z + pv0.z * leadS0,
              };
              input.aimAngle = Math.atan2(lead0.z - p.pos.z, lead0.x - p.pos.x);
              const err0 = wrapAngle(input.aimAngle - (p.rot || 0));
              input.turnIntent = Math.max(-1, Math.min(1, err0 / 0.5));
              input.moveZ = Math.abs(err0) < 0.6 ? 1 : 0;
              // A pod released on a ballistic track outruns cruise — run128 chased
              // pod#813 across 110 km of Triton Wake at +3.5 wu/s forever. Boost is
              // the authored catch-up: burn it whenever the gap is still growing.
              input.boost = energyReady(p) && Math.abs(err0) < 0.6 && d0 > 700
                && speedOf(p) < speedOf(t.e) + 220;
              input.brake = speedOf(p) > speedOf(t.e) + Math.max(25, d0 / 8);
              const pulse0 = (state.tick % 12) < 2;
              if (d0 < 90 && speedOf(p) < speedOf(t.e) + 45 && pulse0) {
                input.aimWorld = { x: t.e.pos.x, z: t.e.pos.z };
                input.tetherMode = 'nearest';
                cmd.latch = true;
              }
              if (process.env.STRANGER_PILOT_TRACE && (state.tick % 120) === 0) {
                console.log(`    [furnace] t=${Math.round(state.simTime || 0)} haul pod#${t.e.id} d=${Math.round(d0)} sec=${t.sec} prog=${furnaceM.objectiveProgress}/${furnaceM.objectiveTarget}`);
              }
              return;
            }
          } else {
            // Every pending lot is shelved — the runtime rematerializes a lot
            // only while the ship is inside its record sector. Go get it.
            const row = furnaceRows.find((r) => r.sectorId && r.sectorId !== curSec);
            if (row) {
              if (!hopToSector(row.sectorId) && row.pos) flyPast(row.pos);
              return;
            }
          }
          }
        }
        {
          const tracked = active.find((m) => m && m.status === 'active'
            && m.id === (state.ui && state.ui.trackedMissionId)) || active[0];
          const destSectorId = (tracked && tracked.destSectorId) || (mw && mw.sectorId);
          const curSector = state.world && state.world.currentSectorId;
          if (destSectorId && curSector && destSectorId !== curSector) {
            // Never gate-drag a load: a tethered body exits jumps with the same
            // velocity the ship does and whips it for kilometres (run 77: pod
            // #1586 rode Vesta→Helios→Ceres→Phoebe tethered at 9000 wu/s).
            if (lineAttached) { cmd.cut = true; return; }
            // Broke ships walk the corridor: the cell map is contiguous, so the
            // waypoint is still a straight — long — flight (run 78 parked at
            // Tethys with 22 cr against a 246-cr charge).
            if (decided.noGateFunds && mw && mw.pos) {
              flyTo(input, mw.pos, { arrive: 80, boost: energyReady(p) });
              return;
            }
            // Fuel first: a refused charge means 'find the pump in THIS sector' —
            // requesting the hop again just re-aborts (run 76 parked at Ceres
            // with 27/36). Berth at the nearest refuel station; the docked block
            // files the ui:service refuel job; lowFuel clears on a near-full tank.
            const fuel = state.fuel || {};
            if (decided.lowFuel && Number.isFinite(fuel.current) && fuel.current >= fuel.max * 0.9) decided.lowFuel = false;
            if (decided.lowFuel || (Number.isFinite(fuel.current) && Number.isFinite(fuel.max) && fuel.current < Math.max(8, fuel.max * 0.25))) {
              decided.lowFuel = true;
              const pump = ((state.entityIndex && state.entityIndex.dockStations) || [])
                .filter((s) => s && s.alive && s.data && Array.isArray(s.data.services)
                  && s.data.services.includes('refuel'))
                .sort((a, b) => dist(p.pos, a.pos) - dist(p.pos, b.pos))[0];
              if (pump) {
                if (dist(p.pos, pump.pos) > DOCK_RANGE + (pump.radius || 0)) {
                  flyTo(input, pump.pos, { arrive: DOCK_RANGE - 20, boost: energyReady(p) });
                } else {
                  services.dockAt(pump);
                }
                return;
              }
            }
            const route = state.nav && state.nav.route;
            const legs = route && Array.isArray(route.legs) ? route.legs : [];
            if (!legs.length || legs[legs.length - 1].to !== destSectorId) {
              bus.emit('world:requestRoute', { targetSectorId: destSectorId, mode: 'gate' });
            }
            const routeLegs = ((state.nav && state.nav.route) || {}).legs || [];
            const hop = routeLegs.find((l) => l && l.from === curSector)
              || routeLegs.find((l) => l && l.to && l.to !== curSector);
            if (hop && hop.to && hop.to !== curSector) {
              if ((state.jump || {}).state === 'IDLE' && (state.jump || {}).cooldownT <= 0) {
                bus.emit('world:requestJump', { targetSectorId: hop.to, via: hop.via || 'gate' });
              }
              input.brake = true;
              return;
            }
          }
        }
        // Survey leg: recon_scan settles one unit per sector scan pulse while the
        // ship sits inside the contract's sector — the same KeyC ping the tutorial
        // taught. Run 50 parked at the Ceres diamond with 0/2 forever.
        if (active.some((m) => m && m.status === 'active' && m.type === 'recon_scan'
          && m.destSectorId === (state.world && state.world.currentSectorId)
          && (m.objectiveProgress || 0) < (m.objectiveTarget || 1))) {
          input.actions.scanPulse = true;
        }
        // Scale 4 worksite: the Book-1 weigh wants a jettisoned pod at rest inside
        // the tally ring. A bare hold first berths for a loose stone; then the
        // pilot hovers the pad under the rest speed and taps the hold's own
        // jettison edge — the pod settles in the ring and the desk reads it.
        if (mw && mw.kind === 'story' && /scale 4/i.test(mw.label || '')) {
          const holdNow = (state.player && state.player.cargo && state.player.cargo.items) || {};
          // "Loose" must mean jettisonable: a hold of only sealed/persistent lots
          // makes every jettisonLot tap a silent refusal (run 66 — 253 taps, zero
          // pods). selectedJettisonLot is the consume path's own predicate.
          const loose = selectedJettisonLot(state) != null;
          if (process.env.STRANGER_PILOT_TRACE && (state.tick % 180) === 0) {
            const pods = (state.entityList || []).filter((e) => e && e.alive && e.data
              && (e.data.payloadType === 'jettisoned_cargo' || e.data.jettisonedCargo === true))
              .map((e) => `pod@${Math.round(e.pos.x)},${Math.round(e.pos.z)}v${Math.round(speedOf(e))}${e.data.kesslerRead ? ':read' : ''}`);
            const holdTxt = Object.keys(holdNow).filter((id) => holdNow[id] > 0).map((id) => `${id}x${holdNow[id]}`).join(',') || 'empty';
            console.log(`    [scale4] t=${Math.round(state.simTime)} ship@${Math.round(p.pos.x)},${Math.round(p.pos.z)} dPad=${Math.round(mw.pos ? dist(p.pos, mw.pos) : -1)} loose=${loose} hold=${holdTxt} shopped=${!!decided.scale4Shopped} rot=${(p.rot ?? 0).toFixed(2)} pods=${pods.join(',') || 'none'}`);
          }
          const podDown = mw.pos && (state.entityList || []).some((e) => e && e.alive && e.data
            && (e.data.payloadType === 'jettisoned_cargo' || e.data.jettisonedCargo === true)
            && e.data.kesslerRead !== true
            && dist(e.pos, mw.pos) <= 120);
          const dPad = mw.pos ? dist(p.pos, mw.pos) : Infinity;
          const APRX = 330 / Math.hypot(330, 1360), APRZ = 1360 / Math.hypot(330, 1360);
          const relX = mw.pos ? p.pos.x - mw.pos.x : 0, relZ = mw.pos ? p.pos.z - mw.pos.z : 0;
          const along = relX * APRX + relZ * APRZ;
          const across0 = -relX * APRZ + relZ * APRX;
          const v0 = speedOf(p);
          if (!loose && !podDown) {
            // Already shopped the berth once and left empty: don't bounce the
            // dock forever on a market that stocks nothing the scale can weigh —
            // hover the pad and wait instead.
            if (decided.scale4Shopped && dist(p.pos, mw.pos || p.pos) <= 200) { input.brake = true; return; }
            if (decided.scale4Shopped && mw.pos) { flyTo(input, mw.pos, { arrive: 40 }); return; }
            const market = ((state.entityIndex && state.entityIndex.dockStations) || [])
              .filter((s) => s && s.alive && s.data && Array.isArray(s.data.services)
                && s.data.services.includes('trade'))
              .sort((a, b) => dist(p.pos, a.pos) - dist(p.pos, b.pos))[0];
            if (market && dist(p.pos, market.pos) > DOCK_RANGE + (market.radius || 0)) {
              flyTo(input, market.pos, { arrive: DOCK_RANGE - 20, boost: true });
            } else if (market) services.dockAt(market);
            else input.brake = true;
            return;
          }
          if (podDown) {
            // Pod is in the ring: peel off the corridor sideways — the tally
            // post sits dead on the axis at along −128, braking straight through
            // it just wedges the hull on the prop (run 62).
            decided.scale4Phase = 'bail';
            const bSide = across0 >= 0 ? 1 : -1;
            decided.scale4Bail = mw.pos && {
              x: mw.pos.x - APRX * 60 + APRZ * bSide * 350,
              z: mw.pos.z - APRZ * 60 - APRX * bSide * 350,
            };
            if (decided.scale4Bail) flyTo(input, decided.scale4Bail, { arrive: 60 });
            else input.brake = true;
            return;
          }
          // The drop: a tap jettison leaves aft at JETTISON_EJECT_SPEED (60) —
          // a pod released while the ship crosses the ring at ~eject speed keeps
          // ≈0 absolute velocity and settles inside the ring. Hovering at rest
          // just punts it out at 60 WU/s. The worksite furniture is solid and
          // flanks the ring — an arbitrary line plows the hull into a prop and
          // the contact solver pins it (runs 59/60/62/64). The open line runs
          // the APPROACH axis BACKWARD: stage at along +340 (the −along side
          // holds the tally post and rack), run −APPROACH through the pad, drop
          // while crossing, then veer off before reaching the post. A stall or
          // missed window bails sideways off the pinned side and re-stages —
          // never twice through the furniture.
          // Pin watch (run 110): the wedge recovery below only lives inside the
          // 'run' phase — a hull pinned while staging/approaching held v≈0 for
          // 875 s with flyTo demanding the whole time. Any sustained stall
          // inside the worksite first drives straight off the nearest solid
          // body, then re-stages through the same bail path.
          if (v0 < 12 && mw.pos) {
            decided.scale4PinSince = decided.scale4PinSince ?? (state.simTime || 0);
            if ((state.simTime || 0) - decided.scale4PinSince > 8) {
              // One escape direction can't be trusted: the worksite racks form
              // corners, and the wedge sits behind whichever side the run
              // entered on (run 110/113: pinned at pad −144 for 875+ s while a
              // fixed away-vector kept pushing into the same prop). Rock it
              // out — alternate reverse pulses with ±90° lateral escapes that
              // flip every few seconds — until the hull moves, then bail.
              const elapsed = (state.simTime || 0) - decided.scale4PinSince;
              const beat = Math.floor(elapsed / 1.5) % 3; // 0,1,2 cycle
              const side = Math.floor(elapsed / 4.5) % 2 === 0 ? 1 : -1;
              const radial = Math.atan2(p.pos.z - mw.pos.z, p.pos.x - mw.pos.x);
              let pin = null, pinD = 160;
              for (const e of (state.entityList || [])) {
                if (!e || e.alive === false || e.id === p.id || !e.pos) continue;
                const dd = dist(p.pos, e.pos) - (e.radius || 0);
                if (dd < pinD) { pinD = dd; pin = e; }
              }
              const off = pin
                ? Math.atan2(p.pos.z - pin.pos.z, p.pos.x - pin.pos.x)
                : radial + side * Math.PI / 2;
              const away = beat === 2 ? radial : off;
              input.aimAngle = away;
              input.turnIntent = Math.max(-1, Math.min(1, wrapAngle(away - (p.rot || 0)) / 0.5));
              input.brake = false;
              // Lateral strafe slides the hull along the pocket axis even when
              // contact locks rotation; the sign flips with the escape side.
              input.moveX = side * (beat === 1 ? 0.9 : -0.4);
              // moveZ<0 reads as brake on the player ship (flipBurn) — a dead
              // input on a stalled hull. Keep thrust forward-only.
              input.moveZ = beat === 0 ? 0 : 1;
              input.boost = beat !== 0 && energyFull(p);
              if (elapsed > 24) {
                decided.scale4PinSince = null;
                decided.scale4Phase = 'bail';
                decided.scale4Bail = {
                  x: mw.pos.x + Math.cos(radial + side * Math.PI / 2) * 380,
                  z: mw.pos.z + Math.sin(radial + side * Math.PI / 2) * 380 };
              }
              return;
            }
          } else decided.scale4PinSince = null;
          const gate = mw.pos && { x: mw.pos.x + APRX * 340, z: mw.pos.z + APRZ * 340 };
          const high = mw.pos && { x: mw.pos.x + APRZ * 380, z: mw.pos.z - APRX * 380 };
          if (decided.scale4Phase === 'bail') {
            // Hold the sidestep until genuinely clear of the worksite, then
            // re-stage — a one-tick turn just flies back through the post.
            const bp = decided.scale4Bail;
            if (Math.abs(across0) > 320 || (bp && dist(p.pos, bp) < 80)) decided.scale4Phase = 'stage';
            else { flyTo(input, bp, { arrive: 80 }); return; }
          }
          if (decided.scale4Phase !== 'run') {
            if (!gate || dPad > 560) { decided.scale4Phase = 'approach'; flyTo(input, mw.pos || p.pos, { arrive: 420, boost: true }); return; }
            if (dist(p.pos, gate) <= 60 && v0 < 30) { decided.scale4Phase = 'run'; decided.scale4Fired = false; }
            else {
              decided.scale4Phase = 'stage';
              // Dogleg through the open high side — a straight line to the gate
              // from the −along half crosses the prop cluster. Once near the
              // dogleg point (or already past it laterally) continue to the
              // gate — orbiting high forever is a flyTo limit cycle (run 65).
              if (along > 200 || Math.abs(across0) > 300 || (high && dist(p.pos, high) < 220)) {
                flyTo(input, gate, { arrive: 40, boost: along > 0 });
              } else flyTo(input, high, { arrive: 60 });
              return;
            }
          }
          // Bail back over the axis, not deeper into the side that already
          // holds the hull: a deep +across miss wedged on the rack cluster at
          // across≈+126 when the side sign kept it +side (run 114). Retreat
          // through the open corridor side the run came from.
          const bailSide = across0 > 40 ? -1 : 1;
          const stallOrMiss = (v0 < 15 && along < 200) || along < -40;
          if (stallOrMiss) {
            decided.scale4Phase = 'bail';
            decided.scale4Bail = {
              x: mw.pos.x + APRX * Math.max(-60, Math.min(80, along)) + (-APRZ) * bailSide * 350,
              z: mw.pos.z + APRZ * Math.max(-60, Math.min(80, along)) + APRX * bailSide * 350,
            };
            flyTo(input, decided.scale4Bail, { arrive: 80 });
            return;
          }
          const across = across0;
          const look = Math.max(120, Math.min(320, Math.abs(across) * 2.5));
          // Aim ON-axis converges too slowly from a wide entry (run 113/114:
          // crossed the pad at across=91 — spawnD never entered the 80 window,
          // no drop, wedge on the far-side furniture). Aim PAST the axis by
          // ~half the current lateral error so the line crosses it at the pad.
          const acrossAim = -across * 0.55;
          const aheadX = mw.pos.x - APRX * (-along + look) + (-APRZ) * acrossAim;
          const aheadZ = mw.pos.z - APRZ * (-along + look) + APRX * acrossAim;
          input.aimAngle = Math.atan2(aheadZ - p.pos.z, aheadX - p.pos.x);
          const dropErr = wrapAngle(input.aimAngle - (p.rot || 0));
          input.turnIntent = Math.max(-1, Math.min(1, dropErr / 0.6));
          const v = speedOf(p);
          // A hull parked inside the zone is already a failed run — thrust out
          // on the locked bearing regardless of nose error; the helm curves the
          // velocity vector onto the line and the ship gets a clean second pass.
          if (v < 52) input.moveZ = (Math.abs(dropErr) < 0.9 || v < 6) ? 1 : 0;
          else if (v > 68) input.brake = true;
          input.boost = v < 56 && Math.abs(dropErr) < 0.4;
          const fx = Math.cos(p.rot || 0), fz = Math.sin(p.rot || 0);
          const spawnD = mw.pos
            ? Math.hypot(p.pos.x - fx * 14 - mw.pos.x, p.pos.z - fz * 14 - mw.pos.z)
            : Infinity;
          // The fire band sits inside the eject-match window: pod rest speed is
          // |ship speed − 60|, and velocity-vs-nose misalignment adds a margin —
          // a drop at 68 sails out at ~9 and never reads (run 67).
          const fire = v >= 55 && v <= 65 && spawnD <= 80 && !decided.scale4Fired;
          if (fire) { input.actions.jettisonLot = true; decided.scale4Fired = true; }
          if (process.env.STRANGER_PILOT_TRACE && ((state.tick % 180) === 0 || fire)) {
            console.log(`    [scale4-run] t=${Math.round(state.simTime)} v=${v.toFixed(1)} err=${dropErr.toFixed(2)} mz=${input.moveZ} brk=${input.brake} bst=${!!input.boost} along=${Math.round(along)} across=${Math.round(across)} spawnD=${Math.round(spawnD)}${fire ? ' JETTISON' : ''}`);
          }
          return;
        }
        // ── Furnace Detail (campaign47a:b1:infested): two authored phases, neither
        // of them gunwork.
        //   1) repair mites — collides:false fauna: projectile sweeps skip them, so
        //      ONLY blast damage lands (the rack's frag cassettes — 30 a blast vs a
        //      60-hull mite, two per site). The waypoint's own text names the
        //      resupply when the cell runs dry: "buy and load more frag at Tethys
        //      Trade Hub" — a shipyard berth refill, not a market verb.
        //   2) disposal pods — 'payload' bodies are weapon-immune outright; the
        //      contract clears on received-through-the-CR-FEED-lip or lost
        //      bookkeeping. The tow is the free authored verb ("tow or fling each
        //      marked pod into the open amber ring") — massline latch, drag the
        //      lip, the intake does the rest.
        if (furnaceM && state.world && state.world.currentSectorId === furnaceM.destSectorId) {
          const mitePhase = (furnaceM.objectiveProgress || 0) < (furnaceM.objectiveTarget || 4);
          const bag = state.bombs || {};
          const bagCells = (bag.rack && bag.rack.cells) || [];
          const mites = furnaceMites(state);
          if (mitePhase) {
            // An empty rack is the ledger owner's resupply leg — reaching this
            // block in-sector means frags are loaded or the yard gave up.
            if (mites.length) {
              // Drop-and-sprint: proximity triggers ignore fauna (craft-only), so the
              // cassette rides its 6 s fuze — the blast reaches 96, so be 110+ out
              // before it pops. Mites hug their repair anchor (preferredR 12) and
              // blast shove can't throw a no-body, so the drop point stays valid.
              const mite = mites.slice().sort((a, b) => dist(p.pos, a.pos) - dist(p.pos, b.pos))[0];
              // Lead the drop: the cassette rides its 6 s fuze wherever it lands —
              // aim it at where the mite WILL be when it pops, not where it is now.
              const mv = mite.vel || { x: 0, z: 0 };
              const leadPos = { x: mite.pos.x + mv.x * 6.2, z: mite.pos.z + mv.z * 6.2 };
              const d = dist(p.pos, leadPos);
              const now = state.simTime || 0;
              const veerUntil = decided.furnaceVeerUntil || -1;
              if (now < veerUntil) {
                const away = Math.atan2(p.pos.z - mite.pos.z, p.pos.x - mite.pos.x);
                input.aimAngle = away;
                input.turnIntent = Math.max(-1, Math.min(1, wrapAngle(away - (p.rot || 0)) / 0.5));
                input.moveZ = 1;
                input.boost = energyFull(p) && Math.abs(wrapAngle(away - (p.rot || 0))) < 0.5;
              } else if (d > 58) {
                flyTo(input, leadPos, { arrive: 40, boost: d > 700 && energyFull(p) });
              } else if (speedOf(p) > 40) {
                input.brake = true;
              } else {
                input.actions.dropBomb = true;
                decided.furnaceVeerUntil = now + 7.4;
                const key = `miteDrop:${mite.data && mite.data.ecology && mite.data.ecology.faunaKey}`;
                decided[key] = (decided[key] || 0) + 1;
                if (process.env.STRANGER_PILOT_TRACE) {
                  console.log(`    [furnace] t=${Math.round(now)} DROP mite#${mite.id} hull=${Math.round(mite.hull || 0)} drops=${decided[key]} prog=${furnaceM.objectiveProgress}/${furnaceM.objectiveTarget}`);
                }
              }
              if (process.env.STRANGER_PILOT_TRACE && (state.tick % 120) === 0) {
                console.log(`    [furnace] t=${Math.round(now)} mite#${mite.id} d=${Math.round(d)} hull=${Math.round(mite.hull || 0)} prog=${furnaceM.objectiveProgress}/${furnaceM.objectiveTarget} frag=${bagCells.map((c) => c ? `${c.id.split('_')[1]}:${c.count}` : '-').join('/')}`);
              }
              return;
            } else if (mw && mw.pos) {
              // Materializing lag: hold over the hauler anchor until the cast cooks.
              flyTo(input, mw.pos, { arrive: 80, hold: true });
              return;
            }
          } else {
            // ── Pod phase: tow each pending lot through the CR-FEED lip ──
            // Feedable means in-sector: a pod blast-punted past the cell line
            // can't reach the mouth and is closed as 'lost' by the ledger
            // owner above — this block only ever tows pods that can feed.
            const mouth = furnaceMouthGlobal();
            const pod = furnaceRows.map((row) => state.entities.get(row.entityId))
              .filter((e) => e && e.alive !== false && e.pos
                && sectorMembershipAtGlobal(e.pos) === furnaceM.destSectorId)
              .sort((a, b) => dist(p.pos, a.pos) - dist(p.pos, b.pos))[0];
            if (pod) {
              if (lineAttached && latchedId === pod.id) {
                // Drag the lip: the intake eats any edible body inside 90 — the ship
                // is inedible, so cross the mouth centerline and the pod follows in.
                cmd.lineControl = true;
                cmd.lineLength = -0.6; // reel tight: less slack, less drift past the ring
                const pd = dist(pod.pos, mouth);
                flyTo(input, mouth, { arrive: 10 });
                if (process.env.STRANGER_PILOT_TRACE && (state.tick % 120) === 0) {
                  console.log(`    [furnace] t=${Math.round(state.simTime || 0)} tow pod#${pod.id} pod→mouth=${Math.round(pd)} prog=${furnaceM.objectiveProgress}/${furnaceM.objectiveTarget}`);
                }
                return;
              }
              if (lineAttached && latchedId !== pod.id) { cmd.cut = true; return; }
              const d = dist(p.pos, pod.pos);
              const pv = pod.vel || { x: 0, z: 0 };
              const podV = speedOf(pod);
              // Intercept the pod's drift line at every range — flyTo's turn-radius wall
              // (brake whenever d < v·5) caps approach speed at d/5, and a blast-punted pod
              // receding at ~43 outruns that wall forever (run 74: pod#1516 pinned at d≈280).
              // The lead is intercept time d/v, not a flat 30 s cap — saturating the
              // lead parks the aim 3600 wu ahead of the pod forever (run 82).
              const leadS = Math.min(d / Math.max(speedOf(p), 80), 25);
              const lead = {
                x: pod.pos.x + pv.x * leadS,
                z: pod.pos.z + pv.z * leadS,
              };
              input.aimAngle = Math.atan2(lead.z - p.pos.z, lead.x - p.pos.x);
              const err = wrapAngle(input.aimAngle - (p.rot || 0));
              input.turnIntent = Math.max(-1, Math.min(1, err / 0.5));
              const facing = Math.abs(err) < 0.6;
              input.moveZ = facing ? 1 : 0;
              input.boost = facing && d > 700 && energyReady(p);
              // Carry just enough speed to outpace the drift — harder closing overshoots
              // the 90 wu latch cone and the chase has to re-stage.
              input.brake = speedOf(p) > podV + Math.max(25, d / 8);
              const pulse = (state.tick % 12) < 2;
              if (d < 90 && speedOf(p) < podV + 45 && !lineAttached && pulse) {
                input.aimWorld = { x: pod.pos.x, z: pod.pos.z };
                input.tetherMode = 'nearest'; // proximity grab: the pod is the nearest body
                cmd.latch = true;
              }
              if (process.env.STRANGER_PILOT_TRACE && (state.tick % 120) === 0) {
                console.log(`    [furnace] t=${Math.round(state.simTime || 0)} chase pod#${pod.id} d=${Math.round(d)} podV=${Math.round(podV)} v=${Math.round(speedOf(p))} prog=${furnaceM.objectiveProgress}/${furnaceM.objectiveTarget}`);
              }
              return;
            }
          }
        }

        // Cinder hull delivery (campaign47a:b2:cinder): after the three Wasps clear,
        // the contract wants a marked hull weighed on Rook's pad — the hull is
        // protected evidence, so engaging it is a forever-park (run 84/85: hull
        // pinned at 1 under sustained fire). Latch it and rest it inside the pad
        // ring; the book opens the offer and closes the sale while it holds.
        const cinderM = active.find((m) => m && m.status === 'active'
          && m.storyTag === 'campaign47a:b2:cinder'
          && (m.completedTargetSlots || []).length >= 3
          && !(m.params && m.params.cinderDeliveredMarkerId));
        if (cinderM) {
          const markedIds = new Set(((cinderM.params && cinderM.params.cinderMarkedWrecks) || [])
            .map((r) => r && r.markerId).filter(Boolean));
          const markedHull = (e) => e && e.alive !== false && e.type === 'wreck'
            && e.data && markedIds.has(e.data.markerId);
          // Any marked hull satisfies the contract — the leg owns whichever one
          // it is already holding: entityList order shifts between ticks, so a
          // blind re-find could rename the target mid-latch and the wrong-body
          // guard below would cut a perfectly good line (run 92: latched 15827,
          // re-selected 15826, cut — 300+ attach/cut churn).
          let hull = null;
          if (lineAttached && latchedId != null) {
            const latched = state.entities.get(latchedId);
            if (markedHull(latched)) hull = latched;
          }
          if (!hull) {
            hull = mw && mw.targetEntityId != null ? state.entities.get(mw.targetEntityId) : null;
            if (!markedHull(hull)) {
              hull = (state.entityList || []).filter(markedHull)
                .sort((a, b) => dist(p.pos, a.pos) - dist(p.pos, b.pos))[0] || null;
            }
          }
          if (hull && hull.pos) {
            const padPos = rookPadPosition();
            const dHullPad = dist(hull.pos, padPos);
            const hullSpeed = hull.vel ? Math.hypot(hull.vel.x, hull.vel.z) : 0;
            if (lineAttached && latchedId != null && String(latchedId) === String(hull.id)) {
              // Tow to the ring, then hold: taut short line + a slow ship lets
              // the hull damp to rest — the arrival check wants inZone + ≤8 wu/s.
              cmd.lineControl = true;
              cmd.lineLength = -0.6;
              if (dHullPad > 90) flyTo(input, padPos, { arrive: 60 });
              else if (hullSpeed <= 7) {
                // Parked cargo: release the tow before the book takes the body —
                // a still-tethered hull consumed by the sale leaves the line's
                // physics endpoint racing the body's removal (runs 93/94/95:
                // Rapier "unreachable" ~3 s after every authored sale).
                cmd.cut = true; return;
              } else { input.moveZ = 0; input.moveX = 0; input.brake = speedOf(p) > 5; }
              if (process.env.STRANGER_PILOT_TRACE && (state.tick % 120) === 0) {
                console.log(`    [cinder] t=${Math.round(state.simTime || 0)} tow hull#${hull.id} hull→pad=${Math.round(dHullPad)} shipV=${Math.round(speedOf(p))} hullV=${Math.round(hullSpeed)}`);
              }
              return;
            }
            if (lineAttached) {
              if (process.env.STRANGER_PILOT_TRACE) console.log(`    [cinder] cut latched=${latchedId}(${typeof latchedId}) hull=${hull.id}(${typeof hull.id}) tethMirror=${JSON.stringify(state.player && state.player.tether && { active: state.player.tether.active, targetId: state.player.tether.targetId })}`);
              cmd.cut = true; return;
            }
            // Already resting inside the ring (a shoved or dropped hull that
            // landed): hold the ship slow nearby and let the book work.
            if (dHullPad <= 95 && hullSpeed <= 7) {
              input.moveZ = 0; input.moveX = 0; input.brake = speedOf(p) > 5;
              if (process.env.STRANGER_PILOT_TRACE && (state.tick % 120) === 0) {
                const d = hull.data || {};
                const elig = rookBoothEligible(hull);
                const check = rookDeliveryCheck(hull);
                const refused = elig ? '-' : Object.keys(d).filter((k) => d[k] === true
                  || ['markerId', 'missionId', 'missionTag', 'identityKey', 'persistenceOwner',
                    'runtimeOwner', 'salvorClaimedBy', 'worldRecordId', 'poiId', 'wreckFieldId']
                    .includes(k)).map((k) => `${k}=${d[k]}`).join(',');
                const heat = state.player && Number.isFinite(state.player.heat) ? state.player.heat : null;
                const zone = state.player && state.player.heatZone;
                const zoneS = zone && zone.center ? `zone@${Math.round(dist(p.pos, zone.center))}/r${Math.round(zone.radius || 0)}${zone.active ? '' : ':inactive'}` : 'zone-none';
                console.log(`    [cinder] t=${Math.round(state.simTime || 0)} hull#${hull.id} resting hull→pad=${Math.round(dHullPad)} hullV=${Math.round(hullSpeed)} elig=${elig} inZone=${check.inZone} arrived=${check.arrived} heat=${heat == null ? '?' : heat.toFixed(3)} wanted=${isPlayerWanted(state)} ${zoneS} offer=${d.rookOffer ? `q${d.rookOffer.quoteCr} d${Math.round(d.rookOffer.dwell || 0)}/${d.rookOffer.closeAt}` : 'none'}${elig ? '' : ' REFUSE:' + refused}`);
              }
              return;
            }
            // Chase + latch. The marked wreck drifts with a companion shard, so
            // 'nearest' can grab the wrong body and contact-range presses ride the
            // hull instead of roping it (run 87: d≈20 drafting, ents shelved).
            // Close fast at range, then stand off at ~200 wu, match velocity, and
            // spend the SCORED latch — aimWorld selects this hull by id, not the
            // nearest attachable — while relative speed is low.
            const dH = dist(p.pos, hull.pos);
            const hv = hull.vel || { x: 0, z: 0 };
            const relSpeed = Math.abs(speedOf(p) - hullSpeed);
            const leadS = Math.min(dH / Math.max(speedOf(p), 80), 25);
            const lead = { x: hull.pos.x + hv.x * leadS, z: hull.pos.z + hv.z * leadS };
            input.aimAngle = Math.atan2(lead.z - p.pos.z, lead.x - p.pos.x);
            const err = wrapAngle(input.aimAngle - (p.rot || 0));
            input.turnIntent = Math.max(-1, Math.min(1, err / 0.5));
            const facing = Math.abs(err) < 0.6;
            const hullR = Math.max(12, hull.radius || 0);
            const inContact = dH < hullR + 25;
            // Inside the standoff window, stop driving at the hull — coast to its
            // speed instead of shoving it downrange. Farther out, intercept.
            input.moveZ = facing && !inContact && (dH > 220 || speedOf(p) < hullSpeed) ? 1 : 0;
            input.boost = facing && dH > 700 && energyReady(p);
            input.brake = inContact
              ? speedOf(p) > hullSpeed + 6
              : speedOf(p) > hullSpeed + Math.max(10, dH / 10);
            const pulse = (state.tick % 12) < 2;
            if (dH < 300 && relSpeed < 45 && !lineAttached && pulse) {
              input.aimWorld = { x: hull.pos.x, z: hull.pos.z };
              input.aimIntentActive = true; // the same channel input.js stamps for aimed intent
              input.tetherMode = null; // scored pick — the receipt selects THIS hull
              cmd.latch = true;
            }
            if (process.env.STRANGER_PILOT_TRACE && (state.tick % 120) === 0) {
              const acqS = state.masslineAcquisition && state.masslineAcquisition.selected;
              console.log(`    [cinder] t=${Math.round(state.simTime || 0)} chase hull#${hull.id} d=${Math.round(dH)} hullV=${Math.round(hullSpeed)} v=${Math.round(speedOf(p))} acq=${acqS ? `${acqS.status}#${acqS.targetId}${acqS.reason ? ':' + acqS.reason : ''}` : 'none'}`);
            }
            return;
          }
        }

        // Worksite engage: a live mission pin (`targetEntityId`) names the body the
        // contract wants handled. Nearest-needed wins over the pin: the first kill
        // panics the site cast — a far pin leaves the close ones alive while the
        // hull gets chewed (run 69).
        const ENGAGEABLE = { fauna: 1, ship: 1, wreck: 1, npc: 1, drone: 1 };
        // collides:false bodies (mites, worms) are invisible to the projectile
        // sweep — engaging one with the gun is whiffing forever (run 71).
        const wantBody = (e) => e && e.alive !== false && ENGAGEABLE[e.type] && e.collides !== false;
        let engage = mw && mw.targetEntityId != null ? state.entities.get(mw.targetEntityId) : null;
        if (!(engage && wantBody(engage))) engage = null;
        // Nearest-needed over the pin, again: a contract's targetEntityIds lists
        // every live mark — chase the closest, not the one the waypoint happened
        // to name (run 83: the pin's wasp fled 16 km at 300+ wu/s while two
        // more sat back at the site).
        const marks = [];
        for (const m of active) {
          if (!m || m.status !== 'active' || !Array.isArray(m.targetEntityIds)) continue;
          for (const id of m.targetEntityIds) {
            const e = state.entities.get(id);
            if (wantBody(e)) marks.push(e);
          }
        }
        if (marks.length) {
          marks.sort((a, b) => dist(p.pos, a.pos) - dist(p.pos, b.pos));
          if (!engage || dist(p.pos, marks[0].pos) < dist(p.pos, engage.pos) * 0.8) engage = marks[0];
        }
        // Self-defense: a fauna cast on 'defend'/'charge' inside 300 WU is the thing
        // chewing the hull — casket worms wake on weapon vibration and eat the ship
        // while it works (run 69: hull 140→17, zero clears). Swat it first.
        const biter = (state.entityList || []).filter((e) => e && e.alive !== false
          && e.type === 'fauna' && dist(p.pos, e.pos) < 300 && e.data && e.data.ecology
          && ['defend', 'charge', 'attack', 'feed'].includes(e.data.ecology.driveState))
          .sort((a, b) => dist(p.pos, a.pos) - dist(p.pos, b.pos))[0];
        if (biter && (!engage || dist(p.pos, biter.pos) < dist(p.pos, engage.pos) * 0.8)) engage = biter;
        if (engage && wantBody(engage)) {
          const d = dist(p.pos, engage.pos);
          const small = (engage.radius || 8) < 15;
          const lead = Math.min(1, d / 600);
          input.aimWorld.x = engage.pos.x + (engage.vel ? engage.vel.x * lead * 0.5 : 0);
          input.aimWorld.z = engage.pos.z + (engage.vel ? engage.vel.z * lead * 0.5 : 0);
          input.aimAngle = Math.atan2(input.aimWorld.z - p.pos.z, input.aimWorld.x - p.pos.x);
          const err = wrapAngle(input.aimAngle - (p.rot || 0));
          input.turnIntent = Math.max(-1, Math.min(1, err / 0.5));
          // Small bodies (a r=4 mite) are a pursuit, not an orbit: hold the 45–60
          // band so the nose stays on a fleeing body — run 70 sprinted at 120+,
          // overshot, and the aim flipped 180° every pass without a shot landing.
          input.moveX = 0;
          if (small) {
            const v = speedOf(p);
            // The 45–60 band is a CLOSE-instrument — it keeps the nose on a
            // fleeing body at short range. At long range it is just a speed
            // cap and any fast mark walks away (run 83: a 300 wu/s wasp left a
            // 45 wu/s pursuit standing). Past ~900 wu run it down.
            if (d > 900) input.moveZ = 1;
            else if (v > 60 && d < 280) { input.moveZ = 0; input.brake = true; }
            else input.moveZ = v < 45 ? 1 : 0;
          } else {
            input.moveX = d < 260 ? (Math.floor((state.simTime || 0) * 0.8) % 2 ? 1 : -1) : 0;
            input.moveZ = d > 500 ? 1 : (d < 160 ? 0.2 : 0.8);
            input.brake = d < 120 && speedOf(p) > 120;
          }
          input.boost = energyFull(p) && d > 700 && Math.abs(err) < 0.5;
          // Fire when the aim error sits inside the target body — the wide raider
          // cone (0.35 rad) only lands on a r=4 body inside ~11 WU; everything
          // else is shots into the dark (run 69: 200 WU of whiffed beam).
          // Heat-law mirror: a lawful or not-yet-hostile mark is a ledger price,
          // not a target — the raider the b0 chase pins is lawful freight, and
          // every beam second on it banks permanent suspicion (run 117: 0.132 by
          // t=95, one weir bolt from a frozen warrant at Rook's pad).
          const heatFree = !(engage.data && engage.data.ai && engage.data.ai.lawful === true)
            && isHostileToPlayer(engage, p.team, state);
          const hitCone = Math.atan2(Math.max(1, engage.radius || 8) * 0.8, Math.max(20, d));
          input.fire = heatFree && energyReady(p) && Math.abs(err) < Math.min(0.35, Math.max(0.05, hitCone)) && d < 620;
          input.fireGroup = 1;
          state.player.targetId = engage.id;
          if (process.env.STRANGER_PILOT_TRACE && (state.tick % 120) === 0) {
            const ev = engage.vel ? Math.round(Math.hypot(engage.vel.x, engage.vel.z)) : -1;
            const pv = p.vel ? Math.round(Math.hypot(p.vel.x, p.vel.z)) : -1;
            console.log(`    [engage] t=${Math.round(state.simTime)} tgt=${engage.type}#${engage.id} d=${Math.round(d)} r=${engage.radius || '?'} err=${err.toFixed(2)} fire=${!!input.fire} hull=${Math.round(engage.hull || 0)} ev=${ev} pv=${pv} epos=${Math.round(engage.pos.x)},${Math.round(engage.pos.z)} ppos=${Math.round(p.pos.x)},${Math.round(p.pos.z)}`);
          }
          return;
        }
        if (mw && mw.kind === 'story' && /the nest|radiation-lane/i.test(mw.label || '')
          && process.env.STRANGER_PILOT_TRACE && (state.tick % 180) === 0) {
          const dir = state.encounterDirector || {};
          const nv = dir.nestVisit || null;
          const live = Object.values(dir.live || {}).filter(Boolean);
          const meaningful = live.filter((l) => l && l.tier !== 'ambient').length;
          let resumeWhy = '';
          if (nv && nv.status === 'active' && nv.snapshot) {
            const snap = nv.snapshot;
            const cpos = snap.carrier && snap.carrier.pos;
            try {
              const adop = nestSnapshotAdoptions(state, snap, nv.encounterId);
              const sites = nestSnapshotSpawnSites(snap) || [];
              const occ = sites.map((s) => nestSiteClear(state, s.pos, s.radius, adop && adop.actors) ? 'clr' : 'OCC').join('/');
              resumeWhy = ` | car=${snap.carrier ? snap.carrier.status : '-'} pending=${!!snap.pendingCarrierOutcome} dAnchor=${cpos ? Math.round(dist(p.pos, cpos)) : '-'} adopOk=${adop && adop.ok} sites=${occ || '-'}`;
            } catch (e) { resumeWhy = ` | resumeErr=${e && e.message}`; }
          }
          console.log(`    [nest] t=${Math.round(state.simTime)} pos=${Math.round(p.pos.x)},${Math.round(p.pos.z)} wpPos=${mw.pos ? `${Math.round(mw.pos.x)},${Math.round(mw.pos.z)}` : '-'} nv=${nv ? `${nv.status}/${nv.waitReason || '-'}` : 'none'} pressure=${JSON.stringify(dir.pressure || {})} liveM=${meaningful} live=${live.map((l) => `${l.shapeId || l.id}:${l.phase}`).join(',') || '-'} lastMeaningful=${Math.round(dir.lastMeaningfulAt || 0)}${resumeWhy}`);
        }
        // The Nest (campaign47a:b2): admission asks the player inside 140 of the
        // approach AND inside 720 of the anchor — the generic arrive-band parks
        // ~200 short and the visit would sit on 'approach' forever. Hold a point
        // a touch toward the anchor side so both radii close. Once the encounter
        // is live the authored 'clear lane out' resolves it: break 3000 WU from
        // the carrier and the visit receipts carrier_escapes.
        if (mw && mw.kind === 'story' && /the nest|radiation-lane|cycling bays/i.test(mw.label || '')) {
          const dir = state.encounterDirector || {};
          const nv = dir.nestVisit || null;
          const nestLive = Object.values(dir.live || {})
            .find((l) => l && l.shapeId === 'the_nest');
          if (nestLive) {
            const anchor = (nv && nv.anchor) || (nestLive.anchor || mw.pos);
            if (anchor) {
              const ax = p.pos.x - anchor.x, az = p.pos.z - anchor.z;
              const ad = Math.hypot(ax, az) || 1;
              if (ad < 3200) {
                flyTo(input, { x: p.pos.x + (ax / ad) * 3600, z: p.pos.z + (az / ad) * 3600 },
                  { arrive: 60, boost: energyFull(p) });
              } else {
                input.brake = speedOf(p) > 6;
              }
              return;
            }
          }
          const hold = mw.pos ? { x: mw.pos.x - 60, z: mw.pos.z } : null;
          if (hold && dist(p.pos, hold) > 60) {
            flyTo(input, hold, { arrive: 30 });
          } else {
            input.brake = speedOf(p) > 6;
          }
          return;
        }
        // Compost Run (campaign47a:b2): the Rookside Receiving Garden eats
        // player-fed mass inside its mouth and the first credited stage growth is
        // the beat's signal. The approach waypoint parks the ship ~600 WU short —
        // a stranger has to haul mass in: tether an edible body, tow it inside the
        // mouth, and cut it loose so the garden takes it (same rule as the authored
        // Rook sale — never let the consume path take a still-tethered body).
        if (mw && mw.kind === 'story' && /compost|receiving garden/i.test(mw.label || '')
          && (!state.world || state.world.currentSectorId === 'sector_charon_expanse')) {
          const garden = (state.entityList || []).find((e) => e && e.alive !== false
            && e.type === 'garden' && e.factionId === 'faction_understory'
            && e.data && e.data.understoryGarden === true);
          if (process.env.STRANGER_PILOT_TRACE && (state.tick % 180) === 0) {
            const rough = (state.entityList || []).filter((e) => e && e.alive !== false
              && e.pos && (e.mass || 0) > 0 && (e.mass || 0) < 1800
              && ['wreck', 'debris', 'payload', 'cargo_pod', 'junk'].includes(e.type));
            console.log(`    [compost] t=${Math.round(state.simTime)} garden=${garden ? `#${garden.id}@${Math.round(dist(p.pos, garden.pos))}` : 'none'} roughEdible=${rough.length} jettison=${selectedJettisonLot(state) != null} latch=${lineAttached ? latchedId : 'no'} fedId=${decided.compostFedId ?? '-'} biomass=${garden && garden.data ? Number(garden.data.gardenBiomass || 0).toFixed(1) : '-'} fedByPlayer=${garden && garden.data ? Number(garden.data.gardenFedByPlayer || 0).toFixed(1) : '-'} stage=${garden && garden.data ? garden.data.gardenStage : '-'} shipV=${Math.round(speedOf(p))}`);
          }
          if (garden && garden.pos) {
            const mouth = gardenGrowthRadius(garden) || garden.radius || 90;
            const edible = (e) => e && e.alive !== false && e.id !== p.id && e !== garden
              && e.pos && (e.mass || 0) > 0 && (e.mass || 0) < 1800
              && !(e.physicsBody && e.physicsBody.dynamic === false)
              && ['wreck', 'debris', 'payload', 'cargo_pod', 'junk'].includes(e.type)
              && !(e.data && e.data.understoryConsumed === true)
              // Ecology-field inhabitants are roster-bound: feeding one re-vacates its
              // slot. Claimed/mission/durable aftermath wrecks are refused by the owner's
              // own feed gate (gardenFeedMass) — mirror the cheap keys here so the pilot
              // doesn't spend a 60 s timeout towing a body the garden must refuse.
              && !(e.data && e.data.wreckFieldId)
              && !(e.data && (e.data.salvorClaimedBy || e.data.contractClaimSiteOf
                || e.data.missionId || e.data.missionPinned || e.data.missionTag
                || e.data.rookClaimed || e.data.caughtByNet || e.data.recoveryEncounterId));
            const preyInMouth = (e) => dist(e.pos, garden.pos) <= mouth + (e.radius || 0) - 15;
            // The receiver refuses to feed while ANY solid body sits inside its
            // 76-WU core — including the player's own hull. Cut the load inside
            // reach, then back the ship clear and wait for the swallow.
            const clearPoint = () => {
              const dx = p.pos.x - garden.pos.x, dz = p.pos.z - garden.pos.z;
              const dd = Math.hypot(dx, dz) || 1;
              return { x: garden.pos.x + (dx / dd) * (mouth + 160),
                z: garden.pos.z + (dz / dd) * (mouth + 160) };
            };
            if (lineAttached && latchedId != null) {
              const prey = state.entities.get(latchedId);
              if (edible(prey)) {
                if (preyInMouth(prey)) {
                  cmd.cut = true;
                  decided.compostFedId = prey.id;
                  decided.compostFedSince = state.simTime || 0;
                  return;
                }
                cmd.lineControl = true;
                cmd.lineLength = -0.6;
                // Aim the tow at a ring point just inside the mouth rim: the
                // trailing load slips into reach while the hull stays outside
                // the feed-blocking core.
                const dx = p.pos.x - garden.pos.x, dz = p.pos.z - garden.pos.z;
                const dd = Math.hypot(dx, dz) || 1;
                const ring = { x: garden.pos.x + (dx / dd) * Math.max(60, mouth * 0.75),
                  z: garden.pos.z + (dz / dd) * Math.max(60, mouth * 0.75) };
                flyTo(input, ring, { arrive: 40 });
                if (process.env.STRANGER_PILOT_TRACE && (state.tick % 120) === 0) {
                  console.log(`    [compost] t=${Math.round(state.simTime)} tow ${prey.type}#${prey.id} prey→mouth=${Math.round(dist(prey.pos, garden.pos))} ship→garden=${Math.round(dist(p.pos, garden.pos))} mouth=${Math.round(mouth)}`);
                }
                return;
              }
              cmd.cut = true; return; // latched a non-edible — drop it
            }
            // A cut load is inside the mouth waiting on the swallow — stay out of
            // the receiver core until the body is gone (eaten or drifted out).
            if (decided.compostFedId != null) {
              const fed = state.entities.get(decided.compostFedId);
              const waited = (state.simTime || 0) - (decided.compostFedSince || 0);
              if (fed && fed.alive !== false && waited < 60) {
                if (dist(p.pos, garden.pos) < mouth + 140) {
                  flyTo(input, clearPoint(), { arrive: 40 });
                }
                if (process.env.STRANGER_PILOT_TRACE && (state.tick % 120) === 0) {
                  console.log(`    [compost] t=${Math.round(state.simTime)} waiting prey#${decided.compostFedId} d=${Math.round(dist(fed.pos, garden.pos))} ship→garden=${Math.round(dist(p.pos, garden.pos))}`);
                }
                return;
              }
              decided.compostFedId = null; // eaten (or gave up) — take the next load
            }
            // Pick the lowest-haul edible body outside the mouth (one already inside
            // is ambient mass, not player-fed). Prefer ≥14t: one feed crosses the
            // stage-2 floor (52 biomass + 0.6·14 ≥ 60); smaller still credits.
            // Score by total haul — ship→prey + prey→mouth — not mass alone:
            // run121 burned 200 s chasing a 5000-mass asteroid that was both
            // receding and above the 1800 massive-anchor line, where the tether
            // anchors the SHIP to the rock instead of towing it.
            const haul = (e) => dist(p.pos, e.pos) + dist(e.pos, garden.pos);
            const candidates = (state.entityList || []).filter(edible)
              .filter((e) => !preyInMouth(e))
              .sort((a, b) => haul(a) - haul(b));
            const prey = candidates.find((e) => e.mass >= 14) || candidates[0] || null;
            if (prey) {
              // Same scored-latch chase as the cinder hull: close fast, stand off,
              // match velocity, spend the aimed latch pulse at low relative speed.
              const dP = dist(p.pos, prey.pos);
              const pv = prey.vel ? Math.hypot(prey.vel.x, prey.vel.z) : 0;
              const relSpeed = Math.abs(speedOf(p) - pv);
              const leadS = Math.min(dP / Math.max(speedOf(p), 80), 25);
              const lead = { x: prey.pos.x + (prey.vel ? prey.vel.x : 0) * leadS,
                z: prey.pos.z + (prey.vel ? prey.vel.z : 0) * leadS };
              input.aimAngle = Math.atan2(lead.z - p.pos.z, lead.x - p.pos.x);
              const err = wrapAngle(input.aimAngle - (p.rot || 0));
              input.turnIntent = Math.max(-1, Math.min(1, err / 0.5));
              const facing = Math.abs(err) < 0.6;
              const preyR = Math.max(12, prey.radius || 0);
              const inContact = dP < preyR + 25;
              input.moveZ = facing && !inContact && (dP > 220 || speedOf(p) < pv) ? 1 : 0;
              input.boost = facing && dP > 700 && energyReady(p);
              input.brake = inContact
                ? speedOf(p) > pv + 6
                : speedOf(p) > pv + Math.max(10, dP / 10);
              const pulse = (state.tick % 12) < 2;
              if (dP < 300 && relSpeed < 45 && pulse) {
                input.aimWorld = { x: prey.pos.x, z: prey.pos.z };
                input.aimIntentActive = true;
                input.tetherMode = null;
                cmd.latch = true;
              }
              if (process.env.STRANGER_PILOT_TRACE && (state.tick % 120) === 0) {
                console.log(`    [compost] t=${Math.round(state.simTime)} chase ${prey.type}#${prey.id} d=${Math.round(dP)} mass=${Math.round(prey.mass)} mouth→garden=${Math.round(dist(p.pos, garden.pos))}`);
              }
              return;
            }
            // No live edible body in reach: jettison a loose lot at the mouth —
            // the pod carries thrownBy and counts as player-fed on landing.
            if (selectedJettisonLot(state) != null) {
              if (dist(p.pos, garden.pos) > mouth * 0.5) {
                flyTo(input, garden.pos, { arrive: Math.max(40, mouth * 0.5) });
              } else if (speedOf(p) > 12) {
                input.brake = true;
              } else {
                input.actions = input.actions || {};
                input.actions.jettisonLot = true;
              }
              return;
            }
            // Nothing fed and nothing to feed: hold at the waypoint, don't park forever.
            if (mw.pos) flyTo(input, mw.pos, { arrive: 80 });
            return;
          }
        }
        // Fly the tracked contract's own diamond: for a docked-delivery it is the
        // destination station; bounty/survey rows point at their site. Dock at the
        // station when the diamond sits on it — dock:docked settles the leg.
        const st = nearestDockStation();
        if (mw && mw.pos && mw.onboarding !== true) {
          if (st) {
            const berthKey = `${st.id}|${Math.round(mw.pos.x)}|${Math.round(mw.pos.z)}`;
            // Dock whenever this marker's berth still has an outstanding settle (an
            // active contract addressed to this station), and once more after the
            // pending set changes — then hold. Run 44 bounced Helios' berth forever
            // on a stale marker; run 47's guard then blocked the B0 sample turn-in,
            // which only fires on a dock:docked dispatch with the berth's record id.
            const stRecordId = (st.data && st.data.stationId) || st.stationId || st.id;
            const holdNow = (state.player && state.player.cargo && state.player.cargo.items) || {};
            // The signature covers what a settle could turn on: which contracts address
            // this berth AND whether their manifest cargo is aboard. A resupply leg that
            // loaded the manifest changes the signature — the berth owes another dock.
            const pending = active
              .filter((m) => m && m.status === 'active' && (m.destStationId === stRecordId || m.stationId === stRecordId))
              .map((m) => {
                const pr = m.params || {};
                const short = pr.cmdtyId && !m.preloadedCargo
                  && (holdNow[pr.cmdtyId] || 0) < Math.max(1, pr.qty || 1);
                return `${m.id}${short ? ':short' : ''}`;
              }).sort().join(',');
            const served = settledBerth
              && settledBerth.key === berthKey && settledBerth.pending === pending;
            if (!served) {
              flyTo(input, mw.pos, { arrive: DOCK_RANGE - 20, boost: true });
              if (dist(p.pos, st.pos) <= DOCK_RANGE + (st.radius || 0)
                && dist(p.pos, mw.pos) <= DOCK_RANGE + (st.radius || 0) + 500) {
                services.dockAt(st);
                settledBerth = { key: berthKey, pending };
              }
              return;
            }
            input.brake = true;
            return;
          }
          flyTo(input, mw.pos, { arrive: 200, boost: true });
          return;
        }
        const delivery = active.find((m) => m && m.destStationId);
        const recordId = (s) => (s && s.data && s.data.stationId) || (s && s.stationId) || (s && s.id);
        const dst = delivery && st && recordId(st) === delivery.destStationId ? st
          : (state.entityIndex && state.entityIndex.dockStations || [])
              .find((s) => s && s.alive && delivery && recordId(s) === delivery.destStationId);
        if (dst) {
          flyTo(input, dst.pos, { arrive: DOCK_RANGE - 20, boost: true });
          if (dist(p.pos, dst.pos) <= DOCK_RANGE + (dst.radius || 0)) services.dockAt(dst);
          return;
        }
        // No contract and no marker left: berth at the nearest port and wait out
        // the hour there — the route ends tied to a dock, not adrift.
        const berth = nearestDockStation();
        if (berth) {
          flyTo(input, berth.pos, { arrive: DOCK_RANGE - 20, boost: true });
          if (dist(p.pos, berth.pos) <= DOCK_RANGE + (berth.radius || 0)) services.dockAt(berth);
          return;
        }
        input.brake = true;
        return;
      }

      // ── Rescue verbs (the rail's taught moments) ──────────────────────────────────────
      const r = rescue();
      if (r) {
        if (r.current === 'swing') {
          const rock = rescueEntity('rock');
          const derelict = rescueEntity('derelict');
          if (rock && derelict) {
            // Sweep the scrap the tether lesson just shook loose — it sits on the swing line
            // and keeps stealing the latch. A player grabs the loot, then takes the rock.
            const scrap = (state.entityList || []).find((e) => e && e.alive && e.type === 'pickup'
              && e.data && e.data.commodityId === 'cmdty_salvage_electronics'
              && dist(p.pos, e.pos) < 700);
            if (!lineAttached && scrap) {
              flyTo(input, scrap.pos, { arrive: 5 });
              return;
            }
            if (lineAttached && latchedId !== rock.id) {
              // Wrong body took the press (the wreck sits behind the rock): let go, retry.
              cmd.cut = true;
              unhook();
              return;
            }
            if (!lineAttached && dist(p.pos, rock.pos) > 1200) {
              // The released rock is running: hold station — the rail restages it nearby.
              input.brake = true;
              return;
            }
            if (!lineAttached || latchedId !== rock.id) {
              // Pre-position BEHIND the rock on the wreck line: the whole swing then sweeps
              // through the wreck direction twice per revolution and the cut lands.
              const wdx = derelict.pos.x - rock.pos.x;
              const wdz = derelict.pos.z - rock.pos.z;
              const wd = Math.hypot(wdx, wdz) || 1;
              const launch = { x: rock.pos.x - (wdx / wd) * 60, z: rock.pos.z - (wdz / wd) * 60 };
              // Unstick: a recoil can grind the hull along a static rock — sidestep 90 deg
              // for a beat whenever thrust is commanded but the hull is not moving.
              if (speedOf(p) < 5) {
                stuckTicks = (stuckTicks || 0) + 1;
              } else {
                stuckTicks = 0;
              }
              if (stuckTicks > 240) {
                // Aim directly AWAY from the nearest static rock: grinding along a surface
                // only ends when the thrust points off the pin.
                let pin = null;
                let pinD = 220;
                for (const e of (state.entityList || [])) {
                  if (!e || !e.alive || e.type !== 'asteroid' || !e.pos) continue;
                  const dd = dist(p.pos, e.pos);
                  if (dd < pinD) { pinD = dd; pin = e; }
                }
                const away = pin
                  ? { x: p.pos.x + (p.pos.x - pin.pos.x) * 3, z: p.pos.z + (p.pos.z - pin.pos.z) * 3 }
                  : { x: p.pos.x - (wdz / wd) * 300, z: p.pos.z + (wdx / wd) * 300 };
                flyTo(input, away, { arrive: 80, boost: energyFull(p) });
                return;
              }
              if (dist(p.pos, launch) > 110) {
                flyTo(input, launch, { arrive: 40, boost: energyFull(p) });
                return;
              }
              tryLatch(input, cmd, rock, 'rescue-rock');
              swingStartTick = 0;
              return;
            }
            if (process.env.STRANGER_PILOT_TRACE && (state.tick % 120) === 0) {
              const wdx2 = derelict.pos.x - rock.pos.x;
              const wdz2 = derelict.pos.z - rock.pos.z;
              const wd2 = Math.hypot(wdx2, wdz2) || 1;
              const rk2 = speedOf(rock);
              const rkDot2 = rock.vel ? (rock.vel.x * wdx2 + rock.vel.z * wdz2) / ((rk2 || 1) * wd2) : 0;
              console.log(`    [swing] t=${Math.round(state.simTime)} lineAtt=${lineAttached} latched=${latchedId} dRock=${Math.round(dist(p.pos, rock.pos))} needWinch=${needWinch} v=${Math.round(speedOf(p))} rkV=${Math.round(rk2)} rkDot=${rkDot2.toFixed(3)} dWreck=${Math.round(wd2)}`);
            }
            // Winch tight, then SWING exactly like the verbs-bench predator: turn across the
            // line, burn the tangent (boost pulses load the arc), and cut when the rock's
            // velocity actually points at the wreck.
            if (needWinch && (state.simTime || 0) >= winchUntil) needWinch = false;
            if (needWinch) {
              // No brake here: braking anchors the hull while the winch drags a light rock
              // into it — the yank snaps the line. Drift and reel gently instead.
              input.brake = false;
              input.moveZ = 0;
              cmd.lineControl = true;
              cmd.lineLength = (state.simTime || 0) < nearBreakUntil ? 0.5 : -0.35;
              return;
            }
            const toWreck = { x: derelict.pos.x - rock.pos.x, z: derelict.pos.z - rock.pos.z };
            const toWreckD = Math.hypot(toWreck.x, toWreck.z) || 1;
            const rkSpeed = speedOf(rock);
            const rkDot = rock.vel ? (rock.vel.x * toWreck.x + rock.vel.z * toWreck.z)
              / ((rkSpeed || 1) * toWreckD) : 0;
            swingStartTick = swingStartTick || state.tick;
            const stretchTicks = state.tick - swingStartTick;
            // Pick the orbit side that carries the sweep toward the wreck first.
            const crossWR = (rock.pos.x - p.pos.x) * (derelict.pos.z - rock.pos.z)
              - (rock.pos.z - p.pos.z) * (derelict.pos.x - rock.pos.x);
            orbitDir = crossWR > 0 ? -1 : 1;
            // Cut when the swing geometry lines the rock up with the wreck. The sweep
            // crosses the wreck direction every revolution; a mid-sweep cut flings the
            // rock exactly the wrong way, so there is no early failsafe here.
            // Contact pad at the wreck is ~32 wu at ~230 wu range: the release needs a
            // near-exact alignment or the rock sails past. The sweep crosses this window
            // every revolution, so hold on until it truly lines up.
            if ((rkSpeed >= 25 && rkDot > 0.995) || stretchTicks > 2400) {
              input.tetherCut = true;
              cmd.cut = true;
              unhook();
              swingStartTick = 0;
              return;
            }
            // The launch sits behind the rock ON the wreck line: burn toward the wreck and the
            // pair's velocity carries the rock straight into it. Cut when the rock is truly
            // flying at the wreck.
            const wreckA = Math.atan2(derelict.pos.z - p.pos.z, derelict.pos.x - p.pos.x);
            input.aimAngle = wreckA;
            input.turnIntent = Math.max(-1, Math.min(1, wrapAngle(wreckA - (p.rot || 0)) / 0.5));
            input.moveZ = 1;
            input.boost = energyFull(p);
            cmd.lineControl = true;
            cmd.lineLength = -0.35; // keep winching while burning: rockReeled must hold at cut
            if (r.rockReeled && rkSpeed >= 30 && rkDot > 0.9) {
              input.tetherCut = true;
              cmd.cut = true;
              unhook();
              swingStartTick = 0;
              return;
            }
            return;
          }
        } else if (r.current === 'shove') {
          const scout = rescueEntity('scout');
          const wall = rescueEntity('asteroid');
          if (scout && wall) {
            // The scout is a live drone that flees the ship: no firing lane holds against a
            // runner and chasing only leads the pair off the wall's line. The taught verb
            // finishes it — put a line on him (he cannot run tethered), then throw him at
            // the rock, exactly like the raider tow.
            if (lineAttached && latchedId === scout.id) {
              if (needWinch && (state.simTime || 0) >= winchUntil) needWinch = false;
              if (needWinch) {
                input.brake = false;
                input.moveZ = 0;
                cmd.lineControl = true;
                cmd.lineLength = (state.simTime || 0) < nearBreakUntil ? 0.5 : -0.35;
                return;
              }
              const toWall = { x: wall.pos.x - scout.pos.x, z: wall.pos.z - scout.pos.z };
              const toWallD = Math.hypot(toWall.x, toWall.z) || 1;
              const scSpeed = speedOf(scout);
              const scDot = scout.vel
                ? (scout.vel.x * toWall.x + scout.vel.z * toWall.z) / ((scSpeed || 1) * toWallD) : 0;
              swingStartTick = swingStartTick || state.tick;
              // Burn at the wall with him in tow; cut when he truly flies at it — the same
              // release the swing beat lands on the wreck.
              const wallA = Math.atan2(wall.pos.z - p.pos.z, wall.pos.x - p.pos.x);
              input.aimAngle = wallA;
              input.turnIntent = Math.max(-1, Math.min(1, wrapAngle(wallA - (p.rot || 0)) / 0.5));
              input.moveZ = 1;
              input.boost = energyFull(p);
              cmd.lineControl = true;
              cmd.lineLength = -0.35;
              // He resumes fleeing the moment the line goes — and away-from-player now
              // points off the wall. Release close enough that 20+ wu/s carries him to the
              // rock before the dodge can bleed it off.
              if ((scSpeed >= 20 && scDot > 0.9 && toWallD < 300) || state.tick - swingStartTick > 2400) {
                input.tetherCut = true;
                cmd.cut = true;
                unhook();
                swingStartTick = 0;
                return;
              }
              return;
            }
            if (lineAttached) {
              // Whatever else holds the line (claimed salvage, a loose scrap box) is not the
              // lesson — let it go and take the body the verb names.
              input.tetherCut = true;
              cmd.cut = true;
              unhook();
              swingStartTick = 0;
              return;
            }
            if (process.env.STRANGER_PILOT_TRACE && (state.tick % 120) === 0) {
              console.log(`    [shove] t=${Math.round(state.simTime)} dScout=${Math.round(dist(p.pos, scout.pos))} scoutToWall=${Math.round(dist(scout.pos, wall.pos))} v=${Math.round(speedOf(p))}`);
            }
            // Run him down — fly the intercept lead, not his tail: tryLatch's own approach
            // throttle bleeds arrival speed on a fleeing drone forever, while the led point
            // keeps the closing vector honest. Same id so the reticle still names him.
            const scLead = 1.0;
            tryLatch(input, cmd, {
              id: scout.id,
              pos: {
                x: scout.pos.x + (scout.vel ? scout.vel.x * scLead : 0),
                z: scout.pos.z + (scout.vel ? scout.vel.z * scLead : 0),
              },
            }, 'rescue-scout');
            swingStartTick = 0;
            return;
          }
        } else if (r.current === 'grab') {
          const pod = rescueEntity('pod');
          const beacon = rescueEntity('beacon');
          if (pod && beacon) {
            const latched = lineAttached && latchedId === pod.id;
            if (lineAttached && !latched) {
              cmd.cut = true;
              unhook();
              return;
            }
            if (!latched) { tryLatch(input, cmd, pod, 'rescue-pod'); return; }
            // Run the pod home: the towed pod crosses the ring trailing the hull, and the
            // predicate is pod-inside-radius only — proximity, no speed proof. Radial
            // thrust cannot remove tangential velocity — nose-at-beacon supplies only
            // centripetal force, which is exactly what holds a stable circle (runs
            // 7–12 pinned at dB≈111–420 across every pursuit/guidance scheme). Only
            // the brake acts on the velocity vector itself: a circling approach must
            // stop dead before it can straighten onto the mark and creep in.
            const dB = dist(p.pos, beacon.pos);
            const vx = (p.vel && Number(p.vel.x)) || 0;
            const vz = (p.vel && Number(p.vel.z)) || 0;
            const vNow = Math.hypot(vx, vz);
            const closing = ((vx * (beacon.pos.x - p.pos.x)) + (vz * (beacon.pos.z - p.pos.z))) / (dB || 1);
            if (!grabBraking && (vNow > Math.max(10, dB / 6) || (vNow > 4 && closing < vNow * 0.4))) {
              grabBraking = true;
            }
            if (grabBraking && vNow < 2) grabBraking = false;
            const aimB = Math.atan2(beacon.pos.z - p.pos.z, beacon.pos.x - p.pos.x);
            const errB = wrapAngle(aimB - (p.rot || 0));
            input.aimAngle = aimB;
            input.turnIntent = Math.max(-1, Math.min(1, errB / 0.6));
            input.boost = false;
            const podSpeed = pod.vel ? Math.hypot(pod.vel.x || 0, pod.vel.z || 0) : 0;
            if (dB < 130) {
              // Drive-through delivery: the predicate is pod-inside-radius at ANY
              // instant, and a taut-line pod follows the hull's ground track — so fly
              // the hull on a straight line THROUGH the beacon and the pod sweeps the
              // ring behind it. Stopping inside the ring is actively wrong: the taut
              // trailing line is an anchor, and every park/bite ratchet let tension
              // drag the hull back out (run 28 sat at dB≈72–77 for 300+ sim-s).
              // Aim a leg past the beacon, cap speed so the line stays settled, and
              // if the pass misses, the outer approach turns the ship for another run.
              const aimX = beacon.pos.x + Math.cos(aimB) * 160;
              const aimZ = beacon.pos.z + Math.sin(aimB) * 160;
              input.aimAngle = Math.atan2(aimZ - p.pos.z, aimX - p.pos.x);
              const errT = wrapAngle(input.aimAngle - (p.rot || 0));
              input.turnIntent = Math.max(-1, Math.min(1, errT / 0.6));
              // Slow transit: the pod trails the VELOCITY vector, so it only cuts
              // inside the hull's turn — a tight low-speed hook around the beacon
              // swings the pod deepest (run 30's v≈45 passes floored dPB at ~68).
              input.brake = vNow > 15;
              input.moveZ = (!input.brake && Math.abs(errT) < 0.5) ? 1 : 0;
            } else {
              input.brake = grabBraking || vNow > Math.max(6, dB / 10);
              input.moveZ = (!input.brake && Math.abs(errB) < 0.4 && dB > 20) ? 1 : 0;
            }
            // Keep the pod reeled to the hull for delivery — a slack line let it sail
            // 390wu off on its own momentum (run 13; again at ~55+ in run 31) and the
            // predicate needs IT in the ring, not the hull.
            cmd.lineControl = true;
            cmd.lineLength = -0.35;
            if (process.env.STRANGER_PILOT_TRACE && (state.tick % 120) === 0) {
              const dPB = dist(pod.pos, beacon.pos);
              const podOff = Math.atan2(pod.pos.z - p.pos.z, pod.pos.x - p.pos.x);
              const bOff = Math.atan2(beacon.pos.z - p.pos.z, beacon.pos.x - p.pos.x);
              console.log(`    [grab] t=${Math.round(state.simTime)} dPod=${Math.round(dist(p.pos, pod.pos))} dB=${Math.round(dB)} dPB=${Math.round(dPB)} off=${wrapAngle(podOff - bOff).toFixed(2)} v=${Math.round(vNow)} podV=${Math.round(podSpeed)} closing=${Math.round(closing)} err=${errB.toFixed(2)} brk=${input.brake} mz=${input.moveZ} latched=${r.podLatched}`);
            }
            return;
          }
        }
      }

      // ── Missing-three (boost / stroke / well) ─────────────────────────────────────────
      const t3 = three();
      if (t3) {
        if (t3.current === 'boost') {
          // A held line is an anchor — the delivered pod pins the hull at v=0 while the
          // beat asks for speed (run 33). A real player cuts the tow to boost.
          if (lineAttached) { cmd.cut = true; unhook(); return; }
          if (!decided.boostUse) {
            decided.boostUse = true;
            ledger.recordDecision({
              situation: 'boost now or save the capacitor',
              options: [
                { id: 'boost_now', tradeoff: 'speed now, cap dry for a moment' },
                { id: 'save_cap', tradeoff: 'cap ready, no speed learned' },
              ],
              chosen: 'boost_now',
            });
          }
          // The beat completes on the boost VERB (input.boost held), not on arrival —
          // and its waypoint is the beacon the pilot just delivered to, so flyTo parks
          // at it with the verb never held (runs 33–34 sat at v=0 for 200+ sim-s).
          // Aim a long heading away and hold boost like the wanted-outrun leg does.
          const wp = waypoint();
          const aimB = wp && wp.pos ? Math.atan2(wp.pos.z - p.pos.z, wp.pos.x - p.pos.x)
            : (p.rot || 0);
          const far = { x: p.pos.x + Math.cos(aimB) * 6000, z: p.pos.z + Math.sin(aimB) * 6000 };
          flyTo(input, far, { boost: true, arrive: 500 });
          return;
        }
        if (t3.current === 'stroke') {
          // Draw-to-fly: sketch a two-point path; the ship flies the stroke.
          strokeTicks += 1;
          input.autoTargetPath = {
            active: true,
            drawing: strokeTicks < 30,
            points: [
              { x: p.pos.x, z: p.pos.z },
              { x: p.pos.x + Math.cos(p.rot || 0) * 420, z: p.pos.z + Math.sin(p.rot || 0) * 420 },
            ],
          };
          return;
        }
        if (t3.current === 'well') {
          const wp = waypoint();
          flyTo(input, wp ? wp.pos : null, { arrive: 160 });
          if (!decided.wellUse) {
            decided.wellUse = true;
            ledger.recordDecision({
              situation: 'drop the well on the scrap or fly it home',
              options: [
                { id: 'well_pull', tradeoff: 'the field gathers the debris for you' },
                { id: 'manual_tow', tradeoff: 'slower, no cap cost' },
              ],
              chosen: 'well_pull',
            });
          }
          input.actions.deployWell = true; // edge
          return;
        }
        if (t3.current === 'repulsor') {
          const wp = waypoint();
          flyTo(input, wp ? wp.pos : null, { arrive: 160 });
          if (!decided.repulsorUse) {
            decided.repulsorUse = true;
            ledger.recordDecision({
              situation: 'shove the scrap clump or nudge it by hand',
              options: [
                { id: 'repulsor_shove', tradeoff: 'the field scatters everything at once' },
                { id: 'hand_nudge', tradeoff: 'slower, precise' },
              ],
              chosen: 'repulsor_shove',
            });
          }
          input.actions.deployRepulsor = true; // edge
          return;
        }
        if (t3.current === 'cone') {
          const wp = waypoint();
          flyTo(input, wp ? wp.pos : null, { arrive: 240 });
          if (!decided.coneUse) {
            decided.coneUse = true;
            ledger.recordDecision({
              situation: 'plow a lane with the cone or thread the rocks',
              options: [
                { id: 'cone_plow', tradeoff: 'the wedge clears a channel ahead' },
                { id: 'thread_rocks', tradeoff: 'slower, no field running' },
              ],
              chosen: 'cone_plow',
            });
          }
          // toggleClearingCone is a level-consumed TOGGLE in fields._handleInput: every
          // `true` write flips state. Writing it each tick strobes the wedge and leaves
          // it running after the beat — in run 38 the live cone then shoved the seam
          // rock ~4 000 wu off its mark. Edge-fire once, then release when the beat ends.
          if (!decided.coneFired) {
            decided.coneFired = true;
            input.actions.toggleClearingCone = true; // single edge: cone ON
          }
          return;
        }
      }

      // Once the cone lesson is past, a still-on wedge is a liability: it follows the
      // nose and plows whatever the ship aims at — run 38's live cone shoved the seam
      // rock ~4 000 wu off its mark before the mining beat even started.
      if (decided.coneFired && !decided.coneOff
        && state.fields && state.fields.coneActive) {
        decided.coneOff = true;
        input.actions.toggleClearingCone = true; // single edge: cone OFF
      }

      // ── The raid: latch the raider, swing, release into the big rock ───────────────────
      if (o && o.raid && o.raid.active && !o.beatDoneAt.raid) {
        const raid = o.raid;
        const raider = raid.ids.raider != null ? state.entities.get(raid.ids.raider) : null;
        if (!raider || !raider.alive) { input.brake = true; return; } // restage pending; coast
        if (!raidWall || raidWall.alive === false) raidWall = bigRockNear(p.pos, 2400);
        const wall = raidWall;
        if (lineAttached && latchedId !== raider.id) {
          cmd.cut = true;
          unhook();
          return;
        }
        if (!lineAttached || latchedId !== raider.id) {
          const choice = decide('raidApproach', 'the raider: latch and swing him, or shoot him down',
            [
              { id: 'latch_swing', tradeoff: 'the taught throw — he becomes the projectile' },
              { id: 'shoot', tradeoff: 'familiar guns, slow grind, no swing' },
            ],
            'latch_swing');
          if (choice === 'latch_swing') { tryLatch(input, cmd, raider, 'raider'); return; }
          flyTo(input, raider.pos, { arrive: 300 });
          input.aimAngle = Math.atan2(raider.pos.z - p.pos.z, raider.pos.x - p.pos.x);
          input.fire = dist(p.pos, raider.pos) < 520;
          input.fireGroup = 1;
          return;
        }
        if (process.env.STRANGER_PILOT_TRACE && (state.tick % 120) === 0) {
          console.log(`    [raid] t=${Math.round(state.simTime)} wall=${wall ? `${Math.round(wall.pos.x)},${Math.round(wall.pos.z)}` : 'none'} p@(${Math.round(p.pos.x)},${Math.round(p.pos.z)})v${Math.round(speedOf(p))}`);
        }
        if (!decided.raidRelease) {
          decided.raidRelease = true;
          ledger.recordDecision({
            situation: 'raider on the line: haul him into the big rock, or cut him loose at it',
            options: [
              { id: 'tow_slam', tradeoff: 'the line keeps him honest — slam him in' },
              { id: 'cut_loose', tradeoff: 'he flies free, maybe wide' },
            ],
            chosen: 'tow_slam',
          });
        }
        // Haul him in tight, then tow him at full burn straight THROUGH the big rock.
        // One solid whip per latch: cut on the wall pass — the next latch re-arms the
        // impact, so successive passes keep landing fresh solid hits.
        if (wall && speedOf(p) > 55 && dist(p.pos, wall.pos) < 130) {
          cmd.cut = true;
          unhook();
          return;
        }
        if (wall) {
          const wx = wall.pos.x - p.pos.x;
          const wz = wall.pos.z - p.pos.z;
          const wd = Math.hypot(wx, wz) || 1;
          const through = { x: wall.pos.x + (wx / wd) * 400, z: wall.pos.z + (wz / wd) * 400 };
          flyTo(input, through, { arrive: 40, boost: energyFull(p) });
        } else {
          flyTo(input, raider.pos, { arrive: 60 });
        }
        cmd.lineControl = true;
        cmd.lineLength = -0.5;
        // Tether-lock shot: the raider rides the line right in front of the guns — finish
        // the stagger while the tow swings him through the rock.
        const toRaider = Math.atan2(raider.pos.z - p.pos.z, raider.pos.x - p.pos.x);
        const raidErr = Math.abs(wrapAngle(toRaider - (p.rot || 0)));
        if (raidErr < 0.5 && dist(p.pos, raider.pos) < 420 && energyReady(p)) {
          input.aimAngle = toRaider;
          input.fire = true;
          input.fireGroup = 1;
        }
        return;
      }

      // ── Claimed salvage: the choice, then the consequence ─────────────────────────────
      if (o && o.claimed && o.claimed.active && !o.beatDoneAt.claimed) {
        const claimed = o.claimed;
        if (!claimed.taken) {
          const pickups = (claimed.ids.pickups || [])
            .map((id) => (id != null ? state.entities.get(id) : null))
            .filter((e) => e && e.alive);
          const target = pickups[0];
          if (target) {
            const choice = decide('takeClaimed',
              'the spill is claimed and a law cutter is watching: take it or leave it',
              [
                { id: 'take', tradeoff: 'free cargo, the cutter saw the wreck and sees you' },
                { id: 'leave', tradeoff: 'clean record, cargo drifts away' },
              ],
              'take');
            if (choice === 'take') {
              flyTo(input, target.pos, { arrive: 8 });
              return;
            }
          }
          input.brake = true;
          return;
        }
        // Taken: WANTED — run the ring.
        if (!escapeFrom) escapeFrom = { x: p.pos.x, z: p.pos.z };
        if (!decided.wantedResponse) {
          decided.wantedResponse = true;
          ledger.recordDecision({
            situation: 'wanted: outrun the search ring or turn and face the cutter',
            options: [
              { id: 'outrun', tradeoff: 'heat cools outside the ring' },
              { id: 'face', tradeoff: 'scan risk now, clean record if cleared' },
            ],
            chosen: 'outrun',
          });
        }
        const awayA = Math.atan2(p.pos.z - escapeFrom.z, p.pos.x - escapeFrom.x);
        if (heat() > 0.001) {
          input.aimAngle = awayA;
          input.turnIntent = Math.max(-1, Math.min(1, wrapAngle(awayA - (p.rot || 0)) / 0.5));
          input.moveZ = 1;
          input.boost = energyFull(p);
          return;
        }
        input.brake = true; // heat cleared: coast while the beat resolves
        return;
      }

      // ── The drill + economy beats, by what the HUD instruction says ───────────────────
      const line = (o && o.beatAction) || '';
      const wp = waypoint();

      if (process.env.STRANGER_PILOT_TRACE && (state.tick % 180) === 0) {
        const pl = p;
        console.log(`    [wp] t=${Math.round(state.simTime)} beat=${o && o.currentBeat} v=${Math.round(speedOf(pl))} line='${line.slice(0, 36)}' wp=${wp ? `${wp.label}:${wp.onboarding ? 'ob' : 'foreign'}` : 'none'} moveZ=${input.moveZ} brake=${input.brake} cap=${pl.capMax ? Math.round((pl.cap / pl.capMax) * 100) : '?'}%`);
      }
      // Economy beats run on the beat line even when the route marker is
      // mission-owned: the dock beat's diamond flips to the real delivery's
      // marker after acceptance, and the choice beat's is a foreign board
      // marker — gating on wp.onboarding parked run 40's ship at the station,
      // undocked, beat 11 open, for 260+ sim-s.
      if (/dock when close|helios/i.test(line)) {
        const st = nearestDockStation();
        if (st) {
          flyTo(input, st.pos, { arrive: DOCK_RANGE - 20, boost: true });
          if (dist(p.pos, st.pos) <= DOCK_RANGE + (st.radius || 0)) {
            services.dockAt(st);
            pickWork();
          }
          return;
        }
        if (wp && wp.pos) { flyTo(input, wp.pos, { arrive: 400, boost: true }); return; }
      }
      if (/pick the work|board's holding/i.test(line)) {
        // The board is read at the berth: re-dock if a station is in reach and the
        // docked block takes the work there; with no station at all, accept what
        // the board shows — the beat completes on mission:accepted, not the berth.
        const st = nearestDockStation();
        if (st && dist(p.pos, st.pos) > DOCK_RANGE + (st.radius || 0)) {
          flyTo(input, st.pos, { arrive: DOCK_RANGE - 20, boost: true });
          return;
        }
        if (st) services.dockAt(st);
        pickWork();
        return;
      }
      if (wp && wp.onboarding) {
        if (/speed passes forty/i.test(line)) {
          input.aimAngle = p.rot || 0;
          input.moveZ = 1;
          return;
        }
        if (/brake below ten/i.test(line)) {
          input.brake = true;
          return;
        }
        if (/cross your bow/i.test(line) && wp.pos) {
          // Flyby lesson: "hold course" — the staged pass crosses the player's bow. Chasing the
          // wingman on boost keeps the stick hot through the whole crossing window, and the
          // flyby census refuses to arm while input.boost/fire is held, so the pass can never
          // lease. Settle to near-stationary and let the pass come; spent passes restage.
          input.boost = false;
          input.fire = false;
          if (speedOf(p) > 15) input.brake = true;
          return;
        }
        if (/leaves scope|thrust away/i.test(line) && wp.pos) {
          // Disengage: aim directly away from the trainer and hold the burn. (A receding
          // relative target never opens the brake band — the hull would creep forever.)
          input.aimAngle = Math.atan2(p.pos.z - wp.pos.z, p.pos.x - wp.pos.x);
          input.turnIntent = Math.max(-1, Math.min(1, wrapAngle(input.aimAngle - (p.rot || 0)) / 0.5));
          input.moveZ = 1;
          input.boost = energyFull(p);
          return;
        }
        if (/trainer|burst/i.test(line) && wp.pos) {
          const fd = flyTo(input, wp.pos, { arrive: 160 });
          if (process.env.STRANGER_PILOT_TRACE && (state.tick % 120) === 0) {
            console.log(`    [marker] t=${Math.round(state.simTime)} d=${Math.round(fd)} v=${Math.round(speedOf(p))} line='${line.slice(0, 30)}' burst=${/burst/i.test(line)}`);
          }
          if (/burst/i.test(line)) {
            input.aimAngle = Math.atan2(wp.pos.z - p.pos.z, wp.pos.x - p.pos.x);
            input.fire = dist(p.pos, wp.pos) < 620;
            input.fireGroup = 1;
          }
          return;
        }
        if (/derelict|trainer|buoy|beacon|rock/i.test(wp.label || '') && wp.pos) {
          // The attach lesson: fly to the marked body, take the offered line, winch, cut.
          if (/derelict/i.test(wp.label || '')) {
            const d = dist(p.pos, wp.pos);
            // The diamond marks ONE body: resolve it and only ever latch that body.
            const wpEntity = nearestEntityTo(wp.pos, 80);
            if (lineAttached && wpEntity && latchedId !== wpEntity.id) {
              cmd.cut = true;
              unhook();
              return;
            }
            if (!lineAttached) {
              flyTo(input, wp.pos, { arrive: 40 });
              const acq = state.masslineAcquisition && state.masslineAcquisition.selected;
              // Latch only the marked body, only when close AND slow: a high-speed latch snaps.
              if (acq && acq.status === 'ready' && acq.targetId != null && wpEntity
                && acq.targetId === wpEntity.id && d < 130 && speedOf(p) < 60) {
                cmd.latch = true;
                if (!decided.firstLatch) {
                  decided.firstLatch = true;
                  ledger.recordDecision({
                    situation: 'the instruction says latch: take the offered line',
                    options: [
                      { id: 'latch', tradeoff: 'try the massline on the marked derelict' },
                      { id: 'not_yet', tradeoff: 'watch a moment longer' },
                    ],
                    chosen: 'latch',
                  });
                }
              }
              return;
            }
            // Winch gently while braking the swing; near a break warning, ease off.
            // The winch reads lineLength as a signed rate: negative reels IN, positive pays out.
            input.brake = true;
            cmd.lineControl = true;
            if (o.tetherReeled === true) {
              cmd.cut = true;
              unhook();
            } else if ((state.simTime || 0) < nearBreakUntil || speedOf(p) > 45) {
              cmd.lineLength = 0.5;
            } else {
              cmd.lineLength = -0.5;
            }
            return;
          }
          flyTo(input, wp.pos, { arrive: 120 });
          return;
        }
        if (/scanner|seams/i.test(line) && wp.pos) {
          const d = flyTo(input, wp.pos, { arrive: 150 });
          // The rock is small: at v≈62 the brake lead band starts at ~237 but the
          // hull needs ~77wu to stop, so it overshoots and circles at ~310 forever
          // (run 36-37 — the tangential orbit stabilized just under a (d-120)/4 cap
          // at ~390wu). Kill tangential speed in the arrival band only — a bare
          // `d > 240` cap made run 39 crawl at 15wu/s across 6.4km.
          const vSeam = speedOf(p);
          if (d > 240 && d < 560 && vSeam > 14) {
            input.brake = true;
            input.moveZ = 0;
          }
          if (process.env.STRANGER_PILOT_TRACE && (state.tick % 120) === 0) {
            const errS = input.aimAngle != null && p.rot != null
              ? Math.round(((input.aimAngle - p.rot) % (Math.PI * 2)) * 57.3)
              : '?';
            console.log(`    [seam] t=${Math.round(state.simTime)} d=${Math.round(d)} v=${Math.round(speedOf(p))} rot=${p.rot != null ? p.rot.toFixed(2) : '?'} err=${errS} cone=${state.fields ? state.fields.coneActive : '?'} act='${(o.beatAction || '').slice(0, 30)}' fire=${input.fire}`);
          }
          if (d <= 260 && !decided.scanPulse) {
            decided.scanPulse = true;
            ledger.recordDecision({
              situation: 'pulse the scanner now or approach the rock further first',
              options: [
                { id: 'pulse_now', tradeoff: 'highlights the seam immediately' },
                { id: 'closer_first', tradeoff: 'better reads, seconds spent' },
              ],
              chosen: 'pulse_now',
            });
          }
          if (d <= 260) input.actions.scanPulse = true;
          if (/beam/i.test(o.beatAction || '')) {
            input.aimAngle = Math.atan2(wp.pos.z - p.pos.z, wp.pos.x - p.pos.x);
            input.fire = d <= 220;
            input.fireGroup = 2;
          }
          return;
        }
        // Generic waypoint follow (rescue diamonds are handled above; this covers the rest).
        if (wp.pos) {
          flyTo(input, wp.pos, { arrive: 120 });
          return;
        }
      }

      // Nothing on the HUD right now: hold station politely.
      input.brake = true;
    },
  };
}
