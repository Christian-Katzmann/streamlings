// Streamlings v4: a first-party live Aquarium alongside the complete, self-looping
// GitHub Camo delivery paths.
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Pet } from './pet.js';
import { Composer } from './compose.js';
import { encodeLoop, encodeEpisode } from './gif-stream.js';
import { verifySignature, handleEvent } from './hooks.js';
import { buildStageDocument, createBubbleEncoder, createStripStore, renderStageSVG } from './svg-stage.js';
import { chooseIdleBubble, ensureState, selectFeature, storeFeature } from './state.js';
import { AquariumEvents, createAquariumCatalog, renderAquariumPage, touchStreak } from './aquarium.js';

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
ensureState(ledger);

let saveTimer = null;
function saveLedger() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const tmp = `${ledgerPath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(ledger));
    fs.renameSync(tmp, ledgerPath);
  }, 100);
}

const pet = new Pet(ASSET_DIR, ledger.flags, { unlockedSpawns: ledger.milestones.unlockedSpawns });
const composer = new Composer(ASSET_DIR, { ink: pet.ink, paper: pet.paper });
const stripStore = createStripStore(pet, { dataDir: DATA });
const aquariumCatalog = createAquariumCatalog(pet, stripStore);
const aquariumEvents = new AquariumEvents();
const aquariumPlayer = fs.readFileSync(new URL('./aquarium-player.js', import.meta.url));
const bubbleDataURI = createBubbleEncoder(composer, pet.palette);
const gifCache = new Map();
const stageCache = new Map();

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
  now: () => new Date('2026-01-01T12:00:00Z'),
  prominentClip: null,
});
console.log(`SVG stage ready: ${stage.segments.length} segments, ${stage.uniqueClips} unique clips, ${Buffer.byteLength(stage.svg)}B, ${Date.now() - stageStarted}ms`);
const warmClips = [...new Map(stage.segments.map(segment => [segment.clip.key, segment.clip])).values()];
const warmWake = { kind: 'wake', clip: stage.segments[0].clip };
let warmCursor = 1;
const warmSchedulePet = {
  scene: (...args) => pet.scene(...args),
  pickIdle: () => warmClips[warmCursor++ % warmClips.length],
  pickRare: random => pet.pickRare(random),
};

function cacheGif(key, build) {
  if (gifCache.has(key)) return gifCache.get(key);
  const bytes = build();
  gifCache.set(key, bytes);
  if (gifCache.size > 32) gifCache.delete(gifCache.keys().next().value);
  return bytes;
}

function activeFeature({ consumeFocus = false } = {}) {
  const before = JSON.stringify([ledger.featureFocus, ledger.features]);
  const featured = selectFeature(ledger, { consumeFocus });
  if (before !== JSON.stringify([ledger.featureFocus, ledger.features])) saveLedger();
  return featured;
}

// Actor-triggered reactions play first: the person who pressed feed lands back on the
// README mid-nom. Webhook events keep the greeting first — that viewer arrives later.
const REACTION_FIRST = new Set(['feed', 'pat', 'play', 'boop']);
function featureScenes(kind, scene) {
  return REACTION_FIRST.has(kind) ? [scene, pet.scene('wake')] : [pet.scene('wake'), scene];
}

function feature(kind, bubble, ttl = TTL.action, { focus = false } = {}) {
  // Selection and SSE do not need decoded frames. The eventual GIF/SVG request
  // loads them; the live reaction can reach connected visitors immediately.
  const scene = pet.sceneMeta(kind, bubble);
  const now = Date.now();
  storeFeature(ledger, {
    kind,
    clipId: scene.clip.id,
    bubble: scene.bubble,
    at: now,
    until: now + ttl,
  }, { focus });
  saveLedger();
  aquariumEvents.reaction(scene);
  return scene;
}

function featureEpisodeGif(featured) {
  const key = `${featured.kind}:${featured.clipId}:${featured.bubble || ''}`;
  return cacheGif(`feature:${key}`, () => {
    const scene = pet.scene(featured.kind, featured.bubble, featured.clipId);
    return episodeGif(featureScenes(featured.kind, scene));
  });
}

function featureStage(featured) {
  const source = pet.scene(featured.kind, featured.bubble, featured.clipId);
  // The reaction is the only strip that may be cold. Eight frames keep that
  // first render beneath Camo's upstream window; the warm idle strips stay full.
  const scene = { ...source, clip: { ...source.clip, frames: Math.min(8, source.clip.frames) } };
  const actionFirst = REACTION_FIRST.has(featured.kind);
  const openingScenes = actionFirst ? [scene, warmWake] : [warmWake, scene];
  const key = `${featured.kind}:${featured.clipId}:${featured.bubble || ''}:${actionFirst}`;
  if (stageCache.has(key)) return stageCache.get(key);
  const rendered = buildStageDocument(warmSchedulePet, {
    stripDataURI: stripStore.dataURI,
    bubbleDataURI,
    bubble: { text: featured.bubble || pet.defaultBubble(featured.kind) || 'oh!', segmentIndex: actionFirst ? 0 : 1, seconds: 6 },
    paper: `rgb(${paperRGB.join(' ')})`,
    openingScenes,
    maxClips: 4,
    prominentClip: null,
  }).svg;
  stageCache.set(key, rendered);
  if (stageCache.size > 24) stageCache.delete(stageCache.keys().next().value);
  return rendered;
}

function idleStage() {
  const now = new Date();
  const night = now.getUTCHours() >= 22 || now.getUTCHours() < 6;
  const bubble = chooseIdleBubble(ledger);
  const rare = Math.random() < 1 / 40 ? pet.pickRare() : null;
  const prominentClip = rare ? { ...rare, frames: Math.min(8, rare.frames) } : null;
  if (!night && !bubble && !prominentClip) return stage.svg;
  if (!night && !prominentClip) {
    return renderStageSVG(stage.segments, {
      stripDataURI: stripStore.dataURI,
      bubbleDataURI,
      bubble: { text: bubble, at: 1.5, seconds: 6 },
      paper: `rgb(${paperRGB.join(' ')})`,
    });
  }
  return buildStageDocument(night ? pet : warmSchedulePet, {
    stripDataURI: stripStore.dataURI,
    bubbleDataURI,
    bubble: { text: bubble || pet.defaultBubble('wake') || 'oh, hello!', at: 1.5, seconds: 6 },
    paper: `rgb(${paperRGB.join(' ')})`,
    now: () => now,
    prominentClip,
    maxClips: 4,
  }).svg;
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

function visitorIdentity(req) {
  let fid = cookies(req).momo_fid;
  let setCookie = null;
  if (!fid || !/^[0-9a-f-]{36}$/.test(fid)) {
    fid = crypto.randomUUID();
    setCookie = `momo_fid=${fid}; Max-Age=31536000; Path=/; HttpOnly; Secure; SameSite=Lax`;
  }
  return { fid, setCookie };
}

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

  if (p === '/' && req.method === 'GET') {
    const { fid, setCookie } = visitorIdentity(req);
    const html = renderAquariumPage(ledger, { fid });
    const headers = {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Length': Buffer.byteLength(html),
      'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'unsafe-inline'; img-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'",
    };
    if (setCookie) headers['Set-Cookie'] = setCookie;
    res.writeHead(200, headers);
    res.end(html);
    return;
  }
  if (p === '/aquarium-player.js' && req.method === 'GET') {
    res.writeHead(200, {
      'Content-Type': 'text/javascript; charset=utf-8',
      'Content-Length': aquariumPlayer.length,
      'Cache-Control': 'public, max-age=300',
    });
    res.end(aquariumPlayer);
    return;
  }
  if (p === '/strips/atlas.json' && req.method === 'GET') {
    const body = JSON.stringify(aquariumCatalog.atlas);
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': Buffer.byteLength(body),
      'Cache-Control': 'no-store',
    });
    res.end(body);
    return;
  }
  if (aquariumCatalog.strips.has(p) && req.method === 'GET') {
    const { clip, frames } = aquariumCatalog.strips.get(p);
    const bytes = stripStore.bytesFor(clip, frames);
    res.writeHead(200, {
      'Content-Type': 'image/png',
      'Content-Length': bytes.length,
      'Cache-Control': 'public, max-age=31536000, immutable',
    });
    res.end(bytes);
    return;
  }
  if (p === '/events' && req.method === 'GET') {
    aquariumEvents.add(req, res);
    return;
  }

  if (p === '/stage.gif') {
    const featured = activeFeature({ consumeFocus: true });
    sendGif(res, featured ? featureEpisodeGif(featured) : nextIdleEpisode());
    return;
  }
  if (p === '/stage.svg') {
    const featured = activeFeature({ consumeFocus: true });
    const svg = featured ? featureStage(featured) : idleStage();
    res.writeHead(200, {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Content-Length': Buffer.byteLength(svg),
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
    });
    res.end(svg);
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
    saveLedger();
    sendGif(res, sensorGif(p));
    return;
  }

  const act = p.match(/^\/act\/(feed|pat|play)$/)?.[1];
  if (act && (req.method === 'GET' || req.method === 'POST')) {
    const { fid, setCookie } = visitorIdentity(req);
    const instant = req.method === 'POST';
    // the reaction is armed BEFORE the redirect is sent, so the reloaded README's
    // stage fetch can never race it; the whole detour is one 302 blink
    const now = Date.now();
    const feeder = (ledger.feeders[fid] ||= { feed: 0, pat: 0, play: 0, first: now });
    feeder[act] = (Number(feeder[act]) || 0) + 1;
    feeder.last = now;
    const streak = touchStreak(feeder, now);
    ledger.totals[act]++;
    const bubble = act === 'feed' && feeder.feed > 1 ? `ah, you again! ${ordinal(feeder.feed)} time ♥` : undefined;
    const scene = feature(act, bubble, TTL.action, { focus: true });
    const headers = { 'Cache-Control': 'no-store' };
    if (setCookie) headers['Set-Cookie'] = setCookie;
    if (instant) {
      const body = JSON.stringify({
        ok: true,
        action: act,
        reaction: { clip: scene.clip.key, bubble: scene.bubble, loops: 2 },
        personal: {
          streak: streak.days,
          actions: ['feed', 'pat', 'play'].reduce((sum, kind) => sum + (Number(feeder[kind]) || 0), 0),
        },
      });
      headers['Content-Type'] = 'application/json; charset=utf-8';
      headers['Content-Length'] = Buffer.byteLength(body);
      res.writeHead(200, headers);
      res.end(body);
    } else {
      headers.Location = safeBack(url.searchParams.get('back'));
      res.writeHead(302, headers);
      res.end();
    }
    return;
  }

  if (p === '/wake') {
    if (!activeFeature()) feature('wake', undefined, TTL.action, { focus: true });
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
    const response = await fetch(`https://api.github.com/repos/${REPO_SLUG}/actions/workflows/ci.yml/runs?branch=main&per_page=1&status=completed`, {
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
