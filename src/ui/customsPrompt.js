// Customs result receipts. Patrol and lawful-inspection systems own the pre-scan choice;
// `player:scannedByPatrol` is a fact emitted after the worker has already resolved its scan.
// This UI system reports outcomes and never opens a second, post-resolution decision deck.

import { COMMODITIES } from '../data/commodities.js';
import { FACTION_META } from '../data/factions.js';

const CMDTY_BY_ID = new Map(COMMODITIES.map((c) => [c.id, c]));
const FACTION_BY_ID = new Map(FACTION_META.map((f) => [f.id, f]));

// Kept as pure estimate helpers for existing diagnostics. The economy remains the authority for
// actual fines and bribe debits; these helpers do not make a scan decision or write player state.
export const FINE_MULT = Object.freeze({ legal: 0, restricted: 0.8, illegal: 1.2, contraband: 1.5 });
export const BRIBE_FRAC = 0.30;

function factionShort(factionId) {
  const f = factionId ? FACTION_BY_ID.get(factionId) : null;
  return (f && (f.short || f.name)) || 'Concord Navy';
}

export function holdRisk(state, economySys) {
  const illicit = (economySys && typeof economySys.illicitCargo === 'function')
    ? economySys.illicitCargo(state) : [];
  if (!illicit.length) return { hasContraband: false, stacks: [], estFine: 0, estBribe: 0 };

  let estFine = 0;
  const stacks = illicit.map((s) => {
    const def = s.def || CMDTY_BY_ID.get(s.commodityId) || {};
    const mult = FINE_MULT[def.legality] != null ? FINE_MULT[def.legality] : (def.fineMult || 1);
    const lineFine = Math.round((def.basePrice || 0) * (s.qty || 0) * mult);
    estFine += lineFine;
    return { commodityId: s.commodityId, name: def.name || s.commodityId, qty: s.qty, legality: def.legality, estFine: lineFine };
  });
  return { hasContraband: true, stacks, estFine, estBribe: Math.round(estFine * BRIBE_FRAC) };
}

export const customsPrompt = {
  name: 'customsPrompt',

  init(ctx) {
    this._state = ctx && ctx.state;
    this._bus = ctx && ctx.bus;
    this._onResolved = (p) => {
      // Durable lawful-inspection flow owns its own receipt and correlated case lifecycle.
      if (p && p.lawfulInspectionCaseId) return;
      if (p && p.found === true) {
        const playerId = this._state && this._state.playerId;
        const foreign = p.evidenceOwnerId != null && p.evidenceOwnerId !== playerId;
        if (foreign) this._reportThirdPartySeizure();
        else if (p.surrendered === true) this._reportImpound(p);
        else this._reportBust(p);
      }
    };
    this._onScanAborted = (p) => this._reportScanAborted(p);
    this._onTrustMarked = (p) => this._reportTrust(p, false);
    this._onScanWaived = (p) => this._reportTrust(p, true);
    if (this._bus && this._bus.on) {
      this._bus.on('contraband:scanned', this._onResolved);
      this._bus.on('customs:scanAborted', this._onScanAborted);
      this._bus.on('customs:trustMarked', this._onTrustMarked);
      this._bus.on('customs:scanWaived', this._onScanWaived);
    }
  },

  _reportTrust(p, waived) {
    if (!p || !this._bus?.emit) return;
    const station = p.stationName || p.stationId;
    this._bus.emit('toast', {
      text: waived
        ? `CUSTOMS WAIVED — ${station} remembers today's clean pass.`
        : `CUSTOMS CLEAR — trust mark recorded at ${station} for today.`,
      kind: 'info', ttl: 4,
    });
  },

  _reportBust(p) {
    const units = Array.isArray(p.confiscated)
      ? p.confiscated.reduce((n, s) => n + (Math.max(0, s.qty | 0) || 0), 0)
      : Math.max(0, p.units | 0);
    const fine = Number.isFinite(p.fine) ? p.fine : null;
    const seized = units > 0 ? ` · ${units} unit${units === 1 ? '' : 's'} seized` : '';
    const cost = fine != null ? `fined ${fine} cr` : 'contraband flagged';
    this._bus?.emit?.('toast', {
      text: `CUSTOMS BUST — ${factionShort(p.factionId)} ${cost}${seized}; standing damaged.`,
      kind: 'warn', ttl: 5,
    });
  },

  _reportThirdPartySeizure() {
    this._bus?.emit?.('toast', {
      text: 'CUSTOMS GATE — cargo seized from a third-party line.', kind: 'info', ttl: 3,
    });
  },

  _reportImpound(p) {
    const units = Array.isArray(p.confiscated)
      ? p.confiscated.reduce((n, s) => n + (Math.max(0, s.qty | 0) || 0), 0)
      : Math.max(0, p.units | 0);
    const seized = units > 0 ? `${units} unit${units === 1 ? '' : 's'} ` : '';
    this._bus?.emit?.('toast', {
      text: `CUSTOMS GATE — ${seized}surrendered cargo impounded. No charge filed.`,
      kind: 'info', ttl: 4,
    });
  },

  _reportScanAborted(p) {
    const dumped = Array.isArray(p && p.dumped) ? p.dumped : [];
    const names = dumped
      .filter((row) => row && typeof row.commodityId === 'string')
      .map((row) => {
        const def = CMDTY_BY_ID.get(row.commodityId) || {};
        const amount = Math.max(0, row.amount | 0);
        return `${def.name || row.commodityId}${amount > 0 ? ` ×${amount}` : ''}`;
      });
    const detail = names.length ? `${names.join(', ')} jettisoned mid-scan` : 'cargo jettisoned mid-scan';
    this._bus?.emit?.('toast', {
      text: `CUSTOMS SCAN ABORTED — ${detail}; suspicion noted.`, kind: 'warn', ttl: 4,
    });
  },

  destroy() {
    if (this._bus && this._bus.off) {
      if (this._onScanAborted) this._bus.off('customs:scanAborted', this._onScanAborted);
      if (this._onTrustMarked) this._bus.off('customs:trustMarked', this._onTrustMarked);
      if (this._onScanWaived) this._bus.off('customs:scanWaived', this._onScanWaived);
      if (this._onResolved) this._bus.off('contraband:scanned', this._onResolved);
    }
    this._onScanAborted = null;
    this._onTrustMarked = null;
    this._onScanWaived = null;
    this._onResolved = null;
    this._bus = null;
    this._state = null;
  },
};

export default customsPrompt;
