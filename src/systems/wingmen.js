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

    // Spawn wingmen when the player enters a sector (world emits sector:enter on entry).
    this.bus.on('sector:enter', () => this._spawnWingmen());
    // Despawn live wingmen when leaving a sector (they re-spawn at the next sector).
    this.bus.on('sector:leave', () => this._despawnWingmen());
    // Order changes from the AutomationPanel UI → update the live entity's AI archetype.
    // The UI emits ui:fleetOrder {shipId, order, kind, targetRef}; automation.handleOrder resolves
    // kind→order. We read the resolved order off the fleet entry after handleOrder runs (automation
    // is earlier in UPDATE_ORDER, so it has already applied the change by the time we tick).
    this.bus.on('ui:fleetOrder', (p) => { if (p) this._onFleetOrder(p); });
  },

  newGame() { /* wingmen are derived from state.automation.fleet — no separate state */ },

  update(dt, state) {
    if (state.mode !== 'flight') return;
    const fleet = state.automation && state.automation.fleet;
    if (!fleet || !fleet.length) return;

    // Sync live wingman hull% back to the fleet ledger, and detect deaths. We track the live entity
    // id on the fleet entry (fs._liveId) at spawn time; here we read it back.
    for (const fs of fleet) {
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

    for (const fs of fleet) {
      if (fs._liveId) continue; // already spawned this sector
      const spec = this._buildWingmanSpec(fs, player);
      if (!spec) continue;
      const e = this.helpers.spawnEntity(spec);
      fs._liveId = e.id;
      e.data.wingmanOf = fs.id; // link live entity → fleet ledger entry
      e.data.isWingman = true;  // flag for render/AI (friend marker, no bounty, no loot)
    }
    if (fleet.some((fs) => fs._liveId)) {
      this.bus.emit('toast', { text: fleet.length + ' wingman' + (fleet.length > 1 ? 's' : '') + ' deployed', kind: 'good', ttl: 3 });
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
      ai: { archetype },
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
  },
};
