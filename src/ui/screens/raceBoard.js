// Circuit selection is a real launch path, not a second campaign-save namespace.
import { el, cue } from '../kit/index.js';
import { injectDeckplate } from '../deckplate/index.js';
import { confirm } from '../confirm.js';
import { RACE_LEVELS, courseForLevel, practiceContractForLevel, raceContractById, raceLevelById, racingOfferFor, racingSeedFor, storyContracts } from '../../data/raceLevels.js';
import { readRaceRecords, raceRecordKey, normalizeSteeringView, STEERING_VIEWS, activeRaceMission } from '../../systems/racingSteer.js';
import { armRacingContract, stageRacingLaunch } from '../racingLaunch.js';
import { setSteeringView, lastRacingResult } from '../racingControls.js';
import { BINDINGS } from '../bindings.js';
import { createRacingMap, formatRaceTime } from '../racingMap.js';
import { DEFAULT_STARTER_ID, NEW_GAME_STARTERS } from '../../data/newGameDefaults.js';
import { RACING_DRIVES } from '../../data/racingLoadouts.js';
import { isRacingCorridorSession } from '../../world/racingCorridor.js';
import { RACING_MODES, RACING_DIFFICULTIES, CUP_HEATS, currentRacingCup, restoreRacingCup,
  abandonRacingCup, stageRacingCupHeat, releaseRacingCupHeat, readRacingCareer, selectRacingLivery } from '../../systems/racingCareer.js';
import { RACING_COSMETICS, racingCosmeticFor, racingCosmeticUnlocked } from '../../data/racingCosmetics.js';
import { listRacingGhosts, exportRacingGhostByKey, clearRacingGhostByKey } from '../../systems/racingGhosts.js';
import { renderRacingRecognition } from '../racingRecognition.js';
import { racingSetPieceDefinitions } from '../../data/racingSetPieces.js';

const storageOf=()=>{try{return globalThis.localStorage||null;}catch{return null;}};
const manager=ctx=>ctx?.screenManager||ctx?.screens||ctx?.registry?.get?.('ui')?.screenManager;
const pop=ctx=>manager(ctx)?.popScreen?.();
const inFlight=ctx=>ctx?.state?.mode==='flight';

async function runContract(ctx, contractId, level, fit) {
  if(!ctx?.bus)return false;
  const temporary=isRacingCorridorSession(ctx.state);
  if(inFlight(ctx)&&!temporary&&fit.raceMode==='time-trial'&&ctx.state.world?.currentSectorId===level.sectorId){
    const result=armRacingContract(ctx,contractId,{...fit,allowEnterSector:false});
    if(result?.ok&&!result.reused){pop(ctx);return true;}
    return false;
  }
  const live=inFlight(ctx);
  const ok=temporary||await confirm({
    title:live?'Leave this flight for a circuit?':'Launch a temporary circuit flight?',
    body:live
      ? 'This replaces the current in-memory flight. Save it first to keep unsaved progress. Campaign slots cannot be overwritten during the circuit, including by autosave. Local racing bests are retained.'
      : `${level.name}. Campaign save slots stay untouched, including autosave. Local racing bests are retained.`,
    confirmLabel:'Launch circuit',cancelLabel:'Back',
  });
  if(!ok)return false;
  const cupFields=fit.raceMode==='cup'?stageRacingCupHeat(contractId,fit):{};
  if(!cupFields){ctx.bus.emit('toast',{text:'Continue the current cup heat or end the cup first.',kind:'info',ttl:3});return false;}
  if(!stageRacingLaunch(contractId,{...fit,...cupFields})){releaseRacingCupHeat(cupFields);return false;}
  ctx.bus.emit('game:new',{seed:racingSeedFor(contractId),racingSession:true,starter:fit.starter,racingDrive:fit.drive,
    racingLivery:readRacingCareer(storageOf()).liveryId||'factory'});
  return true;
}

