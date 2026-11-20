// Tekstur prosedural berbasis canvas (tanpa aset eksternal)
import * as THREE from 'three';
import { mulberry32, fbm } from './noise.js';

function canvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return [c, c.getContext('2d')];
}

function toTexture(c, repeat = 1, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Normal map dari kanal luminance canvas (Sobel)
export function normalFrom(c, strength = 2, repeat = 1) {
  const s = c.width, src = c.getContext('2d').getImageData(0, 0, s, s).data;
  const [n, nctx] = canvas(s);
  const out = nctx.createImageData(s, s);
  const h = (x, y) => src[(((y + s) % s) * s + ((x + s) % s)) * 4] / 255;
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const dx = (h(x + 1, y) - h(x - 1, y)) * strength;
    const dy = (h(x, y + 1) - h(x, y - 1)) * strength;
    const len = Math.hypot(dx, dy, 1);
    const i = (y * s + x) * 4;
    out.data[i] = (-dx / len * 0.5 + 0.5) * 255;
    out.data[i + 1] = (-dy / len * 0.5 + 0.5) * 255;
    out.data[i + 2] = (1 / len * 0.5 + 0.5) * 255;
    out.data[i + 3] = 255;
  }
  nctx.putImageData(out, 0, 0);
  return toTexture(n, repeat, false);
}

function noiseFill(ctx, s, fn) {
  const img = ctx.createImageData(s, s);
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const [r, g, b] = fn(x, y);
    const i = (y * s + x) * 4;
    img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}

// Detail tanah (grayscale, dikalikan vertex color)
export function groundDetail() {
  const s = 256, [c, ctx] = canvas(s), r = mulberry32(7);
  noiseFill(ctx, s, (x, y) => {
    const tile = (fx, fy) => fbm(fx, fy, 4); // tileable kasar via sin wrap
    const u = x / s * Math.PI * 2, v = y / s * Math.PI * 2;
    const n = tile(Math.cos(u) * 2 + 10, Math.sin(u) * 2 + Math.cos(v) * 2) * 0.5 + 0.5;
    const g = 200 + n * 45 + (r() - 0.5) * 30;
    return [g, g, g];
  });
  // goresan rumput halus
  ctx.globalAlpha = 0.25;
  for (let i = 0; i < 1800; i++) {
    const x = r() * s, y = r() * s, l = 2 + r() * 5;
    ctx.strokeStyle = r() > 0.5 ? '#fff' : '#555';
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (r() - 0.5) * 2, y - l); ctx.stroke();
  }
  return c;
}

export function barkTexture() {
  const s = 128, [c, ctx] = canvas(s), r = mulberry32(3);
  ctx.fillStyle = '#7a6a5a'; ctx.fillRect(0, 0, s, s);
  for (let i = 0; i < 90; i++) {
    const x = r() * s, w = 1 + r() * 3;
    ctx.fillStyle = `rgba(${30 + r() * 40},${25 + r() * 30},${20 + r() * 20},${0.4 + r() * 0.5})`;
    ctx.fillRect(x, 0, w, s);
  }
  return c;
}

export function woodPlanks() {
  const s = 256, [c, ctx] = canvas(s), r = mulberry32(11);
  const rows = 8;
  for (let i = 0; i < rows; i++) {
    const base = 90 + r() * 40;
    ctx.fillStyle = `rgb(${base},${base * 0.72},${base * 0.5})`;
    ctx.fillRect(0, i * s / rows, s, s / rows);
    for (let k = 0; k < 40; k++) {
      ctx.strokeStyle = `rgba(40,25,15,${0.15 + r() * 0.2})`;
      const y = i * s / rows + r() * s / rows;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.bezierCurveTo(s * 0.3, y + r() * 4 - 2, s * 0.6, y + r() * 4 - 2, s, y); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(20,12,6,0.85)';
    ctx.fillRect(0, i * s / rows, s, 2);
  }
  return c;
}

export function roofShingles() {
  const s = 256, [c, ctx] = canvas(s), r = mulberry32(5);
  ctx.fillStyle = '#2b2622'; ctx.fillRect(0, 0, s, s);
  const rows = 12, cols = 8;
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols + 1; x++) {
    const off = (y % 2) * (s / cols / 2);
    const v = 45 + r() * 35;
    ctx.fillStyle = `rgb(${v},${v * 0.85},${v * 0.75})`;
    ctx.fillRect(x * s / cols - off, y * s / rows, s / cols - 2, s / rows - 2);
  }
  return c;
}

export function furTexture(base = [70, 60, 52]) {
  const s = 256, [c, ctx] = canvas(s), r = mulberry32(21);
  ctx.fillStyle = `rgb(${base.join(',')})`; ctx.fillRect(0, 0, s, s);
  for (let i = 0; i < 9000; i++) {
    const x = r() * s, y = r() * s, l = 3 + r() * 8, a = -Math.PI / 2 + (r() - 0.5) * 0.6;
    const v = (r() - 0.5) * 70;
    ctx.strokeStyle = `rgba(${base[0] + v},${base[1] + v},${base[2] + v},0.6)`;
    ctx.lineWidth = 0.6 + r();
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); ctx.stroke();
  }
  return c;
}

export function clothTexture(base = [60, 40, 35]) {
  const s = 128, [c, ctx] = canvas(s), r = mulberry32(31);
  noiseFill(ctx, s, (x, y) => {
    const weave = ((x % 4 < 2) ^ (y % 4 < 2)) ? 8 : -8;
    const n = (r() - 0.5) * 22 + weave;
    return [base[0] + n, base[1] + n, base[2] + n];
  });
  return c;
}

export function rockTexture() {
  const s = 256, [c, ctx] = canvas(s), r = mulberry32(41);
  noiseFill(ctx, s, (x, y) => {
    const u = x / s * Math.PI * 2, v = y / s * Math.PI * 2;
    const n = fbm(Math.cos(u) * 1.5 + 40, Math.sin(u) * 1.5 + Math.cos(v) * 1.5 + Math.sin(v), 6) * 0.5 + 0.5;
    const g = 70 + n * 110 + (r() - 0.5) * 20;
    return [g, g * 0.98, g * 0.95];
  });
  return c;
}

export function moonTexture() {
  const s = 256, [c, ctx] = canvas(s), r = mulberry32(51);
  noiseFill(ctx, s, (x, y) => {
    const n = fbm(x / 50 + 3, y / 50 + 7, 5) * 0.5 + 0.5;
    const g = 190 + n * 60;
    return [g, g, g * 1.02];
  });
  for (let i = 0; i < 40; i++) {
    const x = r() * s, y = r() * s, rad = 3 + r() * 18;
    const grd = ctx.createRadialGradient(x, y, rad * 0.2, x, y, rad);
    grd.addColorStop(0, 'rgba(120,120,130,0.55)'); grd.addColorStop(0.8, 'rgba(150,150,160,0.25)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill();
  }
  return c;
}

export function glowSprite(color = '255,220,160') {
  const s = 128, [c, ctx] = canvas(s);
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, `rgba(${color},1)`); g.addColorStop(0.25, `rgba(${color},0.6)`); g.addColorStop(1, `rgba(${color},0)`);
  ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export const tex = { canvas, toTexture };
