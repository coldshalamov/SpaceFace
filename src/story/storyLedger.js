// Berth reader for the campaign and the session.
// Reads receipts production already stores:
//   story.campaign47a.receipts (step, branch, chain, fail, ending, outpost, replay)
//   missions.receipts completion methods, when a settlement stored one
//   story beat receipts / beat flags, only for beats those receipts do not already name
//   scenario evidence tether hitch / cut
// Speaks one 'I was X, then Y, so I Z' for the campaign and, when the line
// was on a body, a second sentence for that session. No second writer.

import { beatDefAt, endingDef, outpostSpecDef } from './campaign47a/campaignData.js';

export const LEDGER_KIND = 'story-ledger';
export const LEDGER_BADGE = 'LEDGER';
export const LEDGER_SPEAKER = 'Mechanic';

const SPINDLE_ACTORS = new Set(['evidence_spindle_47a']);
const POD_ACTORS = new Set(['civilian_pod']);

const STEP_SPEECH = Object.freeze({
  '0:mine': Object.freeze({
    id: 'b0-mine', rank: 10,
    doing: 'sampling the variance', so: 'sampled the variance', then: 'the sample came in',
  }),
  '0:dock': Object.freeze({
    id: 'b0-dock', rank: 20,
    doing: 'docking the sample', so: 'docked the sample', then: 'the berth took the ship',
  }),
  '1:knock': Object.freeze({
    id: 'b1', rank: 30,
    doing: 'knocking the variance tower', so: 'knocked the variance tower', then: 'the contract closed',
  }),
  '2:pull': Object.freeze({
    id: 'b2', rank: 40,
    doing: 'pulling the pods under fire', so: 'pulled the pods under fire', then: 'the contract closed',
  }),
  '3:tow': Object.freeze({
    id: 'b3', rank: 50,
    doing: 'towing the slag core', so: 'towed the slag core', then: 'the contract closed',
  }),
  '6:asset_deploy': Object.freeze({
    id: 'b6', rank: 80,
    doing: 'deploying the yard drone', so: 'deployed the yard drone', then: 'the drone was on the plot',
  }),
});

const METHOD_SPEECH = Object.freeze({
  wrecking_ball: Object.freeze({
    id: 'b1', rank: 30,
    doing: 'knocking the variance tower with thrown mass',
    so: 'knocked the tower with thrown mass',
    then: 'the throw landed',
  }),
  cut_down: Object.freeze({
    id: 'b1', rank: 30,
    doing: 'cutting the variance tower down',
    so: 'cut the tower down',
    then: 'the cut landed',
  }),
  stage_tow: Object.freeze({
    id: 'b2', rank: 40,
    doing: 'pulling the pods into the yard dock',
    so: 'pulled the pods into the yard dock',
    then: 'the pods made the dock',
  }),
  corridor_pull: Object.freeze({
    id: 'b2', rank: 40,
    doing: 'reeling the pods through a corridor',
    so: 'reeled the pods through a corridor',
    then: 'the corridor closed',
  }),
  tow_in: Object.freeze({
    id: 'b3', rank: 50,
    doing: 'towing the slag core into the yard dock',
    so: 'towed the slag core into the yard dock',
    then: 'the core made the dock',
  }),
  sling_in: Object.freeze({
    id: 'b3', rank: 50,
    doing: 'slinging the slag core',
    so: 'slung the slag core at the yard dock',
    then: 'the sling left the line',
  }),
});

const FAIL_SPEECH = Object.freeze({
  0: Object.freeze({ doing: 'missing the sample', so: 'missed the sample' }),
  1: Object.freeze({ doing: 'missing the variance tower', so: 'missed the variance tower' }),
  2: Object.freeze({ doing: 'missing the pods', so: 'missed the pods' }),
  3: Object.freeze({ doing: 'missing the slag core', so: 'missed the slag core' }),
  4: Object.freeze({ doing: 'missing the intro', so: 'missed the intro' }),
  5: Object.freeze({ doing: 'missing the proving runs', so: 'missed the proving runs' }),
  6: Object.freeze({ doing: 'missing the yard drone', so: 'missed the yard drone' }),
});

const SIGNAL_THEN = Object.freeze({
  'mining:yield': 'the sample came in',
  'mining.yield': 'the sample came in',
  'dock:docked': 'the berth took the ship',
  'mission:completed': 'the contract closed',
  'mission:accepted': 'the intro was on the board',
  'asset:deployed': 'the drone was on the plot',
});

function clean(value) {
  const next = String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  return next || null;
}

