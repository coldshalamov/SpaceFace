import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './flight-start-support.mjs';
const { startBootIntroVideo } = await load('03-video-resume','src/ui/loadingTerminalArt.js');
test('loading resumes the pre-rolled clip without seeking; reduced motion still holds',()=>{
 const handlers=new Map();let seeks=0,time=1.25,plays=0,pauses=0,reduced=false;
 const video={canPlayType:()=> 'probably',addEventListener:(k,f)=>handlers.set(k,f),querySelector:()=>null,load(){},play(){plays++;return Promise.resolve();},pause(){pauses++;},get currentTime(){return time;},set currentTime(v){seeks++;time=v;}};
 const overlay={classList:{add(){},remove(){}}};
 const document={getElementById:id=>id==='boot-intro-video'?video:overlay,documentElement:{classList:{contains:()=>reduced}}};
 const ctl=startBootIntroVideo({document});handlers.get('playing')();
 ctl.pause();ctl.resume();ctl.pause();ctl.resume();
 assert.equal(plays,2);assert.equal(pauses,2);assert.equal(video.currentTime,1.25);
 assert.equal(seeks,0,'a reveal should retain the warmed decoder position');
 reduced=true;ctl.resume();assert.equal(plays,2);ctl.destroy();
});
