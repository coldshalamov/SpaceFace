// src/ui/screens/techTree.js — Tech-tree progression screen (ARCHITECTURE §5, spec 09).
// Draws the TECH_NODES DAG to a <canvas>: prereq lines, node state (researched / available /
// locked), cost (credits + RP). Click an available node -> detail panel -> Unlock button emits
// ui:unlockTech{nodeId} (ships handles it). READ-ONLY on state; emits intents only.
//
// Export: techTreeScreen  (id 'techTree'). No 'three' import.

import { TECH_NODES } from '../../data/tech.js';

// Branch -> column index and accent colour. The DAG is laid out as columns by branch,
// rows by topological depth (longest prereq chain).
const BRANCHES = [
  { id: 'combat',    label: 'Combat',    color: '#ff5470' },
  { id: 'industry',  label: 'Industry',  color: '#ffb347' },
  { id: 'drives',    label: 'Drives',    color: '#39d0ff' },
  { id: 'logistics', label: 'Logistics', color: '#7af7d0' },
];
const BRANCH_INDEX = {};
BRANCHES.forEach((b, i) => { BRANCH_INDEX[b.id] = i; });
const BRANCH_COLOR = {};
BRANCHES.forEach((b) => { BRANCH_COLOR[b.id] = b.color; });

const NODE_W = 150, NODE_H = 58, COL_GAP = 26, ROW_GAP = 30, PAD_X = 28, PAD_Y = 54;

const STYLE_ID = 'sf-techtree-style';
const CSS = `
#sf-techtree { width: min(94vw, 1120px); height: min(90vh, 760px); display: flex; flex-direction: column;
  background: linear-gradient(180deg, var(--panel-2), var(--panel)); border: 1px solid var(--panel-edge);
  border-radius: 10px; box-shadow: 0 12px 48px rgba(0,0,0,.6); overflow: hidden; pointer-events: auto; }
#sf-techtree .tt-head { display: flex; align-items: center; justify-content: space-between; padding: 12px 18px;
  border-bottom: 1px solid var(--panel-edge); background: rgba(8,14,26,.7); }
#sf-techtree .tt-title { font-size: 1.2em; letter-spacing: .12em; text-transform: uppercase; color: var(--accent);
  text-shadow: 0 0 12px rgba(57,208,255,.5); }
#sf-techtree .tt-res { font-family: var(--mono); font-size: .85em; display: flex; gap: 18px; }
#sf-techtree .tt-res .cr { color: var(--energy); } #sf-techtree .tt-res .rp { color: var(--accent-2); }
#sf-techtree .tt-res b { font-weight: 700; }
#sf-techtree .tt-body { flex: 1; display: flex; min-height: 0; }
#sf-techtree .tt-scroll { flex: 1; overflow: auto; position: relative; min-width: 0; }
#sf-techtree canvas { display: block; cursor: default; }
#sf-techtree .tt-side { width: 282px; border-left: 1px solid var(--panel-edge); background: rgba(6,11,21,.6);
  padding: 16px; display: flex; flex-direction: column; gap: 10px; overflow-y: auto; }
#sf-techtree .tt-sel-name { font-size: 1.06em; color: var(--ink); }
#sf-techtree .tt-branch { font-family: var(--mono); font-size: .76em; text-transform: uppercase; letter-spacing: .1em; }
#sf-techtree .tt-state { font-family: var(--mono); font-size: .8em; }
#sf-techtree .tt-cost { display: flex; gap: 16px; font-family: var(--mono); font-size: .86em; }
#sf-techtree .tt-cost .cr { color: var(--energy); } #sf-techtree .tt-cost .rp { color: var(--accent-2); }
#sf-techtree .tt-cost .bad { color: var(--danger); }
#sf-techtree .tt-unlocks { font-size: .8em; color: var(--ink-dim); line-height: 1.55; }
#sf-techtree .tt-unlocks b { color: var(--ink); }
#sf-techtree .tt-prereq { font-size: .78em; color: var(--ink-mute); line-height: 1.5; }
#sf-techtree .tt-prereq .ok { color: var(--good); } #sf-techtree .tt-prereq .no { color: var(--danger); }
#sf-techtree .tt-actions { margin-top: auto; display: flex; flex-direction: column; gap: 8px; }
#sf-techtree .tt-actions button { width: 100%; padding: 9px; }
#sf-techtree .tt-unlock { background: rgba(57,208,255,.12); border-color: var(--accent); color: #fff;
  text-shadow: 0 0 8px rgba(57,208,255,.6); }
#sf-techtree .tt-foot { display: flex; gap: 16px; padding: 8px 18px; border-top: 1px solid var(--panel-edge);
  font-family: var(--mono); font-size: .72em; color: var(--ink-mute); }
#sf-techtree .tt-foot span { display: inline-flex; align-items: center; gap: 5px; }
#sf-techtree .tt-sw { width: 11px; height: 11px; border-radius: 3px; display: inline-block; }
#sf-techtree .tt-hint { font-size: .78em; color: var(--ink-mute); }
`;

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent = CSS;
  document.head.appendChild(el);
}

