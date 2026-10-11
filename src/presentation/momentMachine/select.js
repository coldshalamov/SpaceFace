// Rank logged moments by payoff, causal clarity, visual continuity, and novelty.
// Boring tapes — boosts, lone marks, failed grammar — stay rejected.

import {
  MOMENT_SELECTION_SCHEMA,
  TICK_RATE,
  SCORE_THRESHOLD,
  CLARITY_MIN,
  MAX_RANKED,
  MAX_REJECTS,
  scoreOf,
  actorByRole,
} from './contract.js';
import { ingestStream } from './ingest.js';
import { matchGrammar, SHAPE_LABELS } from './grammar.js';
import { assessFootage, clipWindow, visualContinuity } from './shotPlan.js';

const HIGHLIGHT_LABELS = Object.freeze({
  logged_kill: 'Logged kill',
  logged_stunt: 'Logged stunt',
});

function loggedHighlights(events, claimed) {
  const matches = [];
  const list = Array.isArray(events) ? events : [];
  for (let i = 0; i < list.length; i += 1) {
    const event = list[i];
    if (!event || claimed.has(event.id)) continue;
    let shape = null;
    if (event.kind === 'kill' || event.kind === 'collision') shape = 'logged_kill';
    else if (event.kind === 'stunt') shape = 'logged_stunt';
    if (!shape) continue;
    const subject = actorByRole(event, 'subject') || actorByRole(event, 'actor');
    const secondary = actorByRole(event, 'actor');
    matches.push({
      shape,
      payoffTick: event.tick,
      causalityId: event.causalityId,
      subject,
      secondary: secondary && secondary !== subject ? secondary : null,
      payoff: shape === 'logged_stunt' ? 0.62 : 0.7,
      causalClarity: event.causalityId ? 0.7 : 0.55,
      reason: `Logged ${event.kind} ${event.id} from ${event.source}.`,
      eventIds: [event.id],
    });
  }
  return matches;
}

function momentId(seed, match) {
  const causality = match.causalityId || 'none';
  return `${seed}:${match.shape}:${causality}:${match.payoffTick}`;
}

function dedupeMatches(matches) {
  const best = new Map();
  for (let i = 0; i < matches.length; i += 1) {
    const match = matches[i];
    const key = match.causalityId
      ? `${match.shape}|${match.causalityId}`
      : `${match.shape}|${(match.eventIds && match.eventIds[0]) || ''}|${match.payoffTick}`;
    const held = best.get(key);
    if (!held || match.payoff > held.payoff || (match.payoff === held.payoff && match.payoffTick < held.payoffTick)) {
      best.set(key, match);
    }
  }
  return Array.from(best.values());
}

function toneOf(stream) {
  if (stream && (stream.tone === 'side-effect' || stream.tone === 'reject-case')) return stream.tone;
  return 'feat';
}

/**
 * Select and rank moments. `input` may be a moment stream or any ingestStream source.
 * The input object is not mutated.
 */
export function selectMoments(input) {
  const stream = input && input.schema === 'spaceface.momentStream.v1' && input.ok === true && Array.isArray(input.events)
    ? input
    : ingestStream(input);
  if (!stream || stream.ok === false) {
    return {
      ok: false,
      schema: MOMENT_SELECTION_SCHEMA,
      errors: stream && stream.errors ? stream.errors : ['missing-stream'],
      ranked: [],
      rejected: [],
      boring: true,
    };
  }
  const grammar = matchGrammar(stream.events);
  const claimed = new Set();
  for (let i = 0; i < grammar.matches.length; i += 1) {
    const ids = grammar.matches[i].eventIds || [];
    for (let j = 0; j < ids.length; j += 1) claimed.add(ids[j]);
  }
  const highlights = loggedHighlights(stream.events, claimed);
  const unique = dedupeMatches(grammar.matches.concat(highlights));
  unique.sort((a, b) => a.payoffTick - b.payoffTick || (a.shape < b.shape ? -1 : 1));
  const prior = new Map();
  const ranked = [];
  const rejected = grammar.rejects.slice(0, MAX_REJECTS);
  for (let i = 0; i < unique.length; i += 1) {
    const match = unique[i];
    const window = clipWindow(match.payoffTick);
    const seen = prior.get(match.shape) || 0;
    prior.set(match.shape, seen + 1);
    const novelty = Math.max(0, 1 - seen * 0.25);
    const continuity = visualContinuity(stream.samples, match.subject, window.inTick, window.outTick);
    const parts = {
      payoff: Math.max(0, Math.min(1, match.payoff)),
      causalClarity: Math.max(0, Math.min(1, match.causalClarity)),
      visualContinuity: continuity,
      novelty,
    };
    const score = scoreOf(parts);
    const footage = assessFootage(window.inTick, window.outTick, stream.samples, stream.window);
    const row = {
      id: momentId(stream.seed, match),
      shape: match.shape,
      label: SHAPE_LABELS[match.shape] || HIGHLIGHT_LABELS[match.shape] || match.shape,
      score,
      parts,
      inTick: window.inTick,
      outTick: window.outTick,
      payoffTick: window.payoffTick,
      tickRate: TICK_RATE,
      seconds: window.seconds,
      subject: match.subject,
      secondary: match.secondary,
      causalityId: match.causalityId,
      reason: match.reason,
      eventIds: match.eventIds.slice(),
      footage,
      tone: toneOf(stream),
    };
    if (parts.causalClarity < CLARITY_MIN || score < SCORE_THRESHOLD) {
      if (rejected.length < MAX_REJECTS) {
        rejected.push({
          shape: match.shape,
          reason: 'below-threshold',
          eventIds: match.eventIds.slice(),
          tick: match.payoffTick,
          score,
        });
      }
    } else {
      ranked.push(row);
    }
  }
  ranked.sort((a, b) => b.score - a.score || a.payoffTick - b.payoffTick || (a.id < b.id ? -1 : 1));
  if (ranked.length > MAX_RANKED) ranked.length = MAX_RANKED;
  for (let i = 0; i < ranked.length; i += 1) ranked[i].rank = i;
  const boring = ranked.length === 0;
  if (boring && rejected.length < MAX_REJECTS && grammar.matches.length === 0) {
    rejected.push({
      shape: null,
      reason: 'boring:no-grammar-match',
      eventIds: [],
      tick: 0,
    });
  }
  return {
    ok: true,
    schema: MOMENT_SELECTION_SCHEMA,
    seed: stream.seed,
    tone: toneOf(stream),
    ranked,
    rejected,
    boring,
    dropped: stream.dropped.slice(),
    stream,
  };
}

export function serializeSelection(selection) {
  return JSON.stringify(selection);
}

export function restoreSelection(text) {
  if (typeof text !== 'string' || !text) return null;
  let value = null;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (!value || value.schema !== MOMENT_SELECTION_SCHEMA || !Array.isArray(value.ranked)) return null;
  return value;
}
