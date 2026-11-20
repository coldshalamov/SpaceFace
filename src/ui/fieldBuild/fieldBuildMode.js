// Field Architect — Seamless No-Loading-Screen Asteroid Field Command & Build Mode.
// Operates live inside state.mode === 'flight', shifting the chase camera into tactical
// overview and projecting interactive Mindustry/StarCraft/Alpha-Centauri controls directly over the 3D belt.
import { isSwarmGlass } from '../swarmGlass.js';
import { classifySiteSpecialization } from '../../data/sites.js';
import { ASTEROIDS, ASTEROID_SCAN_GLYPH_BY_TYPE } from '../../data/mining.js';
import {
  ASTEROID_BLUEPRINTS,
  BELT_CHARTER_TEMPLATES,
  BELT_DOCTRINES,
} from '../../data/beltEmpireData.js';
import { readFrameOrigin } from '../../render/frameCoordinates.js';
import { resolveActionLabel } from '../../systems/input.js';
import { counted } from '../../core/numberFormat.js';
import { laneInputWrite } from '../../core/simLaneCommands.js';
import { commodityDisplayName } from '../commodityNames.js';
import { renderFieldTacticalCanvas, radarScreenToWorld, TACTICAL_MAP_MODES } from './fieldTacticalCanvas.js';
import { ARCHITECT_TABS, renderFieldArchitectWorkspace } from './fieldArchitectPanels.js';

export { TACTICAL_MAP_MODES, ARCHITECT_TABS };

const ASTEROID_DEF_BY_ID = new Map(ASTEROIDS.map((a) => [a.id, a]));
const DRILL_MASSLINE_DEF_IDS = new Set(['tether_standard', 'attachment_massline']);

export const FIELD_TOOLS = Object.freeze([
  Object.freeze({ id: 'select', key: '0', label: 'Inspect', sub: 'Select rock' }),
  Object.freeze({ id: 'commission', key: '1', label: 'Auto-Rig', sub: 'Stake & mine' }),
  Object.freeze({ id: 'link_material', key: '2', label: 'Link Cargo', sub: 'Move goods between sites' }),
  Object.freeze({ id: 'link_power', key: '3', label: 'Link Power', sub: 'Share MW' }),
  Object.freeze({ id: 'turret', key: '4', label: 'Turret Pylon', sub: 'Belt defense' }),
  Object.freeze({ id: 'sensor', key: '5', label: 'Sensor Beacon', sub: 'Route relay' }),
  Object.freeze({ id: 'solar_sail', key: '6', label: 'Solar Sail', sub: '+8 MW orbit' }),
  Object.freeze({ id: 'drone', key: '7', label: 'Launch Drone', sub: 'Auto harvest' }),
  Object.freeze({ id: 'open_works', key: '8', label: 'Asteroid Works', sub: 'Interior view' }),
]);

function el(tag, className = '', text = null) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

/**
 * Pure snapshot builder for Field Architect mode so both DOM UI and headless
 * verification suites read one authoritative sector cluster & belt empire view-model.
 */
