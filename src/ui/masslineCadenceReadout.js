import { isWreckLike } from '../systems/scanner.js';
import { targetDisplayName } from './targetPanel.js';
import { flightHudFocusShortcut } from './bindings.js';

/** Optional DOM view. Explicitly mount/update/destroy from the existing HUD owner.
 * No simulation mutation, sound, aim assistance or renderer dependency. The disclosure refreshes
 * at 4 Hz while open, even when the mounting HUD skips unchanged frames.
 * update() reads the current packet synchronously; diagnostic strings use textContent, not HTML.
 */

const finiteOr = (value) => (Number.isFinite(value) ? value : undefined);

/**
 * FB-011 — the five instrument columns, read from the telemetry the sim already
 * publishes. No line → every column is undefined. Nothing here is computed:
 * load, stored swing energy, apex proximity, exit speed and time-to-whip are
 * fields masslineTelemetry already wrote this tick.
 */
export function resolveMasslineInstrumentColumns(state) {
  const tether = state && state.player && state.player.tether;
  if (!tether || tether.active !== true) {
    return { load: undefined, energy: undefined, apex: undefined, exit: undefined, whip: undefined };
  }
  const tel = state.player.masslineTelemetry || null;
  const preview = tel && tel.arcPreview;
  const whip = preview && Object.prototype.hasOwnProperty.call(preview, 'timeToWhip')
    ? preview.timeToWhip
    : undefined;
  return {
    load: finiteOr(tel ? tel.load : tether.load),
    energy: finiteOr(tel && tel.storedSwingEnergy),
    apex: finiteOr(tel && tel.apexProximity),
    exit: finiteOr(preview && preview.exitSpeed),
    whip: whip == null ? whip : finiteOr(whip),
  };
}

/** The whip column is a countdown the pilot is standing on. Inside one second
 *  it is 'soon' (the warn colour). A live longer count is 'idle'. No line is 'none'. */
export function whipUrgency(whip) {
  if (whip == null || !Number.isFinite(whip)) return 'none';
  return whip < 1 ? 'soon' : 'idle';
}

function columnText(key, value) {
  if (value == null || !Number.isFinite(value)) return '—';
  if (key === 'load' || key === 'apex') return value.toFixed(2);
  if (key === 'whip') return value.toFixed(1);
  return String(Math.round(value));
}

// Compute only when the player opens details or the viewport changes. The two edge lanes
// protect the action in the centre and subtract the real HUD boxes measured by the caller.
export function resolveCadenceDetailsPlacement({ width, height, obstacles = [], desiredHeight = 220 } = {}) {
  const w = Number(width), h = Number(height), margin = 8;
  if (!(w > margin * 4 && h > margin * 2)) return null;
  const panelWidth = Math.min(300, Math.floor((w - margin * 3) / 2));
  const lanes = [w - margin - panelWidth, margin];
  let best = null;
  for (const left of lanes) {
    const right = left + panelWidth;
    const cuts = [];
    for (const box of obstacles) {
      if (!box || !(Number(box.right) > left - margin && Number(box.left) < right + margin)) continue;
      const top = Math.max(margin, Number(box.top) - margin);
      const bottom = Math.min(h - margin, Number(box.bottom) + margin);
      if (Number.isFinite(top) && Number.isFinite(bottom) && bottom > top) cuts.push({ top, bottom });
    }
    cuts.sort((a, b) => a.top - b.top);
    let cursor = margin;
    const consider = (end) => {
      const available = end - cursor;
      if (available < 32) return;
      const panelHeight = Math.min(available, Math.max(32, Number(desiredHeight) || 220));
      if (!best || panelHeight > best.height) best = { left, top: cursor, right, bottom: cursor + panelHeight,
        width: panelWidth, height: panelHeight };
    };
    for (const cut of cuts) { consider(cut.top); cursor = Math.max(cursor, cut.bottom); }
    consider(h - margin);
  }
  return best;
}

