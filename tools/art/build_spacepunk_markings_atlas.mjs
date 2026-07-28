import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PNG } from 'pngjs';

export const ATLAS_WIDTH = 2048;
export const ATLAS_HEIGHT = 1024;
export const CELL_SIZE = 256;
export const ATLAS_COLUMNS = 8;
export const ATLAS_ROWS = 4;
export const DEFAULT_OUTPUT_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../assets/ships/foundry/spacepunk_markings_v1',
);

const COLORS = Object.freeze({
  bone: '#DED6BE',
  cyan: '#55B4B8',
  quiet: '#766A91',
  amber: '#D9A441',
  concord: '#A7C6D9',
  orange: '#D86B24',
  red: '#B93632',
  darkIron: '#292B2D',
  ember: '#FF762B',
  hotWhite: '#FFF2C0',
});

export const MARKING_SLOTS = Object.freeze([
  slot('free_broken_clock', 'identity', 'faction_free', COLORS.cyan, 0.12,
    'A broken port-clock: the player hull returned with eleven years missing.'),
  slot('free_ghost_mark', 'identity', 'faction_free', COLORS.bone, 0.18,
    'The weary ghost attached to the Hitch and its Borrowed Time reputation.'),
  slot('free_tally_thirteen', 'identity', 'faction_free', COLORS.bone, 0.16,
    'Exactly thirteen old combat tallies; a history, not a generic kill badge.'),
  slot('free_severed_chain', 'identity', 'faction_free', COLORS.cyan, 0.20,
    'An independent crew mark: one load-bearing link deliberately cut.'),

  slot('quiet_occluded_eye', 'identity', 'faction_quiet', COLORS.quiet, 0.10,
    'The Quiet see the route while hiding the observer.'),
  slot('quiet_folded_route', 'identity', 'faction_quiet', COLORS.quiet, 0.08,
    'A contraband route folded through legitimate handoff points.'),
  slot('quiet_cut_signal', 'identity', 'faction_quiet', COLORS.quiet, 0.10,
    'A transponder carrier interrupted without broadcasting hostility.', COLORS.cyan),
  slot('quiet_keyhole', 'identity', 'faction_quiet', COLORS.quiet, 0.06,
    'A small access mark for people who know which sealed route still opens.'),

  slot('mts_ledger_orbit', 'identity', 'faction_mts', COLORS.amber, 0.02,
    'Meridian mass and custody moving through a closed ledger orbit.', COLORS.amber),
  slot('mts_counterfeit_seal', 'identity', 'faction_mts', COLORS.amber, 0.18,
    'A deliberately imperfect copy of an institutional cargo seal.'),
  slot('scn_custody_brackets', 'identity', 'faction_scn', COLORS.concord, 0.01,
    'Concord evidence-custody brackets around a recorded object.', COLORS.concord),
  slot('scn_rescue_corridor', 'identity', 'faction_scn', COLORS.concord, 0.02,
    'A lawful rescue corridor, distinct from an attack chevron.', COLORS.hotWhite),

  slot('dmc_drill_tooth', 'identity', 'faction_dmc', COLORS.orange, 0.14,
    'A practical cutter tooth used by Drift mining crews.'),
  slot('dmc_pressure_warning', 'identity', 'faction_dmc', COLORS.orange, 0.10,
    'A pressure vessel warning with no fake alien typography.'),
  slot('reach_boarding_hook', 'identity', 'faction_reach', COLORS.red, 0.24,
    'A Crimson Reach boarding hook cut from an older chain mark.'),
  slot('pitborn_weld_scar', 'identity', 'faction_pitborn', COLORS.orange, 0.26,
    'A repair-as-identity weld scar used on stolen and recovered plates.', COLORS.ember),

  slot('serial_bt_13', 'serial', 'faction_free', COLORS.bone, 0.15,
    'Exact player-history stencil: BT-13.'),
  slot('serial_mts_47b', 'serial', 'faction_mts', COLORS.amber, 0.03,
    'Exact Meridian custody serial: MTS-47B.'),
  slot('dock_07', 'serial', 'faction_scn', COLORS.concord, 0.01,
    'Exact dock numeral: DOCK 07.'),
  slot('shaft_s7', 'serial', 'faction_dmc', COLORS.orange, 0.12,
    'Exact working-site identifier: SHAFT S7.'),

  slot('maintenance_fuel', 'service', null, COLORS.bone, 0.07,
    'Fuel service glyph with conventional lettering.'),
  slot('maintenance_tow', 'service', null, COLORS.bone, 0.08,
    'Tow hardpoint glyph with conventional lettering.'),
  slot('hazard_chevrons', 'hazard', null, COLORS.amber, 0.12,
    'Mip-safe directional hazard tape.'),
  slot('hazard_pressure', 'hazard', null, COLORS.orange, 0.10,
    'Pressure hazard block for tanks, locks, and patch plates.'),

  slot('runlight_cyan', 'emissive', null, COLORS.darkIron, 0.00,
    'Cyan running-light cluster.', COLORS.cyan),
  slot('runlight_amber', 'emissive', null, COLORS.darkIron, 0.00,
    'Amber service-light cluster.', COLORS.amber),
  slot('rescue_lane_emissive', 'emissive', 'faction_scn', COLORS.darkIron, 0.00,
    'Restrained rescue-lane light, not an always-on bloom strip.', COLORS.hotWhite),
  slot('custody_pulse_emissive', 'emissive', 'faction_scn', COLORS.darkIron, 0.00,
    'Evidence-custody status pulse.', COLORS.concord),

  slot('quiet_transponder_emissive', 'emissive', 'faction_quiet', COLORS.darkIron, 0.00,
    'Quiet transponder arcs with the carrier visibly cut.', COLORS.quiet),
  slot('counterfeit_beacon_emissive', 'emissive', 'faction_mts', COLORS.darkIron, 0.05,
    'Counterfeit Meridian beacon with uneven pulse spacing.', COLORS.amber),
  slot('pitborn_weld_hot', 'emissive', 'faction_pitborn', COLORS.darkIron, 0.08,
    'Recently repaired weld points; localized heat only.', COLORS.ember),
  slot('archive_record_lamp', 'emissive', 'faction_archive', COLORS.darkIron, 0.00,
    'A dark maintained record lamp for Archive equipment.', COLORS.hotWhite),
]);

