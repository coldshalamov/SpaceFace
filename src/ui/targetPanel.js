// Target panel (ARCHITECTURE §5, spec "Target panel") — the selected-target readout above
// the radar. Populated from state.player.targetId → entity lookup. Shows name, faction tag,
// three segmented bars, distance (wu) and closing speed. Hidden when there is neither a live
// selection nor a live engaged contact.
//
// TWO TARGETS, ONE PANEL — read before "simplifying" the subject resolution below.
//
// state.player.targetId is the SELECTION: what Tab locked, what the radar highlights, and what
// aims a Massline throw. state.player.gunTargetId is the ENGAGED contact: a transient per-tick
// mirror written by src/systems/weapons.js:181-188 of what the guns are actually shooting at.
// They differ exactly when the Massline has claimed fire control — you Tab-lock ship A, latch
// hostile B, and the battery gimbals onto B while the panel used to keep naming A. That silent
// divergence is the defect this panel now reports. The two are NOT conflated: the selection stays
// the panel's subject, and the engaged contact gets its own row.
//
// gunTargetId is written only under massline2Flag('fireControl') and is never serialized, so every
// read here treats an absent key as "no divergence" rather than as an error.
//
// Cheap per-frame path: bar widths via transform:scaleX, text via textContent. No DOM churn.

import { FACTION_META } from '../data/factions.js';
import { SHIPS } from '../data/ships.js';
import { DAMAGE_MODEL } from '../data/combatDefs.js';
import { ceresDisabledHaulerTruth, livingWorkStatusText } from '../data/contactHail.js';
import { contactThreatTier, contactStateWord, isHostileToPlayer, SCANNER_CONTACT_RANGE } from '../systems/scanner.js';
import { LANE_GIMMICK_LABELS } from '../data/laneContacts.js';
import { interactionDisplayName, interactionProfileForEntity } from '../data/entityInteractionProfiles.js';
import { listSelectableComponents } from '../systems/interactionDescriptors.js';
import { COMMODITIES } from '../data/commodities.js';
import { richSeamOpportunityForEntity } from '../systems/fieldDepletion.js';

const FACTION_BY_ID = new Map(FACTION_META.map((f) => [f.id, f]));
const SHIP_BY_ID = new Map(SHIPS.map((s) => [s.id, s]));
const COMMODITY_BY_ID = new Map(COMMODITIES.map((commodity) => [commodity.id, commodity]));

// Damage triangle (BP-02): the player-facing E/K/X families mapped to the kernel's damage channels
// (weights transcribed from scalarHitToDamagePacket in src/combat/damage.js — keep in sync). The panel
// shows how effective each family is against the target's CURRENT outermost layer (shield→armor→hull),
// so the player can read "shoot energy at that shield, kinetic once it's down" at a glance.
const FAMILY_CHANNELS = {
  energy:    { thermal: 0.72, ion: 0.28 },
  kinetic:   { kinetic: 1.0 },
  explosive: { kinetic: 0.65, thermal: 0.35 },
};
const TRIANGLE_REF = 1.35; // multiplier that maps to a full bar

function tierPips(tier) {
  let s = '';
  for (let i = 0; i < 3; i++) s += i < tier ? '▰' : '▱';
  return s;
}

function outerLayerMultipliers(t) {
  if (t.shieldMax > 0 && t.shield > 0) return { layer: 'shield', mult: DAMAGE_MODEL.shieldMultipliers };
  if (t.armorMax > 0 && t.armorHp > 0) return { layer: 'armor', mult: DAMAGE_MODEL.armorMultipliers };
  return { layer: 'hull', mult: DAMAGE_MODEL.hullMultipliers };
}

function familyEffectiveness(channelMult, weights) {
  let sum = 0;
  for (const ch in weights) sum += weights[ch] * (Number.isFinite(channelMult[ch]) ? channelMult[ch] : 1);
  return sum;
}

const ROLE_LABEL = {
  starter: 'Starter', mining: 'Miner', fighter: 'Fighter', freighter: 'Freighter',
  multirole: 'Multirole', interceptor: 'Interceptor', mining_barge: 'Mining Barge',
  corvette: 'Corvette', heavy_hauler: 'Heavy Hauler', explorer: 'Explorer',
  gunship: 'Gunship', battlecruiser: 'Battlecruiser', flagship: 'Flagship',
  // Ambient traffic roles (traffic.js TRAFFIC_ROLES) — short, scannable.
  hauler: 'Hauler', courier: 'Courier', miner: 'Miner', patrol: 'Patrol',
  escort: 'Escort', smuggler: 'Smuggler', pirate: 'Raider', rescue: 'Rescue',
  tanker: 'Tanker', prospector: 'Prospector', sweeper: 'Sweeper', tug: 'Tug',
  shuttle: 'Shuttle', surveyor: 'Survey', salvor: 'Salvor', tender: 'Tender',
  ore_carrier: 'Ore Barge', express: 'Liner',
};

