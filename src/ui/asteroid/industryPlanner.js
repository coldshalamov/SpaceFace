// On-demand, read-only provisioning. Uses the existing ORRERY token root; no simulation owner.
import { COMMODITIES } from '../../data/commodities.js';
import { SITE_MACHINES, SITE_RECIPES } from '../../data/sites.js';
import { INDUSTRY_KITS, planSiteKit, planSiteProduction, summarizeIndustryCargo } from '../../systems/siteIndustryPlanner.js';
import { injectOrrery } from '../orrery/tokens.js';

const goods = new Map(COMMODITIES.map((c) => [c.id, c]));
const machines = new Map(SITE_MACHINES.map((m) => [m.id, m]));
const recipes = new Map(SITE_RECIPES.map((r) => [r.id, r]));
const name = (id) => id === 'pod' ? 'Courier pod' : (goods.get(id)?.name || id);
const fmt = (n) => Number(n.toFixed(2)).toLocaleString('en-US');

export function createIndustryPlanner(host) {
  const doc = host.ownerDocument;
  const win = doc.defaultView;
  injectOrrery(doc);
  const element = (tag, text, cls) => {
    const el = doc.createElement(tag);
    if (text != null) el.textContent = text;
    if (cls) el.className = cls;
    return el;
  };
  const button = element('button', 'Plan', 'dp-glass orr-label');
  button.type = 'button';
  button.setAttribute('aria-label', 'Plan asteroid industry');
  button.setAttribute('aria-haspopup', 'dialog');
  Object.assign(button.style, { position: 'absolute', left: '12px', bottom: '12px',
    minWidth: '64px', minHeight: '44px', pointerEvents: 'auto', cursor: 'pointer',
    background: 'var(--dp-glass-deep)', color: 'var(--dp-ink, #e8e2d4)',
    border: 'var(--dp-stroke) solid var(--dp-line)' });

  const dialog = element('dialog', null, 'dp-glass');
  dialog.setAttribute('aria-label', 'Asteroid industry planner');
  dialog.dataset.industryPlanner = 'true';
  Object.assign(dialog.style, { boxSizing: 'border-box', width: 'min(580px, calc(100vw - 24px))',
    maxHeight: 'calc(100dvh - 32px)', padding: '20px', overflow: 'auto', colorScheme: 'dark',
    pointerEvents: 'auto', background: 'var(--dp-void)', color: 'var(--dp-ink, #e8e2d4)',
    border: 'var(--dp-stroke) solid var(--dp-line)', fontFamily: 'var(--dp-face-label)' });
  const heading = element('h2', 'Build the next link', 'orr-display');
  Object.assign(heading.style, { fontSize: '1.6rem', margin: '0 0 12px' });
  const header = element('div');
  Object.assign(header.style, { display: 'flex', alignItems: 'start', justifyContent: 'space-between', gap: '12px' });
  const dismiss = element('button', '×', 'dp-glass orr-value'); dismiss.type = 'button';
  dismiss.setAttribute('aria-label', 'Close industry plan');
  Object.assign(dismiss.style, { minWidth: '44px', minHeight: '44px', flexShrink: '0', cursor: 'pointer',
    background: 'var(--dp-glass-deep)', color: 'inherit', border: 'var(--dp-stroke) solid var(--dp-line)' });
  header.append(heading, dismiss);
  const intro = element('p', 'Read-only cargo planning. No spending, placement, or stock reservations.');
  intro.style.lineHeight = '1.45';
  const controls = element('div');
  Object.assign(controls.style, { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 88px', gap: '12px' });
  const goalLabel = element('label', 'Goal ');
  const select = element('select');
  select.setAttribute('aria-label', 'Industry goal');
  const kitGroup = element('optgroup'); kitGroup.label = 'Bring a construction kit';
  for (const kit of INDUSTRY_KITS) {
    const option = element('option', kit.name); option.value = `kit:${kit.id}`; kitGroup.appendChild(option);
  }
  const productGroup = element('optgroup'); productGroup.label = 'Manufacture from raw materials';
  for (const recipe of SITE_RECIPES) {
    const id = Object.keys(recipe.output)[0];
    const option = element('option', name(id)); option.value = `product:${id}`; productGroup.appendChild(option);
  }
  select.append(kitGroup, productGroup);
  const quantityLabel = element('label', 'Quantity ');
  const amount = element('input');
  amount.type = 'number'; amount.min = '1'; amount.max = '999'; amount.step = '1'; amount.value = '1';
  amount.setAttribute('aria-label', 'Production quantity');
  for (const control of [select, amount]) Object.assign(control.style, { display: 'block',
    width: '100%', boxSizing: 'border-box', minHeight: '44px', marginTop: '6px',
    font: 'inherit', background: 'var(--dp-glass-deep)', color: 'inherit',
    border: 'var(--dp-stroke) solid var(--dp-line)' });
  goalLabel.appendChild(select); quantityLabel.appendChild(amount); controls.append(goalLabel, quantityLabel);
  const result = element('section'); result.setAttribute('aria-live', 'polite');
  const done = element('button', 'Return to build', 'dp-glass orr-label'); done.type = 'button';
  Object.assign(done.style, { minHeight: '44px', width: '100%', marginTop: '12px', cursor: 'pointer',
    background: 'var(--dp-glass-deep)', color: 'var(--dp-hand)', border: 'var(--dp-stroke) solid var(--dp-line)' });
  dialog.append(header, intro, controls, result, done);
  let visible = false;
  let destroyed = false;

  function paragraph(text) {
    const p = element('p', text); p.style.lineHeight = '1.45'; result.appendChild(p);
  }
  function list(title, amounts, label = name) {
    result.appendChild(element('h3', title, 'orr-label'));
    const dl = element('dl'); dl.style.margin = '12px 0';
    for (const [id, n] of Object.entries(amounts)) {
      const row = element('div');
      Object.assign(row.style, { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '12px',
        padding: '7px 0', borderBottom: 'var(--dp-stroke) solid var(--dp-line-faint)' });
      const dt = element('dt', label(id)); const dd = element('dd', fmt(n), 'orr-value');
      dt.style.overflowWrap = 'anywhere'; dd.style.margin = '0'; row.append(dt, dd); dl.appendChild(row);
    }
    result.appendChild(dl);
  }
  function cargoSummary(amounts) {
    const summary = summarizeIndustryCargo(amounts, COMMODITIES);
    if (summary.complete) paragraph(`Cargo: ${fmt(summary.volume)} volume · ${fmt(summary.mass)} mass. Catalog estimate: ${fmt(summary.nominalValue)} cr, not a station quote.`);
  }
  function render() {
    result.replaceChildren();
    const [kind, id] = select.value.split(':');
    amount.disabled = kind === 'kit';
    if (kind === 'kit') amount.value = '1';
    const n = Math.max(1, Math.min(999, Math.floor(Number(amount.value) || 1)));
    amount.value = String(n);
    try {
      if (kind === 'kit') {
        const plan = planSiteKit(id);
        paragraph(plan.note);
        list('Gross packing list', plan.manifest);
        cargoSummary(plan.manifest);
        list('Machines in this kit', plan.machines, (mid) => machines.get(mid)?.name || mid);
        paragraph(`${plan.drawMW} MW demand · ${plan.baseMW} MW from the Core. ${plan.minimumGasContacts
          ? `At least ${plan.minimumGasContacts} active gas-contact faces in generate mode are needed to cover the deficit.`
          : 'The Core covers this kit’s rated demand.'}`);
        paragraph(`Actual operation still needs reachable hollow cells, preserved geology, connected power and material lanes. Each material network is limited to ${plan.laneThroughputPerMin} moved units/minute. Existing cargo and installed machines are not subtracted here.`);
      } else {
        const plan = planSiteProduction({ targets: { [id]: n } });
        list('Raw feedstocks to source', plan.procurement);
        cargoSummary(plan.procurement);
        list('Requested output', plan.targets);
        cargoSummary(plan.targets);
        result.appendChild(element('h3', 'Manufacturing order', 'orr-label'));
        const order = element('ol'); Object.assign(order.style, { paddingLeft: '20px', lineHeight: '1.6' });
        for (const step of plan.steps) order.appendChild(element('li', `${recipes.get(step.recipeId)?.name || step.recipeId} × ${fmt(step.batches)}`));
        result.appendChild(order);
        if (Object.keys(plan.remainingStock).length) list('Extra output from whole batches', plan.remainingStock);
        paragraph(`${fmt(plan.machineSeconds / 60)} powered machine-minutes before power, lane, input or export delays. This is work required, not an arrival time.`);
        paragraph('Machines must already exist. Import the first construction kit; do not count on a factory to build itself. Hold intermediate materials at the port, then choose each machine’s recipe in the Site drawer. This planner does not automate mode changes.');
      }
    } catch (_error) {
      paragraph('This plan cannot be drawn from the recipes on file.');
    }
  }

  // Asteroid Works installs its action handler on DOCUMENT in capture phase. A dialog's
  // bubbling handler would be too late: Enter could build behind the planner. Intercept at
  // WINDOW capture, leaving native form defaults intact. Never swallow keyup: held rover
  // controls must still release while the panel is open.
  function shieldKeys(event) {
    if (!dialog.open && event.target !== button) return;
    event.stopPropagation();
    if (dialog.open && event.key === 'Escape') { event.preventDefault(); close(); }
  }
  function close() {
    if (dialog.open) dialog.close();
  }
  function open() {
    if (!visible || destroyed || dialog.open || !button.isConnected) return false;
    if (!dialog.isConnected) doc.body.appendChild(dialog);
    render();
    dialog.showModal();
    win.addEventListener('keydown', shieldKeys, true);
    select.focus();
    return true;
  }
  button.addEventListener('click', open);
  done.addEventListener('click', close);
  dismiss.addEventListener('click', close);
  select.addEventListener('change', render);
  amount.addEventListener('change', render);
  dialog.addEventListener('cancel', (event) => { event.preventDefault(); close(); });
  dialog.addEventListener('close', () => {
    if (dialog.open) return; // ignore an old queued close after an immediate reopen
    if (visible && !destroyed && button.isConnected) button.focus();
  });
  // No wheel or pointer gesture is forwarded to the underlying build surface.
  for (const target of [button, dialog]) {
    for (const type of ['pointerdown', 'pointerup', 'click', 'wheel']) {
      target.addEventListener(type, (event) => event.stopPropagation());
    }
  }

  return {
    get isOpen() { return dialog.open; },
    setVisible(value) {
      visible = !!value && !destroyed;
      if (visible) {
        if (!button.isConnected) host.appendChild(button);
        win.addEventListener('keydown', shieldKeys, true);
      } else {
        close(); button.remove(); win.removeEventListener('keydown', shieldKeys, true);
      }
    },
    close,
    destroy() {
      visible = false; destroyed = true; close(); button.remove(); dialog.remove();
      win.removeEventListener('keydown', shieldKeys, true);
    },
  };
}