export function buildFieldArchitectViewModel({
  state,
  siteSys = null,
  selectedAsteroidId = null,
  selectedAsteroidIds = [],
  activeTool = 'select',
  activeTab = 'site',
  mapMode = 'standard',
  orbitalFilter = 'all',
  selectedLinkGoodId = null,
  blueprintId = ASTEROID_BLUEPRINTS[0]?.id || 'bp_starter_pocket',
  blueprintRotation = 0,
  linkSourceSiteId = null,
} = {}) {
  const sectorId = state?.world?.currentSectorId || null;
  const network = siteSys && typeof siteSys.sectorNetworkProjection === 'function'
    ? siteSys.sectorNetworkProjection(sectorId)
    : {
      sectorId,
      sites: [],
      links: [],
      empire: state?.sites?.empire || null,
      empireModifiers: null,
      weather: null,
      supplyMatrix: { commodities: [], sites: [], siteCount: 0, activeLinkCount: 0, totalPowerGenMw: 0, totalPowerDrawMw: 0, netPowerMw: 0, totalDefenseRating: 0, totalDrones: 0 },
      totals: { siteCount: 0, totalPowerGenMw: 0, totalPowerDrawMw: 0, totalStoredU: 0, activeLinkCount: 0, defenseCount: 0, droneCount: 0, totalDefenseRating: 0, roleCounts: {} },
    };
  const siteByAstId = new Map();
  const siteById = new Map();
  for (const s of network.sites || []) {
    if (s.asteroidId != null) siteByAstId.set(s.asteroidId, s);
    if (s.siteId) siteById.set(s.siteId, s);
  }
  const ent = selectedAsteroidId != null && state?.entities?.get ? state.entities.get(selectedAsteroidId) : null;
  const selectedSite = selectedAsteroidId != null
    ? (siteByAstId.get(selectedAsteroidId) || (siteSys?.siteForAsteroid ? siteSys.siteForAsteroid(selectedAsteroidId) : null))
    : null;
  const selectedAstDef = ent?.data?.typeId ? ASTEROID_DEF_BY_ID.get(ent.data.typeId) || ASTEROID_DEF_BY_ID.get('ast_common_rock') : null;
  const composition = selectedAstDef?.oreTable
    ? Object.entries(selectedAstDef.oreTable).map(([goodId, weight]) => ({
      goodId,
      name: commodityDisplayName(goodId),
      pct: Math.round(weight * 100),
    }))
    : [];
  const selectedProjection = selectedSite && siteSys?.projection
    ? siteSys.projection(selectedSite.siteId || selectedSite.id)
    : null;
  const peerSites = (network.sites || []).filter((s) => !selectedProjection || s.siteId !== selectedProjection.site?.id);

  const empire = network.empire || state?.sites?.empire || null;
  const supplyMatrix = network.supplyMatrix || null;

  return {
    sectorId,
    activeTool,
    activeTab,
    mapMode,
    orbitalFilter,
    selectedLinkGoodId,
    blueprintId,
    blueprintRotation,
    linkSourceSiteId,
    selectedAsteroidIds: Array.isArray(selectedAsteroidIds) ? selectedAsteroidIds.slice() : [],
    network,
    empire,
    weather: network.weather || null,
    empireModifiers: network.empireModifiers || null,
    supplyMatrix,
    doctrines: BELT_DOCTRINES,
    charters: BELT_CHARTER_TEMPLATES,
    selectedAsteroid: ent && ent.alive !== false ? {
      id: ent.id,
      typeId: ent.data?.typeId || 'ast_common_rock',
      glyph: ASTEROID_SCAN_GLYPH_BY_TYPE[ent.data?.typeId] || 'Si',
      yieldU: Math.round(Number(ent.data?.yieldU) || 0),
      radius: Math.round(Number(ent.radius) || 8),
      pos: ent.pos ? { x: ent.pos.x, z: ent.pos.z } : null,
      composition,
    } : null,
    selectedSite: selectedProjection ? {
      siteId: selectedProjection.site.id,
      asteroidId: selectedProjection.site.asteroidId,
      specialization: selectedProjection.specialization || classifySiteSpecialization(selectedProjection.site),
      directive: selectedProjection.directive || null,
      synergies: selectedProjection.synergies || null,
      anomalies: selectedProjection.anomalies || [],
      drones: selectedProjection.drones || [],
      maxDrones: selectedProjection.maxDrones || 6,
      capacitorMwS: selectedProjection.capacitorMwS || 0,
      cutawaySchematic: selectedProjection.cutawaySchematic || null,
      blueprintSuggestions: selectedProjection.blueprintSuggestions || [],
      totalPowerGenMw: selectedProjection.totalPowerGenMw || 0,
      totalPowerDrawMw: selectedProjection.totalPowerDrawMw || 0,
      storedU: Math.round(selectedProjection.lanes.reduce((s, l) => s + (Number(l.stored) || 0), 0)),
      capacityU: Math.round(selectedProjection.lanes.reduce((s, l) => s + (Number(l.capacity) || 0), 0)),
      reserves: selectedProjection.reserves || {},
      links: selectedProjection.links || [],
      incomingLinks: selectedProjection.incomingLinks || [],
      defenses: selectedProjection.defenses || [],
      machines: selectedProjection.machines || [],
      lanes: selectedProjection.lanes || [],
      courier: selectedProjection.courier,
      fleet: selectedProjection.fleet,
    } : null,
    peerSites,
  };
}

const FIELD_BUILD_NEAR_WU = 1000;
export function hasNearbyClaimableOrOwnedBody(st) {
  if (!st) return false;
  const player = st.entities && typeof st.entities.get === 'function' ? st.entities.get(st.playerId) : null;
  const px = Number(player?.pos?.x);
  const pz = Number(player?.pos?.z);
  if (!Number.isFinite(px) || !Number.isFinite(pz)) return false;
  const maxSq = FIELD_BUILD_NEAR_WU * FIELD_BUILD_NEAR_WU;
  const sectorId = st.world?.currentSectorId;
  const sitesById = st.sites?.byId;
  const siteOrder = st.sites?.order;
  if (sitesById && Array.isArray(siteOrder)) {
    for (let i = 0; i < siteOrder.length; i++) {
      const s = sitesById[siteOrder[i]];
      if (!s || (sectorId && s.sectorId && s.sectorId !== sectorId)) continue;
      const ast = s.asteroidId != null ? st.entities?.get?.(s.asteroidId) : null;
      const pos = ast?.pos || s.pos;
      if (pos && Number.isFinite(pos.x) && Number.isFinite(pos.z)) {
        const dx = pos.x - px;
        const dz = pos.z - pz;
        if (dx * dx + dz * dz <= maxSq) return true;
      }
    }
  }
  const index = st.entityIndex;
  const candidates = (index && index.__spacefaceEntityIndexV1 && Array.isArray(index.asteroids))
    ? index.asteroids
    : (Array.isArray(st.entityList) ? st.entityList : (st.entities?.values ? st.entities.values() : []));
  for (const e of candidates) {
    if (!e || e.alive === false || e.type !== 'asteroid' || !e.pos) continue;
    if (e.data && e.data.claimable === false) continue;
    if (Number.isFinite(e.radius) && e.radius < 14) continue;
    const dx = e.pos.x - px;
    const dz = e.pos.z - pz;
    if (dx * dx + dz * dz <= maxSq) return true;
  }
  return false;
}

