// Ink-on-paper compositor: speech bubbles, gaze pupils, banner art and empty-room
// cards, all drawn into indexed frames using only the ink + paper palette slots
// (plus the hand-lettered Bradley Hand glyph atlas) so the whole page stays one
// sketchbook.
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

  // hand-drawn heart for ♥ (Bradley Hand has no U+2665); star for ★ (U+2605)
  static HEART = [
    '.XX..XX..',
    'XXXX.XXXX',
    'XXXXXXXXX',
    '.XXXXXXX.',
    '..XXXXX..',
    '...XXX...',
    '....X....',
  ];
  static STAR = [
    '....X....',
    '...XXX...',
    'XXXXXXXXX',
    '.XXXXXXX.',
    '..XXXXX..',
    '.XXX.XXX.',
    '.X.....X.',
  ];

  measure(text) {
    let w = 0;
    for (const ch of text) {
      const code = ch.codePointAt(0);
      w += (code === 0x2665 || code === 0x2605) ? 22 : (this.meta[code]?.w ?? 9) + 2;
    }
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

  drawGlyphMark(set, pattern, tx, ty, scale = 2) {
    for (let y = 0; y < pattern.length; y++) for (let x = 0; x < pattern[y].length; x++) {
      if (pattern[y][x] === 'X') {
        for (let sy = 0; sy < scale; sy++) for (let sx = 0; sx < scale; sx++) {
          set(tx + x * scale + sx, ty + y * scale + sy, this.ink);
        }
      }
    }
  }

  // renders one line of atlas text at (tx, ty); returns end x
  drawText(set, text, tx, ty) {
    for (const ch of text) {
      const code = ch.codePointAt(0);
      if (code === 0x2665) { this.drawGlyphMark(set, Composer.HEART, tx, ty + 12); tx += 22; continue; }
      if (code === 0x2605) { this.drawGlyphMark(set, Composer.STAR, tx, ty + 12); tx += 22; continue; }
      const m = this.meta[code];
      if (!m || m.space) { tx += (m?.w ?? 9) + 2; continue; }
      const g = this.glyphs[code];
      for (let y = 0; y < g.height; y++) for (let x = 0; x < g.width; x++) {
        if (g.data[(y * g.width + x) * 4 + 3] > 100) set(tx + x, ty + y, this.ink);
      }
      tx += m.w + 2;
    }
    return tx;
  }

  setter(indexed, width, height) {
    return (x, y, v) => { if (x >= 0 && x < width && y >= 0 && y < height) indexed[y * width + x] = v; };
  }

  // draws a speech bubble at the top of the frame; mutates `indexed`
  bubble(indexed, width, height, text) {
    const set = this.setter(indexed, width, height);
    const maxTextW = width - 90;
    const lines = this.wrap(text, maxTextW);
    const lineH = 36;
    const padX = 16, padY = 12;
    const bw = Math.min(maxTextW, Math.max(...lines.map(l => this.measure(l)))) + padX * 2;
    const bh = lines.length * lineH + padY * 2;
    const bx = Math.round((width - bw) / 2);
    const by = 14;
    for (let y = by; y < by + bh; y++) for (let x = bx; x < bx + bw; x++) set(x, y, this.paper);
    for (let x = bx; x < bx + bw; x++) { set(x, by, this.ink); set(x, by + 1, this.ink); set(x, by + bh - 1, this.ink); set(x, by + bh - 2, this.ink); }
    for (let y = by; y < by + bh; y++) { set(bx, y, this.ink); set(bx + 1, y, this.ink); set(bx + bw - 1, y, this.ink); set(bx + bw - 2, y, this.ink); }
    const tx = Math.round(width / 2) + 26;
    for (let i = 0; i < 14; i++) { set(tx - i, by + bh + i, this.ink); set(tx - i + 1, by + bh + i, this.ink); set(tx - i + 2, by + bh + i, this.ink); }
    let ty = by + padY;
    for (const line of lines) {
      this.drawText(set, line, bx + Math.round((bw - this.measure(line)) / 2), ty);
      ty += lineH;
    }
  }

  // redraws the pupils displaced toward the gaze target; eyes = [Lx, Ly, Rx, Ry]
  gazeDots(indexed, width, eyes, gaze) {
    const set = this.setter(indexed, width, indexed.length / width);
    const [lx, ly, rx, ry] = eyes;
    const ox = Math.max(-3, Math.min(3, gaze.dx * 2));
    const oy = Math.max(-3, Math.min(3, gaze.dy * 2));
    for (const [ex, ey] of [[lx, ly], [rx, ry]]) {
      // paper-wash the original dot, then redraw it displaced
      for (let y = -6; y <= 6; y++) for (let x = -6; x <= 6; x++) {
        if (x * x + y * y <= 36) set(ex + x, ey + y, this.paper);
      }
      for (let y = -3; y <= 3; y++) for (let x = -3; x <= 3; x++) {
        if (x * x + y * y <= 9) set(ex + x + ox, ey + y + oy, this.ink);
      }
    }
  }

  // wide banner frame: a hand-drawn divider squiggle normally; fireworks + name during
  // a celebration. `phase` animates both. Returns a fresh indexed frame.
  banner(width, height, celebration, phase) {
    const f = new Uint8Array(width * height).fill(this.paper);
    const set = this.setter(f, width, height);
    if (!celebration) {
      // calm state: a wavy ink divider with a tiny drifting bubble trail
      const mid = Math.round(height / 2);
      for (let x = 8; x < width - 8; x++) {
        const y = mid + Math.round(Math.sin(x / 26 + phase / 9) * 4);
        set(x, y, this.ink); set(x, y + 1, this.ink);
      }
      const bx = 20 + ((phase * 3) % (width - 40));
      for (const [dx, dy, r] of [[0, -8, 3], [10, -13, 2], [18, -9, 2]]) {
        for (let a = 0; a < 20; a++) {
          const t = a / 20 * Math.PI * 2;
          set(Math.round(bx + dx + Math.cos(t) * r), Math.round(mid + dy + Math.sin(t) * r), this.ink);
        }
      }
      return f;
    }
    // celebration: starbursts + the actor's name in lights
    const text = celebration.text;
    const tw = this.measure(text);
    this.drawText(set, text, Math.round((width - tw) / 2), Math.round(height / 2) - 22);
    const bursts = 7;
    for (let i = 0; i < bursts; i++) {
      const cx = Math.round((i + 0.5) * width / bursts + Math.sin(phase / 5 + i * 2) * 9);
      const cy = (i % 2 === 0) ? 18 : height - 18;
      const r = 5 + ((phase + i * 4) % 12);
      for (let s = 0; s < 8; s++) {
        const t = s / 8 * Math.PI * 2 + i;
        for (let d = 3; d <= r; d++) set(Math.round(cx + Math.cos(t) * d), Math.round(cy + Math.sin(t) * d * 0.7), this.ink);
      }
    }
    return f;
  }

  // empty dollhouse room card ("gone napping →" / the bedroom with zzz)
  emptyRoom(width, height, note) {
    const f = new Uint8Array(width * height).fill(this.paper);
    const set = this.setter(f, width, height);
    // doodle border
    for (let x = 10; x < width - 10; x++) {
      const wob = Math.round(Math.sin(x / 14) * 1.5);
      set(x, 10 + wob, this.ink); set(x, height - 11 + wob, this.ink);
    }
    for (let y = 10; y < height - 10; y++) {
      const wob = Math.round(Math.sin(y / 14) * 1.5);
      set(10 + wob, y, this.ink); set(width - 11 + wob, y, this.ink);
    }
    const tw = this.measure(note);
    this.drawText(set, note, Math.round((width - tw) / 2), Math.round(height / 2) - 22);
    return f;
  }

  // tiny sensor strip: three drifting ink bubbles (the "footprints" of the lazy pixel)
  sensorStrip(width, height, phase) {
    const f = new Uint8Array(width * height).fill(this.paper);
    const set = this.setter(f, width, height);
    const mid = Math.round(height / 2);
    for (let i = 0; i < 3; i++) {
      const bx = 8 + ((phase * 2 + i * 18) % (width - 16));
      const r = 2 + (i % 2);
      for (let a = 0; a < 16; a++) {
        const t = a / 16 * Math.PI * 2;
        set(Math.round(bx + Math.cos(t) * r), Math.round(mid + Math.sin(t) * r), this.ink);
      }
    }
    return f;
  }
}
