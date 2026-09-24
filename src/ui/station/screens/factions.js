import { factionsFrameHtml } from '../../views/stationFrames.js';
// src/ui/station/screens/factions.js — "Standing & Relations" as a kit panel (Frontend Task C §1.6).
// Left: every power as a row — name (prefixed "Authority · " when it owns the berth), the standing
// signed, a bar under the name with the zero marker. Right: the crest at hero size, the name, the
// jurisdiction sentence, three heroes (Now · Next · Hostility buffer) with the shared guidance as
// their words, then the standing ladder, the contract ladder, the next move and the relations as
// static rows. Read-only: reflects state.factions[id].rep. The dial SVG and the relation web are
// gone; the words carry every state, colour only says against you / at rest / a gain.
//
// Screen module shape (hosted by stationApp): create(ctx) -> { el, onShow, refresh, dispose }.
// `.sx-fac`, `.sx-fac-row[data-fac]`, `.sx-fac-node[data-fac]`, `.sx-fac-ladder` are inert hooks
// the station checks query.
import { FACTION_META } from '../../../data/factions.js';
import { NEW_GAME } from '../../../data/newGameDefaults.js';
import { SECTORS } from '../../../data/sectors.js';
import { shouldHideOwnRepDelta } from '../../../story/endings/publicIdentity.js';
import {
  tierFor,
  FACTION_TIERS,
  FACTION_AGGRO_THRESHOLD,
  factionStandingGuidance,
  factionContractLadderRows,
} from '../../factionStanding.js';
import { escapeHtml } from '../../comms.js';
import { entitySpanHtml } from '../../entityResolver.js';
import { icon, factionIcon } from '../icons.js';
import { dpMark, factionCrestName } from '../../deckplate/index.js';
import { stationControlAttrs } from '../stationBindingMap.js';
import { createCrestOrbit, standingScaleSvg } from '../../orrery/crestOrbit.js';
import { decrypt } from '../../orrery/text.js';
import { reducedMotion } from '../../orrery/motion.js';

const STATION_FACTION = new Map();
for (const sector of SECTORS) {
  for (const station of (sector.stations || [])) STATION_FACTION.set(station.id, station.factionId || sector.factionId || null);
}

const REP_MIN = -1000;
const REP_MAX = 1000;

/** The power's own heraldry.
 *
 *  Fourteen crests were drawn for the fourteen factions -- 240px hex shields, two-tone, one per
 *  power -- and this screen was rendering a generic line glyph from the icon set instead, at 24px,
 *  greyed, tucked behind the title. ONE_PHOTOGRAPH.md section 4.12: a glyph where a mark exists is
 *  a defect. dpMark casts the real thing as relief under the shared key; the icon-set fallback
 *  stays for a power with no crest on disk, which today is none of them.
 */
function crest(id, variant) {
  const name = factionCrestName(id);
  if (name) return dpMark(name, { size: variant === 'hero' ? 'hero' : 'badge', lit: variant === 'hero' });
  const px = variant === 'hero' ? 240 : 24;
  const svg = factionIcon(id, px) || icon('factions', px);
  return svg.replace(/class="sx-ico[^"]*"/, `class="k-crest k-crest--${variant} sx-ico"`);
}

function tierIndex(rep) {
  const t = tierFor(rep);
  const i = FACTION_TIERS.indexOf(t);
  return i < 0 ? 4 : i;
}
/** Colour by MEANING, indexed by tier: against you · at rest · a gain — the kit's three words. */
export function standingColorAt(i) {
  if (i <= 3) return 'var(--k-bad)';
  if (i === 4) return 'var(--k-bone-62)';
  return 'var(--k-good)';
}
export function standingColor(rep) { return standingColorAt(tierIndex(rep)); }
function standingClass(rep) {
  const i = tierIndex(rep);
  return i <= 3 ? 'k-bad' : (i === 4 ? '' : 'k-good');
}

