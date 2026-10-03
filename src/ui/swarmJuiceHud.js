// SWARM-02 — the arcade juice layer (SWARM_ARCADE §5, §10 step 2).
//
// The DOM half of the swarm-only feedback layer. swarmJuice (src/systems/swarmJuice.js)
// publishes the honest events — kill popups with cause words, the multi-kill announcer,
// round slam and clear tally, boss card/bar/down, chain tiers and the shatter — and this
// layer draws them, top-centre and at the kill point, louder than Adventure is allowed
// to be (§11 decision 4: the in-flight arcade layer is Swarm's own style).
//
// Gates: a live swarm-ruleset run in flight mode, and the one setting —
// Arcade effects: Full / Reduced / Off (settings.video.arcadeEffects), which also obeys
// motionReduce/flashReduce through arcadeEffectsLevel. Reduced keeps every word and drops
// the motion; Off drops the layer entirely. Popups are pooled (30+ bodies die a minute).
//
// Ownership: read-only presentation. It never writes state.run and never emits gameplay
// intents; the only outbound traffic is its own DOM.

import { isSwarmRuleset } from '../systems/survivalSwarm.js';
import { SWARM_CHAIN_WINDOW_S } from '../systems/swarmChain.js';
import { chainWindowRemaining } from './survivalHud.js';
import {
  arcadeEffectsLevel,
  swarmChainNextTier,
  swarmChainTier,
} from '../data/swarmJuice.js';

const STYLE_ID = 'sf-sj-css';
const POPUP_POOL = 40;
/** Sim-second lifetimes — pause and slow-time hold the beat with the world. */
const POPUP_TTL_S = 1.05;
const CALL_TTL_S = 1.35;
const TIER_TTL_S = 1.6;
const SLAM_LINGER_S = 0.9;
const TALLY_ROW_STAGGER_S = 0.16;
const TALLY_HOLD_S = 3.4;
const CARD_TTL_S = 3.6;
const BOSSDOWN_TTL_S = 2.2;
const SHATTER_TTL_S = 1.7;
const MAX_CALL_LINES = 3;

/** The popup's one line: the money/score figure first, the cause word riding it. */
export function swarmPopupText({ word = '', score = 0, credits = 0 } = {}) {
  const parts = [];
  if (Number.isFinite(score) && score > 0) parts.push(`+${Math.round(score)}`);
  else if (Number.isFinite(credits) && credits > 0) parts.push(`+${Math.round(credits)} CR`);
  if (typeof word === 'string' && word) parts.push(word);
  return parts.join(' ');
}

/** The countdown-era slam text: the round figure plus the card's sub-line. */
export function swarmSlamSub({ boss = null, newcomer = null } = {}) {
  if (boss && typeof boss.name === 'string' && boss.name) return `BOSS · ${boss.name}`;
  if (newcomer && typeof newcomer.name === 'string' && newcomer.name) {
    return `NEW THREAT · ${newcomer.name}`;
  }
  return '';
}

/** The tier label the hero carries, with the next mark the player is chasing. */
export function swarmHeroTierText(chain) {
  const tier = swarmChainTier(chain);
  const next = swarmChainNextTier(chain);
  if (tier && next) return `${tier.name} · next ${next.name} ${next.at}`;
  if (tier) return tier.name;
  if (next) return `next ${next.name} ${next.at}`;
  return '';
}

function makeNode(doc, tag, cls, parent, text) {
  const node = doc.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  if (parent) parent.appendChild(node);
  return node;
}

