// The pet brain: a clip-chaining state machine over the manifest.
// v2: moods (rain = red CI, fleas = open vulns), rooms (stage/bedroom dollhouse),
// celebrations (star/fork eruptions with the actor's name), and gaze targets.
// Idle pool is spawn-weighted (common idles rotate, rare clips are easter eggs).
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
  greet:   { ids: ['072', '005', '050', '030'], bubbles: ['oh, hello!', 'hi there!', 'welcome!'] },
  boop:    { ids: ['029', '010', '075', '034'], bubbles: ['!!', 'you found the boop', 'eep!'] },
  build:   { ids: ['006', '045', '024'],        bubbles: ['new code! nom nom', 'ooh, commits!', 'i shall guard this code'] },
  star:    { ids: ['076', '023', '026', '035'], bubbles: null }, // bubble carries the name, set by celebrate()
  fork:    { ids: ['052', '036', '023'],        bubbles: null },
  whisper: { ids: ['063', '007', '046', '043'], bubbles: null },
};
const SAD_IDS = ['019', '028', '039', '040', '049', '018'];
const SLEEP_AFTER_EMPTY_MS = 5 * 60 * 1000;
const CELEBRATION_TICKS = 140; // ~14s of banner fireworks

export class Pet {
  constructor(assetDir) {
    this.assetDir = assetDir;
    this.manifest = JSON.parse(fs.readFileSync(path.join(assetDir, 'manifest.json'), 'utf8'));
    const pal = JSON.parse(fs.readFileSync(path.join(assetDir, 'palette.json'), 'utf8'));
    this.palette = pal.palette; this.ink = pal.ink; this.paper = pal.paper;
    this.byId = Object.fromEntries(this.manifest.map(c => [c.id, c]));
    this.eyemap = fs.existsSync(path.join(assetDir, 'eyemap.json'))
      ? JSON.parse(fs.readFileSync(path.join(assetDir, 'eyemap.json'), 'utf8')) : {};
    this.pools = {
      idle: this.manifest.filter(c => c.state_hint === 'idle'),
      sleep: this.manifest.filter(c => c.state_hint === 'sleep'),
      look: this.manifest.filter(c => c.state_hint === 'look-around'),
      sad: SAD_IDS.map(id => this.byId[id]).filter(Boolean),
    };
    this.cache = new Map(); // key -> [Uint8Array indexed frames]
    this.queue = [];        // [{clip, bubble}]
    this.pending = null;    // reaction armed at click/webhook time, played on next stream-open
    this.bubbleText = null;
    this.bubbleFrames = 0;  // frame-countdown, not wall-clock: survives the bounce
    this.viewers = 0;
    this.emptySince = Date.now();
    this.width = 400; this.height = 400;
    this.mood = 'sunny';    // sunny | rain (CI red) | fleas (open vulns)
    this.room = 'stage';    // stage | bedroom — the dollhouse
    this.celebration = null; // { text, kind, ticks }
    this.gaze = { dy: 0, dx: 0 }; // pupil offset target, set by sensors/clicks
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
    if (this.cache.size > 8) this.cache.delete(this.cache.keys().next().value); // small LRU
    return frames;
  }

