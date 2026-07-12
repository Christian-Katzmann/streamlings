// The pet brain: a clip-chaining state machine over the manifest.
// Idle pool is spawn-weighted (common idles rotate, rare clips are easter eggs),
// reactions are queued by input events and play next, sleep kicks in when the
// room has been empty for a while.
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import gifencMod from 'gifenc';
let gifenc = gifencMod;
while (gifenc && !(gifenc.GIFEncoder && gifenc.quantize)) gifenc = gifenc.default;
const { applyPalette } = gifenc;

const SPAWN_WEIGHT = { common: 1.0, uncommon: 0.25, rare: 0.06 };
const REACTIONS = {
  feed: { ids: ['037', '036', '027', '002'], bubbles: ['nom nom nom!', 'my favorite!', 'more, please!', '♥ ♥ ♥'] },
  pat:  { ids: ['013', '032', '029', '042'], bubbles: ['hehe', 'that is the spot!', '♥'] },
  play: { ids: ['038', '044', '026', '075'], bubbles: ['wheee!', 'again! again!', 'catch!'] },
  greet:{ ids: ['072', '005', '050', '030'], bubbles: ['oh, hello!', 'hi there!', 'welcome!'] },
};
const SLEEP_AFTER_EMPTY_MS = 5 * 60 * 1000;

export class Pet {
  constructor(assetDir) {
    this.assetDir = assetDir;
    this.manifest = JSON.parse(fs.readFileSync(path.join(assetDir, 'manifest.json'), 'utf8'));
    const pal = JSON.parse(fs.readFileSync(path.join(assetDir, 'palette.json'), 'utf8'));
    this.palette = pal.palette; this.ink = pal.ink; this.paper = pal.paper;
    this.byId = Object.fromEntries(this.manifest.map(c => [c.id, c]));
    this.pools = {
      idle: this.manifest.filter(c => c.state_hint === 'idle'),
      sleep: this.manifest.filter(c => c.state_hint === 'sleep'),
      look: this.manifest.filter(c => c.state_hint === 'look-around'),
    };
    this.cache = new Map(); // key -> [Uint8Array indexed frames]
    this.queue = [];        // [{clip, bubble}]
    this.pending = null;    // reaction armed at click time, played on next stream-open
    this.bubbleText = null;
    this.bubbleFrames = 0;  // frame-countdown, not wall-clock: survives the bounce
    this.viewers = 0;
    this.emptySince = Date.now();
    this.width = 400; this.height = 400;
    this.setClip(this.pickIdle());
  }

  loadFrames(clip) {
    if (this.cache.has(clip.key)) return this.cache.get(clip.key);
    const dir = path.join(this.assetDir, 'frames', clip.key);
    const frames = fs.readdirSync(dir).sort().map(f => {
      const png = PNG.sync.read(fs.readFileSync(path.join(dir, f)));
      this.width = png.width; this.height = png.height;
      return applyPalette(png.data, this.palette);
    });
    this.cache.set(clip.key, frames);
    if (this.cache.size > 6) this.cache.delete(this.cache.keys().next().value); // small LRU
    return frames;
  }

  pickWeighted(pool) {
    const weights = pool.map(c => SPAWN_WEIGHT[c.spawn] ?? 0.2);
    let r = Math.random() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < pool.length; i++) { r -= weights[i]; if (r <= 0) return pool[i]; }
    return pool[pool.length - 1];
  }

  pickIdle() {
    const asleep = this.viewers === 0 && Date.now() - this.emptySince > SLEEP_AFTER_EMPTY_MS;
    if (asleep) return this.pickWeighted(this.pools.sleep);
    // mostly idle, sometimes a curious look-around
    const pool = Math.random() < 0.2 ? this.pools.look : this.pools.idle;
    return this.pickWeighted(pool);
  }

  setClip(clip) {
    this.clip = clip;
    this.frames = this.loadFrames(clip);
    this.frameIdx = 0;
  }

  playNow(clip, bubble) {
    this.setClip(clip);
    if (bubble) { this.bubbleText = bubble; this.bubbleFrames = 30; }
  }

  react(kind, bubbleOverride) {
    const r = REACTIONS[kind];
    if (!r) return;
    const clip = this.byId[r.ids[Math.floor(Math.random() * r.ids.length)]];
    const bubble = bubbleOverride ?? r.bubbles[Math.floor(Math.random() * r.bubbles.length)];
    if (this.viewers > 0) {
      // someone is watching live: react immediately (interrupt idling), queue behind reactions
      const interruptible = ['idle', 'sleep', 'look-around'].includes(this.clip.state_hint);
      if (interruptible && this.queue.length === 0) { this.playNow(clip, bubble); return; }
      this.queue.push({ clip, bubble });
      if (this.queue.length > 4) this.queue.shift();
    }
    // ALSO arm it for the clicker's own return: the bounce reloads the README, which
    // reopens the stream a few seconds from now — that's when they must see it.
    this.pending = { clip, bubble, until: Date.now() + 45000 };
  }

  onViewers(n) {
    const wasEmpty = this.viewers === 0;
    this.viewers = n;
    if (n === 0) { this.emptySince = Date.now(); return; }
    if (!wasEmpty) return;
    // a viewer just arrived: armed reaction beats greeting
    if (this.pending && Date.now() < this.pending.until) {
      const { clip, bubble } = this.pending;
      this.pending = null;
      this.playNow(clip, bubble);
    } else {
      this.pending = null;
      this.react('greet');
    }
  }

  // returns the composited indexed frame for this tick
  tick(composer) {
    if (this.frameIdx >= this.frames.length) {
      const next = this.queue.shift();
      if (next) {
        this.setClip(next.clip);
        if (next.bubble) { this.bubbleText = next.bubble; this.bubbleFrames = 30; }
      } else this.setClip(this.pickIdle());
    }
    let frame = this.frames[this.frameIdx++];
    if (this.bubbleText && this.bubbleFrames > 0) {
      this.bubbleFrames--;
      frame = frame.slice();
      composer.bubble(frame, this.width, this.height, this.bubbleText);
    } else if (this.bubbleText) this.bubbleText = null;
    return frame;
  }
}
