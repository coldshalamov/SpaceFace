// Saveable transmission playback. Pure transition functions; story is the only live writer.
import { endingDef, isEndingId } from './endingDefs.js';
import { compileFinaleContent, FINALE_CONTENT, FINALE_CONTENT_VERSION } from './finaleContent.js';
import { object, number, count, timestamp, text, key, freeze, clone } from './value.js';
export const WRITTEN_FINALE_SCHEMA = 'spaceface.writtenFinale.v1';
const MAX_BEATS = 48;
const MAX_TEXT = 1800;
const HUD_LIES = [null, 'stable_load', 'manifest_silent_correct', 'civilian_tag_flicker', 'phase3_freeze'];

export function createWrittenFinale(choiceId, facts, receiptId) {
  const def = endingDef(choiceId);
  if (!def || !isEndingId(def.id) || !facts) return null;
  const content = compileFinaleContent(def.id, facts);
  const now = Math.max(0, number(facts.simTime));
  return {
    schema: WRITTEN_FINALE_SCHEMA, contentVersion: FINALE_CONTENT_VERSION,
    choiceId: def.id, receiptId, title: def.title, subtitle: content.subtitle,
    startedAtS: now, nextAtS: now + content.beats[0].delayS,
    cursor: 0, completedAtS: null, objectiveQueued: false,
    // Readable, bounded evidence snapshot sealed BEFORE heat clear / rep grant / payment.
    basis: freeze({
      recordedAtS: now, seed: facts.seed, wealthBasis: facts.wealthBasis,
      credits: facts.credits, debt: facts.debt, netWorthCr: facts.netWorthCr,
      heatBefore: facts.heat, incidentCountLowerBound: facts.incidentIds.length,
      crimeCoverage: facts.crimeCoverage, killsNotClassifiedAsCrimes: facts.kills,
      smuggledValue: facts.smuggledValue, tradeCount: facts.tradeCount,
      lawfulContracts: facts.lawfulContracts, routeContracts: facts.routeContracts,
      factions: { concord: facts.scnRep, meridian: facts.mtsRep, free: facts.freeRep, quiet: facts.quietRep },
      explicitMercyCount: facts.explicitMercyCount, escapedOpponentCount: facts.escapedOpponentCount,
      namedEntries: facts.namedDebts.slice(0, 8).map(r => ({ ...r })), namedEntryTotal: facts.namedDebts.length,
      lungOutcome: facts.lungOutcome, archiveSources: facts.archiveSources.map(r => ({ ...r })),
      deepReachComplete: facts.deepReachComplete, independentWitness: facts.independentWitness,
      careerEvidence: facts.careerEvidence.slice(), evidence: facts.evidence.map(r => ({ ...r })),
    }),
    beats: freeze(content.beats.map((b, i) => ({ ...b, id: `${receiptId}:transmission:${i}` }))),
    epilogue: content.epilogue.slice(),
  };
}

/** Fail closed on corrupt/future payloads. Never recreate/reward a resolved ending during load. */
export function normalizeWrittenFinale(raw) {
  const r = object(raw), def = endingDef(r.choiceId);
  if (r.schema !== WRITTEN_FINALE_SCHEMA || r.contentVersion !== FINALE_CONTENT_VERSION
      || !def || !isEndingId(def.id) || !key(r.receiptId) || !timestamp(r.startedAtS)
      || !timestamp(r.nextAtS) || !Array.isArray(r.beats) || !r.beats.length || r.beats.length > MAX_BEATS
      || !Number.isInteger(r.cursor) || r.cursor < 0 || r.cursor > r.beats.length) return null;
  const beats = [];
  for (let i = 0; i < r.beats.length; i++) {
    const b = object(r.beats[i]);
    if (b.ordinal !== i || b.id !== `${r.receiptId}:transmission:${i}`
        || !timestamp(b.delayS) || b.delayS > 120) return null;
    if (b.kind === 'comms') {
      if (typeof b.text !== 'string' || !b.text.length || b.text.length > MAX_TEXT
          || typeof b.sender !== 'string' || b.sender.length > 160
          || !timestamp(b.ttl) || b.ttl < 1 || b.ttl > 120) return null;
      beats.push({ kind: 'comms', id: b.id, ordinal: i, delayS: b.delayS,
        sender: text(b.sender, 160), text: text(b.text, MAX_TEXT), ttl: b.ttl, category: 'story', persist: true,
        note: typeof b.note === 'string' ? text(b.note, MAX_TEXT) : null,
        ...(b.evidenceSlot ? { evidenceSlot: text(b.evidenceSlot, 32) } : {}) });
    } else if (b.kind === 'graffiti') {
      if (typeof b.line !== 'string' || !b.line.length || b.line.length > 400
          || !['bulkhead', 'airlock'].includes(b.where)) return null;
      beats.push({ kind: 'graffiti', id: b.id, ordinal: i, delayS: b.delayS,
        line: text(b.line, 400), where: b.where, beat: 7 });
    } else if (b.kind === 'hud') {
      if (b.phase !== 3 || !HUD_LIES.includes(b.lie)) return null;
      beats.push({ kind: 'hud', id: b.id, ordinal: i, delayS: b.delayS, phase: 3, beat: 7, lie: b.lie });
    } else return null; // a save cannot smuggle an economy/heat/world intent into presentation
  }
  if (r.cursor === beats.length && (!timestamp(r.completedAtS) || r.completedAtS < r.startedAtS)) return null;
  if (r.nextAtS < r.startedAtS) return null;
  const rawBasis = object(r.basis);
  // This bag is display-only, but cap its size and clone it so callers cannot cross-write the save.
  let basis = {};
  try { const encoded = JSON.stringify(rawBasis); if (encoded.length <= 18000) basis = JSON.parse(encoded); } catch { /* bad display evidence is omitted */ }
  return {
    schema: WRITTEN_FINALE_SCHEMA, contentVersion: FINALE_CONTENT_VERSION,
    choiceId: def.id, receiptId: r.receiptId, title: def.title, subtitle: FINALE_CONTENT[def.id].subtitle,
    startedAtS: r.startedAtS, nextAtS: r.nextAtS, cursor: r.cursor,
    completedAtS: r.cursor === beats.length ? r.completedAtS : null,
    objectiveQueued: r.objectiveQueued === true && r.cursor === beats.length,
    basis, beats,
    // Restore authored, known prose, not arbitrary saved side effects.
    epilogue: FINALE_CONTENT[def.id].epilogue.slice(),
  };
}