const GIMMICK_LABELS = {
  'tether-cutter': 'MASSLINE CUTTER',
  'tether_cutter': 'MASSLINE CUTTER',
  'massline-cutter': 'MASSLINE CUTTER',
  'massline_cutter': 'MASSLINE CUTTER',
  'pd-screen': 'PD SCREEN',
  'pd_screen': 'PD SCREEN',
  'ram-plate': 'RAM-PLATE',
  'ram_plate': 'RAM-PLATE',
  sniper: 'SNIPER',
  rammer: 'RAMMER',
  screen: 'SCREEN',
  ...LANE_GIMMICK_LABELS,
};

function getGimmickLabel(gimmick) {
  if (!gimmick) return '';
  const normalized = String(gimmick).toLowerCase().replace(/_/g, '-');
  return GIMMICK_LABELS[normalized] || GIMMICK_LABELS[String(gimmick).toLowerCase()] || String(gimmick).toUpperCase();
}

export function targetDisplayName(e) {
  if (!e) return '—';
  if (e.type === 'ship') {
    const d = e.data || {};
    const ai = d.ai || {};
    // Named/gimmick-readable identity first (lane contacts, bosses, callsigns) — never portraits.
    const named = d.name || ai.name || d.callsign || d.scanLabel || d.trafficLabel;
    if (named) return named;
    const def = d.defId ? SHIP_BY_ID.get(d.defId) : null;
    return (def && def.name) || 'Unidentified';
  }
  if (e.type === 'station') {
    if (e.data && e.data.isGate) return e.data.name || 'Jump Gate';
    return (e.data && (e.data.name || e.data.stationName || e.data.stationId)) || 'Station';
  }
  if (e.type === 'asteroid' || e.type === 'wreck') return interactionDisplayName(e);
  if (e.type === 'drone') return (e.data && (e.data.callsign || e.data.name)) || 'Unidentified';
  return e.type || 'Contact';
}

export function targetInteractionClass(e) {
  const interaction = interactionProfileForEntity(e);
  if (interaction.kind === 'unstable_reactor_wreck') return 'Hazardous Salvage';
  if (interaction.kind === 'wreck') return 'Salvage';
  if (interaction.kind === 'asteroid') return 'Mineable Asteroid';
  return '';
}

export function richSeamTargetReadout(target, state) {
  if (!target) return null;
  const data = target.data || {};
  if (target.type === 'asteroid') {
    const opportunity = richSeamOpportunityForEntity(state, target);
    if (!opportunity) return null;
    if (opportunity.state === 'open') {
      return Object.freeze({
        state: 'open',
        text: opportunity.reservationId
          ? `RICH SEAM · NPC HELP LOCK · +${opportunity.bonusU}u`
          : `RICH SEAM · +${opportunity.bonusU}u · HOT CUT`,
        opportunityId: opportunity.opportunityId,
      });
    }
    if (opportunity.state === 'worked') {
      return Object.freeze({
        state: 'worked',
        text: `WORKED SEAM · ${opportunity.claimedBonusU}u BONUS TAKEN`,
        opportunityId: opportunity.opportunityId,
      });
    }
    return Object.freeze({
      state: 'missed',
      text: 'MISSED SEAM · RICH POCKET COOLED',
      opportunityId: opportunity.opportunityId,
    });
  }
  if (target.type !== 'ship') return null;
  const manifest = data.cargoManifest;
  const source = manifest && manifest.lotSource;
  if (!source || typeof source.richOpportunityId !== 'string' || !source.richOpportunityId
    || !Array.isArray(manifest.lines) || !(manifest.totalQty > 0)) return null;
  const line = manifest.lines.find((entry) => entry && entry.qty > 0);
  if (!line) return null;
  const commodity = COMMODITY_BY_ID.get(line.commodityId);
  const name = commodity && commodity.name || String(line.commodityId || 'ORE').replace(/^cmdty_/, '').replace(/_/g, ' ');
  return Object.freeze({
    state: 'cargo',
    text: `RICH ORE · ${name.toUpperCase()} ×${line.qty}`,
    opportunityId: source.richOpportunityId,
  });
}