function phrase(value) {
  const next = clean(value);
  if (!next) return null;
  return next.replace(/\./g, '').replace(/, then /g, ', ').replace(/, so I /g, ', ');
}

function asList(value) {
  return Array.isArray(value) ? value : [];
}

function atOf(raw, fallback = 0) {
  if (!raw || typeof raw !== 'object') return fallback;
  const n = Number(
    raw.atSimTime != null ? raw.atSimTime
      : raw.at_s != null ? raw.at_s
        : raw.simTime != null ? raw.simTime
          : raw.at,
  );
  return Number.isFinite(n) ? n : fallback;
}

function storyOf(state) {
  return state && state.story && typeof state.story === 'object' ? state.story : {};
}

function speakAct(speech, at, extra = {}) {
  if (!speech || !speech.id) return null;
  const doing = phrase(speech.doing);
  const so = phrase(speech.so);
  if (!doing || !so) return null;
  return {
    id: speech.id,
    rank: speech.rank,
    doing,
    so,
    then: phrase(extra.then || speech.then) || 'the receipt closed',
    at: Number.isFinite(at) ? at : 0,
    timed: !!extra.timed,
    specific: !!extra.specific,
    preferLater: !!extra.preferLater,
  };
}

function put(map, act) {
  if (!act) return;
  const prev = map.get(act.id);
  if (!prev) {
    map.set(act.id, act);
    return;
  }
  if (act.specific && !prev.specific) {
    map.set(act.id, {
      ...act,
      rank: prev.rank || act.rank,
      at: prev.timed ? prev.at : act.at,
      timed: prev.timed || act.timed,
    });
    return;
  }
  if (!act.specific && prev.specific) return;
  if (act.preferLater && act.at >= prev.at) {
    map.set(act.id, { ...act, rank: act.rank || prev.rank });
  }
}

function branchLabel(branch) {
  if (branch === 'traders') return "the traders' intro";
  if (branch === 'patrol') return 'the patrol intro';
  if (branch === 'free') return 'the free intro';
  return null;
}

function branchSpeech(branch) {
  const label = branchLabel(branch);
  if (!label) return null;
  return {
    id: 'b4', rank: 60,
    doing: `taking ${label}`,
    so: `took ${label}`,
    then: 'the intro was on the board',
  };
}

function chainSpeech(branch, progress, target, complete) {
  const name = branch === 'traders' ? "the traders'"
    : branch === 'patrol' ? 'the patrol'
      : branch === 'free' ? 'the free' : null;
  if (!name) return null;
  if (complete) {
    return {
      id: 'b5', rank: 70,
      doing: `finishing ${name} proving runs`,
      so: `finished ${name} proving runs`,
      then: 'the chain closed',
    };
  }
  const done = Math.max(0, Number(progress) || 0);
  const goal = Math.max(done, Number(target) || 0);
  return {
    id: 'b5', rank: 70,
    doing: `running ${name} proving runs`,
    so: `logged ${done} of ${goal} on ${name} proving runs`,
    then: 'the chain was still open',
  };
}

function endingSpeech(title) {
  const name = phrase(title);
  if (!name) return null;
  return {
    id: 'ending', rank: 100,
    doing: `weighing ${name}`,
    so: `chose ${name}`,
    then: 'the choice was filed',
  };
}

function outpostSpeech(role) {
  const name = phrase(role) || 'yard';
  return {
    id: 'outpost', rank: 90,
    doing: `tagging the ${name} outpost`,
    so: `tagged the ${name} outpost`,
    then: 'the tag was filed',
  };
}

function failSpeech(beatIndex, at) {
  const row = FAIL_SPEECH[beatIndex];
  if (!row) return null;
  return speakAct({
    id: `fail-${beatIndex}-${at}`,
    rank: (beatIndex + 1) * 10 + 5,
    doing: row.doing,
    so: row.so,
    then: 'the attempt failed',
  }, at, { timed: true });
}

function stepSpeech(beatIndex, stepId, signal) {
  if (beatIndex === 4 && stepId === 'branch_intro_accept') return null;
  if (beatIndex === 5 && stepId === 'chain_complete') return null;
  const row = STEP_SPEECH[`${beatIndex}:${stepId}`];
  if (!row) return null;
  const then = SIGNAL_THEN[signal] || row.then;
  return { ...row, then };
}

function expandCompletedBeat(map, beatIndex, at, timed, story) {
  const def = beatDefAt(beatIndex);
  if (!def || def.observeOnly) return;
  for (const step of def.steps || []) {
    if (step.id === 'branch_intro_accept') {
      put(map, speakAct(branchSpeech(story.branch), at, { timed }));
      continue;
    }
    if (step.id === 'chain_complete') {
      put(map, speakAct(chainSpeech(story.branch, 0, 0, true), at, { timed }));
      continue;
    }
    const speech = stepSpeech(def.beat, step.id, null);
    put(map, speakAct(speech, at, { timed }));
  }
}

