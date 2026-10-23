// A thin adapter to the ONE flight decision deck. Deck owns keyboard/gamepad/touch,
// attention placement and cancellation. This module reads readiness, never computes it.
import { getPromptDeck } from './promptDeck.js';
import { queryShipjack, isBlackFlagAdventure } from '../shipjack/model.js';
import { BLACK_FLAG_TERMS, BLACK_FLAG_ENCOUNTER_BY_ID } from '../data/blackFlag.js';
import { laneInputWrite } from '../core/simLaneCommands.js';

const PANEL_ID = 'black-flag:acquisition';
const LABELS = Object.freeze({
  scan: 'Read frame & signal', hail: 'Hail / guarantee safe passage', isolator: 'Pulse drive isolator',
  probe: 'Find signal access', port: 'Expose service port', helm: 'Assert helm control',
  secure: 'Secure physical custody', transfer: 'Transfer into this ship', abort: 'Release the attempt',
  beacon: 'Mark recovery beacon', distress: 'Send distress / request tow', navigate: 'Plot recovery course',
  shutdown: 'Interrupt propulsion', cargo: 'Release freight', tow: 'Tow to receiving berth', release: 'Release custody',
});

export function shipjackActionLabel(action) { return LABELS[action] || 'Inspect vessel'; }

/** Text-only, quantized telemetry: no 60 Hz label jitter and no omniscient legal claim. */
export function shipjackPromptDetail(view) {
  if (!view) return '';
  const readiness = view.readiness || {};
  const reasons = (readiness.reasons || []).slice(0, 2).map(reason =>
    typeof reason === 'string' ? reason : reason.label || reason.reason || '').filter(Boolean);
  const speed = Number.isFinite(readiness.relativeSpeed) ? `Relative speed ${Math.round(readiness.relativeSpeed)} wu/s` : '';
  const dwell = Number.isFinite(readiness.dwell) ? `steady ${Math.floor(readiness.dwell * 2) / 2}s` : '';
  const title = BLACK_FLAG_TERMS[view.titleStatus] || view.titleLabel || 'Title unconfirmed — read the frame';
  return [view.detail, title, [speed, dwell].filter(Boolean).join(' · '), reasons.join(' · ')].filter(Boolean).map(text=>text.replace(/[.\s]+$/,'')).join('. ');
}

export function shipjackPromptActions(view, page = 0) {
  const actions = (view?.actions || []).filter(row => row && row.action);
  const pages = Math.max(1, Math.ceil(actions.length / 2));
  const current = Math.min(Math.max(0, page), pages - 1);
  const rows = actions.slice(current * 2, current * 2 + 2).map(row => ({
    id: row.action, label: row.label || shipjackActionLabel(row.action),
    disabled: row.enabled === false, reason: row.reason || '', danger: row.action === 'isolator',
  }));
  if (view?.vesselId && ((view.readiness?.distance || 0) > 115 || actions.length && actions.every(row=>row.enabled===false))) rows.unshift({id:'$course',label:'Approach on autopilot'});
  if (pages > 1) rows.push({ id: '$more', label: current + 1 < pages ? 'Other approaches' : 'First approaches' });
  rows.push({ id: '$close', label: 'Return to flight', cancel: true });
  return rows;
}

