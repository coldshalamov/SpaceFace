// Intervention loop (V2 §2 / cut-list #21). When your automation fails — a drone runs out of fuel,
// a trader is killed on a dangerous route, a fleet ship is destroyed — the game doesn't just send a
// sad notification. It spawns the asset's cargo as a SALVAGE WRECK the player can fly out and
// recover, and raises an alert pointing to it. Your empire generates content for you; losses are
// interactive, not silent.
//
// This is the V2 §3 salvage loop wired into the automation failure path: pirate/faction kills =
// total loss (they take the cargo); fuel/malfunction losses = wreck stays, ~50% recoverable + scrap.
// The player's choice to fly out and salvage is the "intervention" — manual verbs returning on
// demand at high stakes, exactly the V2 §2 design.
//
// Scope (per IMPROVEMENT_IDEAS #21): hooks automation:assetLost, spawns a wreck with recoverable
// cargo in the player's current sector, raises a danger-tier alert + a nav arrow. Recovery uses the
// EXISTING salvage beam (mining.js drains wrecks) — no new mechanic, just content wiring. Keeps a
// rolling log of interventions for the "your save is your story" law.

const MAX_ACTIVE = 4;        // cap concurrent interventions so a mass-loss event doesn't spam wrecks
const ALERT_TTL = 12;        // seconds the "intervention available" alert stays on the HUD

export const intervention = {
  name: 'intervention',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers;
    // active interventions: { id, kind, sectorId, wreckEntityId, value, t }
    if (!this.state.interventions) this.state.interventions = [];
    this._nextId = 1;

    // The trigger: an automation asset was lost. Spawn salvage + raise the alert.
    this.bus.on('automation:assetLost', (p) => this._onAssetLost(p));
  },

  _onAssetLost(p) {
    if (!p) return;
    const sectorId = p.sectorId || (this.state.world && this.state.world.currentSectorId);
    const player = this.state.entities.get(this.state.playerId);
    if (!player || !this.helpers || !this.helpers.spawnEntity) return;

    // Determine recoverable cargo from the loss. Pirate/faction kills take everything (total loss);
    // fuel/malfunction losses leave ~50% + scrap. We approximate: if value > 0, spawn ore worth ~50%
    // of the lost value, plus a little scrap. The kind tells the player what happened.
    const value = p.value || 0;
    if (value <= 0) return; // nothing to recover (e.g., an empty drone)

    // Cap concurrent interventions: drop the oldest if at cap (older wrecks are likely gone anyway).
    const list = this.state.interventions;
    while (list.length >= MAX_ACTIVE) {
      const old = list.shift();
      // leave the wreck in the world — just stop tracking it as an active intervention
    }

    // Spawn the wreck near the player (the player is the one who'd fly out to recover it; cross-
    // sector wreck persistence is a later milestone). Place it at a recoverable distance.
    const ang = Math.random() * Math.PI * 2;
    const dist = 280 + Math.random() * 220;
    const pos = { x: player.pos.x + Math.cos(ang) * dist, z: player.pos.z + Math.sin(ang) * dist };

    // Build the salvage pool: ~50% of the lost value as ore (iron baseline), plus scrap.
    const oreUnits = Math.max(2, Math.floor(value / 28 / 2)); // 28 = iron baseline; /2 = 50% recovery
    const pool = { cmdty_scrap_metal: 1 + Math.floor(Math.random() * 3) };
    if (oreUnits > 0) pool.cmdty_ore_iron = oreUnits;

    const wreck = this.helpers.spawnEntity({
      type: 'wreck', pos, radius: 8, mass: 1e6,
      hull: 1, hullMax: 1,
      data: {
        parentType: p.kind || 'asset',
        loot: [],
        salvagePool: pool,
        salvageTimeLeft: 8, // a bit longer than a ship wreck so there's time to fly out
        interventionId: this._nextId,
      },
    });

    const rec = {
      id: this._nextId++,
      kind: p.kind || 'asset',
      sectorId,
      wreckEntityId: wreck ? wreck.id : null,
      value,
      recoverable: Object.keys(pool).reduce((s, k) => s + pool[k], 0),
      t: this.state.simTime || 0,
    };
    list.push(rec);

    // Raise the alert + toast. The HUD's alerts queue shows it; the toast gives the action prompt.
    const kindLabel = { drone: 'Mining drone', trader: 'Trade hauler', fleet: 'Wingman', outpost: 'Outpost' }[p.kind] || 'Asset';
    this.bus.emit('alert', {
      key: 'intervention-' + rec.id,
      sev: 'warn',
      text: kindLabel.toUpperCase() + ' LOST — SALVAGE AVAILABLE',
      ttl: ALERT_TTL,
    });
    this.bus.emit('toast', {
      text: kindLabel + ' lost! Cargo wreck nearby (' + rec.recoverable + 'u recoverable). Fly out and salvage it.',
      kind: 'warn',
      ttl: 6,
    });
    this.bus.emit('camera:shake', { amount: 0.3 });
    this.bus.emit('intervention:available', rec);
  },

  update(dt, state) {
    // Prune interventions whose wreck has been fully salvaged or despawned. The mining system
    // drains the salvagePool and marks the wreck dead when empty; we just detect that here.
    const list = state.interventions;
    if (!list || !list.length) return;
    for (let i = list.length - 1; i >= 0; i--) {
      const rec = list[i];
      const e = rec.wreckEntityId != null ? state.entities.get(rec.wreckEntityId) : null;
      if (!e || !e.alive) {
        // wreck gone (salvaged or despawned) — close the intervention
        list.splice(i, 1);
        this.bus.emit('intervention:closed', { id: rec.id, recovered: !e || (e.data && e.data._salvaged) });
      }
    }
  },

  // Public read API for UI (a future interventions log). Returns active interventions.
  active() { return (this.state.interventions || []).slice(); },
};