const DETAIL_OBSTACLES = '.sf-leftcontext, #sf-comms, .sf-rightdock, .orr-hud-cluster, .sf-prail, '
  + '.sf-band-hud, .sf-command-deck, .sf-line-strain, .sf-caption.show, '
  + '.sf-toast:not(.sf-toast--out), #alerts > .sf-alert:not([hidden]), .sf-dock-prompt, '
  + '#sf-prompt-deck, #sf-tutorial-flight-card, '
  + '.mf-buttons, .mf-stick, .mf-nodes';

// The attached entity is the load, never the independently selected throw target.
export function masslineFlightRead(state) {
  const tether = state?.player?.tether;
  if (!tether?.active) return null;
  const body = tether.targetId != null ? state.entities?.get?.(tether.targetId) : null;
  const data = body?.data || {};
  const raw = body && ((isWreckLike(body) || body.type === 'ship' || body.type === 'payload') ? targetDisplayName(body)
    : data.displayName || data.name || data.label || (body.type === 'asteroid' ? 'Asteroid' : body.type));
  const name = typeof raw === 'string' && raw.trim() ? raw.trim().replaceAll('_', ' ') : 'Unknown load';
  const solution = state.massline2?.throw?.solution;
  let cue = 'Choose an exit target';
  if (solution) {
    if (solution.degraded || solution.decisionStale) cue = 'Release read uncertain · wait';
    else if (solution.valid && solution.onSolution) cue = solution.fieldAware ? 'Release path aligned · field estimate' : 'Release path aligned';
    else if (solution.window?.reason === 'coast_required') cue = 'Coast to read release';
    else if (solution.window?.reliable && Number.isFinite(solution.window.enterS)) cue = `${solution.fieldAware ? 'Field estimate' : 'If coasting'} · window in ${Math.max(0, solution.window.enterS).toFixed(1)} s`;
    else cue = 'Turn or change line length';
  }
  return { name, cue };
}

