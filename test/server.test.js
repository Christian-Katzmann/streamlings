import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

test('server returns complete GIFs and remembers actions', { timeout: 20_000 }, async () => {
  const port = 20_000 + Math.floor(Math.random() * 10_000);
  const dataDir = await mkdtemp(path.join(tmpdir(), 'streamlings-test-'));
  const child = spawn(process.execPath, ['server/index.js'], {
    cwd: path.resolve('.'),
    env: { ...process.env, PORT: String(port), DATA_DIR: dataDir, DISABLE_CI_POLL: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  try {
    const base = `http://127.0.0.1:${port}`;
    let health;
    for (let i = 0; i < 40; i++) {
      try { health = await fetch(`${base}/healthz`); if (health.ok) break; } catch { /* starting */ }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.equal(health?.ok, true);

    const stage = await fetch(`${base}/stage.gif`);
    const bytes = Buffer.from(await stage.arrayBuffer());
    assert.equal(stage.headers.get('content-length'), String(bytes.length));
    assert.ok(bytes.includes(Buffer.from('NETSCAPE2.0')));
    assert.equal(bytes.at(-1), 0x3b);

    const action = await fetch(`${base}/act/feed?back=https://github.com/Christian-Katzmann/streamlings`);
    assert.equal(action.status, 200);
    const after = await (await fetch(`${base}/healthz`)).json();
    assert.equal(after.featured.kind, 'feed');
    assert.equal(after.totals.feed, 1);
  } finally {
    child.kill('SIGTERM');
    await new Promise(resolve => child.once('exit', resolve));
    await rm(dataDir, { recursive: true, force: true });
  }
});
