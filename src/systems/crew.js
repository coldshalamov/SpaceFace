// Row 446 GOLD-CREW — crew aboard. Up to four hires from the local station pools: each is a
// named person with a real role, a real derived-stat perk (written through
// player.efficiencyMods — the same seam tech unlocks use, reversed symmetrically on loss),
// banter about real sim events, one loyalty job, and injury/loss when the hull goes down.
//
// Crew are people, not wingmen — wingmen are ships. The roster persists in state.crew and the
// docked Long Berth card reads it. Recruiting needs the fitted crew berth (GOLD-HOME stage 3):
// candidates hail on the band when the player flies near their home station — the offer is a
// prompt-deck decision the crewPrompt adapter owns.

import {
  CREW_CAP, CREW_ROLES, CREW_CANDIDATES, LOYALTY_JOB_KINDS, crewCandidate,
} from '../data/crew.js';
import { LONG_BERTH_STATION_ID, berthGrant } from '../data/longBerth.js';

const OFFER_SCAN_S = 2.0;
const HAIL_RANGE_WU = 900;
const BANTER_GAP_S = 24;
const INJURY_RECOVER_S = 600;

function ensureSlice(state) {
  const c = state.crew || (state.crew = { version: 1 });
  if (!Array.isArray(c.members)) c.members = [];
  if (!Array.isArray(c.declinedIds)) c.declinedIds = [];
  if (!Array.isArray(c.lostIds)) c.lostIds = [];
  if (!Number.isFinite(c.banterAt)) c.banterAt = 0;
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

    // Banter + loyalty counters ride the same real events; each line is a fact about something
    // that just happened — kills you caused, contracts you closed, the yard filling up.
    this.bus.on('entity:killed', (p) => {
      if (!p || p.killerId !== this.state.playerId) return;
      this._loyaltyProgress('kills');
      this._banter('kills');
    });
    this.bus.on('mission:completed', () => {
      this._loyaltyProgress('missions');
      this._banter('missions');
    });
    this.bus.on('longBerth:stage', () => {
      this._banter('stages');
    });
    this.bus.on('longBerth:trophy', () => {
      this._loyaltyProgress('trophies');
      this._banter('trophies');
    });

    // Injury and loss: when the hull goes down somebody gets hurt; somebody already hurt on the
    // next death is gone for good.
    this.bus.on('player:death', () => this._crewCasualty());
    this.bus.on('dock:docked', (p) => {
      // Recovering on your own berth is the fiction the fitted crew berth sells.
      if (p && p.stationId === LONG_BERTH_STATION_ID) this._healAll();
      // A berth homecoming is the engineers' loyalty seam — the berth exists to be used.
      if (p && p.stationId === LONG_BERTH_STATION_ID) this._loyaltyProgress('berth_homecomings');
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
    };
  },

  deserialize(data) {
    if (!data || typeof data !== 'object') return;
    const c = ensureSlice(this.state);
    // Entries are hostile until shaped: a corrupt save must not abort the restore
    // with a TypeError on m.status, and downstream readers assume the hired shape.
    c.members = (Array.isArray(data.members) ? data.members : [])
      .filter((m) => m && typeof m === 'object' && typeof m.id === 'string')
      .slice(0, CREW_CAP)
      .map((m) => ({
        id: m.id,
        name: typeof m.name === 'string' ? m.name : m.id,
        role: typeof m.role === 'string' ? m.role : '',
        status: m.status === 'injured' || m.status === 'lost' ? m.status : 'active',
        hiredAt: Number.isFinite(m.hiredAt) ? m.hiredAt : 0,
        loyalty: Number.isFinite(m.loyalty) ? m.loyalty : 0,
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
      }));
    c.declinedIds = (Array.isArray(data.declinedIds) ? data.declinedIds : []).filter((id) => typeof id === 'string');
    c.lostIds = (Array.isArray(data.lostIds) ? data.lostIds : []).filter((id) => typeof id === 'string');
    c.banterAt = Number.isFinite(data.banterAt) ? data.banterAt : 0;
    // banterPick indexes the pool array — a fractional or negative pick selects
    // pool[3.5]/pool[-2] as undefined and the emit below throws mid-update.
    c.banterPick = Number.isFinite(data.banterPick) ? Math.max(0, Math.floor(data.banterPick)) : 0;
    for (const m of c.members) {
      // Same guard init runs: an injured member always carries a start time, or the
      // field-recovery check in update() can never fire.
      if (m.status === 'injured' && !Number.isFinite(m.injuredAt)) {
        m.injuredAt = Number(this.state.simTime) || 0;
      }
    }
  },

  update(dt, state) {
    const c = ensureSlice(state);
    // Injured crew recover on sim time — the crew berth heals them instantly, the field takes
    // ten minutes of flight.
    for (const m of c.members) {
      if (m.status === 'injured' && Number.isFinite(m.injuredAt)
          && (state.simTime - m.injuredAt) >= INJURY_RECOVER_S) {
        m.status = 'active';
        m.injuredAt = null;
        this._applyPerk(m, +1);
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
      line: offer.candidate.line,
    } : { visible: false });
  },

  _tryHire(candidateId) {
    const cand = crewCandidate(candidateId);
    const c = ensureSlice(this.state);
    if (!cand || !this._berthCrewReady() || c.members.length >= CREW_CAP) return;
    if (c.members.some((m) => m.id === cand.id) || c.lostIds.includes(cand.id)) return;
    const job = LOYALTY_JOB_KINDS[cand.loyaltyJob.kind];
    const member = {
      id: cand.id, name: cand.name, role: cand.role,
      status: 'active', hiredAt: Number(this.state.simTime) || 0,
      loyalty: 0, injuredAt: null,
      loyaltyJob: { kind: cand.loyaltyJob.kind, label: job.label, progress: 0, goal: cand.loyaltyJob.goal, done: false },
    };
    c.members.push(member);
    this._applyPerk(member, +1);
    this.bus.emit('comms:popup', {
      sender: member.name, text: cand.hireLine, category: 'story', ttl: 6, persist: true,
    });
    this.bus.emit('crew:hired', { id: cand.id, name: cand.name, role: cand.role });
  },

  // The perk is a plain additive delta on the same efficiencyMods multiplier tech unlocks write —
  // apply with +1 on hire, -1 on injury/loss/dismiss, and the derived fold + live readers pick it
  // up with no new plumbing.
  _applyPerk(member, sign) {
    const role = CREW_ROLES[member.role];
    if (!role || !role.perk) return;
    const p = this.state.player;
    if (!p) return;
    const mods = p.efficiencyMods || (p.efficiencyMods = {});
    const key = role.perk.key;
    mods[key] = (Number.isFinite(mods[key]) ? mods[key] : 1) + sign * role.perk.delta;
    const ships = this.registry && typeof this.registry.get === 'function' && this.registry.get('ships');
    if (ships && typeof ships.recomputeActiveShip === 'function') ships.recomputeActiveShip();
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
    const pool = c.members.filter((m) => {
      if (m.status !== 'active') return false;
      const cand = crewCandidate(m.id);
      return !!(cand && cand.banter && cand.banter[kind]);
    });
    if (!pool.length) return;
    c.banterAt = now;
    const pick = pool[(c.banterPick = ((c.banterPick || 0) + 1) % pool.length)];
    const cand = crewCandidate(pick.id);
    this.bus.emit('comms:popup', {
      sender: pick.name, text: cand.banter[kind], category: 'ambient', ttl: 4,
    });
  },

  _crewCasualty() {
    const c = ensureSlice(this.state);
    const injured = c.members.find((m) => m.status === 'injured');
    if (injured) {
      // Already hurt when the hull went down — she does not come back from the second one.
      // The perk already came off the sheet at injury; taking it again would double-count.
      injured.status = 'lost';
      c.lostIds.push(injured.id);
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
    this._applyPerk(active, -1);
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
      this._applyPerk(m, +1);
    }
  },
};

export default crew;
