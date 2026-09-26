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

// The game's own hostility truth (scanner.js) — "not lawful" is not "hostile" (unlawful-neutral
// factions exist and must not be shot for sport).
function hostileToFaction(e, state) {
  const p = player(state);
  return !!(e && e.alive && e.type === 'ship' && e.team !== (p ? p.team : 0)
    && isHostileToPlayer(e, p ? p.team : 0, state));
}
import { SECTOR_GLOBAL_ORIGINS } from '../../../src/data/sectorCoordinates.js';

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
export function createServices({ state, bus, ledger, econ, clock }) {
  return {
    dockAt(station) {
      const p = player(state);
      if (!p || !station) return false;
      if ((state.ui && state.ui.docked) || (p.flags && p.flags.docked)) return true; // already docked
      if (clock && clock.tick() < clock.undockCooldownUntil()) return false; // bounce guard
      const range = DOCK_RANGE_WU + (station.radius || 0); // big hulls keep you farther out
      if (dist(p.pos, station.pos) > range) return false;
      p.flags = p.flags || {};
      p.flags.docked = true;
      state.ui = state.ui || {};
      state.ui.docked = true;
      state.ui.dockedStationId = station.id;
      bus.emit('dock:docked', { stationId: station.id });
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
  bus.on('tether:attached', (e) => { lineAttached = true; if (e && e.targetId != null) latchedId = e.targetId; ledger.recordNote('tether attached'); });
  const lineLost = (why) => () => { if (lineAttached) ledger.recordNote(`line lost: ${why}`); lineAttached = false; };
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
  let latchedTargetId = null;    // the body this policy intends to hold
  let needWinch = true;          // every fresh latch must be winched tight before a swing
  let raidWall = null;           // cached throw-target rock (static, so position is stable)
  let winchUntil = -1;           // simTime: reel this long after each fresh attach
  const decided = {};            // one decision log per choice point

  bus.on('tether:attached', (e) => { lineAttached = true; if (e && e.targetId != null) latchedId = e.targetId; needWinch = true; winchUntil = (state.simTime || 0) + 5; });
  const unhook = () => { lineAttached = false; latchedId = null; };
  bus.on('tether:nearBreak', () => { nearBreakUntil = (state.simTime || 0) + 1.4; });
  for (const ev of ['tether:broken', 'tether:cut', 'tether:cutPlayer', 'tether:released', 'tether:detached']) {
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
    // Get close and stopped, then wait for the reticle to actually NAME the body before
    // pressing — exactly how a player lines up the diamond. At point-blank the cone holds
    // only the marked body, so the press cannot grab a stranger.
    const speed = speedOf(p);
    const acq = state.masslineAcquisition && state.masslineAcquisition.selected;
    const aimed = acq && acq.status === 'ready' && acq.targetId === target.id;
    // Pulse the latch (press ~2 ticks, release ~10) — a held press is consumed once and the
    // tether never sees the retry, exactly like a player mashing the key until it takes.
    const pulse = (state.tick % 12) < 2;
    // Point-blank precision pick (the Ctrl+Massline binding): latch the NEAREST body. Inside
    // 60 wu the marked body is the nearest by construction, so the press cannot grab the
    // heavier wreck the preview keeps ranking above the target on a shared bearing.
    if (d < 90 && speed < 60 && !lineAttached && pulse) {
      input.tetherMode = 'nearest';
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
    step(dt, tick) {
      const p = player();
      if (!p || !p.alive) return;
      const input = neutralInput(state);
      const cmd = neutralCommand();
      massline(input, cmd);
      const o = ob();
      if (process.env.STRANGER_PILOT_TRACE && (state.tick % 180) === 0) {
        const pl = p;
        console.log(`    [step] t=${Math.round(state.simTime)} beat=${o && o.currentBeat} v=${Math.round(speedOf(pl))} resc=${o && o.rescue ? o.rescue.current : '-'} docked=${!!(state.ui && state.ui.docked) || !!(pl.flags && pl.flags.docked)} mode=${state.mode} beatAct='${(o && o.beatAction) || ''}'.slice(0,30)`);
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
        services.sellEverythingAt(state.ui.dockedStationId);
        services.repair();
        services.undock();
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
            if (!lineAttached || latchedId !== rock.id) {
              // Pre-position BEHIND the rock on the wreck line: the whole swing then sweeps
              // through the wreck direction twice per revolution and the cut lands.
              const wdx = derelict.pos.x - rock.pos.x;
              const wdz = derelict.pos.z - rock.pos.z;
              const wd = Math.hypot(wdx, wdz) || 1;
              const launch = { x: rock.pos.x - (wdx / wd) * 150, z: rock.pos.z - (wdz / wd) * 150 };
              if (dist(p.pos, launch) > 110) {
                flyTo(input, launch, { arrive: 40, boost: energyFull(p) });
                return;
              }
              tryLatch(input, cmd, rock, 'rescue-rock');
              swingStartTick = 0;
              return;
            }
            // Winch tight, then SWING exactly like the verbs-bench predator: turn across the
            // line, burn the tangent (boost pulses load the arc), and cut when the rock's
            // velocity actually points at the wreck.
            if (needWinch && (state.simTime || 0) >= winchUntil) needWinch = false;
            if (needWinch) {
              input.brake = true;
              cmd.lineControl = true;
              cmd.lineLength = (state.simTime || 0) < nearBreakUntil ? 0.5 : -0.5;
              return;
            }
            const toWreck = { x: derelict.pos.x - rock.pos.x, z: derelict.pos.z - rock.pos.z };
            const toWreckD = Math.hypot(toWreck.x, toWreck.z) || 1;
            const rkSpeed = speedOf(rock);
            const rkDot = rock.vel ? (rock.vel.x * toWreck.x + rock.vel.z * toWreck.z)
              / ((rkSpeed || 1) * toWreckD) : 0;
            swingStartTick = swingStartTick || state.tick;
            const stretchTicks = state.tick - swingStartTick;
            // Cut when the swing geometry lines the rock up with the wreck (or failsafe late).
            if ((rkSpeed >= 18 && rkDot > 0.93) || stretchTicks > 420) {
              input.tetherCut = true;
              cmd.cut = true;
              unhook();
              swingStartTick = 0;
              return;
            }
            // Burn the tangent: aim across the line (orbit side), full burn, boost pulses.
            const linex = (rock.pos.x - p.pos.x) / (dist(p.pos, rock.pos) || 1);
            const linez = (rock.pos.z - p.pos.z) / (dist(p.pos, rock.pos) || 1);
            const tanx = -linez * orbitDir;
            const tanz = linex * orbitDir;
            input.aimAngle = Math.atan2(tanz, tanx);
            input.turnIntent = Math.max(-1, Math.min(1, wrapAngle(input.aimAngle - (p.rot || 0)) / 0.5));
            input.moveZ = 1;
            input.boost = energyFull(p) && ((stretchTicks % 90) === 20 || (stretchTicks % 90) === 60);
            cmd.lineControl = true;
            cmd.lineLength = 0;
            return;
          }
        } else if (r.current === 'shove') {
          const scout = rescueEntity('scout');
          const wall = rescueEntity('asteroid');
          if (scout && wall) {
            if (!decided.shoveAim) {
              decided.shoveAim = true;
              ledger.recordDecision({
                situation: 'shove: push the scout from here or reposition behind him',
                options: [
                  { id: 'push_from_here', tradeoff: 'instant, rougher angle' },
                  { id: 'reposition', tradeoff: 'clean line into the rock, seconds lost' },
                ],
                chosen: 'reposition',
              });
            }
            // Take the firing position BEHIND the scout on the scout→asteroid line, then push.
            const dx = wall.pos.x - scout.pos.x;
            const dz = wall.pos.z - scout.pos.z;
            const dd = Math.hypot(dx, dz) || 1;
            const behind = { x: scout.pos.x - (dx / dd) * 220, z: scout.pos.z - (dz / dd) * 220 };
            const dBehind = dist(p.pos, behind);
            if (dBehind < 2400 && speedOf(p) > Math.max(12, dBehind / 25)) {
              // Same settle-brake math as the latch: bleed speed or the approach slides past.
              flyTo(input, behind, { arrive: 60 });
              input.moveZ = 0;
              input.brake = true;
              return;
            }
            const aligned = dBehind < 160;
            const toScout = Math.atan2(scout.pos.z - p.pos.z, scout.pos.x - p.pos.x);
            const err = Math.abs(wrapAngle(toScout - (p.rot || 0)));
            const dScout = dist(p.pos, scout.pos);
            if (!aligned) {
              flyTo(input, behind, { arrive: 60, boost: energyFull(p) });
              return;
            }
            // Hold fire when the escape pod sits downrange — killing it restages the beat.
            const podEnt = r.ids.pod != null ? state.entities.get(r.ids.pod) : null;
            let podDownrange = false;
            if (podEnt && podEnt.pos) {
              const pdx = podEnt.pos.x - p.pos.x;
              const pdz = podEnt.pos.z - p.pos.z;
              const pd = Math.hypot(pdx, pdz);
              if (pd < dScout) {
                const along = (pdx * Math.cos(toScout) + pdz * Math.sin(toScout)) / (pd || 1);
                const off = Math.abs(-pdx * Math.sin(toScout) + pdz * Math.cos(toScout));
                podDownrange = along > 0 && off < 60;
              }
            }
            flyTo(input, behind, { arrive: 60 });
            input.aimAngle = toScout;
            input.turnIntent = Math.max(-1, Math.min(1, wrapAngle(toScout - (p.rot || 0)) / 0.5));
            // Any impulse-class hit on the scout counts — fire whenever roughly on line.
            input.fire = err < 0.3 && dScout < 520 && energyReady(p) && !podDownrange;
            input.fireGroup = 1;
            if (process.env.STRANGER_PILOT_TRACE && (state.tick % 120) === 0) {
              console.log(`    [shove] t=${Math.round(state.simTime)} aligned=${aligned} err=${err.toFixed(2)} d=${Math.round(dScout)} fire=${input.fire} cap=${p.capMax ? Math.round((p.cap / p.capMax) * 100) : '?'}% scoutToWall=${Math.round(dd)}`);
            }
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
            // Run the pod home: cruise far out, then brake into the beacon so the trailing
            // pod crosses the beacon ring at a speed the tick reads can catch.
            const dB = dist(p.pos, beacon.pos);
            const toBx = beacon.pos.x - p.pos.x;
            const toBz = beacon.pos.z - p.pos.z;
            const toBd = Math.hypot(toBx, toBz) || 1;
            const vDot = (p.vel.x * toBx + p.vel.z * toBz) / ((speedOf(p) || 1) * toBd);
            if (vDot < 0.3) {
              // Overshot: kill the wrong-way momentum before re-approaching.
              input.brake = true;
              flyTo(input, beacon.pos, { arrive: 60 });
            } else if (dB > 700) {
              flyTo(input, beacon.pos, { arrive: 60, boost: energyFull(p) && speedOf(p) < 150 });
            } else {
              flyTo(input, beacon.pos, { arrive: 40 });
            }
            return;
          }
        }
      }

      // ── Missing-three (boost / stroke / well) ─────────────────────────────────────────
      const t3 = three();
      if (t3) {
        if (t3.current === 'boost') {
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
          const wp = waypoint();
          flyTo(input, wp ? wp.pos : { x: p.pos.x + Math.cos(p.rot || 0) * 400, z: p.pos.z + Math.sin(p.rot || 0) * 400 },
            { boost: true, arrive: 500 });
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
          input.actions.toggleClearingCone = true; // edge
          return;
        }
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
        const d = dist(p.pos, escapeFrom);
        if (heat() > 0.001 && d < 2000) {
          flyTo(input, {
            x: escapeFrom.x + (p.pos.x - escapeFrom.x) * 10,
            z: escapeFrom.z + (p.pos.z - escapeFrom.z) * 10,
          }, { arrive: 400, boost: true });
          return;
        }
        input.brake = true; // outside the ring: coast while the level drains
        return;
      }

      // ── The drill + economy beats, by what the HUD instruction says ───────────────────
      const line = (o && o.beatAction) || '';
      const wp = waypoint();

      if (process.env.STRANGER_PILOT_TRACE && (state.tick % 180) === 0) {
        const pl = p;
        console.log(`    [wp] t=${Math.round(state.simTime)} beat=${o && o.currentBeat} v=${Math.round(speedOf(pl))} line='${line.slice(0, 36)}' wp=${wp ? `${wp.label}:${wp.onboarding ? 'ob' : 'foreign'}` : 'none'} moveZ=${input.moveZ} brake=${input.brake} cap=${pl.capMax ? Math.round((pl.cap / pl.capMax) * 100) : '?'}%`);
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
          // Flyby lesson: meet the trainer head-on — relative speed and closing arm the lease.
          flyTo(input, wp.pos, { arrive: 20, boost: energyFull(p) });
          return;
        }
        if (/leaves scope|thrust away/i.test(line) && wp.pos) {
          // Disengage: the waypoint marks the trainer — fly directly AWAY from it.
          const awayPoint = { x: p.pos.x + (p.pos.x - wp.pos.x), z: p.pos.z + (p.pos.z - wp.pos.z) };
          flyTo(input, awayPoint, { arrive: 50, boost: energyFull(p) });
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
        if (/dock when close|helios/i.test(line)) {
          const stations = (state.entityIndex && state.entityIndex.dockStations) || [];
          const st = stations.filter((s) => s && s.alive)
            .sort((a, b) => dist(p.pos, a.pos) - dist(p.pos, b.pos))[0];
          if (st) {
            flyTo(input, st.pos, { arrive: DOCK_RANGE - 20, boost: true });
            if (dist(p.pos, st.pos) <= DOCK_RANGE + (st.radius || 0)) {
              services.dockAt(st);
              // The board: accept the recommended first contract.
              const boards = state.missions && state.missions.boards ? state.missions.boards : {};
              for (const board of Object.values(boards)) {
                for (const offer of (board && board.offers) || []) {
                  if (!offer || !offer.id) continue;
                  if (offer.source === 'firstTradeContract' && !decided.tookFirstTrade) {
                    decided.tookFirstTrade = true;
                    ledger.recordDecision({
                      situation: 'the board has one tracked delivery for a new hull',
                      options: [
                        { id: `take:${offer.id}`, tradeoff: 'a complete loop: haul, deliver, get paid' },
                        { id: 'decline', tradeoff: 'stay free-roam, no route marker' },
                      ],
                      chosen: `take:${offer.id}`,
                    });
                    bus.emit('ui:acceptMission', { missionId: offer.id });
                  }
                }
              }
            }
            return;
          }
          if (wp.pos) { flyTo(input, wp.pos, { arrive: 400, boost: true }); return; }
        }
        if (/pick the work/i.test(line)) {
          // Choice beat: the three offers read from the board; take one.
          const boards = state.missions && state.missions.boards ? state.missions.boards : {};
          const offers = [];
          for (const board of Object.values(boards)) {
            for (const offer of (board && board.offers) || []) {
              if (offer && offer.source === 'onboardingChoice') offers.push(offer);
            }
          }
          if (offers.length && !decided.tookChoice) {
            decided.tookChoice = true;
            offers.sort((a, b) => (Number(b.rewardCr) || 0) - (Number(a.rewardCr) || 0));
            const top = offers[0];
            const second = offers[1];
            ledger.recordDecision({
              situation: 'three kinds of work side by side: haul, bounty, survey',
              options: [
                { id: `take:${top.id}`, tradeoff: 'highest pay on the board' },
                second
                  ? { id: `take:${second.id}`, tradeoff: 'less pay, maybe safer work' }
                  : { id: 'skip', tradeoff: 'stay free-roam' },
              ],
              chosen: `take:${top.id}`,
            });
            bus.emit('ui:acceptMission', { missionId: top.id });
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
