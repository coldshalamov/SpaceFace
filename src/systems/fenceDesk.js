// fenceDesk.js - THE WORLD REMEMBERS (U-B): the one writer of the fence ledger.
//
// An imported helper of the encounter director (NOT a registered tick): `installFenceDesk(host)`
// subscribes to the same bus the director already listens on and keeps the six authored fences'
// memory in `state.encounterDirector.stats.fences` (see data/fences.js). It READS the existing
// deniable receipts - thanked / emboldened / burned - and turns them into trust; it does not
// re-implement the aftermath. Every consequence is an intent:
//   credits      -> economy:chargeCredits / economy:grantCredits   (economy owns the wallet)
//   reputation   -> faction:repDelta                               (factions own reputation)
//   modules      -> ships:grantModule                              (ships own the inventory)
//   heat         -> heat:scrubRequested                            (heat.js is the only heat writer)
// It never writes credits, rep, cargo or heat. Receipts (all schemaVersion 1): fence:met,
// fence:trustChanged, fence:routeOpened, fence:routeLegDue, fence:routeCompleted, fence:scrubbed,
// fence:ransomed, law:fenceTip (the hunters subscribe later; this file only emits).
// A survivor pod ransomed at a fence who wants pods pays the lawful rescue fee times that
// fence's pay scale and earns a point of trust. Any other station changes nothing.
import { SECTORS } from '../data/sectors.js';
import { isPlayerWanted, heatLevelFor } from './heat.js';
import {
  DENIABLE_BURN_EPOCHS, deniableBoardEpoch, isFenceBurned,
} from '../data/deniableAftermath.js';
import {
  FENCES, FENCE_BY_ID, FENCE_RANSOM_FEE_CR, FENCE_ROUTE_CAUSE_TAG, FENCE_ROUTE_LEGS,
  FENCE_ROUTE_PENDING_EPOCHS, FENCE_FORGIVE_EPOCHS, FENCE_TIP_HEAT_LEVEL, FENCE_TRUST_DELTA,
  clampTrust, fenceContactId, fenceForStation, fenceLine, fenceRansomLine, fenceScrubCostCr,
  fenceTipRoll, sanitizeFenceRow,
} from '../data/fences.js';

const STATION_SECTOR = new Map();
for (const sec of SECTORS) for (const st of (sec.stations || [])) STATION_SECTOR.set(st.id, sec.id);

