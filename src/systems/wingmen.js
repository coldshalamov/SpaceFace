// Wingman system (goal P1-8) — materializes the player's fleet ledger as LIVE flyable entities.
//
// Before P1-8, fleet ships were passive ledger entries (state.automation.fleet): they had hp/hullPct
// + an order string, took damage via automation.onHitAsset, and could be lost — but they NEVER
// spawned as live objects and the player couldn't see or command them in combat. The tech tree ends
// in "Flagship Command", making this a major unfulfilled promise.
//
// This system closes the gap: on sector enter, each fleet entry spawns as a real team-0 (player-
// aligned) ship entity near the player, driven by the existing AI stack (it picks team-1 hostiles as
// targets automatically). The fleet order (escort/guard/attack) maps to an AI archetype + intent.
// Live hull syncs back to the ledger each tick; on death, the existing onHitAsset path removes the
// fleet entry (so the ledger stays the source of truth). The squad/formation AI already handles
// team-0 wings — wingmen just join it.

import { makeShipEntitySpec } from './ships.js';
import {
  WING_ORDER,
  WING_ORDER_LIMITS,
  legacyFleetOrderFor,
  normalizeLiveWingOrder,
  wingOrderActivity,
} from '../data/wingOrders.js';
import { BEAMS } from '../data/mining.js';
import { setEntityDoctrine } from '../ai/doctrine.js';

// ── Mining wingmen (fleet order 'mine') ──────────────────────────────────────────────
// A wingman on mine order is a working extractor, not a follower: it prospects the
// nearest live rock inside MINE_PROSPECT_WU of the player (or the rock the player has
// targeted), flies a SCREEN guard ring anchored ON the rock with DEFENSIVE roe, and
// holds the live mining.applyMining extractor while inside beam range. Ore ejects as
// ordinary magnet pickups — the player scoops what the wingman cuts. No second
// extractor, no cargo writes here; mining.js stays the single owner of extraction.
const WINGMAN_MINE_BEAM = BEAMS.find((row) => row && row.id === 'beam_mk1') || {
  dps: 18, range: 240, heatMax: 100, heatRate: 22, coolRate: 55,
};
export const WINGMAN_MINE_PROSPECT_WU = 1400;
export const WINGMAN_MINE_LEASH_WU = 1800;
export const WINGMAN_MINE_ANCHOR_LEASH = 260;
const WINGMAN_MINE_TOAST_COOLDOWN_S = 60;

function wingmanMineableRock(rock) {
  if (!rock || rock.alive === false || rock.type !== 'asteroid' || !rock.pos) return false;
  const d = rock.data || {};
  if (d.siteAnchored || d.opticMaterial || d.isChunk) return false;
  if (d.oreHP != null && !(d.oreHP > 0)) return false;
  return true;
}

function ensureWingmanMineBeam(entity) {
  const data = entity.data || (entity.data = {});
  if (data.miningBeam && Number(data.miningBeam.dps) > 0) return data.miningBeam;
  data.miningBeam = {
    tierId: 'beam_mk1',
    dps: WINGMAN_MINE_BEAM.dps,
    range: WINGMAN_MINE_BEAM.range,
    directToCargo: false,
    heat: 0,
    heatMax: WINGMAN_MINE_BEAM.heatMax,
    heatRate: WINGMAN_MINE_BEAM.heatRate,
    coolRate: WINGMAN_MINE_BEAM.coolRate,
  };
  return data.miningBeam;
}

const WINGMAN_ARCHETYPE_BY_ORDER = {
  escort: 'brawler',   // stick near the player, engage nearby hostiles
  guard: 'brawler',    // hold near the guarded asset, defend it
  attack: 'pirate',    // aggressively seek and destroy hostiles
  mine: 'fleeing_trader', // mining wingmen stay defensive (no mining AI in combat; they escort defensively)
  idle: 'fleeing_trader', // idle = hang back, defensive only
};

// Asset-guard intercept: a guard answers hostiles closing on its asset (team-1 hulls,
// or any hull actively targeting the asset), leashed to the asset — never a pursuit.
export const GUARD_INTERCEPT_WU = 700;
export const GUARD_INTERCEPT_LEASH_WU = 1000;
export const GUARD_INTERCEPT_RANGE_WU = 180;

