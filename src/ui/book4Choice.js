import { isReportInRestitution } from '../missions/restitutionReadout.js';
// Read-only Book 4 guidance. Missions remains the sole branch and payout owner.
import { campaign47aRouteKind, isStoryBranchIntroOffer } from '../systems/missionShared.js';
import { describeBranchRepDeltas } from '../story/campaign47a/campaignIntents.js';
import { embodiedMissionAt, getPickSideStake } from '../story/campaign47a/embodiedMissions.js';
import { STORY_BRANCH_INTROS } from '../data/missions.js';
import { FACTION_META } from '../data/factions.js';
import { SECTORS } from '../data/sectors.js';

const names = new Map(FACTION_META.map(f => [f.id, f.short || f.name]));
const stations = new Map(SECTORS.flatMap(s => (s.stations || []).map(t => [t.id, t.name])));
const boards = { patrol: 'Helios or Coalition', traders: 'Tethys Junction', free: 'Reach or Veil' };
const labels = { patrol: 'Concord patrol', traders: 'Meridian trade', free: 'Free Captains smuggling' };
function operation(branch) {
  return embodiedMissionAt(4)?.bookContracts?.find(row => row.branch === branch);
}
function repText(branch) {
  const d = describeBranchRepDeltas(branch);
  return d ? [d.chosen, d.opposing].filter(Boolean).map(r => `${r.delta > 0 ? '+' : ''}${r.delta} ${names.get(r.factionId) || r.factionId} rep`).join(', ') : '';
}
function alternatives(state) {
  const pinned = campaign47aRouteKind(state) === 'pinned';
  const stake = pinned ? getPickSideStake(state.story.flags?.elroy_outcome) : null;
  const choices = stake ? [stake.branch] : ['patrol', 'traders', 'free'];
  return choices.map(b => `${labels[b]} at ${stake ? (stations.get(stake.stationId) || stake.stationId) : boards[b]} (${repText(b)})`).join('; ') + '.';
}
function activeIntroduction(state, branch) {
  const active = Array.isArray(state.missions?.active) ? state.missions.active : [];
  return active.find(m => m && m.status === 'active'
    && m.storyBranch === branch && isStoryBranchIntroOffer(m, state));
}
function failedIntroduction(state, branch) {
  const intro = STORY_BRANCH_INTROS.find(row => row.branch === branch);
  if (!intro) return null;
  const receipts = Array.isArray(state.missions?.receipts) ? state.missions.receipts : [];
  return receipts.filter(r => r && r.type === intro.type
    && r.factionId === intro.factionId && typeof r.sourceOfferId === 'string'
    && r.sourceOfferId.endsWith(`_${branch}_intro`)
    && ['expired', 'failed', 'abandoned'].includes(r.outcome))
    .sort((a, b) => (Number(b.at_s) || 0) - (Number(a.at_s) || 0))[0] || null;
}
export function book4ChoiceAction(state) {
  if (state?.story?.beatIndex !== 4) return null;
  const story = state.story;
  const branch = story.branch;
  const pending = story.flags?.pick_a_side_pending;
  const active = Array.isArray(state.missions?.active) ? state.missions.active.filter(Boolean) : [];
  const action = (label, title, body, missionId = null) => ({ tone: 'primary', label, title, body, meta: 'Book 4', missionId });
  if (branch) {
    const op = operation(branch);
    const mission = active.find(m => m.status === 'active' && m.storyTag === 'campaign47a:b4:operation' && m.storyBranch === branch);
    if (mission) return action('OPERATION', `Complete ${mission.title || op?.title || 'your operation'}`, 'Your branch is settled. Complete this operation to finish Book 4; follow its tracked objectives.', mission.id);
    if (op) return action('OPERATION', `Run ${op.title.split(' — ')[0]}`, `Your branch is settled. Take ${op.title} from Missions at ${stations.get(op.stationId) || op.stationId}. Complete it to finish Book 4.`);
    return null;
  }
  if (pending) {
    const mission = activeIntroduction(state, pending);
    if (mission) return action('INTRODUCTION', `Complete ${mission.title || labels[pending]}`, `Introduction accepted. Finish this contract to settle your branch: ${repText(pending)}, separate from contract rewards. Its operation follows; Book 4 is not finished yet.`, mission.id);
    const failure = failedIntroduction(state, pending);
    if (failure) {
      const successorId = typeof failure.mutatedToMissionId === 'string' && failure.mutatedToMissionId ? failure.mutatedToMissionId : null;
      const followup = successorId && active.find(m => m.status === 'active' && m.id === successorId
        && m.mutatedFromMissionId === failure.missionId && isReportInRestitution(m));
      if (followup) {
        const place = stations.get(followup.destStationId) || followup.destStationId || 'the destination';
        return action('FOLLOW-UP', `Report to ${place}`, `${failure.title || labels[pending]} ${failure.outcome}. Dock to settle this separate report-in; no cargo is required. Your branch remains unset. A fresh introduction is a separate choice.`, followup.id);
      }
      const receipts = Array.isArray(state.missions?.receipts) ? state.missions.receipts : [];
      const settled = successorId && receipts.find(r => r && r.missionId === successorId && r.outcome === 'completed');
      const settleVerb = campaign47aRouteKind(state) === 'legacy' ? 'Accept' : 'Complete';
      return action('INTRODUCTION', 'Choose a fresh introduction', `${failure.title || labels[pending]} ${failure.outcome}.${settled ? ' Its separate follow-up is complete.' : ''} Your branch remains unset. ${alternatives(state)} ${settleVerb} a fresh introduction to settle it.`);
    }
    return action('INTRODUCTION', 'Introduction not complete', `The ${labels[pending] || pending} introduction is still pending, but no matching active contract is recorded. Check its Journal outcome and Missions board. No branch reward has settled.`);
  }
  const legacy = campaign47aRouteKind(state) === 'legacy';
  return action('FACTION', 'Choose an introduction', alternatives(state) + (legacy
    ? ' Acceptance settles the branch and advances Book 4; branch reputation is separate from contract rewards.'
    : ' Accept one, then complete it to settle your branch. Reputation changes are separate from contract rewards. Finish its following operation to complete Book 4.'));
}
export function book4MissionChips(m, state) {
  if (!m || !state) return [];
  if (m.storyTag === 'campaign47a:b4:operation' && state.story?.beatIndex === 4 && state.story.branch && m.storyBranch === state.story.branch) {
    return [{ kind: 'info', label: 'Book 4', text: 'Your branch is settled. Complete this operation to finish Book 4.' }];
  }
  if (!isStoryBranchIntroOffer(m, state)) return [];
  const intro = STORY_BRANCH_INTROS.find(i => i.factionId === m.factionId);
  const branch = m.storyBranch || intro?.branch;
  const legacy = campaign47aRouteKind(state) === 'legacy';
  const pending = state.story.flags?.pick_a_side_pending;
  let text;
  if (state.story.branch) text = 'Branch already settled; this contract does not award the branch reputation again.';
  else if (pending && activeIntroduction(state, pending) && (pending !== branch || m.status !== 'active')) text = 'An introduction is pending. Check the active Journal contract before choosing another.';
  else if (pending && !activeIntroduction(state, pending) && m.status !== 'active') text = legacy
    ? `No active introduction remains. Acceptance settles your branch: ${repText(branch)}, separate from contract rewards. Earlier outcomes stay recorded.`
    : `No active introduction remains. Acceptance starts a fresh introduction; completion settles your branch: ${repText(branch)}, separate from contract rewards. Earlier outcomes stay recorded.`;
  else text = `${legacy ? 'Acceptance settles' : 'Completion settles'} your branch: ${repText(branch)}, separate from contract rewards. ${legacy ? 'Book 4 advances on acceptance.' : 'Acceptance commits the introduction; its following operation must also be completed to finish Book 4.'}`;
  const chips = [{ kind: 'info', label: 'Branch', text }];
  if ((!pending || !activeIntroduction(state, pending)) && !state.story.branch && m.status !== 'active') chips.push({ kind: 'info', label: 'Choices', text: alternatives(state) });
  return chips;
}
