import { formatBindingCode } from '../../systems/input.js';

// The controller resolves overlapping bindings in this order; only advertise a key that it
// will actually route to the suggested direction. Prefer inward at the surface.
const INPUT_ORDER = ['left', 'right', 'up', 'down'];
const CANDIDATES = [
  ['down', 0, 1], ['left', -1, 0], ['right', 1, 0], ['up', 0, -1],
];

export function firstTunnelControl(drill, controls, tier = 1) {
  const { field, avatar } = drill || {};
  if (!Array.isArray(field) || !Number.isInteger(avatar?.col) || !Number.isInteger(avatar?.row)) return null;
  for (const [direction, dc, dr] of CANDIDATES) {
    const tile = field[avatar.col + dc]?.[avatar.row + dr];
    if (!tile?.type || (tile.type === 'empty' && tile.structure)
      || (tile.type !== 'empty' && (tile.tierReq || 1) > tier)) continue;
    const code = (controls?.[direction] || []).find(key =>
      !['Escape', 'Tab', 'KeyB', 'KeyZ'].includes(key) && !/^Digit[1-9]$/.test(key)
      && INPUT_ORDER.find(name => controls?.[name]?.includes(key)) === direction);
    if (code) return { direction, label: formatBindingCode(code, { arrows: 'word' }) };
  }
  return null;
}
