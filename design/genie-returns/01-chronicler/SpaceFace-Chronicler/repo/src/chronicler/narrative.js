import { label, clone, compareId } from './schema.js';

const COMPLETE_STAGES = ['kill', 'aftermath', 'salvage', 'recovered', 'sold', 'law'];
const SURFACE_TEXT = { terrain: 'terrain', craft: 'another craft', structure: 'a structure' };
const victimName = f => f?.subject?.player ? 'your ship' : f?.subject?.name || 'an unnamed ship';
const pilotName = f => f?.actor?.player ? 'You' : f?.actor?.name || 'An unknown pilot';
const sectorName = f => label(f?.zoneName || f?.sectorName || f?.sectorId);
const stationName = f => label(f?.stationName || f?.stationId, 'a station');
// Do not round a small, positive cargo receipt down to a fictitious zero.
function quantity(n) { return String(n); }
function killLine(f) {
  const target = victimName(f);
  if (['terrain_collision', 'ship_collision'].includes(f.details.cause)) {
    return `${target} was destroyed in a collision with ${SURFACE_TEXT[f.details.surface] || 'another body'} in ${sectorName(f)}.`;
  }
  if (f.actor.id === null && !f.actor.player) return `${target} was destroyed in ${sectorName(f)}.`;
  return `${pilotName(f)} destroyed ${target} in ${sectorName(f)}.`;
}
function pathsFrom(story) {
  const byId = new Map(story.nodes.map(n => [n.id, n]));
  const children = new Map();
  for (const edge of story.edges) {
    if (!children.has(edge.from)) children.set(edge.from, []);
    children.get(edge.from).push(edge.to);
  }
  const paths = [];
  function walk(node, path) {
    const next = [...path, node];
    paths.push(next);
    if (next.length >= 12) return;
    for (const key of children.get(node.id) || []) {
      if (!next.some(n => n.id === key) && byId.has(key)) walk(byId.get(key), next);
    }
  }
  for (const n of story.nodes) if (n.stage === 'kill') walk(n, []);
  return paths;
}
function progressOf(path) {
  let i = 0;
  for (const fact of path) if (fact.stage === COMPLETE_STAGES[i]) i++;
  return i;
}
function visibilityOf(nodes) {
  return nodes.some(n => n.visibility === 'private') ? 'private'
    : nodes.some(n => n.visibility === 'player') ? 'player' : 'public';
}

