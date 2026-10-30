import { createLayout, distance, inCradle } from './layout.mjs';
export const VERSION = 1;
const clamp = (x,a,b) => Math.max(a,Math.min(b,Number.isFinite(x)?x:a));
export function createRecord(variant = 0) {
  return {version:VERSION,variant:variant>>>0,elapsed:0,pressure:0,purge:0,vented:false,
    accepted:false,phase:'offered',coreDwell:0,salvageDwell:0,coreDelivered:false,
    salvageDelivered:false,settlementAcknowledged:false,rows:{},lastCommand:0};
}
/** Reject future versions and malformed poses before the caller retires any original. */
export function restoreRecord(raw) {
  if (!raw || raw.version !== VERSION) throw new TypeError('Unsupported Nacre save version');
  const r=createRecord(raw.variant), layout=createLayout(r.variant);
  r.elapsed=clamp(raw.elapsed,0,1e9); r.pressure=clamp(raw.pressure,0,1); r.purge=clamp(raw.purge,0,12);
  for(const key of ['accepted','vented','coreDelivered','salvageDelivered','settlementAcknowledged']) r[key]=raw[key]===true;
  r.lastCommand=Math.floor(clamp(raw.lastCommand,0,Number.MAX_SAFE_INTEGER));
  r.coreDwell=clamp(raw.coreDwell,0,2);r.salvageDwell=clamp(raw.salvageDwell,0,2);
  for(const spec of layout.bodies) {
    const row=raw.rows?.[spec.id]; if(!row) continue;
    if(![row.x,row.z,row.vx,row.vz,row.rot,row.spin,row.hull].every(Number.isFinite)
      || Math.max(Math.abs(row.x),Math.abs(row.z))>128000 || Math.hypot(row.vx,row.vz)>10000
      || Math.abs(row.spin)>1000) throw new TypeError(`Invalid Nacre pose: ${spec.id}`);
    r.rows[spec.id]={x:row.x,z:row.z,vx:row.vx,vz:row.vz,rot:row.rot,spin:row.spin,
      hull:clamp(row.hull,0,spec.hull),dead:row.dead===true || row.hull<=0};
  }
  r.phase=r.coreDelivered?'secured':raw.phase==='lost'?'lost':r.accepted?'recover':'offered';
  if(r.settlementAcknowledged && !r.coreDelivered) throw new TypeError('Nacre receipt without delivery');
  return r;
}
export function machinery(r, layout=createLayout(r.variant)) {
  const cycle=r.elapsed%18;
  const stage=r.vented?'vented':r.purge>0?'purging':cycle<8?'quiet':cycle<12?'charging':'jet';
  return {stage,eta:r.vented?0:r.purge>0?r.purge:cycle<8?8-cycle:cycle<12?12-cycle:18-cycle,
    jet:stage==='jet'?r.pressure:0,
    targets:{baffle_w:{x:-42,z:Math.sin(r.elapsed*Math.PI/9)*29},
      baffle_e:{x:42,z:-Math.sin(r.elapsed*Math.PI/9)*29},
      gate:{x:112,z:r.vented || r.purge>0 && r.pressure<.25?48:0}},
    jets:layout.jets};
}
/** Input bodies are measured owner poses, never desired trajectories. No tow or route flags
 * are required for success: a clever shove, sling or enemy collision remains a valid solution. */
export function stepRecord(r, dt, bodies, layout=createLayout(r.variant)) {
  if(!Number.isFinite(dt)||dt<=0||dt>.1) return [];
  if(!r.accepted) return [];
  r.elapsed=Math.min(1e9,r.elapsed+dt);r.purge=Math.max(0,r.purge-dt);
  const plug=bodies.plug;
  if(plug && distance(plug.pos,{x:-18,z:-28})>=24) r.vented=true;
  // Destroying the valve also opens the relief. Destroying the tower does not.
  if(r.rows.plug?.dead) r.vented=true;
  const m=machinery(r,layout);
  const target=m.stage==='charging'||m.stage==='jet'?1:0;
  r.pressure=clamp(r.pressure+(target?dt*.3:-dt*.45),0,1);
  const out=[];
  for(const id of ['core','salvage']) {
    const delivered=`${id}Delivered`, dwell=`${id}Dwell`;
    if(r[delivered]) continue;
    const b=bodies[id];
    r[dwell]=inCradle(b,layout.receiver)?Math.min(2,r[dwell]+dt):0;
    if(r[dwell]>=2) {r[delivered]=true;out.push({kind:'delivered',role:id});}
  }
  if(r.coreDelivered) r.phase='secured';
  else if(r.rows.core?.dead) r.phase='lost';
  else r.phase=r.vented?'relief':m.stage==='jet'?'hazard':'recover';
  return out;
}
export function commandRecord(r, request, player, bodies) {
  if(!request || !Number.isSafeInteger(request.sequence) || request.sequence<=r.lastCommand
    || request.sequence<1 || request.epoch==null) return {ok:false,reason:'stale_command'};
  if(!player || player.alive===false || !player.pos) return {ok:false,reason:'no_pilot'};
  if(request.action==='accept') {
    if(distance(player.pos,{x:-172,z:0})>55) return {ok:false,reason:'approach_sign'};
    r.lastCommand=request.sequence;r.accepted=true;return {ok:true};
  }
  if(request.action!=='purge') return {ok:false,reason:'unknown_action'};
  if(!r.accepted) return {ok:false,reason:'accept_first'};
  const tower=bodies.control;
  if(!tower || tower.alive===false || tower.hull<=0) return {ok:false,reason:'control_destroyed_use_relief'};
  if(distance(player.pos,tower.pos)>35) return {ok:false,reason:'approach_control'};
  if(r.purge>0) return {ok:false,reason:'purge_running'};
  r.lastCommand=request.sequence;r.purge=12;return {ok:true};
}
export function readout(r) {
  const m=machinery(r);
  return {title:'Nacre Sluice',phase:r.phase,stage:m.stage,seconds:Math.ceil(m.eta),
    pressure:Math.round(r.pressure*100),coreDelivered:r.coreDelivered,salvageDelivered:r.salvageDelivered,
    text:r.coreDelivered?'Core secured. Optional pallet remains recoverable.':r.phase==='lost'?
      'Core destroyed. The optional pallet is still recoverable. The core cannot be replaced.':r.vented?
      'Relief open. Tow via the central lane or northern service bypass.':
      `${m.stage.toUpperCase()} — ${Math.ceil(m.eta)} s. Purge at the west tower, or pull the red relief coupling.`,
    instructions:'Tow the core to the east cradle below 4 m/s for 2 seconds. Northern tank anchors shelter the bypass. No countdown consumes the job while you are away.'};
}
