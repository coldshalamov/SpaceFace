import { fortifyAvailable } from '../swarmFortifyPanel.js';
// Crucible draft surface (PQ-133 / CRU-016) and refit surface (CRU-017).
//
// Both are pure DOM over receipts. They read the open offers, the re-roll price and the fittable
// spares from the survivalDraft owner and emit intents back to it; neither writes state.run,
// fittings, or the phase. A pick the fitting authority refuses is reported by the owner, not
// papered over here.
//
// WHY refresh() AND NOT JUST mount(). screenManager mounts a screen ONCE and caches it, calling
// refresh() on every push. Building the cards in mount meant the second draft of a run re-showed
// the first draft's three cards. Everything that changes between drafts — and between paid
// re-rolls within one draft — is built in refresh; the shell, the footer and the keydown listener
// are built once in mount so a re-render cannot destroy them.
//
// WHY THE REFIT ASKS THE OWNER FOR SPARES. It used to offer spares[spares.length - 1] for every
// empty hardpoint, so a player who had drafted five weapons could only ever re-fit the newest.
// The owner now returns every spare that legally fits each hardpoint, decided with the same
// buildSlotList/fits the fitting authority uses. The screen still never calls ships: it emits
// run:refitFitRequested / run:refitStripRequested and reads back what happened.
//
// A REFUSAL IS ALWAYS SAID. Both surfaces carry one aria-live line that reports the owner's last
// refusal in plain words, and the re-roll control is drawn dead — with the price and the balance
// beside it — when it cannot be bought. No control here is allowed to look live and do nothing.
//
// Both ids are in PAUSING_SCREENS: §12.2 adopts a FULL pause during a draft.
//
// Both are built on the frontend kit (styles/kit.css, src/ui/kit/) — Frontend Task D §1.2. This
// file owns no CSS. The draft is three offers across on the sky, each a verb, a name and one line,
// with its key in fine print; the focused one bright. The refit is a column of hardpoint rows.

import { MODULES } from '../../data/modules.js';
import { arsenalIdentity } from '../../data/arsenalIdentity.js';
import { ENEMY_TYPES } from '../../data/enemies.js';
import { summarizeRunBuild } from '../../data/runModifiers.js';
import { SURVIVAL_DRAFT_CHOICES, swarmSellPrice } from '../../data/survivalDraft.js';
import { SWARM_CATEGORIES, catalogBlurbFor } from '../../data/swarmCatalog.js';
import { swarmRoundPreview } from '../../data/swarmLadder.js';
import { WEAPONS } from '../../data/weapons.js';
import {
  canExtract,
  partialBankOffer,
  requestSurvivalExtraction,
  securedBountyOf,
} from '../../systems/survivalExtraction.js';
import { canContinueSurvivalEndless, continueSurvivalEndless } from '../../systems/survivalEndless.js';
import { difficultyForWave } from '../../data/survivalActs.js';
import { planWave } from '../../systems/survivalWavePlanner.js';
import { normalizeMutators } from '../../systems/survivalMutators.js';
import {
  circuitBossFor,
  circuitChoicesFor,
  circuitFor,
  circuitRoundFor,
  circuitRouteView,
  circuitStateError,
  CIRCUIT_EVENT,
  CIRCUIT_SERVICES,
  CIRCUIT_STAGE_COUNT,
} from '../../systems/survivalCircuit.js';
import { survivalRun } from '../../systems/survivalRun.js';
import {
  CRUCIBLE_PURCHASE_SPEND_REASON,
  CRUCIBLE_REROLL_SPEND_REASON,
} from '../../systems/survivalDraft.js';
import { el, settle, cue, attachHoldVerb } from '../kit/index.js';
import { crucibleFittingDescription } from '../crucibleCombatReadout.js';
import { decorateEntityNode, entityLabel } from '../entityResolver.js';
import { createStationRow } from '../orrery/stopDial.js';
import { svg, lightPath } from '../orrery/svg.js';
import { createHullSchematic } from '../orrery/hullSchematic.js';
import { createSlotJig } from '../orrery/slotJig.js';
import { equipmentSvg } from '../orrery/equipmentGlyphs.js';
import { createVisualArmory } from '../orrery/crucibleArmory.js';
import { injectOrreryScreens } from '../orrery/screenLayouts.js';
import { injectCrucibleDoorLayouts } from '../orrery/crucible-doorLayouts.js';
import { injectCruciblePreparation } from '../orrery/cruciblePreparationLayouts.js';
import { injectCrucibleRefitLayouts } from '../orrery/crucible-refitLayouts.js';

/**
 * Show or hide a footer word. `.k-word { display: inline-block }` beats the `hidden`
 * attribute, so a Swarm Continue that only set `hidden` still painted. The wrap `<li>`
 * has to go with it or the row keeps an empty gap.
 */
function appendFortifyWord(words, ctx) {
  const button = addWord(words, word('Fortify the field', 'k-word--emph'));
  setWordShown(button, fortifyAvailable(ctx.state?.run));
  button.addEventListener('click', () => {
    if (fortifyAvailable(ctx.state?.run)) ctx.bus.emit('ui:pushScreen', { id: 'crucibleFortify' });
    else cue('deny');
  });
  return button;
}

function setWordShown(button, show) {
  if (!button) return;
  button.hidden = !show;
  if (button.style && typeof button.style.setProperty === 'function') {
    if (show) button.style.removeProperty('display');
    else button.style.setProperty('display', 'none', 'important');
  }
  const li = button.parentElement;
  if (!li || String(li.tagName).toUpperCase() !== 'LI') return;
  li.hidden = !show;
  if (li.style && typeof li.style.setProperty === 'function') {
    if (show) li.style.removeProperty('display');
    else li.style.setProperty('display', 'none', 'important');
  }
}

// The armory's shelf row: 'All', the six fitting shelves, then the two non-fitting counters
// the swarm owner stocks (hull offers file under 'Hulls', service work under 'Service').
const ARMORY_CATEGORIES = Object.freeze(['All', ...SWARM_CATEGORIES, 'Ships', 'Service']);
const ARMORY_CATEGORY_SET = new Set(ARMORY_CATEGORIES);

/** A kit word (`button.k-word`). The caller appends it. */
function word(label, className) {
  const button = el('button', 'k-word' + (className ? ' ' + className : ''), label);
  button.type = 'button';
  return button;
}

/** Append a word to a `.k-words` list, in its `li`. */
function addWord(list, button) {
  const li = el('li');
  li.appendChild(button);
  list.appendChild(li);
  return button;
}

/**
 * A key's words with its keyboard hint printed inside it, so the hint is read with the verb it
 * fires instead of floating at the far edge of the foot. The hint is decoration for sighted
 * players; the key itself is announced through aria-keyshortcuts.
 */
function setKeyLabel(button, label, key, shortcut) {
  if (!button) return;
  const current = button.dataset ? `${button.dataset.label || ''}|${button.dataset.key || ''}` : '';
  if (current === `${label}|${key || ''}` && button.childNodes && button.childNodes.length) return;
  // The hold-to-fire ring (attachHoldVerb) is a child of the word — clearing textContent would
  // strip it, so it is lifted out and put back after the label and key cap.
  const hold = button.querySelector && button.querySelector('.dp-holdring');
  button.textContent = '';
  button.appendChild(el('span', 'sf-cru-label', label));
  if (key) {
    const hint = el('span', 'sf-cru-kbd', key);
    hint.setAttribute('aria-hidden', 'true');
    button.appendChild(hint);
  }
  if (hold) button.appendChild(hold);
  if (typeof button.setAttribute === 'function') {
    if (shortcut) button.setAttribute('aria-keyshortcuts', shortcut);
    else if (typeof button.removeAttribute === 'function') button.removeAttribute('aria-keyshortcuts');
  }
  if (button.dataset) {
    button.dataset.label = label;
    button.dataset.key = key || '';
  }
}

/** Guarded kit motion: the unit tests import this module under node with no frame clock. */
function canAnimate() {
  return typeof requestAnimationFrame === 'function' && typeof document !== 'undefined'
    && typeof document.createElement === 'function' && typeof HTMLElement === 'function';
}

/**
 * INF-060 focus discipline for rebuilds. Both surfaces rebuild their cards/rows on every refresh,
 * which used to destroy the focused element: a pad player moving through offers lost their place
 * on every purchase, and the refit dropped focus entirely (the fresh rows contain nothing
 * focused). The rebuild helpers capture where focus was, and restore it afterwards — the same
 * card (by offer id) on the draft, the same control (by row and kind) on the refit — falling back
 * to the surface's own re-claim. Also scrolls the focused control into view: the refit stage is a
 * scroll column and a pad move to a hardpoint below the fold must bring the row with it.
 */
function focusedControlId(rootEl) {
  const active = typeof document !== 'undefined' ? document.activeElement : null;
  if (!active || !rootEl || typeof rootEl.contains !== 'function' || !rootEl.contains(active)) return null;
  if (active.dataset && active.dataset.offerId) return { card: active.dataset.offerId };
  const rowEl = active.closest ? active.closest('.sf-cru-row') : null;
  if (!rowEl) return null;
  const rows = rowEl.parentNode ? [...rowEl.parentNode.children] : [];
  const rowIndex = rows.indexOf(rowEl);
  if (active.dataset && active.dataset.spare != null) return { rowIndex, kind: 'spare', spare: active.dataset.spare };
  return { rowIndex, kind: active.tagName === 'SELECT' ? 'pick' : 'action' };
}

function restoreFocusedControl(rootEl, saved) {
  if (!saved) return null;
  if (typeof document === 'undefined') return null;
  let target = null;
  if (saved.card) target = rootEl.querySelector(`[data-offer-id="${saved.card}"]`);
  if (saved.rowIndex != null) {
    const row = rootEl.querySelectorAll('.sf-cru-row')[saved.rowIndex];
    if (row && saved.kind === 'spare') {
      target = row.querySelector(`[data-spare="${saved.spare}"]`) || row.querySelector('[data-spare]')
        || row.querySelector('.sf-cru-act');
    } else if (row) {
      target = saved.kind === 'pick' ? row.querySelector('select') : (row.querySelector('.sf-cru-act') || row.querySelector('button'));
    }
  }
  if (target && typeof target.focus === 'function') {
    try {
      target.focus();
      if (typeof target.scrollIntoView === 'function') target.scrollIntoView({ block: 'nearest' });
      return target;
    } catch { /* focus is best-effort */ }
  }
  return null;
}

function draftOwner(ctx) {
  const registry = ctx && ctx.registry;
  if (!registry || typeof registry.get !== 'function') return null;
  return registry.get('survivalDraft') || null;
}

function activeLoadout(ctx) {
  const player = ctx && ctx.state && ctx.state.player;
  const ships = Array.isArray(player && player.ownedShips) ? player.ownedShips : [];
  const index = Number.isInteger(player && player.activeShipIndex) ? player.activeShipIndex : 0;
  const owned = ships[index] || null;
  return {
    hullId: owned && owned.defId ? owned.defId : null,
    fittings: Array.isArray(owned && owned.fittings) ? owned.fittings : [],
  };
}

function prettyDefId(defId) {
  if (!defId) return 'empty';
  return String(defId).replace(/^(wpn|mod)_/, '').replace(/_/g, ' ');
}

const DEF_NAME_BY_ID = new Map([...MODULES, ...WEAPONS].map((def) => [def && def.id, def && def.name]));

/** A fitting as the player reads it: its authored name, never its id. */
function fittingName(defId) {
  if (!defId) return 'empty';
  return DEF_NAME_BY_ID.get(defId) || prettyDefId(defId);
}

const SLOT_WORD = Object.freeze({
  weapon: 'Weapon', shield: 'Shield', engine: 'Engine', utility: 'Utility', thruster: 'Thruster',
});

/** Card text for one offer. Exported so a check can assert the wording without a DOM. */
export function offerCardLines(offer, state) {
  if (!offer) return null;
  let slot = typeof offer.slotLabel === 'string' && offer.slotLabel
    // Non-fitting offers (a hull, a weld) carry their own "where it lands" line; fittings
    // derive theirs from the hardpoint the legality pass picked. The line always answers the
    // buyer's two questions — WHICH hardpoint, and what happens to what's there (a swap keeps
    // the old part as a spare; ships.fitModule is the authority).
    ? offer.slotLabel
    : Array.isArray(offer.consumes) && offer.consumes.length
      ? `Trades ${offer.consumes.map(fittingName).join(' + ')} for this on hardpoint ${offer.slotIndex + 1}`
      : offer.replaces
        ? `Swaps with ${fittingName(offer.replaces)} on hardpoint ${offer.slotIndex + 1} — it goes to your spares`
        : Number.isInteger(offer.slotIndex) ? `Bolts onto empty hardpoint ${offer.slotIndex + 1}` : '';
  const innate = state?.entities?.get?.(state.playerId)?.data?.weapons
    ?.find(w => w.intrinsic && w.slotIndex === offer.slotIndex);
  if (innate && offer.kind !== 'hull' && offer.kind !== 'service') {
    slot = `Hardpoint ${offer.slotIndex + 1} — replaces built-in ${innate.name}. Strip the fitting to restore it.`;
  }
  return {
    verb: offer.verb || offer.id || '',
    name: offer.name || offer.defId || '',
    blurb: arsenalIdentity(offer.defId)?.sentence || offer.blurb || '',
    activation: crucibleFittingDescription(offer.defId, state),
    slot,
  };
}

/**
 * The re-roll control, in words. Exported for the same reason offerCardLines is: a check can
 * assert that an unaffordable re-roll reads as unavailable, with the price and the balance on
 * screen, without standing up a DOM.
 *
 * The refusal sentence comes from the owner (`state.note`) rather than being written again here,
 * so the line a player reads before pressing is the line they read after pressing.
 */
export function rerollControlLines(state, notice = null) {
  const s = state && typeof state === 'object' ? state : {};
  const price = Number.isFinite(s.price) ? s.price : 0;
  const credits = Number.isFinite(s.credits) ? s.credits : 0;
  if (!s.open) {
    return { visible: false, label: '', wallet: '', draw: '', disabled: true, notice: notice || '' };
  }
  const exhausted = s.reason === 'pool_exhausted';
  return {
    visible: true,
    label: exhausted ? 'Re-roll' : `Re-roll · ${price} cr`,
    wallet: `Run wallet ${credits} cr`,
    draw: s.rerolls > 0 ? `Draw ${s.rerolls + 1}` : '',
    disabled: !s.available,
    notice: notice || s.note || '',
  };
}

/**
 * INF-060: the remembered spare choice for a hardpoint, honored only while it still fits. The
 * refit keeps the player's per-hardpoint pick across refreshes; a choice whose instance was
 * consumed (fitted elsewhere) or that no longer fits is pruned rather than silently re-applied.
 * Pure so a check can pin the guard without a DOM.
 */
export function rememberedSpareChoice(options, remembered) {
  if (remembered == null) return null;
  const match = (Array.isArray(options) ? options : [])
    .find((o) => String(o.instanceId) === String(remembered));
  return match ? String(match.instanceId) : null;
}

/**
 * How many of the drawn shop cards the wallet can still buy: available (the owner already folds
 * affordability and slot legality into it), not yet fitted, not the hull being flown, and not a
 * hull already on the manifest (a free switch, not a sale). Pure so a check can pin the count
 * the Escape guard reads without a DOM.
 */
export function affordableOfferCount(offers) {
  let count = 0;
  for (const offer of Array.isArray(offers) ? offers : []) {
    if (!offer || offer._flying || offer.purchased || offer.available !== true) continue;
    if (offer.kind === 'hull' && Number.isInteger(offer._ownedIndex)) continue;
    count += 1;
  }
  return count;
}

/** The one line the first Escape leaves behind when it spared the player's unspent credits. */
export function launchGuardLine(count) {
  const n = Math.max(0, Math.floor(Number(count) || 0));
  return `You can still afford ${n} card${n === 1 ? '' : 's'} — Esc again or Launch to go`;
}

const WEAPON_DEF_BY_ID = new Map(WEAPONS.map((def) => [def && def.id, def]));

function finiteNum(value) {
  return Number.isFinite(value) ? value : null;
}

function shortNum(value) {
  return String(Math.round(value * 10) / 10);
}

