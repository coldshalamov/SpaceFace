import { el, cue } from '../kit/index.js';
import { injectDeckplate } from '../deckplate/index.js';
import { injectRaceBoardLayouts } from '../orrery/raceBoardLayouts.js';
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
    injectDeckplate(); injectRaceBoardLayouts(); root.replaceChildren(); root.classList.add('k-screen', 'race-board');
    root.setAttribute('aria-label', 'Physics challenges'); this.root = root; this.launching = false;
    const header = el('header', 'k-title');
    header.append(el('p', 'k-sentence', 'PHYSICS / PLAY'), el('h1', 'k-display k-t-title', 'Move the world.'),
      el('p', 'k-sentence', 'Fly, push, tether and release real bodies. Your ship controls stay the same. Temporary flights keep campaign save slots safe; earned challenge records stay here.'));
    root.append(header);
    const tools = el('div', 'race-board-tools');
    const back = el('button', 'k-word', 'Back'); back.type = 'button'; back.onclick = () => { cue('close'); manager(ctx)?.popScreen?.(); }; tools.append(back); root.append(tools);
    const records = readPhysicsVenueRecords();
    const launch = async (kind, id) => {
      if (this.launching) return;
      this.launching = true;
      try {
        const ok = !venueLaunchNeedsConfirm(ctx.state) || await confirm({
          title: 'Leave this flight for a challenge?',
          body: 'This replaces the current in-memory flight. Save first to keep unsaved campaign progress. Campaign save slots stay safe during challenges.',
          confirmLabel: 'Launch', cancelLabel: 'Back' });
        if (ok) stagePhysicsVenue(ctx.bus, kind, id);
      } finally { this.launching = false; }
    };
    const row = (kind, entry) => {
      const block = el('div', 'race-board-contract');
      const b = el('button', 'k-word race-board-launch', entry.label); b.type = 'button';
      b.disabled = !!entry.locked;
      if (entry.title) b.title = entry.title;
      b.addEventListener('click', () => { cue('confirm'); launch(kind, entry.id); });
      block.append(b, el('p', 'k-sentence', entry.sub));
      return block;
    };
    const card = (heading, text, kind, entries) => {
      const section = el('section', 'race-board-course dp-plate');
      section.append(el('h2', 'k-t-sub', heading), el('p', 'k-sentence', text));
      for (const entry of entries) section.append(row(kind, entry));
      return section;
    };
    const grid = el('div', 'race-board-grid');
    grid.append(card('Orbital Gallery', '24 physical puzzles. Read the pocket, then use momentum, anchors and Massline to deliver the marked body. Every venue is a real pilot\'s botched run, rebuilt.', 'gallery',
      listScenarios().map(r => ({ id: r.id, label: r.title, title: r.inference,
        sub: `${r.family}${records.gallery.best[r.id] ? ` · best ${records.gallery.best[r.id].total}` : ''}` }))),
      card('Kinetic League', '12 events: sweep, bank, curl, relay, bend and contain. Clear qualification to open higher tiers. Scrip is a local sport record.', 'league',
        EVENTS.map(r => {
          const locked = r.tier !== 'qualification' && !tierUnlocked(records.league, r.tier, EVENTS);
          const prevTier = TIERS[TIERS.indexOf(r.tier) - 1];
          return { id: r.id, label: r.title, locked,
            sub: locked ? `Locked — clear a ${prevTier} event first`
              : `${r.tier} · ${arenaById(r.arena)?.name || r.arena} · ${r.shots} shots${records.league.solved[r.id] ? ' · cleared' : ''}` };
        })));
    root.append(grid);
    this.readout = el('p', 'k-sentence'); this.readout.setAttribute('role', 'status'); root.append(this.readout); this.update(ctx);
  },
  refresh(ctx) { if (this.root) this.mount(this.root, ctx); },
  update(ctx) { if (this.readout) { const view = ctx.state.physicsVenuePublic; this.readout.textContent = view?.active ? `${view.title} · ${venueResultText(view)} · ${view.instruction}` : 'Choose a challenge to launch.'; } },
  unmount() { this.root?.replaceChildren(); this.root = null; this.readout = null; },
};
