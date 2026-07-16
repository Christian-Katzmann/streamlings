import test from 'node:test';
import assert from 'node:assert/strict';
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
    fps: 12,
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

test('server returns complete GIFs and remembers actions', { timeout: 20_000 }, async () => {
  const port = 20_000 + Math.floor(Math.random() * 10_000);
  const dataDir = await mkdtemp(path.join(tmpdir(), 'streamlings-test-'));
  const assetDir = await mkdtemp(path.join(tmpdir(), 'streamlings-assets-'));
  await makeFixtureAssets(assetDir);
  const child = spawn(process.execPath, ['server/index.js'], {
    cwd: path.resolve('.'),
    env: { ...process.env, PORT: String(port), DATA_DIR: dataDir, STREAM_ASSETS: assetDir, DISABLE_CI_POLL: '1' },
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

    const action = await fetch(`${base}/act/feed?back=https://github.com/Christian-Katzmann/streamlings`, { redirect: 'manual' });
    assert.equal(action.status, 302);
    assert.equal(action.headers.get('location'), 'https://github.com/Christian-Katzmann/streamlings#readme');
    assert.match(action.headers.get('set-cookie') || '', /momo_fid=/);
    const after = await (await fetch(`${base}/healthz`)).json();
    assert.equal(after.featured.kind, 'feed');
    assert.equal(after.totals.feed, 1);

    // an evil back target never escapes to a non-GitHub host, and still lands at the README
    const evil = await fetch(`${base}/act/pat?back=https://evil.example/phish`, { redirect: 'manual' });
    assert.equal(evil.status, 302);
    assert.equal(evil.headers.get('location'), 'https://github.com/Christian-Katzmann/streamlings#readme');
  } finally {
    if (child.exitCode === null) {
      child.kill('SIGTERM');
      await once(child, 'exit');
    }
    await rm(dataDir, { recursive: true, force: true });
    await rm(assetDir, { recursive: true, force: true });
  }
});
