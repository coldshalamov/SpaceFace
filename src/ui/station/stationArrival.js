import { SECTORS } from '../../data/sectors.js';
import { barGreetingBarkFor } from '../../data/barks.js';
import { stationContactMemoryFor } from '../../data/stationContacts.js';
import { newestUngreetedPlayerTitleSeen } from '../../data/titles.js';
import { rankFromRep } from '../../systems/factions.js';
import { localizeText } from '../../localization/sourceText.js';
import { hash32 } from '../../core/rng.js';
import { dockIntentStatus } from '../../core/dockIntent.js';
import { generateContacts } from './barContacts.js';
import { FACTION_KITS } from '../../data/factions/index.js';

const RECOGNITION = Object.freeze({
  new: { label: 'New arrival', reaction: 'They look up from the counter.' },
  recognized: { label: 'Recognized', reaction: 'They recognize you before you speak.' },
  trusted: { label: 'Trusted', reaction: 'They kept a place for you.' },
  wary: { label: 'Guarded', reaction: 'They keep the paperwork between you.' },
});
const ARRIVAL_LINES = Object.freeze({
  new: 'Good to see a new face.',
  recognized: 'I remember you. Welcome back.',
  trusted: 'You are always welcome here.',
  wary: 'Keep your paperwork close. We are watching.',
});

// inf-title-greeting — the barkeep's one spoken acknowledgment of a NEW title. The world news
// already printed the earn; this is the place you walk into answering it, once per title.
// Flavor follows the earn verb: the aura records by name, every stunt title through one dock
// register — the witnesses talked, the keeper confirms. Templates interpolate at composition.
const TITLE_GREETING_LINES = Object.freeze({
  title_thunderchild: 'Word crossed the band — the {title} flies under your name now. Drinks are on the house.',
  title_lifeline: '{title}, they call you. The berths remember every pod you brought in.',
  title_razorline: 'They still argue about the {title} cuts down here. Yard verdicts do not lie.',
  title_quiet_clear: '{title} — a whole wanted window and not one hull down. The regulars checked twice.',
});
const TITLE_GREETING_STUNT = 'The docks are calling you {title} now. That was yours, was it? Thought so.';
const TITLE_GREETING_FALLBACK = 'Word crossed the band — {title}, under your name. Congratulations are owed.';

/**
 * Pure. The one title clause this arrival can speak, or null. Reads only the durable titlesSeen
 * receipt bag; the acknowledgment stamp (greetedAt) is written by the titles system when the
 * receipt actually delivers, so a greeting crowded off the glass keeps its one chance.
 */
export function titleGreetingLineFor(state) {
  const record = newestUngreetedPlayerTitleSeen(state);
  if (!record) return null;
  const title = String(record.title || '').trim() || 'a title';
  const authored = String(record.id || '').split(':')[0] || '';
  const template = TITLE_GREETING_LINES[authored]
    || (authored.startsWith('title_') ? TITLE_GREETING_STUNT : TITLE_GREETING_FALLBACK);
  return { seenId: record.id, titleId: authored, line: localizeText(template, { title }) };
}

/**
 * The desk says the house's own war (inf-war-desk). Docking into a faction whose conflict
 * record reads war names the rival — the same truth the chart's war front renders, from the
 * same record, nothing invented. Posture repeats per visit like every recognition band; a
 * cold or tense pair stays quiet at the desk, and a faction with no record stays wordless.
 * Pure read.
 *
 * The peace read (inf-peace-receipt): when a front resolves, factions drops the pair to tense
 * and the war posture goes quiet — until now the war simply vanished into silence, even though
 * the conflict record keeps the flip-time facts (who took the ground, from whom, when). For a
 * bounded memory window after that stamp, the desk of EITHER house names the peace instead,
 * from the same record, nothing invented; past the window the berth moves on. A live war on
 * any of the house's fronts outranks peace news from another one.
 */
const PEACE_MEMORY_S = 1800; // three sim days: fresh news, then history

