import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PNG } from 'pngjs';

async function makeFixtureAssets(root) {
  const ids = ['idle', '037', '036', '027', '002'];
  const manifest = ids.map((id, index) => ({
    id,
    key: `${id}_fixture`,
    name: 'fixture',
    frames: 1,
    fps: 1,
    spawn: 'common',
    state_hint: index === 0 ? 'idle' : 'celebrate',
  }));
  await mkdir(path.join(root, 'frames'), { recursive: true });
  await writeFile(path.join(root, 'manifest.json'), JSON.stringify(manifest));
  await writeFile(path.join(root, 'palette.json'), JSON.stringify({ palette: [[255, 255, 255], [0, 0, 0]], ink: 1, paper: 0 }));
  await symlink(path.resolve('assets/glyphs'), path.join(root, 'glyphs'), 'dir');

  const png = new PNG({ width: 200, height: 200 });
  png.data.fill(255);
  for (const clip of manifest) {
    const dir = path.join(root, 'frames', clip.key);
    await mkdir(dir);
    await writeFile(path.join(dir, 'f_0001.png'), PNG.sync.write(png));
  }
}

async function nextSSE(reader, predicate, timeoutMs = 3_000) {
  const decoder = new TextDecoder();
  const deadline = Date.now() + timeoutMs;
  let buffer = '';
  while (Date.now() < deadline) {
    const remaining = deadline - Date.now();
    let timer;
    const result = await Promise.race([
      reader.read(),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('SSE timeout')), remaining); }),
    ]).finally(() => clearTimeout(timer));
    if (result.done) throw new Error('SSE stream ended');
    buffer += decoder.decode(result.value, { stream: true }).replaceAll('\r\n', '\n');
    const blocks = buffer.split('\n\n');
    buffer = blocks.pop();
    for (const block of blocks) {
      const event = block.match(/^event: (.+)$/m)?.[1];
      const raw = block.match(/^data: (.+)$/m)?.[1];
      if (!event || !raw) continue;
      const parsed = { event, data: JSON.parse(raw) };
      if (predicate(parsed)) return parsed;
    }
  }
  throw new Error('SSE timeout');
}

