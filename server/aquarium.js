import { sanitizeLogin } from './hooks.js';

const ACTION_KINDS = ['feed', 'pat', 'play'];
const REACTION_KINDS = [...ACTION_KINDS, 'wake', 'boop', 'build', 'star', 'fork', 'whisper'];
const VISITOR_LABEL = {
  star: 'left a star',
  fork: 'made a little one',
  whisper: 'sent a whisper',
};

const escapeHTML = value => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

function dayKey(now) {
  const date = now instanceof Date ? now : new Date(now);
  if (!Number.isFinite(date.getTime())) throw new Error('invalid streak clock');
  return date.toISOString().slice(0, 10);
}

export function touchStreak(feeder, now = Date.now()) {
  feeder.streak ||= { days: 0, lastDay: null };
  const today = dayKey(now);
  if (feeder.streak.lastDay === today) return feeder.streak;

  const previous = feeder.streak.lastDay
    ? Date.parse(`${feeder.streak.lastDay}T00:00:00Z`)
    : NaN;
  const current = Date.parse(`${today}T00:00:00Z`);
  feeder.streak.days = current - previous === 86_400_000
    ? Math.max(1, Number(feeder.streak.days) || 0) + 1
    : 1;
  feeder.streak.lastDay = today;
  return feeder.streak;
}

export function renderRecentVisitors(recent = []) {
  const entries = recent.slice(-8).reverse().map(entry => {
    const login = sanitizeLogin(entry?.login);
    const label = VISITOR_LABEL[entry?.kind] || 'stopped by';
    return `<li><span>@${escapeHTML(login)}</span><small>${label}</small></li>`;
  });
  return entries.length ? entries.join('') : '<li class="empty">The water is quiet. Be the first visitor of note.</li>';
}

