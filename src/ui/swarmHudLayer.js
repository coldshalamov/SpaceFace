// DEMO-SWARM-HUD-2 — Swarm's dedicated arcade HUD layer over the shared flight HUD.
//
// Layout (1280x720, middle 60% completely open; shared bottom-left flight cluster, power rail
// and bottom-right radar untouched):
//   1. Top edge, full width — 6 px molten Foundry orange XP bar with white-hot leading tip;
//      `LV N` in the display face at the left end; `LEVEL N` riding centre ~1.2 s on level-up;
//      `+1 pick` pulsing once at the right end, settling to quiet `1 pick` / `2 picks`.
//   2. Top centre — the Round Plate: small-caps `ROUND N` over the authored round name in the
//      display face, plus hostiles left (`12 left`) or `NEXT ROUND` countdown between rounds.
//      In a boss round, the lit Boss Machine-Plate takes this seat with a heavy segmented bar.
//      Yields cleanly whenever a transient Stage round/boss banner holds the top-centre lane.
//   3. Directly under the Round/Boss plate — the Chain, only while live: a multiplier (`×2`,
//      `×3`, ...) that climbs visibly, and at most one short line in Madame Kiln's voice.
//   4. Top right — Scrap (machined chip icon + big tabular numeral), quiet Score beneath it,
//      and a transient room-kill multiplier (`×2.5`) flash beside Scrap when the room pays.
//
// Engineering contracts:
//   - Read-only presentation: never writes state.run, never emits gameplay intents.
//   - Zero layout reads (getBoundingClientRect, offsetWidth...) and zero querySelector in update().
//   - Writes DOM only on change via hudFieldsUnchanged (src/ui/hudSkipUnchanged.js) + slot caches.
//   - All bar fills move by transform: scaleX(...) / translateX(...), never style.width.
//   - Reduced motion (sf-reduce-motion, sf-reduce-flash, prefers-reduced-motion, arcadeEffects=reduced):
//     no flash, pulse, or climb pop; all words still update immediately.

import { swarmCourseFor } from '../data/swarmCourse.js';
import { isSwarmDeepRun } from '../systems/survivalSwarm.js';
import { CIRCUIT_ROUNDS_PER_STAGE, CIRCUIT_STAGE_COUNT } from '../systems/survivalCircuit.js';
import { hudFieldsUnchanged } from './hudSkipUnchanged.js';

export const SWARM_HUD_STYLE_ID = 'sf-swhud-css';
export const SWARM_HUD_BODY_CLASS = 'sf-swarm-hud';
/** Room kills in Swarm pay 2.5× Scrap and XP (04_SWARM.md §2, survivalRewards SWARM_ROOM_KILL_PAY). */
export const SWARM_ROOM_KILL_MULTIPLIER = 2.5;
/** How long the room-kill multiplier badge flashes beside Scrap, in sim seconds. */
export const SWARM_ROOM_KILL_FLASH_S = 1.1;
/** How long the fresh `+1 pick` chip stays in its pulsing beat after a level-up, in sim seconds. */
export const SWARM_PICK_PULSE_S = 1.2;

/**
 * Exact physical/room cause phrases published by survivalRewards on `run:awarded`, plus raw
 * room cause tags. Only these count as "a kill paid by the room" (×2.5 Scrap).
 */
const ROOM_KILL_PHRASES = new Set([
  'Ram',
  'The environment',
  'Thrown mass',
  'Massline whip',
  'Ram Plate',
  'Tow Flail',
  'The arena',
  'Collision',
  'Chain blast',
]);
const ROOM_KILL_CAUSES = new Set([
  'terrain',
  'collision',
  'thrown',
  'hazard',
  'field',
  'explosive',
  'terrain_collision',
  'ship_collision',
  'body_collision',
  'massline_throw',
  'rope_throw',
  'massline_whip',
  'direct_contact',
  'environment',
  'chain_detonation',
]);

export function isRoomKillCausePhrase(causePhrase) {
  if (typeof causePhrase !== 'string' || !causePhrase) return false;
  if (ROOM_KILL_PHRASES.has(causePhrase)) return true;
  return ROOM_KILL_CAUSES.has(causePhrase.toLowerCase());
}

/** Small-caps kicker above the round's display name (e.g. `ROUND 6`, `ROUND 31 · DEEP`). */
export function formatSwarmRoundKicker(run, circuitRound = null, overtime = false) {
  const wave = Math.max(1, (run && run.wave) || 1);
  if (circuitRound) {
    return `STAGE ${circuitRound.stage}/${CIRCUIT_STAGE_COUNT} · ROUND ${circuitRound.localRound}/${CIRCUIT_ROUNDS_PER_STAGE}`;
  }
  if (overtime) return `OVERTIME · ROUND ${wave}`;
  return isSwarmDeepRun(run) ? `ROUND ${wave} · DEEP` : `ROUND ${wave}`;
}

/** Authored round name in the display face (e.g. `Mind the Gap`, `Iron Maw`, `The Charge`). */
export function formatSwarmRoundName(run, fallbackArena = 'Ricochet Foundry', waveOverride = null) {
  const wave = Number.isInteger(waveOverride) && waveOverride >= 1
    ? waveOverride
    : Math.max(1, (run && run.wave) || 1);
  if (isSwarmDeepRun(run)) return 'Deep Water';
  const course = swarmCourseFor(wave);
  if (course && typeof course.name === 'string' && course.name) return course.name;
  return fallbackArena || 'Swarm';
}

/** Right-end XP pick chip copy: `+1 pick` on the level-up beat, then quiet `1 pick` / `2 picks`. */
export function formatSwarmPickLabel(banked, freshPulse = false, freshDelta = 1) {
  const n = Number.isInteger(banked) ? Math.max(0, banked) : 0;
  if (n <= 0) return '';
  if (freshPulse) {
    const d = Number.isInteger(freshDelta) && freshDelta > 1 ? freshDelta : 1;
    return d === 1 ? '+1 pick' : `+${d} picks`;
  }
  return n === 1 ? '1 pick' : `${n} picks`;
}

/** Format multiplier cleanly (`×2.5`, `×5`, never `×2.50`). */
export function formatRoomMultiplier(mult = SWARM_ROOM_KILL_MULTIPLIER) {
  const n = Number(mult);
  if (!Number.isFinite(n) || n <= 1) return '';
  const rounded = Math.round(n * 10) / 10;
  return Number.isInteger(rounded) ? `×${rounded}` : `×${rounded.toFixed(1)}`;
}

function quantScale(value) {
  const raw = Number.isFinite(value) ? value : 0;
  const bounded = raw < 0 ? 0 : raw > 1 ? 1 : raw;
  return Math.round(bounded * 1000) / 1000;
}

const SCRAP_CHIP_SVG = '<svg class="sf-swhud__chip-svg" viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">'
  + '<polygon points="5,1.8 15,1.8 18.2,5.6 18.2,14.4 15,18.2 5,18.2 1.8,14.4 1.8,5.6" fill="#ff6a2b" stroke="#ffd98c" stroke-width="1.2"/>'
  + '<polygon points="6.6,4.8 13.4,4.8 15.2,7.2 15.2,12.8 13.4,15.2 6.6,15.2 4.8,12.8 4.8,7.2" fill="none" stroke="#18100a" stroke-width="1.2"/>'
  + '<rect x="8.1" y="8.1" width="3.8" height="3.8" fill="#120b07"/>'
  + '</svg>';

