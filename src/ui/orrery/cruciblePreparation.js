// Crucible preparation is a presentation adapter, not another launch path. Existing controls are
// moved intact; their handlers, unlocks, share codes and seed validation remain the screen owner's.
import { COMBAT_LAB_STARTER_PACKAGES } from '../../data/combatLabSetups.js';
import { SHIPS } from '../../data/ships.js';
import { WEAPONS } from '../../data/weapons.js';
import { MODULES } from '../../data/modules.js';
import { swarmStakeFor } from '../../data/swarmStakes.js';
import { SWARM_BOSS_EVERY, SWARM_REFIT_EVERY } from '../../data/swarmMode.js';
import { applyWeaponsColdLoadout } from '../../systems/survivalMutators.js';
import { buildSlotList } from '../../systems/ships.js';
import { hullPosterUrl } from '../hullPosters.js';
import { equipmentSvg } from './equipmentGlyphs.js';
import { createSlotJig } from './slotJig.js';
import { injectCruciblePreparation } from './cruciblePreparationLayouts.js';

const defs = new Map([...WEAPONS, ...MODULES].map(d => [d.id, d]));
const modeName = rules => ({ swarm: 'Swarm', scored: 'Gauntlet', boss_circuit: 'Boss circuit', block: 'Foundry Block' })[rules] || 'Crucible';

/** Pure and shared by the preview and its tests; slot identity is the game's canonical identity. */
export function preparationLoadout(starterId, weeklyMutatorId = null) {
  const starter = COMBAT_LAB_STARTER_PACKAGES.find(s => s.id === starterId);
  const hullId = starter?.hullId || (String(starterId).startsWith('hull:') ? starterId.slice(5) : null);
  const hull = SHIPS.find(s => s.id === hullId);
  if (!hull) return null;
  const entries = (starter?.loadout || []).map(s => ({ ...s }));
  const effective = weeklyMutatorId === 'weapons_cold' ? applyWeaponsColdLoadout(entries) : entries;
  const fit = new Map(effective.map(s => [s.slotIndex, s.defId]));
  return { hull, name: starter?.label || `${hull.name} · bare hull`, slots: buildSlotList(hull).map(slot => {
    const defId = fit.get(slot.index) || null;
    return { ...slot, defId, name: defs.get(defId)?.name || (defId ? defId : 'Empty') };
  }) };
}