test('server returns complete GIFs and remembers actions', { timeout: 20_000 }, async () => {
  const port = 20_000 + Math.floor(Math.random() * 10_000);
  const dataDir = await mkdtemp(path.join(tmpdir(), 'streamlings-test-'));
  const assetDir = await mkdtemp(path.join(tmpdir(), 'streamlings-assets-'));
  await makeFixtureAssets(assetDir);
  const child = spawn(process.execPath, ['server/index.js'], {
    cwd: path.resolve('.'),
    env: { ...process.env, PORT: String(port), DATA_DIR: dataDir, STREAM_ASSETS: assetDir, DISABLE_CI_POLL: '1', WEBHOOK_SECRET: 'test-secret' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', chunk => { stderr += chunk; });

  try {
    const base = `http://127.0.0.1:${port}`;
    let health;
    for (let i = 0; i < 40; i++) {
      try { health = await fetch(`${base}/healthz`); if (health.ok) break; } catch { /* starting */ }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.equal(health?.ok, true, stderr || 'server did not become ready');

    const stage = await fetch(`${base}/stage.gif`);
    const bytes = Buffer.from(await stage.arrayBuffer());
    assert.equal(stage.headers.get('content-length'), String(bytes.length));
    assert.ok(bytes.includes(Buffer.from('NETSCAPE2.0')));
    assert.equal(bytes.at(-1), 0x3b);

    const svgStage = await fetch(`${base}/stage.svg`);
    const svg = await svgStage.text();
    assert.match(svgStage.headers.get('content-type') || '', /^image\/svg\+xml/);
    assert.equal(svgStage.headers.get('content-length'), String(Buffer.byteLength(svg)));
    assert.match(svg, /^<svg /);
    assert.ok(svg.endsWith('</svg>'));

    const home = await fetch(`${base}/`);
    const homeHtml = await home.text();
    assert.equal(home.status, 200);
    assert.match(home.headers.get('content-security-policy') || '', /default-src 'self'/);
    assert.match(home.headers.get('set-cookie') || '', /momo_fid=/);
    assert.match(homeHtml, /Momó's Aquarium/);
    assert.match(homeHtml, /src="\/aquarium-player\.js"/);
    assert.doesNotMatch(homeHtml, /<(?:script|img|link)[^>]+(?:src|href)="https?:/);

    const playerModule = await fetch(`${base}/aquarium-player.js`);
    assert.match(playerModule.headers.get('content-type') || '', /^text\/javascript/);
    assert.match(await playerModule.text(), /Math\.min\(now - this\.last, 250\)/);

    const atlasResponse = await fetch(`${base}/strips/atlas.json`);
    const atlas = await atlasResponse.json();
    const firstStrip = Object.values(atlas)[0].src;
    assert.ok(Object.values(atlas).every(entry => entry.src.startsWith('/strips/')));
    const strip = await fetch(`${base}${firstStrip}`);
    assert.match(strip.headers.get('content-type') || '', /^image\/png/);
    assert.ok((await strip.arrayBuffer()).byteLength > 0);

    const action = await fetch(`${base}/act/feed?back=https://github.com/Christian-Katzmann/streamlings`, { redirect: 'manual' });
    assert.equal(action.status, 302);
    assert.equal(action.headers.get('location'), 'https://github.com/Christian-Katzmann/streamlings#readme');
    assert.match(action.headers.get('set-cookie') || '', /momo_fid=/);
    const after = await (await fetch(`${base}/healthz`)).json();
    assert.equal(after.featured.kind, 'feed');
    assert.equal(after.totals.feed, 1);

    const starPayload = Buffer.from(JSON.stringify({
      action: 'created',
      sender: { login: 'campaign-tester' },
      repository: { stargazers_count: 25 },
    }));
    const signature = 'sha256=' + crypto.createHmac('sha256', 'test-secret').update(starPayload).digest('hex');
    const webhook = await fetch(`${base}/hooks/github`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-github-event': 'star', 'x-hub-signature-256': signature },
      body: starPayload,
    });
    assert.equal(await webhook.text(), 'ok');
    const starStage = await (await fetch(`${base}/stage.svg`)).text();
    assert.match(starStage, /Momó says: thank you @campaign-tester ★/);

    const boopBefore = await (await fetch(`${base}/healthz`)).json();
    await fetch(`${base}/px/boop.gif`);
    const boopAfter = await (await fetch(`${base}/healthz`)).json();
    assert.equal(boopBefore.featured.kind, 'star');
    assert.equal(boopAfter.featured.kind, 'star');

    await fetch(`${base}/act/feed?back=https://github.com/Christian-Katzmann/streamlings`, { redirect: 'manual' });
    const actionStage = await (await fetch(`${base}/stage.svg`)).text();
    assert.doesNotMatch(actionStage, /thank you @campaign-tester/);
    const resumedStarStage = await (await fetch(`${base}/stage.svg`)).text();
    assert.match(resumedStarStage, /Momó says: thank you @campaign-tester ★/);

    // an evil back target never escapes to a non-GitHub host, and still lands at the README
    const evil = await fetch(`${base}/act/pat?back=https://evil.example/phish`, { redirect: 'manual' });
    assert.equal(evil.status, 302);
    assert.equal(evil.headers.get('location'), 'https://github.com/Christian-Katzmann/streamlings#readme');

    const firstController = new AbortController();
    const secondController = new AbortController();
    const firstEvents = await fetch(`${base}/events`, { signal: firstController.signal });
    const secondEvents = await fetch(`${base}/events`, { signal: secondController.signal });
    const firstReader = firstEvents.body.getReader();
    const secondReader = secondEvents.body.getReader();
    await Promise.all([
      nextSSE(firstReader, event => event.event === 'presence' && event.data.count === 2),
      nextSSE(secondReader, event => event.event === 'presence' && event.data.count === 2),
    ]);

    const reactionPromise = nextSSE(firstReader, event => event.event === 'reaction' && event.data.kind === 'feed');
    const started = Date.now();
    const instant = await fetch(`${base}/act/feed`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        Cookie: (action.headers.get('set-cookie') || '').split(';')[0],
      },
    });
    const instantBody = await instant.json();
    const reaction = await reactionPromise;
    assert.ok(Date.now() - started < 1_000, 'reaction SSE took at least one second');
    assert.equal(instant.status, 200);
    assert.equal(instantBody.ok, true);
    assert.equal(instantBody.personal.streak, 1);
    assert.equal(reaction.data.clip, instantBody.reaction.clip);
    firstController.abort();
    secondController.abort();
  } finally {
    if (child.exitCode === null) {
      child.kill('SIGTERM');
      await once(child, 'exit');
    }
    await rm(dataDir, { recursive: true, force: true });
    await rm(assetDir, { recursive: true, force: true });
  }
});
