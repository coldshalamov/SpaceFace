// Optional DOM view, deliberately outside simulation. The caller owns placement and the game's
// input boundary. A required claimInput(root)->dispose hook prevents a surrender click from
// simultaneously becoming a weapon click. No hidden animation loop or simulation-state writes.
import { NEMESIS_RIVAL as RIVAL, NEMESIS_KITS, NEMESIS_CHAPTERS } from '../data/nemesisRival.js';
import { getStage } from './stage.js';

export function mountNemesisComms({ root, bus, state, claimInput } = {}) {
  const document = root && root.ownerDocument;
  if (!document || typeof root.appendChild !== 'function') throw new TypeError('A mounted DOM root is required');
  if (!bus || typeof bus.on !== 'function' || typeof bus.emit !== 'function') throw new TypeError('Event bus required');
  if (typeof claimInput !== 'function') throw new TypeError('claimInput(panel) must isolate this panel from gameplay input');
  const panel = document.createElement('section');
  panel.setAttribute('data-nemesis-comms', ''); panel.setAttribute('aria-label', 'Counterexample transmission');
  // Markup is fixed author content. Event text only enters textContent, never innerHTML.
  // G16-02: the [data-nemesis-comms] sheet retired to styles/ui.css.
  panel.innerHTML = `<header><svg viewBox="0 0 40 40" aria-hidden="true"><path d="M7 7h15l11 13-11 13H7M7 7l13 13L7 33M20 20h13M5 20h8"/><circle cx="20" cy="20" r="3"/></svg><div><h2>COUNTEREXAMPLE</h2><div class="nm-status"></div></div></header><p class="nm-line"></p><details><summary>Read the fit</summary><p class="nm-fit"></p><p class="nm-opening"></p></details><p class="nm-live" role="status" aria-live="polite"></p><button type="button" hidden>Accept surrender</button>`;
  panel.hidden = true;
  // G16-02: on the live document the card rides the Stage's prompt slot inside the shared
  // .dp-glass frame while it has something to say — a hidden panel frees the seat instead of
  // showing an empty glass. #ui-root ancestry is preserved either way, so claimInput's
  // structural input fence still resolves.
  const stage = document === globalThis.document ? getStage() : null;
  let stageHandle = null;
  const syncSeat = () => {
    if (!stage || typeof stage.show !== 'function') return;
    if (!panel.hidden && !stageHandle) {
      stageHandle = stage.show('prompt', panel, { id: 'nemesis-comms', severity: 'warn' });
    } else if (panel.hidden && stageHandle) {
      stageHandle.clear();
      stageHandle = null;
    }
  };
  const status = panel.querySelector('.nm-status'), line = panel.querySelector('.nm-line');
  const fit = panel.querySelector('.nm-fit'), opening = panel.querySelector('.nm-opening');
  const live = panel.querySelector('.nm-live'), button = panel.querySelector('button');
  let encounterId = '', disposed = false;
  const offs = [];
  // The production claimInput is a structural gate: it verifies the panel sits inside
  // #ui-root (panel.closest), which can only resolve once the panel is attached.
  // Append first — the panel starts hidden, so no input can reach it before the claim —
  // and detach again if the claim fails, so a failed mount leaves nothing behind.
  root.appendChild(panel);
  let releaseInput;
  try {
    releaseInput = claimInput(panel);
  } catch (error) {
    panel.remove();
    throw error;
  }
  if (typeof releaseInput !== 'function') {
    panel.remove();
    throw new TypeError('claimInput(panel) must return its cleanup function');
  }
  const showKit = (kitId, secondaryId = null) => { const kit = NEMESIS_KITS[kitId] || NEMESIS_KITS.open;
    fit.textContent = kit.tell; opening.textContent = `Opening: ${kit.opening}`;
    // INF-075: the wing refit reads alongside the primary — its tell and its counter stay visible.
    const wing = (secondaryId && secondaryId !== kitId && NEMESIS_KITS[secondaryId]) || null;
    if (wing) {
      fit.textContent += ` Wing: ${wing.tell}`;
      opening.textContent += ` Wing opening: ${wing.opening}`;
    } };
  const offered = (id) => { encounterId = id; status.textContent = 'SILE ORRA / CEASE FIRE';
    line.textContent = 'The guns are cooling. I have no argument left. Your choice.';
    live.textContent = 'Acceptance is permanent. Orra can still be destroyed before you accept.';
    button.hidden = false; panel.hidden = false; syncSeat(); };
  const accept = () => {
    if (!encounterId || disposed) return;
    // The simulation validates the token, living hull, surrender state and current mode again.
    bus.emit('nemesis:spare', { encounterId });
  };
  button.addEventListener('click', accept);
  const on = (event, fn) => offs.push(bus.on(event, fn));
  const synchronize = () => {
    const memory = state.nemesis, a = memory && memory.active;
    if (!a) { panel.hidden = true; button.hidden = true; encounterId = ''; syncSeat(); return; }
    encounterId = a.id; panel.hidden = false; showKit(a.plan.primary, a.plan.secondary);
    status.textContent = `SILE ORRA / ${NEMESIS_CHAPTERS[a.plan.chapter].title.toUpperCase()}`;
    line.textContent = 'The fit is committed. The pilot can still change their mind.';
    live.textContent = 'No mid-fight refit.'; button.hidden = true; syncSeat();
    if (a.surrenderedAt != null) offered(a.id);
  };
  on('nemesis:announced', (p) => { encounterId = ''; panel.hidden = false; button.hidden = true;
    status.textContent = 'SILE ORRA / INBOUND'; line.textContent = 'A familiar transmission. A revised ship.';
    live.textContent = 'Read the fit before you commit.'; showKit(p.kit, p.secondary); syncSeat(); });
  on('nemesis:engaged', synchronize);
  on('nemesis:voice', (p) => { if (p.encounterId === encounterId && !['destroyed', 'lost'].includes(p.situation)) {
    line.textContent = p.text.replace(/^ORRA:\s*/, ''); } });
  on('nemesis:actChanged', (p) => { if (p.encounterId === encounterId) live.textContent = `Act ${p.act + 1}: maneuver change, not new hardware.`; });
  on('nemesis:surrenderOffered', (p) => offered(p.encounterId));
  on('nemesis:encounterEnded', () => { panel.hidden = true; button.hidden = true; encounterId = ''; syncSeat(); });
  on('nemesis:requestCancelled', synchronize);
  on('save:loaded', synchronize);
  synchronize();
  return { element: panel, refresh: synchronize, dispose() {
    if (disposed) return; disposed = true; for (const off of offs) off();
    if (stageHandle) { stageHandle.clear(); stageHandle = null; }
    button.removeEventListener('click', accept); releaseInput(); panel.remove();
  } };
}
