// Physics venues — "Move the world." Two ladders (Orbital Gallery, Kinetic League) and one
// verb. ORRERY composition: rungs hang off two vertical scales (choice sets far past nine),
// the chosen rung carries the Hand in its bone variant, and the screen's single amber leader
// is the Lamp Key in the foot band. Launch flow, records and the readout contract are the
// original board's (src/ui/physicsVenues.js owns staging, hooks and the HUD tape).
import { el, cue, rows } from '../kit/index.js';
import { injectDeckplate } from '../deckplate/index.js';
import { injectPhysicsRaceLayouts } from '../orrery/physics-raceLayouts.js';
import { createLadderHand } from '../orrery/archiveInstruments.js';
import { dressLampKey } from '../orrery/lampKey.js';
import { stagger, reducedMotion } from '../orrery/motion.js';
import { confirm } from '../confirm.js';
import { listScenarios } from '../../gallery/orbital/catalog.js';
import { EVENTS } from '../../sports/kineticLeague/circuit.js';
import { tierUnlocked, TIERS } from '../../sports/kineticLeague/memory.js';
import { arenaById } from '../../sports/kineticLeague/arenas.js';
import { readPhysicsVenueRecords, stagePhysicsVenue, venueResultText, venueLaunchNeedsConfirm } from '../physicsVenues.js';

const manager = ctx => ctx.screenManager || ctx.screens;