export function createFieldBuildMode(ctx) {
  const { state, bus, registry } = ctx;
  const siteSys = ctx.asteroidSites || registry?.get?.('asteroidSites') || null;
  const rootParent = typeof document !== 'undefined' ? (document.getElementById('ui-root') || document.body) : null;
  if (!rootParent || typeof document === 'undefined') {
    return {
      isActive: () => false,
      setActive() {},
      toggle() { return false; },
      handleToolShortcut() {},
      frame() {},
      destroy() {},
    };
  }

  let active = false;
  let activeTool = 'select';
  let activeTab = 'site';
  let mapMode = 'standard';
  let orbitalFilter = 'all';
  let selectedLinkGoodId = null;
  let blueprintId = ASTEROID_BLUEPRINTS[0]?.id || 'bp_starter_pocket';
  let blueprintRotation = 0;
  let selectedAsteroidId = null;
  let selectedAsteroidIds = [];
  let hoveredAsteroidId = null;
  let linkSourceSiteId = null;
  let inspectorSig = '';
  let crestSig = '';
  let panDrag = null;
  let radarDrag = false;
  let lastRadarRect = null;
  let marqueeBox = null;
  let mouseX = 0;
  let mouseY = 0;
  let animTime = 0;
  const controlGroups = [[], [], [], []];
  const keysHeld = new Set();
  const projectedAsteroids = [];

  // --- Persistent Flight HUD Toggle Pill ---
  const pillBtn = el('button', 'fb-pill-btn');
  pillBtn.type = 'button';
  pillBtn.setAttribute('aria-label', 'Toggle Field Architect Build Mode (Shift+B)');
  const pillText = el('span', '', 'Field Build');
  const pillKey = el('span', 'fb-pill-key', 'Shift+B');
  const pillBadge = el('span', 'fb-pill-badge', '0');
  pillBadge.hidden = true;
  pillBtn.append(pillText, pillKey, pillBadge);
  rootParent.appendChild(pillBtn);

  // --- Full-Viewport Tactical Overlay Root ---
  const overlay = el('section', 'fb-root');
  overlay.id = 'field-build-root';
  overlay.hidden = true;
  overlay.setAttribute('aria-label', 'Field Architect Command Mode');

  const canvas = document.createElement('canvas');
  canvas.id = 'fb-canvas';
  canvas.className = 'fb-canvas';
  const g = canvas.getContext('2d');

  // Top Crest + Map-Mode Bar
  const crest = el('header', 'fb-crest');
  const crestTitle = el('span', 'fb-crest-title', 'Field Architect');
  const crestStats = el('div', 'fb-crest-stats');
  const statSites = el('span', 'fb-crest-stat');
  const statPower = el('span', 'fb-crest-stat');
  const statLinks = el('span', 'fb-crest-stat');
  const statDefs = el('span', 'fb-crest-stat');
  crestStats.append(statSites, statPower, statLinks, statDefs);
  const autoLinkBtn = el('button', 'fb-crest-btn primary', 'Auto-Link [G]');
  autoLinkBtn.type = 'button';
  const centerBtn = el('button', 'fb-crest-btn', 'Center Ship');
  centerBtn.type = 'button';
  const exitBtn = el('button', 'fb-crest-btn', 'Flight [Shift+B]');
  exitBtn.type = 'button';
  crest.append(crestTitle, crestStats, autoLinkBtn, centerBtn, exitBtn);

  // Tactical Map-Mode Switcher Pills + StarCraft Squad Control Groups (G1-G4)
  const modeBar = el('nav', 'fb-mode-bar');
  modeBar.setAttribute('aria-label', 'Tactical Map Overlays & Control Groups');
  const modeButtons = new Map();
  for (const mm of TACTICAL_MAP_MODES) {
    const b = el('button', `fb-mode-btn ${mm.id === mapMode ? 'active' : ''}`, `${mm.short} · ${mm.label}`);
    b.type = 'button';
    b.addEventListener('click', () => setMapMode(mm.id));
    modeBar.appendChild(b);
    modeButtons.set(mm.id, b);
  }
  const groupSep = el('span', 'fb-mode-sep', '');
  modeBar.appendChild(groupSep);
  const groupButtons = [];
  function syncGroupButtons() {
    for (let i = 0; i < 4; i++) {
      const btn = groupButtons[i];
      const count = controlGroups[i].length;
      btn.textContent = count > 0 ? `G${i + 1}:${count}` : `G${i + 1}`;
      btn.classList.toggle('has-items', count > 0);
    }
  }
  function bindControlGroup(idx) {
    const list = selectedAsteroidIds.length ? selectedAsteroidIds.slice() : (selectedAsteroidId != null ? [selectedAsteroidId] : []);
    if (!list.length) {
      announceToast(`Select one or more asteroids first to bind Group ${idx + 1}.`, 'warn');
      return;
    }
    controlGroups[idx] = list;
    syncGroupButtons();
    announceToast(`Control Group G${idx + 1} bound (${counted(list.length, 'rock', 'rocks', state)}).`, 'good');
  }
  function panToWorld(wx, wz) {
    const cam = camCtrl();
    const p = state?.entities?.get?.(state.playerId)?.pos;
    if (!cam?.panFieldBuild || !p) return;
    cam.panFieldBuild(0, 0, true);
    cam.panFieldBuild(wx - p.x, wz - p.z, false);
  }

  function recallControlGroup(idx) {
    const grp = controlGroups[idx].filter((id) => state?.entities?.get?.(id)?.alive !== false);
    controlGroups[idx] = grp;
    syncGroupButtons();
    if (!grp.length) {
      announceToast(`Group G${idx + 1} is empty (Shift+Click or Ctrl+${idx + 1} to bind).`, 'info');
      return;
    }
    selectedAsteroidIds = grp.slice();
    selectedAsteroidId = grp[0];
    let sx = 0; let sz = 0; let n = 0;
    for (const id of grp) {
      const pos = state?.entities?.get?.(id)?.pos;
      if (pos) { sx += pos.x; sz += pos.z; n += 1; }
    }
    if (n > 0) panToWorld(sx / n, sz / n);
    inspectorSig = '';
    renderInspector();
  }
  for (let i = 0; i < 4; i++) {
    const gb = el('button', 'fb-group-btn', `G${i + 1}`);
    gb.type = 'button';
    gb.title = `Click: Recall Squad G${i + 1} · Shift+Click (or Ctrl+${i + 1}): Bind selected rocks`;
    gb.addEventListener('click', (ev) => {
      if (ev.shiftKey) bindControlGroup(i);
      else recallControlGroup(i);
    });
    modeBar.appendChild(gb);
    groupButtons.push(gb);
  }

  const hintBanner = el('div', 'fb-hint-banner');
  hintBanner.hidden = true;
  const linkGoodSel = el('select', 'fb-hint-select');
  linkGoodSel.setAttribute('aria-label', 'Filter cargo link commodity');
  const linkHintText = el('span', '', '');
  hintBanner.append(linkHintText, linkGoodSel);
  linkGoodSel.addEventListener('change', () => {
    selectedLinkGoodId = linkGoodSel.value || null;
  });

  // Bottom StarCraft/Mindustry Command Dock
  const dock = el('nav', 'fb-dock');
  dock.setAttribute('aria-label', 'Field Architect Tools');
  const toolButtons = new Map();
  for (const t of FIELD_TOOLS) {
    const btn = el('button', 'fb-tool');
    btn.type = 'button';
    btn.dataset.tool = t.id;
    const head = el('div', 'fb-tool-head');
    head.append(el('span', '', t.label), el('span', 'fb-tool-key', t.key));
    btn.append(head, el('span', 'fb-tool-sub', t.sub));
    btn.addEventListener('click', () => activateTool(t.id));
    dock.appendChild(btn);
    toolButtons.set(t.id, btn);
  }

  // Right-side 5-Tab Workspace Inspector
  const inspector = el('aside', 'fb-inspector');
  inspector.setAttribute('aria-label', 'Asteroid City Workspace');
  inspector.hidden = true;

  overlay.append(canvas, crest, modeBar, hintBanner, dock, inspector);
  rootParent.appendChild(overlay);

  function camCtrl() {
    return state?.render?.cameraCtrl || null;
  }

  function currentSiteSys() {
    return siteSys || ctx.asteroidSites || registry?.get?.('asteroidSites') || null;
  }

  function resizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth || 1280;
    const h = window.innerHeight || 720;
    if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
    }
    return { w, h, dpr };
  }

  function announceToast(text, kind = 'info') {
    if (bus && typeof bus.emit === 'function') {
      bus.emit('toast', { text, kind, ttl: 3.2 });
    }
  }

  function setMapMode(nextMode) {
    if (!TACTICAL_MAP_MODES.some((m) => m.id === nextMode)) return;
    mapMode = nextMode;
    for (const [id, b] of modeButtons) b.classList.toggle('active', id === mapMode);
    inspectorSig = '';
  }

  function setTab(nextTab) {
    if (!ARCHITECT_TABS.some((t) => t.id === nextTab)) return;
    activeTab = nextTab;
    inspectorSig = '';
    renderInspector();
  }

  function runSiteOp(promiseOrResult, successText) {
    Promise.resolve(promiseOrResult).then((res) => {
      if (!res || res.ok === false) {
        const msg = res?.reason === 'materials'
          ? `Insufficient materials (${Object.entries(res.missing || {}).map(([k, q]) => `${q} ${commodityDisplayName(k)}`).join(', ')})`
          : (res?.reason === 'insufficient-credits'
            ? `Need ${res.cost || ''} cr to unlock doctrine.`
            : (res?.reason === 'missing-prereq'
              ? 'Research prerequisite tier first.'
              : (res?.reason === 'out-of-range'
                ? `Out of belt link range (${res.dist} / ${res.maxRange} m)`
                : (res?.reason === 'already-commissioned'
                  ? 'Asteroid already hosts an active rig.'
                  : `Action unavailable (${res?.reason || 'blocked'}).`))));
        announceToast(msg, 'warn');
      } else if (successText) {
        announceToast(successText, 'good');
      }
      inspectorSig = '';
      crestSig = '';
      renderInspector();
    }).catch(() => {});
  }

  function setTool(nextTool) {
    activeTool = nextTool || 'select';
    for (const [id, btn] of toolButtons) {
      btn.classList.toggle('active', id === activeTool);
    }
    const sys = currentSiteSys();
    if ((activeTool === 'link_material' || activeTool === 'link_power') && selectedAsteroidId != null) {
      const s = sys?.siteForAsteroid?.(selectedAsteroidId) || null;
      linkSourceSiteId = s ? s.id : null;
    } else if (activeTool === 'select') {
      linkSourceSiteId = null;
    }
    updateHintBanner();
    inspectorSig = '';
    renderInspector();
  }

  function updateHintBanner() {
    if (!active) { hintBanner.hidden = true; return; }
    if (activeTool === 'link_material') {
      linkHintText.textContent = linkSourceSiteId
        ? 'Click destination site to connect Cargo Line · Commodity:'
        : 'Click source site to start a Cargo Line · Commodity:';
      // Populate commodity filter choices from source site lanes or player catalog
      const sys = currentSiteSys();
      const proj = linkSourceSiteId && sys?.projection ? sys.projection(linkSourceSiteId) : null;
      const goodSet = new Set();
      for (const lane of proj?.lanes || []) {
        for (const gid of Object.keys(lane.store || {})) goodSet.add(gid);
      }
      for (const gid of ['cmdty_ore_iron', 'cmdty_ore_copper', 'cmdty_ore_titanium', 'cmdty_silicate', 'cmdty_refined_metals', 'cmdty_regocrete', 'cmdty_fuel_cells']) {
        goodSet.add(gid);
      }
      const sig = [...goodSet].sort().join(',');
      if (linkGoodSel.dataset.sig !== sig) {
        linkGoodSel.dataset.sig = sig;
        linkGoodSel.textContent = '';
        const allOpt = document.createElement('option');
        allOpt.value = '';
        allOpt.textContent = 'Auto (All Surplus)';
        linkGoodSel.appendChild(allOpt);
        for (const gid of [...goodSet].sort()) {
          const opt = document.createElement('option');
          opt.value = gid;
          opt.textContent = commodityDisplayName(gid);
          linkGoodSel.appendChild(opt);
        }
      }
      linkGoodSel.value = selectedLinkGoodId || '';
      linkGoodSel.hidden = false;
      hintBanner.hidden = false;
    } else if (activeTool === 'link_power') {
      linkGoodSel.hidden = true;
      linkHintText.textContent = linkSourceSiteId
        ? 'Select a destination asteroid site to feed surplus MW power.'
        : 'Select a powerhouse source asteroid first to string a power tether.';
      hintBanner.hidden = false;
    } else {
      hintBanner.hidden = true;
    }
  }

  function enterSelectedWorks() {
    if (selectedAsteroidId == null) {
      announceToast('Select an asteroid first to open Asteroid Works.', 'warn');
      return;
    }
    const sys = currentSiteSys();
    const ast = state?.entities?.get?.(selectedAsteroidId) || null;
    const player = state?.entities?.get?.(state.playerId) || null;
    if (!ast || ast.alive === false) return;
    laneInputWrite(state, 'player.targetId', ast.id);
    const activeTether = Object.values(state.combat?.attachments?.byId || {}).find(
      (att) => att && att.state === 'active' && att.ownerId === state.playerId
        && att.targetId === ast.id && DRILL_MASSLINE_DEF_IDS.has(att.defId),
    );
    let distOk = true;
    if (player?.pos && ast.pos) {
      const surfaceDist = Math.max(0, Math.hypot(ast.pos.x - player.pos.x, ast.pos.z - player.pos.z) - (ast.radius || 0) - (player.radius || 0));
      distOk = surfaceDist <= 220;
    }
    setActive(false);
    if (activeTether && distOk) {
      bus.emit('drill:approachRequested', { asteroidId: ast.id, attachmentId: activeTether.id });
    } else {
      const tetherKey = resolveActionLabel(state, 'tether') || 'RMB';
      const hint = sys?.siteForAsteroid?.(ast.id)
        ? `Selected claimed site — fly within 220u, latch (${tetherKey}), and press B to inspect interior works.`
        : `Target locked — approach within 220u, latch (${tetherKey}), and press B to drill.`;
      announceToast(hint, 'info');
    }
  }

  function activateTool(toolId) {
    const sys = currentSiteSys();
    if (!sys) return;
    if (toolId === 'select') {
      setTool('select');
      return;
    }
    if (toolId === 'commission') {
      if (selectedAsteroidId == null) {
        announceToast('Click an asteroid in the field first to commission a rig.', 'warn');
        setTool('commission');
        return;
      }
      runSiteOp(sys.commissionFieldAsteroid(selectedAsteroidId, 'extractor'), 'Automated field rig online.');
      return;
    }
    if (toolId === 'turret' || toolId === 'sensor' || toolId === 'solar_sail') {
      if (selectedAsteroidId == null) {
        announceToast(`Select a claimed asteroid to deploy a ${toolId.replace('_', ' ')}.`, 'warn');
        setTool(toolId);
        return;
      }
      const existingSite = sys.siteForAsteroid?.(selectedAsteroidId) || null;
      if (!existingSite) {
        announceToast('Commission a rig on this asteroid first before anchoring orbital structures.', 'warn');
        return;
      }
      const msg = toolId === 'turret'
        ? 'Perimeter turret pylon deployed.'
        : (toolId === 'solar_sail' ? 'Solar collector wing anchored (+8 MW).' : 'Route telemetry beacon deployed.');
      runSiteOp(sys.deploySiteDefense(existingSite.id, toolId), msg);
      return;
    }
    if (toolId === 'drone') {
      if (selectedAsteroidId == null) {
        announceToast('Select a claimed asteroid to launch an autonomous harvester drone.', 'warn');
        setTool('drone');
        return;
      }
      const existingSite = sys.siteForAsteroid?.(selectedAsteroidId) || null;
      if (!existingSite) {
        announceToast('Commission a rig on this asteroid first before launching drones.', 'warn');
        return;
      }
      runSiteOp(sys.commissionSiteDrone?.(existingSite.id, 'harvester'), 'Autonomous harvester drone launched.');
      return;
    }
    if (toolId === 'link_material' || toolId === 'link_power') {
      setTool(toolId);
      return;
    }
    if (toolId === 'open_works') {
      enterSelectedWorks();
    }
  }

  function setActive(next) {
    const flag = !!next && state?.mode === 'flight';
    if (flag === active) return active;
    active = flag;
    if (!state.ui) state.ui = {};
    state.ui.fieldBuildActive = active;
    overlay.hidden = !active;
    pillBtn.classList.toggle('on', active);
    const cam = camCtrl();
    if (cam && typeof cam.setFieldBuildMode === 'function') {
      cam.setFieldBuildMode(active);
    }
    if (!active) {
      keysHeld.clear();
      panDrag = null;
      radarDrag = false;
      marqueeBox = null;
      setTool('select');
    } else {
      if (selectedAsteroidId == null && state?.player?.targetId != null) {
        const target = state.entities?.get?.(state.player.targetId);
        if (target && target.type === 'asteroid') selectedAsteroidId = target.id;
      }
      inspectorSig = '';
      crestSig = '';
      renderInspector();
      bus?.emit?.('audio:cue', { id: 'ui_open' });
    }
    return active;
  }

  function toggle() {
    return setActive(!active);
  }

  function handleToolShortcut(code) {
    if (!active) return false;
    if (code === 'Digit1' || code === 'Numpad1') { activateTool('commission'); return true; }
    if (code === 'Digit2' || code === 'Numpad2') { activateTool('link_material'); return true; }
    if (code === 'Digit3' || code === 'Numpad3') { activateTool('link_power'); return true; }
    if (code === 'Digit4' || code === 'Numpad4') { activateTool('turret'); return true; }
    if (code === 'Digit5' || code === 'Numpad5') { activateTool('sensor'); return true; }
    if (code === 'Digit6' || code === 'Numpad6') { activateTool('solar_sail'); return true; }
    if (code === 'Digit7' || code === 'Numpad7') { activateTool('drone'); return true; }
    if (code === 'Digit8' || code === 'Numpad8' || code === 'Enter') { activateTool('open_works'); return true; }
    if (code === 'Digit0' || code === 'Backquote') { activateTool('select'); return true; }
    if (code === 'KeyM') {
      const idx = TACTICAL_MAP_MODES.findIndex((m) => m.id === mapMode);
      setMapMode(TACTICAL_MAP_MODES[(idx + 1) % TACTICAL_MAP_MODES.length].id);
      return true;
    }
    if (code === 'KeyR') {
      blueprintRotation = (blueprintRotation + 1) % 4;
      inspectorSig = '';
      renderInspector();
      return true;
    }
    if (code === 'KeyG') {
      const sys = currentSiteSys();
      if (sys?.autoLinkSectorCluster) {
        runSiteOp(sys.autoLinkSectorCluster(state?.world?.currentSectorId), 'Sector power and material supply network balanced.');
      }
      return true;
    }
    if (code === 'Tab') {
      const idx = ARCHITECT_TABS.findIndex((t) => t.id === activeTab);
      setTab(ARCHITECT_TABS[(idx + 1) % ARCHITECT_TABS.length].id);
      return true;
    }
    return false;
  }

  function renderCrest(vm) {
    const totals = vm.network.totals;
    const sig = `${totals.siteCount}|${totals.totalPowerGenMw}|${totals.totalPowerDrawMw}|${totals.activeLinkCount}|${totals.totalDefenseRating || totals.defenseCount}`;
    if (sig === crestSig) return;
    crestSig = sig;
    statSites.textContent = 'Claims';
    statSites.appendChild(el('strong', '', String(totals.siteCount)));
    statPower.textContent = 'Belt MW';
    statPower.appendChild(el('strong', '', `${totals.totalPowerGenMw.toFixed(0)}/${totals.totalPowerDrawMw.toFixed(0)}`));
    statLinks.textContent = 'Links';
    statLinks.appendChild(el('strong', '', String(totals.activeLinkCount)));
    statDefs.textContent = 'Defense';
    statDefs.appendChild(el('strong', '', String(totals.totalDefenseRating ?? totals.defenseCount)));
  }

  function renderInspector() {
    if (!active) { inspector.hidden = true; return; }
    const sys = currentSiteSys();
    const vm = buildFieldArchitectViewModel({
      state,
      siteSys: sys,
      selectedAsteroidId,
      selectedAsteroidIds,
      activeTool,
      activeTab,
      mapMode,
      orbitalFilter,
      selectedLinkGoodId,
      blueprintId,
      blueprintRotation,
      linkSourceSiteId,
    });
    renderCrest(vm);

    const storeEntries = vm.selectedSite
      ? vm.selectedSite.lanes.map((l) => `${l.key}:${Math.round(l.stored)}`).join(',')
      : '';
    const sig = JSON.stringify({
      tab: activeTab,
      mode: mapMode,
      orbF: orbitalFilter,
      linkG: selectedLinkGoodId,
      ast: vm.selectedAsteroid?.id,
      batch: selectedAsteroidIds.join(','),
      site: vm.selectedSite?.siteId,
      dir: vm.selectedSite?.directive?.id,
      bp: blueprintId,
      rot: blueprintRotation,
      pwr: `${vm.selectedSite?.totalPowerGenMw}/${vm.selectedSite?.totalPowerDrawMw}/${Math.round(vm.selectedSite?.capacitorMwS || 0)}`,
      lanes: storeEntries,
      links: vm.selectedSite?.links?.length,
      defs: vm.selectedSite?.defenses?.length,
      drones: vm.selectedSite?.drones?.length,
      docs: Object.keys(vm.empire?.doctrines || {}).length,
      chars: `${vm.empire?.activeCharters?.length || 0}:${vm.empire?.completedCharters?.length || 0}`,
      w: vm.weather?.id,
      tool: activeTool,
    });
    if (sig === inspectorSig) return;
    inspectorSig = sig;

    renderFieldArchitectWorkspace({
      inspector,
      vm,
      sys,
      callbacks: {
        runSiteOp,
        activateTool,
        enterSelectedWorks,
        setTab,
        setOrbitalFilter: (role) => { orbitalFilter = role || 'all'; inspectorSig = ''; renderInspector(); },
        setBlueprint: (id) => { blueprintId = id; inspectorSig = ''; renderInspector(); },
        rotateBlueprint: () => { blueprintRotation = (blueprintRotation + 1) % 4; inspectorSig = ''; renderInspector(); },
        clearBatch: () => { selectedAsteroidIds = []; inspectorSig = ''; renderInspector(); },
        toast: announceToast,
        focusAsteroid: (astId, pos) => {
          selectedAsteroidId = astId;
          selectedAsteroidIds = astId != null ? [astId] : [];
          if (pos) panToWorld(pos.x, pos.z);
          inspectorSig = '';
          renderInspector();
        },
      },
    });
  }

  function drawOverlay() {
    if (!g) return;
    const { w, h, dpr } = resizeCanvas();
    const cam = state?.render?.camera;
    const fo = readFrameOrigin(state);
    const sys = currentSiteSys();
    const network = sys && typeof sys.sectorNetworkProjection === 'function'
      ? sys.sectorNetworkProjection(state?.world?.currentSectorId)
      : { sites: [], links: [], totals: {} };

    const result = renderFieldTacticalCanvas({
      g,
      w,
      h,
      dpr,
      animTime,
      state,
      cam,
      fo,
      network,
      activeTool,
      mapMode,
      selectedAsteroidId,
      selectedAsteroidIds,
      hoveredAsteroidId,
      linkSourceSiteId,
      marqueeBox,
      mouseX,
      mouseY,
    });
    projectedAsteroids.length = 0;
    for (const row of result.projectedAsteroids) projectedAsteroids.push(row);
    lastRadarRect = result.radarRect || null;
  }

  function pickAsteroidAt(clientX, clientY) {
    let best = null;
    let bestDist = 36;
    for (const a of projectedAsteroids) {
      const d = Math.hypot(a.x - clientX, a.y - clientY);
      if (d < bestDist) {
        bestDist = d;
        best = a;
      }
    }
    return best;
  }

  // --- DOM Event Handlers ---
  pillBtn.addEventListener('click', () => toggle());
  exitBtn.addEventListener('click', () => setActive(false));
  centerBtn.addEventListener('click', () => camCtrl()?.panFieldBuild(0, 0, true));
  autoLinkBtn.addEventListener('click', () => {
    const sys = currentSiteSys();
    if (sys?.autoLinkSectorCluster) {
      runSiteOp(sys.autoLinkSectorCluster(state?.world?.currentSectorId), 'Sector power and material supply network balanced.');
    }
  });

  canvas.addEventListener('mousemove', (ev) => {
    mouseX = ev.clientX;
    mouseY = ev.clientY;
    if (radarDrag && lastRadarRect) {
      const rw = radarScreenToWorld(lastRadarRect, ev.clientX, ev.clientY);
      if (rw) panToWorld(rw.wx, rw.wz);
      return;
    }
    if (panDrag) {
      const dx = ev.clientX - panDrag.lastX;
      const dy = ev.clientY - panDrag.lastY;
      panDrag.lastX = ev.clientX;
      panDrag.lastY = ev.clientY;
      camCtrl()?.panFieldBuild(-dx * 1.4, dy * 1.4, false);
      return;
    }
    if (marqueeBox && marqueeBox.active) {
      marqueeBox.curX = ev.clientX;
      marqueeBox.curY = ev.clientY;
      return;
    }
    const hit = pickAsteroidAt(ev.clientX, ev.clientY);
    hoveredAsteroidId = hit ? hit.asteroidId : null;
  });

  canvas.addEventListener('mousedown', (ev) => {
    if (!active) return;
    if (ev.button === 1 || ev.button === 2 || ev.shiftKey) {
      ev.preventDefault();
      panDrag = { lastX: ev.clientX, lastY: ev.clientY };
      return;
    }
    if (ev.button !== 0) return;
    if (lastRadarRect) {
      const radarWorld = radarScreenToWorld(lastRadarRect, ev.clientX, ev.clientY);
      if (radarWorld) {
        radarDrag = true;
        panToWorld(radarWorld.wx, radarWorld.wz);
        return;
      }
    }
    const hit = pickAsteroidAt(ev.clientX, ev.clientY);
    if (!hit) {
      marqueeBox = { active: true, startX: ev.clientX, startY: ev.clientY, curX: ev.clientX, curY: ev.clientY };
      return;
    }

    const sys = currentSiteSys();
    if ((activeTool === 'link_material' || activeTool === 'link_power') && sys) {
      const targetSite = hit.site;
      if (linkSourceSiteId && targetSite && targetSite.siteId !== linkSourceSiteId) {
        const kind = activeTool === 'link_power' ? 'power' : 'material';
        runSiteOp(sys.setSiteLink(linkSourceSiteId, targetSite.siteId, kind, kind === 'material' ? (selectedLinkGoodId || null) : null),
          kind === 'power' ? 'Power relay tether connected.' : 'Material transfer line connected.');
        setTool('select');
      } else if (targetSite) {
        selectedAsteroidId = hit.asteroidId;
        selectedAsteroidIds = [hit.asteroidId];
        linkSourceSiteId = targetSite.siteId;
        updateHintBanner();
      } else {
        announceToast('Target asteroid must be commissioned before linking.', 'warn');
      }
      inspectorSig = '';
      renderInspector();
      return;
    }

    selectedAsteroidId = hit.asteroidId;
    selectedAsteroidIds = [hit.asteroidId];
    if (activeTool === 'commission') activateTool('commission');
    else if (activeTool === 'turret') activateTool('turret');
    else if (activeTool === 'sensor') activateTool('sensor');
    else if (activeTool === 'solar_sail') activateTool('solar_sail');
    else if (activeTool === 'drone') activateTool('drone');
    inspectorSig = '';
    renderInspector();
  });

  canvas.addEventListener('dblclick', (ev) => {
    if (!active) return;
    const hit = pickAsteroidAt(ev.clientX, ev.clientY);
    if (hit?.worldPos) panToWorld(hit.worldPos.x, hit.worldPos.z);
  });

  const onMouseUp = () => {
    panDrag = null;
    radarDrag = false;
    if (marqueeBox && marqueeBox.active) {
      const dx = Math.abs(marqueeBox.curX - marqueeBox.startX);
      const dy = Math.abs(marqueeBox.curY - marqueeBox.startY);
      if (dx > 10 || dy > 10) {
        const minX = Math.min(marqueeBox.startX, marqueeBox.curX);
        const maxX = Math.max(marqueeBox.startX, marqueeBox.curX);
        const minY = Math.min(marqueeBox.startY, marqueeBox.curY);
        const maxY = Math.max(marqueeBox.startY, marqueeBox.curY);
        const boxHits = projectedAsteroids
          .filter((a) => a.x >= minX && a.x <= maxX && a.y >= minY && a.y <= maxY)
          .map((a) => a.asteroidId);
        selectedAsteroidIds = boxHits;
        selectedAsteroidId = boxHits[0] ?? null;
      } else {
        selectedAsteroidIds = [];
        selectedAsteroidId = null;
      }
      marqueeBox = null;
      inspectorSig = '';
      renderInspector();
    }
  };
  window.addEventListener('mouseup', onMouseUp);

  canvas.addEventListener('contextmenu', (ev) => {
    if (active) {
      ev.preventDefault();
      if (activeTool !== 'select') setTool('select');
    }
  });

  canvas.addEventListener('wheel', (ev) => {
    if (!active) return;
    ev.preventDefault();
    const cam = camCtrl();
    if (!cam?.getFieldBuildState || !cam?.setFieldBuildZoomMult) return;
    const cur = cam.getFieldBuildState().zoomMult || 2.35;
    cam.setFieldBuildZoomMult(cur + (ev.deltaY > 0 ? 0.28 : -0.28));
  }, { passive: false });

  const onKeyDown = (ev) => {
    if (!active || state?.mode !== 'flight') return;
    const tag = ev.target?.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    if (ev.code === 'KeyW' || ev.code === 'ArrowUp' || ev.code === 'KeyS' || ev.code === 'ArrowDown'
      || ev.code === 'KeyA' || ev.code === 'ArrowLeft' || ev.code === 'KeyD' || ev.code === 'ArrowRight') {
      keysHeld.add(ev.code);
      ev.preventDefault();
      if (typeof ev.stopPropagation === 'function') ev.stopPropagation();
      return;
    }
    if (ev.code === 'Home' || ev.code === 'Space') {
      ev.preventDefault();
      if (typeof ev.stopPropagation === 'function') ev.stopPropagation();
      camCtrl()?.panFieldBuild(0, 0, true);
      return;
    }
    if (ev.ctrlKey && /^Digit[1-4]$/.test(ev.code)) {
      ev.preventDefault();
      if (typeof ev.stopPropagation === 'function') ev.stopPropagation();
      bindControlGroup(Number(ev.code.slice(5)) - 1);
      return;
    }
    if (handleToolShortcut(ev.code)) {
      ev.preventDefault();
      if (typeof ev.stopPropagation === 'function') ev.stopPropagation();
    }
  };
  const onKeyUp = (ev) => {
    keysHeld.delete(ev.code);
  };
  window.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('keyup', onKeyUp, true);

  function frame(dt = 0.016, { hudVisible = true } = {}) {
    animTime += Math.max(0, Math.min(0.1, Number(dt) || 0.016));
    const inFlight = state?.mode === 'flight' && !state?.ui?.docked;
    if (active && !inFlight) setActive(false);

    // The pill belongs to calm flight only, and only when near a claimable or owned asteroid
    // (or while Field Build mode is actively open).
    const ds = typeof document !== 'undefined' && document.body && document.body.dataset
      ? document.body.dataset : null;
    const hudAttention = ds ? ds.hudAttention : '';
    const hudJob = ds ? ds.sfHudJob : '';
    const calmAllowed = active || (hudAttention ? hudAttention === 'calm'
      : !(hudJob === 'fight' || hudJob === 'hurt' || isSwarmGlass(state)));
    const nearSiteOrClaimable = active || hasNearbyClaimableOrOwnedBody(state);
    const pillHidden = !(inFlight && (hudVisible || active)) || !calmAllowed || !nearSiteOrClaimable;
    if (pillBtn.hidden !== pillHidden) pillBtn.hidden = pillHidden;
    if (!pillHidden) {
      const sys = currentSiteSys();
      const sectorSitesCount = sys && state?.sites?.order
        ? state.sites.order.filter((id) => state.sites.byId?.[id]?.sectorId === state?.world?.currentSectorId).length
        : 0;
      const badgeText = String(sectorSitesCount);
      if (pillBadge.textContent !== badgeText) pillBadge.textContent = badgeText;
      const badgeHidden = sectorSitesCount <= 0;
      if (pillBadge.hidden !== badgeHidden) pillBadge.hidden = badgeHidden;
    }

    if (!active) return;
    const panSpeed = 480 * Math.min(0.05, Math.max(0.001, Number(dt) || 0.016));
    let dx = 0;
    let dz = 0;
    if (keysHeld.has('KeyA') || keysHeld.has('ArrowLeft')) dx -= panSpeed;
    if (keysHeld.has('KeyD') || keysHeld.has('ArrowRight')) dx += panSpeed;
    if (keysHeld.has('KeyW') || keysHeld.has('ArrowUp')) dz -= panSpeed;
    if (keysHeld.has('KeyS') || keysHeld.has('ArrowDown')) dz += panSpeed;
    if (dx !== 0 || dz !== 0) camCtrl()?.panFieldBuild(dx, dz, false);

    drawOverlay();
    renderInspector();
  }

  function destroy() {
    setActive(false);
    window.removeEventListener('mouseup', onMouseUp);
    window.removeEventListener('keydown', onKeyDown, true);
    window.removeEventListener('keyup', onKeyUp, true);
    pillBtn.remove();
    overlay.remove();
  }

  return {
    isActive: () => active,
    setActive,
    toggle,
    handleToolShortcut,
    frame,
    destroy,
  };
}