/** Authored pay multiplier: `payMult` if a fence carries one, else the quirk's payScale. */
function fencePayMult(fence) {
  const raw = fence && fence.payMult != null ? fence.payMult : fence && fence.quirk && fence.quirk.payScale;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

export class FenceDesk {
  constructor(host) {
    this.host = host;
  }

  get state() { return this.host.state; }
  get bus() { return this.host.bus; }

  bind() {
    const bus = this.bus;
    bus.on('dock:docked', (p) => this.onDock(p));
    bus.on('deniable:fenceThanked', (p) => this.onOutcome('thanked', p));
    bus.on('deniable:fenceEmboldened', (p) => this.onOutcome('lost', p));
    bus.on('deniable:fenceBurned', (p) => this.onOutcome('burned', p));
    bus.on('mission:accepted', (p) => this.onAccepted(p));
    bus.on('mission:completed', (p) => this.onSettled(p, 'completed'));
    bus.on('mission:failed', (p) => this.onSettled(p, 'failed'));
    bus.on('ui:talkContact', (p) => this.onTalk(p));
    bus.on('fence:scrubAsk', (p) => this.scrubFor(p && p.fenceId, p && p.stationId));
    bus.on('survivorPod:ransomed', (p) => this.onRansomed(p));
  }

  // ── ledger access: the only place stats.fences is written ──────────────────────────────────
  ledger(create) {
    const dir = this.state && this.state.encounterDirector;
    if (!dir || !dir.stats || typeof dir.stats !== 'object') return null;
    let ledger = dir.stats.fences;
    if (!ledger || typeof ledger !== 'object' || Array.isArray(ledger)
      || !ledger.byId || typeof ledger.byId !== 'object' || Array.isArray(ledger.byId)) {
      if (!create) return null;
      ledger = dir.stats.fences = { byId: {} };
    }
    return ledger;
  }

  /** The live (stored) row, normalized in place. Null when absent and not asked to create. */
  row(fenceId, create) {
    const ledger = this.ledger(create);
    if (!ledger) return null;
    if (!ledger.byId[fenceId] && !create) return null;
    const row = sanitizeFenceRow(ledger.byId[fenceId]);
    ledger.byId[fenceId] = row;
    return row;
  }

  epoch() { return deniableBoardEpoch(this.state); }

  receipt(name, payload) {
    this.bus.emit(name, { schemaVersion: 1, ...payload, tick: this.state.tick | 0 });
  }

  say(fence, line) {
    if (!line) return false;
    const text = `${fence.name}: ${line}`;
    const voice = this.host.helpers && this.host.helpers.voice;
    const said = voice && typeof voice.say === 'function'
      ? voice.say({ channel: 'bark', text, kind: 'info' })
      : false;
    if (!said) this.bus.emit('toast', { text, kind: 'info', ttl: 4 });
    return !!said;
  }

  moveTrust(fence, row, delta, cause) {
    const before = row.trust;
    row.trust = clampTrust(before + delta);
    if (row.trust === before) return false;
    this.receipt('fence:trustChanged', {
      fenceId: fence.id, stationId: fence.stationId, factionId: fence.factionId,
      trust: row.trust, delta: row.trust - before, cause,
    });
    return true;
  }

  // ── dock: forgiveness, the tip-off, the first meeting, a lapsed route ──────────────────────
  onDock(p) {
    if (this.host._saveRestoring) return;
    const stationId = p && p.stationId;
    const fence = fenceForStation(stationId);
    if (!fence) return;
    const state = this.state;
    const epoch = this.epoch();
    const heat = state.player && state.player.heat;
    const level = heatLevelFor(heat);
    const wanted = isPlayerWanted(state);

    let row = this.row(fence.id, false);
    if (row) {
      // A sour fence warms one step per FENCE_FORGIVE_EPOCHS of board time - lazily, here.
      if (row.trust < 0 && epoch - row.lastChangeEpoch >= FENCE_FORGIVE_EPOCHS) {
        const steps = Math.floor((epoch - row.lastChangeEpoch) / FENCE_FORGIVE_EPOCHS);
        row.lastChangeEpoch = epoch;
        this.moveTrust(fence, row, Math.min(steps, -row.trust), 'time');
      }
      // The next leg was posted and never taken: the offer lapsed, the fence shrugs, no penalty.
      if (row.route && row.route.status === 'pending'
        && epoch - row.route.sinceEpoch >= FENCE_ROUTE_PENDING_EPOCHS) row.route = null;
    }

    // Tip-off: hot enough that the law is paying, and a fence who does not trust you may sell you.
    const trust = row ? row.trust : 0;
    if (level >= FENCE_TIP_HEAT_LEVEL && trust <= 0) {
      row = row || this.row(fence.id, true);
      if (row.lastTipEpoch !== epoch
        && fenceTipRoll((state.meta && state.meta.seed) || 0, fence.id, epoch, trust)) {
        row.lastTipEpoch = epoch;
        this.receipt('law:fenceTip', {
          fenceId: fence.id, stationId: fence.stationId, factionId: fence.factionId,
          sectorId: STATION_SECTOR.get(fence.stationId) || null, heatLevel: level,
        });
        this.say(fence, fenceLine(fence, 'unknown'));
        return;
      }
    }

    // First meeting: a WANTED pilot (or a trusted one) at their berth is a face they now know.
    if (wanted || trust >= 1) {
      row = row || this.row(fence.id, true);
      if (!row.met) {
        row.met = true;
        row.lastChangeEpoch = epoch;
        this.receipt('fence:met', {
          fenceId: fence.id, stationId: fence.stationId, factionId: fence.factionId, heatLevel: level,
        });
        this.say(fence, fenceLine(fence, 'first'));
      }
    }
  }

  // ── trust moves on the EXISTING deniable receipts ──────────────────────────────────────────
  onOutcome(kind, p) {
    if (this.host._saveRestoring) return;
    const fence = fenceForStation(p && p.stationId);
    if (!fence) return;
    const epoch = this.epoch();
    const row = this.row(fence.id, true);
    row.met = true;
    row.lastOutcome = kind;
    row.lastChangeEpoch = epoch;
    if (kind === 'thanked') row.jobsDone += 1;
    if (kind === 'lost') row.jobsLost += 1;
    if (kind === 'burned') row.burnedUntilEpoch = Math.max(row.burnedUntilEpoch, epoch + DENIABLE_BURN_EPOCHS);
    this.moveTrust(fence, row, FENCE_TRUST_DELTA[kind], kind);
    this.say(fence, fenceLine(fence, kind === 'lost' ? 'lost' : kind === 'burned' ? 'burned' : 'thanks'));
  }

  // ── the route: three linked legs, each unlocking the next, one reward once ─────────────────
  onAccepted(p) {
    if (this.host._saveRestoring) return;
    const missionId = p && p.missionId;
    if (!missionId) return;
    const active = this.state.missions && Array.isArray(this.state.missions.active) ? this.state.missions.active : [];
    const mission = active.find((m) => m && m.id === missionId);
    const cause = mission && mission.cause;
    if (!cause || cause.tag !== FENCE_ROUTE_CAUSE_TAG || !cause.fenceRoute) return;
    const fence = FENCE_BY_ID.get(cause.fenceRoute.fenceId);
    if (!fence) return;
    const leg = Math.floor(Number(cause.fenceRoute.leg) || 0);
    if (leg < 1 || leg > FENCE_ROUTE_LEGS) return;
    const row = this.row(fence.id, true);
    const epoch = this.epoch();
    if (row.routeDone) return;
    if (leg === 1) {
      if (row.route && row.route.missionId === missionId) return; // duplicate delivery
      row.met = true;
      row.route = {
        status: 'running', leg: 1, missionId, destStationId: mission.destStationId || null,
        pendingStationId: null, sinceEpoch: epoch,
      };
      this.receipt('fence:routeOpened', {
        fenceId: fence.id, stationId: fence.stationId, factionId: fence.factionId,
        legs: FENCE_ROUTE_LEGS, destStationId: mission.destStationId || null,
      });
      return;
    }
    if (!row.route || row.route.status !== 'pending' || row.route.leg !== leg) return;
    row.route = {
      status: 'running', leg, missionId, destStationId: mission.destStationId || null,
      pendingStationId: null, sinceEpoch: epoch,
    };
  }

  onSettled(p, kind) {
    if (this.host._saveRestoring) return;
    const missionId = p && p.missionId;
    if (!missionId) return;
    const ledger = this.ledger(false);
    if (!ledger) return;
    for (const fence of FENCES) {
      const stored = ledger.byId[fence.id];
      if (!stored || !stored.route || stored.route.missionId !== missionId) continue;
      const row = this.row(fence.id, false);
      if (!row || !row.route || row.route.status !== 'running') continue;
      if (kind === 'completed') this.legDone(fence, row);
      else this.legLost(fence, row, p);
      return;
    }
  }

  legDone(fence, row) {
    const epoch = this.epoch();
    const route = row.route;
    if (route.leg < FENCE_ROUTE_LEGS) {
      row.route = {
        status: 'pending', leg: route.leg + 1, missionId: null, destStationId: null,
        pendingStationId: route.destStationId, sinceEpoch: epoch,
      };
      this.receipt('fence:routeLegDue', {
        fenceId: fence.id, stationId: fence.stationId, factionId: fence.factionId,
        leg: route.leg + 1, pendingStationId: route.destStationId,
      });
      return;
    }
    row.route = null;
    row.routeDone = true; // one-time: the route is never offered again
    row.jobsDone += 1;
    row.lastOutcome = 'route';
    row.lastChangeEpoch = epoch;
    const reward = fence.route.reward;
    const reason = `fence:route:${fence.id}`;
    if (reward.kind === 'credits') this.bus.emit('economy:grantCredits', { amount: reward.amount, reason });
    else if (reward.kind === 'module') this.bus.emit('ships:grantModule', { defId: reward.defId, reason });
    else if (reward.kind === 'rep') {
      this.bus.emit('faction:repDelta', { factionId: fence.factionId, delta: reward.amount, reason: 'fence_route' });
    }
    this.receipt('fence:routeCompleted', {
      fenceId: fence.id, stationId: fence.stationId,
      factionId: fence.factionId, fenceName: fence.name,
      reward: { kind: reward.kind, amount: reward.amount || 0, defId: reward.defId || null },
    });
    this.say(fence, fenceLine(fence, 'thanks'));
  }

  legLost(fence, row, p) {
    const abandoned = /abandon/i.test(String((p && p.reason) || ''));
    row.route = null;
    row.lastChangeEpoch = this.epoch();
    if (abandoned) return; // walking away from a leg is not the cargo going down
    row.jobsLost += 1;
    row.lastOutcome = 'lost';
    this.moveTrust(fence, row, FENCE_TRUST_DELTA.routeLost, 'route_lost');
    this.say(fence, fenceLine(fence, 'lost'));
  }

  // ── a ransomed pod: only a fence who buys them pays, and only by intent ────────────────────
  onRansomed(p) {
    if (this.host._saveRestoring) return;
    const fence = fenceForStation(p && p.stationId);
    if (!fence || !fence.quirk || fence.quirk.wantsPods !== true) return;
    const row = this.row(fence.id, true);
    if (!row) return;
    row.met = true;
    row.lastChangeEpoch = this.epoch();
    const amount = Math.round(FENCE_RANSOM_FEE_CR * fencePayMult(fence));
    const victimId = p.victimId != null ? p.victimId : null;
    this.bus.emit('economy:grantCredits', {
      amount,
      reason: `fence_ransom:${fence.id}`,
      fenceId: fence.id,
      victimId,
    });
    this.moveTrust(fence, row, 1, 'ransom');
    this.say(fence, fenceRansomLine(fence));
    this.receipt('fence:ransomed', {
      fenceId: fence.id,
      stationId: fence.stationId,
      factionId: fence.factionId,
      victimId,
      amountCr: amount,
    });
  }

  // ── the fixer's scrub ──────────────────────────────────────────────────────────────────────
  onTalk(p) {
    if (!p || p.choiceId !== 'fence_scrub' || typeof p.contactId !== 'string') return;
    const fence = FENCES.find((f) => fenceContactId(f) === p.contactId);
    if (fence) this.scrub(fence, p.stationId || fence.stationId);
  }

  scrubFor(fenceId, stationId) {
    const fence = FENCE_BY_ID.get(fenceId);
    return fence ? this.scrub(fence, stationId || fence.stationId) : false;
  }

  /** Ask the fixer for a scrub. The heat owner decides whether (and how much) heat cools; the
   *  wallet is charged by intent only once it did. Returns true when the scrub landed. */
  scrub(fence, stationId) {
    const state = this.state;
    const row = this.row(fence.id, true);
    const epoch = this.epoch();
    const refuse = (reason) => {
      row.lastAsk = { kind: 'scrub', ok: false, reason };
      return false;
    };
    if (!fence.quirk.fixer) return refuse('not_a_fixer');
    if (stationId !== fence.stationId) return refuse('wrong_station');
    if (!isPlayerWanted(state)) return refuse('clean');
    if (row.trust <= -3 || isFenceBurned(state, fence.stationId, epoch) || epoch < row.burnedUntilEpoch) {
      return refuse('burned');
    }
    const level = heatLevelFor(state.player.heat);
    const costCr = fenceScrubCostCr(level, row.trust);
    if (!(Number(state.player.credits) >= costCr)) return refuse('credits');

    const request = {
      schemaVersion: 1, fenceId: fence.id, stationId: fence.stationId, costCr, epoch, result: null,
    };
    this.bus.emit('heat:scrubRequested', request);
    const res = request.result;
    if (!res || res.ok !== true) return refuse((res && res.reason) || 'refused');
    this.bus.emit('economy:chargeCredits', { amount: costCr, reason: 'service:fence_scrub' });
    row.met = true;
    row.lastAsk = { kind: 'scrub', ok: true, reason: null };
    this.receipt('fence:scrubbed', {
      fenceId: fence.id, stationId: fence.stationId,
      factionId: fence.factionId, fenceName: fence.name, costCr,
      cooled: res.cooled, before: res.before, after: res.after,
    });
    return true;
  }
}

/** Install the desk on a host that has `state`, `bus`, `helpers` (the encounter director). */
export function installFenceDesk(host) {
  if (!host || !host.bus || typeof host.bus.on !== 'function') return null;
  const desk = new FenceDesk(host);
  desk.bind();
  return desk;
}
