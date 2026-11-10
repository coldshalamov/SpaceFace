// Facts for the existing shared station voice/caption consumer. No docking authority lives here.
export function latchNineGuidanceLine(state,station){
 const out=state?.latchNine,player=state?.entities?.get(state.playerId);
 if(!out||!player?.alive||state.entities?.get(station?.id)!==station||station.data?.stationId!=='station_tethys'||out.stationId!=='station_tethys'||out.shipId!==player.id)return null;
 if(out.phase==='GUIDE'&&out.dockReady===true&&out.clearance==='CLEAR')return 'Latch Nine: Docking is clear. Use your normal dock command.';
 if(out.phase==='APPROACH'&&out.guidance)return out.guidance.hint==='slow_and_align'?'Latch Nine: Slow and align with the approach. You are not cleared to dock yet.':'Latch Nine: Follow the station approach. Alignment comes before clearance.';
 if(out.phase==='HOLD')return 'Latch Nine: Hold. The station has not cleared this approach.';
 if(out.phase==='RECOVER')return 'Latch Nine: Restoring my position. Use the station’s ordinary guidance.';
 if(out.phase==='ACKNOWLEDGE'&&state.ui?.docked&&state.ui.dockedStationId==='station_tethys')return 'Latch Nine: Arrival confirmed. Welcome.';
 return null;
}
