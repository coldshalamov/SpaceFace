// src/ui/screens/bar.js — STATION "Bar" tab panel.
// A couple of contact/dialog stubs offering lore/tips. Selecting a dialog choice emits
// ui:talkContact {contactId, choiceId}; the missions/dialog system handles it (§4.4). Read-only.
// Contacts are seeded deterministically from the station id so the same dock shows the same faces
// (no Math.random in a way that affects sim — this is cosmetic UI only).
import { FACTION_META } from '../../data/factions.js';

const FACTION_BY_ID = new Map(FACTION_META.map((f) => [f.id, f]));

// Small fixed roster of lore/tip contacts. Real special-mission contacts come from missions later.
const CONTACTS = [
  {
    id: 'contact_barkeep', name: 'Sully', role: 'Barkeep', factionId: null,
    line: 'New face. Drinks are cheap, information cheaper. What do you need?',
    choices: [
      { id: 'rumors', label: 'Any rumors?' },
      { id: 'tips', label: 'Trading tips?' },
      { id: 'leave', label: 'Just a drink.' },
    ],
  },
  {
    id: 'contact_broker', name: 'Vance', role: 'Fixer', factionId: 'faction_quiet',
    line: 'I move things that need moving. Discreetly. You interested in work off the boards?',
    choices: [
      { id: 'work', label: 'What kind of work?' },
      { id: 'who', label: 'Who do you run with?' },
      { id: 'pass', label: 'Not today.' },
    ],
  },
];

// Deterministic hue from a string (cosmetic avatar tint).
function hueFromStr(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h % 360;
}

// Draw a tiny procedural avatar into a canvas (no image assets per §1.1).
function drawAvatar(canvas, contact) {
  const ctx2 = canvas.getContext('2d');
  if (!ctx2) return;
  const w = canvas.width, h = canvas.height;
  const fac = contact.factionId ? FACTION_BY_ID.get(contact.factionId) : null;
  const baseHue = hueFromStr(contact.id);
  ctx2.clearRect(0, 0, w, h);
  // backdrop
  ctx2.fillStyle = 'hsl(' + baseHue + ',40%,12%)';
  ctx2.fillRect(0, 0, w, h);
  // head
  ctx2.fillStyle = 'hsl(' + ((baseHue + 20) % 360) + ',35%,55%)';
  ctx2.beginPath();
  ctx2.arc(w / 2, h * 0.42, w * 0.24, 0, Math.PI * 2);
  ctx2.fill();
  // shoulders
  ctx2.fillStyle = fac ? (fac.color || '#557') : 'hsl(' + baseHue + ',30%,40%)';
  ctx2.beginPath();
  ctx2.moveTo(w * 0.12, h);
  ctx2.quadraticCurveTo(w * 0.5, h * 0.55, w * 0.88, h);
  ctx2.closePath();
  ctx2.fill();
  // visor accent
  ctx2.strokeStyle = 'rgba(57,208,255,.7)';
  ctx2.lineWidth = 2;
  ctx2.beginPath();
  ctx2.moveTo(w * 0.34, h * 0.4);
  ctx2.lineTo(w * 0.66, h * 0.4);
  ctx2.stroke();
}

export function createBarPanel(ctx) {
  const root = document.createElement('div');
  root.className = 'st-panel st-bar';
  root.innerHTML = '<div class="st-sub-h">The Bar</div><div class="st-bar-list"></div>';
  const list = root.querySelector('.st-bar-list');

  list.addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-choice]');
    if (!btn) return;
    const card = btn.closest('[data-contact]');
    const contactId = card.getAttribute('data-contact');
    const choiceId = btn.getAttribute('data-choice');
    ctx.bus.emit('ui:talkContact', { contactId, choiceId });
    ctx.bus.emit('audio:cue', { id: 'ui_click' });
    // local stub reply so the panel feels alive even with no dialog system wired yet.
    const reply = card.querySelector('.st-bar-reply');
    if (reply) {
      reply.textContent = stubReply(choiceId);
      reply.classList.add('show');
    }
  });

  function stubReply(choiceId) {
    switch (choiceId) {
      case 'rumors': return 'They say pirates have been hitting the lanes near the belt. Watch yourself out there.';
      case 'tips': return 'Buy low at the source, sell where they can\'t make it. Refineries always want ore.';
      case 'work': return 'Cargo that doesn\'t like customs. Pays well if you keep quiet.';
      case 'who': return 'Friends of friends. The Quiet looks after its own.';
      default: return 'Suit yourself.';
    }
  }

  function refresh() {
    const frag = document.createDocumentFragment();
    for (const c of CONTACTS) {
      const fac = c.factionId ? FACTION_BY_ID.get(c.factionId) : null;
      const card = document.createElement('div');
      card.className = 'st-bar-card';
      card.setAttribute('data-contact', c.id);
      const canvas = document.createElement('canvas');
      canvas.width = 64; canvas.height = 64; canvas.className = 'st-bar-avatar';
      const body = document.createElement('div');
      body.className = 'st-bar-body';
      body.innerHTML =
        '<div class="st-bar-name">' + c.name + ' <span class="st-bar-role mono">' + c.role +
          (fac ? ' · ' + (fac.short || fac.name) : '') + '</span></div>' +
        '<div class="st-bar-line">' + c.line + '</div>' +
        '<div class="st-bar-choices">' +
          c.choices.map((ch) => '<button data-choice="' + ch.id + '">' + ch.label + '</button>').join('') +
        '</div>' +
        '<div class="st-bar-reply mono"></div>';
      card.appendChild(canvas);
      card.appendChild(body);
      frag.appendChild(card);
      drawAvatar(canvas, c);
    }
    list.textContent = '';
    list.appendChild(frag);
  }

  return {
    el: root,
    stationId: null,
    onShow(c) { if (c && c.stationId) this.stationId = c.stationId; refresh(); },
    refresh,
  };
}
