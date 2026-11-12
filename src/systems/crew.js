// Row 446 GOLD-CREW — crew aboard. Up to four hires from the local station pools: each is a
// named person with a real role, a real derived-stat perk (written through
// player.efficiencyMods — the same seam tech unlocks use, reversed symmetrically on loss),
// banter about real sim events, one loyalty job, and injury/loss when the hull goes down.
//
// EXP-25 — the crew is a company now, not a list:
//   · Hiring costs each candidate's authored sign-on fee (economy:chargeCredits).
//   · Wages run on the world calendar — every day:tick the payroll is charged; a short purse
//     accrues back pay and morale drops, a grumble goes out, and two missed days start a
//     strike: every non-loyal member's perk comes off the sheet.
//   · A strike settles dockside through a generic crew:decisionOffer → crew:decide card:
//     pay what's owed, refuse and watch every non-loyal member take the ramp, or put it off.
//   · Morale (0–9) moves on deaths, paydays, berth homecomings and shore leave at a member's
//     home station; at zero a non-loyal member demands hazard pay at the next dock — pay it
//     or they walk.
//   · Veteran ranks: witnessed kills/missions/trophies/homecomings grow xp; at the authored
//     thresholds the member ranks up — the perk re-folds at a larger magnitude — and vets of
//     each role skim a seeded salvage grant off player kills.
//   · Loyal members (loyalty job done) never strike and never walk. That is the payoff.
//
// Crew are people, not wingmen — wingmen are ships. The roster persists in state.crew and the
// docked Long Berth card reads it. Recruiting needs the fitted crew berth (GOLD-HOME stage 3):
// candidates hail on the band when the player flies near their home station — the offer is a
// prompt-deck decision the crewPrompt adapter owns. Strikes and demands ride the same deck.
//
// Contracts: money only moves through economy:grantCredits / economy:chargeCredits (affordance
// is read off state.player.credits, never written — the same check longBerth runs); randomness
// is hash32 over stable ids (no ambient rolls, no state.rng draws); every emit follows the
// latch/mutation it reports; the perk bookkeeping stores the applied delta on the member so a
// rank-up between apply and remove can never drift the sheet.

import {
  CREW_CAP, CREW_ROLES, CREW_CANDIDATES, CREW_LAW, LOYALTY_JOB_KINDS,
  crewCandidate, crewVetRankLabel,
} from '../data/crew.js';
import { LONG_BERTH_STATION_ID, berthGrant } from '../data/longBerth.js';
import { hash32 } from '../core/rng.js';

const OFFER_SCAN_S = 2.0;
const HAIL_RANGE_WU = 900;
const BANTER_GAP_S = 24;
const INJURY_RECOVER_S = 600;
const DAY_SECONDS = 600;          // core day:tick cadence (coreSystem.js) — day-math only
const DEFAULT_WAGE_CR = 120;      // hostile/unknown member ids still draw a bounded wage
const ENGINEER_MEND_STEP = 0.15;  // each vet rank on an active engineer shortens field recovery
const ENGINEER_MEND_MIN = 0.55;   // ...but a splint still takes time

function ensureSlice(state) {
  const c = state.crew || (state.crew = { version: 2 });
  if (!Array.isArray(c.members)) c.members = [];
  if (!Array.isArray(c.declinedIds)) c.declinedIds = [];
  if (!Array.isArray(c.lostIds)) c.lostIds = [];
  if (!Number.isFinite(c.banterAt)) c.banterAt = 0;
  if (!Number.isInteger(c.unpaidDays) || c.unpaidDays < 0) c.unpaidDays = 0;
  if (!Number.isFinite(c.backPay) || c.backPay < 0) c.backPay = 0;
  if (!Number.isFinite(c.strikeSince)) c.strikeSince = null;
  if (!Number.isFinite(c.lastSalvageAt)) c.lastSalvageAt = -1e9;
  return c;
}

function stationPos(state, stationId) {
  const list = (state.entityIndex && state.entityIndex.stations) || state.entityList || [];
  for (const e of list) {
    if (e && e.type === 'station' && e.alive !== false && e.data && e.data.stationId === stationId) {
      return e.pos || null;
    }
  }
  return null;
}

