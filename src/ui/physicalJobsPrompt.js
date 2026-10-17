import { getPromptDeck } from './promptDeck.js';

// All controls emit intents. Each menu rebuilds from the current public worker view.
export function createPhysicalJobsPrompt(ctx) {
  const { bus, state } = ctx, offs = [];
  const id = 'physical-job:tools';
  const notify = text => bus.emit('toast', { text, kind: 'info', ttl: 5 });
  const show = (headline, detail, rows, page = 0) => {
    const deck = getPromptDeck(); if (!deck) return;
    const visible = rows.slice(page * 7, page * 7 + 7);
    if ((page + 1) * 7 < rows.length) visible.push({ label: 'More', run: () => show(headline, detail, rows, page + 1) });
    if (page) visible.push({ label: 'Previous', run: () => show(headline, detail, rows, page - 1) });
    deck.offerDecision({ id, kind: 'info', sender: 'FIELD WORK', headline, detail,
      choices: visible.map((row, index) => ({ id: String(index), label: row.label })),
      onChoose: choice => { const row = visible[Number(choice)]; if (!row) return false; row.run(); return true; },
    });
  };
  const pick = (title, rows, callback, home) => show(title, 'Choose a live body. Fly alongside it before using a tool.',
    [...rows.map(row => ({ label: row.role || row.id || row.localId, run: () => callback(row) })), { label: 'Back', run: home }]);
  const mercy = () => {
    const view = state.mercyServicePublic;
    if (!view?.bodies?.length) { notify('Pulse the scanner near a distress return to find a rescue.'); return; }
    show(view.title || 'Mercy Service', `${view.priority || ''} ${view.order ? `Order: ${view.order}.` : ''} Use normal Massline to deliver secured bodies to recovery.`, [
      { label: 'Choose rescue order', run: () => show('Rescue order', 'Set the sequence before stabilizing the casualty.',
        (view.orders || []).map(order => ({ label: order.label || order.id, run: () => { bus.emit('mercyService:order', { order: order.id }); mercy(); } }))) },
      { label: 'Seat a rescue tool', run: () => pick('Rescue bodies', view.bodies, body => show(body.role || 'Rescue tools',
        'Bring the tool within reach of the hull. The ship and body keep their real momentum.',
        [...(body.tools || []).map(tool => ({ label: tool, run: () => { bus.emit('mercyService:tool', { tool, targetId: body.entityId }); mercy(); } })), { label: 'Back', run: mercy }]), mercy) },
      { label: 'Review casualties', run: () => { notify(view.bodies.map(body => `${body.role}: hull ${Math.round(body.hull || 0)}${body.volatile ? ', volatile' : ''}${body.clampAttached ? ', clamped' : ''}${body.rigAttached ? ', contained' : ''}`).join(' · ')); mercy(); } },
      { label: 'Return to flight', run: () => getPromptDeck()?.resolveDecision(id) },
    ]);
  };
  const action = payload => bus.emit('wreckCourt:action', payload);
  const court = () => {
    const view = state.wreckCourtPublic;
    if (!view?.bodies?.length) { notify('Find a loss investigation communicator to open a case.'); return; }
    const home = court;
    show(view.title || 'Wreck Court', view.fieldManual?.summary || view.briefing || 'Record what the wreckage shows. Reconstruct from your notebook, then file a supported claim.', [
      { label: 'Read a body', run: () => pick('Wreckage', view.bodies, body => show(body.id, 'Scan within reach. Moving or cutting the body can spoil its history.',
        [...['visual', 'thermal', 'trajectory', 'mass', 'structure', 'magazine', 'signal', 'fuel', 'spectro'].map(mode => ({ label: mode, run: () => { action({ verb: 'scan', targetId: body.id, mode }); court(); } })), { label: 'Back', run: home }]), home) },
      { label: 'Compare two bodies', run: () => pick('First body', view.bodies, first => pick('Second body', view.bodies.filter(body => body.id !== first.id), second => { action({ verb: 'compare', targetA: first.id, targetB: second.id }); court(); }, home), home) },
      { label: 'Reconstruct recorded evidence', run: () => { action({ verb: 'reconstructAll' }); court(); } },
      { label: 'Assay a delivered pod', run: () => pick('Delivered pod', view.bodies, body => pick('Assay point', view.assayPoints || [], assay => { action({ verb: 'bringPod', targetId: body.id, assayId: assay.id }); court(); }, home), home) },
      { label: 'Review claims / file', run: () => show('Claims', 'A supported statement can be filed. Missing or contradicted evidence stays in your notebook.',
        [...(view.hypotheses || []).map(hypothesis => {
          const support = (view.support || []).find(row => row.id === hypothesis.id);
          return { label: `${hypothesis.statement} · ${support?.supported ? 'supported' : support?.contradicted ? 'contradicted' : 'more evidence needed'}`,
            run: () => { action({ verb: 'file', hypothesisId: hypothesis.id }); court(); } };
        }), { label: 'Back', run: home }]) },
      { label: 'Return to flight', run: () => getPromptDeck()?.resolveDecision(id) },
    ]);
  };
  const on = (type, fn) => { const off = bus.on(type, fn); if (typeof off === 'function') offs.push(off); };
  const evidenceIds = new Set();
  on('siteEvidence:offer', row => {
    if (!row?.siteId || !Array.isArray(row.choices)) return;
    const evidenceId = `site-evidence:${row.siteId}`;
    evidenceIds.add(evidenceId);
    getPromptDeck()?.offerDecision({ id: evidenceId, kind: 'info', sender: 'FIELD EVIDENCE',
      headline: row.headline, detail: row.detail,
      choices: row.choices.map((choice, index) => ({ id: String(index), label: choice.label, cancel: choice.id === 'abort' })),
      onChoose: index => {
        const choice = row.choices[Number(index)];
        if (!choice) return false;
        getPromptDeck()?.resolveDecision(evidenceId);
        bus.emit('siteEvidence:action', { siteId: row.siteId, verb: choice.id, approach: choice.approach });
        return true;
      },
    });
  });
  on('siteEvidence:closed', row => getPromptDeck()?.resolveDecision(`site-evidence:${row?.siteId}`));
  const clearEvidence = () => { for (const evidenceId of evidenceIds) getPromptDeck()?.resolveDecision(evidenceId); evidenceIds.clear(); };
  // The mirror follows the event receipt. Show on a later UI task, after transport domains apply.
  let pending = null;
  on('mercyService:started', () => { pending = 'mercy'; });
  on('wreckCourt:opened', () => { pending = 'court'; });
  on('mercyService:toolResult', result => notify(result?.ok ? 'Rescue tool seated.' : `Tool not seated: ${String(result?.reason || 'move closer').replace(/_/g, ' ')}.`));
  on('wreckCourt:result', result => notify(result?.ok ? 'Evidence recorded in the notebook.' : `Evidence not accepted: ${String(result?.reason || 'read the bodies first').replace(/_/g, ' ')}.`));
  for (const type of ['game:new', 'game:load', 'sector:exit', 'game:exitToMenu', 'mercyService:completed', 'wreckCourt:ruled'])
    on(type, () => { pending = null; clearEvidence(); getPromptDeck()?.resolveDecision(id); });
  return { mercy, court, frame() {
    if (pending === 'mercy' && state.mercyServicePublic?.bodies?.length) { pending = null; mercy(); }
    if (pending === 'court' && state.wreckCourtPublic?.bodies?.length) { pending = null; court(); }
  }, dispose() { for (const off of offs) off(); clearEvidence(); getPromptDeck()?.resolveDecision(id); } };
}
