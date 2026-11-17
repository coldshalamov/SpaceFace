// The Swarm hangar presents hull, equipment and run settings as separate decisions.
// Launch, purchases, unlocks and saved choices still belong to their existing owners.
import { swarmStakeFor } from '../../data/swarmStakes.js';
import { SWARM_BOSS_EVERY, SWARM_REFIT_EVERY } from '../../data/swarmMode.js';
import { hullPosterUrl } from '../hullPosters.js';
import { shipStatSheet } from '../ship/shipStats.js';
import { createStageHull } from '../screens/stageHull.js';
import { equipmentSvg } from './equipmentGlyphs.js';
import { swarmHangarRoster, preferredSwarmStarterForHull, swarmPreviewLoadout,
  swarmPreparationReadiness } from '../ship/swarmHangarModel.js';
import { injectSwarmHangarLayouts } from './swarmHangarLayouts.js';

// Kept as the public pure loadout projection used by the existing screen tests.
export const preparationLoadout = swarmPreviewLoadout;
const modeName = rules => ({ swarm: 'Swarm', scored: 'Gauntlet', boss_circuit: 'Boss circuit', block: '10-wave challenge' })[rules] || 'Challenge';
const SLOT_LABELS = Object.freeze({ weapon: 'Weapon', shield: 'Shield', engine: 'Engine',
  cargo: 'Cargo', mining: 'Mining', utility: 'Utility', thruster: 'Maneuvering thruster' });

