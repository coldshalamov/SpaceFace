import {queryAsteroidField} from '../world/asteroidField.js';
// Staging clearance is a pickup pocket, not a promise about the whole tow corridor.
export function frontierAidPickup(state,creditor,debtor,settleR){
 const heading=Math.atan2(debtor.pos.z-creditor.pos.z,debtor.pos.x-creditor.pos.x);
 const offsets=[0,1,-1,2,-2,3,-3,4,-4,5,-5,6,-6,7,-7,8];
 for(const radius of [320,420,520])for(let i=0;i<16;i++){
  const a=heading+offsets[i]*Math.PI/8,p={x:creditor.pos.x+Math.cos(a)*radius,z:creditor.pos.z+Math.sin(a)*radius};
  if(Math.hypot(p.x-debtor.pos.x,p.z-debtor.pos.z)<=settleR+(Number(debtor.radius)||0)+90)continue;
  const nearby=[...(state.entityList||[]),...queryAsteroidField(state,p,100,[])];
  if(!nearby.some(e=>e?.alive&&e.collides!==false&&!['fx','projectile','pickup'].includes(e.type)
   &&Math.hypot(e.pos.x-p.x,e.pos.z-p.z)<(Number(e.radius)||0)+110))return p;
 }
 return null;
}