function reduceMotion() {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function repOf(state, id) {
  const live = state && state.factions && state.factions[id];
  if (live && Number.isFinite(Number(live.rep))) return Math.round(Number(live.rep));
  const seed = NEW_GAME.factionRep && NEW_GAME.factionRep[id];
  return Number.isFinite(Number(seed)) ? Math.round(Number(seed)) : 0;
}

function clampRep(r) { return Math.max(REP_MIN, Math.min(REP_MAX, Number(r) || 0)); }

function nextTierInfo(rep) {
  const r = clampRep(rep);
  for (const t of FACTION_TIERS) {
    if (r < t.min) return { name: t.name, need: t.min - r, at: t.min };
  }
  return null; // already Hero
}

function signed(value) {
  const n = Math.round(Number(value) || 0);
  return `${n > 0 ? '+' : ''}${n}`;
}

function liveFaction(state, id) {
  return (state && state.factions && state.factions[id]) || null;
}

function relationEntries(meta) {
  return Object.entries((meta && meta.relations) || {})
    .map(([id, weight]) => ({ id, weight: Number(weight) || 0 }))
    .filter((entry) => Math.abs(entry.weight) >= 0.19)
    .sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight))
    .slice(0, 7);
}

/** The next contract rung and what it buys, in one line; or the top when every rung is reached. */
function nextRungLine(rep) {
  const rows = factionContractLadderRows(rep);
  const next = rows.find((row) => !row.unlocked);
  if (!next) return 'Every contract rung is open.';
  return `Next: ${next.name} at ${next.minRep > 0 ? '+' : ''}${next.minRep} · ${next.unlocks}`;
}

function heroHtml(n, w, cls = '') {
  return `<div class="k-hero"><span class="k-hero__n${cls ? ` ${cls}` : ''}">${n}</span><span class="k-hero__w">${w}</span></div>`;
}