export const raceBoardScreen={
  id:'raceBoard',
  mount(rootEl,ctx){
    injectDeckplate();rootEl.replaceChildren();rootEl.classList.add('k-screen','race-board');
    rootEl.setAttribute('aria-label','Racing circuits');this._root=rootEl;
    const title=el('header','k-title');
    title.append(el('p','k-sentence','CIRCUITS / FLIGHT'),el('h1','k-display k-t-title','Thread the needle.'),
      el('p','k-sentence',`Three circuits with the same ships and drives you fly in adventure. ${BINDINGS.steeringView.label} switches chase / overhead in free flight; mission locks return your preferred view when they end.`));
    rootEl.appendChild(title);
    const tools=el('div','race-board-tools');
    const restored=restoreRacingCup(storageOf());
    const fit=this._fit||(this._fit={starter:DEFAULT_STARTER_ID,drive:'standard'});
    fit.raceMode ||= restored&&restored.status!=='complete'?'cup':'race'; fit.raceDifficulty ||= 'club';
    fit.raceGhostEnabled=ctx.state?.settings?.gameplay?.racingGhost!==false;
    const cup=currentRacingCup(),continuing=cup&&cup.status!=='complete';
    if(fit.raceMode==='cup'&&continuing){fit.starter=cup.starter;fit.raceDifficulty=cup.difficulty;}
    const choose=(caption,key,rows)=>{
      const label=el('label','k-sentence',`${caption} `),select=el('select','k-word');
      select.setAttribute('aria-label',caption);
      for(const row of rows){const option=el('option','',row.name);option.value=row.id;select.appendChild(option);}
      select.value=fit[key];select.addEventListener('change',()=>{fit[key]=select.value;if(key==='raceMode')this.refresh(ctx);});
      label.appendChild(select);tools.appendChild(label);
      return select;
    };
    choose('Race format','raceMode',RACING_MODES);
    choose('Opponent level','raceDifficulty',RACING_DIFFICULTIES).disabled=fit.raceMode==='time-trial'||(fit.raceMode==='cup'&&continuing);
    choose('Circuit ship','starter',NEW_GAME_STARTERS).disabled=fit.raceMode==='cup'&&continuing;
    choose('Circuit drive','drive',RACING_DRIVES);
    const ghost=el('button','k-word');ghost.type='button';
    const ghostLabel=()=>{const value=fit.raceGhostEnabled?'on':'off';ghost.textContent=`Ghost: ${value}`;
      ghost.setAttribute('aria-label',`Show personal ghost: ${value}`);ghost.setAttribute('aria-pressed',String(fit.raceGhostEnabled));};
    ghost.title='Show your compatible personal-best flight alongside this run.';
    ghostLabel();ghost.addEventListener('click',()=>{
      fit.raceGhostEnabled=!fit.raceGhostEnabled;
      ctx.state.settings ||= {};ctx.state.settings.gameplay ||= {};ctx.state.settings.gameplay.racingGhost=fit.raceGhostEnabled;
      ctx.bus.emit('settings:changed',{section:'gameplay',key:'racingGhost',value:fit.raceGhostEnabled});ghostLabel();
    });tools.appendChild(ghost);
    const view=el('button','k-word');view.type='button';
    const viewLabel=()=>{view.textContent=`Practice: ${normalizeSteeringView(ctx?.state?.settings?.gameplay?.steeringView)}`;};
    viewLabel();
    view.addEventListener('click',()=>{
      const cur=normalizeSteeringView(ctx?.state?.settings?.gameplay?.steeringView);
      setSteeringView(ctx?.state,ctx?.bus,STEERING_VIEWS[(STEERING_VIEWS.indexOf(cur)+1)%STEERING_VIEWS.length]);viewLabel();
    });
    const back=el('button','k-word','Back');back.type='button';back.addEventListener('click',()=>{cue('close');pop(ctx);});
    tools.append(view,back);rootEl.appendChild(tools);
    rootEl.appendChild(el('p','k-sentence',RACING_MODES.find(row=>row.id===fit.raceMode).description+' Temporary flights lend your selected fit. Sprint accelerates harder; Endurance favors long straights. Solo runs in your campaign sector use your current ship.'));
    if(fit.raceMode==='cup'){
      const progress=el('section','race-board-result dp-glass');progress.setAttribute('aria-label','Circuit cup');
      progress.append(el('h2','k-t-sub',cup?.status==='complete'?`${cup.medal.toUpperCase()} CUP · ${cup.points}/18 POINTS`:'THE THREE-COURSE CUP'),
        el('p','k-sentence','First / second / third earn 6 / 3 / 1 points. Gold 15 · Silver 9 · Bronze 3. No campaign credits are spent or awarded.'));
      if(cup)for(const heat of cup.results)progress.appendChild(el('p','k-sentence',`${heat.name} · place ${heat.position} · ${formatRaceTime(heat.elapsedS)} · ${heat.points} points`));
      if(continuing){
        progress.appendChild(el('p','k-sentence',`Heat ${cup.nextHeat+1}/3: ${CUP_HEATS[cup.nextHeat].name}. Your hull stays; change drives before the next grid.`));
        const end=el('button','k-word','End cup');end.type='button';end.addEventListener('click',()=>{abandonRacingCup();this.refresh(ctx);});progress.appendChild(end);
      }
      const best=readRacingCareer(storageOf()).cups[fit.raceDifficulty];
      if(best)progress.appendChild(el('p','k-sentence',`Local cup best: ${best.points}/18 · ${best.medal} · ${best.finishes} completed`));
      if(cup?.status==='complete'&&cup.saved===false)progress.appendChild(el('p','k-sentence','Cup finished. This browser could not store the result.'));
      rootEl.appendChild(progress);
    }
    const current=activeRaceMission(ctx?.state);
    if(current)rootEl.appendChild(el('p','k-sentence','A race is active. Finish it or use Leave run in the flight instrument before joining another.'));
    const launch=async(contractId,level)=>{
      if(this._launching)return;
      this._launching=true;rootEl.querySelectorAll('.race-board-launch,.race-board-retry').forEach(b=>b.disabled=true);cue('confirm');
      try{await runContract(ctx,contractId,level,{...fit});}finally{this._launching=false;this.refresh(ctx);}
    };
    const result=lastRacingResult();
    if(result){
      const receipt=el('section','race-board-result dp-glass');receipt.setAttribute('aria-label','Last circuit result');
      receipt.append(el('h2','k-t-sub',result.status==='dnf'?'RUN ENDED':`LAST FINISH / ${formatRaceTime(result.raceElapsedS)}`),
        ...(result.racePosition?[el('p','k-sentence',`POSITION ${result.racePosition} / ${result.raceEntrants}`)]:[]),
        el('p','k-sentence',`${String(result.raceBand||'complete').toUpperCase()} · ${result.raceClean?'Clean run':'Unranked run'}`),
        el('p','k-sentence',(result.raceLapTimesS||[]).map((t,i)=>`Lap ${i+1} ${formatRaceTime(t)}`).join(' · ')));
      if(result.raceGhostSaved)receipt.appendChild(el('p','k-sentence','New personal-best ghost saved.'));
      if(result.precisionBest>1)receipt.appendChild(el('p','k-sentence',`Best precision chain: ${result.precisionBest} gates.`));
      for(const pilot of result.raceStandings||[])receipt.appendChild(el('p','k-sentence',
        `${pilot.position}. ${pilot.name} · ${pilot.status==='finished'?formatRaceTime(pilot.elapsedS):pilot.status==='dnf'?'Did not finish':'Still on course when you finished'}`));
      if(result.status==='dnf')receipt.appendChild(el('p','k-sentence','The run ended without a finish. Select the course to retry; your clean best is safe.'));
      const contract=raceContractById(result.racingContractId),level=contract&&raceLevelById(contract.levelId);
      if(level){
        const retry=el('button','k-word race-board-retry','Retry in this flight');retry.type='button';
        retry.disabled=!!current||!!this._launching||!inFlight(ctx)||!!ctx.state.ui?.docked||ctx.state.world?.currentSectorId!==level.sectorId;
        retry.title=`Undock in ${level.name}'s sector to retry with your current ship. No new game or save reset.`;
        retry.addEventListener('click',()=>launch(contract.id,level));receipt.appendChild(retry);
      }
      rootEl.appendChild(receipt);
    }
    const records=readRaceRecords(storageOf()),ghosts=listRacingGhosts(storageOf()),stories=storyContracts(),grid=el('div','race-board-grid');
    const buttons=[];
    for(const [index,level] of RACE_LEVELS.entries()){
      const course=courseForLevel(level.id),card=el('section','race-board-course dp-plate');
      card.append(el('p','k-sentence',`CIRCUIT 0${index+1}`),el('h2','k-t-sub',level.name));
      const map=createRacingMap(course.gates,`${level.name} route, start and finish`);
      if(map)card.appendChild(map.element);
      card.append(el('p','k-sentence',level.blurb),el('p','k-sentence',`${Math.round(course.courseLengthWU).toLocaleString()} wu / lap · ${course.gates.length-1} legs · start / finish aligned`));
      const pieces=racingSetPieceDefinitions(course.courseId);
      if(pieces)card.appendChild(el('p','k-sentence',`Optional Massline anchors. ${pieces.crossing?'Watch for the scheduled cargo crossing; the amber ring marks a refuge.':pieces.wave?'Read the debris warning, then take a gap or wait in the amber refuge.':pieces.shutter?'A customs shutter closes the main cut; the green service lane stays open.':'Follow the marked line through the technical turns.'}`));
      const contracts=[practiceContractForLevel(level.id),...(fit.raceMode==='cup'?[]:stories.filter(row=>row.levelId===level.id))].filter(Boolean);
      for(const row of contracts){
        const offer=racingOfferFor(row.id),recordPrefix=raceRecordKey(offer.params);
        const fitTimes=Object.entries(records).filter(([key])=>key.startsWith(`${recordPrefix}:fit5-`)
          &&(fit.raceMode==='time-trial'?!key.includes(':pack-'):key.endsWith(`:pack-${fit.raceDifficulty}`))).map(([,time])=>time);
        const best=fitTimes.length?Math.min(...fitTimes):null;
        const block=el('div','race-board-contract');
        const cupReady=fit.raceMode!=='cup'||level.id===CUP_HEATS[continuing?cup.nextHeat:0].levelId;
        const b=el('button','k-word race-board-launch',row.practice?(fit.raceMode==='cup'?(continuing?'Continue cup':'Start cup'):fit.raceMode==='race'?'Race':'Time trial'):row.title);b.type='button';buttons.push(b);
        b.disabled=!!current||!!this._launching||!cupReady;b.title=row.summary;
        b.addEventListener('click',async()=>{
          if(this._launching)return;this._launching=true;buttons.forEach(x=>x.disabled=true);cue('confirm');
          try{await runContract(ctx,row.id,level,{...fit});}finally{this._launching=false;if(this._root)this.refresh(ctx);}
        });
        block.append(b,el('p','k-sentence',`${row.laps} ${row.laps===1?'lap':'laps'} · ${row.practice?'view optional':'chase view required'} · ${Number.isFinite(best)?`best across fits ${formatRaceTime(best)}`:'no clean fit record yet'}`));
        if(!row.practice)block.appendChild(el('p','k-sentence',row.summary));
        card.appendChild(block);
      }
      for(const tape of ghosts.filter(t=>t.courseId===course.courseId)){
        const saved=el('div','race-board-contract');
        saved.appendChild(el('p','k-sentence',`PERSONAL GHOST · ${tape.hullId.replace(/^ship_/,'')} · ${formatRaceTime(tape.elapsedS)}`));
        const exportButton=el('button','k-word','Export ghost');exportButton.type='button';
        exportButton.addEventListener('click',()=>{
          const json=exportRacingGhostByKey(storageOf(),tape.key);if(!json)return;
          const url=URL.createObjectURL(new Blob([json],{type:'application/json'})),link=document.createElement('a');
          link.href=url;link.download=`spaceface-${course.courseId}-ghost.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),0);
        });
        const remove=el('button','k-word','Delete ghost');remove.type='button';remove.addEventListener('click',()=>{
          const outcome=clearRacingGhostByKey(storageOf(),tape.key);
          if(outcome.ok)this.refresh(ctx);else ctx.bus.emit('toast',{text:'This browser could not delete the ghost.',kind:'warn',ttl:3});
        });saved.append(exportButton,remove);card.appendChild(saved);
      }
      grid.appendChild(card);
    }
    rootEl.appendChild(grid);
    const career=readRacingCareer(storageOf()),paint=el('section','race-board-result dp-glass');
    paint.setAttribute('aria-label','Earned circuit paint');
    paint.append(el('h2','k-t-sub','Wear your finish'),el('p','k-sentence','Finish a cup to earn paint. Bronze 3 · Silver 9 · Gold 15 points, at any opponent level. Paint changes no handling stats.'));
    const paintLabel=el('label','k-sentence','Circuit paint '),paintSelect=el('select','k-word');
    paintSelect.setAttribute('aria-label','Circuit paint');
    for(const cosmetic of RACING_COSMETICS){
      const unlocked=racingCosmeticUnlocked(cosmetic,career),option=el('option','',cosmetic.name+(unlocked?'':` · ${cosmetic.points} points to unlock`));
      option.value=cosmetic.id;option.disabled=!unlocked;paintSelect.appendChild(option);
    }
    paintSelect.value=career.liveryId||'factory';
    const paintNote=el('p','k-sentence','Your selection is fitted before the next temporary circuit launches.');
    paintSelect.addEventListener('change',()=>{
      if(selectRacingLivery(paintSelect.value,storageOf())){
        paintNote.textContent=`${racingCosmeticFor(paintSelect.value,readRacingCareer(storageOf())).name} selected for your next circuit.`;
      }else{paintSelect.value=readRacingCareer(storageOf()).liveryId||'factory';paintNote.textContent='This browser could not store your paint selection.';}
    });
    paintLabel.appendChild(paintSelect);paint.append(paintLabel,paintNote);
    if(inFlight(ctx)&&!isRacingCorridorSession(ctx.state)){
      const apply=el('button','k-word','Apply to adventure ship');apply.type='button';
      apply.addEventListener('click',()=>{
        const cosmetic=racingCosmeticFor(paintSelect.value,readRacingCareer(storageOf()));
        ctx.bus.emit('ui:setShipAppearance',{appearance:cosmetic.appearance});
        paintNote.textContent=`${cosmetic.name} applied to your current ship. Save your adventure to keep it.`;
      });paint.appendChild(apply);
    }
    rootEl.appendChild(paint);
    rootEl.appendChild(renderRacingRecognition(storageOf()));
    rootEl.appendChild(el('p','k-sentence','Fly through gates in order. In pack races, hold a matching line behind a rival to build draft; braking breaks it. Recovery keeps the clock running and excludes the attempt from clean best times. Records separate fitted ships, contract, lap count and course revision. Changing your fit during a run excludes it from clean records.'));
  },
  // Screens are cached after mount; refresh on every reopen so records and results never stale.
  refresh(ctx){if(this._root)this.mount(this._root,ctx);},
  unmount(){if(this._root)this._root.replaceChildren();this._root=null;},
  dispose(){this.unmount();},
  update(){},
};
