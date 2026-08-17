// src/ui/fitTree.js — file-tree-inspired hull → mounts → modules → modifiers view.
// Used by the Outfitting engineering screen to make the loadout hierarchy readable at a glance.
// Pure DOM; no sim imports beyond data helpers.
import { buildSlotList, fits } from '../systems/ships.js';
import { SHIPS } from '../data/ships.js';
import { MODULES } from '../data/modules.js';
import { WEAPONS } from '../data/weapons.js';

const SHIP_BY_ID = new Map(SHIPS.map((s) => [s.id, s]));
const FITTABLE_BY_ID = new Map();
for (const m of MODULES) FITTABLE_BY_ID.set(m.id, m);
for (const w of WEAPONS) if (!FITTABLE_BY_ID.has(w.id)) FITTABLE_BY_ID.set(w.id, w);

const TYPE_ICONS = {
  weapon: '◆', shield: '▣', engine: '⬡', cargo: '▦', mining: '✦', utility: '◎',
};

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function modifierLines(def) {
  if (!def || !def.mods) return [];
  const out = [];
  const m = def.mods;
  if (m.shieldFlat) out.push('+' + m.shieldFlat + ' shield');
  if (m.shieldRegenFlat) out.push('+' + m.shieldRegenFlat + ' regen');
  if (m.topSpeed) out.push(m.topSpeed + ' top spd');
  if (m.accelMult != null) out.push((m.accelMult >= 1 ? '+' : '') + Math.round((m.accelMult - 1) * 100) + '% accel');
  if (m.turnMult != null) out.push((m.turnMult >= 1 ? '+' : '') + Math.round((m.turnMult - 1) * 100) + '% turn');
  if (m.cargoFlat) out.push('+' + m.cargoFlat + ' cargo');
  if (m.cargoCapPct) out.push('+' + Math.round(m.cargoCapPct * 100) + '% cap');
  if (m.damageReductionPct) out.push('-' + Math.round(m.damageReductionPct * 100) + '% dmg');
  if (m.boostTopSpeedPct) out.push('+' + Math.round(m.boostTopSpeedPct * 100) + '% boost');
  if (m.weaponRangePct) out.push('+' + Math.round(m.weaponRangePct * 100) + '% wpn rng');
  if (m.weaponDmgPct) out.push('+' + Math.round(m.weaponDmgPct * 100) + '% wpn dmg');
  if (m.weaponHeatDissipPct) out.push('+' + Math.round(m.weaponHeatDissipPct * 100) + '% wpn cool');
  if (m.radarRangePct) out.push('+' + Math.round(m.radarRangePct * 100) + '% radar');
  if (Number.isFinite(m.magnetRange) && m.magnetRange > 0) out.push(Math.round(m.magnetRange) + ' wu ore magnet');
  if (m.hullRepairOOC) out.push('+' + m.hullRepairOOC + ' hull/s');
  if (m.droneBay) out.push('drone bay');
  if (m.jumpDriveTier) out.push('jump T' + m.jumpDriveTier);
  if (m.revealCargo) out.push('scan cargo');
  if (m.hiddenCargoPct) out.push('+' + Math.round(m.hiddenCargoPct * 100) + '% hidden hold');
  if (m.scannerCloak) out.push('+' + Math.round(m.scannerCloak * 100) + '% scan cloak');
  if (m.marketIntel) out.push('market data');
  if (m.countermeasure) out.push(m.countermeasure.kind + ' cm');
  return out;
}

/**
 * @param {HTMLElement} container
 * @param {object} opts
 * @param {(slotIndex:number)=>void} [opts.onSelect]
 * @param {(slotIndex:number)=>void} [opts.onHover]
 * @param {()=>void} [opts.onLeave]
 */