export function createFactionsScreen(ctx) {
  const el = document.createElement('div');
  el.className = 'k-panel sx-fac';

  // faction list (real names from FACTION_META; rep from state)
  const factions = FACTION_META.map((m) => ({ id: m.id, name: m.name || m.id, meta: m }));
  let selectedId = factions[0] && factions[0].id;
  let picked = false;

  el.innerHTML = factionsFrameHtml();

  const railEl = el.querySelector('.sx-fac__rail');
  const stageEl = el.querySelector('.sx-fac__stage');
  railEl.setAttribute('role', 'tablist');
  // ORRERY (design/frontend/ORRERY.md §6 Factions): the fourteen crests on an Orbit Ring with the
  // Hand at the chosen one and a standing arc round each, the reading beside it. The orbit lives
  // once in the stage and swings between renders; the reading is rebuilt as words.
  const orbitHost = document.createElement('div');
  orbitHost.className = 'orr-fac-orbit';
  const readingEl = document.createElement('div');
  readingEl.className = 'sx-fac-reading';
  stageEl.append(orbitHost, readingEl);
  let orbit = null;
  const stopDecrypt = [];

  function renderRail(state) {
    const authorityId = STATION_FACTION.get(state && state.ui && state.ui.dockedStationId);
    railEl.innerHTML =
      `<p class="k-caps">Powers</p>` +
      `<ul class="k-rows sx-fac__rows">` +
      factions.map((f) => {
        const rep = repOf(state, f.id);
        const tier = tierFor(rep);
        const frac = (clampRep(rep) - REP_MIN) / (REP_MAX - REP_MIN);
        const selected = f.id === selectedId;
        const authority = f.id === authorityId;
        return (
          `<li><button type="button" ${stationControlAttrs('faction')} class="sx-fac-row k-row${selected ? ' is-active' : ''}" data-fac="${escapeHtml(f.id)}" role="tab" aria-selected="${selected}" tabindex="${selected ? 0 : -1}"` +
            ` aria-label="${escapeHtml(f.name)}, ${escapeHtml(tier.name)} ${signed(rep)}${authority ? ', current station authority' : ''}">` +
            `<span class="sx-fac-row__body">` +
              // The crest rides the row. Fifteen names at identical weight was a spreadsheet;
              // a power is recognisable by its mark before its name is read.
              `<span class="sx-fac-row__crest" aria-hidden="true">${crest(f.id, 'badge')}</span>` +
              `<span class="k-row__name sx-fac-row__name">${authority ? '<span class="k-62">Authority</span>' : ''}${escapeHtml(f.name)}</span>` +
              `<span class="k-bar sx-fac-row__bar" aria-hidden="true"><span class="k-bar__fill sx-fac-row__fill" style="width:${(frac * 100).toFixed(1)}%"></span><span class="sx-fac-row__zero"></span></span>` +
            `</span>` +
            `<span class="k-row__num sx-fac-row__tier ${standingClass(rep)}">${rep === 0 ? '<span class="sx-fac-row__nil">—</span>' : signed(rep)}</span>` +
          `</button></li>`
        );
      }).join('') +
      `</ul>`;
  }

  function ladderRows(rows) {
    return `<ul class="k-rows sx-ladder">${rows}</ul>`;
  }

  function renderStage(state) {
    const f = factions.find((x) => x.id === selectedId) || factions[0];
    const rep = repOf(state, f.id);
    const tier = tierFor(rep);
    const cls = standingClass(rep);
    const next = nextTierInfo(rep);
    const live = liveFaction(state, f.id);
    const guidance = factionStandingGuidance(rep, f.meta || {}, live && live.lastDelta, {
      hideLastDelta: shouldHideOwnRepDelta(state),
    });
    const relations = relationEntries(f.meta);
    const authorityId = STATION_FACTION.get(state && state.ui && state.ui.dockedStationId);
    const controls = (f.meta && f.meta.controls) || [];
    const curIdx = tierIndex(rep);
    const buffer = Math.max(0, rep - FACTION_AGGRO_THRESHOLD);

    const standingLadder = FACTION_TIERS.map((t, i) => (
      `<li class="k-row k-row--static sx-ladder__step${i <= curIdx ? ' is-reached' : ''}${i === curIdx ? ' is-current' : ''}"${i === curIdx ? ' aria-current="true"' : ''}>` +
        `<span class="k-row__name${i === curIdx ? '' : ' k-62'} sx-ladder__name">${escapeHtml(t.name)}${i === curIdx ? ' <span class="k-t-fine k-signal">now</span>' : ''}</span>` +
        `<span class="k-row__num sx-ladder__min">${t.min > 0 ? '+' : ''}${t.min}</span>` +
      `</li>`
    )).join('');
    let marked = false;
    const contractLadder = factionContractLadderRows(rep).map((row) => {
      const next = !row.unlocked && !marked; if (next) marked = true;
      return (
      `<li class="k-row k-row--static sx-ladder__step${row.unlocked ? ' is-reached' : ''}${next ? ' is-next' : ''}">` +
        // A contract rung is a sentence -- "Recovery Work · R0-R1 local hauling · unlocked" -- so it
        // WRAPS. Truncating it with an ellipsis hides the part that says what the rung buys you.
        // The standing ladder above is one short tier name per row and keeps `k-row__name`.
        `<span class="sx-ladder__name sx-ladder__name--wrap${row.unlocked ? '' : ' k-62'}">${escapeHtml(row.name)} · ${escapeHtml(row.unlocks)}` +
          `<span class="k-row__sub"> · ${row.aspirational ? 'sealed' : row.unlocked ? 'unlocked' : 'locked'}</span></span>` +
        `<span class="k-row__num sx-ladder__min">${row.minRep > 0 ? '+' : ''}${row.minRep}</span>` +
      `</li>`
      );
    }).join('');
    const relationRows = relations.map((relation) => {
      const related = factions.find((candidate) => candidate.id === relation.id);
      const name = related ? related.name : relation.id;
      const kind = relation.weight > 0 ? 'Align' : 'Rival';
      return (
        `<li><button type="button" ${stationControlAttrs('faction-relation')} class="sx-fac-node k-row" data-fac="${escapeHtml(relation.id)}"` +
          ` aria-label="Inspect ${escapeHtml(name)}, ${relation.weight > 0 ? 'aligned' : 'rival'} relation ${Math.abs(relation.weight).toFixed(2)}">` +
          `<span class="k-row__name">${escapeHtml(name)}</span>` +
          `<span class="${relation.weight > 0 ? 'k-good' : 'k-bad'} sx-fac-node__kind">${kind}</span>` +
          `<span class="k-row__num">${Math.abs(relation.weight).toFixed(2)} <span class="k-row__sub">${signed(repOf(state, relation.id))}</span></span>` +
        `</button></li>`
      );
    }).join('');

    readingEl.innerHTML =
      `<div class="sx-fac-overview">` +
        `<span class="sx-fac-crest" aria-hidden="true">${crest(f.id, 'hero')}</span>` +
        `<p class="k-caps">${f.id === authorityId ? 'Current station authority' : 'External power'}</p>` +
        `<h2 class="k-display k-t-title sx-fac-ident__name">${entitySpanHtml('faction:' + f.id, escapeHtml(f.name))}</h2>` +
        `<p class="k-sentence k-sentence--emph sx-fac-ident__flag">${f.id === authorityId ? 'Current station authority' : 'External power'}` +
          `${controls.length ? ` · ${escapeHtml(controls.slice(0, 3).join(' · '))}` : ' · no confirmed jurisdiction at this berth'}</p>` +
        `<div class="sx-fac-heroes" aria-label="Standing with ${escapeHtml(f.name)}">` +
          heroHtml(`<span class="sx-fac-tier">${escapeHtml(tier.name)}</span>${signed(rep)}`, escapeHtml(guidance.last), cls) +
          heroHtml(next ? `${next.need}` : 'Peak held', next ? `to ${escapeHtml(next.name)}` : 'the top of the ladder') +
          heroHtml(`${buffer}`, 'above the aggro line', buffer <= 0 ? 'k-bad' : '') +
        `</div>` +
        `<div class="sx-fac__detail">` +
          `<div class="sx-fac-ladder">` +
            `<p class="k-caps">Standing ladder</p>` +
            // ORRERY: the ladder as a ruler -- the tiers as ticks, the aggro line red, a light cursor
            standingScaleSvg({ rep, tiers: FACTION_TIERS, aggro: FACTION_AGGRO_THRESHOLD, width: 560,
              rungs: factionContractLadderRows(rep).map((row) => ({ minRep: row.minRep, name: row.name, state: row.aspirational ? 'sealed' : row.unlocked ? 'reached' : 'locked' })) }) +
            ladderRows(standingLadder) +
          `</div>` +
          `<div class="sx-fac-ladder sx-fac-contracts" aria-label="Contract access">` +
            `<p class="k-caps">Contract access</p>` +
            ladderRows(contractLadder) +
            // the rungs hang off the standing scale; the reading names the next one and what it buys
            `<p class="k-sentence sx-fac-rung-next">${escapeHtml(nextRungLine(rep))}</p>` +
          `</div>` +
          `<div class="sx-fac-intent">` +
            `<p class="k-caps">Next move</p>` +
            `<p class="k-sentence k-sentence--emph">${escapeHtml(guidance.plan)}</p>` +
          `</div>` +
          `<div class="sx-fac-network" aria-label="Relations of ${escapeHtml(f.name)}">` +
            // folded: a word that unfolds the relations when asked
            `<button type="button" class="k-word k-word--fine sx-fac-network__toggle" data-relations-toggle aria-expanded="false">Relations${relations.length ? ` · ${relations.length}` : ''}</button>` +
            (relations.length
              ? `<ul class="k-rows sx-fac-network__rows" hidden>${relationRows}</ul>`
              : `<p class="k-empty sx-fac-network__empty" hidden>No material relations recorded.</p>`) +
          `</div>` +
        `</div>` +
      `</div>`;
    composeStage(state, f);
  }

  /** The orbit swings to the chosen power; the reading's labels resolve. */
  function composeStage(state, f) {
    if (!orbit) orbit = createCrestOrbit(orbitHost, { crestSize: 44, centreSize: 150 });
    const authorityId = STATION_FACTION.get(state && state.ui && state.ui.dockedStationId);
    orbit.set({
      items: factions.map((x) => { const r = repOf(state, x.id); return { id: x.id, name: x.name, short: (x.meta && x.meta.short) || x.name, rep: r, tierName: tierFor(r).name, tierSteps: tierIndex(r) - 4 }; }),
      selectedId: f.id,
      authorityId,
      swing: picked,
    });
    for (const stop of stopDecrypt.splice(0)) stop();
    if (reducedMotion()) return;
    const targets = [
      readingEl.querySelector('.sx-fac-ident__name .sf-entity-link') || readingEl.querySelector('.sx-fac-ident__name'),
      ...readingEl.querySelectorAll('.sx-fac-overview > .k-caps, .sx-fac__detail .k-caps'),
    ].filter(Boolean);
    targets.forEach((node, i) => { const text = node.textContent; if (text) stopDecrypt.push(decrypt(node, text, { duration: 240, delay: 30 + i * 40 })); });
  }

  function refresh(c) {
    const state = (c || ctx).state || {};
    renderRail(state);
    renderStage(state);
  }

  function selectFaction(id, focus) {
    if (!factions.some((f) => f.id === id) || id === selectedId) return;
    selectedId = id;
    picked = true;
    const state = (ctx && ctx.state) || {};
    renderRail(state);
    renderStage(state);
    const active = railEl.querySelector(`[data-fac="${CSS.escape(id)}"]`);
    if (active && active.scrollIntoView) active.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'nearest', inline: 'center' });
    if (focus && active && typeof active.focus === 'function') active.focus();
    if (ctx && ctx.bus) ctx.bus.emit('audio:cue', { id: 'ui_tab' });
  }

  function onRelationsToggle(ev) {
    const t = ev.target && ev.target.closest && ev.target.closest('[data-relations-toggle]');
    if (!t) return false;
    const box = t.nextElementSibling;
    const open = t.getAttribute('aria-expanded') !== 'true';
    t.setAttribute('aria-expanded', String(open));
    if (box) box.hidden = !open;
    return true;
  }

  function onFactionClick(ev) {
    if (onRelationsToggle(ev)) return;
    const btn = ev.target.closest('[data-fac]');
    if (!btn) return;
    selectFaction(btn.getAttribute('data-fac'), false);
  }
  railEl.addEventListener('click', onFactionClick);
  stageEl.addEventListener('click', onFactionClick);

  // Arrow keys walk the powers (a tablist: roving tabindex, selection follows focus).
  railEl.addEventListener('keydown', (ev) => {
    const rows = [...railEl.querySelectorAll('[data-fac]')];
    const cur = rows.indexOf(ev.target.closest('[data-fac]'));
    if (cur < 0 || !rows.length) return;
    let next = -1;
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowRight') next = (cur + 1) % rows.length;
    else if (ev.key === 'ArrowUp' || ev.key === 'ArrowLeft') next = (cur - 1 + rows.length) % rows.length;
    else if (ev.key === 'Home') next = 0;
    else if (ev.key === 'End') next = rows.length - 1;
    else return;
    ev.preventDefault();
    selectFaction(rows[next].getAttribute('data-fac'), true);
  });

  const onRepChanged = (payload = {}) => {
    if (!payload.factionId || payload.factionId === selectedId) refresh(ctx);
    else renderRail((ctx && ctx.state) || {});
  };
  if (ctx.bus && ctx.bus.on) ctx.bus.on('faction:repChanged', onRepChanged);

  return {
    el,
    onShow(c) {
      const state = (c || ctx).state || {};
      if (!picked) {
        const authorityId = STATION_FACTION.get(state && state.ui && state.ui.dockedStationId);
        if (authorityId && factions.some((f) => f.id === authorityId)) selectedId = authorityId;
        picked = true;
      }
      refresh(c);
    },
    refresh,
    dispose() {
      if (ctx.bus && ctx.bus.off) ctx.bus.off('faction:repChanged', onRepChanged);
      for (const stop of stopDecrypt.splice(0)) stop();
      if (orbit) { orbit.dispose(); orbit = null; }
    },
  };
}