export function isWrittenFinaleActive(record) {
  return !!(record && record.schema === WRITTEN_FINALE_SCHEMA
    && Array.isArray(record.beats) && record.cursor < record.beats.length);
}

/** At most ONE presentation per fixed tick, even after a long jump in simTime. */
export function advanceWrittenFinale(record, simTime) {
  if (!isWrittenFinaleActive(record) || !timestamp(simTime) || simTime < record.nextAtS) {
    return { changed: false, completed: false, state: record, events: [] };
  }
  const b = record.beats[record.cursor];
  let event;
  if (b.kind === 'comms') event = { event: 'comms:popup', payload: {
    id: b.id, sender: b.sender, text: b.text, category: 'story', ttl: b.ttl, persist: true,
    note: b.note || undefined,
  } };
  else if (b.kind === 'graffiti') event = { event: 'graffiti:show', payload: {
    id: b.id, line: b.line, where: b.where, beat: 7, author: null,
  } };
  else if (b.kind === 'hud') event = { event: 'hud:phase', payload: { phase: 3, beat: 7, lie: b.lie } };
  else return { changed: false, completed: false, state: record, events: [], reason: 'invalid_beat' };
  const cursor = record.cursor + 1, completed = cursor === record.beats.length;
  const readingGap = b.kind === 'comms' ? b.ttl + 2 : 3;
  const nextAtS = simTime + (completed ? readingGap : Math.max(record.beats[cursor].delayS, readingGap));
  return { changed: true, completed, events: [event], state: {
    ...record, cursor, nextAtS, completedAtS: completed ? simTime : null,
  } };
}

/** The complete manuscript is inspectable immediately; replaying it never reruns reward intents. */
export function writtenEndingArchive(record) {
  if (!record || record.schema !== WRITTEN_FINALE_SCHEMA) return null;
  return clone({
    schema: 'spaceface.endingArchive.v1', choiceId: record.choiceId, receiptId: record.receiptId,
    title: record.title, subtitle: record.subtitle, recordedAtS: record.startedAtS,
    basis: record.basis, deliveredBeats: record.cursor,
    transmission: record.beats.filter(b => b.kind === 'comms' || b.kind === 'graffiti').map(b => ({
      id: b.id, kind: b.kind, sender: b.sender || 'BULKHEAD', text: b.text || b.line,
    })), epilogue: record.epilogue,
  });
}
export function endingAmbientLine(choiceId, index = 0) {
  const content = FINALE_CONTENT[choiceId];
  if (!content) return null;
  const i = count(index), [sender, line] = content.ambient[i % content.ambient.length];
  return { id: `ending_ambient_${choiceId}_${i}`, sender, text: line, category: 'ambient', ttl: 9, persist: false };
}
export const endingHomeGraffiti = id => FINALE_CONTENT[id]?.homeGraffiti || null;
export const endingContinuationLine = id => FINALE_CONTENT[id]?.completion || null;