export function createFitTree(container, opts = {}) {
  const root = document.createElement('div');
  root.className = 'st-fit-tree';
  container.appendChild(root);

  let shipDef = null;
  let slots = [];
  let fittings = [];
  let preview = null; // { slotIndex, defId } or null
  let selectedSlot = null;
  let hoveredSlot = null;

  function render() {
    root.textContent = '';
    if (!shipDef) {
      root.innerHTML = '<div class="st-fit-empty">No ship selected.</div>';
      return;
    }

    // Build tree.
    const frag = document.createDocumentFragment();

    // Root: hull identity.
    const hullNode = document.createElement('div');
    hullNode.className = 'st-fit-node st-fit-node--root';
    const invalidRoot = preview && !slots.some((s, i) => !fittings[i] && fits(s, FITTABLE_BY_ID.get(preview.defId)));
    if (invalidRoot) hullNode.classList.add('st-fit-node--invalid');
    hullNode.innerHTML = `<span class="st-fit-icon st-fit-icon--hull">⛴</span>` +
      `<span class="st-fit-label">SHIP · ${escapeHtml(shipDef.name)}</span>` +
      `<span class="st-fit-meta mono">T${shipDef.tier} ${shipDef.role || ''}</span>`;
    frag.appendChild(hullNode);

    // Group slots by type.
    const groups = {};
    for (let i = 0; i < slots.length; i++) {
      const s = slots[i];
      if (!groups[s.type]) groups[s.type] = [];
      groups[s.type].push({ slot: s, index: i });
    }

    for (const type of ['weapon', 'shield', 'engine', 'cargo', 'mining', 'utility']) {
      const list = groups[type];
      if (!list || !list.length) continue;

      const branch = document.createElement('div');
      branch.className = 'st-fit-branch';
      const branchHead = document.createElement('div');
      branchHead.className = 'st-fit-branch-head';
      branchHead.innerHTML = `<span class="st-fit-icon st-fit-icon--${type}">${TYPE_ICONS[type]}</span>` +
        `<span class="st-fit-branch-label">${type}</span>` +
        `<span class="st-fit-branch-count mono">${list.length}</span>`;
      branch.appendChild(branchHead);

      for (const { slot, index } of list) {
        const fittedId = fittings[index];
        const fittedDef = fittedId ? FITTABLE_BY_ID.get(fittedId) : null;
        const isPreviewTarget = preview && preview.slotIndex === index;
        const previewDef = preview ? FITTABLE_BY_ID.get(preview.defId) : null;
        const previewFits = previewDef && fits(slot, previewDef);
        const isSelected = selectedSlot === index;

        const node = document.createElement('div');
        node.className = 'st-fit-node st-fit-node--slot' +
          (isSelected ? ' st-fit-node--selected' : '') +
          (fittedDef ? ' st-fit-node--filled' : ' st-fit-node--empty') +
          (isPreviewTarget && previewFits ? ' st-fit-node--preview-ok' : '') +
          (isPreviewTarget && previewDef && !previewFits ? ' st-fit-node--preview-bad' : '');
        node.setAttribute('data-slot', String(index));
        node.setAttribute('role', 'button');
        node.setAttribute('tabindex', '0');
        node.setAttribute('aria-label', `${slot.type} ${slot.size} slot ${index + 1}`);

        let html = `<span class="st-fit-slot-size mono">${escapeHtml(slot.size)}</span>` +
          `<span class="st-fit-slot-name">${escapeHtml(fittedDef ? fittedDef.name : '— empty —')}</span>`;
        if (slot.facing) {
          html += `<span class="st-fit-slot-facing mono">${escapeHtml(slot.facing)}</span>`;
        }
        if (isPreviewTarget && previewDef) {
          html += `<span class="st-fit-preview-arrow">→</span>` +
            `<span class="st-fit-preview-name${previewFits ? '' : ' st-fit-preview-name--bad'}">${escapeHtml(previewDef.name)}</span>`;
        }
        node.innerHTML = html;

        // Modifiers subtree for fitted module.
        const lines = fittedDef ? modifierLines(fittedDef) : [];
        if (lines.length || (isPreviewTarget && previewDef && previewDef.mods)) {
          const mods = document.createElement('div');
          mods.className = 'st-fit-mods';
          for (const line of lines) {
            const m = document.createElement('div');
            m.className = 'st-fit-mod';
            m.textContent = line;
            mods.appendChild(m);
          }
          if (isPreviewTarget && previewDef && previewDef.mods) {
            const previewLines = modifierLines(previewDef);
            for (const line of previewLines) {
              const m = document.createElement('div');
              m.className = 'st-fit-mod st-fit-mod--preview';
              m.textContent = '+ ' + line;
              mods.appendChild(m);
            }
          }
          node.appendChild(mods);
        }

        branch.appendChild(node);
      }
      frag.appendChild(branch);
    }

    root.appendChild(frag);
  }

  function selectSlot(idx) {
    if (!Number.isInteger(idx)) return;
    selectedSlot = idx;
    if (typeof opts.onSelect === 'function') opts.onSelect(idx);
    render();
  }

  function hoverSlot(idx) {
    if (hoveredSlot === idx) return;
    hoveredSlot = idx;
    if (typeof opts.onHover === 'function') opts.onHover(idx);
  }

  root.addEventListener('click', (ev) => {
    const node = ev.target.closest('[data-slot]');
    if (!node) return;
    selectSlot(Number(node.getAttribute('data-slot')));
  });

  root.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    const node = ev.target.closest('[data-slot]');
    if (!node) return;
    ev.preventDefault();
    selectSlot(Number(node.getAttribute('data-slot')));
  });

  root.addEventListener('mouseover', (ev) => {
    const node = ev.target.closest('[data-slot]');
    if (!node) return;
    hoverSlot(Number(node.getAttribute('data-slot')));
  });

  root.addEventListener('mouseleave', () => {
    hoveredSlot = null;
    if (typeof opts.onLeave === 'function') opts.onLeave();
  });

  function setShip(defId, fitArr) {
    shipDef = SHIP_BY_ID.get(defId) || null;
    slots = shipDef ? buildSlotList(shipDef) : [];
    fittings = Array.isArray(fitArr) ? fitArr.slice() : [];
    selectedSlot = null;
    hoveredSlot = null;
    render();
  }

  function setFittings(fitArr) {
    fittings = Array.isArray(fitArr) ? fitArr.slice() : [];
    render();
  }

  function setPreview(slotIndex, defId) {
    preview = (defId != null) ? { slotIndex, defId } : null;
    render();
  }

  function setSelected(slotIndex) {
    selectedSlot = slotIndex;
    render();
  }

  function dispose() {
    if (root.parentNode) root.parentNode.removeChild(root);
  }

  return { el: root, setShip, setFittings, setPreview, setSelected, render, dispose };
}
