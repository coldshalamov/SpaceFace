// A newly built mission-only stead needs one tangible first supply, not an empty promise.
// Frontier remains the producer and consumer; this helper never awards money or cargo.
import {queryAsteroidField} from '../world/asteroidField.js';
const finite=p=>Number.isFinite(p?.x)&&Number.isFinite(p?.z);
export function tickBarnFirstProvision(owner){
 const s=owner.state,a=s?.frontier?.barnAttempt;
 if(s?.mode!=='flight'||s.run?.kind==='survival'||s.physicsVenue?.active||s.ui?.docked||s.player?.flags?.docked
  ||a?.status!=='completed'||a.firstProvisionPending!==true||a.firstProvisionIssued===true
  ||a.adoptedSite!==false||a.siteId!==`mission:${a.missionId}`||s.world?.currentSectorId!==a.sectorId)return;
 const frame=s.entities?.get(a.frameId),rec=s.frontier.homesteads?.find(r=>r.entityId===a.frameId&&r.gen===a.frameGen&&r.frontierMissionId===a.missionId&&r.frontierSite===a.siteId&&!r.gone&&!r.partial);
 if(!frame?.alive||!finite(frame.pos)||frame.occupantGeneration!==a.frameGen||frame.data?.frontierMissionId!==a.missionId
  ||frame.data?.frontierSite!==a.siteId||frame.data?.homestead!==true||!rec)return;
 // A saved body with missing old latch is evidence of issuance, not permission to duplicate it.
 const existing=(s.entityList||[]).find(e=>e?.alive&&e.data?.frontierSite===a.siteId&&(e.data?.barnFirstProvision===a.missionId||e.data?.supplyCargo===true));
 if(existing){a.firstProvisionIssued=true;a.firstProvisionPending=false;return;}
 let pos=null;
 for(const radius of [320,420,520]){for(let i=0;i<16;i++){const angle=i*Math.PI/8,p={x:frame.pos.x+Math.cos(angle)*radius,z:frame.pos.z+Math.sin(angle)*radius};
  const bodies=[...(s.entityList||[]),...queryAsteroidField(s,p,100,[])];
  if(!bodies.some(e=>e?.alive&&finite(e.pos)&&e.collides!==false&&!['fx','projectile','pickup'].includes(e.type)
   &&Math.hypot(e.pos.x-p.x,e.pos.z-p.z)<(Number(e.radius)||0)+90)){pos=p;break;}}
  if(pos)break;
 }
 if(!pos)return; // bounded retry later; no free stock inside an obstructed ring
 // Latch before spawn callbacks; failed creation alone permits another attempt.
 a.firstProvisionIssued=true;a.firstProvisionPending=false;
 const pod=owner.helpers?.spawnEntity?.({type:'payload',team:0,homeSectorId:a.sectorId,pos,vel:{x:0,z:0},radius:6,mass:10,hull:10,hullMax:10,collides:true,
  physicsBody:{shape:'ball',radius:6,mass:10,dynamic:true},flags:{persistent:true},
  data:{supplyCargo:true,frontierSite:a.siteId,barnFirstProvision:a.missionId,name:'Homestead Supplies',scannable:true,masslineTetherable:true,
   scanLabel:'FIRST HOMESTEAD PROVISION · 10t · tow into the receiving ring'}});
 if(!pod){a.firstProvisionIssued=false;a.firstProvisionPending=true;return;}
 owner.bus?.emit('comms:log',{speaker:rec.name||'Frontier homestead',text:'The first provision crate is staged outside the receiving ring. Bring it in when you are ready. Raising a roof was the start; now we have a household to keep.'});
}