export function createBlackFlagPrompt(ctx, { read = queryShipjack, deck = getPromptDeck } = {}) {
  const { state, bus } = ctx;
  const offs = [];
  let selected = null, dismissed = null, signature = '', page = 0, frames = 0, pending = false;
  let opportunity = null, priorHull = null;
  let distressShown = null;
  const resolve = () => { deck()?.resolveDecision(PANEL_ID); signature = ''; };
  const clear = () => { selected = null; dismissed = null; page = 0; pending = false; opportunity = null; priorHull = null; distressShown=null; resolve(); deck()?.resolveDecision('black-flag:opportunity'); deck()?.resolveDecision('black-flag:prior-hull'); deck()?.resolveDecision('black-flag:distress'); };
  const on = (event, fn) => { const off = bus.on(event, fn); if (typeof off === 'function') offs.push(off); };
  const offerDistress = (force=false) => {
    const pilot=state.entities?.get(state.playerId);
    if(!isBlackFlagAdventure(state)||state.mode!=='flight'||state.ui?.docked||!pilot?.alive)return;
    const owned=state.player?.ownedShips?.[state.player.activeShipIndex];
    if(!owned?.vesselId)return;
    const runtime=state.combat?.entities?.[String(pilot.id)],drive=runtime?.subsystems?.subsystem_drive;
    const disabled=owned.shipjackDriveRemoved===true||drive?.effectiveDisabled===true||drive?.destroyed===true||runtime?.capabilities?.drive===false;
    if(!disabled){distressShown=null;deck()?.resolveDecision('black-flag:distress');return;}
    const generation=pilot.data?.shipjackGeneration ?? pilot.occupantGeneration;
    const key=`${pilot.id}:${generation}`;
    if(!force&&distressShown===key)return;
    const prompt=deck();if(!prompt)return;distressShown=key;
    prompt.offerDecision({id:'black-flag:distress',kind:'warn',sender:'DISABLED HULL · RECOVERY CHANNEL',
      headline:'Drive unavailable',
      detail:'Your hull is still intact. Mark its distress beacon, transfer back to a nearby retained hull, or keep working on recovery. No service tug has accepted. Pulse the scanner to reopen this channel.',
      choices:[{id:'distress',label:'Send distress / mark hull beacon'},{id:'leave',label:'Keep working on recovery',cancel:true}],
      onChoose:action=>{
        prompt.resolveDecision('black-flag:distress');
        const live=state.entities?.get(pilot.id);
        if(action!=='distress'||!isBlackFlagAdventure(state)||state.mode!=='flight'||state.ui?.docked||state.playerId!==pilot.id||!live?.alive
          ||(live.data?.shipjackGeneration ?? live.occupantGeneration)!==generation)return;
        bus.emit('ui:shipjack',{action});
      }});
  };
  const show = (force = false) => {
    const targetId = state.player?.targetId;
    if (targetId == null) { selected = null; dismissed = null; resolve(); return; }
    if (state.mode !== 'flight' || state.ui?.docked) { resolve(); return; }
    if (targetId !== selected) { selected = targetId; dismissed = null; page = 0; pending = false; signature = ''; }
    if (dismissed === targetId && !force) return;
    const view = read(state, targetId);
    if (!view || view.eligible === false) { resolve(); return; }
    const choices = shipjackPromptActions(view, page).map(row => ({ ...row, disabled: row.disabled || (pending && !row.id.startsWith('$')) }));
    const spec = {
      id: PANEL_ID, kind: view.titleStatus === 'hot' ? 'warn' : 'info', sender: 'BLACK FLAG · VESSEL LINK',
      headline: view.name || 'Vessel acquisition', detail: shipjackPromptDetail(view),
      statusFlag: pending ? 'REQUEST TRANSMITTED' : view.stageLabel || '',
      choices,
      onChoose: (action, source) => {
        if (action === '$close') {
          if (view.transferPending) bus.emit('ui:shipjack',{action:'abort',targetId,generation:view.generation,vesselId:view.vesselId});
          dismissed = targetId; resolve(); return;
        }
        if (action === '$course') { bus.emit('ui:shipjack',{action:'navigate',vesselId:view.vesselId}); return; }
        if (action === '$more') { page = (page + 1) % Math.max(1, Math.ceil((view.actions || []).length / 2)); signature = ''; show(true); return; }
        // A button captured from an old target/occupant never acquires the newly selected body.
        if (pending || state.player?.targetId !== targetId) return;
        const row = (view.actions || []).find(item => item.action === action);
        if (!row || row.enabled === false) return;
        pending = true; signature = '';
        bus.emit('ui:shipjack', { action, targetId, generation: view.generation, vesselId: view.vesselId,
          expectedRevision: view.revision, source });
        show(true);
      },
    };
    const next = JSON.stringify([targetId, view.generation, spec.headline, spec.detail, spec.statusFlag, choices]);
    if (next === signature) return;
    signature = next;
    const prompt = deck(); if (!prompt) { signature = ''; return; }
    if (!prompt.updateDecision(PANEL_ID, spec)) prompt.offerDecision(spec);
  };
  on('shipjack:open', () => { dismissed = null; show(true); });
  on('scan:pulse',()=>{ dismissed = null; show(true); offerDistress(true); });

  on('shipjack:opportunity', payload => {
    if (!payload || payload.entityId == null || !isBlackFlagAdventure(state)) return;
    opportunity = payload;
  });
  on('ship:controlTransferred', receipt => {
    if (!receipt?.ok || receipt.fromId == null || !receipt.fromVesselId || !isBlackFlagAdventure(state)) return;
    // Runtime mirrors may follow this receipt. Resolve the actual body on a later frame.
    priorHull = { ...receipt, waits: 0 };
  });
  on('shipjack:result', result => {
    pending = false; signature = '';
    if (result?.action === 'scan' && result.ok) dismissed = null;
    // The simulation's receipt lane already owns the result toast/caption.
    // Property truth and worker mirroring can follow the receipt in the same event fanout.
  });
  for (const event of ['game:new', 'game:load', 'save:restoring', 'save:loaded', 'game:exitToMenu', 'sector:exit', 'player:death']) on(event, clear);
  return {
    open() { dismissed = null; show(true); },
    frame() {
      if (++frames % 8 !== 0) return;
      offerDistress();
      show();
      if (priorHull && state.mode === 'flight' && !state.ui?.docked && isBlackFlagAdventure(state)) {
        const receipt = priorHull;
        const entity = state.entities?.get(receipt.fromId);
        if (state.playerId === receipt.toId && entity?.alive && entity.data?.vesselId === receipt.fromVesselId) {
          priorHull = null;
          const generation = entity.data.shipjackGeneration;
          deck()?.offerDecision({ id:'black-flag:prior-hull', kind:'info', sender:'PREVIOUS HULL · RECOVERY SIGNAL',
            headline:entity.data.name || 'Your previous ship remains here',
            detail:'Your former hull is still drifting beside you. Acquire its signal to transfer back or arrange its recovery. Its position is retained in the station registry.',
            choices:[{id:'target',label:'Acquire previous hull signal'},{id:'leave',label:'Keep flying',cancel:true}],
            onChoose: action => {
              deck()?.resolveDecision('black-flag:prior-hull');
              const live = state.entities?.get(receipt.fromId);
              if (action !== 'target' || !isBlackFlagAdventure(state) || state.mode !== 'flight' || state.ui?.docked
                || state.playerId !== receipt.toId || !live?.alive || live.data?.vesselId !== receipt.fromVesselId
                || live.data?.shipjackGeneration !== generation) return;
              laneInputWrite(state,'player.targetId',live.id);
              laneInputWrite(state,'ui.objectSelection',null);
              laneInputWrite(state,'input.targetAssistDisabled',false);
              dismissed = null; signature = ''; show(true);
            },
          });
        } else if (++receipt.waits >= 15) priorHull = null;
      }
      if (!opportunity || state.mode !== 'flight' || state.ui?.docked || !isBlackFlagAdventure(state)) return;
      const payload = opportunity; opportunity = null;
      const entity = state.entities?.get(payload.entityId);
      if (!entity?.alive) return;
      const generation = entity.data?.shipjackGeneration;
      const authored = BLACK_FLAG_ENCOUNTER_BY_ID.get(payload.encounterId);
      deck()?.offerDecision({ id:'black-flag:opportunity', kind:'info', sender:'LOCAL RECOVERY CHANNEL',
        headline:authored?.name || 'A ship worth bringing home',
        detail:authored?.intro || 'An intact frame is drifting nearby. Read its registry before deciding who should keep it.',
        choices:[{id:'target',label:'Acquire vessel signal'},{id:'course',label:'Plot the last trajectory'},{id:'leave',label:'Leave it for now',cancel:true}],
        onChoose: action => {
          deck()?.resolveDecision('black-flag:opportunity');
          const live = state.entities?.get(payload.entityId);
          if (action === 'target' && live?.alive && live.data?.shipjackGeneration === generation) {
            laneInputWrite(state,'player.targetId',live.id);
            laneInputWrite(state,'ui.objectSelection',null);
            laneInputWrite(state,'input.targetAssistDisabled',false);
            dismissed = null; signature = ''; show(true);
          } else if (action === 'course') bus.emit('ui:shipjack',{action:'navigate',vesselId:payload.vesselId});
        },
      });
    },
    dispose() { offs.forEach(off => off()); clear(); },
  };
}
