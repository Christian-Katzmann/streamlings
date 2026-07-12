// Streamlings server v2: one pet, many synchronized channels, an image that never
// finishes loading.
//
// Streams (GET, endless GIF):
//   /stage.gif            the pet's main stage (empty card while Momó naps next door)
//   /room/bedroom.gif     the dollhouse bedroom (Momó is in exactly one room at a time)
//   /banner/top.gif       wide divider that erupts in fireworks on star/fork
//   /banner/bottom.gif    same, keeps the whole page celebrating
//   /px/top|mid|deep.gif  tiny lazy-loaded sensor strips: connecting = that scroll zone
//                         is on screen (drives presence + gaze)
//   /px/boop.gif          hidden inside <details>: opening it loads this = a boop
// Input (GET, link clicks):
//   /act/feed|pat|play    cookie ledger + pet-house bounce page
// Machinery:
//   POST /hooks/github    HMAC-verified repo webhook (star/fork/push/issues/…)
//   GET /diary/line       today's diary line (fetched by the daily Action)
//   GET /healthz
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Pet } from './pet.js';
import { Composer } from './compose.js';
import { handshake, encodeFrame } from './gif-stream.js';
import { verifySignature, handleEvent } from './hooks.js';

const PORT = Number(process.env.PORT || 8787);
const ASSET_DIR = process.env.STREAM_ASSETS || path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', 'assets');
const BACK_URL = process.env.BACK_URL || 'https://github.com/Christian-Katzmann/streamlings';
const DATA = process.env.DATA_DIR || path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', 'data');
const BASE = process.env.BASE_PATH || '';
const REPO_SLUG = process.env.REPO_SLUG || 'Christian-Katzmann/streamlings';
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || '';
const TICK_MS = 100; // 10 fps
const WINDOW_MS = Number(process.env.STREAM_WINDOW_MS || 70000);
const PX_WINDOW_MS = Number(process.env.PX_WINDOW_MS || 90000);

fs.mkdirSync(DATA, { recursive: true });
const ledgerPath = path.join(DATA, 'ledger.json');
const ledger = fs.existsSync(ledgerPath) ? JSON.parse(fs.readFileSync(ledgerPath, 'utf8')) : {};
ledger.feeders ||= {};
ledger.totals ||= { feed: 0, pat: 0, play: 0 };
ledger.metab ||= { commits: 0, stars: 0, forks: 0, whispers: 0, boops: 0 };
ledger.recent ||= [];
let saveTimer = null;
const saveLedger = () => { clearTimeout(saveTimer); saveTimer = setTimeout(() => fs.writeFileSync(ledgerPath, JSON.stringify(ledger)), 500); };

const pet = new Pet(ASSET_DIR);
const composer = new Composer(ASSET_DIR, { ink: pet.ink, paper: pet.paper });

// ---- channels: named synchronized streams off one shared pet state -----------------
const BANNER_W = 900, BANNER_H = 110, PX_W = 72, PX_H = 14;
let phase = 0;
const channels = {
  stage: {
    w: () => pet.width, h: () => pet.height, window: WINDOW_MS, every: 1,
    render: (stageFrame) => pet.room === 'stage'
      ? stageFrame
      : composer.emptyRoom(pet.width, pet.height, 'gone napping, next room over'),
  },
  bedroom: {
    w: () => pet.width, h: () => pet.height, window: WINDOW_MS, every: 1,
    render: (stageFrame) => pet.room === 'bedroom'
      ? stageFrame
      : composer.emptyRoom(pet.width, pet.height, 'nobody here but the teddy'),
  },
  bannerTop: {
    w: () => BANNER_W, h: () => BANNER_H, window: WINDOW_MS, every: 2,
    render: () => composer.banner(BANNER_W, BANNER_H, pet.celebration, phase),
  },
  bannerBottom: {
    w: () => BANNER_W, h: () => BANNER_H, window: WINDOW_MS, every: 2,
    render: () => composer.banner(BANNER_W, BANNER_H, pet.celebration, phase + 30),
  },
  pxTop: { w: () => PX_W, h: () => PX_H, window: PX_WINDOW_MS, every: 10, render: () => composer.sensorStrip(PX_W, PX_H, phase) },
  pxMid: { w: () => PX_W, h: () => PX_H, window: PX_WINDOW_MS, every: 10, render: () => composer.sensorStrip(PX_W, PX_H, phase) },
  pxDeep: { w: () => PX_W, h: () => PX_H, window: PX_WINDOW_MS, every: 10, render: () => composer.sensorStrip(PX_W, PX_H, phase) },
  pxBoop: { w: () => PX_W, h: () => PX_H, window: 8000, every: 10, render: () => composer.sensorStrip(PX_W, PX_H, phase * 3) },
};
for (const ch of Object.values(channels)) ch.conns = new Map();