export const swarmJuiceHud = {
  id: 'swarmJuiceHud',
  name: 'swarmJuiceHud',

  init(ctx) {
    this.destroy();
    this.state = ctx.state;
    this.bus = ctx.bus || null;
    this.helpers = ctx.helpers || null;
    this._dom = null;
    this._resetModel();
    this._unsubs = [];
    if (!this.bus || typeof this.bus.on !== 'function') return;
    this._unsubs.push(this.bus.on('swarm:killPopup', (p) => this._onPopup(p)));
    this._unsubs.push(this.bus.on('swarm:announce', (p) => this._onAnnounce(p)));
    this._unsubs.push(this.bus.on('swarm:roundSlam', (p) => this._onSlam(p)));
    this._unsubs.push(this.bus.on('swarm:roundClear', (p) => this._onClear(p)));
    this._unsubs.push(this.bus.on('swarm:bossIntro', (p) => this._onBossIntro(p)));
    this._unsubs.push(this.bus.on('swarm:bossHp', (p) => this._onBossHp(p)));
    this._unsubs.push(this.bus.on('swarm:bossDown', (p) => this._onBossDown(p)));
    this._unsubs.push(this.bus.on('swarm:chain', (p) => this._onChain(p)));
    this._unsubs.push(this.bus.on('swarm:chainBroken', (p) => this._onChainBroken(p)));
    this._unsubs.push(this.bus.on('swarm:chainTier', (p) => this._onChainTier(p)));
    this._unsubs.push(this.bus.on('swarm:chainShatter', (p) => this._onShatter(p)));
    this._unsubs.push(this.bus.on('run:waveStarted', () => this._onFight()));
    this._unsubs.push(this.bus.on('run:started', () => this._resetModel()));
    this._unsubs.push(this.bus.on('run:ended', () => this._resetModel()));
  },

  destroy() {
    for (const off of this._unsubs || []) if (typeof off === 'function') off();
    this._unsubs = [];
    if (this._dom && this._dom.root && this._dom.root.parentNode) {
      this._dom.root.parentNode.removeChild(this._dom.root);
    }
    this._dom = null;
  },

  newGame() {
    this._resetModel();
  },

  _resetModel() {
    this._chain = 0;
    this._chainBest = 0;
    this._chainStep = 0;
    this._chainAt = null;
    this._tierName = '';
    this._tierUntil = 0;
    this._calls = [];
    this._popups = [];
    this._slam = null;
    this._fightUntil = 0;
    this._clear = null;
    this._card = null;
    this._bossHp = null;
    this._bossDownUntil = 0;
    this._shatter = null;
    this._level = 'full';
  },

  update(dt, state) {
    if (typeof document === 'undefined') return;
    const st = state || this.state;
    if (!st) return;
    const run = st.run;
    const live = !!(run && run.kind === 'survival' && run.phase !== 'inactive'
      && isSwarmRuleset(run.ruleset));
    this._level = arcadeEffectsLevel(st.settings);
    const visible = live && st.mode === 'flight' && !(st.ui && st.ui.docked)
      && this._level !== 'off';
    if (!visible) { this._hide(); return; }
    const dom = this._ensureDom();
    if (!dom) return;
    this._show(dom);
    const reduced = this._level === 'reduced';
    if (dom.root.dataset.level !== this._level) dom.root.dataset.level = this._level;

    const simNow = Number.isFinite(st.simTime) ? st.simTime : 0;
    const step = Math.max(0, Number(dt) || 0);

    // --- the chain hero -----------------------------------------------------------
    const showChain = this._chain > 0;
    dom.hero.hidden = !showChain;
    if (showChain) {
      this._text(dom.heroFig, `${this._chain}`);
      const tier = swarmChainTier(this._chain);
      const tierId = tier ? tier.id : 'base';
      if (dom.hero.dataset.tier !== tierId) dom.hero.dataset.tier = tierId;
      this._text(dom.heroTier, this._tierName && simNow < this._tierUntil
        ? this._tierName
        : swarmHeroTierText(this._chain));
      const badge = this._chainStep === 2 ? 'MIXED +2' : '';
      this._text(dom.heroMix, badge);
      dom.heroMix.hidden = !badge;
      const remaining = chainWindowRemaining(this._chainAt, simNow);
      const deplete = Math.max(0, Math.min(1, remaining / SWARM_CHAIN_WINDOW_S));
      dom.heroDeplete.style.transform = `scaleX(${deplete.toFixed(3)})`;
      this._text(dom.heroBest, this._chainBest > this._chain ? `BEST ${this._chainBest}` : '');
    }

    // --- the announcer ------------------------------------------------------------
    while (this._calls.length && simNow > this._calls[0].until) {
      const dead = this._calls.shift();
      if (dead.node) dead.node.remove();
    }
    // A repeated kind (PILE-UP ×N growing) replaces its own line in place.
    dom.calls.hidden = this._calls.length === 0;
    for (const call of this._calls) {
      if (call.node && call.node.textContent !== call.text) call.node.textContent = call.text;
    }

    // --- the slam / FIGHT beat -----------------------------------------------------
    const slam = this._slam;
    if (slam) {
      dom.slam.hidden = false;
      this._text(dom.slamTitle, slam.title);
      this._text(dom.slamSub, slam.sub);
      dom.slamSub.hidden = !slam.sub;
    } else if (simNow < this._fightUntil && this._fightWord) {
      dom.slam.hidden = false;
      this._text(dom.slamTitle, this._fightWord);
      dom.slamSub.hidden = true;
    } else {
      dom.slam.hidden = true;
    }
    void step; void reduced;

    // --- the clear tally ------------------------------------------------------------
    if (this._clear) {
      const age = simNow - this._clear.at;
      const hold = this._clear.rows.length * TALLY_ROW_STAGGER_S + TALLY_HOLD_S;
      if (age > hold) {
        this._clear = null;
        dom.tally.hidden = true;
      } else {
        dom.tally.hidden = false;
        this._text(dom.tallyTitle, `ROUND ${this._clear.wave} CLEAR`);
        this._clear.rows.forEach((row, i) => {
          const node = dom.tallyRows[i];
          if (!node) return;
          const on = age >= i * TALLY_ROW_STAGGER_S;
          node.hidden = !on;
          if (on) this._text(node, `${row.label}  ${row.value}`);
        });
      }
    } else {
      dom.tally.hidden = true;
    }

    // --- the boss furniture ----------------------------------------------------------
    const card = this._card;
    if (card && simNow < card.until) {
      dom.card.hidden = false;
      this._text(dom.cardTitle, card.title);
      this._text(dom.cardLine, card.line || '');
      dom.cardLine.hidden = !card.line;
    } else {
      dom.card.hidden = true;
      this._card = null;
    }
    if (this._bossHp && simNow >= this._bossDownUntil) {
      dom.boss.hidden = false;
      this._text(dom.bossName, this._bossHp.name);
      dom.bossFill.style.transform = `scaleX(${Math.max(0, Math.min(1, this._bossHp.frac)).toFixed(3)})`;
      this._text(dom.bossCount, this._bossHp.total > 1
        ? `${this._bossHp.alive}/${this._bossHp.total}` : '');
    } else {
      dom.boss.hidden = true;
    }
    dom.bossDown.hidden = !(simNow < this._bossDownUntil);

    // --- the shatter ------------------------------------------------------------------
    if (this._shatter && simNow < this._shatter.until) {
      dom.shatter.hidden = false;
      this._text(dom.shatter, this._shatter.text);
    } else {
      dom.shatter.hidden = true;
      this._shatter = null;
    }

    // --- the popups ---------------------------------------------------------------------
    let write = 0;
    for (let i = 0; i < this._popups.length; i++) {
      const p = this._popups[i];
      if (simNow - p.at <= POPUP_TTL_S) this._popups[write++] = p;
      else p.node.hidden = true;
    }
    this._popups.length = write;
    const project = this.helpers && typeof this.helpers.worldToScreen === 'function'
      ? this.helpers.worldToScreen : null;
    if (project) {
      for (const p of this._popups) {
        _world.x = p.wx; _world.z = p.wz;
        const s = project(_world, _screen);
        if (s && s.onScreen !== false && Number.isFinite(s.x) && Number.isFinite(s.y)) {
          p.node.style.transform = `translate(${Math.round(s.x)}px, ${Math.round(s.y)}px)`;
          p.node.hidden = false;
        } else {
          p.node.hidden = true;
        }
      }
    }
  },

  // --- bus receipts -------------------------------------------------------------------

  _onChain(p) {
    this._chain = p && Number.isFinite(p.chain) ? p.chain : 0;
    if (p && Number.isFinite(p.best) && p.best > this._chainBest) this._chainBest = p.best;
    this._chainStep = p && Number.isFinite(p.step) ? p.step : 0;
    this._chainAt = p && Number.isFinite(p.at) ? p.at : null;
    if (this._chain > 0) this._shatter = null;
  },

  _onChainBroken() {
    this._chain = 0;
    this._chainStep = 0;
    this._chainAt = null;
  },

  _onChainTier(p) {
    if (!p || typeof p.name !== 'string') return;
    this._tierName = p.name;
    this._tierUntil = (this.state && Number.isFinite(this.state.simTime) ? this.state.simTime : 0) + TIER_TTL_S;
  },

  _onShatter(p) {
    const ended = p && Number.isFinite(p.chain) ? p.chain : 0;
    if (ended <= 0) return;
    const now = this.state && Number.isFinite(this.state.simTime) ? this.state.simTime : 0;
    this._shatter = { text: `CHAIN ${ended} LOST`, until: now + SHATTER_TTL_S };
  },

  _onPopup(p) {
    if (!p || !p.pos || !Number.isFinite(p.pos.x) || !Number.isFinite(p.pos.z)) return;
    const text = swarmPopupText(p);
    if (!text || !this._dom) return; // transient — if the layer isn't mounted there is nothing to show
    const now = this.state && Number.isFinite(this.state.simTime) ? this.state.simTime : 0;
    let node = this._popupPool.find((n) => n.hidden) || null;
    if (!node) {
      // Pool pressure: the oldest live popup yields its seat — the newest kill always reads.
      const oldest = this._popups.shift();
      if (oldest) node = oldest.node;
    }
    if (!node) return;
    node.textContent = text;
    node.dataset.cause = p.cause || '';
    node.hidden = false;
    this._popups.push({ node, wx: p.pos.x, wz: p.pos.z, at: now, text });
  },

  _onAnnounce(p) {
    if (!p || typeof p.text !== 'string' || !p.text || !this._dom) return;
    const now = this.state && Number.isFinite(this.state.simTime) ? this.state.simTime : 0;
    const existing = this._calls.find((c) => c.kind === p.kind);
    if (existing) {
      existing.text = p.text;
      existing.until = now + CALL_TTL_S;
      return;
    }
    const node = makeNode(document, 'div', 'sf-sj__call', this._dom.calls);
    node.textContent = p.text;
    node.dataset.kind = p.kind || '';
    this._calls.push({ kind: p.kind || '', text: p.text, node, until: now + CALL_TTL_S });
    while (this._calls.length > MAX_CALL_LINES) {
      const dead = this._calls.shift();
      if (dead.node) dead.node.remove();
    }
  },

  _onSlam(p) {
    if (!p || !Number.isInteger(p.wave)) return;
    this._slam = {
      wave: p.wave,
      title: `ROUND ${String(Math.max(1, p.wave)).padStart(2, '0')}`,
      sub: swarmSlamSub(p),
    };
    this._fightWord = 'FIGHT';
    this._fightUntil = 0;
    // A new round retires the last one's clear card.
    this._clear = null;
    if (this._dom) this._dom.tally.hidden = true;
  },

  _onFight() {
    if (!this._slam) return;
    const now = this.state && Number.isFinite(this.state.simTime) ? this.state.simTime : 0;
    this._fightUntil = now + SLAM_LINGER_S;
    this._slam = null;
  },

  _onClear(p) {
    if (!p || !Array.isArray(p.tally)) return;
    const now = this.state && Number.isFinite(this.state.simTime) ? this.state.simTime : 0;
    this._clear = { wave: p.wave || 0, rows: p.tally, at: now };
  },

  _onBossIntro(p) {
    if (!p || typeof p.name !== 'string' || !p.name) return;
    const now = this.state && Number.isFinite(this.state.simTime) ? this.state.simTime : 0;
    this._card = { title: p.name, line: p.line || '', until: now + CARD_TTL_S };
    this._bossHp = { name: p.name, frac: 1, alive: 1, total: 1 };
    this._bossDownUntil = 0;
  },

  _onBossHp(p) {
    if (!p) return;
    this._bossHp = {
      name: typeof p.name === 'string' && p.name ? p.name : (this._bossHp && this._bossHp.name) || 'CHAMPION',
      frac: Number.isFinite(p.frac) ? p.frac : 1,
      alive: Number.isInteger(p.alive) ? p.alive : 1,
      total: Number.isInteger(p.total) ? p.total : 1,
    };
  },

  _onBossDown(p) {
    const now = this.state && Number.isFinite(this.state.simTime) ? this.state.simTime : 0;
    this._bossDownUntil = now + BOSSDOWN_TTL_S;
    if (this._dom) {
      this._text(this._dom.bossDown, `BOSS DOWN${p && p.name ? ` · ${p.name}` : ''}`);
    }
    this._bossHp = null;
  },

  // --- DOM ----------------------------------------------------------------------------

  _hide() {
    if (this._dom && this._dom.root) this._dom.root.hidden = true;
  },

  _show(dom) {
    if (dom.root.hidden) dom.root.hidden = false;
  },

  _text(node, text) {
    if (node && node.textContent !== text) node.textContent = text;
  },

  _injectCss() {
    const doc = document;
    if (doc.getElementById(STYLE_ID)) return;
    const style = doc.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    doc.head.appendChild(style);
  },

  _ensureDom() {
    if (this._dom && this._dom.root && this._dom.root.isConnected !== false) return this._dom;
    const doc = document;
    const host = doc.getElementById('hud') || doc.getElementById('ui-root') || doc.body;
    if (!host) return null;
    this._injectCss();

    const root = makeNode(doc, 'div', 'sf-sj');
    root.setAttribute('aria-hidden', 'true');
    root.hidden = true;

    // The chain is the hero — top-centre, biggest figure in the arena.
    const hero = makeNode(doc, 'div', 'sf-sj__hero', root);
    const heroTier = makeNode(doc, 'div', 'sf-sj__herotier', hero);
    const heroRow = makeNode(doc, 'div', 'sf-sj__herorow', hero);
    const heroFig = makeNode(doc, 'span', 'sf-sj__herofig', heroRow);
    const heroMix = makeNode(doc, 'span', 'sf-sj__heromix', heroRow);
    const heroBest = makeNode(doc, 'span', 'sf-sj__herobest', heroRow);
    const heroTrack = makeNode(doc, 'div', 'sf-sj__herotrack', hero);
    const heroDeplete = makeNode(doc, 'div', 'sf-sj__herodeplete', heroTrack);
    hero.hidden = true;

    // The announcer, just under the hero.
    const calls = makeNode(doc, 'div', 'sf-sj__calls', root);
    calls.hidden = true;
    const shatter = makeNode(doc, 'div', 'sf-sj__shatter', root);
    shatter.hidden = true;

    // The round slam.
    const slam = makeNode(doc, 'div', 'sf-sj__slam', root);
    const slamTitle = makeNode(doc, 'div', 'sf-sj__slamtitle', slam);
    const slamSub = makeNode(doc, 'div', 'sf-sj__slamsub', slam);
    slam.hidden = true;

    // The clear tally.
    const tally = makeNode(doc, 'div', 'sf-sj__tally', root);
    const tallyTitle = makeNode(doc, 'div', 'sf-sj__tallytitle', tally);
    const tallyRows = [];
    for (let i = 0; i < 4; i++) {
      const row = makeNode(doc, 'div', 'sf-sj__tallyrow', tally);
      row.hidden = true;
      tallyRows.push(row);
    }
    tally.hidden = true;

    // The boss furniture.
    const card = makeNode(doc, 'div', 'sf-sj__card', root);
    const cardTitle = makeNode(doc, 'div', 'sf-sj__cardtitle', card);
    const cardLine = makeNode(doc, 'div', 'sf-sj__cardline', card);
    card.hidden = true;
    const boss = makeNode(doc, 'div', 'sf-sj__boss', root);
    const bossName = makeNode(doc, 'div', 'sf-sj__bossname', boss);
    const bossTrack = makeNode(doc, 'div', 'sf-sj__bosstrack', boss);
    const bossFill = makeNode(doc, 'div', 'sf-sj__bossfill', bossTrack);
    const bossCount = makeNode(doc, 'div', 'sf-sj__bosscount', boss);
    boss.hidden = true;
    const bossDown = makeNode(doc, 'div', 'sf-sj__bossdown', root);
    bossDown.hidden = true;

    // The pooled kill popups — absolutely positioned, re-projected each frame.
    const popLayer = makeNode(doc, 'div', 'sf-sj__pops', root);
    this._popupPool = [];
    for (let i = 0; i < POPUP_POOL; i++) {
      const pop = makeNode(doc, 'div', 'sf-sj__pop', popLayer);
      pop.hidden = true;
      this._popupPool.push(pop);
    }

    host.appendChild(root);
    this._dom = {
      root, hero, heroTier, heroFig, heroMix, heroBest, heroDeplete,
      calls, shatter, slam, slamTitle, slamSub,
      tally, tallyTitle, tallyRows,
      card, cardTitle, cardLine, boss, bossName, bossFill, bossCount, bossDown,
    };
    return this._dom;
  },
};