export function createMasslineCadenceReadout(parent) {
  if (!parent?.ownerDocument) throw new TypeError('Cadence readout requires a DOM parent');
  const doc = parent.ownerDocument, root = doc.createElement('section');
  root.className = 'ml-cadence'; root.setAttribute('aria-label', 'Massline release instrument');
  root.innerHTML = `<style>
  .ml-cadence{position:relative;top:0;box-sizing:border-box;width:calc(262px * clamp(.9, var(--k-s, 1), 1.15));max-width:calc(100vw - 32px);
    padding:8px 12px;border-radius:4px;border:1px solid rgb(236 230 216 / .13);border-left:2px solid var(--dp-lamp,#f2b950);
    background:linear-gradient(180deg, rgb(16 20 28 / .92), rgb(11 14 20 / .92));
    box-shadow:inset 0 1px 0 rgb(255 255 255 / .06), 0 12px 28px -8px rgb(0 0 0 / .72);
    color:var(--dp-ink,#e8e2d4);font:13px/1.35 var(--dp-face-read,"Instrument Sans",system-ui,sans-serif);pointer-events:none}
  .ml-cadence[hidden]{display:none}
  .ml-cadence__load{font-size:13px;font-weight:600;line-height:1.35;letter-spacing:.015em;word-spacing:.08em;color:var(--dp-ink-hi,#f4f1ea);margin-bottom:3px;overflow-wrap:anywhere}
  .ml-cadence__cue{font-size:12px;line-height:1.35;letter-spacing:.015em;word-spacing:.08em;color:var(--dp-ink-dim,#9ba3b0)}
  .ml-cadence[data-open="true"] .ml-cadence__cue{color:var(--dp-phos,#dfeeff)}
  .ml-cadence details{pointer-events:auto;margin-top:5px;padding-top:5px;border-top:1px solid rgb(236 230 216 / .08)}
  .ml-cadence summary{cursor:pointer;font-size:12px;font-weight:500;letter-spacing:.015em;color:var(--dp-ink,#e8e2d4);width:100%}
  .ml-cadence__focus-hint{display:block;margin-top:2px;font-family:var(--dp-face-num,"Spline Sans Mono",monospace);font-size:12px;font-weight:400;color:var(--dp-ink-dim,#9ba3b0);opacity:.85}
  .ml-cadence summary:focus-visible{outline:1px solid var(--dp-lamp,#f2b950);outline-offset:2px}
  .ml-cadence__detail{position:absolute;top:calc(100% + 4px);left:0;box-sizing:border-box;
    width:min(300px,calc(100vw - 44px));max-height:30vh;overflow:auto;overflow-wrap:anywhere;padding:10px 12px;
    border-radius:4px;border:1px solid rgb(236 230 216 / .14);
    background:linear-gradient(180deg, rgb(18 22 30 / .96), rgb(11 14 20 / .96));
    box-shadow:inset 0 1px 0 rgb(255 255 255 / .06), 0 12px 28px -8px rgb(0 0 0 / .78);
    color:var(--dp-ink,#e8e2d4);font-size:12px}
  @media(max-width:600px){
    .ml-cadence{width:min(260px,calc(50vw - 30px))}
    .ml-cadence summary{width:100%;white-space:normal;overflow-wrap:anywhere}
  }
  .ml-cadence__detail p{margin:0 0 7px}.ml-cadence__stats{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px 12px}
  .ml-cadence__value{font-family:var(--dp-face-num,"Spline Sans Mono",monospace);font-variant-numeric:tabular-nums}.ml-cadence__label{color:var(--dp-ink-dim,#9ba3b0)}
  .ml-cadence[data-whip="soon"] [data-ml="whip"]{color:var(--dp-danger-hot,#ff8a70)}
  </style>
  <div class="ml-cadence__load"></div><div class="ml-cadence__cue"></div>
  <details><summary role="button">Line details<span class="ml-cadence__focus-hint"></span></summary><div class="ml-cadence__detail" tabindex="0" aria-label="Line diagnostics">
    <p class="ml-cadence__hint"></p>
    <svg class="ml-cadence__bar" viewBox="0 0 296 19" role="img" aria-label="Conditional coast window over the next 1.5 seconds" style="width:100%;height:19px">
      <path d="M0 9.5H296 M1 4V15 M99 7V12 M197 7V12 M295 4V15" fill="none" stroke="var(--dp-ink-dim,#c6c3b8)"/>
      <rect class="ml-cadence__window" x="0" y="5" width="0" height="9" fill="var(--dp-phos,#dfeeff)"/>
      <path d="M1 1V18" stroke="var(--dp-ink,#e8e2d4)" stroke-width="2"/>
    </svg>
    <div class="ml-cadence__stats">
      <span><span class="ml-cadence__label">Phase </span><span class="ml-cadence__value" data-ml="phase"></span></span>
      <span><span class="ml-cadence__label">Release speed </span><span class="ml-cadence__value" data-ml="speed"></span></span>
      <span><span class="ml-cadence__label">Clearance / u </span><span class="ml-cadence__value" data-ml="clearance"></span></span>
      <span><span class="ml-cadence__label">Line / u </span><span class="ml-cadence__value" data-ml="length"></span></span>
      <span><span class="ml-cadence__label">Load </span><span class="ml-cadence__value" data-ml="load"></span></span>
      <span><span class="ml-cadence__label">Energy </span><span class="ml-cadence__value" data-ml="energy"></span></span>
      <span><span class="ml-cadence__label">Apex </span><span class="ml-cadence__value" data-ml="apex"></span></span>
      <span><span class="ml-cadence__label">Exit speed </span><span class="ml-cadence__value" data-ml="exit"></span></span>
      <span><span class="ml-cadence__label">Whip / s </span><span class="ml-cadence__value" data-ml="whip"></span></span>
    </div>
  </div></details>`;
  parent.append(root);
  const get = selector => root.querySelector(selector);
  const el={loadName:get('.ml-cadence__load'),cue:get('.ml-cadence__cue'),hint:get('.ml-cadence__hint'),focusHint:get('.ml-cadence__focus-hint'),bar:get('.ml-cadence__window'),
    phase:get('[data-ml="phase"]'),speed:get('[data-ml="speed"]'),clearance:get('[data-ml="clearance"]'),length:get('[data-ml="length"]'),
    load:get('[data-ml="load"]'),energy:get('[data-ml="energy"]'),apex:get('[data-ml="apex"]'),exit:get('[data-ml="exit"]'),whip:get('[data-ml="whip"]')};
  const details=get('details'), detailPanel=get('.ml-cadence__detail');
  const view=doc.defaultView || globalThis.window;
  const text=(node,value)=>{if(node._mlText!==value){node._mlText=value;node.textContent=value;}};
  const prev={hide:null,open:null,whip:null,barX:null,barW:null,barO:null};
  const hideRoot=hide=>{if(prev.hide!==hide){prev.hide=hide;root.hidden=hide;}};
  let destroyed=false, latestState=null, previousFocus=null, refreshTimer=null, hintTimer=null, hintState=null;
  const onFocus=(event)=>{if(event.relatedTarget && !root.contains(event.relatedTarget)) previousFocus=event.relatedTarget;};
  const onKey=(event)=>event.stopPropagation();
  root.addEventListener?.('focusin',onFocus);
  root.addEventListener?.('keydown',onKey);
  function restoreFocus() {
    if(root.contains?.(doc.activeElement) && previousFocus?.isConnected && typeof previousFocus.focus === 'function') previousFocus.focus();
    previousFocus=null;
  }
  function stopRefresh() { if(refreshTimer!=null){clearTimeout(refreshTimer);refreshTimer=null;} }
  function stopHint() { if(hintTimer!=null){clearTimeout(hintTimer);hintTimer=null;} hintState=null; }
  function refreshHint() {
    hintTimer=null;
    if(destroyed || !latestState || prev.hide) return;
    const shortcut=flightHudFocusShortcut(latestState);
    text(el.focusHint,shortcut.available===false ? shortcut.label : `${shortcut.label}: focus flight controls`);
    hintTimer=setTimeout(refreshHint,1000);
  }
  function hide() { stopRefresh(); stopHint(); view?.removeEventListener?.('resize',onResize); restoreFocus(); hideRoot(true); if(details.open) details.open=false; }
  function update(state) {
    if(destroyed)return;
    latestState=state;
    const tether=state?.player?.tether, solution=state?.massline2?.throw?.solution;
    const read=masslineFlightRead(state);
    if(!read){
      hide();
      if(prev.whip!=='none'){prev.whip='none';root.dataset.whip='none';}
      return;
    }
    hideRoot(false);
    text(el.loadName,`LINE · ${read.name}`);
    text(el.cue,read.cue);
    // The HUD owner may skip a settled frame even after a rebind. Refresh the hint at 1 Hz
    // while visible, independently of that signature and without per-frame allocations.
    if(state!==hintState || hintTimer==null){
      stopHint();hintState=state;refreshHint();
    }
    const open=!!(solution?.valid && solution.onSolution && !solution.decisionStale && !solution.degraded);
    const openText=String(open);
    if(prev.open!==openText){prev.open=openText;root.dataset.open=openText;}
    if(!details.open) return;
    const window=solution?.window;
    text(el.hint,!solution?'No release target selected.':solution.degraded||solution.decisionStale?
      'The prediction is stale or uncertain.':solution.fieldAware?
      'Field snapshot estimate; future motion may differ.':window?.reliable?
      'Coast window assumes both bodies continue on their present paths.':'No reliable near-term coast window.');
    text(el.phase,String(tether.cadence?.phase || tether.phase || 'unknown').replaceAll('_',' '));
    text(el.speed,Number.isFinite(solution?.payloadSpeed)?solution.payloadSpeed.toFixed(0):'—');
    const clearance=solution?.clearance;
    text(el.clearance,Number.isFinite(clearance)?`${clearance>=0?'+':''}${clearance.toFixed(1)}`:'—');
    text(el.length,Number.isFinite(tether.restLength)?tether.restLength.toFixed(0):'—');
    const entry=!solution?.degraded && !solution?.decisionStale && window?.reliable && Number.isFinite(window.enterS) ? Math.max(0, Math.min(1.5,window.enterS)) : null;
    const end=entry==null ? 0 : Math.max(entry,Math.min(1.5,Number.isFinite(window.exitS)?window.exitS:1.5));
    const barX=String((entry??0)/1.5*296),barW=String((end-(entry??0))/1.5*296),barO=window?.exitS==null?'0.45':'1';
    if(prev.barX!==barX){prev.barX=barX;el.bar.setAttribute('x',barX);}
    if(prev.barW!==barW){prev.barW=barW;el.bar.setAttribute('width',barW);}
    if(prev.barO!==barO){prev.barO=barO;el.bar.setAttribute('opacity',barO);}
    const columns=resolveMasslineInstrumentColumns(state);
    for(const key of ['load','energy','apex','exit','whip']) text(el[key],columnText(key,columns[key]));
    const urgency=whipUrgency(columns.whip);
    if(prev.whip!==urgency){prev.whip=urgency;root.dataset.whip=urgency;}
  }
  function refreshOpenDetails() {
    refreshTimer=null;
    if(destroyed || !details.open || !latestState) return;
    update(latestState);
    if(details.open && !destroyed) refreshTimer=setTimeout(refreshOpenDetails,250);
  }
  function layoutDetails() {
    if (!details.open || !view || typeof root.getBoundingClientRect !== 'function'
        || typeof doc.querySelectorAll !== 'function') return;
    const base=root.getBoundingClientRect();
    const width=Number(view.innerWidth), height=Number(view.innerHeight);
    if (!(width>0 && height>0)) return;
    const obstacles=[base];
    const nodes=doc.querySelectorAll(DETAIL_OBSTACLES);
    for(let i=0;i<Math.min(nodes.length,64);i++){
      const node=nodes[i];
      if(!node || node.hidden || node.isConnected===false || typeof node.getBoundingClientRect!=='function') continue;
      const style=view.getComputedStyle?.(node);
      if(style && (style.display==='none' || style.visibility==='hidden' || (style.opacity!=='' && Number(style.opacity)===0))) continue;
      const rect=node.getBoundingClientRect();
      if(rect.width>0 && rect.height>0) obstacles.push(rect);
    }
    const targetWidth=Math.min(300,Math.floor((width-24)/2));
    detailPanel.style.width=`${targetWidth}px`;
    const placement=resolveCadenceDetailsPlacement({width,height,obstacles,desiredHeight:detailPanel.scrollHeight||220});
    // If every edge lane is occupied, use the compact instrument's own area rather than
    // covering a different instrument. It remains a focusable scroll region.
    const fallback={left:Math.max(8,base.left),top:Math.max(8,base.top),
      width:Math.max(32,Math.min(targetWidth,base.width,width-16)),height:Math.max(32,Math.min(base.height-28,height-16))};
    const box=placement||fallback;
    detailPanel.style.width=`${Math.round(box.width)}px`;
    detailPanel.style.left=`${Math.round(box.left-base.left-(root.clientLeft||0))}px`;
    detailPanel.style.top=`${Math.round(box.top-base.top-(root.clientTop||0))}px`;
    detailPanel.style.bottom='auto';
    detailPanel.style.maxHeight=`${Math.floor(box.height)}px`;
  }
  const onResize=()=>{if(details.open)layoutDetails();};
  const onToggle=()=>{
    stopRefresh();
    view?.removeEventListener?.('resize',onResize);
    if(details.open){layoutDetails();view?.addEventListener?.('resize',onResize);refreshOpenDetails();}
  };
  details.addEventListener?.('toggle',onToggle);
  return {element:root,hide,update,
    destroy(){stopRefresh();stopHint();restoreFocus();destroyed=true;view?.removeEventListener?.('resize',onResize);details.removeEventListener?.('toggle',onToggle);
      root.removeEventListener?.('focusin',onFocus);root.removeEventListener?.('keydown',onKey);
      root.remove();}};
}