/** Pure, evidence-only language. No dice, no witnesses/motives invented, no outcome mutation. */
export function buildStoryView(story) {
  const ns = story.nodes;
  const kills = ns.filter(n => n.stage === 'kill');
  const aces = ns.filter(n => n.stage === 'ace');
  const rescues = ns.filter(n => n.stage === 'rescue');
  const wanted = ns.filter(n => n.stage === 'wanted');
  const reactor = ns.filter(n => n.stage === 'reactor');
  const remedy = ns.find(n => n.stage === 'remedy' && n.parentStatus === 'resolved');
  const paths = pathsFrom(story).sort((a, b) => progressOf(b) - progressOf(a)
    || b.length - a.length || a[0].seq - b[0].seq);
  const best = paths[0] || [];
  const progress = progressOf(best);
  const kill = best[0] || kills[0];
  let kind = 'record', score = 0, title = 'A mark in the record', summary = '';
  let radio = '', complete = false;
  if (kill) {
    score = kill.actor.player ? 22 : 6;
    if (['terrain_collision', 'ship_collision'].includes(kill.details.cause)) score += 22;
    if (['station', 'capital'].includes(kill.details.victimClass)) score += 20;
    score += Math.min(24, Math.max(0, kills.length - 1) * 8);
    kind = 'battle'; title = `Loss recorded in ${sectorName(kill)}`; summary = killLine(kill);
    if (kills.length > 1) summary += ` ${kills.length} ship losses share this recorded encounter; their individual causes remain separate.`;
    if (progress >= 2) { score += 8; kind = 'battle_aftermath'; summary += ' An identified wreck or cargo manifest remains in the record.'; }
    if (progress >= 3) {
      score += 14; kind = 'battle_salvage'; title = `The wreck of ${victimName(kill)}`;
      summary = `${killLine(kill)} Its wreck was subsequently processed for salvage.`;
    }
    if (progress >= 4) {
      const recovery = best.find(n => n.stage === 'recovered');
      score += 8; kind = 'battle_recovery';
      summary += ` ${pilotName(recovery)} recovered ${quantity(recovery.details.qty)} units of ${label(recovery.details.commodityId, 'cargo')}.`;
    }
    if (progress >= 5) {
      const sale = best.find(n => n.stage === 'sold');
      score += 18; kind = 'combat_salvage_economy'; title = `A wreck reaches the market`;
      summary += ` ${quantity(sale.details.qty)} of those units were sold at ${stationName(sale)} for ${quantity(sale.details.total)} credits.`;
    }
    if (progress >= 6) {
      const law = best.find(n => n.stage === 'law');
      score += 20; kind = 'combat_salvage_economy_law'; complete = true;
      title = `The wreck left a paper trail`;
      summary += ` A ${law.details.kind} receipt explicitly names that sale as its cause.`;
    }
    radio = progress >= 5
      ? `Remember ${victimName(kill)}? The wreck was cut, the cargo sold${complete ? ', and the sale drew a recorded legal consequence' : ''}. ${sectorName(kill)} has a history now.`
      : progress >= 3 ? `Remember the wreck of ${victimName(kill)} in ${sectorName(kill)}? The salvage work is finished. The record stays.`
      : `${killLine(kill)} That loss is still in the archive.`;
  }
  if (aces.length) {
    const ace = aces[aces.length - 1];
    const name = ace.subject.name;
    const transitions = aces.map(a => a.details.transition);
    const fled = transitions.includes('fled');
    const returnedAfterEscape = aces.some((a, i) => a.details.transition === 'returned'
      && aces.slice(0, i).some(p => p.details.transition === 'fled'));
    kind = 'ace_saga'; score = Math.max(score, 30);
    title = `${name}: a continuing record`;
    if (ace.details.transition === 'defeated') {
      score = Math.max(score, returnedAfterEscape ? 82 : 58);
      summary = `${name} was defeated${returnedAfterEscape ? ' after escaping and returning to the field' : ''}.`;
    } else if (ace.details.transition === 'returned') {
      score = Math.max(score, fled ? 70 : 48);
      summary = `${name} has returned${fled ? '; an earlier escape is on record' : ' to the field'}.`;
    } else if (ace.details.transition === 'fled') {
      score = Math.max(score, 44); summary = `${name} escaped. The encounter is remembered, but their motive is not known.`;
    } else if (ace.details.transition === 'flung') {
      score = Math.max(score, 42); summary = `${name} was flung during an encounter. No kill is implied.`;
    } else summary = `${name} was encountered in ${sectorName(ace)}.`;
    radio = returnedAfterEscape ? `Remember ${name}, the captain who got away? ${summary}` : summary;
  } else if (rescues.length && (!kill || score < 45)) {
    const f = rescues[0]; kind = 'rescue'; score = Math.max(score, f.actor.player ? 48 : 35);
    title = `A rescue in ${sectorName(f)}`;
    summary = `${pilotName(f)} rescued ${f.subject.name} in ${sectorName(f)}.`;
    radio = `One for the rescue log: ${summary}`;
  } else if (wanted.length && !kill) {
    const f = wanted[wanted.length - 1];
    const peak = Math.max(...wanted.map(w => Math.max(w.details.level, w.details.previousLevel)));
    score = 30 + peak * 8; kind = f.details.cleared ? 'wanted_cleared' : 'wanted';
    title = f.details.cleared ? 'The search flag came down' : 'A WANTED signal';
    summary = f.details.cleared
      ? `Your WANTED flag cleared after reaching level ${peak}. This records a status change, not an acquittal.`
      : `Your WANTED signal reached level ${peak} in ${sectorName(f)}.`;
    radio = f.details.cleared ? `The WANTED signal cleared. The earlier level-${peak} search remains on the record.` : summary;
  } else if (remedy) {
    kind = 'aftermath_remedied'; score = Math.max(score, 58); title = 'An aftermath answered';
    summary = `A recorded ${remedy.details.kind} consequence was remedied${remedy.details.missionId ? ` through mission ${remedy.details.missionId}` : ''}.`;
    radio = summary;
  } else if (reactor.length && (!kill || score < 42)) {
    const f = reactor[reactor.length - 1]; kind = 'reactor_action'; score = Math.max(score, 42);
    const outcome = f.details.outcome === 'reactorVented' ? 'was vented'
      : f.details.outcome === 'reactorTowedClear' ? 'was towed clear' : 'burst';
    title = `A reactor ${outcome}`; summary = `A wreck reactor ${outcome} in ${sectorName(f)}.`;
    radio = summary;
  }
  if (!summary) {
    const f = ns.find(n => n.stage === 'trade') || ns.find(n => !['binding', 'cause'].includes(n.stage)) || ns[0];
    if (f.stage === 'trade') {
      kind = 'trade'; score = f.details.total >= 1000 ? 30 : 8; title = `A sale at ${stationName(f)}`;
      summary = `${quantity(f.details.qty)} units of ${label(f.details.commodityId, 'cargo')} sold for ${quantity(f.details.total)} credits. Their source is not in this receipt.`;
    } else if (f.stage === 'scan') {
      kind = 'contraband_scan'; score = 36; title = 'Contraband found';
      summary = `A scan found contraband in ${sectorName(f)}. A specific legal consequence has not been linked.`;
    } else if (f.stage === 'salvage') {
      kind = 'salvage'; score = 20; title = 'Salvage processing complete';
      summary = 'A wreck was processed. Its destruction and subsequent cargo custody are not yet linked.';
    } else if (f.stage === 'aftermath') {
      kind = 'aftermath'; score = 16; title = 'An aftermath recorded';
      summary = `An identified wreck or manifest was recorded in ${sectorName(f)}. Its destruction receipt is not linked.`;
    } else if (['recovered', 'sold', 'law'].includes(f.stage)) {
      kind = 'unlinked_provenance'; score = 12; title = 'A receipt awaiting its source';
      summary = `A ${f.stage} receipt was recorded. Its upstream chain is not complete.`;
    } else { score = 4; summary = 'A simulation fact was retained for possible later connection.'; }
    radio = summary;
  }
  const evidence = ns.map(f => ({
    id: f.id, sourceEvent: f.event, sourceReceiptId: f.externalId, stage: f.stage,
    t: f.t, tick: f.tick, actor: clone(f.actor), subject: clone(f.subject),
    sectorId: f.sectorId, stationId: f.stationId, factionId: f.factionId,
    details: clone(f.details), parent: clone(f.parent), parentStatus: f.parentStatus,
  }));
  const milestoneFacts = ns.filter(f => !['binding', 'cause'].includes(f.stage));
  return {
    id: story.id, revision: story.revision, kind, complete,
    score: Math.min(100, Math.round(score)), title, summary, radio,
    createdAt: story.createdAt, updatedAt: story.updatedAt,
    sectorId: kill?.sectorId || milestoneFacts[0]?.sectorId || null,
    sectorIds: [...new Set(ns.map(n => n.sectorId).filter(Boolean))],
    actorKeys: [...new Set(ns.map(n => n.actor.key).filter(Boolean))],
    factionIds: [...new Set(ns.map(n => n.factionId).filter(Boolean))],
    stationIds: [...new Set(ns.map(n => n.stationId).filter(Boolean))],
    visibility: visibilityOf(ns),
    milestones: COMPLETE_STAGES.slice(0, progress),
    proof: best.map(n => n.id),
    causalLinks: clone(story.edges), evidence,
  };
}

