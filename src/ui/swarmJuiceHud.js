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

import { claimCalloutVoice, resetCalloutVoice } from './calloutVoice.js';
import { readIronMawMouth } from '../combat/capitalBossGeometry.js';
import { isSwarmRuleset } from '../systems/survivalSwarm.js';
import { SWARM_CHAIN_WARN_S, SWARM_CHAIN_WINDOW_S } from '../systems/swarmChain.js';
import { swarmCourseFor } from '../data/swarmCourse.js';
import {
  chainCauseBadge,
  chainWindowRemaining,
  swarmChainBridge,
  swarmStyleReadout,
} from './survivalHud.js';
import { getStage } from './stage.js';
import { floatLedger, FT_PRIORITY, seatOutOfRects } from './floatingTextRules.js';
import { createAvoidRects } from './hudAvoidRects.js';
import { arcadeEffectsLevel } from '../data/swarmJuice.js';

const STYLE_ID = 'sf-sj-css';
const POPUP_POOL = 40;
/** Sim-second lifetimes — pause and slow-time hold the beat with the world. */
const POPUP_TTL_S = 1.05;
const CALL_TTL_S = 1.25;
const TIER_TTL_S = 1.4;
const SLAM_LINGER_S = 0.75;
const SLAM_MAX_S = 1.9;
export const TALLY_ROW_STAGGER_S = 0.16;
const TALLY_HOLD_S = 1.7;
const CARD_TTL_S = 1.55;
const BOSSDOWN_TTL_S = 1.5;
const SHATTER_TTL_S = 1.25;
// Exactly one short headline at a time across calls, beats, and shatter — high enough not to cross the ship.
const MAX_CALL_LINES = 1;
// Higher speaks over lower. Boss beats outrank kill words; counted repeats and small receipts
// (a close call, a pile-up tick) never talk over a bigger moment.
const CALL_PRIORITY = Object.freeze({ bossdown: 5, bossact: 4, overdrive: 3, chainstar: 3,
  firstbeat: 4, multikill: 3, callin: 2, revenge: 2, closecall: 2, lastone: 2, pileup: 2, collateral: 1, discharge: 1,
  // A recovery word (SHIELD BACK, HULL PATCHED) is a receipt, never news over a fight word.
  recovery: 1 });
const CALL_PRIORITY_DEFAULT = 2;
/** A beat that waited this long behind a higher one is stale news — it is dropped, not shown late. */
const BEAT_STALE_S = 12;

/** Plain-word sanitation for announcer callouts (never leaks internal words like COLLATERAL). */
export function swarmAnnounceDisplayText(text, kind = '') {
  const raw = String(text || '').trim();
  if (!raw) return '';
  // An enemy killed by the room or by another enemy: they caught each other, not "friendly fire"
  // (which reads as the player hurting an ally).
  const internal = /^(COLLATERAL|FRIENDLY FIRE)(?![A-Z])/i;
  if (internal.test(raw)) return raw.replace(internal, 'CROSSFIRE');
  if (kind === 'collateral') return 'CROSSFIRE';
  return raw;
}

/** The popup's one line: the money/score figure first, the cause word riding it. */
export function swarmPopupText({ word = '', score = 0, credits = 0 } = {}) {
  const parts = [];
  if (Number.isFinite(score) && score > 0) parts.push(`+${Math.round(score)}`);
  else if (Number.isFinite(credits) && credits > 0) parts.push(`+${Math.round(credits)} CR`);
  if (typeof word === 'string' && word) parts.push(word);
  return parts.join(' ');
}

/**
 * The round banner's single subtitle line: a newcomer debut takes the slot first (so a boss
 * round that also debuts a new threat still introduces the newcomer), then a boss name, then
 * the authored round's one-line question or opening twist clause.
 */
export function swarmSlamSub({ wave = null, boss = null, newcomer = null } = {}) {
  const bossName = boss && typeof boss.name === 'string' && boss.name ? boss.name : '';
  const newName = newcomer && typeof newcomer.name === 'string' && newcomer.name ? newcomer.name : '';
  if (newName) return `New threat · ${newName}`;
  if (bossName) return `Boss · ${bossName}`;
  const course = Number.isInteger(wave) ? swarmCourseFor(wave) : null;
  if (course && typeof course.question === 'string' && course.question.trim()) {
    return course.question.trim();
  }
  if (course && typeof course.twist === 'string' && course.twist.trim()) {
    const first = course.twist.split('.')[0].trim();
    if (first) return first.charAt(0).toUpperCase() + first.slice(1) + '.';
  }
  return '';
}

/** Plain-language style tier label for the top-centre meter (never IGNITION/FLARE/NOVA). */
export function swarmHeroTierText(chain) {
  const read = swarmStyleReadout(chain);
  if (!read) return '';
  return read.kilnTop ? `${read.mult} · ${read.kilnTop}` : read.mult;
}

function makeNode(doc, tag, cls, parent, text) {
  const node = doc.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  if (parent) parent.appendChild(node);
  return node;
}

// Quantised, cached `scaleX` — the shared one lives in hud.js's own closure, but this module keeps
// its own last-written value so a settled bar (a static boss meter between hits, the chain window
// decaying to 0) skips both the `toFixed` string and the CSS re-parse. Same rounding (thousandths,
// clamped to 0..1) as hud.js's setScaleX, so the picture is unchanged.
// `hidden` is a presentation attribute: assigning it marks the element for a style recalculation
// even when the value is the one it already has. The update below runs every frame and used to
// assign about ten of them unchanged; write only on a change.
function setHidden(el, value) {
  if (el && el.hidden !== value) el.hidden = value;
}