export function createSwarmHudLayer() {
  let dom = null;
  const cache = Object.create(null);
  let lastStateRef = null;
  let lastChainBump = 0;
  let chainBumpPhase = '';
  let lastPickPulseAt = -Infinity;
  let pickPulsePhase = '';
  let lastRoomFlashAt = -Infinity;
  let roomFlashPhase = '';
  let lastXpFlashAt = -Infinity;
  let xpFlashPhase = '';

  function resetCache() {
    for (const k of Object.keys(cache)) delete cache[k];
    lastChainBump = 0;
    chainBumpPhase = '';
    lastPickPulseAt = -Infinity;
    pickPulsePhase = '';
    lastRoomFlashAt = -Infinity;
    roomFlashPhase = '';
    lastXpFlashAt = -Infinity;
    xpFlashPhase = '';
  }

  function setText(node, text) {
    if (!node) return;
    const val = text == null ? '' : String(text);
    const key = `${node.__swKey}:t`;
    if (cache[key] === val) return;
    cache[key] = val;
    node.textContent = val;
  }

  function setHidden(node, hidden) {
    if (!node) return;
    const next = !!hidden;
    const key = `${node.__swKey}:h`;
    if (cache[key] === next) return;
    cache[key] = next;
    node.hidden = next;
  }

  function setAttr(node, name, value) {
    if (!node) return;
    const val = value == null ? null : String(value);
    const key = `${node.__swKey}:a:${name}`;
    if (cache[key] === val) return;
    cache[key] = val;
    if (val === null) {
      if (typeof node.removeAttribute === 'function') node.removeAttribute(name);
    } else if (typeof node.setAttribute === 'function') {
      node.setAttribute(name, val);
    }
  }

  function setData(node, prop, value) {
    if (!node || !node.dataset) return;
    const val = value == null ? '' : String(value);
    const key = `${node.__swKey}:d:${prop}`;
    if (cache[key] === val) return;
    cache[key] = val;
    if (val === '') delete node.dataset[prop];
    else node.dataset[prop] = val;
  }

  function setScaleX(node, value) {
    if (!node || !node.style) return;
    const q = quantScale(value);
    const key = `${node.__swKey}:sx`;
    if (cache[key] === q) return;
    cache[key] = q;
    node.style.transform = `scaleX(${q})`;
  }

  function setTipX(node, value) {
    if (!node || !node.style) return;
    const q = quantScale(value);
    const key = `${node.__swKey}:tx`;
    if (cache[key] === q) return;
    cache[key] = q;
    node.style.transform = `translateX(${(q * 100).toFixed(1)}%)`;
  }

  function injectCss(doc) {
    if (!doc || !doc.head || typeof doc.getElementById !== 'function') return;
    if (doc.getElementById(SWARM_HUD_STYLE_ID)) return;
    const style = doc.createElement('style');
    style.id = SWARM_HUD_STYLE_ID;
    style.textContent = SWARM_HUD_LAYER_CSS;
    doc.head.appendChild(style);
  }

  function ensureDom() {
    if (typeof document === 'undefined') return null;
    if (dom && dom.root && dom.root.isConnected !== false) return dom;
    const candidates = [
      typeof document.getElementById === 'function' ? document.getElementById('hud') : null,
      document.body,
      typeof document.querySelector === 'function' ? document.querySelector('.sf-leftcontext') : null,
    ];
    const host = candidates.find((el) => el && typeof el.appendChild === 'function') || null;
    if (!host) return null;
    injectCss(document);

    let seq = 0;
    const mk = (tag, cls, parent) => {
      const el = document.createElement(tag);
      if (cls) el.className = cls;
      el.__swKey = `s${seq++}`;
      if (parent) parent.appendChild(el);
      return el;
    };

    const root = mk('div', 'sf-swhud');
    root.id = 'sf-swhud';
    root.setAttribute('role', 'region');
    root.setAttribute('aria-label', 'Swarm run status');
    root.hidden = true;

    // 1. Full-width molten Foundry XP bar along the very top edge.
    const xpRail = mk('div', 'sf-swhud__xp-rail', root);
    xpRail.setAttribute('role', 'progressbar');
    xpRail.setAttribute('aria-label', 'Pilot experience');
    xpRail.setAttribute('aria-valuemin', '0');
    xpRail.setAttribute('aria-valuemax', '100');
    xpRail.setAttribute('aria-valuenow', '0');
    const xpFill = mk('div', 'sf-swhud__xp-fill', xpRail);
    const xpTipRail = mk('div', 'sf-swhud__xp-tip-rail', xpRail);
    mk('div', 'sf-swhud__xp-tip', xpTipRail);
    const xpFlash = mk('div', 'sf-swhud__xp-flash', xpRail);
    xpFlash.setAttribute('aria-hidden', 'true');

    // XP bar flanks: LV N (left), LEVEL N ride (centre, transient ~1.2 s), +1 pick / N picks (right).
    const xpFlanks = mk('div', 'sf-swhud__xp-flanks', root);
    const lv = mk('div', 'sf-swhud__lv', xpFlanks);
    const lvK = mk('span', 'sf-swhud__lv-k', lv);
    lvK.textContent = 'LV';
    const lvN = mk('span', 'sf-swhud__lv-n', lv);
    lvN.textContent = '1';

    const lvRide = mk('div', 'sf-swhud__lv-ride', xpFlanks);
    lvRide.setAttribute('role', 'status');
    lvRide.setAttribute('aria-live', 'polite');
    lvRide.hidden = true;

    const picks = mk('div', 'sf-swhud__picks', xpFlanks);
    picks.setAttribute('role', 'status');
    picks.hidden = true;

    // Quiet top-left contextual notes under LV (hidden during ordinary combat).
    const notes = mk('div', 'sf-swhud__notes', root);
    notes.hidden = true;
    const cast = mk('div', 'sf-swhud__cast', notes);
    cast.hidden = true;
    const castRow = mk('div', 'sf-swhud__cast-row', cast);
    const castGlyphs = mk('span', 'sf-swhud__cast-glyphs', castRow);
    const castLine = mk('span', 'sf-swhud__cast-line', castRow);
    const castAnswer = mk('div', 'sf-swhud__cast-answer', cast);
    castAnswer.hidden = true;
    const guidance = mk('div', 'sf-swhud__note sf-swhud__guidance', notes);
    guidance.hidden = true;
    const twist = mk('div', 'sf-swhud__note sf-swhud__twist', notes);
    twist.hidden = true;
    const heroCue = mk('div', 'sf-swhud__note sf-swhud__hero', notes);
    heroCue.hidden = true;
    const mods = mk('div', 'sf-swhud__note sf-swhud__mods', notes);
    mods.hidden = true;
    const death = mk('div', 'sf-swhud__note sf-swhud__death', notes);
    death.setAttribute('role', 'status');
    death.hidden = true;

    // 2 & 3. Top-centre lane: Round Plate OR Boss Machine-Plate, then Chain directly beneath.
    const centre = mk('div', 'sf-swhud__centre', root);

    const round = mk('div', 'sf-swhud__round', centre);
    round.setAttribute('role', 'status');
    const roundId = mk('div', 'sf-swhud__round-id', round);
    const roundKicker = mk('div', 'sf-swhud__round-kicker', roundId);
    const roundName = mk('div', 'sf-swhud__round-name', roundId);
    const roundSep = mk('div', 'sf-swhud__round-sep', round);
    roundSep.setAttribute('aria-hidden', 'true');
    const roundStat = mk('div', 'sf-swhud__round-stat', round);
    const roundNum = mk('span', 'sf-swhud__round-num', roundStat);
    const roundUnit = mk('span', 'sf-swhud__round-unit', roundStat);

    const boss = mk('div', 'sf-swhud__boss', centre);
    boss.setAttribute('role', 'meter');
    boss.setAttribute('aria-valuemin', '0');
    boss.setAttribute('aria-valuemax', '100');
    boss.setAttribute('aria-valuenow', '100');
    boss.hidden = true;
    const bossHead = mk('div', 'sf-swhud__boss-head', boss);
    const bossId = mk('div', 'sf-swhud__boss-id', bossHead);
    const bossKicker = mk('span', 'sf-swhud__boss-kicker', bossId);
    const bossName = mk('span', 'sf-swhud__boss-name', bossId);
    const bossPct = mk('span', 'sf-swhud__boss-pct', bossHead);
    const bossBar = mk('div', 'sf-swhud__boss-bar', boss);
    const bossBurn = mk('div', 'sf-swhud__boss-burn', bossBar);
    const bossFill = mk('div', 'sf-swhud__boss-fill', bossBar);
    const bossSegs = mk('div', 'sf-swhud__boss-segs', bossBar);
    bossSegs.setAttribute('aria-hidden', 'true');
    const bossInst = mk('div', 'sf-swhud__boss-inst', boss);
    bossInst.hidden = true;

    const chain = mk('div', 'sf-swhud__chain', centre);
    chain.hidden = true;
    const chainRow = mk('div', 'sf-swhud__chain-row', chain);
    const chainMult = mk('span', 'sf-swhud__chain-mult', chainRow);
    const chainCount = mk('span', 'sf-swhud__chain-count', chainRow);
    const chainLine = mk('span', 'sf-swhud__chain-line', chainRow);
    chainLine.hidden = true;
    const chainTrack = mk('div', 'sf-swhud__chain-track', chain);
    const chainFill = mk('div', 'sf-swhud__chain-fill', chainTrack);

    // 4. Top-right Scrap + Score.
    const purse = mk('div', 'sf-swhud__purse', root);
    purse.setAttribute('aria-label', 'Scrap and score');
    const scrapRow = mk('div', 'sf-swhud__scrap-row', purse);
    const roomMult = mk('span', 'sf-swhud__room-mult', scrapRow);
    roomMult.hidden = true;
    const chipIcon = mk('span', 'sf-swhud__chip-icon', scrapRow);
    chipIcon.setAttribute('aria-hidden', 'true');
    chipIcon.innerHTML = SCRAP_CHIP_SVG;
    const scrapNum = mk('span', 'sf-swhud__scrap-num', scrapRow);
    scrapNum.textContent = '0';

    const scoreRow = mk('div', 'sf-swhud__score-row', purse);
    const scoreLabel = mk('span', 'sf-swhud__score-label', scoreRow);
    scoreLabel.textContent = 'Score';
    const scoreNum = mk('span', 'sf-swhud__score-num', scoreRow);
    scoreNum.textContent = '0';

    host.appendChild(root);
    resetCache();
    root._sfObstacles = [xpRail, lv, centre, purse];
    dom = {
      root,
      xpRail, xpFill, xpTipRail, xpFlash,
      lv, lvN, lvRide, picks,
      notes, cast, castGlyphs, castLine, castAnswer, guidance, twist, heroCue, mods, death,
      centre, round, roundKicker, roundName, roundSep, roundStat, roundNum, roundUnit,
      boss, bossKicker, bossName, bossPct, bossBurn, bossFill, bossInst,
      chain, chainMult, chainCount, chainLine, chainFill,
      purse, roomMult, scrapNum, scoreNum,
    };
    return dom;
  }

  function hide() {
    if (dom && dom.root) setHidden(dom.root, true);
  }

  function destroy() {
    if (dom && dom.root && dom.root.parentNode) {
      dom.root.parentNode.removeChild(dom.root);
    }
    dom = null;
    lastStateRef = null;
    resetCache();
  }

  /**
   * Paint the Swarm HUD layer from a pre-built flat view snapshot.
   * Skips all DOM writes when every rendered field matches the previous frame.
   */
  function update(state, view) {
    if (typeof document === 'undefined') return;
    if (!view || !view.visible) {
      hide();
      return;
    }
    const d = ensureDom();
    if (!d) return;

    const freshMount = lastStateRef !== state || d.root.hidden;
    lastStateRef = state;
    setHidden(d.root, false);

    // Fast path: compare every scalar field with zero allocations through hudSkipUnchanged.
    // Force repaint on fresh mount or reconnect.
    const unchanged = !freshMount && hudFieldsUnchanged(state, 'swarmHudLayer', (out, _st, v) => {
      let i = 0;
      out[i++] = v.reduced;
      out[i++] = v.level;
      out[i++] = v.xpFracQ;
      out[i++] = v.xpFlashAt;
      out[i++] = v.xpFlashing;
      out[i++] = v.levelRideText;
      out[i++] = v.banked;
      out[i++] = v.pickText;
      out[i++] = v.pickPulsing;
      out[i++] = v.pickPulseAt;
      out[i++] = v.bannerOwnsTop;
      out[i++] = v.subCallActive;
      out[i++] = v.bossVisible;
      out[i++] = v.bossKicker;
      out[i++] = v.bossName;
      out[i++] = v.bossPctText;
      out[i++] = v.bossFracQ;
      out[i++] = v.bossAria;
      out[i++] = v.bossInst;
      out[i++] = v.roundKicker;
      out[i++] = v.roundName;
      out[i++] = v.roundNum;
      out[i++] = v.roundUnit;
      out[i++] = v.roundMode;
      out[i++] = v.chainVisible;
      out[i++] = v.chainMult;
      out[i++] = v.chainCount;
      out[i++] = v.chainLine;
      out[i++] = v.chainTier;
      out[i++] = v.chainOverdrive;
      out[i++] = v.chainUrgency;
      out[i++] = v.chainDepleteQ;
      out[i++] = v.chainAria;
      out[i++] = v.scrapText;
      out[i++] = v.scoreText;
      out[i++] = v.roomMultText;
      out[i++] = v.roomFlashAt;
      out[i++] = v.castSig;
      out[i++] = v.guidanceText;
      out[i++] = v.guidanceWarn;
      out[i++] = v.twistText;
      out[i++] = v.heroCueText;
      out[i++] = v.heroCueState;
      out[i++] = v.modsText;
      out[i++] = v.deathText;
      return i;
    }, view);
    if (unchanged) return;

    setData(d.root, 'reduced', view.reduced ? '1' : '');

    // --- 1. Top edge XP bar & flanks ---------------------------------------------------
    setScaleX(d.xpFill, view.xpFracQ);
    setTipX(d.xpTipRail, view.xpFracQ);
    setHidden(d.xpTipRail, view.xpFracQ <= 0.002);
    setAttr(d.xpRail, 'aria-valuenow', Math.round(view.xpFracQ * 100));
    setText(d.lvN, String(view.level));
    setAttr(d.lv, 'aria-label', `Pilot level ${view.level}`);

    if (view.xpFlashing && !view.reduced) {
      if (view.xpFlashAt !== lastXpFlashAt) {
        lastXpFlashAt = view.xpFlashAt;
        xpFlashPhase = xpFlashPhase === 'a' ? 'b' : 'a';
      }
      setData(d.xpFlash, 'flash', xpFlashPhase);
    } else {
      setData(d.xpFlash, 'flash', '');
    }

    const showRide = !!view.levelRideText;
    setHidden(d.lvRide, !showRide);
    if (showRide) setText(d.lvRide, view.levelRideText);

    const showPicks = !!view.pickText;
    setHidden(d.picks, !showPicks);
    if (showPicks) {
      setText(d.picks, view.pickText);
      if (view.pickPulsing && !view.reduced) {
        if (view.pickPulseAt !== lastPickPulseAt) {
          lastPickPulseAt = view.pickPulseAt;
          pickPulsePhase = pickPulsePhase === 'a' ? 'b' : 'a';
        }
        setData(d.picks, 'pulse', pickPulsePhase);
      } else {
        setData(d.picks, 'pulse', '');
      }
      setData(d.picks, 'fresh', view.pickPulsing ? '1' : '');
    }

    // --- 2. Top-centre Round Plate OR Boss Machine-Plate -------------------------------
    const hideCentrePlate = !!view.bannerOwnsTop;
    const showBoss = !hideCentrePlate && !!view.bossVisible;
    const showRound = !hideCentrePlate && !showBoss;

    setHidden(d.round, !showRound);
    if (showRound) {
      setText(d.roundKicker, view.roundKicker);
      setText(d.roundName, view.roundName);
      const hasStat = !!view.roundNum;
      setHidden(d.roundSep, !hasStat);
      setHidden(d.roundStat, !hasStat);
      if (hasStat) {
        setText(d.roundNum, view.roundNum);
        setText(d.roundUnit, view.roundUnit);
        setHidden(d.roundUnit, !view.roundUnit);
      }
      setData(d.round, 'mode', view.roundMode || 'fight');
    }

    setHidden(d.boss, !showBoss);
    if (showBoss) {
      setText(d.bossKicker, view.bossKicker);
      setText(d.bossName, view.bossName);
      setText(d.bossPct, view.bossPctText);
      setScaleX(d.bossFill, view.bossFracQ);
      setScaleX(d.bossBurn, view.bossFracQ);
      setAttr(d.boss, 'aria-valuenow', Math.round(view.bossFracQ * 100));
      setAttr(d.boss, 'aria-label', view.bossAria);
      const hasInst = !!view.bossInst;
      setHidden(d.bossInst, !hasInst);
      if (hasInst) setText(d.bossInst, view.bossInst);
    }

    // --- 3. Under the Round/Boss plate — Chain (only while live & clear of banners/calls) --
    const showChain = !hideCentrePlate && !view.subCallActive && !!view.chainVisible;
    setHidden(d.chain, !showChain);
    if (showChain) {
      setText(d.chainMult, view.chainMult);
      setText(d.chainCount, view.chainCount > 1 ? `· ${view.chainCount}` : '');
      setHidden(d.chainCount, view.chainCount <= 1);
      const hasLine = !!view.chainLine;
      setHidden(d.chainLine, !hasLine);
      if (hasLine) setText(d.chainLine, view.chainLine);
      setData(d.chain, 'tier', String(view.chainTier || 1));
      setData(d.chain, 'overdrive', view.chainOverdrive ? '1' : '');
      setData(d.chain, 'urgency', view.chainUrgency || '');
      if (!view.reduced && view.chainCount > lastChainBump && lastChainBump > 0) {
        chainBumpPhase = chainBumpPhase === 'a' ? 'b' : 'a';
        setData(d.chainMult, 'bump', chainBumpPhase);
      } else if (view.reduced) {
        setData(d.chainMult, 'bump', '');
      }
      lastChainBump = view.chainCount;
      setScaleX(d.chainFill, view.chainDepleteQ);
      setAttr(d.chain, 'aria-label', view.chainAria);
    } else if (!view.chainVisible) {
      lastChainBump = 0;
    }

    // --- 4. Top-right Scrap + Score + room-kill multiplier flash -----------------------
    setText(d.scrapNum, view.scrapText);
    setText(d.scoreNum, view.scoreText);
    const showRoomMult = !!view.roomMultText;
    setHidden(d.roomMult, !showRoomMult);
    if (showRoomMult) {
      setText(d.roomMult, view.roomMultText);
      if (!view.reduced) {
        if (view.roomFlashAt !== lastRoomFlashAt) {
          lastRoomFlashAt = view.roomFlashAt;
          roomFlashPhase = roomFlashPhase === 'a' ? 'b' : 'a';
        }
        setData(d.roomMult, 'flash', roomFlashPhase);
      } else {
        setData(d.roomMult, 'flash', '');
      }
    }

    // --- Quiet top-left contextual notes (only when present) ---------------------------
    const hasCast = !!view.castSig;
    const hasGuidance = !!view.guidanceText;
    const hasTwist = !!view.twistText;
    const hasHero = !!view.heroCueText;
    const hasMods = !!view.modsText;
    const hasDeath = !!view.deathText;
    const anyNotes = hasCast || hasGuidance || hasTwist || hasHero || hasMods || hasDeath;
    setHidden(d.notes, !anyNotes);

    if (anyNotes) {
      setHidden(d.cast, !hasCast);
      if (hasCast && cache.__castSig !== view.castSig) {
        cache.__castSig = view.castSig;
        d.castGlyphs.innerHTML = view.castGlyphsHtml || '';
        setHidden(d.castGlyphs, !view.castGlyphsHtml);
        setText(d.castLine, view.castLine || '');
        setHidden(d.castAnswer, !view.castAnswer);
        if (view.castAnswer) setText(d.castAnswer, view.castAnswer);
      }
      setHidden(d.guidance, !hasGuidance);
      if (hasGuidance) {
        setText(d.guidance, view.guidanceText);
        setData(d.guidance, 'warn', view.guidanceWarn ? '1' : '');
      }
      setHidden(d.twist, !hasTwist);
      if (hasTwist) setText(d.twist, view.twistText);
      setHidden(d.heroCue, !hasHero);
      if (hasHero) {
        setText(d.heroCue, view.heroCueText);
        setData(d.heroCue, 'state', view.heroCueState || '');
      }
      setHidden(d.mods, !hasMods);
      if (hasMods) setText(d.mods, view.modsText);
      setHidden(d.death, !hasDeath);
      if (hasDeath) setText(d.death, view.deathText);
    }
  }

  return {
    update,
    hide,
    destroy,
    get dom() { return dom; },
  };
}

