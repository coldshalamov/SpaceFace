// Reader for leftover story receipts. Not a campaign owner.
// Reads leftover shapes production already writes: story:beatAdvanced,
// leftover 032 mission:completed completionMethod, leftover 47-A
// scenario evidence tether:attached / tether:broken (hitch / cut).
// Composes one leftover 'I was doing X, then Y, so I Z' for the berth.

export const LEDGER_KIND = 'story-ledger';
export const LEDGER_BADGE = 'LEDGER';
export const LEDGER_SPEAKER = 'Mechanic';

const SPINDLE_ACTORS = new Set(['evidence_spindle_47a']);
const POD_ACTORS = new Set(['civilian_pod']);

const METHOD_DOING = Object.freeze({
  wrecking_ball: 'knocking the variance tower',
  cut_down: 'cutting the variance tower down',
  stage_tow: 'pulling the pods under fire',
  corridor_pull: 'reeling the pods through a corridor',
  tow_in: 'towing the slag core',
  sling_in: 'slinging the slag core',
});

const METHOD_THEN = METHOD_DOING;

const METHOD_SO = Object.freeze({
  wrecking_ball: 'knocked the tower with thrown mass',
  cut_down: 'cut the tower down',
  stage_tow: 'pulled the pods to the dest dock',
  corridor_pull: 'reeled the pods through a corridor',
  tow_in: 'towed the slag core to the dest dock',
  sling_in: 'slung the slag core at the dest dock',
});

const BEAT_DOING = Object.freeze({
  0: 'sampling the variance',
  1: 'knocking the variance tower',
  2: 'pulling the pods under fire',
  3: 'towing the slag core',
});

const BEAT_THEN = BEAT_DOING;

const BEAT_SO = Object.freeze({
  0: 'sampled the variance and docked',
  1: 'knocked the variance tower',
  2: 'pulled the pods under fire',
  3: 'towed the slag core',
});

function leftoverLine(value) {
  const next = String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  return next || null;
}

function asList(value) {
  return Array.isArray(value) ? value : [];
}

function leftoverStoryBeats(state) {
  const story = state && state.story && typeof state.story === 'object' ? state.story : {};
  const flags = story.flags && typeof story.flags === 'object' ? story.flags : {};
  const rows = [];
  for (const raw of asList(story.receipts)) {
    if (!raw) continue;
    const fromIndex = Number.isFinite(raw.fromIndex) ? raw.fromIndex : null;
    const toIndex = Number.isFinite(raw.toIndex) ? raw.toIndex : null;
    if (fromIndex == null || toIndex == null) continue;
    if (raw.kind && raw.kind !== 'story:beatAdvanced') continue;
    rows.push({
      kind: 'story:beatAdvanced',
      fromIndex,
      toIndex,
      at: Number(raw.at_s != null ? raw.at_s : raw.atS) || 0,
    });
  }
  if (rows.length) return rows.sort((a, b) => a.at - b.at || a.fromIndex - b.fromIndex);

  const done = [];
  for (let beat = 0; beat <= 3; beat += 1) {
    if (flags[`beat_${beat}_done`] === true) done.push(beat);
  }
  const beatIndex = Number.isFinite(story.beatIndex) ? story.beatIndex | 0 : 0;
  if (!done.length && beatIndex > 0) {
    for (let beat = 0; beat < Math.min(beatIndex, 4); beat += 1) done.push(beat);
  }
  return done.map((beat, i) => ({
    kind: 'story:beatAdvanced',
    fromIndex: beat,
    toIndex: beat + 1,
    at: i,
  }));
}

function leftover032Receipts(state) {
  const missions = state && state.missions && typeof state.missions === 'object' ? state.missions : {};
  const rows = [];
  for (const raw of asList(missions.receipts)) {
    if (!raw || raw.outcome && raw.outcome !== 'completed') continue;
    const method = leftoverLine(raw.completionMethod);
    if (!method || !METHOD_DOING[method]) continue;
    rows.push({
      kind: 'mission:completed',
      type: leftoverLine(raw.type),
      completionMethod: method,
      storyTag: leftoverLine(raw.storyTag),
      at: Number(raw.at_s != null ? raw.at_s : raw.atS) || 0,
    });
  }
  return rows.sort((a, b) => a.at - b.at);
}