export const physicsVenuesScreen = {
  id: 'physicsVenues',
  mount(root, ctx) {
    this._disposeHands();
    if (this._arriveTimer) clearTimeout(this._arriveTimer); this._arriveTimer = null;
    injectDeckplate(); injectPhysicsRaceLayouts(); root.replaceChildren();
    root.classList.remove('race-board'); root.classList.add('k-screen', 'pv-board');
    root.setAttribute('aria-label', 'Physics challenges'); this.root = root; this.launching = false;

    const header = el('header', 'k-title');
    header.append(el('p', 'k-sentence', 'Physics / play'), el('h1', 'k-display k-t-title', 'Move the world.'),
      el('p', 'k-sentence', 'Fly, push, tether and release real bodies. Your ship controls stay the same. Temporary flights keep campaign save slots safe; earned challenge records stay here.'));
    root.append(header);

    const tools = el('div', 'pv-tools');
    const back = el('button', 'k-word', 'Back'); back.type = 'button';
    back.setAttribute('aria-label', 'Back');
    back.onclick = () => { cue('close'); manager(ctx)?.popScreen?.(); };
    tools.append(back); root.append(tools);

    const records = readPhysicsVenueRecords();
    const gallery = listScenarios().map(r => ({ id: r.id, kind: 'gallery', label: r.title, info: r.inference,
      family: r.family, best: records.gallery.best[r.id]?.total ?? null }));
    const league = EVENTS.map(r => {
      const locked = r.tier !== 'qualification' && !tierUnlocked(records.league, r.tier, EVENTS);
      const prevTier = TIERS[TIERS.indexOf(r.tier) - 1];
      return { id: r.id, kind: 'league', label: r.title, info: arenaById(r.arena)?.name || r.arena,
        family: r.tier, shots: r.shots, locked, lockPrev: prevTier,
        cleared: !!records.league.solved[r.id] };
    });
    const all = [...gallery, ...league];
    this._allEntries = all;

    // Selection is transient screen state; it survives a refresh, never a launch.
    if (!all.some(e => e.kind === this._sel?.kind && e.id === this._sel?.id && !e.locked)) {
      this._sel = gallery.find(e => !e.locked) || league.find(e => !e.locked) || null;
      if (this._sel) this._sel = { kind: this._sel.kind, id: this._sel.id };
    }

    const launch = async () => {
      const entry = this._entry();
      if (!entry || entry.locked || this.launching) return;
      this.launching = true;
      try {
        const ok = !venueLaunchNeedsConfirm(ctx.state) || await confirm({
          title: 'Leave this flight for a challenge?',
          body: 'This replaces the current in-memory flight. Save first to keep unsaved campaign progress. Campaign save slots stay safe during challenges.',
          confirmLabel: 'Launch', cancelLabel: 'Back' });
        if (ok) stagePhysicsVenue(ctx.bus, entry.kind, entry.id);
      } finally { this.launching = false; }
    };

    const foot = el('div', 'pv-foot');
    const read = el('div', 'pv-foot__read');
    const pickTitle = el('p', 'pv-foot__title');
    const status = el('p', 'pv-foot__status'); status.setAttribute('role', 'status');
    this.readout = status;
    const launchKey = el('button', 'pv-launch', 'Launch'); launchKey.type = 'button';
    launchKey.setAttribute('aria-label', 'Launch the selected challenge');
    launchKey.title = 'Opens the challenge as a temporary flight. Your campaign saves stay safe.';
    dressLampKey(launchKey);
    launchKey.addEventListener('click', launch);
    read.append(pickTitle, status); foot.append(read, launchKey);

    const hang = el('div', 'pv-hang');
    const lists = new Map();
    const lane = (kind, name, word, entries, ariaLabel) => {
      const laneEl = el('section', 'pv-lane');
      const head = el('div', 'pv-lane__head');
      const count = el('p', 'pv-lane__count', String(entries.length));
      count.append(el('small', '', word));
      head.append(el('p', 'pv-lane__name', name), count);
      const list = rows(entries.map(e => ({ id: e.id, name: e.label,
        sub: e.locked ? `Clear a ${e.lockPrev} event first` : (kind === 'league'
          ? `${e.info} · ${e.shots} ${e.shots === 1 ? 'shot' : 'shots'}` : e.info),
        num: e.locked || kind !== 'gallery' || e.best == null ? (kind === 'league' && e.cleared && !e.locked ? 'Cleared' : '')
          : e.best.toLocaleString('en-US'),
        selected: !!this._sel && e.kind === this._sel.kind && e.id === this._sel.id })), {
        ariaLabel, onPick: id => this._pick(kind, id) });
      for (const rowEl of list.querySelectorAll('.k-row')) {
        const entry = entries.find(e => e.id === rowEl.dataset.id);
        if (!entry) continue;
        rowEl.dataset.action = `pick-${entry.id}`;
        if (entry.locked) { rowEl.setAttribute('aria-disabled', 'true'); rowEl.dataset.locked = 'true'; }
        if (kind === 'league' && entry.cleared && !entry.locked) rowEl.dataset.record = 'word';
      }
      const scroll = el('div', 'pv-lane__scroll');
      scroll.append(list);
      laneEl.append(head, scroll);
      lists.set(kind, { list, scroll });
      return laneEl;
    };
    hang.append(lane('gallery', 'Orbital gallery', 'venues', gallery, 'Orbital Gallery challenges'),
      lane('league', 'Kinetic league', 'events', league, 'Kinetic League events'));
    root.append(hang, foot);
    this._lists = lists;

    // The Hand: one bone chevron per ladder (createLadderHand is single-host by design), the
    // idle lane's hand stood down, so a pick in either lane points and springs inside it.
    this._hands = new Map([...lists].map(([kind, { scroll }]) => {
      const hand = createLadderHand(scroll, { className: 'orr-arc-hand', nodeY: 12 });
      hand.el.style.setProperty('--orr-hand-x', '22px');
      hand.el.style.setProperty('--orr-hand-from', '4px');
      return [kind, hand];
    }));

    this._applySelection(ctx);
    // The Hand stands on the chosen rung from the first frame (instant: no swing on arrival).
    const chosenKind = this._sel?.kind;
    for (const [kind, hand] of this._hands) {
      const row = kind === chosenKind ? this.root.querySelector('.k-row[aria-selected="true"]') : null;
      hand.moveTo(row, { instant: true });
    }
    stagger([...hang.querySelectorAll('.k-row')], { base: 120, step: 22 });
    root.classList.add('pv-arrive');
    this._arriveTimer = setTimeout(() => root.classList.remove('pv-arrive'), 1600);
    // The rungs' bottom fade says "more below" — only when there actually is more below.
    for (const { scroll } of lists.values()) {
      const mark = () => { if (scroll.isConnected) scroll.dataset.overflow = scroll.scrollHeight > scroll.clientHeight + 4 ? '1' : '0'; };
      mark();
      if (typeof ResizeObserver === 'function') { try { new ResizeObserver(mark).observe(scroll); } catch { /* no observer: the mount-time mark stands */ } }
    }
  },

  _entry() {
    return this._allEntries?.find(e => e.kind === this._sel?.kind && e.id === this._sel?.id) || null;
  },

  /** Select a rung: the ladder's light cursor, the Hand, the foot band and the key follow. */
  _pick(kind, id) {
    const lane = this._lists?.get(kind);
    if (!lane) return;
    let rowEl = null;
    for (const candidate of lane.list.querySelectorAll('.k-row')) {
      if (candidate.dataset.id !== id) continue;
      if (candidate.getAttribute('aria-disabled') === 'true') {
        cue('deny');
        // kit rows() marks any clicked row selected before onPick fires, so a refused pick
        // would leave the locked rung rendered as chosen while the Hand and foot band still
        // point at the real selection. Re-assert the actual pick before returning.
        for (const row of lane.list.querySelectorAll('.k-row')) {
          row.setAttribute('aria-selected',
            String(!!this._sel && this._sel.kind === kind && row.dataset.id === this._sel.id));
        }
        return;
      }
      candidate.setAttribute('aria-selected', 'true'); rowEl = candidate;
    }
    for (const other of this._lists.values()) {
      if (other === lane) continue;
      for (const candidate of other.list.querySelectorAll('.k-row[aria-selected="true"]')) {
        candidate.setAttribute('aria-selected', 'false');
      }
    }
    if (!rowEl) return;
    this._sel = { kind, id };
    for (const [handKind, hand] of this._hands) hand.moveTo(handKind === kind ? rowEl : null);
    rowEl.scrollIntoView({ block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' });
    this._applySelection();
  },

  _applySelection(ctx) {
    if (!this.root) return;
    const entry = this._entry();
    const title = this.root.querySelector('.pv-foot__title');
    const key = this.root.querySelector('.pv-launch');
    if (title) title.textContent = entry ? entry.label : '';
    if (key) key.disabled = !entry;
    const status = this._statusText(entry, ctx?.state);
    if (this.readout) this.readout.textContent = status;
    this._lastStatus = status;
  },

  _statusText(entry, state) {
    if (state?.physicsVenuePublic?.active) {
      const view = state.physicsVenuePublic;
      return `${view.title} · ${venueResultText(view)} · ${view.instruction}`;
    }
    if (!entry) return 'Choose a challenge to launch.';
    const bits = [];
    if (entry.kind === 'gallery') bits.push(`${entry.family} venue`, entry.best != null ? `local best ${entry.best.toLocaleString('en-US')}` : 'no local best yet');
    else bits.push(`${entry.family} event · ${entry.shots} ${entry.shots === 1 ? 'shot' : 'shots'}`, entry.cleared ? 'cleared before' : 'not yet cleared');
    bits.push(venueLaunchNeedsConfirm(state)
      ? 'launching replaces the current flight; save first to keep it'
      : 'ready — opens as a temporary flight');
    return `${bits.join(' · ')}.`;
  },

  // uiRoot repaints the open screen ~3×/s as refresh(ctx, { periodic: true }). The board is a
  // static menu while it is open — records only move in flight — so the periodic pass rewrites
  // the live readout (a running challenge's countdown) when it changed and never remounts:
  // a remount would replay the arrival choreography and reset the ladders' scroll mid-read.
  refresh(ctx, opts = {}) {
    if (!this.root) return;
    if (opts.periodic) {
      const status = this._statusText(this._entry(), ctx?.state);
      if (status !== this._lastStatus && this.readout) { this.readout.textContent = status; this._lastStatus = status; }
      return;
    }
    this.mount(this.root, ctx);
  },
  update(ctx) { if (this.readout && this.root) this.readout.textContent = this._statusText(this._entry(), ctx?.state); },
  _disposeHands() {
    if (this._hands) { for (const hand of this._hands.values()) hand.dispose(); this._hands = null; }
  },
  unmount() {
    this._disposeHands();
    if (this._arriveTimer) clearTimeout(this._arriveTimer); this._arriveTimer = null;
    this.root?.replaceChildren(); this.root = null; this.readout = null; this._lists = null; this._lastStatus = null;
  },
};
