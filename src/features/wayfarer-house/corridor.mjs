import { at } from './data.mjs';

// Six finite carrier fragments; a dogleg, not randomly scattered scenery. Physical geometry
// goes through the core factory. Existing collision/combat owners resolve contact and damage.
export function corridorSpecs(journey) {
  return [
    [2900,350,90],[3150,850,100], // lee: wide approach, then turn
    [4550,-470,125],[4850,-30,125], // throat: two offset baffles
    [6350,280,95],[6750,750,110], // sheltered pocket with room to catch the garden
  ].map(([x,z,radius],i)=>({ type:'wreck',team:0,pos:at(journey.origin,{x,z}),
    vel:{x:0,z:0},rot:(i%2?1:-1)*0.3,radius,mass:100000,hull:6000,hullMax:6000,
    collides:true,flags:{persistent:true},homeSectorId:journey.sectorId,
    physicsBody:{version:1,dynamic:false,radius,mass:100000},
    data:{wayfarerKey:`${journey.id}:baffle_${i}`,wayfarerRole:'corridor_baffle',
      worldRecordId:`wayfarer:${journey.id}:baffle_${i}`,sectorId:journey.sectorId,
      label:`Needle corridor — carrier fragment ${i+1}`,towable:false} }));
}
