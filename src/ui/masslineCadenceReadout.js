/** Optional DOM view. Explicitly mount/update/destroy from the existing HUD owner.
 * No simulation mutation, subscription, timer, rAF, sound, aim assistance or renderer dependency.
 * update() reads the current packet synchronously; diagnostic strings use textContent, not HTML.
 */
export function createMasslineCadenceReadout(parent) {
  if (!parent?.ownerDocument) throw new TypeError('Cadence readout requires a DOM parent');
  const doc = parent.ownerDocument, root = doc.createElement('section');
  root.className = 'ml-cadence'; root.setAttribute('aria-label', 'Massline release instrument');
  root.innerHTML = `<style>
  .ml-cadence{--ml-ink:#eef7f4;--ml-muted:#91aaa7;--ml-accent:#85e9ca;--ml-warn:#f2bc72;
    box-sizing:border-box;width:min(330px,100%);padding:15px 17px 13px;border:1px solid #45615c;
    border-left:3px solid var(--ml-accent);border-radius:3px;background:#0c191bf2;color:var(--ml-ink);
    font:12px/1.4 ui-monospace,SFMono-Regular,Consolas,monospace;pointer-events:none}
  .ml-cadence[hidden]{display:none}.ml-cadence__top{display:flex;justify-content:space-between;gap:14px;
    color:var(--ml-muted);font-size:10px;letter-spacing:.13em}.ml-cadence__phase{color:var(--ml-accent)}
  .ml-cadence__status{margin:9px 0 2px;font:600 23px/1.1 system-ui,sans-serif;letter-spacing:-.04em}
  .ml-cadence__hint{font:11px/1.5 system-ui,sans-serif;color:var(--ml-muted);min-height:17px}
  .ml-cadence__bar{width:100%;height:19px;margin:9px 0 2px;display:block}
  .ml-cadence__stats{display:flex;justify-content:space-between;gap:14px;border-top:1px solid #34504a;padding-top:9px}
  .ml-cadence__value{font-size:15px}.ml-cadence__label{display:block;font-size:9px;letter-spacing:.12em;color:var(--ml-muted)}
  .ml-cadence[data-open="true"]{border-color:var(--ml-accent)}
  .ml-cadence[data-open="true"] .ml-cadence__status{color:var(--ml-accent)}
  .ml-cadence[data-field="true"] .ml-cadence__status{color:var(--ml-warn)}
  @media(max-width:600px){.ml-cadence{padding:11px 13px;width:280px}.ml-cadence__status{font-size:20px}}
  </style>
  <div class="ml-cadence__top"><span>MASSLINE / CADENCE</span><span class="ml-cadence__phase"></span></div>
  <div class="ml-cadence__status"></div><div class="ml-cadence__hint"></div>
  <svg class="ml-cadence__bar" viewBox="0 0 296 19" aria-label="Conditional coast window over the next 1.5 seconds">
    <path d="M0 9.5H296 M1 4V15 M99 7V12 M197 7V12 M295 4V15" fill="none" stroke="#45615c"/>
    <rect class="ml-cadence__window" x="0" y="5" width="0" height="9" fill="#85e9ca"/>
    <path d="M1 1V18" stroke="#eef7f4" stroke-width="2"/>
  </svg>
  <div class="ml-cadence__stats">
    <span><span class="ml-cadence__value" data-ml="speed"></span><span class="ml-cadence__label">EXIT / WU·S⁻¹</span></span>
    <span><span class="ml-cadence__value" data-ml="clearance"></span><span class="ml-cadence__label">CLEARANCE / WU</span></span>
    <span><span class="ml-cadence__value" data-ml="length"></span><span class="ml-cadence__label">LINE / WU</span></span>
  </div>`;
  parent.append(root);
  const get = selector => root.querySelector(selector);
  const el={phase:get('.ml-cadence__phase'),status:get('.ml-cadence__status'),hint:get('.ml-cadence__hint'),
    bar:get('.ml-cadence__window'),speed:get('[data-ml="speed"]'),clearance:get('[data-ml="clearance"]'),length:get('[data-ml="length"]')};
  const text=(node,value)=>{if(node.textContent!==value)node.textContent=value;};
  let destroyed=false;
  return { element: root,
    update(state) {
      if(destroyed)return;
      const tether=state?.player?.tether, solution=state?.massline2?.throw?.solution;
      const hide=!tether?.active;
      if(root.hidden!==hide)root.hidden=hide;
      if(hide)return;
      const window=solution?.window,open=!!(solution?.valid&&solution.onSolution&&!solution.decisionStale&&!solution.degraded);
      const field=solution?.fieldAware===true;
      const degraded=solution?.degraded===true;
      const entry=window?.reliable&&Number.isFinite(window.enterS)?window.enterS:null;
      const phase=String(tether.cadence?.phase||'coast').replaceAll('_',' ').toUpperCase();
      text(el.phase,phase);
      text(el.status,!solution?'Choose an exit target':open?'ON VECTOR':degraded?'TARGET TURNING':field?'CURVED FLIGHT':entry!=null?`COAST · ${entry.toFixed(2)} s`:'Build the next angle');
      text(el.hint,!solution?'Fly, draw, coast. A manual cut remains yours.':open?
        (field?'Snapshot field model intersects the target.':'Current free-flight path intersects the target.'):
        degraded?'Target is turning — the straight-line read is stale. Wait for a steady course.':
        field?'Field snapshot only; future motion may differ.':entry!=null?'Next aperture if both bodies coast.':
        window?.reason==='coast_required'?'Stop drawing to read the coast window.':'No near-term aperture. Turn or change radius.');
      text(el.speed,Number.isFinite(solution?.payloadSpeed)?solution.payloadSpeed.toFixed(0):'—');
      const clearance=solution?.clearance;
      text(el.clearance,Number.isFinite(clearance)?`${clearance>=0?'+':''}${clearance.toFixed(1)}`:'—');
      text(el.length,Number.isFinite(tether.restLength)?tether.restLength.toFixed(0):'—');
      const openText=String(open),fieldText=String(field),degradedText=String(degraded);
      if(root.dataset.open!==openText)root.dataset.open=openText;
      if(root.dataset.field!==fieldText)root.dataset.field=fieldText;
      if(root.dataset.degraded!==degradedText)root.dataset.degraded=degradedText;
      const start=entry==null?0:Math.min(1.5,entry), end=entry==null?0:Math.min(1.5,window.exitS??1.5);
      const barX=String(start/1.5*296),barW=String(Math.max(0,end-start)/1.5*296),barO=window?.exitS==null?'0.45':'1';
      if(el.bar.getAttribute('x')!==barX)el.bar.setAttribute('x',barX);
      if(el.bar.getAttribute('width')!==barW)el.bar.setAttribute('width',barW);
      if(el.bar.getAttribute('opacity')!==barO)el.bar.setAttribute('opacity',barO);
    },
    destroy(){destroyed=true;root.remove();},
  };
}
