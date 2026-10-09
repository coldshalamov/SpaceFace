export const LATCH_ACTOR_KEY='latch-nine:station_tethys';
export const LATCH_PLACE_FILE='places/place_latch_nine.glb';
export function isLatchActor(entity){return entity?.type==='prop'&&entity.data?.role==='latch_nine'&&entity.data.placeId==='place_latch_nine';}
export function latchPlaceTransform(data){return data?.role==='latch_nine'&&data.placeId==='place_latch_nine'?{scale:1,y:0}:null;}