export function createCruciblePreparation({ root, stage, title, foot, enter, read, ctx,
  hullChoices = [], onPreviewVisibility = () => {}, stageFactory = createStageHull } = {}) {
  const doc = root?.ownerDocument;
  if (!doc?.createElementNS || !root.querySelector || !stage?.replaceChildren) return null;
  injectSwarmHangarLayouts(doc);
  root.classList.add('orr-swarm-hangar');
  const make = (tag, cls, text) => {
    const node = doc.createElement(tag); node.className = cls;
    if (text !== undefined) node.textContent = text;
    if (tag === 'button') node.type = 'button';
    return node;
  };
  const visible = (node, on) => {
    if (!node) return;
    node.hidden = !on;
    node.style.setProperty('display', on ? '' : 'none', on ? '' : 'important');
  };
  const settings = stage.querySelector('.sf-crd-settings');
  const originalKits = [...root.querySelectorAll('.sf-crd-hull')];
  const originalBare = [...root.querySelectorAll('.sf-crd-anyhull-ship')];
  const controls = new Map([...originalKits, ...originalBare].map(button => [button.dataset.starterId, button]));
  const kitChoices = originalKits.map(button => ({ id: button.dataset.starterId,
    locked: button.dataset.locked === '1', earnText: button.dataset.earn || '' }));
  const roster = swarmHangarRoster({ hullChoices, kitChoices });
  const panel = (name, id) => {
    const node = make('section', 'sf-hangar-panel'); node.id = id;
    node.setAttribute('aria-label', name);
    return node;
  };
  const shipPanel = panel('Choose your ship and starting loadout', 'sf-hangar-ships');
  const runPanel = panel('Choose your arena and difficulty', 'sf-hangar-run');
  const section = (heading, line = '') => {
    const node = make('section', 'sf-hangar-section');
    node.append(make('h2', 'sf-hangar-section-title', heading));
    if (line) node.append(make('p', 'sf-hangar-note', line));
    return node;
  };
  const rosterSection = section('Choose your ship', 'Every hull has its own handling, defenses and weapon mounts.');
  rosterSection.classList.add('sf-hangar-ship-choice');
  const rosterList = make('div', 'sf-hangar-roster'); rosterList.setAttribute('role', 'group');
  rosterList.setAttribute('aria-label', 'Ships');
  const selectionStatus = make('p', 'sf-hangar-selection-status'); selectionStatus.setAttribute('role', 'status');
  const hullButtons = [];
  for (const hull of roster) {
    const button = make('button', 'sf-hangar-hull'); button.dataset.swarmHull = hull.id;
    button.setAttribute('aria-pressed', 'false'); button.setAttribute('aria-disabled', String(hull.locked));
    button.setAttribute('aria-label', `${hull.name}, ${hull.roleLabel}${hull.locked ? '. Locked. ' + hull.earnText : ''}`);
    const image = make('img', ''); image.src = hullPosterUrl(hull.id); image.alt = ''; image.draggable = false;
    button.append(image, make('strong', '', hull.name), make('span', '', hull.roleLabel));
    if (hull.locked) button.append(make('small', 'sf-hangar-lock', 'Locked'));
    button.addEventListener('click', () => {
      if (hull.locked) { selectionStatus.textContent = `${hull.name}: ${hull.earnText || 'Earn this ship in Swarm.'}`; return; }
      const id = preferredSwarmStarterForHull(hull.id, { currentStarterId: read().starterId, hullChoices, kitChoices });
      controls.get(id)?.click();
      selectionStatus.textContent = '';
      update();
    });
    rosterList.append(button); hullButtons.push(button);
  }
  rosterSection.append(rosterList, selectionStatus); shipPanel.append(rosterSection);
  const kitSection = section('Starting loadout', 'Presets are included. You can replace equipment before launching.');
  kitSection.classList.add('sf-hangar-loadout-choice');
  const kitList = make('div', 'sf-hangar-kits'); kitList.setAttribute('role', 'group');
  kitList.setAttribute('aria-label', 'Starting loadouts for the selected ship');
  kitSection.append(kitList); shipPanel.append(kitSection);
  const storedControls = make('div', 'sf-hangar-source-controls'); visible(storedControls, false);
  const challengeSection = make('details', 'sf-hangar-disclosure');
  challengeSection.append(make('summary', '', 'Optional challenges'));
  challengeSection.append(make('p', 'sf-hangar-note', 'Daily runs share the same arena and rules. Weekly challenges add a special rule. Ghosts replay a recorded run.'));
  const challengeList = make('div', 'sf-hangar-challenges'); challengeSection.append(challengeList);
  for (const button of root.querySelectorAll('.sf-crd-daily,.sf-crd-weekly,.sf-crd-ghost')) {
    challengeList.append(button.parentElement.tagName === 'LI' ? button.parentElement : button);
  }
  for (const note of root.querySelectorAll('.sf-crd-mode-sub,.sf-crd-ghost-sub')) challengeSection.append(note);
  const customSection = make('details', 'sf-hangar-disclosure');
  customSection.append(make('summary', '', 'Custom runs & records'));
  customSection.append(make('p', 'sf-hangar-note', 'Use a seed or shared code to replay the same run. These options are optional.'));
  const customRows = make('ul', 'sf-hangar-options'); customSection.append(customRows);
  const progression = make('details', 'sf-hangar-disclosure');
  progression.append(make('summary', '', 'Permanent upgrades & perks'));
  progression.append(make('p', 'sf-hangar-note', 'These use your earned Swarm progress. Your starting equipment budget is separate.'));
  const progressRows = make('ul', 'sf-hangar-options'); progression.append(progressRows);
  const runRows = make('ul', 'sf-hangar-options');
  const byClass = name => [...settings.children].find(row => row.classList.contains(name));
  // Order decisions by what they mean. Optional rules and purchases never share a picker.
  for (const name of ['sf-crd-row--arena', 'sf-crd-row--stake', 'sf-crd-row--mode', 'sf-crd-row--zone']) {
    const row = byClass(name); if (row) runRows.append(row);
  }
  for (const row of [...settings.children]) {
    if (row.matches('.sf-crd-row--hull')) storedControls.append(row);
    else if (row.matches('.sf-crd-row--threat,.sf-crd-row--modifiers')) challengeSection.append(row);
    else if (row.matches('.sf-crd-row--hangar,.sf-crd-row--perks')) progressRows.append(row);
    else customRows.append(row);
  }
  for (const child of [...stage.children]) if (child !== settings) customSection.append(child);
  runPanel.append(runRows);
  const training = foot.querySelector('[data-swarm-training]');
  if (training) {
    const lesson = section('Flight tutorial', 'Begin with one enemy and prompts for your controls. Available in a standard Swarm run.');
    lesson.classList.add('sf-hangar-lesson'); lesson.append(training); runPanel.append(lesson);
  }
  runPanel.append(challengeSection, progression, customSection);
  stage.replaceChildren(shipPanel, runPanel, storedControls);
  for (const [selector, label] of [['.sf-crd-row--stake', 'Difficulty'], ['.sf-crd-row--mode', 'Run type'], ['.sf-crd-row--zone', 'Starting round']]) {
    const cap = root.querySelector(`${selector} > .k-row__name`); if (cap) cap.textContent = label;
  }
  for (const button of root.querySelectorAll('.sf-crd-stake')) {
    const def = swarmStakeFor(button.dataset.stakeId);
    const change = Math.round((def.pressure - 1) * 100);
    const enemies = change === 0 ? 'Standard enemy numbers' : `${Math.abs(change)}% ${change < 0 ? 'fewer' : 'more'} enemies`;
    button.replaceChildren(make('strong', '', def.label), make('span', 'sf-hangar-budget', `${def.purse.toLocaleString('en-US')} credits`),
      make('span', '', enemies), make('small', '', `Round rewards ×${def.earn} · Score ×${def.score}`));
    button.setAttribute('aria-label', `${def.label}. ${def.purse} starting credits. ${enemies}. Round rewards times ${def.earn}. Score times ${def.score}.`);
  }
  const modeCopy = { swarm: '30 waves. Upgrade between rounds.', scored: '30 waves. Compete for a high score.', boss_circuit: 'Five bosses. Refit between fights.' };
  for (const button of root.querySelectorAll('.sf-crd-mode,.sf-crd-block')) {
    const isBlock = button.classList.contains('sf-crd-block');
    const legend = button.querySelector('.fh-tile-legend');
    if (legend && isBlock) legend.textContent = '10-wave challenge';
    button.append(make('span', 'sf-hangar-choice-detail', isBlock ? 'A shorter run with a finish at wave 10.' : modeCopy[button.dataset.ruleset] || 'Survival challenge.'));
  }
  const nav = make('nav', 'sf-hangar-nav'); nav.setAttribute('aria-label', 'Swarm preparation');
  const tabs = ['Ship & loadout', 'Arena & difficulty'].map((label, index) => {
    const tab = make('button', 'sf-hangar-step'); tab.dataset.swarmStep = String(index);
    tab.setAttribute('aria-controls', index === 0 ? shipPanel.id : runPanel.id);
    tab.append(make('span', 'sf-hangar-step-number', String(index + 1).padStart(2, '0')), make('span', '', label));
    tab.addEventListener('click', () => show(index)); nav.append(tab); return tab;
  });
  const equipmentStep = make('span', 'sf-hangar-step sf-hangar-step--next');
  const equipmentStepLabel = make('span', '', 'Equipment & launch');
  equipmentStep.append(make('span', 'sf-hangar-step-number', '03'), equipmentStepLabel);
  nav.append(equipmentStep); root.insertBefore(nav, stage);
  const arenaHero = root.querySelector('.orr-door-hero');
  if (arenaHero) {
    arenaHero.removeAttribute('aria-hidden');
    const words = arenaHero.querySelector('.orr-door-hero__words');
    words?.prepend(make('p', 'sf-hangar-eyebrow', 'Selected arena'));
  }
  const shipHero = make('section', 'sf-hangar-preview'); shipHero.setAttribute('aria-label', 'Selected ship');
  const shipHead = make('header', 'sf-hangar-shiphead');
  const shipName = make('h2', 'sf-hangar-shipname'); const shipRole = make('p', 'sf-hangar-shiprole');
  shipHead.append(make('p', 'sf-hangar-eyebrow', 'Your ship'), shipName, shipRole);
  const shipStage = make('div', 'sf-hangar-shipstage'); shipStage.setAttribute('role', 'img');
  const fitTitle = make('div', 'sf-hangar-fit-title');
  fitTitle.append(make('h3', '', 'Installed equipment'), make('span', '', 'Included with this loadout'));
  const manifest = make('div', 'sf-hangar-manifest');
  const fitNote = make('p', 'sf-hangar-fit-note');
  const stats = make('div', 'sf-hangar-stats'); stats.setAttribute('aria-label', 'Ship ratings, out of ten');
  shipHero.append(shipHead, shipStage, stats, fitTitle, manifest, fitNote); root.insertBefore(shipHero, foot);
  // This wrapper owns a single preview, with the same authored hull and fittings used in flight.
  // It is created only when the screen is shown, never while ScreenManager prewarms a hidden door.
  let hullStage = null, active = false, step = 0, lastBuild = null, lastHull = null, latest = null;
  let previewReleased = false, shownPreview = null, shownHull = null;
  const revealSelectedHull = () => {
    const view = doc.defaultView;
    view?.requestAnimationFrame?.(() => {
      if (!active || step !== 0) return;
      const selected = hullButtons.find(button => button.getAttribute('aria-pressed') === 'true');
      if (!selected || !rosterList.clientWidth || !rosterList.clientHeight) return;
      const frame = rosterList.getBoundingClientRect(), item = selected.getBoundingClientRect();
      const scaleX = frame.width / (rosterList.offsetWidth || frame.width || 1);
      const scaleY = frame.height / (rosterList.offsetHeight || frame.height || 1);
      if (!(scaleX > 0 && scaleY > 0)) return;
      const left = frame.left + rosterList.clientLeft * scaleX;
      const top = frame.top + rosterList.clientTop * scaleY;
      const right = left + rosterList.clientWidth * scaleX;
      const bottom = top + rosterList.clientHeight * scaleY;
      // Keep the selected card in its own roster viewport. scrollIntoView would also
      // move the outer page, pulling the loadout or ship preview away from the player.
      rosterList.scrollLeft += (item.left < left ? item.left - left : item.right > right ? item.right - right : 0) / scaleX;
      rosterList.scrollTop += (item.top < top ? item.top - top : item.bottom > bottom ? item.bottom - bottom : 0) / scaleY;
    });
  };
  const summary = make('p', 'sf-hangar-summary'); summary.setAttribute('aria-live', 'polite');
  const next = make('button', 'sf-hangar-next', 'Choose arena →');
  next.addEventListener('click', () => { show(1); tabs[1].focus({ preventScroll: true }); });
  const back = foot.querySelector('.sf-back');
  if (back) { back.textContent = 'Main menu'; back.setAttribute('aria-label', 'Back to main menu'); }
  const actions = make('div', 'sf-hangar-actions'); if (back) actions.append(back);
  actions.append(summary, next, enter); foot.replaceChildren(actions);
  const hint = make('p', 'sf-hangar-footer-note', 'Choose a ship, set up your run, then review equipment before launching.');
  hint.id = 'sf-hangar-launch-note'; enter.setAttribute('aria-describedby', hint.id);
  foot.append(hint);
  function releasePreview() {
    hullStage?.deactivate();
    if (hullStage && !previewReleased) { hullStage.release(); previewReleased = true; shownPreview = null; }
  }
  function paintPreview() {
    if (!active || step !== 0 || !latest) return;
    shipStage.querySelector('.sf-hangar-poster')?.remove();
    if (!hullStage) hullStage = stageFactory(shipStage, { live: true, dock: false, zoom: 1.3 });
    if (previewReleased) { hullStage.restore(); previewReleased = false; }
    const key = JSON.stringify([latest.hull.id, latest.fittings, latest.weapons]);
    if (shownPreview !== key) {
      hullStage.show(latest.hull.id, { fittings: latest.fittings, weapons: latest.weapons,
        preserveView: shownPreview !== null && shownHull === latest.hull.id });
      shownPreview = key; shownHull = latest.hull.id;
    }
    hullStage.activate(ctx);
  }
  function paintKits(hull) {
    kitList.replaceChildren();
    for (const kit of hull.kits) {
      const button = make('button', 'sf-hangar-kit'); button.dataset.swarmKit = kit.id;
      button.setAttribute('aria-disabled', String(kit.locked));
      button.append(make('strong', '', kit.label), make('span', '', kit.description));
      if (kit.locked) button.append(make('small', '', kit.earnText || 'Locked loadout'));
      else if (!kit.bare) button.append(make('small', '', kit.equipmentNames.join(' · ')));
      button.addEventListener('click', () => {
        if (kit.locked) { selectionStatus.textContent = kit.earnText || 'Earn this loadout in Swarm.'; return; }
        controls.get(kit.id)?.click(); selectionStatus.textContent = ''; update(); revealSelectedHull();
      });
      kitList.append(button);
    }
  }
  function update() {
    const state = read();
    const loadout = preparationLoadout(state.starterId, state.weeklyMutatorId);
    if (!loadout) return;
    latest = loadout;
    const hull = roster.find(row => row.id === loadout.hull.id);
    if (lastHull !== loadout.hull.id) { lastHull = loadout.hull.id; if (hull) paintKits(hull); }
    for (const button of hullButtons) button.setAttribute('aria-pressed', String(button.dataset.swarmHull === loadout.hull.id));
    for (const button of kitList.children) button.setAttribute('aria-pressed', String(button.dataset.swarmKit === state.starterId));
    const isSwarm = state.ruleset === 'swarm'; const difficulty = swarmStakeFor(state.daily ? 'contender' : state.stake);
    const readiness = swarmPreparationReadiness(state);
    summary.textContent = `${loadout.hull.name} · ${state.arenaLabel || 'Arena'} · ${isSwarm ? difficulty.label : modeName(state.ruleset)}`;
    enter.textContent = readiness.equipmentNext ? 'Review equipment →' : 'Launch challenge';
    enter.disabled = !readiness.allowed;
    enter.setAttribute('aria-disabled', String(!readiness.allowed));
    enter.setAttribute('aria-label', readiness.equipmentNext ? `Review equipment for ${loadout.hull.name}. Combat has not started.` : `Launch ${modeName(state.ruleset)} with ${loadout.hull.name}`);
    equipmentStepLabel.textContent = readiness.equipmentNext ? 'Equipment & launch' : 'Launch challenge';
    kitSection.querySelector('.sf-hangar-note').textContent = readiness.equipmentNext
      ? 'Presets are included. You can replace equipment before launching.'
      : 'Presets are included. This challenge launches with the equipment shown.';
    hint.textContent = step === 0 ? 'Your ship and its starting equipment. Nothing here spends campaign credits.'
      : readiness.message || `${readiness.startingCredits.toLocaleString('en-US')} starting credits · Equipment between rounds · Boss every ${SWARM_BOSS_EVERY} rounds · Refit every ${SWARM_REFIT_EVERY} rounds`;
    const fitted = loadout.slots.filter(slot => slot.defId).length;
    const intrinsic = loadout.slots.filter(slot => slot.intrinsicDefId).length;
    fitNote.textContent = readiness.physicsOnly ? readiness.message
      : !readiness.allowed ? readiness.message
        : readiness.equipmentNext ? fitted ? 'Keep this equipment or change it in Equipment before you deploy.'
          : intrinsic ? 'This ship has built-in weapons. You can add equipment before you deploy.'
            : 'This ship is empty. Choose and buy equipment before you deploy.'
          : intrinsic ? 'This ship launches with its built-in weapons and the equipment shown.'
            : 'This is the equipment you take into the challenge.';
    fitNote.classList.toggle('is-empty', !fitted && !intrinsic && !readiness.physicsOnly);
    const buildKey = `${state.starterId}:${state.weeklyMutatorId || ''}`;
    if (lastBuild !== buildKey) {
      lastBuild = buildKey; shipName.textContent = loadout.hull.name;
      shipRole.textContent = `${hull?.roleLabel || 'Ship'} · ${loadout.name}`;
      shipStage.dataset.hullId = loadout.hull.id;
      shipStage.setAttribute('aria-label', `${loadout.hull.name} with ${loadout.name} loadout`);
      if (!hullStage) {
        const image = make('img', 'sf-hangar-poster'); image.src = hullPosterUrl(loadout.hull.id); image.alt = ''; image.draggable = false;
        shipStage.replaceChildren(image);
      }
      manifest.replaceChildren();
      const slotCounts = {};
      for (const slot of loadout.slots) {
        const item = make('div', 'sf-hangar-fitting'); if (!slot.defId && !slot.intrinsicDefId) item.classList.add('is-empty');
        const glyph = equipmentSvg({ defId: slot.defId || slot.intrinsicDefId || slot.type }, doc); if (glyph) item.append(glyph);
        slotCounts[slot.type] = (slotCounts[slot.type] || 0) + 1;
        const words = make('span', ''); words.append(make('small', '', `${SLOT_LABELS[slot.type] || 'Equipment'} ${slotCounts[slot.type]}`),
          make('strong', '', slot.intrinsicDefId ? `${slot.intrinsicName} · Built in` : slot.name));
        item.append(words); manifest.append(item);
      }
      stats.replaceChildren();
      const sheet = shipStatSheet({ shipId: loadout.hull.id, fittings: loadout.fittings });
      for (const stat of sheet?.stats || []) {
        const item = make('div', 'sf-hangar-stat'); item.title = stat.meaning;
        const label = make('span', '', stat.label); const value = make('strong', '', `${stat.value}/10`);
        const meter = make('meter', ''); meter.min = 0; meter.max = 10; meter.value = stat.value;
        meter.setAttribute('aria-label', `${stat.label}: ${stat.value} out of 10. ${stat.meaning}`);
        item.append(label, value, meter); stats.append(item);
      }
    }
    paintPreview();
    onPreviewVisibility(false);
  }
  function show(index) {
    step = index === 1 ? 1 : 0; root.dataset.prepStep = String(step);
    visible(shipPanel, step === 0); visible(runPanel, step === 1);
    visible(shipHero, step === 0); visible(arenaHero, step === 1);
    visible(next, step === 0); visible(enter, step === 1);
    for (let i = 0; i < tabs.length; i++) { tabs[i].setAttribute('aria-current', i === step ? 'step' : 'false'); }
    stage.scrollTop = 0;
    if (doc.defaultView?.matchMedia?.('(max-width:800px)').matches) root.scrollTop = 0;
    if (!active || step !== 0) releasePreview();
    update();
    if (step === 0) revealSelectedHull();
  }
  show(0);
  return {
    update, attractHost: null, get previewVisible() { return false; },
    focus() { tabs[step].focus({ preventScroll: true }); },
    setActive(on) {
      const entering = !!on && !active;
      active = !!on;
      // The cached hangar returns to the selected ship after equipment preparation or a
      // title visit. Only the visible step resets; the canonical ship and run choices stay.
      if (entering) show(0);
      else if (active) { paintPreview(); revealSelectedHull(); }
      else releasePreview();
    },
    dispose() { active = false; hullStage?.dispose(); hullStage = null; onPreviewVisibility(false); },
  };
}