function readCampaignReceipts(map, state) {
  const story = storyOf(state);
  const own = story.campaign47a && typeof story.campaign47a === 'object' ? story.campaign47a : null;
  for (const raw of asList(own && own.receipts)) {
    if (!raw || typeof raw !== 'object') continue;
    const kind = clean(raw.kind);
    const at = atOf(raw, 0);
    if (kind === 'replay_hook') {
      put(map, speakAct({
        id: 'replay', rank: 110,
        doing: 'keeping on after the ending',
        so: 'kept flying after the ending',
        then: 'the hook was filed',
      }, at, { timed: true }));
      continue;
    }
    if (kind === 'sandbox_continuation') {
      put(map, speakAct({
        id: 'ending', rank: 100,
        doing: 'staying out after the choice',
        so: 'kept flying',
        then: 'the bay took the ship back',
      }, at, { timed: true, specific: true }));
      continue;
    }
    if (kind === 'outpost_spec') {
      const spec = outpostSpecDef(raw.specializationId);
      const role = raw.role || (spec && spec.role) || null;
      put(map, speakAct(outpostSpeech(role), at, { timed: true, specific: true }));
      continue;
    }
    if (kind === 'ending_descriptor' || kind === 'ending_resolution' || raw.endingId) {
      const def = endingDef(raw.endingId);
      const title = (raw.meta && raw.meta.title) || (def && def.title) || raw.endingId;
      put(map, speakAct(endingSpeech(title), at, { timed: true, specific: true }));
      continue;
    }
    if (kind === 'encounter_fail') {
      const beat = Number.isFinite(raw.beatIndex) ? raw.beatIndex : null;
      put(map, failSpeech(beat, at));
      continue;
    }
    if (kind === 'branch_intro_accept') {
      put(map, speakAct(branchSpeech(raw.branch), at, { timed: true, specific: true }));
      continue;
    }
    if (kind === 'chain_progress') {
      put(map, speakAct(
        chainSpeech(raw.branch, raw.chainProgress, raw.chainTarget, !!raw.complete),
        at,
        { timed: true, specific: true, preferLater: true },
      ));
      continue;
    }
    if (kind !== 'step_progress') continue;
    const beatIndex = Number.isFinite(raw.beatIndex) ? raw.beatIndex : null;
    const stepId = clean(raw.stepId);
    if (beatIndex == null || !stepId) continue;
    if (stepId === 'branch_intro_accept') {
      put(map, speakAct(branchSpeech(raw.branch || story.branch), at, { timed: true }));
      continue;
    }
    if (stepId === 'chain_complete') {
      put(map, speakAct(chainSpeech(raw.branch || story.branch, 0, 0, true), at, { timed: true }));
      continue;
    }
    const speech = stepSpeech(beatIndex, stepId, clean(raw.signal));
    put(map, speakAct(speech, at, { timed: true, then: speech && speech.then }));
  }
}

function readMethodReceipts(map, state) {
  const missions = state && state.missions && typeof state.missions === 'object' ? state.missions : {};
  for (const raw of asList(missions.receipts)) {
    if (!raw || (raw.outcome && raw.outcome !== 'completed')) continue;
    const method = clean(raw.completionMethod);
    const speech = method && METHOD_SPEECH[method];
    if (!speech) continue;
    put(map, speakAct(speech, atOf(raw, 0), { timed: true, specific: true }));
  }
}

function readBeatReceipts(map, state) {
  const story = storyOf(state);
  const flags = story.flags && typeof story.flags === 'object' ? story.flags : {};
  let sawBeatReceipt = false;
  for (const raw of asList(story.receipts)) {
    if (!raw) continue;
    if (raw.kind && raw.kind !== 'story:beatAdvanced') continue;
    const fromIndex = Number.isFinite(raw.fromIndex) ? raw.fromIndex : null;
    if (fromIndex == null || fromIndex < 0 || fromIndex > 6) continue;
    sawBeatReceipt = true;
    expandCompletedBeat(map, fromIndex, atOf(raw, fromIndex), true, story);
  }
  for (let beat = 0; beat <= 6; beat += 1) {
    if (flags[`beat_${beat}_done`] === true) expandCompletedBeat(map, beat, beat, false, story);
  }
  if (!sawBeatReceipt && !asList(story.campaign47a && story.campaign47a.receipts).length) {
    const beatIndex = Number.isFinite(story.beatIndex) ? story.beatIndex | 0 : 0;
    for (let beat = 0; beat < Math.min(beatIndex, 7); beat += 1) {
      expandCompletedBeat(map, beat, beat, false, story);
    }
  }
  if (!map.has('ending') && story.endgameChoice) {
    const def = endingDef(story.endgameChoice);
    put(map, speakAct(endingSpeech(def && def.title || story.endgameChoice), 100, { timed: false }));
  }
}

