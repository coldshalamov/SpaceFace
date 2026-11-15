import assert from 'node:assert/strict';
import { book4ChoiceAction, book4MissionChips } from '../src/ui/book4Choice.js';
import { missionConsequenceSummary } from '../src/ui/missionPreflight.js';
import { storyActionForBeat, activeMissionContractTerms, missionCommandBrief, recommendedActions } from '../src/ui/screens/missionLog.js';
import { missionDossierHtml } from '../src/ui/station/screens/contracts.js';
import { missionStoryOps } from '../src/systems/missionStoryOps.js';
// Reconstructed fixture from production Concord Patrol Trial m_10; no claim of native play here.
const earned = {
  "story": {
    "beatIndex": 4,
    "branch": null,
    "flags": {
      "embodied_route": true,
      "pick_a_side_pending": "patrol"
    }
  },
  "mission": {
    "id": "m_10",
    "type": "patrol_clear",
    "stationId": "station_helios",
    "factionId": "faction_scn",
    "params": {
      "clearCount": 3,
      "killCount": 0,
      "targetStrength": 4.680000000000001,
      "fValue": 4.680000000000001,
      "taskTime": 135,
      "physicalVerb": "clear"
    },
    "objectiveProgress": 0,
    "objectiveTarget": 3,
    "reward_cr": 12189,
    "collateral_cr": 0,
    "riskTier": 4,
    "destStationId": "station_coalition",
    "destSectorId": "sector_helios_prime",
    "status": "active",
    "storyTag": "story.branch_intro",
    "storyBranch": "patrol",
    "title": "Concord Patrol Trial"
  }
};
const state = { story: structuredClone(earned.story), missions: { active: [structuredClone(earned.mission)] }, player: {cargo:{},credits:20000}, factions: {}, simTime: 4032 };
// Public Journal command construction must still render ordinary non-Book-4 work.
const ordinary = {id:'ordinary',type:'cargo_delivery',status:'active',title:'Ordinary freight',factionId:'faction_mts',reward_cr:200,destStationId:'station_tethys',params:{cmdtyId:'cmdty_alloys',qty:1},objectiveProgress:0,objectiveTarget:1};
const ordinaryState = {...state,story:{beatIndex:3,flags:{}},missions:{active:[ordinary]}};
assert.ok(missionCommandBrief(ordinary,ordinaryState).how);
assert.ok(recommendedActions(ordinaryState,[ordinary],'ordinary').length);
assert.ok(missionDossierHtml({...ordinary,status:'offered'},ordinaryState).includes('Ordinary freight'));
assert.ok(missionCommandBrief(state.missions.active[0],state).how);
assert.ok(recommendedActions(state,state.missions.active,'m_10').length);
const before = JSON.stringify(state);
const pending = storyActionForBeat({beat:4},state);
assert.equal(pending.missionId, 'm_10');assert.match(pending.title,/Complete/);assert.doesNotMatch(pending.body,/Choose|lock your first/);
assert.match(activeMissionContractTerms(state.missions.active[0],state).find(c=>c.label==='Branch').text,/Completion settles/);
for(let i=0;i<10;i++){book4ChoiceAction(state);missionConsequenceSummary(state.missions.active[0],state);}
assert.equal(JSON.stringify(state),before);
assert.deepEqual(book4ChoiceAction(JSON.parse(JSON.stringify(state))),pending);
const pre = structuredClone(state);delete pre.story.flags.pick_a_side_pending;pre.missions.active=[];
const offer = {...earned.mission,status:'offered'};
const chips = book4MissionChips(offer,pre);assert.match(chips[0].text,/\+15.*-10/);assert.match(chips[1].text,/Helios or Coalition.*Tethys Junction.*Reach or Veil/);
const html = missionDossierHtml(offer,pre);assert.match(html,/Completion settles/);assert.match(html,/separate from contract rewards/);assert.match(html,/Choices/);
const rejected=structuredClone(pre);assert.deepEqual(book4ChoiceAction(rejected),book4ChoiceAction(pre));
const failed=structuredClone(state);failed.missions.active[0].status='failed';assert.match(book4ChoiceAction(failed).body,/no matching active contract/);assert.equal(book4ChoiceAction(failed).missionId,null);
// Canonical acceptance using the reconstructed Concord fixture above.
const acceptState = structuredClone(pre);
const acceptMission = {...structuredClone(offer), status:'active'};
acceptState.missions.active = [acceptMission];
const acceptEvents=[];
const acceptOwner={...missionStoryOps,state:acceptState,bus:{emit:(n,p)=>acceptEvents.push({n,p})},_sayStoryLine(){}};
acceptOwner._maybeSetBranch(acceptMission);
assert.equal(acceptState.story.flags.pick_a_side_pending,'patrol');
assert.equal(acceptState.story.branch,null);
assert.equal(acceptEvents.filter(e=>e.n==='faction:repDelta').length,0);
assert.equal(book4ChoiceAction(acceptState).missionId,acceptMission.id);
// Canonical completion owns branch + reputation and leaves the book open.
const events=[];const owner={...missionStoryOps,state,bus:{emit:(n,p)=>events.push({n,p})},_refreshEmbodiedStoryBoards(){},_refreshNavigation(){},_sayStoryLine(){}};
assert.equal(owner._completeContract47aB4Intro(state.missions.active[0]),true);assert.equal(state.story.branch,'patrol');assert.equal(state.story.beatIndex,4);assert.equal(owner._completeContract47aB4Intro(state.missions.active[0]),false);
assert.deepEqual(events.filter(e=>e.n==='faction:repDelta').map(e=>e.p.delta),[15,-10]);
assert.match(book4MissionChips(state.missions.active[0],state)[0].text,/already settled/);assert.doesNotMatch(book4MissionChips(state.missions.active[0],state)[0].text,/\+15/);
assert.match(book4ChoiceAction(state).body,/Coalition/);state.missions.active.push({id:'op',status:'active',storyBranch:'patrol',storyTag:'campaign47a:b4:operation',title:'The Weighing'});assert.equal(book4ChoiceAction(state).missionId,'op');assert.doesNotMatch(book4ChoiceAction(state).body,/Choose|Accept/);
const malformed=structuredClone(state);malformed.missions.active=[null,...malformed.missions.active];assert.equal(book4ChoiceAction(malformed).missionId,'op');
malformed.missions.active={};assert.match(book4ChoiceAction(malformed).body,/Take The Weighing/);
malformed.missions.active=[{id:'wrong',status:'active',storyTag:'campaign47a:b4:operation',storyBranch:'free',title:'Wrong operation'}];
assert.equal(book4ChoiceAction(malformed).missionId,null);assert.deepEqual(book4MissionChips(malformed.missions.active[0],malformed),[]);
for(const [branch,station] of [['traders','Tethys'],['free','Helios']]){const s=structuredClone(state);s.story.branch=branch;s.missions.active=[];assert.match(book4ChoiceAction(s).body,new RegExp(station));}
for(const [outcome,label,exclude] of [['custody','Concord','Meridian'],['force','Meridian','Concord']]){const s={story:{beatIndex:4,flags:{elroy_outcome:outcome}},missions:{active:[]}};assert.match(book4ChoiceAction(s).body,new RegExp(label));assert.doesNotMatch(book4ChoiceAction(s).body,new RegExp(exclude));assert.doesNotMatch(book4ChoiceAction(s).body,/Helios or Coalition/);}
const legacy={story:{beatIndex:4,flags:{elroy_outcome_legacy:true}},missions:{active:[]}};assert.match(book4ChoiceAction(legacy).body,/Acceptance settles/);assert.match(book4MissionChips(offer,legacy)[0].text,/Acceptance settles/);
console.log('Book 4 readout tests passed: reconstructed pending identity, preflight dossier, canonical completion, repeat reads, JSON round trip, failed/rejected, operations, pinned and legacy routes.');
