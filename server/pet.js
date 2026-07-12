// Momó's scene library and mood state. Requests select a complete scene which is
// encoded as a bounded looping GIF; no behavior depends on a live connection.
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import gifencMod from 'gifenc';
let gifenc = gifencMod;
while (gifenc && !(gifenc.GIFEncoder && gifenc.quantize)) gifenc = gifenc.default;
const { applyPalette } = gifenc;

const SPAWN_WEIGHT = { common: 1.0, uncommon: 0.25, rare: 0.06 };
const REACTIONS = {
  feed:    { ids: ['037', '036', '027', '002'], bubbles: ['nom nom nom!', 'my favorite!', 'more, please!', '♥ ♥ ♥'] },
  pat:     { ids: ['013', '032', '029', '042'], bubbles: ['hehe', 'that is the spot!', '♥'] },
  play:    { ids: ['038', '044', '026', '075'], bubbles: ['wheee!', 'again! again!', 'catch!'] },
  wake:    { ids: ['072', '005', '050', '030'], bubbles: ['oh, hello!', 'hi there!', 'welcome!'] },
  boop:    { ids: ['029', '010', '075', '034'], bubbles: ['!!', 'you found the boop', 'eep!'] },
  build:   { ids: ['006', '045', '024'], bubbles: ['new code! nom nom', 'ooh, commits!', 'i shall guard this code'] },
  star:    { ids: ['076', '023', '026', '035'], bubbles: null },
  fork:    { ids: ['052', '036', '023'], bubbles: null },
  whisper: { ids: ['063', '007', '046', '043'], bubbles: null },
};
const SAD_IDS = ['019', '028', '039', '040', '049', '018'];

export class Pet {
  constructor(assetDir, flags = {}) {
    this.assetDir = assetDir;
    this.manifest = JSON.parse(fs.readFileSync(path.join(assetDir, 'manifest.json'), 'utf8'));
    const pal = JSON.parse(fs.readFileSync(path.join(assetDir, 'palette.json'), 'utf8'));
    this.palette = pal.palette;
    this.ink = pal.ink;
    this.paper = pal.paper;
    this.byId = Object.fromEntries(this.manifest.map(c => [c.id, c]));
    this.pools = {
      idle: this.manifest.filter(c => c.state_hint === 'idle'),
      sleep: this.manifest.filter(c => c.state_hint === 'sleep'),
      look: this.manifest.filter(c => c.state_hint === 'look-around'),
      sad: SAD_IDS.map(id => this.byId[id]).filter(Boolean),
    };
    this.cache = new Map();
    this.width = 400;
    this.height = 400;
    this.flags = flags;
    this.flags.fleas ??= false;
    this.flags.ciRed ??= false;
  }

  get mood() { return this.flags.fleas ? 'fleas' : this.flags.ciRed ? 'rain' : 'sunny'; }
  setFlag(name, on) { if (name in this.flags) this.flags[name] = !!on; }

  loadFrames(clip) {
    if (this.cache.has(clip.key)) return this.cache.get(clip.key);
    const dir = path.join(this.assetDir, 'frames', clip.key);
    const frames = fs.readdirSync(dir).sort().map(file => {
      const png = PNG.sync.read(fs.readFileSync(path.join(dir, file)));
      this.width = png.width;
      this.height = png.height;
      return applyPalette(png.data, this.palette);
    });
    this.cache.set(clip.key, frames);
    if (this.cache.size > 10) this.cache.delete(this.cache.keys().next().value);
    return frames;
  }

  pickWeighted(pool) {
    const weights = pool.map(c => SPAWN_WEIGHT[c.spawn] ?? 0.2);
    let r = Math.random() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < pool.length; i++) {
      r -= weights[i];
      if (r <= 0) return pool[i];
    }
    return pool[pool.length - 1];
  }

  pickIdle() {
    if (this.mood !== 'sunny' && this.pools.sad.length && Math.random() < 0.7) {
      return this.pickWeighted(this.pools.sad);
    }
    return this.pickWeighted(Math.random() < 0.2 ? this.pools.look : this.pools.idle);
  }

  defaultBubble(kind) {
    const bubbles = REACTIONS[kind]?.bubbles;
    return bubbles?.[Math.floor(Math.random() * bubbles.length)] ?? null;
  }

  scene(kind = 'idle', bubbleOverride, clipId) {
    let clip;
    if (kind === 'idle') clip = this.pickIdle();
    else if (kind === 'sleep') clip = this.pickWeighted(this.pools.sleep);
    else {
      const reaction = REACTIONS[kind] || REACTIONS.wake;
      clip = this.byId[clipId] || this.byId[reaction.ids[Math.floor(Math.random() * reaction.ids.length)]];
    }
    const moodBubble = this.flags.fleas
      ? 'i have fleas! (dependency alerts)'
      : this.flags.ciRed ? 'the build is red… fix it?' : null;
    const bubble = bubbleOverride ?? (kind === 'idle' ? moodBubble : this.defaultBubble(kind));
    return { kind, clip, frames: this.loadFrames(clip), bubble };
  }
}