// Build once: id -> node, plus per-node layout depth (longest prereq chain) and row index.
function buildLayout(nodes) {
  const byId = {};
  for (const n of nodes) byId[n.id] = n;
  const depthMemo = {};
  function depth(id, seen) {
    if (depthMemo[id] != null) return depthMemo[id];
    const n = byId[id];
    if (!n || !n.prereqs || !n.prereqs.length) return (depthMemo[id] = 0);
    if (seen && seen.has(id)) return 0; // cycle guard (shouldn't happen)
    const s = seen || new Set();
    s.add(id);
    let d = 0;
    for (const p of n.prereqs) d = Math.max(d, depth(p, s) + 1);
    s.delete(id);
    return (depthMemo[id] = d);
  }
  // assign row within each (branch, depth) bucket so siblings don't overlap
  const layout = {};
  const bucketCount = {}; // key `${branch}:${depth}` -> running count
  // stable order: by branch, then depth, then declaration order
  const ordered = nodes.slice().sort((a, b) => {
    const ba = BRANCH_INDEX[a.branch] ?? 9, bb = BRANCH_INDEX[b.branch] ?? 9;
    if (ba !== bb) return ba - bb;
    return depth(a.id) - depth(b.id);
  });
  for (const n of ordered) {
    const d = depth(n.id);
    const key = `${n.branch}:${d}`;
    const slot = bucketCount[key] || 0;
    bucketCount[key] = slot + 1;
    layout[n.id] = { depth: d, slot };
  }
  // compute x by branch column (each branch reserves enough columns for its widest bucket)
  const branchMaxSlot = {};
  for (const n of nodes) {
    const l = layout[n.id];
    const cur = branchMaxSlot[n.branch] || 0;
    if (l.slot + 1 > cur) branchMaxSlot[n.branch] = l.slot + 1;
  }
  // branch base column offset
  const branchBaseX = {};
  let accCols = 0;
  for (const b of BRANCHES) {
    branchBaseX[b.id] = accCols;
    accCols += (branchMaxSlot[b.id] || 1);
  }
  const positions = {};
  let maxX = 0, maxY = 0;
  for (const n of nodes) {
    const l = layout[n.id];
    const col = branchBaseX[n.branch] + l.slot;
    const x = PAD_X + col * (NODE_W + COL_GAP);
    const y = PAD_Y + l.depth * (NODE_H + ROW_GAP);
    positions[n.id] = { x, y };
    maxX = Math.max(maxX, x + NODE_W);
    maxY = Math.max(maxY, y + NODE_H);
  }
  return { byId, positions, width: maxX + PAD_X, height: maxY + PAD_Y, branchBaseX, branchMaxSlot };
}