// Deckplate / Lit Foundry visual grammar:
// - Display face (--dp-face-display: Archivo / Bricolage Grotesque) ONLY for big numerals and
//   round/boss name. Instrument Sans (--dp-face-read) for words. Tabular numerals everywhere.
// - Molten Foundry orange (#ff6a2b -> #f2b950 -> #fff4dc) for XP and Scrap; crimson (#ff5038)
//   only for danger / boss plate. No rings, no glow soup, no rounded web-app cards, no backdrop-filter.
export const SWARM_HUD_LAYER_CSS = `
.sf-swhud {
  position: fixed;
  inset: 0;
  z-index: 15;
  pointer-events: none;
  font-family: var(--dp-face-read, "Instrument Sans", system-ui, sans-serif);
  color: var(--dp-ink, #e8e2d4);
  font-variant-numeric: tabular-nums lining-nums;
}
.sf-swhud[hidden] { display: none; }

/* ── 1. Top edge, full-width molten Foundry XP bar ── */
.sf-swhud__xp-rail {
  position: fixed;
  top: var(--sf-safe-inset-top, 0px);
  left: 0;
  right: 0;
  height: 6px;
  background: rgb(7 9 13 / .86);
  border-bottom: 1px solid rgb(232 226 212 / .14);
  overflow: hidden;
}
.sf-swhud__xp-fill {
  position: absolute;
  inset: 0;
  transform-origin: left center;
  transform: scaleX(0);
  background: linear-gradient(90deg, #9c2f0c 0%, var(--fh-hazard, #ff6a2b) 56%, var(--dp-lamp, #f2b950) 92%, #ffe6b3 100%);
  will-change: transform;
}
.sf-swhud__xp-tip-rail {
  position: absolute;
  inset: 0;
  transform: translateX(0%);
  will-change: transform;
}
.sf-swhud__xp-tip-rail[hidden] { display: none; }
.sf-swhud__xp-tip {
  position: absolute;
  top: 0;
  bottom: 0;
  left: -26px;
  width: 28px;
  background: linear-gradient(90deg, transparent 0%, #ff9b42 42%, #fff2d4 86%, #ffffff 100%);
}
.sf-swhud__xp-flash {
  position: absolute;
  inset: 0;
  opacity: 0;
  background: linear-gradient(90deg, var(--fh-hazard, #ff6a2b) 0%, #fff4dc 50%, var(--fh-hazard, #ff6a2b) 100%);
}
.sf-swhud__xp-flash[data-flash="a"] { animation: sf-swhud-xpflash-a .55s ease-out 1 both; }
.sf-swhud__xp-flash[data-flash="b"] { animation: sf-swhud-xpflash-b .55s ease-out 1 both; }
@keyframes sf-swhud-xpflash-a { 0% { opacity: .92; } 100% { opacity: 0; } }
@keyframes sf-swhud-xpflash-b { 0% { opacity: .92; } 100% { opacity: 0; } }

/* ── XP bar flanks: LV N left, LEVEL N centre ride, +1 pick / N picks right ── */
.sf-swhud__xp-flanks {
  position: fixed;
  top: calc(9px + var(--sf-safe-inset-top, 0px));
  left: calc(18px + var(--sf-safe-inset-x, 0px));
  right: calc(18px + var(--sf-safe-inset-x, 0px));
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 20px;
}
.sf-swhud__lv {
  display: inline-flex;
  align-items: baseline;
  gap: 5px;
  padding: 2px 10px 2px 7px;
  border-left: 2px solid var(--fh-hazard, #ff6a2b);
  background: linear-gradient(90deg, rgb(8 10 14 / .78) 0%, rgb(8 10 14 / .42) 74%, transparent 100%);
  text-shadow: 0 1px 3px rgb(4 6 9 / .92);
}
.sf-swhud__lv-k {
  font-family: var(--dp-face-read, "Instrument Sans", system-ui, sans-serif);
  font-weight: 600;
  font-size: 12px;
  letter-spacing: .08em;
  color: var(--dp-ink-dim, #b7b4a6);
}
.sf-swhud__lv-n {
  font-family: var(--dp-face-display, "Archivo", system-ui, sans-serif);
  font-weight: 800;
  font-size: 20px;
  line-height: 1;
  letter-spacing: -.01em;
  color: var(--dp-ink, #e8e2d4);
}
.sf-swhud__lv-ride {
  position: absolute;
  left: 50%;
  top: -3px;
  transform: translateX(-50%);
  padding: 1px 16px 2px;
  font-family: var(--dp-face-display, "Archivo", system-ui, sans-serif);
  font-weight: 800;
  font-size: 12px;
  line-height: 1.25;
  letter-spacing: .16em;
  color: #fff4dc;
  background: linear-gradient(90deg, transparent 0%, rgb(16 11 8 / .92) 16%, rgb(16 11 8 / .92) 84%, transparent 100%);
  border-bottom: 1px solid var(--fh-hazard, #ff6a2b);
  text-shadow: 0 1px 4px rgb(4 6 9 / .95);
  white-space: nowrap;
}
.sf-swhud__lv-ride[hidden] { display: none; }

.sf-swhud__picks {
  margin-left: auto;
  padding: 2px 8px 2px 10px;
  font-family: var(--dp-face-read, "Instrument Sans", system-ui, sans-serif);
  font-weight: 600;
  font-size: 12px;
  line-height: 1.25;
  letter-spacing: .03em;
  color: var(--dp-ink-dim, #b7b4a6);
  border-right: 2px solid var(--dp-lamp, #f2b950);
  background: linear-gradient(270deg, rgb(8 10 14 / .78) 0%, rgb(8 10 14 / .44) 76%, transparent 100%);
  text-shadow: 0 1px 3px rgb(4 6 9 / .92);
  white-space: nowrap;
}
.sf-swhud__picks[hidden] { display: none; }
.sf-swhud__picks[data-fresh="1"] {
  color: var(--dp-lamp-hot, #ffd98c);
  border-right-color: var(--fh-hazard, #ff6a2b);
}
.sf-swhud__picks[data-pulse="a"] { animation: sf-swhud-pick-a .48s cubic-bezier(.2, .9, .3, 1) 1 both; }
.sf-swhud__picks[data-pulse="b"] { animation: sf-swhud-pick-b .48s cubic-bezier(.2, .9, .3, 1) 1 both; }
@keyframes sf-swhud-pick-a {
  0% { transform: scale(1.16); color: #fff4dc; }
  100% { transform: scale(1); }
}
@keyframes sf-swhud-pick-b {
  0% { transform: scale(1.16); color: #fff4dc; }
  100% { transform: scale(1); }
}

/* ── Quiet top-left notes under LV (hidden during ordinary flight) ── */
.sf-swhud__notes {
  position: fixed;
  top: calc(40px + var(--sf-safe-inset-top, 0px));
  left: calc(18px + var(--sf-safe-inset-x, 0px));
  max-width: min(300px, 30vw);
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.sf-swhud__notes[hidden] { display: none; }
.sf-swhud__cast {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 5px 12px 5px 10px;
  border-left: 2px solid var(--dp-lamp, #f2b950);
  background: linear-gradient(90deg, rgb(8 10 14 / .80) 0%, rgb(8 10 14 / .50) 80%, transparent 100%);
  text-shadow: 0 1px 3px rgb(4 6 9 / .92);
}
.sf-swhud__cast[hidden] { display: none; }
.sf-swhud__cast-row { display: flex; align-items: flex-start; gap: 7px; }
.sf-swhud__cast-glyphs { display: inline-flex; align-items: center; gap: 3px; flex: none; padding-top: 2px; }
.sf-swhud__cast-glyphs[hidden] { display: none; }
.sf-swhud__cast-line { font-weight: 600; font-size: 13px; line-height: 1.28; color: var(--dp-ink, #e8e2d4); }
.sf-swhud__cast-answer { font-weight: 500; font-size: 12px; line-height: 1.25; color: var(--dp-phos, #dfeeff); }
.sf-swhud__cast-answer[hidden] { display: none; }
.sf-swhud__note {
  padding: 3px 10px 3px 8px;
  font-weight: 550;
  font-size: 12px;
  line-height: 1.3;
  color: var(--dp-ink, #e8e2d4);
  background: linear-gradient(90deg, rgb(8 10 14 / .76) 0%, rgb(8 10 14 / .42) 78%, transparent 100%);
  text-shadow: 0 1px 3px rgb(4 6 9 / .92);
}
.sf-swhud__note[hidden] { display: none; }
.sf-swhud__guidance[data-warn="1"] {
  border-left: 2px solid var(--dp-lamp, #f2b950);
  color: var(--dp-lamp-hot, #ffd98c);
}
.sf-swhud__twist { border-left: 2px solid var(--fh-hazard, #ff6a2b); }
.sf-swhud__hero[data-state="blocked"] { color: var(--dp-ink-dim, #b7b4a6); }
.sf-swhud__mods { color: var(--dp-ink-dim, #b7b4a6); }
.sf-swhud__death {
  border-left: 2px solid var(--dp-danger, #ff5038);
  color: var(--dp-danger-hot, #ff8a70);
}

/* ── 2. Top-centre lane: Round Plate OR Boss Machine-Plate + Chain directly beneath ── */
.sf-swhud__centre {
  position: fixed;
  top: calc(28px + var(--sf-safe-inset-top, 0px));
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  max-width: min(520px, 62vw);
}

/* Ordinary Round Plate — open machined Foundry header, feathered dark scrim, zero app-card chrome */
.sf-swhud__round {
  display: inline-flex;
  align-items: center;
  gap: 16px;
  padding: 5px 22px 6px;
  background: linear-gradient(90deg, transparent 0%, rgb(8 10 14 / .80) 14%, rgb(8 10 14 / .80) 86%, transparent 100%);
  border-top: 1px solid rgb(232 226 212 / .18);
  text-shadow: 0 1px 4px rgb(4 6 9 / .92);
}
.sf-swhud__round[hidden] { display: none; }
.sf-swhud__round[data-mode="between"] {
  border-top-color: color-mix(in srgb, var(--dp-lamp, #f2b950) 55%, transparent);
}
.sf-swhud__round-id {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 1px;
  min-width: 0;
}
.sf-swhud__round-kicker {
  font-family: var(--dp-face-read, "Instrument Sans", system-ui, sans-serif);
  font-weight: 600;
  font-size: 12px;
  line-height: 1.1;
  letter-spacing: .10em;
  text-transform: uppercase;
  font-variant-caps: small-caps;
  color: var(--dp-ink-dim, #b7b4a6);
  white-space: nowrap;
}
.sf-swhud__round-name {
  font-family: var(--dp-face-display, "Archivo", system-ui, sans-serif);
  font-weight: 700;
  font-size: 19px;
  line-height: 1.08;
  letter-spacing: -.01em;
  color: var(--dp-ink, #e8e2d4);
  white-space: nowrap;
}
.sf-swhud__round-sep {
  width: 1px;
  height: 28px;
  flex: none;
  background: rgb(232 226 212 / .20);
}
.sf-swhud__round-sep[hidden] { display: none; }
.sf-swhud__round-stat {
  display: inline-flex;
  align-items: baseline;
  gap: 5px;
  flex: none;
  white-space: nowrap;
}
.sf-swhud__round-stat[hidden] { display: none; }
.sf-swhud__round-num {
  font-family: var(--dp-face-display, "Archivo", system-ui, sans-serif);
  font-weight: 800;
  font-size: 28px;
  line-height: .96;
  letter-spacing: -.02em;
  color: #f4efe6;
}
.sf-swhud__round[data-mode="between"] .sf-swhud__round-num {
  color: var(--dp-lamp-hot, #ffd98c);
}
.sf-swhud__round-unit {
  font-family: var(--dp-face-read, "Instrument Sans", system-ui, sans-serif);
  font-weight: 500;
  font-size: 12px;
  line-height: 1.1;
  color: var(--dp-ink-dim, #b7b4a6);
}
.sf-swhud__round-unit[hidden] { display: none; }

/* Boss Machine-Plate — lit Foundry steel plate with heavy 12 px segmented armor bar */
.sf-swhud__boss {
  width: min(420px, 56vw);
  padding: 6px 14px 8px;
  display: flex;
  flex-direction: column;
  gap: 5px;
  background: linear-gradient(180deg, rgb(22 18 16 / .92) 0%, rgb(11 10 12 / .92) 100%);
  border-top: 2px solid var(--dp-danger, #ff5038);
  border-bottom: 1px solid rgb(255 110 82 / .34);
  border-left: 1px solid rgb(232 226 212 / .14);
  border-right: 1px solid rgb(232 226 212 / .14);
  box-shadow: 0 4px 16px rgb(0 0 0 / .45);
  text-shadow: 0 1px 3px rgb(4 6 9 / .92);
}
.sf-swhud__boss[hidden] { display: none; }
.sf-swhud__boss-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}
.sf-swhud__boss-id {
  display: inline-flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
  overflow: hidden;
}
.sf-swhud__boss-kicker {
  font-family: var(--dp-face-read, "Instrument Sans", system-ui, sans-serif);
  font-weight: 600;
  font-size: 12px;
  letter-spacing: .09em;
  text-transform: uppercase;
  font-variant-caps: small-caps;
  color: var(--dp-danger-hot, #ff8a70);
  flex: none;
}
.sf-swhud__boss-name {
  font-family: var(--dp-face-display, "Archivo", system-ui, sans-serif);
  font-weight: 800;
  font-size: 17px;
  line-height: 1.1;
  letter-spacing: -.01em;
  color: var(--dp-ink, #e8e2d4);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.sf-swhud__boss-pct {
  font-family: var(--dp-face-display, "Archivo", system-ui, sans-serif);
  font-weight: 800;
  font-size: 17px;
  line-height: 1;
  color: var(--dp-ink, #e8e2d4);
  flex: none;
}
.sf-swhud__boss-bar {
  position: relative;
  height: 12px;
  background: rgb(6 7 10 / .94);
  border: 1px solid rgb(232 226 212 / .22);
  padding: 1px;
  overflow: hidden;
}
.sf-swhud__boss-burn,
.sf-swhud__boss-fill {
  position: absolute;
  inset: 1px;
  transform-origin: left center;
  transform: scaleX(1);
  will-change: transform;
}
.sf-swhud__boss-burn {
  background: #ffd98c;
  opacity: .55;
  transition: transform .42s ease-out;
}
.sf-swhud__boss-fill {
  background: linear-gradient(180deg, #ff7a58 0%, var(--dp-danger, #ff5038) 38%, #a61e16 100%);
  transition: transform .12s linear;
}
.sf-swhud__boss-segs {
  position: absolute;
  inset: 0;
  background:
    repeating-linear-gradient(90deg, transparent 0, transparent calc(10% - 2px), rgb(8 9 12 / .94) calc(10% - 2px), rgb(8 9 12 / .94) 10%),
    repeating-linear-gradient(90deg, transparent 0, transparent calc(25% - 3px), rgb(8 9 12 / .98) calc(25% - 3px), rgb(8 9 12 / .98) 25%);
}
.sf-swhud__boss-inst {
  font-family: var(--dp-face-read, "Instrument Sans", system-ui, sans-serif);
  font-weight: 600;
  font-size: 13px;
  line-height: 1.25;
  text-align: center;
  color: var(--dp-lamp-hot, #ffd98c);
}
.sf-swhud__boss-inst[hidden] { display: none; }

/* ── 3. Directly under the Round/Boss plate: Chain (multiplier + Kiln voice line) ── */
.sf-swhud__chain {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 2px 16px 3px;
  background: linear-gradient(90deg, transparent 0%, rgb(8 10 14 / .74) 16%, rgb(8 10 14 / .74) 84%, transparent 100%);
  text-shadow: 0 1px 3px rgb(4 6 9 / .92);
}
.sf-swhud__chain[hidden] { display: none; }
.sf-swhud__chain-row {
  display: inline-flex;
  align-items: baseline;
  gap: 7px;
  white-space: nowrap;
}
.sf-swhud__chain-mult {
  display: inline-block;
  font-family: var(--dp-face-display, "Archivo", system-ui, sans-serif);
  font-weight: 800;
  font-size: 20px;
  line-height: 1;
  letter-spacing: -.01em;
  color: var(--dp-lamp, #f2b950);
  transform-origin: center bottom;
}
.sf-swhud__chain[data-tier="3"] .sf-swhud__chain-mult { color: #ff9c38; font-size: 22px; }
.sf-swhud__chain[data-tier="4"] .sf-swhud__chain-mult { color: var(--fh-hazard, #ff6a2b); font-size: 24px; }
.sf-swhud__chain[data-tier="5"] .sf-swhud__chain-mult { color: #fff2d4; font-size: 25px; }
.sf-swhud__chain[data-urgency="final"] .sf-swhud__chain-mult { color: var(--dp-danger-hot, #ff8a70); }
.sf-swhud__chain-mult[data-bump="a"] { animation: sf-swhud-bump-a .20s cubic-bezier(.2, .9, .3, 1) 1 both; }
.sf-swhud__chain-mult[data-bump="b"] { animation: sf-swhud-bump-b .20s cubic-bezier(.2, .9, .3, 1) 1 both; }
@keyframes sf-swhud-bump-a { 0% { transform: scale(1.22); } 100% { transform: scale(1); } }
@keyframes sf-swhud-bump-b { 0% { transform: scale(1.22); } 100% { transform: scale(1); } }
.sf-swhud__chain-count {
  font-family: var(--dp-face-read, "Instrument Sans", system-ui, sans-serif);
  font-weight: 600;
  font-size: 12px;
  color: var(--dp-ink-dim, #b7b4a6);
}
.sf-swhud__chain-count[hidden] { display: none; }
.sf-swhud__chain-line {
  font-family: var(--dp-face-read, "Instrument Sans", system-ui, sans-serif);
  font-weight: 600;
  font-size: 13px;
  color: var(--dp-ink, #e8e2d4);
}
.sf-swhud__chain[data-overdrive="1"] .sf-swhud__chain-line {
  color: var(--dp-lamp-hot, #ffd98c);
}
.sf-swhud__chain-line[hidden] { display: none; }
.sf-swhud__chain-track {
  width: 112px;
  height: 3px;
  background: rgb(232 226 212 / .18);
  overflow: hidden;
}
.sf-swhud__chain-fill {
  width: 100%;
  height: 100%;
  transform-origin: left center;
  transform: scaleX(1);
  background: var(--dp-lamp, #f2b950);
  will-change: transform;
}
.sf-swhud__chain[data-tier="4"] .sf-swhud__chain-fill,
.sf-swhud__chain[data-tier="5"] .sf-swhud__chain-fill { background: var(--fh-hazard, #ff6a2b); }
.sf-swhud__chain[data-urgency="final"] .sf-swhud__chain-fill { background: var(--dp-danger, #ff5038); }

/* ── 4. Top-right Scrap + Score ── */
.sf-swhud__purse {
  position: fixed;
  top: calc(34px + var(--sf-safe-inset-top, 0px));
  right: calc(18px + var(--sf-safe-inset-x, 0px));
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
  padding: 4px 8px 5px 18px;
  border-right: 2px solid var(--fh-hazard, #ff6a2b);
  background: linear-gradient(270deg, rgb(8 10 14 / .78) 0%, rgb(8 10 14 / .44) 74%, transparent 100%);
  text-shadow: 0 1px 4px rgb(4 6 9 / .92);
}
.sf-swhud__scrap-row {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  white-space: nowrap;
}
.sf-swhud__room-mult {
  font-family: var(--dp-face-display, "Archivo", system-ui, sans-serif);
  font-weight: 800;
  font-size: 15px;
  line-height: 1;
  color: #fff4dc;
  padding: 2px 5px;
  background: rgb(255 106 43 / .28);
  border-bottom: 1px solid var(--fh-hazard, #ff6a2b);
}
.sf-swhud__room-mult[hidden] { display: none; }
.sf-swhud__room-mult[data-flash="a"] { animation: sf-swhud-room-a .35s ease-out 1 both; }
.sf-swhud__room-mult[data-flash="b"] { animation: sf-swhud-room-b .35s ease-out 1 both; }
@keyframes sf-swhud-room-a { 0% { transform: scale(1.22); } 100% { transform: scale(1); } }
@keyframes sf-swhud-room-b { 0% { transform: scale(1.22); } 100% { transform: scale(1); } }
.sf-swhud__chip-icon { display: inline-flex; align-items: center; justify-content: center; flex: none; }
.sf-swhud__chip-svg { display: block; width: 18px; height: 18px; }
.sf-swhud__scrap-num {
  font-family: var(--dp-face-display, "Archivo", system-ui, sans-serif);
  font-weight: 800;
  font-size: 28px;
  line-height: .96;
  letter-spacing: -.01em;
  color: var(--dp-lamp-hot, #ffd98c);
}
.sf-swhud__score-row {
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
  white-space: nowrap;
}
.sf-swhud__score-label {
  font-family: var(--dp-face-read, "Instrument Sans", system-ui, sans-serif);
  font-weight: 500;
  font-size: 12px;
  color: var(--dp-ink-dim, #b7b4a6);
}
.sf-swhud__score-num {
  font-family: var(--dp-face-read, "Instrument Sans", system-ui, sans-serif);
  font-weight: 600;
  font-size: 13px;
  color: var(--dp-ink, #e8e2d4);
}

/* ── 9. Short laptop (1366x650): slightly tighter top band ── */
@media (max-height: 670px) and (min-width: 761px) {
  .sf-swhud__centre { top: calc(25px + var(--sf-safe-inset-top, 0px)); gap: 4px; }
  .sf-swhud__round { padding: 4px 18px 5px; gap: 14px; }
  .sf-swhud__round-name { font-size: 17px; }
  .sf-swhud__round-num { font-size: 25px; }
  .sf-swhud__purse { top: calc(32px + var(--sf-safe-inset-top, 0px)); }
  .sf-swhud__scrap-num { font-size: 25px; }
}

/* ── 9. Phone & narrow viewports (390x844): same hierarchy compressed into two clean top rows ── */
@media (max-width: 760px) {
  .sf-swhud__xp-rail { height: 5px; }
  .sf-swhud__xp-flanks {
    top: calc(8px + var(--sf-safe-inset-top, 0px));
    left: calc(10px + var(--sf-safe-inset-x, 0px));
    right: calc(10px + var(--sf-safe-inset-x, 0px));
  }
  .sf-swhud__lv-n { font-size: 17px; }
  .sf-swhud__purse {
    top: calc(8px + var(--sf-safe-inset-top, 0px));
    right: calc(10px + var(--sf-safe-inset-x, 0px));
    padding: 2px 6px 2px 12px;
    gap: 1px;
  }
  .sf-swhud__scrap-num { font-size: 20px; }
  .sf-swhud__chip-svg { width: 15px; height: 15px; }
  .sf-swhud__score-label,
  .sf-swhud__score-num { font-size: 12px; }
  /* Picks chip moves cleanly beside LV so it never collides with Scrap on narrow screens */
  .sf-swhud__picks {
    margin-left: 8px;
    margin-right: auto;
    border-right: 0;
    border-left: 2px solid var(--dp-lamp, #f2b950);
    padding: 2px 8px;
    background: linear-gradient(90deg, rgb(8 10 14 / .76) 0%, transparent 100%);
  }
  /* Round / Boss Plate takes full centered width beneath the LV + Scrap row */
  .sf-swhud__centre {
    top: calc(46px + var(--sf-safe-inset-top, 0px));
    width: calc(100vw - 20px);
    max-width: 370px;
    gap: 4px;
  }
  .sf-swhud__round {
    padding: 4px 12px 5px;
    gap: 10px;
    max-width: 100%;
  }
  .sf-swhud__round-name { font-size: 16px; }
  .sf-swhud__round-num { font-size: 22px; }
  .sf-swhud__round-sep { height: 22px; }
  .sf-swhud__boss { width: 100%; padding: 5px 10px 7px; }
  .sf-swhud__boss-name, .sf-swhud__boss-pct { font-size: 15px; }
  .sf-swhud__chain-mult { font-size: 18px; }
  .sf-swhud__notes {
    top: calc(122px + var(--sf-safe-inset-top, 0px));
    left: 10px;
    max-width: calc(100vw - 20px);
  }
}

/* ── 9. Touch-flight phone mode (data-sf-mobile-flight="1"): clear of top vitals (14-44px),
   Powers/Pause (14-58px) and mini radar (112px right) ── */
:root[data-sf-mobile="1"][data-sf-mobile-flight="1"] .sf-swhud__xp-rail {
  top: var(--sf-safe-top, 0px);
  height: 5px;
}
:root[data-sf-mobile="1"][data-sf-mobile-flight="1"] .sf-swhud__xp-flanks {
  top: calc(62px + var(--sf-safe-top, 0px));
  left: calc(10px + var(--sf-safe-left, 0px));
  right: calc(10px + var(--sf-safe-right, 0px));
}
:root[data-sf-mobile="1"][data-sf-mobile-flight="1"] .sf-swhud__purse {
  top: calc(62px + var(--sf-safe-top, 0px));
  right: calc(10px + var(--sf-safe-right, 0px));
}
:root[data-sf-mobile="1"][data-sf-mobile-flight="1"] .sf-swhud__centre {
  top: calc(98px + var(--sf-safe-top, 0px));
  left: calc(10px + var(--sf-safe-left, 0px));
  transform: none;
  align-items: flex-start;
  width: calc(100vw - 142px - var(--sf-safe-left, 0px) - var(--sf-safe-right, 0px));
  max-width: 248px;
}
:root[data-sf-mobile="1"][data-sf-mobile-flight="1"] .sf-swhud__round {
  padding: 4px 10px;
  gap: 8px;
  background: linear-gradient(90deg, rgb(8 10 14 / .82) 0%, rgb(8 10 14 / .52) 82%, transparent 100%);
}
:root[data-sf-mobile="1"][data-sf-mobile-flight="1"] .sf-swhud__chain {
  align-items: flex-start;
  padding: 2px 10px;
  background: linear-gradient(90deg, rgb(8 10 14 / .78) 0%, transparent 100%);
}
:root[data-sf-mobile="1"][data-sf-mobile-flight="1"] .sf-swhud__notes {
  top: calc(176px + var(--sf-safe-top, 0px));
  left: calc(10px + var(--sf-safe-left, 0px));
  max-width: calc(100vw - 142px - var(--sf-safe-left, 0px) - var(--sf-safe-right, 0px));
}
:root[data-sf-mobile="1"][data-sf-mobile-flight="1"][data-sf-mobile-wheel="1"] .sf-swhud,
:root[data-sf-mobile="1"][data-sf-mobile-flight="1"][data-sf-radar-expanded="1"] .sf-swhud {
  visibility: hidden !important;
}

/* ── 11. Reduced motion / reduced flash: no flash, pulse, pop or transition; words still change ── */
.sf-swhud[data-reduced="1"] .sf-swhud__xp-flash,
.sf-swhud[data-reduced="1"] .sf-swhud__picks,
.sf-swhud[data-reduced="1"] .sf-swhud__chain-mult,
.sf-swhud[data-reduced="1"] .sf-swhud__room-mult,
html.sf-reduce-motion .sf-swhud__xp-flash,
html.sf-reduce-motion .sf-swhud__picks,
html.sf-reduce-motion .sf-swhud__chain-mult,
html.sf-reduce-motion .sf-swhud__room-mult,
html.sf-reduce-flash .sf-swhud__xp-flash,
html.sf-reduce-flash .sf-swhud__picks,
html.sf-reduce-flash .sf-swhud__room-mult {
  animation: none !important;
}
.sf-swhud[data-reduced="1"] .sf-swhud__boss-burn,
.sf-swhud[data-reduced="1"] .sf-swhud__boss-fill,
html.sf-reduce-motion .sf-swhud__boss-burn,
html.sf-reduce-motion .sf-swhud__boss-fill {
  transition: none !important;
}
@media (prefers-reduced-motion: reduce) {
  .sf-swhud__xp-flash,
  .sf-swhud__picks,
  .sf-swhud__chain-mult,
  .sf-swhud__room-mult { animation: none !important; }
  .sf-swhud__boss-burn,
  .sf-swhud__boss-fill { transition: none !important; }
}

@media (forced-colors: active) {
  .sf-swhud__xp-rail, .sf-swhud__boss-bar, .sf-swhud__chain-track { background: Canvas; border: 1px solid CanvasText; }
  .sf-swhud__xp-fill, .sf-swhud__boss-fill, .sf-swhud__chain-fill { background: Highlight; forced-color-adjust: none; }
  .sf-swhud__round, .sf-swhud__boss, .sf-swhud__purse, .sf-swhud__lv, .sf-swhud__picks, .sf-swhud__chain {
    background: Canvas; color: CanvasText; text-shadow: none;
  }
}
`;