function slot(id, group, factionId, baseColor, wear, story, emissiveColor = null) {
  return Object.freeze({ id, group, factionId, baseColor, wear, story, emissiveColor });
}

const GLYPHS = Object.freeze({
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
  '-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  '3': ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '10000', '11110', '00001', '00001', '11110'],
  '6': ['01110', '10000', '10000', '11110', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00001', '01110'],
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  C: ['01111', '10000', '10000', '10000', '10000', '10000', '01111'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  G: ['01111', '10000', '10000', '10111', '10001', '10001', '01111'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
  J: ['00111', '00010', '00010', '00010', '10010', '10010', '01100'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  Q: ['01110', '10001', '10001', '10001', '10101', '10010', '01101'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  W: ['10001', '10001', '10001', '10101', '10101', '11011', '10001'],
  X: ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  Z: ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
});

function makeMask() {
  return new Uint8Array(CELL_SIZE * CELL_SIZE);
}

function cloneMask(mask) {
  return new Uint8Array(mask);
}

function setMask(mask, x, y, value = 255) {
  const ix = Math.round(x);
  const iy = Math.round(y);
  if (ix < 0 || iy < 0 || ix >= CELL_SIZE || iy >= CELL_SIZE) return;
  const offset = iy * CELL_SIZE + ix;
  mask[offset] = Math.max(mask[offset], value);
}

function disk(mask, cx, cy, radius, value = 255) {
  const minX = Math.max(0, Math.floor(cx - radius));
  const maxX = Math.min(CELL_SIZE - 1, Math.ceil(cx + radius));
  const minY = Math.max(0, Math.floor(cy - radius));
  const maxY = Math.min(CELL_SIZE - 1, Math.ceil(cy + radius));
  const radiusSq = radius * radius;
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= radiusSq) setMask(mask, x, y, value);
    }
  }
}

function line(mask, x0, y0, x1, y1, width = 8, value = 255) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) * 1.35));
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    disk(mask, x0 + dx * t, y0 + dy * t, width / 2, value);
  }
}