export const techTreeScreen = {
  id: 'techTree',
  _ctx: null,
  _root: null,
  _canvas: null,
  _g: null,
  _layout: null,
  _selectedId: null,
  _hoverId: null,
  _dpr: 1,

  mount(rootEl, ctx) {
    injectStyle();
    this._ctx = ctx;
    this._root = rootEl;
    rootEl.id = 'sf-techtree';
    rootEl.innerHTML = `
      <div class="tt-head">
        <div class="tt-title">Research &amp; Tech</div>
        <div class="tt-res">
          <div class="cr">CR <b data-cr>0</b></div>
          <div class="rp">RP <b data-rp>0</b></div>
          <div class="rp" style="color:var(--ink-dim)">UNLOCKED <b data-count>0/${TECH_NODES.length}</b></div>
        </div>
      </div>
      <div class="tt-body">
        <div class="tt-scroll"><canvas></canvas></div>
        <div class="tt-side">
          <div data-sel><div class="tt-hint">Select a node to inspect its cost, effects and prerequisites.</div></div>
          <div class="tt-actions" data-actions></div>
        </div>
      </div>
      <div class="tt-foot">
        <span><i class="tt-sw" style="background:#39d0ff"></i>Available</span>
        <span><i class="tt-sw" style="background:rgba(57,208,255,.85);box-shadow:0 0 6px #39d0ff"></i>Researched</span>
        <span><i class="tt-sw" style="background:#33425c"></i>Locked</span>
      </div>`;

    this._canvas = rootEl.querySelector('canvas');
    this._g = this._canvas.getContext('2d');
    this._layout = buildLayout(this._nodes());

    this._canvas.addEventListener('click', (e) => this._onCanvasClick(e));
    this._canvas.addEventListener('mousemove', (e) => this._onCanvasMove(e));
    this._canvas.addEventListener('mouseleave', () => { this._hoverId = null; this._draw(); });

    rootEl.querySelector('[data-actions]').addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-act]');
      if (btn) this._onAction(btn.dataset.act);
    });
  },

  onShow(ctx) {
    if (ctx) this._ctx = ctx;
    this._sizeCanvas();
    this.refresh(this._ctx);
  },

  onHide() { /* cached DOM retained */ },

  refresh(ctx) {
    if (ctx) this._ctx = ctx;
    if (!this._root) return;
    this._syncHeader();
    this._syncSidebar();
    this._draw();
  },

  // ---- internals ----------------------------------------------------------
  _nodes() {
    const st = this._ctx.state;
    const c = st.content && st.content.techNodes;
    if (c && c.length) return c;
    return TECH_NODES;
  },

  _researched() {
    const st = this._ctx.state;
    return (st.player && st.player.researchedNodes) || [];
  },

  _isResearched(id) { return this._researched().includes(id); },

  _prereqsMet(node) {
    if (!node.prereqs || !node.prereqs.length) return true;
    const r = this._researched();
    return node.prereqs.every((p) => r.includes(p));
  },

  // state: 'researched' | 'available' | 'locked'
  _nodeState(node) {
    if (this._isResearched(node.id)) return 'researched';
    if (this._prereqsMet(node)) return 'available';
    return 'locked';
  },

  _sizeCanvas() {
    if (!this._canvas) return;
    this._dpr = Math.min(window.devicePixelRatio || 1, 2);
    const lw = this._layout ? this._layout.width : 800;
    const lh = this._layout ? this._layout.height : 600;
    this._canvas.style.width = lw + 'px';
    this._canvas.style.height = lh + 'px';
    this._canvas.width = Math.round(lw * this._dpr);
    this._canvas.height = Math.round(lh * this._dpr);
  },

  _draw() {
    const g = this._g, cv = this._canvas;
    if (!g || !this._layout) return;
    g.setTransform(this._dpr, 0, 0, this._dpr, 0, 0);
    const w = cv.width / this._dpr, h = cv.height / this._dpr;
    g.clearRect(0, 0, w, h);

    const nodes = this._nodes();
    const pos = this._layout.positions;

    // branch column headers
    g.textAlign = 'left'; g.textBaseline = 'top';
    for (const b of BRANCHES) {
      const baseCol = this._layout.branchBaseX[b.id];
      if (baseCol == null) continue;
      const x = PAD_X + baseCol * (NODE_W + COL_GAP);
      g.fillStyle = b.color;
      g.globalAlpha = 0.85;
      g.font = '700 12px var(--mono, monospace)';
      g.fillText(b.label.toUpperCase(), x, 14);
      g.globalAlpha = 1;
    }

    // ---- prereq edges ----
    for (const n of nodes) {
      if (!n.prereqs) continue;
      const np = pos[n.id];
      if (!np) continue;
      const childTop = { x: np.x + NODE_W / 2, y: np.y };
      for (const p of n.prereqs) {
        const pp = pos[p];
        if (!pp) continue;
        const parentBottom = { x: pp.x + NODE_W / 2, y: pp.y + NODE_H };
        const met = this._isResearched(p);
        g.beginPath();
        g.moveTo(parentBottom.x, parentBottom.y);
        // simple bezier elbow
        const midY = (parentBottom.y + childTop.y) / 2;
        g.bezierCurveTo(parentBottom.x, midY, childTop.x, midY, childTop.x, childTop.y);
        g.strokeStyle = met ? 'rgba(57,208,255,0.55)' : 'rgba(110,130,160,0.28)';
        g.lineWidth = met ? 2 : 1;
        g.stroke();
      }
    }

    // ---- nodes ----
    for (const n of nodes) {
      const p = pos[n.id];
      if (!p) continue;
      const stt = this._nodeState(n);
      const sel = n.id === this._selectedId;
      const hov = n.id === this._hoverId;
      const bcol = BRANCH_COLOR[n.branch] || '#39d0ff';

      // card background
      g.beginPath();
      roundRect(g, p.x, p.y, NODE_W, NODE_H, 8);
      if (stt === 'researched') {
        g.fillStyle = 'rgba(57,208,255,0.18)';
      } else if (stt === 'available') {
        g.fillStyle = 'rgba(13,24,40,0.95)';
      } else {
        g.fillStyle = 'rgba(20,28,42,0.7)';
      }
      g.fill();

      // border by state
      g.lineWidth = sel ? 2.5 : 1.5;
      if (stt === 'researched') g.strokeStyle = '#39d0ff';
      else if (stt === 'available') g.strokeStyle = sel || hov ? '#fff' : bcol;
      else g.strokeStyle = 'rgba(80,100,130,0.5)';
      g.stroke();

      if (sel || (hov && stt !== 'locked')) {
        g.save();
        g.shadowColor = stt === 'researched' ? '#39d0ff' : bcol;
        g.shadowBlur = 12;
        g.stroke();
        g.restore();
      }

      // name
      g.fillStyle = stt === 'locked' ? 'rgba(150,168,196,0.55)' : '#dce8f5';
      g.font = '600 12px var(--font, sans-serif)';
      g.textAlign = 'left'; g.textBaseline = 'top';
      wrapText(g, n.name, p.x + 9, p.y + 8, NODE_W - 18, 14, 2);

      // cost or check
      g.font = '600 10px var(--mono, monospace)';
      if (stt === 'researched') {
        g.fillStyle = '#62e08a';
        g.textAlign = 'right'; g.textBaseline = 'bottom';
        g.fillText('✓ RESEARCHED', p.x + NODE_W - 8, p.y + NODE_H - 7);
      } else {
        const cost = n.cost || {};
        g.textAlign = 'left'; g.textBaseline = 'bottom';
        g.fillStyle = '#ffd84a';
        g.fillText(fmtCr(cost.credits || 0), p.x + 9, p.y + NODE_H - 7);
        g.fillStyle = '#7af7d0';
        g.textAlign = 'right';
        g.fillText((cost.rp || 0) + ' RP', p.x + NODE_W - 8, p.y + NODE_H - 7);
      }

      // lock glyph
      if (stt === 'locked') {
        g.fillStyle = 'rgba(150,168,196,0.6)';
        g.font = '11px var(--mono, monospace)';
        g.textAlign = 'right'; g.textBaseline = 'top';
        g.fillText('🔒', p.x + NODE_W - 8, p.y + 7);
      }
    }
  },

  _onCanvasMove(e) {
    const hit = this._hitTest(e);
    const id = hit ? hit.id : null;
    if (id !== this._hoverId) { this._hoverId = id; this._draw(); }
    this._canvas.style.cursor = hit ? 'pointer' : 'default';
  },

  _onCanvasClick(e) {
    const hit = this._hitTest(e);
    if (!hit) return;
    this._selectedId = hit.id;
    this._syncSidebar();
    this._draw();
  },

  _hitTest(e) {
    const rect = this._canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const pos = this._layout.positions;
    for (const n of this._nodes()) {
      const p = pos[n.id];
      if (!p) continue;
      if (mx >= p.x && mx <= p.x + NODE_W && my >= p.y && my <= p.y + NODE_H) return n;
    }
    return null;
  },

  _syncHeader() {
    const st = this._ctx.state;
    const cr = this._root.querySelector('[data-cr]');
    const rp = this._root.querySelector('[data-rp]');
    const ct = this._root.querySelector('[data-count]');
    if (cr) cr.textContent = fmtCr((st.player && st.player.credits) || 0);
    if (rp) rp.textContent = ((st.player && st.player.researchPoints) || 0).toLocaleString();
    if (ct) ct.textContent = `${this._researched().length}/${this._nodes().length}`;
  },

  _syncSidebar() {
    const sel = this._root.querySelector('[data-sel]');
    const actions = this._root.querySelector('[data-actions]');
    if (!this._selectedId) {
      sel.innerHTML = `<div class="tt-hint">Select a node to inspect its cost, effects and prerequisites.</div>`;
      actions.innerHTML = '';
      return;
    }
    const n = this._layout.byId[this._selectedId] || this._nodes().find((x) => x.id === this._selectedId);
    if (!n) { sel.innerHTML = ''; actions.innerHTML = ''; return; }
    const st = this._ctx.state;
    const stt = this._nodeState(n);
    const cost = n.cost || {};
    const creds = (st.player && st.player.credits) || 0;
    const rp = (st.player && st.player.researchPoints) || 0;
    const canAfford = creds >= (cost.credits || 0) && rp >= (cost.rp || 0);
    const bcol = BRANCH_COLOR[n.branch] || '#39d0ff';

    const prereqHtml = (n.prereqs && n.prereqs.length)
      ? n.prereqs.map((p) => {
          const pn = (this._layout.byId[p] || {}).name || p;
          const ok = this._isResearched(p);
          return `<div class="${ok ? 'ok' : 'no'}">${ok ? '✓' : '✗'} ${pn}</div>`;
        }).join('')
      : `<div class="ok">No prerequisites</div>`;

    sel.innerHTML = `
      <div class="tt-sel-name">${n.name}</div>
      <div class="tt-branch" style="color:${bcol}">${n.branch} branch</div>
      <div class="tt-state" style="color:${stateColor(stt)}">${stateLabel(stt)}</div>
      <div class="tt-cost">
        <span class="cr${creds >= (cost.credits || 0) ? '' : ' bad'}">${fmtCr(cost.credits || 0)} cr</span>
        <span class="rp${rp >= (cost.rp || 0) ? '' : ' bad'}">${cost.rp || 0} RP</span>
      </div>
      <div class="tt-unlocks">${formatUnlocks(n.unlocks)}</div>
      <div class="tt-prereq"><b style="color:var(--ink-dim)">Prerequisites</b>${prereqHtml}</div>
    `;

    if (stt === 'researched') {
      actions.innerHTML = `<button disabled>Already researched</button>`;
    } else if (stt === 'locked') {
      actions.innerHTML = `<button disabled>Prerequisites not met</button>`;
    } else if (!canAfford) {
      actions.innerHTML = `<button disabled>Insufficient credits / RP</button>`;
    } else {
      actions.innerHTML = `<button class="tt-unlock" data-act="unlock">⟫ Research</button>`;
    }
  },

  _onAction(act) {
    if (act !== 'unlock' || !this._selectedId) return;
    const n = this._nodes().find((x) => x.id === this._selectedId);
    if (!n) return;
    // ships handles ui:unlockTech (charges credits/RP, sets researchedNodes, emits tech:researched).
    this._ctx.bus.emit('ui:unlockTech', { nodeId: n.id });
    this._ctx.bus.emit('toast', { text: `Researching ${n.name}…`, kind: 'info', ttl: 3000 });
    // optimistic-free: refresh on next event-driven cycle; refresh now in case ships is synchronous
    this.refresh(this._ctx);
  },
};