export function renderAquariumPage(ledger, { fid = '' } = {}) {
  const feeder = ledger.feeders?.[fid] || {};
  const streak = Math.max(0, Number(feeder.streak?.days) || 0);
  const actions = ACTION_KINDS.reduce((sum, kind) => sum + (Number(feeder[kind]) || 0), 0);
  const visitors = renderRecentVisitors(ledger.recent || []);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#f3ead8">
  <title>Momó's Aquarium</title>
  <style>
    :root { color-scheme: light; --paper:#f3ead8; --paper-deep:#e2d1b3; --ink:#24221f; --coral:#de6b57; --water:#84b8b4; --water-dark:#397c79; }
    * { box-sizing:border-box; }
    body { margin:0; min-height:100vh; color:var(--ink); background:var(--paper); font-family:ui-rounded,"Arial Rounded MT Bold",system-ui,sans-serif; }
    body::before { content:""; position:fixed; inset:0; pointer-events:none; opacity:.24; background-image:radial-gradient(#8f826d 0.55px,transparent 0.7px); background-size:7px 7px; }
    main { position:relative; width:min(1080px,calc(100% - 32px)); margin:auto; padding:34px 0 54px; }
    header { display:flex; align-items:end; justify-content:space-between; gap:24px; margin-bottom:24px; }
    .eyebrow { margin:0 0 5px; color:var(--water-dark); font-size:.78rem; font-weight:850; letter-spacing:.16em; text-transform:uppercase; }
    h1 { margin:0; font-family:Georgia,serif; font-size:clamp(2.2rem,6vw,4.8rem); font-weight:500; line-height:.92; letter-spacing:-.055em; }
    .presence { display:flex; align-items:center; gap:9px; padding:9px 13px; border:1.5px solid var(--ink); border-radius:999px; background:#f8f1e4; box-shadow:3px 3px 0 var(--ink); white-space:nowrap; }
    .presence i { width:10px; height:10px; border-radius:50%; background:var(--coral); box-shadow:0 0 0 4px #de6b5730; }
    .tank { display:grid; grid-template-columns:minmax(300px,1.15fr) minmax(260px,.85fr); border:2px solid var(--ink); border-radius:30px 30px 18px 18px; overflow:hidden; background:#ecf5ef; box-shadow:9px 10px 0 var(--ink); }
    .water { position:relative; min-height:530px; display:grid; place-items:center; overflow:hidden; background:linear-gradient(180deg,#b9dad0 0 11%,#d9e8d8 11% 100%); border-right:2px solid var(--ink); }
    .water::before { content:""; position:absolute; top:8%; left:-5%; width:110%; height:22px; border-top:3px solid #4c8d87; border-radius:50%; opacity:.55; }
    .water::after { content:""; position:absolute; inset:auto -10% -46px; height:120px; background:var(--paper-deep); border-top:2px solid var(--ink); border-radius:50% 50% 0 0; }
    canvas { position:relative; z-index:1; display:block; width:min(92%,480px); height:auto; image-rendering:auto; filter:drop-shadow(0 12px 0 #2d514518); }
    .bubble { position:absolute; z-index:2; top:20px; right:20px; max-width:62%; margin:0; padding:10px 14px; border:1.5px solid var(--ink); border-radius:18px 18px 3px 18px; background:#fffaf0; box-shadow:3px 3px 0 var(--ink); font-family:Georgia,serif; font-style:italic; }
    .panel { padding:clamp(25px,4vw,43px); display:flex; flex-direction:column; justify-content:center; background:#fff8eb; }
    .panel h2,.visitors h2 { margin:0 0 9px; font-family:Georgia,serif; font-size:clamp(1.7rem,3vw,2.45rem); font-weight:500; letter-spacing:-.035em; }
    .lede { margin:0 0 24px; color:#5f584f; line-height:1.55; }
    .actions { display:grid; grid-template-columns:repeat(3,1fr); gap:9px; }
    button { appearance:none; padding:12px 8px; border:1.5px solid var(--ink); border-radius:12px; color:var(--ink); background:var(--paper); box-shadow:3px 3px 0 var(--ink); font:inherit; font-weight:800; cursor:pointer; transition:transform .12s,box-shadow .12s; }
    button:hover { transform:translate(2px,2px); box-shadow:1px 1px 0 var(--ink); }
    button:focus-visible { outline:3px solid var(--coral); outline-offset:3px; }
    button:disabled { opacity:.55; cursor:wait; }
    .keepsake { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:26px; }
    .stat { padding:14px; border:1.5px dashed #817667; border-radius:13px; }
    .stat strong { display:block; font-family:Georgia,serif; font-size:1.65rem; font-weight:500; }
    .stat span { color:#6a6258; font-size:.78rem; text-transform:uppercase; letter-spacing:.08em; }
    #status { min-height:1.5em; margin:16px 0 0; color:var(--water-dark); font-size:.9rem; }
    .visitors { margin-top:34px; padding:24px 26px; border:2px solid var(--ink); border-radius:18px; background:#f9f1e4; }
    .visitors ul { display:grid; grid-template-columns:repeat(4,1fr); gap:10px; margin:18px 0 0; padding:0; list-style:none; }
    .visitors li { min-width:0; padding:12px; border-left:4px solid var(--coral); background:#fffaf0; }
    .visitors li span,.visitors li small { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .visitors li span { font-weight:850; }
    .visitors li small { margin-top:3px; color:#746a5d; }
    .visitors li.empty { grid-column:1/-1; border-left-color:var(--water); color:#746a5d; }
    footer { margin-top:25px; text-align:center; color:#70685e; font-size:.86rem; }
    footer a { color:inherit; text-underline-offset:3px; }
    @media (max-width:760px) { header { align-items:start; flex-direction:column; } .tank { grid-template-columns:1fr; } .water { min-height:390px; border-right:0; border-bottom:2px solid var(--ink); } .panel { padding:27px 22px 31px; } .visitors ul { grid-template-columns:1fr 1fr; } }
    @media (max-width:430px) { main { width:min(100% - 20px,1080px); padding-top:22px; } .actions { grid-template-columns:1fr; } .visitors ul { grid-template-columns:1fr; } }
  </style>
</head>
<body>
  <main>
    <header>
      <div><p class="eyebrow">Live from the repository</p><h1>Momó's Aquarium</h1></div>
      <div class="presence" aria-live="polite"><i aria-hidden="true"></i><span><strong id="presence-count">1</strong> here now</span></div>
    </header>
    <section class="tank" aria-label="Momó's live aquarium">
      <div class="water">
        <canvas id="momo" width="400" height="400" aria-label="Momó, an animated pet"></canvas>
        <p class="bubble" id="reaction-copy" aria-live="polite">oh, hello!</p>
      </div>
      <div class="panel">
        <p class="eyebrow">The glass is open</p>
        <h2>Say hello.</h2>
        <p class="lede">Feed Momó, give a gentle pat, or start a game. Everyone in the Aquarium sees the reaction as it happens.</p>
        <div class="actions" aria-label="Play with Momó">
          <button type="button" data-action="feed">Feed</button>
          <button type="button" data-action="pat">Pat</button>
          <button type="button" data-action="play">Play</button>
        </div>
        <div class="keepsake">
          <div class="stat"><strong id="streak">${streak}</strong><span>day streak · UTC</span></div>
          <div class="stat"><strong id="action-count">${actions}</strong><span>your visits</span></div>
        </div>
        <p id="status" role="status">Momó is listening.</p>
      </div>
    </section>
    <section class="visitors">
      <p class="eyebrow">Notes in the sand</p>
      <h2>Recent visitors</h2>
      <ul>${visitors}</ul>
    </section>
    <footer>Momó lives in <a href="https://github.com/Christian-Katzmann/streamlings">Streamlings</a>. The Aquarium uses only first-party resources.</footer>
  </main>
  <script type="module" src="/aquarium-player.js"></script>
</body>
</html>`;
}

export function createAquariumCatalog(pet, stripStore, { frameCap = 16, reactionFrameCap = 8, idleLimit = 4 } = {}) {
  const selected = new Map();
  const add = (clip, { idle = false, reaction = false } = {}) => {
    if (!clip) return;
    const current = selected.get(clip.key) || { clip, idle: false, reaction: false };
    current.idle ||= idle;
    current.reaction ||= reaction;
    selected.set(clip.key, current);
  };

  for (const clip of (pet.pools?.idle || []).slice(0, idleLimit)) add(clip, { idle: true });
  if (!selected.size) add(pet.manifest?.[0], { idle: true });
  for (const kind of REACTION_KINDS) {
    for (const clip of pet.clipsFor?.(kind) || []) add(clip, { reaction: true });
  }

  const atlas = {};
  const strips = new Map();
  for (const { clip, idle, reaction } of selected.values()) {
    const cap = idle ? frameCap : reactionFrameCap;
    const frames = Math.max(1, Math.min(cap, Number(clip.frames) || 1));
    const src = `/strips/${encodeURIComponent(clip.key)}-${frames}.png`;
    atlas[clip.key] = { src, frames, fps: Number(clip.fps) || 12, idle, eager: idle };
    strips.set(src, { clip, frames });
  }
  return { atlas, strips };
}

export class AquariumEvents {
  constructor({ pingMs = 25_000 } = {}) {
    this.clients = new Set();
    this.timer = setInterval(() => this.comment('ping'), pingMs);
    this.timer.unref?.();
  }

  add(req, res) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write('retry: 3000\n\n');
    this.clients.add(res);
    this.broadcast('presence', { count: this.clients.size });

    let removed = false;
    const remove = () => {
      if (removed) return;
      removed = true;
      this.clients.delete(res);
      this.broadcast('presence', { count: this.clients.size });
    };
    req.once('close', remove);
    res.once('close', remove);
  }

  broadcast(event, payload) {
    const message = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
    for (const client of [...this.clients]) {
      try { client.write(message); }
      catch { this.clients.delete(client); }
    }
  }

  reaction(scene) {
    this.broadcast('reaction', {
      kind: scene.kind,
      clip: scene.clip.key,
      bubble: scene.bubble || 'oh!',
      loops: 2,
    });
  }

  comment(text) {
    for (const client of [...this.clients]) {
      try { client.write(`: ${text}\n\n`); }
      catch { this.clients.delete(client); }
    }
  }

  close() {
    clearInterval(this.timer);
    for (const client of this.clients) client.end();
    this.clients.clear();
  }
}