function polyline(mask, points, width = 8, close = false, value = 255) {
  for (let i = 1; i < points.length; i += 1) {
    line(mask, points[i - 1][0], points[i - 1][1], points[i][0], points[i][1], width, value);
  }
  if (close && points.length > 2) {
    const a = points[points.length - 1];
    const b = points[0];
    line(mask, a[0], a[1], b[0], b[1], width, value);
  }
}

function fillRect(mask, x, y, width, height, value = 255) {
  const minX = Math.max(0, Math.round(x));
  const maxX = Math.min(CELL_SIZE, Math.round(x + width));
  const minY = Math.max(0, Math.round(y));
  const maxY = Math.min(CELL_SIZE, Math.round(y + height));
  for (let py = minY; py < maxY; py += 1) {
    for (let px = minX; px < maxX; px += 1) setMask(mask, px, py, value);
  }
}

function pointInPolygon(x, y, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const xi = points[i][0];
    const yi = points[i][1];
    const xj = points[j][0];
    const yj = points[j][1];
    const crosses = ((yi > y) !== (yj > y))
      && (x < ((xj - xi) * (y - yi)) / ((yj - yi) || Number.EPSILON) + xi);
    if (crosses) inside = !inside;
  }
  return inside;
}

function fillPolygon(mask, points, value = 255) {
  const xs = points.map((point) => point[0]);
  const ys = points.map((point) => point[1]);
  const minX = Math.max(0, Math.floor(Math.min(...xs)));
  const maxX = Math.min(CELL_SIZE - 1, Math.ceil(Math.max(...xs)));
  const minY = Math.max(0, Math.floor(Math.min(...ys)));
  const maxY = Math.min(CELL_SIZE - 1, Math.ceil(Math.max(...ys)));
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      if (pointInPolygon(x + 0.5, y + 0.5, points)) setMask(mask, x, y, value);
    }
  }
}

function arc(mask, cx, cy, radius, startDeg, endDeg, width = 8, value = 255) {
  const span = endDeg - startDeg;
  const steps = Math.max(4, Math.ceil(Math.abs(span) * Math.PI * radius / 360));
  let previous = null;
  for (let i = 0; i <= steps; i += 1) {
    const angle = (startDeg + span * (i / steps)) * Math.PI / 180;
    const point = [cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius];
    if (previous) line(mask, previous[0], previous[1], point[0], point[1], width, value);
    previous = point;
  }
}

function ring(mask, cx, cy, radius, width = 8, value = 255) {
  arc(mask, cx, cy, radius, 0, 360, width, value);
}

function eraseDisk(mask, cx, cy, radius) {
  const minX = Math.max(0, Math.floor(cx - radius));
  const maxX = Math.min(CELL_SIZE - 1, Math.ceil(cx + radius));
  const minY = Math.max(0, Math.floor(cy - radius));
  const maxY = Math.min(CELL_SIZE - 1, Math.ceil(cy + radius));
  const radiusSq = radius * radius;
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= radiusSq) mask[y * CELL_SIZE + x] = 0;
    }
  }
}

function drawText(mask, text, x, y, scale = 5, spacing = 1) {
  let cursor = x;
  for (const char of text) {
    const glyph = GLYPHS[char];
    if (!glyph) throw new Error(`Unsupported marking glyph: ${char}`);
    for (let row = 0; row < glyph.length; row += 1) {
      for (let column = 0; column < glyph[row].length; column += 1) {
        if (glyph[row][column] === '1') {
          fillRect(mask, cursor + column * scale, y + row * scale, scale, scale);
        }
      }
    }
    cursor += (5 + spacing) * scale;
  }
}

function drawCenteredText(mask, text, y, scale = 5, spacing = 1) {
  const width = (text.length * 5 + Math.max(0, text.length - 1) * spacing) * scale;
  drawText(mask, text, Math.round((CELL_SIZE - width) / 2), y, scale, spacing);
}

function drawBracket(mask, x, y, width, height, stroke = 9) {
  line(mask, x, y, x + width * 0.45, y, stroke);
  line(mask, x, y, x, y + height, stroke);
  line(mask, x, y + height, x + width * 0.45, y + height, stroke);
}