export const wingmen = {
  name: 'wingmen',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers;
    this.registry = ctx.registry || null;
    this._mineToastT = new Map();
    this._fleetRef = null;
    this._fleetSourceRows = [];
    this._fleetSourceIds = [];
    this._orderedFleet = [];
    this._orderRuntime = new Map();

    // Spawn wingmen when the player enters a sector (world emits sector:enter on entry).
    // _spawnWingmen skips fleet entries that already have a live _liveId (continuous handoff).
    this.bus.on('sector:enter', () => this._spawnWingmen());
    // Canonical seam is sector:exit (world never emits sector:leave). Continuous free-flight
    // membership preserves live wingmen; hard jump/load boundaries despawn and re-spawn on enter.
    this.bus.on('sector:exit', (p) => {
      if (p && (p.continuous || p.noTeleport)) return;
      this._despawnWingmen();
    });
    // Order changes from the AutomationPanel UI → update the live entity's AI archetype.
    // The UI emits ui:fleetOrder {shipId, order, kind, targetRef}; automation.handleOrder resolves
    // kind→order. We read the resolved order off the fleet entry after handleOrder runs (automation
    // is earlier in UPDATE_ORDER, so it has already applied the change by the time we tick).
    this.bus.on('ui:fleetOrder', (p) => { if (p) this._onFleetOrder(p); });
    this.bus.on('wingOrder:accepted', (p) => { if (p) this._onWingOrderAccepted(p); });
  },

  newGame() {
    this._fleetRef = null;
    this._fleetSourceRows.length = 0;
    this._fleetSourceIds.length = 0;
    this._orderedFleet.length = 0;
    this._orderRuntime.clear();
    if (this._mineToastT) this._mineToastT.clear();
  },

  update(dt, state) {
    if (state.mode !== 'flight') return;
    const fleet = state.automation && state.automation.fleet;
    if (!fleet || !fleet.length) return;

    // Sync live wingman hull% back to the fleet ledger, and detect deaths. We track the live entity
    // id on the fleet entry (fs._liveId) at spawn time; here we read it back.
    const orderedFleet = this._orderedFleetFor(fleet);
    const player = state.entities.get(state.playerId);
    for (let index = 0; index < orderedFleet.length; index++) {
      const fs = orderedFleet[index];
      if (!fs._liveId) continue;
      const e = state.entities.get(fs._liveId);
      if (!e || !e.alive) {
        // Wingman died in combat. Route through the existing onHitAsset path so the ledger stays
        // consistent + the LOST/asset-lost flow fires (same as the pre-P1-8 passive path).
        fs.hp = 0; fs.hullPct = 0;
        this.bus.emit('combat:hitAsset', { assetKind: 'fleet', assetId: fs.id, dmg: 9999, killerId: null });
        fs._liveId = null;
        continue;
      }
      if (player) {
        if (fs.order === 'mine') this._applyMiningOrder(fs, e, player, dt, state);
        else this._applyWingOrder(fs, e, player, index, orderedFleet.length);
      }
      // Sync hull% so the AutomationPanel health bar reflects live combat damage.
      fs.hullPct = e.hullMax > 0 ? Math.max(0, e.hull / e.hullMax) : 0;
      fs.hp = fs.hullPct;
      fs.status = e.alive ? (fs.order || 'escort') : 'lost';
    }
  },

  _spawnWingmen() {
    const state = this.state;
    const fleet = state.automation && state.automation.fleet;
    if (!fleet || !fleet.length) return;
    const player = state.entities.get(state.playerId);
    if (!player) return;

    let spawned = 0;
    const ordered = this._orderedFleetFor(fleet);
    for (const fs of fleet) {
      if (fs._liveId) continue; // already live (continuous handoff or same-sector re-enter)
      const spec = this._buildWingmanSpec(fs, player);
      if (!spec) continue;
      const e = this.helpers.spawnEntity(spec);
      fs._liveId = e.id;
      e.data.wingmanOf = fs.id; // link live entity → fleet ledger entry
      e.data.isWingman = true;  // flag for render/AI (friend marker, no bounty, no loot)
      this._applyWingOrder(fs, e, player, ordered.indexOf(fs), ordered.length);
      spawned++;
    }
    // Toast only when new wingmen materialize — continuous membership re-entry must not re-bark.
    if (spawned > 0) {
      this.bus.emit('toast', { text: spawned + ' wingman' + (spawned > 1 ? 's' : '') + ' deployed', kind: 'good', ttl: 3 });
    }
  },

  _despawnWingmen() {
    const state = this.state;
    const fleet = state.automation && state.automation.fleet;
    if (!fleet) return;
    for (const fs of fleet) {
      if (fs._liveId && state.entities) {
        const e = state.entities.get(fs._liveId);
        // Core lifetimeSweep owns entity removal, index/allocator bookkeeping, presentation, and
        // the queued entity:destroyed receipt. Wingmen only mark the body dead and clear ledger
        // membership here so the canonical sweep publishes exactly one lifecycle notification.
        if (e) e.alive = false;
      }
      fs._liveId = null;
    }
  },

  _buildWingmanSpec(fs, player) {
    const archetype = WINGMAN_ARCHETYPE_BY_ORDER[fs.order] || 'brawler';
    // Spawn in a loose formation near the player (offset by fleet index so wingmen don't overlap).
    const idx = (this.state.automation.fleet.indexOf(fs)) || 0;
    const ang = idx * (Math.PI * 2 / Math.max(1, this.state.automation.fleet.length));
    const r = 80 + idx * 20;
    const pos = { x: player.pos.x + Math.cos(ang) * r, z: player.pos.z + Math.sin(ang) * r };
    const spec = makeShipEntitySpec(fs.shipDefId || fs.defId, {
      team: 0,                  // player-aligned — the AI auto-targets team-1 hostiles
      factionId: 'faction_scn', // Concord-aligned (lawful escort)
      pos,
      ai: {
        archetype,
        squadId: 'player_wing',
        motive: 'player_command',
        engagementTrigger: 'player_order',
        zoneId: this.state.world && this.state.world.currentSectorId || 'player_wing',
        approachTelegraph: 'wing_command_ack',
        noFireResponseWindowS: 1,
        combatDoctrineId: 'interceptor_flyby',
      },
    });
    // Wingmen carry a basic weapon loadout from their ship def (makeShipEntitySpec builds it from
    // the hull's default fittings). They don't use the player's module inventory.
    spec.data = spec.data || {};
    spec.data.isWingman = true;
    spec.data.wingmanOrder = fs.order || 'escort';
    spec.data.bountyCr = 0;    // no bounty for killing a wingman (player-owned)
    spec.data.lootTableId = null;
    return spec;
  },

  // Order change from the UI → update the live entity's AI archetype so it behaves differently.
  // automation.handleOrder resolves the UI kind (orderEscort/orderMine/etc.) to a concrete order on
  // the fleet entry; we read that resolved order off fs.order (automation runs earlier in the event
  // dispatch, so it has already applied the change before this handler fires).
  _onFleetOrder(p) {
    const state = this.state;
    const fleet = state.automation && state.automation.fleet;
    if (!fleet || !p || !p.shipId) return;
    const fs = fleet.find((x) => x.id === p.shipId);
    if (!fs || !fs._liveId) return;
    const e = state.entities.get(fs._liveId);
    if (!e || !e.data) return;
    const order = fs.order || 'escort';
    const archetype = WINGMAN_ARCHETYPE_BY_ORDER[order] || 'brawler';
    e.data.ai = e.data.ai || {};
    e.data.ai.archetype = archetype;
    e.data.wingmanOrder = order;
    if (order !== 'mine') {
      fs._mineRockId = null;
      e.data.wingmanMining = null;
      this._orderRuntime.delete(fs.id);
    }
    // "Attack my target" (radial): point the live wing's combat target at the player's selected
    // target so the archetype's targeting locks onto it directly, not just the nearest hostile.
    if (order === 'attack') {
      const targetId = fs.targetRef && fs.targetRef.refId != null ? fs.targetRef.refId : null;
      if (targetId != null) {
        e.data.combat = e.data.combat || {};
        e.data.combat.targetId = targetId;
      }
    }
  },

  _onWingOrderAccepted(p) {
    const accepted = new Set(p.acceptedRecipientIds || []);
    if (!accepted.size) return;
    const state = this.state;
    const fleet = state.automation && state.automation.fleet || [];
    const ordered = this._orderedFleetFor(fleet);
    const player = state.entities.get(state.playerId);
    if (!player) return;
    for (let index = 0; index < ordered.length; index++) {
      const fs = ordered[index];
      if (!accepted.has(fs.id) || fs._liveId == null) continue;
      const entity = state.entities.get(fs._liveId);
      if (entity && entity.alive !== false) this._applyWingOrder(fs, entity, player, index, ordered.length);
    }
  },

  _applyWingOrder(fs, entity, player, recipientIndex, recipientCount) {
    const ai = entity.data.ai || (entity.data.ai = {});
    const combat = entity.data.combat || (entity.data.combat = {});
    const intent = entity.data.intent || (entity.data.intent = {});
    if (!validWingOrder(fs.wingOrder)) {
      fs.wingOrder = normalizeLiveWingOrder(
        fs.wingOrder,
        this.state.world && this.state.world.currentSectorId,
        fs.order,
      );
    }
    let runtime = this._orderRuntime.get(fs.id);
    const commandChanged = !runtime || runtime.orderRef !== fs.wingOrder || runtime.entityId !== entity.id;

    if (ai.forceFlee === true || ai.fsm === 'flee') {
      intent.fire = false;
      intent.fireGroup = null;
      combat.targetId = null;
      return;
    }

    if (fs.wingOrder.kind === WING_ORDER.ATTACK) {
      const target = this.state.entities.get(fs.wingOrder.targetId);
      const dx = target && target.pos ? target.pos.x - player.pos.x : Infinity;
      const dz = target && target.pos ? target.pos.z - player.pos.z : Infinity;
      const wingDx = entity.pos.x - player.pos.x;
      const wingDz = entity.pos.z - player.pos.z;
      if (!target || target.alive === false
        || Math.hypot(dx, dz) > WING_ORDER_LIMITS.attackLeashWu
        || Math.hypot(wingDx, wingDz) > WING_ORDER_LIMITS.attackLeashWu) {
        this._convertToRegroup(fs, entity, target && target.alive !== false ? 'leash' : 'target_lost');
      }
    }

    const kind = fs.wingOrder.kind;
    // Asset guard: SCREEN with a live target rings THAT body (the raid math already
    // counts guard/escort+targetRef as protection — the hull now shows up for it).
    // A dead, vanished, or unguardable target falls back to screening the player.
    const guard = kind === WING_ORDER.SCREEN ? guardAssetFor(this.state, fs, entity.id) : null;
    const guardAnchor = guard && guard.pos ? { x: guard.pos.x, z: guard.pos.z } : null;
    const intercept = guardAnchor ? guardThreatFor(this.state, guard, entity.id) : null;
    const interceptId = intercept ? intercept.id : null;
    const followsPlayer = kind !== WING_ORDER.HOLD && !guardAnchor;
    const followsGuard = !!guardAnchor;
    const activityStale = commandChanged || !runtime || ai.activity !== runtime.activity
      || runtime.recipientIndex !== recipientIndex || runtime.recipientCount !== recipientCount
      || (followsPlayer && (runtime.playerX !== player.pos.x || runtime.playerZ !== player.pos.z))
      || (followsGuard && (runtime.guardId !== guard.id || runtime.guardX !== guard.pos.x || runtime.guardZ !== guard.pos.z))
      || (!followsGuard && runtime && runtime.guardId != null)
      || (guardAnchor && runtime.interceptId !== interceptId);
    if (activityStale) {
      const activity = intercept ? {
        kind: 'attack_run',
        reason: 'wing_order:guard_intercept',
        anchor: { x: guardAnchor.x, z: guardAnchor.z },
        leashRadius: GUARD_INTERCEPT_LEASH_WU,
        preferredRange: GUARD_INTERCEPT_RANGE_WU,
        targetId: interceptId,
        startedTick: Number.isInteger(this.state.tick) ? this.state.tick : 0,
      } : wingOrderActivity(fs.wingOrder, {
        playerPos: player.pos,
        anchorPos: guardAnchor,
        sectorId: this.state.world && this.state.world.currentSectorId,
        recipientIndex,
        recipientCount,
      });
      setEntityDoctrine(entity, {
        activity,
        roe: kind === WING_ORDER.ATTACK ? 'weapons_free'
          : kind === WING_ORDER.SCREEN ? 'defensive' : 'hold_fire',
      });
      ai.wingOrderCommandId = fs.wingOrder.commandId;
      runtime = {
        orderRef: fs.wingOrder,
        entityId: entity.id,
        activity: ai.activity,
        playerX: player.pos.x,
        playerZ: player.pos.z,
        guardId: guard ? guard.id : null,
        guardX: guardAnchor ? guardAnchor.x : null,
        guardZ: guardAnchor ? guardAnchor.z : null,
        interceptId,
        recipientIndex,
        recipientCount,
      };
      this._orderRuntime.set(fs.id, runtime);
    }
    entity.data.wingmanOrder = kind;
    entity.data.wingmanGuardId = guard ? guard.id : null;
    if (kind === WING_ORDER.ATTACK) {
      combat.targetId = fs.wingOrder.targetId;
    } else if (intercept) {
      combat.targetId = interceptId;
    } else {
      combat.targetId = null;
      if (commandChanged || kind === WING_ORDER.HOLD || kind === WING_ORDER.REGROUP) {
        intent.fire = false;
        intent.fireGroup = null;
      }
    }
  },

  _convertToRegroup(fs, entity, reason) {
    const previousCommandId = fs.wingOrder && fs.wingOrder.commandId || null;
    fs.wingOrder = normalizeLiveWingOrder({
      kind: WING_ORDER.REGROUP,
      commandId: previousCommandId,
      issuedTick: Number.isInteger(this.state.tick) ? this.state.tick : 0,
    }, this.state.world && this.state.world.currentSectorId);
    fs.order = legacyFleetOrderFor(WING_ORDER.REGROUP);
    fs.targetRef = null;
    fs.status = WING_ORDER.REGROUP;
    if (entity && entity.data) {
      const combat = entity.data.combat || (entity.data.combat = {});
      const intent = entity.data.intent || (entity.data.intent = {});
      combat.targetId = null;
      intent.fire = false;
      intent.fireGroup = null;
    }
    this.bus.emit('wingOrder:converted', {
      recipientId: fs.id,
      from: WING_ORDER.ATTACK,
      to: WING_ORDER.REGROUP,
      reason,
      commandId: previousCommandId,
    });
  },

  // ── Mining order ──────────────────────────────────────────────────────────────
  // Prospect → fly the rock → cut. The doctrine anchor moves WITH the rock: SCREEN
  // flies the formation slot and DEFENSIVE answers nearby hostiles, so a mining
  // wingman works until trouble arrives, deals with it like an escort, and the
  // anchor pulls it back to the face when the sky clears.
  _applyMiningOrder(fs, entity, player, dt, state) {
    const rock = this._mineTargetRock(fs, entity, player, state);
    if (!rock) {
      if (entity.data) entity.data.wingmanMining = null;
      fs._mineRockId = null;
      this._mineToast(fs, 'norock', 'No rock in reach — holding formation.');
      this._applyWingOrder(fs, entity, player, 0, 1);
      return;
    }
    if (fs._mineRockId !== rock.id) {
      fs._mineRockId = rock.id;
      setEntityDoctrine(entity, {
        activity: {
          kind: 'screen',
          reason: 'wing_order:mine',
          anchor: { x: rock.pos.x, z: rock.pos.z },
          leashRadius: WINGMAN_MINE_ANCHOR_LEASH,
          preferredRange: WINGMAN_MINE_ANCHOR_LEASH,
          targetId: null,
          startedTick: Number.isInteger(state.tick) ? state.tick : 0,
        },
        roe: 'defensive',
      });
      this._orderRuntime.delete(fs.id);
      this._mineToast(fs, 'rock', 'Stripping rock — scoop what falls.', true);
    }
    const ai = entity.data && entity.data.ai;
    if (ai && (ai.forceFlee === true || ai.fsm === 'flee')) {
      if (entity.data) entity.data.wingmanMining = null;
      this._mineToast(fs, 'flee', 'Breaking off — trouble inbound.');
      return;
    }
    const mining = this.registry && this.registry.get && this.registry.get('mining');
    const beam = ensureWingmanMineBeam(entity);
    const dist = Math.hypot(entity.pos.x - rock.pos.x, entity.pos.z - rock.pos.z);
    if (mining && typeof mining.applyMining === 'function'
      && dist <= (beam.range || 0) + (rock.radius || 0)) {
      mining.applyMining(rock.id, beam.dps || 0, dt, entity.id);
      if (entity.data) entity.data.wingmanMining = rock.id;
      this._mineHoldFullNote(fs, state);
    } else if (entity.data) {
      entity.data.wingmanMining = null;
    }
  },

  // The player's marked rock wins; otherwise the nearest live face inside the
  // prospect ring. Deterministic: distance, then rock id — no rng draws.
  // Sticky: a working wingman keeps its face while it is mineable and leashed, so a
  // transiting player does not flick the crew across the belt every tick. Spread: two
  // mining wings do not stack on one rock unless the player marks it (focus fire).
  _mineTargetRock(fs, entity, player, state) {
    const targetId = state.player && state.player.targetId;
    if (targetId != null && state.entities) {
      const marked = state.entities.get(targetId);
      if (wingmanMineableRock(marked) && this._rockInLeash(marked, player)) return marked;
    }
    if (fs._mineRockId != null && state.entities) {
      const held = state.entities.get(fs._mineRockId);
      if (wingmanMineableRock(held) && this._rockInLeash(held, player)) return held;
    }
    const claimed = this._mineClaimedRocks(fs, state);
    const index = state.entityIndex;
    const indexed = index && index.__spacefaceEntityIndexV1 === true
      && index.ready === true
      && index._indexedIds instanceof Set
      && state.entities.size === index._indexedIds.size;
    const list = (indexed && index.asteroids) || state.entityList || [];
    let best = null;
    let bestD2 = Infinity;
    let bestId = '';
    for (let i = 0; i < list.length; i++) {
      const rock = list[i];
      if (!wingmanMineableRock(rock)) continue;
      if (claimed && claimed.has(rock.id)) continue;
      const dx = rock.pos.x - player.pos.x;
      const dz = rock.pos.z - player.pos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 > WINGMAN_MINE_PROSPECT_WU * WINGMAN_MINE_PROSPECT_WU) continue;
      const id = String(rock.id);
      if (d2 < bestD2 || (d2 === bestD2 && id < bestId)) {
        best = rock;
        bestD2 = d2;
        bestId = id;
      }
    }
    return best;
  },

  _mineClaimedRocks(self, state) {
    const fleet = state.automation && state.automation.fleet;
    if (!Array.isArray(fleet)) return null;
    const claimed = new Set();
    for (const row of fleet) {
      if (row && row !== self && row.order === 'mine' && row._mineRockId != null) {
        claimed.add(row._mineRockId);
      }
    }
    return claimed;
  },

  _rockInLeash(rock, player) {
    if (!rock || !rock.pos || !player || !player.pos) return false;
    return Math.hypot(rock.pos.x - player.pos.x, rock.pos.z - player.pos.z) <= WINGMAN_MINE_LEASH_WU;
  },

  _mineToast(fs, key, text, force = false) {
    if (!this.bus || typeof this.bus.emit !== 'function') return;
    const now = Number(this.state && this.state.simTime) || 0;
    const mapKey = (fs && fs.id) + ':' + key;
    const last = this._mineToastT ? this._mineToastT.get(mapKey) : null;
    if (!force && Number.isFinite(last) && now - last < WINGMAN_MINE_TOAST_COOLDOWN_S) return;
    if (this._mineToastT) this._mineToastT.set(mapKey, now);
    const name = (fs && (fs.customName || fs.name)) || 'Wingman';
    try {
      this.bus.emit('toast', { text: name + ': ' + text, kind: 'info', ttl: 4 });
    } catch { /* advisory only */ }
  },

  _mineHoldFullNote(fs, state) {
    const cargo = state.player && state.player.cargo;
    if (!cargo || !Number.isFinite(cargo.capVolume) || cargo.capVolume <= 0) return;
    if ((cargo.usedVolume || 0) < cargo.capVolume) return;
    this._mineToast(fs, 'full', "Hold's full — the cut stays on the ground.", false);
  },

  _orderedFleetFor(fleet) {
    let stable = this._fleetRef === fleet && this._fleetSourceRows.length === fleet.length;
    if (stable) {
      for (let index = 0; index < fleet.length; index++) {
        if (this._fleetSourceRows[index] !== fleet[index] || this._fleetSourceIds[index] !== fleet[index].id) {
          stable = false;
          break;
        }
      }
    }
    if (stable) return this._orderedFleet;
    this._fleetRef = fleet;
    this._fleetSourceRows = fleet.slice();
    this._fleetSourceIds = fleet.map((row) => row && row.id);
    this._orderedFleet = fleet.slice().sort((a, b) => String(a && a.id).localeCompare(String(b && b.id)));
    const liveIds = new Set(this._fleetSourceIds);
    for (const id of this._orderRuntime.keys()) if (!liveIds.has(id)) this._orderRuntime.delete(id);
    return this._orderedFleet;
  },
};

