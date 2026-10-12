// Campaign 47-A memory. One sidecar, no second spine.
// Writes only own.flags.spine and choice-log rows. Never beatIndex, credits, cargo,
// reputation, heat, or state.morrow. Morrow is read and, when noticed, copied.
//
// A failure replaces the open ask. It does not restore the ask from before the miss.
// The board builder applies that ask only when the caller passes options.state.
// Missions does not pass it yet; the bar and the ending already receive full state.

import { BRANCH_IDS } from './campaignData.js';
import { pushChoiceLog } from './campaignSchema.js';

const PAIR = Object.freeze({
  1: Object.freeze(['wrecking_ball', 'cut_down']),
  2: Object.freeze(['stage_tow', 'corridor_pull']),
  3: Object.freeze(['tow_in', 'sling_in']),
});
const PAIR_7 = Object.freeze({
  patrol: Object.freeze(['park_the_hulk', 'swing_the_wedge']),
  traders: Object.freeze(['wrecking_ball', 'cut_down']),
  free: Object.freeze(['tow_in', 'sling_in']),
});

const SCAR_DELTA = Object.freeze({
  targetStrength: 0.35,
  taskTime: 12,
  massU: 6,
  fValue: 0.15,
});

const SCAR = Object.freeze({
  0: 'The first cut went wide. Sample the marked face, then dock Helios.',
  1: 'The tower cracked. Swing mass through what still stands, or cut what is left.',
  2: 'A pod went cold. Pull the ones still answering, by a yard tow or a corridor reel.',
  3: 'The core drifted wide. Tow it in on the line, or sling it the rest of the way.',
  4: 'The introduction you were on failed. The other doors remain.',
  5: 'The proving leg came back short. The next one is heavier.',
  6: 'The first pad failed. Deploy the drone on the marked pad, not the scarred one.',
  7: 'The approach is scarred. Finish the climax by the solution you have not burned.',
});
const SCAR_HARD = Object.freeze({
  0: 'The marked face is the only sample left. Cut that face, then dock.',
  1: 'The spar is split and the tower leans. Finish it by mass or by cut.',
  2: 'Another pod has gone quiet. Pull whoever still answers. The field is worse.',
  3: 'The core is further out and turning. Tow it or sling it. The first line is gone.',
  4: 'That introduction has failed again. The other doors are still open.',
  5: 'The short leg was not a reset. The next haul, clear, or seal is heavier still.',
  6: 'Both near pads are scarred. Deploy further out on the marked pad.',
  7: 'The climax field is worse than the first attempt. Finish it. It does not reload.',
});
const OPEN_BRIEF = Object.freeze({
  cut_down: 'The throw missed. Cut the spar down.',
  wrecking_ball: 'The cut slipped. Throw the mass through the tower.',
  corridor_pull: 'The yard dock is hot. Reel the pods from the corridor.',
  stage_tow: 'The corridor collapsed. Tow a pod into the yard.',
  sling_in: 'The line parted. Sling the core the rest of the way.',
  tow_in: 'The sling missed the yard. Tow the core in on the line.',
  park_the_hulk: 'The wedge throw missed. Park the hulk on the Ashfall approach.',
  swing_the_wedge: 'The parked hulk did not hold. Swing it through the wedge.',
});
const OPEN_HARD = Object.freeze({
  cut_down: 'The throw missed twice. The spar is split. Cut what is left.',
  wrecking_ball: 'The cut slipped twice. Throw the mass through the lean.',
  corridor_pull: 'The dock is still hot. Reel the pods that are left.',
  stage_tow: 'The corridor is gone. Tow the last answering pod in.',
  sling_in: 'The line is gone. Sling the core from where it drifted.',
  tow_in: 'The sling is spent. Tow the core in from the drift.',
  park_the_hulk: 'The wedge is worse. Park the hulk and hold the approach.',
  swing_the_wedge: 'The park failed again. Swing the hulk through the wedge.',
});

