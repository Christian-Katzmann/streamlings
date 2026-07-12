// Eye-map builder: detects Momó's dot eyes per frame on designated gaze clips so the
// server can redraw pupils toward an inferred cursor. Line-art blob detection:
// connected ink components that are small, roundish, in the upper-middle of the frame,
// and come in a horizontal pair. Frames that fail detection get null (server falls
// back to the previous frame's eyes / skips gaze).
// Usage: node tools/eyemap.js  → assets/eyemap.json + assets/eyemap-preview/*.png
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const ASSETS = path.join(ROOT, 'assets');
const GAZE_CLIP_IDS = ['001', '021', '053', '062', '065', '070'];

const manifest = JSON.parse(fs.readFileSync(path.join(ASSETS, 'manifest.json'), 'utf8'));
const byId = Object.fromEntries(manifest.map(c => [c.id, c]));

function detectEyes(png) {
  const { width: W, height: H, data } = png;
  const ink = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
    if (0.299 * r + 0.587 * g + 0.114 * b < 90) ink[i] = 1;
  }
  const seen = new Uint8Array(W * H);
  const blobs = [];
  for (let start = 0; start < W * H; start++) {
    if (!ink[start] || seen[start]) continue;
    // BFS
    const stack = [start];
    seen[start] = 1;
    let n = 0, sx = 0, sy = 0, minX = W, maxX = 0, minY = H, maxY = 0;
    while (stack.length) {
      const i = stack.pop();
      const x = i % W, y = (i / W) | 0;
      n++; sx += x; sy += y;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      for (const d of [-1, 1, -W, W]) {
        const j = i + d;
        if (j < 0 || j >= W * H || seen[j] || !ink[j]) continue;
        if (d === -1 && x === 0) continue;
        if (d === 1 && x === W - 1) continue;
        seen[j] = 1; stack.push(j);
      }
      if (n > 400) break; // way too big to be an eye — bail early
    }
    if (n < 15 || n > 260) continue;
    const w = maxX - minX + 1, h = maxY - minY + 1;
    if (w / h < 0.5 || w / h > 2.0 || w > 26 || h > 26) continue;      // roundish, small
    const fill = n / (w * h);
    if (fill < 0.55) continue;                                          // filled dot, not an outline
    const cx = sx / n, cy = sy / n;
    if (cx < W * 0.22 || cx > W * 0.78 || cy < H * 0.15 || cy > H * 0.62) continue; // head region
    blobs.push({ cx, cy, n });
  }
  // find the best horizontal pair
  let best = null;
  for (let i = 0; i < blobs.length; i++) for (let j = i + 1; j < blobs.length; j++) {
    const a = blobs[i], b = blobs[j];
    const dy = Math.abs(a.cy - b.cy), dx = Math.abs(a.cx - b.cx);
    if (dy > 14 || dx < 18 || dx > 110) continue;
    const sizeRatio = Math.max(a.n, b.n) / Math.min(a.n, b.n);
    if (sizeRatio > 2.2) continue;
    const score = dy + Math.abs(dx - 55) / 4 + sizeRatio * 2;
    if (!best || score < best.score) {
      const [L, R] = a.cx < b.cx ? [a, b] : [b, a];
      best = { score, eyes: [Math.round(L.cx), Math.round(L.cy), Math.round(R.cx), Math.round(R.cy)] };
    }
  }
  return best?.eyes ?? null;
}

const eyemap = {};
const previewDir = path.join(ASSETS, 'eyemap-preview');
fs.mkdirSync(previewDir, { recursive: true });

for (const id of GAZE_CLIP_IDS) {
  const clip = byId[id];
  const dir = path.join(ASSETS, 'frames', clip.key);
  const files = fs.readdirSync(dir).sort();
  const perFrame = [];
  let detected = 0, last = null;
  files.forEach((f, idx) => {
    const png = PNG.sync.read(fs.readFileSync(path.join(dir, f)));
    const eyes = detectEyes(png);
    if (eyes) { detected++; last = eyes; perFrame.push(eyes); }
    else perFrame.push(last); // carry forward — head moves slowly in idle clips
    // preview crosshairs on 4 sample frames for visual QA
    if ([0, Math.floor(files.length / 3), Math.floor(2 * files.length / 3), files.length - 1].includes(idx) && (eyes || last)) {
      const [lx, ly, rx, ry] = eyes || last;
      for (const [ex, ey] of [[lx, ly], [rx, ry]]) {
        for (let d = -8; d <= 8; d++) {
          const set = (x, y) => { if (x >= 0 && x < png.width && y >= 0 && y < png.height) { const o = (y * png.width + x) * 4; png.data[o] = 255; png.data[o + 1] = 0; png.data[o + 2] = 0; } };
          set(ex + d, ey); set(ex, ey + d);
        }
      }
      fs.writeFileSync(path.join(previewDir, `${clip.key}_f${idx}.png`), PNG.sync.write(png));
    }
  });
  const rate = detected / files.length;
  console.log(`${clip.key}: ${detected}/${files.length} frames detected (${Math.round(rate * 100)}%)`);
  if (rate >= 0.6 && perFrame[0]) eyemap[id] = perFrame;
  else console.log(`  -> EXCLUDED (detection too weak)`);
}

fs.writeFileSync(path.join(ASSETS, 'eyemap.json'), JSON.stringify(eyemap));
console.log(`eyemap.json: ${Object.keys(eyemap).length} clips`);