// Evidence-only bindings can enrich a chain without generating another headline revision.
export function semanticSignature(view) {
  return JSON.stringify([view.kind, view.score, view.title, view.summary, view.visibility]);
}

export function rankViews(views, context, now) {
  const c = context || {};
  return views.filter(v => (c.includePrivate === true || v.visibility === 'public')
    && (!c.kind || v.kind === c.kind)
    && (!c.completeOnly || v.complete)
    && (!c.actorKey || v.actorKeys.includes(String(c.actorKey)))
    && (!c.factionId || v.factionIds.includes(String(c.factionId)))
    && (!c.stationId || v.stationIds.includes(String(c.stationId)))
    && (!c.sectorId || v.sectorIds.includes(String(c.sectorId)))
    && v.score >= (Number.isFinite(c.minScore) ? c.minScore : 0)
    && now - v.updatedAt >= (Number.isFinite(c.minAgeSeconds) ? c.minAgeSeconds : 0))
    .sort((a, b) => (b.score - Math.min(25, Math.max(0, now - b.updatedAt) / 1800))
      - (a.score - Math.min(25, Math.max(0, now - a.updatedAt) / 1800))
      || b.updatedAt - a.updatedAt || compareId(a.id, b.id));
}
export function recallText(view, now) {
  const age = Math.max(0, now - view.updatedAt);
  const when = age >= 3600 ? `${Math.floor(age / 3600)} sim-hour${age >= 7200 ? 's' : ''} ago`
    : `${Math.max(1, Math.floor(age / 60))} sim-minute${age >= 120 ? 's' : ''} ago`;
  return `${when}: ${view.radio}`;
}
