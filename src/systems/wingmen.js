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
import { setEntityDoctrine } from '../ai/doctrine.js';

const WINGMAN_ARCHETYPE_BY_ORDER = {
  escort: 'brawler',   // stick near the player, engage nearby hostiles
  guard: 'brawler',    // hold near the guarded asset, defend it
  attack: 'pirate',    // aggressively seek and destroy hostiles
  mine: 'fleeing_trader', // mining wingmen stay defensive (no mining AI in combat; they escort defensively)
  idle: 'fleeing_trader', // idle = hang back, defensive only
};

export const wingmen = {
  name: 'wingmen',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers;
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
      if (player) this._applyWingOrder(fs, e, player, index, orderedFleet.length);
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
        if (e) { e.alive = false; this.bus.emit('entity:destroyed', { id: e.id }); }
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
        noFireResponseWindowS: 0.5,
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
    const followsPlayer = kind !== WING_ORDER.HOLD;
    const activityStale = commandChanged || !runtime || ai.activity !== runtime.activity
      || runtime.recipientIndex !== recipientIndex || runtime.recipientCount !== recipientCount
      || (followsPlayer && (runtime.playerX !== player.pos.x || runtime.playerZ !== player.pos.z));
    if (activityStale) {
      const activity = wingOrderActivity(fs.wingOrder, {
        playerPos: player.pos,
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
        recipientIndex,
        recipientCount,
      };
      this._orderRuntime.set(fs.id, runtime);
    }
    entity.data.wingmanOrder = kind;
    if (kind === WING_ORDER.ATTACK) {
      combat.targetId = fs.wingOrder.targetId;
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
