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
export const TALLY_ROW_STAGGER_S = 0.16;
const TALLY_HOLD_S = 3.4;
const CARD_TTL_S = 2.0;
const BOSSDOWN_TTL_S = 2.2;
const SHATTER_TTL_S = 1.7;
// Two announcer lines at most: the centre column is one flow (see the CSS), and two lines plus
// one beat keep it clear of the ship at 1280x720. A third arrival retires the oldest line.
const MAX_CALL_LINES = 2;
/** A beat that waited this long behind a higher one is stale news — it is dropped, not shown late. */
const BEAT_STALE_S = 12;

/** The popup's one line: the money/score figure first, the cause word riding it. */
export function swarmPopupText({ word = '', score = 0, credits = 0 } = {}) {
  const parts = [];
  if (Number.isFinite(score) && score > 0) parts.push(`+${Math.round(score)}`);
  else if (Number.isFinite(credits) && credits > 0) parts.push(`+${Math.round(credits)} CR`);
  if (typeof word === 'string' && word) parts.push(word);
  return parts.join(' ');
}

/**
 * The countdown-era slam text: the round figure plus the card's sub-line.
 *
 * S14 moved the champions onto 5, 15, 25…, so a boss round can also be a debut round: wave 5's
 * Iron Maw lands with the Detonator Dart's first body, wave 15's Foreman with the Patrol
 * Lawman's, and the Brood's undertow and pox sac debut under the wave-55 and wave-75
 * champions. A boss round always raises the versus card and the boss bar, and both already
 * name the champion. That leaves this one sub-line as the only place a new threat can be
 * named. On a shared round it names the newcomer, not the boss a third time.
 */