// PQ-048.06 keeps actor identity durable across Continue. The target panel deliberately keys this
// readout by the patrol's world record, never the numeric entity id that world rematerialization
// replaces. It is pure presentation: lawSecurity owns the case and the target panel writes none of it.
export function lawfulInspectionStatusText(target, state) {
  if (!target || target.type !== 'ship') return null;
  const worldRecordId = target.data && target.data.worldRecordId;
  if (typeof worldRecordId !== 'string' || !worldRecordId) return null;
  const ledger = state && state.player && state.player.lawfulInspection;
  if (!ledger || typeof ledger !== 'object') return null;
  const active = ledger.active;
  if (active && active.patrolWorldRecordId === worldRecordId) {
    if (active.phase === 'scanning') return 'LAW · HOLD FOR SCAN';
    if (active.phase === 'offered') return 'LAW · INSPECTION REQUESTED';
  }
  const last = ledger.last;
  if (!last || last.patrolWorldRecordId !== worldRecordId) return null;
  switch (last.outcome) {
    case 'cleared': return 'LAW · HOLD CLEAR';
    case 'contraband_discovered': return 'LAW · CONTRABAND SEIZED';
    case 'escaped': return 'LAW · ESCAPED';
    case 'collateral_assault': return 'LAW · COLLATERAL ASSAULT';
    case 'collateral_patrol_destroyed': return 'LAW · PATROL DESTROYED';
    default: return 'LAW · INSPECTION INTERRUPTED';
  }
}

// Tier 0 is "not a threat" and shows no badge at all. The words are the ship-scale language the
// rest of the build already uses, so the badge teaches nothing new -- it just says it sooner.
const THREAT_TIER_WORD = ['', 'LIGHT', 'HEAVY', 'CAPITAL'];

function entityClass(e) {
  if (!e) return '';
  if (e.type === 'ship') {
    const d = e.data || {};
    // Traffic role beats hull class for ambient readability (HAULER vs "Freighter").
    const trafficRole = d.trafficRole || d.role;
    if (trafficRole && ROLE_LABEL[trafficRole]) return ROLE_LABEL[trafficRole];
    if (trafficRole) return trafficRole;
    const def = d.defId ? SHIP_BY_ID.get(d.defId) : null;
    const role = e.role || (def && def.role) || '';
    return ROLE_LABEL[role] || role || 'Ship';
  }
  if (e.type === 'station') {
    return e.data && e.data.isGate ? 'Gate' : 'Station';
  }
  const interactionClass = targetInteractionClass(e);
  if (interactionClass) return interactionClass;
  return e.type || '';
}

const MOTIVE_LABEL = Object.freeze({
  cargo_extortion: 'ROBBERY', predation: 'PREDATION', bounty: 'BOUNTY', contract_bounty: 'BOUNTY',
  retaliation: 'RETALIATION', territorial: 'TERRITORIAL', security: 'LAW ENFORCEMENT',
  law_enforcement: 'LAW ENFORCEMENT', escort_duty: 'ESCORT DUTY', defense: 'DEFENSE',
  salvage_claim: 'SALVAGE CLAIM', piracy: 'PIRACY', patrol: 'PATROL DUTY', trade: 'TRADE ROUTE',
  mining: 'MINING', rescue: 'RESCUE', unknown: 'UNKNOWN',
});

function readableMotive(value) {
  const key = String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  return MOTIVE_LABEL[key] || (key ? key.replace(/_/g, ' ').toUpperCase() : '');
}

function playerWeaponRange(player) {
  const data = player && player.data || {};
  const weapons = Array.isArray(data.weapons) ? data.weapons : [];
  let range = Number(data.weaponRange || data.derived?.weaponRange) || 0;
  for (const weapon of weapons) {
    range = Math.max(range, Number(weapon && (weapon.range || weapon.maxRange || weapon.rangeWu)) || 0);
  }
  return range > 0 ? range : 900;
}

export function targetRangeBand(distance, player) {
  const dist = Math.max(0, Number(distance) || 0);
  const range = playerWeaponRange(player);
  if (dist <= Math.min(450, range * 0.55)) return 'CLOSE';
  if (dist <= range) return 'IN RANGE';
  if (dist <= range * 1.6) return 'APPROACH';
  return 'DISTANT';
}