function readSessionActs(state) {
  const events = asList(state && state.scenario && state.scenario.evidence && state.scenario.evidence.events);
  const rows = [];
  for (const raw of events) {
    if (!raw) continue;
    const type = clean(raw.type);
    const target = clean(raw.targetActorId);
    const at = Number(raw.simTime != null ? raw.simTime : raw.tick) || 0;
    if (type === 'tether:attached' && SPINDLE_ACTORS.has(target)) {
      rows.push(speakAct({
        id: 'session-hitch', rank: 0,
        doing: 'hitching the false-mass spindle',
        so: 'hitched the false-mass spindle',
        then: 'the line took',
      }, at, { timed: true }));
    } else if (type === 'tether:broken' && (POD_ACTORS.has(target) || SPINDLE_ACTORS.has(target))) {
      const pod = POD_ACTORS.has(target);
      rows.push(speakAct({
        id: pod ? 'session-cut-pod' : 'session-cut-spindle',
        rank: 1,
        doing: pod ? 'cutting for the pod' : 'cutting the spindle line',
        so: pod ? 'cut for the pod' : 'cut the spindle line',
        then: 'the line parted',
      }, at, { timed: true }));
    }
  }
  const map = new Map();
  for (const act of rows) put(map, act);
  return [...map.values()].sort((a, b) => a.at - b.at || a.rank - b.rank || a.id.localeCompare(b.id));
}

function sortCampaign(acts) {
  const timed = acts.filter((act) => act.timed);
  const gaps = acts.filter((act) => !act.timed);
  timed.sort((a, b) => a.at - b.at || a.rank - b.rank || a.id.localeCompare(b.id));
  gaps.sort((a, b) => a.rank - b.rank || a.id.localeCompare(b.id));
  if (!timed.length) return gaps;
  const out = timed.slice();
  for (const gap of gaps) {
    let index = 0;
    while (index < out.length && out[index].rank <= gap.rank) index += 1;
    out.splice(index, 0, gap);
  }
  return out;
}

function speak(acts) {
  if (!acts.length) return null;
  if (acts.length === 1) {
    const act = acts[0];
    return `I was ${act.doing}, then ${act.then}, so I ${act.so}.`;
  }
  const middle = acts.slice(1, -1).map((act) => act.doing);
  if (!middle.length) middle.push(acts[acts.length - 1].doing);
  const so = acts[acts.length - 1].so;
  return `I was ${acts[0].doing}, then ${middle.join(', then ')}, so I ${so}.`;
}

function campaignActs(state) {
  const map = new Map();
  readCampaignReceipts(map, state);
  readMethodReceipts(map, state);
  readBeatReceipts(map, state);
  return sortCampaign([...map.values()]);
}

/**
 * Campaign sentence, then the session line when a hitch or a cut is on the evidence.
 * Null when no receipt can fill the sentence.
 */
export function leftoverLedgerLine(state) {
  const line = [speak(campaignActs(state)), speak(readSessionActs(state))].filter(Boolean).join(' ');
  return line || null;
}

/**
 * Blind reader. Uses only the ledger prose. Returns the clauses in order,
 * campaign sentence first, session sentence after it.
 */
function retellSentence(sentence) {
  if (!sentence.startsWith('I was ') || !sentence.endsWith('.')) return [];
  const body = sentence.slice('I was '.length, -1);
  const soAt = body.lastIndexOf(', so I ');
  const thenAt = body.indexOf(', then ');
  if (soAt < 0 || thenAt < 0 || thenAt >= soAt) return [];
  const doing = body.slice(0, thenAt);
  const middle = body.slice(thenAt + ', then '.length, soAt);
  const so = body.slice(soAt + ', so I '.length);
  if (!doing || !middle || !so) return [];
  return [doing, ...middle.split(', then '), so];
}

export function retellLedger(prose) {
  const text = clean(prose);
  if (!text) return [];
  const told = [];
  for (const sentence of text.split(/(?<=\.)\s+/)) {
    told.push(...retellSentence(sentence));
  }
  return told;
}

/** Berth card. Reader only. */
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