/** A spare's option label. Weapon spares carry their authored figures; anything else stays bare. */
function spareOptionLabel(spare) {
  const base = spare.name || prettyDefId(spare.defId);
  const def = spare && WEAPON_DEF_BY_ID.get(spare.defId);
  const dps = finiteNum(def && def.dps);
  const impulse = finiteNum(def && def.impulsePerHit);
  if (dps == null && impulse == null) return base;
  const parts = [];
  if (dps != null) parts.push(`${shortNum(dps)} dps`);
  if (impulse != null) parts.push(`impulse ${shortNum(impulse)}`);
  return `${base} — ${parts.join(' · ')}`;
}

/**
 * One honest fitting comparison (INF-036): weapon spares for the same empty hardpoint,
 * contrasted on the two authored axes combat actually pays — sustained fire (dps) and
 * shove (impulsePerHit, the physics-kill currency). Both spares take the SAME slot, so
 * mount scaling applies equally and the leaders hold in the next encounter. The numbers
 * are the defs' own; no range, homing, heat, or other capability is ever claimed, so the
 * screen cannot imply a fitting can do what it cannot. Null unless two or more spares
 * resolve to weapon defs carrying both figures — one comparison, everywhere else untouched.
 */
export function weaponSpareContrast(spares) {
  const entries = [];
  for (const spare of Array.isArray(spares) ? spares : []) {
    const def = spare && WEAPON_DEF_BY_ID.get(spare.defId);
    const dps = finiteNum(def && def.dps);
    const impulse = finiteNum(def && def.impulsePerHit);
    if (dps == null || impulse == null) continue;
    entries.push({ name: spare.name || prettyDefId(spare.defId), dps, impulse });
  }
  if (entries.length < 2) return null;
  if (entries.every((e) => e.dps === entries[0].dps && e.impulse === entries[0].impulse)) return null;
  let fire = entries[0];
  let shove = entries[0];
  for (const entry of entries) {
    if (entry.dps > fire.dps) fire = entry;
    if (entry.impulse > shove.impulse) shove = entry;
  }
  if (fire === shove) {
    return `${fire.name} leads sustained fire (${shortNum(fire.dps)} dps) and shove (impulse ${shortNum(fire.impulse)}).`;
  }
  return `Most sustained fire: ${fire.name} (${shortNum(fire.dps)} dps). `
    + `Hardest shove: ${shove.name} (impulse ${shortNum(shove.impulse)}).`;
}

/**
 * INF-036 drawn: two short scales under a hardpoint's weapon spares -- sustained fire and shove --
 * one tick per spare, the chosen one lit and read out. Null where fewer than two spares carry both
 * figures, and where there is no SVG (node tests); the sentence stays for the ear either way.
 */
function spareScales(spares) {
  if (typeof document === 'undefined' || typeof document.createElementNS !== 'function') return null;
  const entries = (Array.isArray(spares) ? spares : []).map((spare) => {
    const def = spare && WEAPON_DEF_BY_ID.get(spare.defId);
    return { id: String(spare && spare.instanceId), dps: finiteNum(def && def.dps), impulse: finiteNum(def && def.impulsePerHit) };
  }).filter((e) => e.dps != null && e.impulse != null);
  if (entries.length < 2) return null;
  const NS = 'http://www.w3.org/2000/svg';
  const node = (tag, attrs) => {
    const n = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
    return n;
  };
  const W = 300; const x0 = 62; const x1 = 222;
  const root = node('svg', { viewBox: `0 0 ${W} 58`, width: W, height: 58, class: 'orr-svg orr-hp__scales', 'aria-hidden': 'true' });
  const readouts = [];
  const ticks = [];
  [['dps', 'Fire', 17], ['impulse', 'Shove', 45]].forEach(([key, word, y]) => {
    const max = Math.max(...entries.map((e) => e[key])) || 1;
    const label = node('text', { x: 0, y: y + 4, class: 'orr-hp__scale-word' });
    label.textContent = word.toUpperCase();
    root.appendChild(label);
    // the track from zero to the best spare on this axis, its best figure at the end
    root.appendChild(node('path', { d: `M ${x0} ${y} L ${x1} ${y}`, class: 'orr-hp__track' }));
    root.appendChild(node('path', { d: `M ${x0} ${y - 4} L ${x0} ${y + 4}`, class: 'orr-hp__track-end' }));
    const top = node('text', { x: x1, y: y - 7, class: 'orr-hp__scale-max', 'text-anchor': 'end' });
    top.textContent = shortNum(max);
    root.appendChild(top);
    for (const e of entries) {
      const x = x0 + ((x1 - x0) * e[key]) / max;
      const tick = node('path', { d: `M ${x.toFixed(1)} ${y - 5} L ${x.toFixed(1)} ${y + 5}`, class: 'orr-hp__tick', 'data-id': e.id });
      ticks.push(tick);
      root.appendChild(tick);
    }
    const readout = node('text', { x: x1 + 12, y: y + 5, class: 'orr-hp__scale-val' });
    const delta = node('tspan', { class: 'orr-hp__scale-delta', dx: 6 });
    readouts.push([readout, delta, key]);
    root.appendChild(readout);
  });
  return {
    el: root,
    update(chosenId) {
      const chosen = entries.find((e) => e.id === String(chosenId)) || entries[0];
      for (const t of ticks) {
        const on = t.getAttribute('data-id') === chosen.id;
        t.classList.toggle('is-chosen', on);
        // the chosen mark stands taller than the rest
        const d = t.getAttribute('d').split(' ');
        const y = (Number(d[2]) + Number(d[5])) / 2;
        t.setAttribute('d', `M ${d[1]} ${y - (on ? 7 : 5)} L ${d[4]} ${y + (on ? 7 : 5)}`);
      }
      for (const [readout, delta, key] of readouts) {
        const best = Math.max(...entries.filter((e) => e !== chosen).map((e) => e[key]));
        const diff = chosen[key] - best;
        readout.textContent = shortNum(chosen[key]);
        delta.textContent = diff === 0 ? '' : `${diff > 0 ? '+' : '−'}${shortNum(Math.abs(diff))}`;
        readout.appendChild(delta);
      }
    },
  };
}

/** An SVG node, or null where there is no SVG (node tests). */
function svgNode(tag, attrs = {}) {
  if (typeof document === 'undefined' || typeof document.createElementNS !== 'function') return null;
  const n = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  return n;
}

/**
 * The armory reading's comparison: a weapon offer against the weapon it would replace, on the two
 * axes combat pays (sustained fire, shove). The offer's mark is lit and taller, the fitted one a
 * bone notch, the difference in ice. Null for anything that is not a weapon-for-weapon swap.
 */
function offerCompare(offer, best = {}) {
  const def = offer && WEAPON_DEF_BY_ID.get(offer.defId);
  if (!def) return null;
  const fitted = offer.replaces ? WEAPON_DEF_BY_ID.get(offer.replaces) : null;
  const root = svgNode('svg', { viewBox: '0 0 360 64', width: 360, height: 64, class: 'orr-svg orr-armory-compare', 'aria-hidden': 'true' });
  if (!root) return null;
  const x0 = 70; const x1 = 290;
  [['dps', 'Fire', 20], ['impulsePerHit', 'Shove', 50]].forEach(([key, word, y]) => {
    const mine = finiteNum(def[key]);
    if (mine == null) return;
    const theirs = fitted ? finiteNum(fitted[key]) : null;
    const max = Math.max(mine, theirs || 0, Number(best[key]) || 0) || 1;
    const label = svgNode('text', { x: 0, y: y + 4, class: 'orr-armory-compare__word' });
    label.textContent = word.toUpperCase();
    root.appendChild(label);
    root.appendChild(svgNode('path', { d: `M ${x0} ${y} L ${x1} ${y}`, class: 'orr-armory-compare__track' }));
    root.appendChild(svgNode('path', { d: `M ${x0} ${y - 4} L ${x0} ${y + 4}`, class: 'orr-armory-compare__track' }));
    if (theirs != null) {
      const tx = x0 + ((x1 - x0) * theirs) / max;
      root.appendChild(svgNode('path', { d: `M ${tx.toFixed(1)} ${y - 5} L ${tx.toFixed(1)} ${y + 5}`, class: 'orr-armory-compare__fitted' }));
    }
    const mx = x0 + ((x1 - x0) * mine) / max;
    root.appendChild(svgNode('path', { d: `M ${x0} ${y} L ${mx.toFixed(1)} ${y}`, class: 'orr-armory-compare__fill' }));
    root.appendChild(svgNode('path', { d: `M ${mx.toFixed(1)} ${y - 7} L ${mx.toFixed(1)} ${y + 7}`, class: 'orr-armory-compare__mark' }));
    const val = svgNode('text', { x: x1 + 12, y: y + 5, class: 'orr-armory-compare__val' });
    val.textContent = shortNum(mine);
    if (theirs != null && theirs !== mine) {
      const d = svgNode('tspan', { dx: 6, class: 'orr-armory-compare__delta' });
      d.textContent = `${mine > theirs ? '+' : '\u2212'}${shortNum(Math.abs(mine - theirs))}`;
      val.appendChild(d);
    }
    root.appendChild(val);
  });
  return root;
}

/**
 * The run wallet as a gauge: what it holds, the price lifted out of it in the lamp (or in red past
 * its end when the wallet is short), and what would be left.
 */
function budgetGauge(wallet, price) {
  const root = svgNode('svg', { viewBox: '0 0 360 58', width: 360, height: 58, class: 'orr-svg orr-armory-budget', 'aria-hidden': 'true' });
  if (!root) return null;
  const x0 = 0; const x1 = 300; const y = 26;
  const w = Math.max(0, Number(wallet) || 0);
  const p = Math.max(0, Number(price) || 0);
  const scale = Math.max(w, p, 1);
  const at = (v) => x0 + ((x1 - x0) * v) / scale;
  root.appendChild(svgNode('path', { d: `M ${x0} ${y} L ${x1} ${y}`, class: 'orr-armory-budget__track' }));
  const left = w - p;
  if (left >= 0) {
    root.appendChild(svgNode('path', { d: `M ${x0} ${y} L ${at(left).toFixed(1)} ${y}`, class: 'orr-armory-budget__keep' }));
    root.appendChild(svgNode('path', { d: `M ${at(left).toFixed(1)} ${y} L ${at(w).toFixed(1)} ${y}`, class: 'orr-armory-budget__spend' }));
  } else {
    root.appendChild(svgNode('path', { d: `M ${x0} ${y} L ${at(w).toFixed(1)} ${y}`, class: 'orr-armory-budget__keep' }));
    root.appendChild(svgNode('path', { d: `M ${at(w).toFixed(1)} ${y} L ${at(p).toFixed(1)} ${y}`, class: 'orr-armory-budget__short' }));
  }
  root.appendChild(svgNode('path', { d: `M ${at(w).toFixed(1)} ${y - 9} L ${at(w).toFixed(1)} ${y + 9}`, class: 'orr-armory-budget__end' }));
  const top = svgNode('text', { x: at(w).toFixed(1), y: y - 13, 'text-anchor': 'middle', class: 'orr-armory-budget__word' });
  top.textContent = `WALLET ${w} CR`;
  root.appendChild(top);
  const under = svgNode('text', { x: x0, y: y + 26, class: 'orr-armory-budget__read' });
  under.textContent = left >= 0 ? `COSTS ${p} CR \u00b7 LEAVES ${left} CR` : `SHORT ${-left} CR`;
  if (left < 0) under.setAttribute('class', 'orr-armory-budget__read is-short');
  root.appendChild(under);
  return root;
}

/** One refit row, in words. `options` is every spare that legally fits this hardpoint. */
export function refitRowLines(row) {
  if (!row) return null;
  const slotIndex = Number.isInteger(row.slotIndex) ? row.slotIndex : 0;
  const label = `Hardpoint ${slotIndex + 1}`;
  // What kind of hardpoint it is: the reason a spare does or does not go in it.
  const slotWord = SLOT_WORD[row.slotType] || null;
  const slotTag = slotWord ? `${slotWord}${row.slotSize ? ' ' + row.slotSize : ''}` : '';
  if (row.defId) {
    return {
      label,
      slotTag,
      value: row.name || fittingName(row.defId),
      valueRef: String(row.defId).startsWith('mod_') ? 'module:' + row.defId : null,
      action: 'Strip',
      disabled: false,
      options: [],
      contrast: null,
      description: arsenalIdentity(row.defId)?.sentence
        || catalogBlurbFor(WEAPON_DEF_BY_ID.get(row.defId) || MODULES.find(def => def.id === row.defId)),
    };
  }
  const spares = Array.isArray(row.spares) ? row.spares : [];
  const options = spares.map((spare) => ({
    instanceId: spare.instanceId,
    label: spareOptionLabel(spare),
  }));
  return {
    label,
    slotTag,
    value: row.intrinsicDefId ? `${row.intrinsicName || fittingName(row.intrinsicDefId)} — built in; fitting a spare replaces it`
      : options.length ? '' : 'Empty — no spare in the run inventory fits it',
    action: 'Fit',
    disabled: options.length === 0,
    options,
    contrast: weaponSpareContrast(spares),
  };
}

/**
 * The extraction settlement preview (INF-033). DOM-free so a check can assert the wording
 * without a screen: what leaving secures, what flying on risks, and which amounts are
 * run-only. Every figure is read straight from the live run — the same figures the results
 * plate settles (`resultRows` in crucible.js records run.score / run.credits / run.wave) —
 * so the confirmed outcome matches the preview exactly. Run credits never become campaign
 * credits anywhere in the sim, hence the run-only line; and the shop spends the run wallet,
 * hence the risk line. Null when there is no survival run to settle.
 */
export function extractionPreviewLines(run) {
  if (!run || typeof run !== 'object' || run.kind !== 'survival') return null;
  const score = Number.isInteger(run.score) && run.score > 0 ? run.score : 0;
  const salvage = Number.isInteger(run.credits) && run.credits > 0 ? run.credits : 0;
  const wave = Number.isInteger(run.wave) && run.wave > 0 ? run.wave : 0;
  // Swarm counts rounds everywhere else on screen (the armory, the launch key, the results hero).
  const unit = run.ruleset === 'swarm' ? 'round' : 'wave';
  const banked = securedBountyOf(run);
  return {
    secured: `Keeps score ${score}, salvage ${salvage} cr and ${unit} ${wave} — recorded as the run's final result.`,
    risk: `Fly on to ${unit} ${wave + 1}: the shop spends salvage, and death ends the run where it falls.`,
    amounts: 'Salvage and score are run-only — never campaign credits.'
      + (banked > 0 ? ` ${banked} cr already sits in the hangar chest — banked salvage cannot be lost.` : ''),
  };
}

/**
 * What each refit key does, in words, for the run as it stands. DOM-free so a check can pin it.
 *
 * The close key goes where the run machine sends it, not where its label says: on the arc's last
 * wave (the Gauntlet's wave 30) a closed refit is VICTORY. That key used to read "Launch next
 * round" beside "Continue — keep going", so the key promising a round ended the run, and the one
 * that did launch wave 31 sounded like its twin. The destination is asked of survivalRun itself,
 * so these words and the phase machine cannot disagree.
 *
 * On that last wave Extract is withdrawn: it would end the same run as "extracted", which is the
 * win with a worse name. Extraction stays legal on the bus; it is just not offered as a third way
 * to stop. Continue is only ever offered where canContinueSurvivalEndless allows it.
 */