export function createCruciblePreparation({ root, stage, title, foot, enter, read } = {}) {
  const doc = root?.ownerDocument;
  // Minimal node test documents keep the pre-existing screen path rather than a half-built widget.
  if (!doc?.createElementNS || !root.querySelector || !stage?.replaceChildren) return null;
  injectCruciblePreparation(doc);
  root.classList.add('orr-preparation');
  const make = (tag, cls, text) => {
    const n = doc.createElement(tag); n.className = cls;
    if (text !== undefined) n.textContent = text;
    if (tag === 'button') n.type = 'button';
    return n;
  };
  const visibility = (node, visible) => {
    node.hidden = !visible;
    node.style.setProperty('display', visible ? '' : 'none', visible ? '' : 'important');
  };
  const settings = stage.querySelector('.sf-crd-settings');
  const panels = ['encounter', 'ship'].map((id, i) => {
    const panel = make('section', 'orr-prep-panel');
    panel.id = `sf-prep-${id}`; panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', `sf-prep-tab-${i}`);
    const list = make('ul', 'sf-crd-settings orr-prep-settings');
    panel.appendChild(list); return { panel, list };
  });
  const extras = make('details', 'orr-prep-disclosure');
  extras.appendChild(make('summary', '', 'Challenges, seed & records'));
  const extraRows = make('ul', 'sf-crd-settings orr-prep-settings');
  extras.appendChild(extraRows);
  const rows = [...settings.children];
  for (const row of rows) {
    const first = row.matches('.sf-crd-row--mode,.sf-crd-row--stake,.sf-crd-row--arena');
    const second = row.matches('.sf-crd-row--hull,.sf-crd-row--modifiers');
    (first ? panels[0].list : second ? panels[1].list : extraRows).appendChild(row);
  }
  // Keep challenge modes available, but out of the first decision's primary rail.
  const challenges = make('ul', 'k-words k-words--row orr-prep-challenges');
  for (const button of panels[0].panel.querySelectorAll('.sf-crd-daily,.sf-crd-weekly,.sf-crd-ghost')) {
    challenges.appendChild(button.parentElement.tagName === 'LI' ? button.parentElement : button);
  }
  extras.insertBefore(challenges, extraRows);
  for (const child of [...stage.children]) if (child !== settings) extras.appendChild(child);
  stage.replaceChildren(panels[0].panel, panels[1].panel);
  panels[0].panel.appendChild(extras);
  const bare = root.querySelector('.sf-crd-anyhull');
  if (bare) {
    const disclosure = make('details', 'orr-prep-disclosure orr-prep-bare');
    disclosure.appendChild(make('summary', '', 'Build from a bare hull'));
    bare.parentNode.insertBefore(disclosure, bare); disclosure.appendChild(bare);
  }

  const nav = make('nav', 'orr-prep-nav'); nav.setAttribute('aria-label', 'Crucible preparation');
  const tablist = make('div', 'orr-prep-tabs'); tablist.setAttribute('role', 'tablist');
  const tabs = ['Encounter', 'Ship & kit'].map((label, i) => {
    const tab = make('button', 'orr-prep-tab'); tab.id = `sf-prep-tab-${i}`;
    tab.setAttribute('role', 'tab'); tab.setAttribute('aria-controls', panels[i].panel.id);
    tab.append(make('span', 'orr-prep-step', `0${i + 1}`), make('span', '', label));
    tab.addEventListener('click', () => show(i));
    tablist.appendChild(tab); return tab;
  });
  const nextStep = make('span', 'orr-prep-nextstep', '03 / Armory');
  nextStep.setAttribute('aria-label', 'Next, fit equipment in the armory');
  const summary = make('p', 'orr-prep-summary', '');
  nav.append(tablist, nextStep, summary); root.insertBefore(nav, stage);
  tablist.addEventListener('keydown', e => {
    const current = tabs.indexOf(doc.activeElement);
    if (current < 0 || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault(); e.stopPropagation();
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? 1 : 1 - current;
    show(next); tabs[next].focus({ preventScroll: true });
  });

  const arenaHero = root.querySelector('.orr-door-hero');
  const shipHero = make('section', 'orr-prep-ship');
  shipHero.setAttribute('aria-label', 'Selected ship and starting equipment');
  const shipHead = make('header', 'orr-prep-shiphead');
  const name = make('h2', 'orr-prep-hullname', '');
  const subtitle = make('p', 'orr-prep-hullline', '');
  shipHead.append(make('p', 'orr-label', 'Your starting build'), name, subtitle);
  const visual = make('div', 'orr-prep-shipvisual');
  const img = make('img', 'orr-prep-shipart'); img.alt = ''; img.decoding = 'async';
  const fallback = equipmentSvg({ kind: 'hull' }, doc); fallback.classList.add('orr-prep-fallback');
  const jigHost = make('div', 'orr-prep-shipjig');
  const jig = createSlotJig({ host: jigHost });
  const views = make('div', 'orr-prep-views'); views.setAttribute('role', 'group'); views.setAttribute('aria-label', 'Ship view');
  const viewButtons = ['Ship', 'Hardpoints'].map((label, i) => {
    const b = make('button', 'orr-prep-view', label); b.addEventListener('click', () => showView(i));
    views.appendChild(b); return b;
  });
  visual.append(img, fallback, jigHost, views);
  img.addEventListener('error', () => { visibility(img, false); visibility(fallback, true); });
  const manifest = make('div', 'orr-prep-manifest'); manifest.setAttribute('role', 'group');
  manifest.setAttribute('aria-label', 'Starting equipment; select a fitting to locate its hardpoint');
  const fitNote = make('p', 'orr-prep-fitnote', ''); fitNote.setAttribute('role', 'status');
  shipHero.append(shipHead, visual, manifest, fitNote); root.insertBefore(shipHero, foot);
  const brief = make('div', 'orr-prep-brief');
  const purse = make('strong', 'orr-prep-purse', '');
  const cadence = make('p', 'orr-prep-cadence', '');
  brief.append(purse, cadence); if (arenaHero) arenaHero.appendChild(brief);

  const continueButton = make('button', 'k-word k-word--emph k-word--primary orr-prep-continue', 'Choose ship & kit →');
  const enterLi = enter.parentNode;
  const nextLi = make('li', ''); nextLi.appendChild(continueButton); enterLi.parentNode.insertBefore(nextLi, enterLi);
  continueButton.addEventListener('click', () => { show(1); tabs[1].focus({ preventScroll: true }); });
  const hint = root.querySelector('.orr-door-hint');
  let step = 0, view = 0, lastBuild = null, latest = null, lit = -1;
  function showView(next) {
    view = next;
    const url = latest && hullPosterUrl(latest.hull.id);
    visibility(img, view === 0 && !!url);
    visibility(fallback, view === 0 && !url);
    visibility(jigHost, view === 1);
    viewButtons.forEach((b, i) => b.setAttribute('aria-pressed', String(view === i)));
    if (view === 1) paintJig();
  }
  function paintJig() {
    if (!latest) return;
    jig.show({ hullId: latest.hull.id, slots: latest.slots.map(s => s.type),
      filled: latest.slots.map(s => !!s.defId), target: lit,
      label: lit >= 0 ? `Hardpoint ${lit + 1}` : '', sub: latest.slots[lit]?.name || '',
      engraving: `${latest.hull.name} · ${latest.slots.filter(s => s.defId).length}/${latest.slots.length} fitted` });
  }
  function show(next) {
    step = next; root.dataset.prepStep = String(step);
    panels.forEach(({ panel }, i) => visibility(panel, i === step));
    tabs.forEach((tab, i) => { tab.setAttribute('aria-selected', String(i === step)); tab.tabIndex = i === step ? 0 : -1; });
    if (arenaHero) visibility(arenaHero, step === 0);
    visibility(shipHero, step === 1); visibility(enterLi, step === 1); visibility(nextLi, step === 0);
    stage.scrollTop = 0;
    if (hint) hint.textContent = step === 0 ? 'Choose your rules and arena. Your build comes next.' : 'Select equipment to inspect its hardpoint. Nothing from this run costs campaign credits.';
    update();
  }
  function update() {
    const state = read();
    const stake = swarmStakeFor(state.daily ? 'contender' : state.stake);
    const isSwarm = state.ruleset === 'swarm';
    const loadout = preparationLoadout(state.starterId, state.weeklyMutatorId);
    if (!loadout) return;
    latest = loadout;
    summary.textContent = `${state.daily ? 'Daily · ' : ''}${modeName(state.ruleset)} / ${loadout.hull.name}`;
    nextStep.textContent = isSwarm ? '03 / Armory' : '03 / Launch';
    nextStep.setAttribute('aria-label', isSwarm ? 'Next, fit equipment in the armory' : 'Next, enter the arena');
    if (isSwarm) enter.textContent = 'Open armory →';
    purse.textContent = isSwarm ? `${stake.purse.toLocaleString('en-US')} cr` : (state.ruleset === 'scored' ? '30 waves' : state.ruleset === 'block' ? '10 waves' : 'Boss circuit');
    cadence.textContent = isSwarm ? `Starting budget · ${Math.round(stake.pressure * 100)}% pressure\nArmory every round · Refit & boss every ${SWARM_REFIT_EVERY === SWARM_BOSS_EVERY ? SWARM_REFIT_EVERY : `${SWARM_REFIT_EVERY}/${SWARM_BOSS_EVERY}`}`
      : 'An authored challenge. Your starter kit is ready before launch.';
    const buildKey = `${state.starterId}:${state.weeklyMutatorId || ''}:${state.ruleset}`;
    if (lastBuild !== buildKey) {
      lastBuild = buildKey; lit = -1;
      name.textContent = loadout.hull.name;
      subtitle.textContent = `${loadout.name} · ${loadout.slots.filter(s => s.defId).length} / ${loadout.slots.length} hardpoints fitted`;
      const url = hullPosterUrl(loadout.hull.id);
      if (url) img.src = url; else img.removeAttribute('src');
      manifest.replaceChildren();
      for (const slot of loadout.slots) {
        const b = make('button', 'orr-prep-fitting'); b.dataset.slotIndex = String(slot.index);
        b.setAttribute('aria-pressed', 'false');
        const glyph = equipmentSvg({ defId: slot.defId || slot.type }, doc); if (glyph) b.appendChild(glyph);
        const text = make('span', ''); text.append(make('small', '', `${String(slot.index + 1).padStart(2, '0')} / ${slot.type} ${slot.size}`), make('strong', '', slot.name));
        b.appendChild(text); if (!slot.defId) b.classList.add('is-empty');
        b.addEventListener('click', () => {
          lit = slot.index; showView(1);
          for (const sibling of manifest.children) sibling.setAttribute('aria-pressed', String(sibling === b));
          fitNote.textContent = `${slot.name} · hardpoint ${slot.index + 1} · ${slot.type} ${slot.size}`;
        });
        manifest.appendChild(b);
      }
      fitNote.textContent = isSwarm ? 'Keep this kit, replace parts, or buy supplies in the opening armory.' : 'This is the kit you take into the arena.';
      showView(view);
    }
    if (step === 1 && view === 1) paintJig();
  }
  // Produced hull thumbnails put a recognizable object beside every starter name.
  for (const b of root.querySelectorAll('.sf-crd-hull')) {
    const kit = preparationLoadout(b.dataset.starterId); const art = b.querySelector('.fh-tile-art');
    if (!kit || !art) continue;
    if (b.dataset.locked === '1') b.appendChild(make('span', 'orr-prep-locknote', b.dataset.earn || 'Locked'));
    const url = hullPosterUrl(kit.hull.id, 'hero'); art.replaceChildren();
    if (url) { const image = make('img', 'orr-prep-thumb'); image.src = url; image.alt = ''; image.decoding = 'async'; art.appendChild(image); }
    else art.appendChild(equipmentSvg({ kind: 'hull' }, doc));
  }
  for (const b of root.querySelectorAll('.sf-crd-stake')) {
    const stake = swarmStakeFor(b.dataset.stakeId);
    b.append(make('span', 'orr-prep-stake-number', `${stake.purse.toLocaleString('en-US')} cr`),
      make('span', 'orr-prep-stake-pressure', `${Math.round(stake.pressure * 100)}% pressure`));
  }
  for (const b of root.querySelectorAll('.sf-crd-mode,.sf-crd-block')) {
    const art = b.querySelector('.fh-tile-art');
    if (art) art.replaceChildren(equipmentSvg({ ruleset: b.dataset.ruleset || 'block' }, doc));
  }
  show(0);
  return { update, focus() { tabs[step].focus({ preventScroll: true }); }, dispose() { jig.dispose(); } };
}