export const crew = {
  name: 'crew',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.registry = ctx.registry || null;
    this._scanT = 0;

    const c = ensureSlice(this.state);
    for (const m of c.members) if (m.status === 'injured') m.injuredAt = m.injuredAt || this.state.simTime || 0;

    this.bus.on('crew:hire', (p) => this._tryHire(p && p.candidateId));
    this.bus.on('crew:decline', (p) => {
      const id = p && p.candidateId;
      // Resolve the slice live — resetRunState replaces state.crew on New Game, so the
      // bag captured at init would take the decline into a detached object and the
      // candidate would hail again on the next approach.
      const slice = ensureSlice(this.state);
      if (id && !slice.declinedIds.includes(id)) slice.declinedIds.push(id);
    });
    // The crew:decide reply from the prompt deck — strike settlement and hazard demands
    // share one reply channel keyed by the offerId the offer carried.
    this.bus.on('crew:decide', (p) => this._onDecision(p));

    // Banter + loyalty counters + veteran xp ride the same real events; each line is a fact
    // about something that just happened — kills you caused, contracts you closed, the yard
    // filling up.
    this.bus.on('entity:killed', (p) => {
      if (!p || p.killerId !== this.state.playerId) return;
      this._loyaltyProgress('kills');
      this._awardXp();
      this._banter('kills');
      this._crewSalvage(p);
    });
    this.bus.on('mission:completed', () => {
      this._loyaltyProgress('missions');
      this._awardXp();
      this._banter('missions');
    });
    this.bus.on('longBerth:stage', () => {
      this._banter('stages');
    });
    this.bus.on('longBerth:trophy', () => {
      this._loyaltyProgress('trophies');
      this._awardXp();
      this._banter('trophies');
    });

    // Payday rides the world calendar: { days:absoluteDay, elapsed } from core's preStep.
    this.bus.on('day:tick', (p) => this._payday(p));

    // Injury and loss: when the hull goes down somebody gets hurt; somebody already hurt on the
    // next death is gone for good. A hull-down also shakes everyone aboard.
    this.bus.on('player:death', () => this._crewCasualty());
    this.bus.on('dock:docked', (p) => {
      // Recovering on your own berth is the fiction the fitted crew berth sells.
      if (p && p.stationId === LONG_BERTH_STATION_ID) this._healAll();
      // A berth homecoming is the engineers' loyalty seam — the berth exists to be used.
      if (p && p.stationId === LONG_BERTH_STATION_ID) this._loyaltyProgress('berth_homecomings');
      // Coming home lifts the whole roster — and it counts as witnessed time aboard.
      if (p && p.stationId === LONG_BERTH_STATION_ID) {
        this._moraleAll(+1, +1);
        this._awardXp();
      }
      // Shore leave: docking a member's home station is a visit, once per day.
      if (p && p.stationId) this._shoreLeave(p.stationId);
    });
  },

  // The roster is people, not runtime handles — every field is plain durable data. A save without
  // the key restores nothing over the fresh bag init already minted.
  serialize() {
    const c = ensureSlice(this.state);
    return {
      version: c.version,
      members: c.members,
      declinedIds: c.declinedIds,
      lostIds: c.lostIds,
      banterAt: c.banterAt,
      banterPick: c.banterPick || 0,
      unpaidDays: c.unpaidDays,
      backPay: c.backPay,
      strikeSince: c.strikeSince,
      lastSalvageAt: c.lastSalvageAt,
    };
  },

  deserialize(data) {
    if (!data || typeof data !== 'object') return;
    const c = ensureSlice(this.state);
    // strikeSince must be read before the member perk bookkeeping — whether a member's perk
    // is owed on the sheet depends on it.
    c.strikeSince = Number.isFinite(data.strikeSince) ? data.strikeSince : null;
    c.lostIds = (Array.isArray(data.lostIds) ? data.lostIds : []).filter((id) => typeof id === 'string');
    // Entries are hostile until shaped: a corrupt save must not abort the restore
    // with a TypeError on m.status, and downstream readers assume the hired shape.
    const members = (Array.isArray(data.members) ? data.members : [])
      .filter((m) => m && typeof m === 'object' && typeof m.id === 'string')
      .slice(0, CREW_CAP)
      .map((m) => {
        // The authored table is the truth for known ids: a save that lost or forged the role
        // must not silently zero the member's perk — or swap it for a different one.
        const authored = crewCandidate(m.id);
        return {
          id: m.id,
          name: authored ? authored.name : (typeof m.name === 'string' ? m.name : m.id),
          role: authored ? authored.role
            : (typeof m.role === 'string' && CREW_ROLES[m.role] ? m.role : ''),
          status: m.status === 'injured' || m.status === 'lost' ? m.status : 'active',
          hiredAt: Number.isFinite(m.hiredAt) ? m.hiredAt : 0,
          loyalty: m.loyalty === 1 ? 1 : 0,
          injuredAt: Number.isFinite(m.injuredAt) ? m.injuredAt : null,
          loyaltyJob: m.loyaltyJob && typeof m.loyaltyJob === 'object'
            ? {
                kind: typeof m.loyaltyJob.kind === 'string' ? m.loyaltyJob.kind : '',
                label: typeof m.loyaltyJob.label === 'string' ? m.loyaltyJob.label : '',
                progress: Number.isFinite(m.loyaltyJob.progress) ? m.loyaltyJob.progress : 0,
                goal: Number.isFinite(m.loyaltyJob.goal) ? m.loyaltyJob.goal : 1,
                done: m.loyaltyJob.done === true,
              }
            : null,
          vet: Number.isFinite(m.vet) ? Math.max(0, Math.min(3, Math.floor(m.vet))) : 0,
          xp: Number.isFinite(m.xp) ? Math.max(0, Math.min(CREW_LAW.XP_CAP, Math.floor(m.xp))) : 0,
          morale: Number.isFinite(m.morale)
            ? Math.max(0, Math.min(CREW_LAW.MORALE_MAX, Math.round(m.morale)))
            : CREW_LAW.MORALE_START,
          demandPending: m.demandPending === true,
          shoreDay: Number.isFinite(m.shoreDay) ? Math.floor(m.shoreDay) : -1,
          perkDelta: 0,
        };
      });
    // The live invariant is roster = aboard: a member serialized 'lost' (never written by a
    // well-formed save) heals into the lost list instead of haunting the roster.
    c.members = [];
    for (const m of members) {
      if (m.status === 'lost') {
        if (!c.lostIds.includes(m.id)) c.lostIds.push(m.id);
      } else {
        c.members.push(m);
      }
    }
    c.declinedIds = (Array.isArray(data.declinedIds) ? data.declinedIds : []).filter((id) => typeof id === 'string');
    c.banterAt = Number.isFinite(data.banterAt) ? data.banterAt : 0;
    // banterPick indexes the pool array — a fractional or negative pick selects
    // pool[3.5]/pool[-2] as undefined and the emit below throws mid-update.
    c.banterPick = Number.isFinite(data.banterPick) ? Math.max(0, Math.floor(data.banterPick)) : 0;
    c.unpaidDays = Number.isFinite(data.unpaidDays)
      ? Math.max(0, Math.min(365, Math.floor(data.unpaidDays))) : 0;
    c.backPay = Number.isFinite(data.backPay)
      ? Math.max(0, Math.min(CREW_LAW.BACK_PAY_CAP, data.backPay)) : 0;
    c.lastSalvageAt = Number.isFinite(data.lastSalvageAt) ? data.lastSalvageAt : -1e9;
    for (const m of c.members) {
      // Same guard init runs: an injured member always carries a start time, or the
      // field-recovery check in update() can never fire.
      if (m.status === 'injured' && !Number.isFinite(m.injuredAt)) {
        m.injuredAt = Number(this.state.simTime) || 0;
      }
      // Loyal crew never demands — a hostile demandPending on a loyal member drops.
      if (m.loyalty === 1) m.demandPending = false;
    }
    // A strike with nobody left on the line is over before it starts.
    if (c.strikeSince != null && !c.members.some((m) => m.loyalty !== 1)) c.strikeSince = null;
    // perkDelta is recomputed, never adopted: the sheet's expected contribution from each
    // member is a pure function of status/strike/vet, so a forged value can't under- or
    // over-subtract the sheet later.
    for (const m of c.members) m.perkDelta = this._perkShouldBeOn(m) ? this._perkDeltaFor(m) : 0;
  },

  update(dt, state) {
    const c = ensureSlice(state);
    // Injured crew recover on sim time — the crew berth heals them instantly, the field takes
    // ten minutes of flight, less with a working engineer aboard (they cannot treat themselves).
    for (const m of c.members) {
      if (m.status === 'injured' && Number.isFinite(m.injuredAt)
          && (state.simTime - m.injuredAt) >= this._fieldRecoverS(m)) {
        m.status = 'active';
        m.injuredAt = null;
        this._syncPerk(m);
        this.bus.emit('comms:popup', {
          sender: m.name, text: 'Back on my feet. Point us somewhere.',
          category: 'ambient', ttl: 4,
        });
      }
    }

    this._scanT -= dt;
    if (this._scanT > 0) return;
    this._scanT = OFFER_SCAN_S;
    this._maybeOfferRecruit(c);
    this._maybeOfferDecision(c);
  },

  _berthCrewReady() {
    const lb = this.state.longBerth;
    return !!(lb && lb.claimed === true && Number(lb.stage) >= 3 && berthGrant(3, 'crew'));
  },

  _maybeOfferRecruit(c) {
    let offer = { visible: false, candidate: null };
    if (this._berthCrewReady() && c.members.length < CREW_CAP) {
      const player = this.state.entities && this.state.entities.get(this.state.playerId);
      const docked = this.state.ui && this.state.ui.docked === true;
      if (player && player.pos && !docked) {
        for (const cand of CREW_CANDIDATES) {
          if (c.members.some((m) => m.id === cand.id)) continue;
          if (c.declinedIds.includes(cand.id) || c.lostIds.includes(cand.id)) continue;
          const pos = stationPos(this.state, cand.homeStationId);
          if (!pos) continue;
          const dx = player.pos.x - pos.x, dz = player.pos.z - pos.z;
          if (dx * dx + dz * dz > HAIL_RANGE_WU * HAIL_RANGE_WU) continue;
          offer = { visible: true, candidate: cand };
          break;
        }
      }
    }
    this.bus.emit('crew:recruitOffer', offer.visible ? {
      visible: true,
      candidateId: offer.candidate.id,
      name: offer.candidate.name,
      role: offer.candidate.role,
      roleLabel: CREW_ROLES[offer.candidate.role].label,
      perkLine: CREW_ROLES[offer.candidate.role].perkLine,
      signOnCr: offer.candidate.signOnCr,
      wageCr: offer.candidate.wageCr,
      line: offer.candidate.line,
    } : { visible: false });
  },

  // Dockside confrontations ride one generic offer: while docked, a live strike outranks a
  // pending hazard demand, and the card updates itself every scan (owed grows on paydays).
  _maybeOfferDecision(c) {
    // A strike with nobody left on the line has already ended — heal the flag.
    if (c.strikeSince != null && !c.members.some((m) => m.loyalty !== 1)) c.strikeSince = null;
    let offer = null;
    if (this.state.ui && this.state.ui.docked === true) {
      offer = this._strikeOffer(c) || this._demandOffer(c);
    }
    this.bus.emit('crew:decisionOffer', offer || { visible: false });
  },

  _strikeOffer(c) {
    if (c.strikeSince == null) return null;
    const owed = Math.round(c.backPay);
    const speaker = this._spokesperson();
    const cand = speaker && crewCandidate(speaker.id);
    return {
      visible: true, offerId: 'wages', owed,
      sender: 'CREW — PICKET LINE',
      headline: `THE CREW IS OUT — ${owed} CR OWED`,
      detail: (cand && cand.strikeLine) || 'Wages or we walk. That is the whole of it.',
      choices: [
        { id: 'pay', label: `Pay ${owed} cr owed` },
        { id: 'refuse', label: 'Refuse — let them walk' },
        { id: 'defer', label: 'Not yet' },
      ],
    };
  },

  _demandOffer(c) {
    const m = c.members.find((x) => x.demandPending === true && x.loyalty !== 1 && x.status !== 'lost');
    if (!m) return null;
    const cand = crewCandidate(m.id);
    const amt = this._demandCr(m);
    return {
      visible: true, offerId: `demand:${m.id}`, owed: amt,
      sender: String(m.name || m.id).toUpperCase(),
      headline: `${m.name} — HAZARD PAY · ${amt} CR`,
      detail: (cand && cand.demandLine) || 'Hazard pay, or I find a hull that respects the work.',
      choices: [
        { id: 'pay', label: `Pay ${amt} cr` },
        { id: 'refuse', label: 'Refuse' },
        { id: 'defer', label: 'Ask them to wait' },
      ],
    };
  },

  _tryHire(candidateId) {
    const cand = crewCandidate(candidateId);
    const c = ensureSlice(this.state);
    if (!cand || !this._berthCrewReady() || c.members.length >= CREW_CAP) return;
    if (c.members.some((m) => m.id === cand.id) || c.lostIds.includes(cand.id)) return;
    // Nobody signs onto a picket line.
    if (c.strikeSince != null) {
      this.bus.emit('crew:hireDenied', { id: cand.id, reason: 'strike' });
      return;
    }
    const fee = Number.isFinite(cand.signOnCr) ? Math.max(0, Math.round(cand.signOnCr)) : 0;
    const credits = Number(this.state.player && this.state.player.credits);
    if (fee > 0 && (!Number.isFinite(credits) || credits < fee)) {
      this.bus.emit('comms:popup', {
        sender: cand.name, text: `${fee} cr to sign, and I do not barter the asking. Come back with it.`,
        category: 'ambient', ttl: 5,
      });
      this.bus.emit('crew:hireDenied', { id: cand.id, reason: 'credits' });
      return;
    }
    const job = LOYALTY_JOB_KINDS[cand.loyaltyJob.kind];
    const member = {
      id: cand.id, name: cand.name, role: cand.role,
      status: 'active', hiredAt: Number(this.state.simTime) || 0,
      loyalty: 0, injuredAt: null,
      loyaltyJob: { kind: cand.loyaltyJob.kind, label: job.label, progress: 0, goal: cand.loyaltyJob.goal, done: false },
      vet: 0, xp: 0, morale: CREW_LAW.MORALE_START,
      perkDelta: 0, demandPending: false, shoreDay: -1,
    };
    c.members.push(member);
    this._syncPerk(member);
    // The roster and the sheet already show the hire before money moves — a re-entrant
    // credits:changed listener sees a consistent ship.
    if (fee > 0) this.bus.emit('economy:chargeCredits', { amount: fee, reason: `crew:signon:${cand.id}` });
    this.bus.emit('comms:popup', {
      sender: member.name, text: cand.hireLine, category: 'story', ttl: 6, persist: true,
    });
    this.bus.emit('crew:hired', { id: cand.id, name: cand.name, role: cand.role });
  },

  // The perk is a plain additive delta on the same efficiencyMods multiplier tech unlocks
  // write. The member carries the applied magnitude (perkDelta) so removal subtracts exactly
  // what was added — a rank-up between apply and remove can never drift the sheet. Perk is on
  // the sheet iff the member is active and not a non-loyal striker.
  _perkShouldBeOn(m) {
    if (!m || m.status !== 'active') return false;
    const c = ensureSlice(this.state);
    return !(c.strikeSince != null && m.loyalty !== 1);
  },

  _perkDeltaFor(m) {
    const role = CREW_ROLES[m && m.role];
    if (!role || !role.perk) return 0;
    const vet = Number.isFinite(m.vet) ? m.vet : 0;
    return role.perk.delta * (1 + CREW_LAW.VET_PERK_STEP * vet);
  },

  _syncPerk(m) {
    const role = CREW_ROLES[m && m.role];
    if (!role || !role.perk) { if (m) m.perkDelta = 0; return; }
    const p = this.state.player;
    if (!p) return;
    const want = this._perkShouldBeOn(m) ? this._perkDeltaFor(m) : 0;
    const have = Number.isFinite(m.perkDelta) ? m.perkDelta : 0;
    const delta = want - have;
    m.perkDelta = want;
    if (Math.abs(delta) < 1e-9) return;
    const mods = p.efficiencyMods || (p.efficiencyMods = {});
    const key = role.perk.key;
    mods[key] = (Number.isFinite(mods[key]) ? mods[key] : 1) + delta;
    const ships = this.registry && typeof this.registry.get === 'function' && this.registry.get('ships');
    if (ships && typeof ships.recomputeActiveShip === 'function') ships.recomputeActiveShip();
  },

  // ---- the company ledger -----------------------------------------------------------------

  _wageOf(m) {
    const cand = crewCandidate(m && m.id);
    const w = cand && Number.isFinite(cand.wageCr) ? cand.wageCr : DEFAULT_WAGE_CR;
    return Math.max(0, Math.round(w));
  },

  _demandCr(m) {
    // Hazard pay is two days' wage, rounded up to a clean ten — an ask, not a formula leak.
    return Math.max(0, Math.ceil((this._wageOf(m) * 2) / 10) * 10);
  },

  _payroll() {
    const c = ensureSlice(this.state);
    let sum = 0;
    for (const m of c.members) {
      if (m.status === 'lost') continue;
      sum += this._wageOf(m);
    }
    return sum;
  },

  // The lowest-morale non-loyal member speaks for the crew; loyal hands never take the mic
  // against the captain.
  _spokesperson() {
    const c = ensureSlice(this.state);
    let best = null;
    for (const m of c.members) {
      if (m.loyalty === 1 || m.status === 'lost') continue;
      if (!best || (Number(m.morale) || 0) < (Number(best.morale) || 0)) best = m;
    }
    return best;
  },

  _morale(m, delta) {
    const cur = Number.isFinite(m.morale) ? m.morale : CREW_LAW.MORALE_START;
    m.morale = Math.max(0, Math.min(CREW_LAW.MORALE_MAX, Math.round(cur + delta)));
    // At zero a non-loyal member arms their hazard demand for the next dock; recovering
    // past low morale stands them down. Loyal crew never demands.
    if (m.loyalty === 1) m.demandPending = false;
    else if (m.morale <= 0) m.demandPending = true;
    else if (m.morale >= 2) m.demandPending = false;
  },

  _moraleAll(delta, loyalDelta) {
    const c = ensureSlice(this.state);
    const dl = loyalDelta == null ? delta : loyalDelta;
    for (const m of c.members) {
      if (m.status === 'lost') continue;
      this._morale(m, m.loyalty === 1 ? dl : delta);
    }
  },

  _payday(p) {
    const c = ensureSlice(this.state);
    if (!c.members.length) {
      c.unpaidDays = 0;
      c.backPay = 0;
      if (c.strikeSince != null) c.strikeSince = null;
      return;
    }
    const days = p && Number.isFinite(p.days)
      ? Math.floor(p.days)
      : Math.floor((Number(this.state.simTime) || 0) / DAY_SECONDS);
    const elapsed = Math.max(1, Math.min(30, Math.floor(Number(p && p.elapsed)) || 1));
    const payroll = this._payroll();
    if (payroll <= 0) return;
    if (c.strikeSince != null) {
      // On strike the day's wages just accrue — settlement is the dock-side confrontation,
      // not a silent charge. Latch first; this branch emits nothing.
      c.backPay = Math.min(CREW_LAW.BACK_PAY_CAP, c.backPay + payroll * elapsed);
      c.unpaidDays = Math.min(365, c.unpaidDays + elapsed);
      return;
    }
    const due = payroll * elapsed + Math.round(c.backPay);
    const credits = Number(this.state.player && this.state.player.credits);
    if (Number.isFinite(credits) && credits >= due) {
      const wasOwed = c.backPay > 0 || c.unpaidDays > 0;
      c.backPay = 0;
      c.unpaidDays = 0;
      this._moraleAll(+1, +1);
      this.bus.emit('economy:chargeCredits', { amount: due, reason: `crew:wages:${days}` });
      this.bus.emit('crew:wagesPaid', { amount: due, day: days });
      if (wasOwed) {
        this.bus.emit('comms:popup', {
          sender: 'The crew', text: `Back pay made good — ${due} cr. The board is square.`,
          category: 'ambient', ttl: 5,
        });
      }
      return;
    }
    // The purse is short: the day goes on the tab and the crew notices.
    c.unpaidDays = Math.min(365, c.unpaidDays + elapsed);
    c.backPay = Math.min(CREW_LAW.BACK_PAY_CAP, c.backPay + payroll * elapsed);
    this._moraleAll(-3, 0);
    const speaker = this._spokesperson();
    if (speaker) {
      const cand = crewCandidate(speaker.id);
      const line = (cand && cand.grumble && cand.grumble.pay)
        || 'The pay packet is late again. We noticed.';
      this.bus.emit('comms:popup', { sender: speaker.name, text: line, category: 'ambient', ttl: 5 });
    }
    if (c.unpaidDays >= CREW_LAW.STRIKE_AFTER_UNPAID_DAYS && speaker) this._beginStrike();
  },

  _beginStrike() {
    const c = ensureSlice(this.state);
    if (c.strikeSince != null) return;
    const speaker = this._spokesperson();
    if (!speaker) return; // an all-loyal roster eats the shortfall quietly — the loyalty payoff
    c.strikeSince = Number(this.state.simTime) || 0;
    // Every non-loyal perk comes off the sheet before a word is spoken — a re-entrant
    // listener already reads the struck ship.
    for (const m of c.members) this._syncPerk(m);
    const cand = crewCandidate(speaker.id);
    const line = (cand && cand.strikeLine) || 'We are downing tools until the pay comes aboard.';
    this.bus.emit('comms:popup', {
      sender: speaker.name, text: line, category: 'story', ttl: 8, persist: true,
    });
    this.bus.emit('crew:strike', { owed: Math.round(c.backPay), unpaidDays: c.unpaidDays });
  },

  _onDecision(p) {
    if (!p || typeof p.offerId !== 'string') return;
    const choice = p.choiceId;
    if (choice !== 'pay' && choice !== 'refuse') return; // 'defer' resolves deck-side only
    if (p.offerId === 'wages') this._resolveStrike(choice, Number.isFinite(p.owed) ? p.owed : null);
    else if (p.offerId.startsWith('demand:')) this._resolveDemand(p.offerId.slice('demand:'.length), choice);
  },

  _resolveStrike(choice, expectedOwed) {
    const c = ensureSlice(this.state);
    if (c.strikeSince == null) return;
    if (choice === 'pay') {
      const owed = Math.round(c.backPay);
      // A stale card pays the number it showed — if the tab grew meanwhile, the crew
      // re-quotes instead of settling worse terms than the player saw (INF-084 posture).
      if (expectedOwed != null && expectedOwed !== owed) {
        this.bus.emit('comms:popup', {
          sender: 'The crew', text: `The tab moved while you thought — ${owed} cr now.`,
          category: 'ambient', ttl: 4,
        });
        return;
      }
      const credits = Number(this.state.player && this.state.player.credits);
      if (owed > 0 && (!Number.isFinite(credits) || credits < owed)) {
        const short = owed - (Number.isFinite(credits) ? credits : 0);
        this.bus.emit('comms:popup', {
          sender: 'The crew', text: `Short ${short} cr. Sell something — we wait at the lock.`,
          category: 'ambient', ttl: 5,
        });
        return;
      }
      // Latch the settlement before money or words move.
      c.strikeSince = null;
      c.backPay = 0;
      c.unpaidDays = 0;
      for (const m of c.members) {
        if (m.loyalty !== 1 && (!Number.isFinite(m.morale) || m.morale < CREW_LAW.MORALE_SETTLED)) {
          m.morale = CREW_LAW.MORALE_SETTLED;
        }
        this._syncPerk(m);
      }
      const speaker = this._spokesperson() || c.members[0] || null;
      const cand = speaker && crewCandidate(speaker.id);
      const line = (cand && cand.settleLine) || 'Pay received. Tools back on.';
      if (owed > 0) this.bus.emit('economy:chargeCredits', { amount: owed, reason: 'crew:wages:settle' });
      this.bus.emit('comms:popup', {
        sender: speaker ? speaker.name : 'The crew', text: line, category: 'story', ttl: 6, persist: true,
      });
      this.bus.emit('crew:strikeSettled', { amount: owed });
      return;
    }
    // refuse — the picket empties: every non-loyal member takes the ramp.
    const walking = c.members.filter((m) => m.loyalty !== 1 && m.status !== 'lost');
    c.strikeSince = null;
    c.backPay = 0;
    c.unpaidDays = 0;
    for (const m of walking) this._memberQuits(m, 'strike');
  },

  _resolveDemand(memberId, choice) {
    const c = ensureSlice(this.state);
    const m = c.members.find((x) => x.id === memberId);
    if (!m || m.demandPending !== true) return;
    const cand = crewCandidate(m.id);
    if (choice === 'pay') {
      const amt = this._demandCr(m);
      const credits = Number(this.state.player && this.state.player.credits);
      if (!Number.isFinite(credits) || credits < amt) {
        const short = amt - (Number.isFinite(credits) ? credits : 0);
        this.bus.emit('comms:popup', {
          sender: m.name, text: `Short ${short} cr. I can wait — this once.`,
          category: 'ambient', ttl: 5,
        });
        return;
      }
      m.demandPending = false;
      m.morale = CREW_LAW.MORALE_PAID;
      this.bus.emit('economy:chargeCredits', { amount: amt, reason: `crew:hazard:${m.id}` });
      this.bus.emit('comms:popup', {
        sender: m.name, text: (cand && cand.thanksLine) || 'Accepted. We are square.',
        category: 'story', ttl: 5, persist: true,
      });
      this.bus.emit('crew:demandSettled', { id: m.id, name: m.name, amount: amt });
      return;
    }
    m.demandPending = false;
    this._memberQuits(m, 'demand');
  },

  // A member walks: splice before a word is spoken, the id joins the lost list so the offer
  // gate never hails them again, and whoever is left watches it happen.
  _memberQuits(m, reason) {
    const c = ensureSlice(this.state);
    const i = c.members.indexOf(m);
    if (i < 0) return;
    m.status = 'lost';
    this._syncPerk(m);
    c.members.splice(i, 1);
    if (!c.lostIds.includes(m.id)) c.lostIds.push(m.id);
    const cand = crewCandidate(m.id);
    const line = (cand && cand.walkLine) || `${m.name} takes the kit bag down the ramp.`;
    this.bus.emit('comms:popup', { sender: m.name, text: line, category: 'story', ttl: 6, persist: true });
    this.bus.emit('crew:quit', { id: m.id, name: m.name, reason });
    this._moraleAll(-1, -1);
    if (c.strikeSince != null && !c.members.some((x) => x.loyalty !== 1)) c.strikeSince = null;
  },

  // ---- witnessed events: morale, veteran rank, salvage favors ------------------------------

  _awardXp() {
    const c = ensureSlice(this.state);
    for (const m of c.members) {
      if (m.status !== 'active' && m.status !== 'injured') continue;
      m.xp = Math.min(CREW_LAW.XP_CAP, (Number.isFinite(m.xp) ? m.xp : 0) + 1);
      const want = CREW_LAW.VET_XP.reduce((n, t) => n + (m.xp >= t ? 1 : 0), 0);
      if (want <= (Number.isFinite(m.vet) ? m.vet : 0)) continue;
      m.vet = want;              // latch the rank before a word of it is spoken
      this._syncPerk(m);         // re-fold the role perk at the new magnitude
      this._morale(m, +2);
      const cand = crewCandidate(m.id);
      const line = (cand && cand.promote && cand.promote[m.vet])
        || `${m.name} is ${crewVetRankLabel(m.vet)} now.`;
      this.bus.emit('comms:popup', { sender: m.name, text: line, category: 'story', ttl: 6, persist: true });
      this.bus.emit('crew:promoted', { id: m.id, name: m.name, vet: m.vet, rank: crewVetRankLabel(m.vet) });
    }
  },

  // A vet-ranked member skims a favor off a player kill — role-flavored, hash32-seeded over
  // (kill id, member id), at most one grant per SALVAGE_GAP_S. No state.rng draw.
  _crewSalvage(p) {
    const c = ensureSlice(this.state);
    const now = Number(this.state.simTime) || 0;
    if (now - c.lastSalvageAt < CREW_LAW.SALVAGE_GAP_S) return;
    const killedId = p && (p.id != null ? p.id : p.targetId);
    if (killedId == null) return;
    for (const m of c.members) {
      if (m.status !== 'active' || !(m.vet >= CREW_LAW.VET_SALVAGE_MIN)) continue;
      if (c.strikeSince != null && m.loyalty !== 1) continue;
      const spec = CREW_ROLES[m.role] && CREW_ROLES[m.role].salvage;
      if (!spec) continue;
      const h = hash32('crewSalvage', String(killedId), m.id);
      if ((h % 1000) / 1000 >= spec.chance + 0.04 * m.vet) continue;
      const amount = spec.base + ((h >>> 10) % spec.jitter) + 3 * m.vet;
      c.lastSalvageAt = now;
      this.bus.emit('economy:grantCredits', { amount, reason: `crew:salvage:${m.role}` });
      const cand = crewCandidate(m.id);
      if (cand && cand.salvageLine) {
        this.bus.emit('comms:popup', { sender: m.name, text: cand.salvageLine, category: 'ambient', ttl: 4 });
      }
      this.bus.emit('crew:salvage', { id: m.id, name: m.name, role: m.role, amount });
      return;
    }
  },

  _shoreLeave(stationId) {
    const c = ensureSlice(this.state);
    const today = Number.isFinite(this.state.days)
      ? Math.floor(this.state.days)
      : Math.floor((Number(this.state.simTime) || 0) / DAY_SECONDS);
    for (const m of c.members) {
      if (m.status !== 'active' || m.shoreDay === today) continue;
      const cand = crewCandidate(m.id);
      if (!cand || cand.homeStationId !== stationId) continue;
      if (c.strikeSince != null && m.loyalty !== 1) continue; // the picket line does not take shore leave
      m.shoreDay = today;
      this._morale(m, +2);
      if (cand.shoreLine) {
        this.bus.emit('comms:popup', { sender: m.name, text: cand.shoreLine, category: 'ambient', ttl: 5 });
      }
    }
  },

  _fieldRecoverS(member) {
    const c = ensureSlice(this.state);
    let best = 0;
    for (const o of c.members) {
      if (o === member || o.status !== 'active' || o.role !== 'engineer') continue;
      if (c.strikeSince != null && o.loyalty !== 1) continue; // striking engineers do not mend
      const vet = Number.isFinite(o.vet) ? o.vet : 0;
      if (vet > best) best = vet;
    }
    return INJURY_RECOVER_S * Math.max(ENGINEER_MEND_MIN, 1 - ENGINEER_MEND_STEP * best);
  },

  _loyaltyProgress(kind) {
    const c = ensureSlice(this.state);
    for (const m of c.members) {
      const job = m.loyaltyJob;
      if (!job || job.done || job.kind !== kind || m.status !== 'active') continue;
      job.progress += 1;
      if (job.progress >= job.goal) {
        job.done = true;
        m.loyalty = 1;
        m.demandPending = false;      // a signed-on hand never makes the ask
        this._syncPerk(m);            // a striker who signs for good goes back to work now
        const line = (crewCandidate(m.id) || {}).loyaltyLine || 'I am staying.';
        this.bus.emit('comms:popup', {
          sender: m.name, text: line, category: 'story', ttl: 6, persist: true,
        });
        this.bus.emit('crew:loyalty', { id: m.id, name: m.name });
      }
    }
  },

  _banter(kind) {
    const c = ensureSlice(this.state);
    const now = Number(this.state.simTime) || 0;
    if (now - c.banterAt < BANTER_GAP_S) return;
    const striking = c.strikeSince != null;
    const pool = c.members.filter((m) => {
      if (m.status !== 'active') return false;
      if (striking && m.loyalty !== 1) return false; // the picket line is not chatty
      const cand = crewCandidate(m.id);
      if (!cand) return false;
      const low = Number.isFinite(m.morale) && m.morale <= CREW_LAW.MORALE_LOW;
      if (low && cand.grumble && cand.grumble[kind]) return true;
      return !!(cand.banter && cand.banter[kind]);
    });
    if (!pool.length) return;
    c.banterAt = now;
    const pick = pool[(c.banterPick = ((c.banterPick || 0) + 1) % pool.length)];
    const cand = crewCandidate(pick.id);
    const low = Number.isFinite(pick.morale) && pick.morale <= CREW_LAW.MORALE_LOW;
    const text = (low && cand.grumble && cand.grumble[kind])
      ? cand.grumble[kind]
      : cand.banter[kind];
    this.bus.emit('comms:popup', {
      sender: pick.name, text, category: 'ambient', ttl: 4,
    });
  },

  _crewCasualty() {
    const c = ensureSlice(this.state);
    // A hull-down shakes everyone aboard — loyal hands take it better.
    this._moraleAll(-2, -1);
    const injured = c.members.find((m) => m.status === 'injured');
    if (injured) {
      // Already hurt when the hull went down — she does not come back from the second one.
      // The perk already came off the sheet at injury; _syncPerk is idempotent about it.
      injured.status = 'lost';
      this._syncPerk(injured);
      if (!c.lostIds.includes(injured.id)) c.lostIds.push(injured.id);
      c.members.splice(c.members.indexOf(injured), 1);
      this.bus.emit('comms:popup', {
        sender: 'Long Berth', text: `${injured.name} did not walk off the wreck.`,
        category: 'story', ttl: 7, persist: true,
      });
      this.bus.emit('crew:lost', { id: injured.id, name: injured.name });
      return;
    }
    const active = c.members.find((m) => m.status === 'active');
    if (!active) return;
    active.status = 'injured';
    active.injuredAt = Number(this.state.simTime) || 0;
    this._syncPerk(active);
    this.bus.emit('comms:popup', {
      sender: active.name, text: 'Down hard — the doc sees me when we dock. Do not make a habit of it.',
      category: 'story', ttl: 6, persist: true,
    });
    this.bus.emit('crew:injured', { id: active.id, name: active.name });
  },

  _healAll() {
    const c = ensureSlice(this.state);
    for (const m of c.members) {
      if (m.status !== 'injured') continue;
      m.status = 'active';
      m.injuredAt = null;
      this._syncPerk(m);
    }
  },
};

export default crew;