export function refitFootLines(run) {
  const r = run && typeof run === 'object' && !Array.isArray(run) ? run : {};
  const wave = Number.isInteger(r.wave) && r.wave > 0 ? r.wave : 0;
  if (r.phase === 'draft') {
    // The swarm armory's "Rearrange loadout" opened this screen over the open draft.
    return {
      primary: 'Back to armory', primaryNote: '', finishes: false,
      cont: '', contNote: '', extract: '', extractNote: '', bank: '', bankNote: '',
    };
  }
  let finishes = false;
  try { finishes = r.phase === 'refit' && survivalRun._isLastWave(r) === true; } catch { finishes = false; }
  const unit = r.ruleset === 'swarm' ? 'round' : 'wave';
  const extractOk = !finishes && canExtract(r);
  const contOk = canContinueSurvivalEndless({ run: r });
  const preview = extractOk ? extractionPreviewLines(r) : null;
  // The window's middle seat (partialBankOffer shares the extraction gate): secure half the
  // purse in the hangar chest and fly on with the rest still at risk. No purse, no offer —
  // a dead button is never drawn.
  const offer = extractOk ? partialBankOffer(r) : null;
  return {
    primary: finishes ? 'Take the win' : `Launch ${unit} ${wave + 1}`,
    primaryNote: finishes
      ? `Ends the run here as a clear — wave ${wave}, score ${Number.isInteger(r.score) ? r.score : 0}.`
      : (preview ? preview.risk : ''),
    finishes,
    cont: contOk ? 'Keep going — endless waves' : '',
    contNote: contOk
      ? `Wave ${wave + 1} and on, with no finish line. Death ends the run where it falls.`
      : '',
    extract: extractOk ? 'Extract — end the run here' : '',
    extractNote: preview ? `${preview.secured} ${preview.amounts}` : '',
    bank: offer ? `Bank ${offer.amount} cr, keep flying` : '',
    bankNote: offer
      ? `${offer.amount} cr moves to the hangar chest now — it cannot be lost. `
        + `${offer.remaining} cr stays in the purse: the shop still spends it, and death still halves it.`
      : '',
  };
}

/**
 * SWARM-08 B5 — the Circuit panel's words. DOM-free so a check can pin the route diagram and the
 * finale wording without mounting a screen. Ordinary Swarm exposes entry only at its opening.
 */
export function circuitPanelLines(run) {
  const error = circuitStateError(run);
  const choices = circuitChoicesFor(run);
  const route = circuitRouteView(run);
  if (!route) return error || choices.length ? {
    heading: 'The Circuit',
    status: error || 'Sixteen rounds, four stages, four champions. Choose Circuit or launch ordinary Swarm.',
    next: null, choices, stages: [],
  } : null;
  const circuit = circuitFor(run);
  const wave = run && Number.isInteger(run.wave) ? run.wave : 0;
  const round = circuitRoundFor(run, wave + 1);
  const boss = round && round.bossId ? circuitBossFor(round.bossId) : null;
  let next = null;
  if (circuit.status === 'overtime') {
    next = `Overtime — round ${wave + 1} and on. The Circuit is already yours.`;
  } else if (round && circuit.status !== 'route' && circuit.status !== 'finale') {
    const objectiveLine = round.kind === 'survive'
      ? 'survive sixty seconds'
      : round.kind === 'defend'
        ? 'defend the beacon'
      : round.kind === 'escort'
        ? 'escort the freighter'
      : round.kind === 'boss'
        ? (boss ? boss.label : 'a champion')
        : round.kind === 'nodes'
          ? 'destroy the hive nodes'
          : round.kind === 'hold'
            ? 'hold the zone'
            : round.kind === 'collect'
              ? 'collect the cores'
              : round.kind === 'commander'
                ? `assassinate ${round.commanderName || 'the commander'}`
                : round.kind === 'reach'
                  ? 'reach the gate'
                  : 'break the pack';
    next = `Next — stage ${round.stage}, round ${round.localRound}: ${objectiveLine}.`;
  }
  const openService = circuit.service
    ? CIRCUIT_SERVICES.find((svc) => svc.id === circuit.service.id)
    : null;
  const status = circuit.card
    ? CIRCUIT_EVENT.line
    : openService
      ? openService.line
    : circuit.status === 'route'
    ? `Stage ${circuit.clearedStages} cleared. Choose where stage ${circuit.clearedStages + 1} fights.`
    : circuit.status === 'finale'
      ? 'Four stages cleared. Finish the Circuit, or keep the build and fly into Overtime.'
      : circuit.status === 'overtime'
        ? 'Overtime — endless rounds from here.'
        : circuit.status === 'completed'
          ? 'Circuit complete.'
          : `Stage ${Math.min(CIRCUIT_STAGE_COUNT, circuit.clearedStages + 1)} of ${CIRCUIT_STAGE_COUNT}. Four rounds a stage; the fourth is its champion.`;
  return {
    heading: 'The Circuit',
    status,
    next,
    choices: choices.map((choice) => ({
      id: choice.id, kind: choice.kind, label: choice.label, line: choice.line,
      fight: choice.fight || null, node: choice.node || null,
    })),
    stages: route.stages.map((stage) => ({
      stage: stage.stage,
      label: stage.label,
      status: stage.status,
      boss: stage.boss ? stage.boss.label : null,
    })),
  };
}

/** SWARM-04 §6.5 — the next-round sentence shared by the armory and the refit bench. */
const SWARM_ENEMY_NAME_BY_ID = new Map(ENEMY_TYPES.map((enemy) => [enemy.id, enemy.name]));

function canForecastOrdinarySwarm(run) {
  if (!run || run.ruleset !== 'swarm' || circuitStateError(run)) return false;
  const circuit = circuitFor(run);
  // The finite Circuit has its own authored objective panel. After its sixteen rounds,
  // circuitRoundFor returns null and survivalRun deliberately plans ordinary Swarm again.
  return !circuit || circuit.status === 'overtime';
}

/**
 * The shared shop next-round model. The zone and event are authored by the ladder; the values that
 * change with a player's choices come from the same pure planner and the same inputs the run
 * owner will use. It consumes only the planner's private, seeded RNG — never state.rng — and
 * writes nothing back to the run. A malformed or unplannable run has no forecast, not a plausible
 * looking base-ladder guess.
 */
export function swarmForecastForRun(run, nextWave) {
  if (!canForecastOrdinarySwarm(run) || !Number.isInteger(nextWave) || nextWave < 1) return null;
  try {
    const plan = planWave({
      seed: run.seed,
      arenaId: run.arenaId,
      wave: nextWave,
      act: 0,
      difficulty: difficultyForWave(nextWave),
      mutators: normalizeMutators(run.arenaMutators),
      buildSummary: summarizeRunBuild(run.modifiers),
      mode: 'swarm',
      ruleset: run.ruleset,
      swarmStake: run.telemetry && typeof run.telemetry.swarmStake === 'string'
        ? run.telemetry.swarmStake : null,
      swarmThreats: Array.isArray(run.telemetry?.threats) ? run.telemetry.threats : null,
      // Ordinary Swarm is the only caller. A Circuit's next objective belongs to its own route.
      circuitRound: null,
    });
    const swarm = plan && plan.swarm;
    if (!plan || plan.ok === false || plan.error || !swarm
      || !Number.isInteger(swarm.killTarget) || swarm.killTarget <= 0
      || !Number.isInteger(swarm.concurrent) || swarm.concurrent <= 0) return null;

    const authored = swarmRoundPreview({ arenaId: run.arenaId, wave: nextWave, seed: run.seed });
    if (!authored || !authored.zone || typeof authored.zone.name !== 'string') return null;
    const roster = [...new Set((Array.isArray(swarm.roster) ? swarm.roster : [])
      .filter((entry) => entry && (Number(entry.weight) || 0) > 0)
      .map((entry) => SWARM_ENEMY_NAME_BY_ID.get(entry.enemyId))
      .filter((name) => typeof name === 'string' && name.length > 0))];
    return {
      ...authored,
      killTarget: swarm.killTarget,
      concurrent: swarm.concurrent,
      roster,
      newcomer: typeof swarm.newcomer?.name === 'string' ? swarm.newcomer.name : null,
      boss: swarm.boss === true && typeof swarm.bossLabel === 'string'
        ? { label: swarm.bossLabel } : null,
    };
  } catch {
    // A bad or stale saved run must not crash a shop to show a fabricated base forecast.
    return null;
  }
}

/** One no-admissions-promised forecast sentence shared by the Armory and Refit surfaces. */
export function swarmNextLine(next) {
  if (!next) return '';
  const bits = [
    `Round ${next.wave} — ${next.zone.name}`,
    `clear ${next.killTarget}`,
    `room cap ${next.concurrent}`,
  ];
  if (next.roster.length) bits.push(next.roster.join(', '));
  if (next.newcomer) bits.push(`new: ${next.newcomer}`);
  if (next.event) bits.push(`${next.event.name} — ${next.event.telegraph}`);
  if (next.boss) bits.push(`boss: ${next.boss.label}`);
  return `Next — ${bits.join(' · ')}`;
}

/** The shared read-only preview painter. Circuit owns its own next-round language. */
function paintSwarmPreview(node, run, nextWave) {
  if (!node) return '';
  const text = canForecastOrdinarySwarm(run)
    ? swarmNextLine(swarmForecastForRun(run, nextWave))
    : '';
  node.textContent = text;
  node.hidden = !text;
  return text;
}

const ARMORY_RESULT_REFRESH_EVENTS = Object.freeze([
  'run:draftOffered',
  'run:draftPickRejected',
  'run:draftRerollRejected',
  'run:draftLockChanged',
  'run:shopPurchased',
  'module:equipped',
  'module:unequipped',
  ['run:spendRejected', (payload) => payload?.reason === CRUCIBLE_PURCHASE_SPEND_REASON
    || payload?.reason === CRUCIBLE_REROLL_SPEND_REASON],
  ['run:awarded', (payload) => payload?.reason === 'crucible:purchaseRefund'],
]);

const REFIT_RESULT_REFRESH_EVENTS = Object.freeze([
  'run:refitChanged',
  'run:partialBanked',
  ['run:spendRejected', (payload) => payload?.reason === 'partial_bank'],
  ['run:awarded', (payload) => payload?.reason === 'partial_bank_refund'],
]);

function unbindScreenResultRefresh(screen) {
  screen._resultRefreshVersion = (screen._resultRefreshVersion || 0) + 1;
  for (const off of screen._resultRefreshUnsubs || []) {
    try { off(); } catch { /* an already-released bus is a closed screen */ }
  }
  screen._resultRefreshUnsubs = [];
  screen._resultRefreshBus = null;
  screen._resultRefreshQueued = null;
}

/** Bind one visible screen to canonical worker receipts; the read model lands before replay. */
function bindScreenResultRefresh(screen, ctx, subscriptions) {
  unbindScreenResultRefresh(screen);
  const bus = ctx && ctx.bus;
  if (!bus || typeof bus.on !== 'function') return;
  const version = screen._resultRefreshVersion;
  screen._resultRefreshBus = bus;
  screen._resultRefreshUnsubs = [];
  const defer = typeof queueMicrotask === 'function'
    ? queueMicrotask
    : (callback) => Promise.resolve().then(callback);
  const queueRefresh = () => {
    if (screen._suppressIntentResultRefresh > 0) return;
    if (screen._resultRefreshQueued && screen._resultRefreshQueued.version === version) return;
    const ticket = { version };
    screen._resultRefreshQueued = ticket;
    defer(() => {
      if (screen._resultRefreshQueued !== ticket) return;
      screen._resultRefreshQueued = null;
      if (screen._resultRefreshVersion !== version || screen._resultRefreshBus !== bus) return;
      const current = screen._ctx;
      if (!current || current.bus !== bus) return;
      screen.refresh(current);
    });
  };
  for (const entry of subscriptions) {
    const [type, accepts] = Array.isArray(entry) ? entry : [entry, null];
    const off = bus.on(type, (payload) => {
      if (typeof accepts === 'function' && !accepts(payload)) return;
      queueRefresh();
    });
    if (typeof off === 'function') screen._resultRefreshUnsubs.push(off);
  }
}

/** Preserve the immediate main-thread read while allowing a later worker receipt to repaint. */
function emitIntentAndRefresh(screen, ctx, event, payload) {
  const bus = ctx && ctx.bus;
  if (!bus || typeof bus.emit !== 'function') return;
  screen._suppressIntentResultRefresh = (screen._suppressIntentResultRefresh || 0) + 1;
  try { bus.emit(event, payload); }
  finally { screen._suppressIntentResultRefresh -= 1; }
  screen.refresh(ctx);
}