// gaze fusion: deepest visible sensor zone pulls the pupils down; recent clicks pull sideways
let clickDx = 0, clickDxUntil = 0;
function updateGaze() {
  const zones = [['pxDeep', 3], ['pxMid', 2], ['pxTop', 1]];
  let dy = 0;
  for (const [name, v] of zones) if (channels[name].conns.size > 0) { dy = v; break; }
  pet.gaze.dy = dy;
  pet.gaze.dx = Date.now() < clickDxUntil ? clickDx : 0;
}

function totalMainViewers() {
  return channels.stage.conns.size + channels.bedroom.conns.size;
}

let ticker = null;
function anyConns() { return Object.values(channels).some(ch => ch.conns.size > 0); }
function startTicker() {
  if (ticker) return;
  ticker = setInterval(() => {
    phase++;
    updateGaze();
    const stageFrame = pet.tick(composer); // advance the brain exactly once per tick
    const now = Date.now();
    for (const ch of Object.values(channels)) {
      if (ch.conns.size === 0) continue;
      if (phase % ch.every !== 0) continue;
      const frame = ch.render(stageFrame);
      const delay = TICK_MS * ch.every;
      const bytes = encodeFrame(frame, ch.w(), ch.h(), pet.palette, delay);
      let farewell = null;
      for (const [res, started] of ch.conns) {
        if (res.writableLength > 1 << 20) { res.destroy(); continue; }
        if (now - started > ch.window) {
          if (!farewell) {
            const ff = frame.slice();
            if (ch === channels.stage) composer.bubble(ff, ch.w(), ch.h(), 'nap time! tap a button or refresh me');
            farewell = encodeFrame(ff, ch.w(), ch.h(), pet.palette, delay);
          }
          res.write(farewell);
          res.end(); // graceful close: browser keeps the goodbye card as the final frame
          continue;
        }
        res.write(bytes);
      }
    }
    if (!anyConns()) { clearInterval(ticker); ticker = null; }
  }, TICK_MS);
}

function openStream(ch, res, onclose) {
  res.writeHead(200, {
    'Content-Type': 'image/gif',
    'Cache-Control': 'no-store, no-cache, must-revalidate, private',
    'Connection': 'keep-alive',
  });
  res.write(handshake(ch.w(), ch.h()));
  ch.conns.set(res, Date.now());
  startTicker();
  res.on('close', () => { ch.conns.delete(res); if (onclose) onclose(); });
}

function cookies(req) {
  return Object.fromEntries((req.headers.cookie || '').split(';').map(s => s.trim().split('=')).filter(p => p[0]));
}
function ordinal(n) { return n + (['th','st','nd','rd'][((n % 100) - 20) % 10] || ['th','st','nd','rd'][n % 100] || 'th'); }

function housePage(kind, back) {
  return `<!doctype html><meta charset="utf-8">
<meta http-equiv="refresh" content="1.6;url=${back}">
<title>Momó's house</title>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#faf8f3;font-family:ui-rounded,'Comic Sans MS',sans-serif;color:#111">
<div style="text-align:center">
<img src="${BASE}/stage.gif" width="280" height="280" alt="Momó, live" style="image-rendering:auto">
<p style="font-size:20px;margin:8px 0 2px">${{ feed: 'nom nom nom…', pat: '♥', play: 'wheee!' }[kind] ?? '…'}</p>
<p style="font-size:13px;opacity:.55">taking you back <a href="${back}" style="color:inherit">now</a></p>
</div></body>`;
}