function finite(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function clampBeat(value) {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n >= 0 && n <= 7 ? n : null;
}

function token(value) {
  if (typeof value !== 'string') return null;
  const next = value.trim();
  return /^[a-z0-9_]{1,40}$/.test(next) ? next : null;
}

function clip(value) {
  const next = String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  return next ? next.slice(0, 80) : 'encounter_failed';
}

function branchOf(state) {
  const branch = state && state.story && state.story.branch;
  return BRANCH_IDS.includes(branch) ? branch : null;
}

function pairFor(beat, branch) {
  if (beat === 7) return branch && PAIR_7[branch] ? PAIR_7[branch] : null;
  return PAIR[beat] || null;
}

export function methodFromPayload(payload, beat, branch) {
  if (!payload || typeof payload !== 'object') return null;
  const raw = token(payload.completionMethod) || token(payload.failedMethod);
  if (!raw) return null;
  const pair = pairFor(beat, branch);
  return pair && pair.includes(raw) ? raw : null;
}

function verbFrom(payload) {
  const verb = payload && token(payload.physicalVerb);
  return verb;
}

function liveMorrow(state) {
  const morrow = state && state.morrow;
  if (!morrow || typeof morrow !== 'object') return null;
  const launches = Math.max(0, Math.floor(Number(morrow.launches) || 0));
  const visits = Math.max(0, Math.floor(Number(morrow.visits) || 0));
  const met = morrow.met === true;
  const destroyed = morrow.destroyed === true;
  if (!met && !destroyed && launches <= 0 && visits <= 0) return null;
  return { met, destroyed, launches, visits };
}

function normalizeMorrow(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const stamp = {
    met: raw.met === true,
    destroyed: raw.destroyed === true,
    launches: Math.max(0, Math.min(1000000, Math.floor(Number(raw.launches) || 0))),
    visits: Math.max(0, Math.min(1000000, Math.floor(Number(raw.visits) || 0))),
  };
  return stamp.met || stamp.destroyed || stamp.launches > 0 || stamp.visits > 0 ? stamp : null;
}

function normalizeSituation(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const beat = clampBeat(raw.beat);
  if (beat == null) return null;
  const attempt = Math.max(1, Math.min(99, Math.floor(Number(raw.attempt) || 1)));
  const closedMethod = token(raw.closedMethod);
  const openMethod = token(raw.openMethod);
  const failedMethod = token(raw.failedMethod);
  const askId = token(String(raw.askId || '').replace(/-/g, '_'))
    || `b${beat}_a${attempt}_${closedMethod || 'scar'}`;
  const instruction = typeof raw.instruction === 'string' ? raw.instruction.replace(/\s+/g, ' ').trim().slice(0, 240) : '';
  if (!instruction) return null;
  return {
    beat,
    attempt,
    reason: clip(raw.reason),
    failedMethod,
    closedMethod,
    openMethod,
    askId,
    instruction,
    atS: finite(raw.atS) || 0,
    rearmed: raw.rearmed === true,
    rearmedAtS: finite(raw.rearmedAtS),
  };
}

function emptySpine() {
  return { v: 1, solved: {}, door: null, refused: [], situation: null, closed: [], morrow: null };
}

export function normalizeSpine(raw) {
  const out = emptySpine();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  if (raw.solved && typeof raw.solved === 'object' && !Array.isArray(raw.solved)) {
    for (const [key, value] of Object.entries(raw.solved)) {
      const beat = clampBeat(key);
      if (beat == null || !value || typeof value !== 'object') continue;
      out.solved[String(beat)] = {
        verb: token(value.verb),
        method: token(value.method),
        stepId: token(value.stepId),
        asset: deployKind(value),
        atS: finite(value.atS) || 0,
      };
    }
  }
  out.door = BRANCH_IDS.includes(raw.door) ? raw.door : null;
  if (Array.isArray(raw.refused)) {
    const refused = [];
    for (const id of BRANCH_IDS) {
      if (id !== out.door && raw.refused.includes(id)) refused.push(id);
    }
    out.refused = refused;
  }
  out.situation = normalizeSituation(raw.situation);
  if (Array.isArray(raw.closed)) {
    out.closed = raw.closed.map(normalizeSituation).filter(Boolean).slice(-8);
  }
  out.morrow = normalizeMorrow(raw.morrow);
  return out;
}

function load(own) {
  return normalizeSpine(own && own.flags && own.flags.spine);
}

function save(own, spine) {
  if (!own || typeof own !== 'object') return;
  if (!own.flags || typeof own.flags !== 'object' || Array.isArray(own.flags)) own.flags = {};
  own.flags.spine = spine;
}

function stampMorrow(spine, state) {
  const live = liveMorrow(state);
  if (live) spine.morrow = live;
}

function pushClosed(spine, situation) {
  if (!situation) return;
  spine.closed.push(situation);
  if (spine.closed.length > 8) spine.closed.splice(0, spine.closed.length - 8);
}

function provingInstruction(branch, attempt) {
  const hard = attempt >= 2;
  if (branch === 'traders') {
    return hard
      ? 'The short ledger was not a reset. Haul a heavier load than the last leg.'
      : 'The proving leg came back short. Haul a heavier ledger.';
  }
  if (branch === 'patrol') {
    return hard
      ? 'The last captain was not a reset. The next one hits harder.'
      : 'The proving leg came back short. The next captain hits harder.';
  }
  if (branch === 'free') {
    return hard
      ? 'The seal was not a reset. The next route runs hotter.'
      : 'The proving leg came back short. The sealed route runs hotter.';
  }
  return hard ? SCAR_HARD[5] : SCAR[5];
}

function instructionFor(beat, branch, openMethod, attempt) {
  if (beat === 5) return provingInstruction(branch, attempt);
  if (openMethod && OPEN_BRIEF[openMethod]) {
    return attempt >= 2 ? (OPEN_HARD[openMethod] || OPEN_BRIEF[openMethod]) : OPEN_BRIEF[openMethod];
  }
  return attempt >= 2 ? (SCAR_HARD[beat] || SCAR[beat]) : SCAR[beat];
}

export function readSpine(state) {
  const flags = state && state.story && state.story.campaign47a && state.story.campaign47a.flags;
  return normalizeSpine(flags && flags.spine);
}

const CLIMAX = Object.freeze({
  ashfall_blockade: Object.freeze({
    cite: 'the blockade run',
    withTower: 'You ran the blockade. I kept the tower.',
    alone: 'You ran the blockade. I watched it close.',
  }),
  ashfall_siege: Object.freeze({
    cite: 'the siege finished',
    withTower: 'You finished the siege. I kept the tower.',
    alone: 'You finished the siege. I watched it leave.',
  }),
  ashfall_evidence_tow: Object.freeze({
    cite: 'the evidence brought in',
    withTower: 'You brought the evidence. I kept the tower.',
    alone: 'You brought the evidence. I watched it land.',
  }),
  deep_reach: Object.freeze({
    cite: 'the deep reach finished',
    withTower: 'You finished the deep reach. I kept the tower.',
    alone: 'You finished the deep reach. I watched it.',
  }),
});

function storyFlags(state) {
  const flags = state && state.story && state.story.flags;
  return flags && typeof flags === 'object' && !Array.isArray(flags) ? flags : {};
}

/** The operation missions already marks done. Null until that flag is set. */
export function climaxNotice(state) {
  const flags = storyFlags(state);
  if (flags.deep_reach_operation_complete !== true) return null;
  return CLIMAX[flags.deep_reach_variant] || CLIMAX.deep_reach;
}

export function deployKind(payload) {
  const kind = payload && (token(payload.kind) || token(payload.asset));
  return kind === 'drone' || kind === 'trader' || kind === 'outpost' ? kind : null;
}

function solvedPhrase(row) {
  if (!row || typeof row !== 'object') return null;
  // Beat 7 reuses earlier method names for a different body. Do not call the climax the tower.
  if (row.beat === 7) {
    if (row.method === 'park_the_hulk') return 'the hulk parked';
    if (row.method === 'swing_the_wedge') return 'the wedge swung';
    if (row.method === 'cut_down') return 'the climax cut';
    if (row.method === 'wrecking_ball') return 'the climax thrown';
    if (row.method === 'sling_in') return 'the climax slung';
    if (row.method === 'tow_in' || row.verb === 'tow') return 'the climax towed';
    if (row.stepId === 'deep_reach' && row.verb) return 'the climax flown';
    return null;
  }
  if (row.method === 'cut_down') return 'the tower cut';
  if (row.method === 'wrecking_ball') return 'the tower thrown';
  if (row.verb === 'knock_down') return 'the tower knocked';
  if (row.method === 'corridor_pull') return 'the pods reeled';
  if (row.method === 'stage_tow') return 'the pods towed in';
  if (row.verb === 'pull') return 'the pods pulled';
  if (row.method === 'sling_in') return 'the core slung';
  if (row.method === 'tow_in' || row.verb === 'tow') return 'the core towed';
  if (row.verb === 'jam') return 'the approach jammed';
  if (row.stepId === 'dock') return 'the variance sample docked';
  if (row.stepId === 'mine') return 'the variance sampled';
  if (row.stepId === 'asset_deploy') {
    if (row.asset === 'drone') return 'the yard drone deployed';
    if (row.asset === 'trader') return 'the trader deployed';
    if (row.asset === 'outpost') return 'the outpost deployed';
    return 'the asset deployed';
  }
  if (row.stepId === 'chain_complete') return 'the proving runs finished';
  return null;
}

function roadPhrases(solved, suppressBareClimax) {
  const phrases = [];
  const seen = new Set();
  for (const row of solved || []) {
    if (suppressBareClimax && row.beat === 7 && !row.method) continue;
    const phrase = solvedPhrase(row);
    if (!phrase || seen.has(phrase)) continue;
    seen.add(phrase);
    phrases.push(phrase);
  }
  if (phrases.length <= 8) return phrases;
  return [...phrases.slice(0, 4), ...phrases.slice(-4)];
}

function citeParts(road) {
  const parts = [];
  if (road.door === 'traders') parts.push('the grain door taken');
  else if (road.door === 'patrol') parts.push('the patrol door taken');
  else if (road.door === 'free') parts.push('the free door taken');
  if (road.refused && road.refused.length === 1) parts.push('one door refused');
  else if (road.refused && road.refused.length > 1) parts.push(`${road.refused.length} doors refused`);
  const climaxKnown = (road.solved || []).some((row) => row.beat === 7 && row.method && solvedPhrase(row));
  const climax = !climaxKnown && road.climax ? road.climax : null;
  for (const phrase of roadPhrases(road.solved, !!climax)) parts.push(phrase);
  const misses = road.misses || [];
  if (misses.length === 1) parts.push('one scarred miss');
  else if (misses.length > 1) parts.push(`${misses.length} scarred misses`);
  if (climax) parts.push(climax);
  if (road.morrow && road.morrow.destroyed) parts.push('R-07 dark');
  else if (road.morrow && road.morrow.launches > 0) parts.push('R-07 launched this hull');
  else if (road.morrow && (road.morrow.met || road.morrow.visits > 0)) parts.push('R-07 met');
  return parts;
}

export function spineRoadFrom(state) {
  const spine = readSpine(state);
  const morrow = liveMorrow(state) || spine.morrow;
  const door = spine.door || branchOf(state);
  const refused = spine.refused.length
    ? spine.refused.slice()
    : (door ? BRANCH_IDS.filter((id) => id !== door) : []);
  const solved = Object.keys(spine.solved)
    .map((key) => Number(key))
    .sort((a, b) => a - b)
    .map((beat) => ({ beat, ...spine.solved[String(beat)] }));
  const misses = spine.closed.map(compactMiss);
  if (spine.situation) misses.push(compactMiss(spine.situation));
  const noticed = climaxNotice(state);
  const parts = citeParts({
    door, refused, solved, misses, morrow, climax: noticed && noticed.cite,
  });
  // A branch that exists only on the live cursor still belongs in the manuscript.
  if (!parts.length) return null;
  return {
    door,
    refused,
    solved,
    misses,
    morrow,
    cite: `The road retained: ${parts.join('; ')}.`,
  };
}

function compactMiss(situation) {
  return {
    beat: situation.beat,
    attempt: situation.attempt,
    askId: situation.askId,
    failedMethod: situation.failedMethod,
    closedMethod: situation.closedMethod,
    openMethod: situation.openMethod,
  };
}

function rememberedDoor(spine, story) {
  if (spine.door) return spine.door;
  return BRANCH_IDS.includes(story && story.branch) ? story.branch : null;
}

function rememberedRefused(spine, door) {
  if (spine.refused.length) return spine.refused;
  return door ? BRANCH_IDS.filter((id) => id !== door) : [];
}

function filedMaera(view) {
  if (!view.endgameChoice) return null;
  const tower = view.solved['1'];
  const sample = view.solved['0'];
  if (tower && tower.method === 'cut_down') return 'You cut the tower. I watched you file and leave.';
  if (tower && tower.method === 'wrecking_ball') return 'You threw the tower. I watched you file and leave.';
  if (tower && tower.verb === 'knock_down') return 'You knocked the tower. I watched you file and leave.';
  if (view.door === 'traders') return 'You took the grain door. I watched you file and leave.';
  if (view.door === 'patrol') return 'You took the patrol door. I watched you file and leave.';
  if (view.door === 'free') return 'You took the free door. I watched you file and leave.';
  if (sample && sample.stepId === 'dock') return 'You docked the sample. I watched you file and leave.';
  if (view.morrow && view.morrow.destroyed) return 'R-07 is dark. I watched you file and leave.';
  if (view.morrow && view.morrow.launches > 0) return 'R-07 threw you. I watched you file and leave.';
  if (view.morrow && view.morrow.met) return 'R-07 has your hull. I watched you file and leave.';
  return 'Same hull. I watched it leave and return.';
}

function maeraLine(view) {
  const sit = view.open;
  const solved1 = view.solved['1'];
  const solved0 = view.solved['0'];
  if (sit && sit.beat === 0 && solved0 && solved0.stepId === 'mine') return 'The sample is aboard. The dock still wants it.';
  if (sit && sit.beat === 0) return 'The sample missed. Take the marked face.';
  if (sit && sit.beat === 1 && sit.openMethod === 'cut_down') return 'The throw missed. Cut the spar.';
  if (sit && sit.beat === 1 && sit.openMethod === 'wrecking_ball') return 'The cut slipped. Throw the mass.';
  if (sit && sit.beat === 1) return 'The tower cracked. It is not the same one.';
  if (sit && sit.openMethod === 'corridor_pull') return 'The yard dock is hot. Reel the pods.';
  if (sit && sit.openMethod === 'stage_tow') return 'The corridor collapsed. Tow a pod in.';
  if (sit && sit.openMethod === 'sling_in') return 'The line parted. Sling the core in.';
  if (sit && sit.openMethod === 'tow_in') return 'The sling missed. Tow the core in.';
  if (sit && sit.openMethod === 'swing_the_wedge') return 'The park failed. Swing the hulk through.';
  if (sit && sit.openMethod === 'park_the_hulk') return 'The wedge missed. Park the hulk and hold.';
  if (sit) return 'That miss changed the job. It is still yours.';
  const filed = filedMaera(view);
  if (filed) return filed;
  if (view.climax && solved1) return view.climax.withTower;
  if (view.climax) return view.climax.alone;
  if (solved1 && solved1.method === 'cut_down') return 'You cut the tower. I kept the spar.';
  if (solved1 && solved1.method === 'wrecking_ball') return 'You threw the tower. The yard still rings.';
  if (solved1 && solved1.verb === 'knock_down') return 'You knocked the tower. The yard still rings.';
  if (solved0 && solved0.stepId === 'dock') return 'You docked the variance sample here.';
  if (solved0 && solved0.stepId === 'mine') return 'The variance sample is aboard. Dock it.';
  if (view.door === 'traders') return 'You took the grain door. I kept the others.';
  if (view.door === 'patrol') return 'You took the patrol door. I kept the others.';
  if (view.door === 'free') return 'You took the free door. I kept the others.';
  if (view.morrow && view.morrow.destroyed) return 'R-07 is dark. I still know your hull.';
  if (view.morrow && view.morrow.launches > 0) return 'R-07 threw you. I felt the yard move.';
  if (view.morrow && view.morrow.met) return 'R-07 has your hull. The engines stayed warm.';
  return null;
}

function filedHalev(view) {
  if (!view.endgameChoice) return null;
  const tower = view.solved['1'];
  const missedKnock = view.missed && tower && (tower.method === 'wrecking_ball' || tower.verb === 'knock_down' || tower.method === 'cut_down');
  if (missedKnock && tower.method === 'cut_down') return 'Filed: a miss, the cut, then the disposition.';
  if (missedKnock) return 'Filed: a miss, the knock, then the disposition.';
  if (tower && tower.method === 'cut_down') return 'Filed: the cut, then the disposition.';
  if (tower && (tower.method === 'wrecking_ball' || tower.verb === 'knock_down')) return 'Filed: the knock, then the disposition.';
  if (view.door === 'traders') return 'Filed: the grain door, then the disposition.';
  if (view.door === 'patrol') return 'Filed: the patrol door, then the disposition.';
  if (view.door === 'free') return 'Filed: the free door, then the disposition.';
  if (view.morrow && (view.morrow.met || view.morrow.destroyed || view.morrow.launches > 0)) {
    return 'Filed: R-07, then the disposition.';
  }
  if (view.solved['0']) return 'Filed: the sample, then the disposition.';
  return 'Filed: the disposition. The road stays in the margin.';
}

function halevLine(view) {
  const sit = view.open;
  const solved1 = view.solved['1'];
  const hadMiss = view.missed;
  if (sit && sit.openMethod === 'cut_down') return 'Filed: the throw failed. The cut is open.';
  if (sit && sit.openMethod === 'wrecking_ball') return 'Filed: the cut failed. The throw is open.';
  if (sit) return 'Filed: a miss. The work is not the same.';
  const filed = filedHalev(view);
  if (filed) return filed;
  if (hadMiss && solved1 && solved1.method === 'cut_down') return 'Filed: a miss, then the cut.';
  if (hadMiss && solved1 && (solved1.method === 'wrecking_ball' || solved1.verb === 'knock_down')) return 'Filed: a miss, then the knock.';
  if (solved1 && solved1.method === 'cut_down') return 'Filed: the cut. The throw never ran.';
  if (solved1 && solved1.method === 'wrecking_ball') return 'Filed: thrown mass. The cut never ran.';
  if (solved1 && !solved1.method && solved1.verb === 'knock_down' && view.door === 'traders') {
    return 'Filed: the knock, then the grain door.';
  }
  if (solved1 && !solved1.method && solved1.verb === 'knock_down' && view.door === 'patrol') {
    return 'Filed: the knock, then the patrol door.';
  }
  if (solved1 && !solved1.method && solved1.verb === 'knock_down' && view.door === 'free') {
    return 'Filed: the knock, then the free door.';
  }
  if (solved1 && !solved1.method && solved1.verb === 'knock_down') {
    return 'Filed: the tower fell. I did not see the hand.';
  }
  if (view.door === 'traders') return 'Filed: the grain door. Patrol and free refused.';
  if (view.door === 'patrol') return 'Filed: the patrol door. Grain and free refused.';
  if (view.door === 'free') return 'Filed: the free door. Grain and patrol refused.';
  if (view.morrow && view.morrow.destroyed) return 'Filed: R-07 is dark. The hull remains.';
  if (view.morrow && (view.morrow.met || view.morrow.launches > 0)) return 'Filed in the margin: you met R-07.';
  if (view.solved['0']) return 'Filed: variance sample. The berth signed.';
  return null;
}

function coldburnLine(view) {
  const core = view.solved['3'];
  const tower = view.solved['1'];
  if (view.door === 'free') return 'You took the free lane. I was already there.';
  if (view.door === 'traders') return 'You took the grain lane. I kept mine.';
  if (view.door === 'patrol') return 'You took the patrol lane. I kept mine.';
  if (view.refused.includes('free')) return 'You refused my lane. I kept the toll.';
  if (core && core.method === 'sling_in') return 'You slung the core. I watched the line leave.';
  if (core && core.method === 'tow_in') return 'You towed the core in. I saw the line.';
  if (core && core.verb === 'tow') return 'You brought the core in. I saw the hull.';
  if (tower && tower.method === 'cut_down') return 'You cut that tower. I remember the lane.';
  if (tower && (tower.method === 'wrecking_ball' || tower.verb === 'knock_down')) return 'You knocked a tower. I remember the lane.';
  return null;
}

function liraLine(view) {
  const tower = view.solved['1'];
  if (view.open) return 'I printed the miss. The job changed.';
  if (tower && tower.method === 'cut_down') return 'I printed the cut, not the throw.';
  if (tower && tower.method === 'wrecking_ball') return 'I printed the throw, not the cut.';
  if (view.door) return 'I printed the door you took and two left.';
  if (tower && tower.verb === 'knock_down') return 'I printed the knock. The yard kept it.';
  return null;
}

function orrinLine(view) {
  if (view.door === 'patrol' && view.open) return 'The patrol intro failed. The audit kept it.';
  if (view.door === 'patrol') return 'The audit names your patrol. Clean enough.';
  if (view.refused.includes('patrol')) return 'You refused the patrol. The audit kept it.';
  if (view.open || view.missed) return 'The audit kept the miss. It is not clean.';
  return null;
}

function latchLine(view) {
  const tower = view.solved['1'];
  if (view.open && view.open.openMethod === 'cut_down') return 'Found cracked tower. Held the cut.';
  if (view.open) return 'Found the miss. Held. Still delivering.';
  if (tower && tower.method === 'cut_down') return 'Found the cut. Held. Delivered.';
  if (tower && tower.method === 'wrecking_ball') return 'Found the throw. Held. Delivered.';
  if (tower && tower.verb === 'knock_down') return 'Found the knock. Held. Delivered.';
  return null;
}

function skerLine(view) {
  if (view.door === 'free') return 'You paid the toll by taking my lane.';
  if (view.refused.includes('free')) return 'You walked my toll and did not pay.';
  return null;
}

function zellLine(view) {
  const tower = view.solved['1'];
  if (view.open && view.open.beat === 1) return 'Park the scarred job. No warranty on it.';
  if (tower && tower.method === 'cut_down') return 'The weld saw a cut, not a crush.';
  if (tower && tower.method === 'wrecking_ball') return 'The weld saw a crush, not a cut.';
  if (tower && tower.verb === 'knock_down') return 'The weld saw the tower fall.';
  return null;
}

function maraLine(view) {
  const pods = view.solved['2'];
  if (view.open && view.open.beat === 2) return 'The pods got colder. Pull the ones left.';
  if (pods && pods.method === 'stage_tow') return 'You towed them in. Three of us still wait.';
  if (pods && pods.method === 'corridor_pull') return 'You reeled a corridor. We still need room.';
  if (pods && pods.verb === 'pull') return 'You pulled the pods. Three of us still wait.';
  return null;
}

function irenLine(view) {
  const tower = view.solved['1'];
  if (view.door) return 'The clause names your door. Transcript kept.';
  if (tower && tower.method === 'cut_down') return 'The clause names the cut. Transcript kept.';
  if (tower && tower.method === 'wrecking_ball') return 'The clause names the throw. Transcript kept.';
  return null;
}

function sennaLine(view) {
  const tower = view.solved['1'];
  if (view.open || view.missed) return 'I wrote the miss. The dark kept that.';
  if (tower && tower.method === 'cut_down') return 'I wrote the cut down. The dark kept it.';
  if (tower && tower.method === 'wrecking_ball') return 'I wrote the throw. The dark kept it.';
  if (tower && tower.verb === 'knock_down') return 'I wrote the knock. The dark kept it.';
  if (view.door) return 'I wrote the door. The dark kept the rest.';
  return null;
}

function questionLine(view) {
  const tower = view.solved['1'];
  if (tower && tower.method === 'cut_down') return 'Cut down. That was carried. Answer.';
  if (tower && tower.method === 'wrecking_ball') return 'Thrown mass. That was carried. Answer.';
  if (tower && tower.verb === 'knock_down') return 'The tower fell. What was carried. Answer.';
  if (view.door) return 'One door taken. Two refused. Answer.';
  if (view.morrow && view.morrow.met) return 'R-07 was met. What was owed. Answer.';
  return null;
}

function yuneLine(view) {
  if (view.open || view.missed) return 'The miss is sealed. Re-opening costs a fee.';
  if (view.door) return 'Your door is sealed. The fee still stands.';
  return null;
}

const GREETING = Object.freeze({
  contact_maera_vols: maeraLine,
  contact_halev_doss: halevLine,
  contact_coldburn_rey: coldburnLine,
  contact_lira_vonn: liraLine,
  contact_orrin: orrinLine,
  contact_latch_child: latchLine,
  contact_sker_vane: skerLine,
  contact_tinker_zell: zellLine,
  contact_mara_children: maraLine,
  contact_iren_suhl: irenLine,
  contact_dustwife_senna: sennaLine,
  contact_question: questionLine,
  contact_yune: yuneLine,
});

function viewOf(state) {
  const spine = readSpine(state);
  const story = state && state.story && typeof state.story === 'object' ? state.story : {};
  const beat = Number.isFinite(story.beatIndex) ? story.beatIndex | 0 : 0;
  const climax = climaxNotice(state);
  const situation = spine.situation;
  // The finished operation is not still the open ask, even though the miss stays filed.
  const climaxClosed = !!(climax && situation && situation.beat === 7);
  const open = situation && situation.beat >= beat && !climaxClosed ? situation : null;
  return {
    solved: spine.solved,
    door: rememberedDoor(spine, story),
    refused: rememberedRefused(spine, rememberedDoor(spine, story)),
    open,
    missed: spine.closed.length > 0 || (!!situation && !climaxClosed),
    morrow: liveMorrow(state) || spine.morrow,
    climax,
    endgameChoice: typeof story.endgameChoice === 'string' ? story.endgameChoice : null,
  };
}

export function spineGreeting(contactId, state) {
  if (contactId === 'contact_filecleaver_dorin' || contactId === 'contact_wraith_kell') return null;
  const speak = GREETING[contactId];
  if (!speak) return null;
  const line = speak(viewOf(state));
  if (!line) return null;
  const words = String(line).trim().split(/\s+/).filter(Boolean);
  return words.length > 0 && words.length <= 12 ? line : null;
}

function logged(own, kind, pred) {
  return Array.isArray(own.choiceLog) && own.choiceLog.some((row) => row && row.kind === kind && pred(row));
}

export function noteSpineSignal(state, own, payload, simTime) {
  if (!own) return;
  const spine = load(own);
  const live = liveMorrow(state);
  let dirty = false;
  if (live && JSON.stringify(spine.morrow) !== JSON.stringify(live)) {
    spine.morrow = live;
    dirty = true;
  }
  const refused = payload && (token(payload.refusedBranch) || token(payload.declinedBranch));
  if (refused && BRANCH_IDS.includes(refused) && spine.door !== refused && !spine.refused.includes(refused)) {
    spine.refused.push(refused);
    dirty = true;
    if (!logged(own, 'spine_refused', (row) => row.branch === refused)) {
      pushChoiceLog(own, { kind: 'spine_refused', branch: refused }, simTime);
    }
  }
  if (dirty) save(own, spine);
}

export function noteSpineStep(state, own, info) {
  if (!own || !info) return;
  const beat = clampBeat(info.beat);
  if (beat == null) return;
  const spine = load(own);
  stampMorrow(spine, state);
  const branch = branchOf(state);
  const method = methodFromPayload(info.payload, beat, branch);
  const verb = verbFrom(info.payload);
  const stepId = token(info.stepId);
  const asset = deployKind(info.payload);
  const prev = spine.solved[String(beat)] || {};
  spine.solved[String(beat)] = {
    verb: verb || prev.verb || null,
    method: method || prev.method || null,
    stepId: stepId || prev.stepId || null,
    asset: asset || prev.asset || null,
    atS: finite(info.simTime) || 0,
  };
  if (info.stepsComplete && spine.situation && spine.situation.beat === beat) {
    pushClosed(spine, spine.situation);
    spine.situation = null;
  }
  save(own, spine);
  const solved = spine.solved[String(beat)];
  if ((method || verb || info.stepsComplete) && !logged(own, 'spine_solved', (row) => row.beat === beat && row.method === solved.method && row.verb === solved.verb && row.stepId === solved.stepId)) {
    pushChoiceLog(own, {
      kind: 'spine_solved', beat, method: solved.method, verb: solved.verb, stepId: solved.stepId,
    }, info.simTime || 0);
  }
}

export function noteSpineDoor(state, own, branch, simTime) {
  if (!own || !BRANCH_IDS.includes(branch)) return;
  const spine = load(own);
  stampMorrow(spine, state);
  spine.door = branch;
  spine.refused = BRANCH_IDS.filter((id) => id !== branch);
  save(own, spine);
  if (!logged(own, 'spine_door', (row) => row.branch === branch)) {
    pushChoiceLog(own, { kind: 'spine_door', branch, refused: spine.refused.slice() }, simTime);
  }
}

export function noteSpineFailure(state, own, beatIndex, reason, extra, simTime) {
  if (!own) return null;
  const beat = clampBeat(beatIndex);
  if (beat == null) return null;
  const spine = load(own);
  stampMorrow(spine, state);
  const branch = branchOf(state);
  const method = methodFromPayload(extra, beat, branch);
  const pair = pairFor(beat, branch);
  const existing = spine.situation;
  const prev = existing && existing.beat === beat ? existing : null;
  // A later miss must not erase an earlier one. The old ask is filed, then replaced.
  if (existing && !prev) pushClosed(spine, existing);
  let closedMethod = null;
  let openMethod = null;
  if (method && pair && pair.includes(method)) {
    closedMethod = method;
    openMethod = pair.find((candidate) => candidate !== method) || null;
  } else if (prev && prev.closedMethod && (!pair || pair.includes(prev.closedMethod))) {
    closedMethod = prev.closedMethod;
    openMethod = prev.openMethod;
  }
  const attempt = Math.max(1, (own.failuresByBeat && own.failuresByBeat[String(beat)]) | 0);
  if (prev) pushClosed(spine, prev);
  const situation = {
    beat,
    attempt,
    reason: clip(reason),
    failedMethod: method,
    closedMethod,
    openMethod,
    askId: `b${beat}_a${attempt}_${closedMethod || 'scar'}`,
    instruction: instructionFor(beat, branch, openMethod, attempt),
    atS: finite(simTime) || 0,
    rearmed: false,
    rearmedAtS: null,
  };
  spine.situation = situation;
  save(own, spine);
  pushChoiceLog(own, {
    kind: 'spine_situation',
    beat,
    askId: situation.askId,
    attempt,
    closedMethod,
    openMethod,
  }, simTime);
  return situation;
}

export function noteSpineRecover(own, beatIndex, simTime) {
  if (!own) return;
  const spine = load(own);
  if (!spine.situation || spine.situation.beat !== clampBeat(beatIndex)) return;
  spine.situation = { ...spine.situation, rearmed: true, rearmedAtS: finite(simTime) || 0 };
  save(own, spine);
}

export function noteSpineBeatChanged(own, from, to) {
  if (!own || from == null || from === to) return;
  const spine = load(own);
  if (!spine.situation || spine.situation.beat !== from) return;
  pushClosed(spine, spine.situation);
  spine.situation = null;
  save(own, spine);
}

function round3(value) {
  return Math.round(value * 1000) / 1000;
}

function scarParams(params, situation) {
  const next = { ...(params || {}) };
  const attempt = Math.max(1, situation.attempt | 0);
  if (Array.isArray(params && params.completionMethods)) {
    const methods = params.completionMethods.slice();
    if (situation.closedMethod && methods.includes(situation.closedMethod)) {
      const open = methods.filter((method) => method !== situation.closedMethod);
      next.completionMethods = open.length >= 1 && open.length < methods.length ? open : methods;
    } else {
      next.completionMethods = methods;
    }
  }
  for (const key of Object.keys(SCAR_DELTA)) {
    if (Number.isFinite(next[key])) next[key] = round3(next[key] + SCAR_DELTA[key] * attempt);
  }
  if (Number.isFinite(next.qty) && next.qty > 0) next.qty = next.qty + attempt;
  next.situationAsk = situation.askId;
  return next;
}

/** Mutate a freshly built offer. No-op unless options.state carries an open situation for this beat. */
export function adjustBoardOffer(offer, beat, options = {}) {
  if (!offer || !options || !options.state) return offer;
  const situation = readSpine(options.state).situation;
  if (!situation || situation.beat !== beat || !situation.instruction) return offer;
  return {
    ...offer,
    brief: situation.instruction,
    params: scarParams(offer.params, situation),
  };
}