// ---- helpers ----------------------------------------------------------------
function stateLabel(s) { return s === 'researched' ? 'RESEARCHED' : s === 'available' ? 'AVAILABLE' : 'LOCKED'; }
function stateColor(s) { return s === 'researched' ? '#62e08a' : s === 'available' ? '#39d0ff' : '#84a0c8'; }

function formatUnlocks(u) {
  if (!u) return '<b>Effects:</b> —';
  const parts = [];
  if (u.ships && u.ships.length) parts.push(`<b>Ships:</b> ${u.ships.map(cleanId).join(', ')}`);
  if (u.modules && u.modules.length) parts.push(`<b>Modules:</b> ${u.modules.map(cleanId).join(', ')}`);
  if (u.efficiency) {
    const e = Object.entries(u.efficiency).map(([k, v]) => `${k} ${(v > 0 ? '+' : '') + Math.round(v * 100)}%`);
    parts.push(`<b>Bonuses:</b> ${e.join(', ')}`);
  }
  if (u.droneTierCap != null) parts.push(`<b>Drone tier cap:</b> ${u.droneTierCap}`);
  if (u.npcTraderHiring) parts.push(`<b>Unlocks:</b> NPC trader hiring`);
  if (u.outpostConstruction) parts.push(`<b>Unlocks:</b> outpost construction`);
  if (u.extraDronePerBay) parts.push(`<b>+${u.extraDronePerBay}</b> drone per bay`);
  if (u.flags && u.flags.length) parts.push(`<b>Flags:</b> ${u.flags.join(', ')}`);
  return parts.length ? parts.join('<br>') : '<b>Effects:</b> —';
}

