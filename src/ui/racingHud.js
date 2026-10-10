// Continuous flight instrument. Mission receipts still belong to the shared toast floor.
import { raceGateGlobals, startLineFor } from '../data/raceLevels.js';
import { activeAuthoredRace, activeRaceMission, activeSteerLock, readRaceTape, resolveSteeringView } from '../systems/racingSteer.js';
import { injectDeckplate } from './deckplate/index.js';
import { BINDINGS } from './bindings.js';
import { toggleSteeringView, rememberRacingResult } from './racingControls.js';
import { createRacingMap, formatRaceTime } from './racingMap.js';

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
  readings.append(line,sub,goal,hints); panel.append(mapHost,readings,row,live); root.appendChild(panel);
  let map = null, missionId = null, lastPhase = null, lastTick = -Infinity, lastHolding = false, pulse = '', pulseUntil = -1;
  const offs = [];
  const listen = (name,fn) => { const off=bus?.on?.(name,fn); if(typeof off==='function')offs.push(off); };
  listen('race:toggleView',()=>{toggleSteeringView(state,bus);lastTick=-Infinity;});
  listen('settings:changed',()=>{lastTick=-Infinity;});
  listen('mission:gateCleared',p=>{
    if (p?.missionId !== missionId) return;
    const split = Number.isFinite(p.splitDeltaS) ? ` · ${p.splitDeltaS>=0?'+':''}${p.splitDeltaS.toFixed(2)}s reference` : '';
    pulse = `${p.lapCompleted ? 'LAP' : 'GATE'} ${p.gateIndex+1} CLEAR${split}`;
    pulseUntil = (state.simTime||0)+1.6; live.textContent=pulse;
  });
  listen('mission:completed',p=>{ if(p?.racingContractId) { rememberRacingResult(p); live.textContent=`Circuit complete in ${formatRaceTime(p.raceElapsedS)}`; } });
  listen('race:armed',()=>{ pulse=''; lastTick=-Infinity; });
  listen('mission:updated',()=>{lastTick=-Infinity;});

  return {
    frame(liveState) {
      const st = liveState || state;
      const inFlight = st?.mode === 'flight' && !st.ui?.docked && !screens?.isOpen?.()
        && !st.render?.photoMode?.active && st.entities?.get?.(st.playerId)?.alive !== false;
      panel.hidden=!inFlight;
      if(!inFlight)return;
      const now=st.simTime||0;
      if(now>=lastTick&&now-lastTick<0.1)return;
      lastTick=now;
      const authored=activeAuthoredRace(st), race=authored||activeRaceMission(st), lock=activeSteerLock(st);
      const viewMode=resolveSteeringView(st);
      panel.dataset.compact=authored?'false':'true';
      view.textContent=lock?'Mission view':`${viewMode==='racing'?'Chase':'Overhead'} ${BINDINGS.steeringView.label}`;
      view.disabled=!!lock; view.setAttribute('aria-pressed',String(viewMode==='racing'));
      view.title=lock?'This section temporarily requires the chase camera.':'Toggle chase / overhead camera';
      reset.hidden=leave.hidden=!authored;
      mapHost.hidden=readings.hidden=!authored;
      if(!authored){if(missionId!==null){missionId=null;map=null;mapHost.replaceChildren();}return;}
      if(missionId!==race.id){
        missionId=race.id;lastTick=-Infinity;pulse='';lastHolding=false;lastPhase=null;
        map=createRacingMap(raceGateGlobals(race.params),'Circuit, next gate and ship');
        mapHost.replaceChildren(...(map?[map.element]:[]));
      }
      // Readings are 10 Hz; camera and flight remain full-rate. No per-frame SVG rebuilding.
      const player=st.entities?.get?.(st.playerId);
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
        sub.textContent=`${formatRaceTime(race.params.raceElapsedS)} · ${race.params.raceClean?'CLEAN':'RECOVERY'} · PAYMENT PENDING`;
        hints.textContent=`Preferred view restored. Dock at ${st.nav?.waypoint?.missionId===race.id?st.nav.waypoint.label:'the marked station'} for payment. Leaving the run forfeits payment.`;
        return;
      }
      line.textContent=`${name} · LAP ${tape.lap}/${tape.laps}`;
      if(tape.holding){
        const count=Math.ceil(tape.gridLeft);
        sub.textContent=`${count} · HOLD THE GRID`;
        hints.textContent='Accelerate on green · Touch: up drives, sides steer, down brakes';
        if(!lastHolding)live.textContent='Grid countdown';
        lastHolding=true;return;
      }
      if(lastHolding){pulse='GO';pulseUntil=now+1;live.textContent='Go';lastHolding=false;}
      sub.textContent=`${formatRaceTime(tape.elapsed)} · ${Math.round(tape.speed)} wu/s · GATE ${tape.nextGate}/${tape.gateCount}`;
      const warnings=[tape.wrongWay?'WRONG WAY':'',tape.offRibbon?'OFF COURSE':'',tape.drafting?'IN SLIPSTREAM':'',tape.resets?'RECOVERY RUN':''].filter(Boolean);
      hints.textContent=warnings.length?warnings.join(' · '):now<pulseUntil?pulse:
        `${tape.steerHint.toUpperCase()} ${Math.round(tape.distanceToGate)} wu`+
        (tape.delta===null?'':` · ${tape.delta>=0?'+':''}${tape.delta.toFixed(1)}s reference pace`);
    },
    dispose(){ for(const off of offs)off();panel.remove(); },
  };
}
