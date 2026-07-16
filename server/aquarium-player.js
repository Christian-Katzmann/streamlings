const FRAME_W = 400;
const FRAME_H = 400;

export class SpritePlayer {
  constructor(canvas, atlas) {
    this.ctx = canvas.getContext('2d');
    this.atlas = atlas;
    this.images = new Map();
    this.loading = new Map();
    this.queue = [];
    this.current = null;
    this.acc = 0;
    this.last = null;
    document.addEventListener('visibilitychange', () => { this.last = null; });
  }

  async load(keys) {
    await Promise.all(keys.filter(key => this.atlas[key]).map(key => {
      if (this.images.has(key)) return null;
      if (this.loading.has(key)) return this.loading.get(key);
      const pending = new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => { this.images.set(key, image); this.loading.delete(key); resolve(); };
        image.onerror = () => { this.loading.delete(key); reject(new Error(`could not load ${key}`)); };
        image.src = this.atlas[key].src;
      });
      this.loading.set(key, pending);
      return pending;
    }));
  }

  async react(key, loops = 2) {
    if (!this.atlas[key]) return;
    await this.load([key]);
    this.queue.push({ key, loops });
  }

  nextClip() {
    const queued = this.queue.shift();
    const key = queued?.key || this.pickIdle();
    const meta = this.atlas[key];
    this.current = {
      key,
      image: this.images.get(key),
      frames: meta.frames,
      fps: meta.fps,
      frame: 0,
      loopsLeft: queued?.loops || 1,
    };
  }

  pickIdle() {
    const available = Object.keys(this.atlas).filter(key => this.atlas[key].idle && this.images.has(key));
    const alternatives = available.filter(key => key !== this.current?.key);
    const pool = alternatives.length ? alternatives : available;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  start() {
    const tick = now => {
      if (this.last === null) this.last = now;
      this.acc += Math.min(now - this.last, 250);
      this.last = now;
      if (!this.current) this.nextClip();

      const frameMs = 1000 / this.current.fps;
      while (this.acc >= frameMs) {
        this.acc -= frameMs;
        this.current.frame++;
        if (this.current.frame >= this.current.frames) {
          this.current.frame = 0;
          if (--this.current.loopsLeft <= 0) this.nextClip();
        }
      }

      const { image, frame } = this.current;
      this.ctx.clearRect(0, 0, FRAME_W, FRAME_H);
      this.ctx.drawImage(image, frame * FRAME_W, 0, FRAME_W, FRAME_H, 0, 0, FRAME_W, FRAME_H);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
}

export function connectEvents(player, { onPresence, onReaction }) {
  const source = new EventSource('/events');
  source.addEventListener('reaction', event => {
    const reaction = JSON.parse(event.data);
    player.react(reaction.clip, reaction.loops).catch(() => {});
    onReaction(reaction);
  });
  source.addEventListener('presence', event => onPresence(JSON.parse(event.data).count));
  return source;
}

async function startAquarium() {
  const response = await fetch('/strips/atlas.json');
  if (!response.ok) throw new Error('the strip atlas is unavailable');
  const atlas = await response.json();
  const player = new SpritePlayer(document.querySelector('#momo'), atlas);
  const presence = document.querySelector('#presence-count');
  const reactionCopy = document.querySelector('#reaction-copy');
  connectEvents(player, {
    onPresence: count => { presence.textContent = String(count); },
    onReaction: reaction => { reactionCopy.textContent = reaction.bubble; },
  });

  const status = document.querySelector('#status');
  const streak = document.querySelector('#streak');
  const actionCount = document.querySelector('#action-count');
  for (const button of document.querySelectorAll('[data-action]')) {
    button.addEventListener('click', async () => {
      button.disabled = true;
      status.textContent = 'Sending ripples…';
      try {
        const action = button.dataset.action;
        const result = await fetch(`/act/${action}`, { method: 'POST', headers: { Accept: 'application/json' } });
        if (!result.ok) throw new Error('action failed');
        const body = await result.json();
        streak.textContent = String(body.personal.streak);
        actionCount.textContent = String(body.personal.actions);
        status.textContent = 'Momó noticed.';
      } catch {
        status.textContent = 'The water went still. Try once more.';
      } finally {
        button.disabled = false;
      }
    });
  }

  const eager = Object.keys(atlas).filter(key => atlas[key].eager);
  await player.load(eager);
  player.start();
}

startAquarium().catch(() => {
  const status = document.querySelector('#status');
  if (status) status.textContent = 'Momó is hiding behind the seaweed.';
});