function validWingOrder(order) {
  return !!order && (order.kind === WING_ORDER.ATTACK || order.kind === WING_ORDER.SCREEN
    || order.kind === WING_ORDER.HOLD || order.kind === WING_ORDER.REGROUP);
}

// Bodies a guard order can hold: crewed hulls, stations, and rocks (claim protection).
// Anything else — pickups, projectiles, the player, the wingman itself — is not an asset.
const GUARDABLE_TYPES = new Set(['ship', 'drone', 'station', 'asteroid']);

function guardAssetFor(state, fs, selfId) {
  const refId = fs && fs.targetRef && fs.targetRef.refId;
  if (refId == null) return null;
  if (!state || !state.entities || typeof state.entities.get !== 'function') return null;
  const target = state.entities.get(refId);
  if (!target || target.alive === false || !target.pos) return null;
  if (target.id === selfId || target.id === state.playerId) return null;
  if (!GUARDABLE_TYPES.has(target.type)) return null;
  return target;
}

// Nearest hostile closing on the guarded asset: team-1 hulls, or any hull actively
// targeting it. Deterministic (distance, then id) like the mining prospect ring.
function guardThreatFor(state, asset, selfId) {
  const index = state && state.entityIndex;
  const list = index && index.__spacefaceEntityIndexV1 === true && index.ready === true
    && Array.isArray(index.shipLike)
    ? index.shipLike
    : state && state.entityList;
  if (!Array.isArray(list) || !asset || !asset.pos) return null;
  let best = null;
  let bestD2 = Infinity;
  let bestId = '';
  const range2 = GUARD_INTERCEPT_WU * GUARD_INTERCEPT_WU;
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (!e || e.alive === false || (e.type !== 'ship' && e.type !== 'drone')) continue;
    if (e.id === selfId || e.id === asset.id || e.id === state.playerId) continue;
    const dx = e.pos.x - asset.pos.x;
    const dz = e.pos.z - asset.pos.z;
    const d2 = dx * dx + dz * dz;
    if (d2 > range2) continue;
    const combat = e.data && e.data.combat;
    const engaging = combat && combat.targetId === asset.id;
    if (e.team !== 1 && !engaging) continue;
    const id = String(e.id);
    if (d2 < bestD2 || (d2 === bestD2 && id < bestId)) {
      best = e;
      bestD2 = d2;
      bestId = id;
    }
  }
  return best;
}
