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
        return;
      }

      const hullFrac = (p.hull || 0) / (p.hullMax || 1);
      if (hullFrac < 0.45) mode = 'dock';

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

      // No enemies: loot nearby salvage, else patrol live rocks; when the sector stays quiet,
      // roam up the danger ladder (starter sectors are protected — hostiles live deeper in).
      state.player.targetId = null;
      const loot = nearest(state, (e) => e.alive && (e.type === 'pickup' || e.type === 'cargo'
        || e.type === 'lootShard' || (e.data && e.data.salvageable)), 500);
      if (loot) { steerTo(state, input, loot.entity.pos, { arrive: 40 }); return; }
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
