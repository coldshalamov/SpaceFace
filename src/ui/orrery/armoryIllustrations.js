// A family plate shows the hardware type. The original per-item mark stays on top,
// including for unillustrated equipment. Runtime hull posters and firing clips take precedence.
import { runtimeAssetUrl } from '../../core/runtimeAssetUrl.js';
import { equipmentKind, equipmentSvg } from './equipmentGlyphs.js';

const ROOT = 'assets/ui/generated/armory/';
const PLATE_BY_KIND = Object.freeze({
  cannon: 'cannon', rail: 'linear', laser: 'linear', beam: 'linear', arc: 'emp',
  missile: 'missile', mine: 'mine', shield: 'shield', armor: 'armor', engine: 'engine',
  reactor: 'avionics', cooler: 'cooler', repair: 'repair', ammo: 'supply', cargo: 'cargo',
  mining: 'drill', sensor: 'sensor', tether: 'winch', gravity: 'gravity', repulsor: 'gravity',
});

export function armoryPlate(offer) {
  const id = offer.defId || offer.id || '';
  if (offer.kind === 'hull') return null;
  if (/plasma/.test(id)) return 'plasma';
  if (/emp_disruptor/.test(id)) return 'emp';
  if (/repair|weld/.test(id)) return 'repair';
  return PLATE_BY_KIND[equipmentKind(offer)] || null;
}

export function equipmentPlate(offer, doc) {
  const glyph = equipmentSvg(offer, doc);
  const family = armoryPlate(offer);
  if (!glyph || !family) return glyph;
  const frame = doc.createElement('span');
  frame.className = 'orr-equipment-plate';
  frame.setAttribute('aria-hidden', 'true');
  const img = doc.createElement('img');
  img.alt = '';
  img.decoding = 'async';
  img.addEventListener('error', () => { img.remove(); frame.classList.add('is-schematic'); }, { once:true });
  img.src = runtimeAssetUrl(ROOT + family + '.webp', import.meta.url);
  frame.append(img, glyph);
  return frame;
}
