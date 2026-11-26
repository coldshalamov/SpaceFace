import { modelTruthRow, modelTruthRowForEntity } from '../../data/modelTruth.js';
import { fittedSocketLocal, placeDrawScaleFromRow, worldFromLocal } from '../../data/modelTruthMounts.js';
import { resolveCollisionProxyManifest, resolveCorridorAxisWorld } from '../../data/collisionProxyManifests.js';

const HUB_ID = 'place_station_trade_hub';
const TURN = Math.PI * 2;
const MOUTH = Math.PI / 12;
const HUB_RADIUS = 54;

export function tradeHubPlan(station) {
  const row = modelTruthRowForEntity(station)
    || (station.data?.collisionProxy === 'station_ring_hub' ? modelTruthRow(HUB_ID) : null);
  if (row?.id !== HUB_ID) return null;
  // Match the rendered station fit. The hull census proxy represents the collision slice,
  // while the plan reads the actual upper decks from forge/ships/place_station_trade_hub.py.
  const scale = placeDrawScaleFromRow(row, station);
  const manifest = resolveCollisionProxyManifest(station);
  if (!manifest?.docking) return null;
  // The renderer registers the model's measured mouth with this same corridor. The
  // plan's authored +X is already the mouth, so it starts in the corridor's own frame.
  const axis = resolveCorridorAxisWorld(station, manifest);
  const origin = worldFromLocal(station, fittedSocketLocal(row, station, [0, 0, 0]));
  const center = { x: origin.x + axis.x * 3 * scale, z: origin.z + axis.z * 3 * scale };
  return { center, scale, radius: HUB_RADIUS * scale, heading: axis.bearingRad };
}

function ring(ctx, inner, outer, start, end, fill) {
  ctx.beginPath();
  ctx.arc(0, 0, outer, start, end);
  ctx.arc(0, 0, inner, end, start, true);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.stroke();
}

export function drawTradeHubPlan(ctx, plan, at, pixelsPerUnit, chartRotation) {
  const zoom = plan.scale * pixelsPerUnit;
  const radiusPx = HUB_RADIUS * zoom;
  if (radiusPx < 11) return;
  ctx.save();
  ctx.strokeStyle = 'rgba(135,191,209,.19)';
  ctx.lineWidth = .65;
  const contour = Math.max(25, 25 * Math.ceil(21 / (25 * pixelsPerUnit)));
  for (let i = 0; i < 5; i += 1) {
    const r = (Math.ceil(plan.radius / contour) + i) * contour * pixelsPerUnit;
    ctx.beginPath();
    ctx.arc(at.x, at.y, r, 0, TURN);
    ctx.stroke();
  }
  ctx.translate(at.x, at.y);
  ctx.rotate(plan.heading + chartRotation + Math.PI);
  ctx.scale(zoom, zoom);
  ctx.lineJoin = 'round';
  ctx.lineWidth = .9 / zoom;
  ctx.strokeStyle = 'rgba(171,211,225,.57)';
  const deck = (x, z, w, h, fill) => {
    ctx.fillStyle = fill;
    ctx.fillRect(x, z, w, h);
    ctx.strokeRect(x, z, w, h);
  };
  for (const angle of [45, 135, 225, 315]) {
    ctx.save();
    ctx.rotate(angle * Math.PI / 180);
    deck(50, -1.8, 18.5, 3.6, 'rgba(88,134,158,.32)');
    deck(68, -3.5, 7, 7, 'rgba(102,156,176,.40)');
    ctx.restore();
  }
  ring(ctx, 16, 41, 0, TURN, 'rgba(67,113,138,.21)');
  for (const heading of [Math.PI / 2, Math.PI, -Math.PI / 2]) {
    ctx.save();
    ctx.rotate(heading);
    deck(12, -4.2, 26, 8.4, 'rgba(123,170,190,.38)');
    ctx.restore();
  }
  deck(16, -2.3, 38.5, 4.6, 'rgba(116,164,181,.41)');
  deck(54.5, -4.4, 3.5, 8.8, 'rgba(98,162,174,.48)');
  ring(ctx, 37, 54, MOUTH, TURN - MOUTH, 'rgba(106,151,177,.45)');
  if (radiusPx > 35) {
    const segment = (TURN - 2 * MOUTH) / 22;
    ctx.lineWidth = .58 / zoom;
    for (let roof = 0; roof < 22; roof += 1) {
      const start = MOUTH + roof * segment + Math.PI / 180;
      const end = start + segment - Math.PI / 90;
      ring(ctx, 38.2, 50.4, start, end, roof % 4 === 1 ? 'rgba(83,176,181,.30)' : 'rgba(138,177,194,.32)');
    }
  }
  deck(-60, -30, 17, 60, 'rgba(106,151,177,.46)');
  ctx.lineWidth = .9 / zoom;
  ctx.beginPath();
  ctx.arc(0, 0, 15.2, 0, TURN);
  ctx.fillStyle = 'rgba(123,170,190,.41)';
  ctx.fill();
  ctx.stroke();
  if (radiusPx > 35) ring(ctx, 9, 11.5, 0, TURN, 'rgba(152,195,207,.25)');
  ctx.restore();
}