  pickWeighted(pool) {
    const weights = pool.map(c => SPAWN_WEIGHT[c.spawn] ?? 0.2);
    let r = Math.random() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < pool.length; i++) { r -= weights[i]; if (r <= 0) return pool[i]; }
    return pool[pool.length - 1];
  }

  pickIdle() {
    // a sad mood colors the idle rotation (that's the whole trojan-utility trick:
    // a red build is ignorable, a crying octopus is not)
    if (this.mood !== 'sunny' && this.pools.sad.length && Math.random() < 0.55) return this.pickWeighted(this.pools.sad);
    const asleep = this.viewers === 0 && Date.now() - this.emptySince > SLEEP_AFTER_EMPTY_MS;
    if (asleep) return this.pickWeighted(this.pools.sleep);
    const pool = Math.random() < 0.2 ? this.pools.look : this.pools.idle;
    return this.pickWeighted(pool);
  }

  setClip(clip) {
    this.clip = clip;
    this.frames = this.loadFrames(clip);
    this.frameIdx = 0;
  }

  playNow(clip, bubble) {
    this.room = 'stage'; // anything worth reacting to happens on stage
    this.setClip(clip);
    if (bubble) { this.bubbleText = bubble; this.bubbleFrames = 30; }
  }

  pickReaction(kind) {
    const r = REACTIONS[kind];
    const clip = this.byId[r.ids[Math.floor(Math.random() * r.ids.length)]];
    const bubble = r.bubbles ? r.bubbles[Math.floor(Math.random() * r.bubbles.length)] : null;
    return { clip, bubble };
  }

  react(kind, bubbleOverride) {
    if (!REACTIONS[kind]) return;
    const { clip, bubble: def } = this.pickReaction(kind);
    const bubble = bubbleOverride ?? def;
    if (this.viewers > 0) {
      const interruptible = ['idle', 'sleep', 'look-around'].includes(this.clip.state_hint);
      if (interruptible && this.queue.length === 0) { this.playNow(clip, bubble); }
      else { this.queue.push({ clip, bubble }); if (this.queue.length > 4) this.queue.shift(); }
    }
    // ALSO arm for the actor's own return (the bounce/reload reopens the stream)
    this.pending = { clip, bubble, until: Date.now() + 45000 };
  }

  // star/fork eruption: stage reaction + banner fireworks with the actor's name
  celebrate(kind, login) {
    const text = kind === 'fork' ? `a little one! hi @${login}` : `thank you @${login} ★`;
    this.celebration = { text, kind, ticks: CELEBRATION_TICKS };
    const { clip } = this.pickReaction(kind);
    if (this.viewers > 0) this.playNow(clip, text);
    this.pending = { clip, bubble: text, until: Date.now() + 90000 };
    // encore after the first clip
    const encore = this.pickReaction(kind);
    this.queue.push({ clip: encore.clip, bubble: null });
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

  moodBubble() {
    if (this.mood === 'rain') return 'the build is red… fix it?';
    if (this.mood === 'fleas') return 'i have fleas! (deps have alerts)';
    return null;
  }

  // eye centers for the current frame, if this clip has a verified eye map
  eyesForFrame() {
    const m = this.eyemap[this.clip.id];
    if (!m) return null;
    return m[Math.min(this.frameIdx, m.length - 1)] || null;
  }

  // advances state one tick and returns the composited stage frame
  tick(composer) {
    if (this.celebration && --this.celebration.ticks <= 0) this.celebration = null;
    if (this.frameIdx >= this.frames.length) {
      const next = this.queue.shift();
      if (next) {
        this.setClip(next.clip);
        if (next.bubble) { this.bubbleText = next.bubble; this.bubbleFrames = 30; }
      } else {
        // dollhouse wandering: sometimes Momó slips off to the bedroom for a nap clip
        const sleepy = this.viewers === 0 || Math.random() < 0.12;
        this.room = (sleepy && this.mood === 'sunny' && !this.celebration && Math.random() < 0.5)
          ? 'bedroom' : 'stage';
        const clip = this.room === 'bedroom' ? this.pickWeighted(this.pools.sleep) : this.pickIdle();
        this.setClip(clip);
        // an occasional mood complaint while idling
        const mb = this.moodBubble();
        if (mb && Math.random() < 0.3) { this.bubbleText = mb; this.bubbleFrames = 30; }
      }
    }
    let frame = this.frames[this.frameIdx++];
    const bubbling = this.bubbleText && this.bubbleFrames > 0;
    const eyes = !bubbling && this.eyesForFrame();
    const gazing = eyes && (this.gaze.dx || this.gaze.dy);
    if (bubbling || gazing) frame = frame.slice();
    if (gazing) composer.gazeDots(frame, this.width, eyes, this.gaze);
    if (bubbling) {
      this.bubbleFrames--;
      composer.bubble(frame, this.width, this.height, this.bubbleText);
    } else if (this.bubbleText) this.bubbleText = null;
    return frame;
  }
}