export function stationWarPostureLineFor(state, factionId) {
  const conflicts = state && state.conflicts;
  if (!conflicts || typeof conflicts !== 'object' || !factionId) return null;
  const factionNameOf = (id) => {
    const kit = FACTION_KITS.find((entry) => entry && entry.id === id);
    return (kit && (kit.short || kit.name)) || String(id).replace(/^faction_/, '');
  };
  for (const pairKey of Object.keys(conflicts)) {
    const rec = conflicts[pairKey];
    if (!rec || String(rec.state || '').toLowerCase() !== 'war') continue;
    const pair = String(pairKey).split(':');
    if (!pair.includes(factionId)) continue;
    const rival = pair.find((id) => id && id !== factionId);
    if (!rival) continue;
    return localizeText('We are at war with {rival}. You will understand if the welcome is short.',
      { rival: factionNameOf(rival) });
  }
  const now = Number(state.simTime);
  for (const pairKey of Object.keys(conflicts)) {
    const rec = conflicts[pairKey];
    if (!rec || String(rec.state || '').toLowerCase() === 'war') continue;
    const pair = String(pairKey).split(':');
    if (!pair.includes(factionId)) continue;
    const flip = rec.lastFlip;
    if (!flip || typeof flip !== 'object') continue;
    const at = Number(flip.t);
    if (!Number.isFinite(now) || !Number.isFinite(at) || now - at < 0 || now - at > PEACE_MEMORY_S) continue;
    const winner = typeof flip.newOwner === 'string' && flip.newOwner ? flip.newOwner : null;
    const loser = typeof flip.previousOwner === 'string' && flip.previousOwner ? flip.previousOwner : null;
    if (!winner || !loser || winner === loser) continue;
    const sector = SECTORS.find((entry) => entry && entry.id === flip.sectorId);
    const ground = (sector && sector.name)
      || String(flip.sectorId || '').replace(/^sector_/, '').replace(/_/g, ' ').trim()
      || 'the contested lane';
    return localizeText(
      'The war is over — {winner} took {ground} from {loser}. The guns have gone quiet, but the docks still watch their cargo.',
      { winner: factionNameOf(winner), loser: factionNameOf(loser), ground },
    );
  }
  return null;
}
const ANCHOR_MS = 4000;
const RETRY_MS = 500;
const CAPTION_MS = 600;
const MAX_ATTEMPTS = 16;
// Bounds pathological starvation (competing events on a <4 s cadence forever): past a minute
// the written receipt delivers instead. Ordinary competition windows keep full yield.
const MAX_WAIT_MS = 60000;

/** Presentation only: contact memory and faction rep retain their existing writers. */
export function stationRegularRecognition(state, contact) {
  const memory = stationContactMemoryFor(state, contact?.id);
  const standing = state?.factions?.[contact?.factionId];
  const rank = standing ? rankFromRep(standing.rep, contact.factionId).step : null;
  const band = rank === 0 ? 'wary'
    : memory?.standing === 3 || rank >= 2 ? 'trusted'
      : memory?.met === true ? 'recognized' : 'new';
  return { band, ...RECOGNITION[band] };
}

export function buildStationArrivalGreeting(state, stationId) {
  if (!stationId || !SECTORS.some((sector) => sector.stations?.some((s) => s.id === stationId))) return null;
  const host = generateContacts(stationId, state).find((contact) => contact.role === 'barkeep');
  if (!host) return null;
  const pilot = Array.from(String(state?.player?.name || '').replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
    .replace(/\s+/g, ' ').trim()).slice(0, 20).join('') || 'Pilot';
  const { band } = stationRegularRecognition(state, host);
  const body = host.canonicalKey || host.depthProgram
    ? host.line
    : barGreetingBarkFor(host.factionId, host.role, hash32(`${host.id}_arrival`)) || host.line;
  // One NEW title per visit: the newest un-greeted sighting names itself in the greeting. The
  // stamp waits for actual delivery (finish), so a crowded-out greeting keeps its chance.
  const title = titleGreetingLineFor(state);
  // The house's own war rides the same welcome (inf-war-desk): posture repeats per visit.
  const war = stationWarPostureLineFor(state, host.factionId);
  const text = `${pilot}, ${body || 'welcome aboard.'} ${ARRIVAL_LINES[band]}${title ? ` ${title.line}` : ''}${war ? ` ${war}` : ''}`;
  return {
    stationId, contactId: host.id, speakerName: host.name, factionId: host.factionId,
    band, text,
    ...(title ? { titleSeenId: title.seenId, titleId: title.titleId } : {}),
    ...(war ? { warLine: war } : {}),
  };
}

