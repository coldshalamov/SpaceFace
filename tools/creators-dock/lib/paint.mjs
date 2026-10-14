import { actorStroke } from './inspector.mjs';
import { worldToScreen } from './scene.mjs';

function line(ctx, x0, y0, x1, y1) {
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
}

function arrow(ctx, x0, y0, x1, y1) {
  line(ctx, x0, y0, x1, y1);
  const angle = Math.atan2(y1 - y0, x1 - x0);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x1 - 8 * Math.cos(angle - 0.4), y1 - 8 * Math.sin(angle - 0.4));
  ctx.lineTo(x1 - 8 * Math.cos(angle + 0.4), y1 - 8 * Math.sin(angle + 0.4));
  ctx.closePath();
  ctx.fill();
}

export function drawActor(ctx, object, camera, view, draw, selected = false) {
  const point = worldToScreen(object.x || 0, object.z || 0, camera, view);
  const radius = actorStroke(object, camera && camera.zoom, draw);
  const color = object.isPlayer ? '#e2b15a' : object.role === 'hazard' || object.role === 'ghost' ? '#e07a6a' : '#7ec8c3';
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.globalAlpha = selected ? 1 : 0.9;
  ctx.beginPath();
  ctx.arc(point.sx, point.sy, radius, 0, Math.PI * 2);
  ctx.globalAlpha = 0.18;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.stroke();
  const heading = object.heading || 0;
  const nose = Math.max(18, radius) + 16;
  const hx = Math.cos(heading) * nose;
  const hz = Math.sin(heading) * nose;
  line(ctx, point.sx, point.sy, point.sx + hx, point.sy - hz);
  const vx = (object.velX || 0) * 2;
  const vz = (object.velZ || 0) * 2;
  if (vx || vz) {
    ctx.strokeStyle = '#f0d78c';
    arrow(ctx, point.sx, point.sy, point.sx + vx, point.sy - vz);
  }
  ctx.fillStyle = '#e7eef6';
  ctx.font = '12px Segoe UI, sans-serif';
  ctx.fillText(object.label || object.id, point.sx + 8, point.sy - Math.max(18, radius) - 6);
  ctx.restore();
}
