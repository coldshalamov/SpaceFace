// On-demand, read-only provisioning. Uses the existing ORRERY token root; no simulation owner.
import { COMMODITIES } from '../../data/commodities.js';
import { SITE_MACHINES, SITE_RECIPES, SITE_BALANCE } from '../../data/sites.js';
import { INDUSTRY_KITS, planSiteVisit, planSiteProduction, summarizeIndustryCargo } from '../../systems/siteIndustryPlanner.js';
import { injectOrrery } from '../orrery/tokens.js';

const goods = new Map(COMMODITIES.map((c) => [c.id, c]));
const machines = new Map(SITE_MACHINES.map((m) => [m.id, m]));
const recipes = new Map(SITE_RECIPES.map((r) => [r.id, r]));
const name = (id) => id === 'pod' ? 'Courier pod' : (goods.get(id)?.name || id);
const fmt = (n) => Number(n.toFixed(2)).toLocaleString('en-US');

export function createIndustryPlanner(host, { getContext = () => ({}), onOpen } = {}) {
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
  const intro = element('p', 'Bore a route. Keep valuable faces intact. Build beside them for a lasting supply.');
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
  const done = element('button', 'Return to asteroid', 'dp-glass orr-label'); done.type = 'button';
  Object.assign(done.style, { minHeight: '44px', width: '100%', marginTop: '12px', cursor: 'pointer',
    background: 'var(--dp-glass-deep)', color: 'var(--dp-hand)', border: 'var(--dp-stroke) solid var(--dp-line)' });
  dialog.append(header, intro, controls, result, done);
  let visible = false;
  let destroyed = false;
  let returnFocus = null;

  function paragraph(text, target = result) {
    const p = element('p', text); p.style.lineHeight = '1.45'; target.appendChild(p);
  }
  function list(title, amounts, label = name, target = result) {
    target.appendChild(element('h3', title, 'orr-label'));
    const dl = element('dl'); dl.style.margin = '12px 0';
    for (const [id, n] of Object.entries(amounts)) {
      const row = element('div');
      Object.assign(row.style, { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '12px',
        padding: '7px 0', borderBottom: 'var(--dp-stroke) solid var(--dp-line-faint)' });
      const dt = element('dt', label(id)); const dd = element('dd', fmt(n), 'orr-value');
      dt.style.overflowWrap = 'anywhere'; dd.style.margin = '0'; row.append(dt, dd); dl.appendChild(row);
    }
    target.appendChild(dl);
  }
  function cargoSummary(amounts, target = result) {
    const summary = summarizeIndustryCargo(amounts, COMMODITIES);
    if (summary.complete) paragraph(`${fmt(summary.volume)} cargo volume · about ${fmt(summary.nominalValue)} cr at catalog prices. Check the station’s live price.`, target);
  }
  function details(title) {
    const body = element('details');
    const summary = element('summary', title, 'orr-label');
    Object.assign(summary.style, { cursor: 'pointer', minHeight: '44px', alignContent: 'center' });
    body.appendChild(summary); result.appendChild(body);
    return body;
  }
  function nextSteps(plan) {
    const order = element('ol');
    Object.assign(order.style, { paddingLeft: '24px', lineHeight: '1.5' });
    const step = (title, text) => {
      const item = element('li'); item.style.margin = '12px 0';
      item.append(element('strong', `${title}. `), doc.createTextNode(text));
      order.appendChild(item);
      return item;
    };
    if (plan.buildOrder.length) {
      const procurement = step(plan.ready ? 'Supplies ready' : 'Buy the missing supplies', plan.ready
        ? 'The remaining construction materials are already in your ship’s hold.'
        : 'Exit, dock at a station, and open Market. Buy this shortfall, then return to the asteroid.');
      if (!plan.ready) {
        list('Shopping list', plan.missing, name, procurement);
        cargoSummary(plan.missing, procurement);
      }
      if (plan.id === 'first_claim') {
        if (plan.missingMachines.sm_massline_core) {
          step('Make a small alcove', 'Dig two side-by-side empty cells beside iron or silicate. Leave useful rock intact and keep a passage around the machines. Stand beside the first empty cell.');
          step('Build the Core, then an Extractor', 'Switch to Build and place the Core in that cell. Select Geological Extractor and place it beside the Core, touching preserved rock. Side-by-side machines connect automatically.');
        } else {
          step('Add the Extractor', 'Dig a reachable empty cell beside preserved iron or silicate. In Build, select Geological Extractor. Place it beside the Core, or connect both machines with Power Cable and Material Lane.');
        }
      } else {
        step('Add the missing machines', plan.buildOrder.map(({ machineId, count }) => `${fmt(count)} ${machines.get(machineId)?.name || machineId}`).join(' → ') + '. Keep a reachable passage and preserve the deposits each machine will use.');
        step('Connect and choose recipes', 'Side-by-side machines connect automatically. Across gaps, route both Power Cable and Material Lane. Open Log → Site → Machine mode to choose what each processor makes.');
      }
    } else {
      step('Check production', 'All machines in this kit are installed. Inspect any stopped machine: connect its power, supply its inputs, or recover output if its store is full.');
    }
    step('Recover output', 'Open Log → Site → Rover transfer. Choose a machine and a material, then Take all. This moves available whole units into your ship’s hold. Use To rover for a smaller batch.');
    if (plan.id === 'first_claim') step('Keep the deposit working', 'The preserved faces keep producing. Leave them intact; sell the output or save it for a Refining outpost. You can keep mining elsewhere while the machines run.');
    result.appendChild(order);
  }
  function render() {
    result.replaceChildren();
    const [kind, id] = select.value.split(':');
    amount.disabled = kind === 'kit';
    quantityLabel.hidden = kind === 'kit';
    controls.style.gridTemplateColumns = kind === 'kit' ? 'minmax(0, 1fr)' : 'minmax(0, 1fr) 88px';
    if (kind === 'kit') amount.value = '1';
    const n = Math.max(1, Math.min(999, Math.floor(Number(amount.value) || 1)));
    amount.value = String(n);
    try {
      if (kind === 'kit') {
        const plan = planSiteVisit(id, getContext() || {});
        heading.textContent = plan.id === 'first_claim' ? 'Your first working claim' : 'Build the next link';
        nextSteps(plan);
        const packing = details('Kit contents and supplies already aboard');
        list('Full kit', plan.grossManifest, name, packing);
        if (Object.keys(plan.packed).length) list('Already in your hold for the remaining build', plan.packed, name, packing);
        if (plan.buildOrder.length) list('Machines still to build', plan.missingMachines, (mid) => machines.get(mid)?.name || mid, packing);
        paragraph('Installed machines and your hold are counted above. Site stock stays in its own network; the placement preview checks what the selected cell can actually spend.', packing);
        const technical = details('Power, material lanes and deposit bonuses');
        paragraph(plan.note, technical);
        paragraph(`${plan.drawMW} MW demand · ${plan.baseMW} MW from the Core. ${plan.minimumGasContacts
          ? `At least ${plan.minimumGasContacts} active gas-contact faces in generate mode are needed to cover the deficit.`
          : 'The Core covers this kit’s rated demand.'}`, technical);
        paragraph(`Connect power cables to the Core and material lanes to every producer and consumer. A material network starts at ${SITE_BALANCE.laneThroughputPerMin} moved units/minute. Each powered Cargo Port adds ${SITE_BALANCE.laneThroughputPerPort}; this kit can carry ${plan.laneThroughputPerMin} on one connected network. Inputs and outputs both use capacity.`, technical);
        paragraph(`Useful deposits have two jobs: extract a lasting supply, or place a matching process beside them for faster production. Each matching face adds ${Math.round(SITE_BALANCE.processBonusPerContact * 100)}% speed, up to ${Math.round(SITE_BALANCE.maxProcessBonus * 100)}%; material demand rises with the extra output. A wide empty hall is easy to route but gives up those bonuses.`, technical);
      } else {
        heading.textContent = 'Make the next supply';
        const plan = planSiteProduction({ targets: { [id]: n } });
        list('Raw feedstocks to source', plan.procurement);
        cargoSummary(plan.procurement);
        list('Requested output', plan.targets);
        cargoSummary(plan.targets);
        result.appendChild(element('h3', 'Manufacturing order', 'orr-label'));
        const order = element('ol'); Object.assign(order.style, { paddingLeft: '20px', lineHeight: '1.6' });
        for (const step of plan.steps) {
          const recipe = recipes.get(step.recipeId);
          const contacts = [...(recipe?.contactOres || []).map(name), ...(recipe?.contactKinds || []).map((kind) => ({ matrix: 'silicate matrix', basalt: 'basalt', gas: 'sealed gas' }[kind] || kind))];
          order.appendChild(element('li', `${recipe?.name || step.recipeId} × ${fmt(step.batches)}${contacts.length ? ` · faster beside ${contacts.join(' / ')}` : ''}`));
        }
        result.appendChild(order);
        if (Object.keys(plan.remainingStock).length) list('Extra output from whole batches', plan.remainingStock);
        paragraph(`${fmt(plan.machineSeconds / 60)} powered machine-minutes before power, lane, input or export delays. This is work required, not an arrival time.`);
        paragraph('Import your first controllers and construction materials. Later, combine iron, copper, titanium, silicate and gas to make more locally; bring any ore this asteroid lacks. Keep a gas tap generating power and another supplying feedstock, or use Split. Hold intermediates at the port and choose recipes in Log → Site.');
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
  function open(kitId) {
    if (destroyed || !host.isConnected) return false;
    if (kitId != null) {
      if (!INDUSTRY_KITS.some((kit) => kit.id === kitId)) return false;
      select.value = `kit:${kitId}`;
    }
    if (dialog.open) { render(); select.focus(); return true; }
    returnFocus = doc.activeElement;
    onOpen?.();
    if (!dialog.isConnected) doc.body.appendChild(dialog);
    render();
    dialog.showModal();
    win.addEventListener('keydown', shieldKeys, true);
    select.focus();
    return true;
  }
  button.addEventListener('click', () => open());
  done.addEventListener('click', close);
  dismiss.addEventListener('click', close);
  select.addEventListener('change', render);
  amount.addEventListener('change', render);
  dialog.addEventListener('cancel', (event) => { event.preventDefault(); close(); });
  dialog.addEventListener('close', () => {
    if (dialog.open) return; // ignore an old queued close after an immediate reopen
    if (!visible) win.removeEventListener('keydown', shieldKeys, true);
    if (destroyed) return;
    if (returnFocus?.isConnected && typeof returnFocus.focus === 'function') returnFocus.focus();
    else if (visible && button.isConnected) button.focus();
    returnFocus = null;
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
    open,
    close,
    destroy() {
      visible = false; destroyed = true; close(); button.remove(); dialog.remove();
      win.removeEventListener('keydown', shieldKeys, true);
    },
  };
}