function cleanId(id) {
  return String(id).replace(/^(ship_|mod_|wpn_)/, '').replace(/_/g, ' ');
}

function fmtCr(v) {
  v = Math.round(v || 0);
  if (v >= 1e6) return (v / 1e6).toFixed(v >= 1e7 ? 0 : 1) + 'M';
  if (v >= 1e4) return (v / 1e3).toFixed(0) + 'k';
  return v.toLocaleString();
}

function roundRect(g, x, y, w, h, r) {
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function wrapText(g, text, x, y, maxW, lineH, maxLines) {
  const words = String(text).split(' ');
  let line = '', lines = 0;
  for (let i = 0; i < words.length; i++) {
    const test = line ? line + ' ' + words[i] : words[i];
    if (g.measureText(test).width > maxW && line) {
      g.fillText(line, x, y); y += lineH; line = words[i]; lines++;
      if (lines >= maxLines - 1) {
        // last allowed line: fit the remainder with ellipsis if needed
        let rest = words.slice(i).join(' ');
        while (g.measureText(rest + '…').width > maxW && rest.length) rest = rest.slice(0, -1);
        g.fillText(rest + (rest !== words.slice(i).join(' ') ? '…' : ''), x, y);
        return;
      }
    } else {
      line = test;
    }
  }
  if (line) g.fillText(line, x, y);
}