function setScaleX(el, value) {
  if (!el) return;
  const raw = Number.isFinite(value) ? value : 0;
  const bounded = raw < 0 ? 0 : raw > 1 ? 1 : raw;
  const next = Math.round(bounded * 1000) / 1000;
  if (el._sfScaleX === next) return;
  el._sfScaleX = next;
  el.style.transform = `scaleX(${next})`;
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
    // FIX-04: `swarm:killPopup` keeps emitting (the juice event is the kill ledger the
    // score/tally read), but the world-anchored "+100 PUNCHED"-style score words no
    // longer paint — the centre callout and the SCORE figure already carry the news.
    this._unsubs.push(this.bus.on('swarm:announce', (p) => this._onAnnounce(p)));
    this._unsubs.push(this.bus.on('swarm:roundSlam', (p) => this._onSlam(p)));
    this._unsubs.push(this.bus.on('swarm:roundClear', (p) => this._onClear(p)));
    this._unsubs.push(this.bus.on('swarm:bossIntro', (p) => this._onBossIntro(p)));
    this._unsubs.push(this.bus.on('swarm:bossHp', (p) => this._onBossHp(p)));
    this._unsubs.push(this.bus.on('swarm:bossDown', (p) => this._onBossDown(p)));
    this._unsubs.push(this.bus.on('swarm:bossMove', (p) => {
      this._bossMove = typeof p?.word === 'string' ? p.word : '';
      this._bossInstruction = typeof p?.instruction === 'string' ? p.instruction : '';
      this._bossMoveUntil = Number.isFinite(p?.ttl) && Number.isFinite(this.state?.simTime)
        ? this.state.simTime + p.ttl : 0;
    }));
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
    for (const p of this._popups || []) if (p.entry) floatLedger.release(p.entry);
    this._popups = [];
    this._releaseStageBanner();
    if (swarmChainBridge.owner === 'juice') swarmChainBridge.owner = null;
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
    resetCalloutVoice();
    this._releaseStageBanner();
    // The shared lane bridge is a singleton: a fresh run must not inherit the previous run's
    // "clear owns the beat" / banner state (a test or a retry would hide the first chain).
    swarmChainBridge.bannerActive = false;
    swarmChainBridge.subCallActive = false;
    swarmChainBridge.clearActive = false;
    this._chain = 0;
    this._chainBest = 0;
    this._chainCause = null;
    this._chainStep = 0;
    this._chainAt = null;
    this._lastHeroChain = 0;
    this._heroBumpPhase = '';
    this._heroTier = '';
    this._heroUrgency = '';
    this._heroOverdrive = '';
    this._heroPipsLit = -1;
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
    this._bossMove = '';
    this._bossInstruction = '';
    this._bossMoveUntil = 0;
    this._bossDownUntil = 0;
    this._isBossClass = null;
    this._mawAperture = {};
    this._shatter = null;
    this._boardOn = false;
    this._level = 'full';
    this._stageBannerBeat = '';
  },

  _syncStageBanner(beat) {
    const wantsBanner = beat === 'slam' || beat === 'card' || beat === 'bossDown' || beat === 'tally';
    const nextKey = wantsBanner ? beat : '';
    if (nextKey === this._stageBannerBeat) return;
    this._stageBannerBeat = nextKey;
    if (!wantsBanner) {
      this._releaseStageBanner();
      return;
    }
    const stage = typeof getStage === 'function' ? getStage() : null;
    if (!stage || typeof stage.show !== 'function') return;
    if (!this._stageMarker && typeof document !== 'undefined') {
      const marker = document.createElement('span');
      marker.className = 'sf-sj__stagemarker';
      marker.setAttribute('aria-hidden', 'true');
      this._stageMarker = marker;
    }
    if (!this._stageMarker) return;
    this._stageHandle = stage.show('banner', this._stageMarker, {
      id: 'swarm-banner',
      severity: beat === 'bossDown' ? 'danger' : 'warn',
      bare: true,
      takeSeat: true,
    });
  },

  _releaseStageBanner() {
    this._stageBannerBeat = '';
    if (this._stageHandle) {
      try { this._stageHandle.clear(); } catch { /* stage already torn down */ }
      this._stageHandle = null;
    }
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
    if (swarmChainBridge.owner !== 'layer' && swarmChainBridge.owner !== 'juice') {
      swarmChainBridge.owner = 'juice';
    }
    const layerOwnsHud = swarmChainBridge.owner === 'layer';
    const reduced = this._level === 'reduced';
    if (dom.root.dataset.level !== this._level) dom.root.dataset.level = this._level;
    if (dom.root.dataset.layerOwned !== (layerOwnsHud ? '1' : '0')) {
      dom.root.dataset.layerOwned = layerOwnsHud ? '1' : '0';
    }

    const simNow = Number.isFinite(st.simTime) ? st.simTime : 0;
    const step = Math.max(0, Number(dt) || 0);

    // --- the announcer ------------------------------------------------------------
    const activeCall = this._calls[0];
    // Iron Maw's brief opening needs the aiming ring and its instruction to read immediately.
    const giveOpeningRoom = activeCall && activeCall.kind !== 'bossdown'
      && readIronMawMouth(st, this._mawAperture);
    while (this._calls.length && (giveOpeningRoom || simNow > this._calls[0].until)) {
      const dead = this._calls.shift();
      if (dead.node) dead.node.remove();
    }
    for (const call of this._calls) {
      if (call.node && call.node.textContent !== call.text) call.node.textContent = call.text;
    }

    // --- ONE single top-center lane coordinated through Stage/attention -----------
    // Priority: BOSS DOWN > round banner / FIGHT > boss intro card > clear tally >
    // announcer call > chain shatter > Tab scoreboard. Round banners and the boss bar
    // never stack on top of each other: a banner takes the Stage banner seat for <= ~2 s,
    // then yields cleanly to the round or boss machine-plate.
    if (this._slam && Number.isFinite(this._slam.until) && simNow >= this._slam.until) {
      this._slam = null;
    }
    const card = this._card;
    if (card && card.shownAt == null && simNow - card.at > BEAT_STALE_S) this._card = null;
    if (this._clear && this._clear.shownAt == null && simNow - this._clear.at > BEAT_STALE_S) this._clear = null;
    if (this._shatter && simNow >= this._shatter.until) this._shatter = null;

    let beat = '';
    if (simNow < this._bossDownUntil) beat = 'bossDown';
    else if (this._slam || (simNow < this._fightUntil && this._fightWord)) beat = 'slam';
    else if (this._card && (this._card.shownAt == null || simNow < this._card.until)) beat = 'card';
    else if (this._clear) beat = 'clear';
    else if (this._calls.length > 0) beat = 'call';
    else if (this._shatter && simNow < this._shatter.until) beat = 'shatter';
    else if (this._boardOn) beat = 'board';
    this._beat = beat;
    this._syncStageBanner(beat);

    const bannerOwnsTop = beat === 'slam' || beat === 'card' || beat === 'bossDown'
      || beat === 'clear' || beat === 'board';
    const subCallActive = beat === 'call' || beat === 'shatter';

    // Publish live lane + boss state for swarmHudLayer (single-owner top-centre coordination).
    swarmChainBridge.bannerActive = bannerOwnsTop;
    swarmChainBridge.subCallActive = subCallActive;
    // The clear summary owns the one beat under the header; a level-up card waits for it
    // (DEMO-SWARM-UX-2: summary first, card second, never both at once).
    swarmChainBridge.clearActive = beat === 'clear';
    swarmChainBridge.bossHp = this._bossHp;
    swarmChainBridge.bossMove = this._bossMove;
    swarmChainBridge.bossInstruction = this._bossInstruction;
    swarmChainBridge.bossMoveUntil = this._bossMoveUntil;
    swarmChainBridge.bossDownUntil = this._bossDownUntil;
    if (dom.col.dataset.beat !== beat) dom.col.dataset.beat = beat;
    if (dom.col.dataset.subcall !== (subCallActive ? '1' : '0')) {
      dom.col.dataset.subcall = subCallActive ? '1' : '0';
    }

    setHidden(dom.calls, beat !== 'call');

    const slam = this._slam;
    setHidden(dom.slam, beat !== 'slam');
    if (beat === 'slam') {
      if (slam) {
        if (slam.shownAt == null) {
          slam.shownAt = simNow;
          // Cap total visible display within ~2 s even if a higher beat delayed arrival.
          slam.until = Math.min(slam.until, simNow + SLAM_MAX_S);
        }
        this._text(dom.slamKicker, slam.kicker || '');
        setHidden(dom.slamKicker, !slam.kicker);
        this._text(dom.slamTitle, slam.title);
        this._text(dom.slamSub, slam.sub);
        setHidden(dom.slamSub, !slam.sub);
      } else {
        this._text(dom.slamKicker, '');
        setHidden(dom.slamKicker, true);
        this._text(dom.slamTitle, this._fightWord);
        setHidden(dom.slamSub, true);
      }
    }
    setHidden(dom.bossDown, beat !== 'bossDown');

    // --- the clear tally ------------------------------------------------------------
    if (beat === 'clear') {
      if (this._clear.shownAt == null) this._clear.shownAt = simNow;
      const age = simNow - this._clear.shownAt;
      const hold = Math.min(2.0, this._clear.rows.length * TALLY_ROW_STAGGER_S + TALLY_HOLD_S);
      if (age > hold) {
        this._clear = null;
        setHidden(dom.tally, true);
      } else {
        setHidden(dom.tally, false);
        this._text(dom.tallyTitle, `Round ${this._clear.wave} clear`);
        this._clear.rows.forEach((row, i) => {
          const node = dom.tallyRows[i];
          if (!node) return;
          const on = age >= i * TALLY_ROW_STAGGER_S;
          setHidden(node, !on);
          if (on) this._text(node, `${row.label}  ${row.value}`);
        });
        // A shorter clear than the last one must not leave its old tail rows on the glass:
        // that is how 'BEST CHAIN' printed twice under two different rounds.
        for (let i = this._clear.rows.length; i < dom.tallyRows.length; i++) {
          setHidden(dom.tallyRows[i], true);
        }
      }
    } else if (beat === 'board') {
      // S5: Tab holds the scoreboard — the live round's honest numbers on the tally card.
      setHidden(dom.tally, false);
      this._text(dom.tallyTitle, `Round ${run.wave || 1}`);
      // The title already names the round; a repeated row was a second 'Round N', and a chain is
      // a count, not a multiplier (DEMO-SWARM-UX-2).
      const rows = [];
      const bestBoard = Math.max(this._chainBest, swarmChainBridge.best || 0);
      if (bestBoard > 0) rows.push(`Best chain  ${bestBoard}`);
      dom.tallyRows.forEach((node, i) => {
        setHidden(node, i >= rows.length);
        if (rows[i]) this._text(node, rows[i]);
      });
    } else {
      setHidden(dom.tally, true);
    }
    void step; void reduced;

    // --- the boss furniture (strictly one at a time with round banners) --------------
    if (beat === 'card') {
      const liveCard = this._card;
      if (liveCard.shownAt == null) { liveCard.shownAt = simNow; liveCard.until = simNow + CARD_TTL_S; }
      setHidden(dom.card, false);
      this._text(dom.cardTitle, liveCard.title);
      this._text(dom.cardLine, liveCard.line || '');
      setHidden(dom.cardLine, !liveCard.line);
    } else {
      setHidden(dom.card, true);
      if (this._card && this._card.shownAt != null && simNow >= this._card.until) this._card = null;
    }
    // When swarmHudLayer is active it renders the ONE Boss Machine-Plate in the Round Plate seat;
    // standalone swarmJuiceHud keeps its own boss plate for headless/unit tests.
    const showBossBar = !layerOwnsHud && !!(this._bossHp && simNow >= this._bossDownUntil && !bannerOwnsTop);
    if (showBossBar) {
      setHidden(dom.boss, false);
      if (this._isBossClass !== true) {
        this._isBossClass = true;
        dom.col.classList?.add?.('is-boss');
      }
      const move = this._bossMove && (!this._bossMoveUntil || simNow < this._bossMoveUntil) ? this._bossMove : '';
      this._text(dom.bossName, move ? `${this._bossHp.name} · ${move}` : this._bossHp.name);
      const instruction = move ? this._bossInstruction : '';
      this._text(dom.bossInstruction, instruction);
      setHidden(dom.bossInstruction, !instruction);
      setScaleX(dom.bossFill, this._bossHp.frac);
      setScaleX(dom.bossBurn, this._bossHp.frac);
      const pctText = `${Math.round(Math.max(0, Math.min(1, this._bossHp.frac)) * 100)}%`;
      const countText = this._bossHp.total > 1
        ? `${this._bossHp.alive}/${this._bossHp.total} · ${pctText}` : pctText;
      this._text(dom.bossCount, countText);
    } else {
      setHidden(dom.boss, true);
      if (this._isBossClass !== false) {
        this._isBossClass = false;
        dom.col.classList?.remove?.('is-boss');
      }
    }

    // --- standalone style / chain meter (hidden when swarmHudLayer owns the chain) ---
    const chain = this._chain > 0 ? this._chain : (swarmChainBridge.chain || 0);
    const chainCause = this._chain > 0 ? this._chainCause : swarmChainBridge.cause;
    const chainStep = this._chain > 0 ? this._chainStep : swarmChainBridge.step;
    const chainAt = this._chain > 0 ? this._chainAt : swarmChainBridge.at;
    const overdriveRate = this._overdriveRate > 0 ? this._overdriveRate : (swarmChainBridge.overdriveRate || 0);
    const style = !layerOwnsHud && !bannerOwnsTop && chain > 0
      ? swarmStyleReadout(chain, { cause: chainCause, step: chainStep, overdriveRate })
      : null;
    setHidden(dom.hero, !style);
    if (style) {
      this._text(dom.heroFig, style.mult);
      this._text(dom.heroBest, `${style.chain} chain`);
      this._text(dom.heroMix, style.line);
      setHidden(dom.heroMix, !style.line);
      const tierStr = String(style.tier);
      if (this._heroTier !== tierStr) {
        this._heroTier = tierStr;
        dom.hero.dataset.tier = tierStr;
      }
      const odStr = style.overdrive ? '1' : '0';
      if (this._heroOverdrive !== odStr) {
        this._heroOverdrive = odStr;
        dom.hero.dataset.overdrive = odStr;
      }
      if (style.chain > this._lastHeroChain && this._lastHeroChain > 0) {
        this._heroBumpPhase = this._heroBumpPhase === 'a' ? 'b' : 'a';
        dom.hero.dataset.bump = this._heroBumpPhase;
      }
      this._lastHeroChain = style.chain;
      const remaining = chainWindowRemaining(chainAt, simNow);
      const deplete = Math.max(0, Math.min(1, remaining / SWARM_CHAIN_WINDOW_S));
      setScaleX(dom.heroDeplete, deplete);
      const urgency = remaining <= SWARM_CHAIN_WARN_S ? 'final' : '';
      if (this._heroUrgency !== urgency) {
        this._heroUrgency = urgency;
        if (urgency) dom.hero.dataset.urgency = urgency;
        else delete dom.hero.dataset.urgency;
      }
    } else if (chain === 0) {
      this._lastHeroChain = 0;
    }

    // --- the shatter ------------------------------------------------------------------
    if (beat === 'shatter' && this._shatter && simNow < this._shatter.until) {
      setHidden(dom.shatter, false);
      this._text(dom.shatter, this._shatter.text);
    } else {
      setHidden(dom.shatter, true);
    }

    // --- the popups (FIX-04 retired subscription; pool stays clean with zero layout reads) --
    let write = 0;
    for (let i = 0; i < this._popups.length; i++) {
      const p = this._popups[i];
      if (simNow - p.at <= POPUP_TTL_S) this._popups[write++] = p;
      else { p.node.hidden = true; if (p.entry) { floatLedger.release(p.entry); p.entry = null; } }
    }
    this._popups.length = write;
    const project = this._popups.length > 0 && this.helpers && typeof this.helpers.worldToScreen === 'function'
      ? this.helpers.worldToScreen : null;
    if (project) {
      for (const p of this._popups) {
        _world.x = p.wx; _world.z = p.wz;
        const s = project(_world, _screen);
        if (s && s.onScreen !== false && Number.isFinite(s.x) && Number.isFinite(s.y)) {
          let px = s.x, py = s.y, fade = 1;
          if (p.entry) { p.entry.x = px; p.entry.y = py; }
          if (p.w > 0 && p.h > 0) {
            const vw = typeof window !== 'undefined' && window.innerWidth ? window.innerWidth : 1280;
            const vh = typeof window !== 'undefined' && window.innerHeight ? window.innerHeight : 720;
            const seat = seatOutOfRects({ x: px, y: py, w: p.w, h: p.h }, this._avoid().get(), { w: vw, h: vh });
            px = seat.x; py = seat.y; fade = seat.fade;
          }
          const tx = Math.round(px);
          const ty = Math.round(py);
          if (p.tx !== tx || p.ty !== ty) {
            p.tx = tx;
            p.ty = ty;
            p.node.style.transform = `translate(${tx}px, ${ty}px)`;
          }
          const filter = fade < 1 ? `opacity(${fade})` : '';
          if (p.filter !== filter) { p.filter = filter; p.node.style.filter = filter; }
          if (p.nodeHidden !== false) { p.nodeHidden = false; p.node.hidden = false; }
        } else {
          if (p.nodeHidden !== true) { p.nodeHidden = true; p.node.hidden = true; }
        }
      }
    }
  },

  // --- bus receipts -------------------------------------------------------------------

  _onChain(p) {
    this._chain = p && Number.isFinite(p.chain) ? p.chain : 0;
    if (p && Number.isFinite(p.best) && p.best > this._chainBest) this._chainBest = p.best;
    this._chainCause = p && typeof p.cause === 'string' ? p.cause : null;
    this._chainStep = p && Number.isFinite(p.step) ? p.step : 0;
    this._chainAt = p && Number.isFinite(p.at) ? p.at : null;
    if (this._chain > 0) this._shatter = null;
  },

  _onChainBroken() {
    this._chain = 0;
    this._chainCause = null;
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
    // DEMO-SWARM-UX-2: plain words, not a scoring internal ("CHAIN 44 LOST").
    this._shatter = { text: `Chain ${ended} — broken`, until: now + SHATTER_TTL_S };
  },

  _avoid() {
    if (!this._avoidRects) this._avoidRects = createAvoidRects(typeof document !== 'undefined' ? document : null,
      { exclude: (el) => !!(el.closest && el.closest('.sf-sj__pops')) });
    return this._avoidRects;
  },

  _onPopup(p) {
    if (!p || !p.pos || !Number.isFinite(p.pos.x) || !Number.isFinite(p.pos.z)) return;
    const text = swarmPopupText(p);
    if (!text || !this._dom) return; // transient — if the layer isn't mounted there is nothing to show
    const now = this.state && Number.isFinite(this.state.simTime) ? this.state.simTime : 0;
    // G16-04: the same word near in time and place folds into one label (+12 SHUNTED and +256
    // SHUNTED read "+268 SHUNTED"), and four words at most live on screen across the float layers.
    let sx = 0, sy = 0;
    const project = this.helpers && typeof this.helpers.worldToScreen === 'function' ? this.helpers.worldToScreen : null;
    if (project) {
      _world.x = p.pos.x; _world.z = p.pos.z;
      const s = project(_world, _screen);
      if (s && Number.isFinite(s.x) && Number.isFinite(s.y)) { sx = s.x; sy = s.y; }
    }
    const adm = floatLedger.admit({ text, x: sx, y: sy, priority: FT_PRIORITY.earned });
    if (adm.action === 'dropped') return;
    if (adm.action === 'merged') return;
    const entry = adm.entry;
    let node = this._popupPool.find((n) => n.hidden) || null;
    if (!node) {
      // Pool pressure: the oldest live popup yields its seat — the newest kill always reads.
      const oldest = this._popups.shift();
      if (oldest) { node = oldest.node; if (oldest.entry) floatLedger.release(oldest.entry); }
    }
    if (!node) { floatLedger.release(entry); return; }
    node.textContent = text;
    node.dataset.cause = p.cause || '';
    node.style.filter = '';
    node.hidden = false;
    const rec = { node, wx: p.pos.x, wz: p.pos.z, at: now, text, entry, w: 0, h: 0, filter: '', tx: NaN, ty: NaN, nodeHidden: false };
    entry.refresh = (t) => {
      rec.text = t; node.textContent = t; rec.w = 0; rec.h = 0;
      rec.at = this.state && Number.isFinite(this.state.simTime) ? this.state.simTime : rec.at;
      // Restart the pop-in without `void offsetWidth` (forced sync layout mid-write): the
      // 'none' state commits for one frame, then the restore replays the animation. The
      // token keeps a stale restore from cancelling a newer refresh on the pooled node.
      node.style.animation = 'none';
      const token = (node._sfSJAnimToken = (node._sfSJAnimToken | 0) + 1);
      const nextFrame = typeof requestAnimationFrame === 'function'
        ? requestAnimationFrame : (fn) => setTimeout(fn, 0);
      nextFrame(() => { if (node._sfSJAnimToken === token) node.style.animation = ''; });
    };
    entry.evict = () => {
      const i = this._popups.indexOf(rec);
      if (i >= 0) this._popups.splice(i, 1);
      rec.entry = null; node.hidden = true;
    };
    this._popups.push(rec);
  },

  // One announcer voice at a time (20_THE_FIRST_HOUR rule 2: danger > verb > objective > callout
  // > receipts). A lower-priority word arriving while a higher one is still up is dropped; an
  // equal or higher one replaces it; the same kind again updates in place (its text already
  // carries the count). The old two-line stack is gone.
  _onAnnounce(p) {
    if (!p || typeof p.text !== 'string' || !p.text || !this._dom) return;
    const now = this.state && Number.isFinite(this.state.simTime) ? this.state.simTime : 0;
    const kind = p.kind || '';
    if (kind !== 'bossdown' && readIronMawMouth(this.state, this._mawAperture)) return;
    const displayText = swarmAnnounceDisplayText(p.text, kind);
    if (!displayText) return;
    const pri = CALL_PRIORITY[kind] ?? CALL_PRIORITY_DEFAULT;
    const cur = this._calls[0];
    // The stunt lane shares this voice: a first-beat word (LATCHED) holds the centre against a
    // lower kill word, and the reverse.
    if (!claimCalloutVoice(`sj:${kind}`, pri, CALL_TTL_S * 1000)) return;
    if (cur && cur.until > now) {
      if (cur.kind === kind) {
        cur.text = displayText;
        cur.until = now + CALL_TTL_S;
        return;
      }
      if (pri < cur.pri) return;
    }
    while (this._calls.length) {
      const dead = this._calls.shift();
      if (dead.node) dead.node.remove();
    }
    const node = makeNode(document, 'div', 'sf-sj__call', this._dom.calls);
    node.textContent = displayText;
    node.dataset.kind = kind;
    this._calls.push({ kind, pri, text: displayText, node, until: now + CALL_TTL_S });
  },

  _onSlam(p) {
    if (!p || !Number.isInteger(p.wave)) return;
    const now = this.state && Number.isFinite(this.state.simTime) ? this.state.simTime : 0;
    const wave = Math.max(1, p.wave);
    const course = swarmCourseFor(wave);
    const name = course && typeof course.name === 'string' && course.name
      ? course.name
      : `Round ${String(wave).padStart(2, '0')}`;
    this._slam = {
      wave: p.wave,
      kicker: `ROUND ${wave}`,
      title: name,
      sub: swarmSlamSub(p),
      shownAt: null,
      until: now + SLAM_MAX_S,
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
    // Phone: no separate boss card. The intro line becomes one compact clause on the boss bar for
    // the card's duration (the bar already names the boss). The DOM probe is guarded — a
    // DOM-less lane (the sim worker, a headless Node runtime) must never read `document`.
    if (typeof document !== 'undefined'
        && document.documentElement?.getAttribute?.('data-sf-mobile-flight') === '1') {
      const clause = String(p.line || '').split(/[.—–:]/)[0].trim();
      this._card = null;
      this._bossMove = clause.length > 34 ? `${clause.slice(0, 33).trim()}…` : clause;
      this._bossMoveUntil = now + CARD_TTL_S;
    } else {
      this._card = { title: p.name, line: p.line || '', at: now, shownAt: null, until: now + CARD_TTL_S };
    }
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
    this._releaseStageBanner();
    swarmChainBridge.bannerActive = false;
    swarmChainBridge.subCallActive = false;
    swarmChainBridge.clearActive = false;
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
    const slamKicker = makeNode(doc, 'div', 'sf-sj__slamkicker', slam);
    slamKicker.hidden = true;
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

    // The boss furniture (lit Foundry machine-plate with heavy segmented bar).
    const card = makeNode(doc, 'div', 'sf-sj__card', col);
    const cardTitle = makeNode(doc, 'div', 'sf-sj__cardtitle', card);
    const cardLine = makeNode(doc, 'div', 'sf-sj__cardline', card);
    card.hidden = true;
    const boss = makeNode(doc, 'div', 'sf-sj__boss', col);
    const bossHead = makeNode(doc, 'div', 'sf-sj__bosshead', boss);
    const bossName = makeNode(doc, 'div', 'sf-sj__bossname', bossHead);
    const bossCount = makeNode(doc, 'div', 'sf-sj__bosscount', bossHead);
    const bossTrack = makeNode(doc, 'div', 'sf-sj__bosstrack', boss);
    const bossBurn = makeNode(doc, 'div', 'sf-sj__bossburn', bossTrack);
    const bossFill = makeNode(doc, 'div', 'sf-sj__bossfill', bossTrack);
    makeNode(doc, 'div', 'sf-sj__bosssegs', bossTrack);
    const bossInstruction = makeNode(doc, 'div', 'sf-sj__bossinstruction', boss);
    bossInstruction.hidden = true;
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
      calls, shatter, slam, slamKicker, slamTitle, slamSub,
      tally, tallyTitle, tallyRows,
      col, card, cardTitle, cardLine, boss, bossName, bossBurn, bossFill, bossCount, bossInstruction, bossDown,
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
@media (min-width: 1100px) and (min-height: 580px) {
  html:not([data-sf-mobile-flight="1"]) body.sf-swarm-flight #alerts {
    position:fixed !important; left:auto !important; right:18px !important; top:102px !important;
    bottom:auto !important; width:300px !important; transform:none !important; align-items:flex-end;
  }
  html:not([data-sf-mobile-flight="1"]) body.sf-swarm-flight #alerts .sf-alert {
    max-width:100%; white-space:normal; text-align:left;
  }
  html:not([data-sf-mobile-flight="1"]) body.sf-swarm-flight #toasts {
    position:fixed !important; left:auto !important; right:18px !important;
    top:164px !important; bottom:auto !important;
    width:300px !important; transform:none !important;
  }
}
/* — ONE high, compact top-centre headline slot (DEMO-SWARM-HUD-2 Item 2) — */
body.sf-swarm-hud .sf-sj { z-index:16; }
.sf-sj__col { position:absolute; top:calc(28px + var(--sf-safe-inset-top, 0px)); left:50%; transform:translateX(-50%);
  width:max-content; max-width:min(520px, 78vw); display:flex; flex-direction:column; align-items:center; gap:4px; }