export function swarmSlamSub({ boss = null, newcomer = null } = {}) {
  const bossName = boss && typeof boss.name === 'string' && boss.name ? boss.name : '';
  const newName = newcomer && typeof newcomer.name === 'string' && newcomer.name ? newcomer.name : '';
  if (newName) return `NEW THREAT · ${newName}`;
  if (bossName) return `BOSS · ${bossName}`;
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
    // inf-overdrive-mark: the opened window keeps a persistent mark on the chain hero while it
    // holds — the one-shot announcement named it, the hero keeps saying it until the chain breaks.
    this._unsubs.push(this.bus.on('swarm:overdrive', (p) => this._onHeroOverdrive(p)));
    this._unsubs.push(this.bus.on('run:waveStarted', () => this._onFight()));
    this._unsubs.push(this.bus.on('run:started', () => this._resetModel()));
    this._unsubs.push(this.bus.on('run:ended', () => this._resetModel()));
    this._unsubs.push(this.bus.on('swarm:scoreboardToggle', () => this._onScoreboardToggle()));
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
    this._overdriveRate = 0;
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
    this._boardOn = false;
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
      // inf-overdrive-mark: the window keeps its word on the hero — the tier line says it once
      // here, not just in the one-shot announcement — until the chain breaks or the run ends.
      const overdrive = this._overdriveRate > 0;
      if ((dom.hero.dataset.overdrive === '1') !== overdrive) {
        dom.hero.dataset.overdrive = overdrive ? '1' : '0';
      }
      const badge = overdrive
        ? `OVERDRIVE · GUNS ×${this._overdriveRate}`
        : (this._chainStep === 2 ? 'MIXED +2' : '');
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

    // --- the beat lane --------------------------------------------------------------
    // The centre column shows ONE big beat at a time, by priority: BOSS DOWN > round slam /
    // FIGHT > boss card > clear tally > Tab scoreboard. A beat that loses the lane waits (its
    // clock starts when it first shows) instead of drawing over the winner; the DOM is a flow
    // column too, so even two lit nodes could never stack on one another.
    const card = this._card;
    if (card && card.shownAt == null && simNow - card.at > BEAT_STALE_S) this._card = null;
    if (this._clear && this._clear.shownAt == null && simNow - this._clear.at > BEAT_STALE_S) this._clear = null;
    let beat = '';
    if (simNow < this._bossDownUntil) beat = 'bossDown';
    else if (this._slam || (simNow < this._fightUntil && this._fightWord)) beat = 'slam';
    else if (this._card && (this._card.shownAt == null || simNow < this._card.until)) beat = 'card';
    else if (this._clear) beat = 'clear';
    else if (this._boardOn) beat = 'board';
    this._beat = beat;

    const slam = this._slam;
    dom.slam.hidden = beat !== 'slam';
    if (beat === 'slam') {
      if (slam) {
        this._text(dom.slamTitle, slam.title);
        this._text(dom.slamSub, slam.sub);
        dom.slamSub.hidden = !slam.sub;
      } else {
        this._text(dom.slamTitle, this._fightWord);
        dom.slamSub.hidden = true;
      }
    }
    dom.bossDown.hidden = beat !== 'bossDown';

    // --- the clear tally ------------------------------------------------------------
    if (beat === 'clear') {
      if (this._clear.shownAt == null) this._clear.shownAt = simNow;
      const age = simNow - this._clear.shownAt;
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
    } else if (beat === 'board') {
      // S5: Tab holds the scoreboard — the live round's honest numbers on the tally card.
      dom.tally.hidden = false;
      this._text(dom.tallyTitle, `ROUND ${run.wave || 1}`);
      const rows = [`WAVE ${run.wave || 1}`];
      if (this._chainBest > 0) rows.push(`BEST CHAIN ×${this._chainBest}`);
      dom.tallyRows.forEach((node, i) => {
        node.hidden = i >= rows.length;
        if (rows[i]) this._text(node, rows[i]);
      });
    } else {
      dom.tally.hidden = true;
    }
    void step; void reduced;

    // --- the boss furniture ----------------------------------------------------------
    if (beat === 'card') {
      const live = this._card;
      if (live.shownAt == null) { live.shownAt = simNow; live.until = simNow + CARD_TTL_S; }
      dom.card.hidden = false;
      this._text(dom.cardTitle, live.title);
      this._text(dom.cardLine, live.line || '');
      dom.cardLine.hidden = !live.line;
    } else {
      dom.card.hidden = true;
      if (this._card && this._card.shownAt != null && simNow >= this._card.until) this._card = null;
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
    // The overdrive window is the chain's gift: the break spends it.
    this._overdriveRate = 0;
  },

  /** inf-overdrive-mark: the chain hero says OVERDRIVE · GUNS ×rate for the whole window. */
  _onHeroOverdrive(p) {
    this._overdriveRate = p && p.active ? Math.max(0, Number(p.rate) || 0) : 0;
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
    this._clear = { wave: p.wave || 0, rows: p.tally, at: now, shownAt: null };
  },

  // S5: Tab toggles the scoreboard — the live round's numbers pinned on the tally card.
  _onScoreboardToggle() {
    this._boardOn = !this._boardOn;
  },

  _onBossIntro(p) {
    if (!p || typeof p.name !== 'string' || !p.name) return;
    const now = this.state && Number.isFinite(this.state.simTime) ? this.state.simTime : 0;
    this._card = { title: p.name, line: p.line || '', at: now, shownAt: null, until: now + CARD_TTL_S };
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

    // ONE centre column: every top-centre piece is a flow child of it, so nothing is positioned
    // by a private vh offset and two pieces can never draw on top of each other.
    const col = makeNode(doc, 'div', 'sf-sj__col', root);

    // The chain is the hero — top of the column, biggest figure in the arena.
    const hero = makeNode(doc, 'div', 'sf-sj__hero', col);
    const heroTier = makeNode(doc, 'div', 'sf-sj__herotier', hero);
    const heroRow = makeNode(doc, 'div', 'sf-sj__herorow', hero);
    const heroFig = makeNode(doc, 'span', 'sf-sj__herofig', heroRow);
    const heroMix = makeNode(doc, 'span', 'sf-sj__heromix', heroRow);
    const heroBest = makeNode(doc, 'span', 'sf-sj__herobest', heroRow);
    const heroTrack = makeNode(doc, 'div', 'sf-sj__herotrack', hero);
    const heroDeplete = makeNode(doc, 'div', 'sf-sj__herodeplete', heroTrack);
    hero.hidden = true;

    // The announcer, just under the hero.
    const calls = makeNode(doc, 'div', 'sf-sj__calls', col);
    calls.hidden = true;
    const shatter = makeNode(doc, 'div', 'sf-sj__shatter', col);
    shatter.hidden = true;

    // The round slam.
    const slam = makeNode(doc, 'div', 'sf-sj__slam', col);
    const slamTitle = makeNode(doc, 'div', 'sf-sj__slamtitle', slam);
    const slamSub = makeNode(doc, 'div', 'sf-sj__slamsub', slam);
    slam.hidden = true;

    // The clear tally.
    const tally = makeNode(doc, 'div', 'sf-sj__tally', col);
    const tallyTitle = makeNode(doc, 'div', 'sf-sj__tallytitle', tally);
    const tallyRows = [];
    for (let i = 0; i < 4; i++) {
      const row = makeNode(doc, 'div', 'sf-sj__tallyrow', tally);
      row.hidden = true;
      tallyRows.push(row);
    }
    tally.hidden = true;

    // The boss furniture.
    const card = makeNode(doc, 'div', 'sf-sj__card', col);
    const cardTitle = makeNode(doc, 'div', 'sf-sj__cardtitle', card);
    const cardLine = makeNode(doc, 'div', 'sf-sj__cardline', card);
    card.hidden = true;
    const boss = makeNode(doc, 'div', 'sf-sj__boss', col);
    const bossName = makeNode(doc, 'div', 'sf-sj__bossname', boss);
    const bossTrack = makeNode(doc, 'div', 'sf-sj__bosstrack', boss);
    const bossFill = makeNode(doc, 'div', 'sf-sj__bossfill', bossTrack);
    const bossCount = makeNode(doc, 'div', 'sf-sj__bosscount', boss);
    boss.hidden = true;
    const bossDown = makeNode(doc, 'div', 'sf-sj__bossdown', col);
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
/* Desktop Swarm owns the upper centre for chain and announcer. The existing alert floor
   and receipt lane remain live in the upper right, clear of that arcade register. The
   mobile HUD has its own measured placement and must keep control of its lanes. */
@media (min-width: 1100px) and (min-height: 700px) {
  html:not([data-sf-mobile-flight="1"]) body.sf-swarm-flight #alerts {
    position:fixed !important; left:auto !important; right:20px !important; top:22px !important;
    bottom:auto !important; width:300px !important; transform:none !important; align-items:flex-end;
  }
  html:not([data-sf-mobile-flight="1"]) body.sf-swarm-flight #alerts .sf-alert {
    max-width:100%; white-space:normal; text-align:left;
  }
  html:not([data-sf-mobile-flight="1"]) body.sf-swarm-flight #toasts {
    position:fixed !important; left:auto !important; right:20px !important;
    top:clamp(150px, 18vh, 190px) !important; bottom:auto !important;
    width:300px !important; transform:none !important;
  }
}
/* — the chain hero — */
/* The ONE centre column. Hero, boss bar, the single beat, announcer lines and the shatter are
   flow children (CSS order = reading order), so no piece owns a private vh offset and none can
   draw on another. */
