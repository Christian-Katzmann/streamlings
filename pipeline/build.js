// Streamlings asset pipeline: private mascot clips -> frame library + shared palette + glyph atlas.
// Usage: ASSET_DIR=~/Dev/Projects/momó/pet node pipeline/build.js
// The shared palette doubles as cream-normalization: slight background drift between
// AI-generated clips collapses into the same palette bucket at quantization time.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { PNG } from 'pngjs';
import gifencMod from 'gifenc';
let gifenc = gifencMod;
while (gifenc && !(gifenc.GIFEncoder && gifenc.quantize)) gifenc = gifenc.default;
const { GIFEncoder, quantize, applyPalette } = gifenc;

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const ASSET_DIR = (process.env.ASSET_DIR || path.join(os.homedir(), 'Dev/Projects/momó/pet')).replace(/^~/, os.homedir());
const OUT = path.join(ROOT, 'assets');
const FPS = 12;
const SIZE = 400;
const PALETTE_COLORS = 24;
const FONT = process.env.FONTFILE || '/System/Library/Fonts/Supplemental/Bradley Hand Bold.ttf';

const catalog = JSON.parse(fs.readFileSync(path.join(ASSET_DIR, 'catalog.json'), 'utf8'));
fs.mkdirSync(path.join(OUT, 'frames'), { recursive: true });
fs.mkdirSync(path.join(OUT, 'glyphs'), { recursive: true });

// ---- 1. extract frames ------------------------------------------------------
console.log(`extracting ${catalog.length} clips @ ${FPS}fps ${SIZE}px ...`);
for (const clip of catalog) {
  const key = `${clip.id}_${clip.name}`;
  const dir = path.join(OUT, 'frames', key);
  if (fs.existsSync(dir) && fs.readdirSync(dir).length > 0) continue; // resumable
  fs.mkdirSync(dir, { recursive: true });
  const src = path.join(ASSET_DIR, 'clips', `${key}.mp4`);
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', src,
    '-vf', `fps=${FPS},scale=${SIZE}:${SIZE}`,
    path.join(dir, 'f_%04d.png')]);
  process.stdout.write('.');
}
console.log(' done');

// ---- 2. shared palette ------------------------------------------------------
console.log('building shared palette ...');
const samples = [];
for (let i = 0; i < catalog.length; i += 7) { // every 7th clip, middle frame
  const key = `${catalog[i].id}_${catalog[i].name}`;
  const dir = path.join(OUT, 'frames', key);
  const files = fs.readdirSync(dir).sort();
  const png = PNG.sync.read(fs.readFileSync(path.join(dir, files[Math.floor(files.length / 2)])));
  for (let p = 0; p < png.data.length; p += 16) samples.push(png.data[p], png.data[p + 1], png.data[p + 2], 255);
}
const palette = quantize(new Uint8ClampedArray(samples), PALETTE_COLORS);
// identify ink (darkest) and paper (lightest) indices for the compositor
const lum = c => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
let ink = 0, paper = 0;
palette.forEach((c, i) => {
  if (lum(c) < lum(palette[ink])) ink = i;
  if (lum(c) > lum(palette[paper])) paper = i;
});
fs.writeFileSync(path.join(OUT, 'palette.json'), JSON.stringify({ palette, ink, paper }));
console.log(`palette: ${palette.length} colors, ink=${ink} ${JSON.stringify(palette[ink])}, paper=${paper} ${JSON.stringify(palette[paper])}`);

// ---- 3. manifest ------------------------------------------------------------
const manifest = catalog.map(clip => {
  const key = `${clip.id}_${clip.name}`;
  const frames = fs.readdirSync(path.join(OUT, 'frames', key)).filter(f => f.endsWith('.png')).length;
  return { key, frames, fps: FPS, ...clip };
});
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1));
console.log(`manifest: ${manifest.length} clips, ${manifest.reduce((a, c) => a + c.frames, 0)} frames total`);

// ---- 4. glyph atlas (speech bubble font) -------------------------------------
console.log('rendering glyph atlas ...');
const CHARS = `ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.,!?@:#'-+*()♥`;
const glyphMeta = {};
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'glyph-'));
for (const ch of CHARS) {
  const code = ch.codePointAt(0);
  const txt = path.join(tmp, 'c.txt');
  fs.writeFileSync(txt, ch);
  const raw = path.join(tmp, `g.png`);
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', `color=white@0.0:s=64x44,format=rgba`,
    '-vf', `drawtext=fontfile=${FONT}:textfile=${txt}:fontcolor=black:fontsize=30:x=6:y=4`,
    '-frames:v', '1', raw]);
  // trim horizontally only — full height keeps every glyph on the shared baseline
  const png = PNG.sync.read(fs.readFileSync(raw));
  let minX = png.width, maxX = -1;
  for (let y = 0; y < png.height; y++) for (let x = 0; x < png.width; x++) {
    if (png.data[(y * png.width + x) * 4 + 3] > 40) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
    }
  }
  if (maxX < 0) { glyphMeta[code] = { w: 9, h: 0, space: true }; continue; } // shouldn't happen for CHARS
  const gw = maxX - minX + 1;
  const out = new PNG({ width: gw, height: png.height });
  PNG.bitblt(png, out, minX, 0, gw, png.height, 0, 0);
  fs.writeFileSync(path.join(OUT, 'glyphs', `${code}.png`), PNG.sync.write(out));
  glyphMeta[code] = { w: gw, h: png.height };
}
glyphMeta[32] = { w: 9, h: 0, space: true };
fs.writeFileSync(path.join(OUT, 'glyphs', 'meta.json'), JSON.stringify(glyphMeta));
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`glyphs: ${Object.keys(glyphMeta).length}`);

// ---- 5. preview.gif (committed hero for the README) ---------------------------
console.log('rendering preview.gif ...');
const heroKey = manifest.find(c => c.id === '062')?.key || manifest[0].key; // smile-happy-sway
const dir = path.join(OUT, 'frames', heroKey);
const files = fs.readdirSync(dir).sort();
const enc = GIFEncoder();
for (const f of files) {
  const png = PNG.sync.read(fs.readFileSync(path.join(dir, f)));
  const idx = applyPalette(png.data, palette);
  enc.writeFrame(idx, png.width, png.height, { palette, delay: Math.round(1000 / FPS) });
}
enc.finish();
fs.writeFileSync(path.join(OUT, 'preview.gif'), Buffer.from(enc.bytes()));
console.log(`preview.gif from ${heroKey} (${files.length} frames)`);
console.log('pipeline complete.');
