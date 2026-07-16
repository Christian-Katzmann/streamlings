// Streamlings v3: complete, self-looping GIF scenes designed around GitHub Camo's
// measured ~4.3 second upstream cutoff.
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Pet } from './pet.js';
import { Composer } from './compose.js';
import { encodeLoop, encodeEpisode } from './gif-stream.js';
import { verifySignature, handleEvent } from './hooks.js';
import { buildStageDocument, createBubbleEncoder, createStripStore } from './svg-stage.js';

const PORT = Number(process.env.PORT || 8787);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const ASSET_DIR = process.env.STREAM_ASSETS || path.join(ROOT, 'assets');
const BACK_URL = process.env.BACK_URL || 'https://github.com/Christian-Katzmann/streamlings';
const DATA = process.env.DATA_DIR || path.join(ROOT, 'data');
const REPO_SLUG = process.env.REPO_SLUG || 'Christian-Katzmann/streamlings';
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || '';
const MAX_BODY = 1 << 20;
const BANNER_W = 900, BANNER_H = 110, PX_W = 72, PX_H = 14;
const EPISODE_SCENES = Number(process.env.EPISODE_SCENES || 12);
const EPISODE_VARIANTS = Number(process.env.EPISODE_VARIANTS || 3);
const EPISODE_FRAMES_PER_SCENE = Number(process.env.EPISODE_FRAMES_PER_SCENE || 18);
const TTL = {
  action: 60_000,
  build: 2 * 60_000,
  whisper: 10 * 60_000,
  social: 30 * 60_000,
};

fs.mkdirSync(DATA, { recursive: true });
const ledgerPath = path.join(DATA, 'ledger.json');
const ledger = fs.existsSync(ledgerPath) ? JSON.parse(fs.readFileSync(ledgerPath, 'utf8')) : {};
ledger.feeders ||= {};
ledger.totals ||= { feed: 0, pat: 0, play: 0 };
ledger.metab ||= { commits: 0, stars: 0, forks: 0, whispers: 0, boops: 0 };
ledger.recent ||= [];
ledger.flags ||= { fleas: false, ciRed: false };
ledger.alerts ||= {};