export const crucibleDraftScreen = {
  id: 'crucibleDraft',
  // Locked: the run is paused on this choice, and Escape must not leave the phase machine
  // waiting on a receipt that will never arrive.
  data: { locked: true },

  mount(rootEl, ctx) {
    this._ctx = ctx;
    this._root = rootEl;
    rootEl.innerHTML = '';
    rootEl.classList.add('k-screen', 'k-screen--stage', 'sf-crucible', 'sf-crucible-draft');
    // ORRERY (design/frontend/ORRERY.md §6 Crucible): the composition sheet de-cards the offers.
    injectOrreryScreens();
    rootEl.classList.add('orr-crucible');
    rootEl.dataset.kReady = '0';
    rootEl.dataset.stamp = 'CRUCIBLE / REARM';
    rootEl.setAttribute('role', 'dialog');
    rootEl.setAttribute('aria-modal', 'true');
    rootEl.setAttribute('aria-labelledby', 'sf-crucible-draft-title');

    // .k-title — "Rearm" and the sub sentence (refresh writes it: which wave, and what a pick does).
    const title = el('header', 'k-title');
    const h = el('h1', 'k-display k-t-title', 'Rearm');
    this._title = h;
    h.id = 'sf-crucible-draft-title';
    title.appendChild(h);
    const sub = el('p', 'k-t-emph k-62 sf-cru-sub', '');
    title.appendChild(sub);
    // SWARM-04 §6.5 — the next-round preview: body count, archetypes, any newcomer, the event
    // card, the boss. Buying becomes counter-planning when the fight coming is on the same
    // screen as the shelf. The armory alone carries it; the gauntlet's Rearm stays quiet.
    const preview = el('p', 'k-sentence sf-cru-preview', '');
    preview.hidden = true;
    title.appendChild(preview);
    // SWARM-05 §7.3 — the hull being flown is the armory's context, a status line under the
    // title, never a zero-price card at the top of the shelf. The other manifest hulls still
    // list — as Switch rows, priced by what a switch costs (nothing).
    const cradle = el('p', 'k-t-fine sf-cru-cradle', '');
    cradle.hidden = true;
    title.appendChild(cradle);
    rootEl.appendChild(title);
    this._sub = sub;
    this._preview = preview;
    this._cradle = cradle;

    // .k-stage — the three offers across on the sky, then the one status line.
    const stage = el('section', 'k-stage sf-cru-stage');
    const filters = el('div', 'k-words k-words--row sf-cru-filters');
    filters.setAttribute('role', 'group');
    filters.setAttribute('aria-label', 'Armory category');
    this._category = 'All';
    // The shelves the whole sandbox stocks — generated catalog rows file under the same
    // words as authored cards (offer.category is stamped at draw time).
    for (const category of ARMORY_CATEGORIES) {
      const button = word(category, 'k-word--fine');
      button.dataset.category = category;
      button.addEventListener('click', () => { this._category = category; this.refresh(ctx); });
      filters.appendChild(button);
    }
    // A hundred-and-forty-deep shelf needs a name filter, not just a shelf picker.
    const search = el('input', 'sf-cru-search');
    search.type = 'search';
    search.placeholder = 'Search the armory…';
    search.setAttribute('aria-label', 'Search the armory');
    this._query = '';
    search.addEventListener('input', () => { this._query = search.value || ''; this.refresh(ctx); });
    filters.appendChild(search);
    this._search = search;
    this._filters = filters;
    stage.appendChild(filters);
    // the category words ride a ruled line with the amber index under the open one
    this._filterRow = createStationRow({ row: filters });
    const cards = el('div', 'sf-cru-cards');
    cards.setAttribute('role', 'group');
    cards.setAttribute('aria-label', 'Offers');
    stage.appendChild(cards);
    this._cards = cards;

    // One line for everything that went wrong, announced politely rather than shouted. A refused
    // pick, a refused re-roll and an unaffordable price all land here.
    const note = el('p', 'k-sentence sf-cru-note', '');
    note.setAttribute('role', 'status');
    note.setAttribute('aria-live', 'polite');
    stage.appendChild(note);
    this._note = note;
    rootEl.appendChild(stage);

    // SWARM-08 B5 — the Circuit panel. It offers entry, then shows the route as four stage
    // positions, the choice owed right now (enter, destination, finish or Overtime), and the
    // one-line read on the round coming. Reserve space inside the shelf's flex column rather
    // than adding a second root grid stage. Long route choices scroll within their own share
    // of the column so the filters and shopping rail remain reachable.
    const circuitPanel = el('section', 'sf-cru-circuit');
    Object.assign(circuitPanel.style, { flex: '0 0 auto', maxHeight: '40%', overflow: 'auto' });
    circuitPanel.hidden = true;
    circuitPanel.setAttribute('aria-label', 'The Circuit');
    const circuitHead = el('h2', 'k-t-emph sf-cru-circuit__head', 'The Circuit');
    const circuitStatus = el('p', 'k-sentence sf-cru-circuit__status', '');
    const circuitGraphic = el('div', 'orr-circuit-route');
    circuitGraphic.setAttribute('aria-hidden', 'true');
    const circuitRoute = el('p', 'k-t-fine sf-cru-circuit__route', '');
    const circuitNext = el('p', 'k-sentence sf-cru-circuit__next', '');
    const circuitChoices = el('ul', 'k-words k-words--row sf-cru-circuit__choices');
    circuitChoices.setAttribute('aria-label', 'Circuit choices');
    circuitPanel.append(circuitHead, circuitStatus, circuitGraphic, circuitRoute, circuitNext, circuitChoices);
    stage.insertBefore(circuitPanel, filters);
    this._circuit = {
      el: circuitPanel,
      status: circuitStatus,
      graphic: circuitGraphic,
      route: circuitRoute,
      next: circuitNext,
      choices: circuitChoices,
    };

    // ORRERY §6 armory: the offers stand on a rail; the one under the pointer or focus is read out
    // beside it -- its words, where it goes on the ship, how it compares, what it leaves in the
    // wallet. The inspector and its explicit purchase/demo controls are fully accessible.
    this._reading = null;
    if (typeof document !== 'undefined' && typeof document.createElementNS === 'function') {
      const reading = el('aside', 'orr-armory-reading');
      reading.setAttribute('aria-label', 'Equipment details');
      const parts = {
        verb: el('p', 'orr-armory-reading__verb', ''),
        name: el('h2', 'orr-armory-reading__name', ''),
        blurb: el('p', 'orr-armory-reading__blurb', ''),
        act: el('p', 'orr-armory-reading__act', ''),
        jig: el('div', 'orr-armory-reading__jig'),
        compare: el('div', 'orr-armory-reading__compare'),
        budget: el('div', 'orr-armory-reading__budget'),
        buy: el('p', 'orr-armory-reading__buy', ''),
        demo: el('p', 'orr-armory-reading__demo', ''),
        hold: el('p', 'orr-armory-reading__hold', ''),
      };
      const words = el('div', 'orr-armory-reading__words');
      words.append(parts.verb, parts.name, parts.blurb, parts.act, parts.compare, parts.budget, parts.buy, parts.demo, parts.hold);
      reading.append(parts.jig, words);
      rootEl.appendChild(reading);
      this._reading = { el: reading, parts, jig: createSlotJig({ host: parts.jig }), offerId: null };
      cards.addEventListener('focusin', (event) => this._readFrom(event));
      this._visualArmory = createVisualArmory({ root: rootEl, reading, parts,
        onPurchase: () => this._purchaseSelected(this._ctx) });
      const railScale = el('div', 'orr-rail-scale');
      railScale.setAttribute('aria-hidden', 'true');
      const track = el('div', 'orr-rail-scale__track');
      track.appendChild(el('div', 'orr-rail-scale__thumb'));
      railScale.append(track, el('p', 'orr-rail-scale__words', ''));
      stage.appendChild(railScale);
      this._railScale = railScale;
      cards.addEventListener('scroll', () => { this._syncRailScale(); this._syncRailClipFade(); }, { passive: true });
    }
    // The rail's compact voice follows the same breakpoint as its stylesheet: crossing it
    // re-reads the verbs (dictionary or full), and any resize re-clips the fold to whole rows.
    if (typeof matchMedia === 'function') {
      try {
        const railMq = matchMedia('(max-width: 1500px)');
        if (railMq && typeof railMq.addEventListener === 'function') {
          this._railMq = railMq;
          this._onRailChange = () => this.refresh(this._ctx);
          railMq.addEventListener('change', this._onRailChange);
        }
      } catch { /* full verbs on a box without media queries */ }
    }
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      this._onRailResize = () => this._clipRailToWholeRows();
      window.addEventListener('resize', this._onRailResize);
    }
    // Row heights settle with the display face: re-clip once it arrives, or the fold lands mid-row.
    if (typeof document !== 'undefined' && document.fonts && document.fonts.ready
      && typeof document.fonts.ready.then === 'function') {
      document.fonts.ready.then(() => this._clipRailToWholeRows());
    }

    // .k-foot — Keep current loadout, Re-roll (with the wallet beside it), the keys in fine print.
    const foot = el('footer', 'k-foot sf-cru-foot');
    const words = el('ul', 'k-words k-words--row');
    words.setAttribute('aria-label', 'Rearm');
    const skip = addWord(words, word('Keep current loadout', 'k-word--emph'));
    skip.addEventListener('click', () => {
      // A Circuit that owes a destination (or the finale) refuses the launch and says why; the
      // press is not swallowed by a dead button.
      if (this._circuitGate(ctx)) return;
      // The render lane warms the next wave's newcomers behind this surface; launching
      // before that batch links would pay its program links inside the round. The dwell
      // is player-paced so the promise has normally already settled and this emits
      // immediately — the button only shows a hold when the player out-clicks a compile
      // that is still running.
      const warm = ctx.state && ctx.state.render && ctx.state.render.swarmDeferredWarm;
      if (warm && warm.pending === true && warm.promise && typeof warm.promise.then === 'function') {
        if (this._warmHold === true) return;
        this._warmHold = true;
        skip.disabled = true;
        skip.setAttribute('aria-disabled', 'true');
        setKeyLabel(skip, 'Readying the field…', 'Esc', 'Escape');
        // Bounded: a compile that never settles must not strand the player in the armory.
        Promise.race([
          Promise.resolve(warm.promise).catch(() => null),
          new Promise((resolve) => setTimeout(resolve, 10000)),
        ]).then(() => {
          this._warmHold = false;
          // The run could have ended while the batch settled — a stale emit must not
          // resolve a draft that no longer waits on an answer.
          if (ctx.state && ctx.state.run && ctx.state.run.phase === 'draft') {
            ctx.bus.emit('run:draftPickRequested', { offerId: null });
          }
        });
        return;
      }
      ctx.bus.emit('run:draftPickRequested', { offerId: null });
    });
    this._skip = skip;
    const refit = addWord(words, word('Rearrange loadout', 'k-word--emph'));
    refit.addEventListener('click', () => ctx.bus.emit('ui:pushScreen', { id: 'crucibleRefit' }));
    this._refitBtn = refit;
    this._fortifyBtn = appendFortifyWord(words, ctx);

    // The run wallet is filled by physical chips the player chased down. This is the one place it
    // buys something, so this is where the balance has to be legible.
    const reroll = addWord(words, word('Re-roll', 'k-word--emph'));
    reroll.addEventListener('click', () => this._requestReroll(ctx));
    this._rerollBtn = reroll;
    foot.appendChild(words);

    const fine = el('p', 'k-t-fine k-38 sf-cru-fine');
    const wallet = el('span', 'sf-cru-wallet', '');
    fine.appendChild(wallet);
    this._wallet = wallet;
    const hint = el('span', 'sf-cru-hint', '');
    fine.appendChild(hint);
    this._hint = hint;
    foot.appendChild(fine);
    rootEl.appendChild(foot);

    // The run is fully paused on this choice, so it must be answerable from the keyboard: 1/2/3
    // pick, arrows move, R buys another draw, Escape keeps the current loadout. Escape is
    // otherwise dead here (the screen is locked so the manager will not pop it), which would
    // leave a paused player with a key that does nothing.
    rootEl.addEventListener('keydown', (event) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      // While the search field owns the keyboard, the rails' keys stand down: typing 'r'
      // must not re-roll, and Escape backs out of the field first, the shop second.
      const inSearch = event.target === this._search;
      if (inSearch && event.key === 'Escape') {
        event.preventDefault();
        this._search.value = '';
        this._query = '';
        this._search.blur();
        this.refresh(ctx);
        return;
      }
      const all = [...cards.querySelectorAll('.sf-cru-card')];
      const index = '123'.indexOf(event.key);
      if (!inSearch && index >= 0 && all[index]) {
        event.preventDefault();
        // A card click can resolve the draft and pop this screen inside THIS keydown (Gauntlet
        // picks); the same event must not then fall through to flight, where 1/2/3 are live
        // ordnance keys.
        event.stopPropagation();
        all[index].click();
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        // The skip resolves the draft and pops this screen synchronously, so the SAME keydown
        // would reach the document-level flight handler with no modal open and Escape would
        // also push Pause — one key, two consequences. Own it here end to end.
        event.stopPropagation();
        // In the armory Esc is a way out, not a launch: while the wallet still buys something on
        // the shelf, the first press spends itself on a warning and the second one goes.
        if (this._guardLaunch(ctx)) return;
        skip.click();
        return;
      }
      if (inSearch) return;
      // Not reroll.click(): the button is drawn dead when the price is out of reach, and a dead
      // button swallows a click. The owner is the authority on the refusal either way, and the
      // player gets told why instead of nothing happening.
      if (event.key === 'r' || event.key === 'R') {
        event.preventDefault();
        this._requestReroll(ctx);
        return;
      }
      if (['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        const here = all.indexOf(document.activeElement);
        if (here < 0 || all.length === 0) return;
        event.preventDefault();
        const step = ['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : -1;
        const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? all.length - 1 : (here + step + all.length) % all.length;
        const next = all[nextIndex];
        if (next && typeof next.focus === 'function') next.focus();
      }
    });

    this._regions = { title: h, stage, foot };
    // SWARM-08 B5 — the worker's acknowledgement of a Circuit choice re-publishes the draft
    // snapshot; repaint from that receipt rather than guessing at the main thread.
    this.refresh(ctx);
    // The door unit's composition sheet lands last in the mount so it wins the cascade against
    // the armory sheet (crucible-doorLayouts.js documents what it carries).
    injectCrucibleDoorLayouts(rootEl.ownerDocument || document);
    rootEl.dataset.kReady = '1';
  },

  onShow(ctx) {
    if (ctx) this._ctx = ctx;
    bindScreenResultRefresh(this, this._ctx, ARMORY_RESULT_REFRESH_EVENTS);
    this._visualArmory?.setActive(true);
    if (this._ctx) this.refresh(this._ctx);
    this._offCancel?.();
    this._offCancel = this._ctx?.bus.on('ui:cancel', () => {
      const ctx = this._ctx;
      if (ctx?.screenManager?.top() !== this.id) return;
      if (!this._guardLaunch(ctx)) this._skip?.click();
    });
    const r = this._regions;
    if (!r || !canAnimate()) return;
    cue('open');
    try {
      settle(r.stage, { from: 'left', delay: 60, state: 'crucibleDraft:open' });
      settle(r.foot, { from: 'bottom', delay: 120, state: 'crucibleDraft:open' });
    } catch { /* motion is cosmetic */ }
  },

  onHide() {
    this._offCancel?.();
    this._offCancel = null;
    unbindScreenResultRefresh(this);
    this._visualArmory?.setActive(false);
    if (canAnimate()) cue('close');
  },

  dispose() {
    this._offCancel?.();
    this._offCancel = null;
    unbindScreenResultRefresh(this);
    this._visualArmory?.dispose();
    this._purchaseArmed = true;
    this._purchasePending = false;
    this._reading?.jig?.dispose();
    this._filterRow?.dispose?.();
    if (this._pulseTimer) clearTimeout(this._pulseTimer);
    this._railMq?.removeEventListener?.('change', this._onRailChange);
    if (typeof window !== 'undefined' && this._onRailResize) window.removeEventListener?.('resize', this._onRailResize);
    this._reading = null;
    this._visualArmory = null;
    this._preview = null;
    this._ctx = null;
  },

  _requestReroll(ctx) {
    const context = ctx || this._ctx;
    if (!context || !context.bus) return;
    // Main-lane results land synchronously; worker-lane receipts repaint after their read model.
    this._emitIntentAndRefresh(context, 'run:draftRerollRequested', {});
  },

  /**
   * The armory's Escape guard. Esc (and a pad's B) used to launch the next round on the spot,
   * with whatever the player had not spent. In the swarm shop, while at least one drawn card is
   * still buyable, the first Esc only moves focus to Launch and says what is left to buy; the
   * second Esc — or a click or Enter on Launch, which never comes through here — goes. Nothing
   * buyable, or the Gauntlet's Rearm, behaves exactly as before. Returns true when this press
   * was spent on the warning and must not resolve the draft.
   */
  /** Four stage positions and the paths between them, drawn with the ORRERY vector helpers. */
  _paintCircuitRoute(stages) {
    const host = this._circuit && this._circuit.graphic;
    if (!host || typeof document === 'undefined' || typeof document.createElementNS !== 'function') return;
    host.textContent = '';
    if (!Array.isArray(stages) || stages.length === 0) return;
    const width = 420;
    const y = 26;
    const pad = 42;
    const gap = (width - pad * 2) / Math.max(1, stages.length - 1);
    const root = svg('svg', { viewBox: `0 0 ${width} 68`, width: '100%', height: 68, class: 'orr-svg orr-circuit-route__svg', role: 'presentation' });
    let prevX = null;
    stages.forEach((stage, index) => {
      const x = pad + gap * index;
      const tone = stage.status === 'future' ? 'rest' : 'hand';
      if (prevX != null) {
        root.appendChild(lightPath(`M ${prevX} ${y} L ${x} ${y}`, {
          tone, width: 1.2, bloom: 4, className: 'orr-circuit-route__path',
        }));
      }
      root.appendChild(svg('circle', {
        cx: x, cy: y, r: stage.status === 'current' ? 6 : 4.5,
        class: `orr-core orr-${tone} orr-circuit-route__node`,
        fill: 'none', 'stroke-width': 1.4,
      }));
      const label = svg('text', {
        x, y: y + 24, 'font-size': 9, 'text-anchor': 'middle',
        class: `orr-circuit-route__label orr-${tone}`, fill: 'currentColor',
      });
      label.textContent = `${stage.stage} ${stage.label}`;
      root.appendChild(label);
      prevX = x;
    });
    host.appendChild(root);
  },

  /**
   * SWARM-08 B5 — the owed choice as native buttons (keyboard activation comes free with the
   * button element), each followed by its destination's physical-law line. Kept separate from
   * refresh so a focused DOM check can exercise the real control path without mounting the shelf.
   */
  _paintCircuitChoices(context, choices) {
    if (!this._circuit) return;
    const list = this._circuit.choices;
    list.textContent = '';
    const rows = Array.isArray(choices) ? choices : [];
    for (const choice of rows) {
      const button = word(choice.label, choice.kind === 'finish' || choice.kind === 'start' ? 'k-word--emph' : 'k-word--fine');
      if (choice.line) button.title = choice.line;
      button.dataset.circuitChoice = choice.kind;
      button.addEventListener('click', () => context.bus.emit('run:draftPickRequested', { offerId: choice.id }));
      const item = el('li', 'sf-cru-circuit__choice');
      item.appendChild(button);
      // The destination's physical law is read BEFORE commitment, not discovered after it.
      if (choice.line) item.appendChild(el('span', 'k-t-fine sf-cru-circuit__line', choice.line));
      list.appendChild(item);
    }
    list.hidden = rows.length === 0;
  },

  _paintNextPreview(run, nextWave) {
    return paintSwarmPreview(this._preview, run, nextWave);
  },

  _emitIntentAndRefresh(context, event, payload) {
    emitIntentAndRefresh(this, context, event, payload);
  },

  /**
   * SWARM-08 B5 — a Circuit draft can owe a decision that is not a shop purchase: a destination
   * after a stage, or Finish/Overtime after the finale. The launch press says what is owed and
   * moves focus to the choice instead of doing nothing.
   */
  _circuitGate(ctx) {
    const run = ctx && ctx.state && ctx.state.run;
    const circuit = run ? circuitFor(run) : null;
    const error = circuitStateError(run);
    if (!error && (!circuit || (circuit.status !== 'route' && circuit.status !== 'finale'))) return false;
    const openService = circuit && circuit.service
      ? CIRCUIT_SERVICES.find((svc) => svc.id === circuit.service.id)
      : null;
    const text = error || (circuit.card
      ? CIRCUIT_EVENT.line
      : openService
        ? openService.line
        : circuit.status === 'route'
          ? 'Choose a destination before launching.'
          : 'Finish the Circuit or enter Overtime.');
    if (this._note) this._note.textContent = text;
    const first = this._circuit && this._circuit.choices
      ? this._circuit.choices.querySelector('button')
      : null;
    if (first && typeof first.focus === 'function') {
      try { first.focus(); } catch { /* focus is best-effort */ }
    }
    return true;
  },

  _guardLaunch(ctx) {
    const run = ctx && ctx.state && ctx.state.run;
    if (!run || run.ruleset !== 'swarm') return false;
    if (this._circuitGate(ctx)) return true;
    if (this._launchWarned === true) {
      this._launchWarned = false;
      return false;
    }
    const count = affordableOfferCount(this._drawnOffers);
    if (count < 1) return false;
    this._launchWarned = true;
    const text = launchGuardLine(count);
    this._flash = { text, until: Date.now() + 8000, guard: true };
    if (this._note) this._note.textContent = text;
    const skip = this._skip;
    if (skip && typeof skip.focus === 'function') {
      try { skip.focus(); } catch { /* focus is best-effort */ }
    }
    return true;
  },

  refresh(ctx) {
    // uiRoot repaints the open screen ~3x/sec as refresh(ctx, { periodic: true }); the draft
    // rebuilds its cards on every real change itself (pick, re-roll, filter, mount/onShow), so a
    // periodic pass only churns focus. Deliberate no-op. The signature stays `refresh(ctx)` —
    // test/crucible-draft pins that shape — so the options bag is read off `arguments`.
    const options = arguments[1];
    if (options && options.periodic) return;
    const context = ctx || this._ctx;
    const rootEl = this._root;
    const cards = this._cards;
    if (!context || !rootEl || !cards) return;
    this._ctx = context;
    // A rebuilt shelf (a purchase, a re-roll, a filter) is a different shelf: the Escape warning
    // and its line described the old one, so the next Esc reads the new one fresh.
    this._launchWarned = false;
    if (this._flash && this._flash.guard) this._flash = null;

    const owner = draftOwner(context);
    const offers = owner && typeof owner.currentOffers === 'function' ? owner.currentOffers() : [];
    const wave = owner && typeof owner.currentWave === 'function' ? owner.currentWave() : 0;
    const notice = owner && typeof owner.lastNotice === 'function' ? owner.lastNotice() : null;
    const rerollState = owner && typeof owner.rerollState === 'function' ? owner.rerollState() : null;
    const lines = rerollControlLines(rerollState, notice);
    const shop = context.state?.run?.ruleset === 'swarm';
    rootEl.classList.toggle('sf-crucible-armory', shop);
    this._title.textContent = shop ? 'Armory' : 'Rearm';
    if (this._visualArmory) this._visualArmory.wallet(context.state?.run?.credits, shop);
    this._filters.hidden = !shop;
    this._refitBtn.hidden = !shop;
    setWordShown(this._fortifyBtn, fortifyAvailable(context.state?.run));
    if (this._search) this._search.hidden = !shop;
    // offer.category is stamped when the card is drawn; the regex stays as the fallback for
    // any row that reaches the rail without it.
    const categoryFor = offer => typeof offer.category === 'string' && ARMORY_CATEGORY_SET.has(offer.category)
      ? offer.category
      : (typeof offer.defId === 'string' && offer.defId.startsWith('wpn_') ? 'Weapons'
        : /engine|shield|thermal|afterburner|chaff|thruster/.test(offer.defId || '') ? 'Motion' : 'Rigs');
    const query = (this._query || '').trim().toLowerCase();
    const matchesQuery = (offer) => !query
      || (offer.name || '').toLowerCase().includes(query)
      || (offer.verb || '').toLowerCase().includes(query)
      || (offer.blurb || '').toLowerCase().includes(query)
      || (offer.defId || '').toLowerCase().includes(query);
    for (const button of this._filters.children) {
      const category = button.dataset.category;
      if (!category) continue;
      button.setAttribute('aria-pressed', String(category === this._category));
      // How much stock each word holds: the armory scrolls, and the count is what says so.
      const count = category === 'All' ? offers.length : offers.filter((offer) => categoryFor(offer) === category).length;
      const label = shop ? `${category} ${count}` : category;
      if (button.dataset.label !== label) {
        button.dataset.label = label;
        button.textContent = '';
        button.appendChild(el('span', 'sf-cru-filter-word', category));
        if (shop) button.appendChild(el('span', 'sf-cru-count', String(count)));
        button.setAttribute('aria-label', shop ? `${category}, ${count} offer${count === 1 ? '' : 's'}` : category);
      }
    }

    // SWARM-04: a checkpoint start's opening armory parks run.wave one below the bought
    // entry — "Round 10 cleared" would claim a fight this run never flew. The bought purse
    // and the round ahead are the honest words.
    const runStart = context.state?.run?.telemetry
      && Number.isInteger(context.state.run.telemetry.startWave)
      ? context.state.run.telemetry.startWave : 1;
    this._sub.textContent = offers.length
      ? (wave === 0
        ? 'Fit out before round 1 — the purse is already open. Each fitting bolts onto one hardpoint of the ship you chose; a full hardpoint swaps, and the old part waits in your spares.'
        : shop && runStart > 1 && wave === runStart - 1
          ? `Checkpoint start — the purse is stocked for Round ${runStart}.`
          : shop ? `Round ${wave} cleared. Buy a new toy, or save for something bigger.`
            : `Wave ${wave} cleared. Choose a new weapon.`)
      : `Wave ${wave} cleared. Nothing new fits this hull.`;

    // SWARM-04 §6.5 — plan around the next fight. `wave` is the round just cleared (0 before
    // the opener), so the preview is always wave + 1. Zone/event remain authored ladder copy;
    // the quota, concurrent cap and roster come from the canonical pure plan for this run's
    // stake, Threats, build and mutators. This is a real refresh, not uiRoot's periodic repaint.
    // SWARM-08 B5 — a Circuit round's objective comes from the journey, not the ordinary
    // cadence; the Circuit panel's own next line is the honest preview. The shared painter
    // suppresses the generic forecast for Circuit runs and for planner failures.
    const runForPreview = context.state && context.state.run;
    const nextWaveForPreview = Number.isInteger(runForPreview?.wave)
      ? Math.max(1, runForPreview.wave + 1) : wave + 1;
    if (this._preview) this._paintNextPreview(shop ? runForPreview : null, nextWaveForPreview);

    // SWARM-08 B5 — paint the journey before the shelf: the route, the choice owed and the next
    // round. Ordinary Swarm only shows the opening invitation.
    const runNow = context.state && context.state.run;
    const circuitPanel = shop && runNow ? circuitPanelLines(runNow) : null;
    if (this._circuit) {
      this._circuit.el.hidden = !circuitPanel;
      if (circuitPanel) {
        this._circuit.status.textContent = circuitPanel.status;
        this._paintCircuitRoute(circuitPanel.stages);
        this._circuit.route.textContent = circuitPanel.stages
          .map((stage) => `${stage.stage} ${stage.label}${stage.status === 'complete' ? ' ✓' : stage.status === 'current' ? ' ●' : ''}${stage.boss ? ` (${stage.boss})` : ''}`)
          .join(' · ');
        this._circuit.next.textContent = circuitPanel.next || '';
        this._circuit.next.hidden = !circuitPanel.next;
        this._paintCircuitChoices(context, circuitPanel.choices);
      }
    }
    const circuitRun = runNow ? circuitFor(runNow) : null;
    const circuitError = circuitStateError(runNow);
    const circuitOwed = !!circuitError || !!(circuitPanel && circuitRun
      && (circuitRun.status === 'route' || circuitRun.status === 'finale'));

    // SWARM-05 §7.3 — the hull being flown leaves the catalogue and reads on the status
    // line; the other manifest hulls stay on the shelf as Switch rows.
    const flying = shop ? offers.find((offer) => offer._flying) : null;
    if (this._cradle) {
      const cradleName = flying && (flying.name || entityLabel('hull:' + flying.defId) || flying.defId);
      // The opening armory fits the door's free hull pick — it does not re-sell it. New hulls
      // go on sale once the run has begun (see _armoryExtras), so this line says where they are.
      this._cradle.textContent = cradleName
        ? (wave === 0 ? `In the cradle — ${cradleName} · new hulls go on sale after round 1` : `In the cradle — ${cradleName}`)
        : '';
      this._cradle.hidden = !cradleName;
    }
    // SWARM-05 §7.3 — Recommended for your build: the owner's three picks lead the shelf
    // once and do not repeat in the catalogue below. Category and search shelves stay the
    // plain catalogue.
    const recommended = shop && this._category === 'All' && !this._query
      && owner && typeof owner.recommendedOffers === 'function'
      ? owner.recommendedOffers().filter((offer) => !offer._flying)
      : [];
    const recommendedIds = new Set(recommended.map((offer) => offer.id));

    // INF-060: a purchase rebuilds the cards; the player stays on the same offer instead of
    // being thrown back to the first card (or into detached-focus limbo).
    const savedFocus = focusedControlId(rootEl);
    cards.innerHTML = '';
    const visibleOffers = shop
      ? offers
        .filter(offer => !offer._flying && !recommendedIds.has(offer.id)
          && (this._category === 'All' || categoryFor(offer) === this._category)
          && matchesQuery(offer))
        .sort((a, b) => a.price - b.price || a.name.localeCompare(b.name))
      : offers.slice(0, SURVIVAL_DRAFT_CHOICES);
    let lastPrice = null;
    let walletDrawn = false;
    let key = 1;
    const credits = Number(context.state?.run?.credits) || 0;
    if (recommended.length) {
      const shelfHead = el('p', 'orr-rail-divider', 'Recommended for your build');
      shelfHead.setAttribute('aria-hidden', 'true');
      cards.appendChild(shelfHead);
      for (const offer of recommended) {
        cards.appendChild(this._buildCard(context, offer, key));
        key += 1;
      }
      const shelfRest = el('p', 'orr-rail-divider', 'The whole shelf');
      shelfRest.setAttribute('aria-hidden', 'true');
      cards.appendChild(shelfRest);
    }
    for (const offer of visibleOffers) {
      // the armory's rail: the price as an engraved divider over each price's group, and the wallet
      // as a line where the rail passes what the run can pay
      if (shop && this._reading && Number.isFinite(offer.price)) {
        if (!walletDrawn && offer.price > credits && !offer.purchased) {
          const line = el('p', 'orr-rail-wallet', `Wallet ${credits} cr`);
          line.setAttribute('aria-hidden', 'true');
          cards.appendChild(line);
          walletDrawn = true;
        }
        if (offer.price !== lastPrice) {
          const divider = el('p', 'orr-rail-divider', `${offer.price} cr`);
          divider.setAttribute('aria-hidden', 'true');
          cards.appendChild(divider);
          lastPrice = offer.price;
        }
      }
      const card = this._buildCard(context, offer, key);
      key += 1;
      cards.appendChild(card);
    }

    if (shop && !visibleOffers.length && typeof document.createElementNS === 'function') {
      // The Hulls shelf is empty at the opening stop by design (the door's pick is being
      // fitted, not re-sold) — it says where the hulls are instead of reading as broken.
      const hullPause = this._category === 'Hulls' && !this._query && wave === 0;
      const empty = el('div', 'orr-armory-empty', hullPause
        ? 'New hulls go on sale after round 1 — this stop fits the ship you chose.'
        : 'No equipment matches this search.');
      const clear = el('button', 'orr-armory-clear', hullPause ? 'Back to all fittings' : 'Clear filters');
      clear.type = 'button';
      clear.addEventListener('click', () => {
        this._category = 'All'; this._query = ''; this._search.value = ''; this.refresh(context);
        this._search.focus();
      });
      empty.appendChild(clear); cards.appendChild(empty);
    }
    this._note.textContent = notice || lines.notice || '';
    this._offersById = new Map([...visibleOffers, ...recommended].map((offer) => [offer.id, offer]));
    // What the shelf shows right now, for the Escape guard (the Gauntlet never reads it).
    this._drawnOffers = shop ? [...recommended, ...visibleOffers] : [];
    rootEl.classList.toggle('orr-armory', shop && !!this._reading);
    if (this._reading) {
      this._reading.el.hidden = !shop || !(visibleOffers.length || recommended.length);
      const keep = this._offersById.get(this._reading.offerId);
      const first = keep || visibleOffers.find((offer) => offer.available) || recommended[0] || visibleOffers[0];
      if (shop && first) this._paintReading(context, first);
    }

    setKeyLabel(this._skip,
      this._warmHold === true ? 'Readying the field…'
        : circuitOwed
          ? (circuitError ? 'Circuit data invalid — start a new run'
            : circuitRun.status === 'route' ? 'Choose a destination first' : 'Finish or enter Overtime first')
          : shop ? `Launch round ${wave + 1}` : (offers.length ? 'Keep current loadout' : 'Continue'),
      'Esc', 'Escape');
    // In the armory the way forward is the one consequential key; buying happens on the cards.
    this._skip.classList.toggle('k-word--primary', shop && !circuitOwed);
    // A warm hold that resolved off-draft left the control disabled+relabelled; re-arm it here
    // (and keep it held while a hold is actually in flight, so a repaint cannot un-gate it).
    this._skip.disabled = this._warmHold === true;
    this._skip.setAttribute('aria-disabled', this._warmHold === true || circuitOwed ? 'true' : 'false');

    const reroll = this._rerollBtn;
    setKeyLabel(reroll, lines.label || 'Re-roll', 'R', 'R');
    reroll.disabled = !!lines.disabled;
    reroll.setAttribute('aria-disabled', lines.disabled ? 'true' : 'false');
    reroll.hidden = !lines.visible;
    reroll.style.display = lines.visible ? '' : 'none';
    // The balance, and which draw this is — a player who has paid twice should be able to see it.
    this._wallet.textContent = shop ? (this._reading ? '' : `${context.state.run.credits} cr to spend`) : lines.visible
      ? (lines.draw ? `${lines.wallet} · ${lines.draw}` : lines.wallet)
      : '';
    // The keys a card cannot print on itself. Esc and R ride inside their own keys; the offer
    // numbers are on the cards.
    const keys = offers.length && shop ? '1–3 inspect · Tab browse' : '';
    this._hint.textContent = keys && this._wallet.textContent ? ` · ${keys}` : keys;
    if (shop && this._reading && offers.length) {
      this._hint.textContent = '';
      const cap = (t) => el('span', 'orr-armory-keycap', t);
      this._hint.append(cap('1'), cap('2'), cap('3'), el('span', 'orr-armory-hintword', 'Inspect'), cap('Tab'), el('span', 'orr-armory-hintword', 'Browse'));
    }
    if (this._flash && this._flash.until > Date.now() && !notice) this._note.textContent = this._flash.text;
    this._clipRailToWholeRows();

    // Only claim focus when it is not already inside this surface, and when the rebuild did not
    // just restore the player's place. A refused re-roll must not yank the player off the
    // control they just used.
    this._restoringInspection = true;
    try {
      if (!restoreFocusedControl(rootEl, savedFocus)) {
        const active = typeof document !== 'undefined' ? document.activeElement : null;
        if (!active || !rootEl.contains || !rootEl.contains(active)) {
          const target = [...cards.querySelectorAll('button:not(:disabled)')].find(card => card.dataset.offerId === this._reading?.offerId)
            || cards.querySelector('button:not(:disabled)') || this._skip;
          if (target && typeof target.focus === 'function') {
            try { target.focus(); } catch { /* focus is best-effort */ }
          }
        }
      }
    } finally { this._restoringInspection = false; }
  },

  /** Validate against the owner's CURRENT shelf; never spend on a captured/stale offer. */
  _purchaseSelected(ctx) {
    if (this._purchaseArmed === false || this._purchasePending) return;
    const owner = draftOwner(ctx);
    const offer = owner?.currentOffers?.().find(item => item.id === this._reading?.offerId);
    if (!offer?.available || offer.purchased || ctx.state?.run?.phase !== 'draft') {
      this.refresh(ctx); return;
    }
    // A refreshed shelf can select a different row after a purchase. A second click on the
    // same confirmation key must never silently buy that row; inspection explicitly re-arms it.
    this._purchaseArmed = false;
    this._purchasePending = true;
    this._visualArmory?.pending(offer);
    try {
      this._emitIntentAndRefresh(ctx, 'run:draftPickRequested', { offerId: offer.id });
    } finally {
      this._purchasePending = false;
    }
  },

  /** Focus or an explicit click selects an offer. Pointer travel never changes a pending purchase. */
  _readFrom(event) {
    const card = event && event.target && event.target.closest ? event.target.closest('[data-offer-id]') : null;
    const offer = card && this._offersById ? this._offersById.get(card.dataset.offerId) : null;
    if (offer && this._ctx && !this._purchasePending && !this._restoringInspection) {
      this._purchaseArmed = true;
      this._paintReading(this._ctx, offer);
    }
  },

  _paintReading(context, offer) {
    const r = this._reading;
    if (!r || !offer) return;
    // Shelf refreshes replace the row nodes even when the reading's words stay cached.
    // Rebind the Hand to the new row before deciding whether those words need painting.
    this._lightReadingOffer(offer);
    // The key must carry every field the painted copy derives from — a free demo or a free
    // hull switch moves none of offer.id/credits, and a refit can leave both unchanged while
    // the jig goes stale, so the fit rides the key too.
    const fit = activeLoadout(context);
    const owner = draftOwner(context);
    const receipt = owner?.preparationReceipt?.();
    const generation = owner?.preparationGeneration?.();
    if (r.generation !== generation) this._purchaseArmed = true;
    const receiptKey = receipt ? `${receipt.generation}:${receipt.sequence}:${receipt.outcome}` : `${generation ?? ''}`;
    const armed = this._purchaseArmed !== false;
    const fitKey = (fit.hullId || '') + '|' + fit.fittings.join(',');
    if (r.offerId === offer.id && r.credits === context.state?.run?.credits
      && r.demoed === offer.demoed && r.purchased === offer.purchased && r.held === offer.held
      && r.available === offer.available && r.fitKey === fitKey
      && r.receiptKey === receiptKey && r.armed === armed) return;
    r.offerId = offer.id;
    r.fitKey = fitKey;
    r.credits = context.state?.run?.credits;
    r.demoed = offer.demoed;
    r.purchased = offer.purchased;
    r.available = offer.available;
    r.held = offer.held;
    r.receiptKey = receiptKey;
    r.generation = generation;
    r.armed = armed;
    // The row being read lights its hardpoint: one ice pass along the leader beam and a pulse
    // of the node ring. Re-armed per row change; reduced motion leaves it off (bone at rest).
    const jigHost = r.parts && r.parts.jig;
    if (jigHost && jigHost.classList && typeof document !== 'undefined' && document.documentElement
      && !document.documentElement.classList.contains('sf-reduce-motion')) {
      jigHost.classList.remove('is-pulse');
      void jigHost.offsetWidth;
      jigHost.classList.add('is-pulse');
      if (this._pulseTimer) clearTimeout(this._pulseTimer);
      this._pulseTimer = setTimeout(() => jigHost.classList.remove('is-pulse'), 700);
    }
    const lines = offerCardLines(offer, context.state);
    const { parts } = r;
    parts.verb.textContent = lines.verb;
    parts.name.textContent = lines.name;
    parts.blurb.textContent = lines.blurb;
    parts.act.textContent = lines.activation || '';
    // where it goes: the run's ship with that hardpoint lit
    const rows = owner && typeof owner.refitRows === 'function' ? owner.refitRows() : [];
    const hullId = activeLoadout(context).hullId;
    const slot = Number.isInteger(offer.slotIndex) ? offer.slotIndex : -1;
    const fittedCount = rows.filter((row) => !!row.defId).length;
    const hullName = hullId ? (entityLabel('hull:' + hullId) || hullId.replace(/^ship_/, '')) : '';
    r.jig.show({
      hullId,
      engraving: hullName ? `${hullName} \u00b7 ${fittedCount} of ${rows.length} fitted` : '',
      slots: rows.map((row) => row.slotType),
      filled: rows.map((row) => !!row.defId),
      target: slot,
      label: slot >= 0 ? `Hardpoint ${slot + 1}` : '',
      sub: offer.replaces ? `swaps with ${fittingName(offer.replaces)} — old part to spares` : 'empty — bolts straight on',
    });
    parts.compare.textContent = '';
    const best = {};
    for (const o of (this._offersById ? this._offersById.values() : [])) {
      const d = WEAPON_DEF_BY_ID.get(o.defId);
      if (!d) continue;
      best.dps = Math.max(best.dps || 0, finiteNum(d.dps) || 0);
      best.impulsePerHit = Math.max(best.impulsePerHit || 0, finiteNum(d.impulsePerHit) || 0);
    }
    const compare = offerCompare(offer, best);
    if (compare) parts.compare.appendChild(compare);
    parts.budget.textContent = '';
    if (Number.isFinite(offer.price) && !offer.purchased && offer.price > 0) {
      const gauge = budgetGauge(context.state?.run?.credits, offer.price);
      if (gauge) parts.budget.appendChild(gauge);
    }
    r.el.classList.toggle('is-unavailable', !offer.available);
    if (this._visualArmory) this._visualArmory.show(offer, lines, {
      credits: Number(context.state?.run?.credits) || 0, hullId, rows, armed, receipt, generation,
    });
    // The demo word: a fitting the reading is on can fly one round for free — the showcase half
    // of the sandbox. Hulls and the service counter carry no hardpoint, so nothing to demo.
    parts.demo.textContent = '';
    if (!offer.purchased && Number.isInteger(offer.slotIndex) && typeof offer.defId === 'string'
        && offer.kind !== 'hull' && offer.kind !== 'service') {
      const demo = el('button', 'orr-armory-reading__demo-word');
      demo.type = 'button';
      demo.textContent = offer.demoed ? 'On trial' : 'Demo — fly it one round';
      demo.disabled = offer.demoed === true;
      demo.addEventListener('click', () => {
        this._emitIntentAndRefresh(context, 'run:draftPickRequested', { offerId: offer.id, demo: true });
      });
      parts.demo.appendChild(demo);
    }
    // SWARM-05 §7.3 — hold the card for the next armory: the shelf re-deals, this one comes
    // back. The service counter and the flown hull cannot ride a hold (the owner refuses
    // them); a held card's word lets it go.
    parts.hold.textContent = '';
    if (!offer.purchased && offer.kind !== 'service' && !offer._flying) {
      const hold = el('button', 'orr-armory-reading__hold-word');
      hold.type = 'button';
      hold.textContent = offer.held
        ? 'Held for the next armory — let it go'
        : 'Hold for the next armory';
      hold.addEventListener('click', () => {
        this._emitIntentAndRefresh(context, 'run:draftLockRequested', { offerId: offer.id });
      });
      parts.hold.appendChild(hold);
    }
    this._syncRailScale();
  },

  _lightReadingOffer(offer) {
    // the rail's Hand sits on the row being read
    if (this._cards) {
      for (const card of this._cards.querySelectorAll('.sf-cru-card')) {
        const lit = card.dataset.offerId === offer.id;
        card.classList.toggle('is-lit', lit);
        card.setAttribute('aria-pressed', String(lit));
        if (lit && typeof card.scrollIntoView === 'function' && this._cards.getBoundingClientRect) {
          const box = this._cards.getBoundingClientRect();
          const row = card.getBoundingClientRect();
          const clear = Math.min(84, box.height / 4);
          if (row.top < box.top + clear || row.bottom > box.bottom - clear) card.scrollIntoView({ block: 'nearest', behavior: 'auto' });
        }
      }
    }
  },

  /**
   * The fold clips to whole rows: the rail's height rounds down to the last offer (or divider)
   * that fits entire, so a half-cut row never sits at the bottom edge. No-op without layout.
   * While clipped at the top, the rail's bottom fade retires (is-clipped): its job was softening
   * the cut, and with whole rows it would only ghost the last one. Scrolling restores it.
   */
  _clipRailToWholeRows() {
    const cards = this._cards;
    if (!cards || !cards.children || !cards.children.length) return;
    if (typeof cards.getBoundingClientRect !== 'function' || !cards.style) return;
    // Important: the composition sheet pins max-height:none !important on this box, so a plain
    // inline value would lose to it. Border-box, measured from the container's own top: the first
    // row sits a padding plus a divider margin below it, and measuring from the row would land
    // the fold that far inside the last row.
    cards.style.removeProperty('max-height');
    cards.style.setProperty('box-sizing', 'border-box');
    const avail = cards.clientHeight;
    if (!avail || cards.scrollHeight <= avail + 2) {
      this._railClipped = false;
      if (cards.classList) cards.classList.remove('is-clipped');
      return;
    }
    const origin = cards.getBoundingClientRect().top;
    let edge = 0;
    for (const child of cards.children) {
      if (typeof child.getBoundingClientRect !== 'function') continue;
      const bottom = child.getBoundingClientRect().bottom - origin;
      if (bottom <= avail - 4) edge = bottom;
      else break;
    }
    if (edge > 0) cards.style.setProperty('max-height', `${Math.ceil(edge)}px`, 'important');
    this._railClipped = edge > 0;
    this._syncRailClipFade();
    // The fold moved: the rail's thumb and first–last count re-read the new box.
    this._syncRailScale();
  },

  /** The bottom fade retires only while the clipped rail sits at the top. */
  _syncRailClipFade() {
    const cards = this._cards;
    if (!cards || !cards.classList) return;
    cards.classList.toggle('is-clipped', this._railClipped === true && cards.scrollTop <= 0);
  },

  /** Where the rail is: a thin scale beside it with its thumb, and 'first-last of all'. */
  _syncRailScale() {
    const cards = this._cards;
    const scale = this._railScale;
    if (!cards || !scale || typeof cards.getBoundingClientRect !== 'function') return;
    const all = [...cards.querySelectorAll('.sf-cru-card')];
    const box = cards.getBoundingClientRect();
    const shown = all.map((c, i) => [i, c.getBoundingClientRect()]).filter(([, r]) => r.bottom > box.top + 8 && r.top < box.bottom - 8);
    const overflow = cards.scrollHeight > cards.clientHeight + 2;
    scale.hidden = !overflow || !all.length;
    if (scale.hidden) return;
    const first = shown.length ? shown[0][0] + 1 : 1;
    const last = shown.length ? shown[shown.length - 1][0] + 1 : all.length;
    scale.querySelector('.orr-rail-scale__words').textContent = `${first}\u2013${last} of ${all.length}`;
    const thumb = scale.querySelector('.orr-rail-scale__thumb');
    const frac = cards.clientHeight / cards.scrollHeight;
    const pos = cards.scrollTop / Math.max(1, cards.scrollHeight - cards.clientHeight);
    thumb.style.height = `${Math.max(8, frac * 100)}%`;
    thumb.style.top = `${pos * (100 - Math.max(8, frac * 100))}%`;
  },

  // One offer: the key numeral in fine print, the verb as the one permitted caps label, the name
  // at sub-title size, the blurb as a sentence, the slot in fine print. The whole block is the button.
  _buildCard(ctx, offer, keyNumber) {
    const lines = offerCardLines(offer, ctx.state);
    const card = el('button', 'sf-cru-card');
    const visualShop = ctx.state?.run?.ruleset === 'swarm' && !!this._visualArmory;
    const glyph = equipmentSvg(offer);
    if (glyph) card.appendChild(glyph);
    card.type = 'button';
    card.dataset.offerId = offer.id;
    card.setAttribute('aria-label', `${lines.verb}. ${lines.name}. ${lines.blurb} ${lines.activation}. ${lines.slot}`);
    // Hover reads the same sentence the card prints: what it does, then what it replaces.
    card.title = [lines.verb, lines.name, lines.blurb, offer.replacesName ? `Replaces ${offer.replacesName}` : '']
      .filter(Boolean).join('. ');

    // The key numeral rides on the verb's line, so a card with no key (the armory's fourth
    // offer on) starts its name on the same line as the cards beside it.
    const head = el('div', 'sf-cru-cardhead');
    const key = el('p', 'k-t-fine k-38 sf-cru-key', keyNumber <= 3 ? String(keyNumber) : '');
    key.setAttribute('aria-hidden', 'true');
    head.appendChild(key);
    // The shop's verb line names the offer's category (the visual armory's narrow rail). The
    // plain cards — the scored rearm, the refit-family drafts — have no narrow verb column, so
    // their verb is the authored word, whole; the aria-label carries the full sentence either
    // way. (A former ≤1500px abbreviation dictionary is gone with its only caller: a wide plain
    // card reading "SRM"/"UNS" was jargon, and the words always fit.)
    head.appendChild(el('p', 'k-caps sf-cru-verb', visualShop ? (offer.category || lines.verb) : lines.verb));
    card.appendChild(head);
    card.appendChild(el('h2', 'k-display k-t-sub sf-cru-name', lines.name));
    card.appendChild(el('p', 'k-sentence sf-cru-blurb', lines.blurb));
    if (lines.activation) card.appendChild(el('p', 'k-text k-t-data sf-cru-activation', lines.activation));
    if (Number.isFinite(offer.price)) {
      // The price reads on the head line, beside the verb: one line less per card, so the
      // armory's next row shows at the bottom edge and says the stock goes on. SWARM-05 §7.3:
      // a manifest hull is a switch, not a sale — "On manifest", never "0 cr".
      const onManifest = offer.kind === 'hull' && Number.isInteger(offer._ownedIndex);
      head.appendChild(el('p', 'k-t-emph sf-cru-price',
        offer.purchased ? 'FITTED' : onManifest ? 'On manifest' : `${offer.price} cr`));
      // A hold badge rides the same head line: the card this armory carried in (lockedIn) or
      // the one a hold now rides on for the next (held).
      if (offer.lockedIn || offer.held) {
        head.appendChild(el('p', 'k-t-fine sf-cru-held',
          offer.lockedIn ? 'Held in' : 'Held for the next armory'));
      }
      if (offer.unavailableReason && !offer.purchased) {
        card.appendChild(el('p', 'k-t-fine sf-cru-afford', offer.unavailableReason));
      }
      // An unaffordable item is still inspectable; only its transaction key is disabled.
      // But it must LOOK unavailable — a wall of identical rows is how a refused purchase reads
      // as a purchase that silently did nothing. The reason line above names the unlock.
      card.disabled = visualShop ? false : !offer.available;
      card.classList.toggle('is-unavail', !offer.available && !offer.purchased);
      card.classList.toggle('is-fitted', !!offer.purchased);
      if (!offer.available && !offer.purchased) card.setAttribute('aria-disabled', 'true');
      else card.removeAttribute('aria-disabled');
      card.setAttribute('aria-label', `${lines.verb}. ${lines.name}. ${lines.blurb} ${lines.activation}. ${offer.price} credits. ${offer.unavailableReason || lines.slot}`);
    }
    card.appendChild(el('p', 'k-t-fine k-38 sf-cru-slot', lines.slot));

    card.addEventListener('click', () => {
      if (visualShop) {
        if (!this._purchasePending) {
          this._purchaseArmed = true;
          this._paintReading(ctx, this._offersById?.get(offer.id) || offer);
        }
        return;
      }
      if (offer.available) this._flash = { text: `Bought ${lines.name}.`, until: Date.now() + 5000 };
      this._emitIntentAndRefresh(ctx, 'run:draftPickRequested', { offerId: offer.id });
    });
    return card;
  },
};

