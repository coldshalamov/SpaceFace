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
import { icon, factionIcon } from '../icons.js';

const STATION_FACTION = new Map();
for (const sector of SECTORS) {
  for (const station of (sector.stations || [])) STATION_FACTION.set(station.id, station.factionId || sector.factionId || null);
}

const REP_MIN = -1000;
const REP_MAX = 1000;

/** The power's own heraldry as a kit crest (a generic mark for an id the icon set does not know). */
function crest(id, variant) {
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
          `<li><button type="button" class="sx-fac-row k-row${selected ? ' is-active' : ''}" data-fac="${escapeHtml(f.id)}" role="tab" aria-selected="${selected}" tabindex="${selected ? 0 : -1}"` +
            ` aria-label="${escapeHtml(f.name)}, ${escapeHtml(tier.name)} ${signed(rep)}${authority ? ', current station authority' : ''}">` +
            `<span class="sx-fac-row__body">` +
              `<span class="k-row__name sx-fac-row__name">${authority ? '<span class="k-62">Authority · </span>' : ''}${escapeHtml(f.name)}</span>` +
              `<span class="k-bar sx-fac-row__bar" aria-hidden="true"><span class="k-bar__fill sx-fac-row__fill" style="width:${(frac * 100).toFixed(1)}%"></span><span class="sx-fac-row__zero"></span></span>` +
            `</span>` +
            `<span class="k-row__num sx-fac-row__tier ${standingClass(rep)}">${signed(rep)}</span>` +
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
        `<span class="${i === curIdx ? 'k-row__name' : 'k-62'} sx-ladder__name">${escapeHtml(t.name)}${i === curIdx ? ' <span class="k-t-fine k-signal">now</span>' : ''}</span>` +
        `<span class="k-row__num sx-ladder__min">${t.min > 0 ? '+' : ''}${t.min}</span>` +
      `</li>`
    )).join('');
    const contractLadder = factionContractLadderRows(rep).map((row) => (
      `<li class="k-row k-row--static sx-ladder__step${row.unlocked ? ' is-reached' : ''}">` +
        `<span class="${row.unlocked ? 'k-row__name' : 'k-62'} sx-ladder__name">${escapeHtml(row.name)} · ${escapeHtml(row.unlocks)}` +
          `<span class="k-row__sub"> · ${row.aspirational ? 'future work' : row.unlocked ? 'unlocked' : 'locked'}</span></span>` +
        `<span class="k-row__num sx-ladder__min">${row.minRep > 0 ? '+' : ''}${row.minRep}</span>` +
      `</li>`
    )).join('');
    const relationRows = relations.map((relation) => {
      const related = factions.find((candidate) => candidate.id === relation.id);
      const name = related ? related.name : relation.id;
      const kind = relation.weight > 0 ? 'Align' : 'Rival';
      return (
        `<li><button type="button" class="sx-fac-node k-row" data-fac="${escapeHtml(relation.id)}"` +
          ` aria-label="Inspect ${escapeHtml(name)}, ${relation.weight > 0 ? 'aligned' : 'rival'} relation ${Math.abs(relation.weight).toFixed(2)}">` +
          `<span class="k-row__name">${escapeHtml(name)}</span>` +
          `<span class="${relation.weight > 0 ? 'k-good' : 'k-bad'} sx-fac-node__kind">${kind}</span>` +
          `<span class="k-row__num">${Math.abs(relation.weight).toFixed(2)} <span class="k-row__sub">${signed(repOf(state, relation.id))}</span></span>` +
        `</button></li>`
      );
    }).join('');

    stageEl.innerHTML =
      `<div class="sx-fac-overview">` +
        `<span class="sx-fac-crest" aria-hidden="true">${crest(f.id, 'hero')}</span>` +
        `<p class="k-caps">${f.id === authorityId ? 'Current station authority' : 'External power'}</p>` +
        `<h2 class="k-display k-t-title sx-fac-ident__name">${escapeHtml(f.name)}</h2>` +
        `<p class="k-sentence k-sentence--emph sx-fac-ident__flag">${f.id === authorityId ? 'Current station authority' : 'External power'}` +
          `${controls.length ? ` · ${escapeHtml(controls.slice(0, 3).join(' · '))}` : ' · no confirmed jurisdiction at this berth'}</p>` +
        `<div class="sx-fac-heroes" aria-label="Standing with ${escapeHtml(f.name)}">` +
          heroHtml(`${escapeHtml(tier.name)} ${signed(rep)}`, escapeHtml(guidance.last), cls) +
          heroHtml(next ? `${next.need}` : 'Peak held', next ? `reputation to ${escapeHtml(next.name)} · ${escapeHtml(guidance.next)}` : escapeHtml(guidance.next)) +
          heroHtml(`${buffer}`, `hostility buffer · ${escapeHtml(guidance.risk)}`, buffer <= 0 ? 'k-bad' : '') +
        `</div>` +
        `<div class="sx-fac__detail">` +
          `<div class="sx-fac-ladder">` +
            `<p class="k-caps">Standing ladder</p>` +
            ladderRows(standingLadder) +
          `</div>` +
          `<div class="sx-fac-ladder sx-fac-contracts" aria-label="Contract access">` +
            `<p class="k-caps">Contract access</p>` +
            ladderRows(contractLadder) +
          `</div>` +
          `<div class="sx-fac-intent">` +
            `<p class="k-caps">Next move</p>` +
            `<p class="k-sentence k-sentence--emph">${escapeHtml(guidance.plan)}</p>` +
          `</div>` +
          `<div class="sx-fac-network" aria-label="Relations of ${escapeHtml(f.name)}">` +
            `<p class="k-caps">Relations</p>` +
            (relations.length
              ? `<ul class="k-rows sx-fac-network__rows">${relationRows}</ul>`
              : `<p class="k-empty sx-fac-network__empty">No material relations recorded.</p>`) +
          `</div>` +
        `</div>` +
      `</div>`;
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

  function onFactionClick(ev) {
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
    },
  };
}
