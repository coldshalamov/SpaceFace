// W-CAST-HANDS (row 542, 03 §4.1): Wex's smell ticket — a findable object at Helios Bay 7.
// The empty rack is the place (poi_helios_bay7, the cold locker); the ticket is the slip the
// last hauler never collected, parked loose beside it. No machine-person, no voice budget — a
// physical pickup that the ordinary magnet collects, filing one comms line and a story flag.
//
// Event-driven only: sync on sector entry / save restore / new game; collection rides the
// shared pickup pipeline (mining magnet → pickup:collected → legacy full-consume, since cargo
// claims only ore/cargo/module kinds). The flag lives in state.story.flags, which the save
// envelope serializes wholesale — no subsystem payload, no schema bump.
import { deepFreeze } from '../data/encounters/catalog.js';
import { deferSectorEnterMaterialization } from '../core/sectorEnterDefer.js';

export const WEX_TICKET = deepFreeze({
  flagId: 'wex_ticket_found',
  kind: 'wex_smell_ticket',
  sectorId: 'sector_helios_prime',
  // Beside the Bay 7 cold locker (poi_helios_bay7, sectorAnchors.js) — off the rack, in reach of
  // the pickup magnet, and not docked inside the landmark's own body.
  pos: { x: 1428, z: -296 },
  radius: 2.4,
  collectLine: 'HELIOS MAINTENANCE — Bay 7 ticket recovered. One uncollected load of solvent-washed coolant hose, paid and abandoned. Wex stamped it nine years ago. The rack has been empty since.',
});

export function wexTicketSpec() {
  return {
    type: 'pickup', pos: { ...WEX_TICKET.pos }, vel: { x: 0, z: 0 },
    radius: WEX_TICKET.radius, mass: 0.4, collides: true,
    data: {
      kind: WEX_TICKET.kind, amount: 1, wexTicket: true,
      scanLabel: 'Scent ticket · Bay 7',
      scannerSignalKind: 'artifact',
    },
  };
}

export function createWexTicket() {
  return {
    name: 'wexTicket',
    init(ctx) {
      this.state = ctx.state; this.bus = ctx.bus; this.helpers = ctx.helpers || {};
      this._unsubs = [];
      const on = (event, fn) => {
        const off = this.bus?.on(event, fn); if (typeof off === 'function') this._unsubs.push(off);
      };
      // The world entity map is still being swapped during sector:enter — the spawn defers into
      // the cook's FIFO and materializes once the sector is actually mounted.
      on('sector:enter', (p) => {
        if (deferSectorEnterMaterialization(this.state, p, this._cookProvider)) return;
        this._sync();
      });
      this._cookProvider = () => { this._sync(); };
      (this.helpers.sectorCookProviders || (this.helpers.sectorCookProviders = []))
        .push(this._cookProvider);
      on('save:loaded', () => this._sync());
      on('game:newGame', () => this._sync());
      on('pickup:collected', (p) => this._collected(p));
      this._sync();
    },
    destroy() {
      for (const off of this._unsubs || []) off();
      this._unsubs = [];
      const providers = this.helpers?.sectorCookProviders;
      if (Array.isArray(providers)) {
        const i = providers.indexOf(this._cookProvider);
        if (i >= 0) providers.splice(i, 1);
      }
      this._removeOwned();
    },
    _flag() {
      const flags = this.state?.story?.flags;
      return flags ? flags : (this.state.story ? (this.state.story.flags = {}) : null);
    },
    _adventure() {
      const run = this.state?.run;
      return (!run || !run.kind || run.kind === 'adventure' || run.kind === 'campaign')
        && this.state?.world?.currentSectorId === WEX_TICKET.sectorId;
    },
    _entity() {
      for (const e of this.state?.entityList || []) {
        if (e?.alive && e.data?.wexTicket === true) return e;
      }
      return null;
    },
    _removeOwned() {
      for (const e of this.state?.entityList || []) {
        if (e?.alive && e.data?.wexTicket === true) this.helpers?.removeEntity?.(e.id);
      }
    },
    _sync() {
      if (!this.state?.story) return;
      const flags = this._flag();
      if (!this._adventure() || flags?.[WEX_TICKET.flagId] === true) { this._removeOwned(); return; }
      if (!this._entity() && this.helpers.spawnEntity) this.helpers.spawnEntity(wexTicketSpec());
    },
    _collected(p) {
      if (!p || p.kind !== WEX_TICKET.kind || p.collectorId !== this.state?.playerId) return;
      const flags = this._flag();
      if (flags && flags[WEX_TICKET.flagId] !== true) {
        flags[WEX_TICKET.flagId] = true;
        // The comms backlog's own entry point — same shape story._fireComms publishes.
        this.bus?.emit('comms:popup', {
          id: 'wex_smell_ticket', sender: 'HELIOS MAINTENANCE', category: 'story',
          text: WEX_TICKET.collectLine, ttl: 10, persist: true,
        });
        this.bus?.emit('wexTicket:found', { pos: p.pos || { ...WEX_TICKET.pos } });
      }
    },
  };
}

export const wexTicket = createWexTicket();