/** Presentation-clock delivery survives paused simulation and temporary screen coverage. */
export function createStationArrivalPresenter(ctx, options = {}) {
  const { state, bus } = ctx;
  const setTimer = options.setTimeout || globalThis.setTimeout;
  const clearTimer = options.clearTimeout || globalThis.clearTimeout;
  const now = options.now || (() => performance.now());
  const receiptVisible = options.receiptVisible || (() => false);
  const showReceipt = options.showReceipt || (() => {});
  let visible = false;
  let disposed = false;
  let visit = null;
  let timer = null;
  let generation = 0;
  let competingAt = -Infinity;
  let emitting = false;
  const subscriptions = [];

  const currentStation = () => state.ui?.docked === true ? state.ui.dockedStationId : null;
  const valid = (v) => !disposed && visible && visit === v && currentStation() === v.stationId;
  function cancel() {
    generation += 1;
    if (timer !== null) clearTimer(timer);
    timer = null;
  }
  function schedule(delay) {
    cancel();
    if (!visit || visit.delivered || !valid(visit)) return;
    const v = visit;
    const token = generation;
    timer = setTimer(() => {
      if (token !== generation || !valid(v)) return;
      timer = null;
      attempt(v);
    }, Math.max(0, delay));
  }
  function finish(v) {
    if (!valid(v) || v.delivered) return;
    v.delivered = true;
    v.waiting = false;
    cancel();
    showReceipt(v.greeting.speakerName, v.greeting.text, 'Bar');
    // The line actually spoke: the titles system stamps greetedAt (its bag, its writer), so the
    // same title is never greeted twice even across stations and saves.
    if (v.greeting.titleSeenId) {
      bus.emit('title:arrivalGreeted', { seenId: v.greeting.titleSeenId, stationId: v.stationId });
    }
  }
  function attempt(v) {
    if (!valid(v) || v.delivered) return;
    v.waiting = false;
    const remaining = Math.max(v.anchor + ANCHOR_MS, competingAt + ANCHOR_MS) - now();
    if (remaining > 0 || receiptVisible()) {
      // A visible receipt always wins; the wait deadline yields to it rather than clobbering.
      if (receiptVisible() || now() < v.deadline) {
        schedule(Math.max(RETRY_MS, remaining));
        return;
      }
      finish(v);
      return;
    }
    const audio = state.settings?.audio || {};
    if (audio.muted || ['master', 'voice', 'comms'].some((key) => audio[key] === 0)
      || v.attempts >= MAX_ATTEMPTS) {
      finish(v);
      return;
    }
    v.attempts += 1;
    v.waiting = true;
    emitting = true;
    try {
      bus.emit('barkDirector:voice', {
        ...v.greeting, situation: 'patrol-greeting', importance: 0.55,
      });
    } finally { emitting = false; }
    // The registered audio adapter captions synchronously when admitted. Also allow a
    // delayed caption; silent arbitration drops retry within the actual emit budget.
    if (valid(v) && !v.delivered) schedule(CAPTION_MS);
  }
  function start(stationId) {
    if (!stationId || currentStation() !== stationId) return;
    if (visit?.stationId === stationId) return;
    cancel();
    // generateContacts can throw on malformed contact data — a failed greeting must never
    // take the station screen's onShow tail down with it.
    let greeting = null;
    try { greeting = buildStationArrivalGreeting(state, stationId); } catch { greeting = null; }
    visit = greeting ? { stationId, greeting, anchor: now(), anchored: false,
      delivered: false, attempts: 0, waiting: false, deadline: now() + MAX_WAIT_MS } : null;
    schedule(ANCHOR_MS);
  }
  function invalidate() { cancel(); visit = null; competingAt = -Infinity; }
  function on(event, handler) {
    bus.on(event, handler);
    subscriptions.push(() => bus.off(event, handler));
  }
  on('dock:committed', (payload = {}) => start(payload.stationId));
  on('dock:docked', (payload = {}) => {
    // Raw notifications never mint a visit: uiRoot's committed transition owns that.
    if (dockIntentStatus(state, payload) === 'stale' || payload.stationId !== currentStation()
      || visit?.stationId !== payload.stationId || visit.anchored) return;
    visit.anchor = now();
    visit.anchored = true;
    schedule(ANCHOR_MS);
  });
  for (const event of ['dock:undocked', 'save:restoring', 'game:new', 'game:newGame']) on(event, invalidate);
  on('barkDirector:voice', () => { if (!emitting) competingAt = now(); });
  on('tutorial:say', () => { competingAt = now(); });
  on('comms:popup', (payload = {}) => {
    if (['story', 'law', 'trap', 'mission', 'priority', 'danger', 'warning', 'alert'].includes(payload.category)) competingAt = now();
  });
  on('presentation:caption', (payload = {}) => {
    if (visit?.waiting && payload.shape === 'radio' && payload.text === visit.greeting.text) {
      finish(visit);
    } else { competingAt = now(); }
  });
  return {
    show() {
      if (disposed) return;
      visible = true;
      start(currentStation());
      if (visit && !visit.delivered) schedule(Math.max(RETRY_MS, visit.anchor + ANCHOR_MS - now()));
    },
    hide() { visible = false; cancel(); if (visit) visit.waiting = false; },
    dispose() {
      disposed = true; visible = false; invalidate();
      subscriptions.splice(0).forEach((off) => off());
    },
  };
}