function diaryLine() {
  const d = new Date().toISOString().slice(0, 10);
  const m = ledger.metab, t = ledger.totals;
  const moodTxt = { sunny: 'mood: sunny', rain: 'mood: rainy (the build was red)', fleas: 'mood: itchy (fleas in the deps)' }[pet.mood];
  const latest = ledger.recent.slice(-1)[0];
  const social = latest ? ` last visitor of note: @${latest.login} (${latest.kind}).` : '';
  return `${d} — ate ${t.feed} meals so far, nommed ${m.commits} commits, collected ${m.stars} stars and ${m.forks} little ones. ${moodTxt}.${social}`;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;

  // --- streams ---
  if (p === '/stage.gif') { openStream(channels.stage, res, () => pet.onViewers(totalMainViewers())); pet.onViewers(totalMainViewers()); return; }
  if (p === '/room/bedroom.gif') { openStream(channels.bedroom, res, () => pet.onViewers(totalMainViewers())); pet.onViewers(totalMainViewers()); return; }
  if (p === '/banner/top.gif') { openStream(channels.bannerTop, res); return; }
  if (p === '/banner/bottom.gif') { openStream(channels.bannerBottom, res); return; }
  const px = p.match(/^\/px\/(top|mid|deep|boop)\.gif$/)?.[1];
  if (px) {
    const ch = channels['px' + px[0].toUpperCase() + px.slice(1)];
    if (px === 'boop') { ledger.metab.boops++; saveLedger(); pet.react('boop'); }
    openStream(ch, res);
    return;
  }

  // --- link-click input ---
  const act = p.match(/^\/act\/(feed|pat|play)$/)?.[1];
  if (act) {
    const c = cookies(req);
    let fid = c.momo_fid;
    const headers = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' };
    if (!fid) {
      fid = crypto.randomUUID();
      headers['Set-Cookie'] = `momo_fid=${fid}; Max-Age=31536000; Path=/; SameSite=Lax`;
    }
    const f = (ledger.feeders[fid] ||= { feed: 0, pat: 0, play: 0, first: Date.now() });
    f[act]++; f.last = Date.now();
    ledger.totals[act]++;
    saveLedger();
    // timing-correlation personalization: the clicker is the plausible watcher right now
    let bubble = null;
    if (act === 'feed' && f.feed > 1) bubble = `ah, you again! ${ordinal(f.feed)} time ♥`;
    pet.react(act, bubble);
    clickDx = { feed: -1, pat: 0, play: 1 }[act]; clickDxUntil = Date.now() + 12000;
    const back = /^https:\/\/github\.com\//.test(url.searchParams.get('back') || '') ? url.searchParams.get('back') : BACK_URL;
    res.writeHead(200, headers);
    res.end(housePage(act, back));
    return;
  }

  // --- webhook ---
  if (p === '/hooks/github' && req.method === 'POST') {
    let body = [];
    req.on('data', c => { body.push(c); if (Buffer.concat(body).length > 1 << 20) req.destroy(); });
    req.on('end', () => {
      const raw = Buffer.concat(body);
      if (!verifySignature(WEBHOOK_SECRET, raw, req.headers['x-hub-signature-256'])) {
        res.writeHead(401); res.end('bad signature'); return;
      }
      let payload;
      try { payload = JSON.parse(raw.toString('utf8')); } catch { res.writeHead(400); res.end(); return; }
      const result = handleEvent(req.headers['x-github-event'], payload, pet, ledger, saveLedger);
      startTicker(); // a celebration must animate even if the ticker was idle
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end(result);
    });
    return;
  }

  // --- misc ---
  if (p === '/diary/line') { res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end(diaryLine()); return; }
  if (p === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      ok: true, clip: pet.clip.key, room: pet.room, mood: pet.mood,
      celebration: pet.celebration?.text ?? null,
      viewers: Object.fromEntries(Object.entries(channels).map(([k, ch]) => [k, ch.conns.size])),
      totals: ledger.totals, metab: ledger.metab,
    }));
    return;
  }

  res.writeHead(302, { Location: BACK_URL });
  res.end();
});

// CI mood poller: public API, no token, every 5 minutes (webhook workflow_run is the
// fast path; this is the belt-and-suspenders catch-up)
async function pollCI() {
  try {
    const r = await fetch(`https://api.github.com/repos/${REPO_SLUG}/actions/runs?branch=main&per_page=1&status=completed`, {
      headers: { 'User-Agent': 'streamlings-pet' },
    });
    if (!r.ok) return;
    const j = await r.json();
    const concl = j.workflow_runs?.[0]?.conclusion;
    if (concl === 'failure' && pet.mood === 'sunny') pet.mood = 'rain';
    if (concl === 'success' && pet.mood === 'rain') pet.mood = 'sunny';
  } catch { /* offline is fine; mood just doesn't update */ }
}
setInterval(pollCI, 5 * 60 * 1000);
pollCI();

server.listen(PORT, () => console.log(`streamlings v2: momó is live on :${PORT} (assets: ${ASSET_DIR}, hooks: ${WEBHOOK_SECRET ? 'armed' : 'NO SECRET'})`));
