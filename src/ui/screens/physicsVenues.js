import { el, cue } from '../kit/index.js';
import { injectDeckplate } from '../deckplate/index.js';
import { injectRaceBoardLayouts } from '../orrery/raceBoardLayouts.js';
import { confirm } from '../confirm.js';
import { listScenarios } from '../../gallery/orbital/catalog.js';
import { EVENTS } from '../../sports/kineticLeague/circuit.js';
import { tierUnlocked } from '../../sports/kineticLeague/memory.js';
import { readPhysicsVenueRecords, stagePhysicsVenue, venueResultText } from '../physicsVenues.js';

const manager = ctx => ctx.screenManager || ctx.screens;
export const physicsVenuesScreen = {
  id: 'physicsVenues',
  mount(root, ctx) {
    injectDeckplate(); injectRaceBoardLayouts(); root.replaceChildren(); root.classList.add('k-screen', 'race-board');
    root.setAttribute('aria-label', 'Physics challenges'); this.root = root;
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
        const ok = await confirm({ title: 'Launch a physics challenge?',
          body: ctx.state.mode === 'flight' ? 'This replaces the current in-memory flight. Save first to keep unsaved campaign progress. Campaign save slots stay safe during challenges.' : 'A temporary flight lends a ship. Campaign save slots stay safe during challenges.',
          confirmLabel: 'Launch', cancelLabel: 'Back' });
        if (ok) stagePhysicsVenue(ctx.bus, kind, id);
      } finally { this.launching = false; }
    };
    const card = (heading, text, kind, entries) => {
      const section = el('section', 'race-board-course dp-plate');
      section.append(el('h2', 'k-t-sub', heading), el('p', 'k-sentence', text));
      const select = el('select', 'k-word'); select.setAttribute('aria-label', heading);
      for (const entry of entries) { const option = el('option', '', entry.label); option.value = entry.id; option.disabled = entry.locked; select.append(option); }
      const play = el('button', 'k-word', 'Launch'); play.type = 'button'; play.onclick = () => launch(kind, select.value);
      section.append(select, play); return section;
    };
    const grid = el('div', 'race-board-grid');
    grid.append(card('Orbital Gallery', '24 physical puzzles. Read the pocket, then use momentum, anchors and Massline to deliver the marked body.', 'gallery',
      listScenarios().map(row => ({ id: row.id, label: `${row.title}${records.gallery.best[row.id] ? ` · best ${records.gallery.best[row.id].total}` : ''}` }))),
      card('Kinetic League', '12 events: sweep, bank, curl, relay, bend and contain. Clear qualification to open higher tiers. Scrip is a local sport record.', 'league',
        EVENTS.map(row => ({ id: row.id, label: `${row.title} · ${row.tier}${records.league.solved[row.id] ? ' · cleared' : ''}`,
          locked: row.tier !== 'qualification' && !tierUnlocked(records.league, row.tier, EVENTS) }))));
    root.append(grid);
    this.readout = el('p', 'k-sentence'); this.readout.setAttribute('role', 'status'); root.append(this.readout); this.update(ctx);
  },
  update(ctx) { if (this.readout) { const view = ctx.state.physicsVenuePublic; this.readout.textContent = view?.active ? `${view.title} · ${venueResultText(view)} · ${view.instruction}` : 'Choose a challenge to launch.'; } },
  unmount() { this.root?.replaceChildren(); this.root = null; this.readout = null; },
};
