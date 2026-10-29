// Circuit selection is a real launch path, not a second campaign-save namespace.
import { el, cue, words } from '../kit/index.js';
import { injectDeckplate } from '../deckplate/index.js';
import { injectRaceBoardLayouts } from '../orrery/raceBoardLayouts.js';
import { dressLampKey } from '../orrery/lampKey.js';
import { confirm } from '../confirm.js';
import { RACING_CIRCUITS, courseForLevel, practiceContractForLevel, raceContractById, raceLevelById, racingOfferFor, racingSeedFor, circuitContracts } from '../../data/raceLevels.js';
import { readRaceRecords, raceRecordKey, normalizeSteeringView, STEERING_VIEWS, activeRaceMission } from '../../systems/racingSteer.js';
import { armRacingContract, stageRacingLaunch } from '../racingLaunch.js';
import { setSteeringView, lastRacingResult } from '../racingControls.js';
import { BINDINGS } from '../bindings.js';
import { createRacingMap, formatRaceTime } from '../racingMap.js';
import { formatDistance } from '../units.js';
import { DEFAULT_STARTER_ID, NEW_GAME_STARTERS } from '../../data/newGameDefaults.js';
import { RACING_DRIVES } from '../../data/racingLoadouts.js';
import { isRacingCorridorSession } from '../../world/racingCorridor.js';
import { RACING_MODES, RACING_DIFFICULTIES, CUP_HEATS, currentRacingCup, restoreRacingCup,
  abandonRacingCup, stageRacingCupHeat, releaseRacingCupHeat, readRacingCareer, selectRacingLivery,
  awardCourseMedal } from '../../systems/racingCareer.js';
import { RACING_COSMETICS, racingCosmeticFor, racingCosmeticUnlocked } from '../../data/racingCosmetics.js';
import { listRacingGhosts, exportRacingGhostByKey, clearRacingGhostByKey } from '../../systems/racingGhosts.js';
import { renderRacingRecognition } from '../racingRecognition.js';
import { racingSetPieceDefinitions } from '../../data/racingSetPieces.js';

const storageOf=()=>{try{return globalThis.localStorage||null;}catch{return null;}};
const manager=ctx=>ctx?.screenManager||ctx?.screens||ctx?.registry?.get?.('ui')?.screenManager;
const pop=ctx=>manager(ctx)?.popScreen?.();
const inFlight=ctx=>ctx?.state?.mode==='flight';

export async function runContract(ctx, contractId, level, fit, confirmLaunch = confirm) {
  if(!ctx?.bus)return false;
  const temporary=isRacingCorridorSession(ctx.state);
  // AL-RACE-2: sector circuits skip the in-sector campaign shortcut entirely —
  // they only exist inside their staged temporary session.
  if(inFlight(ctx)&&!temporary&&fit.raceMode==='time-trial'&&level.temporaryOnly!==true
    &&ctx.state.world?.currentSectorId===level.sectorId){
    // The arm can resolve on a worker rpc ack — a promise is not an acceptance result.
    const result=await armRacingContract(ctx,contractId,{...fit,allowEnterSector:false});
    if(result?.ok&&!result.reused){pop(ctx);return true;}
    return false;
  }
  const live=inFlight(ctx);
  const ok=temporary||ctx?.state?.mode==='menu'||await confirmLaunch({
    title:live?'Leave this flight for a circuit?':'Launch a temporary circuit flight?',
    body:live
      ? 'This replaces the current in-memory flight. Save it first to keep unsaved progress. Campaign slots cannot be overwritten during the circuit, including by autosave. Local racing bests are retained.'
      : `${level.name}. Campaign save slots stay untouched, including autosave. Local racing bests are retained.`,
    confirmLabel:'Launch circuit',cancelLabel:'Back',
  });
  if(!ok)return false;
  const cupFields=fit.raceMode==='cup'?stageRacingCupHeat(contractId,fit):{};
  if(!cupFields){ctx.bus.emit('toast',{text:'Continue the current cup heat or end the cup first.',kind:'info',ttl:3});return false;}
  const staged=stageRacingLaunch(contractId,{...fit,...cupFields});
  if(!staged||staged.ok===false){
    releaseRacingCupHeat(cupFields);
    if(staged?.reason==='time_trial_only')ctx.bus.emit('toast',{text:'Select Time trial to fly this circuit.',kind:'info',ttl:4});
    return false;
  }
  ctx.bus.emit('game:new',{seed:racingSeedFor(contractId),racingSession:true,starter:fit.starter,racingDrive:fit.drive,
    racingLivery:readRacingCareer(storageOf()).liveryId||'factory'});
  return true;
}