let saveTimer = null;
function saveLedger() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const tmp = `${ledgerPath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(ledger));
    fs.renameSync(tmp, ledgerPath);
  }, 100);
}

const pet = new Pet(ASSET_DIR, ledger.flags);
const composer = new Composer(ASSET_DIR, { ink: pet.ink, paper: pet.paper });
const stripStore = createStripStore(pet, { dataDir: DATA });
const bubbleDataURI = createBubbleEncoder(composer, pet.palette);
const gifCache = new Map();
let featuredGif = null;
let featuredGifKey = null;

function episodeGif(scenes) {
  return encodeEpisode(scenes, pet.width, pet.height, pet.palette, {
    framesPerScene: EPISODE_FRAMES_PER_SCENE,
    composer,
  });
}

const episodePools = { sunny: [], rain: [], fleas: [] };
const episodeCursor = { sunny: 0, rain: 0, fleas: 0 };
const episodeCacheKey = crypto.createHash('sha256').update(JSON.stringify({
  version: 2,
  scenes: EPISODE_SCENES,
  framesPerScene: EPISODE_FRAMES_PER_SCENE,
  manifest: pet.manifest.map(clip => [clip.key, clip.frames]),
  palette: pet.palette,
})).digest('hex').slice(0, 12);
const episodeCacheDir = path.join(DATA, 'episodes', episodeCacheKey);
fs.mkdirSync(episodeCacheDir, { recursive: true });

function cachedEpisode(mood, index) {
  const file = path.join(episodeCacheDir, `${mood}-${index}.gif`);
  if (fs.existsSync(file)) return fs.readFileSync(file);
  const scenes = [pet.scene('wake'), ...pet.episodeScenes(EPISODE_SCENES - 1, mood)];
  const bytes = episodeGif(scenes);
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, bytes);
  fs.renameSync(tmp, file);
  return bytes;
}

const episodeStarted = Date.now();
for (let i = 0; i < EPISODE_VARIANTS; i++) episodePools.sunny.push(cachedEpisode('sunny', i));
episodePools.rain.push(cachedEpisode('rain', 0));
episodePools.fleas.push(cachedEpisode('fleas', 0));
console.log(`episodes ready: ${EPISODE_VARIANTS + 2} variants, ${EPISODE_SCENES} scenes each, ${Date.now() - episodeStarted}ms`);

const paperRGB = pet.palette[pet.paper] || [246, 241, 231];
const stageStarted = Date.now();
const stage = buildStageDocument(pet, {
  stripDataURI: stripStore.dataURI,
  bubbleDataURI,
  bubble: { text: pet.defaultBubble('wake') || 'oh, hello!', at: 1.5, seconds: 6 },
  paper: `rgb(${paperRGB.join(' ')})`,
});
console.log(`SVG stage ready: ${stage.segments.length} segments, ${stage.uniqueClips} unique clips, ${Buffer.byteLength(stage.svg)}B, ${Date.now() - stageStarted}ms`);

function cacheGif(key, build) {
  if (gifCache.has(key)) return gifCache.get(key);
  const bytes = build();
  gifCache.set(key, bytes);
  if (gifCache.size > 32) gifCache.delete(gifCache.keys().next().value);
  return bytes;
}

function activeFeature() {
  if (!ledger.featured) return null;
  if (ledger.featured.until > Date.now()) return ledger.featured;
  delete ledger.featured;
  featuredGif = null;
  featuredGifKey = null;
  saveLedger();
  return null;
}

// Actor-triggered reactions play first: the person who pressed feed lands back on the
// README mid-nom. Webhook events keep the greeting first — that viewer arrives later.
const REACTION_FIRST = new Set(['feed', 'pat', 'play', 'boop']);
function featureScenes(kind, scene) {
  return REACTION_FIRST.has(kind) ? [scene, pet.scene('wake')] : [pet.scene('wake'), scene];
}

function feature(kind, bubble, ttl = TTL.action) {
  const scene = pet.scene(kind, bubble);
  ledger.featured = {
    kind,
    clipId: scene.clip.id,
    bubble: scene.bubble,
    at: Date.now(),
    until: Date.now() + ttl,
  };
  featuredGifKey = `${kind}:${scene.clip.id}:${scene.bubble || ''}`;
  featuredGif = episodeGif(featureScenes(kind, scene));
  saveLedger();
  return scene;
}

function featureEpisodeGif(featured) {
  const key = `${featured.kind}:${featured.clipId}:${featured.bubble || ''}`;
  if (featuredGif && featuredGifKey === key) return featuredGif;
  const scene = pet.scene(featured.kind, featured.bubble, featured.clipId);
  featuredGifKey = key;
  featuredGif = episodeGif(featureScenes(featured.kind, scene));
  return featuredGif;
}

function nextIdleEpisode() {
  const mood = pet.mood;
  const pool = episodePools[mood] || episodePools.sunny;
  return pool[episodeCursor[mood]++ % pool.length];
}

function sceneGif(scene) {
  const key = `scene:${scene.clip.id}:${scene.bubble || ''}`;
  return cacheGif(key, () => encodeLoop(scene.frames, pet.width, pet.height, pet.palette, {
    fps: scene.clip.fps || 12,
    maxFrames: 36,
    bubble: scene.bubble,
    composer,
  }));
}

function bannerGif(featured, phaseOffset = 0) {
  const social = featured && ['star', 'fork'].includes(featured.kind) ? featured : null;
  const key = `banner:${social?.kind || 'calm'}:${social?.bubble || ''}:${phaseOffset}`;
  return cacheGif(key, () => {
    const celebration = social ? { text: social.bubble, kind: social.kind } : null;
    const frames = Array.from({ length: 24 }, (_, i) => composer.banner(BANNER_W, BANNER_H, celebration, i + phaseOffset));
    return encodeLoop(frames, BANNER_W, BANNER_H, pet.palette, { fps: 10, maxFrames: 24 });
  });
}

function sensorGif(name) {
  return cacheGif(`sensor:${name}`, () => {
    const frames = Array.from({ length: 8 }, (_, i) => composer.sensorStrip(PX_W, PX_H, i * 4));
    return encodeLoop(frames, PX_W, PX_H, pet.palette, { fps: 4, maxFrames: 8 });
  });
}

function sendGif(res, bytes) {
  res.writeHead(200, {
    'Content-Type': 'image/gif',
    'Content-Length': bytes.length,
    'Cache-Control': 'no-store, no-cache, must-revalidate, private',
  });
  res.end(bytes);
}

function cookies(req) {
  return Object.fromEntries((req.headers.cookie || '').split(';').map(s => s.trim().split('=')).filter(p => p[0]));
}
function ordinal(n) { return n + (['th','st','nd','rd'][((n % 100) - 20) % 10] || ['th','st','nd','rd'][n % 100] || 'th'); }

// The bounce lands at the README card (#readme), not the repo's file listing — the
// browser should return the visitor to a pet that is already mid-reaction.
function safeBack(raw) {
  let url;
  try {
    url = new URL(raw);
    if (url.protocol !== 'https:' || !['github.com', 'www.github.com'].includes(url.hostname)) url = new URL(BACK_URL);
  } catch { url = new URL(BACK_URL); }
  url.hash = 'readme';
  return url.href;
}

function diaryLine() {
  const d = new Date().toISOString().slice(0, 10);
  const m = ledger.metab, t = ledger.totals;
  const mood = { sunny: 'sunny', rain: 'rainy (the build was red)', fleas: 'itchy (dependency alerts)' }[pet.mood];
  const latest = ledger.recent.slice(-1)[0];
  const social = latest ? ` last visitor of note: @${latest.login} (${latest.kind}).` : '';
  return `${d} — ate ${t.feed} meals, nommed ${m.commits} commits, collected ${m.stars} stars and ${m.forks} little ones. mood: ${mood}.${social}`;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;

  if (p === '/stage.gif') {
    const featured = activeFeature();
    sendGif(res, featured ? featureEpisodeGif(featured) : nextIdleEpisode());
    return;
  }
  if (p === '/stage.svg') {
    res.writeHead(200, {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Content-Length': Buffer.byteLength(stage.svg),
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
    });
    res.end(stage.svg);
    return;
  }
  if (p === '/room/bedroom.gif') { sendGif(res, nextIdleEpisode()); return; }
  if (p === '/banner/top.gif') { sendGif(res, bannerGif(activeFeature())); return; }
  if (p === '/banner/bottom.gif') { sendGif(res, bannerGif(activeFeature(), 12)); return; }
  if (/^\/px\/(top|mid|deep)\.gif$/.test(p)) { sendGif(res, sensorGif(p)); return; }
  if (p === '/boop.gif') {
    ledger.metab.boops++;
    saveLedger();
    sendGif(res, sceneGif(pet.scene('boop')));
    return;
  }
  if (p === '/px/boop.gif') { // compatibility for already-rendered README copies
    ledger.metab.boops++;
    feature('boop', undefined, TTL.action);
    sendGif(res, sensorGif(p));
    return;
  }

  const act = p.match(/^\/act\/(feed|pat|play)$/)?.[1];
  if (act) {
    const c = cookies(req);
    let fid = c.momo_fid;
    // the reaction is armed BEFORE the redirect is sent, so the reloaded README's
    // stage fetch can never race it; the whole detour is one 302 blink
    const headers = { Location: safeBack(url.searchParams.get('back')), 'Cache-Control': 'no-store' };
    if (!fid || !/^[0-9a-f-]{36}$/.test(fid)) {
      fid = crypto.randomUUID();
      headers['Set-Cookie'] = `momo_fid=${fid}; Max-Age=31536000; Path=/; HttpOnly; Secure; SameSite=Lax`;
    }
    const feeder = (ledger.feeders[fid] ||= { feed: 0, pat: 0, play: 0, first: Date.now() });
    feeder[act]++;
    feeder.last = Date.now();
    ledger.totals[act]++;
    const bubble = act === 'feed' && feeder.feed > 1 ? `ah, you again! ${ordinal(feeder.feed)} time ♥` : undefined;
    feature(act, bubble, TTL.action);
    res.writeHead(302, headers);
    res.end();
    return;
  }

  if (p === '/wake') {
    if (!activeFeature()) feature('wake', undefined, TTL.action);
    res.writeHead(302, { Location: safeBack(url.searchParams.get('back')), 'Cache-Control': 'no-store' });
    res.end();
    return;
  }

  if (p === '/hooks/github' && req.method === 'POST') {
    const chunks = [];
    let size = 0, aborted = false;
    req.on('data', chunk => {
      if (aborted) return;
      size += chunk.length;
      if (size > MAX_BODY) { aborted = true; res.writeHead(413); res.end(); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (aborted) return;
      const raw = Buffer.concat(chunks);
      if (!verifySignature(WEBHOOK_SECRET, raw, req.headers['x-hub-signature-256'])) {
        res.writeHead(401); res.end('bad signature'); return;
      }
      let payload;
      try { payload = JSON.parse(raw.toString('utf8')); }
      catch { res.writeHead(400); res.end(); return; }
      const remember = (kind, bubble, ttlName) => feature(kind, bubble, TTL[ttlName] || TTL.action);
      const result = handleEvent(req.headers['x-github-event'], payload, pet, ledger, saveLedger, remember);
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end(result);
    });
    return;
  }

  if (p === '/diary/line') { res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end(diaryLine()); return; }
  if (p === '/healthz') {
    const featured = activeFeature();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      ok: true,
      delivery: 'bounded-loop',
      mood: pet.mood,
      flags: pet.flags,
      featured: featured ? { kind: featured.kind, bubble: featured.bubble, until: featured.until } : null,
      totals: ledger.totals,
      metab: ledger.metab,
    }));
    return;
  }

  res.writeHead(302, { Location: BACK_URL });
  res.end();
});

async function pollCI() {
  try {
    const response = await fetch(`https://api.github.com/repos/${REPO_SLUG}/actions/runs?branch=main&per_page=1&status=completed`, {
      headers: { 'User-Agent': 'streamlings-pet' },
    });
    if (!response.ok) return;
    const body = await response.json();
    const conclusion = body.workflow_runs?.[0]?.conclusion;
    if (conclusion === 'failure') pet.setFlag('ciRed', true);
    else if (conclusion === 'success') pet.setFlag('ciRed', false);
    saveLedger();
  } catch { /* keep the last known mood */ }
}
if (!process.env.DISABLE_CI_POLL) {
  setInterval(pollCI, 5 * 60 * 1000);
  pollCI();
}

server.listen(PORT, () => console.log(`streamlings v4: endless SVG stage on :${PORT} (hooks: ${WEBHOOK_SECRET ? 'armed' : 'NO SECRET'})`));
