// Continuous flight instrument. Mission receipts still belong to the shared toast floor.
import { raceGateGlobals, startLineFor } from '../data/raceLevels.js';
import { activeAuthoredRace, activeRaceMission, activeSteerLock, readRaceTape, resolveSteeringView } from '../systems/racingSteer.js';
import { injectDeckplate } from './deckplate/index.js';
import { BINDINGS, promptLabel } from './bindings.js';
import { readRacingCoach } from './racingCoach.js';
import { toggleSteeringView, rememberRacingResult } from './racingControls.js';
import { createRacingMap, formatRaceTime } from './racingMap.js';
import { finishRacingCupHeat, releaseRacingCupHeat, recordRaceMeeting } from '../systems/racingCareer.js';
import { isRacingCorridorSession } from '../world/racingCorridor.js';
import { applyWorldObjectSelection } from './worldObjectInteraction.js';

export function mountRacingHud({ root, bus, state, screens }) {
  if (!root || typeof document === 'undefined') return null;
  injectDeckplate();
  const make = (tag, cls, text = '') => { const e = document.createElement(tag); e.className = cls; e.textContent = text; return e; };
  const panel = make('section', 'race-tape dp-glass');
  panel.id = 'race-tape'; panel.setAttribute('aria-label', 'Circuit telemetry'); panel.hidden = true;
  const readings = make('div','race-tape-readings');
  const line = make('div','race-tape-title');
  const sub = make('div','race-tape-stats');
  const hints = make('div','race-tape-hint');
  const pack = make('div','race-tape-pack');
  const courseCue = make('div','race-tape-hint');
  const goal = make('div','race-tape-goal');
  const mapHost = make('div','race-tape-map');
  const row = make('div','race-tape-actions');
  const live = make('span','race-sr-only'); live.setAttribute('role','status'); live.setAttribute('aria-live','polite');
  const button = (text, action) => {
    const b = make('button','k-word',text); b.type='button'; b.addEventListener('click',action); row.appendChild(b); return b;
  };
  const view = button(`View ${BINDINGS.steeringView.label}`,()=>toggleSteeringView(state,bus));
  const reset = button('Recover',()=>bus?.emit?.('race:reset',{}));
  const board = button('Circuits',()=>screens?.pushScreen?.('raceBoard'));
  board.title = 'Routes, local best times and last result';
  const leave = button('Leave run',()=>bus?.emit?.('race:abort',{}));
  let selection = null;
  const select = button('Select pod',()=>{
    if(selection?.alive !== false && state.entities?.get(selection?.id) === selection)
      applyWorldObjectSelection(state, selection, 'race-instrument');
  });
  select.hidden = true;
  readings.append(line,sub,pack,goal,hints,courseCue); panel.append(mapHost,readings,row,live); root.appendChild(panel);
  let map = null, missionId = null, lastPhase = null, lastTick = -Infinity, lastHolding = false, pulse = '', pulseUntil = -1;
  const offs = [];
  const listen = (name,fn) => { const off=bus?.on?.(name,fn); if(typeof off==='function')offs.push(off); };
  listen('race:toggleView',()=>{toggleSteeringView(state,bus);lastTick=-Infinity;});
  listen('settings:changed',()=>{lastTick=-Infinity;});
  listen('mission:gateCleared',p=>{
    if (p?.missionId !== missionId) return;
    const split = Number.isFinite(p.ghostDeltaS) ? ` · ${p.ghostDeltaS>=0?'+':''}${p.ghostDeltaS.toFixed(2)}s personal best`
      : Number.isFinite(p.splitDeltaS) ? ` · ${p.splitDeltaS>=0?'+':''}${p.splitDeltaS.toFixed(2)}s reference` : '';
    pulse = `${p.lapCompleted ? 'LAP' : 'GATE'} ${p.gateIndex+1} CLEAR${split}`;
    pulseUntil = (state.simTime||0)+1.6; live.textContent=pulse;
  });
  const showResult=()=>{if(isRacingCorridorSession(state))queueMicrotask(()=>{if(state.mode==='flight')screens?.pushScreen?.('raceBoard');});};
  listen('mission:completed',p=>{ if(p?.racingContractId) {
    rememberRacingResult(p);
    let storage=null;try{storage=globalThis.localStorage;}catch{}
    finishRacingCupHeat(p,storage);
    if(['race','cup'].includes(p.raceMode)) {
      const meeting=recordRaceMeeting(p,storage);
      if(!meeting.saved&&meeting.reason!=='duplicate_or_stale')
        bus?.emit?.('toast',{text:'Race finished. This browser could not store the rival result.',kind:'info',ttl:4});
    }
    live.textContent=`Circuit complete in ${formatRaceTime(p.raceElapsedS)}`;
    showResult();
  } });
  listen('race:ended',p=>{rememberRacingResult(p);releaseRacingCupHeat(p);showResult();});
  listen('race:launchFailed',()=>releaseRacingCupHeat());
  listen('race:armed',()=>{ pulse=''; lastTick=-Infinity; });
  listen('mission:updated',()=>{lastTick=-Infinity;});

  return {
    frame(liveState) {
      const st = liveState || state;
      const inFlight = st?.mode === 'flight' && !st.ui?.docked && !screens?.isOpen?.()
        && !st.render?.photoMode?.active && st.entities?.get?.(st.playerId)?.alive !== false;
      panel.hidden=!inFlight || st.physicsVenuePublic?.active === true;
      if(!inFlight)return;
      const now=st.simTime||0;
      if(now>=lastTick&&now-lastTick<0.1)return;
      lastTick=now;
      const authored=activeAuthoredRace(st), race=authored||activeRaceMission(st), lock=activeSteerLock(st);
      const viewMode=resolveSteeringView(st);
      panel.dataset.compact=authored?'false':'true';
      view.textContent=lock?'Mission view':`${viewMode==='racing'?'Chase':'Overhead'} ${promptLabel('steeringView')}`;
      view.disabled=!!lock; view.setAttribute('aria-pressed',String(viewMode==='racing'));
      view.title=lock?'This section temporarily requires the chase camera.':'Toggle chase / overhead camera';
      reset.hidden=leave.hidden=!authored;
      select.hidden=true;selection=null;courseCue.textContent='';
      mapHost.hidden=readings.hidden=!authored;
      if(!authored){if(missionId!==null){missionId=null;map=null;mapHost.replaceChildren();}return;}
      if(missionId!==race.id){
        missionId=race.id;lastTick=-Infinity;pulse='';lastHolding=false;lastPhase=null;
        map=createRacingMap(raceGateGlobals(race.params),'Circuit, next gate and ship');
        mapHost.replaceChildren(...(map?[map.element]:[]));
      }
      // Readings are 10 Hz; camera and flight remain full-rate. No per-frame SVG rebuilding.
      const player=st.entities?.get?.(st.playerId);
      const pod=st.entities?.get?.(race.params.rescueTargetId);
      const cueRows=race.params.raceSetPieces||[];
      const cue=cueRows.find(c=>['warning','active','closing','closed','opening'].includes(c.phase))
        ||cueRows.find(c=>c.kind==='anchor'&&Math.abs(c.gateIndex-(race.params.nextGate||0))<=1);
      if(cue)courseCue.textContent=cue.kind==='anchor'?`${cue.name} · optional Massline swing`
        :cue.kind==='shutter'?`${cue.name.toUpperCase()} · ${cue.phase.toUpperCase()} · SERVICE LEFT ${Math.round(cue.serviceWidthWU)} wu`
        :`${cue.name.toUpperCase()} · ${cue.phase==='warning'?`${Math.ceil(cue.countdownS)}s`: 'CROSSING NOW'} · refuge ring before crossing`;
      const anchor=cue?.kind==='anchor'?st.entities?.get(cue.entityIds[0]):null;
      selection=pod?.alive!==false&&pod?pod:anchor?.alive!==false&&anchor?anchor:null;
      if(selection&&player?.pos&&Math.hypot(selection.pos.x-player.pos.x,selection.pos.z-player.pos.z)<900){
        select.hidden=false;select.textContent=pod===selection?'Select pod':'Select anchor';
        select.title='Select this body, then use your normal Massline control.';
      }
      const tape=readRaceTape(race.params,player,raceGateGlobals(race.params),now);
      const phase=race.params.sectionMission?race.params.phase:'chase';
      panel.dataset.phase=phase;
      reset.disabled=phase==='approach'||phase==='handoff';
      reset.title=reset.disabled?'Recovery is available during the timed course only.':'Return behind the last gate; clock continues and wake progress resets.';
      goal.hidden=!(race.params.draftRequiredS>0)||phase==='handoff';
      goal.textContent=goal.hidden?'':`WAKE ${Math.min(race.params.draftRequiredS,Number(race.params.draftTimeS)||0).toFixed(1)} / ${race.params.draftRequiredS.toFixed(1)}s`;
      const grid=phase==='approach'?startLineFor(race.params):null;
      map?.update(player,race.params.nextGate,grid);
      const name=tape.courseName||race.title||'Circuit';
      if(phase!==lastPhase){
        live.textContent=phase==='approach'?'Approach the grid. Stop and face the first gate.':phase==='handoff'?'Course complete. Preferred view restored. Dock at the marked station for payment.':'';
        lastPhase=phase;
      }
      if(phase==='approach'){
        line.textContent=`${name} · APPROACH`;
        const distance=grid&&player?.pos?Math.hypot(grid.x-player.pos.x,grid.z-player.pos.z):0;
        sub.textContent=`GRID ${Math.round(distance)} wu · ${Math.round(tape.speed)} wu/s`;
        hints.textContent='Stop within 70 wu of the marker, below 8 wu/s. Face gate 1; release the Massline.';
        return;
      }
      if(phase==='handoff'){
        mapHost.hidden=true;
        line.textContent=`${race.title||name} · HANDOFF`;
        sub.textContent=`${formatRaceTime(race.params.raceElapsedS)} · ${race.params.raceClean?'CLEAN':'UNRANKED'} · PAYMENT PENDING`;
        hints.textContent=`Preferred view restored. Dock at ${st.nav?.waypoint?.missionId===race.id?st.nav.waypoint.label:'the marked station'} for payment. Leaving the run forfeits payment.`;
        return;
      }
      line.textContent=race.params.adventureSpeedId?`${name} · SPEED CONTRACT`:`${name} · LAP ${tape.lap}/${tape.laps}`;
      if(tape.holding){
        const count=Math.ceil(tape.gridLeft);
        sub.textContent=`${count} · HOLD THE GRID`;
        pack.textContent=race.params.raceEntrants>1?`${race.params.raceEntrants} pilots on the grid`:'';
        hints.textContent='Accelerate on green · Touch: up drives, sides steer, down brakes';
        if(!lastHolding)live.textContent='Grid countdown';
        lastHolding=true;return;
      }
      if(lastHolding){pulse='GO';pulseUntil=now+1;live.textContent='Go';lastHolding=false;}
      sub.textContent=(race.params.raceEntrants>1?`P${race.params.racePosition}/${race.params.raceEntrants} · `:'')+`${formatRaceTime(tape.elapsed)} · ${Math.round(tape.speed)} wu/s · GATE ${tape.nextGate}/${tape.gateCount}`;
      pack.textContent=(race.params.raceStandings||[]).map(row=>`${row.position} ${row.name}${row.status==='finished'?' ✓':row.status==='dnf'?' DNF':''}`).join(' · ');
      const coach=readRacingCoach(race.params,player,raceGateGlobals(race.params),st);
      const draft=race.params.raceDraft;
      const warnings=[tape.wrongWay?'WRONG WAY':'',tape.offRibbon?'OFF COURSE':'',coach?.hint||'',
        draft?.strength>0?`DRAFT ${draft.leaderName} · ${Math.round(draft.strength*100)}%`:tape.pacing?'PACE LIGHT':'',
        tape.resets?'RECOVERY RUN':''].filter(Boolean);
      if(race.params.adventureSpeedId){
        hints.textContent=[race.params.adventureSpeedHint,...warnings].filter(Boolean).join(' · ');
        return;
      }
      const precision=race.params.precisionChain>1?` · PRECISION ×${race.params.precisionChain}`:'';
      const personal=Number.isFinite(race.params.lastGhostDeltaS)?` · ${race.params.lastGhostDeltaS>=0?'+':''}${race.params.lastGhostDeltaS.toFixed(2)}s personal best`:'';
      hints.textContent=(warnings.length?warnings.join(' · '):now<pulseUntil?pulse:
        `${tape.steerHint.toUpperCase()} ${Math.round(tape.distanceToGate)} wu`+
        (tape.delta===null||personal?'':` · ${tape.delta>=0?'+':''}${tape.delta.toFixed(1)}s reference pace`))+personal+precision;
    },
    dispose(){ for(const off of offs)off();panel.remove(); },
  };
}