/**
 * THE READER for state.player.gunTargetId (written by src/systems/weapons.js:181-188).
 *
 * Resolves which contact the panel takes as its subject and whether the guns have diverged from
 * the selection. Pure and DOM-free so the divergence rule is checkable headlessly; createTargetPanel
 * below is its only production consumer.
 *
 * Returns:
 *   subjectId / subject   — what the panel describes. The SELECTION (targetId) wins whenever it is
 *                           alive, because targetId is also what aims a Massline throw and the two
 *                           must not be conflated. The engaged contact is the subject only when
 *                           there is no live selection, so the guns are never firing at a ship with
 *                           no readout anywhere.
 *   engaged               — the diverged gun target, or null when the guns agree with the selection
 *                           (the ordinary case, which must not print a second name for one ship).
 *   subjectIsEngaged      — true when the subject IS the gun target and there is no selection.
 *   text                  — the row copy, or '' when there is nothing to report.
 */
export function engagedContactReadout(state) {
  const player = (state && state.player) || null;
  const entities = (state && state.entities) || null;
  if (!player || !entities) return { subjectId: null, subject: null, engaged: null, subjectIsEngaged: false, text: '' };
  const selId = player.targetId != null ? player.targetId : null;
  const selection = selId != null ? entities.get(selId) : null;
  const liveSelection = selection && selection.alive ? selection : null;
  // An absent gunTargetId (flag off, or no player firing this tick) is "no divergence", never an error.
  const gunId = player.gunTargetId != null ? player.gunTargetId : null;
  const engagedCandidate = gunId != null && gunId !== selId ? entities.get(gunId) : null;
  const engaged = engagedCandidate && engagedCandidate.alive ? engagedCandidate : null;
  const subjectIsEngaged = !liveSelection && !!engaged;
  const subject = liveSelection || (subjectIsEngaged ? engaged : null);
  const subjectId = subjectIsEngaged ? gunId : selId;
  let text = '';
  if (subjectIsEngaged) text = '⌖ GUNS ENGAGED · NO SELECTION';
  else if (engaged && liveSelection) text = `⌖ GUNS ▸ ${targetDisplayName(engaged)}`;
  return { subjectId, subject, engaged, subjectIsEngaged, text };
}

export function targetIntelReadout(target, player, state, distance = Infinity) {
  if (!target) return null;
  const data = target.data || {};
  const ai = data.ai || {};
  const intentData = data.intent || {};
  const engagement = data.engagement || {};
  const playerTeam = player ? player.team : 0;
  const hostile = isHostileToPlayer(target, playerTeam, state);
  const allied = !hostile && playerTeam !== 0 && target.team === playerTeam;
  const intent = allied ? 'ALLY' : contactStateWord(target, playerTeam, state);
  const authoredMotive = engagement.motive || ai.motive || data.motive || intentData.motive;
  let motive = readableMotive(authoredMotive);
  if (!motive && ai.retaliationTargetId === state?.playerId) motive = 'RETALIATION';
  if (!motive && ai.lawful) motive = 'LAW ENFORCEMENT';
  if (!motive && (ai.forcePlayerTarget || ai.huntPlayer)) motive = 'HUNTING YOU';
  if (!motive && hostile) motive = 'HOSTILE INTENT';
  if (!motive && allied) motive = 'SUPPORT';
  if (!motive && ai.passive) motive = 'NONCOMBATANT';
  if (!motive) motive = 'UNRESOLVED';
  const threatTier = contactThreatTier(target, hostile);
  // Lock surface stays thin (phase only); hail STATUS carries tactical means (U3/U5 hierarchy).
  const workStatus = lawfulInspectionStatusText(target, state)
    || livingWorkStatusText(target, { depth: 'lock', state });
  const disabledHauler = ceresDisabledHaulerTruth(state, target);
  const recoveryPrompt = disabledHauler && !disabledHauler.choice
    ? 'HAIL · RECOVER / STEAL / ABANDON'
    : disabledHauler && disabledHauler.choice === 'recover'
      ? 'MASSLINE RECOVERY CLAIMED'
      : null;
  return Object.freeze({
    hostile,
    allied,
    intent,
    motive,
    workStatus: workStatus || null,
    recoveryPrompt,
    threatTier,
    threatPips: tierPips(threatTier),
    rangeBand: targetRangeBand(distance, player),
  });
}

