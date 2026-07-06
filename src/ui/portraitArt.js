// Contact portrait mounting — authored PNG headshots with procedural canvas fallback.
import { FACTION_META } from '../data/factions.js';
import { portraitAssetForContact } from '../data/portraits.js';

const FACTION_BY_ID = new Map(FACTION_META.map((f) => [f.id, f]));

function fnvHash(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

function hueFromStr(s) { return fnvHash(s) % 360; }

/** Procedural placeholder (legacy bar canvas avatar). */
export function drawProceduralAvatar(canvas, contact) {
  const ctx2 = canvas.getContext('2d');
  if (!ctx2 || !contact) return;
  const w = canvas.width;
  const h = canvas.height;
  const fac = contact.factionId ? FACTION_BY_ID.get(contact.factionId) : null;
  const baseHue = hueFromStr(contact.id || contact.name || 'contact');
  ctx2.clearRect(0, 0, w, h);
  ctx2.fillStyle = 'hsl(' + baseHue + ',40%,12%)';
  ctx2.fillRect(0, 0, w, h);
  ctx2.fillStyle = 'hsl(' + ((baseHue + 20) % 360) + ',35%,55%)';
  ctx2.beginPath();
  ctx2.arc(w / 2, h * 0.42, w * 0.24, 0, Math.PI * 2);
  ctx2.fill();
  ctx2.fillStyle = fac ? (fac.color || '#557') : 'hsl(' + baseHue + ',30%,40%)';
  ctx2.beginPath();
  ctx2.moveTo(w * 0.12, h);
  ctx2.quadraticCurveTo(w * 0.5, h * 0.55, w * 0.88, h);
  ctx2.closePath();
  ctx2.fill();
  ctx2.strokeStyle = 'rgba(57,208,255,.7)';
  ctx2.lineWidth = 2;
  ctx2.beginPath();
  ctx2.moveTo(w * 0.34, h * 0.4);
  ctx2.lineTo(w * 0.66, h * 0.4);
  ctx2.stroke();
}

/**
 * Mount a 64×64 contact portrait: authored image when available, canvas fallback on miss/error.
 * @param {HTMLElement} host
 * @param {{ id?: string, name?: string, role?: string, canonicalKey?: string, factionId?: string }} contact
 * @param {{ className?: string, size?: number }} [options]
 */
export function mountContactPortrait(host, contact, options = {}) {
  const className = options.className || 'st-bar-avatar';
  const size = options.size || 64;
  const src = portraitAssetForContact(contact);
  host.textContent = '';

  if (src) {
    const img = document.createElement('img');
    img.className = className;
    img.width = size;
    img.height = size;
    img.alt = (contact && contact.name) ? contact.name + ' portrait' : 'Contact portrait';
    img.loading = 'lazy';
    img.decoding = 'async';
    img.src = src;
    img.addEventListener('error', () => {
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      canvas.className = className;
      drawProceduralAvatar(canvas, contact);
      img.replaceWith(canvas);
    }, { once: true });
    host.appendChild(img);
    return;
  }

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  canvas.className = className;
  host.appendChild(canvas);
  drawProceduralAvatar(canvas, contact);
}