export const raceBoardScreen={
  id:'raceBoard',
  mount(rootEl,ctx){
    injectDeckplate();injectRaceBoardLayouts();rootEl.replaceChildren();rootEl.classList.add('k-screen','race-board');
    rootEl.setAttribute('aria-label','Racing circuits');this._root=rootEl;
    const title=el('header','k-title');
    title.append(el('p','k-sentence','CIRCUITS / FLIGHT'),el('h1','k-display k-t-title','Thread the needle.'),
      el('p','k-sentence',`${RACING_CIRCUITS.length} circuits with the same ships and drives you fly in adventure.`));
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
    // The key help rides the verb it fires as the deckplate key chip — never a floating
    // block over the cards. The sentence it replaced stays as the chip's account of itself.
    const viewKey=el('kbd','dp-kbd',BINDINGS.steeringView.label);
    view.title=`${BINDINGS.steeringView.label} switches chase / overhead in free flight; mission locks return your preferred view when they end.`;
    const viewLabel=()=>{view.textContent=`Practice: ${normalizeSteeringView(ctx?.state?.settings?.gameplay?.steeringView)}`;view.appendChild(viewKey);};
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
    // One guarded launch path for START and the in-flight retry: the guard drops before the
    // first await so a double click can never stage two launches.
    const launch=async(contractId,level,from='.race-board-launch')=>{
      if(this._launching)return;
      this._launching=true;
      rootEl.querySelectorAll('.race-board-launch,.race-board-retry').forEach(b=>{b.disabled=true;});
      cue('confirm');
      let launched=false;
      try{launched=await runContract(ctx,contractId,level,{...fit});}finally{
        this._launching=false;
        if(this._root){
          this.refresh(ctx);
          // Back/Escape on the confirm (or a refused arm) leaves focus on a control the refresh
          // just replaced; put a keyboard or pad player back on the key they pressed.
          const root=this._root,active=globalThis.document?.activeElement;
          if(!launched&&root&&!(active&&typeof root.contains==='function'&&root.contains(active))){
            const key=root.querySelector?.(from);
            if(key&&!key.disabled)try{key.focus({preventScroll:true});}catch{/* detached or hidden */}
          }
        }
      }
    };
    const result=lastRacingResult();
    if(result&&result.raceMode==='time-trial'&&result.status!=='dnf'&&Number.isFinite(result.raceElapsedS)&&!result.medalChecked){
      const levelId=result.levelId||raceContractById(result.racingContractId)?.levelId;
      const awarded=awardCourseMedal({levelId,elapsedS:result.raceElapsedS,raceMode:'time-trial'},storageOf());
      if(awarded?.ok||awarded?.reason==='no_medal'||awarded?.reason==='not_time_trial')result.medalChecked=true;
    }
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
        retry.addEventListener('click',()=>launch(contract.id,level,'.race-board-retry'));receipt.appendChild(retry);
      }
      rootEl.appendChild(receipt);
    }
    const records=readRaceRecords(storageOf()),ghosts=listRacingGhosts(storageOf()),stories=circuitContracts();
    const modeRow=RACING_MODES.find(row=>row.id===fit.raceMode);
    // One selectable entry per authored contract, in level order. Cup mode lists practices
    // only and keeps the existing next-heat eligibility rule. The six sector circuits are
    // Time-trial-only: Pack race and Cup can select the card to read it, never launch it.
    const entries=[];
    for(const level of RACING_CIRCUITS){
      const course=courseForLevel(level.id);
      if(!course)continue;
      const contracts=[practiceContractForLevel(level.id),
        ...(fit.raceMode==='cup'?[]:stories.filter(row=>row.levelId===level.id))].filter(Boolean);
      for(const row of contracts){
        const offer=racingOfferFor(row.id);
        const timeTrialOnly=level.temporaryOnly===true;
        const eligible=!!offer&&!(timeTrialOnly&&fit.raceMode!=='time-trial')
          &&(fit.raceMode!=='cup'||level.id===CUP_HEATS[continuing?cup.nextHeat:0]?.levelId);
        entries.push({contractId:row.id,level,course,contract:row,offer,eligible,timeTrialOnly});
      }
    }
    this._entries=entries;
    // Selection is transient screen state: never a launch, never a ticket, never persisted.
    if(!entries.some(e=>e.contractId===this._selectedContractId&&e.eligible)){
      const preferred=continuing?CUP_HEATS[cup.nextHeat]?.contractId:null;
      const fallback=entries.find(e=>e.contractId===preferred&&e.eligible)
        ||entries.find(e=>e.eligible&&e.contract.practice);
      this._selectedContractId=fallback?fallback.contractId:null;
    }
    // The start panel stays pinned while the cards scroll (raceBoardLayouts .race-board-start):
    // a pick on the last card must still see START and its status line.
    const startPanel=el('section','race-board-result race-board-start dp-glass');
    startPanel.setAttribute('aria-label','Selected event');
    const startTitle=el('h2','k-t-sub'),startMeta=el('p','k-sentence'),startStatus=el('p','k-sentence');
    startStatus.setAttribute('role','status');
    const start=el('button','race-board-launch','START');start.type='button';
    start.setAttribute('aria-label','Start the selected event');
    dressLampKey(start);
    const selectControls=new Map();
    const applySelection=()=>{
      const entry=entries.find(e=>e.contractId===this._selectedContractId)||null;
      for(const [id,button] of selectControls)button.setAttribute('aria-pressed',String(!!entry&&id===entry.contractId));
      const heatIndex=entry?CUP_HEATS.findIndex(heat=>heat.levelId===entry.level.id):-1;
      startTitle.textContent=entry?entry.contract.title:'No event selected';
      startMeta.textContent=entry
        ?`${entry.course.courseName} · ${modeRow.name}${fit.raceMode==='cup'&&heatIndex>=0?` · Cup heat ${heatIndex+1} of ${CUP_HEATS.length}`:''}`
        :modeRow.name;
      startStatus.textContent=!entry?'Select an event to start.'
        :current?'A race is active. Finish it before starting another.'
        :entry.eligible?'Ready to start.'
        :entry.timeTrialOnly?'Select Time trial to fly this circuit.'
        :'Cup heats run in order. Finish the current heat to open this one.';
      start.disabled=!!current||!!this._launching||!entry||!entry.eligible;
    };
    start.addEventListener('click',()=>{
      const entry=entries.find(e=>e.contractId===this._selectedContractId);
      if(!entry||start.disabled)return;
      launch(entry.contractId,entry.level);
    });
    startPanel.append(startTitle,startMeta,start,startStatus);
    this._selectControls=selectControls;
    const grid=el('div','race-board-grid');
    const select=contractId=>{this._selectedContractId=contractId;applySelection();};
    for(const [index,level] of RACING_CIRCUITS.entries()){
      const course=courseForLevel(level.id);
      if(!course)continue;
      for(const entry of entries.filter(e=>e.level===level)){
        const {contractId,contract:row,offer,eligible,timeTrialOnly}=entry;
        const card=el('section','race-board-course dp-plate');
        card.dataset.contractId=contractId;
        card.append(el('p','k-sentence',`CIRCUIT ${String(index+1).padStart(2,'0')} · ${course.courseName}`),el('h2','k-t-sub',row.title));
        const map=createRacingMap(course.gates,`${row.title} on ${level.name}, start and finish`);
        if(map)card.appendChild(map.element);
        card.append(el('p','k-sentence',level.blurb),
          el('p','k-sentence',`${formatDistance(course.courseLengthWU)} / lap · ${course.gates.length-1} legs · start / finish aligned`));
        const pieces=racingSetPieceDefinitions(course.courseId);
        if(pieces)card.appendChild(el('p','k-sentence',`Optional Massline anchors. ${pieces.crossing?'Watch for the scheduled cargo crossing; the amber ring marks a refuge.':pieces.wave?'Read the debris warning, then take a gap or wait in the amber refuge.':pieces.shutter?'A customs shutter closes the main cut; the green service lane stays open.':'Follow the marked line through the technical turns.'}`));
        if(fit.raceMode==='time-trial'&&course.medalTimes){
          const times=course.medalTimes;
          card.appendChild(el('p','k-sentence',`${level.name} medal times · Gold ${formatRaceTime(times.gold)} · Silver ${formatRaceTime(times.silver)} · Bronze ${formatRaceTime(times.bronze)}`));
          const earned=readRacingCareer(storageOf()).medals?.[level.id];
          if(earned)card.appendChild(el('p','k-sentence',`Your medal: ${earned.medal}`));
        }
        card.appendChild(el('p','k-sentence',row.summary));
        const recordPrefix=offer&&raceRecordKey(offer.params);
        const fitTimes=recordPrefix?Object.entries(records).filter(([key])=>key.startsWith(`${recordPrefix}:fit5-`)
          &&(fit.raceMode==='time-trial'?!key.includes(':pack-'):key.endsWith(`:pack-${fit.raceDifficulty}`))).map(([,time])=>time):[];
        const best=fitTimes.length?Math.min(...fitTimes):null;
        card.appendChild(el('p','k-sentence',`${row.laps} ${row.laps===1?'lap':'laps'} · ${row.practice?'view optional':'chase view required'} · ${Number.isFinite(best)?`best across fits ${formatRaceTime(best)}`:'no clean fit record yet'}`));
        if(timeTrialOnly&&fit.raceMode!=='time-trial'){
          card.appendChild(el('p','k-sentence','Select Time trial to fly this circuit.'));
        }else if(fit.raceMode==='cup'&&!eligible){
          const heatIndex=CUP_HEATS.findIndex(heat=>heat.levelId===level.id);
          card.appendChild(el('p','k-sentence',heatIndex>=0&&heatIndex<(cup?.nextHeat||0)
            ?`Cup heat ${heatIndex+1} of ${CUP_HEATS.length} — already finished.`
            :`Cup heat ${heatIndex+1>=0?heatIndex+1:CUP_HEATS.length} of ${CUP_HEATS.length} — finish the current heat to unlock.`));
        }
        const pickList=words([{action:contractId,label:row.title}],{system:'light',
          ariaLabel:`Select event on ${level.name}`,onPick:()=>select(contractId)});
        const pickButton=pickList.querySelector&&pickList.querySelector('button');
        if(pickButton){pickButton.setAttribute('aria-label',`Select ${row.title} on ${level.name}`);selectControls.set(contractId,pickButton);}
        card.appendChild(pickList);
        grid.appendChild(card);
      }
      // Personal ghosts belong to the course, so their controls render once per course
      // rather than once per contract on that course.
      const tapes=ghosts.filter(t=>t.courseId===course.courseId);
      if(tapes.length){
        const saved=el('section','race-board-course dp-plate');
        saved.append(el('p','k-sentence',`CIRCUIT 0${index+1} · ${course.courseName}`),el('h2','k-t-sub',`Personal ghosts · ${level.name}`));
        for(const tape of tapes){
          const row=el('div','race-board-contract');
          row.appendChild(el('p','k-sentence',`PERSONAL GHOST · ${tape.hullId.replace(/^ship_/,'')} · ${formatRaceTime(tape.elapsedS)}`));
          const exportButton=el('button','k-word','Export ghost');exportButton.type='button';
          exportButton.addEventListener('click',()=>{
            const json=exportRacingGhostByKey(storageOf(),tape.key);if(!json)return;
            const url=URL.createObjectURL(new Blob([json],{type:'application/json'})),link=document.createElement('a');
            link.href=url;link.download=`spaceface-${course.courseId}-ghost.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),0);
          });
          const remove=el('button','k-word','Delete ghost');remove.type='button';remove.addEventListener('click',()=>{
            const outcome=clearRacingGhostByKey(storageOf(),tape.key);
            if(outcome.ok)this.refresh(ctx);else ctx.bus.emit('toast',{text:'This browser could not delete the ghost.',kind:'warn',ttl:3});
          });row.append(exportButton,remove);saved.appendChild(row);
        }
        grid.appendChild(saved);
      }
    }
    rootEl.appendChild(startPanel);
    rootEl.appendChild(grid);
    applySelection();
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
  unmount(){if(this._root)this._root.replaceChildren();this._root=null;
    this._entries=null;this._selectControls=null;this._selectedContractId=null;this._launching=false;},
  dispose(){this.unmount();},
  update(){},
};