export function createTargetPanel(ctx) {
  const { state, bus } = ctx;
  const el = document.createElement('div');
  el.className = 'sf-target sf-hudpanel';
  el.style.display = 'none';
  el.dataset.hudSlot = 'current-threat';
  el.setAttribute('role', 'status');
  el.setAttribute('aria-label', 'Current target');
  el.setAttribute('aria-live', 'off');
  el.setAttribute('aria-atomic', 'false');
  el.innerHTML = `
    <div class="sf-target__head">
      <span class="sf-target__name">—</span>
      <span class="sf-target__faction"></span>
    </div>
    <!-- J07: the three health bars are GONE. Shield/armour/hull are drawn as arcs around the
         target in the world (hud.js .sf-target-arcs), which is where you are already looking during
         a fight. Duplicating them on a card in the corner spent the card's whole width on a number
         you had to look away to read. What replaces them is the thing the card can say and the world
         mark cannot: how dangerous this contact is, and how far away it is. -->
    <div class="sf-target__threat" data-tier="" hidden>
      <span class="sf-target__threat-pips" aria-hidden="true"></span>
      <span class="sf-target__threat-word"></span>
    </div>
    <div class="sf-target__rangerow">
      <span class="sf-target__rangebar" aria-hidden="true"><i class="sf-target__rangefill"></i></span>
      <span class="sf-target__dist mono">0 wu</span>
    </div>
    <div class="sf-target__engaged mono" role="status" aria-live="polite" aria-atomic="true"
      style="display:none;margin-top:2px;font-size:12px;line-height:1.3;letter-spacing:.05em;color:var(--visor-amber);"></div>
    <div class="sf-target__identity mono" style="display:none"></div>
    <div class="sf-target__intent mono" style="display:none;margin-top:3px;font-size:12px;line-height:1.3;letter-spacing:.04em;color:var(--text-primary);"></div>
    <div class="sf-target__meta">
      <span class="sf-target__range mono" style="color:var(--visor-amber);"></span>
      <span class="sf-target__closing mono"></span>
    </div>
    <div class="sf-target__triangle" style="display:none">
      <span class="sf-target__tri-label mono">VULN</span>
      <span class="sf-tri sf-tri--e" tabindex="0" role="img" aria-label="Vulnerability to energy weapons" data-why="Energy"><span class="sf-tri__k">E</span><span class="sf-tri__bar"><span class="sf-tri__fill"></span></span></span>
      <span class="sf-tri sf-tri--k" tabindex="0" role="img" aria-label="Vulnerability to kinetic weapons" data-why="Kinetic"><span class="sf-tri__k">K</span><span class="sf-tri__bar"><span class="sf-tri__fill"></span></span></span>
      <span class="sf-tri sf-tri--x" tabindex="0" role="img" aria-label="Vulnerability to explosives" data-why="Explosive"><span class="sf-tri__k">X</span><span class="sf-tri__bar"><span class="sf-tri__fill"></span></span></span>
      <span class="sf-target__tri-layer mono"></span>
    </div>
    <div class="sf-target__weak mono" style="display:none"></div>
    <div class="sf-target__component mono" role="button" tabindex="0" aria-label="Cycle target component"
      style="display:none;margin-top:3px;font-size:12px;letter-spacing:.05em;pointer-events:auto;cursor:pointer;padding:2px 6px;border:1px solid var(--console-edge,rgba(120,160,200,.35));border-radius:4px;color:var(--text-primary);"></div>
    <div class="sf-target__gimmick mono" style="display:none"></div>`;

  const elName = el.querySelector('.sf-target__name');
  const elFac = el.querySelector('.sf-target__faction');
  const elThreat = el.querySelector('.sf-target__threat');
  const elThreatPips = el.querySelector('.sf-target__threat-pips');
  const elThreatWord = el.querySelector('.sf-target__threat-word');
  const elRangeFill = el.querySelector('.sf-target__rangefill');
  const elDist = el.querySelector('.sf-target__dist');
  const elClose = el.querySelector('.sf-target__closing');
  const elGimmick = el.querySelector('.sf-target__gimmick');
  const elTriangle = el.querySelector('.sf-target__triangle');
  const triE = el.querySelector('.sf-tri--e');
  const triK = el.querySelector('.sf-tri--k');
  const triX = el.querySelector('.sf-tri--x');
  const triFillE = triE.querySelector('.sf-tri__fill');
  const triFillK = triK.querySelector('.sf-tri__fill');
  const triFillX = triX.querySelector('.sf-tri__fill');
  const elTriLayer = el.querySelector('.sf-target__tri-layer');
  const elWeak = el.querySelector('.sf-target__weak');
  const elComponent = el.querySelector('.sf-target__component');
  const elIdentity = el.querySelector('.sf-target__identity');
  const elIntent = el.querySelector('.sf-target__intent');
  const elRange = el.querySelector('.sf-target__range');
  const elEngaged = el.querySelector('.sf-target__engaged');
  let lastEngagedKey = null;
  let lastTriKey = null;
  let lastIdentityKey = null;
  let lastIntelKey = null;
  let lastComponentKey = null;

  // PQ-015: the component chip is the reachable (DOM) trigger for sub-selecting a target component.
  // pointer-events:auto is set inline so the chip is clickable even inside a pointer-events:none HUD
  // panel. A keyboard binding through input.js is a pending shared-change request (see REPORT).
  elComponent.addEventListener('click', () => { if (bus) bus.emit('ui:cycleComponent', { dir: 1 }); });
  elComponent.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' || ev.key === ' ') {
      ev.preventDefault();
      if (bus) bus.emit('ui:cycleComponent', { dir: ev.shiftKey ? -1 : 1 });
    }
  });

  let lastTargetId = null;
  let lastName = null;
  let lastClass = null;
  let lastFactionId = null;
  let lastDistText = '';
  let lastThreatKey = '';
  let lastRangeScale = '';
  let lastCloseText = '';
  let lastCloseColor = '';
  let tickN = 0;

  function setText(node, text) {
    if (node.textContent !== text) node.textContent = text;
  }

  // hud.js drives this same element through its _sfStyle write-cache (setDisplay); a direct
  // style.display write here must keep that cache coherent or hud's next suppress is skipped.
  function setPanelDisplay(value) {
    const cache = el._sfStyle || (el._sfStyle = Object.create(null));
    if (cache.display === value && el.style.display === value) return;
    cache.display = value;
    el.style.display = value;
  }

  function update(options = {}) {
    tickN++;
    const gunRead = engagedContactReadout(state);
    const t = gunRead.subject;
    const tid = gunRead.subjectId;
    if (!t || !t.alive) {
      setPanelDisplay('none');
      lastTargetId = null;
      lastEngagedKey = null;
      return;
    }
    setPanelDisplay('block');

    // The divergence row: the one thing the panel could not previously say.
    if (gunRead.text !== lastEngagedKey) {
      lastEngagedKey = gunRead.text;
      setText(elEngaged, gunRead.text);
      const show = gunRead.text ? 'block' : 'none';
      if (elEngaged.style.display !== show) elEngaged.style.display = show;
    }

    const nextName = targetDisplayName(t);
    const nextClass = entityClass(t);
    const targetChanged = tid !== lastTargetId || nextName !== lastName || nextClass !== lastClass || t.factionId !== lastFactionId;
    if (targetChanged) {
      lastTargetId = tid;
      lastName = nextName;
      lastClass = nextClass;
      lastFactionId = t.factionId || null;
      const classText = nextClass && nextClass.toLowerCase() !== nextName.toLowerCase()
        ? ` · ${nextClass}`.toUpperCase()
        : '';
      setText(elName, `${nextName}${classText}`);
      if (el._sfAriaLabel !== `Current target: ${nextName}${nextClass ? `, ${nextClass}` : ''}`) {
        el._sfAriaLabel = `Current target: ${nextName}${nextClass ? `, ${nextClass}` : ''}`;
        el.setAttribute('aria-label', el._sfAriaLabel);
      }
      const fac = t.factionId ? FACTION_BY_ID.get(t.factionId) : null;
      if (fac) {
        setText(elFac, fac.short || fac.name);
        const color = fac.color || 'var(--ink-dim)';
        if (elFac.style.color !== color) elFac.style.color = color;
      } else {
        setText(elFac, '');
      }
    }

    // Health is drawn in the world (.sf-target-arcs), not here. See the DOM note above.

    // Identity is stable; live intent/motive/threat is a separate tactical receipt below it.
    if (t.type === 'ship' || t.type === 'drone') {
      const player = state.entities.get(state.playerId);
      const role = entityClass(t);
      const level = t.data && t.data.level;
      const fac = t.factionId ? FACTION_BY_ID.get(t.factionId) : null;
      const facShort = fac ? (fac.short || fac.name) : '—';
      const callsign = t.data && t.data.callsign;
      const idKey = `${tid}:${facShort}:${role}:${level}:${callsign || ''}`;
      if (idKey !== lastIdentityKey) {
        lastIdentityKey = idKey;
        const levelBit = level != null ? ` · L${level}` : '';
        setText(elIdentity, `${facShort} · ${role}${levelBit}`);
      }
      if (elIdentity.style.display !== 'block') elIdentity.style.display = 'block';
    } else if (elIdentity.style.display !== 'none') {
      elIdentity.style.display = 'none';
      lastIdentityKey = null;
    }

    // Damage triangle (BP-02): effectiveness of E/K/X against the target's current outer layer.
    // Only recompute when the target or its outer layer changes (values are per-layer constants).
    if (t.type === 'ship' || t.type === 'drone') {
      const { layer, mult } = outerLayerMultipliers(t);
      const triKey = `${tid}:${layer}`;
      if (triKey !== lastTriKey) {
        lastTriKey = triKey;
        const eE = familyEffectiveness(mult, FAMILY_CHANNELS.energy);
        const eK = familyEffectiveness(mult, FAMILY_CHANNELS.kinetic);
        const eX = familyEffectiveness(mult, FAMILY_CHANNELS.explosive);
        const barW = (v) => `scaleX(${Math.max(0.06, Math.min(1, v / TRIANGLE_REF)).toFixed(3)})`;
        triFillE.style.transform = barW(eE);
        triFillK.style.transform = barW(eK);
        triFillX.style.transform = barW(eX);
        const best = Math.max(eE, eK, eX);
        triE.classList.toggle('best', eE === best);
        triK.classList.toggle('best', eK === best);
        triX.classList.toggle('best', eX === best);
        setText(elTriLayer, layer.toUpperCase());
      }
      if (elTriangle.style.display !== 'flex') elTriangle.style.display = 'flex';
    } else {
      if (elTriangle.style.display !== 'none') elTriangle.style.display = 'none';
      lastTriKey = null;
    }

    // Weak-point line (BP-02): shown once a scan pulse has revealed the target's soft spot (hud passes
    // the revealed entry in options.weakPoint). Tells the player what to hit and roughly where.
    const wp = options.weakPoint;
    if (wp && wp.label && (t.type === 'ship' || t.type === 'drone')) {
      setText(elWeak, `◈ WEAK: ${wp.label}${wp.hint ? ' · ' + wp.hint : ''}`);
      if (elWeak.style.display !== 'block') elWeak.style.display = 'block';
    } else if (elWeak.style.display !== 'none') {
      elWeak.style.display = 'none';
    }

    // PQ-015 component chip: the target's selectable components (combat subsystems / salvage weak-
    // point) and the current sub-selection, from the shared descriptor. Clicking cycles it. Hidden
    // for targets with no targetable components (e.g. bare asteroids).
    const comps = listSelectableComponents(state, t);
    if (comps.length) {
      const sel = state.ui && state.ui.componentSelection;
      const selHere = sel && sel.targetId === t.id ? sel : null;
      const selLabel = selHere ? ((comps.find((c) => c.componentId === selHere.componentId) || {}).label || null) : null;
      const compKey = `${tid}:${comps.length}:${selLabel || ''}`;
      if (compKey !== lastComponentKey) {
        lastComponentKey = compKey;
        setText(elComponent, selLabel ? `◎ COMPONENT: ${selLabel}` : `◎ COMPONENT · ${comps.length} · click to target`);
        const active = !!selLabel;
        if (elComponent.style.borderColor !== (active ? 'var(--visor-amber)' : '')) {
          elComponent.style.borderColor = active ? 'var(--visor-amber)' : '';
          elComponent.style.color = active ? 'var(--visor-amber)' : 'var(--text-primary)';
        }
      }
      if (elComponent.style.display !== 'block') elComponent.style.display = 'block';
    } else if (elComponent.style.display !== 'none') {
      elComponent.style.display = 'none';
      lastComponentKey = null;
    }

    // Gimmick / readable quirk tag (bounty hunters + named lane freighters)
    const richSeam = richSeamTargetReadout(t, state);
    const gimmick = t.data && (t.data.bountyGimmick || t.data.gimmick || t.data.bountyTag);
    const gimmickLabel = richSeam ? richSeam.text : getGimmickLabel(gimmick);
    if (gimmickLabel) {
      setText(elGimmick, gimmickLabel);
      if (elGimmick.style.display !== 'inline-block') elGimmick.style.display = 'inline-block';
    } else {
      if (elGimmick.style.display !== 'none') elGimmick.style.display = 'none';
    }

    const p = state.entities && typeof state.entities.get === 'function'
      ? state.entities.get(state.playerId)
      : null;
    if (p && p.pos && t.pos && (targetChanged || options.slow || (tickN % 6) === 0)) {
      const dx = t.pos.x - p.pos.x, dz = t.pos.z - p.pos.z;
      const dist = Math.hypot(dx, dz);
      const tacticalTarget = t.type === 'ship' || t.type === 'drone';
      const intel = tacticalTarget ? targetIntelReadout(t, p, state, dist) : null;
      const intelKey = intel
        ? `${tid}:${intel.intent}:${intel.motive}:${intel.workStatus || ''}:${intel.recoveryPrompt || ''}:${intel.threatTier}:${intel.rangeBand}`
        : '';
      if (intel && intelKey !== lastIntelKey) {
        lastIntelKey = intelKey;
        const workBit = intel.workStatus ? ` · ${intel.workStatus}` : '';
        const recoveryBit = intel.recoveryPrompt ? ` · ${intel.recoveryPrompt}` : '';
        // J07: threat leaves the paragraph and becomes a badge. Spelling out INTENT/MOTIVE/THREAT
        // was eight words to answer one question you ask constantly in a fight. The badge answers
        // it as a shape; the sentence keeps only what a shape cannot carry.
        setText(elIntent, `${intel.intent} · ${intel.motive}${workBit}${recoveryBit}`);
        setText(elRange, intel.rangeBand);
        if (elIntent.style.display !== 'block') elIntent.style.display = 'block';
        const aria = `Current target: ${nextName}, ${nextClass || 'contact'}, intent ${intel.intent}, motive ${intel.motive}, threat ${intel.threatTier}, ${intel.rangeBand}${intel.workStatus ? `, ${intel.workStatus}` : ''}${intel.recoveryPrompt ? `, ${intel.recoveryPrompt}` : ''}`;
        if (el._sfAriaLabel !== aria) {
          el._sfAriaLabel = aria;
          el.setAttribute('aria-label', aria);
        }
      } else if (!intel) {
        lastIntelKey = null;
        if (elIntent.style.display !== 'none') elIntent.style.display = 'none';
        setText(elRange, targetRangeBand(dist, p));
      }
      // Threat badge. Tier drives a data attribute so colour AND the printed word both carry it --
      // never colour alone (grammar: no state may be colour-only).
      // contactThreatTier returns a NUMBER 0..3 keyed off mass (scanner.js THREAT_MASS_TIERS),
      // not a word. Styling on [data-tier="high"] would have been dead CSS that looked correct.
      const tierNum = intel ? (intel.threatTier | 0) : 0;
      const tier = tierNum > 0 ? String(tierNum) : '';
      const threatKey = tier + '|' + (intel ? intel.threatPips : '');
      if (threatKey !== lastThreatKey) {
        lastThreatKey = threatKey;
        if (intel && tier) {
          setText(elThreatPips, String(intel.threatPips || ''));
          setText(elThreatWord, THREAT_TIER_WORD[tierNum] || 'THREAT');
          if (elThreat.dataset.tier !== tier) elThreat.dataset.tier = tier;
          if (elThreat.hidden) elThreat.hidden = false;
        } else if (!elThreat.hidden) {
          elThreat.hidden = true;
          // `dataset.x = ''` still matches [data-x]; delete is the only way to clear the selector.
          delete elThreat.dataset.tier;
        }
      }
      // Range bar: distance as a proportion of scanner range, so "far" reads as a length instead of
      // a number you must compare against another number you do not remember.
      const rangeFrac = Math.max(0, Math.min(1, 1 - dist / SCANNER_CONTACT_RANGE));
      const rangeScale = 'scaleX(' + rangeFrac.toFixed(3) + ')';
      if (rangeScale !== lastRangeScale) { elRangeFill.style.transform = rangeScale; lastRangeScale = rangeScale; }
      const distText = dist > 1000 ? (dist / 1000).toFixed(1) + 'k wu' : Math.round(dist) + ' wu';
      if (distText !== lastDistText) { elDist.textContent = distText; lastDistText = distText; }
      // closing speed = -dot(relVel, normalize(relPos)); positive = approaching
      const rvx = t.vel.x - p.vel.x, rvz = t.vel.z - p.vel.z;
      const inv = dist > 0.001 ? 1 / dist : 0;
      const closing = -((rvx * dx + rvz * dz) * inv);
      const closeText = (closing >= 0 ? '▲' : '▼') + ' ' + Math.abs(Math.round(closing)) + ' wu/s';
      const closeColor = closing >= 0 ? 'var(--danger)' : 'var(--good)';
      if (closeText !== lastCloseText) { elClose.textContent = closeText; lastCloseText = closeText; }
      if (closeColor !== lastCloseColor) { elClose.style.color = closeColor; lastCloseColor = closeColor; }
    }
  }

  function forceRefresh() {
    lastTargetId = null;
    lastTriKey = null;
    lastIntelKey = null;
    lastEngagedKey = null;
    tickN = 5;
  }

  return { el, update, forceRefresh };
}