/* When swarmHudLayer owns the Round/Boss Plate and only a transient call/shatter is firing,
   seat it cleanly directly beneath the plate regardless of update order. */
body.sf-swarm-hud .sf-sj__col[data-beat="call"],
body.sf-swarm-hud .sf-sj__col[data-beat="shatter"],
.sf-sj[data-layer-owned="1"] .sf-sj__col[data-subcall="1"] { top:calc(96px + var(--sf-safe-inset-top, 0px)); }
/* DEMO-SWARM-UX-2: the round header never leaves its seat, so every event word (round banner,
   FIGHT, clear tally, BOSS DOWN, boss card, calls) is one row BELOW it instead of replacing it. */
body.sf-swarm-hud .sf-sj__col { top:calc(96px + var(--sf-safe-inset-top, 0px)); }
@media (max-width: 760px) {
  body.sf-swarm-hud .sf-sj__col { top:calc(104px + var(--sf-safe-inset-top, 0px)); }
  body.sf-swarm-hud .sf-sj__col[data-beat="call"],
  body.sf-swarm-hud .sf-sj__col[data-beat="shatter"] { top:calc(104px + var(--sf-safe-inset-top, 0px)); }
}
.sf-sj__hero { display:flex; flex-direction:column; align-items:center; gap:3px; padding:2px 16px 3px;
  background:linear-gradient(90deg, transparent, rgb(8 10 14 / .74) 16%, rgb(8 10 14 / .74) 84%, transparent); }