const _world = { x: 0, y: 0, z: 0 };
const _screen = { x: 0, y: 0, onScreen: false };

// The louder Swarm register: same ink and faces as the instrument grammar, bigger and
// brighter, with motion that collapses to still type under Reduced (or the global
// reduce-motion flag). No backdrop-filter, no second palette — tier colours ride the
// role tokens, and words are never the only channel for a beat (each carries its text).
const CSS = `
.sf-sj { position:fixed; inset:0; z-index:14; pointer-events:none; overflow:hidden;
  font-family:var(--dp-face-etch, var(--sf-subhead-face)); }
.sf-sj[hidden] { display:none; }
/* — the chain hero — */
.sf-sj__hero { position:absolute; top:3.4vh; left:50%; transform:translateX(-50%);
  display:flex; flex-direction:column; align-items:center; gap:2px; }
.sf-sj__hero[hidden] { display:none; }
.sf-sj__herotier { font-weight:700; font-size:13px; letter-spacing:.34em; text-transform:uppercase;
  color:var(--dp-ink-mute, var(--sf-calm)); }
.sf-sj__herorow { display:flex; align-items:baseline; gap:12px; }
.sf-sj__herofig { font-weight:800; font-size:54px; line-height:1; font-variant-numeric:tabular-nums;
  color:var(--dp-ink, var(--sf-paper)); text-shadow:var(--dp-emit-lamp, 0 0 18px rgb(242 185 80 / .35)); }
.sf-sj__hero[data-tier="ignition"] .sf-sj__herofig { color:#ffd27a; }
.sf-sj__hero[data-tier="flare"] .sf-sj__herofig { color:#ffab4d; }
.sf-sj__hero[data-tier="nova"] .sf-sj__herofig { color:#ff7a4d; }
.sf-sj__hero[data-tier="supernova"] .sf-sj__herofig,
.sf-sj__hero[data-tier="singularity"] .sf-sj__herofig { color:#ff5a5a;
  text-shadow:0 0 22px rgb(255 90 90 / .5); }
.sf-sj__hero[data-tier="ignition"] .sf-sj__herotier,
.sf-sj__hero[data-tier="flare"] .sf-sj__herotier { color:#ffcf8a; }
.sf-sj__hero[data-tier="nova"] .sf-sj__herotier,
.sf-sj__hero[data-tier="supernova"] .sf-sj__herotier,
.sf-sj__hero[data-tier="singularity"] .sf-sj__herotier { color:#ff8a7a; }
.sf-sj__heromix { font-weight:700; font-size:15px; letter-spacing:.18em;
  color:var(--dp-lamp-hot, #f2b950); }
.sf-sj__herobest { font-weight:500; font-size:12px; letter-spacing:.14em;
  font-variant-numeric:tabular-nums; color:var(--dp-ink-mute, var(--sf-calm)); }
.sf-sj__herotrack { width:130px; height:3px; background:rgb(232 226 212 / .20); overflow:hidden; }
.sf-sj__herodeplete { width:100%; height:100%; transform-origin:left center;
  background:var(--dp-lamp, #f2b950); }
/* — the announcer — */
.sf-sj__calls { position:absolute; top:16vh; left:50%; transform:translateX(-50%);
  display:flex; flex-direction:column; align-items:center; gap:4px; }
.sf-sj__calls[hidden] { display:none; }
.sf-sj__call { font-weight:800; font-size:30px; letter-spacing:.22em; text-transform:uppercase;
  color:var(--dp-ink, var(--sf-paper)); text-shadow:var(--dp-emit-lamp, 0 0 16px rgb(242 185 80 / .4));
  animation:sf-sj-pop .28s cubic-bezier(.2,.9,.3,1) both; }
.sf-sj__call[data-kind="pileup"], .sf-sj__call[data-kind="collateral"] { color:#ffb454; }
.sf-sj__call[data-kind="revenge"], .sf-sj__call[data-kind="closecall"] { color:#ff6a4d; }
.sf-sj__call[data-kind="lastone"], .sf-sj__call[data-kind="bossdown"] { color:#ffe08a; }
.sf-sj__shatter { position:absolute; top:24vh; left:50%; transform:translateX(-50%);
  font-weight:800; font-size:22px; letter-spacing:.26em; text-transform:uppercase;
  color:var(--dp-danger-hot, #ff5038); animation:sf-sj-drop .5s ease-out both; }
.sf-sj__shatter[hidden] { display:none; }
/* — the round slam — */
.sf-sj__slam { position:absolute; top:34vh; left:0; right:0; display:flex; flex-direction:column;
  align-items:center; gap:6px; animation:sf-sj-slam .34s cubic-bezier(.2,.9,.3,1) both; }
.sf-sj__slam[hidden] { display:none; }
.sf-sj__slamtitle { font-weight:800; font-size:64px; line-height:1; letter-spacing:.3em;
  text-transform:uppercase; color:var(--dp-ink, var(--sf-paper));
  text-shadow:var(--dp-emit-lamp, 0 0 26px rgb(242 185 80 / .4)); }
.sf-sj__slamsub { font-weight:700; font-size:15px; letter-spacing:.3em; text-transform:uppercase;
  color:var(--dp-lamp-hot, #f2b950); }
/* — the clear tally — */
.sf-sj__tally { position:absolute; top:38vh; left:0; right:0; display:flex; flex-direction:column;
  align-items:center; gap:4px; }
.sf-sj__tally[hidden] { display:none; }
.sf-sj__tallytitle { font-weight:800; font-size:34px; letter-spacing:.28em; text-transform:uppercase;
  color:var(--dp-lamp-hot, #f2b950); text-shadow:var(--dp-emit-lamp, 0 0 18px rgb(242 185 80 / .4)); }
.sf-sj__tallyrow { font-weight:650; font-size:16px; letter-spacing:.2em; text-transform:uppercase;
  font-variant-numeric:tabular-nums; color:var(--dp-ink, var(--sf-paper));
  animation:sf-sj-rise .3s ease-out both; }
.sf-sj__tallyrow[hidden] { display:none; }
/* — the boss furniture — */
.sf-sj__card { position:absolute; top:24vh; left:50%; transform:translateX(-50%);
  display:flex; flex-direction:column; align-items:center; gap:5px; padding:10px 26px;
  background:rgb(10 12 16 / .72); border-top:1px solid rgb(242 185 80 / .55);
  border-bottom:1px solid rgb(242 185 80 / .55); animation:sf-sj-slam .3s ease-out both; }
.sf-sj__card[hidden] { display:none; }
.sf-sj__cardtitle { font-weight:800; font-size:26px; letter-spacing:.26em; text-transform:uppercase;
  color:var(--dp-ink, var(--sf-paper)); }
.sf-sj__cardline { font-weight:550; font-size:13px; letter-spacing:.08em; font-style:italic;
  color:var(--dp-ink-mute, var(--sf-calm)); }
.sf-sj__boss { position:absolute; top:11vh; left:50%; transform:translateX(-50%); width:min(34vw,420px);
  display:flex; flex-direction:column; align-items:center; gap:3px; }
.sf-sj__boss[hidden] { display:none; }
.sf-sj__bossname { font-weight:700; font-size:12px; letter-spacing:.3em; text-transform:uppercase;
  color:var(--dp-danger-hot, #ff5038); }
.sf-sj__bosstrack { width:100%; height:6px; background:rgb(232 226 212 / .16); overflow:hidden; }
.sf-sj__bossfill { width:100%; height:100%; transform-origin:left center;
  background:var(--dp-danger, #ff5038); box-shadow:0 0 8px rgb(255 80 56 / .5);
  transition:transform .18s linear; }
.sf-sj__bosscount { font-weight:650; font-size:11px; letter-spacing:.2em;
  font-variant-numeric:tabular-nums; color:var(--dp-ink-mute, var(--sf-calm)); }
.sf-sj__bossdown { position:absolute; top:30vh; left:0; right:0; text-align:center;
  font-weight:800; font-size:44px; letter-spacing:.3em; text-transform:uppercase;
  color:var(--dp-lamp-hot, #f2b950); text-shadow:0 0 30px rgb(242 185 80 / .55);
  animation:sf-sj-slam .34s cubic-bezier(.2,.9,.3,1) both; }
.sf-sj__bossdown[hidden] { display:none; }
/* — the kill popups — */
.sf-sj__pops { position:absolute; inset:0; }
.sf-sj__pop { position:absolute; top:0; left:0; font-weight:750; font-size:15px;
  letter-spacing:.12em; text-transform:uppercase; font-variant-numeric:tabular-nums;
  color:var(--dp-ink, var(--sf-paper)); text-shadow:0 0 8px rgb(0 0 0 / .6);
  animation:sf-sj-float 1.05s ease-out both; will-change:transform; white-space:nowrap; }
.sf-sj__pop[data-cause="terrain"], .sf-sj__pop[data-cause="collision"],
.sf-sj__pop[data-cause="explosive"] { color:#ffcf8a; }
/* — beats — */
@keyframes sf-sj-pop { from { opacity:0; transform:scale(.72); } to { opacity:1; transform:scale(1); } }
@keyframes sf-sj-rise { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:none; } }
@keyframes sf-sj-slam { from { opacity:0; transform:translateX(-50%) scale(1.18); }
  60% { opacity:1; transform:translateX(-50%) scale(.98); } to { opacity:1; transform:translateX(-50%) scale(1); } }
@keyframes sf-sj-drop { from { opacity:1; transform:translateX(-50%) translateY(0) rotate(0deg); }
  to { opacity:0; transform:translateX(-50%) translateY(34px) rotate(4deg); } }
@keyframes sf-sj-float { from { opacity:1; margin-top:0; } to { opacity:0; margin-top:-34px; } }
/* Reduced keeps every word and drops the motion; accessibility flags read as reduced
   through arcadeEffectsLevel, so the class alone governs. */
.sf-sj[data-level="reduced"] .sf-sj__call, .sf-sj[data-level="reduced"] .sf-sj__slam,
.sf-sj[data-level="reduced"] .sf-sj__tallyrow, .sf-sj[data-level="reduced"] .sf-sj__card,
.sf-sj[data-level="reduced"] .sf-sj__shatter, .sf-sj[data-level="reduced"] .sf-sj__bossdown,
.sf-sj[data-level="reduced"] .sf-sj__pop { animation:none; }
html.sf-reduce-motion .sf-sj__call, html.sf-reduce-motion .sf-sj__slam,
html.sf-reduce-motion .sf-sj__tallyrow, html.sf-reduce-motion .sf-sj__card,
html.sf-reduce-motion .sf-sj__shatter, html.sf-reduce-motion .sf-sj__bossdown,
html.sf-reduce-motion .sf-sj__pop { animation:none; }
@media (forced-colors: active) {
  .sf-sj__herofig, .sf-sj__call, .sf-sj__slamtitle, .sf-sj__bossdown { color:CanvasText; text-shadow:none; }
  .sf-sj__bossfill, .sf-sj__herodeplete { background:Highlight; forced-color-adjust:none; }
}
`;

export default swarmJuiceHud;
