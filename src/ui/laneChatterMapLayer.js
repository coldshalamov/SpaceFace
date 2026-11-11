// inf-lane-chatter-chart — the chart reads what the station boards say about a lane.
//
// src/systems/pirateRumor.js is the single writer of lane rumor: it folds real spawned pirate
// encounters and civilian traffic deaths into per-zone records, puts the hottest lane on the news
// wire and the dock card ("Pirate rumor: Belt-Shadow Ambush is hot after 4 recent losses."),
// shifts route danger when raids go unanswered or a raider leader falls, and marks a suspected
// raider base once ambushes keep coming from the same vectors. The chart drew the very same zones
// as a bare type and threat index, so what the pilot heard at the berth never reached the place
// it was about, and the suspected base (`poi:candidate`) had no reader at all.
//
// This read is pure over that owner's own records. It never writes and never invents: a zone the
// boards never flagged, with no live route shift and no suspected base, reads nothing — the chart
// stays as quiet as the boards were.
import {
  pirateBaseCandidateForZone,
  routeDangerFeedbackForZone,
  rumorKey,
} from '../systems/pirateRumor.js';
import { localizeText } from '../localization/sourceText.js';

function count(value) {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function zoneRecord(state, sectorId, zoneId) {
  const zones = state && state.pirateRumor && state.pirateRumor.zones;
  if (!zones || typeof zones !== 'object' || !sectorId || !zoneId) return null;
  const rec = zones[rumorKey(sectorId, zoneId)];
  return rec && typeof rec === 'object' ? rec : null;
}

function chatterLine(losses, live) {
  if (live) {
    return losses === 1
      ? localizeText('Station boards flag this lane: 1 hull lost here.')
      : localizeText('Station boards flag this lane: {count} hulls lost here.', { count: losses });
  }
  return losses === 1
    ? localizeText('The boards flagged this lane after 1 loss. The talk has cooled since.')
    : localizeText('The boards flagged this lane after {count} losses. The talk has cooled since.', { count: losses });
}

function feedbackLine(feedback) {
  if (!feedback || feedback.active !== true) return null;
  const danger = Number(feedback.danger) || 0;
  if (danger > 0) {
    return { tone: 'bolder', text: localizeText('Raids went unanswered here: ambushes run bolder and convoys thinner for now.') };
  }
  if (danger < 0) {
    if (feedback.reason === 'leaderCleared') {
      return { tone: 'cleared', text: localizeText('A raider leader fell here: ambushes are thinning and convoys are coming back.') };
    }
    if (feedback.reason === 'counter_intelligence') {
      return { tone: 'intel', text: localizeText('Counter-intelligence on this lane paid off: fewer ambushes and more convoys for now.') };
    }
    return { tone: 'cooling', text: localizeText('This lane is cooling: fewer ambushes for now.') };
  }
  return null;
}

function nestLine(candidate) {
  if (!candidate || typeof candidate !== 'object') return null;
  const raids = count(candidate.provenance && candidate.provenance.eventCount);
  const payoff = candidate.payoff || {};
  const salvage = payoff.salvage === true;
  const bounty = payoff.bounty === true;
  const lead = raids >= 2
    ? localizeText('Logged raids: {count} ambushes from the same vectors.', { count: raids })
    : localizeText('Logged raids keep coming from the same vectors.');
  const tail = salvage && bounty
    ? localizeText('A raider nest likely sits near this lane: salvage and a bounty if you find it.')
    : salvage
      ? localizeText('A raider nest likely sits near this lane: salvage if you find it.')
      : bounty
        ? localizeText('A raider nest likely sits near this lane: a bounty if you find it.')
        : localizeText('A raider nest likely sits near this lane.');
  return { raids, text: `${lead} ${tail}` };
}

/**
 * The chart's read of one zone's lane talk, or null when the boards have nothing on it.
 *
 * @returns {null|{
 *   sectorId: string, zoneId: string,
 *   flagged: boolean,   // a board headline went out for this lane at least once
 *   live: boolean,      // flagged and the rumor heat has not decayed away
 *   losses: number,     // hulls the owner logged lost here
 *   feedback: null|{tone: string, text: string},
 *   nest: null|{raids: number, text: string},
 *   lines: string[],    // inspector sentences, strongest first
 *   mapTag: string,     // short canvas suffix for the zone label ('' when none)
 * }}
 */
export function laneChatterForZone(state, sectorId, zoneId) {
  const rec = zoneRecord(state, sectorId, zoneId);
  if (!rec) return null;
  // The owner stamps lastHeadlineAt only when the lane actually went out on the wire
  // (pirateRumor._maybeSurface). A record that never crossed the news bar was never heard.
  const flagged = Number.isFinite(rec.lastHeadlineAt) || count(rec.headlineCount) > 0;
  const live = flagged && Number(rec.heat) > 0;
  const losses = Math.max(count(rec.lossCount), count(rec.eventCount));
  const feedback = feedbackLine(routeDangerFeedbackForZone(state, sectorId, zoneId));
  const nest = nestLine(pirateBaseCandidateForZone(state, sectorId, zoneId));
  if (!flagged && !feedback && !nest) return null;

  const lines = [];
  if (flagged && losses > 0) lines.push(chatterLine(losses, live));
  if (feedback) lines.push(feedback.text);
  if (nest) lines.push(nest.text);
  if (!lines.length) return null;

  let mapTag = '';
  if (live && losses > 0 && nest) mapTag = localizeText('{count} LOST · NEST?', { count: losses });
  else if (live && losses > 0) mapTag = localizeText('{count} LOST', { count: losses });
  else if (nest) mapTag = localizeText('NEST?');

  return {
    sectorId,
    zoneId,
    flagged,
    live,
    losses,
    feedback,
    nest,
    lines,
    mapTag,
  };
}
