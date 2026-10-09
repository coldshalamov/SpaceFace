// Circuit selection is a real launch path, not a second campaign-save namespace.
import { el, cue } from '../kit/index.js';
import { injectDeckplate } from '../deckplate/index.js';
import { confirm } from '../confirm.js';
import { RACE_LEVELS, courseForLevel, practiceContractForLevel, racingOfferFor, racingSeedFor, storyContracts } from '../../data/raceLevels.js';
import { readRaceRecords, raceRecordKey, normalizeSteeringView, STEERING_VIEWS, activeRaceMission } from '../../systems/racingSteer.js';
import { armRacingContract, stageRacingLaunch } from '../racingLaunch.js';
import { setSteeringView, lastRacingResult } from '../racingControls.js';
import { BINDINGS } from '../bindings.js';
import { createRacingMap, formatRaceTime } from '../racingMap.js';

const storageOf=()=>{try{return globalThis.localStorage||null;}catch{return null;}};
const manager=ctx=>ctx?.screenManager||ctx?.screens||ctx?.registry?.get?.('ui')?.screenManager;
const pop=ctx=>manager(ctx)?.popScreen?.();
const inFlight=ctx=>ctx?.state?.mode==='flight';

async function runContract(ctx, contractId, level) {
  if(!ctx?.bus)return false;
  if(inFlight(ctx)&&ctx.state.world?.currentSectorId===level.sectorId){
    const result=armRacingContract(ctx,contractId,{allowEnterSector:false});
    if(result?.ok&&!result.reused){pop(ctx);return true;}
    return false;
  }
  const live=inFlight(ctx);
  const ok=await confirm({
    title:live?'Leave this flight for a circuit?':'Launch a temporary circuit flight?',
    body:live
      ? 'This replaces the current in-memory flight. Save it first to keep unsaved progress. Campaign slots cannot be overwritten during the circuit, including by autosave. Local racing bests are retained.'
      : `${level.name}. Campaign save slots stay untouched, including autosave. Local racing bests are retained.`,
    confirmLabel:'Launch circuit',cancelLabel:'Back',
  });
  if(!ok||!stageRacingLaunch(contractId))return false;
  ctx.bus.emit('game:new',{seed:racingSeedFor(contractId),racingSession:true});
  return true;
}

export const raceBoardScreen={
  id:'raceBoard',
  mount(rootEl,ctx){
    injectDeckplate();rootEl.replaceChildren();rootEl.classList.add('k-screen','race-board');
    rootEl.setAttribute('aria-label','Racing circuits');this._root=rootEl;
    const title=el('header','k-title');
    title.append(el('p','k-sentence','CIRCUITS / FLIGHT'),el('h1','k-display k-t-title','Thread the needle.'),
      el('p','k-sentence',`Three closed routes. Five contracts. One ship. ${BINDINGS.steeringView.label} switches chase / overhead in free flight; mission locks return your preferred view when they end.`));
    rootEl.appendChild(title);
    const tools=el('div','race-board-tools');
    const view=el('button','k-word');view.type='button';
    const viewLabel=()=>{view.textContent=`Practice view: ${normalizeSteeringView(ctx?.state?.settings?.gameplay?.steeringView)}`;};
    viewLabel();
    view.addEventListener('click',()=>{
      const cur=normalizeSteeringView(ctx?.state?.settings?.gameplay?.steeringView);
      setSteeringView(ctx?.state,ctx?.bus,STEERING_VIEWS[(STEERING_VIEWS.indexOf(cur)+1)%STEERING_VIEWS.length]);viewLabel();
    });
    const back=el('button','k-word','Back');back.type='button';back.addEventListener('click',()=>{cue('back');pop(ctx);});
    tools.append(view,back);rootEl.appendChild(tools);
    const current=activeRaceMission(ctx?.state);
    if(current)rootEl.appendChild(el('p','k-sentence','A race is active. Finish it or use Leave run in the flight instrument before joining another.'));
    const result=lastRacingResult();
    if(result){
      const receipt=el('section','race-board-result dp-glass');receipt.setAttribute('aria-label','Last circuit result');
      receipt.append(el('h2','k-t-sub',`LAST FINISH / ${formatRaceTime(result.raceElapsedS)}`),
        el('p','k-sentence',`${String(result.raceBand||'complete').toUpperCase()} · ${result.raceClean?'Clean run':'Recovery run — not ranked'}`),
        el('p','k-sentence',(result.raceLapTimesS||[]).map((t,i)=>`Lap ${i+1} ${formatRaceTime(t)}`).join(' · ')));
      rootEl.appendChild(receipt);
    }
    const records=readRaceRecords(storageOf()),stories=storyContracts(),grid=el('div','race-board-grid');
    const buttons=[];
    for(const [index,level] of RACE_LEVELS.entries()){
      const course=courseForLevel(level.id),card=el('section','race-board-course dp-plate');
      card.append(el('p','k-sentence',`CIRCUIT 0${index+1}`),el('h2','k-t-sub',level.name));
      const map=createRacingMap(course.gates,`${level.name} route, start and finish`);
      if(map)card.appendChild(map.element);
      card.append(el('p','k-sentence',level.blurb),el('p','k-sentence',`${Math.round(course.courseLengthWU).toLocaleString()} wu / lap · ${course.gates.length-1} legs · start / finish aligned`));
      const contracts=[practiceContractForLevel(level.id),...stories.filter(row=>row.levelId===level.id)].filter(Boolean);
      for(const row of contracts){
        const offer=racingOfferFor(row.id),best=records[raceRecordKey(offer.params)];
        const block=el('div','race-board-contract');
        const b=el('button','k-word race-board-launch',row.practice?'Practice':row.title);b.type='button';buttons.push(b);
        b.disabled=!!current||!!this._launching;b.title=row.summary;
        b.addEventListener('click',async()=>{
          if(this._launching)return;this._launching=true;buttons.forEach(x=>x.disabled=true);cue('confirm');
          try{await runContract(ctx,row.id,level);}finally{this._launching=false;this._root?.querySelectorAll('.race-board-launch').forEach(x=>x.disabled=!!activeRaceMission(ctx?.state));}
        });
        block.append(b,el('p','k-sentence',`${row.laps} ${row.laps===1?'lap':'laps'} · ${row.practice?'view optional':'chase view required'} · ${Number.isFinite(best)?`clean best ${formatRaceTime(best)}`:'no clean best yet'}`));
        if(!row.practice)block.appendChild(el('p','k-sentence',row.summary));
        card.appendChild(block);
      }
      grid.appendChild(card);
    }
    rootEl.appendChild(grid);
    rootEl.appendChild(el('p','k-sentence','Fly through gates in order. Recovery returns behind the last cleared gate, keeps the clock running, and excludes the attempt from clean best times. Records are separate for each contract, lap count and course revision.'));
  },
  // Screens are cached after mount; refresh on every reopen so records and results never stale.
  refresh(ctx){if(this._root)this.mount(this._root,ctx);},
  unmount(){if(this._root)this._root.replaceChildren();this._root=null;},
  dispose(){this.unmount();},
  update(){},
};