export const crucibleRefitScreen = {
  id: 'crucibleRefit',
  data: { locked: true },

  mount(rootEl, ctx) {
    this._root = rootEl;
    rootEl.innerHTML = '';
    this._spareChoice = new Map(); // INF-060: chosen spare per hardpoint, kept across refreshes.
    rootEl.classList.add('k-screen', 'k-screen--stage', 'sf-crucible', 'sf-crucible-refit');
    injectOrreryScreens();
    injectCruciblePreparation();
    injectCrucibleRefitLayouts(rootEl.ownerDocument || document);
    rootEl.classList.add('orr-crucible');
    rootEl.dataset.kReady = '0';
    rootEl.dataset.stamp = 'CRUCIBLE / REFIT';
    rootEl.setAttribute('role', 'dialog');
    rootEl.setAttribute('aria-modal', 'true');
    rootEl.setAttribute('aria-labelledby', 'sf-crucible-refit-title');

    const title = el('header', 'k-title');
    const h = el('h1', 'k-display k-t-title', 'Refit');
    h.id = 'sf-crucible-refit-title';
    title.appendChild(h);
    title.appendChild(el('p', 'k-t-emph k-62 sf-cru-sub',
      'Strip a hardpoint, or choose any spare the run has earned and fit it.'));
    rootEl.appendChild(title);
    // The owner's word on a refused fit or strip, under the title where the eye starts.
    const note = el('p', 'k-sentence sf-cru-note', '');
    note.setAttribute('role', 'status');
    note.setAttribute('aria-live', 'polite');
    title.appendChild(note);
    this._note = note;
    // SWARM-04 §6.5 — the refit bench is the armory's zone boundary: the round after a
    // wave-10 refit opens the next zone, so the preview rides here too.
    const preview = el('p', 'k-sentence sf-cru-preview', '');
    preview.hidden = true;
    title.appendChild(preview);
    this._preview = preview;

    // .k-stage — one row per hardpoint: its name, what is fitted beneath, the spare words and the
    // verb. ORRERY §6: the rows are the labels of a hull on the jig — the run's ship in plan at the
    // centre, each hardpoint a node on its real socket, each label on a leader round the ship, and
    // the Hand on the rim at the hardpoint you are on (src/ui/orrery/hullSchematic.js). Where the
    // hull has no plan render the rows keep their column.
    const stage = el('section', 'k-stage k-stage--scroll sf-cru-stage orr-refit-stage');
    const rows = el('ul', 'k-rows sf-cru-rows');
    rows.style.setProperty('--k-row-cols', 'minmax(0, 1fr) auto');
    rows.setAttribute('aria-label', 'Hardpoints');
    stage.appendChild(rows);
    this._rows = rows;
    rootEl.appendChild(stage);
    rootEl.classList.add('orr-refit');
    this._lit = null;
    this._jig = createHullSchematic({
      host: stage,
      avoid: () => [rootEl.querySelector('.k-title'), rootEl.querySelector('.k-foot')],
      // a node on the ship is a way to its hardpoint: focus moves to that label's choice
      onPick: (index) => {
        const row = rows.children[index];
        const target = row && (row.querySelector('[data-spare][aria-checked="true"]')
          || row.querySelector('.sf-cru-act:not([hidden]):not(:disabled)') || row.querySelector('button'));
        this._lit = index;
        if (this._jig) this._jig.light(index);
        if (target && typeof target.focus === 'function') target.focus();
      },
    });
    // The Hand follows the player: the hardpoint under the pointer or holding focus is lit.
    const lightRow = (event) => {
      const rowEl = event && event.target && event.target.closest ? event.target.closest('.sf-cru-row') : null;
      if (!rowEl || !this._jig) return;
      if (event.type === 'pointerover' && typeof performance !== 'undefined'
        && performance.now() - this._jig.laidOutAt() < 420) return;
      const index = [...rows.children].indexOf(rowEl);
      if (index < 0) return;
      this._lit = index;
      this._jig.light(index);
    };
    rows.addEventListener('focusin', lightRow);
    rows.addEventListener('pointerover', lightRow);

    this._ctx = ctx;
    this.refresh(ctx);

    const foot = el('footer', 'k-foot sf-cru-foot');
    const words = el('ul', 'k-words k-words--row');
    words.setAttribute('aria-label', 'Refit');
    this._fortifyBtn = appendFortifyWord(words, ctx);
    // Each key carries its consequence in fine print beneath it (refitFootLines), so a stranger
    // reads what the key DOES, not three verbs that sound alike.
    const keyNote = (li) => {
      const line = el('p', 'k-t-fine sf-cru-fine sf-cru-keynote', '');
      li.appendChild(line);
      return line;
    };
    const done = addWord(words, word('Launch next block', 'k-word--emph k-word--primary'));
    done.addEventListener('click', () => {
      if (ctx.state.run?.phase === 'draft') ctx.bus.emit('ui:popScreen', {});
      else ctx.bus.emit('run:refitCloseRequested', {});
    });
    this._done = done;
    this._doneNote = keyNote(done.parentElement);

    // KEEP GOING (PQ-133.10b): on the Gauntlet's last wave the close key ends the run as a win, so
    // the only way on to wave 31 is this one — it flips the ruleset to endless, then closes.
    {
      const cont = addWord(words, word('Keep going — endless waves', 'k-word--emph'));
      this._continue = cont;
      this._continueNote = keyNote(cont.parentElement);
      cont.addEventListener('click', () => {
        if (!continueSurvivalEndless(ctx.state)) {
          cue('deny');
          return;
        }
        cue('confirm');
        ctx.bus.emit('run:refitCloseRequested', {});
      });
    }

    // BANK HALF, KEEP FLYING — the window's middle seat, sat BETWEEN launch and the walk-away:
    // the foot escalates left to right, and Extract stays last so its hold cap keeps the tail
    // position it has always had. Unlike Extract this commits nothing about how the run ends:
    // half the purse becomes hangar bounty on the spot and the rest stays in the wallet for
    // the shop and the death law. A tap, not a hold — the pilot is buying certainty, not
    // ending a run — and the offer is simply not drawn when the purse cannot halve into a
    // whole credit.
    {
      const bank = addWord(words, word('Bank half, keep flying', 'k-word--emph'));
      this._bank = bank;
      bank.addEventListener('click', () => {
        if (!refitFootLines(ctx.state && ctx.state.run).bank) { cue('deny'); return; }
        cue('confirm');
        // The run stays benched here; the bank receipt refreshes this foot after the worker's
        // updated run snapshot lands. The helper also preserves one synchronous main-lane read.
        this._emitIntentAndRefresh(ctx, 'run:partialBankRequested', {});
      });
      this._bankNote = keyNote(bank.parentElement);
    }

    // WALK AWAY WITH IT (PQ-135). Extraction has existed since PQ-133.10b and was reachable only
    // from a bus event — "No UI", says its own header — so no player has ever been offered it.
    // An endless run needs it more than the arc ever did: without a voluntary end, the ONLY way a
    // swarm run finishes is dying, and a good run's reward for being good is a worse ending. This
    // is the one surface that is open at a ten-wave boundary, which is exactly the window
    // extraction is legal in, so the offer belongs here and nowhere else.
    {
      const out = addWord(words, word('Extract — end the run here', 'k-word--emph'));
      this._extract = out;
      out.addEventListener('click', () => {
        requestSurvivalExtraction(ctx.bus);
      });
      // INF-033: the settlement preview — what leaving secures and which amounts are run-only —
      // sits under the key it settles. The figures are live at refresh time, so a kill between
      // the preview and the press still settles exactly.
      const preview = keyNote(out.parentElement);
      preview.classList.add('sf-cru-extract');
      preview.setAttribute('role', 'status');
      this._extractPreview = preview;
    }
    foot.appendChild(words);
    rootEl.appendChild(foot);
    // D30: ending a run is a hold, not a tap — the win on the last wave (the done word) or the
    // extraction walk-away. One shared helper per word owns the timer and the filling ring;
    // keyboard F and pad X feed it through _feedEndHold.
    this._doneHold = attachHoldVerb(done, { ms: 600, onFire: () => done.click() });
    this._extractHold = attachHoldVerb(this._extract, { ms: 600, onFire: () => this._extract.click() });
    this._syncFoot(ctx);

    // Same reasoning as the draft: the run is paused here, so Escape must mean something.
    rootEl.addEventListener('keydown', (event) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        // done.click() can pop this screen synchronously; without stopping propagation the same
        // keydown then reaches the flight handler's Escape branch and also pushes Pause.
        event.stopPropagation();
        // Escape resumes (launch the next block, back to the armory); it never ends a run -- the
        // last wave's "take the win" is pressed, not escaped into.
        if (refitFootLines(ctx.state && ctx.state.run).finishes) { cue('deny'); return; }
        done.click();
        return;
      }
      // D30: Space taps Keep Going; F is the hold-to-fire "end the run". Neither steals a key a
      // focused control owns (buttons click on Space, selects keep their arrows), and both work
      // without walking focus to the footer, which is what the keys are for.
      if (event.key === ' ') {
        const a = document.activeElement;
        const tag = a && a.tagName;
        if (!a || (tag !== 'BUTTON' && tag !== 'SELECT' && tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'A')) {
          if (refitFootLines(ctx.state && ctx.state.run).cont && this._continue) {
            event.preventDefault();
            // Keep-going closes this screen synchronously; the same Space keydown must not
            // continue to the flight handler, where Space is the tether verb.
            event.stopPropagation();
            this._continue.click();
          }
        }
        return;
      }
      if (event.key === 'f' || event.key === 'F') {
        const a = document.activeElement;
        const tag = a && a.tagName;
        if (tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') this._feedEndHold(true);
      }
      // B taps the window's middle seat where it is offered — same guard as F so a spare
      // <select> keeps its own keys.
      if (event.key === 'b' || event.key === 'B') {
        const a = document.activeElement;
        const tag = a && a.tagName;
        if (tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT' && this._bank
          && refitFootLines(ctx.state && ctx.state.run).bank) {
          event.preventDefault();
          this._bank.click();
        }
      }
      // Left/Right walk the spare words of the focused hardpoint, choosing as they go.
      if ((event.key === 'ArrowLeft' || event.key === 'ArrowRight') && document.activeElement
        && document.activeElement.dataset && document.activeElement.dataset.spare != null) {
        const group = [...document.activeElement.parentElement.querySelectorAll('[data-spare]')];
        const here = group.indexOf(document.activeElement);
        const next = group[(here + (event.key === 'ArrowRight' ? 1 : -1) + group.length) % group.length];
        if (next && next !== document.activeElement) {
          event.preventDefault();
          next.focus();
          next.click();
        }
        return;
      }
      // INF-060 keyboard parity with the pad's spatial nav: Up/Down walk the hardpoint rows.
      // A focused select keeps its native arrows (they change the spare), so the walk only
      // claims the key on buttons.
      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        const active = document.activeElement;
        if (!active || active.tagName === 'SELECT') return;
        const walkable = [...rootEl.querySelectorAll('.sf-cru-row button, .sf-cru-row select, .k-foot .k-word')]
          .filter((el) => !el.disabled && !el.hidden && typeof el.focus === 'function');
        const here = walkable.indexOf(active);
        if (here < 0 || walkable.length === 0) return;
        event.preventDefault();
        const step = event.key === 'ArrowDown' ? 1 : -1;
        const next = walkable[(here + step + walkable.length) % walkable.length];
        next.focus();
        if (typeof next.scrollIntoView === 'function') next.scrollIntoView({ block: 'nearest' });
      }
    });
    rootEl.addEventListener('keyup', (event) => {
      if (event.key === 'f' || event.key === 'F') this._feedEndHold(false);
    });
    // Scroll-to-focused: a pad move (the shared gamepad layer moves DOM focus) or a keyboard walk
    // to a hardpoint below the fold must bring the row into the scroll column.
    this._stageEl = rootEl.querySelector('.sf-cru-stage');
    if (this._stageEl) {
      this._stageEl.addEventListener('focusin', (event) => {
        const t = event && event.target;
        if (t && typeof t.scrollIntoView === 'function') t.scrollIntoView({ block: 'nearest' });
      });
    }
    // r2 dressing the jig cannot do itself: empty leaders dash, nose numerals part, and the
    // fitted count reads inline when the dial drops its arc. The jig rebuilds its layer on every
    // relayout, so an observer re-applies after each build; it writes attributes only, never
    // classes, so it cannot retrigger itself. (The first refresh already ran above and filed the
    // states — only initialize here, never reset.)
    if (!Array.isArray(this._jigStates)) this._jigStates = [];
    this._fitCount = el('p', 'orr-hull-fitcount', '');
    this._fitCount.hidden = true;
    if (this._stageEl) this._stageEl.appendChild(this._fitCount);
    this._hullWatch = null;
    if (typeof MutationObserver === 'function' && this._stageEl
      && typeof this._stageEl.querySelectorAll === 'function') {
      this._hullWatch = new MutationObserver((mutations) => {
        if (mutations && mutations.every((m) => m.target === this._fitCount || m.target?.parentElement === this._fitCount)) return;
        this._dressHull();
      });
      this._hullWatch.observe(this._stageEl, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    }
    this._dressHull();

    this._regions = { title: h, stage, foot };
    rootEl.dataset.kReady = '1';
    // Focus starts where the Hand is -- on the lit hardpoint's choice -- so the screen has one
    // amber, not the Hand on the ship and a lit key in the corner. Escape still launches.
    const litRow = Number.isInteger(this._lit) ? rows.children[this._lit] : null;
    const start = (litRow && (litRow.querySelector('[data-spare][aria-checked="true"]')
      || litRow.querySelector('.sf-cru-act:not([hidden]):not(:disabled)'))) || done;
    if (start && typeof start.focus === 'function') {
      try { start.focus(); } catch { /* focus is best-effort */ }
    }
  },

  onShow(ctx) {
    if (ctx) this._ctx = ctx;
    bindScreenResultRefresh(this, this._ctx, REFIT_RESULT_REFRESH_EVENTS);
    // A worker receipt may have landed while this modal was hidden and unsubscribed. Re-read
    // the canonical snapshot on every reopen rather than waiting for the next event edge.
    if (this._ctx) this.refresh(this._ctx);
    const r = this._regions;
    if (!r || !canAnimate()) return;
    cue('open');
    try {
      settle(r.stage, { from: 'left', delay: 60, state: 'crucibleRefit:open' });
      settle(r.foot, { from: 'bottom', delay: 120, state: 'crucibleRefit:open' });
    } catch { /* motion is cosmetic */ }
  },

  onHide() {
    this._feedEndHold(false);
    unbindScreenResultRefresh(this);
    if (canAnimate()) cue('close');
  },

  /** Route the hold to the word that ends the run right now: Take-the-win on the last wave,
   *  Extract otherwise. An ineligible target is fed `false`, so a shown→hidden switch mid-hold
   *  can never leave a stale arming ring on the wrong word. */
  _feedEndHold(held, heldForSec) {
    const lines = refitFootLines(this._ctx && this._ctx.state && this._ctx.state.run);
    if (this._doneHold) this._doneHold.feed(held && !!lines.finishes, heldForSec);
    if (this._extractHold) this._extractHold.feed(held && !lines.finishes && !!lines.extract, heldForSec);
  },

  /** D30 pad verbs (the shared layer feeds raw X/Y here per frame while this modal owns
   *  input): Y taps Keep Going, X holds to end the run — same grammar as Space/F. */
  onPadButton(name, st, ctx) {
    if (ctx && ctx.state) this._ctx = ctx;
    if (name === 'y') {
      if (st && st.pressed && this._continue
        && refitFootLines(this._ctx && this._ctx.state && this._ctx.state.run).cont) {
        cue('confirm');
        this._continue.click();
      }
      return;
    }
    if (name === 'x') this._feedEndHold(!!(st && st.held), st && st.heldFor);
  },

  dispose() {
    unbindScreenResultRefresh(this);
    if (this._jig) this._jig.dispose();
    this._jig = null;
    if (this._hullWatch) { this._hullWatch.disconnect(); this._hullWatch = null; }
    if (this._doneHold) { this._doneHold.dispose(); this._doneHold = null; }
    if (this._extractHold) { this._extractHold.dispose(); this._extractHold = null; }
    this._preview = null;
  },

  /** The three keys, their words and their fine print, for the run as it stands now. */
  _syncFoot(context) {
    const run = context && context.state ? context.state.run : null;
    const lines = refitFootLines(run);
    const setNote = (node, text) => {
      if (!node) return;
      if (node.textContent !== text) node.textContent = text;
      node.hidden = !text;
    };
    // D30 caps: the launch key answers to Escape, endless-continue to Space / pad Y, and the
    // run-ending word (the win or the walk-away) to a 0.6 s hold of F / pad X — the ring on the
    // word is the hold's progress, so the cap is what fires it, not a tooltip.
    setKeyLabel(this._done, lines.primary, lines.finishes ? 'hold F·X' : 'Esc', lines.finishes ? 'f' : 'Escape');
    // The run-ending commit takes the Lamp; every other key rests in bone. (The first refresh
    // runs before the foot exists, like every other word here.)
    if (this._done) this._done.classList.toggle('is-lamp', !!lines.finishes);
    setNote(this._doneNote, lines.primaryNote);
    if (this._done && this._done.title !== lines.primaryNote) this._done.title = lines.primaryNote;
    if (this._done && this._done.dataset) {
      if (lines.finishes) this._done.dataset.hold = '1'; else delete this._done.dataset.hold;
    }

    setWordShown(this._continue, !!lines.cont);
    if (this._continue && lines.cont) setKeyLabel(this._continue, lines.cont, 'Space·Y', 'Space');
    setNote(this._continueNote, lines.contNote);

    setWordShown(this._extract, !!lines.extract);
    if (this._extract && lines.extract) setKeyLabel(this._extract, lines.extract, 'hold F·X', 'f');
    if (this._extract && this._extract.dataset) {
      if (lines.extract) this._extract.dataset.hold = '1'; else delete this._extract.dataset.hold;
    }
    setNote(this._extractPreview, lines.extractNote);
    // The button's description carries the same settlement, so the offer reads whole to AT.
    if (this._extract && this._extract.title !== lines.extractNote) this._extract.title = lines.extractNote;

    setWordShown(this._bank, !!lines.bank);
    if (this._bank && lines.bank) setKeyLabel(this._bank, lines.bank, 'B', 'b');
    setNote(this._bankNote, lines.bankNote);
    if (this._bank && this._bank.title !== lines.bankNote) this._bank.title = lines.bankNote;
  },

  _paintNextPreview(run, nextWave) {
    return paintSwarmPreview(this._preview, run, nextWave);
  },

  _emitIntentAndRefresh(context, event, payload) {
    emitIntentAndRefresh(this, context, event, payload);
  },

  refresh(ctx) {
    // Same guard as the draft: the shell's ~3 Hz periodic refresh(ctx, { periodic: true }) would
    // rebuild the hardpoint rows and collapse an open spare <select> mid-choice; fit/strip and
    // mount already call refresh() directly. (`refresh(ctx)` is pinned by
    // test/crucible-refit-focus — options arrive through `arguments`.)
    const options = arguments[1];
    if (options && options.periodic) return;
    const rows = this._rows;
    const context = ctx || this._ctx;
    if (!rows || !context) return;
    this._ctx = context;
    this._syncFoot(context);
    setWordShown(this._fortifyBtn, fortifyAvailable(context.state?.run));
    // SWARM-04 §6.5 — the same next-round card the armory shows. The refit opens after the
    // wave it names; the round ahead is run.wave + 1.
    const runForPreview = context.state && context.state.run;
    const currentWave = Number.isInteger(runForPreview?.wave) ? Math.max(0, runForPreview.wave) : 0;
    if (this._preview) this._paintNextPreview(runForPreview, Math.max(1, currentWave + 1));
    // INF-060: a fit/strip rebuilds every row. Capture where the player was (and which spare they
    // had chosen per hardpoint) so the rebuild neither drops focus nor resets their picks.
    const rootEl = this._root;
    const savedFocus = rootEl ? focusedControlId(rootEl) : null;
    rows.innerHTML = '';
    const jigNodes = [];

    for (const row of this._rows_data(context)) {
      const lines = refitRowLines(row);
      if (!lines) continue;

      const state = row.defId || row.intrinsicDefId ? 'fitted' : (lines.options.length ? 'open' : 'bare');
      const item = el('li', `k-row k-row--static sf-cru-row orr-hp is-${state}`);
      const left = el('div', 'orr-hp__body');
      const head = el('div', 'orr-hp__head');
      const numeral = el('span', 'orr-hp__n', String((row.slotIndex || 0) + 1).padStart(2, '0'));
      numeral.setAttribute('aria-hidden', 'true');
      head.appendChild(numeral);
      const name = el('span', 'k-row__name', '');
      name.appendChild(el('span', 'orr-hp__label', lines.label));
      if (lines.slotTag) name.appendChild(el('span', 'sf-cru-slottag', lines.slotTag));
      if (state !== 'fitted') name.appendChild(el('span', 'orr-hp__empty', 'Empty'));
      head.appendChild(name);
      left.appendChild(head);
      // the reading line: what is fitted (or the spares) and, at its end, the verb that changes it
      const line = el('div', 'orr-hp__line');
      left.appendChild(line);
      if (lines.options.length) {
        // Every compatible spare, not just the newest. The spares are words the player reads and
        // picks (Left/Right walk them); the select stays as their value holder, unseen, so INF-060's
        // remembered choice reads one value however it was set.
        const pick = el('select', 'k-select sf-cru-pick');
        pick.hidden = true;
        pick.tabIndex = -1;
        pick.setAttribute('aria-label', `Spare for ${lines.label.toLowerCase()}`);
        for (const option of lines.options) {
          const opt = el('option', '', option.label);
          opt.value = String(option.instanceId);
          pick.appendChild(opt);
        }
        // INF-060: restore the player's earlier choice for this hardpoint when it still fits, and
        // remember edits — acting on hardpoint 1 must not silently reset hardpoint 2's pick.
        const remembered = rememberedSpareChoice(lines.options, this._spareChoice.get(row.slotIndex));
        if (remembered != null) {
          pick.value = remembered;
        } else {
          this._spareChoice.delete(row.slotIndex);
        }
        const spareWords = el('div', 'k-row__sub orr-hp__spares');
        spareWords.setAttribute('role', 'radiogroup');
        spareWords.setAttribute('aria-label', `Spare for ${lines.label.toLowerCase()}`);
        const scales = spareScales(row.spares);
        const syncSpares = () => {
          for (const b of spareWords.children) b.setAttribute('aria-checked', String(b.dataset.spare === pick.value));
          if (scales) scales.update(pick.value);
        };
        pick.addEventListener('change', () => {
          this._spareChoice.set(row.slotIndex, pick.value);
          syncSpares();
        });
        for (const option of lines.options) {
          const [spareName, ...stat] = String(option.label).split(' — ');
          const b = el('button', 'orr-hp__spare');
          b.type = 'button';
          b.dataset.spare = String(option.instanceId);
          b.setAttribute('role', 'radio');
          b.setAttribute('aria-label', option.label);
          b.appendChild(el('span', 'orr-hp__spare-name', spareName));
          if (stat.length) b.appendChild(el('span', 'orr-hp__spare-stat', stat.join(' — ')));
          b.addEventListener('click', () => {
            if (pick.value === b.dataset.spare) return;
            pick.value = b.dataset.spare;
            pick.dispatchEvent(new Event('change'));
          });
          spareWords.appendChild(b);
        }
        syncSpares();
        line.appendChild(spareWords);
        if (scales) line.appendChild(scales.el);
        left.appendChild(pick);
        row._pick = pick;
        row._drawn = !!scales;
      } else {
        // an empty hardpoint's head already says Empty: its line says why
        const said = state === 'bare' ? String(lines.value).replace(/^Empty — /, '') : lines.value;
        const valueEl = el('div', 'k-row__sub orr-hp__value', said.charAt(0).toUpperCase() + said.slice(1));
        if (lines.valueRef) decorateEntityNode(valueEl, lines.valueRef);
        line.appendChild(valueEl);
      }
      // INF-036: the honest comparison, under the picker — the picker itself is untouched,
      // so customization is preserved and the contrast only advises.
      if (lines.description) {
        left.appendChild(el('div', 'k-row__sub orr-hp__contrast orr-hp__description', lines.description));
      }
      if (lines.contrast) {
        // drawn as scales above where it can be; the sentence stays for the ear
        left.appendChild(el('div', `k-row__sub orr-hp__contrast${row._drawn ? ' orr-hp__contrast--drawn' : ''}`, lines.contrast));
      }
      item.appendChild(left);

      const action = word(lines.action, lines.action === 'Strip' ? 'k-word--body k-word--danger' : 'k-word--body');
      action.classList.add('sf-cru-act');
      action.disabled = !!lines.disabled;
      // nothing can go in: no verb to offer
      if (state === 'bare') action.hidden = true;
      if (!lines.disabled) {
        action.addEventListener('click', () => {
          // Routed through the run owner, which calls ships.unfitModule / ships.fitModule
          // directly. The ui:* intents are gated behind a real station berth and an arena has no
          // station.
          let requested = false;
          if (row.defId) {
            this._emitIntentAndRefresh(context, 'run:refitStripRequested', { slotIndex: row.slotIndex });
            requested = true;
          } else {
            const chosen = this._chosenSpare(row);
            if (chosen) {
              this._emitIntentAndRefresh(context, 'run:refitFitRequested', {
                slotIndex: row.slotIndex, instanceId: chosen.instanceId,
              });
              requested = true;
            }
          }
          if (!requested) this.refresh(context);
        });
      }
      line.appendChild(action);
      // SWARM-05 §7.3 — sell back at half. The refit is the run's inventory: a fitted row
      // sells its fitting; an open row sells the spare it has picked. The word carries the
      // exact refund (swarmSellPrice is the same read the owner pays), and the owner answers
      // through the wallet's own receipt — a refused sale lands on the note line.
      const run = context.state && context.state.run;
      if (run && run.ruleset === 'swarm') {
        let sellDefId = row.defId || null;
        let sellTarget = null;
        if (sellDefId) {
          sellTarget = { slotIndex: row.slotIndex };
        } else {
          const chosen = this._chosenSpare(row);
          if (chosen && chosen.defId) {
            sellDefId = chosen.defId;
            sellTarget = { instanceId: chosen.instanceId };
          }
        }
        const sellPrice = sellDefId ? swarmSellPrice(sellDefId) : null;
        if (sellTarget && sellPrice != null && sellPrice > 0) {
          const sell = word(`Sell · ${sellPrice} cr`, 'k-word--fine');
          sell.classList.add('sf-cru-act', 'sf-cru-sell');
          sell.addEventListener('click', () => {
            this._emitIntentAndRefresh(context, 'run:refitSellRequested', sellTarget);
          });
          line.appendChild(sell);
        }
      }
      rows.appendChild(item);
      jigNodes.push({ el: item, slotType: row.slotType, state, num: String((row.slotIndex || 0) + 1).padStart(2, '0') });
    }

    this._jigStates = jigNodes.map((node) => node.state);
    if (this._jig) {
      const hullId = activeLoadout(context).hullId;
      const fitted = jigNodes.filter((n) => n.state === 'fitted').length;
      const hullName = hullId ? (entityLabel('hull:' + hullId) || hullId.replace(/^ship_/, '')) : '';
      this._jig.setHull(hullId);
      this._jig.setNodes(jigNodes, {
        engraving: hullName ? `${hullName} · ${fitted} of ${jigNodes.length} fitted` : '',
      });
      // First sight: the Hand starts on the first hardpoint a spare can fill, else the first.
      if (!Number.isInteger(this._lit)) {
        const open = jigNodes.findIndex((n) => n.state === 'open');
        this._lit = open >= 0 ? open : 0;
      }
      this._jig.light(this._lit, { swing: false });
    }

    // INF-060: put the player back where the rebuild found them (same row, same control kind).
    // If their row vanished entirely — a strip removed the spare picker — the rebuild leaves
    // focus alone rather than yanking them to the footer.
    if (rootEl) restoreFocusedControl(rootEl, savedFocus);

    const owner = draftOwner(context);
    const notice = owner && typeof owner.lastNotice === 'function' ? owner.lastNotice() : null;
    if (this._note) this._note.textContent = notice || '';
    this._dressHull();
  },

  /**
   * r2 dressing over the jig's own drawing: empty hardpoints dash their whole connector so
   * emptiness reads at a glance (the lit arm stays solid), nose numerals part to a 12px edge
   * gap, and the fitted count reads inline under the hull when the dial drops its arc.
   * Idempotent; the mount observer re-applies it after every jig rebuild.
   */
  _dressHull() {
    const stage = this._stageEl;
    const jig = this._jig;
    const states = this._jigStates;
    if (!stage || !jig || !states || !states.length) return;
    // The same count stays useful when cramped columns give way to the scrollable rows.
    if (this._fitCount) {
      const text = `${states.filter((s) => s === 'fitted').length} of ${states.length} fitted`;
      if (this._fitCount.dataset.raw !== text) {
        this._fitCount.dataset.raw = text;
        this._fitCount.textContent = text;
      }
    }
    if (typeof jig.active !== 'function' || !jig.active()) {
      if (this._fitCount) this._fitCount.hidden = false;
      return;
    }
    if (typeof stage.querySelectorAll !== 'function') return;
    const n = states.length;
    const lit = typeof jig.lit === 'function' ? jig.lit() : -1;
    // The layer holds each hardpoint's open runs first, then its hidden runs; the hidden runs
    // dash already. Guard the count: a rebuild mid-refresh is the observer's next turn, not this.
    const leaders = stage.querySelectorAll('.orr-hull__leader');
    if (leaders.length === 3 * n && typeof leaders.forEach === 'function') {
      leaders.forEach((path, k) => {
        if (k >= 2 * n || !path.getAttribute) return;
        const idx = Math.floor(k / 2);
        const empty = states[idx] !== 'fitted' && idx !== lit;
        const has = path.getAttribute('stroke-dasharray');
        if (empty && has !== '5 4') path.setAttribute('stroke-dasharray', '5 4');
        else if (!empty && has) path.removeAttribute('stroke-dasharray');
      });
    }
    // Numerals part along x to a 12px edge gap, two relaxation passes, capped travel.
    const nums = [...stage.querySelectorAll('.orr-hull__num')];
    const boxes = nums.map((t) => ({
      el: t,
      x: Number(t.getAttribute('x')) || 0,
      y: Number(t.getAttribute('y')) || 0,
      hw: (t.textContent ? t.textContent.length : 2) * 4.6,
      hh: 7,
    }));
    for (let pass = 0; pass < 2; pass += 1) {
      for (let i = 0; i < boxes.length; i += 1) {
        for (let j = i + 1; j < boxes.length; j += 1) {
          const a = boxes[i];
          const b = boxes[j];
          if (Math.abs(a.y - b.y) >= a.hh + b.hh) continue;
          const need = a.hw + b.hw + 12 - Math.abs(a.x - b.x);
          if (need <= 0) continue;
          const push = Math.min(need / 2, 15);
          const dir = (b.x - a.x) >= 0 ? 1 : -1;
          a.x -= dir * push;
          b.x += dir * push;
        }
      }
    }
    for (const box of boxes) {
      const want = box.x.toFixed(1);
      if (box.el.getAttribute('x') !== want) box.el.setAttribute('x', want);
    }
    // The fitted count, inline under the hull only while the arc is gone.
    if (this._fitCount) {
      this._fitCount.hidden = stage.querySelectorAll('.orr-hull__fitted').length !== 0;
    }
  },

  /** Match the select back to the owner's own row data, so no id is retyped through a string. */
  _chosenSpare(row) {
    const spares = Array.isArray(row && row.spares) ? row.spares : [];
    if (spares.length === 0) return null;
    const value = row._pick ? String(row._pick.value) : null;
    if (value == null) return spares[0];
    return spares.find((spare) => String(spare.instanceId) === value) || spares[0];
  },

  /**
   * Hardpoint rows from the run owner. It knows which spares legally fit which hardpoint; falling
   * back to a bare fittings read keeps the surface honest (and closable) if the owner is absent,
   * with the fitting authority still the one that says no.
   */
  _rows_data(context) {
    const owner = draftOwner(context);
    if (owner && typeof owner.refitRows === 'function') {
      const rows = owner.refitRows();
      if (Array.isArray(rows) && rows.length) return rows;
    }
    const loadout = activeLoadout(context);
    return loadout.fittings.map((defId, slotIndex) => ({
      slotIndex, defId: defId || null, name: defId ? prettyDefId(defId) : null, spares: [],
    }));
  },
};