function drawMotif(slotId) {
  const paint = makeMask();
  const emissive = makeMask();
  switch (slotId) {
    case 'free_broken_clock':
      arc(paint, 128, 128, 76, -70, 54, 13);
      arc(paint, 128, 128, 76, 92, 212, 13);
      arc(paint, 128, 128, 76, 246, 276, 13);
      line(paint, 128, 128, 96, 80, 11);
      line(paint, 128, 128, 169, 116, 9);
      disk(paint, 128, 128, 12);
      break;
    case 'free_ghost_mark':
      fillPolygon(paint, [[76, 190], [82, 83], [98, 57], [128, 42], [158, 57], [174, 83], [180, 190],
        [160, 173], [144, 193], [128, 174], [112, 194], [94, 174]]);
      eraseDisk(paint, 108, 105, 9);
      eraseDisk(paint, 148, 105, 9);
      line(paint, 94, 139, 112, 150, 7);
      line(paint, 144, 150, 162, 139, 7);
      break;
    case 'free_tally_thirteen':
      for (let group = 0; group < 2; group += 1) {
        const start = 42 + group * 86;
        for (let i = 0; i < 4; i += 1) line(paint, start + i * 15, 70, start + i * 15, 177, 8);
        line(paint, start - 7, 162, start + 52, 84, 8);
      }
      for (let i = 0; i < 3; i += 1) line(paint, 204 + i * 13, 88, 204 + i * 13, 168, 7);
      break;
    case 'free_severed_chain':
      arc(paint, 92, 128, 45, 38, 322, 14);
      arc(paint, 164, 128, 45, 218, 502, 14);
      line(paint, 107, 101, 149, 155, 14);
      line(paint, 110, 158, 147, 98, 14);
      eraseDisk(paint, 128, 128, 17);
      break;
    case 'quiet_occluded_eye':
      polyline(paint, [[40, 128], [80, 86], [128, 73], [176, 86], [216, 128], [176, 170], [128, 183], [80, 170], [40, 128]], 12);
      ring(paint, 128, 128, 31, 11);
      line(paint, 61, 194, 198, 57, 18);
      break;
    case 'quiet_folded_route':
      polyline(paint, [[43, 171], [76, 72], [112, 156], [148, 85], [210, 170]], 14);
      for (const [x, y] of [[43, 171], [76, 72], [112, 156], [148, 85], [210, 170]]) disk(paint, x, y, 14);
      line(paint, 112, 156, 151, 182, 8);
      break;
    case 'quiet_cut_signal':
      arc(paint, 128, 128, 34, -55, 55, 10);
      arc(paint, 128, 128, 67, -48, 48, 10);
      arc(paint, 128, 128, 100, -42, 42, 10);
      arc(paint, 128, 128, 34, 125, 235, 10);
      arc(paint, 128, 128, 67, 132, 228, 10);
      arc(paint, 128, 128, 100, 138, 222, 10);
      arc(emissive, 128, 128, 34, -55, 55, 7);
      arc(emissive, 128, 128, 67, -48, 48, 7);
      arc(emissive, 128, 128, 100, -42, 42, 7);
      arc(emissive, 128, 128, 34, 125, 235, 7);
      arc(emissive, 128, 128, 67, 132, 228, 7);
      arc(emissive, 128, 128, 100, 138, 222, 7);
      line(paint, 54, 54, 202, 202, 16);
      break;
    case 'quiet_keyhole':
      ring(paint, 128, 99, 48, 14);
      fillPolygon(paint, [[113, 130], [143, 130], [164, 197], [92, 197]]);
      eraseDisk(paint, 128, 99, 25);
      break;
    case 'mts_ledger_orbit':
      ring(paint, 128, 128, 87, 8);
      ring(paint, 128, 128, 53, 8);
      disk(paint, 128, 128, 16);
      for (const angle of [12, 102, 192, 282]) {
        const radians = angle * Math.PI / 180;
        disk(paint, 128 + Math.cos(radians) * 87, 128 + Math.sin(radians) * 87, 11);
      }
      emissive.set(paint);
      break;
    case 'mts_counterfeit_seal':
      polyline(paint, [[128, 39], [208, 128], [128, 217], [48, 128], [128, 39]], 13);
      polyline(paint, [[128, 78], [172, 128], [128, 178], [84, 128], [128, 78]], 9);
      eraseDisk(paint, 188, 103, 18);
      line(paint, 181, 86, 211, 111, 8);
      break;
    case 'scn_custody_brackets':
      drawBracket(paint, 45, 59, 47, 138, 12);
      drawBracket(paint, 211, 59, -47, 138, 12);
      ring(paint, 128, 128, 31, 9);
      disk(paint, 128, 128, 8);
      emissive.set(paint);
      break;
    case 'scn_rescue_corridor':
      polyline(paint, [[42, 128], [83, 83], [83, 111], [173, 111], [173, 83], [214, 128],
        [173, 173], [173, 145], [83, 145], [83, 173], [42, 128]], 12);
      line(paint, 106, 128, 150, 128, 10);
      emissive.set(paint);
      break;
    case 'dmc_drill_tooth':
      fillPolygon(paint, [[47, 146], [81, 92], [169, 55], [205, 86], [166, 120], [209, 147], [158, 176], [82, 185]]);
      for (let i = 0; i < 5; i += 1) line(paint, 78 + i * 25, 91 + i * 6, 94 + i * 25, 168 - i * 4, 7);
      break;
    case 'dmc_pressure_warning':
      polyline(paint, [[128, 40], [215, 201], [41, 201], [128, 40]], 13);
      line(paint, 128, 88, 128, 148, 16);
      disk(paint, 128, 176, 10);
      break;
    case 'reach_boarding_hook':
      line(paint, 52, 177, 154, 75, 18);
      arc(paint, 159, 111, 52, -84, 116, 18);
      line(paint, 56, 171, 36, 153, 14);
      line(paint, 67, 183, 49, 202, 14);
      break;
    case 'pitborn_weld_scar': {
      const points = [[36, 132], [65, 122], [87, 141], [111, 112], [139, 145], [164, 119], [189, 137], [220, 125]];
      polyline(paint, points, 18);
      polyline(emissive, points, 7);
      for (let i = 1; i < points.length - 1; i += 2) disk(emissive, points[i][0], points[i][1], 9);
      break;
    }
    case 'serial_bt_13':
      drawCenteredText(paint, 'BT-13', 101, 7, 1);
      break;
    case 'serial_mts_47b':
      drawCenteredText(paint, 'MTS-47B', 107, 5, 1);
      break;
    case 'dock_07':
      drawCenteredText(paint, 'DOCK', 67, 7, 1);
      drawCenteredText(paint, '07', 133, 10, 1);
      break;
    case 'shaft_s7':
      drawCenteredText(paint, 'SHAFT', 73, 6, 1);
      drawCenteredText(paint, 'S7', 137, 10, 1);
      break;
    case 'maintenance_fuel':
      ring(paint, 128, 117, 62, 11);
      line(paint, 128, 55, 128, 82, 10);
      line(paint, 128, 152, 128, 179, 10);
      line(paint, 66, 117, 93, 117, 10);
      line(paint, 163, 117, 190, 117, 10);
      drawCenteredText(paint, 'FUEL', 194, 5, 1);
      break;
    case 'maintenance_tow':
      drawBracket(paint, 49, 49, 48, 126, 9);
      drawBracket(paint, 207, 49, -48, 126, 9);
      ring(paint, 128, 112, 37, 10);
      drawCenteredText(paint, 'TOW', 184, 6, 1);
      break;
    case 'hazard_chevrons':
      for (let i = 0; i < 4; i += 1) {
        const x = 31 + i * 51;
        fillPolygon(paint, [[x, 48], [x + 22, 48], [x + 55, 128], [x + 22, 208], [x, 208], [x + 33, 128]]);
      }
      break;
    case 'hazard_pressure':
      fillRect(paint, 39, 50, 178, 156);
      eraseDisk(paint, 128, 128, 54);
      ring(paint, 128, 128, 52, 12);
      line(paint, 128, 86, 128, 133, 13);
      disk(paint, 128, 159, 9);
      for (const [x, y] of [[51, 62], [205, 62], [51, 194], [205, 194]]) eraseDisk(paint, x, y, 7);
      break;
    case 'runlight_cyan':
    case 'runlight_amber':
      fillRect(paint, 39, 78, 178, 100);
      for (let i = 0; i < 5; i += 1) {
        fillRect(emissive, 55 + i * 33, 95, 18, 66);
        disk(paint, 64 + i * 33, 128, 16);
      }
      break;
    case 'rescue_lane_emissive':
      polyline(paint, [[37, 128], [86, 79], [86, 106], [170, 106], [170, 79], [219, 128],
        [170, 177], [170, 150], [86, 150], [86, 177], [37, 128]], 15);
      line(emissive, 52, 128, 204, 128, 13);
      disk(emissive, 52, 128, 11);
      disk(emissive, 204, 128, 11);
      break;
    case 'custody_pulse_emissive':
      drawBracket(paint, 44, 53, 48, 150, 10);
      drawBracket(paint, 212, 53, -48, 150, 10);
      ring(paint, 128, 128, 48, 10);
      ring(emissive, 128, 128, 37, 11);
      disk(emissive, 128, 128, 9);
      break;
    case 'quiet_transponder_emissive':
      for (const radius of [30, 58, 86]) {
        arc(paint, 128, 128, radius, 138, 222, 10);
        arc(paint, 128, 128, radius, -42, 42, 10);
        arc(emissive, 128, 128, radius, 138, 222, 7);
        arc(emissive, 128, 128, radius, -42, 42, 7);
      }
      line(paint, 61, 61, 195, 195, 15);
      break;
    case 'counterfeit_beacon_emissive':
      polyline(paint, [[128, 39], [207, 128], [128, 217], [49, 128], [128, 39]], 12);
      ring(paint, 128, 128, 38, 9);
      fillRect(emissive, 91, 119, 18, 18);
      fillRect(emissive, 121, 119, 11, 18);
      fillRect(emissive, 146, 119, 29, 18);
      break;
    case 'pitborn_weld_hot': {
      const points = [[39, 145], [74, 119], [104, 139], [137, 104], [166, 144], [217, 119]];
      polyline(paint, points, 19);
      polyline(emissive, points, 7);
      for (const point of points.slice(1, -1)) disk(emissive, point[0], point[1], 8);
      break;
    }
    case 'archive_record_lamp':
      polyline(paint, [[66, 54], [190, 54], [190, 202], [66, 202], [66, 54]], 10);
      ring(paint, 128, 128, 49, 9);
      ring(emissive, 128, 128, 32, 8);
      disk(emissive, 128, 128, 10);
      line(paint, 87, 76, 169, 76, 7);
      line(paint, 87, 180, 169, 180, 7);
      break;
    default:
      throw new Error(`No drawing recipe for ${slotId}`);
  }
  return { paint, emissive };
}

