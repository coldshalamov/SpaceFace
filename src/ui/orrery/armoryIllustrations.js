// A family plate shows the hardware type. The original per-item mark stays on top,
// including for unillustrated equipment. Runtime hull posters and firing clips take precedence.
import { runtimeAssetUrl } from '../../core/runtimeAssetUrl.js';
import { equipmentKind, equipmentSvg } from './equipmentGlyphs.js';
import { resolveItemThumbSpec } from '../icons/itemThumbnails.js';

const ROOT = 'assets/ui/generated/armory/';
const PLATE_BY_KIND = Object.freeze({
  cannon: 'cannon', rail: 'linear', laser: 'linear', beam: 'linear', arc: 'emp',
  missile: 'missile', mine: 'mine', shield: 'shield', armor: 'armor', engine: 'engine',
  reactor: 'avionics', cooler: 'cooler', repair: 'repair', ammo: 'supply', cargo: 'cargo',
  mining: 'drill', sensor: 'sensor', tether: 'winch', gravity: 'gravity', repulsor: 'gravity',
});

export function armoryPlate(offer) {
  const id = (offer && (offer.defId || offer.id)) || '';
  if (offer && offer.kind === 'hull') return null;
  if (/plasma/.test(id)) return 'plasma';
  if (/emp_disruptor/.test(id)) return 'emp';
  if (/repair|weld/.test(id)) return 'repair';
  return PLATE_BY_KIND[equipmentKind(offer)] || null;
}

export function equipmentPlate(offer, doc) {
  const glyph = equipmentSvg(offer, doc);
  const spec = resolveItemThumbSpec(offer);
  const family = armoryPlate(offer);
  const url = (spec && spec.url) || (family ? runtimeAssetUrl(ROOT + family + '.webp', import.meta.url) : null);
  if (!glyph || !url) return glyph;
  const frame = doc.createElement('span');
  frame.className = 'orr-equipment-plate';
  frame.setAttribute('aria-hidden', 'true');
  if (spec && spec.rgb) frame.style.setProperty('--sf-thumb-rgb', spec.rgb);
  const img = doc.createElement('img');
  img.alt = '';
  img.decoding = 'async';
  img.addEventListener('error', () => { img.remove(); frame.classList.add('is-schematic'); }, { once:true });
  img.src = url;
  frame.append(img, glyph);
  return frame;
}
