import {dockIntentStatus} from './dockIntent.js';
import {readLatchApproachEvidence} from './latchNineNative.js';
const certificates=new WeakMap();
const sameLife=(a,b)=>a&&b&&a.player===b.player&&a.playerLife===b.playerLife&&a.playerBody===b.playerBody&&a.playerSpec===b.playerSpec&&a.station===b.station&&a.stationLife===b.stationLife&&a.stationBody===b.stationBody&&a.enterSerial===b.enterSerial&&a.tender===b.tender&&a.tenderLife===b.tenderLife&&a.tenderBody===b.tenderBody;
export function consumeLatchCleanArrival(certificate){const value=certificate&&certificates.get(certificate);if(!value||value.used)return false;const current=readLatchApproachEvidence(value.state,value.snapshot.tender,[]);if(!sameLife(value.snapshot,current)||current.tick!==value.snapshot.tick||dockIntentStatus(value.state,value.intent)!=='current')return false;value.used=true;return true;}
export function createLatchArrivalVerifier(state){
 let window=null,tainted=false;const contacts=[];
 return {reset(){window=null;tainted=false;},taint(){tainted=true;if(window)window.clean=false;},finishArrival(){window=null;tainted=false;},observe(tender,readout){
  if(!tender||!['APPROACH','GUIDE'].includes(readout?.phase)||state.ui?.docked){window=null;return;}
  const current=readLatchApproachEvidence(state,tender,contacts);if(!current){window=null;return;}
  if(!sameLife(window,current)||current.tick<window.tick||current.tick>window.tick+1)window={...current,samples:1,clean:current.clear&&!tainted,guide:readout.phase==='GUIDE'};
  else if(current.tick>window.tick){window.clean=window.clean&&current.clear&&current.hull===window.hull&&current.lastDamageT===window.lastDamageT;window.tick=current.tick;window.samples++;window.guide=readout.phase==='GUIDE';}
 },issue(tender,intent){
  const current=readLatchApproachEvidence(state,tender,contacts);
  if(!window||!sameLife(window,current)||!window.clean||!window.guide||window.samples<2||current.tick!==window.tick||!current.clear||current.hull!==window.hull||current.lastDamageT!==window.lastDamageT||dockIntentStatus(state,intent)!=='current')return null;
  const token=Object.freeze({});certificates.set(token,{used:false,state,snapshot:current,intent});window=null;return token;
 }};
}
