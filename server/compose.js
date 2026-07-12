// Ink-on-paper compositor: draws speech bubbles onto indexed frames using the
// Bradley Hand glyph atlas. Everything is drawn in the two anchor palette slots
// (ink + paper) so the whole page stays one sketchbook.
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

export class Composer {
  constructor(assetDir, paletteInfo) {
    this.ink = paletteInfo.ink;
    this.paper = paletteInfo.paper;
    this.meta = JSON.parse(fs.readFileSync(path.join(assetDir, 'glyphs', 'meta.json'), 'utf8'));
    this.glyphs = {};
    for (const code of Object.keys(this.meta)) {
      const f = path.join(assetDir, 'glyphs', `${code}.png`);
      if (fs.existsSync(f)) this.glyphs[code] = PNG.sync.read(fs.readFileSync(f));
    }
  }

  measure(text) {
    let w = 0;
    for (const ch of text) w += ch.codePointAt(0) === 0x2665 ? 22 : (this.meta[ch.codePointAt(0)]?.w ?? 9) + 2;
    return w;
  }

  wrap(text, maxW) {
    const words = text.split(' ');
    const lines = [];
    let line = '';
    for (const word of words) {
      const cand = line ? line + ' ' + word : word;
      if (this.measure(cand) > maxW && line) { lines.push(line); line = word; }
      else line = cand;
    }
    if (line) lines.push(line);
    return lines.slice(0, 3);
  }

  // hand-drawn heart for ♥ (Bradley Hand has no U+2665)
  static HEART = [
    '.XX..XX.',
    'XXXX.XXXX'.slice(0, 9),
    'XXXXXXXXX',
    '.XXXXXXX.',
    '..XXXXX..',
    '...XXX...',
    '....X....',
  ];

  // draws a bubble at the top of the frame; mutates `indexed`
  bubble(indexed, width, height, text) {
    const maxTextW = width - 90;
    const lines = this.wrap(text, maxTextW);
    const lineH = 36;
    const padX = 16, padY = 12;
    const bw = Math.min(maxTextW, Math.max(...lines.map(l => this.measure(l)))) + padX * 2;
    const bh = lines.length * lineH + padY * 2;
    const bx = Math.round((width - bw) / 2);
    const by = 14;
    const set = (x, y, v) => { if (x >= 0 && x < width && y >= 0 && y < height) indexed[y * width + x] = v; };

    // paper fill + chunky ink border (2px, doodle-style)
    for (let y = by; y < by + bh; y++) for (let x = bx; x < bx + bw; x++) set(x, y, this.paper);
    for (let x = bx; x < bx + bw; x++) { set(x, by, this.ink); set(x, by + 1, this.ink); set(x, by + bh - 1, this.ink); set(x, by + bh - 2, this.ink); }
    for (let y = by; y < by + bh; y++) { set(bx, y, this.ink); set(bx + 1, y, this.ink); set(bx + bw - 1, y, this.ink); set(bx + bw - 2, y, this.ink); }
    // tail: three short ink strokes angling toward the head
    const tx = Math.round(width / 2) + 26;
    for (let i = 0; i < 14; i++) { set(tx - i, by + bh + i, this.ink); set(tx - i + 1, by + bh + i, this.ink); set(tx - i + 2, by + bh + i, this.ink); }

    // text
    let ty = by + padY;
    for (const line of lines) {
      let tx2 = bx + Math.round((bw - this.measure(line)) / 2);
      for (const ch of line) {
        const code = ch.codePointAt(0);
        if (code === 0x2665) { // ♥ drawn by hand, doubled pixels
          const H = Composer.HEART;
          for (let y = 0; y < H.length; y++) for (let x = 0; x < H[y].length; x++) {
            if (H[y][x] === 'X') { const px = tx2 + x * 2, py = ty + 12 + y * 2;
              set(px, py, this.ink); set(px + 1, py, this.ink); set(px, py + 1, this.ink); set(px + 1, py + 1, this.ink); }
          }
          tx2 += 22; continue;
        }
        const m = this.meta[code];
        if (!m || m.space) { tx2 += (m?.w ?? 9) + 2; continue; }
        const g = this.glyphs[code];
        for (let y = 0; y < g.height; y++) for (let x = 0; x < g.width; x++) {
          if (g.data[(y * g.width + x) * 4 + 3] > 100) set(tx2 + x, ty + y, this.ink);
        }
        tx2 += m.w + 2;
      }
      ty += lineH;
    }
  }
}
