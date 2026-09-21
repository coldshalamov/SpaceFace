// Optional DOM view, deliberately outside simulation. The caller owns placement and the game's
// input boundary. A required claimInput(root)->dispose hook prevents a surrender click from
// simultaneously becoming a weapon click. No hidden animation loop or simulation-state writes.
import { NEMESIS_RIVAL as RIVAL, NEMESIS_KITS, NEMESIS_CHAPTERS } from '../data/nemesisRival.js';

export function mountNemesisComms({ root, bus, state, claimInput } = {}) {
  const document = root && root.ownerDocument;
  if (!document || typeof root.appendChild !== 'function') throw new TypeError('A mounted DOM root is required');
  if (!bus || typeof bus.on !== 'function' || typeof bus.emit !== 'function') throw new TypeError('Event bus required');
  if (typeof claimInput !== 'function') throw new TypeError('claimInput(panel) must isolate this panel from gameplay input');
  const panel = document.createElement('section');
  panel.setAttribute('data-nemesis-comms', ''); panel.setAttribute('aria-label', 'Counterexample transmission');
  // Markup is fixed author content. Event text only enters textContent, never innerHTML.
  panel.innerHTML = `<style>
[data-nemesis-comms]{--nm-ink:#e6f1ed;--nm-dim:#a3b7b0;--nm-line:#40574e;--nm-accent:#c3e4a8;box-sizing:border-box;max-width:320px;font:12px/1.5 ui-monospace,SFMono-Regular,Consolas,monospace;color:var(--nm-ink);background:#101b1bf5;border:1px solid var(--nm-line);border-left:3px solid var(--nm-accent);padding:14px 16px;pointer-events:auto;box-shadow:0 8px 25px #0005}
[data-nemesis-comms][hidden]{display:none!important}
[data-nemesis-comms] header{display:flex;align-items:center;gap:10px;padding-bottom:10px;border-bottom:1px solid var(--nm-line)}
[data-nemesis-comms] svg{width:32px;flex:none;fill:none;stroke:var(--nm-accent);stroke-width:1.4}
[data-nemesis-comms] h2{font:600 14px/1.3 ui-monospace,SFMono-Regular,Consolas,monospace;letter-spacing:.10em;margin:0}
[data-nemesis-comms] .nm-status{font-size:10px;letter-spacing:.1em;color:var(--nm-dim)}
[data-nemesis-comms] p{margin:10px 0 0}
[data-nemesis-comms] details{margin-top:9px;color:var(--nm-dim)}
[data-nemesis-comms] summary{cursor:pointer;color:var(--nm-accent)}
[data-nemesis-comms] button{font:600 12px/1.4 ui-monospace,SFMono-Regular,Consolas,monospace;width:100%;padding:10px;margin-top:12px;color:#14221a;background:var(--nm-accent);border:1px solid var(--nm-accent);cursor:pointer}
[data-nemesis-comms] button:hover{filter:brightness(1.12)}
[data-nemesis-comms] :focus-visible{outline:2px solid #fff;outline-offset:3px}
[data-nemesis-comms] .nm-live{color:var(--nm-dim);font-size:11px}
@media(prefers-reduced-motion:no-preference){[data-nemesis-comms]{animation:nm-arrival .22s ease-out}@keyframes nm-arrival{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:translateY(0)}}}
</style><header><svg viewBox="0 0 40 40" aria-hidden="true"><path d="M7 7h15l11 13-11 13H7M7 7l13 13L7 33M20 20h13M5 20h8"/><circle cx="20" cy="20" r="3"/></svg><div><h2>COUNTEREXAMPLE</h2><div class="nm-status"></div></div></header><p class="nm-line"></p><details><summary>Read the fit</summary><p class="nm-fit"></p><p class="nm-opening"></p></details><p class="nm-live" role="status" aria-live="polite"></p><button type="button" hidden>Accept surrender</button>`;
  panel.hidden = true;
  const status = panel.querySelector('.nm-status'), line = panel.querySelector('.nm-line');
  const fit = panel.querySelector('.nm-fit'), opening = panel.querySelector('.nm-opening');
  const live = panel.querySelector('.nm-live'), button = panel.querySelector('button');
  let encounterId = '', disposed = false;
  const offs = [];
  const releaseInput = claimInput(panel);
  if (typeof releaseInput !== 'function') throw new TypeError('claimInput(panel) must return its cleanup function');
  root.appendChild(panel);
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
    button.hidden = false; panel.hidden = false; };
  const accept = () => {
    if (!encounterId || disposed) return;
    // The simulation validates the token, living hull, surrender state and current mode again.
    bus.emit('nemesis:spare', { encounterId });
  };
  button.addEventListener('click', accept);
  const on = (event, fn) => offs.push(bus.on(event, fn));
  const synchronize = () => {
    const memory = state.nemesis, a = memory && memory.active;
    if (!a) { panel.hidden = true; button.hidden = true; encounterId = ''; return; }
    encounterId = a.id; panel.hidden = false; showKit(a.plan.primary, a.plan.secondary);
    status.textContent = `SILE ORRA / ${NEMESIS_CHAPTERS[a.plan.chapter].title.toUpperCase()}`;
    line.textContent = 'The fit is committed. The pilot can still change their mind.';
    live.textContent = 'No mid-fight refit.'; button.hidden = true;
    if (a.surrenderedAt != null) offered(a.id);
  };
  on('nemesis:announced', (p) => { encounterId = ''; panel.hidden = false; button.hidden = true;
    status.textContent = 'SILE ORRA / INBOUND'; line.textContent = 'A familiar transmission. A revised ship.';
    live.textContent = 'Read the fit before you commit.'; showKit(p.kit, p.secondary); });
  on('nemesis:engaged', synchronize);
  on('nemesis:voice', (p) => { if (p.encounterId === encounterId && !['destroyed', 'lost'].includes(p.situation)) {
    line.textContent = p.text.replace(/^ORRA:\s*/, ''); } });
  on('nemesis:actChanged', (p) => { if (p.encounterId === encounterId) live.textContent = `Act ${p.act + 1}: maneuver change, not new hardware.`; });
  on('nemesis:surrenderOffered', (p) => offered(p.encounterId));
  on('nemesis:encounterEnded', () => { panel.hidden = true; button.hidden = true; encounterId = ''; });
  on('nemesis:requestCancelled', synchronize);
  on('save:loaded', synchronize);
  synchronize();
  return { element: panel, refresh: synchronize, dispose() {
    if (disposed) return; disposed = true; for (const off of offs) off();
    button.removeEventListener('click', accept); releaseInput(); panel.remove();
  } };
}
