import test from 'node:test';
import assert from 'node:assert/strict';
import { candidateScene } from './cinderglass-job-fixture.mjs';
import { missions } from '../src/systems/missions.js';
import { initCampaignSidecar } from '../src/story/campaign47a/campaignTransitions.js';

test('canonical alloy settlement publishes Tethys contact while dock pauses updates', async () => {
 const f=await candidateScene();try{
  const {state,bus,sys}=f;
  state.story={beatIndex:1,flags:{}};initCampaignSidecar(state,state.simTime);
  state.ui.docked=true;state.ui.dockedStationId='station_tethys';state.player.docked=true;
  sys._publish();assert.equal(state.cinderglassJobView.contacts.length,0);
  bus.emit('mission:completed',{storyTag:'unrelated'});
  assert.equal(state.cinderglassJobView.contacts.length,0,'an unrelated completion cannot unlock it');
  const m=Object.assign(Object.create(missions),{state,bus,
   _releaseCampaignNavForSwarm:()=>false,_onboardingOwnsOpeningNav:()=>false,
   _nearestStation:()=>null,_ensureCampaignSidecar:()=>initCampaignSidecar(state,state.simTime),
   _refreshEmbodiedStoryBoards:()=>{}});
  assert.equal(m._recordCampaignBookSignal('mission:completed',{storyTag:'campaign47a:b1:alloy_run'}),true);
  bus.emit('mission:completed',{storyTag:'campaign47a:b1:alloy_run'});
  assert.equal(state.cinderglassJobView.contacts[0]?.actions[0]?.label,'Read recovery terms');
  assert.equal(state.cinderglassJobView.contacts[0].token,sys.token());
  assert.equal(state.cinderglassJobView.offer,null,'publishing availability does not start the job');
 }finally{f.sim.dispose();}
});