.sf-sj__hero[hidden] { display:none; }
body.sf-swarm-hud .sf-sj__hero,
body.sf-swarm-hud .sf-sj__boss,
.sf-sj[data-layer-owned="1"] .sf-sj__hero,
.sf-sj[data-layer-owned="1"] .sf-sj__boss { display:none; }
.sf-sj__col.is-boss .sf-sj__boss { order:0; }
.sf-sj__col.is-boss .sf-sj__calls, .sf-sj__col.is-boss .sf-sj__slam { margin-top:4px; }
.sf-sj__herotier { font-weight:700; font-size:12px; letter-spacing:.24em; text-transform:uppercase;
  color:var(--dp-ink-mute, var(--sf-calm)); }
.sf-sj__herorow { display:flex; align-items:baseline; gap:10px; }
.sf-sj__herofig { font-family:var(--dp-face-display, "Archivo", system-ui, sans-serif); font-weight:800; font-size:24px; line-height:1; font-variant-numeric:tabular-nums;
  color:var(--dp-lamp, #f2b950); }
.sf-sj__heromix { font-family:var(--dp-face-read, "Instrument Sans", system-ui, sans-serif); font-weight:600; font-size:13px; letter-spacing:.02em; color:var(--dp-ink, #e8e2d4); }
.sf-sj__herobest { font-family:var(--dp-face-read, "Instrument Sans", system-ui, sans-serif); font-weight:500; font-size:12px; font-variant-numeric:tabular-nums; color:var(--dp-ink-dim, #b7b4a6); }
.sf-sj__herotrack { width:112px; height:3px; background:var(--dp-rule-hi, rgb(232 226 212 / .20)); overflow:hidden; }
.sf-sj__herodeplete { width:100%; height:100%; transform-origin:left center; background:var(--dp-lamp, #f2b950); }
/* — the announcer — */
.sf-sj__calls { order:2; display:flex; flex-direction:column; align-items:center; gap:2px; }
.sf-sj__calls[hidden] { display:none; }
.sf-sj__call { padding:3px 16px; font-family:var(--dp-face-display, "Archivo", system-ui, sans-serif);
  font-weight:800; font-size:18px; line-height:1.15; letter-spacing:.12em; text-transform:uppercase;
  color:var(--dp-ink, var(--sf-paper));
  background:linear-gradient(90deg, transparent, rgb(8 10 14 / .80) 16%, rgb(8 10 14 / .80) 84%, transparent);
  text-shadow:0 1px 4px rgb(3 8 12 / .92);
  animation:sf-sj-pop .22s cubic-bezier(.2,.9,.3,1) both; }
.sf-sj__call[data-kind="pileup"], .sf-sj__call[data-kind="collateral"] { color:var(--dp-lamp, #f2b950); }
.sf-sj__call[data-kind="revenge"], .sf-sj__call[data-kind="closecall"] { color:var(--dp-danger-hot, #ff8a70); }
.sf-sj__call[data-kind="lastone"], .sf-sj__call[data-kind="bossdown"] { color:var(--dp-lamp-hot, #ffd98c); }
.sf-sj__call[data-kind="chainstar"] { color:var(--dp-lamp-hot, #ffd98c); }
.sf-sj__shatter { order:2; padding:3px 14px;
  font-family:var(--dp-face-display, "Archivo", system-ui, sans-serif);
  font-weight:750; font-size:15px; letter-spacing:.14em; text-transform:uppercase;
  color:var(--dp-danger-hot, #ff6c54);
  background:linear-gradient(90deg, transparent, rgb(8 10 14 / .78) 16%, rgb(8 10 14 / .78) 84%, transparent);
  text-shadow:0 1px 3px rgb(3 8 12 / .9);
  animation:sf-sj-drop .42s ease-out both; }
.sf-sj__shatter[hidden] { display:none; }
/* — the round banner (name + one line, clears <= ~2 s) — */
.sf-sj__slam { order:2; max-width:94vw; padding:6px 24px 7px; display:flex; flex-direction:column;
  align-items:center; gap:2px;
  border-top:2px solid var(--fh-hazard, #ff6a2b);
  background:linear-gradient(90deg, transparent, rgb(8 10 14 / .86) 14%, rgb(8 10 14 / .86) 86%, transparent);
  animation:sf-sj-slam .24s cubic-bezier(.2,.9,.3,1) both; }
.sf-sj__slam[hidden] { display:none; }
.sf-sj__slamkicker { font-family:var(--dp-face-read, "Instrument Sans", system-ui, sans-serif);
  font-weight:600; font-size:12px; letter-spacing:.12em; text-transform:uppercase;
  font-variant-caps:small-caps; color:var(--dp-lamp, #f2b950); }
.sf-sj__slamkicker[hidden] { display:none; }
.sf-sj__slamtitle { font-family:var(--dp-face-display, "Archivo", system-ui, sans-serif);
  font-weight:800; font-size:26px; line-height:1.05; letter-spacing:-.01em;
  color:var(--dp-ink, var(--sf-paper));
  text-shadow:0 1px 6px rgb(3 8 12 / .92); }
.sf-sj__slamsub { font-family:var(--dp-face-read, "Instrument Sans", system-ui, sans-serif);
  font-weight:550; font-size:13px; letter-spacing:.01em;
  color:var(--dp-lamp-hot, #ffd98c); text-align:center; }
.sf-sj__slamsub[hidden] { display:none; }
/* — the clear tally — */
.sf-sj__tally { order:2; padding:6px 18px; display:flex; flex-direction:column;
  align-items:center; gap:3px;
  border-top:1px solid color-mix(in srgb, var(--dp-lamp, #f2b950) 55%, transparent);
  background:linear-gradient(90deg, transparent, rgb(8 10 14 / .84) 14%, rgb(8 10 14 / .84) 86%, transparent); }
.sf-sj__tally[hidden] { display:none; }
.sf-sj__tallytitle { font-family:var(--dp-face-display, "Archivo", system-ui, sans-serif);
  font-weight:800; font-size:20px; letter-spacing:.04em;
  color:var(--dp-lamp-hot, #ffd98c); text-shadow:0 1px 4px rgb(3 8 12 / .9); }
.sf-sj__tallyrow { font-family:var(--dp-face-read, "Instrument Sans", system-ui, sans-serif);
  font-weight:600; font-size:13px; letter-spacing:.04em;
  font-variant-numeric:tabular-nums; color:var(--dp-ink, var(--sf-paper));
  animation:sf-sj-rise .24s ease-out both; }
.sf-sj__tallyrow[hidden] { display:none; }
/* — the boss furniture (standalone lit Foundry machine-plate with heavy segmented bar) — */
.sf-sj__card { order:2; display:flex; flex-direction:column; align-items:center; gap:3px; padding:7px 22px;
  background:linear-gradient(180deg, rgb(22 18 16 / .90) 0%, rgb(10 10 12 / .90) 100%);
  border-top:2px solid var(--dp-danger, #ff5038);
  border-bottom:1px solid rgb(255 110 82 / .36);
  animation:sf-sj-slam .24s ease-out both; }
.sf-sj__card[hidden] { display:none; }
.sf-sj__cardtitle { font-family:var(--dp-face-display, "Archivo", system-ui, sans-serif);
  font-weight:800; font-size:20px; letter-spacing:-.01em; color:var(--dp-ink, var(--sf-paper)); }
.sf-sj__cardline { font-family:var(--dp-face-read, "Instrument Sans", system-ui, sans-serif);
  font-weight:500; font-size:13px; color:var(--dp-ink-dim, #b7b4a6); }
.sf-sj__boss { order:0; width:min(420px, 56vw); padding:6px 14px 8px;
  display:flex; flex-direction:column; gap:5px;
  background:linear-gradient(180deg, rgb(22 18 16 / .92) 0%, rgb(11 10 12 / .92) 100%);
  border-top:2px solid var(--dp-danger, #ff5038);
  border-bottom:1px solid rgb(255 110 82 / .34);
  border-left:1px solid rgb(232 226 212 / .14);
  border-right:1px solid rgb(232 226 212 / .14); }
.sf-sj__boss[hidden] { display:none; }
.sf-sj__bosshead { display:flex; align-items:baseline; justify-content:space-between; gap:10px; width:100%; }
.sf-sj__bossname { font-family:var(--dp-face-display, "Archivo", system-ui, sans-serif);
  font-weight:800; font-size:16px; color:var(--dp-ink, #e8e2d4); }
.sf-sj__bosstrack { position:relative; width:100%; height:12px; padding:1px;
  background:rgb(6 7 10 / .94); border:1px solid rgb(232 226 212 / .22); overflow:hidden; }
.sf-sj__bossburn, .sf-sj__bossfill { position:absolute; inset:1px; transform-origin:left center; }
.sf-sj__bossburn { background:#ffd98c; opacity:.55; transition:transform .42s ease-out; }
.sf-sj__bossfill { background:linear-gradient(180deg, #ff7a58 0%, var(--dp-danger, #ff5038) 38%, #a61e16 100%);
  transition:transform .12s linear; }
.sf-sj__bosssegs { position:absolute; inset:0;
  background:
    repeating-linear-gradient(90deg, transparent 0, transparent calc(10% - 2px), rgb(8 9 12 / .94) calc(10% - 2px), rgb(8 9 12 / .94) 10%),
    repeating-linear-gradient(90deg, transparent 0, transparent calc(25% - 3px), rgb(8 9 12 / .98) calc(25% - 3px), rgb(8 9 12 / .98) 25%); }
.sf-sj__bosscount { font-family:var(--dp-face-display, "Archivo", system-ui, sans-serif);
  font-weight:800; font-size:16px; font-variant-numeric:tabular-nums; color:var(--dp-ink, #e8e2d4); }
.sf-sj__bossinstruction { width:100%; font-family:var(--dp-face-read, "Instrument Sans", system-ui, sans-serif);
  font-weight:600; font-size:13px; line-height:1.3; text-align:center; color:var(--dp-lamp-hot, #ffd98c);
  text-shadow:0 1px 3px #080a0e; }
.sf-sj__bossinstruction[hidden] { display:none; }
.sf-sj__bossdown { order:2; max-width:94vw; padding:6px 20px; text-align:center;
  font-family:var(--dp-face-display, "Archivo", system-ui, sans-serif);
  font-weight:800; font-size:24px; letter-spacing:.08em; text-transform:uppercase;
  color:var(--dp-lamp-hot, #ffd98c);
  border-top:2px solid var(--dp-lamp, #f2b950);
  background:linear-gradient(90deg, transparent, rgb(8 10 14 / .86) 16%, rgb(8 10 14 / .86) 84%, transparent);
  text-shadow:0 1px 5px rgb(3 8 12 / .92);
  animation:sf-sj-slam .26s cubic-bezier(.2,.9,.3,1) both; }
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
.sf-sj[data-level="reduced"] .sf-sj__bossburn, .sf-sj[data-level="reduced"] .sf-sj__bossfill { transition:none; }
html.sf-reduce-motion .sf-sj__call, html.sf-reduce-motion .sf-sj__slam,
html.sf-reduce-motion .sf-sj__tallyrow, html.sf-reduce-motion .sf-sj__card,
html.sf-reduce-motion .sf-sj__shatter, html.sf-reduce-motion .sf-sj__bossdown,
html.sf-reduce-motion .sf-sj__pop { animation:none; }
html.sf-reduce-motion .sf-sj__bossburn, html.sf-reduce-motion .sf-sj__bossfill { transition:none; }
@media (prefers-reduced-motion: reduce) {
  .sf-sj__call, .sf-sj__slam, .sf-sj__tallyrow, .sf-sj__card, .sf-sj__shatter, .sf-sj__bossdown, .sf-sj__pop { animation:none; }
  .sf-sj__bossburn, .sf-sj__bossfill { transition:none; }
}
@media (forced-colors: active) {
  .sf-sj__herofig, .sf-sj__call, .sf-sj__slamtitle, .sf-sj__bossdown { color:CanvasText; text-shadow:none; }
  .sf-sj__bossfill, .sf-sj__herodeplete { background:Highlight; forced-color-adjust:none; }
}
`;

export default swarmJuiceHud;