.sf-sj__col { position:absolute; top:3.4vh; left:50%; transform:translateX(-50%);
  width:max-content; max-width:94vw; display:flex; flex-direction:column; align-items:center; gap:8px; }
.sf-sj__hero { order:0; display:flex; flex-direction:column; align-items:center; gap:2px; }
.sf-sj__hero[hidden] { display:none; }
.sf-sj__herotier { font-weight:700; font-size:13px; letter-spacing:.34em; text-transform:uppercase;
  color:var(--dp-ink-mute, var(--sf-calm)); }
.sf-sj__herorow { display:flex; align-items:baseline; gap:12px; }
.sf-sj__herofig { font-weight:800; font-size:54px; line-height:1; font-variant-numeric:tabular-nums;
  color:var(--dp-ink, var(--sf-paper)); text-shadow:var(--dp-emit, 0 0 18px rgb(232 226 212 / .3)); }
/* Tier ramp on the sanctioned tokens only: warm amber while the chain holds, the lamp driven
   danger-hot as it nears the break, danger red at the tiers one hit from the shatter. The tier
   WORD above the figure carries the meaning; the ramp is reinforcement, never the sole channel. */
.sf-sj__hero[data-tier="ignition"] .sf-sj__herofig { color:var(--dp-lamp-hot, #ffd98c); }
.sf-sj__hero[data-tier="flare"] .sf-sj__herofig { color:var(--dp-lamp, #f2b950); }
.sf-sj__hero[data-tier="nova"] .sf-sj__herofig { color:var(--dp-danger-hot, #ff8a70); }
.sf-sj__hero[data-tier="supernova"] .sf-sj__herofig,
.sf-sj__hero[data-tier="singularity"] .sf-sj__herofig { color:var(--dp-danger, #ff5038);
  text-shadow:var(--dp-emit, 0 0 18px rgb(232 226 212 / .3)); }
.sf-sj__hero[data-tier="ignition"] .sf-sj__herotier,
.sf-sj__hero[data-tier="flare"] .sf-sj__herotier { color:var(--dp-lamp-hot, #ffd98c); }
.sf-sj__hero[data-tier="nova"] .sf-sj__herotier,
.sf-sj__hero[data-tier="supernova"] .sf-sj__herotier,
.sf-sj__hero[data-tier="singularity"] .sf-sj__herotier { color:var(--dp-danger-hot, #ff8a70); }
.sf-sj__heromix { font-weight:700; font-size:15px; letter-spacing:.18em;
  color:var(--dp-lamp-hot, #f2b950); }
/* inf-overdrive-mark: the opened window reads hot, distinct from the amber MIXED badge — the
   word carries the meaning; the color is reinforcement, never the sole channel. */
.sf-sj__hero[data-overdrive="1"] .sf-sj__heromix { color:var(--dp-danger-hot, #ff8a70); }
.sf-sj__herobest { font-weight:500; font-size:12px; letter-spacing:.14em;
  font-variant-numeric:tabular-nums; color:var(--dp-ink-mute, var(--sf-calm)); }
.sf-sj__herotrack { width:130px; height:3px; background:var(--dp-rule-hi, rgb(232 226 212 / .20)); overflow:hidden; }
.sf-sj__herodeplete { width:100%; height:100%; transform-origin:left center;
  background:var(--dp-lamp, #f2b950); }
/* — the announcer — */
.sf-sj__calls { order:3; display:flex; flex-direction:column; align-items:center; gap:4px; }
.sf-sj__calls[hidden] { display:none; }
.sf-sj__call { font-weight:800; font-size:30px; letter-spacing:.22em; text-transform:uppercase;
  color:var(--dp-ink, var(--sf-paper)); text-shadow:var(--dp-emit, 0 0 16px rgb(232 226 212 / .3));
  animation:sf-sj-pop .28s cubic-bezier(.2,.9,.3,1) both; }
.sf-sj__call[data-kind="pileup"], .sf-sj__call[data-kind="collateral"] { color:var(--dp-lamp, #f2b950); }
.sf-sj__call[data-kind="revenge"], .sf-sj__call[data-kind="closecall"] { color:var(--dp-danger-hot, #ff8a70); }
.sf-sj__call[data-kind="lastone"], .sf-sj__call[data-kind="bossdown"] { color:var(--dp-lamp-hot, #ffd98c); }
/* inf-chain-star: the zone's chain star reads in the lamp's hot gold — the same ink the ladder's
   stars wear on the Crucible screen; the words carry the meaning. */
.sf-sj__call[data-kind="chainstar"] { color:var(--dp-lamp-hot, #ffd98c); }
.sf-sj__shatter { order:4;
  font-weight:800; font-size:22px; letter-spacing:.26em; text-transform:uppercase;
  color:var(--dp-danger-hot, #ff5038); animation:sf-sj-drop .5s ease-out both; }
.sf-sj__shatter[hidden] { display:none; }
/* — the round slam — */
/* RC-456: the centring lives on the column (left:50% + translateX(-50%), intrinsic width) and the
   children are plain flow items, so the slam keyframes carry no translate that could ride a
   full-width box off the left edge (the clipped ROUND label of the C1 pass). */
.sf-sj__slam { order:2; max-width:94vw; display:flex; flex-direction:column;
  align-items:center; gap:6px; animation:sf-sj-slam .34s cubic-bezier(.2,.9,.3,1) both; }
.sf-sj__slam[hidden] { display:none; }
.sf-sj__slamtitle { font-weight:800; font-size:64px; line-height:1; letter-spacing:.3em;
  text-transform:uppercase; color:var(--dp-ink, var(--sf-paper));
  text-shadow:var(--dp-emit, 0 0 26px rgb(232 226 212 / .3)); }
.sf-sj__slamsub { font-weight:700; font-size:15px; letter-spacing:.3em; text-transform:uppercase;
  color:var(--dp-lamp-hot, #f2b950); }
/* — the clear tally — */
.sf-sj__tally { order:2; display:flex; flex-direction:column;
  align-items:center; gap:4px; }
.sf-sj__tally[hidden] { display:none; }
.sf-sj__tallytitle { font-weight:800; font-size:34px; letter-spacing:.28em; text-transform:uppercase;
  color:var(--dp-lamp-hot, #f2b950); text-shadow:var(--dp-emit-lamp, 0 0 18px rgb(242 185 80 / .4)); }
.sf-sj__tallyrow { font-weight:650; font-size:16px; letter-spacing:.2em; text-transform:uppercase;
  font-variant-numeric:tabular-nums; color:var(--dp-ink, var(--sf-paper));
  animation:sf-sj-rise .3s ease-out both; }
.sf-sj__tallyrow[hidden] { display:none; }
/* — the boss furniture — */
.sf-sj__card { order:2; display:flex; flex-direction:column; align-items:center; gap:5px; padding:10px 26px;
  background:var(--dp-glass-flight, rgb(10 12 16 / .72));
  border-top:1px solid color-mix(in srgb, var(--dp-lamp, #f2b950) 55%, transparent);
  border-bottom:1px solid color-mix(in srgb, var(--dp-lamp, #f2b950) 55%, transparent);
  animation:sf-sj-slam .3s ease-out both; }
.sf-sj__card[hidden] { display:none; }
.sf-sj__cardtitle { font-weight:800; font-size:26px; letter-spacing:.26em; text-transform:uppercase;
  color:var(--dp-ink, var(--sf-paper)); }
.sf-sj__cardline { font-weight:550; font-size:13px; letter-spacing:.08em; font-style:italic;
  color:var(--dp-ink-mute, var(--sf-calm)); }
.sf-sj__boss { order:1; width:min(34vw,420px);
  display:flex; flex-direction:column; align-items:center; gap:3px; }
.sf-sj__boss[hidden] { display:none; }
.sf-sj__bossname { font-weight:700; font-size:12px; letter-spacing:.3em; text-transform:uppercase;
  color:var(--dp-danger-hot, #ff5038); }
.sf-sj__bosstrack { width:100%; height:6px; background:var(--dp-rule-hi, rgb(232 226 212 / .16)); overflow:hidden; }
.sf-sj__bossfill { width:100%; height:100%; transform-origin:left center;
  background:var(--dp-danger, #ff5038);
  transition:transform .18s linear; }
.sf-sj__bosscount { font-weight:650; font-size:12px; letter-spacing:.2em;
  font-variant-numeric:tabular-nums; color:var(--dp-ink-mute, var(--sf-calm)); }
/* The column centres its children; the keyframes carry no translate, so nothing rides off-centre. */
.sf-sj__bossdown { order:2; max-width:94vw; text-align:center;
  font-weight:800; font-size:44px; letter-spacing:.3em; text-transform:uppercase;
  color:var(--dp-lamp-hot, #f2b950); text-shadow:var(--dp-emit-lamp, 0 0 26px rgb(242 185 80 / .4));
  animation:sf-sj-slam .34s cubic-bezier(.2,.9,.3,1) both; }
.sf-sj__bossdown[hidden] { display:none; }
/* — the kill popups — */
.sf-sj__pops { position:absolute; inset:0; }
.sf-sj__pop { position:absolute; top:0; left:0; font-weight:750; font-size:15px;
  letter-spacing:.12em; text-transform:uppercase; font-variant-numeric:tabular-nums;
  color:var(--dp-ink, var(--sf-paper)); text-shadow:var(--dp-etch-shadow, 0 1px 2px rgb(0 0 0 / .8));
  animation:sf-sj-float 1.05s ease-out both; will-change:transform; white-space:nowrap; }
.sf-sj__pop[data-cause="terrain"], .sf-sj__pop[data-cause="collision"],
.sf-sj__pop[data-cause="explosive"] { color:var(--dp-lamp-hot, #ffd98c); }
/* — beats — */
@keyframes sf-sj-pop { from { opacity:0; transform:scale(.72); } to { opacity:1; transform:scale(1); } }
@keyframes sf-sj-rise { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:none; } }
@keyframes sf-sj-slam { from { opacity:0; transform:scale(1.18); }
  60% { opacity:1; transform:scale(.98); } to { opacity:1; transform:scale(1); } }
@keyframes sf-sj-drop { from { opacity:1; transform:translateY(0) rotate(0deg); }
  to { opacity:0; transform:translateY(34px) rotate(4deg); } }
/* Phones: the column is 94vw at most; the big words scale down instead of clipping. */
@media (max-width: 700px) {
  .sf-sj__slamtitle { font-size:clamp(30px, 11vw, 64px); letter-spacing:.14em; }
  .sf-sj__slamsub { letter-spacing:.14em; text-align:center; }
  .sf-sj__call { font-size:clamp(18px, 6vw, 30px); letter-spacing:.12em; text-align:center; }
  .sf-sj__bossdown { font-size:clamp(24px, 8vw, 44px); letter-spacing:.14em; }
  .sf-sj__tallytitle { font-size:clamp(22px, 7vw, 34px); letter-spacing:.14em; }
  .sf-sj__herofig { font-size:44px; }
}
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