function hash32(text) {
  const digest = crypto.createHash('sha256').update(text).digest();
  return digest.readUInt32LE(0);
}

function xorshift(seed) {
  let state = seed || 0x9E3779B9;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x100000000;
  };
}

function applyWear(mask, slotDef) {
  if (slotDef.wear <= 0) return;
  const random = xorshift(hash32(slotDef.id));
  const chipCount = Math.round(4 + slotDef.wear * 90);
  for (let i = 0; i < chipCount; i += 1) {
    const x = 28 + random() * 200;
    const y = 28 + random() * 200;
    const radius = 1.5 + random() * (2 + slotDef.wear * 12);
    eraseDisk(mask, x, y, radius);
  }
}

function parseHex(hex) {
  const value = Number.parseInt(hex.replace('#', ''), 16);
  return [(value >> 16) & 0xFF, (value >> 8) & 0xFF, value & 0xFF];
}

function blendPixel(png, x, y, color, alpha) {
  if (x < 0 || y < 0 || x >= png.width || y >= png.height || alpha <= 0) return;
  const offset = (y * png.width + x) * 4;
  const sourceAlpha = Math.min(255, alpha) / 255;
  const destAlpha = png.data[offset + 3] / 255;
  const outAlpha = sourceAlpha + destAlpha * (1 - sourceAlpha);
  if (outAlpha <= 0) return;
  for (let channel = 0; channel < 3; channel += 1) {
    const source = color[channel] / 255;
    const dest = png.data[offset + channel] / 255;
    png.data[offset + channel] = Math.round(
      ((source * sourceAlpha) + (dest * destAlpha * (1 - sourceAlpha))) / outAlpha * 255,
    );
  }
  png.data[offset + 3] = Math.round(outAlpha * 255);
}

