// REFERENCE IMPLEMENTATION · momo-comes-alive · Step 2.3. Not the target file — do not edit; this is the bar to match.
// Shows: the aquarium's heart — a fixed-timestep canvas sprite player fed by the SAME
//   strip PNGs the SVG stage encodes (one asset pipeline, two consumers — that seam is
//   deliberate), plus the SSE glue that makes reactions and presence feel instant.
//   Everything Camo forbids in the README is legal here: this page is first-party.
// Non-obvious:
//   · Fixed-timestep accumulator, not one-frame-per-rAF: requestAnimationFrame fires at
//     the display's refresh rate, so per-tick advancement plays 2× on a 120 Hz screen.
//   · Clamp the delta after tab-hidden pauses, or the player fast-forwards through
//     minutes of banked time in one visible frame.
//   · Reactions PREEMPT via the queue — current clip finishes its loop, then the reaction
//     plays. Never hard-swap mid-frame; the pet must not teleport between poses.
//   · Server side of /events: emit an SSE comment line (": ping\n\n") every ~25s. Proxies
//     and browsers reap idle streams, and presence counting = open connections, so the
//     stream staying open IS the feature. EventSource reconnects itself — don't wrap it.
// Yours to decide: the page shell/DOM, the /events payload shape, presence + streak UI
//   (the existing momo_fid cookie), and how recent webhook visitors are displayed.

const FRAME_W = 400;
const FRAME_H = 400;

export class SpritePlayer {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {Record<string, {src: string, frames: number, fps: number, idle?: boolean}>} atlas
   *   Clip catalog served by the aquarium page; `src` points at the shared strip PNGs.
   */
  constructor(canvas, atlas) {
    this.ctx = canvas.getContext('2d');
    this.atlas = atlas;
    this.images = new Map();
    this.queue = [];            // [{ key, loops }] — reactions push here
    this.current = null;        // { key, img, frames, fps, frame, loopsLeft }
    this.acc = 0;
    this.last = null;
    document.addEventListener('visibilitychange', () => { this.last = null; }); // drop banked time
  }

  async load(keys) {
    await Promise.all(keys.map(key => new Promise((ok, err) => {
      const img = new Image();
      img.onload = () => { this.images.set(key, img); ok(); };
      img.onerror = err;
      img.src = this.atlas[key].src;
    })));
  }

  /** A reaction joins the queue; idle picking resumes when the queue drains. */
  react(key, loops = 2) {
    if (this.images.has(key)) this.queue.push({ key, loops });
  }

  nextClip() {
    const q = this.queue.shift();
    const key = q?.key ?? this.pickIdle();
    const meta = this.atlas[key];
    this.current = { key, img: this.images.get(key), frames: meta.frames, fps: meta.fps, frame: 0, loopsLeft: q?.loops ?? 1 };
  }

  pickIdle() {
    const idles = Object.keys(this.atlas).filter(k => this.atlas[k].idle && this.images.has(k) && k !== this.current?.key);
    return idles[Math.floor(Math.random() * idles.length)];
  }

  start() {
    const tick = (now) => {
      if (this.last === null) this.last = now;               // fresh after visibility gap
      this.acc += Math.min(now - this.last, 250);            // clamp: never bank > 250ms
      this.last = now;

      if (!this.current) this.nextClip();
      const frameMs = 1000 / this.current.fps;
      while (this.acc >= frameMs) {
        this.acc -= frameMs;
        if (++this.current.frame >= this.current.frames) {
          this.current.frame = 0;
          if (--this.current.loopsLeft <= 0) this.nextClip(); // loop boundary = only swap point
        }
      }

      const { img, frame } = this.current;
      this.ctx.clearRect(0, 0, FRAME_W, FRAME_H);
      this.ctx.drawImage(img, frame * FRAME_W, 0, FRAME_W, FRAME_H, 0, 0, FRAME_W, FRAME_H);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
}

/**
 * SSE wiring: reactions preempt the player; presence updates flow to the UI.
 * EventSource handles reconnection with Last-Event-ID on its own.
 */
export function connectEvents(player, { onPresence }) {
  const es = new EventSource('/events');
  es.addEventListener('reaction', (e) => {
    const { clip, loops } = JSON.parse(e.data);
    player.react(clip, loops);
  });
  es.addEventListener('presence', (e) => onPresence(JSON.parse(e.data).count));
  return es;
}