function leftover47aEvents(state) {
  const events = asList(state && state.scenario && state.scenario.evidence
    && state.scenario.evidence.events);
  const rows = [];
  for (const raw of events) {
    if (!raw) continue;
    const type = leftoverLine(raw.type);
    const target = leftoverLine(raw.targetActorId);
    if (type === 'tether:attached' && SPINDLE_ACTORS.has(target)) {
      rows.push({
        kind: 'leftover-47a-hitch',
        mechanic: 'massline.attach',
        targetActorId: target,
        at: Number(raw.simTime != null ? raw.simTime : raw.tick) || 0,
      });
    } else if (type === 'tether:broken' && (POD_ACTORS.has(target) || SPINDLE_ACTORS.has(target))) {
      rows.push({
        kind: 'leftover-47a-cut',
        mechanic: 'massline.cut',
        targetActorId: target,
        at: Number(raw.simTime != null ? raw.simTime : raw.tick) || 0,
      });
    }
  }
  return rows.sort((a, b) => a.at - b.at);
}

function doingPhrase(fact) {
  if (!fact) return null;
  if (fact.kind === 'leftover-47a-hitch') return 'hitching the false-mass spindle';
  if (fact.kind === 'leftover-47a-cut') {
    return POD_ACTORS.has(fact.targetActorId)
      ? 'cutting for the pod'
      : 'cutting the spindle line';
  }
  if (fact.kind === 'mission:completed') return METHOD_DOING[fact.completionMethod] || null;
  if (fact.kind === 'story:beatAdvanced') return BEAT_DOING[fact.fromIndex] || null;
  return null;
}

function thenPhrase(fact) {
  if (!fact) return null;
  if (fact.kind === 'leftover-47a-hitch') return 'hitching the false-mass spindle';
  if (fact.kind === 'leftover-47a-cut') {
    return POD_ACTORS.has(fact.targetActorId)
      ? 'cutting for the pod'
      : 'cutting the spindle line';
  }
  if (fact.kind === 'mission:completed') return METHOD_THEN[fact.completionMethod] || null;
  if (fact.kind === 'story:beatAdvanced') return BEAT_THEN[fact.fromIndex] || null;
  return null;
}

function soPhrase(fact) {
  if (!fact) return null;
  if (fact.kind === 'leftover-47a-hitch') return 'hitched the false-mass spindle';
  if (fact.kind === 'leftover-47a-cut') {
    return POD_ACTORS.has(fact.targetActorId)
      ? 'cut for the pod'
      : 'cut the spindle line';
  }
  if (fact.kind === 'mission:completed') return METHOD_SO[fact.completionMethod] || null;
  if (fact.kind === 'story:beatAdvanced') return BEAT_SO[fact.fromIndex] || null;
  return null;
}

function pickFacts(hitchCut, methods, beats) {
  const hitch = hitchCut.find((row) => row.kind === 'leftover-47a-hitch') || null;
  const cut = hitchCut.find((row) => row.kind === 'leftover-47a-cut') || null;
  const firstMethod = methods[0] || null;
  const lastMethod = methods.length > 1 ? methods[methods.length - 1] : null;
  const firstBeat = beats[0] || null;
  const lastBeat = beats.length > 1 ? beats[beats.length - 1] : beats[0] || null;

  const x = hitch || firstMethod || firstBeat;
  const z = lastMethod || cut || lastBeat;
  let y = cut && cut !== x && cut !== z
    ? cut
    : firstMethod && firstMethod !== x && firstMethod !== z
      ? firstMethod
      : beats[1] && beats[1] !== x && beats[1] !== z
        ? beats[1]
        : null;

  if (y && (y === x || y === z)) y = null;
  if (z && z === x) return { x, y: null, z: null };
  return { x, y, z };
}

/**
 * Leftover 'I was doing X, then Y, so I Z' from leftover receipts on state.
 * Returns null when leftover receipts cannot fill X, Y, and Z.
 */
export function leftoverLedgerLine(state) {
  const hitchCut = leftover47aEvents(state);
  const methods = leftover032Receipts(state);
  const beats = leftoverStoryBeats(state);
  const { x, y, z } = pickFacts(hitchCut, methods, beats);
  const doing = doingPhrase(x);
  const then = thenPhrase(y);
  const so = soPhrase(z);
  if (!doing || !then || !so) return null;
  return leftoverLine(`I was ${doing}, then ${then}, so I ${so}.`);
}

/** Leftover berth card fields. Reader only — no leftover write. */
export function leftoverLedgerCard(state) {
  const body = leftoverLedgerLine(state);
  if (!body) return null;
  return {
    badge: LEDGER_BADGE,
    title: LEDGER_SPEAKER,
    body,
    kind: LEDGER_KIND,
    tone: null,
    eventId: null,
  };
}

export function leftoverLedgerFor(state) {
  const card = leftoverLedgerCard(state);
  if (!card) {
    return { line: null, card: null, visible: false };
  }
  return { line: card.body, card, visible: true };
}