function paintMask(png, mask, originX, originY, color, alphaScale = 1, offsetX = 0, offsetY = 0) {
  for (let y = 0; y < CELL_SIZE; y += 1) {
    for (let x = 0; x < CELL_SIZE; x += 1) {
      const alpha = mask[y * CELL_SIZE + x];
      if (alpha === 0) continue;
      blendPixel(
        png,
        originX + x + offsetX,
        originY + y + offsetY,
        color,
        Math.round(alpha * alphaScale),
      );
    }
  }
}

function dilate(mask, radius = 2) {
  const output = makeMask();
  for (let y = 0; y < CELL_SIZE; y += 1) {
    for (let x = 0; x < CELL_SIZE; x += 1) {
      if (mask[y * CELL_SIZE + x] === 0) continue;
      disk(output, x, y, radius, 255);
    }
  }
  return output;
}

function pngBuffer(png) {
  return PNG.sync.write(png, {
    colorType: 6,
    inputColorType: 6,
    inputHasAlpha: true,
    deflateLevel: 9,
    deflateStrategy: 3,
  });
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function countCoverage(mask) {
  let count = 0;
  for (const value of mask) if (value > 0) count += 1;
  return count;
}

export function buildSpacepunkMarkingsAtlas() {
  if (MARKING_SLOTS.length !== ATLAS_COLUMNS * ATLAS_ROWS) {
    throw new Error(`Expected ${ATLAS_COLUMNS * ATLAS_ROWS} marking slots, got ${MARKING_SLOTS.length}`);
  }

  const base = new PNG({ width: ATLAS_WIDTH, height: ATLAS_HEIGHT, colorType: 6 });
  const emissive = new PNG({ width: ATLAS_WIDTH, height: ATLAS_HEIGHT, colorType: 6 });
  base.data.fill(0);
  emissive.data.fill(0);

  const cells = [];
  for (let index = 0; index < MARKING_SLOTS.length; index += 1) {
    const definition = MARKING_SLOTS[index];
    const column = index % ATLAS_COLUMNS;
    const row = Math.floor(index / ATLAS_COLUMNS);
    const x = column * CELL_SIZE;
    const y = row * CELL_SIZE;
    const { paint, emissive: emissiveMask } = drawMotif(definition.id);
    applyWear(paint, definition);

    const baseColor = parseHex(definition.baseColor);
    const haloColor = baseColor.map((channel) => Math.max(0, Math.round(channel * 0.55)));
    const halo = dilate(paint, definition.group === 'serial' ? 1 : 2);
    paintMask(base, halo, x, y, haloColor, definition.group === 'identity' ? 0.16 : 0.08, 1, 1);
    paintMask(base, paint, x, y, baseColor, 1);

    if (definition.emissiveColor) {
      const activeMask = countCoverage(emissiveMask) > 0 ? emissiveMask : cloneMask(paint);
      const emissionColor = parseHex(definition.emissiveColor);
      paintMask(emissive, dilate(activeMask, 2), x, y, emissionColor, 0.18);
      paintMask(emissive, activeMask, x, y, emissionColor, 1);
    }

    cells.push({
      id: definition.id,
      index,
      group: definition.group,
      factionId: definition.factionId,
      story: definition.story,
      pixelRect: { x, y, width: CELL_SIZE, height: CELL_SIZE },
      normalizedImageRect: {
        origin: 'image-top-left',
        u0: x / ATLAS_WIDTH,
        v0: y / ATLAS_HEIGHT,
        u1: (x + CELL_SIZE) / ATLAS_WIDTH,
        v1: (y + CELL_SIZE) / ATLAS_HEIGHT,
      },
      channels: {
        baseColor: true,
        emissive: definition.emissiveColor != null,
        alpha: 'coverage',
      },
      authoredBaseColor: definition.baseColor,
      authoredEmissiveColor: definition.emissiveColor,
      wear: definition.wear,
      coveragePixels: countCoverage(paint),
      emissiveCoveragePixels: countCoverage(emissiveMask),
    });
  }

  const baseColorBuffer = pngBuffer(base);
  const emissiveBuffer = pngBuffer(emissive);
  const metadata = {
    schemaVersion: 1,
    id: 'spacepunk_markings_v1',
    status: 'authoring-source-only',
    runtimeWired: false,
    generatedBy: 'tools/art/build_spacepunk_markings_atlas.mjs',
    conceptReference: 'assets/concept/factions/spacepunk_markings_motif_study_v1.png',
    artDirectionSources: [
      'src/data/palettes.js#PAINT_PROFILES',
      'src/data/palettes.js#PLAYER_NOSE_ART',
      'src/data/flavor/030-graffiti.js',
    ],
    dimensions: { width: ATLAS_WIDTH, height: ATLAS_HEIGHT },
    grid: { columns: ATLAS_COLUMNS, rows: ATLAS_ROWS, cellSize: CELL_SIZE },
    images: {
      baseColor: {
        path: 'markings_basecolor.png',
        colorSpace: 'srgb',
        alpha: 'coverage',
        sha256: sha256(baseColorBuffer),
      },
      emissive: {
        path: 'markings_emissive.png',
        colorSpace: 'srgb',
        alpha: 'coverage',
        sha256: sha256(emissiveBuffer),
      },
    },
    integrationContract: {
      exactTextAuthoredConventionally: true,
      generatedPixelsUsedDirectly: false,
      glbIntegrationRequired: true,
      ktx2ReleaseRequired: true,
      representativeRuntimeReviewRequired: true,
      note: 'Choose exact cells per ship/faction. Do not apply every marking to every hull.',
    },
    cells,
  };
  const metadataBuffer = Buffer.from(`${JSON.stringify(metadata, null, 2)}\n`, 'utf8');
  return { baseColorBuffer, emissiveBuffer, metadataBuffer, metadata };
}

async function writeIfChanged(filePath, buffer) {
  let prior = null;
  try {
    prior = await fs.readFile(filePath);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (prior?.equals(buffer)) return false;
  await fs.writeFile(filePath, buffer);
  return true;
}

export async function writeSpacepunkMarkingsAtlas(outputDir = DEFAULT_OUTPUT_DIR) {
  const built = buildSpacepunkMarkingsAtlas();
  await fs.mkdir(outputDir, { recursive: true });
  const outputs = [
    ['markings_basecolor.png', built.baseColorBuffer],
    ['markings_emissive.png', built.emissiveBuffer],
    ['markings_atlas.json', built.metadataBuffer],
  ];
  const changed = [];
  for (const [name, buffer] of outputs) {
    if (await writeIfChanged(path.join(outputDir, name), buffer)) changed.push(name);
  }
  return { ...built, outputDir, changed };
}

export async function checkSpacepunkMarkingsAtlas(outputDir = DEFAULT_OUTPUT_DIR) {
  const built = buildSpacepunkMarkingsAtlas();
  const expected = [
    ['markings_basecolor.png', built.baseColorBuffer],
    ['markings_emissive.png', built.emissiveBuffer],
    ['markings_atlas.json', built.metadataBuffer],
  ];
  const mismatches = [];
  for (const [name, buffer] of expected) {
    let actual = null;
    try {
      actual = await fs.readFile(path.join(outputDir, name));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    if (!actual?.equals(buffer)) mismatches.push(name);
  }
  return { ok: mismatches.length === 0, mismatches, metadata: built.metadata };
}

function parseArgs(argv) {
  const result = { outputDir: DEFAULT_OUTPUT_DIR, check: false };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--check') result.check = true;
    else if (argv[index] === '--out-dir') {
      index += 1;
      if (!argv[index]) throw new Error('--out-dir requires a path');
      result.outputDir = path.resolve(argv[index]);
    } else throw new Error(`Unknown argument: ${argv[index]}`);
  }
  return result;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.check) {
    const result = await checkSpacepunkMarkingsAtlas(args.outputDir);
    if (!result.ok) {
      console.error(`spacepunk-markings: stale or missing outputs: ${result.mismatches.join(', ')}`);
      process.exitCode = 1;
      return;
    }
    console.log(`spacepunk-markings: PASS (${MARKING_SLOTS.length} cells, deterministic outputs current)`);
    return;
  }
  const result = await writeSpacepunkMarkingsAtlas(args.outputDir);
  console.log(
    `spacepunk-markings: wrote ${MARKING_SLOTS.length} cells to ${result.outputDir}`
    + ` (${result.changed.length ? `changed ${result.changed.join(', ')}` : 'already current'})`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  await main();
}
