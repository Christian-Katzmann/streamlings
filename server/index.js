// Streamlings server: one pet, many watchers, an image that never finishes loading.
// Routes:
//   GET /stage.gif        the endless stream (this is the pet)
//   GET /act/feed|pat|play input via link-click; sets feeder cookie; pet-house bounce page
//   GET /healthz
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { Pet } from './pet.js';
import { Composer } from './compose.js';
import { handshake, encodeFrame } from './gif-stream.js';

const PORT = Number(process.env.PORT || 8787);
const ASSET_DIR = process.env.STREAM_ASSETS || path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', 'assets');
const BACK_URL = process.env.BACK_URL || 'https://github.com/Christian-Katzmann/streamlings';
const DATA = process.env.DATA_DIR || path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', 'data');
const TICK_MS = 100; // 10 fps
const BASE = process.env.BASE_PATH || ''; // external prefix when behind a path route (e.g. /momo)

fs.mkdirSync(DATA, { recursive: true });
const ledgerPath = path.join(DATA, 'ledger.json');
const ledger = fs.existsSync(ledgerPath) ? JSON.parse(fs.readFileSync(ledgerPath, 'utf8')) : { feeders: {}, totals: { feed: 0, pat: 0, play: 0 } };
let saveTimer = null;
const saveLedger = () => { clearTimeout(saveTimer); saveTimer = setTimeout(() => fs.writeFileSync(ledgerPath, JSON.stringify(ledger)), 500); };

const pet = new Pet(ASSET_DIR);
const composer = new Composer(ASSET_DIR, { ink: pet.ink, paper: pet.paper });
const conns = new Set();
let ticker = null;

function startTicker() {
  if (ticker) return;
  ticker = setInterval(() => {
    const frame = pet.tick(composer);
    const bytes = encodeFrame(frame, pet.width, pet.height, pet.palette, TICK_MS);
    for (const res of conns) {
      if (res.writableLength > 1 << 20) { res.destroy(); continue; } // drop slow readers
      res.write(bytes);
    }
  }, TICK_MS);
}
function stopTickerIfIdle() {
  if (conns.size === 0 && ticker) { clearInterval(ticker); ticker = null; }
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

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://x`);

  if (url.pathname === '/stage.gif') {
    res.writeHead(200, {
      'Content-Type': 'image/gif',
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      'Connection': 'keep-alive',
    });
    res.write(handshake(pet.width, pet.height));
    conns.add(res);
    pet.onViewers(conns.size);
    startTicker();
    req.on('close', () => { conns.delete(res); pet.onViewers(conns.size); stopTickerIfIdle(); });
    return;
  }

  const act = url.pathname.match(/^\/act\/(feed|pat|play)$/)?.[1];
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
    const back = /^https:\/\/github\.com\//.test(url.searchParams.get('back') || '') ? url.searchParams.get('back') : BACK_URL;
    res.writeHead(200, headers);
    res.end(housePage(act, back));
    return;
  }

  if (url.pathname === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, viewers: conns.size, clip: pet.clip.key, totals: ledger.totals }));
    return;
  }

  res.writeHead(302, { Location: BACK_URL });
  res.end();
});

server.listen(PORT, () => console.log(`streamlings: momó is live on :${PORT} (assets: ${ASSET_DIR})`));
